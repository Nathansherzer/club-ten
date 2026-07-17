/* ==========================================================
   utils.js — text normalisation and fuzzy matching
   Loaded as a plain <script> before game.js.
   All functions are global (no import/export needed here).
   ========================================================== */

/**
 * norm(s) converts any name to plain lowercase ASCII for comparison.
 *
 * Examples:
 *   "Solskjær"  → "solskjaer"
 *   "Agüero"    → "aguero"
 *   "Özil"      → "ozil"
 *   "van Dijk"  → "van dijk"
 *
 * How it works:
 *   1. .normalize("NFD") splits accented letters into base + accent mark
 *      (e.g. é → e + ´).
 *   2. The regex strips the loose accent marks that were just detached.
 *   3. Manual replacements handle ligatures the NFD step misses (æ, ø, ß).
 *   4. Everything that isn't a letter, digit, or space is removed.
 *   5. Multiple spaces are collapsed and the result is trimmed.
 */
function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")   // strip detached accent marks
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * editDist(a, b) counts the minimum number of single-character changes
 * (insertions, deletions, substitutions) needed to turn string a into b.
 * Returns 99 immediately if the lengths differ by more than 1 — that's
 * always more than 1 edit, so we don't need to compute the full table.
 *
 * We use this to forgive exactly one typo (e.g. "Solskjaeer" → accepted).
 */
function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 99;
  const m = a.length, n = b.length;
  // We only need the previous and current rows, not the full matrix.
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,                              // deletion
        curr[j - 1] + 1,                          // insertion
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1) // substitution
      );
    }
    prev = curr;
  }
  return prev[n];
}

/**
 * matchGuess(guess, answers) returns the 0-based index of the answer the
 * guess matches, or -1 if nothing matches.
 *
 * Rules:
 *  - The guess is normalised before comparison.
 *  - Every accepted spelling in the answer's `accept` array is tried.
 *  - An exact normalised match always wins.
 *  - If no exact match, a 1-edit-distance match is accepted (but only
 *    for accepted strings longer than 4 chars, to avoid "a" matching "b").
 */
function matchGuess(guess, answers) {
  const g = norm(guess);
  if (g.length < 2) return -1;

  for (let i = 0; i < answers.length; i++) {
    for (const acc of answers[i].accept) {
      const a = norm(acc);
      if (g === a) return i;
      if (a.length > 4 && editDist(g, a) <= 1) return i;
    }
  }
  return -1;
}

/**
 * getSuggestions(query, nameBank) returns up to 6 names from the bank
 * where the query matches the start of any word in the name.
 *
 * Examples:
 *   "sal" → matches "Mohamed Salah" (word "salah" starts with "sal")
 *   "van" → matches "Louis van Gaal", "Robin van Persie", "Virgil van Dijk"
 *   "sol" → matches "Ole Gunnar Solskjaer", "Graeme Souness (no — "sou"≠"sol")
 *
 * The filter is case/accent-insensitive because both sides go through norm().
 */
function getSuggestions(query, nameBank) {
  const q = norm(query);
  if (q.length < 2) return [];
  return nameBank
    .filter(name => (" " + norm(name)).includes(" " + q))
    .slice(0, 6);
}
