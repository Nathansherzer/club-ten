/**
 * validate-puzzles.js — structural validation for every puzzle file
 *
 * Run with:  node scripts/validate-puzzles.js
 *            (or: npm run validate-puzzles)
 *
 * Checks every puzzles/YYYY-MM-DD/<club>.json file for:
 *   1. Valid JSON, well-formed structure, exactly 10 answers.
 *   2. No ambiguous accept-string collisions within the same puzzle —
 *      the bug class that caused "gabriel" and "pedro" to silently
 *      credit the wrong player. Runs every accept string through the
 *      real production matcher (lib/match.js) and confirms it
 *      resolves to its own slot.
 *   3. Every answer's display name exists in the matching autocomplete
 *      bank (name-bank.json / club-bank.json / nationality-bank.json,
 *      based on the puzzle's "type" field). Catches the Edu Gaspar
 *      class of bug — a valid answer with no autocomplete suggestion.
 *
 * This is a pure structural check. It cannot verify that answers are
 * factually correct — only that the puzzle behaves correctly given
 * whatever data it contains. Exits non-zero if any check fails, so
 * it can gate a commit, a CI run, or a deploy.
 */

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { matchGuess } from "../lib/match.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUZZLES_DIR = join(ROOT, "puzzles");

const BANK_FILES = {
  clubs: "club-bank.json",
  nationalities: "nationality-bank.json",
  players: "name-bank.json",
};

async function loadBanks() {
  const banks = {};
  for (const [type, filename] of Object.entries(BANK_FILES)) {
    try {
      const raw = await readFile(join(ROOT, "data", filename), "utf-8");
      banks[type] = new Set(JSON.parse(raw));
    } catch {
      banks[type] = null; // bank file missing/unreadable — skip that check, don't crash
    }
  }
  return banks;
}

async function findPuzzleFiles() {
  const dates = (await readdir(PUZZLES_DIR, { withFileTypes: true }))
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d.name))
    .map(d => d.name)
    .sort();

  const files = [];
  for (const date of dates) {
    const clubFiles = (await readdir(join(PUZZLES_DIR, date)))
      .filter(f => f.endsWith(".json"));
    for (const f of clubFiles) {
      files.push(join(PUZZLES_DIR, date, f));
    }
  }
  return files;
}

async function validateFile(path, banks) {
  const errors = [];
  const rel = path.replace(ROOT + "/", "");

  let raw, data;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    return [`${rel}: could not read file (${err.message})`];
  }
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return [`${rel}: invalid JSON (${err.message})`];
  }

  if (!Array.isArray(data.answers)) {
    return [`${rel}: missing or non-array "answers" field`];
  }
  if (data.answers.length !== 10) {
    errors.push(`${rel}: expected 10 answers, found ${data.answers.length}`);
  }

  data.answers.forEach((ans, i) => {
    // display: null is a deliberate, supported "pool slot" pattern (see
    // api/guess.js) used when several tied answers can interchangeably
    // fill any of several remaining slots. Not an error on its own.
    if (ans.display !== null && (typeof ans.display !== "string" || !ans.display.trim())) {
      errors.push(`${rel}: answer[${i}] has an invalid "display" (must be a non-empty string, or null for a pool slot)`);
    }
    if (!Array.isArray(ans.accept) || ans.accept.length === 0) {
      errors.push(`${rel}: answer[${i}] (${ans.display ?? "pool slot"}) missing/empty "accept" array`);
    }
  });

  // Two answers sharing an accept string is only a real bug if their
  // accept lists differ — that means the shared word can't actually
  // tell the two answers apart. If two answers have the *exact same*
  // full accept list, that's the deliberate pool-slot pattern (any of
  // several tied answers is equally valid for either slot) and is fine.
  const sameSet = (a, b) =>
    a.length === b.length && a.every(x => b.includes(x));

  data.answers.forEach((ans, expectedSlot) => {
    (ans.accept || []).forEach(acc => {
      const result = matchGuess(acc, data.answers, new Set());
      if (!result || result.slot === expectedSlot) return;

      const other = data.answers[result.slot];
      if (sameSet(ans.accept, other.accept || [])) return; // legitimate pool

      errors.push(
        `${rel}: accept string "${acc}" for "${ans.display ?? "pool slot"}" resolves to slot ${result.slot} (${other.display ?? "pool slot"}) instead of slot ${expectedSlot} (${ans.display ?? "pool slot"})`
      );
    });
  });

  // Name-bank check: every display name should exist in the matching bank.
  const type = data.type || "players";
  const bank = banks[type];
  if (bank) {
    data.answers.forEach(ans => {
      if (ans.display && !bank.has(ans.display)) {
        errors.push(`${rel}: "${ans.display}" not found in ${BANK_FILES[type]} — no autocomplete suggestion will appear`);
      }
    });
  }

  return errors;
}

async function main() {
  console.log("Validating puzzle archive…\n");

  const banks = await loadBanks();
  const files = await findPuzzleFiles();

  let allErrors = [];
  for (const file of files) {
    const errors = await validateFile(file, banks);
    allErrors.push(...errors);
  }

  console.log(`Checked ${files.length} puzzle files.\n`);

  if (allErrors.length === 0) {
    console.log("All puzzles pass validation.");
    process.exit(0);
  } else {
    console.log(`${allErrors.length} problem(s) found:\n`);
    allErrors.forEach(e => console.log("  " + e));
    process.exit(1);
  }
}

main();
