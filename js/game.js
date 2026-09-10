/* ==========================================================
   game.js — Club Ten main game logic
   Requires utils.js to be loaded first (norm, getSuggestions).
   ========================================================== */

/* ----------------------------------------------------------
   Constants
   ---------------------------------------------------------- */

const MAX_LIVES = 3;

// Human-readable club names, keyed by the slug used in URLs and localStorage.
const CLUB_NAMES = {
  "arsenal":           "Arsenal",
  "chelsea":           "Chelsea",
  "liverpool":         "Liverpool",
  "manchester-city":   "Man City",
  "manchester-united": "Man United",
  "tottenham":         "Spurs"
};

/* ----------------------------------------------------------
   Game state — reset each time a new puzzle is loaded.
   ---------------------------------------------------------- */

let puzzle   = null;       // metadata from GET /api/puzzle (no answers)
let nameBank = [];         // ~3000+ names for autocomplete
let found    = new Map();  // slot index → { display, detail } for correct guesses
let lives    = MAX_LIVES;
let over     = false;
let guessing = false;      // true while a POST /api/guess fetch is in flight
let countdownTimer = null;

// The club this page's game session belongs to, captured once at init()
// and never re-read from localStorage afterwards. getClub() reads a
// shared key that any other tab can overwrite just by loading a
// different club's page (each one stamps its own club on load) — if
// game logic kept re-reading getClub() live, a club switch in another
// tab could silently redirect this tab's in-progress guesses, reveal,
// and saved state to the wrong club mid-game. Everything below reads
// this constant instead.
let club = null;

// Set when a ?date=YYYY-MM-DD param is present — enables archive play mode.
// In archive mode: stats are not updated, progress is not persisted.
const archiveDate = (() => {
  const d = new URLSearchParams(location.search).get('date');
  return (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
})();

// Set when a ?partner=xxx param is present — see PARTNER EMBED SUPPORT below.
const partner = new URLSearchParams(location.search).get('partner');

// A ?date= pinned to *today* (partner links use this so they survive the
// midnight rollover — api/archive.js never lists today, so a bare partner
// link would otherwise 404 without an explicit date) is a live, current
// play, not a stale replay. Only a date strictly before today is a genuine
// archive play — stats, streak, and analytics should treat "today via a
// pinned link" the same as an ordinary visit.
const isArchivePlay = archiveDate !== null && archiveDate !== londonDateString();

// Keeps ?partner= attached to the puzzle-nav links (<< < > >>) so the
// partner badge/behaviour survives clicking between puzzles.
function withPartner(url) {
  if (!partner) return url;
  return url + (url.includes('?') ? '&' : '?') + `partner=${encodeURIComponent(partner)}`;
}

/* ----------------------------------------------------------
   DOM references — grabbed once at startup.
   ---------------------------------------------------------- */

const pickerEl    = document.getElementById("picker");
const loadingEl   = document.getElementById("loadingMsg");
const errorEl     = document.getElementById("errorMsg");
const gameEl      = document.getElementById("game");
const slotsEl     = document.getElementById("slots");
const input       = document.getElementById("guessInput");
const suggestEl   = document.getElementById("suggest");
const feedbackEl  = document.getElementById("feedback");
const livesEl     = document.getElementById("lives");
const playAreaEl  = document.getElementById("playArea");
const endcardEl   = document.getElementById("endcard");
const adEl        = document.getElementById("adBelowGame");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsBtnEl   = document.getElementById("settingsBtn");

/* ==========================================================
   LOCAL STORAGE HELPERS
   All keys are namespaced "ct_" so they don't clash with
   anything else the browser might store for this domain.
   ========================================================== */

function getClub()       { return localStorage.getItem("ct_club"); }
function setClub(slug)   { localStorage.setItem("ct_club", slug); }

/** Returns "YYYY-MM-DD" in London time — the same date the API uses. */
function londonDateString() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

/**
 * Saved state shape:
 *   {
 *     date:     "YYYY-MM-DD",  // the puzzle this progress belongs to; validated
 *                               // against the freshly-fetched puzzle before restoring
 *     found:    [{ slot, display, detail }, ...],
 *     revealed: [{ slot, display, detail }, ...],  // unfound slots shown at game-over
 *     lives:    number,
 *     over:     boolean,
 *     won:      boolean
 *   }
 */
function getPlayState(club) {
  try {
    return JSON.parse(localStorage.getItem(`ct_play_${londonDateString()}_${club}`)) || null;
  } catch { return null; }
}

function savePlayState(club, state) {
  localStorage.setItem(`ct_play_${londonDateString()}_${club}`, JSON.stringify(state));
}

function getStats(club) {
  try {
    const s = JSON.parse(localStorage.getItem(`ct_stats_${club}`)) ||
              { streak: 0, played: 0, perfect: 0 };
    if (!s.scores) s.scores = new Array(11).fill(0);
    return s;
  } catch {
    return { streak: 0, played: 0, perfect: 0, scores: new Array(11).fill(0) };
  }
}

function saveStats(club, s) {
  localStorage.setItem(`ct_stats_${club}`, JSON.stringify(s));
}

/* ==========================================================
   SETTINGS OVERLAY
   ========================================================== */

document.getElementById("settingsBtn").addEventListener("click", openSettings);
document.getElementById("settingsClose").addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", e => {
  if (e.target === settingsOverlay) closeSettings();
});

