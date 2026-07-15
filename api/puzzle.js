/* ==========================================================
   api/puzzle.js — Vercel serverless function
   URL: GET /api/puzzle?club=arsenal
        GET /api/puzzle?club=arsenal&date=2026-07-01  (archive)

   Returns puzzle METADATA only — question, labels, puzzle
   number, and total slot count.  No answers are included.

   Guess validation is handled by POST /api/guess.
   End-of-game and archive reveals are handled by GET /api/reveal.
   Future dates are blocked so tomorrow's metadata can't be read.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// __dirname doesn't exist in ES modules, so we derive it from import.meta.url.
// This gives us the absolute path to the api/ folder, and we go up one level
// to reach the project root where /puzzles/ lives.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_CLUBS = new Set([
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester-city",
  "manchester-united",
  "tottenham"
]);

// Puzzle #1 launched on this date. The number displayed to players
// ("Puzzle #14") is calculated as days-since-launch + 1.
const LAUNCH_DATE = "2026-07-14";

/** Returns "YYYY-MM-DD" in London time — the canonical puzzle date. */
function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

/** Days from LAUNCH_DATE to dateStr, 1-based. */
function puzzleNumber(dateStr) {
  const msPerDay = 86400000;
  const diff = new Date(dateStr + "T12:00:00Z") - new Date(LAUNCH_DATE + "T12:00:00Z");
  return Math.floor(diff / msPerDay) + 1;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { club, date } = req.query;

  // Validate club
  if (!club || !VALID_CLUBS.has(club)) {
    return res.status(400).json({
      error: `Unknown club. Valid values: ${[...VALID_CLUBS].join(", ")}`
    });
  }

  const today         = londonToday();
  const requestedDate = date || today;

  // Block future dates so tomorrow's answers can't be read today
  if (requestedDate > today) {
    return res.status(403).json({ error: "That puzzle isn't available yet." });
  }

  const filePath = join(ROOT, "puzzles", requestedDate, `${club}.json`);

  let raw;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return res.status(404).json({
      error: `No puzzle found for ${club} on ${requestedDate}.`
    });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return res.status(500).json({ error: "Puzzle file is malformed." });
  }

  // Return metadata only — answers stay on the server
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).json({
    clubLabel:   data.clubLabel,
    clubShort:   data.clubShort,
    question:    data.question,
    note:        data.note,
    placeholder: data.placeholder,
    puzzleNumber: puzzleNumber(requestedDate),
    total:       data.answers.length
  });
}
