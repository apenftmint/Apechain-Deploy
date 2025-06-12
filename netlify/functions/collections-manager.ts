// Netlify Function: collections-manager.ts
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { MintData, CollectionAnalysisResult, FinalCollectionStatus, TokenMetadata, MetadataStatus, NameSymbolStatus } from '../../src/types'; // Adjusted path assuming types.ts is in src
import { APE_COIN_DECIMALS, ERC721_METADATA_ABI } from '../../src/constants'; // Adjusted path assuming constants.ts is in src
import { JsonRpcProvider, Contract, getBigInt, formatUnits } from 'ethers';

// Define AppTableDisplayMintData matching the frontend's expectation
interface AppTableDisplayMintData extends MintData {
  totalContractMints: number;
  analysis?: CollectionAnalysisResult;
  displayStatus: FinalCollectionStatus;
  mintPriceApe?: string;
}

// --- Environment Variables (assumed to be set in Netlify) ---
const GITHUB_TOKEN_ENV = process.env.GITHUB_TOKEN;
const GITHUB_REPO_OWNER_ENV = process.env.GITHUB_REPO_OWNER;
const GITHUB_REPO_NAME_ENV = process.env.GITHUB_REPO_NAME;
const GITHUB_REPO_BRANCH_ENV = process.env.GITHUB_REPO_BRANCH;
const GITHUB_FILE_PATH_ENV = process.env.GITHUB_FILE_PATH;
const NETLIFY_FUNCTION_RPC_URL_ENV = process.env.NETLIFY_FUNCTION_RPC_URL;

const twentyFourHoursInSeconds = 24 * 60 * 60;
const USER_AGENT = `${GITHUB_REPO_OWNER_ENV || 'netlify-function-user'}-collections-manager`;
const MAX_COMMIT_ATTEMPTS = 2; // Initial attempt + 1 retry for 409
const RETRY_DELAY_MS = 2000; // Increased delay for retry


