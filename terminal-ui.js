/* TradingFiew immersive terminal controller.
   Independent per-browser UI preferences; never requires a user account.
   This file handles presentation, not market-data fabrication or trade execution. */
(function(root){
"use strict";
const $=id=>document.getElementById(id);
const Space=root.TradingFiewWorkspace;
const workspace=$("terminal");
const read=(name,fallback)=>{try{return Space?.get("terminal:"+name)||fallback;}catch{return fallback;}};
const save=(name,value)=>{try{Space?.set("terminal:"+name,value);}catch{}};
const mobileViews=["chart","markets","analysis","depth"];
let mobileView="chart";
let marketOpen=true,analysisOpen=true,leftTab="markets";
function resize(){
  root.requestAnimationFrame(()=>{
    root.TradingFiewChartAPI?.resize?.();
    root.requestAnimationFrame(()=>root.TradingFiewChartAPI?.resize?.());
  });
}
function isMobile(){return root.matchMedia("(max-width:730px)").matches;}
function syncPanelLabels(){
  $("toggleMarketsBtn").setAttribute("aria-pressed",String(marketOpen));
  $("toggleAnalysisBtn").setAttribute("aria-pressed",String(analysisOpen));
  $("toggleMarketsBtn").title=marketOpen?"Hide Market Watch":"Show Market Watch";
  $("toggleAnalysisBtn").title=analysisOpen?"Hide Smart Money and Order Book":"Show Smart Money and Order Book";
  workspace.dataset.marketWatch=marketOpen?"open":"collapsed";
  workspace.dataset.analysisPanel=analysisOpen?"open":"collapsed";
}

function setLeftTab(tab,{saveChoice=true}={}){
  if(!["markets","trends","book"].includes(tab))return;
  leftTab=tab;
  workspace.dataset.leftTab=tab;
  for(const item of ["markets","trends","book"]){
    const pane=$("leftPane"+item.charAt(0).toUpperCase()+item.slice(1));
    const button=$("leftPanelTabs").querySelector('[data-left-tab="'+item+'"]');
    const active=item===tab;
    pane.hidden=!active;
    pane.classList.toggle("active",active);
    button.classList.toggle("active",active);
    button.setAttribute("aria-selected",String(active));
    button.tabIndex=active?0:-1;
  }
  if(saveChoice)save("leftTab",tab);
}
function switchView(view){
  if(!mobileViews.includes(view))return;
  mobileView=view;
  workspace.dataset.mobileView=view;
  if(view==="depth")setLeftTab("book",{saveChoice:false});
  else if(view==="markets")setLeftTab("markets",{saveChoice:false});
  document.querySelectorAll("[data-terminal-view]").forEach(button=>{
    const active=button.dataset.terminalView===view;
    button.classList.toggle("selected",active);
    button.setAttribute("aria-pressed",String(active));
  });
  save("mobileView",view);
  resize();
}
function showMarkets(){
  if(isMobile()){switchView("markets");return;}
  marketOpen=!marketOpen;save("marketWatchV2",marketOpen?"open":"collapsed");syncPanelLabels();resize();
}
function showAnalysis(view){
  if(isMobile()){switchView(view||"analysis");return;}
  analysisOpen=!analysisOpen;save("analysisPanel",analysisOpen?"open":"collapsed");syncPanelLabels();resize();
}
function setEvents(open){
  const active=Boolean(open);
  document.body.classList.toggle("terminal-events-open",active);
  $("terminalEventsBtn").setAttribute("aria-pressed",String(active));
  $("terminalEventsBtn").classList.toggle("active",active);
  save("events",active?"true":"false");
  resize();
}
function info(open){
  const modal=$("terminalInfoModal");
  if(!modal)return;
  modal.classList.toggle("hidden",!open);
  if(open)$("terminalInfoCloseBtn").focus();
  else $("terminalInfoBtn").focus();
}
function updateClock(){
  $("terminalClock").textContent=new Date().toLocaleTimeString("en-GB",{timeZone:"UTC",hour12:false})+" UTC";
  const timer=$("candleCountdown"),api=root.TradingFiewChartAPI;
  const countdown=api?.getCandleCountdown?.();
  if(!countdown){timer.textContent="⏱ Waiting for candles";return;}
  timer.textContent=countdown.active?"⏱ "+countdown.text+" to close":
    countdown.status==="paused"?"⏱ Market paused":
    countdown.status==="waiting"?"⏱ Waiting for candles":"⏱ Waiting for current candle";
  api?.refreshPriceBadge?.();
}
function updateBidAsk(e){
  const symbol=e?.detail?.symbol;
  const panel=$("bestQuotePanel");
  const current=root.TradingFiewChartAPI?.getSnapshot?.();
  if(!current||symbol!==current.symbol||current.provider!=="binance"){panel.hidden=true;return;}
  const {bid,ask}=e.detail;
  if(!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<=bid){panel.hidden=true;return;}
  const decimals=bid>=1000?2:bid>=1?4:bid>=.01?6:8;
  const fmt=v=>v.toLocaleString("en-US",{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
  $("bestBidPrice").textContent=fmt(bid);
  $("bestAskPrice").textContent=fmt(ask);
  panel.title="Real Binance Spot best visible bid and ask. Display only; this site does not execute trades.";
  panel.hidden=false;
}
function onMarketChanged(){
  $("bestQuotePanel").hidden=true;
  document.querySelectorAll("#rangePresets [data-range]").forEach(b=>b.classList.remove("selected"));
  updateClock();
}
function activateRangeButton(range){
  document.querySelectorAll("#rangePresets [data-range]").forEach(b=>b.classList.toggle("selected",b.dataset.range===range));
}
function restoreRange(){
  const range=read("chartRange","");
  if(!range)return;
  const ok=root.TradingFiewChartAPI?.setRange?.(range,{silent:true});
  if(ok)activateRangeButton(range);
}
function initialLayout(){
  document.body.classList.add("terminal-mode");
  marketOpen=read("marketWatchV2","open")==="open";
  // On tablets the SMC panel starts folded to keep the chart wide.
  analysisOpen=read("analysisPanel",root.innerWidth<=1100?"collapsed":"open")==="open";
  syncPanelLabels();
  setLeftTab(read("leftTab","markets"),{saveChoice:false});
  const view=read("mobileView","chart");
  switchView(mobileViews.includes(view)?view:"chart");
  setEvents(read("events","false")==="true");
}
function init(){
  initialLayout();
  $("leftPanelTabs").addEventListener("click",e=>{
    const button=e.target.closest("[data-left-tab]");
    if(button)setLeftTab(button.dataset.leftTab);
  });
  $("leftPanelTabs").addEventListener("keydown",e=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
    e.preventDefault();
    const items=["markets","trends","book"];
    const at=items.indexOf(leftTab),next=e.key==="Home"?0:e.key==="End"?2:
      (at+(e.key==="ArrowRight"?1:2))%items.length;
    setLeftTab(items[next]);
    $("leftPanelTabs").querySelector('[data-left-tab="'+items[next]+'"]').focus();
  });
  $("toggleMarketsBtn").addEventListener("click",showMarkets);
  $("toggleAnalysisBtn").addEventListener("click",()=>showAnalysis("analysis"));
  $("terminalMobileDock").addEventListener("click",e=>{
    const btn=e.target.closest("[data-terminal-view]");
    if(btn)switchView(btn.dataset.terminalView);
  });
  $("terminalEventsBtn").addEventListener("click",()=>setEvents(!document.body.classList.contains("terminal-events-open")));
  $("terminalInfoBtn").addEventListener("click",()=>info(true));
  $("terminalInfoCloseBtn").addEventListener("click",()=>info(false));
  $("terminalInfoDoneBtn").addEventListener("click",()=>info(false));
  $("terminalInfoModal").addEventListener("click",e=>{if(e.target===$("terminalInfoModal"))info(false);});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("terminalInfoModal").classList.contains("hidden"))info(false);});
  $("rangePresets").addEventListener("click",e=>{
    const button=e.target.closest("[data-range]");
    if(!button)return;
    const range=button.dataset.range;
    const valid=root.TradingFiewChartAPI?.setRange?.(range);
    if(valid){
      save("chartRange",range);
      activateRangeButton(range);
    }
  });
  $("chartSnapshotBtn").addEventListener("click",()=>root.TradingFiewChartAPI?.saveScreenshot?.());
  document.addEventListener("tradingfiew:orderbook",updateBidAsk);
  document.addEventListener("tradingfiew:market-change",onMarketChanged);
  root.addEventListener("resize",resize,{passive:true});
  root.setInterval(updateClock,1000);
  updateClock();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
else init();
root.TradingFiewTerminalUI=Object.freeze({onMarketChanged,restoreRange,resize,showMarkets,showAnalysis,switchView});
})(window);
