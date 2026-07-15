/**
 * build-name-bank.js — one-time script to generate /data/name-bank.json
 *
 * Run with:  node scripts/build-name-bank.js
 *            (or: npm run build-names)
 *
 * What it does:
 *   1. Calls Wikipedia's free API to list every page in the "players" and
 *      "managers" categories for each of the six clubs.
 *   2. Strips the club name and "(footballer)" suffixes so we get clean names.
 *   3. Deduplicates across all clubs (some players switched clubs).
 *   4. Saves the result to /data/name-bank.json as a plain JSON array.
 *
 * Why Wikipedia categories?
 *   - No API key or sign-up required.
 *   - Returns ALL players and managers ever associated with a club,
 *     which is ideal for a decoy name bank (more names = less obvious).
 *   - API-Football's free tier would work too but caps at 100 requests/day
 *     and requires account registration — not worth it for a one-time build.
 *
 * Expected output: 3,000–6,000 unique names, stored with accents preserved.
 */

import { writeFile, mkdir } from "fs/promises";
import { join, dirname }    from "path";
import { fileURLToPath }    from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";

// Wikipedia category names for each club.
// "Players" categories have hundreds of entries; "managers" add a handful more.
const CATEGORIES = [
  "Category:Arsenal F.C. players",
  "Category:Arsenal F.C. managers",
  "Category:Chelsea F.C. players",
  "Category:Chelsea F.C. managers",
  "Category:Liverpool F.C. players",
  "Category:Liverpool F.C. managers",
  "Category:Manchester City F.C. players",
  "Category:Manchester City F.C. managers",
  "Category:Manchester United F.C. players",
  "Category:Manchester United F.C. managers",
  "Category:Tottenham Hotspur F.C. players",
  "Category:Tottenham Hotspur F.C. managers",
];

// Patterns to strip from Wikipedia page titles to get clean display names.
// e.g. "Ian Rush (footballer)" → "Ian Rush"
//      "Kevin Keegan (born 1951)" → "Kevin Keegan"
const STRIP_PATTERNS = [
  / \(footballer(?: born \d+)?\)$/i,
  / \(born \d+\)$/,
  / \(manager\)$/i,
  / \(English footballer\)$/i,
  / \(Welsh footballer\)$/i,
  / \(Scottish footballer\)$/i,
  / \(Irish footballer\)$/i,
  / \(American footballer\)$/i,
  / \(Australian footballer\)$/i,
];

/**
 * Fetch one page of category members from Wikipedia.
 * Returns { names: string[], continueToken: string|null }
 */
async function fetchCategoryPage(category, continueToken = null) {
  const params = new URLSearchParams({
    action:   "query",
    list:     "categorymembers",
    cmtitle:  category,
    cmtype:   "page",
    cmlimit:  "500",
    format:   "json",
    origin:   "*",
  });
  if (continueToken) params.set("cmcontinue", continueToken);

  const url  = `${WIKIPEDIA_API}?${params}`;
  const res  = await fetch(url, { headers: { "User-Agent": "ClubTenNameBank/1.0 (contact@clubten.app)" } });
  const json = await res.json();

  const names  = (json.query?.categorymembers || []).map(m => m.title);
  const cont   = json.continue?.cmcontinue || null;
  return { names, cont };
}

/**
 * Fetch ALL members of a category, following the `continue` token
 * until Wikipedia says there are no more pages.
 */
async function fetchAllCategoryMembers(category) {
  const all   = [];
  let cont    = null;
  let page    = 0;

  do {
    const { names, cont: nextCont } = await fetchCategoryPage(category, cont);
    all.push(...names);
    cont = nextCont;
    page++;
    process.stdout.write(`\r  ${category}: ${all.length} names (page ${page})   `);
    // Be polite — don't hammer Wikipedia's servers.
    if (cont) await sleep(300);
  } while (cont);

  console.log(); // newline after the progress indicator
  return all;
}

/** Clean a Wikipedia page title into a display name. */
function cleanName(title) {
  // All Wikipedia disambiguation text sits in parentheses at the end of the title.
  // Strip anything in (…) at the end — it's never part of the real name.
  return title.replace(/\s*\(.*?\)\s*$/, "").trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Building name bank from Wikipedia category pages…\n");

  const rawNames = new Set();

  for (const category of CATEGORIES) {
    console.log(`Fetching: ${category}`);
    try {
      const members = await fetchAllCategoryMembers(category);
      members.forEach(title => {
        const clean = cleanName(title);
        // Skip very short results, disambiguation pages, and list pages.
        if (clean.length > 3 && !clean.startsWith("List of")) {
          rawNames.add(clean);
        }
      });
    } catch (err) {
      console.warn(`  Warning: could not fetch ${category}: ${err.message}`);
    }
  }

  const sorted = [...rawNames].sort((a, b) => a.localeCompare(b));

  console.log(`\nTotal unique names: ${sorted.length}`);

  await mkdir(join(ROOT, "data"), { recursive: true });
  await writeFile(
    join(ROOT, "data", "name-bank.json"),
    JSON.stringify(sorted, null, 2),
    "utf-8"
  );

  console.log(`Saved to data/name-bank.json`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
