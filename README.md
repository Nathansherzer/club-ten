# Club Ten

A daily top-10 football trivia game, personalised by club.
Each day at midnight London time a new puzzle drops; players have three lives
and can type or autocomplete their answers.

---

## Run locally

You need [Node.js 18+](https://nodejs.org) and the [Vercel CLI](https://vercel.com/docs/cli).

```bash
# Install Vercel CLI (once)
npm install -g vercel

# Start local dev server (simulates the API functions)
npx vercel dev
```

Then open **http://localhost:3000** in your browser.

> **Important:** open `http://localhost:3000` — not the HTML file directly.
> Opening `index.html` as a file skips the local API server, so the puzzle
> won't load. You need the `vercel dev` server running.

---

## Add a new puzzle day (all six clubs)

1. Create a folder named with tomorrow's date:
   ```
   puzzles/YYYY-MM-DD/
   ```

2. Create six JSON files inside it — one per club:
   ```
   arsenal.json
   chelsea.json
   liverpool.json
   manchester-city.json
   manchester-united.json
   tottenham.json
   ```
   Copy `puzzles/TEMPLATE.json` as your starting point.
   The TEMPLATE file contains a full field guide and verification checklist.

3. Fill in the question, note, placeholder, and 10 answers for each club.
   The question template is shared across all six clubs (e.g. "name the last
   10 permanent managers"), but each club's answers differ.

4. Commit and push:
   ```bash
   git add puzzles/YYYY-MM-DD/
   git commit -m "Add puzzle for YYYY-MM-DD"
   git push
   ```
   Vercel deploys automatically within ~30 seconds.

---

## Project structure

```
club-ten/
├── index.html               Main game page
├── about.html
├── contact.html
├── privacy.html
├── how-to-play.html
├── archive.html
│
├── css/
│   └── style.css            Single stylesheet shared by all pages
│
├── js/
│   ├── utils.js             Fuzzy matching (norm, editDist, matchGuess, getSuggestions)
│   └── game.js              All game logic (startup, guesses, stats, share, countdown)
│
├── api/
│   ├── puzzle.js            Vercel function: serves today's puzzle JSON
│   └── archive.js           Vercel function: lists past puzzle dates
│
├── puzzles/
│   ├── TEMPLATE.json        Field guide — copy this when writing new puzzles
│   └── 2026-07-14/
│       ├── arsenal.json
│       ├── chelsea.json
│       ├── liverpool.json
│       ├── manchester-city.json
│       ├── manchester-united.json
│       └── tottenham.json
│
├── data/
│   └── name-bank.json       ~7,000 player/manager names for autocomplete
│
├── scripts/
│   └── build-name-bank.js   One-time script to rebuild name-bank.json
│
├── vercel.json              Vercel configuration
├── package.json
└── README.md
```

---

## Rebuild the name bank

The name bank (`data/name-bank.json`) was generated from Wikipedia's player
category pages for all six clubs. Run this script any time you want a fresh
copy (e.g. after a transfer window):

```bash
node scripts/build-name-bank.js
# or: npm run build-names
```

It takes about 2–3 minutes and requires an internet connection.
No API key needed — it uses Wikipedia's free public API.

---

## Deploy to Vercel

1. Push the repo to GitHub.
2. Go to [vercel.com](https://vercel.com), click "Add New Project", and
   import your GitHub repo.
3. No build settings needed — Vercel detects a static site with API routes
   automatically.
4. Your site is live. Every `git push` auto-deploys.

---

## Adding ads (when approved)

Search `index.html` and `archive.html` for the comment:
```
<!-- AD UNIT: paste AdSense code here when live -->
```

Remove the `display:none` from the parent `.ad-placeholder` div and paste
your `<ins>` AdSense tag inside it.

Also search `privacy.html` for `<!-- TODO: -->` comments — there are two
items to complete before launch (cookie consent banner, real email addresses).

---

## Stats & privacy

All player data (club choice, streak, game history) lives in the player's
browser `localStorage`. Nothing is sent to any server. Clearing site data
in the browser erases everything.

---

## Puzzle accuracy

Each puzzle JSON file includes a `note` field with a season/date cutoff.
Before publishing any puzzle, cross-check every answer against:
- Wikipedia's official list pages
- The club's official website records

If a player reports an error, the `contact.html` page asks them to include
the puzzle date and their source.
