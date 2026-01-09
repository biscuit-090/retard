const API_URL = "https://data-api.polymarket.com/trades?limit=1000";
const MIN_SIZE = 10_000;
const REFRESH_INTERVAL = 10; // seconds
const HISTORY_TTL = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = "polymarket_large_trades";

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
 * Load persisted history from localStorage
 */

function updateLastUpdated() {
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", {
    hour12: false
  });

  lastUpdatedEl.textContent = `Last updated: ${time}`;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Save history to localStorage
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
 * Update countdown ring
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
 * Add new trades to history
 */
function updateHistory(trades) {
  const now = Date.now();
  let changed = false;

  for (const t of trades) {
    const key = tradeKey(t);
    if (!historyStore[key]) {
      historyStore[key] = { ...t, firstSeen: now };
      changed = true;
    }
  }

  expireHistory();

  if (changed) saveHistory(historyStore);
}

/**
 * Render live trades (top section)
 */
function renderLive(trades) {
  liveEl.innerHTML = "";
  trades.slice(0, 12).forEach(t => liveEl.appendChild(tradeCard(t)));
}

/**
 * Render historical trades (last 1 hour)
 */
function renderHistory() {
  historyEl.innerHTML = "";

  const sorted = Object.values(historyStore)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!sorted.length) {
    historyEl.innerHTML =
      "<div class='status'>No large trades in the last hour.</div>";
    return;
  }

  sorted.forEach(t => historyEl.appendChild(tradeCard(t)));
}

/**
 * Build trade card UI
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
