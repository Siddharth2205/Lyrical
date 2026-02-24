// api/auth/login.js
const crypto = require('crypto');

module.exports.default = function handler(req, res) {
  const state = crypto.randomBytes(8).toString('hex');
  const scope = [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-modify-playback-state',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id:     process.env.SPOTIFY_CLIENT_ID,
    scope,
    redirect_uri:  process.env.SPOTIFY_REDIRECT_URI || 'https://lyrical-kqii.vercel.app/api/auth/callback',
    state,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
};