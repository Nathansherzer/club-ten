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

// Set when a ?date=YYYY-MM-DD param is present — enables archive play mode.
// In archive mode: stats are not updated, progress is not persisted.
const archiveDate = (() => {
  const d = new URLSearchParams(location.search).get('date');
  return (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) ? d : null;
})();

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
    return JSON.parse(localStorage.getItem(`ct_stats_${club}`)) ||
           { streak: 0, played: 0, perfect: 0 };
  } catch {
    return { streak: 0, played: 0, perfect: 0 };
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
  const club  = getClub();
  const stats = club ? getStats(club) : null;
  const name  = club ? CLUB_NAMES[club] : "none chosen";

  document.getElementById("settingsContent").innerHTML =
    `Your club: <strong>${name}</strong><br>` +
    (stats
      ? `Streak: ${stats.streak} &nbsp;·&nbsp; Played: ${stats.played} &nbsp;·&nbsp; Perfect: ${stats.perfect}`
      : "");

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
  loadNameBank();

  // Homepage is a pure club-picker — never auto-load a puzzle there.
  const onHomepage = location.pathname === '/' || location.pathname === '/index.html';
  if (onHomepage) { showPicker(); return; }

  const club = getClub();
  if (!club) { showPicker(); return; }

  // Archive mode never restores saved state — each play is fresh.
  const saved = archiveDate ? null : getPlayState(club);
  await fetchAndStartPuzzle(club, saved);
}

function showPicker() {
  pickerEl.style.display      = "block";
  loadingEl.style.display     = "none";
  gameEl.style.display        = "none";
  settingsBtnEl.style.display = "none";
}

/* Club picker buttons */
pickerEl.querySelectorAll(".clubbtn[data-club]").forEach(btn => {
  btn.addEventListener("click", () => {
    setClub(btn.dataset.club);
    location.href = '/' + btn.dataset.club;
  });
});

/* ==========================================================
   NAME BANK
   Loaded once from /data/name-bank.json.
   A large list of player/manager names used for autocomplete.
   The game works without it — autocomplete just stays empty.
   ========================================================== */

