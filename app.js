/* RibhLab SMC Terminal | no secrets, no trading orders, all market data public. */
(function(){
'use strict';
const LW=window.LightweightCharts,Engine=window.SmcEngine,Markets=window.TradingFiewMarkets,Space=window.TradingFiewWorkspace;
const $=id=>document.getElementById(id);
const intervals={'5m':'1h','15m':'4h','1h':'4h','4h':'1d','1d':'1w'};
const activeMarket=()=>Markets.get(state.symbol)||coins[0];
const coins=Markets.instruments;
let state={
symbol:'XAUUSD',category:'all',tf:'1h',data:[],analysis:null,htf:null,request:0,ws:null,controller:null,refreshTimer:null,
heartbeat:null,analysisTimer:null,reconnectTimer:null,quoteTimer:null,quoteBusy:false,quoteAt:null,quotePrice:null,quoteIsFresh:false,autoSmc:true,drawMode:'cursor',drawStart:null,drawings:[],selectedDrawingId:null,selectedFibLevel:null,
tableTab:'events',favorites:new Set(),dark:true,activePrice:null,live:false
};
let chart,candles,vol,ema20,ema50,ema200,rsiChart,rsiSeries,markersApi,zoneCanvas,resizeObserver,toastTimer,shownGuide=false;
let lastPriceLine=null,srGuides=[],drawingSeq=0;
const preference=key=>Space?.get(key)??null;
const remember=(key,value)=>Space?.set(key,value);
const num=(v,dec)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—';
const decimals=v=>v<.01?6:v<5?5:v<100?3:2;
const fmt=v=>num(v,decimals(Math.abs(v||1)));
const compact=v=>Number.isFinite(v)?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(v):'—';
const sign=v=>Number.isFinite(v)?(v>=0?'+':'')+num(v,2)+'%':'—';
const date=t=>new Date(t*1000).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const relative=(t)=>{const n=Math.round((Date.now()/1000-t)/60);return n<1?'just now':n<60?n+'m ago':n<1440?Math.floor(n/60)+'h ago':Math.floor(n/1440)+'d ago';};
const themeColors=()=>document.body.classList.contains('light')?{bg:'#f7f9fc',text:'#6b7b91',grid:'#e9eef4'}:{bg:'#0c1322',text:'#75849a',grid:'#172236'};
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),5000);}
function connection(value,mode){$('connectionState').textContent=value;$('feedText').textContent=mode||value;const live=value==='LIVE'||value==='LIVE QUOTE';$('liveDot').className='status-dot '+(live?'online':value==='OFFLINE'?'offline':'');$('feedStatusDot').className='status-dot '+(live?'online':value==='OFFLINE'?'offline':'');state.live=live;}
function loading(message,sub,error=false){const el=$('chartState');el.classList.remove('hidden');el.classList.toggle('error',error);el.querySelector('strong').textContent=message;el.querySelector('span').textContent=sub;}
function showChart(){ $('chartState').classList.add('hidden');}
function chartOptions(height,primary=false){
const c=themeColors();
return {autoSize:true,width:700,height,layout:{background:{type:'solid',color:c.bg},textColor:c.text,fontFamily:'IBM Plex Mono, monospace',fontSize:10,attributionLogo:false},
grid:{vertLines:{color:c.grid,style:1},horzLines:{color:c.grid,style:1}},
crosshair:{mode:LW.CrosshairMode.Normal,vertLine:{color:'#7592ae',style:2,labelBackgroundColor:'#243a54'},horzLine:{visible:false,labelVisible:false}},
rightPriceScale:{borderColor:c.grid,scaleMargins:{top:.08,bottom:primary ? .18 : .06}},
timeScale:{borderColor:c.grid,timeVisible:true,secondsVisible:false,barSpacing:window.innerWidth<=730?6:8,minBarSpacing:2,rightOffset:window.innerWidth<=730?4:8},
handleScroll:true,handleScale:true,localization:{locale:'en-US'}};
}
function addLine(color,width=1){return chart.addSeries(LW.LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});}
function setupCharts(){
if(!LW||!LW.createChart||!LW.CandlestickSeries||!Engine||!Markets)throw new Error('Chart or analysis library unavailable. Check your network and reload.');
chart=LW.createChart($('chartHost'),chartOptions(405,true));
candles=chart.addSeries(LW.CandlestickSeries,{upColor:'#36cba1',downColor:'#f2647e',borderUpColor:'#36cba1',borderDownColor:'#f2647e',wickUpColor:'#36cba1',wickDownColor:'#f2647e',priceLineVisible:false,lastValueVisible:false});
vol=chart.addSeries(LW.HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
chart.priceScale('volume').applyOptions({scaleMargins:{top:.82,bottom:0}});
ema20=addLine('#699cf6',2);ema50=addLine('#ecae53',1);ema200=addLine('#a28df0',1);
rsiChart=LW.createChart($('rsiHost'),{...chartOptions(92,false),rightPriceScale:{visible:true,borderVisible:false,scaleMargins:{top:.10,bottom:.10}},timeScale:{visible:false,borderVisible:false},grid:{vertLines:{visible:false},horzLines:{color:themeColors().grid}},crosshair:{vertLine:{visible:false},horzLine:{visible:false}},handleScroll:false,handleScale:false});
rsiSeries=rsiChart.addSeries(LW.LineSeries,{color:'#a998fc',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
rsiSeries.createPriceLine({price:70,color:'rgba(245,114,140,.35)',lineStyle:LW.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
rsiSeries.createPriceLine({price:30,color:'rgba(53,208,154,.35)',lineStyle:LW.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
chart.timeScale().subscribeVisibleLogicalRangeChange(()=>{drawZones();try{const range=chart.timeScale().getVisibleRange();if(range&&state.data.length>14)rsiChart.timeScale().setVisibleRange(range);}catch{}});
chart.subscribeCrosshairMove(p=>{const c=p.seriesData?.get(candles);if(c&&Number.isFinite(c.close))setOhlc(c);else if(state.data.length)setOhlc(state.data.at(-1));});
chart.subscribeClick(onChartClick);
zoneCanvas=$('zoneOverlay');resizeObserver=new ResizeObserver(()=>{
  drawZones();
  if(state.analysis){renderMarkers();renderSupportResistance();}
});resizeObserver.observe($('chartHost'));
try{markersApi=LW.createSeriesMarkers?LW.createSeriesMarkers(candles,[]):null;}catch{markersApi=null;}
}
function updateTheme(){
document.body.classList.toggle('light',!state.dark);$('themeBtn').textContent=state.dark?'☀':'☾';
if(chart){
let t=themeColors();chart.applyOptions({layout:{background:{type:'solid',color:t.bg},textColor:t.text},grid:{vertLines:{color:t.grid},horzLines:{color:t.grid}},rightPriceScale:{borderColor:t.grid},timeScale:{borderColor:t.grid}});
rsiChart.applyOptions({layout:{background:{type:'solid',color:t.bg},textColor:t.text},grid:{horzLines:{color:t.grid}}});if(lastPriceLine)lastPriceLine.applyOptions({color:priceGuideColor()});drawZones();
}
remember('theme',state.dark?'dark':'light');
}
function renderMarkets(){
const search=$('symbolSearch').value.trim().toLowerCase(),fav=state.favorites;
const markets=coins.filter(c=>(state.category==='all'||c.category===state.category)&&(c.symbol.toLowerCase().includes(search)||c.name.toLowerCase().includes(search))).sort((a,b)=>Number(fav.has(b.symbol))-Number(fav.has(a.symbol)));
$('marketCount').textContent=markets.length;
$('marketList').innerHTML=markets.map(c=>`<button class="market-row ${c.symbol===state.symbol?'active':''}" data-pair="${c.symbol}"><span class="coin-symbol" style="background:${c.color}">${c.icon}</span><span class="market-name"><b>${c.symbol.replace('USDT','/USDT')}</b><small>${c.name}</small></span><span data-star="${c.symbol}" class="star ${fav.has(c.symbol)?'favorite':''}" title="Toggle favorite">${fav.has(c.symbol)?'★':'☆'}</span></button>`).join('')||'<div class="empty-small">No matching pairs</div>';
}
function showInstrument(){
remember('symbol',state.symbol);remember('tf',state.tf);
const c=activeMarket();
$('pairTitle').textContent=c.category==='crypto'?state.symbol.replace('USDT',' / USDT'):state.symbol;
$('pairSubtitle').textContent=c.name+' · '+c.venue;
$('assetClassBadge').textContent=c.category.toUpperCase();
$('assetIcon').textContent=c.icon;$('assetIcon').style.background=c.color;
$('marketSourceName').textContent=c.provider==='binance'?'BINANCE SPOT':'INDICATIVE CFD/FX';
$('volumeLabel').textContent=c.provider==='binance'?'24H TURNOVER':'QUOTE SOURCE';
$('volumeStripLabel').textContent=c.provider==='binance'?'VOL':'TICKS';
$('biasTimeframe').textContent=state.tf.toUpperCase();$('htfInterval').textContent='Higher TF: '+intervals[state.tf];
document.querySelectorAll('#timeframes button').forEach(b=>b.classList.toggle('active',b.dataset.tf===state.tf));
renderMarkets();
}
function setOhlc(c){
for(const [id,key] of [['oVal','open'],['hVal','high'],['lVal','low'],['cVal','close']])$(id).textContent=fmt(c[key]);
const original=state.data.findLast?.(x=>x.time===c.time)||state.data.at(-1);
$('volumeStripValue').textContent=Number.isFinite(original?.volume)?compact(original.volume):'—';
}
function priceGuideColor(){return document.body.classList.contains('light')?'#008f88':'#22d7c1';}
function updatePrice(v){if(!Number.isFinite(v)||v<=0)return;
state.activePrice=v;$('lastPrice').textContent=fmt(v);
$('updatedAt').textContent='Updated '+new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'});
if(candles){try{const options={price:v,color:priceGuideColor(),lineWidth:1,lineStyle:LW.LineStyle.Solid,axisLabelVisible:true,title:'LAST'};
if(!lastPriceLine)lastPriceLine=candles.createPriceLine(options);else lastPriceLine.applyOptions(options);
}catch(e){console.warn('Last-price guide issue',e);}}
}

const TF_SECONDS=Object.freeze({'5m':300,'15m':900,'1h':3600,'4h':14400,'1d':86400});
/* Quote and candle data must use the exact same price scale.
 * An active quote adjusts ONLY an already-open, matching OHLC candle.
 * Historic or closed candles are never fabricated or silently rewritten. */
function syncIndicativeQuoteToChart(price,quoteAt){
  if(activeMarket().provider==='binance'||!Number.isFinite(quoteAt)||!Number.isFinite(price))return;
  const latest=state.data.at(-1),seconds=TF_SECONDS[state.tf];
  if(!latest||!latest.isOpen||!seconds)return;
  if(quoteAt<latest.time||quoteAt>=latest.time+seconds)return;
  const revised={...latest,high:Math.max(latest.high,price),low:Math.min(latest.low,price),close:price};
  state.data[state.data.length-1]=revised;
  try{candles.update({time:revised.time,open:revised.open,high:revised.high,low:revised.low,close:revised.close});}
  catch(error){console.warn('Active candle synchronization failed',error);}
  setOhlc(revised);
}
function quoteFresh(t){
  return t.marketState==='open'&&!t.stale&&Number.isFinite(t.quoteAt)&&Math.abs(Date.now()/1000-t.quoteAt)<120;
}
function candleFromKline(k){return{time:Math.floor(Number(k[0])/1000),open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5])};}
function validate(rows){if(!Array.isArray(rows)||rows.length<60)throw new Error('Exchange returned insufficient candle data.');const data=rows.map(candleFromKline).filter(c=>Object.values(c).every(Number.isFinite));if(data.length<60)throw new Error('Exchange returned invalid OHLC prices.');return data.sort((a,b)=>a.time-b.time).filter((c,i,a)=>i===0||c.time!==a[i-1].time);}
async function fetchCandles(symbol,tf,limit=650,signal){return Markets.candles(symbol,tf,limit,signal);}
async function fetchTicker(symbol,request){
if(request!==state.request)return;
const market=Markets.get(symbol);if(!market||state.quoteBusy)return;
state.quoteBusy=true;
try{
const t=await Markets.quote(symbol,state.controller?.signal);
if(request!==state.request)return;
const validPrice=Number.isFinite(t.price)&&t.price>0;
const quoteAt=Number.isFinite(t.quoteAt)?t.quoteAt:null;
const newer=quoteAt===null||state.quoteAt===null||quoteAt>=state.quoteAt;
const fresh=quoteFresh(t);
state.quoteIsFresh=fresh;
if(validPrice&&newer){
  state.quoteAt=quoteAt;
  state.quotePrice=t.price;
  updatePrice(t.price);
  if(market.provider!=='binance'&&fresh)syncIndicativeQuoteToChart(t.price,quoteAt);
}
$('priceChange').textContent=t.marketState==='closed'?'MARKET CLOSED':t.stale?'QUOTE STALE':sign(t.change);
$('priceChange').className='change-label '+(t.marketState==='closed'||t.stale?'':t.change>=0?'up':'down');
$('high24').textContent=fmt(t.high);$('low24').textContent=fmt(t.low);
$('volume24').textContent=market.provider==='binance'?compact(t.volume)+' USDT':(t.source||'Indicative').replace('MetaTrader 5','MT5').slice(0,18);
if(market.provider!=='binance'){
  const status=fresh?'LIVE QUOTE':t.marketState==='closed'?'MARKET CLOSED':'QUOTE STALE';
  connection(status,fresh?'Indicative live midpoint · checks every 5s':
    t.marketState==='closed'?'Market closed · last known indicative quote':'No fresh quote from market-data provider');
  if(quoteAt!==null){
    $('updatedAt').textContent='Quote '+new Date(quoteAt*1000).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' UTC';
  }else $('updatedAt').textContent='Quote time unavailable';
}
}catch(error){
 if(request===state.request){
  if(market.provider!=='binance'){
    connection('OFFLINE','Live quote unavailable · showing last known price');
    $('priceChange').textContent='Quote unavailable';
  }
  console.warn('Quote refresh failed',error);
 }
}finally{state.quoteBusy=false;}
}
function startQuotePolling(request){
  clearInterval(state.quoteTimer);state.quoteTimer=null;
  if(request!==state.request||activeMarket().provider==='binance')return;
  state.quoteTimer=setInterval(()=>{
    if(request!==state.request||document.hidden)return;
    void fetchTicker(state.symbol,request);
  },5000);
}
function clearTimer(){clearInterval(state.refreshTimer);clearInterval(state.quoteTimer);clearInterval(state.heartbeat);clearTimeout(state.reconnectTimer);clearTimeout(state.analysisTimer);state.refreshTimer=null;state.quoteTimer=null;state.quoteBusy=false;try{state.ws?.close();}catch{}state.ws=null;}
async function loadMarket(fit=true){
const request=++state.request;state.controller?.abort();state.controller=new AbortController();state.htf=null;clearTimer();
try{if(lastPriceLine)candles.removePriceLine(lastPriceLine);}catch{}lastPriceLine=null;clearSrGuides();state.activePrice=null;state.quoteAt=null;state.quotePrice=null;state.quoteIsFresh=false;connection('CONNECTING','Fetching historical candles...');
showInstrument();loading('Loading '+state.symbol,'Retrieving historical OHLC data from a public market feed.');
$('lastPrice').textContent='—';$('priceChange').textContent='—';$('high24').textContent='—';$('low24').textContent='—';$('volume24').textContent='—';state.data=[];state.analysis=null;state.htf=null;drawZones();
try{
const rows=await fetchCandles(state.symbol,state.tf,650,state.controller.signal);if(request!==state.request)return;
state.data=rows;setCandleData(true);restoreDrawings();setOhlc(rows.at(-1));updatePrice(rows.at(-1).close);showChart();connection('SYNCING','Historical data ready; connecting to market feed...');
analyze();fetchTicker(state.symbol,request);fetchHigherTimeframe(request);connectStream(request);
if(fit)focusRecentCandles();
try{history.replaceState(null,'',location.pathname+'?symbol='+state.symbol+'&tf='+state.tf);}catch{}
}catch(e){if(e.name==='AbortError'||request!==state.request)return;loading('Market data unavailable',e.message,true);connection('OFFLINE','Unable to fetch public exchange data');toast('Cannot load market data. Try another network or refresh.',true);}
}
function focusRecentCandles(){
if(!chart||!state.data.length)return;
const last=state.data.length-1;
const count=window.innerWidth<=480?48:window.innerWidth<=730?64:window.innerWidth<=1120?115:155;
try{chart.timeScale().setVisibleLogicalRange({from:Math.max(0,last-count),to:last+4});}
catch{chart.timeScale().fitContent();}
}
function setCandleData(fit=false){
if(!state.data.length)return;
candles.setData(state.data.map(({time,open,high,low,close})=>({time,open,high,low,close})));
vol.setData($('toggleVolume').checked?state.data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'})):[]);
refreshEMAs();
if(fit)focusRecentCandles();
}
function refreshEMAs(){
const show=$('toggleEMA').checked;
const data=state.data.slice(0,-1);
ema20.setData(show?Engine.ema(data,20):[]);ema50.setData(show?Engine.ema(data,50):[]);ema200.setData(show?Engine.ema(data,200):[]);
}
function refreshRsi(){
const show=$('toggleRSI').checked;$('rsiPanel').classList.toggle('hidden',!show);
rsiSeries.setData(show&&state.analysis?state.analysis.rsis.map(p=>({time:p.time,value:p.value})):[]);
if(show)try{const range=chart.timeScale().getVisibleRange();if(range)rsiChart.timeScale().setVisibleRange(range);}catch{}
}
function connectStream(request){
if(request!==state.request)return;
if(activeMarket().provider!=='binance'){connection('REST FEED','Indicative candles (20s) · quotes (5s)');startPolling(request);startQuotePolling(request);return;}
let connected=false;
try{
const url='wss://data-stream.binance.vision/ws/'+state.symbol.toLowerCase()+'@kline_'+state.tf;
const socket=new WebSocket(url);state.ws=socket;
socket.onopen=()=>{if(request!==state.request)return;connected=true;clearInterval(state.refreshTimer);state.refreshTimer=null;connection('LIVE','WebSocket — streaming market candles');};
socket.onmessage=e=>{
if(request!==state.request)return;
try{const packet=JSON.parse(e.data),k=packet.k;if(!k)return;
const incoming={time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};
if(!Number.isFinite(incoming.close))return;
const last=state.data.at(-1);
if(incoming.time===last?.time){state.data[state.data.length-1]=incoming;candles.update(incoming);if($('toggleVolume').checked)vol.update({time:incoming.time,value:incoming.volume,color:incoming.close>=incoming.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'});}
else if(incoming.time>last?.time){state.data.push(incoming);if(state.data.length>650)state.data.shift();candles.update(incoming);if($('toggleVolume').checked)vol.update({time:incoming.time,value:incoming.volume,color:incoming.close>=incoming.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'});refreshEMAs();analyze();}
updatePrice(incoming.close);setOhlc(incoming);
if(k.x){refreshEMAs();analyze();fetchTicker(state.symbol,request);}
}catch{}
};
socket.onerror=()=>{if(request===state.request&&!connected)connection('REST MODE','Live stream unavailable; polling every 60s');};
socket.onclose=()=>{if(request!==state.request)return;state.ws=null;connection('REST MODE','Live stream disconnected; polling every 60s');startPolling(request);state.reconnectTimer=setTimeout(()=>{if(request===state.request)connectStream(request);},45000);};
}catch{startPolling(request);}
clearInterval(state.heartbeat);state.heartbeat=setInterval(()=>{if(state.ws&&state.ws.readyState===1)return;startPolling(request);},20000);
}
function startPolling(request){
if(state.refreshTimer)return;
state.refreshTimer=setInterval(async()=>{
if(request!==state.request)return;
try{const rows=await fetchCandles(state.symbol,state.tf,activeMarket().provider==='binance'?100:160);if(request!==state.request)return;
for(const c of rows){const last=state.data.at(-1);if(c.time===last?.time)state.data[state.data.length-1]=c;else if(c.time>last?.time)state.data.push(c);}
if(state.data.length>650)state.data=state.data.slice(-650);
setCandleData();
const candle=state.data.at(-1);
if(activeMarket().provider==='biquote'&&state.quoteIsFresh&&Number.isFinite(state.quotePrice)&&Number.isFinite(state.quoteAt)&&Math.abs(Date.now()/1000-state.quoteAt)<120){
  syncIndicativeQuoteToChart(state.quotePrice,state.quoteAt);
}
if(!Number.isFinite(state.quoteAt)||candle.time>state.quoteAt){
  updatePrice(candle.close);
  setOhlc(candle);
}
analyze();
if(activeMarket().provider==='binance')void fetchTicker(state.symbol,request);
}catch{}
},activeMarket().provider==='binance'?60000:20000);
}
async function fetchHigherTimeframe(request){
const tf=activeMarket().provider==='binance'?intervals[state.tf]:(state.tf==='1d'?'1d':intervals[state.tf]);$('htfValue').textContent='Checking…';
try{
const data=await fetchCandles(state.symbol,tf,350,state.controller?.signal);
if(request!==state.request)return;
const htf=Engine.calculate(activeMarket().provider==='binance'?data.slice(0,-1):data.filter(x=>!x.isOpen));state.htf=htf;$('htfValue').textContent=htf.direction==='bull'?'BULLISH':htf.direction==='bear'?'BEARISH':'RANGING';$('htfValue').className=htf.direction==='bull'?'text-green':htf.direction==='bear'?'text-red':'';
$('htfInterval').textContent=tf.toUpperCase()+' confirmed';renderBias();
}catch{if(request===state.request){$('htfValue').textContent='Unavailable';$('htfInterval').textContent=tf.toUpperCase()+' data unavailable';}}
}
function analyze(){
if(!state.data||state.data.length<65)return;
try{
const closed=activeMarket().provider==='binance'?state.data.slice(0,-1):state.data.filter(x=>!x.isOpen);
state.analysis=Engine.calculate(closed);
renderAnalysis();renderMarkers();drawZones();refreshRsi();
$('analysisDot').className='status-dot online';$('analysisLabel').textContent='Analyzed '+closed.length+' confirmed candles';
$('smcAsOf').textContent=date(closed.at(-1).time);
}catch(e){$('analysisLabel').textContent='Analysis error';toast('Analysis: '+e.message,true);}
}
function renderBias(){
const a=state.analysis;if(!a)return;
const dir=a.direction,card=document.querySelector('.bias-card');card.classList.toggle('bearish',dir==='bear');card.classList.toggle('neutral',dir==='neutral');
$('biasText').textContent=dir==='bull'?'BULLISH':dir==='bear'?'BEARISH':'RANGING';$('biasIcon').textContent=dir==='bull'?'↗':dir==='bear'?'↘':'◆';
const aligned=state.htf?.direction===dir&&dir!=='neutral';const score=Math.min(6,a.confluence+(aligned?1:0));$('biasMeterFill').style.width=(score/6*100)+'%';$('biasScore').textContent=score+'/6 filters';
$('biasReason').textContent=aligned?'Aligned with higher timeframe':a.latestEvent?'Latest '+a.latestEvent.type+' '+relative(a.latestEvent.time):'No confirmed recent structure break';
}
function renderAnalysis(){
const a=state.analysis;if(!a)return;renderBias();const e=a.latestEvent;
$('structureValue').textContent=e?e.type+' '+(e.direction==='bull'?'↑':'↓'):'—';$('structureValue').className=e?(e.direction==='bull'?'text-green':'text-red'):'';
$('structureAge').textContent=e?relative(e.time):'No confirmed break';
$('bullFvgCount').textContent=a.fvgs.filter(z=>z.direction==='bull').length;
$('bearFvgCount').textContent=a.fvgs.filter(z=>z.direction==='bear').length;
$('obCount').textContent=a.blocks.length;
$('sweepCount').textContent=a.sweeps.filter(s=>s.i>=a.dataCount-100).length;
const r=a.range;$('rangeLow').textContent=fmt(r.low);$('rangeHigh').textContent=fmt(r.high);
$('pdZone').textContent=r.position<.45?'DISCOUNT':r.position>.55?'PREMIUM':'EQUILIBRIUM';
$('pdPin').style.left=Math.max(1,Math.min(99,r.position*100))+'%';
$('techRsi').textContent=num(a.rsi,1)+' '+(a.rsi>=70?'· Overbought':a.rsi<=30?'· Oversold':'· Neutral');
$('techEma').textContent=a.ema20value>a.ema50value?'Bullish alignment':'Bearish alignment';
$('techEma').className=a.ema20value>a.ema50value?'text-green':'text-red';
$('techAtr').textContent=fmt(a.atr);
const sweep=a.sweeps.at(-1);$('techSweep').textContent=sweep?sweep.type+' · '+relative(sweep.time):'None detected';
$('rsiValue').textContent=num(a.rsi,1);$('stripRSI').textContent='RSI 14 '+num(a.rsi,1);
renderZonesList();renderBottom();renderSupportResistance();
}
function renderZonesList(){
const a=state.analysis;if(!a)return;
const price=state.activePrice||a.last.close;
const items=[...a.activeZones].sort((x,y)=>Math.abs((x.high+x.low)/2-price)-Math.abs((y.high+y.low)/2-price)).slice(0,5);
$('zonesList').innerHTML=items.length?items.map(z=>{
const center=(z.low+z.high)/2;
return `<div class="zone-item"><span class="zone-indicator ${z.direction==='bear'?'bear':''}"></span><div class="zone-copy"><b>${z.direction==='bull'?'Bullish':'Bearish'} ${z.kind}</b><small>${relative(z.created)} · ${z.partial?'partially touched':'untouched'}</small></div><div class="zone-value">${fmt(z.low)} – ${fmt(z.high)}<small>${num((center-price)/price*100,2)}% from price</small></div></div>`;
}).join(''):'<div class="empty-small">No unmitigated zones detected in recent candles.</div>';
}

function clearSrGuides(){if(!candles)return;for(const l of srGuides){try{candles.removePriceLine(l);}catch{}}srGuides=[];}
/* Screen-space layout: only the LAST price has a mandatory axis label.
 * Nearby S1/R1 labels are hidden to avoid overlapping the live price
 * while their lines, values and analysis cards stay available. */
function renderSupportResistance(){
  clearSrGuides();
  const a=state.analysis;if(!a||!candles)return;
  const price=state.activePrice||a.last.close,delta=Math.max(a.atr*.3,price*.00002),recent=Math.max(0,a.dataCount-170);
  const sides=[
    ['support',a.pivots.lows,'srSupport','srSupportMeta','S1','#40dba1'],
    ['resistance',a.pivots.highs,'srResistance','srResistanceMeta','R1','#f4b062']
  ];
  const lastY=candles.priceToCoordinate(price);
  const usedAxisY=Number.isFinite(lastY)?[lastY]:[];
  for(const [side,pivots,id,meta,label,color] of sides){
    const filtered=pivots.filter(x=>x.i>=recent&&(side==='support'?x.price<price:x.price>price))
      .sort((x,y)=>Math.abs(x.price-price)-Math.abs(y.price-price));
    const pivot=filtered[0];
    const matches=pivot?pivots.filter(x=>x.i>=recent&&Math.abs(x.price-pivot.price)<=delta):[];
    const ordered=matches.map(x=>x.price).sort((x,y)=>x-y);
    const level=ordered.length?ordered[Math.floor(ordered.length/2)]:null;
    $(id).textContent=level===null?'Not detected':fmt(level);
    $(meta).textContent=level===null?'No nearby confirmed swing':matches.length+' confirmed pivot'+(matches.length===1?'':'s');
    if(level===null||!$('toggleSR').checked)continue;
    try{
      const y=candles.priceToCoordinate(level);
      const spacing=window.innerWidth<=730?35:31;
      const labelClear=Number.isFinite(y)&&usedAxisY.every(previous=>Math.abs(y-previous)>=spacing);
      if(labelClear)usedAxisY.push(y);
      srGuides.push(candles.createPriceLine({
        price:level,color,lineWidth:1,lineStyle:LW.LineStyle.Dashed,
        axisLabelVisible:labelClear,title:labelClear?label:''
      }));
    }catch(error){console.warn('S/R guide issue',error);}
  }
}
function renderMarkers(){
  if(!markersApi)return;
  const a=state.analysis;
  if(!a||!state.autoSmc||!$('toggleMarkers').checked){markersApi.setMarkers([]);return;}
  const width=$('chartHost').clientWidth;
  const compact=width<580;
  const maxMarkers=width<380?2:compact?3:width<850?5:7;
  const minX=compact?72:width<850?86:100;
  const cutoff=Math.max(0,a.dataCount-(compact?85:115));
  const candidates=[
    ...a.events.filter(e=>e.i>=cutoff).slice(-16).map(e=>({...e,priority:2})),
    ...a.sweeps.filter(e=>e.i>=cutoff).slice(-8).map(e=>({...e,type:'SWEEP',priority:1}))
  ].sort((x,y)=>y.i-x.i||y.priority-x.priority);
  const timeScale=chart.timeScale(),accepted=[];
  for(const e of candidates){
    if(accepted.length>=maxMarkers)break;
    const x=timeScale.timeToCoordinate(e.time);
    if(!Number.isFinite(x)||x<15||x>width-65)continue;
    if(accepted.some(other=>Math.abs(other.x-x)<minX))continue;
    accepted.push({...e,x});
  }
  markersApi.setMarkers(accepted.sort((x,y)=>x.time-y.time).map(e=>({
    time:e.time,
    position:e.direction==='bull'?'belowBar':'aboveBar',
    color:e.type==='SWEEP'?'#edb45f':e.direction==='bull'?'#37d2a0':'#f06c84',
    shape:e.type==='SWEEP'?'circle':e.direction==='bull'?'arrowUp':'arrowDown',
    text:compact?'':e.type==='SWEEP'&&width<1100?'':e.type
  })));
}
function drawZones(){
if(!zoneCanvas||!chart||!candles)return;
const rect=$('chartHost').getBoundingClientRect(),w=Math.floor(rect.width),h=Math.floor(rect.height),dpr=Math.min(window.devicePixelRatio||1,2);
if(!w||!h)return;zoneCanvas.width=Math.floor(w*dpr);zoneCanvas.height=Math.floor(h*dpr);const ctx=zoneCanvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
if(state.autoSmc&&$('toggleZones').checked&&state.analysis){
const price=state.activePrice||state.analysis.last.close;const zones=[];
const sorted=[...state.analysis.activeZones].sort((a,b)=>Math.abs((a.high+a.low)/2-price)-Math.abs((b.high+b.low)/2-price));
for(const z of sorted){if(zones.length>=(w<500?1:w<900?2:3))break;const mid=(z.high+z.low)/2;if(Math.abs(mid-price)>state.analysis.atr*18)continue;if(zones.some(other=>Math.abs((other.high+other.low)/2-mid)<state.analysis.atr*.45))continue;zones.push(z);}
const time=chart.timeScale();
for(const z of zones){
const x=time.timeToCoordinate(z.startTime),y1=candles.priceToCoordinate(z.high),y2=candles.priceToCoordinate(z.low);
if(x===null||y1===null||y2===null)continue;
const start=Math.max(0,x),end=w-58,top=Math.max(0,Math.min(y1,y2)),bottom=Math.min(h,Math.max(y1,y2));
if(end<=start||bottom<=top)continue;
ctx.fillStyle=z.direction==='bull'?'rgba(59,216,161,.035)':'rgba(250,104,126,.040)';ctx.fillRect(start,top,end-start,bottom-top);
ctx.strokeStyle=z.direction==='bull'?'rgba(59,216,161,.20)':'rgba(250,104,126,.23)';
ctx.lineWidth=1;ctx.setLineDash([3,5]);ctx.strokeRect(start+.5,top+.5,end-start-1,bottom-top-1);ctx.setLineDash([]);
// Detailed FVG/OB descriptions remain in the SMC panel and levels table;
// chart-space labels are intentionally omitted so candles stay readable.
}
}
}
function renderBottom(){
const a=state.analysis,root=$('bottomTable');if(!a){root.innerHTML='<div class="table-empty">Loading structure...</div>';return;}
$('eventsCount').textContent=a.events.length+a.sweeps.length;
if(state.tableTab==='events'){
const items=[...a.events,...a.sweeps].sort((x,y)=>y.time-x.time).slice(0,22);
root.innerHTML=items.length?'<table class="data-table"><thead><tr><th>TIME (UTC)</th><th>EVENT</th><th>BIAS</th><th>LEVEL</th><th>DETAIL</th></tr></thead><tbody>'+items.map(x=>`<tr><td>${date(x.time)}</td><td class="event-name ${x.direction==='bull'?'text-green':'text-red'}">${x.type}</td><td>${x.direction==='bull'?'BULLISH':'BEARISH'}</td><td>${fmt(x.price)}</td><td>${x.description}</td></tr>`).join('')+'</tbody></table>':'<div class="table-empty">No confirmed structure events found in this window.</div>';
}else{
const items=[...a.activeZones,...a.liquidity].sort((x,y)=>(y.i||0)-(x.i||0)).slice(0,23);
root.innerHTML=items.length?'<table class="data-table"><thead><tr><th>DETECTED</th><th>TYPE</th><th>SIDE</th><th>LOW</th><th>HIGH</th></tr></thead><tbody>'+items.map(x=>`<tr><td>${date(x.created||x.time)}</td><td>${x.kind}</td><td class="${x.direction==='bull'?'text-green':x.direction==='bear'?'text-red':''}">${x.direction.toUpperCase()}</td><td>${fmt(x.low??x.price)}</td><td>${fmt(x.high??x.price)}</td></tr>`).join('')+'</tbody></table>':'<div class="table-empty">No active levels detected.</div>';
}
}

/* User-created drawings: chart selection, Fibonacci-level selection,
 * delete selected, manage grouped levels, undo and mobile chart taps.
 * Automated SMC zones and pivots remain separate from user drawings. */

/* Drawings persist by anonymous local browser workspace + market/timeframe.
 * Chart series and price-line instances are never serialized. */
const drawingsStorageKey=()=>('drawings:'+state.symbol+':'+state.tf);
function serializeDrawing(d){
  if(d.kind==='price')return {kind:'price',price:d.price};
  if(d.kind==='series')return {kind:'series',points:d.points.map(p=>({time:p.time,value:p.value}))};
  if(d.kind==='fib')return {kind:'fib',levels:d.levels.map(l=>({fraction:l.fraction,price:l.price}))};
  return null;
}
function persistDrawings(){
  const drawings=state.drawings.map(serializeDrawing).filter(Boolean);
  if(!Space.setJSON(drawingsStorageKey(),drawings)){
    // Browser quota / private mode can restrict persistence.
    if(Space.info().persistent)console.warn('Unable to save chart drawings to browser workspace');
  }
}
function restoreDrawings(){
  if(state.drawings.length||!chart||!candles)return;
  const rows=Space.getJSON(drawingsStorageKey(),[]);
  if(!Array.isArray(rows))return;
  const validPrice=p=>Number.isFinite(p)&&p>0;
  const validTime=t=>Number.isSafeInteger(t)&&t>0;
  for(const entry of rows.slice(0,100)){
    try{
      if(!entry||typeof entry!=='object')continue;
      if(entry.kind==='price'&&validPrice(entry.price)){
        const line=candles.createPriceLine({
          price:entry.price,color:'#62aeff',lineWidth:2,lineStyle:LW.LineStyle.Dashed,
          axisLabelVisible:true,title:'USER LEVEL'
        });
        state.drawings.push({kind:'price',price:entry.price,line,id:++drawingSeq});
      }
      else if(entry.kind==='series'&&Array.isArray(entry.points)&&entry.points.length===2){
        const points=entry.points;
        if(!points.every(p=>p&&validTime(p.time)&&validPrice(p.value))||points[0].time===points[1].time)continue;
        const sorted=[...points].sort((a,b)=>a.time-b.time);
        const line=addLine('#64b7ff',2);
        line.setData(sorted);
        state.drawings.push({kind:'series',line,points:sorted,id:++drawingSeq});
      }
      else if(entry.kind==='fib'&&Array.isArray(entry.levels)){
        const levels=[];
        for(const l of entry.levels.slice(0,9)){
          if(!l||!validPrice(l.price)||!Number.isFinite(l.fraction)||l.fraction<0||l.fraction>1)continue;
          const line=candles.createPriceLine({
            price:l.price,color:l.fraction===.618?'#f9bd66':'rgba(158,133,246,.65)',
            lineWidth:1,lineStyle:LW.LineStyle.Dashed,axisLabelVisible:true,
            title:'FIB '+(l.fraction*100).toFixed(1)+'%'
          });
          levels.push({fraction:l.fraction,price:l.price,line});
        }
        if(levels.length)state.drawings.push({kind:'fib',lines:levels.map(l=>l.line),levels,id:++drawingSeq});
      }
    }catch(error){console.warn('Skipped invalid stored drawing',error);}
  }
  resetDrawingSelection();
  renderDrawingPanel();
}
function drawingTitle(d){
  if(d.kind==='fib')return 'Fibonacci '+d.levels.length+' levels';
  if(d.kind==='series')return 'Trend line';
  return 'Horizontal '+fmt(d.price);
}
function getSelectedDrawing(){
  return state.drawings.find(d=>d.id===state.selectedDrawingId)||null;
}
function resetDrawingSelection(){
  state.selectedDrawingId=null;state.selectedFibLevel=null;
}
function drawSelectionOptions(){
  for(const d of state.drawings){
    const active=d.id===state.selectedDrawingId;
    try{
      if(d.kind==='price')d.line.applyOptions({color:active?'#ffd668':'#62aeff',lineWidth:active?3:2});
      else if(d.kind==='series')d.line.applyOptions({color:active?'#ffd668':'#64b7ff',lineWidth:active?3:2});
      else if(d.kind==='fib')for(const level of d.levels){
        const chosen=active&&(state.selectedFibLevel===null||state.selectedFibLevel===level.fraction);
        level.line.applyOptions({
          color:chosen?'#ffd668':level.fraction===.618?'#f9bd66':'rgba(158,133,246,.65)',
          lineWidth:chosen?3:1
        });
      }
    }catch(error){console.warn('Drawing highlight skipped',error);}
  }
}
function renderDrawingPanel(){
  const count=state.drawings.length;
  $('drawingCount').textContent=count;
  $('drawingsTotal').textContent=count;
  $('undoDrawingBtn').disabled=!count;
  $('clearDrawingsBtn').disabled=!count;
  $('clearAllDrawingsBtn').disabled=!count;
  const selected=getSelectedDrawing();
  const show=!!selected;
  $('selectedDrawingBar').classList.toggle('hidden',!show);
  if(show){
    const fibLevel=selected.kind==='fib'&&state.selectedFibLevel!==null?
      ' · '+(state.selectedFibLevel*100).toFixed(1)+'%':'';
    $('selectedDrawingLabel').textContent=drawingTitle(selected)+fibLevel;
    $('deleteSelectedDrawingBtn').textContent=fibLevel?'Delete level ✕':'Delete ✕';
  }
  const parent=$('drawingList');
  parent.replaceChildren();
  if(!count){
    const p=document.createElement('p');p.className='drawing-empty';
    p.textContent='No drawings yet. Add a horizontal line, trend line or Fibonacci to manage it here.';
    parent.appendChild(p);
  }
  for(const d of [...state.drawings].reverse()){
    const group=document.createElement('div');group.className='drawing-row';
    const select=document.createElement('button');
    select.type='button';select.className='drawing-select'+(d.id===state.selectedDrawingId?' selected':'');
    select.dataset.selectDrawing=String(d.id);select.setAttribute('aria-pressed',String(d.id===state.selectedDrawingId));
    select.textContent=drawingTitle(d);
    group.appendChild(select);
    const del=document.createElement('button');del.type='button';
    del.className='drawing-item-delete';del.dataset.deleteDrawing=String(d.id);
    del.textContent='✕';del.title='Delete '+drawingTitle(d);del.setAttribute('aria-label','Delete '+drawingTitle(d));
    group.appendChild(del);
    parent.appendChild(group);
    if(d.kind==='fib'){
      for(const level of d.levels){
        const row=document.createElement('div');row.className='drawing-row fib-level-row';
        const selectLevel=document.createElement('button');selectLevel.type='button';
        selectLevel.className='drawing-select'+(d.id===state.selectedDrawingId&&state.selectedFibLevel===level.fraction?' selected':'');
        selectLevel.dataset.selectDrawing=String(d.id);selectLevel.dataset.fibLevel=String(level.fraction);
        selectLevel.setAttribute('aria-pressed',String(d.id===state.selectedDrawingId&&state.selectedFibLevel===level.fraction));
        selectLevel.textContent='↳ '+(level.fraction*100).toFixed(1)+'% · '+fmt(level.price);
        row.appendChild(selectLevel);
        const deleteLevel=document.createElement('button');deleteLevel.type='button';deleteLevel.className='drawing-item-delete';
        deleteLevel.dataset.deleteDrawing=String(d.id);deleteLevel.dataset.fibLevel=String(level.fraction);
        deleteLevel.textContent='✕';deleteLevel.title='Delete only Fibonacci '+(level.fraction*100).toFixed(1)+'%';
        deleteLevel.setAttribute('aria-label',deleteLevel.title);
        row.appendChild(deleteLevel);parent.appendChild(row);
      }
    }
  }
  drawSelectionOptions();
}
function selectDrawing(id,fraction=null){
  if(!state.drawings.some(d=>d.id===id)){resetDrawingSelection();renderDrawingPanel();return;}
  state.selectedDrawingId=id;
  state.selectedFibLevel=fraction===null?null:Number(fraction);
  setDrawMode('cursor');
  renderDrawingPanel();persistDrawings();
}
function removeDrawing(id,fraction=null){
  const index=state.drawings.findIndex(d=>d.id===id);
  if(index<0)return;
  const d=state.drawings[index];
  const deletingOnlyLevel=d.kind==='fib'&&fraction!==null;
  if(deletingOnlyLevel){
    const entry=d.levels.find(l=>l.fraction===Number(fraction));
    if(!entry)return;
    try{candles.removePriceLine(entry.line);}catch(e){console.warn('Cannot remove Fibonacci level',e);}
    d.levels=d.levels.filter(l=>l!==entry);
    d.lines=d.levels.map(l=>l.line);
    if(!d.levels.length)state.drawings.splice(index,1);
  }else{
    try{
      if(d.kind==='price')candles.removePriceLine(d.line);
      else if(d.kind==='fib')d.levels.forEach(l=>candles.removePriceLine(l.line));
      else if(d.kind==='series')chart.removeSeries(d.line);
    }catch(e){console.warn('Drawing deletion failed',e);}
    state.drawings.splice(index,1);
  }
  resetDrawingSelection();
  renderDrawingPanel();persistDrawings();
  toast(deletingOnlyLevel?'Fibonacci level deleted.':'Drawing deleted.');
}
function deleteSelectedDrawing(){
  const d=getSelectedDrawing();
  if(!d){toast('Select a drawing first.',true);return;}
  removeDrawing(d.id,state.selectedFibLevel);
}
function undoDrawing(){
  if(!state.drawings.length)return;
  removeDrawing(state.drawings.at(-1).id);
}
function drawingHitTest(point){
  if(!point||!candles||!chart)return null;
  const threshold=window.innerWidth<=730?16:11;
  let best=null;
  const consider=(id,level,distance)=>{
    if(Number.isFinite(distance)&&distance<=threshold&&(!best||distance<best.distance))
      best={id,fraction:level,distance};
  };
  for(const d of state.drawings){
    try{
      if(d.kind==='price'){
        const y=candles.priceToCoordinate(d.price);
        if(y!==null)consider(d.id,null,Math.abs(y-point.y));
      }else if(d.kind==='fib'){
        for(const l of d.levels){
          const y=candles.priceToCoordinate(l.price);
          if(y!==null)consider(d.id,l.fraction,Math.abs(y-point.y));
        }
      }else if(d.kind==='series'&&d.points?.length===2){
        const [a,b]=d.points;
        const x1=chart.timeScale().timeToCoordinate(a.time),x2=chart.timeScale().timeToCoordinate(b.time);
        const y1=candles.priceToCoordinate(a.value),y2=candles.priceToCoordinate(b.value);
        if([x1,x2,y1,y2].some(x=>x===null)||Math.abs(x2-x1)<1)continue;
        const t=((point.x-x1)*(x2-x1)+(point.y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2);
        if(t<-.04||t>1.04)continue;
        consider(d.id,null,Math.hypot(point.x-(x1+t*(x2-x1)),point.y-(y1+t*(y2-y1))));
      }
    }catch(e){console.warn('Drawing hit-test skipped',e);}
  }
  return best;
}
function onChartClick(param){
  if(!param?.point)return;
  if(state.drawMode==='cursor'){
    const hit=drawingHitTest(param.point);
    if(hit)selectDrawing(hit.id,hit.fraction);
    else if(state.selectedDrawingId!==null){resetDrawingSelection();renderDrawingPanel();}
    return;
  }
  const price=candles.coordinateToPrice(param.point.y);
  const time=param.time||chart.timeScale().coordinateToTime(param.point.x);
  if(!Number.isFinite(price)||!time)return;
  if(state.drawMode==='horizontal'){
    const line=candles.createPriceLine({price,color:'#62aeff',lineWidth:2,lineStyle:LW.LineStyle.Dashed,axisLabelVisible:true,title:'USER LEVEL'});
    const drawing={id:++drawingSeq,kind:'price',price,line};
    state.drawings.push(drawing);
    selectDrawing(drawing.id);
    toast('Horizontal level added at '+fmt(price));
    return;
  }
  if(!state.drawStart){
    state.drawStart={time,price};
    $('drawHint').textContent='Select the second point on the chart';
    return;
  }
  const start=state.drawStart;state.drawStart=null;
  if(state.drawMode==='trend'){
    if(start.time===time){toast('Choose two different candles.',true);return;}
    const line=addLine('#64b7ff',2);
    const points=[{time:start.time,value:start.price},{time,value:price}].sort((a,b)=>a.time>b.time?1:-1);
    line.setData(points);
    const drawing={id:++drawingSeq,kind:'series',line,points};
    state.drawings.push(drawing);selectDrawing(drawing.id);toast('Trend line added.');
  }else if(state.drawMode==='fib'){
    if(start.price===price){toast('Choose two different prices.',true);return;}
    const levels=[];
    for(const fraction of [0,.236,.382,.5,.618,.786,1]){
      const p=start.price+(price-start.price)*fraction;
      const line=candles.createPriceLine({
        price:p,color:fraction===.618?'#f9bd66':'rgba(158,133,246,.65)',
        lineWidth:1,lineStyle:LW.LineStyle.Dashed,axisLabelVisible:true,title:'FIB '+(fraction*100).toFixed(1)+'%'
      });
      levels.push({fraction,price:p,line});
    }
    const drawing={id:++drawingSeq,kind:'fib',lines:levels.map(l=>l.line),levels};
    state.drawings.push(drawing);selectDrawing(drawing.id);toast('Fibonacci added. Tap a level or Manage drawings to delete it.');
  }
}
function setDrawMode(mode){
  state.drawMode=mode;state.drawStart=null;
  document.querySelectorAll('[data-draw]').forEach(b=>b.classList.toggle('active',b.dataset.draw===mode));
  $('drawHint').classList.toggle('hidden',mode==='cursor');
  if(mode!=='cursor')$('drawHint').textContent=mode==='horizontal'?'Tap chart to add a horizontal level':'Tap the first point on the chart';
}
function clearDrawings({forget=true,notice=true}={}){
  const toRemove=[...state.drawings];
  for(const d of toRemove){
    try{
      if(d.kind==='price')candles.removePriceLine(d.line);
      else if(d.kind==='fib')d.levels.forEach(l=>candles.removePriceLine(l.line));
      else chart.removeSeries(d.line);
    }catch(e){console.warn('Drawing clear skipped',e);}
  }
  state.drawings=[];resetDrawingSelection();
  renderDrawingPanel();setDrawMode('cursor');
  if(forget)persistDrawings();
  if(notice&&toRemove.length)toast('All drawings cleared.');
}
function downloadCsv(){
if(!state.data.length){toast('No candles to export yet',true);return;}
const header='timestamp_utc,open,high,low,close,volume';
const content=[header,...state.data.map(c=>[new Date(c.time*1000).toISOString(),c.open,c.high,c.low,c.close,c.volume].join(','))].join('\n');
const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download='RibhLab_'+state.symbol+'_'+state.tf+'_OHLCV.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('OHLCV CSV exported.');
}
const INDICATOR_IDS=['toggleEMA','toggleVolume','toggleRSI','toggleZones','toggleMarkers','toggleSR'];
function saveIndicators(){
  const prefs={};for(const id of INDICATOR_IDS)prefs[id]=$(id).checked;
  remember('indicators',JSON.stringify(prefs));
}
function restoreSettings(){
  if(!Space)throw Error('Local workspace module unavailable');
  const symbol=preference('symbol'),tf=preference('tf'),category=preference('category'),tab=preference('tableTab');
  if(coins.some(c=>c.symbol===symbol))state.symbol=symbol;
  if(Object.hasOwn(intervals,tf))state.tf=tf;
  if(['all','metals','indices','forex','crypto','energy','stocks'].includes(category))state.category=category;
  if(['events','levels'].includes(tab))state.tableTab=tab;
  state.autoSmc=preference('autoSmc')!=='false';
  $('autoSmcBtn').classList.toggle('active-tool',state.autoSmc);
  $('smcSwitchDot').style.opacity=state.autoSmc?'1':'.1';
  $('symbolSearch').value=(preference('search')||'').slice(0,90);
  const indicators=Space.getJSON('indicators',{});
  for(const id of INDICATOR_IDS)if(typeof indicators[id]==='boolean')$(id).checked=indicators[id];
  document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===state.category));
  $('marketCategoryName').textContent=state.category==='all'?'ALL MARKETS':state.category.toUpperCase();
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===state.tableTab));
}
function setupWorkspaceUi(){
  const meta=Space.info();
  $('workspaceState').textContent=meta.persistent?'Saved automatically on this browser':'Temporary session (browser storage blocked)';
  $('workspaceLabel').textContent=meta.persistent?
    'Your drawings, favorites and indicators are saved locally, without an account':
    'Your browser blocked local storage. Changes may disappear when you close this tab.';
  const modal=$('workspaceModal');
  const close=()=>{modal.classList.add('hidden');$('workspaceBtn').focus();};
  $('workspaceBtn').addEventListener('click',()=>{modal.classList.remove('hidden');$('workspaceCloseBtn').focus();});
  $('workspaceCloseBtn').addEventListener('click',close);
  $('workspaceDoneBtn').addEventListener('click',close);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!modal.classList.contains('hidden'))close();
  });
  $('workspaceEraseBtn').addEventListener('click',()=>{
    if(!confirm('Erase all saved TradingFiew charts, favorites and settings from THIS browser profile? This cannot be undone.'))return;
    Space.clearBrowser();
    location.replace(location.pathname);
  });
}

/* Chart Window shows the existing live chart, not a duplicate or screenshot.
 * Changes to indicators, drawings and timeframe remain fully functional. */
function resizeChartWindow(){
  if(!chart||!rsiChart)return;
  try{
    const el=$('chartHost'),r=el.getBoundingClientRect();
    if(r.width>80&&r.height>70)chart.resize(Math.floor(r.width),Math.floor(r.height));
    const rsi=$('rsiHost').getBoundingClientRect();
    if(rsi.width>80&&rsi.height>30)rsiChart.resize(Math.floor(rsi.width),Math.floor(rsi.height));
    drawZones();
  }catch(error){console.warn('Chart window resizing issue',error);}
}
function setChartWindow(open,{save=true}={}){
  document.body.classList.toggle('chart-window-active',Boolean(open));
  $('chartWindowBtn').setAttribute('aria-pressed',String(Boolean(open)));
  $('chartWindowBtn').title=open?'Chart window is open':'Open chart window (full screen)';
  state.chartWindow=Boolean(open);
  if(save)remember('chartWindow',String(Boolean(open)));
  requestAnimationFrame(()=>{
    resizeChartWindow();
    requestAnimationFrame(resizeChartWindow);
  });
  if(open)$('chartWindowCloseBtn').focus();
  else $('chartWindowBtn').focus();
}
function bind(){
$('marketCategories').addEventListener('click',e=>{const button=e.target.closest('[data-category]');if(!button)return;state.category=button.dataset.category;remember('category',state.category);document.querySelectorAll('[data-category]').forEach(n=>n.classList.toggle('active',n===button));$('marketCategoryName').textContent=state.category==='all'?'ALL MARKETS':state.category.toUpperCase();renderMarkets();});
$('marketList').addEventListener('click',e=>{
const star=e.target.closest('[data-star]');if(star){const s=star.dataset.star;if(state.favorites.has(s))state.favorites.delete(s);else state.favorites.add(s);remember('favorites',JSON.stringify([...state.favorites]));renderMarkets();return;}
const row=e.target.closest('[data-pair]');if(row&&row.dataset.pair!==state.symbol){clearDrawings({forget:false,notice:false});state.symbol=row.dataset.pair;loadMarket();}
});
$('symbolSearch').addEventListener('input',()=>{remember('search',$('symbolSearch').value);renderMarkets();});
$('timeframes').addEventListener('click',e=>{const b=e.target.closest('[data-tf]');if(b&&b.dataset.tf!==state.tf){clearDrawings({forget:false,notice:false});state.tf=b.dataset.tf;loadMarket();}});
$('refreshBtn').addEventListener('click',()=>loadMarket(false));
$('refreshChartBtn').addEventListener('click',()=>loadMarket(false));
$('fitBtn').addEventListener('click',focusRecentCandles);
$('chartWindowBtn').addEventListener('click',()=>setChartWindow(!state.chartWindow));
$('chartWindowCloseBtn').addEventListener('click',()=>setChartWindow(false));
$('csvBtn').addEventListener('click',downloadCsv);
$('themeBtn').addEventListener('click',()=>{state.dark=!state.dark;updateTheme();});
$('reAnalyzeBtn').addEventListener('click',()=>{analyze();fetchHigherTimeframe(state.request);toast('SMC analysis refreshed.');});
$('indicatorsBtn').addEventListener('click',e=>{e.stopPropagation();$('indicatorMenu').classList.toggle('open');});
document.addEventListener('click',e=>{if(!e.target.closest('.toolbar-menu'))$('indicatorMenu').classList.remove('open');});
$('toggleEMA').addEventListener('change',refreshEMAs);
$('toggleVolume').addEventListener('change',()=>{if(state.data.length)vol.setData($('toggleVolume').checked?state.data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'})):[]);});
$('toggleRSI').addEventListener('change',refreshRsi);
$('toggleZones').addEventListener('change',drawZones);
$('toggleMarkers').addEventListener('change',renderMarkers);
$('toggleSR').addEventListener('change',renderSupportResistance);
for(const id of ['toggleEMA','toggleVolume','toggleRSI','toggleZones','toggleMarkers','toggleSR']){
  $(id).addEventListener('change',saveIndicators);
}
$('autoSmcBtn').addEventListener('click',()=>{state.autoSmc=!state.autoSmc;$('autoSmcBtn').classList.toggle('active-tool',state.autoSmc);$('smcSwitchDot').style.opacity=state.autoSmc?'1':'.1';remember('autoSmc',String(state.autoSmc));drawZones();renderMarkers();toast(state.autoSmc?'Auto SMC overlays on':'Auto SMC overlays hidden');});
document.querySelectorAll('[data-draw]').forEach(b=>b.addEventListener('click',()=>setDrawMode(b.dataset.draw)));
$('clearDrawingsBtn').addEventListener('click',clearDrawings);
$('undoDrawingBtn').addEventListener('click',undoDrawing);
$('clearAllDrawingsBtn').addEventListener('click',clearDrawings);
$('drawingManagerBtn').addEventListener('click',()=>{
  const panel=$('drawingsPanel');const opening=panel.classList.contains('hidden');
  panel.classList.toggle('hidden',!opening);
  $('drawingManagerBtn').setAttribute('aria-expanded',opening?'true':'false');
  renderDrawingPanel();
});
$('closeDrawingsPanelBtn').addEventListener('click',()=>{
  $('drawingsPanel').classList.add('hidden');
  $('drawingManagerBtn').setAttribute('aria-expanded','false');
});
$('deleteSelectedDrawingBtn').addEventListener('click',deleteSelectedDrawing);
$('deselectDrawingBtn').addEventListener('click',()=>{resetDrawingSelection();renderDrawingPanel();});
$('drawingList').addEventListener('click',e=>{
  const remove=e.target.closest('[data-delete-drawing]');
  const select=e.target.closest('[data-select-drawing]');
  const target=remove||select;if(!target)return;
  const id=Number(target.dataset.deleteDrawing||target.dataset.selectDrawing);
  const fraction=target.hasAttribute('data-fib-level')?Number(target.dataset.fibLevel):null;
  if(remove)removeDrawing(id,fraction);
  else selectDrawing(id,fraction);
});
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{state.tableTab=b.dataset.tab;remember('tableTab',state.tableTab);document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n===b));renderBottom();}));
const close=()=>{$('guideModal').classList.add('hidden');};
$('guideBtn').addEventListener('click',()=>{$('guideModal').classList.remove('hidden');});
$('closeGuideBtn').addEventListener('click',close);$('guideDoneBtn').addEventListener('click',close);
$('guideModal').addEventListener('click',e=>{if(e.target===$('guideModal'))close();});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(state.chartWindow)setChartWindow(false);
    close();setDrawMode('cursor');
    $('drawingsPanel').classList.add('hidden');
    $('drawingManagerBtn').setAttribute('aria-expanded','false');
    resetDrawingSelection();renderDrawingPanel();
  }else if((e.key==='Delete'||e.key==='Backspace')&&getSelectedDrawing()){
    const t=e.target,tag=t?.tagName?.toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='select'||t?.isContentEditable)return;
    if(!$('donateModal').classList.contains('hidden'))return;
    e.preventDefault();deleteSelectedDrawing();
  }
});
}
function start(){
try{
let responsiveTimer=null;
window.addEventListener('resize',()=>{clearTimeout(responsiveTimer);responsiveTimer=setTimeout(()=>{resizeChartWindow();if(state.analysis){renderMarkers();drawZones();}},140);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&activeMarket().provider==='biquote'&&state.data.length)void fetchTicker(state.symbol,state.request);});
restoreSettings();setupWorkspaceUi();
const url=new URL(location.href),requested=url.searchParams.get('symbol'),tf=url.searchParams.get('tf');
if(coins.some(c=>c.symbol===requested))state.symbol=requested;
if(Object.hasOwn(intervals,tf))state.tf=tf;
try{state.favorites=new Set(JSON.parse(preference('favorites')||'[]'));}catch{}
state.dark=preference('theme')!=='light';
bind();renderMarkets();updateTheme();setupCharts();renderDrawingPanel();showInstrument();loadMarket();
if(preference('chartWindow')==='true')setChartWindow(true,{save:false});
}catch(e){loading('Unable to start the chart',e.message,true);connection('OFFLINE','Chart library missing');console.error(e);}
}
window.addEventListener('DOMContentLoaded',start);
})();