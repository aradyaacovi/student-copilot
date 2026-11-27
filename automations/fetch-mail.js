// קורא מיילים חדשים מג׳ימייל (IMAP) בשביל workflow 2-email-changes.
// כל מייל שטופל מקבל תווית "copilot-done" בג׳ימייל, בלי לשנות את מצב הקריאה שלו.
// הספריות (imapflow, mailparser) מותקנות רק בענן ומועברות מבחוץ, כדי שהבדיקות ירוצו בלי רשת.
const LABEL = "copilot-done";
const MAX_MAILS = 30;

function toItem(parsed) {
  return {
    json: {
      from: parsed.from && parsed.from.text ? parsed.from.text : "",
      subject: parsed.subject || "",
      textPlain: parsed.text || "",
      textHtml: typeof parsed.html === "string" ? parsed.html : "",
      date: parsed.date ? parsed.date.toISOString() : undefined,
      metadata: { "message-id": parsed.messageId || "" },
    },
  };
}

async function fetchNewMail({ address, password }, { ImapFlow, simpleParser }) {
  const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: address, pass: password }, logger: false });
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  const release = async () => { lock.release(); await client.logout().catch(() => {}); };
  const uids = [];
  const items = [];
  try {
    const found = (await client.search({ gmraw: `newer_than:7d -label:${LABEL}` }, { uid: true })) || [];
    for (const uid of found.slice(-MAX_MAILS)) {
      const msg = await client.fetchOne(uid, { source: true }, { uid: true });
      items.push(toItem(await simpleParser(msg.source)));
      uids.push(uid);
    }
  } catch (e) {
    await release();
    throw e;
  }
  return {
    items,
    // נקרא רק אחרי שה-workflow הצליח, כדי שמייל שנכשל ינותח שוב בריצה הבאה.
    async markDone() {
      try { if (uids.length) await client.messageFlagsAdd(uids, [LABEL], { uid: true, useLabels: true }); } finally { await release(); }
    },
    close: release,
  };
}

// הודעת שגיאה בטוחה לרישום ולהצגה: בלי כתובות, נושאים או טקסט מהשרת, רק מה קרה וקוד.
function describeMailError(e) {
  if (e && e.authenticationFailed) return "ההתחברות לג׳ימייל נכשלה (בדקי את GMAIL_APP_PASSWORD)";
  const code = e && (e.code || e.name);
  return "קריאת המייל נכשלה" + (code ? " (" + code + ")" : "");
}

module.exports = { fetchNewMail, describeMailError, toItem, LABEL, MAX_MAILS };
