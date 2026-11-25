/* ==========================================================
   api/puzzle-page.js — Vercel serverless function
   URL: GET /arsenal/2026-07-15  (via vercel.json rewrite)

   Serves a fully server-rendered HTML page for each puzzle
   so Google can index the question text. No answers shown.
   ========================================================== */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  VALID_CLUBS, CLUB_NAMES, CLUB_COLOURS,
  londonToday, puzzleNumber, formatDate, esc, capitalize, loadPuzzle,
  isDateServable, recentArchiveDates
} from "../lib/puzzle-meta.js";
import { SNACK_HEAD_BLOCK, NEW_COOKIE_LINK, SNACK_HTML_TAG } from "../lib/snack-page.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { club, date } = req.query;

  if (!club || !VALID_CLUBS.has(club)) return res.status(400).send("Unknown club.");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).send("Invalid date.");

  const today = londonToday();
  if (date > today) return res.status(403).send("That puzzle isn't available yet.");

  // A date outside the rolling archive window is sent to today's puzzle
  // rather than rendered — the full history isn't browsable forever just
  // by hand-editing the URL.
  if (date !== today && !(await isDateServable(ROOT, date, today))) {
    return res.redirect(302, `/${club}`);
  }

  const data = await loadPuzzle(ROOT, club, date);
  if (!data) return res.status(404).send("Puzzle not found.");

  const clubName  = CLUB_NAMES[club];
  const colour    = CLUB_COLOURS[club];
  const num       = puzzleNumber(date);
  const question  = capitalize(data.question);
  const note      = data.note || "";

  // Adjacent puzzle dates for prev/next links — restricted to the same
  // servable window as the redirect above, so Previous/Next never offers
  // a date that would immediately bounce back to today.
  const windowDates = await recentArchiveDates(ROOT, today);
  const allDates = [...windowDates, today].sort();

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
${SNACK_HTML_TAG}
<head>
  <meta charset="UTF-8">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <link rel="canonical" href="${canonical}">
  ${data.index === true ? `` : `<meta name="robots" content="noindex,follow">`}
  <meta property="og:type"        content="website">
  <meta property="og:url"         content="${canonical}">
  <meta property="og:title"       content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:site_name"   content="Club Ten">
  <meta property="og:image"       content="https://topclubten.com/assets/og-image.png">
  <meta name="twitter:image"       content="https://topclubten.com/assets/og-image.png">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${title}">
  <meta name="twitter:description" content="${description}">
  <link rel="stylesheet" href="/css/style.css">
  ${SNACK_HEAD_BLOCK.trimEnd()}
</head>
<body>
<div class="wrap">
  <header>
    <div class="logo"><a href="/">CLUB <span>TEN</span></a></div>
    <div class="tagline">Daily football top-10s for your club.</div>
  </header>

  <div class="page-content">
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a href="/">Club Ten</a> &rsaquo;
      <a href="/${club}">${esc(clubName)} Trivia Quiz</a> &rsaquo;
      Puzzle #${num}
    </nav>

    <h1 style="border-top:3px solid ${colour};padding-top:14px;font-size:1.15rem;line-height:1.35">${esc(question)}?</h1>
    <p style="font-size:0.82rem;color:var(--muted);margin-top:6px">
      ${esc(clubName)} &middot; Puzzle #${num} &middot; ${esc(formatDate(date))}
    </p>
    ${note ? `<p style="font-size:0.8rem;color:var(--muted);margin-top:6px">${esc(note)}</p>` : ""}

    <div style="text-align:center;margin:28px 0">
      <a href="/${club}?date=${date}" class="clubbtn"
         style="display:inline-block;width:auto;padding:14px 28px;text-decoration:none;border-top:3px solid ${colour}">
        Play Puzzle #${num} &rarr;
      </a>
    </div>

    <p style="text-align:center;margin:18px 0">
      <a href="/${club}">Play today's ${esc(clubName)} trivia quiz and top 10 game</a>
    </p>

    ${navHtml}
    ${otherHtml}
  </div>

  <nav class="site-nav">
    <a href="/how-to-play">How to play</a>
    <a href="/archive">Archive</a>
    <a href="/about">About</a>
    <a href="/privacy">Privacy</a>
    <a href="/contact">Contact</a>
    ${NEW_COOKIE_LINK}
  </nav>
</div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  return res.status(200).send(html);
}
