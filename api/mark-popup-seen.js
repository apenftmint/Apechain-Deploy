
// Vercel Serverless Function - api/mark-popup-seen.js
// This is a conceptual example. Replace in-memory storage with a real database.

// In-memory store (NOT SUITABLE FOR PRODUCTION)
let seenPopupsSet = new Set(); // Should be shared with seen-popups.js or use a DB

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'POST') {
    try {
      const { contractAddress } = req.body;
      if (typeof contractAddress === 'string' && contractAddress.length > 0) {
        // In a real app, add to database
        seenPopupsSet.add(contractAddress);
        console.log('Marked popup as seen (in-memory):', contractAddress);
        res.status(200).json({ message: 'Popup marked as seen.' });
      } else {
        res.status(400).json({ error: 'Invalid contractAddress.' });
      }
    } catch (error) {
      console.error('Error marking popup as seen:', error);
      res.status(500).json({ error: 'Failed to mark popup as seen.' });
    }
  } else {
    res.setHeader('Allow', ['POST', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
