# TradingFiew — Free Smart Money Chart Terminal

**Website:** https://tradingfiew.github.io/

This repository hosts the publicly distributed static TradingFiew website, a separate GitHub Pages site from RibhLab's original website.

## Markets
- Gold (XAUUSD), silver (XAGUSD) and selected metals
- Nasdaq 100 reference (USTEC), S&P 500 reference (US500), Dow 30 (US30), DXY and other indices
- Forex majors, crosses and some emerging-market pairs
- WTI and Brent oil, popular aggregated equity references
- Cryptocurrency Binance Spot markets

## Features
- Interactive OHLC candlesticks (TradingView Lightweight Charts), 5m, 15m, 1h, 4h, 1d intervals
- Price guide, nearest confirmed pivot support/resistance S1/R1
- Swing structure BOS/CHoCH, fair value gaps, candidate order blocks, liquidity sweeps and premium/discount
- EMA 20/50/200, RSI 14, ATR 14, volume, multi-timeframe context
- Horizontal/trend/Fibonacci drawing tools and OHLCV export
- Dark/light themes, market categories, favorites

## Sources and risk
Cryptocurrency Spot uses Binance public market data, updated via WebSocket with REST fallback. Other market data uses public indicative MT5/CFD or aggregated price references from biquote, typically polled every 20 seconds. These are not guaranteed real-time exchange prices, may be stale, and are not tradeable bids/asks. Always cross-check with your broker before any transaction.

SMC calculations are educational heuristics, not verified institution-level flow or guarantees of price movement. No automatic execution, credentials or wallets are collected.

## AdSense
The publisher verification meta tag and ads.txt are included. `adsense.js` deliberately keeps the ad loader off until this exact site has obtained AdSense approval and required consent handling is configured. Don't enable advertising without verifying those prerequisites.

## GitHub Pages
The website is built as static HTML/CSS/JS without build tools. Pages should use `main` branch and repository root `/` (or a verified GitHub Actions deployment workflow). If Pages is not yet enabled: repository → Settings → Pages → Source: Deploy from a branch → `main` → `/(root)` → Save.

**GitHub Pages publishes a public website.** A private development repository can be kept separately, but the public static deployment source lives in this public repository.

The application is independent from, and not endorsed by, TradingView, Binance or market-data providers. Open-source TradingView Lightweight Charts attribution is preserved.

## AdSense inventory and activation

Two clearly labeled and reserved ad spaces exist in the terminal: one in the Smart Money analysis sidebar, and one responsive horizontal banner below the chart workspace. No ad is currently served. Google's AdSense ownership meta and /ads.txt are already present for this publisher account.

To activate **after the exact domain tradingfiew.github.io appears as Ready in AdSense > Sites**, use Google Privacy & messaging or another certified CMP as required, create your real AdSense display units, then edit `adsense.js`:

- Set `siteReady: true` only after the site's approval.
- Set `cmpReady: true` only when the relevant visitor consent setup is working.
- Put the real ten-digit `data-ad-slot` values in `units.sidebar` and `units.banner`.

Never use dummy IDs or trick visitors into clicking on ads. Ad placeholders are visible independently of approval and explicitly say they are reserved spaces. No ads are embedded inside the price chart or over its drawing tools.

## Donate with Crypto

A prominent **Donate ₿** button is in the header, plus a secondary button in the sidebar. It opens a network-specific donation panel supporting:

- Bitcoin (BTC) — Bitcoin mainnet
- Ether (ETH) — Ethereum mainnet
- USDT — Tron TRC-20
- USDT — Ethereum ERC-20

The wallet addresses are intentionally blank. **No donation is possible until the verified owner supplies the actual receiving address for each network.** To enable, edit the corresponding `address` value in `donate.js` and validate it against your wallet or exchange's deposit address. The application verifies the basic format before allowing address copying, but the operator must still verify network and wallet ownership, including that token deposits are supported. Crypto transfers may be irreversible.

The donation button is independent of AdSense and must never be used to induce advertisement clicks.

## Anonymous workspaces and full-screen Chart Window

Every visit works without signing up or supplying a password. TradingFiew assigns a randomly generated **local browser workspace** ID and automatically saves each browser profile's symbol, time frame, favorites, category/search filters, theme, Auto SMC setting, technical-indicator toggles, tab and chart-window state.

