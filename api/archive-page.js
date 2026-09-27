/* ==========================================================
   api/archive-page.js — Vercel serverless function
   URL: GET /archive  (via vercel.json rewrite)

   Serves the same interactive archive.html page (club-select
   dropdown, JS-fetched list — untouched, still works exactly as
   before) plus an additive section with real <a href> links to
   every available replay puzzle for all six clubs, each showing
   its puzzle number, date and question — present in the raw HTML
   with no JS required. The destination /{club}/{date} pages stay
   noindex (api/puzzle-page.js, unchanged); this section is for
   navigation and crawlability of *this* page, not for getting
   those pages indexed.
   ========================================================== */

import { readFile, readdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  VALID_CLUBS, CLUB_NAMES,
  londonToday, puzzleNumber, formatDate, capitalize, esc, loadPuzzle
} from "../lib/puzzle-meta.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function recentDates(today) {
  let entries;
  try {
    entries = await readdir(join(ROOT, "puzzles"), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < today)
    .map(e => e.name)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 10);
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const today = londonToday();
  const dates = await recentDates(today);

  const clubSections = await Promise.all([...VALID_CLUBS].map(async club => {
    const items = await Promise.all(dates.map(async date => {
      const data = await loadPuzzle(ROOT, club, date);
      if (!data) return "";
      const num = puzzleNumber(date);
      return `
        <li><a href="/${club}/${date}">Puzzle #${num} &mdash; ${esc(formatDate(date))}: ${esc(capitalize(data.question))}?</a></li>`;
    }));
    const itemsHtml = items.filter(Boolean).join("");
    if (!itemsHtml) return "";
    return `
      <div class="archive-ssr-club">
        <h3>${esc(CLUB_NAMES[club])}</h3>
        <ul>${itemsHtml}
        </ul>
      </div>`;
  }));

  const section = `
  <section class="seo-section" id="archiveAllLinks">
    <h2>All puzzles, by club</h2>
    <p>Every available replay puzzle for each club, newest first.</p>
    ${clubSections.filter(Boolean).join("")}
  </section>
`;

  let template;
  try {
    template = await readFile(join(ROOT, "templates", "archive.html"), "utf-8");
  } catch {
    return res.status(500).send("Template not found.");
  }

  const html = template.replace("</div>\n\n<script>", section + "\n</div>\n\n<script>");

  res.setHeader("Cache-Control", "public, max-age=1800");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