function openSettings() {
  const stats = club ? getStats(club) : null;
  const name  = club ? CLUB_NAMES[club] : "none chosen";

  document.getElementById("settingsContent").innerHTML =
    `Your club: <strong>${name}</strong><br>` +
    (stats
      ? `Streak: ${stats.streak} &nbsp;·&nbsp; Played: ${stats.played} &nbsp;·&nbsp; Perfect: ${stats.perfect}<br>`
      : "") +
    `New puzzle: every day at midnight UK time`;

  settingsOverlay.classList.add("open");
}

function closeSettings() {
  settingsOverlay.classList.remove("open");
}

// "Change club" wipes the saved club and reloads — cleanest approach.
document.getElementById("changeClubBtn").addEventListener("click", () => {
  localStorage.removeItem("ct_club");
  location.href = '/';
});

/* ==========================================================
   STARTUP
   ========================================================== */

async function init() {
  // Name bank is loaded after the puzzle so we know its type (players vs clubs).

  // Homepage is a pure club-picker — never auto-load a puzzle there.
  const onHomepage = location.pathname === '/' || location.pathname === '/index.html';
  if (onHomepage) { showPicker(); return; }

  club = getClub();
  if (!club) { showPicker(); return; }

  // Archive mode never restores saved state — each play is fresh.
  const saved = isArchivePlay ? null : getPlayState(club);
  await fetchAndStartPuzzle(club, saved);
}

function showPicker() {
  pickerEl.style.display      = "block";
  loadingEl.style.display     = "none";
  gameEl.style.display        = "none";
  settingsBtnEl.style.display = "none";
}

/* Club picker links/buttons. These are now real <a href> elements for
   crawlability; we still persist the chosen club on click. Anchors
   navigate on their own, so only force navigation for non-anchor controls. */
pickerEl.querySelectorAll(".clubbtn[data-club]").forEach(btn => {
  btn.addEventListener("click", () => {
    setClub(btn.dataset.club);
    if (!btn.getAttribute("href")) {
      location.href = '/' + btn.dataset.club;
    }
  });
});

/* ==========================================================
   NAME BANK
   Loaded after the puzzle so we know its type.
   puzzle.type === "clubs" → /data/club-bank.json
   anything else           → /data/name-bank.json
   The game works without it — autocomplete just stays empty.
   ========================================================== */

async function loadNameBank(type) {
  const url = type === "clubs"         ? "/data/club-bank.json"
            : type === "nationalities" ? "/data/nationality-bank.json"
            : type === "stadiums"      ? "/data/stadium-bank.json"
            :                           "/data/name-bank.json";
  try {
    const res = await fetch(url);
    nameBank  = await res.json();
  } catch {
    /* silent — autocomplete is a nice-to-have */
  }
}

/* ==========================================================
   PUZZLE FETCH + GAME START
   ========================================================== */

