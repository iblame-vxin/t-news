# TradeNews Board

Beginner learning dashboard. Educational only — NOT financial advice. No real-money auto-trading.

## Files

- `index.html` — page structure (charts, prices, indicators, signals, news)
- `style.css` — dark theme, mobile-friendly layout
- `app.js` — fetches, RSI-14 / EMA-50 math, news, refresh loop
- `signals-log.md` — observation log (you append to it manually)
- `README.md` — this file

## How to open index.html

No build step. No framework.

1. Open the folder `TradeNews Board` in File Explorer.
2. Double-click `index.html` — it opens in your browser.
3. Or right-click `index.html` > Open with > Chrome / Edge / Firefox.
4. Needs internet for: TradingView embeds, Binance, Stooq, CoinDesk RSS via AllOrigins.

Optional local server (same result, avoids some file:// limits):

```
cd "TradeNews Board"
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## How it works

Top — Live charts:
- Official TradingView Advanced Chart embeds for BINANCE:BTCUSDT, BINANCE:ETHUSDT, BINANCE:SOLUSDT.
- Only embedded via `https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js`. Nothing scraped.

Middle — Live prices (refresh every 60s):
- Crypto: `https://api.binance.us/api/v3/ticker/24hr?symbol=BTCUSDT` (repeated for ETHUSDT, SOLUSDT). Shows price, 24h % change, 24h high/low, updated time. Uses `.us` because `binance.com` returns 451 blocked in some regions.
- Currencies vs USD: `https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY` (free, no key). Shows 1 USD = ? EUR/GBP/JPY + date. Replaced old Stooq stocks because Stooq needs API key since Mar 2026 (returns 404).
- On fetch failure: error line appears, old cards stay. Page never crashes.

Indicators — learning notes only:
- Keeps last 50 BTC hourly closes in memory from `https://api.binance.us/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=50`.
- RSI-14: 0–100 formula. Below 30 → "OVERSOLD ZONE - sold a lot recently". Above 70 → "OVERBOUGHT ZONE". Else "NEUTRAL".
- EMA-50: price above → "Above average trend", below → "Below average trend".
- Warning shown next to it: "This describes the past. It does NOT tell you when to buy/sell."

Bottom — News:
- CoinDesk RSS `https://www.coindesk.com/arc/outboundfeeds/rss/` loaded through `https://api.rss2json.com/v1/api.json` first (CORS-friendly), backup `https://api.allorigins.win/get?url=`. Top 10 title + time + link, plus fetched timestamp.
- On failure: 3 sample headlines render so layout still works.

Signals log:
- When RSI crosses below 30 or above 70, app.js builds one line:
  `[2026-09-15 14:00 UTC] BTC $67200 RSI 28 - Oversold observation. Educational only.`
- Browser JS cannot write `signals-log.md` directly, so the page shows the lines under "Signals Log" with Copy + Download buttons. Paste new lines into `signals-log.md` yourself.
- Wording stays observational. No promises about direction or timing.

## Risks

- Learning tool only. Not financial advice.
- Indicators describe past price action. They do not predict.
- Crypto and stocks are risky. Prices can move fast against any idea.
- Practice with paper trading before considering anything real.
- Free public APIs can be slow, rate-limited, or blocked by region/network. The board keeps old data and shows an error instead of stopping.

## How to add Telegram alerts later (optional, manual)

The page does not send Telegram messages by itself. To add it later:

1. In Telegram, talk to @BotFather, create a bot, save the bot token.
2. Message your bot once, then get your chat id via `https://api.telegram.org/bot<TOKEN>/getUpdates`.
3. When a crossing is detected in `checkRsiCross()`, also call:

```
fetch("https://api.telegram.org/bot<TOKEN>/sendMessage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ chat_id: "<CHAT_ID>", text: line })
});
```

4. Keep token and chat id out of shared files. Use for study notes only — this does not make signals actionable. Not financial advice.

## Customizing

- Change refresh: edit `REFRESH_MS` in `app.js` (default 60000).
- Add a coin: add symbol to `CRYPTOS` array + a `price-card` div in `index.html`.
- Add a stock: extend the Stooq `s=` list and add a card div.
