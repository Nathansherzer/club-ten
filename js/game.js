/* ==========================================================
   game.js — Club Ten main game logic
   Requires utils.js to be loaded first (norm, matchGuess, getSuggestions).
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
   Game state — these variables are reset each time a new
   puzzle is loaded.
   ---------------------------------------------------------- */

let puzzle   = null;       // puzzle object fetched from /api/puzzle
let nameBank = [];         // list of ~3000+ names for autocomplete
let found    = new Set();  // indices of correctly guessed answers
let lives    = MAX_LIVES;
let over     = false;
let countdownTimer = null; // setInterval handle for the countdown clock

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

/** Returns the saved in-progress or completed game for (today, club), or null. */
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
  location.reload();
});

/* ==========================================================
   STARTUP
   ========================================================== */

async function init() {
  // Load the name bank quietly in the background.
  // If it fails, autocomplete just won't show — the game still works.
  loadNameBank();

  const club = getClub();

  if (!club) {
    showPicker();
    return;
  }

  // Has the player already played today? Restore that state.
  const saved = getPlayState(club);
  await fetchAndStartPuzzle(club, saved);
}

function showPicker() {
  pickerEl.style.display  = "block";
  loadingEl.style.display = "none";
  gameEl.style.display    = "none";
}

/* Club picker buttons */
pickerEl.querySelectorAll(".clubbtn[data-club]").forEach(btn => {
  btn.addEventListener("click", () => {
    setClub(btn.dataset.club);
    location.reload();
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
    const res = await fetch(`/api/puzzle?club=${club}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }
    puzzle = await res.json();
  } catch (err) {
    loadingEl.style.display = "none";
    errorEl.textContent = `Could not load today's puzzle: ${err.message}`;
    errorEl.style.display = "block";
    return;
  }

  loadingEl.style.display = "none";
  buildGameBoard();

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
  const club  = getClub();
  const stats = getStats(club);

  // Status bar
  document.getElementById("puzzleLabel").textContent = `Puzzle #${puzzle.puzzleNumber}`;
  document.getElementById("streakLabel").textContent = `Streak: ${stats.streak}`;
  renderLives();

  // Question
  document.getElementById("clubName").textContent    = puzzle.clubLabel;
  document.getElementById("questionText").textContent = puzzle.question;
  document.getElementById("questionNote").textContent = puzzle.note;
  input.placeholder = puzzle.placeholder;

  // 10 empty slots
  slotsEl.innerHTML = "";
  puzzle.answers.forEach((_, i) => {
    const div = document.createElement("div");
    div.className = "slot";
    div.id        = "slot" + i;
    div.innerHTML = `<span class="num">${i + 1}</span><span class="val"></span><span class="detail"></span>`;
    slotsEl.appendChild(div);
  });

  gameEl.style.display = "block";
}

/* ==========================================================
   RESTORE A SAVED GAME STATE
   (player comes back mid-game, or has already finished today)
   ========================================================== */

function restoreState(saved) {
  found = new Set(saved.found);
  lives = saved.lives;
  renderLives();

  // Re-fill slots that were already found or revealed
  for (const idx of found) fillSlot(idx, "found");

  if (saved.over) {
    over = true;
    puzzle.answers.forEach((_, i) => { if (!found.has(i)) fillSlot(i, "revealed"); });
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

function fillSlot(i, cls) {
  const el = document.getElementById("slot" + i);
  if (!el) return;
  el.classList.add(cls);
  el.querySelector(".val").textContent    = puzzle.answers[i].display;
  el.querySelector(".detail").textContent = puzzle.answers[i].detail;
}

function renderLives() {
  livesEl.textContent = "❤️".repeat(lives) + "🖤".repeat(MAX_LIVES - lives);
}

/* ==========================================================
   GUESS HANDLING
   ========================================================== */

function handleGuess() {
  if (over || !puzzle) return;
  const raw = input.value.trim();
  input.value = "";
  hideSuggestions();
  if (!raw) return;

  const idx = matchGuess(raw, puzzle.answers);

  if (idx === -1) {
    // Wrong guess
    lives--;
    renderLives();
    setFeedback(
      `"${raw}" — not on the board. ${lives} ${lives === 1 ? "life" : "lives"} left.`,
      "bad"
    );
    if (lives === 0) endGame(false);

  } else if (found.has(idx)) {
    setFeedback("Already found that one!", "dup");

  } else {
    found.add(idx);
    fillSlot(idx, "found");
    setFeedback(`✔ ${puzzle.answers[idx].display} — ${found.size}/10`, "good");
    if (found.size === 10) endGame(true);
  }

  if (!over) persistInProgress();
  input.focus();
}

function setFeedback(msg, cls) {
  feedbackEl.textContent = msg;
  feedbackEl.className   = "feedback" + (cls ? " " + cls : "");
}

/* ==========================================================
   END GAME
   ========================================================== */

function endGame(won) {
  over = true;
  playAreaEl.style.display = "none";

  // Reveal any unfound answers
  puzzle.answers.forEach((_, i) => { if (!found.has(i)) fillSlot(i, "revealed"); });

  // Update stats
  const club  = getClub();
  const stats = getStats(club);
  stats.played++;
  if (won && lives === MAX_LIVES) stats.perfect++;
  // Streak continues only if the player found at least 5 answers.
  stats.streak = found.size >= 5 ? stats.streak + 1 : 0;
  saveStats(club, stats);

  // Persist final state so the same result is shown if they reload
  savePlayState(club, { found: Array.from(found), lives, over: true, won });

  showEndCard(won);
  adEl.style.display = "block";
}

function showEndCard(won) {
  const club  = getClub();
  const stats = getStats(club);

  let title;
  if (won && lives === MAX_LIVES) title = "PERFECT GAME 🏆";
  else if (won)                   title = "You got all ten!";
  else if (found.size >= 7)       title = "So close!";
  else                            title = "The board wins today.";

  document.getElementById("endTitle").textContent  = title;
  document.getElementById("scoreline").textContent = `${found.size}/10`;
  document.getElementById("statsLine").textContent =
    `Streak: ${stats.streak}  ·  Played: ${stats.played}  ·  Perfect: ${stats.perfect}`;

  startCountdown();
  endcardEl.style.display = "block";
}

function persistInProgress() {
  savePlayState(getClub(), { found: Array.from(found), lives, over: false, won: false });
}

/* ==========================================================
   COUNTDOWN TO NEXT LONDON MIDNIGHT
   ========================================================== */

function getSecondsUntilLondonMidnight() {
  // Ask the browser for the current time broken down into London-timezone
  // hour / minute / second components using the Intl API.
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
  const squares  = puzzle.answers.map((_, i) => found.has(i) ? "🟩" : "🟥").join("");
  const url      = location.origin;
  const text     = `ClubTen #${puzzle.puzzleNumber} · ${clubName} · ${found.size}/10\n${squares}\n${url}`;

  const note = document.getElementById("sharedNote");
  if (navigator.share) {
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
