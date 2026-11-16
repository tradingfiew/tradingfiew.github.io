/* TradingFiew AdSense integrations and reserved placements.
 * Verified publisher ID and ads.txt are published for review.
 * DO NOT enable siteReady until TradingFiew is "Ready" in AdSense > Sites.
 * DO NOT enable cmpReady until certified CMP / applicable consent is configured.
 * Provide real AdSense ad unit slot IDs copied from your own AdSense account.
 * Reserved ad placeholders remain visible until activation.
 */
(function(){
"use strict";
const config=Object.freeze({
  publisherId:"ca-pub-7945572016731367",
  siteReady:false,            // must be approved for tradingfiew.github.io
  cmpReady:false,             // certified consent solution / applicable requirements
  units:Object.freeze({
    sidebar:"",               // real data-ad-slot from your own AdSense
    banner:""                 // real data-ad-slot from your own AdSense
  })
});
const validSlot=x=>typeof x==="string"&&/^\d{10}$/.test(x);
function init(){
  if(!config.siteReady||!config.cmpReady)return;
  const containers=[...document.querySelectorAll("[data-ad-placement]")];
  const eligible=containers.map(element=>({
    element,slot:config.units[element.dataset.adPlacement]||""
  })).filter(x=>validSlot(x.slot));
  if(!eligible.length)return;
  const script=document.createElement("script");
  script.async=true;
  script.crossOrigin="anonymous";
  script.src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="+config.publisherId;
  script.addEventListener("load",()=>{
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
      catch(error){console.warn("AdSense unit activation failed",error);element.classList.remove("is-serving");}
    }
  });
  script.addEventListener("error",()=>console.warn("Google AdSense script could not load"));
  document.head.appendChild(script);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
})();