// --- Helper: Basic Collection Analysis (simplified from client-side service) ---
async function analyzeNewMint(mintInput: MintData, rpcUrl: string): Promise<AppTableDisplayMintData> {
    const provider = new JsonRpcProvider(rpcUrl);
    const contract = new Contract(mintInput.contractAddress, ERC721_METADATA_ABI, provider);
    let collectionNameFromAnalyzer = "Unknown Collection";
    let collectionSymbolFromAnalyzer = "UNKNOWN";
    let nameSymbolStatus: NameSymbolStatus = 'not_fetched';
    let tokenUri: string | null = null;
    let fetchedMetadata: TokenMetadata | null = null;
    let metadataStatus: MetadataStatus = 'not_fetched';
    const statusReasons: string[] = [];

    try {
        collectionNameFromAnalyzer = await contract.name();
        nameSymbolStatus = 'ok';
    } catch (e: any) {
        console.warn(`Analysis: Error fetching name for ${mintInput.contractAddress}:`, e.message);
        nameSymbolStatus = 'fetch_error';
        statusReasons.push("Failed to fetch contract name.");
    }
    collectionNameFromAnalyzer = collectionNameFromAnalyzer?.trim() || "Unnamed Collection";


    try {
        collectionSymbolFromAnalyzer = await contract.symbol();
    } catch (e: any) {
        console.warn(`Analysis: Error fetching symbol for ${mintInput.contractAddress}:`, e.message);
        if (nameSymbolStatus !== 'fetch_error') nameSymbolStatus = 'fetch_error'; 
        statusReasons.push("Failed to fetch contract symbol.");
    }
    collectionSymbolFromAnalyzer = collectionSymbolFromAnalyzer?.trim() || "NO SYMBOL";


    try {
        tokenUri = await contract.tokenURI(getBigInt(mintInput.tokenId));
        if (tokenUri && typeof tokenUri === 'string') {
            const httpUri = tokenUri.replace(/^ipfs:\/\//, 'https://ipfs.io/ipfs/');
            try {
                const metaResponse = await fetch(httpUri, { signal: AbortSignal.timeout(7000) });
                if (metaResponse.ok) {
                    fetchedMetadata = await metaResponse.json();
                    metadataStatus = 'ok';
                    statusReasons.push("Metadata fetched successfully.");
                } else {
                    metadataStatus = 'broken_uri';
                    statusReasons.push(`Metadata URI fetch failed: ${metaResponse.status}.`);
                }
            } catch (e: any) {
                metadataStatus = 'fetch_error';
                statusReasons.push(`Error fetching metadata from URI: ${e.message}.`);
                console.warn(`Analysis: Error fetching metadata from ${httpUri}:`, e.message);
            }
        } else {
            metadataStatus = 'no_uri_found';
            statusReasons.push("TokenURI not found or invalid.");
        }
    } catch (e: any) {
        metadataStatus = 'no_uri_found'; 
        statusReasons.push(`Error fetching tokenURI: ${e.message}.`);
        console.warn(`Analysis: Error fetching tokenURI for ${mintInput.contractAddress}#${mintInput.tokenId}:`, e.message);
    }
    
    let finalStatusOverall: FinalCollectionStatus = 'OK';
    if (nameSymbolStatus === 'fetch_error' || metadataStatus === 'broken_uri' || metadataStatus === 'fetch_error' || metadataStatus === 'no_uri_found') {
        finalStatusOverall = 'Issues Detected';
    }
    if (statusReasons.length === 0 && finalStatusOverall === 'OK') statusReasons.push("Basic analysis OK.");


    const analysisResult: CollectionAnalysisResult = {
        contractAddress: mintInput.contractAddress,
        metadataStatus,
        fetchedMetadata,
        nameSymbolStatus,
        collectionNameFromAnalyzer,
        collectionSymbolFromAnalyzer,
        finalStatus: finalStatusOverall,
        statusReasons,
    };

    const mintPriceApe = mintInput.isFree || !mintInput.valueWei 
        ? undefined 
        : parseFloat(formatUnits(mintInput.valueWei, APE_COIN_DECIMALS)).toFixed(4);

    return {
        ...mintInput,
        totalContractMints: 1, 
        analysis: analysisResult,
        displayStatus: analysisResult.finalStatus,
        mintPriceApe,
    };
}


const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const handlerInvocationTime = Date.now();
  console.log(`[${handlerInvocationTime}] --- collections-manager invoked ---`);
  console.log(`[${handlerInvocationTime}] HTTP Method: ${event.httpMethod}`);

  const logEnvVar = (name: string, value?: string) => {
    console.log(`[${Date.now()}] Env Var Check - ${name} is set: ${!!value}`);
    if (value && name === 'GITHUB_TOKEN') {
        console.log(`[${Date.now()}] Env Var Check - GITHUB_TOKEN starts with: ${value.substring(0, Math.min(5, value.length))}`);
    } else if (value) {
        console.log(`[${Date.now()}] Env Var Check - ${name}: ${value}`);
    }
  };

  logEnvVar('GITHUB_TOKEN', GITHUB_TOKEN_ENV);
  logEnvVar('GITHUB_REPO_OWNER', GITHUB_REPO_OWNER_ENV);
  logEnvVar('GITHUB_REPO_NAME', GITHUB_REPO_NAME_ENV);
  logEnvVar('GITHUB_REPO_BRANCH', GITHUB_REPO_BRANCH_ENV);
  logEnvVar('GITHUB_FILE_PATH', GITHUB_FILE_PATH_ENV);
  

  if (!GITHUB_TOKEN_ENV || !GITHUB_REPO_OWNER_ENV || !GITHUB_REPO_NAME_ENV || !GITHUB_REPO_BRANCH_ENV || !GITHUB_FILE_PATH_ENV) {
    console.error(`[${Date.now()}] Config Error: Missing one or more GitHub environment variables.`);
    return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error: Missing GitHub credentials." }) };
  }
  const githubApiUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER_ENV}/${GITHUB_REPO_NAME_ENV}/contents/${GITHUB_FILE_PATH_ENV}`;


  if (event.httpMethod === "GET") {
    const getStartTime = Date.now();
    console.log(`[${getStartTime}] GET: Processing GET request. Fetching from GitHub API: ${githubApiUrl}?ref=${GITHUB_REPO_BRANCH_ENV}`);
    try {
      const response = await fetch(`${githubApiUrl}?ref=${GITHUB_REPO_BRANCH_ENV}`, {
        headers: { 
            'Authorization': `token ${GITHUB_TOKEN_ENV}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': USER_AGENT
        }
      });

      let allCollectionsData: AppTableDisplayMintData[] = [];

      if (response.ok) {
        const fileData = await response.json();
        if (fileData.content) {
            const contentStr = Buffer.from(fileData.content, 'base64').toString('utf-8');
            if (contentStr.trim() !== "") {
                try {
                    allCollectionsData = JSON.parse(contentStr);
                    if (!Array.isArray(allCollectionsData)) {
                        console.warn(`[${Date.now()}] GET: Data from GitHub API is not an array. Content: ${contentStr.substring(0,100)}`);
                        allCollectionsData = [];
                    }
                } catch (e: any) {
                    console.error(`[${Date.now()}] GET: Failed to parse JSON from GitHub. Content: ${contentStr.substring(0,100)}. Error: ${e.message}`);
                    allCollectionsData = [];
                }
            } else {
                 console.log(`[${Date.now()}] GET: Fetched data from GitHub API is empty string.`);
            }
        } else {
            console.warn(`[${Date.now()}] GET: GitHub API response OK, but no content field. File may be empty or response malformed. Response:`, JSON.stringify(fileData).substring(0,200));
        }
      } else if (response.status === 404) {
        console.log(`[${Date.now()}] GET: vaa.json not found on GitHub (404).`);
      } else {
        const errorText = await response.text();
        console.error(`[${Date.now()}] GET: Failed to fetch from GitHub API. Status: ${response.status}. Error: ${errorText}`);
        throw new Error(`GitHub API fetch error: ${response.status} ${response.statusText}`);
      }
      
      const twentyFourHoursAgoUnix = Math.floor(Date.now() / 1000) - twentyFourHoursInSeconds;
      const filteredData = allCollectionsData
        .filter(collection => collection.timestamp >= twentyFourHoursAgoUnix)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`[${Date.now()}] GET: Processed. Returning ${filteredData.length} collections. Duration: ${Date.now() - getStartTime}ms`);
      return {
        statusCode: 200,
        headers: { 
            'Content-Type': 'application/json', 
            'Cache-Control': 'private, no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        },
        body: JSON.stringify(filteredData),
      };
    } catch (error: any) {
      console.error(`[${Date.now()}] GET Error: ${error.message}. Duration: ${Date.now() - getStartTime}ms`, error.stack);
      return { statusCode: 500, body: JSON.stringify({ message: "Handler GET error", errorDetails: error.message }) };
    }

  } else if (event.httpMethod === "POST") {
    const postStartTime = Date.now();
    logEnvVar('NETLIFY_FUNCTION_RPC_URL', NETLIFY_FUNCTION_RPC_URL_ENV);
    console.log(`[${postStartTime}] POST: Processing POST request...`);
        
    if (!NETLIFY_FUNCTION_RPC_URL_ENV) {
      console.error(`[${Date.now()}] POST Error: Missing NETLIFY_FUNCTION_RPC_URL env var.`);
      return { statusCode: 500, body: JSON.stringify({ message: "Server configuration error: Missing RPC URL." }) };
    }

    if (!event.body) {
      return { statusCode: 400, body: JSON.stringify({ message: "Missing request body" }) };
    }
    
    let newMintInput: MintData;
    try {
      newMintInput = JSON.parse(event.body) as MintData;
    } catch (e) {
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON in request body" }) };
    }

    if (!newMintInput.txHash || !newMintInput.contractAddress || !newMintInput.tokenId) {
      return { statusCode: 400, body: JSON.stringify({ message: "Invalid mint data in request" }) };
    }

    console.log(`[${Date.now()}] POST: Analyzing new mint for ${newMintInput.contractAddress}#${newMintInput.tokenId}`);
    const analyzedNewMint = await analyzeNewMint(newMintInput, NETLIFY_FUNCTION_RPC_URL_ENV);
    console.log(`[${Date.now()}] POST: Analysis complete for ${analyzedNewMint.collectionName}.`);

    for (let attempt = 1; attempt <= MAX_COMMIT_ATTEMPTS; attempt++) {
        try {
            console.log(`[${Date.now()}] POST (Commit Attempt ${attempt}/${MAX_COMMIT_ATTEMPTS}): Fetching current vaa.json`);
            const currentFileResponse = await fetch(`${githubApiUrl}?ref=${GITHUB_REPO_BRANCH_ENV}`, {
                headers: { 
                    'Authorization': `token ${GITHUB_TOKEN_ENV}`, 
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': USER_AGENT
                }
            });

            let currentCollections: AppTableDisplayMintData[] = [];
            let currentSha = "";
            let fileExists = false;

            if (currentFileResponse.ok) {
                const fileData = await currentFileResponse.json();
                if (fileData.content && fileData.sha) {
                    currentSha = fileData.sha;
                    const currentContentStr = Buffer.from(fileData.content, 'base64').toString('utf-8');
                    if (currentContentStr.trim() !== "") {
                        currentCollections = JSON.parse(currentContentStr);
                    }
                    fileExists = true;
                    console.log(`[${Date.now()}] POST (Attempt ${attempt}): Fetched vaa.json. SHA: ${currentSha.substring(0,7)}, Items: ${currentCollections.length}`);
                }
            } else if (currentFileResponse.status === 404) {
                console.log(`[${Date.now()}] POST (Attempt ${attempt}): vaa.json not found on GitHub. Will create new.`);
            } else {
                const errorText = await currentFileResponse.text();
                throw new Error(`GitHub API fetch error (Attempt ${attempt}): ${currentFileResponse.status} ${errorText}`);
            }
          
            const twentyFourHoursAgoUnix = Math.floor(Date.now() / 1000) - twentyFourHoursInSeconds;
            let updatedCollections = currentCollections.filter(c => c.timestamp >= twentyFourHoursAgoUnix);
            
            const existingCollectionIndex = updatedCollections.findIndex(c => c.contractAddress === analyzedNewMint.contractAddress);

            if (existingCollectionIndex > -1) {
                const existingEntry = updatedCollections[existingCollectionIndex];
                updatedCollections[existingCollectionIndex] = {
                    ...analyzedNewMint, 
                    totalContractMints: (existingEntry.totalContractMints || 0) + 1, 
                    // Ensure the latest mint's timestamp and specific details are used if it's "fresher"
                    // but retain the analysis from the *newly processed* mint.
                    timestamp: Math.max(existingEntry.timestamp, analyzedNewMint.timestamp),
                    tokenId: analyzedNewMint.timestamp >= existingEntry.timestamp ? analyzedNewMint.tokenId : existingEntry.tokenId,
                    txHash: analyzedNewMint.timestamp >= existingEntry.timestamp ? analyzedNewMint.txHash : existingEntry.txHash,
                };
                 console.log(`[${Date.now()}] POST (Attempt ${attempt}): Updated existing collection ${analyzedNewMint.contractAddress}. Total mints now: ${updatedCollections[existingCollectionIndex].totalContractMints}`);
            } else {
                updatedCollections.push(analyzedNewMint); 
                console.log(`[${Date.now()}] POST (Attempt ${attempt}): Added new collection ${analyzedNewMint.contractAddress}.`);
            }

            updatedCollections.sort((a, b) => b.timestamp - a.timestamp);
            console.log(`[${Date.now()}] POST (Attempt ${attempt}): Merged. Total collections in memory: ${updatedCollections.length}`);

            const newContentBase64 = Buffer.from(JSON.stringify(updatedCollections, null, 2)).toString('base64');
            const commitMessage = `Automated update: mint for ${analyzedNewMint.collectionName} (${analyzedNewMint.contractAddress.slice(0,6)})`;
            
            const commitBody: any = { message: commitMessage, content: newContentBase64, branch: GITHUB_REPO_BRANCH_ENV };
            if (fileExists && currentSha) commitBody.sha = currentSha; 

            console.log(`[${Date.now()}] POST (Attempt ${attempt}): Committing to GitHub. SHA being sent: ${commitBody.sha ? commitBody.sha.substring(0,7) : 'N/A (new file)'}`);
            const updateResponse = await fetch(githubApiUrl, {
                method: 'PUT',
                headers: { 
                    'Authorization': `token ${GITHUB_TOKEN_ENV}`, 
                    'Accept': 'application/vnd.github.v3+json', 
                    'Content-Type': 'application/json',
                    'User-Agent': USER_AGENT
                },
                body: JSON.stringify(commitBody),
            });

            if (updateResponse.ok) {
                const commitData = await updateResponse.json();
                console.log(`[${Date.now()}] POST (Attempt ${attempt}): Successfully committed. New SHA: ${commitData.content?.sha?.substring(0,7)}. Duration: ${Date.now() - postStartTime}ms`);
                return {
                    statusCode: 200, 
                    body: JSON.stringify({ message: "vaa.json updated successfully on GitHub.", newSha: commitData.content?.sha }),
                };
            } else if (updateResponse.status === 409 && attempt < MAX_COMMIT_ATTEMPTS) {
                const errorText = await updateResponse.text();
                console.warn(`[${Date.now()}] POST (Attempt ${attempt}): GitHub commit conflict (409). Retrying after ${RETRY_DELAY_MS}ms. Error details: ${errorText}`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            } else {
                const errorText = await updateResponse.text();
                throw new Error(`GitHub API commit error (Attempt ${attempt}): ${updateResponse.status} ${errorText}`);
            }
        } catch (error: any) {
            console.error(`[${Date.now()}] POST Error during commit attempt ${attempt}: ${error.message}. Duration: ${Date.now() - postStartTime}ms`, error.stack);
            if (attempt >= MAX_COMMIT_ATTEMPTS) {
                return { statusCode: 500, body: JSON.stringify({ message: "Handler POST error after all retries", errorDetails: error.message }) };
            }
            // Wait before next attempt for non-409 errors as well, or if 409 was the last attempt.
             await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    // Fallthrough if all retries fail
    return { statusCode: 500, body: JSON.stringify({ message: "Handler POST error: Max commit attempts reached without success." }) };
  }

  return { statusCode: 405, body: JSON.stringify({ message: "Method Not Allowed" }) };
};

export { handler };