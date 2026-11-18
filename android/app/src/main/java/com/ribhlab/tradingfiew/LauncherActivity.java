package com.ribhlab.tradingfiew;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.TextView;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;
import java.io.ByteArrayInputStream;

/** Native ad layout: web terminal above an anchored banner, never overlapping it. */
public final class LauncherActivity extends Activity {
    private static final String HOME = "https://tradingfiew.github.io/";
    private static final long AD_INTERVAL_MS = 300_000L;
    private WebView web;
    private FrameLayout bannerSlot;
    private AdView banner;
    private InterstitialAd interstitial;
    private ConsentInformation consent;
    private boolean adsStarted, loadingInterstitial, destroyed, resumed;
    private long startedAt, loadedAt;
    private int bannerWidth;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        startedAt = SystemClock.elapsedRealtime();
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(11,20,36));
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(
                    WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        LinearLayout toolbar = new LinearLayout(this);
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = new TextView(this);
        title.setText("TradingFiew"); title.setTextColor(Color.WHITE); title.setTextSize(16);
        title.setPadding(dp(12),0,0,0);
        toolbar.addView(title,new LinearLayout.LayoutParams(0,dp(40),1));
        Button menu = new Button(this); menu.setText("⋮"); menu.setContentDescription("App menu and privacy choices");
        menu.setOnClickListener(v -> showMenu(menu));
        toolbar.addView(menu,new LinearLayout.LayoutParams(dp(48),dp(40)));
        root.addView(toolbar);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(11,20,36));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString()+" TradingFiewAndroid/1.0.0");
        CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) {
                if (!r.isForMainFrame()) return false;
                Uri uri = r.getUrl();
                if (isOwnPage(uri)) return false;
                if ("https".equals(uri.getScheme())) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,uri)); } catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r) {
                String host=r.getUrl().getHost();
                // Android uses AdMob only. Never run the website's AdSense or vignette ads.
                if (host != null && (host.equals("googlesyndication.com") || host.endsWith(".googlesyndication.com")
                    || host.equals("doubleclick.net") || host.endsWith(".doubleclick.net")
                    || host.equals("googleadservices.com") || host.endsWith(".googleadservices.com")))
                    return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));
                return null;
            }
            @Override public void onPageFinished(WebView v,String url) {
                if (!isOwnPage(Uri.parse(url))) return;
                v.evaluateJavascript("(()=>{const s=document.createElement('style');s.textContent='.ad-sidebar,.ad-mobile-banner,.ad-reserved,ins.adsbygoogle{display:none!important}';document.head.appendChild(s)})()",null);
            }
        });
        root.addView(web,new LinearLayout.LayoutParams(-1,0,1));
        bannerSlot = new FrameLayout(this);
        root.addView(bannerSlot,new LinearLayout.LayoutParams(-1,-2));
        bannerSlot.addOnLayoutChangeListener((v,l,t,r,b,ol,ot,or,ob) -> {
            int width = Math.round((r-l)/getResources().getDisplayMetrics().density);
            if (width>0 && width != bannerWidth && adsStarted) { bannerWidth=width; loadBanner(); }
        });
        setContentView(root);
        if (state == null || web.restoreState(state)==null) web.loadUrl(HOME);
        consent = UserMessagingPlatform.getConsentInformation(this);
        consent.requestConsentInfoUpdate(this,new ConsentRequestParameters.Builder().build(),
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(this,error -> startAdsIfAllowed()),
            error -> startAdsIfAllowed());
        startAdsIfAllowed();
    }
    private boolean isOwnPage(Uri uri) {
        return "https".equals(uri.getScheme()) && "tradingfiew.github.io".equals(uri.getHost());
    }
    private void startAdsIfAllowed() {
        if (destroyed || adsStarted || !consent.canRequestAds()) return;
        adsStarted=true;
        MobileAds.initialize(this,status -> runOnUiThread(() -> {
            if (destroyed || !consent.canRequestAds()) return;
            bannerWidth=Math.round(bannerSlot.getWidth()/getResources().getDisplayMetrics().density);
            if (bannerWidth>0) loadBanner();
            loadInterstitial();
        }));
    }
    private void loadBanner() {
        if (destroyed || !consent.canRequestAds() || bannerWidth<=0) return;
        if (banner!=null) { bannerSlot.removeView(banner); banner.destroy(); }
        banner=new AdView(this);
        banner.setAdUnitId(BuildConfig.BANNER_ID);
        banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this,bannerWidth));
        bannerSlot.addView(banner,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));
        banner.loadAd(new AdRequest.Builder().build());
    }
    private void loadInterstitial() {
        if (destroyed || loadingInterstitial || interstitial!=null || !consent.canRequestAds()) return;
        loadingInterstitial=true;
        InterstitialAd.load(this,BuildConfig.INTERSTITIAL_ID,new AdRequest.Builder().build(),new InterstitialAdLoadCallback() {
            @Override public void onAdLoaded(InterstitialAd ad) {
                loadingInterstitial=false;
                if (!destroyed && consent.canRequestAds()) { interstitial=ad; loadedAt=SystemClock.elapsedRealtime(); }
            }
            @Override public void onAdFailedToLoad(LoadAdError e) { loadingInterstitial=false; }
        });
    }
    /** Only called after the user finishes the About screen and chooses Return to chart. */
    private void finishAbout() {
        long last=getPreferences(MODE_PRIVATE).getLong("last_interstitial",0);
        if (!resumed || destroyed || !consent.canRequestAds() || SystemClock.elapsedRealtime()-startedAt<AD_INTERVAL_MS
            || System.currentTimeMillis()-last<AD_INTERVAL_MS) return;
        if (interstitial==null) { loadInterstitial(); return; }
        if (SystemClock.elapsedRealtime()-loadedAt>3_600_000L) { interstitial=null; loadInterstitial(); return; }
        InterstitialAd ad=interstitial; interstitial=null;
        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
            @Override public void onAdShowedFullScreenContent() { getPreferences(MODE_PRIVATE).edit().putLong("last_interstitial",System.currentTimeMillis()).apply(); }
            @Override public void onAdDismissedFullScreenContent() { loadInterstitial(); }
            @Override public void onAdFailedToShowFullScreenContent(AdError e) { loadInterstitial(); }
        });
        ad.show(this);
    }
    private void showMenu(View anchor) {
        PopupMenu menu=new PopupMenu(this,anchor);
        menu.getMenu().add(0,1,0,"About TradingFiew");
        menu.getMenu().add(0,2,1,"Privacy policy");
        if (consent.getPrivacyOptionsRequirementStatus()==ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED)
            menu.getMenu().add(0,3,2,"Privacy choices");
        menu.getMenu().add(0,4,3,"Reload chart");
        menu.setOnMenuItemClickListener(item -> {
            switch(item.getItemId()) {
                case 1: new AlertDialog.Builder(this).setTitle("TradingFiew")
                    .setMessage("Market education and technical research. Not investment advice or trade execution. Independent of TradingView. Non-crypto quotes may be indicative or delayed. Alerts require the app to remain open; background delivery is not guaranteed.")
                    .setPositiveButton("Return to chart",(d,w)->finishAbout()).show(); break;
                case 2: startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(HOME+"privacy.html"))); break;
                case 3:
                    if (banner!=null) { bannerSlot.removeView(banner); banner.destroy(); banner=null; }
                    interstitial=null;
                    UserMessagingPlatform.showPrivacyOptionsForm(this,error -> {
                        if (consent.canRequestAds()) { if (!adsStarted) startAdsIfAllowed(); else { loadBanner(); loadInterstitial(); } }
                    }); break;
                case 4: web.reload(); break;
                default: return false;
            }
            return true;
        }); menu.show();
    }
    private int dp(int n) { return Math.round(n*getResources().getDisplayMetrics().density); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onResume() { super.onResume(); resumed=true; if(web!=null)web.onResume(); if(banner!=null)banner.resume(); }
    @Override protected void onPause() { resumed=false; if(banner!=null)banner.pause(); if(web!=null)web.onPause(); super.onPause(); }
    @Override public void onBackPressed() { if(web.canGoBack())web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { destroyed=true; if(banner!=null)banner.destroy(); if(web!=null)web.destroy(); interstitial=null; super.onDestroy(); }
}
