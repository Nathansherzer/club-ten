/* ==========================================================
   api/sitemap.js — dynamic sitemap generator
   URL: GET /sitemap.xml  (via vercel.json rewrite)

   Auto-includes every past puzzle URL so Google discovers
   new puzzles as soon as the JSON files are deployed.
   ========================================================== */

import { readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "https://topclubten.com";

const CLUBS = [
  "arsenal", "chelsea", "liverpool",
  "manchester-city", "manchester-united", "tottenham"
];

const STATIC = [
  { loc: "/",                              changefreq: "daily",   priority: "1.0" },
  { loc: "/arsenal",                       changefreq: "daily",   priority: "0.9" },
  { loc: "/chelsea",                       changefreq: "daily",   priority: "0.9" },
  { loc: "/liverpool",                     changefreq: "daily",   priority: "0.9" },
  { loc: "/manchester-city",               changefreq: "daily",   priority: "0.9" },
  { loc: "/manchester-united",             changefreq: "daily",   priority: "0.9" },
  { loc: "/tottenham",                     changefreq: "daily",   priority: "0.9" },
  { loc: "/arsenal-football-quiz",         changefreq: "monthly", priority: "0.8" },
  { loc: "/chelsea-football-quiz",         changefreq: "monthly", priority: "0.8" },
  { loc: "/liverpool-football-quiz",       changefreq: "monthly", priority: "0.8" },
  { loc: "/manchester-city-football-quiz", changefreq: "monthly", priority: "0.8" },
  { loc: "/manchester-united-football-quiz", changefreq: "monthly", priority: "0.8" },
  { loc: "/tottenham-football-quiz",       changefreq: "monthly", priority: "0.8" },
  { loc: "/football-top-10-quiz",           changefreq: "monthly", priority: "0.8" },
  { loc: "/how-to-play",                   changefreq: "monthly", priority: "0.5" },
];

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

function urlTag({ loc, changefreq, priority, lastmod }) {
  return [
    "  <url>",
    `    <loc>${BASE}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>"
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  const today = londonToday();

  let puzzleDates = [];
  try {
    const dirs = await readdir(join(ROOT, "puzzles"));
    puzzleDates = dirs
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today)
      .sort();
  } catch {}

  const staticUrls = STATIC.map(p => urlTag(p));

  const puzzleUrls = [];
  for (const date of puzzleDates) {
    for (const club of CLUBS) {
      puzzleUrls.push(urlTag({
        loc:        `/${club}/${date}`,
        lastmod:    date,
        changefreq: "never",
        priority:   "0.6"
      }));
    }
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...puzzleUrls,
    "</urlset>"
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(xml);
}