async function fetchAndStartPuzzle(club, savedState) {
  pickerEl.style.display  = "none";
  loadingEl.style.display = "block";

  try {
    // Archive requests already carry a fixed date, so their URL is unique
    // and safe to cache. For today's puzzle we append the London date as a
    // cache-buster: the fetch URL then changes at midnight, so the browser
    // can never reuse yesterday's cached response for today regardless of
    // whatever Cache-Control the CDN puts on it. (Vercel overrides the
    // function's own Cache-Control, so this is the reliable guarantee.)
    const dateParam = archiveDate ? `&date=${archiveDate}` : `&d=${londonDateString()}`;
    const res = await fetch(`/api/puzzle?club=${club}${dateParam}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    puzzle = await res.json();
    loadNameBank(puzzle.type); // fire-and-forget; loads club or player bank
  } catch (err) {
    loadingEl.style.display = "none";
    errorEl.textContent = `Could not load puzzle: ${err.message}`;
    errorEl.style.display = "block";
    return;
  }

  loadingEl.style.display = "none";
  buildGameBoard();

  if (isArchivePlay) {
    // The Peoples Person links straight to a specific day's puzzle on
    // purpose — "past puzzle" framing there reads as a mistake, not archive mode.
    if (partner !== "tpp") {
      document.getElementById("archiveBanner").style.display = "block";
    }
    track("archive_play");
  }

  // Defensive guard: a saved state must belong to the puzzle we just
  // fetched. If it doesn't (stale cache, clock skew, any other mismatch
  // between the localStorage key and the actual puzzle loaded), discard
  // it rather than restoring answers from a different day's puzzle into
  // today's slots. Saves written before this field existed have no
  // `date` and are allowed through unchanged.
  if (savedState && savedState.date && savedState.date !== puzzle.date) {
    track("stale_progress_discarded", { saved_date: savedState.date, puzzle_date: puzzle.date });
    savedState = null;
  }

  if (savedState) {
    restoreState(savedState);
  } else {
    track("game_start");
    setFeedback("Find all 10. Three wrong guesses and it's over.");
    input.focus({ preventScroll: true });
  }
}

/* ==========================================================
   BUILD GAME BOARD (DOM setup)
   ========================================================== */

function buildGameBoard() {
  // Status bar
  document.getElementById("puzzleLabel").textContent = `Puzzle #${puzzle.puzzleNumber}`;
  if (isArchivePlay) {
    document.getElementById("streakLabel").textContent = "Archive";
  } else {
    document.getElementById("streakLabel").textContent = `Streak: ${getStats(club).streak}`;
  }
  renderLives();

  // Question
  document.getElementById("clubName").textContent     = puzzle.clubLabel;
  document.getElementById("questionText").textContent = puzzle.question;
  document.getElementById("questionNote").textContent = puzzle.note;
  input.placeholder = puzzle.placeholder;

  // Optional one-off credit line (e.g. thanking a fan who caught an error),
  // shown near the page footer rather than inline with the question.
  const creditEl = document.getElementById("puzzleCredit");
  if (creditEl) {
    if (puzzle.credit) {
      creditEl.textContent = puzzle.credit;
      creditEl.style.display = "block";
    } else {
      creditEl.style.display = "none";
    }
  }

  // Build empty slots from puzzle.total (answers are not in the puzzle response)
  slotsEl.innerHTML = "";
  for (let i = 0; i < puzzle.total; i++) {
    const div = document.createElement("div");
    div.className = "slot";
    div.id        = "slot" + i;
    div.innerHTML = `<span class="num">${i + 1}</span><span class="val"></span><span class="detail"></span>`;
    slotsEl.appendChild(div);
  }

  gameEl.style.display        = "block";
  settingsBtnEl.style.display = "";
  loadPuzzleNav();
}

/* ==========================================================
   PUZZLE NAVIGATION
   Shows < (previous) and << (oldest in window) buttons below
   the game board. Capped at 10 past puzzles so recent puzzles
   can be reused later without appearing in the nav window.
   ========================================================== */

async function loadPuzzleNav() {
  let past;
  try {
    const res  = await fetch('/api/archive');
    const json = await res.json();
    past = (json.puzzles || []).slice(0, 10);
  } catch { return; }

  if (past.length === 0) return;

  const oldest = past[past.length - 1];
  let prevDate  = null; // <
  let firstDate = null; // <<
  let nextHref  = null; // >
  let lastHref  = null; // >>

  // api/archive never includes today (it only lists strictly-past dates),
  // so a link that explicitly pins ?date= to today's puzzle (e.g. partner
  // links, to survive the midnight rollover) needs the same treatment as
  // no date param at all — otherwise it's not found in `past` and the
  // nav silently disappears.
  const isToday = archiveDate && archiveDate > past[0].date;

  if (!archiveDate || isToday) {
    prevDate  = past[0].date;
    firstDate = past.length > 1 ? oldest.date : null;
  } else {
    const idx = past.findIndex(p => p.date === archiveDate);
    if (idx === -1) return;

    // Backward (older)
    if (idx < past.length - 1) {
      prevDate  = past[idx + 1].date;
      firstDate = oldest.date !== prevDate ? oldest.date : null;
    }

    // Forward (newer → today)
    nextHref = idx > 0 ? `/${club}?date=${past[idx - 1].date}` : `/${club}`;
    lastHref = `/${club}`;
    if (nextHref === lastHref) lastHref = null; // already one step from today
  }

  if (!prevDate && !firstDate && !nextHref && !lastHref) return;

  document.getElementById('puzzleNavEl')?.remove();
  const nav = document.createElement('div');
  nav.id        = 'puzzleNavEl';
  nav.className = 'puzzle-nav';

  if (firstDate) nav.appendChild(makeNavBtn(withPartner(`/${club}?date=${firstDate}`), '<<', 'Jump to oldest available puzzle'));
  if (prevDate)  nav.appendChild(makeNavBtn(withPartner(`/${club}?date=${prevDate}`),  '<',  'Go to previous puzzle'));
  if (nextHref)  nav.appendChild(makeNavBtn(withPartner(nextHref),                     '>',  'Go to next puzzle'));
  if (lastHref)  nav.appendChild(makeNavBtn(withPartner(lastHref),                     '>>',  "Back to today's puzzle"));

  const anchor = document.querySelector('.site-nav');
  anchor.before(nav);
}

function makeNavBtn(href, text, tooltip) {
  const a = document.createElement('a');
  a.href            = href;
  a.className       = 'puzzle-nav-btn';
  a.title           = tooltip;
  a.dataset.tooltip = tooltip;
  a.textContent     = text;
  a.addEventListener('click', () => track("puzzle_nav", { direction: text }));
  return a;
}

/* ==========================================================
   GA4 ANALYTICS HELPER
   ========================================================== */

function track(eventName, params = {}) {
  if (typeof gtag !== "function") return;
  // Tag every event with the partner (e.g. "tpp", "arseblog") when the
  // page was opened via a partner link, so engagement can be segmented
  // by referral source in GA4.
  gtag("event", eventName, { club, puzzle_date: puzzle?.date, ...(partner ? { partner } : {}), ...params });
}

// Tags a shared result link so GA4 can attribute clicks back to player shares
// (as opposed to our own posts, which are tagged via utm-links.html).
function shareUrl(method) {
  const params = new URLSearchParams({
    utm_source:   "share",
    utm_medium:   "viral",
    utm_campaign: "result_share",
    utm_content:  method
  });
  return `${location.origin}/${club}?${params.toString()}`;
}

/* ==========================================================
   RESTORE A SAVED GAME STATE
   (player comes back mid-game, or has already finished today)
   ========================================================== */

function restoreState(saved) {
  // Re-hydrate found Map from the saved array of {slot, display, detail}
  found = new Map(saved.found.map(({ slot, display, detail }) => [slot, { display, detail }]));
  lives = saved.lives;
  renderLives();

  for (const [slot, { display, detail }] of found) {
    fillSlot(slot, display, detail, "found");
  }

  if (saved.over) {
    over = true;
    for (const { slot, display, detail } of (saved.revealed || [])) {
      fillSlot(slot, display, detail, "revealed");
    }
    playAreaEl.style.display = "none";
    showEndCard(saved.won);
    adEl.style.display = "block";
  } else {
    setFeedback(`${found.size} found · ${lives} ${lives === 1 ? "life" : "lives"} left. Keep going!`);
    input.focus({ preventScroll: true });
  }
}

/* ==========================================================
   SLOT HELPERS
   ========================================================== */

function fillSlot(i, display, detail, cls) {
  const el = document.getElementById("slot" + i);
  if (!el) return;
  el.classList.add(cls);
  el.querySelector(".val").textContent    = display;
  el.querySelector(".detail").textContent = detail;
}

function renderLives() {
  livesEl.textContent = "❤️".repeat(lives) + "🖤".repeat(MAX_LIVES - lives);
}

/* ==========================================================
   GUESS HANDLING
   Sends the raw guess string to POST /api/guess; the server
   runs fuzzy matching and returns hit/miss + slot data.
   The input is disabled for the round-trip to prevent doubles.
   ========================================================== */

async function handleGuess() {
  if (over || !puzzle || guessing) return;
  const raw = input.value.trim();
  input.value = "";
  hideSuggestions();
  if (!raw) return;

  guessing = true;
  input.disabled = true;
  document.getElementById("guessBtn").disabled = true;

  let result;
  try {
    const res = await fetch("/api/guess", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ club, guess: raw, found: [...found.keys()], date: archiveDate || puzzle.date })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    result = await res.json();
  } catch {
    setFeedback("Connection error — please try again.", "bad");
    guessing = false;
    input.disabled = false;
    document.getElementById("guessBtn").disabled = false;
    input.focus({ preventScroll: true });
    return;
  }

  // Duplicate: skip sweep, give instant feedback
  const isDuplicate = result.hit && found.has(result.slot);
  if (!isDuplicate) {
    // Hit → sweep down to result.slot; Miss → null sweeps all empty slots
    await runSweep(result.hit ? result.slot : null);
  }

  guessing = false;
  input.disabled = false;
  document.getElementById("guessBtn").disabled = false;

  if (found.size === 0 && lives === MAX_LIVES) track("first_guess");

  if (!result.hit) {
    lives--;
    renderLives();
    track("guess_wrong", { guess: raw, lives_remaining: lives });
    setFeedback(
      `"${raw}" — not on the board. ${lives} ${lives === 1 ? "life" : "lives"} left.`,
      "bad"
    );
    if (lives === 0) { await endGame(false); return; }

  } else if (isDuplicate) {
    setFeedback("Already found that one!", "dup");

  } else {
    found.set(result.slot, { display: result.display, detail: result.detail });
    fillSlot(result.slot, result.display, result.detail, "found");
    track("guess_correct", { answer: result.display, score: found.size });
    setFeedback(`✔ ${result.display} — ${found.size}/10`, "good");
    if (found.size === puzzle.total) { await endGame(true); return; }
  }

  if (!over && !isArchivePlay) persistInProgress();
  input.focus({ preventScroll: true });
}

// Sweeps a "scanning" highlight through unfound slots in descending order.
// stopAtSlot: index to stop at (hit), or null to run through all (miss).
function runSweep(stopAtSlot) {
  return new Promise(resolve => {
    const order = [];
    for (let i = puzzle.total - 1; i >= 0; i--) {
      if (!found.has(i)) order.push(i);
      if (stopAtSlot !== null && i === stopAtSlot) break;
    }
    if (order.length === 0) { resolve(); return; }

    let step = 0;
    let activeEl = null;

    function advance() {
      if (activeEl) activeEl.classList.remove("scanning");
      if (step >= order.length) { resolve(); return; }

      const slotIdx = order[step++];
      activeEl = document.getElementById("slot" + slotIdx);
      if (activeEl) activeEl.classList.add("scanning");

      const isTarget = stopAtSlot !== null && slotIdx === stopAtSlot;
      setTimeout(isTarget ? finish : advance, 380);
    }

    function finish() {
      if (activeEl) activeEl.classList.remove("scanning");
      resolve();
    }

    advance();
  });
}

function setFeedback(msg, cls) {
  feedbackEl.textContent = msg;
  feedbackEl.className   = "feedback" + (cls ? " " + cls : "");
}

/* ==========================================================
   END GAME
   ========================================================== */

async function endGame(won) {
  over = true;
  playAreaEl.style.display = "none";

  const revealedArr = await revealUnfound();

  if (!isArchivePlay) {
    const stats = getStats(club);
    stats.played++;
    if (won && lives === MAX_LIVES) stats.perfect++;
    stats.streak++;
    stats.scores[found.size] = (stats.scores[found.size] || 0) + 1;
    saveStats(club, stats);
    const foundArr = [...found].map(([slot, ans]) => ({ slot, ...ans }));
    savePlayState(club, { date: puzzle.date, found: foundArr, revealed: revealedArr, lives, over: true, won });
  }

  if (!isArchivePlay && typeof gtag === "function") {
    gtag("event", "game_complete", {
      club,
      score:        found.size,
      won:          won ? 1 : 0,
      perfect:      (won && lives === MAX_LIVES) ? 1 : 0,
      puzzle_date:  puzzle.date,
      ...(partner ? { partner } : {})
    });
  }

  showEndCard(won);
  if (adEl) adEl.style.display = "block";
  endcardEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function revealUnfound() {
  const unfound = [];
  for (let i = 0; i < puzzle.total; i++) {
    if (!found.has(i)) unfound.push(i);
  }
  if (unfound.length === 0) return [];

  try {
    const dateParam = `&date=${archiveDate || puzzle.date}`;
    const res = await fetch(`/api/reveal?club=${club}${dateParam}`);
    if (!res.ok) return [];
    const data = await res.json();
    return unfound.map(i => {
      const { display, detail } = data.answers[i];
      fillSlot(i, display, detail, "revealed");
      return { slot: i, display, detail };
    });
  } catch {
    unfound.forEach(i => fillSlot(i, "—", "", "revealed"));
    return [];
  }
}

const RIVALS = {
  'arsenal':           { club: 'tottenham',          label: 'Spurs' },
  'chelsea':           { club: 'arsenal',             label: 'Arsenal' },
  'liverpool':         { club: 'manchester-united',   label: 'Man United' },
  'manchester-city':   { club: 'manchester-united',   label: 'Man United' },
  'manchester-united': { club: 'liverpool',           label: 'Liverpool' },
  'tottenham':         { club: 'arsenal',             label: 'Arsenal' }
};

function showEndCard(won) {
  let title;
  if (won && lives === MAX_LIVES) title = "PERFECT GAME 🏆";
  else if (won)                   title = "You got all ten!";
  else if (found.size >= 7)       title = "So close!";
  else                            title = "The board wins today.";

  document.getElementById("endTitle").textContent  = title;
  document.getElementById("scoreline").textContent = `${found.size}/10`;

  if (isArchivePlay) {
    document.getElementById("statsLine").textContent = "Archive play — no stats recorded";
    document.getElementById("countdown").innerHTML =
      '<a href="/archive" style="color:var(--green);text-decoration:none">← Back to archive</a>';
  } else {
    const stats = getStats(club);
    const streakMsg = stats.streak >= 3 ? `🔥 ${stats.streak}-day streak!` : `Streak: ${stats.streak}`;
    document.getElementById("statsLine").textContent =
      `${streakMsg}  ·  Played: ${stats.played}  ·  Perfect: ${stats.perfect}`;
    renderScoreChart(stats.scores);
    startCountdown();
  }

  endcardEl.style.display = "block";
  buildShareRow();

  const rival   = RIVALS[club];
  const rivalEl = document.getElementById("rivalPrompt");
  if (rival && rivalEl && !isArchivePlay) {
    rivalEl.innerHTML = `<a href="/${rival.club}" class="rival-btn" onclick="if(typeof gtag==='function')gtag('event','rival_click',{from_club:'${club}',to_club:'${rival.club}'})">Try today's ${rival.label} puzzle →</a>`;
  }
}

function renderScoreChart(scores) {
  const el = document.getElementById("scoreChart");
  if (!el || !Array.isArray(scores)) return;
  const max = Math.max(...scores, 1);
  const rows = scores.map((count, i) => {
    const pct  = Math.round((count / max) * 100);
    const highlight = i === found.size ? "current" : "";
    return `<div class="sc-row ${highlight}">
      <span class="sc-label">${i}</span>
      <div class="sc-bar-wrap"><div class="sc-bar" style="width:${pct}%"></div></div>
      <span class="sc-count">${count}</span>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="sc-title">Score history</div>${rows}`;
}

function persistInProgress() {
  const foundArr = [...found].map(([slot, ans]) => ({ slot, ...ans }));
  savePlayState(club, { date: puzzle.date, found: foundArr, revealed: [], lives, over: false, won: false });
}

/* ==========================================================
   COUNTDOWN TO NEXT LONDON MIDNIGHT
   ========================================================== */

function getSecondsUntilLondonMidnight() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    })
    .formatToParts(new Date())
    .map(p => [p.type, Number(p.value)])
  );
  const elapsed = parts.hour * 3600 + parts.minute * 60 + parts.second;
  return 86400 - elapsed;
}

