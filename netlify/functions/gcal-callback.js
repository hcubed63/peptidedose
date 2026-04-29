// netlify/functions/gcal-callback.js
// Handles Google OAuth callback and stores tokens in a cookie

exports.handler = async (event) => {
  const { code, error } = event.queryStringParameters || {};

  if (error) {
    return {
      statusCode: 302,
      headers: { Location: '/?gcal=error' },
    };
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: { Location: '/?gcal=error' },
    };
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GCAL_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json();

    if (!tokens.access_token) {
      return {
        statusCode: 302,
        headers: { Location: '/?gcal=error' },
      };
    }

    // Store tokens in a secure cookie (expires in 60 days)
    const tokenData = JSON.stringify({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in * 1000),
    });

    const encoded = Buffer.from(tokenData).toString('base64');

    return {
      statusCode: 302,
      headers: {
        Location: '/?gcal=success',
        'Set-Cookie': `gcal_token=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`,
      },
    };
  } catch (err) {
    console.error('OAuth callback error:', err);
    return {
      statusCode: 302,
      headers: { Location: '/?gcal=error' },
    };
  }
};
