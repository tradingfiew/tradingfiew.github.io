# TradingFiew Android publication checklist

1. Verify domain ownership and the public `https://tradingfiew.github.io/.well-known/assetlinks.json` endpoint. This repo contains the SHA-256 for a private upload key generated for the first build.
2. Back up the `upload-keystore.p12` and credentials OFF GitHub. Loss can prevent future releases unless upload-key reset is approved by Google.
3. In GitHub repository Settings > Secrets and variables > Actions create the four `TRADINGFIEW_...` secrets documented in `android/README.md`. Trigger **TradingFiew Android (API 36)**.
4. Download signed **.aab** for Play and optionally **.apk** for direct test installs; verify their signature and SHA256SUMS.
5. Create Google Play application with `com.ribhlab.tradingfiew`, enroll in Play App Signing, and read the **App signing key certificate SHA-256**.
6. Add Google's Play **App signing certificate SHA-256** to the existing `sha256_cert_fingerprints` array in `/.well-known/assetlinks.json`; wait for site deployment and verify TWA full-screen behavior on the Play-installed build.
7. Provide real screenshots, app category, store text, privacy policy, Data Safety and declarations; publish to the required testing track before production.
8. Test live charts and Binance connectivity, chart+RSI synchronization, alert editing, notification permission, SMC overlays, rotation, small phones, modern large-screen devices and offline/reconnection cases.
9. Market alerts run only while the page is active. Do not claim reliable background alerts or trading execution. Ensure no AdSense is incorrectly presented as native app ads and review Google Play policies.
10. Increment `versionCode` for every Play upload. Preserve `applicationId` and the same upload key.