function startCountdown() {
  const el = document.getElementById("countdown");

  function tick() {
    const s = getSecondsUntilLondonMidnight();
    if (s <= 0) { location.reload(); return; }
    const h  = Math.floor(s / 3600);
    const m  = Math.floor((s % 3600) / 60);
    const sc = s % 60;
    el.innerHTML =
      `Next puzzle in <strong>${h}h ${String(m).padStart(2, "0")}m ${String(sc).padStart(2, "0")}s</strong>`;
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}

/* ==========================================================
   SHARE BUTTON
   Format: "ClubTen #14 · Arsenal · 8/10\n🟩🟥…\nhttps://…"
   Uses native share sheet on mobile; falls back to clipboard.
   ========================================================== */

// Brand icons for the share row (Simple Icons paths; trademarks belong
// to their owners, used here only to label standard share buttons).
const SHARE_ICONS = {
  x:    '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  wa:   '<svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
  share:'<svg viewBox="0 0 24 24"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>'
};

// Resilient copy: async Clipboard API → execCommand → selectable box.
// The last two fallbacks keep it working inside the partner iframe,
// where clipboard-write is blocked.
function copyResult(text) {
  const note = document.getElementById("sharedNote");
  const flash = (msg) => {
    note.textContent = msg;
    setTimeout(() => { if (note.textContent === msg) note.textContent = ""; }, 2500);
  };
  const legacyCopy = () => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:0;left:0;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };
  const manual = () => {
    note.innerHTML = '<div style="margin-top:8px;font-size:0.8rem">Copy your result:</div>';
    const ta = document.createElement("textarea");
    ta.readOnly = true;
    ta.value = text;
    ta.style.cssText = "width:100%;max-width:340px;height:84px;margin-top:6px;border-radius:8px;padding:8px;font-size:0.8rem";
    note.appendChild(ta);
    ta.focus();
    ta.select();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => flash("Copied to clipboard!"))
      .catch(() => { legacyCopy() ? flash("Copied to clipboard!") : manual(); });
  } else {
    legacyCopy() ? flash("Copied to clipboard!") : manual();
  }
}

