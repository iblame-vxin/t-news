// TradeNews Board — app.js
// Educational only. NOT financial advice. No real-money auto-trading.
// Plain JS. All fetches have try/catch + keep-old-data behavior.

const CRYPTOS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const REFRESH_MS = 60000;

let closesMap = { BTCUSDT: [], ETHUSDT: [], SOLUSDT: [] };   // last up to 50 closes each
let prevRsiMap = { BTCUSDT: null, ETHUSDT: null, SOLUSDT: null };   // for crossing detection
let btcCloses = []; // kept for backward compat, mirrors closesMap.BTCUSDT
let sessionSignals = []; // lines created this session
let countdown = REFRESH_MS / 1000;

const $ = (id) => document.getElementById(id);

// ---------- helpers ----------
function fmtTime(d) {
  return d.toLocaleString() + " (" + d.toLocaleTimeString() + ")";
}
function utcStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate()) +
    " " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " UTC";
}
function setLastUpdated() {
  $("last-updated").textContent = "Last updated: " + fmtTime(new Date());
}

// ---------- RSI-14 (Wilder) ----------
// Standard Wilder smoothing. Returns null if not enough data.
function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) avgGain += diff;
    else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ---------- EMA-N (span) ----------
function calcEMA(closes, period = 50) {
  if (closes.length === 0) return null;
  const k = 2 / (period + 1);
  let ema = closes[0];
  for (let i = 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

// ---------- Tradability guard (from price_guards idea) ----------
// Returns false for empty / all-NaN / all-zero / flat data.
function isValidCloses(closes) {
  if (!Array.isArray(closes) || closes.length === 0) return false;
  const nums = closes.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return false;
  if (nums.every((v) => v === 0)) return false;
  const first = nums[0];
  if (nums.every((v) => v === first)) return false;
  return true;
}

function renderIndicators(btcPrice, prices) {
  prices = prices || {};
  const allCloses = closesMap.BTCUSDT || [];
  btcCloses = allCloses;
  const rsi = calcRSI(allCloses, 14);
  const ema = calcEMA(allCloses, 50);

  // Show RSI for BTC + ETH + SOL (main cryptos)
  updateRsiBox("BTCUSDT", "rsi-value", "rsi-badge", "rsi-note", btcPrice);
  updateRsiBox("ETHUSDT", "rsi-eth-value", "rsi-eth-badge", null, prices.ETHUSDT);
  updateRsiBox("SOLUSDT", "rsi-sol-value", "rsi-sol-badge", null, prices.SOLUSDT);

  const emaBadge = $("ema-badge");
  if (!isValidCloses(allCloses) || ema === null || btcPrice === null) {
    $("ema-value").textContent = "—";
    $("ema-price").textContent = btcPrice !== null ? String(btcPrice) : "—";
    emaBadge.textContent = "Waiting for data";
    emaBadge.className = "badge neutral";
  } else {
    $("ema-value").textContent = ema.toFixed(2);
    $("ema-price").textContent = String(btcPrice);
    if (btcPrice > ema) {
      emaBadge.textContent = "Above average trend";
      emaBadge.className = "badge above";
    } else {
      emaBadge.textContent = "Below average trend";
      emaBadge.className = "badge below";
    }
  }
}

// Helper: update one RSI box + detect crossing for that coin.
function updateRsiBox(coin, valueId, badgeId, noteId, price) {
  const closes = closesMap[coin] || [];
  const badge = $(badgeId);
  if (!$(valueId) || !badge) return;
  if (!isValidCloses(closes)) {
    $(valueId).textContent = "— (invalid data)";
    badge.textContent = "NEUTRAL";
    badge.className = "badge neutral";
    if (noteId && $(noteId)) $(noteId).textContent = "Price feed gave empty / zero / flat data. Keeping old values. Currently: " + closes.length + " closes.";
    return;
  }
  const rsi = calcRSI(closes, 14);
  if (rsi === null) {
    $(valueId).textContent = "— (collecting data)";
    badge.textContent = "NEUTRAL";
    badge.className = "badge neutral";
    if (noteId && $(noteId)) $(noteId).textContent = "Needs 15+ closes to compute. Currently: " + closes.length + "/15.";
    return;
  }
  $(valueId).textContent = rsi.toFixed(2);
  if (noteId && $(noteId)) $(noteId).textContent = "Based on last " + Math.min(closes.length, 50) + " hourly closes, kept in memory.";
  if (rsi < 30) {
    badge.textContent = "OVERSOLD ZONE - sold a lot recently";
    badge.className = "badge oversold";
  } else if (rsi > 70) {
    badge.textContent = "OVERBOUGHT ZONE";
    badge.className = "badge overbought";
  } else {
    badge.textContent = "NEUTRAL";
    badge.className = "badge neutral";
  }
  checkRsiCross(coin, rsi, price);
}

// Log only on crossing (not every poll) to avoid spam.
function checkRsiCross(coin, rsi, price) {
  const prev = prevRsiMap[coin];
  let event = null;
  if (prev !== null && prev !== undefined) {
    if (prev >= 30 && rsi < 30) event = "Oversold observation";
    if (prev <= 70 && rsi > 70) event = "Overbought observation";
  }
  prevRsiMap[coin] = rsi;
  if (!event || price === null || price === undefined) return;
  const short = coin.replace("USDT", "");
  const line = "[" + utcStamp(new Date()) + "] " + short + " $" + price + " RSI " + rsi.toFixed(0) + " - " + event + ". Educational only.";
  sessionSignals.push(line);
  try {
    const saved = JSON.parse(localStorage.getItem("tnb_signals") || "[]");
    saved.push(line);
    localStorage.setItem("tnb_signals", JSON.stringify(saved));
  } catch (e) { /* storage optional */ }
  renderSignals();
}

function renderSignals() {
  let all = sessionSignals;
  try {
    const saved = JSON.parse(localStorage.getItem("tnb_signals") || "[]");
    all = saved.concat(sessionSignals.filter((s) => !saved.includes(s)));
  } catch (e) { /* keep session only */ }
  const list = $("signals-list");
  list.innerHTML = "";
  if (all.length === 0) {
    list.innerHTML = '<li class="muted">No crossings observed yet in this session.</li>';
    return;
  }
  all.slice(-20).reverse().forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    list.appendChild(li);
  });
}

