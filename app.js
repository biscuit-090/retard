const API_URL = "https://data-api.polymarket.com/trades?limit=1000";
const MIN_SIZE = 50_000;
const REFRESH_INTERVAL = 10; // seconds
const HISTORY_TTL = 24 * 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = "polymarket_large_trades";

// what is this audio blessing my ears
const AUDIO_MIN = new Audio("ping.mp3");
const AUDIO_MILLION = new Audio("holy-shit.mp3");

const MUTE_KEY = "polymarket_audio_muted";

AUDIO_MIN.volume = 0.75;
AUDIO_MILLION.volume = 1;

const muteToggleBtn = document.getElementById("muteToggle");

const notice = document.getElementById("notice");
const noticeToggle = document.getElementById("noticeToggle");
const NOTICE_KEY = "notice_collapsed";

// load persisted state
if (localStorage.getItem(NOTICE_KEY) === "true") {
  notice.classList.add("collapsed");
}

noticeToggle.addEventListener("click", () => {
  notice.classList.toggle("collapsed");
  localStorage.setItem(
    NOTICE_KEY,
    notice.classList.contains("collapsed")
  );
});

// Default: muted
let isMuted = localStorage.getItem(MUTE_KEY) !== "false";

// Apply mute state
function applyMute() {
  AUDIO_MIN.muted = isMuted;
  AUDIO_MILLION.muted = isMuted;
  muteToggleBtn.textContent = isMuted ? "🔇 Pings Muted" : "🔊 Pings On";
}

applyMute();

muteToggleBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  localStorage.setItem(MUTE_KEY, String(isMuted));
  applyMute();
});

// rev up those fryers
document.addEventListener(
  "click",
  () => {
    AUDIO_MIN.muted = true;
    AUDIO_MILLION.muted = true;

    AUDIO_MIN.play().then(() => AUDIO_MIN.pause()).catch(() => {});
    AUDIO_MILLION.play().then(() => AUDIO_MILLION.pause()).catch(() => {});

    applyMute(); // restore correct mute state
  },
  { once: true }
);

const lastUpdatedEl = document.getElementById("lastUpdated");
const liveEl = document.getElementById("liveTrades");
const historyEl = document.getElementById("historicalTrades");
const countdownEl = document.getElementById("countdown");
const circle = document.querySelector(".progress-ring__circle");

const radius = 34;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = `${circumference}`;

let secondsLeft = REFRESH_INTERVAL;

/**
 * Create a stable fingerprint for a trade
 */
function tradeKey(t) {
  return `${t.conditionId}-${t.timestamp}-${t.size}-${t.price}-${t.side}`;
}

/**
 * Update "Last updated" text
 */
function updateLastUpdated() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { hour12: true });
  lastUpdatedEl.textContent = `Last updated: ${time} (10s ago)`;
}

/**
 * Load persisted history
 */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save history
 */
function saveHistory(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/**
 * In-memory + persisted store
 */
let historyStore = loadHistory();

/**
 * Expire trades older than 1 hour
 */
function expireHistory() {
  const now = Date.now();
  let changed = false;

  for (const key in historyStore) {
    if (now - historyStore[key].firstSeen > HISTORY_TTL) {
      delete historyStore[key];
      changed = true;
    }
  }

  if (changed) saveHistory(historyStore);
}

/**
 * Countdown ring
 */
function setProgress(seconds) {
  const offset =
    circumference - (seconds / REFRESH_INTERVAL) * circumference;
  circle.style.strokeDashoffset = offset;
}

/**
 * Fetch latest trades
 */
async function fetchTrades() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const bigTrades = data.filter(t => t.size >= MIN_SIZE);

    updateHistory(bigTrades);
    renderLive(bigTrades);
    renderHistory();
    updateLastUpdated();
  } catch (err) {
    console.error("Failed to fetch trades", err);
  }
}

/**
 * Add new trades to history + play audio
 */
function updateHistory(trades) {
  const now = Date.now();
  let changed = false;

  for (const t of trades) {
    const key = tradeKey(t);

    if (!historyStore[key]) {
      historyStore[key] = { ...t, firstSeen: now };
      changed = true;

      // 🔊 AUDIO LOGIC (only once per new trade)
      if (t.size > 1_000_000) {
        AUDIO_MILLION.currentTime = 0;
        AUDIO_MILLION.play().catch(() => {});
      } else {
        AUDIO_MIN.currentTime = 0;
        AUDIO_MIN.play().catch(() => {});
      }
    }
  }

  expireHistory();

  if (changed) saveHistory(historyStore);
}

/**
 * Render live trades
 */
function renderLive(trades) {
  liveEl.innerHTML = "";

  if (!trades.length) {
    liveEl.innerHTML = `<div class="status">Nothing yet.</div>`;
    return;
  }

  trades.slice(0, 12).forEach(t => liveEl.appendChild(tradeCard(t)));
}


/**
 * Render historical trades
 */
function renderHistory() {
  historyEl.innerHTML = "";

  const sorted = Object.values(historyStore).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  if (!sorted.length) {
    historyEl.innerHTML =
      "<div class='status'>You haven't tracked any trades in the last 24 hours.</div>";
    return;
  }

  sorted.forEach(t => historyEl.appendChild(tradeCard(t)));
}

/**
 * Trade card UI
 */
function tradeCard(t) {
  const div = document.createElement("div");
  div.className = `trade ${t.side.toLowerCase()}`;

  const time = new Date(t.timestamp * 1000).toLocaleString();
  const eventUrl = t.eventSlug
    ? `https://polymarket.com/event/${t.eventSlug}`
    : null;

  div.innerHTML = `
    <h3>
      ${
        eventUrl
          ? `<a href="${eventUrl}" target="_blank" rel="noopener noreferrer">
               ${t.eventSlug}
             </a>`
          : "Unknown Event"
      }
    </h3>
    <div class="meta">${t.slug || "Unknown Market"} • ${time}</div>
    <div class="details">
      <span>${t.side}</span>
      <span class="amount">$${t.size.toLocaleString()}</span>
    </div>
  `;

  return div;
}

/**
 * Countdown loop
 */
function startCountdown() {
  setInterval(() => {
    secondsLeft--;

    if (secondsLeft <= 0) {
      secondsLeft = REFRESH_INTERVAL;
      fetchTrades();
    }

    countdownEl.textContent = secondsLeft;
    setProgress(secondsLeft);
  }, 1000);
}

/**
 * Init
 */
expireHistory();
renderHistory();
fetchTrades();
startCountdown();