// Build the end-card share row (X / WhatsApp / Share). X and WhatsApp
// are plain links (work inside the embed); Share uses the native share
// sheet on mobile and falls back to copying the result on desktop.
function buildShareRow() {
  const endcard = document.getElementById("endcard");
  if (!endcard) return;

  // Retire the older single-share controls in favour of the row.
  const legacyShare = document.getElementById("shareBtn");
  if (legacyShare) legacyShare.style.display = "none";
  const legacyWa = document.getElementById("whatsappBtn");
  if (legacyWa) legacyWa.style.display = "none";

  const clubName = CLUB_NAMES[club] || puzzle.clubShort;
  const squares  = Array.from({ length: puzzle.total }, (_, i) => found.has(i) ? "🟩" : "🟥").join("");
  const line = `I got ${found.size}/10 on today's ${clubName} puzzle. Can you beat me?`;
  const withGrid = (method) => `${line}\n${squares}\n${shareUrl(method)}`;
  const enc = encodeURIComponent;

  let row = document.getElementById("shareRow");
  if (!row) {
    row = document.createElement("div");
    row.id = "shareRow";
    row.className = "share-row";
    const note = document.getElementById("sharedNote");
    endcard.insertBefore(row, note || null);
  }
  row.innerHTML =
    `<a class="sbtn b-x" target="_blank" rel="noopener noreferrer" href="https://twitter.com/intent/tweet?text=${enc(withGrid("x"))}">${SHARE_ICONS.x}X</a>` +
    `<a class="sbtn b-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${enc(withGrid("whatsapp"))}">${SHARE_ICONS.wa}WhatsApp</a>` +
    `<button type="button" class="sbtn b-share" id="shareResultBtn">${SHARE_ICONS.share}Share</button>`;

  row.querySelector(".b-x").addEventListener("click", () => track("share", { score: found.size, method: "x" }));
  row.querySelector(".b-wa").addEventListener("click", () => track("share", { score: found.size, method: "whatsapp" }));
  row.querySelector("#shareResultBtn").addEventListener("click", () => {
    const shareText = withGrid("share");
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (navigator.share && isMobile) {
      track("share", { score: found.size, method: "native" });
      navigator.share({ text: shareText }).catch(err => {
        if (err && err.name === "AbortError") return; // user cancelled
        copyResult(shareText);
      });
    } else {
      track("share", { score: found.size, method: "copy" });
      copyResult(shareText);
    }
  });
}

