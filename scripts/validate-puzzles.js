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
 *   4. Every answer's own exact display name, submitted verbatim,
 *      resolves back to its own slot. The dropdown can always surface
 *      the display name itself once it's in the bank (#3) — if clicking
 *      that exact, correctly-spelled suggestion doesn't register, that's
 *      a hard bug (caught "Sir Alex Ferguson" and "Altay Bayındır"
 *      missing themselves from their own accept lists).
 *
 * Also prints (but does not fail the build on) advisory WARNINGS: cases
 * where simulating the real autocomplete dropdown (mirrors
 * getSuggestions() in js/utils.js) turns up a bank entry that, if
 * clicked, wouldn't credit the intended answer — the "Edu Gaspar" bug
 * class, where a puzzle's accept list is narrower than a fuller name
 * variant of the same real player sitting in the shared name bank. This
 * can't be fully automated: a huge shared bank means a bare surname like
 * "hart" will always surface unrelated players (e.g. "Asa Hartford") who
 * happen to share it, and that's expected, not a bug. Warnings need a
 * human to confirm the suggestion is genuinely the *same person* before
 * widening an accept list — treat them as a review queue, not a gate.
 *
 * This is a pure structural check. It cannot verify that answers are
 * factually correct — only that the puzzle behaves correctly given
 * whatever data it contains. Exits non-zero only on hard errors, so it
 * can still gate a commit, a CI run, or a deploy without false-failing
 * on warnings that need human judgment.
 */

import { readdir, readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { matchGuess, norm } from "../lib/match.js";

// Mirror of getSuggestions() in js/utils.js — kept separate for the same
// reason lib/match.js mirrors norm()/matchGuess() rather than importing
// the browser-global utils.js file directly.
function getSuggestions(query, nameBank) {
  const q = norm(query);
  if (q.length < 2) return [];
  const words = q.split(" ").filter(w => w.length > 0);
  return nameBank
    .filter(name => {
      const n = " " + norm(name);
      return words.every(w => n.includes(" " + w));
    })
    .slice(0, 6);
}

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
      const names = JSON.parse(raw);
      banks[type] = { set: new Set(names), array: names };
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
  const warnings = [];
  const rel = path.replace(ROOT + "/", "");

  let raw, data;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    return { errors: [`${rel}: could not read file (${err.message})`], warnings };
  }
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { errors: [`${rel}: invalid JSON (${err.message})`], warnings };
  }

  if (!Array.isArray(data.answers)) {
    return { errors: [`${rel}: missing or non-array "answers" field`], warnings };
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
      if (ans.display && !bank.set.has(ans.display)) {
        errors.push(`${rel}: "${ans.display}" not found in ${BANK_FILES[type]} — no autocomplete suggestion will appear`);
      }
    });
  }

  // Self-match check: an answer's own exact display name must resolve to
  // its own slot. The dropdown can always surface the display name itself
  // once it's in the bank (checked above) — if clicking that exact,
  // correctly-spelled suggestion doesn't register, that's a hard bug
  // regardless of any other accept-string coverage.
  data.answers.forEach((ans, expectedSlot) => {
    if (!ans.display) return;
    const result = matchGuess(ans.display, data.answers, new Set());
    if (!result || result.slot !== expectedSlot) {
      errors.push(
        `${rel}: "${ans.display}"'s own display name does not match its own accept list — selecting it verbatim from the dropdown would fail`
      );
    }
  });

  // Suggestion check (WARNING tier — needs human confirmation): for every
  // accept string, simulate the autocomplete dropdown and flag suggestions
  // that wouldn't credit the intended answer if clicked. Catches the
  // inverse of the name-bank check above — a bank entry that's suggested
  // but rejected (or worse, silently credited elsewhere) because a
  // puzzle's accept list is narrower than the bank entry it's meant to
  // represent.
  //
  // The bank is large enough that a bare surname (e.g. "hart") will always
  // suggest unrelated players who happen to share it (e.g. "Asa Hartford")
  // — that's normal autocomplete noise, not a bug: clicking the wrong
  // player's suggestion is expected to fail. The real bug (the "Edu
  // Gaspar" case) is a suggestion that's a *fuller name of the same
  // person* the answer already represents — i.e. the suggestion contains
  // the answer's whole display name (or vice versa) as a contiguous
  // word-sequence. That narrows it a lot, but common mononyms (Oscar,
  // Fred, Fábio…) still coincidentally prefix-match unrelated bank
  // entries this way, so these stay warnings, not errors, pending a human
  // check that it's really the same player. Suggestions that resolve to a
  // *different, correctly-labeled* answer already in this same puzzle
  // (e.g. "neville" suggesting "Phil Neville" when the intended answer is
  // "Gary Neville") are also a warning, not an error — the dropdown shows
  // both full names distinctly, so picking the wrong one is user error,
  // not a broken suggestion, but it's still worth a human glance.
  const containsWhole = (haystack, needle) =>
    (" " + haystack + " ").includes(" " + needle + " ");

  if (bank) {
    data.answers.forEach((ans, expectedSlot) => {
      if (!ans.display) return; // pool slots have no fixed identity to compare against
      const dn = norm(ans.display);

      (ans.accept || []).forEach(acc => {
        const suggestions = getSuggestions(acc, bank.array);
        suggestions.forEach(sugg => {
          const result = matchGuess(sugg, data.answers, new Set());
          if (result && result.slot === expectedSlot) return; // correct suggestion

          if (!result) {
            const sn = norm(sugg);
            const samePerson = containsWhole(sn, dn) || containsWhole(dn, sn);
            if (samePerson) {
              warnings.push(
                `${rel}: typing "${acc}" (for "${ans.display}") would suggest "${sugg}" from ${BANK_FILES[type]} — looks like the same player under a fuller name, but clicking it would not match`
              );
            }
          } else {
            const other = data.answers[result.slot];
            if (!sameSet(ans.accept, other.accept || [])) {
              warnings.push(
                `${rel}: typing "${acc}" (for "${ans.display}") would suggest "${sugg}" from ${BANK_FILES[type]}, which resolves to slot ${result.slot} (${other.display ?? "pool slot"}) instead`
              );
            }
          }
        });
      });
    });
  }

  return { errors, warnings };
}

async function main() {
  console.log("Validating puzzle archive…\n");

  const banks = await loadBanks();
  const files = await findPuzzleFiles();

  let allErrors = [];
  let allWarnings = [];
  for (const file of files) {
    const { errors, warnings } = await validateFile(file, banks);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }

  console.log(`Checked ${files.length} puzzle files.\n`);

  if (allWarnings.length > 0) {
    console.log(`${allWarnings.length} advisory warning(s) — review, don't auto-fix (may be unrelated players who share a name):\n`);
    allWarnings.forEach(w => console.log("  " + w));
    console.log("");
  }

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
