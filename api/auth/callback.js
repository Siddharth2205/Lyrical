// api/auth/callback.js
module.exports.default = async function handler(req, res) {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`/?auth_error=${error || 'missing_code'}`);
  }

  try {
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3001/api/auth/callback';

    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type:   'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenRes.json();

    if (tokens.error) {
      return res.redirect(`/?auth_error=${tokens.error}`);
    }

    // Pass token back to frontend via URL hash (never stored server-side)
    const frontendUrl = process.env.FRONTEND_URL || 'http://127.0.0.1:3001/api/auth/callback';
    return res.redirect(
      `${frontendUrl}/?access_token=${tokens.access_token}&expires_in=${tokens.expires_in}`
    );
  } catch (err) {
    console.error('Auth callback error:', err);
    return res.redirect(`/?auth_error=server_error`);
  }
};