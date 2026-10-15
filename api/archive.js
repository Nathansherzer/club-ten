/* ==========================================================
   api/archive.js — Vercel serverless function
   URL: GET /api/archive

   Returns a JSON list of past puzzle dates (never today or future).
   The archive page uses this list to populate its date picker.

   Response: { "dates": ["2026-07-13", "2026-07-12", ...] }
             sorted newest-first.
   ========================================================== */

import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { londonToday, puzzleNumber, recentArchiveDates } from "../lib/puzzle-meta.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const today = londonToday();
  const dates = await recentArchiveDates(ROOT, today);

  const puzzles = dates.map(date => ({ date, puzzleNumber: puzzleNumber(date) }));

  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).json({ puzzles });
}
