/* ==========================================================
   api/status.js — Vercel serverless function
   URL: GET /api/status

   Returns a JSON summary of which puzzle files are present
   for today and the next 2 days (London time). Useful for a
   quick pre-midnight sanity check: curl https://<host>/api/status
   ========================================================== */

import { access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CLUBS = [
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester-city",
  "manchester-united",
  "tottenham"
];

function londonDateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

async function checkDate(dateStr) {
  const results = await Promise.all(
    CLUBS.map(async club => {
      const p = join(ROOT, "puzzles", dateStr, `${club}.json`);
      try { await access(p); return { club, ok: true }; }
      catch { return { club, ok: false }; }
    })
  );
  const missing = results.filter(r => !r.ok).map(r => r.club);
  return { date: dateStr, ready: missing.length === 0, missing };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const days = await Promise.all([0, 1, 2].map(n => checkDate(londonDateOffset(n))));
  const allReady = days.every(d => d.ready);

  res.setHeader("Cache-Control", "no-store");
  return res.status(allReady ? 200 : 503).json({ days });
}
