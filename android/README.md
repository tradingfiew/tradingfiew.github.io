# TradingFiew Android — Trusted Web Activity

This is the Android Play Store wrapper for the owned HTTPS site https://tradingfiew.github.io/.
It uses a verified Trusted Web Activity, not an insecure third-party WebView or a second web app implementation.

**App id:** `com.ribhlab.tradingfiew` | **Version:** 1.0.0 (1) | **Min Android:** 6 / API 23 | **Target Android:** 16 / API 36.

## Build

Use Android Studio / JDK 17 and Android SDK 36. From the repository root:

```bash
cd android
gradle :app:assembleRelease :app:bundleRelease
```

In GitHub Actions, `.github/workflows/tradingfiew-android.yml` builds both APK and AAB. With no signing secrets those artifacts are **unsigned**.

## Signing (never add keys or passwords to source control)

Generate one stable upload key and keep it backed up securely. To create signed artifacts via GitHub Actions, add these four repository Actions secrets:

- `TRADINGFIEW_KEYSTORE_BASE64`: output of `base64 -w0 upload-keystore.p12` (on PowerShell use `[Convert]::ToBase64String([IO.File]::ReadAllBytes('upload-keystore.p12'))`)
- `TRADINGFIEW_STORE_PASSWORD`: keystore password
- `TRADINGFIEW_KEY_ALIAS`: alias, e.g. `tradingfiew-upload`
- `TRADINGFIEW_KEY_PASSWORD`: private-key password

The workflow decodes the keystore in the temporary runner and uploads only signed builds, **never the keystore**. Google Play App Signing uses a separate signing certificate for store-installed builds; retrieve that SHA-256 fingerprint in Play Console > App integrity and append it to `/.well-known/assetlinks.json` before distribution. Do not replace the existing upload certificate fingerprint.

Local signing without Actions secrets: export `TRADINGFIEW_KEYSTORE_PATH`, `TRADINGFIEW_STORE_PASSWORD`, `TRADINGFIEW_KEY_ALIAS`, `TRADINGFIEW_KEY_PASSWORD`; rebuild.

## Web verification and notifications

The web domain hosts `/.well-known/assetlinks.json` with the upload key's SHA-256 certificate. If an installed Play Store build opens with browser UI, check the **Play App Signing** fingerprint, Chrome's verified-links status, and whether Digital Asset Links has propagated.

The existing web code only monitors alerts while the page is active. Notification delegation supports Android permission prompts, but it does not create a background scanner or server push. Do not promise closed-app monitoring in the Play listing.

The site currently relies on active internet access for quotes. It is informational market research, not an order-entry trading platform.
