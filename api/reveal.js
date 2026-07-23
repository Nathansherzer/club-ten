/* ==========================================================
   api/reveal.js — Vercel serverless function
   URL: GET /api/reveal?club=arsenal
        GET /api/reveal?club=arsenal&date=2026-07-01  (archive)

   Returns display + detail for all 10 slots — used by the
   game client to fill unfound slots at game-over, and by
   archive.html to show past answers.

   accept[] arrays are never included in the response.
   Future dates are blocked with the same gate as /api/puzzle.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const VALID_CLUBS = new Set([
  "arsenal",
  "chelsea",
  "liverpool",
  "manchester-city",
  "manchester-united",
  "tottenham"
]);

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { club, date } = req.query;

  if (!club || !VALID_CLUBS.has(club)) {
    return res.status(400).json({ error: "Unknown club." });
  }

  const today         = londonToday();
  const requestedDate = date || today;

  if (requestedDate > today) {
    return res.status(403).json({ error: "That puzzle isn't available yet." });
  }

  const filePath = join(ROOT, "puzzles", requestedDate, `${club}.json`);

  let raw;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch {
    return res.status(404).json({ error: `No puzzle found for ${club} on ${requestedDate}.` });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return res.status(500).json({ error: "Puzzle file is malformed." });
  }

  // Strip accept arrays — only display + detail leave the server.
  // Pool slots have display:null; fall back to poolLabel so the reveal shows valid options.
  const answers = data.answers.map(({ display, detail, poolLabel }) => ({
    display: display ?? poolLabel ?? "—",
    detail
  }));

  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).json({
    clubLabel: data.clubLabel,
    question:  data.question,
    answers
  });
}
