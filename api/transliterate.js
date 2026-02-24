// api/transliterate.js — Vercel Serverless Function
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function getSpotifyToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: 'grant_type=client_credentials',
  });
  const { access_token } = await res.json();
  return access_token;
}

async function fetchLyrics(title, artist) {
  const queries = [
    `${title} ${artist}`,
    title,
    `${artist} ${title}`,
  ];

  for (const q of queries) {
    try {
      // Use lrclib.net — free, no auth needed
      const res = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'Lyrixa/1.0' } }
      );
      const results = await res.json();
      if (results?.length > 0) {
        const song = results[0];
        // Prefer plain lyrics, fall back to synced
        const lyrics = song.plainLyrics || song.syncedLyrics || null;
        if (lyrics) return lyrics;
      }
    } catch (e) {
      console.warn(`lrclib failed for "${q}":`, e.message);
    }
  }
  return null;
}

function cleanLyrics(lyrics) {
  // Strip LRC timestamps [00:23.45]
  return lyrics
    .replace(/\[\d{1,2}:\d{2}[.:]\d{2}\]/g, '')
    .replace(/\[[a-z]+:.*?\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkLyrics(lyrics, maxLines = 60) {
  const lines = lyrics.split('\n');
  const chunks = [];
  for (let i = 0; i < lines.length; i += maxLines) {
    chunks.push(lines.slice(i, i + maxLines).join('\n'));
  }
  return chunks.length ? chunks : [lyrics];
}

async function transliterate(lyrics) {
  const chunks = chunkLyrics(lyrics);
  const results = [];

  for (const chunk of chunks) {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 2048,
      messages: [
        {
          role: 'system',
          content:
            'You are a transliteration expert. Convert song lyrics into English phonetics so an English speaker can read and pronounce them. ' +
            'Rules: 1) Transliterate non-English words phonetically — do NOT translate. ' +
            '2) Leave English words as-is. ' +
            '3) Preserve line breaks and structure exactly. ' +
            '4) Output ONLY the transliterated lyrics, nothing else.',
        },
        {
          role: 'user',
          content: `Transliterate these lyrics:\n\n${chunk}`,
        },
      ],
    });
    results.push(response.choices[0].message.content);
  }

  return results.join('\n\n');
}

module.exports.default = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { track_id } = req.body;
  if (!track_id) return res.status(400).json({ error: 'track_id required' });

  try {
    // Step 1 — Spotify metadata
    const token = await getSpotifyToken();
    const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${track_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!trackRes.ok) throw new Error('Spotify track fetch failed');
    const track = await trackRes.json();

    const title = track.name;
    const artist = track.artists[0].name;
    const album_art = track.album.images[0]?.url || null;

    console.log(`Track: "${title}" by "${artist}"`);

    // Step 2 — Lyrics
    const rawLyrics = await fetchLyrics(title, artist);
    if (!rawLyrics) {
      return res.status(404).json({
        error: `Lyrics not found for "${title}" by ${artist}. This track may be instrumental or unavailable.`,
      });
    }
    const lyrics = cleanLyrics(rawLyrics);

    // Step 3 — Transliterate
    const transliterated = await transliterate(lyrics);

    return res.status(200).json({ title, artist, album_art, original: lyrics, transliterated });

  } catch (err) {
    console.error('Transliterate error:', err);
    return res.status(500).json({ error: err.message || 'Something went wrong' });
  }
}
