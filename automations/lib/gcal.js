// סנכרון יומן Google (קריאה בלבד): אסימון גישה, שליפת אירועים והפיכתם לזמן תפוס.
// http = this.helpers.httpRequest מתוך n8n (או פונקציה מדומה בבדיקות). אין כאן גישה ישירה לרשת.
// פרטיות: מבקשים מ-Google רק שעות וסטטוס. כותרות, מיקומים ומשתתפים לא מגיעים לכאן בכלל.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_FIELDS = "nextPageToken,items(status,transparency,start,end,extendedProperties/private)";

/** מחליף את אסימון הרענון (שנשמר כסוד) באסימון גישה קצר טווח. */
async function accessToken(http, env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }).toString();
  let res;
  try {
    res = await http({ method: "POST", url: TOKEN_URL, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, json: true });
  } catch (e) {
    if (/invalid_grant/.test(e.message)) {
      throw new Error("האישור של Google פג או בוטל. להתחבר מחדש: node tools/google-auth.js (ראי docs/CALENDAR_SETUP.he.md)");
    }
    throw e;
  }
  if (!res || !res.access_token) throw new Error("Google לא החזיר אסימון גישה");
  return res.access_token;
}

/** שולף אירועים בטווח. singleEvents מפרק אירועים חוזרים למופעים בודדים. */
async function fetchEvents(http, token, calendarId, timeMin, timeMax) {
  const items = [];
  let pageToken = "";
  for (let page = 0; page < 5; page++) {
    const q = new URLSearchParams({
      singleEvents: "true", orderBy: "startTime", maxResults: "250", timeMin, timeMax, fields: EVENTS_FIELDS,
    });
    if (pageToken) q.set("pageToken", pageToken);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId || "primary")}/events?${q}`;
    const res = await http({ method: "GET", url, headers: { Authorization: "Bearer " + token }, json: true });
    items.push(...((res && res.items) || []));
    pageToken = res && res.nextPageToken;
    if (!pageToken) break;
  }
  return items;
}

/** שורות לטבלת calendar_busy: קטעי זמן תפוס לכל יום מ-fromIso ו-days ימים קדימה. */
function busyRows(events, fromIso, days, L) {
  const rows = [];
  let d = L.parseDate(fromIso);
  for (let i = 0; i < days; i++, d = L.addDays(d, 1)) {
    const date = L.iso(d);
    for (const b of L.calendarBusyForDay(events, date)) rows.push({ date, start_time: b.start, end_time: b.end });
  }
  return rows;
}

module.exports = { accessToken, fetchEvents, busyRows, TOKEN_URL };
