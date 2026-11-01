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

import { readFile, readdir } from "fs/promises";
import { join } from "path";

// Puzzle #1 launched on this date. The number displayed to players
// ("Puzzle #14") is calculated as days-since-launch + 1.
export const LAUNCH_DATE = "2026-07-15";

// Fallback puzzle shown in place of today's puzzle if a day is ever
// missed (files not pushed before London midnight). Fixed on a
// Champions League final starting XI — a closed historical event
// that can never be affected by future results, so it never goes
// stale no matter how long it sits unused.
export const BACKUP_DATE = "2026-07-20";

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

// How many most-recent past days stay reachable through the archive and
// dated URLs. Anything older still exists on disk but is deliberately not
// servable, so the full puzzle history isn't freely browsable forever by
// hand-editing a date in the URL.
export const ARCHIVE_WINDOW_DAYS = 10;

/** The most recent `limit` puzzle dates strictly before `today`, newest first. */
export async function recentArchiveDates(repoRoot, today, limit = ARCHIVE_WINDOW_DAYS) {
  let entries;
  try {
    entries = await readdir(join(repoRoot, "puzzles"), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < today)
    .map(e => e.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
}

/**
 * True if `dateStr` is servable: today, the permanent BACKUP_DATE fallback
 * (reused indefinitely when a day's file is missing — must never be blocked
 * by the archive window), or inside the rolling archive window.
 */
export async function isDateServable(repoRoot, dateStr, today) {
  if (dateStr === today || dateStr === BACKUP_DATE) return true;
  const recent = await recentArchiveDates(repoRoot, today);
  return recent.includes(dateStr);
}

/**
 * Loads today's puzzle, falling back to BACKUP_DATE if today's file
 * is missing. Only ever call this for "today" (no explicit ?date=) —
 * an archive gap should stay an honest 404, never silently show
 * unrelated content under the wrong historical date.
 *
 * Returns { data, date, isBackup }. `date` is the date whose file was
 * actually loaded (today's, or BACKUP_DATE) — callers must use this,
 * not the originally-requested date, so that subsequent guess/reveal
 * calls built from it hit the file that's actually being shown.
 */
export async function loadTodayPuzzle(repoRoot, club, today) {
  const data = await loadPuzzle(repoRoot, club, today);
  if (data) return { data, date: today, isBackup: false };

  const backup = await loadPuzzle(repoRoot, club, BACKUP_DATE);
  return { data: backup, date: BACKUP_DATE, isBackup: true };
}