Manual horizontal levels, trend lines and Fibonacci retracements are saved separately for each instrument and timeframe, including partial removal of Fibonacci levels. Drawing selection/deletion in the manager immediately updates the saved workspace. The **My Space** panel explains the storage boundaries and offers a local erasure action with explicit confirmation.

The top-right **⤢ Chart Window** button opens the same live interactive chart in an immersive phone/desktop window; it does not render a static screenshot. Open/close and Escape work on the focused chart. The setting is remembered locally.

**Privacy limitation:** a GitHub Pages static app cannot identify or authenticate people without a server. Separate browser profiles/devices have separate local data; two people sharing **the same browser profile** can see its saved drawings, even with the anonymous ID. Use separate browser profiles for genuine separation without passwords. There is no cloud synchronization, account recovery, remote data upload or encryption guarantee for localStorage. Never store secret keys in the workspace.


## Binance Spot Order Book & 5-frame trend matrix

The Smart Money sidebar includes a **verified public-market-data** Order Book for Binance Spot cryptocurrency pairs. The book uses Binance's `@depth20` partial-depth WebSocket stream (top 20 price levels on each side), displays the nearest 10 bids and 10 asks, and shows spread, aggregate visible bid/ask quantity and the UTC time a snapshot was received. If WebSocket cannot connect, the interface falls back to actual `GET /api/v3/depth` snapshots (20 levels) approximately every 12 seconds. Partial book liquidity is not the entire exchange book, can change instantly, and bid/ask imbalance is NOT a reliable forecast or trading signal.

For gold, silver, FX, indices, oil and other indicative MT5/CFD or aggregated markets **no exchange order book is available from the site's present provider**. The interface explicitly says unavailable rather than inventing bid and ask volume.

Trend by timeframe independently downloads completed market candles for **5m / 15m / 1h / 4h / 1d**, runs the SMC analysis and EMA20 / EMA50 / price / RSI alignment heuristics, and reports bullish, bearish or ranging, or unavailable for unverified data. The dashboard refreshes the signals about every 90 seconds while visible; its output is educational context only, not a probability, an executable order or investment advice. Closed or delayed markets may retain the last historical trend.

Sources: [Binance Spot WebSocket partial-depth streams](https://github.com/binance/binance-spot-api-docs/blob/master/web-socket-streams.md), [Binance market data only](https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md).

## Optional SMC zone scenarios and user-managed alerts

TradingFiew offers two separate, optional alert functions:

- **SMC Zone Breakouts:** disabled by default. A red bearish supply zone crossed **upward by the close of a completed candle** is a *possible bullish watch*; a green bullish demand zone broken **downward by a completed candle** is a *possible bearish watch*. These are hypotheses for further confirmation, not automated trades, financial advice, or guaranteed entries/exits. The breakout candidate must have existed in the prior analysis; the system does not retrospectively fire signals on first load.
- **Custom Alerts:** users can create any number of price-cross (above/below) or confirmed SMC breakout alerts per symbol/timeframe in the UI, choose one-shot versus repeating price alerts, enable or disable per-alert sound and phone/browser notifications, pause/resume individual alerts, delete one or delete all, and clear their history. Rules and a limited alert history are stored in each anonymous local browser workspace, with no account or password. There is no imposed alert count limit, but browser storage and market-data rate limits apply.

**Mobile and desktop notifications:** the user must actively grant permission in the Alerts panel; the site uses `ServiceWorkerRegistration.showNotification()` where supported, with a simple synthesized beep after user interaction. The `alerts-sw.js` service worker handles notification taps. Chromium/Android may display system notifications when the site is open, including in another tab. Platform restrictions can limit this behavior; iOS may require adding the app to the Home Screen for notification support. **No server-side Web Push or subscription database is configured.** Closing all TradingFiew tabs stops reliable market monitoring, so notifications after closing the browser **are not promised**. A separate authenticated push backend and persistent scanner would be needed for that.

Background watch while the **page is running** groups open alerts by market and samples other symbols with throttled provider requests to reduce API load. Alerts can be delayed, especially across many markets/timeframes, and providers can go offline or publish stale data. The app avoids firing a price threshold on initial historical candle load or a previously closed/stale quote. Never treat any alert as an instruction to place a trade.

The ability to make users' markets continuously monitored with the app closed would require a separate persistent backend, secure storage of each user's alert rules and push subscriptions, and a privacy/consent design. The current static GitHub Pages deployment does not have these systems.

