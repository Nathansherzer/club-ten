/* ==========================================================
   api/club-page.js — Vercel serverless function
   URL: GET /arsenal  (and the other 5 club slugs, via vercel.json rewrite)
        GET /arsenal?date=2026-07-01  (archive replay, still noindex)

   Serves the SAME interactive game page as the static {club}.html
   file, but with today's real puzzle number, club label, question
   and note server-rendered into the page — so the raw HTML response
   (no JS execution required) already contains the actual content,
   instead of the empty shell + client-side fetch this replaces.

   The static {club}.html file is read as the template and only the
   specific dynamic spots are substituted; everything else (markup,
   CSS classes, script tags, nav) is served byte-identical to before.
   Client-side game.js still runs exactly as before and re-fetches
   /api/puzzle — it re-sets the same text it finds already there
   (hydration), it does not need to change.

   Answers, accept-string variants and anything else that could help
   solve the live puzzle are never read into this function at all —
   only clubLabel/question/note/type are pulled off the puzzle object.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  VALID_CLUBS, CLUB_NAMES,
  londonToday, puzzleNumber, capitalize, esc, loadPuzzle
} from "../lib/puzzle-meta.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function isValidDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const { club } = req.query;
  if (!club || !VALID_CLUBS.has(club)) return res.status(400).send("Unknown club.");

  const today = londonToday();
  const rawDate = req.query.date;
  // An invalid or future date is silently ignored in favour of today rather
  // than erroring — the ?date= param is a client-side archive-play switch,
  // not something this render needs to be strict about.
  const isArchive = isValidDate(rawDate) && rawDate < today;
  const date = isArchive ? rawDate : today;

  let template;
  try {
    template = await readFile(join(ROOT, "templates", `${club}.html`), "utf-8");
  } catch {
    return res.status(500).send("Template not found.");
  }

  const data = await loadPuzzle(ROOT, club, date);

  let html;
  if (!data) {
    // Explicit unavailable state — never a "Puzzle #1" or otherwise
    // fabricated fallback standing in for real content.
    html = template
      .replace(
        `<div id="puzzleLabel">Puzzle #1</div>`,
        `<div id="puzzleLabel">Puzzle unavailable</div>`
      )
      .replace(
        `<span class="club" id="clubName"></span>`,
        `<span class="club" id="clubName">${esc(CLUB_NAMES[club])}:</span>`
      )
      .replace(
        `<span id="questionText"></span>`,
        `<span id="questionText">Today's puzzle isn't available right now. Please check back soon.</span>`
      )
      .replace(`<link rel="canonical"`, `<meta name="robots" content="noindex,follow">\n  <link rel="canonical"`);
  } else {
    const num          = puzzleNumber(date);
    const question     = data.question;
    const capQuestion  = capitalize(question);
    const clubShort    = data.clubShort || CLUB_NAMES[club];

    const newTitle       = esc(`${clubShort} Puzzle #${num}: ${capQuestion} | Club Ten`);
    const newDescription = esc(
      `Play Club Ten Puzzle #${num} for ${clubShort} fans: ${question}. ` +
      `A new football top-10 quiz every day, free, no sign-up needed.`
    );

    // <title> and the three meta *-title tags share one old string; same
    // for description/og:description/twitter:description — replaceAll
    // catches every occurrence in one pass rather than four separate edits.
    const oldTitleMatch = template.match(/<title>([^<]*)<\/title>/);
    const oldDescMatch  = template.match(/<meta name="description" content="([^"]*)">/);

    html = template;
    if (oldTitleMatch) html = html.replaceAll(oldTitleMatch[1], newTitle);
    if (oldDescMatch)  html = html.replaceAll(oldDescMatch[1], newDescription);

    html = html
      .replace(
        `<div id="puzzleLabel">Puzzle #1</div>`,
        `<div id="puzzleLabel">Puzzle #${num}</div>`
      )
      .replace(
        `<span class="club" id="clubName"></span>`,
        `<span class="club" id="clubName">${esc(data.clubLabel)}</span>`
      )
      .replace(
        `<span id="questionText"></span>`,
        `<span id="questionText">${esc(question)}</span>`
      )
      .replace(
        `<span class="note" id="questionNote"></span>`,
        `<span class="note" id="questionNote">${esc(data.note || "")}</span>`
      );

    if (isArchive) {
      html = html.replace(`<link rel="canonical"`, `<meta name="robots" content="noindex,follow">\n  <link rel="canonical"`);
    }
  }

  // Same rationale as api/puzzle.js: today's page changes at London
  // midnight on the same URL, so it must never be cached; an archive
  // replay at a fixed past date never changes and can cache hard.
  res.setHeader("Cache-Control", isArchive ? "public, max-age=86400, immutable" : "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
