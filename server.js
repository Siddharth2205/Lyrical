const express = require('express');
const path = require('path');
require('dotenv').config({ path: '.env' });

console.log('SPOTIFY_CLIENT_ID:',     process.env.SPOTIFY_CLIENT_ID     ? '✓' : '✗ MISSING');
console.log('SPOTIFY_CLIENT_SECRET:', process.env.SPOTIFY_CLIENT_SECRET ? '✓' : '✗ MISSING');
console.log('GROQ_API_KEY:',          process.env.GROQ_API_KEY           ? '✓' : '✗ MISSING');

const app = express();
app.use(express.json());

// Use dynamic import to handle ES modules
async function loadRoutes() {
  try {
    const search        = require('./api/search');
    const transliterate = require('./api/transliterate');
    const login         = require('./api/auth/login');
    const callback      = require('./api/auth/callback');

    console.log('All routes loaded ✓');

    app.get('/api/search',        async (req, res) => { try { await search.default(req, res);        } catch(e) { console.error('search error:', e); res.status(500).json({ error: e.message }); } });
    app.post('/api/transliterate',async (req, res) => { try { await transliterate.default(req, res); } catch(e) { console.error('transliterate error:', e); res.status(500).json({ error: e.message }); } });
    app.get('/api/auth/login',     (req, res)       => { try { login.default(req, res);               } catch(e) { console.error('login error:', e); res.status(500).json({ error: e.message }); } });
    app.get('/api/auth/callback', async (req, res) => { try { await callback.default(req, res);       } catch(e) { console.error('callback error:', e); res.status(500).json({ error: e.message }); } });

  } catch(e) {
    console.error('Failed to load routes:', e);
    // Still start server even if a route fails
  }

  process.on('uncaughtException',  e => console.error('Uncaught:', e));
  process.on('unhandledRejection', e => console.error('Unhandled:', e));

  app.listen(3001, () => {
    console.log('API running on http://localhost:3001');
    console.log('Press Ctrl+C to stop');
  });
}

loadRoutes();