import { Handler, HandlerEvent } from "@netlify/functions";
import { NftAdDetails, DEFAULT_ADVERTISEMENT_TWITTER_USER_ID, DEFAULT_NFT_ADVERTISEMENTS_LIST } from "../../src/constants"; // Adjust path based on your project structure

interface AdminSettings {
    twitterUserId: string;
    ads: NftAdDetails[];
}

// --- IN-MEMORY STORAGE (DEMO ONLY - NOT FOR PRODUCTION) ---
let currentAdminSettings: AdminSettings = {
    twitterUserId: DEFAULT_ADVERTISEMENT_TWITTER_USER_ID,
    ads: DEFAULT_NFT_ADVERTISEMENTS_LIST,
};
// --- END IN-MEMORY STORAGE ---

const handler: Handler = async (event: HandlerEvent) => {
    // Set CORS headers for all responses
    const headers = {
        "Access-Control-Allow-Origin": "*", // Or specify your frontend domain for production
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Content-Type": "application/json",
    };

    // Handle OPTIONS preflight request for CORS
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 204, // No Content
            headers,
        };
    }

    if (event.httpMethod === "GET") {
        console.log("[Netlify Function settings.ts] GET request received. Returning current settings:", currentAdminSettings);
        return {
            statusCode: 200,
            body: JSON.stringify(currentAdminSettings),
            headers,
        };
    }

    if (event.httpMethod === "POST") {
        if (!event.body) {
            return { statusCode: 400, body: JSON.stringify({message: "Missing request body"}), headers };
        }
        try {
            const newSettings: Partial<AdminSettings> = JSON.parse(event.body);
            console.log("[Netlify Function settings.ts] POST request received with new settings:", newSettings);

            if (newSettings.twitterUserId) {
                currentAdminSettings.twitterUserId = newSettings.twitterUserId;
            }
            if (newSettings.ads && Array.isArray(newSettings.ads)) {
                currentAdminSettings.ads = newSettings.ads;
            }
            
            console.log("[Netlify Function settings.ts] Settings updated (in-memory):", currentAdminSettings);
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Settings saved successfully (in-memory demo)" }),
                headers,
            };
        } catch (error) {
            console.error("[Netlify Function settings.ts] Error processing POST request:", error);
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