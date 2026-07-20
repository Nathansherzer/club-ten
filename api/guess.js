/* ==========================================================
   api/guess.js — Vercel serverless function
   URL: POST /api/guess
   Body: { club, guess, date? }

   Validates one guess against the puzzle file on the server.
   Returns { hit: false } or { hit: true, slot, display, detail }.
   The accept[] arrays from the puzzle file never leave the server.

   Future dates are blocked with the same gate as /api/puzzle,
   preventing brute-force enumeration of tomorrow's answers.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { matchGuess } from "../lib/match.js";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { club, guess, date, found: foundArr } = req.body ?? {};

  if (!club || !VALID_CLUBS.has(club)) {
    return res.status(400).json({ error: "Unknown club." });
  }
  if (!guess || typeof guess !== "string") {
    return res.status(400).json({ error: "Missing guess." });
  }

  const today         = londonToday();
  const requestedDate = date || today;

  // Same future-date gate as /api/puzzle — blocks brute-forcing tomorrow's answers
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

  const skip   = new Set(Array.isArray(foundArr) ? foundArr.filter(Number.isInteger) : []);
  const result = matchGuess(guess, data.answers, skip);

  if (result === null) {
    return res.status(200).json({ hit: false });
  }

  const { slot, matched } = result;
  const rawDisplay = data.answers[slot].display;
  // Pool slots (display: null) show the actual club name the player typed.
  const display = rawDisplay != null
    ? rawDisplay
    : matched.replace(/\b\w/g, c => c.toUpperCase());

  // Return display + detail for the matched slot only — never the full answers list
  return res.status(200).json({
    hit: true,
    slot,
    display,
    detail: data.answers[slot].detail
  });
}
