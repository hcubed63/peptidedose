// netlify/functions/gcal-event.js
// Creates or updates a Google Calendar event when a dose is marked as taken

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  // Get token from cookie
  const cookies = parseCookies(event.headers.cookie || '');
  const tokenCookie = cookies.gcal_token;

  if (!tokenCookie) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Not authenticated' }),
    };
  }

  let tokenData;
  try {
    tokenData = JSON.parse(Buffer.from(tokenCookie, 'base64').toString('utf8'));
  } catch {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  // Refresh token if expired
  let accessToken = tokenData.access_token;
  if (Date.now() > tokenData.expiry - 60000) {
    try {
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });
      const refreshed = await refreshRes.json();
      if (refreshed.access_token) {
        accessToken = refreshed.access_token;
        tokenData.access_token = accessToken;
        tokenData.expiry = Date.now() + (refreshed.expires_in * 1000);
      }
    } catch (e) {
      console.error('Token refresh error:', e);
    }
  }

  // Parse request body
  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  const { peptide, dose, syringe, takenAt } = body;

  // Build calendar event
  const takenDate = new Date(takenAt);
  const endDate = new Date(takenDate.getTime() + 15 * 60 * 1000); // 15 min duration

  const calEvent = {
    summary: `✅ ${peptide} taken`,
    description: `Dose: ${dose}\nSyringe: ${syringe}\nLogged via Peptide Panel`,
    start: {
      dateTime: takenDate.toISOString(),
      timeZone: 'Australia/Brisbane',
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone: 'Australia/Brisbane',
    },
    colorId: peptide.includes('Retatrutide') ? '2' : '9', // sage green or blueberry
    reminders: { useDefault: false },
  };

  try {
    const gcalRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calEvent),
      }
    );

    const result = await gcalRes.json();

    if (result.id) {
      // Update cookie with potentially refreshed token
      const encoded = Buffer.from(JSON.stringify(tokenData)).toString('base64');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `gcal_token=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=5184000`,
        },
        body: JSON.stringify({ success: true, eventId: result.id }),
      };
    } else {
      console.error('Calendar API error:', result);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to create event', details: result }),
      };
    }
  } catch (err) {
    console.error('Calendar event error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
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
