# TradingFiew Android — AdMob Interstitial-only Release

As of 18 Nov 2026, the previous signed Google Play AAB is **1.0.2 / versionCode 3**.
This branch contains an **Android 1.0.3 / versionCode 4** integration tested with Google's
sample AdMob IDs in DEBUG. **Version 4 is NOT signed and NOT uploaded to Play** until
the correct TradingFiew application ID and applicable Play Ads / Data Safety forms
are verified.

## IDs — distinct values
- Interstitial Ad Unit ID (verified from the owner's AdMob screenshot):
  `ca-app-pub-7945572016731367/8117339646`
- Unused Banner Ad Unit:
  `ca-app-pub-7945572016731367/9838506070`
- **AdMob App ID (required, still unavailable):**
  `ca-app-pub-7945572016731367~XXXXXXXXXX`.
  Obtain the exact value from **AdMob → Apps → TradingFiew → App settings → App ID**.
  This is a public configuration identifier, *not* a password or keystore.
  **Do not substitute the RivoScan or NovaGrid app IDs.**

## Secure CI signing
On **univcours/ribhlab → Settings → Secrets and variables → Actions**, add
`TRADINGFIEW_ADMOB_APP_ID` with the correct exact App ID. The release workflow
`rivoscan-standalone-ready/.github/workflows/tradingfiew-rivo-key-signed.yml`
already verifies the original RivoScan signing keystore fingerprint and will
refuse to produce an Android release without the real TradingFiew AdMob App ID.

## UI and ad rules
- Only `InterstitialAd` through native Google Mobile Ads SDK 25.5.0; no Banner,
  Anchor, App Open, Rewarded or Native ads. Website AdSense remains off on mobile.
- Test APKs use Google's official test App/Interstitial IDs.
- No ad on TWA startup, while editing charts, moving drawings, or editing alerts.
- The calendar opens through a user-initiated native transition on TWA Android.
  If the SDK is unready, permission is not granted, or an ad cannot load,
  the transition continues without a blocking ad.
- Minimum 60 seconds of app engagement and a device-local **5-minute frequency cap**
  are applied in addition to the AdMob unit-level frequency cap.
- UMP permission is checked before ads load. The policy page provides a native
  link to the UMP privacy options form when opened in the Android TWA.

## Data safety and publishing gates
1. Confirm app ID belongs to `com.ribhlab.tradingfiew`, not any other app.
2. Compile and run app; verify no startup crashes and calendar transition fallback.
3. Build and sign AAB 1.0.3 / code 4 with original upload key; confirm
   package/version, AdMob App ID in merged manifest, and cert fingerprint.
4. Update Play **Ads declaration** to reflect native AdMob interstitials and
   revise **Data Safety** for advertising identifier / technical / diagnostic
   data as necessary, based on SDK and actual provider handling.
5. Review **UMP privacy messaging** in AdMob for supported regions.
6. Upload version 4 to **Internal Testing**, obtain a clean pre-launch report,
   and only then consider Production when Play policy, app review and test
   eligibility are truly satisfied.
7. Check Google Play after each operation. A successful GitHub workflow is
   not proof of public publication.

Reference: https://developers.google.com/admob/android/quick-start
Reference: https://developers.google.com/admob/android/interstitial
Reference: https://developers.google.com/admob/android/privacy
