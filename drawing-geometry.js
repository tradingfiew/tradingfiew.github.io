/* TradingFiew drawing geometry 2.0 — pure, independently testable math.
 * Fibonacci trend-based extension uses THREE points: A→B (impulse), C (correction).
 * Its level f is C + f*(B-A), never the old two-click continuation.
 * Retracement: 0% at B / 100% at A; Reverse swaps these endpoints.
 */
(function(root){
'use strict';
const fibRetrace=[0,.236,.382,.5,.618,.786,.886,1];
const fibExtend=[0,.236,.382,.5,.618,.786,1,1.272,1.618,2,2.618];
function valid(p){return p&&Number.isFinite(p.price)&&p.price>0&&Number.isFinite(p.time);}
function fibPrice(mode,points,fraction,reverse=false){
  if(!Array.isArray(points)||!Number.isFinite(fraction))return null;
  if(mode==='fib'){
    if(points.length!==2||!points.every(valid))return null;
    const [a,b]=points;
    return (reverse?a.price:b.price)+fraction*(reverse?(b.price-a.price):(a.price-b.price));
  }
  if(mode==='fibext'){
    if(points.length!==3||!points.every(valid))return null;
    return points[2].price+(reverse?-1:1)*fraction*(points[1].price-points[0].price);
  }
  return null;
}
function levels(mode,points,reverse=false){
  const fractions=mode==='fib'?fibRetrace:mode==='fibext'?fibExtend:[];
  return fractions.map(fraction=>({fraction,price:fibPrice(mode,points,fraction,reverse)}))
   .filter(x=>Number.isFinite(x.price)&&x.price>0);
}
function channel(points,indexOfTime){
  if(!Array.isArray(points)||points.length!==3||!points.every(valid)||
     typeof indexOfTime!=='function')return null;
  const [a,b,c]=points,ia=indexOfTime(a.time),ib=indexOfTime(b.time),ic=indexOfTime(c.time);
  if(![ia,ib,ic].every(Number.isFinite)||ib===ia)return null;
  const slope=(b.price-a.price)/(ib-ia);
  const offset=c.price-(a.price+(ic-ia)*slope);
  const upperA=a.price+offset,upperB=b.price+offset;
  if(!Number.isFinite(offset)||upperA<=0||upperB<=0)return null;
  return {offset,lower:[a,b],upper:[{time:a.time,price:upperA},{time:b.time,price:upperB}],third:c};
}
root.TradingFiewDrawingGeometry=Object.freeze({
  fibRetrace:Object.freeze(fibRetrace),fibExtend:Object.freeze(fibExtend),fibPrice,levels,channel
});
})(typeof window!=='undefined'?window:globalThis);