/* ==========================================================
   AUTOCOMPLETE
   ========================================================== */

input.addEventListener("input", renderSuggestions);
input.addEventListener("keydown", e => {
  if (e.key === "Enter")  handleGuess();
  if (e.key === "Escape") hideSuggestions();
  // Arrow-key navigation inside the dropdown
  if (e.key === "ArrowDown" || e.key === "ArrowUp") navigateSuggestions(e);
});

document.getElementById("guessBtn").addEventListener("click", handleGuess);

// Give up — requires a second click ("Really give up?") within 3s to
// avoid ending the puzzle on a misclick.
const giveUpBtn = document.getElementById("giveUpBtn");
if (giveUpBtn) {
  let giveUpTimer = null;
  giveUpBtn.addEventListener("click", () => {
    if (over || !puzzle || guessing) return;

    if (giveUpBtn.classList.contains("confirm")) {
      clearTimeout(giveUpTimer);
      track("give_up", { score: found.size, lives_remaining: lives });
      endGame(false);
      return;
    }

    giveUpBtn.classList.add("confirm");
    giveUpBtn.textContent = "Really give up?";
    giveUpTimer = setTimeout(() => {
      giveUpBtn.classList.remove("confirm");
      giveUpBtn.textContent = "Give up";
    }, 3000);
  });
}

