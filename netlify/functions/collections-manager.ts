
// Netlify Function: collections-manager.ts
import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { MintData, CollectionAnalysisResult, FinalCollectionStatus, MetadataStatus, NameSymbolStatus, TokenMetadata } from '../../src/types'; // Adjust path if needed
import { COLLECTIONS_MANAGER_GITHUB_URL } from '../../src/constants'; // Using the GitHub URL

// Define AppTableDisplayMintData if not imported from App.tsx or a shared types file
interface AppTableDisplayMintData extends MintData {
  totalContractMints: number;
  analysis?: CollectionAnalysisResult;
  displayStatus: FinalCollectionStatus;
  mintPriceApe?: string;
}

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const handlerInvocationTime = Date.now();
  console.log(`[${handlerInvocationTime}] --- collections-manager (GitHub Raw JSON) invoked ---`);
  console.log(`[${handlerInvocationTime}] HTTP Method: ${event.httpMethod}`);
  console.log(`[${handlerInvocationTime}] Data source URL: ${COLLECTIONS_MANAGER_GITHUB_URL}`);

  try {
    if (event.httpMethod === "GET") {
      const getStartTime = Date.now();
      console.log(`[${getStartTime}] GET: Processing GET request...`);

      const response = await fetch(COLLECTIONS_MANAGER_GITHUB_URL, {
        headers: {
          'Accept': 'application/json',
          // Add other headers if needed, e.g., for cache control on fetch
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[${Date.now()}] GET: Failed to fetch data from GitHub. Status: ${response.status}. Error: ${errorText}`);
        throw new Error(`Failed to fetch collections data from GitHub: ${response.status} ${response.statusText}`);
      }

      const allCollectionsData: AppTableDisplayMintData[] = await response.json();
      console.log(`[${Date.now()}] GET: Fetched ${allCollectionsData.length} total collections from GitHub.`);

      const twentyFourHoursAgoUnix = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
      
      const filteredData = allCollectionsData
        .filter(collection => collection.timestamp >= twentyFourHoursAgoUnix)
        .sort((a, b) => b.timestamp - a.timestamp);
      
      console.log(`[${Date.now()}] GET: Filtered to ${filteredData.length} collections (last 24h).`);
      console.log(`[${Date.now()}] GET: Request processed. Total GET duration: ${Date.now() - getStartTime}ms`);
      
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
        },
        body: JSON.stringify(filteredData),
      };

    } else if (event.httpMethod === "POST") {
      const postStartTime = Date.now();
      console.log(`[${postStartTime}] POST: Processing POST request...`);
      if (!event.body) {
        console.warn(`[${Date.now()}] POST: Missing request body.`);
        return { statusCode: 400, body: JSON.stringify({ message: "Missing request body" }) };
      }
      
      let newMint: MintData;
      try {
        newMint = JSON.parse(event.body) as MintData;
      } catch (e) {
        console.warn(`[${Date.now()}] POST: Invalid JSON in request body.`, e);
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid JSON in request body" }) };
      }

      if (!newMint.txHash || !newMint.contractAddress || !newMint.tokenId) {
        console.warn(`[${Date.now()}] POST: Invalid mint data in request:`, newMint);
        return { statusCode: 400, body: JSON.stringify({ message: "Invalid mint data in request" }) };
      }
      
      // Log the received mint. No attempt to write to vaa.json here.
      console.log(`[${Date.now()}] POST: Received new mint data. TxHash: ${newMint.txHash}, Contract: ${newMint.contractAddress}, TokenID: ${newMint.tokenId}. This data needs to be manually added to vaa.json for table display.`);
      
      console.log(`[${Date.now()}] POST: Request processed. Total POST duration: ${Date.now() - postStartTime}ms`);
      return {
        statusCode: 202, // Accepted: The request has been accepted for processing, but the processing has not been completed.
        body: JSON.stringify({ 
          message: "Mint data received and logged. Update vaa.json manually to reflect in the Unique Collections table.",
          receivedMint: newMint 
        }),
      };
    }
  } catch (error: any) {
    const handlerErrorTime = Date.now();
    console.error(`[${handlerErrorTime}] Error in collections-manager (GitHub Raw JSON) function. Total handler duration before error: ${handlerErrorTime - handlerInvocationTime}ms. Error:`, error.message, error.stack);
    
    let errorMessage = "Internal Server Error in collections-manager";
     if (error.message) {
        errorMessage = error.message;
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Handler error", errorDetails: errorMessage }),
    };
  }

  const finalTime = Date.now();
  console.log(`[${finalTime}] --- collections-manager (GitHub Raw JSON) finishing (should not reach here if GET/POST handled). Total duration: ${finalTime - handlerInvocationTime}ms ---`);
  return {
    statusCode: 405,
    body: JSON.stringify({ message: "Method Not Allowed" }),
  };
};

export { handler };
