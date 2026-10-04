// Daily Ayah FCM push — Naba Quran (JuzAmma Pro Max)
// Triggered daily by Vercel cron at 07:00 UTC (7am Ghana) or manually
// via POST with the x-admin-key header.
//
// Pure JS: mints an OAuth2 token from the Firebase service account
// (env var FCM_SERVICE_ACCOUNT) with node's crypto module — no npm deps,
// small cold starts. Device tokens are stored in the app's Base44
// backend (FcmToken entity) via fcmListTokens / fcmRegisterToken functions.

const TOKENS_URL = 'https://superagent-7ce6afb1.base44.app/functions/fcmListTokens?key=nh-daily-ayah-2026';
// Admin key comes from the Vercel env var ADMIN_KEY (set 2026-10-02).
// NEVER hardcode it here — this repo is public and the previous key
// was committed in plain text, letting anyone push to all users.
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// Short, well-known ayahs (translation + reference). Rotated by day-of-year.
const AYAHS = [
  { en: 'Indeed, with hardship comes ease.', ref: 'Quran 94:6' },
  { en: 'So remember Me; I will remember you.', ref: 'Quran 2:152' },
  { en: 'Allah does not burden a soul beyond what it can bear.', ref: 'Quran 2:286' },
  { en: 'And He is with you wherever you are.', ref: 'Quran 57:4' },
  { en: 'Indeed, Allah is with those who are patient.', ref: 'Quran 2:153' },
  { en: 'Do not despair of the mercy of Allah.', ref: 'Quran 39:53' },
  { en: 'Verily, in the remembrance of Allah do hearts find rest.', ref: 'Quran 13:28' },
  { en: 'And whoever fears Allah — He will make a way out for him.', ref: 'Quran 65:2' },
  { en: 'Allah is the Light of the heavens and the earth.', ref: 'Quran 24:35' },
  { en: 'Indeed, the mercy of Allah is near to the doers of good.', ref: 'Quran 7:56' },
  { en: 'And your Lord is going to give you, and you will be satisfied.', ref: 'Quran 93:5' },
  { en: 'Indeed, Allah loves those who rely upon Him.', ref: 'Quran 3:159' },
  { en: 'Speak to people good words.', ref: 'Quran 2:83' },
  { en: 'And do good; indeed, Allah loves the doers of good.', ref: 'Quran 2:195' },
  { en: 'Every soul shall taste death, and you will be given your full compensation on the Day of Resurrection.', ref: 'Quran 3:185' },
  { en: 'Whoever does an atom\'s weight of good will see it.', ref: 'Quran 99:7-8' },
  { en: 'Indeed, Allah is Forgiving and Merciful.', ref: 'Quran 2:173' },
  { en: 'And seek help through patience and prayer.', ref: 'Quran 2:45' },
  { en: 'Do not lose hope, nor be sad.', ref: 'Quran 3:139' },
  { en: 'Indeed, the best of companions is the best of you in character.', ref: 'Quran 4:19 (near)' },
  { en: 'Hold fast to the rope of Allah, all together, and do not divide.', ref: 'Quran 3:103' },
  { en: 'Indeed, Allah hears and knows all things.', ref: 'Quran 2:137' },
  { en: 'And whatever good you put forward — you will find it with Allah.', ref: 'Quran 2:110' },
  { en: 'He created you, then He sustains you, then He causes you to die and then gives you life.', ref: 'Quran 30:40' },
  { en: 'Say: My Lord has guided me to a straight path.', ref: 'Quran 6:161' },
  { en: 'And indeed, the Hereafter is better for you than this present life.', ref: 'Quran 93:4' },
  { en: 'For each one are successive angels before and behind, protecting him by Allah\'s command.', ref: 'Quran 13:11' },
  { en: 'And your Lord is never forgetful.', ref: 'Quran 19:64' },
  { en: 'Indeed, We have made the Quran easy for remembrance.', ref: 'Quran 54:17' },
  { en: 'Allah is the ally of those who believe.', ref: 'Quran 2:257' },
];

