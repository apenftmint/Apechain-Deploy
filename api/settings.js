
// Vercel Serverless Function - api/settings.js
// This is a conceptual example. Replace in-memory storage with a real database for persistence.

// In-memory store (NOT SUITABLE FOR PRODUCTION - data resets on each cold start/redeployment)
let currentSettings = {
  twitterUserId: "YourVercelTwitterHandle", // Default
  ads: [
    {
      id: 'ad_slot_1',
      name: "Vercel Ad #1",
      supply: "Supply: 1000",
      price: "Price: FREE",
      imageUrl: "https://picsum.photos/seed/vercelad1/200",
      mintLink: "#vercel1",
      accentColor: 'sky',
      active: true,
    },
    // Add more default ads if needed, up to MAX_ADMIN_EDITABLE_ADS
  ],
};

export default function handler(req, res) {
  // Set CORS headers to allow requests from your frontend domain
  // Replace 'https://your-frontend-domain.vercel.app' with your actual frontend URL in production
  // Or use '*' for development, but be more specific for production.
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    // In a real app, fetch settings from a database
    res.status(200).json(currentSettings);
  } else if (req.method === 'POST') {
    try {
      const newSettings = req.body; // Vercel automatically parses JSON body
      
      // Basic validation (add more as needed)
      if (!newSettings || typeof newSettings.twitterUserId !== 'string' || !Array.isArray(newSettings.ads)) {
        res.status(400).json({ error: 'Invalid settings format.' });
        return;
      }

      // In a real app, save newSettings to a database
      currentSettings = newSettings;
      console.log('Updated settings (in-memory):', currentSettings);
      res.status(200).json({ message: 'Settings saved successfully.', settings: currentSettings });
    } catch (error) {
      console.error('Error saving settings:', error);
      res.status(500).json({ error: 'Failed to save settings.' });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
