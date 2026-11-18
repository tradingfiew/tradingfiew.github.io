package com.ribhlab.tradingfiew;

import android.os.Bundle;
import android.util.Log;

/** Android TWA entry point: starts live web terminal without any launch ad.
 * UMP consent is checked asynchronously; preload never blocks the TWA. */
public final class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            AdMobInterstitialController.prepareConsent(this);
        } catch (RuntimeException error) {
            // Ads must never prevent trading chart access.
            Log.w("TradingFiew", "Optional advertising setup unavailable", error);
        }
    }
}
