package com.ribhlab.tradingfiew;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.NonNull;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Only AdMob format used by TradingFiew: native INTERSTITIAL.
 *
 * No banner, native ad, rewarded ad or app-open ad.
 * No automatic ad when launching or while touching chart/alert tools.
 * Show only at a user-requested transition into a separate calendar view.
 * Allow a 60s warm-up, cap at one shown ad / 5 minutes even across process restarts.
 * UMP must authorize ad requests before MobileAds initialization and preload.
 */
public final class AdMobInterstitialController {
    private static final String TAG = "TradingFiewAds";
    private static final long MIN_ENGAGEMENT_MS = 60_000L;
    private static final long MIN_GAP_MS = 300_000L;
    private static final String PREFERENCES = "tradingfiew_ads";
    private static final String LAST_SHOWN = "last_interstitial_wall";
    private static final AtomicBoolean INITIALIZING = new AtomicBoolean(false);
    private static final AtomicBoolean CONSENT_STARTED = new AtomicBoolean(false);
    private static volatile boolean enabled = false;
    private static volatile boolean loading = false;
    private static volatile InterstitialAd cached = null;
    private static long startedElapsed = SystemClock.elapsedRealtime();

    private AdMobInterstitialController() {}

    /** Run on first launcher opening; never delays the Trusted Web Activity. */
    public static void prepareConsent(Activity activity) {
        if (!CONSENT_STARTED.compareAndSet(false, true)) return;
        try {
            ConsentInformation consent = UserMessagingPlatform.getConsentInformation(activity);
            consent.requestConsentInfoUpdate(activity,
                new ConsentRequestParameters.Builder().build(),
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(
                    activity, error -> {
                        if (error != null) Log.w(TAG, "UMP form not completed: " + error.getErrorCode());
                        if (consent.canRequestAds()) startMobileAds(activity);
                    }),
                error -> {
                    Log.w(TAG, "UMP status unavailable: " + error.getErrorCode());
                    // UMP may permit using previously obtained consent.
                    if (consent.canRequestAds()) startMobileAds(activity);
                });
        } catch (RuntimeException error) {
            Log.w(TAG, "Consent setup failed; no advertising request", error);
        }
    }

    private static void startMobileAds(Activity activity) {
        if (!INITIALIZING.compareAndSet(false, true)) return;
        final Context app = activity.getApplicationContext();
        new Thread(() -> {
            try {
                MobileAds.initialize(app, initializationStatus -> {});
                activity.runOnUiThread(() -> {
                    enabled = true;
                    preload(app);
                });
            } catch (RuntimeException error) {
                Log.w(TAG, "AdMob initialization failed; skipping ads", error);
            }
        }, "TradingFiewAdMobInit").start();
    }

    /** Preload at most one interstitial. Never show an advertisement here. */
    private static void preload(Context context) {
        if (!enabled || loading || cached != null) return;
        loading = true;
        InterstitialAd.load(context, BuildConfig.ADMOB_INTERSTITIAL_UNIT_ID,
            new AdRequest.Builder().build(),
            new InterstitialAdLoadCallback() {
                @Override
                public void onAdLoaded(@NonNull InterstitialAd ad) {
                    loading = false;
                    cached = ad;
                }
                @Override
                public void onAdFailedToLoad(@NonNull LoadAdError error) {
                    loading = false;
                    cached = null;
                    Log.d(TAG, "Interstitial not ready: " + error.getCode());
                }
            });
    }

    /** Never block user navigation while loading or waiting for consent. */
    public static void onNaturalTransition(Activity activity, Runnable onContinue) {
        if (!enabled || cached == null) {
            onContinue.run();
            return;
        }
        long engagement = SystemClock.elapsedRealtime() - startedElapsed;
        SharedPreferences prefs = activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        long lastShown = prefs.getLong(LAST_SHOWN, 0L);
        long wallNow = System.currentTimeMillis();
        if (engagement < MIN_ENGAGEMENT_MS ||
            (lastShown > 0 && wallNow >= lastShown && wallNow - lastShown < MIN_GAP_MS) ||
            (lastShown > wallNow)) {
            onContinue.run();
            return;
        }
        final InterstitialAd ad = cached;
        cached = null;
        final AtomicBoolean resumed = new AtomicBoolean(false);
        final Runnable completeOnce = () -> {
            if (resumed.compareAndSet(false, true)) onContinue.run();
            preload(activity.getApplicationContext());
        };
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override
            public void onAdShowedFullScreenContent() {
                prefs.edit().putLong(LAST_SHOWN, System.currentTimeMillis()).apply();
            }
            @Override
            public void onAdDismissedFullScreenContent() { completeOnce.run(); }
            @Override
            public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                Log.w(TAG, "Interstitial failed to display: " + error.getCode());
                completeOnce.run();
            }
        });
        try { ad.show(activity); }
        catch (RuntimeException error) {
            Log.w(TAG, "Interstitial show failed; continue normally", error);
            completeOnce.run();
        }
    }

    public static void showPrivacyOptions(Activity activity, Runnable onContinue) {
        try {
            ConsentInformation info = UserMessagingPlatform.getConsentInformation(activity);
            if (info.getPrivacyOptionsRequirementStatus() !=
                ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED) {
                onContinue.run(); return;
            }
            UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {
                if (error != null) Log.w(TAG, "Privacy options form failed: " + error.getErrorCode());
                onContinue.run();
            });
        } catch (RuntimeException error) {
            Log.w(TAG, "Privacy form unavailable", error);
            onContinue.run();
        }
    }
}
