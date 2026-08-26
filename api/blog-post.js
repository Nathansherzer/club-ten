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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const POSTS = {
  "premier-league-european-goals-records": "2026-08-10",
  "brazilian-players-premier-league":      "2026-08-17",
  "most-expensive-premier-league-transfers": "2026-08-22",
  "dutch-players-premier-league":          "2026-08-26",
  "oldest-premier-league-goalscorers":     "2026-08-31",
  "academy-graduates-premier-league":      "2026-09-03",
  "south-american-players-premier-league": "2026-09-06"
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

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=3600");
  return res.status(200).send(html);
}
