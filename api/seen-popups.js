
// Vercel Serverless Function - api/seen-popups.js
// This is a conceptual example. Replace in-memory storage with a real database.

// In-memory store (NOT SUITABLE FOR PRODUCTION)
let seenPopupsSet = new Set();

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    // In a real app, fetch from database
    res.status(200).json(Array.from(seenPopupsSet));
  } else {
    res.setHeader('Allow', ['GET', 'OPTIONS']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
