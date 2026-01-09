const MARKET_API = "https://api.allorigins.win/raw?url=https://gamma-api.polymarket.com/markets";
const MARKET_CACHE_KEY = "polymarket_market_cache";
const MARKET_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const API_URL = "https://data-api.polymarket.com/trades?limit=1000";
const MIN_SIZE = 10_000;
const REFRESH_INTERVAL = 10; // seconds
const HISTORY_TTL = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = "polymarket_large_trades";

const liveEl = document.getElementById("liveTrades");
const historyEl = document.getElementById("historicalTrades");
const countdownEl = document.getElementById("countdown");
const circle = document.querySelector(".progress-ring__circle");

const radius = 34;
const circumference = 2 * Math.PI * radius;
circle.style.strokeDasharray = `${circumference}`;

let secondsLeft = REFRESH_INTERVAL;

/**
 * Trade fingerprint
 */
function tradeKey(t) {
  return `${t.conditionId}-${t.timestamp}-${t.size}-${t.price}-${t.side}`;
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
 * Save persisted history
 */
function saveHistory(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/**
 * In-memory + persisted store
 * key -> trade object + firstSeen
 */
let historyStore = loadHistory();

/**
 * Expire old trades
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
 * Progress ring
 */
function setProgress(seconds) {
  const offset =
    circumference - (seconds / REFRESH_INTERVAL) * circumference;
  circle.style.strokeDashoffset = offset;
}

let marketMap = {};

function loadMarketCache() {
  try {
    const raw = localStorage.getItem(MARKET_CACHE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > MARKET_CACHE_TTL) return false;

    marketMap = parsed.data;
    return true;
  } catch {
    return false;
  }
}

function saveMarketCache(data) {
  localStorage.setItem(
    MARKET_CACHE_KEY,
    JSON.stringify({
      timestamp: Date.now(),
      data
    })
  );
}

async function loadMarkets() {
  if (loadMarketCache()) return;

  const res = await fetch(MARKET_API);
  const markets = await res.json();

  const map = {};

  for (const m of markets) {
    if (!m.conditionId || !Array.isArray(m.outcomes)) continue;

    map[m.conditionId] = {
      question: m.question || "Unknown question",
      outcomes: m.outcomes
    };
  }

  marketMap = map;
  saveMarketCache(map);
}

function resolveOutcome(trade) {
  const market = marketMap[trade.conditionId];
  if (!market || !market.outcomes?.length) return "Unknown outcome";

  // If API provides explicit outcome index (multi-outcome safe)
  if (typeof trade.outcomeIndex === "number") {
    return market.outcomes[trade.outcomeIndex] ?? "Unknown outcome";
  }

  // Binary fallback (YES/NO style markets)
  if (market.outcomes.length === 2) {
    return trade.side === "BUY"
      ? market.outcomes[0]
      : market.outcomes[1];
  }

  // Multi-outcome fallback when index is missing
  return "Multiple outcomes";
}


/**
 * Fetch trades
 */
async function fetchTrades() {
  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const bigTrades = data.filter(t => t.size >= MIN_SIZE);

    updateHistory(bigTrades);
    renderLive(bigTrades);
    renderHistory();
  } catch (err) {
    console.error("Fetch failed", err);
  }
}

/**
 * Update historical store
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
 * Render live trades
 */
function renderLive(trades) {
  liveEl.innerHTML = "";
  trades.slice(0, 12).forEach(t => liveEl.appendChild(tradeCard(t)));
}

/**
 * Render historical trades
 */
function renderHistory() {
  historyEl.innerHTML = "";

  const sorted = Object.values(historyStore)
    .sort((a, b) => b.timestamp - a.timestamp);

  if (!sorted.length) {
    historyEl.innerHTML =
      "<div class='status'>No large trades saved to your browser cache in the last hour.</div>";
    return;
  }

  sorted.forEach(t => historyEl.appendChild(tradeCard(t)));
}

function tradeCard(t) {
  const div = document.createElement("div");
  div.className = `trade ${t.side.toLowerCase()}`;

  const time = new Date(t.timestamp * 1000).toLocaleString();
  const eventUrl = t.eventSlug
    ? `https://polymarket.com/event/${t.eventSlug}`
    : null;

  const outcome = resolveOutcome(t);

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
      <span>${t.side} <strong>${outcome}</strong></span>
      <span class="amount">$${t.size.toLocaleString()}</span>
    </div>
  `;

  return div;
}


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

// init block
(async function init() {
  await loadMarkets();
  expireHistory();
  renderHistory();
  fetchTrades();
  startCountdown();
})();
