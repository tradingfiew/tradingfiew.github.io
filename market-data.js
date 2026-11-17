(function(root){"use strict";
const rawCrypto=[
["BTCUSDT","Bitcoin","₿","#f3b54f"],["ETHUSDT","Ethereum","Ξ","#a09ff5"],["SOLUSDT","Solana","◎","#74d6b3"],
["BNBUSDT","BNB","⬡","#eec85c"],["XRPUSDT","XRP","✕","#99a9b8"],["ADAUSDT","Cardano","₳","#7da3f4"],
["DOGEUSDT","Dogecoin","Ð","#d4b777"],["AVAXUSDT","Avalanche","▲","#f0828e"],["LINKUSDT","Chainlink","⬡","#6d9af5"],
["DOTUSDT","Polkadot","●","#e18ac2"],["LTCUSDT","Litecoin","Ł","#b0b8c5"],["TRXUSDT","TRON","◈","#f18087"],
["ATOMUSDT","Cosmos","⚛","#b0b3e4"],["NEARUSDT","NEAR","N","#77daba"],["UNIUSDT","Uniswap","♧","#e997bc"],
["BCHUSDT","Bitcoin Cash","₿","#a4da80"],["ETCUSDT","Ethereum Classic","◇","#71cfaa"],["XLMUSDT","Stellar","✦","#98acbf"]
];
const rawOther=[
["XAUUSD","Gold / US Dollar","metals","Au","#f2c560","USD"],["XAGUSD","Silver / US Dollar","metals","Ag","#b7c5d4","USD"],
["XAUEUR","Gold / Euro","metals","Au","#e8c06a","EUR"],["USTEC","Nasdaq 100 · US Tech 100","indices","NQ","#75a5f7","USD"],
["US500","S&P 500 · US 500","indices","SP","#77b3fa","USD"],["US30","Dow Jones · US 30","indices","DJ","#b0a0f4","USD"],
["DXY","US Dollar Index","indices","DX","#99a5d4","index"],["UK100","FTSE 100","indices","UK","#a0d5d4","GBP"],
["JP225","Nikkei 225","indices","JP","#ee9ea3","JPY"],["FR40","CAC 40","indices","FR","#91c6e0","EUR"],
["DE30","Germany 30","indices","DE","#c5b1db","EUR"],["AUS200","Australia 200","indices","AU","#97dad8","AUD"],
["HK50","Hong Kong 50","indices","HK","#9ad7e9","HKD"],["EURUSD","Euro / US Dollar","forex","€","#73a5f5","USD"],
["GBPUSD","British Pound / US Dollar","forex","£","#cb9cef","USD"],["USDJPY","US Dollar / Japanese Yen","forex","¥","#e6b07d","JPY"],
["USDCHF","US Dollar / Swiss Franc","forex","₣","#f2a18d","CHF"],["AUDUSD","Australian Dollar / US Dollar","forex","A$","#89d7b8","USD"],
["USDCAD","US Dollar / Canadian Dollar","forex","C$","#abcafa","CAD"],["NZDUSD","New Zealand Dollar / US Dollar","forex","NZ","#88d2bb","USD"],
["EURJPY","Euro / Japanese Yen","forex","€","#8caff5","JPY"],["GBPJPY","British Pound / Japanese Yen","forex","£","#be9ddf","JPY"],
["EURGBP","Euro / British Pound","forex","€","#acb0e2","GBP"],["USDTRY","US Dollar / Turkish Lira","forex","₺","#e2ab7f","TRY"],
["USDMAD","US Dollar / Moroccan Dirham","forex","DH","#81cbb0","MAD"],["USOIL","WTI Crude Oil","energy","WT","#d7a77e","USD"],
["UKOIL","Brent Crude Oil","energy","BR","#e1b491","USD"],["AAPLUSDT","Apple equity reference","stocks","A","#a1b1c2","USDT"],
["NVDAUSDT","Nvidia equity reference","stocks","N","#9acb80","USDT"],["TSLAUSDT","Tesla equity reference","stocks","T","#f08a89","USDT"],
["MSFTUSDT","Microsoft equity reference","stocks","M","#88baf4","USDT"],["AMZNUSDT","Amazon equity reference","stocks","A","#e2af79","USDT"],
["METAUSDT","Meta equity reference","stocks","M","#95b4f2","USDT"],["GOOGLUSDT","Alphabet equity reference","stocks","G","#dda575","USDT"],
["SPYUSDT","S&P 500 ETF reference","stocks","SP","#adc1f2","USDT"],["QQQUSDT","Nasdaq 100 ETF reference","stocks","Q","#8fbee9","USDT"]
];
const instruments=[
...rawOther.map(([symbol,name,category,icon,color,quote])=>({symbol,name,category,icon,color,quote,provider:"biquote",venue:category==="stocks"?"Aggregated equity reference":"Indicative MT5/CFD quote"})),
...rawCrypto.map(([symbol,name,icon,color])=>({symbol,name,category:"crypto",icon,color,quote:"USDT",provider:"binance",venue:"Binance Spot"}))
];
const map=new Map(instruments.map(x=>[x.symbol,x]));
const get=symbol=>map.get(symbol)||null;
/* Reject malformed, stale-future and impossible OHLC bars before analysis.
   When duplicate open times exist, prefer the provider's latest update. */
function normalize(rows,provider){
  if(!Array.isArray(rows))throw Error("Market feed returned invalid candle data");
  const mapped=provider==="binance"?rows.map(k=>({
    time:Math.floor(Number(k?.[0])/1000),
    open:Number(k?.[1]),high:Number(k?.[2]),low:Number(k?.[3]),
    close:Number(k?.[4]),volume:Number(k?.[5])
  })):rows.map(b=>{
    const v=Number(b?.volume),ticks=Number(b?.tickVolume);
    return {time:Math.floor(Date.parse(b?.openTime)/1000),
      open:Number(b?.open),high:Number(b?.high),low:Number(b?.low),close:Number(b?.close),
      volume:Number.isFinite(v)&&v>=0?v:Number.isFinite(ticks)&&ticks>=0?ticks:0,
      isOpen:b?.isOpen===true};
  });
  const ceiling=Math.floor(Date.now()/1000)+86400;
  const valid=mapped.filter(x=>
    Number.isSafeInteger(x.time)&&x.time>0&&x.time<=ceiling&&
    [x.open,x.high,x.low,x.close,x.volume].every(Number.isFinite)&&
    x.open>0&&x.close>0&&x.low>0&&x.volume>=0&&
    x.high>=Math.max(x.open,x.close,x.low)&&x.low<=Math.min(x.open,x.close)
  ).sort((a,b)=>a.time-b.time);
  const out=[];
  for(const bar of valid){
    if(out.at(-1)?.time===bar.time)out[out.length-1]=bar;
    else out.push(bar);
  }
  return out;
}
/* Both active cancellation and a hard timeout are respected. */
async function requestJSON(url,{signal,timeoutMs=12000}={}){
  const controller=new AbortController();
  const abort=()=>controller.abort(signal?.reason);
  if(signal?.aborted)abort();
  else signal?.addEventListener("abort",abort,{once:true});
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{signal:controller.signal,cache:"no-store"});
    if(!response.ok)throw Error("Market feed HTTP "+response.status);
    return await response.json();
  }catch(error){
    if(controller.signal.aborted&&!signal?.aborted)
      throw Error("Market feed timeout after "+Math.ceil(timeoutMs/1000)+"s");
    throw error;
  }finally{
    clearTimeout(timer);
    signal?.removeEventListener("abort",abort);
  }
}
async function candles(symbol,tf,limit=650,signal){
const c=get(symbol);if(!c)throw Error("Unknown market "+symbol);
let out=[];
if(c.provider==="biquote"){
const url="https://biquote.io/api/"+encodeURIComponent(symbol)+"/ohlc?interval="+tf+"&limit="+Math.min(limit,1000);
const result=await requestJSON(url,{signal,timeoutMs:15000});
out=normalize(result?.bars||[],"biquote");
}else{
let lastError;
for(const endpoint of ["https://data-api.binance.vision/api/v3/klines","https://api.binance.com/api/v3/klines"]){
try{
const bars=await requestJSON(endpoint+"?symbol="+symbol+"&interval="+tf+"&limit="+Math.min(limit,1000),{signal,timeoutMs:12000});
out=normalize(bars,"binance");if(out.length>=60)break;
}catch(e){if(e.name==="AbortError")throw e;lastError=e;}
}
if(out.length<60&&lastError)throw lastError;
}
if(out.length<60)throw Error("Not enough historical candles for "+symbol+" on "+tf+". Try another timeframe.");
return out;
}
async function quote(symbol,signal){
const c=get(symbol);if(!c)throw Error("Unknown symbol");
if(c.provider==="binance"){
const t=await requestJSON("https://data-api.binance.vision/api/v3/ticker/24hr?symbol="+symbol,{signal,timeoutMs:9000});return {price:+t.lastPrice,high:+t.highPrice,low:+t.lowPrice,change:+t.priceChangePercent,volume:+t.quoteVolume,marketState:"open",stale:false,quoteAt:Date.now()/1000,source:"Binance Spot"};
}
const t=await requestJSON("https://biquote.io/api/"+encodeURIComponent(symbol),{signal,timeoutMs:9000});return {price:Number(t.mid),high:Number(t.high),low:Number(t.low),change:Number(t.dayDiffPercent),volume:null,marketState:t.marketState||"unknown",stale:!!t.stale,quoteAt:Date.parse(t.timestamp||t.lastQuoteAt)/1000,source:t.source||"MT5"};
}
root.TradingFiewMarkets={instruments,get,candles,quote,normalize,version:"1.2.0"};
})(window);