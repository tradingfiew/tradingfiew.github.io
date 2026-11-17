/* TradingFiew chart sharing.
 * GitHub Pages previews are static, but the URL preserves symbol/timeframe.
 * Private browser drawings are intentionally NEVER encoded into share links.
 */
(function(){
"use strict";
const $=id=>document.getElementById(id);
const BASE="https://tradingfiew.github.io/";
let trigger=null;
function link(){
  const here=new URL(location.href);
  const symbol=here.searchParams.get("symbol")||"XAUUSD";
  const tf=here.searchParams.get("tf")||"1h";
  const url=new URL(BASE);
  if(/^[A-Z0-9]{2,20}$/.test(symbol))url.searchParams.set("symbol",symbol);
  if(["5m","15m","1h","4h","1d"].includes(tf))url.searchParams.set("tf",tf);
  return url.href;
}
function caption(){return "TradingFiew — "+($("pairTitle")?.textContent?.trim()||"Live Markets")+" chart | "+(new URL(location.href).searchParams.get("tf")||"1h").toUpperCase()+" | Free SMC analysis";}
function open(e){
  trigger=e?.currentTarget||$("shareBtn");
  $("shareUrl").value=link();
  $("shareMarketTitle").textContent=($("pairSubtitle")?.textContent?.split(" · ")[0]||"Market")+" · "+($("pairTitle")?.textContent||"XAUUSD");
  $("shareMarketTimeframe").textContent=(new URL(location.href).searchParams.get("tf")||"1h").toUpperCase()+" chart · BOS · CHoCH · FVG · Indicators";
  $("shareModal").classList.remove("hidden");
  $("shareCloseBtn").focus();
}
function close(){
  $("shareModal").classList.add("hidden");
  trigger?.focus?.();
}
function popup(url){
  const tab=window.open(url,"_blank","noopener,noreferrer");
  if(!tab)location.assign(url);
}
async function copy(){
  const input=$("shareUrl"),b=$("shareCopyBtn");
  try{
    if(!navigator.clipboard?.writeText)throw Error("Clipboard API missing");
    await navigator.clipboard.writeText(link());b.textContent="Copied ✓";
  }catch{
    input.focus();input.select();
    try{b.textContent=document.execCommand("copy")?"Copied ✓":"Select and copy link";}catch{b.textContent="Select and copy link";}
  }
}
async function nativeShare(){
  const info={title:"TradingFiew — "+$("pairTitle").textContent.trim(),text:"Free charts and Smart Money analysis",url:link()};
  if(navigator.share){
    try{await navigator.share(info);return;}
    catch(e){if(e?.name==="AbortError")return;}
  }
  await copy();
}
function init(){
  for(const id of ["shareBtn","shareChartBtn"])$(id)?.addEventListener("click",open);
  $("shareCloseBtn")?.addEventListener("click",close);
  $("shareModal")?.addEventListener("click",e=>{if(e.target===$("shareModal"))close();});
  $("shareCopyBtn")?.addEventListener("click",copy);
  $("shareNativeBtn")?.addEventListener("click",nativeShare);
  const actions={
    shareWhatsAppBtn:()=>popup("https://api.whatsapp.com/send?text="+encodeURIComponent(caption()+" "+link())),
    shareTelegramBtn:()=>popup("https://t.me/share/url?url="+encodeURIComponent(link())+"&text="+encodeURIComponent(caption())),
    shareFacebookBtn:()=>popup("https://www.facebook.com/sharer/sharer.php?u="+encodeURIComponent(link())),
    shareXBtn:()=>popup("https://twitter.com/intent/tweet?text="+encodeURIComponent(caption())+"&url="+encodeURIComponent(link()))
  };
  for(const [id,action] of Object.entries(actions))$(id)?.addEventListener("click",action);
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("shareModal").classList.contains("hidden"))close();});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
