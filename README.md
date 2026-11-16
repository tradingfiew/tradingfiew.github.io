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

