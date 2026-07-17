/* ==========================================================
   api/archive.js — Vercel serverless function
   URL: GET /api/archive

   Returns a JSON list of past puzzle dates (never today or future).
   The archive page uses this list to populate its date picker.

   Response: { "dates": ["2026-07-13", "2026-07-12", ...] }
             sorted newest-first.
   ========================================================== */

import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT        = join(dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCH_DATE = "2026-07-14"; // Puzzle #1

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

function puzzleNumber(dateStr) {
  const diff = new Date(dateStr + "T12:00:00Z") - new Date(LAUNCH_DATE + "T12:00:00Z");
  return Math.floor(diff / 86400000) + 1;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const today      = londonToday();
  const puzzlesDir = join(ROOT, "puzzles");

  let entries;
  try {
    entries = await readdir(puzzlesDir, { withFileTypes: true });
  } catch {
    return res.status(200).json({ puzzles: [] });
  }

  const puzzles = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < today)
    .map(e => ({ date: e.name, puzzleNumber: puzzleNumber(e.name) }))
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ puzzles });
}
