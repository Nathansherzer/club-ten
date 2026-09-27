/* ==========================================================
   lib/puzzle-meta.js — shared puzzle metadata helpers

   Was duplicated near-identically across api/puzzle.js,
   api/puzzle-page.js and api/archive.js (LAUNCH_DATE,
   puzzleNumber(), londonToday(), club name/colour tables).
   Centralized for the same reason lib/match.js exists: if the
   copies ever drifted, the displayed puzzle number could
   silently disagree between the game, the archive links and
   the server-rendered pages, with no error.
   ========================================================== */

import { readFile } from "fs/promises";
import { join } from "path";

// Puzzle #1 launched on this date. The number displayed to players
// ("Puzzle #14") is calculated as days-since-launch + 1.
export const LAUNCH_DATE = "2026-07-15";

export const VALID_CLUBS = new Set([
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester-city",
  "manchester-united",
  "tottenham"
]);

export const CLUB_NAMES = {
  "arsenal":           "Arsenal",
  "chelsea":           "Chelsea",
  "liverpool":         "Liverpool",
  "manchester-city":   "Man City",
  "manchester-united": "Man United",
  "tottenham":         "Spurs"
};

export const CLUB_COLOURS = {
  "arsenal":           "#EF0107",
  "chelsea":           "#034694",
  "liverpool":         "#C8102E",
  "manchester-city":   "#6CABDD",
  "manchester-united": "#DA291C",
  "tottenham":         "#132257"
};

/** Returns "YYYY-MM-DD" in London time — the canonical puzzle date. */
export function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

/** Days from LAUNCH_DATE to dateStr, 1-based. */
export function puzzleNumber(dateStr) {
  const diff = new Date(dateStr + "T12:00:00Z") - new Date(LAUNCH_DATE + "T12:00:00Z");
  return Math.floor(diff / 86400000) + 1;
}

export function formatDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function capitalize(s) {
  return String(s ?? "").replace(/^\w/, c => c.toUpperCase());
}

/**
 * Reads and parses puzzles/{date}/{club}.json relative to repoRoot.
 * Returns null on any read/parse failure (missing file, bad JSON) —
 * callers render an explicit "unavailable" state rather than guessing.
 */
export async function loadPuzzle(repoRoot, club, date) {
  try {
    const raw = await readFile(join(repoRoot, "puzzles", date, `${club}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
