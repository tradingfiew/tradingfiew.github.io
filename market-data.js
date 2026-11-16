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
function normalize(rows,provider){
let out=provider==="binance"?rows.map(k=>({time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])})):
rows.map(b=>({time:Math.floor(Date.parse(b.openTime)/1000),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume)>0?Number(b.volume):Number(b.tickVolume)||0,isOpen:!!b.isOpen}));
out=out.filter(x=>Object.values(x).every(v=>typeof v==="boolean"||Number.isFinite(v))&&x.low>0&&x.high>=x.low).sort((a,b)=>a.time-b.time);
return out.filter((x,i)=>i===0||x.time!==out[i-1].time);
}
async function candles(symbol,tf,limit=650,signal){
const c=get(symbol);if(!c)throw Error("Unknown market "+symbol);
let out=[];
if(c.provider==="biquote"){
const url="https://biquote.io/api/"+encodeURIComponent(symbol)+"/ohlc?interval="+tf+"&limit="+Math.min(limit,1000);
const r=await fetch(url,{signal,cache:"no-store"});if(!r.ok)throw Error("Market feed HTTP "+r.status);
out=normalize((await r.json()).bars||[],"biquote");
}else{
let lastError;
for(const endpoint of ["https://data-api.binance.vision/api/v3/klines","https://api.binance.com/api/v3/klines"]){
try{
const r=await fetch(endpoint+"?symbol="+symbol+"&interval="+tf+"&limit="+Math.min(limit,1000),{signal,cache:"no-store"});
if(!r.ok)throw Error("Spot feed HTTP "+r.status);out=normalize(await r.json(),"binance");if(out.length>=60)break;
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
const r=await fetch("https://data-api.binance.vision/api/v3/ticker/24hr?symbol="+symbol,{signal,cache:"no-store"});if(!r.ok)throw Error("Spot ticker unavailable");
const t=await r.json();return {price:+t.lastPrice,high:+t.highPrice,low:+t.lowPrice,change:+t.priceChangePercent,volume:+t.quoteVolume,marketState:"open",stale:false,quoteAt:Date.now()/1000,source:"Binance Spot"};
}
const r=await fetch("https://biquote.io/api/"+encodeURIComponent(symbol),{signal,cache:"no-store"});if(!r.ok)throw Error("Indicative quote unavailable");
const t=await r.json();return {price:Number(t.mid),high:Number(t.high),low:Number(t.low),change:Number(t.dayDiffPercent),volume:null,marketState:t.marketState||"unknown",stale:!!t.stale,quoteAt:Date.parse(t.timestamp||t.lastQuoteAt)/1000,source:t.source||"MT5"};
}
root.TradingFiewMarkets={instruments,get,candles,quote,version:"1.1.0"};
})(window);