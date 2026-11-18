/* TradingFiew scheduled price notices.
 * A static GitHub Pages site cannot wake a fully closed browser. This feature
 * monitors only while a tab/TWA is running; never promise background push.
 */
(function(root){
"use strict";
const $=id=>document.getElementById(id),Market=root.TradingFiewMarkets,
  Store=root.TradingFiewWorkspace,Clock=root.TradingFiewPriceScheduleCore;
const KEY="scheduledPrices:v1",LIMIT=48,GRACE_MS=300000;
let editing=null,busy=false,tab=Math.random().toString(36).slice(2),noteOpen=false;
const pad=n=>String(n).padStart(2,"0");
const dayOf=d=>[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join("-");
const local=ms=>new Date(ms).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
function toast(message,failed=false){
  const e=$("toast");if(!e)return;
  e.textContent=message;e.classList.toggle("error",failed);e.classList.add("show");
  clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove("show"),5000);
}
function load(){
  const rows=Store?.getJSON(KEY,[]);
  return Array.isArray(rows)?rows.filter(x=>Clock.validSaved(x,s=>!!Market.get(s))).slice(0,LIMIT):[];
}
function save(rows){
  if(Store?.setJSON(KEY,rows)===false){toast("Browser storage disabled. Schedule could not be saved.",true);return false;}
  return true;
}
function permission(){return "Notification" in root?Notification.permission:"unsupported";}
function permissionSummary(){
  const p=permission();
  return p==="granted"?"System notifications allowed (while TradingFiew runs).":
    p==="denied"?"Notifications blocked — change this site's permission in settings.":
    p==="unsupported"?"System notifications unavailable in this browser.":
    "Notifications need permission — tap Allow notifications.";
}
function renderPermission(){$("scheduledPermissionStatus").textContent=permissionSummary();}
function selectOptions(search=""){
  const sel=$("scheduledSymbol"),previous=sel.value;
  sel.replaceChildren();
  const categories=new Map(),term=search.toLowerCase().trim();
  for(const m of Market.instruments){
    if(term&&(m.symbol+" "+m.name+" "+m.category).toLowerCase().indexOf(term)===-1)continue;
    if(!categories.has(m.category))categories.set(m.category,[]);
    categories.get(m.category).push(m);
  }
  for(const [category,items] of categories){
    const group=document.createElement("optgroup");group.label=category.toUpperCase();
    for(const m of items){
      const o=document.createElement("option");o.value=m.symbol;o.textContent=m.symbol+" · "+m.name;group.appendChild(o);
    }
    sel.appendChild(group);
  }
  if([...sel.options].some(x=>x.value===previous))sel.value=previous;
  else{
    const active=root.TradingFiewChartAPI?.getSnapshot?.()?.symbol;
    if([...sel.options].some(x=>x.value===active))sel.value=active;
  }
}
function modeChanged(){
  const mode=$("scheduledFrequency").value;
  $("scheduledDateWrap").hidden=mode!=="once";
  $("scheduledFirstTimeLabel").textContent=mode.startsWith("every")?"First delivery at":"Time";
}
function reset(){
  editing=null;$("scheduledPriceForm").reset();
  const d=new Date(Date.now()+120000);
  $("scheduledDate").value=dayOf(d);
  $("scheduledTime").value=pad(d.getHours())+":"+pad(d.getMinutes());
  $("scheduledFrequency").value="once";
  $("scheduledSaveBtn").textContent="+ Schedule notification";
  $("scheduledCancelEdit").hidden=true;
  modeChanged();
}
function labelMode(r){
  return {once:"Once",daily:"Daily",weekdays:"Monday–Friday",every15:"Every 15 min",
    every30:"Every 30 min",every60:"Hourly"}[r.mode]||r.mode;
}
function render(){
  const list=$("scheduledPriceList");
  list.replaceChildren();
  const rows=load().sort((a,b)=>Number(b.enabled)-Number(a.enabled)||(a.nextAt||Infinity)-(b.nextAt||Infinity));
  $("scheduledPriceCount").textContent=String(rows.filter(r=>r.enabled).length);
  if(!rows.length){
    const text=document.createElement("p");text.className="scheduled-price-empty";
    text.textContent="No timed price notifications yet. Pick a market and time above.";
    list.appendChild(text);return;
  }
  for(const r of rows){
    const item=document.createElement("div");item.className="scheduled-price-item";
    const body=document.createElement("div");body.className="scheduled-price-description";
    const title=document.createElement("strong");title.textContent=r.symbol+" · "+Market.get(r.symbol).name;
    const slot=document.createElement("span");
    slot.textContent=labelMode(r)+" · "+(r.enabled&&r.nextAt?local(r.nextAt):"Paused or completed");
    const details=document.createElement("small");details.textContent=r.lastStatus||"Waiting for first scheduled time";
    body.append(title,slot,details);
    const actions=document.createElement("div");actions.className="scheduled-price-actions";
    for(const [action,label] of [["edit","Edit"],["toggle",r.enabled?"Pause":"Resume"],["delete","Delete"]]){
      const b=document.createElement("button");b.type="button";b.textContent=label;
      b.dataset.scheduleAction=action;b.dataset.scheduleId=r.id;
      b.setAttribute("aria-label",label+" timed price notice for "+r.symbol);
      actions.appendChild(b);
    }
    item.append(body,actions);list.appendChild(item);
  }
}
function submit(e){
  e.preventDefault();
  const symbol=$("scheduledSymbol").value,mode=$("scheduledFrequency").value,
    time=$("scheduledTime").value,date=$("scheduledDate").value,now=Date.now();
  if(!Market.get(symbol)){toast("Select one of the available instruments.",true);return;}
  const rule=Clock.build(mode,time,date,now);
  if(!rule){toast("Choose a valid FUTURE date/time on your device.",true);return;}
  const rows=load(),existing=editing?rows.find(r=>r.id===editing):null;
  if(editing&&!existing){reset();toast("Schedule not found; create it again.",true);return;}
  if(!existing&&rows.length>=LIMIT){toast("Limit of "+LIMIT+" schedules per device.",true);return;}
  if(existing)Object.assign(existing,rule,{symbol,enabled:true,lastStatus:"Updated · next "+local(rule.nextAt)});
  else rows.push({...rule,id:root.crypto?.randomUUID?.()||"time-"+now+"-"+tab,symbol,enabled:true,
    createdAt:now,lastStatus:"Waiting for "+local(rule.nextAt)});
  if(!save(rows))return;
  render();reset();
  toast(permission()==="granted"?"Scheduled "+symbol+" · "+local(rule.nextAt):
    "Schedule saved. Tap Allow notifications for system delivery.",permission()!=="granted");
}
function action(event){
  const button=event.target.closest("button[data-schedule-action]");if(!button)return;
  const rows=load(),r=rows.find(x=>x.id===button.dataset.scheduleId);if(!r)return;
  switch(button.dataset.scheduleAction){
    case "delete":
      if(!root.confirm("Delete scheduled "+r.symbol+" notice?"))return;
      save(rows.filter(x=>x.id!==r.id));
      if(editing===r.id)reset();render();return;
    case "toggle":
      if(r.enabled){r.enabled=false;r.lastStatus="Paused by user";}
      else{
        const next=Clock.build(r.mode,r.time,r.date,Date.now());
        if(!next){toast("One-time date expired. Edit the schedule instead.",true);return;}
        r.enabled=true;r.nextAt=next.nextAt;r.anchorAt=next.anchorAt;
        r.lastStatus="Resumed · next "+local(next.nextAt);
      }
      save(rows);render();return;
    case "edit":
      editing=r.id;
      $("scheduledSearch").value="";selectOptions();
      $("scheduledSymbol").value=r.symbol;
      $("scheduledFrequency").value=r.mode;
      $("scheduledTime").value=r.time;
      $("scheduledDate").value=r.date||dayOf(new Date());
      $("scheduledSaveBtn").textContent="Save schedule changes";
      $("scheduledCancelEdit").hidden=false;
      modeChanged();
      $("scheduledPricePanel").scrollIntoView({block:"nearest",behavior:"smooth"});
      $("scheduledTime").focus({preventScroll:true});
      return;
  }
}
async function allow(){
  if(noteOpen)return;
  noteOpen=true;
  try{
    if(permission()==="unsupported")throw Error("Unsupported browser.");
    const result=permission()==="granted"?"granted":await Notification.requestPermission();
    renderPermission();
    if(result!=="granted")throw Error("Permission not granted.");
    if(root.isSecureContext&&"serviceWorker" in navigator)
      await navigator.serviceWorker.register("./alerts-sw.js",{scope:"./"}).catch(()=>null);
    toast("System notifications enabled for open TradingFiew sessions.");
  }catch(err){toast("Cannot enable notifications: "+err.message,true);}
  finally{noteOpen=false;}
}
async function show(title,body,symbol,slot){
  if(permission()!=="granted")return false;
  const url=new URL("./",location.href);url.searchParams.set("symbol",symbol);
  const data={body,tag:"tradingfiew-scheduled-"+symbol+"-"+slot,
    data:{url:url.href},renotify:false,silent:false};
  try{
    if("serviceWorker" in navigator&&root.isSecureContext){
      const reg=await navigator.serviceWorker.getRegistration("./")||
        await navigator.serviceWorker.register("./alerts-sw.js",{scope:"./"});
      if(reg?.showNotification){await reg.showNotification(title,data);return true;}
    }
    const note=new Notification(title,data);
    note.onclick=()=>{root.focus();root.location.assign(url.href);};
    return true;
  }catch(err){console.warn("Scheduled OS notification unavailable",err);return false;}
}
function showDueStatus(message){const e=$("scheduledPriceStatus");if(e)e.textContent=message;}
async function delivery(r,slot){
  let body,summary;
  const item=Market.get(r.symbol);
  try{
    const q=await Market.quote(r.symbol);
    if(Clock.marketIsFresh(q,Date.now())){
      const digits=q.price<1?8:q.price<100?5:2;
      const display=q.price.toLocaleString("en-US",{maximumFractionDigits:digits});
      const change=Number.isFinite(q.change)?" · "+(q.change>0?"+":"")+q.change.toFixed(2)+"%":"";
      body=display+" "+item.quote+change+" · "+(q.source||item.venue);
      summary="Verified quote: "+display+" "+item.quote;
    }else{body="No CURRENT price — market closed or quote stale.";summary="No fresh quote available";}
  }catch{body="Feed unavailable — price cannot be verified at the scheduled time.";summary="Market feed unavailable";}
  const delay=Math.floor(Math.max(0,Date.now()-slot)/60000);
  if(delay>=1)body+=" · "+delay+" min after requested time";
  const sent=await show("TradingFiew · "+r.symbol+" scheduled price",body,r.symbol,slot);
  const rows=load(),current=rows.find(x=>x.id===r.id);
  if(current){
    current.lastStatus=summary+" · checked "+local(Date.now())+
      (sent?" · notification sent":" · no system notification");
    save(rows);
  }
  showDueStatus(sent?"System notice sent for "+r.symbol+".":
    "A schedule was due. To receive system notifications, grant browser permission.");
  toast(r.symbol+": "+body,!sent);
  render();
}
async function locked(callback){
  if(navigator.locks?.request){
    await navigator.locks.request("tradingfiew-price-time-v1",{ifAvailable:true},
      async lock=>{if(lock)await callback();});
    return;
  }
  // Best-effort one-tab lease on browsers without Web Locks.
  const key="tradingfiew:price-time-lease";
  let current;
  try{current=JSON.parse(localStorage.getItem(key)||"null");}catch{}
  if(current?.until>Date.now()&&current.owner!==tab)return;
  try{
    localStorage.setItem(key,JSON.stringify({owner:tab,until:Date.now()+30000}));
    if(JSON.parse(localStorage.getItem(key)).owner!==tab)return;
  }catch{}
  try{await callback();}
  finally{try{if(JSON.parse(localStorage.getItem(key)||"null")?.owner===tab)localStorage.removeItem(key);}catch{}}
}
async function checkNow(){
  if(busy)return;
  busy=true;
  try{
    await locked(async()=>{
      const rows=load(),now=Date.now(),due=rows.filter(r=>r.enabled&&r.nextAt>0&&r.nextAt<=now)
        .sort((a,b)=>a.nextAt-b.nextAt).slice(0,12);
      if(!due.length)return;
      const sends=[];
      for(const r of due){
        const dueAt=r.nextAt,late=now-dueAt;
        if(r.mode==="once"){r.enabled=false;r.nextAt=0;}
        else{r.nextAt=Clock.nextAt(r,now+1000)||0;if(!r.nextAt)r.enabled=false;}
        if(late>GRACE_MS)r.lastStatus="Missed while site inactive · "+local(dueAt);
        else{r.lastStatus="Checking fresh price · "+local(dueAt);sends.push({rule:{...r},slot:dueAt});}
      }
      if(!save(rows))return;
      render();
      for(const x of sends)await delivery(x.rule,x.slot);
    });
  }catch(error){console.warn("Timed price monitor failed",error);}
  finally{busy=false;}
}
async function test(){
  const symbol=$("scheduledSymbol").value;
  if(!Market.get(symbol)){toast("Choose a market.",true);return;}
  if(permission()!=="granted"){toast("Allow notifications first.",true);return;}
  let message;
  try{
    const q=await Market.quote(symbol);
    message=Clock.marketIsFresh(q,Date.now())?
      q.price.toLocaleString("en-US",{maximumFractionDigits:q.price<1?8:4})+
        " "+Market.get(symbol).quote+" · "+(q.source||"source"):
      "No fresh verified market price right now.";
  }catch{message="Price temporarily unavailable. No synthetic quote provided.";}
  const sent=await show("TradingFiew · Test "+symbol,message,symbol,Date.now());
  toast(sent?"Test notification sent.":"Cannot deliver system notification.",!sent);
}
function open(){
  root.TradingFiewAlerts?.open?.();
  setTimeout(()=>{
    $("scheduledSearch").value="";selectOptions();
    const active=root.TradingFiewChartAPI?.getSnapshot?.()?.symbol;
    if(Market.get(active))$("scheduledSymbol").value=active;
    $("scheduledPricePanel").scrollIntoView({block:"start",behavior:"smooth"});
    $("scheduledTime").focus({preventScroll:true});
  },70);
}
function init(){
  if(!$("scheduledPriceForm")||!Market||!Clock)return;
  selectOptions();reset();renderPermission();render();
  const zone=Intl.DateTimeFormat().resolvedOptions().timeZone||"device local";
  $("scheduledTimezone").textContent="Timezone: "+zone+" · based on device local time.";
  $("scheduledFrequency").addEventListener("change",modeChanged);
  $("scheduledPriceForm").addEventListener("submit",submit);
  $("scheduledSearch").addEventListener("input",e=>selectOptions(e.target.value));
  $("scheduledCancelEdit").addEventListener("click",reset);
  $("scheduledPriceList").addEventListener("click",action);
  $("scheduledAllowBtn").addEventListener("click",allow);
  $("scheduledTestBtn").addEventListener("click",test);
  $("schedulePriceChartBtn")?.addEventListener("click",open);
  root.addEventListener("focus",()=>{renderPermission();void checkNow();});
  document.addEventListener("visibilitychange",()=>{if(!document.hidden){renderPermission();void checkNow();}});
  root.addEventListener("storage",e=>{if(e.key?.includes(KEY))render();});
  root.setInterval(()=>void checkNow(),10000);
  void checkNow();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
else init();
root.TradingFiewScheduledPrices=Object.freeze({checkNow,list:load,core:Clock});
})(window);