// ---------- crypto prices ----------
async function fetchCrypto() {
  let pricesMap = {};
  for (const sym of CRYPTOS) {
    try {
      const res = await fetch("https://api.binance.us/api/v3/ticker/24hr?symbol=" + sym);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      const price = parseFloat(d.lastPrice);
      const change = parseFloat(d.priceChangePercent);
      const high = parseFloat(d.highPrice);
      const low = parseFloat(d.lowPrice);
      pricesMap[sym] = price;
      const cardId = "card-" + sym;
      const el = $(cardId);
      const cls = change >= 0 ? "up" : "down";
      const sign = change >= 0 ? "+" : "";
      el.innerHTML = "<h4>" + sym + "</h4>" +
        '<div class="price">$' + price.toLocaleString() + "</div>" +
        '<div class="' + cls + '">' + sign + change.toFixed(2) + "% (24h)</div>" +
        '<div class="small">High: $' + high.toLocaleString() + " | Low: $" + low.toLocaleString() + "</div>" +
        '<div class="small">Updated: ' + fmtTime(new Date()) + "</div>";
      $("crypto-error").hidden = true;
    } catch (err) {
      // Keep old data, show error note.
      const e = $("crypto-error");
      e.hidden = false;
      e.textContent = "Crypto refresh issue for " + sym + " (" + err.message + "). Showing last known data.";
    }
  }
  // Fetch closes for BTC + ETH + SOL indicators (hourly klines, last 50 each).
  try {
    for (const sym of CRYPTOS) {
      try {
        const res = await fetch("https://api.binance.us/api/v3/klines?symbol=" + sym + "&interval=1h&limit=50");
        if (!res.ok) throw new Error("HTTP " + res.status + " for " + sym);
        const klines = await res.json();
        closesMap[sym] = klines.map((k) => parseFloat(k[4])).slice(-50);
      } catch (e1) { /* keep old closes for this coin */ }
    }
    btcCloses = closesMap.BTCUSDT || btcCloses;
    renderIndicators(pricesMap.BTCUSDT ?? null, pricesMap);
  } catch (err) {
    // Keep old closes, still render with what we have.
    renderIndicators(pricesMap.BTCUSDT ?? null, pricesMap);
    const e = $("crypto-error");
    e.hidden = false;
    e.textContent = "Indicator data refresh issue (" + err.message + "). Showing last known values.";
  }
}

// ---------- currencies vs USD (open.er-api.com, free, no key, CORS-friendly) ----------
// Replaces old Stooq stocks which now needs API key (404 since Mar 2026).
// Frankfurter old domain is deprecated, so we use open.er-api.com (verified Sep 2026).
// Shows how much 1 USD buys in EUR/GBP/JPY. Live, updates daily.
async function fetchStocks() {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const d = await res.json();
    if (d.result !== "success") throw new Error("bad data");
    const rates = d.rates || {};
    const date = d.time_last_update_utc || "";
    const names = { EUR: "Euro", GBP: "British Pound", JPY: "Japanese Yen" };
    for (const sym of ["EUR", "GBP", "JPY"]) {
      const el = $("card-" + sym);
      if (!el) continue;
      const v = rates[sym];
      if (!v) continue;
      const show = sym === "JPY" ? v.toFixed(2) : v.toFixed(4);
      el.innerHTML = "<h4>USD → " + sym + " (" + names[sym] + ")</h4>" +
        '<div class="price">' + show + " " + sym + "</div>" +
        '<div class="small">1 USD = ' + show + " " + sym + "</div>" +
        '<div class="small">Updated: ' + date + "</div>";
    }
    $("stock-error").hidden = true;
  } catch (err) {
    const e = $("stock-error");
    e.hidden = false;
    e.textContent = "Currency refresh issue (" + err.message + "). Showing last known data.";
  }
}

