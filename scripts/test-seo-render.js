/**
 * test-seo-render.js — raw-HTML assertions for the server-rendered pages
 *
 * Run with:  node scripts/test-seo-render.js
 *            BASE_URL=http://localhost:3311 node scripts/test-seo-render.js
 *
 * Fetches the actual HTTP response body (no JS execution — this is
 * exactly what an AdSense reviewer or a non-JS crawler sees) for the
 * homepage and all six club routes, and confirms:
 *
 *   1. Today's real puzzle number and question text are present.
 *   2. "Puzzle #1" never appears as a fallback unless today genuinely
 *      is puzzle #1 — catches a regression back to the old hardcoded
 *      placeholder.
 *   3. None of today's 10 real answers, or any of their accept-array
 *      fuzzy-match variants, appear anywhere in the response body.
 *      This is the critical check: the whole point of this page is to
 *      expose the question without exposing the solution.
 *   4. <title>, <meta name="description"> and <link rel="canonical">
 *      are present and reference the right club/puzzle.
 *
 * Exits non-zero on any hard failure, so it can gate a deploy.
 */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = process.env.BASE_URL || "https://topclubten.com";

const VALID_CLUBS = [
  "arsenal", "chelsea", "liverpool",
  "manchester-city", "manchester-united", "tottenham"
];

const CLUB_NAMES = {
  "arsenal":           "Arsenal",
  "chelsea":           "Chelsea",
  "liverpool":         "Liverpool",
  "manchester-city":   "Man City",
  "manchester-united": "Man United",
  "tottenham":         "Spurs"
};

const LAUNCH_DATE = "2026-07-15";

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

function puzzleNumber(dateStr) {
  const diff = new Date(dateStr + "T12:00:00Z") - new Date(LAUNCH_DATE + "T12:00:00Z");
  return Math.floor(diff / 86400000) + 1;
}

// Mirrors lib/puzzle-meta.js esc() — the pages HTML-escape question/note
// text before inserting it, so the raw response body must be compared
// against the escaped form, not the raw JSON string.
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let failures = 0;
function check(label, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}

async function fetchText(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  const body = await res.text();
  return { status: res.status, body };
}

async function testClubPage(club) {
  const today = londonToday();
  const num   = puzzleNumber(today);
  console.log(`\n${club} (/${club}) — expecting Puzzle #${num}`);

  const { status, body } = await fetchText(`/${club}`);
  check("HTTP 200", status === 200, `got ${status}`);

  const data = JSON.parse(await readFile(join(ROOT, "puzzles", today, `${club}.json`), "utf-8"));

  check("real puzzle number present", body.includes(`Puzzle #${num}`));
  check("real question text present", body.includes(esc(data.question)));
  check("real note text present", !data.note || body.includes(esc(data.note)));

  // "Puzzle #1" must not appear as a stale fallback unless today really is #1.
  if (num !== 1) {
    check('no stale "Puzzle #1" fallback', !body.includes("Puzzle #1"));
  }

  // The critical check: no answer, and no accept-array variant of any
  // answer, appears anywhere in the raw response body.
  let leaked = [];
  for (const a of data.answers) {
    if (body.includes(a.display)) leaked.push(a.display);
    for (const acc of a.accept) {
      if (body.toLowerCase().includes(acc.toLowerCase())) leaked.push(acc);
    }
  }
  check("no answers or accept variants exposed", leaked.length === 0, leaked.join(", "));

  const clubShort = data.clubShort || CLUB_NAMES[club];
  const titleMatch = body.match(/<title>([^<]*)<\/title>/);
  check("title present and club/puzzle-specific",
    !!titleMatch && titleMatch[1].includes(clubShort) && titleMatch[1].includes(`#${num}`),
    titleMatch && titleMatch[1]);

  const descMatch = body.match(/<meta name="description" content="([^"]*)">/);
  check("meta description present and club/puzzle-specific",
    !!descMatch && descMatch[1].includes(clubShort) && descMatch[1].includes(`#${num}`),
    descMatch && descMatch[1]);

  const canonMatch = body.match(/<link rel="canonical" href="([^"]*)">/);
  check("canonical is the bare club URL",
    !!canonMatch && canonMatch[1] === `https://topclubten.com/${club}`,
    canonMatch && canonMatch[1]);
}

async function testHomepage() {
  console.log(`\nhomepage (/)`);
  const { status, body } = await fetchText("/");
  check("HTTP 200", status === 200, `got ${status}`);
  check('has "Today\'s Club Ten challenges" section', body.includes("Today's Club Ten challenges"));

  const today = londonToday();
  for (const club of VALID_CLUBS) {
    const data = JSON.parse(await readFile(join(ROOT, "puzzles", today, `${club}.json`), "utf-8"));
    check(`${club}: today's question linked and present`,
      body.includes(`href="/${club}"`) && body.includes(esc(data.question)));

    // Same leak check as the club pages — the homepage summary must not
    // expose answers either.
    let leaked = [];
    for (const a of data.answers) {
      if (body.includes(a.display)) leaked.push(a.display);
    }
    check(`${club}: no answers exposed on homepage`, leaked.length === 0, leaked.join(", "));
  }
}

async function main() {
  console.log(`Testing against ${BASE_URL}\n${"=".repeat(50)}`);

  await testHomepage();
  for (const club of VALID_CLUBS) {
    await testClubPage(club);
  }

  console.log(`\n${"=".repeat(50)}`);
  if (failures > 0) {
    console.log(`${failures} check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log("All checks passed.");
  }
}

main().catch(err => {
  console.error("Fatal error running tests:", err);
  process.exit(1);
});