// Close dropdown when clicking outside the input area
document.addEventListener("click", e => {
  if (!e.target.closest(".inputwrap")) hideSuggestions();
});

function renderSuggestions() {
  if (over) { hideSuggestions(); return; }
  const items = getSuggestions(input.value, nameBank);
  if (items.length === 0) { hideSuggestions(); return; }

  suggestEl.innerHTML = "";
  items.forEach((name, i) => {
    const btn = document.createElement("button");
    btn.type        = "button";
    btn.textContent = name;
    btn.setAttribute("role", "option");
    btn.dataset.idx = i;
    // Tapping a suggestion submits it immediately — same rules as typed guesses.
    // A wrong suggestion still costs a life.
    btn.addEventListener("mousedown", e => {
      e.preventDefault(); // keep input focused
      input.value = name;
      hideSuggestions();
      handleGuess();
    });
    suggestEl.appendChild(btn);
  });
  suggestEl.style.display = "block";
}

function hideSuggestions() {
  suggestEl.style.display = "none";
  suggestEl.innerHTML     = "";
}

function navigateSuggestions(e) {
  const btns = [...suggestEl.querySelectorAll("button")];
  if (btns.length === 0) return;
  e.preventDefault();
  const active = suggestEl.querySelector("button.active");
  const idx    = active ? btns.indexOf(active) : -1;
  btns.forEach(b => b.classList.remove("active"));
  let next = e.key === "ArrowDown" ? idx + 1 : idx - 1;
  if (next >= btns.length) next = 0;
  if (next < 0)            next = btns.length - 1;
  btns[next].classList.add("active");
  input.value = btns[next].textContent;
}

