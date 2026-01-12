const API_URL = "https://data-api.polymarket.com/trades?limit=1000";
const MIN_SIZE = 20_000; // USD threshold
const POLL_INTERVAL_KEY = "poll_interval_ms";
let pollIntervalMs = Number(
  localStorage.getItem(POLL_INTERVAL_KEY)
) || 1000; // default 1000ms
const HISTORY_TTL = 7 * 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = "polymarket_large_trades";

// 🔊 audio
const AUDIO_MIN = new Audio("ping.mp3");
const AUDIO_MILLION = new Audio("holy-shit.mp3");

const MUTE_KEY = "polymarket_audio_muted";

AUDIO_MIN.volume = 1;
AUDIO_MILLION.volume = 1;

const muteToggleBtn = document.getElementById("muteToggle");

const notice = document.getElementById("notice");
const noticeToggle = document.getElementById("noticeToggle");
const NOTICE_KEY = "notice_collapsed";

// restore notice collapsed state
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

function flashMuteButton() {
  muteToggleBtn.classList.remove("flash-twice"); // reset if already animating
  void muteToggleBtn.offsetWidth;                // force reflow
  muteToggleBtn.classList.add("flash-twice");
}



// Default: muted
let isMuted = localStorage.getItem(MUTE_KEY) !== "false";

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

const samplePingBtn = document.getElementById("samplePing");
const samplePingBtn2 = document.getElementById("samplePing2");

function bindSamplePing(button, audio) {
  button.addEventListener("click", () => {
    if (isMuted) {
      flashMuteButton();
      return;
    }

    if (button.disabled) return;

    button.disabled = true;

    audio.currentTime = 0;
    audio.play().catch(() => {});

    setTimeout(() => {
      button.disabled = false;
    }, 1000);
  });
}


bindSamplePing(samplePingBtn, AUDIO_MIN);
bindSamplePing(samplePingBtn2, AUDIO_MILLION);



// prime audio (browser requirement)
document.addEventListener(
  "click",
  () => {
    AUDIO_MIN.muted = true;
    AUDIO_MILLION.muted = true;

    AUDIO_MIN.play().then(() => AUDIO_MIN.pause()).catch(() => {});
    AUDIO_MILLION.play().then(() => AUDIO_MILLION.pause()).catch(() => {});

    applyMute();
  },
  { once: true }
);

const lastUpdatedEl = document.getElementById("lastUpdated");
const liveEl = document.getElementById("liveTrades");
const historyEl = document.getElementById("historicalTrades");

/**
 * Utilities
 */

function tradeKey(t) {
  return `${t.conditionId}-${t.timestamp}-${t.size}-${t.price}-${t.side}`;
}

function updateLastUpdated() {
  const now = new Date();

  const time = now.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });

  const ms = String(now.getMilliseconds()).padStart(3, "0");

  lastUpdatedEl.textContent = `Last updated: ${time}.${ms}`;
}


function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHistory(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

let historyStore = loadHistory();

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
 * 🔢 Parsing / formatting helpers
 */

function parseTradeSize(raw) {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return 0;

  const cleaned = raw.replace(/,/g, "");
  const num = Number.parseFloat(cleaned);

  return Number.isFinite(num) ? num : 0;
}

// total USD spent = shares × price
function calculateTotalPaid(size, price) {
  return parseTradeSize(size) * parseTradeSize(price);
}

function formatUSD(amount) {
  const roundedUp = Math.ceil(amount * 100) / 100;
  return roundedUp.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function truncate(text, max = 35) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max - 1) + ".." : text;
}

function formatUsername(name, max = 10) {
  if (!name) return "Someone";
  return name.length > max ? name.slice(0, max - 1) + ".." : name;
}

/**
 * Fetch trades
 */
let fetchInFlight = false;

async function fetchTrades() {
  if (fetchInFlight) return;
  fetchInFlight = true;

  try {
    const res = await fetch(API_URL);
    const data = await res.json();

    const bigTrades = data.filter(t =>
      calculateTotalPaid(t.size, t.price) >= MIN_SIZE
    );

    updateHistory(bigTrades);
    renderLive(bigTrades);
    renderHistory();
    updateLastUpdated();
  } catch (err) {
    console.error("Failed to fetch trades", err);
  } finally {
    fetchInFlight = false;
  }
}

