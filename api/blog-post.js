/* ==========================================================
   api/blog-post.js — Vercel serverless function
   URL: GET /blog/:slug  (via vercel.json rewrite)

   Serves blog post HTML from blog-src/ only once its publish
   date has arrived. Posts scheduled for the future 404 — the
   file existing in the repo does not make it reachable.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { renderSnackPage } from "../lib/snack-page.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const POSTS = {
  "scott-parker-spurs-quiz":                  "2026-11-18",
  "arsenal-ten-managers-history":             "2026-11-12",
  "tottenham-manchester-city-penalty-misses": "2026-11-10",
  "premier-league-points-deductions-history": "2026-10-01",
  "premier-league-european-goals-records": "2026-08-10",
  "brazilian-players-premier-league":      "2026-08-17",
  "most-expensive-premier-league-transfers": "2026-08-22",
  "dutch-players-premier-league":          "2026-08-26",
  "oldest-premier-league-goalscorers":     "2026-08-27",
  "academy-graduates-premier-league":      "2026-08-28",
  "south-american-players-premier-league": "2026-08-29",
  "club-captains-premier-league":          "2026-08-30",
  "tallest-outfield-players-premier-league": "2026-08-31",
  "player-of-the-month-premier-league":      "2026-09-01",
  "spurs-tottenham-trivia":                  "2026-09-02",
  "arsenal-trivia":                          "2026-09-03",
  "chelsea-trivia":                          "2026-09-04",
  "liverpool-trivia":                        "2026-09-05",
  "manchester-united-trivia":                "2026-09-06",
  "manchester-city-trivia":                  "2026-09-07"
};

// Mirrors each post's JSON-LD "dateModified" — kept here too so the
// sitemap's <lastmod> can reflect a real edit (e.g. the methodology
// section gaining source links) without re-parsing every post's HTML.
// Equal to the publish date for any post that's never been revised.
export const UPDATED = {
  "scott-parker-spurs-quiz":                  "2026-11-18",
  "arsenal-ten-managers-history":             "2026-11-12",
  "tottenham-manchester-city-penalty-misses": "2026-11-10",
  "premier-league-points-deductions-history": "2026-10-01",
  "premier-league-european-goals-records": "2026-11-10",
  "brazilian-players-premier-league":      "2026-11-10",
  "most-expensive-premier-league-transfers": "2026-11-10",
  "dutch-players-premier-league":          "2026-11-10",
  "oldest-premier-league-goalscorers":     "2026-11-10",
  "academy-graduates-premier-league":      "2026-11-10",
  "south-american-players-premier-league": "2026-11-10",
  "club-captains-premier-league":          "2026-11-10",
  "tallest-outfield-players-premier-league": "2026-08-31",
  "player-of-the-month-premier-league":      "2026-09-01",
  "spurs-tottenham-trivia":                  "2026-09-02",
  "arsenal-trivia":                          "2026-09-03",
  "chelsea-trivia":                          "2026-09-04",
  "liverpool-trivia":                        "2026-09-05",
  "manchester-united-trivia":                "2026-09-06",
  "manchester-city-trivia":                  "2026-09-07"
};

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { slug } = req.query;
  const publishDate = POSTS[slug];

  if (!publishDate || publishDate > londonToday()) {
    return res.status(404).send("Not found.");
  }

  let html;
  try {
    html = await readFile(join(ROOT, "blog-src", `${slug}.html`), "utf-8");
  } catch {
    return res.status(404).send("Not found.");
  }

  // Snack ads + consent: posts in blog-src/ keep the site's standard head tags
  // as their source of truth; Snack's head block is applied here, at serve
  // time, so every current and future post inherits it with no per-post edit.
  // The result is VERIFIED. A post whose head is not recognised is NEVER served
  // on its old tags (old AdSense loader / old consent script / page gtag):
  //   - "safe":    every ad, analytics and consent tag is stripped, so the post
  //                stays readable but loads nothing third-party. Logged as an
  //                error and not cached, so a fix deploys immediately.
  //   - "blocked": even stripping could not make it safe, so it is not served.
  // scripts/check-snack-pages.js fails for any blog-src file that would not
  // get the canonical integration, so this should never happen after deploy.
  const snack = renderSnackPage(html);
  if (snack.status !== "snack") {
    console.error(`[blog-post] SNACK HEAD NOT APPLIED to ${slug} (${snack.status}): ${snack.problems.join("; ")}`);
  }
  if (snack.status === "blocked") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send("Temporarily unavailable.");
  }
  html = snack.html;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    snack.status === "snack" ? "public, max-age=3600, stale-while-revalidate=3600" : "no-store"
  );
  return res.status(200).send(html);
}
