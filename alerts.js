/* TradingFiew Alerts v1: optional SMC breakout scenarios and locally stored
   custom price / SMC alerts. No backend or account. Monitoring needs an active
   browser page; no promise of delivery after the browser is fully closed.
   Notification permission always comes from explicit user action.
*/
(function(root){
"use strict";
const $=id=>document.getElementById(id);
const Space=root.TradingFiewWorkspace;
const Markets=root.TradingFiewMarkets;
const SMC=root.TradingFiewSMCBreakouts;
const Engine=root.SmcEngine;
const ALERTS_KEY="marketAlerts:v1";
const HISTORY_KEY="marketAlertsHistory:v1";
const SETTING_KEY="marketAlertSettings:v1";
const LIMITS=Object.freeze({history:80});
const CONDITIONS={
  price_above:"Price crosses above",
  price_below:"Price crosses below",
  smc_any:"Any confirmed SMC break",
  smc_red:"Red SMC supply zone breaks up",
  smc_green:"Green SMC demand zone breaks down"
};
const tfs=["5m","15m","1h","4h","1d"];
let alerts=[],history=[];
let settings={smcEnabled:false,sound:true,notify:false};
let shown=false,initialised=false,serviceWorker=null,audioContext=null;
const priorPrices=new Map(),priorAnalyses=new Map(),firedSmc=new Set();
let monitoring=false,monitorCursor=0,smcCursor=0,lastWarningAt=0,requestingPermission=false;
const money=(v)=>{
  if(!Number.isFinite(v))return "—";
  return v.toLocaleString("en-US",{maximumFractionDigits:v<1?8:v<100?5:2});
};
const date=(t)=>new Date(t).toLocaleString("en-GB",{hour:"2-digit",minute:"2-digit",month:"short",day:"numeric"});
const active=()=>alerts.filter(a=>a.enabled&&!a.triggered);
function validAlert(a){
  return !!a&&typeof a.id==="string"&&a.id.length<100&&
    !!Markets?.get(a.symbol)&&Object.hasOwn(CONDITIONS,a.condition)&&
    typeof a.enabled==="boolean"&&
    (a.condition.startsWith("smc")?tfs.includes(a.tf):Number.isFinite(a.target)&&a.target>0);
}
function restore(){
  const stored=Space?.getJSON(ALERTS_KEY,[])||[];
  alerts=Array.isArray(stored)?stored.filter(validAlert):[];
  const oldHistory=Space?.getJSON(HISTORY_KEY,[])||[];
  history=Array.isArray(oldHistory)?oldHistory.filter(x=>x&&typeof x==="object").slice(0,LIMITS.history):[];
  const old=Space?.getJSON(SETTING_KEY,{})||{};
  settings={
    smcEnabled:old.smcEnabled===true,
    sound:old.sound!==false,
    notify:old.notify===true
  };
}
function persist(){
  if(!Space?.setJSON(ALERTS_KEY,alerts)){
    toast("Could not save alerts — browser storage might be blocked or full.",true);
    return false;
  }
  return true;
}
function saveSettings(){Space?.setJSON(SETTING_KEY,settings);}
function rememberEvent(item){
  history.unshift(item);
  history=history.slice(0,LIMITS.history);
  Space?.setJSON(HISTORY_KEY,history);
  renderHistory();
}
function toast(message,error=false){
  const box=$("toast");
  if(!box)return;
  box.textContent=message;
  box.classList.add("show");
  if(error)box.classList.add("error");else box.classList.remove("error");
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>box.classList.remove("show"),5500);
}
function newId(){
  return root.crypto?.randomUUID?.()||
    ("alert-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2));
}
function controlLabel(alert){
  return alert.condition.startsWith("price")?
    CONDITIONS[alert.condition]+" "+money(alert.target):
    CONDITIONS[alert.condition]+" · "+alert.tf.toUpperCase();
}
function list(){
  const container=$("alertsList");
  if(!container)return;
  container.replaceChildren();
  $("alertsCount").textContent=String(active().length);
  $("alertsTotalBadge").textContent=String(alerts.length);
  $("alertsActiveSummary").textContent=active().length+" active";
  $("alertsDeleteAllBtn").disabled=alerts.length===0;
  if(!alerts.length){
    const empty=document.createElement("p");
    empty.className="alerts-empty";
    empty.textContent="No alerts yet. Choose a market and condition above.";
    container.appendChild(empty);
    return;
  }
  for(const a of alerts.slice().reverse()){
    const row=document.createElement("div");row.className="alert-item";
    if(!a.enabled||a.triggered)row.classList.add("muted");
    const body=document.createElement("div");body.className="alert-item-body";
    const heading=document.createElement("strong");heading.textContent=a.symbol;
    const detail=document.createElement("span");detail.textContent=controlLabel(a);
    const meta=document.createElement("small");
    meta.textContent=a.triggered?"TRIGGERED · "+date(a.lastFiredAt||a.created):
      a.enabled?"ACTIVE"+(a.repeat?" · Repeating":" · Once"):"PAUSED";
    body.append(heading,detail,meta);
    const buttons=document.createElement("div");buttons.className="alert-item-actions";
    const toggle=document.createElement("button");toggle.type="button";
    toggle.dataset.alertAction="toggle";toggle.dataset.alertId=a.id;
    toggle.textContent=a.enabled&&!a.triggered?"Pause":"Resume";
    toggle.setAttribute("aria-label",(a.enabled&&!a.triggered?"Pause ":"Resume ")+a.symbol+" alert");
    const remove=document.createElement("button");remove.type="button";
    remove.dataset.alertAction="delete";remove.dataset.alertId=a.id;
    remove.className="alert-remove";remove.textContent="Delete";
    remove.setAttribute("aria-label","Delete "+a.symbol+" "+controlLabel(a)+" alert");
    buttons.append(toggle,remove);row.append(body,buttons);
    container.appendChild(row);
  }
}
function renderHistory(){
  const container=$("alertsHistoryList");
  if(!container)return;
  container.replaceChildren();
  if(!history.length){
    const empty=document.createElement("span");empty.className="alerts-empty";
    empty.textContent="No triggered alerts in this browser.";
    container.appendChild(empty);return;
  }
  for(const event of history.slice(0,25)){
    const line=document.createElement("div");line.className="alert-history-entry";
    const when=document.createElement("small");when.textContent=date(event.at);
    const body=document.createElement("span");body.textContent=event.text;
    line.append(when,body);container.appendChild(line);
  }
}
function renderSettings(){
  $("smcBreakoutEnabled").checked=settings.smcEnabled;
  $("toggleBreakoutAlerts").checked=settings.smcEnabled;
  $("alertsSoundEnabled").checked=settings.sound;
  $("alertsNotificationsEnabled").checked=settings.notify;
  $("smcBreakoutStatus").textContent=settings.smcEnabled?
    "Active · watching confirmed SMC zone breaks":"Off — enable to receive new alerts";
  const permission=!("Notification" in root)?"Not supported in this browser":
    Notification.permission==="granted"?"Allowed — works while this site is running":
    Notification.permission==="denied"?"Blocked — change this site's permission in browser settings":
    "Not allowed yet — tap Allow notifications";
  $("alertsPermissionStatus").textContent=permission+
    ". Alerts cannot be delivered after TradingFiew is fully closed without a push service.";
}
function updateForm(){
  const kind=$("alertCondition").value,smc=kind.startsWith("smc");
  $("alertTargetWrap").hidden=smc;
  $("alertTfWrap").hidden=!smc;
  $("alertTarget").required=!smc;
  const repeat=$("alertRepeat");
  if(smc){repeat.checked=false;repeat.disabled=true;}
  else repeat.disabled=false;
}
function defaultsFromChart(){
  const snap=root.TradingFiewChartAPI?.getSnapshot?.();
  if(snap&&Markets.get(snap.symbol)){
    $("alertSymbol").value=snap.symbol;
    $("alertTf").value=tfs.includes(snap.tf)?snap.tf:"1h";
  }
  $("alertTarget").value="";
  updateForm();
}
function open(){
  shown=true;defaultsFromChart();list();renderSettings();renderHistory();
  $("alertsModal").classList.remove("hidden");
  $("alertsCloseBtn").focus();
}
function close(){
  shown=false;$("alertsModal").classList.add("hidden");
  $("alertsBtn").focus();
}
async function prepareServiceWorker(){
  if(!("serviceWorker" in navigator)||!root.isSecureContext)return null;
  try{
    if(!serviceWorker)serviceWorker=await navigator.serviceWorker.register("./alerts-sw.js",{scope:"./"});
    return serviceWorker;
  }catch(e){console.warn("Notification service worker unavailable",e);return null;}
}
async function permission(){
  if(requestingPermission)return;
  requestingPermission=true;
  try{
    if(!("Notification" in root)){toast("Phone notifications are unavailable in this browser.",true);return;}
    if(Notification.permission==="denied"){
      toast("Notifications were blocked. Allow this site in browser settings.",true);return;
    }
    const permitted=Notification.permission==="granted"?"granted":await Notification.requestPermission();
    settings.notify=permitted==="granted";
    saveSettings();
    if(settings.notify){
      await prepareServiceWorker();
      toast("Notifications enabled when TradingFiew is running.");
    }else toast("Notification permission was not granted.",true);
  }catch(error){toast("Could not enable browser notifications: "+error.message,true);}
  finally{requestingPermission=false;renderSettings();}
}
function beep(){
  if(!settings.sound)return;
  try{
    const Ctx=root.AudioContext||root.webkitAudioContext;
    if(!Ctx)return;
    audioContext=audioContext||new Ctx();
    if(audioContext.state==="suspended")void audioContext.resume();
    const start=audioContext.currentTime;
    for(const [i,f] of [740,960,780].entries()){
      const osc=audioContext.createOscillator(),gain=audioContext.createGain();
      osc.type="sine";osc.frequency.value=f;
      gain.gain.setValueAtTime(.0001,start+i*.17);
      gain.gain.exponentialRampToValueAtTime(.16,start+i*.17+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,start+i*.17+.14);
      osc.connect(gain);gain.connect(audioContext.destination);
      osc.start(start+i*.17);osc.stop(start+i*.17+.15);
    }
  }catch(e){console.warn("Browser sound could not start",e);}
}
async function notify(title,body,url){
  if(!settings.notify||!("Notification" in root)||Notification.permission!=="granted")return;
  const options={body,tag:"tradingfiew-"+Date.now(),data:{url:url||"./"},silent:false};
  try{
    const sw=await prepareServiceWorker();
    if(sw?.showNotification){await sw.showNotification(title,options);return;}
    const notification=new Notification(title,options);
    notification.onclick=()=>{root.focus();root.location.assign(url||"./");};
  }catch(error){
    if(Date.now()-lastWarningAt>60000){
      lastWarningAt=Date.now();
      console.warn("Notification delivery unavailable",error);
    }
  }
}
function emit(title,detail,{sound=true,notifyUser=true,symbol,tf}={}){
  const url=new URL("./",location.href);
  if(symbol)url.searchParams.set("symbol",symbol);
  if(tfs.includes(tf))url.searchParams.set("tf",tf);
  const text=title+" · "+detail;
  toast(text);
  rememberEvent({text,at:Date.now()});
  if(sound)beep();
  if(notifyUser)void notify("TradingFiew: "+title,detail,url.href);
}
function evaluatePrice(symbol,price,{fresh=true}={}){
  if(!Markets?.get(symbol)||!Number.isFinite(price)||price<=0||!fresh)return;
  const old=priorPrices.get(symbol);
  priorPrices.set(symbol,price);
  if(!Number.isFinite(old)||old===price)return;
  let changed=false;
  for(const a of alerts){
    if(!a.enabled||a.triggered||a.symbol!==symbol||!a.condition.startsWith("price"))continue;
    const crossed=a.condition==="price_above"?old<=a.target&&price>a.target:
      old>=a.target&&price<a.target;
    if(!crossed)continue;
    if(!a.repeat)a.triggered=true;
    a.lastFiredAt=Date.now();a.firedCount=(a.firedCount||0)+1;
    emit(symbol+" price "+(a.condition==="price_above"?"above":"below")+" "+money(a.target),
      "Last observed "+money(price)+" · price sources can be indicative or delayed.",{
        symbol,sound:a.sound,notifyUser:a.notify
      });
    changed=true;
  }
  if(changed){persist();list();}
}
function signalMatches(alert,signal){
  return alert.condition==="smc_any"||
    alert.condition==="smc_red"&&signal.zoneColor==="red"||
    alert.condition==="smc_green"&&signal.zoneColor==="green";
}
function showSmc(signal,symbol,tf){
  const formatted=SMC?.format(signal,money);
  if(!formatted)return;
  $("smcBreakoutResult").hidden=false;
  $("smcBreakoutAction").textContent=formatted.action;
  $("smcBreakoutAction").className=signal.type==="bull"?"smc-up":"smc-down";
  $("smcBreakoutTime").textContent=tf.toUpperCase()+" · "+date(signal.time*1000);
  $("smcBreakoutHeadline").textContent=formatted.headline;
  $("smcBreakoutReason").textContent=formatted.reason;
  $("smcBreakoutPlan").textContent=formatted.plan;
  $("smcBreakoutContext").textContent=formatted.context;
  $("smcBreakoutStatus").textContent="Confirmed candle break · "+date(signal.time*1000);
  $("smcBreakoutBanner").classList.remove("hidden");
  $("smcBannerAction").textContent=formatted.action+" · "+symbol+" "+tf.toUpperCase();
  $("smcBannerReason").textContent=formatted.reason;
  $("smcBannerPlan").textContent=formatted.plan;
}
function evaluateAnalysis(symbol,tf,analysis,closed){
  if(!SMC||!Array.isArray(closed)||closed.length<2||!analysis||!Markets?.get(symbol))return;
  const last=closed.at(-1),previous=closed.at(-2),key=symbol+":"+tf;
  const old=priorAnalyses.get(key);
  const zones=Array.isArray(analysis.activeZones)?analysis.activeZones:[];
  const snapshot={lastTime:last.time,zones:zones.map(z=>({...z})),atr:analysis.atr,structure:analysis.direction};
  priorAnalyses.set(key,snapshot);
  if(!old||!Number.isFinite(old.lastTime)||last.time<=old.lastTime)return;
  if(!Number.isFinite(previous.time)||previous.time<old.lastTime)return;
  const signal=SMC.detect({
    zones:old.zones,previous,latest:last,atr:analysis.atr,
    structure:analysis.direction
  });
  if(!signal)return;
  const eventId=key+":"+signal.id;
  if(firedSmc.has(eventId))return;
  firedSmc.add(eventId);
  if(firedSmc.size>300)firedSmc.clear();
  const activeChart=root.TradingFiewChartAPI?.getSnapshot?.();
  if(settings.smcEnabled&&activeChart?.symbol===symbol&&activeChart?.tf===tf){
    showSmc(signal,symbol,tf);
    const formatted=SMC.format(signal,money);
    emit(formatted.action+" · "+symbol,formatted.headline+". "+formatted.plan,{
      sound:true,notifyUser:true,symbol,tf
    });
  }
  let changed=false;
  for(const a of alerts){
    if(!a.enabled||a.triggered||a.symbol!==symbol||a.tf!==tf||!a.condition.startsWith("smc")||!signalMatches(a,signal))continue;
    a.triggered=true;a.lastFiredAt=Date.now();a.firedCount=(a.firedCount||0)+1;
    const formatted=SMC.format(signal,money);
    emit(symbol+" "+tf.toUpperCase()+" "+formatted.action,
      formatted.reason+" "+formatted.plan,{sound:a.sound,notifyUser:a.notify,symbol,tf});
    changed=true;
  }
  if(changed){persist();list();}
}
function create(event){
  event.preventDefault();
  const symbol=$("alertSymbol").value,condition=$("alertCondition").value,
    target=Number($("alertTarget").value),tf=$("alertTf").value;
  const isSmc=condition.startsWith("smc");
  if(!Markets.get(symbol)||!Object.hasOwn(CONDITIONS,condition)){
    toast("Choose a valid market and condition.",true);return;
  }
  if(!isSmc&&(!Number.isFinite(target)||target<=0)){
    toast("Enter a valid price above zero.",true);return;
  }
  const a={
    id:newId(),symbol,condition,tf:isSmc?tf:"",
    target:isSmc?null:target,repeat:isSmc?false:$("alertRepeat").checked,
    enabled:true,triggered:false,sound:$("alertSound").checked,
    notify:$("alertNotify").checked,created:Date.now(),lastFiredAt:0,firedCount:0
  };
  if(!validAlert(a)){toast("Alert settings are invalid.",true);return;}
  alerts.push(a);
  if(!persist()){alerts.pop();return;}
  list();toast("Alert created for "+symbol+". It will trigger on the next matching crossing.");
  // Explicit user interaction can unlock AudioContext without making sound now.
  if(settings.sound){try{const Ctx=root.AudioContext||root.webkitAudioContext;
      if(Ctx){audioContext=audioContext||new Ctx();if(audioContext.state==="suspended")void audioContext.resume();}
    }catch{}}
  $("alertCreateForm").reset();
  $("alertSymbol").value=symbol;
  $("alertTf").value=tf;
  updateForm();
}
function changeAlert(id,action){
  const a=alerts.find(x=>x.id===id);
  if(!a)return;
  if(action==="delete"){
    alerts=alerts.filter(x=>x!==a);
    toast("Alert deleted.");
  }else if(action==="toggle"){
    a.enabled=!a.enabled;
    if(a.enabled)a.triggered=false;
    toast(a.enabled?"Alert resumed.":"Alert paused.");
  }else return;
  persist();list();
}
function populateMarkets(){
  const select=$("alertSymbol");select.replaceChildren();
  const groups=new Map();
  for(const market of Markets.instruments){
    const name=market.category||"other";
    if(!groups.has(name))groups.set(name,[]);
    groups.get(name).push(market);
  }
  for(const [category,items] of groups){
    const optgroup=document.createElement("optgroup");
    optgroup.label=category.toUpperCase();
    for(const item of items){
      const opt=document.createElement("option");
      opt.value=item.symbol;opt.textContent=item.symbol+" · "+item.name;
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
}
function bind(){
  populateMarkets();restore();renderSettings();list();renderHistory();updateForm();
  for(const id of ["alertsBtn","alertsChartBtn","smcManageAlertsBtn"]){
    $(id)?.addEventListener("click",open);
  }
  $("alertsCloseBtn").addEventListener("click",close);
  $("alertsModal").addEventListener("click",e=>{if(e.target===$("alertsModal"))close();});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&shown)close();});
  $("alertCondition").addEventListener("change",updateForm);
  $("alertCreateForm").addEventListener("submit",create);
  $("alertsList").addEventListener("click",e=>{
    const button=e.target.closest("[data-alert-action]");
    if(button)changeAlert(button.dataset.alertId,button.dataset.alertAction);
  });
  $("alertsDeleteAllBtn").addEventListener("click",()=>{
    if(!alerts.length)return;
    if(!confirm("Delete all "+alerts.length+" saved alerts from this browser?"))return;
    alerts=[];persist();list();toast("All alerts deleted.");
  });
  $("alertsClearHistoryBtn").addEventListener("click",()=>{
    history=[];Space?.setJSON(HISTORY_KEY,history);renderHistory();
  });
  $("smcBreakoutEnabled").addEventListener("change",e=>{
    settings.smcEnabled=e.target.checked;
    saveSettings();renderSettings();
  });
  $("toggleBreakoutAlerts").addEventListener("change",e=>{
    settings.smcEnabled=e.target.checked;
    saveSettings();renderSettings();
  });
  $("smcBannerCloseBtn").addEventListener("click",()=>{$("smcBreakoutBanner").classList.add("hidden");});
  $("alertsSoundEnabled").addEventListener("change",e=>{
    settings.sound=e.target.checked;saveSettings();renderSettings();
    if(settings.sound)beep();
  });
  $("alertsTestSoundBtn").addEventListener("click",()=>{
    if(!settings.sound){settings.sound=true;saveSettings();renderSettings();}
    beep();
  });
  $("alertsNotificationsEnabled").addEventListener("change",e=>{
    settings.notify=e.target.checked&&"Notification" in root&&Notification.permission==="granted";
    saveSettings();renderSettings();
    if(e.target.checked&&!settings.notify)toast("Tap Allow notifications to grant permission.",true);
  });
  $("alertsEnableNotificationsBtn").addEventListener("click",permission);
  if(settings.notify)void prepareServiceWorker();
  void beginOtherMarkets();
}
async function beginOtherMarkets(){
  if(monitoring)return;
  monitoring=true;
  // Group many alerts by symbol/TF so repeated alerts don't create redundant API
  // traffic. Round-robin throttling limits load on public providers.
  async function checkOtherPrices(){
    const snap=root.TradingFiewChartAPI?.getSnapshot?.();
    const otherSymbols=[...new Set(active().filter(a=>a.condition.startsWith("price")&&a.symbol!==snap?.symbol).map(a=>a.symbol))];
    if(!otherSymbols.length)return;
    const selection=[];
    for(let i=0;i<Math.min(8,otherSymbols.length);i++){
      selection.push(otherSymbols[(monitorCursor+i)%otherSymbols.length]);
    }
    monitorCursor=(monitorCursor+selection.length)%otherSymbols.length;
    await Promise.allSettled(selection.map(async symbol=>{
      try{
        const t=await Markets.quote(symbol);
        if(t.marketState==="closed"||t.stale||!Number.isFinite(t.price))return;
        evaluatePrice(symbol,t.price,{fresh:true});
      }catch{}
    }));
  }
  async function checkOtherSmc(){
    const snap=root.TradingFiewChartAPI?.getSnapshot?.();
    const pairs=[...new Set(active().filter(a=>a.condition.startsWith("smc")&&(a.symbol!==snap?.symbol||a.tf!==snap.tf)).map(a=>a.symbol+":"+a.tf))];
    if(!pairs.length)return;
    const selection=[];
    for(let i=0;i<Math.min(3,pairs.length);i++){
      selection.push(pairs[(smcCursor+i)%pairs.length]);
    }
    smcCursor=(smcCursor+selection.length)%pairs.length;
    await Promise.allSettled(selection.map(async pair=>{
      const [symbol,tf]=pair.split(":");
      try{
        const candles=await Markets.candles(symbol,tf,200);
        const provider=Markets.get(symbol)?.provider;
        const closed=provider==="binance"?candles.slice(0,-1):candles.filter(c=>!c.isOpen);
        if(closed.length<65)return;
        const analysis=Engine.calculate(closed);
        evaluateAnalysis(symbol,tf,analysis,closed);
      }catch{}
    }));
  }
  // Browser throttling and public-feed rate limits can delay updates.
  root.setInterval(()=>{void checkOtherPrices();},30000);
  root.setInterval(()=>{void checkOtherSmc();},60000);
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);
else bind();
root.TradingFiewAlerts=Object.freeze({
  onPrice:(symbol,price,options)=>evaluatePrice(symbol,price,options),
  onAnalysis:(symbol,tf,analysis,closed)=>evaluateAnalysis(symbol,tf,analysis,closed),
  open,close
});
})(window);