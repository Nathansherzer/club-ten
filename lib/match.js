/* ==========================================================
   lib/match.js — shared server-side guess matching
   Imported by api/guess.js.  Mirror of the browser-side
   logic in js/utils.js; kept separate so the API bundle
   stays self-contained and utils.js can remain a plain
   browser global script.
   ========================================================== */

export function norm(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")  // strip detached accent marks
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/ß/g, "ss")
    .replace(/đ/g, "d")
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function editDist(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 99;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = curr;
  }
  return prev[n];
}

/** Returns { slot, matched } where slot is the 0-based slot index and matched is the
 *  accept entry that triggered the hit (used to derive display for pool slots).
 *  Returns null on no match.
 *  skip: Set of slot indices already filled — bypassed so tied slots resolve correctly. */
export function matchGuess(guess, answers, skip = new Set()) {
  const g = norm(guess);
  if (g.length < 2) return null;
  for (let i = 0; i < answers.length; i++) {
    if (skip.has(i)) continue;
    for (const acc of answers[i].accept) {
      const a = norm(acc);
      if (g === a) return { slot: i, matched: acc };
      if (a.length > 4 && editDist(g, a) <= 1) return { slot: i, matched: acc };
    }
  }
  return null;
}