async function loadNameBank() {
  try {
    const res  = await fetch("/data/name-bank.json");
    nameBank   = await res.json();
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
    const dateParam = archiveDate ? `&date=${archiveDate}` : '';
    const res = await fetch(`/api/puzzle?club=${club}${dateParam}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    puzzle = await res.json();
  } catch (err) {
    loadingEl.style.display = "none";
    errorEl.textContent = `Could not load puzzle: ${err.message}`;
    errorEl.style.display = "block";
    return;
  }

  loadingEl.style.display = "none";
  buildGameBoard();

  if (archiveDate) {
    document.getElementById("archiveBanner").style.display = "block";
  }

  if (savedState) {
    restoreState(savedState);
  } else {
    setFeedback("Find all 10. Three wrong guesses and it's over.");
    input.focus();
  }
}

/* ==========================================================
   BUILD GAME BOARD (DOM setup)
   ========================================================== */

function buildGameBoard() {
  // Status bar
  document.getElementById("puzzleLabel").textContent = `Puzzle #${puzzle.puzzleNumber}`;
  if (archiveDate) {
    document.getElementById("streakLabel").textContent = "Archive";
  } else {
    document.getElementById("streakLabel").textContent = `Streak: ${getStats(getClub()).streak}`;
  }
  renderLives();

  // Question
  document.getElementById("clubName").textContent     = puzzle.clubLabel;
  document.getElementById("questionText").textContent = puzzle.question;
  document.getElementById("questionNote").textContent = puzzle.note;
  input.placeholder = puzzle.placeholder;

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
    past = (json.puzzles || []).slice(0, 10); // newest-first, max 10
  } catch { return; }

  if (past.length === 0) return;

  const club   = getClub();
  const oldest = past[past.length - 1];
  let prevDate  = null; // <
  let firstDate = null; // <<
  let nextHref  = null; // >
  let lastHref  = null; // >>

  if (!archiveDate) {
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

  if (firstDate) nav.appendChild(makeNavBtn(`/${club}?date=${firstDate}`, '<<', 'Jump to oldest available puzzle'));
  if (prevDate)  nav.appendChild(makeNavBtn(`/${club}?date=${prevDate}`,  '<',  'Go to previous puzzle'));
  if (nextHref)  nav.appendChild(makeNavBtn(nextHref,                     '>',  'Go to next puzzle'));
  if (lastHref)  nav.appendChild(makeNavBtn(lastHref,                     '>>',  "Back to today's puzzle"));

  document.querySelector('.site-nav').before(nav);
}

function makeNavBtn(href, text, tooltip) {
  const a = document.createElement('a');
  a.href            = href;
  a.className       = 'puzzle-nav-btn';
  a.title           = tooltip;
  a.dataset.tooltip = tooltip;
  a.textContent     = text;
  return a;
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
    input.focus();
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
      body:    JSON.stringify({ club: getClub(), guess: raw, ...(archiveDate ? { date: archiveDate } : {}) })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    result = await res.json();
  } catch {
    setFeedback("Connection error — please try again.", "bad");
    guessing = false;
    input.disabled = false;
    document.getElementById("guessBtn").disabled = false;
    input.focus();
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

  if (!result.hit) {
    lives--;
    renderLives();
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
    setFeedback(`✔ ${result.display} — ${found.size}/10`, "good");
    if (found.size === puzzle.total) { await endGame(true); return; }
  }

  if (!over && !archiveDate) persistInProgress();
  input.focus();
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

  if (!archiveDate) {
    const club  = getClub();
    const stats = getStats(club);
    stats.played++;
    if (won && lives === MAX_LIVES) stats.perfect++;
    stats.streak = found.size >= 5 ? stats.streak + 1 : 0;
    saveStats(club, stats);
    const foundArr = [...found].map(([slot, ans]) => ({ slot, ...ans }));
    savePlayState(club, { found: foundArr, revealed: revealedArr, lives, over: true, won });
  }

  showEndCard(won);
  adEl.style.display = "block";
}

async function revealUnfound() {
  const unfound = [];
  for (let i = 0; i < puzzle.total; i++) {
    if (!found.has(i)) unfound.push(i);
  }
  if (unfound.length === 0) return [];

  try {
    const dateParam = archiveDate ? `&date=${archiveDate}` : '';
    const res = await fetch(`/api/reveal?club=${getClub()}${dateParam}`);
    if (!res.ok) return [];
    const data = await res.json();
    return unfound.map(i => {
      const { display, detail } = data.answers[i];
      fillSlot(i, display, detail, "revealed");
      return { slot: i, display, detail };
    });
  } catch {
    return []; // silent — unfound slots stay blank if network fails
  }
}

function showEndCard(won) {
  let title;
  if (won && lives === MAX_LIVES) title = "PERFECT GAME 🏆";
  else if (won)                   title = "You got all ten!";
  else if (found.size >= 7)       title = "So close!";
  else                            title = "The board wins today.";

  document.getElementById("endTitle").textContent  = title;
  document.getElementById("scoreline").textContent = `${found.size}/10`;

  if (archiveDate) {
    document.getElementById("statsLine").textContent = "Archive play — no stats recorded";
    document.getElementById("countdown").innerHTML =
      '<a href="/archive" style="color:var(--green);text-decoration:none">← Back to archive</a>';
  } else {
    const stats = getStats(getClub());
    document.getElementById("statsLine").textContent =
      `Streak: ${stats.streak}  ·  Played: ${stats.played}  ·  Perfect: ${stats.perfect}`;
    startCountdown();
  }

  endcardEl.style.display = "block";
}

function persistInProgress() {
  const foundArr = [...found].map(([slot, ans]) => ({ slot, ...ans }));
  savePlayState(getClub(), { found: foundArr, revealed: [], lives, over: false, won: false });
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

document.getElementById("shareBtn").addEventListener("click", () => {
  const clubName = CLUB_NAMES[getClub()] || puzzle.clubShort;
  const squares  = Array.from({ length: puzzle.total }, (_, i) => found.has(i) ? "🟩" : "🟥").join("");
  const url      = location.origin;
  const text     = `ClubTen #${puzzle.puzzleNumber} · ${clubName} · ${found.size}/10\n${squares}\n${url}`;

  const note = document.getElementById("sharedNote");
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (navigator.share && isMobile) {
    navigator.share({ text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => {
      note.textContent = "Copied to clipboard!";
      setTimeout(() => { note.textContent = ""; }, 2500);
    });
  }
});

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
   BOOT
   ========================================================== */

init();
