/* ==========================================================
   api/puzzle-page.js — Vercel serverless function
   URL: GET /arsenal/2026-07-15  (via vercel.json rewrite)

   Serves a fully server-rendered HTML page for each puzzle
   so Google can index the question text. No answers shown.
   ========================================================== */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_CLUBS = new Set([
  "arsenal", "chelsea", "liverpool",
  "manchester-city", "manchester-united", "tottenham"
]);

const CLUB_NAMES = {
  "arsenal":           "Arsenal",
  "chelsea":           "Chelsea",
  "liverpool":         "Liverpool",
  "manchester-city":   "Man City",
  "manchester-united": "Man United",
  "tottenham":         "Spurs"
};

const CLUB_COLOURS = {
  "arsenal":           "#EF0107",
  "chelsea":           "#034694",
  "liverpool":         "#C8102E",
  "manchester-city":   "#6CABDD",
  "manchester-united": "#DA291C",
  "tottenham":         "#132257"
};

const LAUNCH_DATE = "2026-07-15";

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

function puzzleNumber(dateStr) {
  const diff = new Date(dateStr + "T12:00:00Z") - new Date(LAUNCH_DATE + "T12:00:00Z");
  return Math.floor(diff / 86400000) + 1;
}

function formatDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function capitalize(s) {
  return s.replace(/^\w/, c => c.toUpperCase());
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { club, date } = req.query;

  if (!club || !VALID_CLUBS.has(club)) return res.status(400).send("Unknown club.");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Invalid date.");

  const today = londonToday();
  if (date > today) return res.status(403).send("That puzzle isn't available yet.");

  let data;
  try {
    const raw = await readFile(join(ROOT, "puzzles", date, `${club}.json`), "utf-8");
    data = JSON.parse(raw);
  } catch {
    return res.status(404).send("Puzzle not found.");
  }

  const clubName  = CLUB_NAMES[club];
  const colour    = CLUB_COLOURS[club];
  const num       = puzzleNumber(date);
  const question  = capitalize(data.question);
  const note      = data.note || "";

  // Adjacent puzzle dates for prev/next links
  let allDates = [];
  try {
    const dirs = await readdir(join(ROOT, "puzzles"));
    allDates = dirs.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today).sort();
  } catch {}

  const idx      = allDates.indexOf(date);
  const prevDate = idx > 0 ? allDates[idx - 1] : null;
  const nextDate = idx < allDates.length - 1 ? allDates[idx + 1] : null;

  const navHtml = (prevDate || nextDate) ? `
    <div class="puzzle-nav" style="margin:20px 0">
      ${prevDate ? `<a href="/${club}/${prevDate}" class="puzzle-nav-btn">‹ Previous</a>` : ""}
      ${nextDate ? `<a href="/${club}/${nextDate}" class="puzzle-nav-btn">Next ›</a>` : ""}
    </div>` : "";

  const otherClubs = [...VALID_CLUBS].filter(c => c !== club);
  const otherHtml = `
    <div style="margin-top:28px">
      <p style="font-size:0.8rem;color:var(--muted);margin-bottom:8px">Same puzzle, different club:</p>
      <div class="puzzle-nav">
        ${otherClubs.map(c => `<a href="/${c}/${date}" class="puzzle-nav-btn">${CLUB_NAMES[c]}</a>`).join("")}
      </div>
    </div>`;

  const title       = `${esc(question)}? — Club Ten`;
  const description = `Can you ${esc(data.question)}? Play Club Ten Puzzle #${num} for ${clubName} fans. A new football top-10 challenge every day.`;
  const canonical   = `https://topclubten.com/${club}/${date}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${canonical}">
  <meta property="og:title"       content="${title}">
  <meta property="og:description" content="${description}">
  <meta name="twitter:card"        content="summary">
  <meta name="twitter:title"       content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="stylesheet" href="/css/style.css">
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-M8E5NFRXB5"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-M8E5NFRXB5');</script>
</head>
<body>
<div class="wrap">
  <header>
    <h1><a href="/">CLUB <span>TEN</span></a></h1>
    <div class="tagline">Daily football top-10s for your club.</div>
  </header>

  <div class="page-content">
    <p style="font-size:0.82rem;color:var(--muted);margin-bottom:8px">
      ${esc(clubName)} &middot; Puzzle #${num} &middot; ${esc(formatDate(date))}
    </p>
    <h2 style="border-top:3px solid ${colour};padding-top:14px">${esc(question)}?</h2>
    ${note ? `<p style="font-size:0.8rem;color:var(--muted);margin-top:6px">${esc(note)}</p>` : ""}

    <div style="text-align:center;margin:28px 0">
      <a href="/${club}?date=${date}" class="clubbtn"
         style="display:inline-block;width:auto;padding:14px 28px;text-decoration:none;border-top:3px solid ${colour}">
        Play Puzzle #${num} &rarr;
      </a>
    </div>

    ${navHtml}
    ${otherHtml}
  </div>

  <nav class="site-nav">
    <a href="/how-to-play">How to play</a>
    <a href="/archive">Archive</a>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/contact">Contact</a>
  </nav>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  return res.status(200).send(html);
}
