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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
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
    // If /puzzles doesn't exist yet, return an empty list gracefully.
    return res.status(200).json({ dates: [] });
  }

  const pastDates = entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < today)
    .map(e => e.name)
    .sort()
    .reverse(); // newest first

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ dates: pastDates });
}
