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
