
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

  // Detailed Environment Variable Logging
  console.log(`[${Date.now()}] Env Var Check - GITHUB_TOKEN is set: ${!!GITHUB_TOKEN_ENV}`);
  if (GITHUB_TOKEN_ENV) {
      console.log(`[${Date.now()}] Env Var Check - GITHUB_TOKEN starts with: ${GITHUB_TOKEN_ENV.substring(0, Math.min(5, GITHUB_TOKEN_ENV.length))}`);
  }
  console.log(`[${Date.now()}] Env Var Check - GITHUB_REPO_OWNER: ${GITHUB_REPO_OWNER_ENV}`);
  console.log(`[${Date.now()}] Env Var Check - GITHUB_REPO_NAME: ${GITHUB_REPO_NAME_ENV}`);
  console.log(`[${Date.now()}] Env Var Check - GITHUB_REPO_BRANCH: ${GITHUB_REPO_BRANCH_ENV}`);
  console.log(`[${Date.now()}] Env Var Check - GITHUB_FILE_PATH: ${GITHUB_FILE_PATH_ENV}`);
  

  if (!GITHUB_TOKEN_ENV || !GITHUB_REPO_OWNER_ENV || !GITHUB_REPO_NAME_ENV || !GITHUB_REPO_BRANCH_ENV || !GITHUB_FILE_PATH_ENV) {
    console.error(`[${Date.now()}] Config Error: Missing one or more GitHub environment variables. Check Netlify function logs above this message for details on which might be missing.`);
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
                        console.warn(`[${Date.now()}] GET: Data from GitHub API is not an array. Treating as empty. Content preview: ${contentStr.substring(0, 100)}...`);
                        allCollectionsData = [];
                    }
                } catch (e: any) {
                    console.error(`[${Date.now()}] GET: Failed to parse JSON from GitHub API content. Treating as empty. Content preview: ${contentStr.substring(0, 100)}... Error: ${e.message}`);
                    allCollectionsData = [];
                }
            } else {
                 console.log(`[${Date.now()}] GET: Fetched data from GitHub API is empty string. Treating as empty list.`);
            }
        } else {
            console.warn(`[${Date.now()}] GET: GitHub API response OK, but no content field. Assuming empty or malformed. Response:`, fileData);
        }
      } else if (response.status === 404) {
        console.log(`[${Date.now()}] GET: vaa.json not found on GitHub via API. Returning empty collection list.`);
      } else {
        const errorText = await response.text();
        console.error(`[${Date.now()}] GET: Failed to fetch data from GitHub API. Status: ${response.status}. Error: ${errorText}`);
        throw new Error(`Failed to fetch collections data from GitHub API: ${response.status} ${response.statusText}`);
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
    console.log(`[${postStartTime}] POST: Processing POST request to update vaa.json...`);
    
    // Log RPC URL specifically for POST
    console.log(`[${Date.now()}] Env Var Check - NETLIFY_FUNCTION_RPC_URL is set for POST: ${!!NETLIFY_FUNCTION_RPC_URL_ENV}`);
    if (!NETLIFY_FUNCTION_RPC_URL_ENV) {
      console.error(`[${Date.now()}] POST Error: Missing NETLIFY_FUNCTION_RPC_URL environment variable.`);
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

    try {
      console.log(`[${Date.now()}] POST: Fetching current vaa.json from ${githubApiUrl}?ref=${GITHUB_REPO_BRANCH_ENV}`);
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
          console.log(`[${Date.now()}] POST: Successfully fetched vaa.json. SHA: ${currentSha}, Items: ${currentCollections.length}`);
        } else {
           console.warn(`[${Date.now()}] POST: vaa.json content or SHA missing from GitHub API response. Assuming new file. Response:`, fileData);
        }
      } else if (currentFileResponse.status === 404) {
        console.log(`[${Date.now()}] POST: vaa.json not found on GitHub. Will create a new one.`);
      } else {
        const errorText = await currentFileResponse.text();
        console.error(`[${Date.now()}] POST Error: Failed to fetch vaa.json from GitHub API. Status: ${currentFileResponse.status}. Error: ${errorText}`);
        throw new Error(`GitHub API fetch error: ${currentFileResponse.status} ${errorText}`);
      }
      
      console.log(`[${Date.now()}] POST: Analyzing new mint for ${newMintInput.contractAddress}...`);
      const analyzedNewMint = await analyzeNewMint(newMintInput, NETLIFY_FUNCTION_RPC_URL_ENV);
      console.log(`[${Date.now()}] POST: Analysis complete for ${analyzedNewMint.collectionName}.`);

      const twentyFourHoursAgoUnix = Math.floor(Date.now() / 1000) - twentyFourHoursInSeconds;
      let updatedCollections = currentCollections.filter(c => c.timestamp >= twentyFourHoursAgoUnix);
      
      const existingCollectionIndex = updatedCollections.findIndex(c => c.contractAddress === analyzedNewMint.contractAddress);

      if (existingCollectionIndex > -1) {
        const existingEntry = updatedCollections[existingCollectionIndex];
        console.log(`[${Date.now()}] POST: Updating existing collection ${existingEntry.contractAddress}. Old timestamp: ${existingEntry.timestamp}, new: ${analyzedNewMint.timestamp}`);
        updatedCollections[existingCollectionIndex] = {
          ...analyzedNewMint, 
          totalContractMints: (existingEntry.totalContractMints || 0) + 1, 
        };
      } else {
        console.log(`[${Date.now()}] POST: Adding new collection ${analyzedNewMint.contractAddress}.`);
        updatedCollections.push(analyzedNewMint); 
      }

      updatedCollections.sort((a, b) => b.timestamp - a.timestamp);
      console.log(`[${Date.now()}] POST: Merged. Total collections now: ${updatedCollections.length}`);

      const newContentBase64 = Buffer.from(JSON.stringify(updatedCollections, null, 2)).toString('base64');
      const commitMessage = `Automated update: new mint for ${analyzedNewMint.collectionName || analyzedNewMint.contractAddress}`;
      
      const commitBody: any = {
        message: commitMessage,
        content: newContentBase64,
        branch: GITHUB_REPO_BRANCH_ENV,
      };
      if (fileExists && currentSha) {
        commitBody.sha = currentSha; 
      }

      console.log(`[${Date.now()}] POST: Committing updated vaa.json to GitHub. File exists: ${fileExists}, SHA: ${currentSha ? currentSha.substring(0,7) : 'N/A'}`);
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

      if (!updateResponse.ok) {
        const errorText = await updateResponse.text();
        console.error(`[${Date.now()}] POST Error: Failed to commit to GitHub. Status: ${updateResponse.status}. Error: ${errorText}`);
        throw new Error(`GitHub API commit error: ${updateResponse.status} ${errorText}`);
      }
      const commitData = await updateResponse.json();
      console.log(`[${Date.now()}] POST: Successfully committed to GitHub. New SHA: ${commitData.content?.sha?.substring(0,7) || 'N/A'}. Duration: ${Date.now() - postStartTime}ms`);
      
      return {
        statusCode: 200, 
        body: JSON.stringify({ message: "vaa.json updated successfully on GitHub.", newSha: commitData.content?.sha }),
      };

    } catch (error: any) {
      console.error(`[${Date.now()}] POST Error: ${error.message}. Duration: ${Date.now() - postStartTime}ms`, error.stack);
      return { statusCode: 500, body: JSON.stringify({ message: "Handler POST error", errorDetails: error.message }) };
    }
  }

  const finalTime = Date.now();
  console.log(`[${finalTime}] --- collections-manager finishing (Method Not Allowed). Total duration: ${finalTime - handlerInvocationTime}ms ---`);
  return {
    statusCode: 405,
    body: JSON.stringify({ message: "Method Not Allowed" }),
  };
};

export { handler };

