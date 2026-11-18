/* TradingFiew scheduled price notices, deterministic LOCAL device time.
 * This module performs no network calls, requests no permissions, and never
 * claims that a browser can wake a closed tab at a precise time.
 */
(function(root){
"use strict";
const MODES=Object.freeze(["once","daily","weekdays","every15","every30","every60"]);
const MINUTES=Object.freeze({every15:15,every30:30,every60:60});
function clockParts(time){
  const match=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time||"");
  return match?{hour:Number(match[1]),minute:Number(match[2])}:null;
}
function localDate(day,time){
  const t=clockParts(time),m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day||"");
  if(!t||!m)return null;
  const [y,mon,d]=m.slice(1).map(Number);
  const date=new Date(y,mon-1,d,t.hour,t.minute,0,0);
  if(date.getFullYear()!==y||date.getMonth()!==mon-1||date.getDate()!==d||
    date.getHours()!==t.hour||date.getMinutes()!==t.minute)return null;
  return date;
}
function localToday(time,now){
  const t=clockParts(time);if(!t)return null;
  const d=new Date(now),today=new Date(d.getFullYear(),d.getMonth(),d.getDate(),t.hour,t.minute,0,0);
  return Number.isFinite(today.getTime())?today:null;
}
function nextAt(rule,from=Date.now()){
  if(!rule||!MODES.includes(rule.mode)||!clockParts(rule.time)||!Number.isFinite(from))return null;
  if(rule.mode==="once"){
    const d=localDate(rule.date,rule.time);
    return d&&d.getTime()>from?d.getTime():null;
  }
  if(Object.hasOwn(MINUTES,rule.mode)){
    const anchor=Number(rule.anchorAt);
    if(!Number.isFinite(anchor)||anchor<=0)return null;
    const interval=MINUTES[rule.mode]*60000;
    return anchor>from?anchor:anchor+(Math.floor((from-anchor)/interval)+1)*interval;
  }
  const today=localToday(rule.time,from);
  if(!today)return null;
  for(let day=0;day<9;day++){
    const c=new Date(today.getFullYear(),today.getMonth(),today.getDate()+day,
      today.getHours(),today.getMinutes(),0,0);
    if(c.getTime()<=from)continue;
    if(rule.mode==="weekdays"&&[0,6].includes(c.getDay()))continue;
    return c.getTime();
  }
  return null;
}
function build(mode,time,date,now=Date.now()){
  if(!MODES.includes(mode)||!clockParts(time))return null;
  const rule={mode,time,date:mode==="once"?date:null,anchorAt:null};
  if(Object.hasOwn(MINUTES,mode)){
    const today=localToday(time,now);
    if(!today)return null;
    const first=today.getTime()>now?today.getTime():new Date(today.getFullYear(),today.getMonth(),today.getDate()+1,
      today.getHours(),today.getMinutes(),0,0).getTime();
    rule.anchorAt=first;
  }
  const next=nextAt(rule,now);
  return next===null?null:{...rule,nextAt:next};
}
function validSaved(s,marketExists){
  return !!s&&typeof s.id==="string"&&s.id.length<100&&typeof s.symbol==="string"&&
    marketExists(s.symbol)&&MODES.includes(s.mode)&&!!clockParts(s.time)&&
    (s.mode!=="once"||!!localDate(s.date,s.time))&&
    (!Object.hasOwn(MINUTES,s.mode)||(Number.isFinite(s.anchorAt)&&s.anchorAt>0))&&
    Number.isFinite(s.nextAt)&&s.nextAt>=0&&typeof s.enabled==="boolean";
}
function marketIsFresh(quote,now=Date.now()){
  const price=Number(quote?.price),stamp=Number(quote?.quoteAt);
  return Number.isFinite(price)&&price>0&&quote?.stale!==true&&
    quote?.marketState!=="closed"&&quote?.marketState!=="offline"&&
    Number.isFinite(stamp)&&stamp>0&&Math.abs(now-stamp*1000)<=120000;
}
root.TradingFiewPriceScheduleCore=Object.freeze({MODES,MINUTES,clockParts,localDate,nextAt,build,validSaved,marketIsFresh});
})(typeof window!=="undefined"?window:globalThis);