// Short hadiths for the daily "come and read" reminder push —
// taken from the app's own verified 42-hadith collection (40 Hadith view).
const HADITHS = [
  { en: 'Modesty is part of faith.', ref: 'Bukhari & Muslim' },
  { en: 'Speak good or remain silent.', ref: 'Bukhari & Muslim' },
  { en: 'The best of people are those most beneficial to people.', ref: 'Al-Tabarani' },
  { en: 'Whoever prays Fajr is under the protection of Allah.', ref: 'Sahih Muslim' },
  { en: 'Be in this world as a stranger or a traveler.', ref: 'Sahih al-Bukhari' },
  { en: 'None of you truly believes until he loves for his brother what he loves for himself.', ref: 'Bukhari & Muslim' },
  { en: 'Whoever sends one blessing upon me, Allah sends ten blessings upon him.', ref: 'Sahih Muslim' },
  { en: 'Fear Allah wherever you are, and follow a bad deed with a good one.', ref: 'Jami at-Tirmidhi' },
  { en: 'Actions are but by intentions.', ref: 'Bukhari & Muslim' },
  { en: 'Whoever takes a path seeking knowledge, Allah makes easy for him a path to Paradise.', ref: 'Sahih Muslim' },
];

// Competition backend (Solas app function, same one api/comp.js proxies).
const COMP_BASE = 'https://solas-39a02ff5.base44.app/functions/nabaCompetition';
async function compAction(action, extra) {
  const r = await fetch(COMP_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...(extra || {}) }),
  });
  return r.json();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa) {
  const crypto = require('crypto');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(header + '.' + claims);
  const sig = b64url(signer.sign(sa.private_key));
  const assertion = header + '.' + claims + '.' + sig;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token exchange failed: ' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

async function sendToToken(accessToken, projectId, token, title, body, data) {
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        data: data || {},
        android: {
          priority: 'HIGH',
          notification: { channel_id: 'daily_ayah' },
        },
      },
    }),
  });
  return { ok: r.ok, status: r.status, resp: await r.text() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const url = new URL(req.url, 'https://juz-amma-pro-max.vercel.app');
  const isCron = req.headers['x-vercel-cron'] || req.headers['x-vercel-ip'] === '1';
  const adminOk = ADMIN_KEY && ((req.headers['x-admin-key'] === ADMIN_KEY) || url.searchParams.get('key') === ADMIN_KEY);

  if (req.method === 'GET' && !isCron && !adminOk) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.method === 'POST' && !adminOk) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'GET (cron) or POST (manual)' });
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); } catch (e) { body = {}; }
  const isTest = body.test === true;
  const singleToken = body.token || null;

  try {
    // 1. Service account from env
    let sa = process.env.FCM_SERVICE_ACCOUNT;
    if (!sa) return res.status(500).json({ error: 'FCM_SERVICE_ACCOUNT not set' });
    if (typeof sa === 'string') sa = JSON.parse(sa);
    const projectId = sa.project_id;

    // 2. OAuth token
    const accessToken = await getAccessToken(sa);

    // 3. Which tokens to send to
    let tokens = [];
    if (singleToken) {
      tokens = [singleToken];
    } else {
      const r = await fetch(TOKENS_URL);
      const j = await r.json();
      if (!j.ok) throw new Error('token list failed: ' + JSON.stringify(j).slice(0, 200));
      tokens = j.tokens || [];
    }

    // 4. Main push (existing behaviour). With no devices, still fall
    //    through to competition maintenance so the weekly AI host and
    //    closing keep working even before the first install.
    let main = { ok: true, sent: 0, total: 0, message: 'no registered devices yet', mode: 'none', ayah: null, results: [] };
    if (tokens.length > 0) {
      const hasCustom = typeof body.customTitle === 'string' && body.customTitle.trim()
        && typeof body.customBody === 'string' && body.customBody.trim();
      const customTitle = hasCustom ? body.customTitle.trim().slice(0, 60) : null;
      const customBody  = hasCustom ? body.customBody.trim().slice(0, 240) : null;

      let title, bodyText, ayah = null;
      if (customTitle) {
        title = customTitle;
        bodyText = customBody;
      } else {
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
        ayah = AYAHS[dayOfYear % AYAHS.length];
        title = isTest ? '🌙 Daily Ayah (test)' : '🌙 Ayah of the Day';
        bodyText = `"${ayah.en}" — ${ayah.ref}`;
      }

      const results = [];
      for (const t of tokens) {
        const r = await sendToToken(accessToken, projectId, t, title, bodyText, {
          ref: ayah.ref, test: isTest ? '1' : '0',
        });
        results.push({ token: t.slice(0, 12) + '…', ok: r.ok, status: r.status, detail: r.resp.slice(0, 120) });
      }

      main = {
        ok: true, sent: results.filter(r => r.ok).length, total: tokens.length,
        mode: customTitle ? 'custom' : 'ayah',
        ayah, results,
      };
    }

    // 5. Competition maintenance — cron only (daily 07:00 UTC), so
    //    manual admin pushes stay pure. Non-fatal on errors: the
    //    daily Ayah push must never break because of this block.
    //      a) close expired competitions + announce winners
    //      b) AI auto-host: ensure a weekly AI competition exists
    //      c) daily "come and read" reminder with the day's hadith
    //         (+ live competition line when one is running)
    const comp = { closed: [], weekly: null, reminderSent: 0 };
    if (isCron && !singleToken) {
      try {
        // a) close expired
        const closed = (await compAction('closeExpired')) || {};
        for (const c of (closed.closed || [])) {
          comp.closed.push(c.title);
          if (tokens.length > 0 && c.winnerName) {
            for (const t of tokens) {
              await sendToToken(accessToken, projectId, t,
                '🏆 Competition Finished!',
                `"${c.title}" has ended. Winner: ${c.winnerName} with ${c.winnerScore} points! مبروك 🎉`,
                { comp: 'results' });
            }
          }
        }
        // b) AI weekly host
        const wk = (await compAction('ensureWeekly')) || {};
        if (wk.created) {
          comp.weekly = wk.title || 'this week';
          if (tokens.length > 0) {
            for (const t of tokens) {
              await sendToToken(accessToken, projectId, t,
                '🤖 New AI Weekly Challenge!',
                `${wk.title} is live! Read, recite & memorize to top the leaderboard 🏆 Open Naba Quran and join now.`,
                { comp: 'weekly' });
            }
          }
        }
        // c) daily read reminder + hadith (+ competition countdown)
        if (tokens.length > 0 && !isTest) {
          const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
          const hadith = HADITHS[doy % HADITHS.length];
          const gc = (await compAction('getCompetitions')) || {};
          const act = (gc.active || [])[0];
          let rTitle = '📖 Read Quran Today';
          let rBody = `Keep your streak alive! 📜 Hadith of the day: "${hadith.en}" — ${hadith.ref}`;
          if (act) {
            const daysLeft = Math.max(1, Math.ceil((new Date(act.endDate) - Date.now()) / 86400000));
            rTitle = `🔥 ${daysLeft} Day${daysLeft === 1 ? '' : 's'} Left: ${act.title.replace(/^🤖\s*/, '')}`;
            rBody = `Read the Quran & climb the leaderboard! 📜 Hadith: "${hadith.en}" — ${hadith.ref}`;
          }
          let okCount = 0;
          for (const t of tokens) {
            const r = await sendToToken(accessToken, projectId, t, rTitle, rBody, { comp: 'reminder' });
            if (r.ok) okCount++;
          }
          comp.reminderSent = okCount;
        }
      } catch (e) {
        comp.error = String(e).slice(0, 150);
      }
    }

    return res.status(200).json({ ...main, competitions: comp });
  } catch (e) {
    return res.status(500).json({ error: String(e).slice(0, 300) });
  }
}
