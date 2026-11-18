package com.ribhlab.tradingfiew;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import java.util.concurrent.atomic.AtomicBoolean;

/** Native bridge for an EXPLICIT user action in the verified TWA.
 * Never shows an ad on cold launch, mid-chart, scroll, trade or alert.
 * Even when no ad loads, navigation continues immediately. */
public final class NaturalTransitionActivity extends Activity {
    private static final String TAG = "TradingFiewTransition";
    private final AtomicBoolean finished = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri request = getIntent() == null ? null : getIntent().getData();
        if (request == null || !"tradingfiew".equals(request.getScheme())) {
            finish(); return;
        }
        String host = request.getHost();
        if ("open-calendar".equals(host)) {
            AdMobInterstitialController.onNaturalTransition(this, this::resumeCalendar);
        } else if ("privacy-options".equals(host)) {
            AdMobInterstitialController.showPrivacyOptions(this, this::resumeToApp);
        } else {
            finish();
        }
    }

    private void resumeCalendar() {
        // The in-app calendar stays open in Chrome/TWA. The user deliberately
        // requested TradingView's separate full calendar (a natural pause).
        if (!finished.compareAndSet(false,true)) return;
        try {
            Intent external = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://www.tradingview.com/economic-calendar/"));
            external.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(external);
        } catch (RuntimeException error) {
            Log.w(TAG, "External calendar unavailable; leaving existing TWA unchanged", error);
        } finally {
            finish();
        }
    }
    private void resumeToApp() {
        resume("https://tradingfiew.github.io/privacy.html?native=1");
    }
    private void resume(String url) {
        if (!finished.compareAndSet(false,true)) return;
        try {
            Intent intent=new Intent(Intent.ACTION_VIEW, Uri.parse(url), this, LauncherActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        } catch (RuntimeException error) {
            Log.e(TAG, "Cannot return to TWA after native transition", error);
            try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); }
            catch (RuntimeException ignored) {}
        } finally {
            finish();
        }
    }
}
