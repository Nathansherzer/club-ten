/* ==========================================================
   api/indexnow.js — Vercel serverless function
   URL: GET /api/indexnow  (triggered daily by Vercel Cron)

   Notifies Bing/IndexNow of the URLs that went live today:
   the 6 club landing pages (content changes daily), today's
   6 dated puzzle pages, and today's blog post if one just
   published.
   ========================================================== */

import { POSTS } from "./blog-post.js";

const BASE = "https://topclubten.com";
const KEY  = "7c8455c5adef4f6c9397663a2eb6aa29";

const CLUBS = [
  "arsenal", "chelsea", "liverpool",
  "manchester-city", "manchester-united", "tottenham"
];

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const today = londonToday();

  const urlList = [
    `${BASE}/`,
    ...CLUBS.map(c => `${BASE}/${c}`),
    ...CLUBS.map(c => `${BASE}/${c}/${today}`),
  ];

  const todaysSlug = Object.entries(POSTS).find(([, date]) => date === today)?.[0];
  if (todaysSlug) urlList.push(`${BASE}/blog/${todaysSlug}`);

  let indexNowStatus, indexNowBody;
  try {
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host: "topclubten.com",
        key: KEY,
        keyLocation: `${BASE}/${KEY}.txt`,
        urlList,
      }),
    });
    indexNowStatus = r.status;
    indexNowBody = await r.text();
  } catch (err) {
    return res.status(502).json({ error: "IndexNow request failed", detail: String(err) });
  }

  return res.status(200).json({ submitted: urlList, indexNowStatus, indexNowBody });
}
