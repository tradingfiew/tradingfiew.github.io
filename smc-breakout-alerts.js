/* Optional SMC zone-break research alerts.
 * GREEN demand zone -> close below its LOW is a bearish invalidation.
 * RED supply zone -> close above its HIGH is a bullish invalidation.
 * Only fully CLOSED candles trigger a new alert. Never invent a price,
 * target, probability, broker quote, or executable trade order.
 */
(function(root){
"use strict";
function validBar(b){return !!b&&Number.isSafeInteger(b.time)&&b.time>0&&Number.isFinite(b.close)&&b.close>0;}
function validZone(z){return !!z&&["bull","bear"].includes(z.direction)&&
  Number.isFinite(z.low)&&Number.isFinite(z.high)&&z.low>0&&z.high>z.low&&
  Number.isSafeInteger(z.created)&&z.created>0;}
function detect({zones,previous,latest,atr=0,structure="neutral"}={}){
  if(!validBar(previous)||!validBar(latest)||latest.time<=previous.time||!Array.isArray(zones))return null;
  const matched=[];
  for(const zone of zones.slice(0,60)){
    if(!validZone(zone)||latest.time<=zone.created)continue;
    const level=zone.direction==="bear"?zone.high:zone.low;
    const buffer=Math.max(Math.abs(level)*.000002,Number.isFinite(atr)?Math.max(0,atr)*.02:0,1e-10);
    const up=zone.direction==="bear"&&previous.close<=level+buffer&&latest.close>level+buffer;
    const down=zone.direction==="bull"&&previous.close>=level-buffer&&latest.close<level-buffer;
    if(!up&&!down)continue;
    const type=up?"bull":"bear",direction=up?"up":"down",kind=zone.kind==="FVG"?"FVG":"Order Block";
    matched.push({
      type,direction,kind,low:zone.low,high:zone.high,level,closedPrice:latest.close,
      time:latest.time,zoneCreated:zone.created,
      structure:structure==="bull"||structure==="bear"?structure:"neutral",
      strength:structure===type?"with-trend":structure==="neutral"?"mixed":"countertrend",
      zoneColor:zone.direction==="bear"?"red":"green",
      // Distance is only used to pick one readable alert when zones overlap.
      distance:Math.abs(latest.close-level),
      id:[zone.kind,zone.direction,zone.created,zone.low,zone.high,latest.time].join(":")
    });
  }
  matched.sort((a,b)=>a.distance-b.distance||b.zoneCreated-a.zoneCreated);
  return matched[0]||null;
}
function format(signal,priceFormat){
  const price=typeof priceFormat==="function"?priceFormat:v=>Number(v).toLocaleString("en-US",{maximumFractionDigits:5});
  if(!signal)return null;
  const up=signal.type==="bull";
  return {
    action:up?"BUY WATCH":"SELL WATCH",
    headline:up?"Red SMC supply zone broken upward":"Green SMC demand zone broken downward",
    reason:"Confirmed candle closed "+(up?"above":"below")+" the "+signal.zoneColor+" "+signal.kind+
      " zone ("+price(signal.low)+" – "+price(signal.high)+").",
    plan:up?
      "Potential bullish setup: consider watching for a retest of the broken upper boundary and additional price-action confirmation. A close back inside the zone weakens the scenario.":
      "Potential bearish setup: consider watching for a retest of the broken lower boundary and additional price-action confirmation. A close back inside the zone weakens the scenario.",
    context:signal.strength==="with-trend"?"Aligned with the current SMC structure.":
      signal.strength==="countertrend"?"COUNTER-TREND signal: stronger confirmation is needed.":
      "Market structure is mixed; treat this as a tentative setup.",
    disclaimer:"Educational, automated technical scenario only — NOT personal investment advice, a guaranteed trade, or an order. TradingFiew does not accept responsibility for trading decisions or financial losses. You decide whether and how to act; use independent verification and risk controls."
  };
}
root.TradingFiewSMCBreakouts=Object.freeze({detect,format,version:"1.0.0"});
})(window);
