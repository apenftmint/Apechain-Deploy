import { Handler, HandlerEvent } from "@netlify/functions";

// --- IN-MEMORY STORAGE (DEMO ONLY - NOT FOR PRODUCTION) ---
let seenContractAddresses: Set<string> = new Set();
// --- END IN-MEMORY STORAGE ---

const handler: Handler = async (event: HandlerEvent) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Content-Type": "application/json",
    };

    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204,
            headers,
        };
    }

    if (event.httpMethod === "GET") {
        console.log("[Netlify Function seen-popups.ts] GET request. Returning seen contracts:", Array.from(seenContractAddresses));
        return {
            statusCode: 200,
            body: JSON.stringify(Array.from(seenContractAddresses)),
            headers,
        };
    }

    return {
        statusCode: 405, // Method Not Allowed
        body: JSON.stringify({message: "Method Not Allowed"}),
        headers,
    };
};

export { handler };