/* ==========================================================
   MOBILE KEYBOARD — keep the input visible
   When the mobile keyboard opens, the visible viewport shrinks.
   We scroll the input into view so it doesn't hide behind the keyboard.
   ========================================================== */

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (document.activeElement === input) {
      input.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  });
}

/* ==========================================================
   PARTNER EMBED SUPPORT
   When loaded with ?partner=tpp, inject a "Powered by" badge
   above the site-nav and open nav links in new tabs so they
   don't navigate away from the host page.
   ========================================================== */

(function () {
  // When running inside an iframe, disable scroll restoration and
  // force the page to start at the top — browsers can otherwise
  // resume a stale scroll position from a previous visit.
  if (window.self !== window.top) {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
  }

  const partners = {
    tpp: {
      label:  'The Peoples Person',
      url:    'https://thepeoplesperson.com',
      color:  '#e74c3c',
      border: '#c0392b',
      html: (url, label) =>
        `Powered by <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#e74c3c;font-weight:600">${label}</a>`
    },
    arseblog: {
      label:  'Arseblog',
      url:    'https://arseblog.com',
      color:  '#EF0107',
      border: '#EF0107',
      html: (url, label) =>
        `In partnership with <a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#EF0107;font-weight:600">${label}</a>`
    },
    cityxtra: {
      url:    'https://cityxtra.co.uk',
      border: '#6CADDF',
      html: (url) => `
        <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
          <span style="color:#6CADDF;font-size:0.7rem;font-weight:600;letter-spacing:0.03em;text-transform:uppercase">In Partnership With</span>
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none">
            <img src="https://cdn.cityxtra.co.uk/wp-content/uploads/2022/12/logoCX-200x60px-1@2x.png"
                 onerror="this.style.display='none'"
                 alt="City Xtra" style="height:30px;width:auto;display:block;filter:brightness(0) saturate(100%) invert(68%) sepia(29%) saturate(573%) hue-rotate(172deg) brightness(1.1)">
          </a>
        </div>`
    }
  };

  const config = partners[partner];
  if (!config) return;

  // Badge — placed just below the header
  const badge = document.createElement('div');
  badge.className = `partner-badge visible${partner === 'cityxtra' ? ' partner-cityxtra' : ''}`;
  badge.style.borderColor = config.border;
  if (partner === 'cityxtra') badge.style.padding = '10px 16px';
  badge.innerHTML = config.html(config.url, config.label);
  const header = document.querySelector('header');
  if (header) header.after(badge);

  // Open site-nav links in new tab so host page stays intact
  document.querySelectorAll('.site-nav a').forEach(a => {
    a.target = '_blank';
    a.rel    = 'noopener noreferrer';
  });
})();

/* ==========================================================
   BOOT
   ========================================================== */

init();
