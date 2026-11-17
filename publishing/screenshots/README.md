# Google Play UI screenshots

Run **GitHub Actions → TradingFiew real website screenshots for Play Store → Run workflow**.
The workflow visits the actual live https://tradingfiew.github.io/, uses Chromium Android mobile emulation,
captures its charts, alerts, watch list and analysis panel at 1080 x 1920 pixels, and uploads an artifact.

These captures are **browser mobile-emulation captures** of the real site interface, not captures from a real Android APK.
Before final production submission, install the signed APK / AAB-derived APK on an Android device or emulator,
check that the UI matches, and ideally replace with actual device screenshots. Do not publish screenshots
showing loading placeholders, stale prices or layout failures. Inspect capture-report.json carefully.

Do not screenshot fake quotes, fabricated charts, or staged screenshots claiming live market data.
