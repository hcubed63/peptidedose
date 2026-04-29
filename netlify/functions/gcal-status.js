// netlify/functions/gcal-status.js
// Returns whether the user is authenticated with Google Calendar

exports.handler = async (event) => {
  const cookies = parseCookies(event.headers.cookie || '');
  const tokenCookie = cookies.gcal_token;

  if (!tokenCookie) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: false }),
    };
  }

  try {
    const tokenData = JSON.parse(Buffer.from(tokenCookie, 'base64').toString('utf8'));
    const isExpired = Date.now() > tokenData.expiry - 60000;
    const hasRefresh = !!tokenData.refresh_token;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        authenticated: true,
        needsRefresh: isExpired && !hasRefresh,
      }),
    };
  } catch {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ authenticated: false }),
    };
  }
};

function parseCookies(cookieHeader) {
  const cookies = {};
  cookieHeader.split(';').forEach(cookie => {
    const [key, ...val] = cookie.trim().split('=');
    if (key) cookies[key.trim()] = val.join('=');
  });
  return cookies;
}
