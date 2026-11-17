/* TradingFiew AdSense policy.
 * Desktop: inline ad placements may be activated only after AdSense approval,
 * appropriate consent and valid AdSense slot IDs are confirmed.
 * Mobile browsers and Android TWA: only Google AdSense Auto Ads VIGNETTES
 * (full-screen interstitials) are permitted. NO banner, anchor, in-page,
 * side rail, intent, or manually injected inline advertising on mobile.
 *
 * IMPORTANT: HTML/JavaScript cannot reliably restrict the ad formats that
 * AdSense Auto Ads delivers. The AdSense account/site settings must be set
 * to Vignette-only before mobile delivery can be enabled by an operator.
 * Keep mobileVignetteOnlyConfirmed false until that independent check.
 */
(function(){
"use strict";
const config=Object.freeze({
  publisherId:"ca-pub-7945572016731367",
  siteReady:false,             // Only after AdSense > Sites says Ready.
  cmpReady:false,              // Only after the necessary consent setup.
  mobileVignetteOnlyConfirmed:false,
  units:Object.freeze({
    sidebar:"",
    banner:""
  })
});
const validSlot=x=>typeof x==="string"&&/^\d{10}$/.test(x);
function isMobile(){
  const ua=navigator.userAgent||"";
  const pointer=window.matchMedia?.("(pointer: coarse)")?.matches===true;
  const compact=window.matchMedia?.("(max-width: 730px)")?.matches===true;
  const androidTwa=(document.referrer||"").startsWith("android-app://");
  return compact||pointer||androidTwa||/Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}
function removeMobilePlacements(){
  document.querySelectorAll("[data-ad-placement]").forEach(element=>{
    element.setAttribute("hidden","");
    element.setAttribute("aria-hidden","true");
    element.classList.remove("is-serving");
    element.replaceChildren();
  });
}
function loadAdSense(onLoad){
  const script=document.createElement("script");
  script.async=true;
  script.crossOrigin="anonymous";
  script.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="+config.publisherId;
  if(typeof onLoad==="function")script.addEventListener("load",onLoad,{once:true});
  script.addEventListener("error",()=>console.warn("TradingFiew: AdSense script unavailable"),{once:true});
  document.head.appendChild(script);
}
function init(){
  if(isMobile()){
    // This is enforced even while ads are disabled/pending approval so there
    // are never empty advertisement placeholders occupying the phone screen.
    removeMobilePlacements();
    if(!config.siteReady||!config.cmpReady||!config.mobileVignetteOnlyConfirmed)return;
    // ONLY the Auto Ads loader: never create <ins class="adsbygoogle"> here.
    // AdSense site-level Auto Ads must be VIGNETTES ONLY for mobile.
    loadAdSense();
    return;
  }
  if(!config.siteReady||!config.cmpReady)return;
  const eligible=[...document.querySelectorAll("[data-ad-placement]")].map(element=>({
    element,slot:config.units[element.dataset.adPlacement]||""
  })).filter(x=>validSlot(x.slot));
  if(!eligible.length)return;
  loadAdSense(()=>{
    for(const {element,slot} of eligible){
      const ins=document.createElement("ins");
      ins.className="adsbygoogle";
      ins.style.display="block";
      ins.setAttribute("data-ad-client",config.publisherId);
      ins.setAttribute("data-ad-slot",slot);
      ins.setAttribute("data-ad-format","auto");
      ins.setAttribute("data-full-width-responsive","true");
      element.appendChild(ins);
      element.classList.add("is-serving");
      try{(window.adsbygoogle=window.adsbygoogle||[]).push({});}
      catch(error){
        console.warn("TradingFiew: AdSense desktop placement failed",error);
        element.classList.remove("is-serving");
      }
    }
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
})();