// ---------- news ----------
const FALLBACK_NEWS = [
  { title: "Sample: Bitcoin developers discuss network upgrade (offline sample)", date: "Sample data", link: "https://www.coindesk.com/" },
  { title: "Sample: Ethereum community reviews scaling progress (offline sample)", date: "Sample data", link: "https://www.coindesk.com/" },
  { title: "Sample: How to read crypto headlines with care (offline sample)", date: "Sample data", link: "https://www.coindesk.com/" }
];

async function fetchNews() {
  const list = $("news-list");
  // Try 1: rss2json (CORS-friendly, no key, verified Sep 2026)
  try {
    const res = await fetch("https://api.rss2json.com/v1/api.json?rss_url=" + encodeURIComponent("https://www.coindesk.com/arc/outboundfeeds/rss/"));
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const items = (data.items || []).slice(0, 10);
    if (data.status !== "ok" || items.length === 0) throw new Error("no items");
    list.innerHTML = "";
    items.forEach((it) => {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = it.link || "https://www.coindesk.com/"; a.target = "_blank"; a.rel = "noopener";
      a.textContent = it.title || "Untitled";
      li.appendChild(a);
      const span = document.createElement("div");
      span.className = "small";
      span.textContent = it.pubDate || "";
      li.appendChild(span);
      list.appendChild(li);
    });
    $("news-fetched-at").textContent = fmtTime(new Date());
    $("news-error").hidden = true;
    return;
  } catch (err1) {
    // Try 2: AllOrigins + raw RSS as backup
    try {
      const rss = encodeURIComponent("https://www.coindesk.com/arc/outboundfeeds/rss/");
      const res = await fetch("https://api.allorigins.win/get?url=" + rss);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const wrapper = await res.json();
      const xmlText = wrapper.contents;
      if (!xmlText) throw new Error("empty feed");
      const xml = new DOMParser().parseFromString(xmlText, "text/xml");
      const items = Array.from(xml.querySelectorAll("item")).slice(0, 10);
      if (items.length === 0) throw new Error("no items");
      list.innerHTML = "";
      items.forEach((it) => {
        const title = it.querySelector("title") ? it.querySelector("title").textContent : "Untitled";
        const link = it.querySelector("link") ? it.querySelector("link").textContent : "https://www.coindesk.com/";
        const pub = it.querySelector("pubDate") ? it.querySelector("pubDate").textContent : "";
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = link; a.target = "_blank"; a.rel = "noopener";
        a.textContent = title;
        li.appendChild(a);
        const span = document.createElement("div");
        span.className = "small";
        span.textContent = pub;
        li.appendChild(span);
        list.appendChild(li);
      });
      $("news-fetched-at").textContent = fmtTime(new Date());
      $("news-error").hidden = true;
      return;
    } catch (err2) {
      list.innerHTML = "";
      FALLBACK_NEWS.forEach((n) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = n.link; a.target = "_blank"; a.rel = "noopener";
        a.textContent = n.title;
        li.appendChild(a);
        const d = document.createElement("div");
        d.className = "small"; d.textContent = n.date;
        li.appendChild(d);
        list.appendChild(li);
      });
      $("news-fetched-at").textContent = fmtTime(new Date()) + " (sample data)";
      const e = $("news-error");
      e.hidden = false;
      e.textContent = "Live news unavailable (" + err2.message + "). Showing sample headlines so the page still works.";
    }
  }
}

// ---------- refresh loop ----------
async function refreshAll() {
  await Promise.allSettled([fetchCrypto(), fetchStocks(), fetchNews()]);
  setLastUpdated();
  countdown = REFRESH_MS / 1000;
}

setInterval(() => {
  countdown -= 1;
  if (countdown <= 0) {
    refreshAll();
  } else {
    $("refresh-label").textContent = "Auto-refresh every 60s (next in " + countdown + "s)";
  }
}, 1000);

// ---------- buttons ----------
$("refresh-now").addEventListener("click", refreshAll);

$("copy-signals").addEventListener("click", async () => {
  const text = sessionSignals.length ? sessionSignals.join("\n") : "No new signals this session.";
  try {
    await navigator.clipboard.writeText(text);
    alert("Copied. Paste new lines into signals-log.md");
  } catch (e) {
    alert(text);
  }
});

$("download-signals").addEventListener("click", () => {
  const text = sessionSignals.length ? sessionSignals.join("\n") : "No new signals this session.";
  const blob = new Blob([text + "\n"], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "signals.txt";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("clear-signals").addEventListener("click", () => {
  sessionSignals = [];
  try { localStorage.removeItem("tnb_signals"); } catch (e) {}
  renderSignals();
});

// ---------- init ----------
renderSignals();
refreshAll();
$("refresh-label").textContent = "Auto-refresh every 60s";
