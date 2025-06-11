import { Handler, HandlerEvent } from "@netlify/functions";

// NOTE: This in-memory store is independent of seen-popups.ts in a stateless environment.
// For a real app, use a persistent database.
let seenContractAddressesInMemory: Set<string> = new Set(); 

const handler: Handler = async (event: HandlerEvent) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers,
        };
    }

    if (event.httpMethod === "POST") {
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({message: "Missing request body"}), headers };
        }
        try {
            const { contractAddress } = JSON.parse(event.body);
            if (typeof contractAddress === 'string' && contractAddress.length > 0) {
                seenContractAddressesInMemory.add(contractAddress);
                console.log(`[Netlify Function mark-popup-seen.ts] Marked ${contractAddress} as seen. Current in-memory seen list:`, Array.from(seenContractAddressesInMemory));
                return {
                    statusCode: 200,
                    body: JSON.stringify({ message: `Contract ${contractAddress} marked as seen (in-memory demo)` }),
                    headers,
                };
            } else {
                return { statusCode: 400, body: JSON.stringify({message: "Invalid or missing contractAddress in request body"}), headers };
            }
        } catch (error) {
            console.error("[Netlify Function mark-popup-seen.ts] Error processing POST:", error);
            return { 
                statusCode: 400, 
                body: JSON.stringify({ message: "Invalid JSON body or server error.", error: (error as Error).message }),
                headers,
            };
        }
    }

    return {
        statusCode: 405, // Method Not Allowed
        body: JSON.stringify({message: "Method Not Allowed"}),
        headers,
    };
};

export { handler };