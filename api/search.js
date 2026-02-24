// api/search.js — Vercel Serverless Function
module.exports.default = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Query required' });

  try {
    // Get Spotify access token
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
      },
      body: 'grant_type=client_credentials',
    });

    const { access_token } = await tokenRes.json();

    // Search tracks
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );

    const data = await searchRes.json();
    const tracks = data.tracks.items.map(t => ({
      id: t.id,
      name: t.name,
      artist: t.artists[0].name,
      album_art: t.album.images[0]?.url || null,
    }));

    return res.status(200).json(tracks);
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
}
