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

import { access } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { VALID_CLUBS, londonToday, puzzleNumber, loadPuzzle, loadTodayPuzzle, isDateServable } from "../lib/puzzle-meta.js";

// __dirname doesn't exist in ES modules, so we derive it from import.meta.url.
// This gives us the absolute path to the api/ folder, and we go up one level
// to reach the project root where /puzzles/ lives.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Returns the London date N days from now as "YYYY-MM-DD". */
function londonDateOffset(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

/**
 * Fire-and-forget: logs a console.warn for every club whose puzzle file
 * is missing on `dateStr`. Runs after the response is already sent so it
 * never delays the user.
 */
async function warnIfMissing(dateStr) {
  const missing = [];
  await Promise.all([...VALID_CLUBS].map(async club => {
    const p = join(ROOT, "puzzles", dateStr, `${club}.json`);
    try { await access(p); } catch { missing.push(club); }
  }));
  if (missing.length > 0) {
    console.warn(
      `[club-ten] MISSING PUZZLES for ${dateStr}: ${missing.join(", ")}. ` +
      "Add the files and push before London midnight."
    );
  }
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

  // Archive puzzles older than the rolling window are no longer servable,
  // even though the file still exists on disk.
  if (date && !(await isDateServable(ROOT, requestedDate, today))) {
    return res.status(403).json({ error: "That puzzle is no longer available.", redirect: `/${club}` });
  }

  // Archive puzzles (explicit &date=) never fall back — a missing archive
  // date stays an honest 404. Only today's puzzle (no &date=) falls back
  // to BACKUP_DATE if the day's file is missing.
  let data, servedDate, isBackup;
  if (date) {
    data = await loadPuzzle(ROOT, club, requestedDate);
    servedDate = requestedDate;
    isBackup = false;
  } else {
    ({ data, date: servedDate, isBackup } = await loadTodayPuzzle(ROOT, club, today));
  }
  if (!data) {
    return res.status(404).json({
      error: `No puzzle found for ${club} on ${requestedDate}.`
    });
  }

  // Return metadata only — answers stay on the server.
  // Archive puzzles (explicit &date=) have a stable URL and never change,
  // so cache them hard. Today's puzzle (no date) is served from the SAME
  // URL every day but changes at London midnight, so it must never be
  // cached — otherwise a returning player can be handed yesterday's puzzle
  // from the browser cache for up to the cache lifetime after the rollover.
  if (date) {
    res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.status(200).json({
    date:        servedDate,
    clubLabel:   data.clubLabel,
    clubShort:   data.clubShort,
    question:    data.question,
    note:        isBackup
      ? `Bonus puzzle: today's regular puzzle wasn't ready, so here's an archive favourite instead. ${data.note}`
      : data.note,
    credit:      data.credit || null,
    placeholder: data.placeholder,
    type:        data.type || "players",
    isBackup,
    puzzleNumber: puzzleNumber(servedDate),
    total:       data.answers.length
  });

  // After responding, check that tomorrow's puzzles are staged.
  // Logs a warning to Vercel function logs if any are missing.
  if (!date) warnIfMissing(londonDateOffset(1));
  return;
}
