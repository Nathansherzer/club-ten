/* ==========================================================
   api/home-page.js — Vercel serverless function
   URL: GET /  (via vercel.json rewrite)

   The homepage never personalizes to one club server-side — the
   saved club lives only in the visitor's localStorage, and even
   client-side, js/game.js always shows the picker on "/" regardless
   (onHomepage → showPicker(), unconditionally). So instead of one
   question, this renders a small additive section listing all six
   clubs' current question with a link to that club's page. Nothing
   else in index.html is touched — the picker and hidden game shell
   are served exactly as before, so there is no hydration conflict.

   Inserted right after the club-picker buttons, not above them —
   position in the page has no bearing on whether a crawler reads it;
   it's still real server-rendered text in the same response body
   either way. Kept below the picker purely so a first-time visitor
   sees "pick your club" before the day's question list.
   ========================================================== */

import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { VALID_CLUBS, CLUB_NAMES, londonToday, esc, loadPuzzle } from "../lib/puzzle-meta.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).send("Method not allowed");

  const today = londonToday();

  const rows = await Promise.all([...VALID_CLUBS].map(async club => {
    const data = await loadPuzzle(ROOT, club, today);
    return { club, name: CLUB_NAMES[club], question: data ? data.question : null };
  }));

  const listHtml = rows.map(({ club, name, question }) => `
      <li>
        <a href="/${club}">
          <strong>${esc(name)}:</strong>
          ${question ? esc(question) : "today's puzzle is being prepared"}
        </a>
      </li>`).join("");

  const section = `
  <section class="seo-section" id="todaysChallenges">
    <h2>Today's Club Ten challenges</h2>
    <p>A new top-10 question for each club, every day. Pick one to play.</p>
    <ul class="today-challenges-list">${listHtml}
    </ul>
  </section>
`;

  let template;
  try {
    template = await readFile(join(ROOT, "templates", "index.html"), "utf-8");
  } catch {
    return res.status(500).send("Template not found.");
  }

  const anchor = `<p class="picker-hint">10 answers · 3 lives · New puzzle every day</p>\n  </div>`;
  const html = template.replace(anchor, anchor + "\n" + section);

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
}