/**
 * History + audio
 */
function updateHistory(trades) {
  const now = Date.now();
  let changed = false;

  for (const t of trades) {
    const key = tradeKey(t);

    if (!historyStore[key]) {
      historyStore[key] = { ...t, firstSeen: now };
      changed = true;

      const totalPaid = calculateTotalPaid(t.size, t.price);

      if (totalPaid >= 1_000_000) {
        AUDIO_MILLION.currentTime = 0;
        AUDIO_MILLION.play().catch(() => {});
      } else if (totalPaid >= MIN_SIZE) {
        AUDIO_MIN.currentTime = 0;
        AUDIO_MIN.play().catch(() => {});
      }
    }
  }

  expireHistory();
  if (changed) saveHistory(historyStore);
}

/**
 * Rendering
 */

function renderLive(trades) {
  liveEl.innerHTML = "";

  if (!trades.length) {
    liveEl.innerHTML = `<div class="status">Nothing yet.</div>`;
    return;
  }

  trades.slice(0, 12).forEach(t => liveEl.appendChild(tradeCard(t)));
}

function renderHistory() {
  historyEl.innerHTML = "";

  const sorted = Object.values(historyStore)
    .sort((a, b) => b.timestamp - a.timestamp);

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

  if (t.icon) {
    div.style.setProperty("--trade-icon", `url(${t.icon})`);
  }

  const eventUrl = t.eventSlug
    ? `https://polymarket.com/event/${t.eventSlug}`
    : null;

  const profileUrl = t.name
    ? `https://polymarket.com/@${t.name}`
    : null;

  const txUrl = t.transactionHash
    ? `https://polygonscan.com/tx/${t.transactionHash}`
    : null;

  const totalPaid = calculateTotalPaid(t.size, t.price);

  div.innerHTML = `
    <div class="trade-content">
      <h3 class="trade-title">
        ${
          eventUrl
            ? `<a class="trade-link" href="${eventUrl}" target="_blank" rel="noopener noreferrer">
                 ${truncate(t.title || "Unknown Event")}
               </a>`
            : truncate(t.title || "Unknown Event")
        }
        ${
          eventUrl
            ? `<i class="fa-solid fa-arrow-up-right-from-square" style="margin-left: 5px; font-size: 0.7rem;"></i>`
            : ""
        }
      </h3>

      <div class="trade-subtitle">
        ${
          profileUrl
            ? `<a class="profile-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">
                 @${formatUsername(t.name)}
               </a>`
            : "Someone"
        }
        &nbsp;bet on outcome:
        <strong>${t.outcome || "Unknown"}</strong>
      </div>

      <div class="trade-meta">
        ${new Date(t.timestamp * 1000).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric"
        })}
        •
        ${new Date(t.timestamp * 1000).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit"
        })}
      </div>

      ${
        txUrl
          ? `<div class="trade-tx">
               <a href="${txUrl}" target="_blank" rel="noopener noreferrer">
                 View transaction on <b style="color:#fff;font-weight:400;">PolygonScan</b>
               </a>
             </div>`
          : ""
      }

      <div class="details">
        <span class="badge">${t.side}</span>
        <span class="amount">$${formatUSD(totalPaid)}</span>
      </div>
    </div>
  `;

  return div;
}

/**
 * Polling
 */
function startPolling() {
  let lastFetch = 0;

  setInterval(() => {
    const now = performance.now();

    if (now - lastFetch >= pollIntervalMs) {
      lastFetch = now;
      fetchTrades();
    }
  }, 50);
}

const pollSelect = document.getElementById("pollInterval");

// restore saved value
pollSelect.value = pollIntervalMs;

pollSelect.addEventListener("change", () => {
  pollIntervalMs = Number(pollSelect.value);
  localStorage.setItem(POLL_INTERVAL_KEY, pollIntervalMs);
});


/**
 * Init
 */
expireHistory();
renderHistory();
fetchTrades();
startPolling();
