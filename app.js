/* RibhLab SMC Terminal | no secrets, no trading orders, all market data public. */
(function(){
'use strict';
const LW=window.LightweightCharts,Engine=window.SmcEngine,Markets=window.TradingFiewMarkets,Space=window.TradingFiewWorkspace,Geometry=window.TradingFiewDrawingGeometry;
const $=id=>document.getElementById(id);
const intervals={'5m':'1h','15m':'4h','1h':'4h','4h':'1d','1d':'1w'};
const activeMarket=()=>Markets.get(state.symbol)||coins[0];
const coins=Markets.instruments;
let state={
symbol:'XAUUSD',category:'all',tf:'1h',data:[],analysis:null,htf:null,request:0,ws:null,controller:null,refreshTimer:null,
heartbeat:null,analysisTimer:null,reconnectTimer:null,quoteTimer:null,tabTickerTimer:null,quoteBusy:false,quoteAt:null,quotePrice:null,quoteIsFresh:false,tabChangePct:null,tabQuoteStatus:null,autoSmc:true,drawMode:'cursor',drawStart:null,drawings:[],selectedDrawingId:null,selectedFibLevel:null,
tableTab:'events',favorites:new Set(),dark:true,activePrice:null,live:false
};
let chart,candles,vol,ema20,ema50,ema200,rsiChart,rsiSeries,markersApi,zoneCanvas,resizeObserver,toastTimer,shownGuide=false,markerLayoutTimer=null;
let lastPriceLine=null,srGuides=[],drawingSeq=0,alertPriceLines=new Map();
let syncingTimeRanges=false,syncingCrosshair=false,rsiPointsByTime=new Map(),rsiTimelineReady=false,priceAxisMinimum=88,sharedCrosshairTime=null,livePriceBadgePending=false;
let alertMenuTarget=null,alertDrag=null,alertLayoutPending=false,chartLongPress=null,suppressAlertClickUntil=0;
let drawingDrag=null,drawGesture=null,drawSequence=[],suppressDrawingClickUntil=0;
const FIB_RETRACE=[0,.236,.382,.5,.618,.786,.886,1];
const FIB_EXTEND=[0,.236,.382,.5,.618,.786,1,1.272,1.618,2,2.618];
const DRAW_MODES=['cursor','alert','horizontal','vertical','trend','fib','fibext','fibchannel','fibtime','channel','rectangle','measure'];
const preference=key=>Space?.get(key)??null;
const remember=(key,value)=>Space?.set(key,value);
const num=(v,dec)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}):'—';
const decimals=v=>v<.01?6:v<5?5:v<100?3:2;
const fmt=v=>num(v,decimals(Math.abs(v||1)));
const compact=v=>Number.isFinite(v)?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(v):'—';
const sign=v=>Number.isFinite(v)?(v>=0?'+':'')+num(v,2)+'%':'—';

/* Keep the browser tab like a compact TradingView ticker:
 * SYMBOL + actual displayed price + genuine provider percentage change.
 * Non-live/closed markets are labelled rather than appearing tradable.
 * No percentage is derived from an unrelated chart interval.
 */
function updateBrowserTabTitle(){
  const symbol=state.symbol||'TRADINGFIEW';
  const price=Number.isFinite(state.activePrice)&&state.activePrice>0?
    ' '+fmt(state.activePrice):'';
  const pct=Number.isFinite(state.tabChangePct)?
    ' '+(state.tabChangePct>0?'▲':state.tabChangePct<0?'▼':'•')+
    ' '+(state.tabChangePct>0?'+':'')+state.tabChangePct.toFixed(2)+'%':'';
  const status=state.tabQuoteStatus==='closed'?' · CLOSED':
    state.tabQuoteStatus==='stale'?' · STALE':'';
  const title=symbol+price+pct+status+' | TradingFiew';
  if(document.title!==title)document.title=title;
}

const date=t=>new Date(t*1000).toLocaleString('en-GB',{timeZone:'UTC',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
const relative=(t)=>{const n=Math.round((Date.now()/1000-t)/60);return n<1?'just now':n<60?n+'m ago':n<1440?Math.floor(n/60)+'h ago':Math.floor(n/1440)+'d ago';};
const themeColors=()=>document.body.classList.contains('light')?{bg:'#f7f9fc',text:'#6b7b91',grid:'#e9eef4'}:{bg:'#0c1322',text:'#75849a',grid:'#172236'};
function toast(message,error=false){const el=$('toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),5000);}
function connection(value,mode){$('connectionState').textContent=value;$('feedText').textContent=mode||value;const live=value==='LIVE'||value==='LIVE QUOTE';$('liveDot').className='status-dot '+(live?'online':value==='OFFLINE'?'offline':'');$('feedStatusDot').className='status-dot '+(live?'online':value==='OFFLINE'?'offline':'');state.live=live;scheduleLivePriceBadgeLayout();}
function loading(message,sub,error=false){const el=$('chartState');el.classList.remove('hidden');el.classList.toggle('error',error);el.querySelector('strong').textContent=message;el.querySelector('span').textContent=sub;}
function showChart(){ $('chartState').classList.add('hidden');}
function chartOptions(height,primary=false){
const c=themeColors();
return {autoSize:true,width:700,height,layout:{background:{type:'solid',color:c.bg},textColor:c.text,fontFamily:'IBM Plex Mono, monospace',fontSize:10,attributionLogo:false},
grid:{vertLines:{color:c.grid,style:1},horzLines:{color:c.grid,style:1}},
crosshair:{mode:LW.CrosshairMode.Normal,vertLine:{visible:false,labelVisible:false},horzLine:{visible:primary,labelVisible:primary,color:'#8da3c1',width:1,style:LW.LineStyle.Dashed,labelBackgroundColor:'#374151'}},
rightPriceScale:{borderColor:c.grid,minimumWidth:88,scaleMargins:{top:.11,bottom:primary ? .23 : .06}},
timeScale:{borderColor:c.grid,timeVisible:true,secondsVisible:false,barSpacing:window.innerWidth<=730?6:8,minBarSpacing:2,rightOffset:window.innerWidth<=730?4:8},
handleScroll:true,handleScale:true,localization:{locale:'en-US'}};
}
function addLine(color,width=1){return chart.addSeries(LW.LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});}
/* Chart and RSI must use the same FULL timestamp index and equal plot width.
 * These module-scope functions are also needed during asynchronous analysis. */
function layoutSharedCrosshairGuide(){
  const guide=$('syncedCrosshairGuide');
  if(!guide||!chart||!rsiChart||!$('toggleRSI').checked||
     !Number.isFinite(sharedCrosshairTime)){if(guide)guide.hidden=true;return;}
  try{
    const x=chart.timeScale().timeToCoordinate(sharedCrosshairTime);
    const host=$('chartHost').getBoundingClientRect();
    const bottom=$('rsiPanel').getBoundingClientRect();
    const inner=$('chartHost').closest('.chart-inner').getBoundingClientRect();
    const plotWidth=host.width-chart.priceScale('right').width();
    if(!Number.isFinite(x)||x<0||x>=plotWidth||host.height<30){
      guide.hidden=true;return;
    }
    guide.style.left=(host.left-inner.left+x)+'px';
    guide.style.top=(host.top-inner.top)+'px';
    guide.style.height=Math.max(0,bottom.bottom-host.top)+'px';
    guide.hidden=false;
  }catch(error){guide.hidden=true;}
}
function updateSharedCrosshairGuide(time){
  sharedCrosshairTime=typeof time==='number'&&Number.isFinite(time)?time:null;
  layoutSharedCrosshairGuide();
}
function alignPriceScaleWidths(){
  if(!chart||!rsiChart)return;
  try{
    const a=chart.priceScale('right'),b=rsiChart.priceScale('right');
    const target=Math.ceil(Math.max(priceAxisMinimum,a.width(),b.width()));
    priceAxisMinimum=target;
    a.applyOptions({minimumWidth:target});
    b.applyOptions({minimumWidth:target});
  }catch(error){console.warn('Matching price axes unavailable',error);}
}
function synchronizeVisibleRange(source,target,range){
  if(syncingTimeRanges||!rsiTimelineReady||!range||
     !Number.isFinite(range.from)||!Number.isFinite(range.to)||!state.data.length)return;
  try{
    const existing=target.timeScale().getVisibleLogicalRange();
    if(existing&&Math.abs(existing.from-range.from)<.02&&Math.abs(existing.to-range.to)<.02)return;
    syncingTimeRanges=true;
    target.timeScale().setVisibleLogicalRange(range);
  }catch(error){console.warn('RSI synchronized range unavailable',error);}
  finally{syncingTimeRanges=false;}
}
function restoreSharedTimeScale(){
  if(!rsiTimelineReady||!chart||!rsiChart)return;
  alignPriceScaleWidths();
  const range=chart.timeScale().getVisibleLogicalRange();
  if(range)synchronizeVisibleRange(chart,rsiChart,range);
}
function setupCharts(){
if(!LW||!LW.createChart||!LW.CandlestickSeries||!Engine||!Markets)throw new Error('Chart or analysis library unavailable. Check your network and reload.');
chart=LW.createChart($('chartHost'),chartOptions(405,true));
candles=chart.addSeries(LW.CandlestickSeries,{upColor:'#36cba1',downColor:'#f2647e',borderUpColor:'#36cba1',borderDownColor:'#f2647e',wickUpColor:'#36cba1',wickDownColor:'#f2647e',priceLineVisible:false,lastValueVisible:false});
vol=chart.addSeries(LW.HistogramSeries,{priceScaleId:'volume',priceFormat:{type:'volume'},lastValueVisible:false,priceLineVisible:false});
chart.priceScale('volume').applyOptions({scaleMargins:{top:.82,bottom:0}});
ema20=addLine('#699cf6',2);ema50=addLine('#ecae53',1);ema200=addLine('#a28df0',1);
rsiChart=LW.createChart($('rsiHost'),{...chartOptions(92,false),rightPriceScale:{visible:true,borderVisible:false,minimumWidth:88,scaleMargins:{top:.10,bottom:.10}},timeScale:{visible:false,borderVisible:false},grid:{vertLines:{visible:false},horzLines:{color:themeColors().grid}},crosshair:{mode:LW.CrosshairMode.Normal,vertLine:{visible:false,labelVisible:false},horzLine:{visible:false,labelVisible:false}},handleScroll:true,handleScale:true});
rsiSeries=rsiChart.addSeries(LW.LineSeries,{color:'#a998fc',lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
rsiSeries.createPriceLine({price:70,color:'rgba(245,114,140,.35)',lineStyle:LW.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
rsiSeries.createPriceLine({price:30,color:'rgba(53,208,154,.35)',lineStyle:LW.LineStyle.Dashed,lineWidth:1,axisLabelVisible:false});
function linkedCrosshair(param,source){
  if(syncingCrosshair)return;
  const target=source==='main'?rsiChart:chart;
  if(!param?.time||!state.data.length){
    try{syncingCrosshair=true;target.clearCrosshairPosition();}catch{}
    finally{syncingCrosshair=false;}
    return;
  }
  const time=typeof param.time==='number'?param.time:null;
  const rsiPoint=source==='main'?rsiPointsByTime.get(time):null;
  const candlePoint=source==='rsi'?state.data.find(d=>d.time===time):null;
  // Open bars have no confirmed RSI. This fallback is only a hidden cursor Y
  // coordinate; it never creates a real RSI value or a trading signal.
  const value=source==='main'?(rsiPoint?.value??state.analysis?.rsis?.at(-1)?.value??50):candlePoint?.close;
  const series=source==='main'?rsiSeries:candles;
  if(!Number.isFinite(value)){
    try{syncingCrosshair=true;target.clearCrosshairPosition();}catch{}
    finally{syncingCrosshair=false;}
    return;
  }
  try{
    syncingCrosshair=true;
    target.setCrosshairPosition(value,param.time,series);
  }catch(error){console.warn('Linked RSI crosshair unavailable',error);}
  finally{syncingCrosshair=false;}
}
chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{
  scheduleAlertLayout();drawZones();scheduleDrawingOverlay();
  if(sharedCrosshairTime!==null)requestAnimationFrame(layoutSharedCrosshairGuide);
  scheduleLivePriceBadgeLayout();
  synchronizeVisibleRange(chart,rsiChart,range);
  clearTimeout(markerLayoutTimer);
  markerLayoutTimer=setTimeout(()=>{if(state.analysis)renderMarkers();},120);
});
rsiChart.timeScale().subscribeVisibleLogicalRangeChange(range=>{
  if(sharedCrosshairTime!==null)requestAnimationFrame(layoutSharedCrosshairGuide);
  synchronizeVisibleRange(rsiChart,chart,range);
});
chart.subscribeCrosshairMove(p=>{
  updateSharedCrosshairGuide(p.time);
  scheduleAlertLayout();
  const c=p.seriesData?.get(candles);
  if(c&&Number.isFinite(c.close))setOhlc(c);
  else if(state.data.length)setOhlc(state.data.at(-1));
  linkedCrosshair(p,'main');
});
rsiChart.subscribeCrosshairMove(p=>{
  updateSharedCrosshairGuide(p.time);
  const c=p.time&&state.data.find(d=>d.time===p.time);
  if(c)setOhlc(c);
  else if(state.data.length)setOhlc(state.data.at(-1));
  linkedCrosshair(p,'rsi');
});
chart.subscribeClick(onChartClick);
installChartContextHandlers();
installLineDragging();
installPrecisionDraw();
document.addEventListener('tradingfiew:alerts-changed',renderAlertPriceLines);
zoneCanvas=$('zoneOverlay');resizeObserver=new ResizeObserver(()=>{
  scheduleAlertLayout();
  drawZones();scheduleDrawingOverlay();
  if(state.analysis){renderMarkers();renderSupportResistance();}
});resizeObserver.observe($('chartHost'));
try{markersApi=LW.createSeriesMarkers?LW.createSeriesMarkers(candles,[]):null;}catch{markersApi=null;}
}
function updateTheme(){
document.body.classList.toggle('light',!state.dark);
document.documentElement.style.colorScheme=state.dark?'dark':'light';
$('themeIcon').textContent=state.dark?'☀':'☾';
$('themeLabel').textContent=state.dark?'Day':'Night';
$('themeBtn').setAttribute('aria-label',state.dark?'Switch to Day theme':'Switch to Night theme');
$('themeBtn').setAttribute('aria-pressed',String(!state.dark));
$('themeBtn').title=state.dark?'Switch to Day theme':'Switch to Night theme';
document.querySelector('meta[name="theme-color"]')?.setAttribute('content',state.dark?'#0a1020':'#f7f9fc');
if(chart){
let t=themeColors();chart.applyOptions({layout:{background:{type:'solid',color:t.bg},textColor:t.text},grid:{vertLines:{color:t.grid},horzLines:{color:t.grid}},rightPriceScale:{borderColor:t.grid},timeScale:{borderColor:t.grid}});
rsiChart.applyOptions({
 layout:{background:{type:'solid',color:t.bg},textColor:t.text},
 grid:{horzLines:{color:t.grid}},
 crosshair:{vertLine:{visible:false,labelVisible:false}}
});
if(lastPriceLine)lastPriceLine.applyOptions({color:priceGuideColor()});
scheduleLivePriceBadgeLayout();
drawZones();
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
updateBrowserTabTitle();
}
function setOhlc(c){
for(const [id,key] of [['oVal','open'],['hVal','high'],['lVal','low'],['cVal','close']])$(id).textContent=fmt(c[key]);
const original=state.data.findLast?.(x=>x.time===c.time)||state.data.at(-1);
$('volumeStripValue').textContent=Number.isFinite(original?.volume)?compact(original.volume):'—';
}
function priceGuideColor(){return document.body.classList.contains('light')?'#008f88':'#22d7c1';}
/* A single readable price badge replaces the chart library's small axis
 * label. Both the solid live-price line and the badge use the SAME series
 * coordinate, so the number cannot drift away from its actual level.
 * If the price is outside the visible chart range, an arrow clearly marks
 * the badge as off-screen rather than implying a different level. */
/* The countdown is based on the last real candle's opening timestamp
 * and the selected interval. A stale feed must never show a fake countdown. */
function candleCountdownData(){
  const last=state.data.at(-1),duration=TF_SECONDS[state.tf];
  if(!last||!duration)return {text:'—',active:false,status:'waiting'};
  const market=activeMarket();
  const fresh=market.provider==='binance'?
    state.live&&state.ws?.readyState===WebSocket.OPEN:
    state.quoteIsFresh&&Number.isFinite(state.quoteAt)&&Math.abs(Date.now()/1000-state.quoteAt)<120;
  if(!fresh)return {text:'PAUSED',active:false,status:'paused'};
  const left=Math.ceil(last.time+duration-Date.now()/1000);
  if(!Number.isFinite(left)||left<=0||left>duration)return {text:'—',active:false,status:'stale'};
  const pad=n=>String(n).padStart(2,'0');
  const hh=Math.floor(left/3600),mm=Math.floor(left%3600/60),ss=left%60;
  return {text:(hh?pad(hh)+':':'')+pad(mm)+':'+pad(ss),active:true,status:'active'};
}
/* The first badge row is centered ON the actual current-price line.
 * The second row counts down the active candle just like TradingView. */
function layoutLivePriceBadge(){
  livePriceBadgePending=false;
  const badge=$('livePriceBadge');
  if(!badge)return;
  if(!chart||!candles||!state.data.length||!Number.isFinite(state.activePrice)){
    badge.hidden=true;return;
  }
  try{
    const host=$('chartHost').getBoundingClientRect(),
      holder=badge.parentElement.getBoundingClientRect(),
      y=candles.priceToCoordinate(state.activePrice);
    if(!Number.isFinite(y)||host.height<50){badge.hidden=true;return;}
    const minY=12,maxY=Math.max(minY,host.height-34);
    const pos=Math.max(minY,Math.min(maxY,y));
    const range=y<minY?'above':y>maxY?'below':'visible';
    const number=fmt(state.activePrice),last=state.data.at(-1);
    const market=activeMarket(),countdown=candleCountdownData();
    const fresh=countdown.active;
    const direction=Number.isFinite(last?.open)&&state.activePrice<last.open?'down':'up';
    badge.querySelector('.axis-price').textContent=(range==='above'?'▲ ':range==='below'?'▼ ':'')+number;
    badge.querySelector('.axis-countdown').textContent=countdown.text;
    badge.style.top=(host.top-holder.top+pos-9)+'px';
    badge.style.width=Math.ceil(Math.max(88,chart.priceScale('right').width()))+'px';
    badge.dataset.range=range;
    badge.dataset.direction=direction;
    badge.dataset.fresh=String(Boolean(fresh));
    badge.title=(range==='above'?'Current quote ABOVE visible chart range':range==='below'?
      'Current quote BELOW visible chart range':'Current market price at this chart level')+
      ': '+number+' · '+(countdown.active?'Candle closes in '+countdown.text:
        countdown.status==='paused'?'Market feed paused':'Current candle not confirmed');
    badge.setAttribute('aria-label',market.symbol+' current price '+number+
      (countdown.active?', candle closes in '+countdown.text:', '+(countdown.status==='paused'?'market paused':'current candle unavailable')));
    badge.hidden=false;
  }catch(error){badge.hidden=true;console.warn('Price badge layout unavailable',error);}
}
function scheduleLivePriceBadgeLayout(){
  if(livePriceBadgePending)return;
  livePriceBadgePending=true;
  requestAnimationFrame(layoutLivePriceBadge);
}

function updatePrice(v){if(!Number.isFinite(v)||v<=0)return;
state.activePrice=v;$('lastPrice').textContent=fmt(v);
updateBrowserTabTitle();
try{
  const market=activeMarket();
  window.TradingFiewAlerts?.onPrice(state.symbol,v,{
    fresh:market.provider==='binance'?state.live:state.quoteIsFresh
  });
}catch(error){console.warn('Optional price alert processing failed',error);}
$('updatedAt').textContent='Updated '+new Date().toLocaleTimeString('en-GB',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',second:'2-digit'});
scheduleAlertLayout();
if(candles){try{const options={price:v,color:priceGuideColor(),lineWidth:1,lineStyle:LW.LineStyle.Solid,axisLabelVisible:false,title:''};
if(!lastPriceLine)lastPriceLine=candles.createPriceLine(options);else lastPriceLine.applyOptions(options);
}catch(e){console.warn('Last-price guide issue',e);}}
scheduleLivePriceBadgeLayout();
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
  scheduleLivePriceBadgeLayout();
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
if(newer){
  state.tabChangePct=Number.isFinite(t.change)?t.change:null;
  state.tabQuoteStatus=t.marketState==='closed'?'closed':
    !fresh?'stale':'open';
}
state.quoteIsFresh=fresh;
updateBrowserTabTitle();
scheduleLivePriceBadgeLayout();
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
    if(request!==state.request)return;
    // A hidden tab may still run JS: continue monitored markets where possible.
    // Mobile browsers can suspend this regardless; a push backend is required
    // for guaranteed notifications when the website is closed.
    if(document.hidden&&!window.TradingFiewAlerts?.watching?.(state.symbol))return;
    void fetchTicker(state.symbol,request);
  },5000);
}
function clearTimer(){clearInterval(state.refreshTimer);clearInterval(state.quoteTimer);clearInterval(state.tabTickerTimer);clearInterval(state.heartbeat);clearTimeout(state.reconnectTimer);clearTimeout(state.analysisTimer);state.refreshTimer=null;state.quoteTimer=null;state.tabTickerTimer=null;state.streamLastMessageAt=null;state.streamConnectedAt=null;state.quoteBusy=false;try{state.ws?.close();}catch{}state.ws=null;}
async function loadMarket(fit=true){
hideChartContextMenu();
const request=++state.request;drawingDrag=null;state.controller?.abort();state.controller=new AbortController();state.htf=null;clearTimer();
try{window.TradingFiewTerminalUI?.onMarketChanged?.();}catch(error){console.warn('Terminal UI symbol reset failed',error);}
try{window.TradingFiewMarketPanels?.select(state.symbol,state.tf);}catch(error){console.warn('Optional market panels not available',error);}
try{if(lastPriceLine)candles.removePriceLine(lastPriceLine);}catch{}lastPriceLine=null;$('livePriceBadge').hidden=true;clearSrGuides();clearAlertPriceLines();state.activePrice=null;state.quoteAt=null;state.quotePrice=null;state.quoteIsFresh=false;state.tabChangePct=null;state.tabQuoteStatus=null;updateBrowserTabTitle();connection('CONNECTING','Fetching historical candles...');
showInstrument();loading('Loading '+state.symbol,'Retrieving historical OHLC data from a public market feed.');
$('lastPrice').textContent='—';$('priceChange').textContent='—';$('high24').textContent='—';$('low24').textContent='—';$('volume24').textContent='—';state.data=[];state.analysis=null;state.htf=null;drawZones();
try{
const rows=await fetchCandles(state.symbol,state.tf,650,state.controller.signal);if(request!==state.request)return;
state.data=rows;setCandleData(true);restoreDrawings();renderAlertPriceLines();setOhlc(rows.at(-1));updatePrice(rows.at(-1).close);showChart();connection('SYNCING','Historical data ready; connecting to market feed...');
analyze();fetchTicker(state.symbol,request);fetchHigherTimeframe(request);connectStream(request);
if(fit)focusRecentCandles();
try{window.TradingFiewTerminalUI?.restoreRange?.();}catch(error){console.warn('Saved history range could not be restored',error);}
try{history.replaceState(null,'',location.pathname+'?symbol='+state.symbol+'&tf='+state.tf);}catch{}
}catch(e){if(e.name==='AbortError'||request!==state.request)return;loading('Market data unavailable',e.message,true);connection('OFFLINE','Unable to fetch public exchange data');toast('Cannot load market data. Try another network or refresh.',true);}
}
function focusRecentCandles(){
if(!chart||!state.data.length)return;
const last=state.data.length-1;
const count=window.innerWidth<=480?36:window.innerWidth<=730?50:window.innerWidth<=1120?88:110;
try{chart.timeScale().setVisibleLogicalRange({from:Math.max(0,last-count),to:last+4});}
catch{chart.timeScale().fitContent();}
}
function setCandleData(fit=false){
if(!state.data.length)return;
sharedCrosshairTime=null;
$('syncedCrosshairGuide').hidden=true;
rsiTimelineReady=false;
candles.setData(state.data.map(({time,open,high,low,close})=>({time,open,high,low,close})));
vol.setData($('toggleVolume').checked?state.data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'})):[]);
refreshEMAs();
if(fit)focusRecentCandles();
}
function refreshEMAs(){
const data=Markets.completedBars(state.data,state.tf,activeMarket().provider);
ema20.setData($('toggleEMA20').checked?Engine.ema(data,20):[]);
ema50.setData($('toggleEMA50').checked?Engine.ema(data,50):[]);
ema200.setData($('toggleEMA200').checked?Engine.ema(data,200):[]);
syncIndicatorLegend();
}
function refreshRsi(){
const show=$('toggleRSI').checked;
$('rsiPanel').classList.toggle('hidden',!show);
// RSI begins after its warmup bars and excludes the live bar. Padding all
// original candle timestamps with whitespace preserves EXACT logical indexes.
const source=state.analysis?.rsis||[];
rsiPointsByTime=new Map(source.filter(p=>Number.isFinite(p.value)).map(p=>[p.time,p]));
const points=state.data.map(c=>{
  const rsi=show?rsiPointsByTime.get(c.time):null;
  return Number.isFinite(rsi?.value)?{time:c.time,value:rsi.value}:{time:c.time};
});
rsiTimelineReady=false;
rsiSeries.setData(points);
rsiTimelineReady=show&&points.length>0;
if(show)restoreSharedTimeScale();
resizeChartWindow();
if(show)requestAnimationFrame(restoreSharedTimeScale);
}
function connectStream(request){
if(request!==state.request)return;
if(activeMarket().provider!=='binance'){connection('REST FEED','Indicative candles (20s) · quotes (5s)');startPolling(request);startQuotePolling(request);return;}
// Candlesticks stream tick by tick, but percent change comes from the
// exchange's actual 24h ticker. Refresh it periodically in this tab.
if(!state.tabTickerTimer)state.tabTickerTimer=setInterval(()=>{
  if(request===state.request&&!document.hidden)void fetchTicker(state.symbol,request);
},30000);
let connected=false;
try{
const url='wss://data-stream.binance.vision/ws/'+state.symbol.toLowerCase()+'@kline_'+state.tf;
const socket=new WebSocket(url);state.ws=socket;
socket.onopen=()=>{if(request!==state.request)return;connected=true;state.streamConnectedAt=Date.now();state.streamLastMessageAt=Date.now();clearInterval(state.refreshTimer);state.refreshTimer=null;connection('LIVE','WebSocket — streaming market candles');};
socket.onmessage=e=>{
if(request!==state.request)return;
try{const packet=JSON.parse(e.data),k=packet.k;if(!k)return;
const incoming={time:Math.floor(k.t/1000),open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v};
if(!Number.isFinite(incoming.close))return;
state.streamLastMessageAt=Date.now();
const last=state.data.at(-1);
if(incoming.time===last?.time){state.data[state.data.length-1]=incoming;candles.update(incoming);if($('toggleVolume').checked)vol.update({time:incoming.time,value:incoming.volume,color:incoming.close>=incoming.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'});}
else if(incoming.time>last?.time){
  state.data.push(incoming);
  const rolled=state.data.length>650;
  if(rolled){
    state.data=state.data.slice(-650);
    // Keep candle, volume and RSI logical indexes identical when the 650-bar
    // window rolls over. Updating only candles here used to leave 651 bars
    // on the main chart, but 650 on RSI, progressively breaking alignment.
    setCandleData(false);
  }else{
    candles.update(incoming);
    if($('toggleVolume').checked)vol.update({time:incoming.time,value:incoming.volume,color:incoming.close>=incoming.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'});
    refreshEMAs();
  }
  analyze();
}
updatePrice(incoming.close);setOhlc(incoming);
if(k.x){refreshEMAs();analyze();fetchTicker(state.symbol,request);}
}catch{}
};
socket.onerror=()=>{if(request===state.request&&!connected)connection('REST MODE','Live stream unavailable; polling every 60s');};
socket.onclose=()=>{if(request!==state.request)return;state.ws=null;connection('REST MODE','Live stream disconnected; polling every 60s');startPolling(request);state.reconnectTimer=setTimeout(()=>{if(request===state.request)connectStream(request);},45000);};
}catch{startPolling(request);}
clearInterval(state.heartbeat);
state.heartbeat=setInterval(()=>{
  if(request!==state.request)return;
  if(state.ws?.readyState===WebSocket.OPEN){
    // A silent but technically OPEN socket is NOT reliable live data.
    // Recover through REST polling, then the normal reconnect path.
    const last=state.streamLastMessageAt||state.streamConnectedAt||Date.now();
    if(Date.now()-last>50000){
      connection('STALE FEED','No fresh market stream updates · switching to REST backup');
      startPolling(request);
      try{state.ws.close();}catch(error){console.warn('Stale stream close failed',error);}
    }
    return;
  }
  startPolling(request);
},20000);
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
const htf=Engine.calculate(Markets.completedBars(data,tf,activeMarket().provider));state.htf=htf;$('htfValue').textContent=htf.direction==='bull'?'BULLISH':htf.direction==='bear'?'BEARISH':'RANGING';$('htfValue').className=htf.direction==='bull'?'text-green':htf.direction==='bear'?'text-red':'';
$('htfInterval').textContent=tf.toUpperCase()+' confirmed';renderBias();
}catch{if(request===state.request){$('htfValue').textContent='Unavailable';$('htfInterval').textContent=tf.toUpperCase()+' data unavailable';}}
}
function analyze(){
if(!state.data||state.data.length<65)return;
try{
const closed=Markets.completedBars(state.data,state.tf,activeMarket().provider);
state.analysis=Engine.calculate(closed);
try{window.TradingFiewAlerts?.onAnalysis(state.symbol,state.tf,state.analysis,closed);}
catch(error){console.warn('Optional SMC alert processing failed',error);}
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
for(const z of sorted){
if(z.direction==='bull'&&!$('toggleBullishFvg').checked)continue;
if(z.direction==='bear'&&!$('toggleBearishFvg').checked)continue;
if(zones.length>=(w<500?1:w<900?2:3))break;const mid=(z.high+z.low)/2;if(Math.abs(mid-price)>state.analysis.atr*18)continue;if(zones.some(other=>Math.abs((other.high+other.low)/2-mid)<state.analysis.atr*.45))continue;zones.push(z);}
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

const defaultStyle=kind=>({
  color:kind==='fib'?'#9e85f6':kind==='fibchannel'?'#ad8ff7':kind==='fibtime'?'#d6a7f8':kind==='channel'?'#53c9fa':'#62aeff',
  width:kind==='fib'?1:2,dash:kind==='fib'?'dashed':'solid',
  extend:false,reverse:false,hidden:false,locked:false
});
function safeStyle(raw,kind){
  const base=defaultStyle(kind),v=raw&&typeof raw==='object'?raw:{};
  return {
    color:/^#[0-9a-f]{6}$/i.test(v.color||'')?v.color:base.color,
    width:[1,2,3,4].includes(Number(v.width))?Number(v.width):base.width,
    dash:['solid','dashed','dotted'].includes(v.dash)?v.dash:base.dash,
    extend:v.extend===true,reverse:v.reverse===true,hidden:v.hidden===true,locked:v.locked===true
  };
}
function dashArray(style){return style?.dash==='dashed'?'6 4':style?.dash==='dotted'?'2 4':'';}
function lightweightLineStyle(style){
  return style?.dash==='dotted'?LW.LineStyle.Dotted:
    style?.dash==='dashed'?LW.LineStyle.Dashed:LW.LineStyle.Solid;
}
function applyDrawingStyle(d){
  d.style=safeStyle(d.style,d.kind==='fib'?'fib':d.kind==='shape'&&['channel','fibchannel','fibtime'].includes(d.shape)?d.shape:d.kind);
  const st=d.style;
  try{
    if(d.kind==='price')d.line.applyOptions({
      color:st.hidden?'rgba(0,0,0,0)':st.color,lineWidth:st.width,
      lineStyle:lightweightLineStyle(st),axisLabelVisible:!st.hidden});
    if(d.kind==='series')d.line.applyOptions({
      color:st.hidden?'rgba(0,0,0,0)':st.color,lineWidth:st.width,
      lineStyle:lightweightLineStyle(st)});
    if(d.kind==='fib')for(const l of d.levels)if(l.line)l.line.applyOptions({
      color:st.hidden?'rgba(0,0,0,0)':st.color,lineWidth:st.width,
      lineStyle:lightweightLineStyle(st),axisLabelVisible:!st.hidden});
  }catch(e){console.warn('Cannot apply drawing style',e);}
  scheduleDrawingOverlay();
}
function recomputeFib(d){
  if(d.kind!=='fib'||!Array.isArray(d.anchors))return false;
  const points=Geometry.levels(d.mode,d.anchors,d.style?.reverse);
  if(points.length<2)return false;
  d.levels=points;
  scheduleDrawingOverlay();
  return true;
}

function serializeDrawing(d){
  if(d.kind==='price')return {kind:'price',price:d.price,style:safeStyle(d.style,'price')};
  if(d.kind==='series')return {kind:'series',points:d.points.map(p=>({time:p.time,value:p.value})),style:safeStyle(d.style,'series')};
  if(d.kind==='fib')return {kind:'fib',mode:d.mode||'fib',renderer:d.renderer||'legacy',
      anchors:d.anchors?.map(p=>({time:p.time,price:p.price}))||null,
      levels:d.levels.map(l=>({fraction:l.fraction,price:l.price})),
      style:safeStyle(d.style,'fib')};
  if(d.kind==='shape')return {kind:'shape',shape:d.shape,
      points:d.points.map(p=>({time:p.time,price:p.price})),
      style:safeStyle(d.style,['channel','fibchannel','fibtime'].includes(d.shape)?d.shape:'shape')};
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
        state.drawings.push({kind:'price',price:entry.price,line,style:safeStyle(entry.style,'price'),id:++drawingSeq});
      }
      else if(entry.kind==='series'&&Array.isArray(entry.points)&&entry.points.length===2){
        const points=entry.points;
        if(!points.every(p=>p&&validTime(p.time)&&validPrice(p.value))||points[0].time===points[1].time)continue;
        const sorted=[...points].sort((a,b)=>a.time-b.time);
        const line=addLine('#64b7ff',2);
        line.setData(sorted);
        state.drawings.push({kind:'series',line,points:sorted,style:safeStyle(entry.style,'series'),id:++drawingSeq});
      }
      else if(entry.kind==='fib'&&Array.isArray(entry.levels)){
        const renderer=entry.renderer==='svg'?'svg':'legacy';
        const mode=entry.mode==='fibext'?'fibext':'fib';
        const count=mode==='fibext'&&renderer==='svg'?3:2;
        const anchors=Array.isArray(entry.anchors)&&entry.anchors.length===count&&
          entry.anchors.every(p=>p&&validTime(p.time)&&validPrice(p.price))?
          entry.anchors.map(p=>({time:p.time,price:p.price})):null;
        const style=safeStyle(entry.style,'fib');
        const invalidOldExtension=renderer==='legacy'&&mode==='fibext';
        // A 2-point projection cannot be represented as a valid 3-point
        // trend-based Fib Extension. Retain data but suppress misleading levels.
        if(invalidOldExtension)style.hidden=true;
        const levels=[];
        const calculated=renderer==='svg'&&anchors?Geometry.levels(mode,anchors,style.reverse):entry.levels;
        for(const l of calculated.slice(0,14)){
          if(!l||!validPrice(l.price)||!Number.isFinite(l.fraction)||l.fraction<0||l.fraction>2.618)continue;
          const line=renderer==='legacy'&&!invalidOldExtension?candles.createPriceLine({
            price:l.price,color:style.color,lineWidth:style.width,
            lineStyle:lightweightLineStyle(style),axisLabelVisible:!style.hidden,
            title:(mode==='fibext'?'OLD EXT ':'FIB ')+(l.fraction*100).toFixed(1)+'%'
          }):null;
          levels.push({fraction:l.fraction,price:l.price,line});
        }
        if(levels.length){
          const d={kind:'fib',renderer,mode,anchors,style,levels,legacyWrong:invalidOldExtension,lines:levels.map(l=>l.line).filter(Boolean),id:++drawingSeq};
          state.drawings.push(d);applyDrawingStyle(d);
        }
      }else if(entry.kind==='shape'&&['vertical','rectangle','measure','channel','fibchannel','fibtime'].includes(entry.shape)&&
          Array.isArray(entry.points)&&entry.points.length===(entry.shape==='vertical'?1:['channel','fibchannel'].includes(entry.shape)?3:2)&&
          entry.points.every(p=>p&&validTime(p.time)&&validPrice(p.price))){
        state.drawings.push({kind:'shape',shape:entry.shape,
          points:entry.points.map(p=>({time:p.time,price:p.price})),style:safeStyle(entry.style,['channel','fibchannel','fibtime'].includes(entry.shape)?entry.shape:'shape'),id:++drawingSeq});
      }
    }catch(error){console.warn('Skipped invalid stored drawing',error);}
  }
  resetDrawingSelection();
  renderDrawingPanel();
  scheduleDrawingOverlay();
}
function drawingTitle(d){
  if(d.kind==='fib')return (d.renderer==='legacy'&&d.mode==='fibext'?'⚠ Old 2-point Extension — Redraw A-B-C':d.mode==='fibext'?'Trend Fibonacci Extension':'Fibonacci Retracement')+' · '+d.levels.length+' levels';
  if(d.kind==='shape')return d.shape==='rectangle'?'Price Rectangle':d.shape==='measure'?'Price Range':d.shape==='channel'?'Parallel Channel':d.shape==='fibchannel'?'Fibonacci Channel':d.shape==='fibtime'?'Fibonacci Time Zone':'Vertical time marker';
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
      if(d.kind==='price')applyDrawingStyle(d);
      else if(d.kind==='series')applyDrawingStyle(d);
      else if(d.kind==='fib')applyDrawingStyle(d);
    }catch(error){console.warn('Drawing highlight skipped',error);}
  }
  scheduleDrawingOverlay();
}

/* Contextual editor appears ABOVE the chart, never covers candles.
   A selection is durable: one tap to select, edit values, or delete. */
function syncDrawingOptionsBar(d){
  const toolbar=$('drawingOptionsBar');if(!toolbar||!d)return;
  toolbar.classList.remove('hidden');
  const style=d.style=safeStyle(d.style,d.kind==='fib'?'fib':['channel','fibchannel','fibtime'].includes(d.shape)?d.shape:d.kind);
  $('drawingOptionsName').textContent=drawingTitle(d);
  $('drawingStyleColor').value=style.color;
  $('drawingStyleWidth').value=String(style.width);
  $('drawingStyleDash').value=style.dash;
  const fib=d.kind==='fib',legacy=fib&&d.renderer!=='svg'&&d.mode==='fibext';
  $('drawingReverseBtn').hidden=!fib||legacy;
  $('drawingReverseBtn').setAttribute('aria-pressed',String(style.reverse));
  $('drawingExtendBtn').hidden=!fib&&!['channel','fibchannel'].includes(d.shape);
  $('drawingExtendBtn').setAttribute('aria-pressed',String(style.extend));
  $('drawingVisibilityBtn').hidden=legacy;
  $('drawingVisibilityBtn').textContent=style.hidden?'◉ Show':'◉ Hide';
  $('drawingVisibilityBtn').setAttribute('aria-pressed',String(style.hidden));
  $('drawingLockBtn').textContent=style.locked?'🔒 Unlock':'♙ Lock';
  $('drawingLockBtn').setAttribute('aria-pressed',String(style.locked));
  $('drawingRepairBtn').hidden=!legacy;
}
function installDrawingOptionsBar(){
  const selected=()=>getSelectedDrawing();
  const edit=fn=>{
    const d=selected();if(!d)return;
    d.style=safeStyle(d.style,d.kind==='fib'?'fib':['channel','fibchannel','fibtime'].includes(d.shape)?d.shape:d.kind);
    fn(d,d.style);
    applyDrawingStyle(d);
    renderDrawingPanel();
    persistDrawings();
  };
  $('drawingStyleColor').addEventListener('input',e=>edit((d,st)=>{st.color=e.target.value;}));
  $('drawingStyleWidth').addEventListener('change',e=>edit((d,st)=>{st.width=Number(e.target.value);}));
  $('drawingStyleDash').addEventListener('change',e=>edit((d,st)=>{st.dash=e.target.value;}));
  $('drawingReverseBtn').addEventListener('click',()=>edit((d,st)=>{
    if(d.kind!=='fib'||d.renderer!=='svg')return;
    st.reverse=!st.reverse;
    recomputeFib(d);
  }));
  $('drawingExtendBtn').addEventListener('click',()=>edit((d,st)=>{st.extend=!st.extend;}));
  $('drawingVisibilityBtn').addEventListener('click',()=>edit((d,st)=>{st.hidden=!st.hidden;}));
  $('drawingLockBtn').addEventListener('click',()=>edit((d,st)=>{st.locked=!st.locked;}));
  $('drawingDeleteBtn').addEventListener('click',()=>{const d=selected();if(d)removeDrawing(d.id,null);});
  $('drawingDeselectBtn').addEventListener('click',()=>{resetDrawingSelection();renderDrawingPanel();});
  $('drawingRepairBtn').addEventListener('click',()=>{
    const d=selected();if(!d||d.kind!=='fib'||d.mode!=='fibext'||d.renderer==='svg')return;
    removeDrawing(d.id,null);
    setDrawMode('fibext');
    toast('Mark A → B impulse, then C correction to calculate a true extension.');
  });
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
    syncDrawingOptionsBar(selected);
    const fibLevel=selected.kind==='fib'&&state.selectedFibLevel!==null?
      ' · '+(state.selectedFibLevel*100).toFixed(1)+'%':'';
    $('selectedDrawingLabel').textContent=drawingTitle(selected)+fibLevel;
    $('deleteSelectedDrawingBtn').textContent=fibLevel?'Delete level ✕':'Delete ✕';
  }
  if(!show)$('drawingOptionsBar')?.classList.add('hidden');
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
    if(entry.line)try{candles.removePriceLine(entry.line);}catch(e){console.warn('Cannot remove Fibonacci level',e);}
    d.levels=d.levels.filter(l=>l!==entry);
    d.lines=d.levels.map(l=>l.line);
    if(!d.levels.length)state.drawings.splice(index,1);
  }else{
    try{
      if(d.kind==='price')candles.removePriceLine(d.line);
      else if(d.kind==='fib')d.levels.forEach(l=>{if(l.line)candles.removePriceLine(l.line);});
      else if(d.kind==='series')chart.removeSeries(d.line);
    }catch(e){console.warn('Drawing deletion failed',e);}
    state.drawings.splice(index,1);
  }
  resetDrawingSelection();
  renderDrawingPanel();persistDrawings();scheduleDrawingOverlay();
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
  const consider=(id,level,distance,anchorIndex=null)=>{
    if(Number.isFinite(distance)&&distance<=threshold&&(!best||distance<best.distance))
      best={id,fraction:level,distance,anchorIndex};
  };
  for(const d of state.drawings){
    try{
      if(d.style?.hidden)continue;
      if(d.kind==='price'){
        const y=candles.priceToCoordinate(d.price);
        if(y!==null)consider(d.id,null,Math.abs(y-point.y));
      }else if(d.kind==='fib'){
        const xs=(d.anchors||[]).map(a=>drawingPos(a.time,a.price)?.x).filter(Number.isFinite);
        const eligible=d.renderer!=='svg'||!xs.length||
          (point.x>=Math.min(...xs)-threshold&&
           point.x<=(d.style?.extend?$('chartHost').clientWidth-chart.priceScale('right').width():Math.max(...xs))+threshold);
        if(eligible)for(const l of d.levels){
          const y=candles.priceToCoordinate(l.price);
          if(y!==null)consider(d.id,l.fraction,Math.abs(y-point.y));
        }
        for(let i=0;i<(d.anchors?.length||0);i++){
          const p=drawingPos(d.anchors[i].time,d.anchors[i].price);
          if(p)consider(d.id,null,Math.hypot(p.x-point.x,p.y-point.y),i);
        }
      }else if(d.kind==='shape'){
        const a=drawingPos(d.points[0].time,d.points[0].price);
        const b=d.points[1]?drawingPos(d.points[1].time,d.points[1].price):null;
        if(!a)continue;
        for(let i=0;i<d.points.length;i++){
          const p=drawingPos(d.points[i].time,d.points[i].price);
          if(p)consider(d.id,null,Math.hypot(p.x-point.x,p.y-point.y),i);
        }
        if(d.shape==='vertical')consider(d.id,null,Math.abs(a.x-point.x));
        else if(d.shape==='channel'&&d.points?.length===3){
          const channel=Geometry.channel(d.points,time=>{
            const i=state.data.findIndex(v=>v.time===time);return i>=0?i:null;
          });
          if(channel){
            const upA=drawingPos(channel.upper[0].time,channel.upper[0].price);
            const upB=drawingPos(channel.upper[1].time,channel.upper[1].price);
            const distSegment=(u,v)=>{
              if(!u||!v)return Infinity;
              const dx=v.x-u.x,dy=v.y-u.y,t=Math.max(0,Math.min(1,
                ((point.x-u.x)*dx+(point.y-u.y)*dy)/(dx*dx+dy*dy||1)));
              return Math.hypot(point.x-u.x-t*dx,point.y-u.y-t*dy);
            };
            consider(d.id,null,distSegment(a,b));
            consider(d.id,null,distSegment(upA,upB));
          }
        }else if(b){
          const minX=Math.min(a.x,b.x),maxX=Math.max(a.x,b.x),
            minY=Math.min(a.y,b.y),maxY=Math.max(a.y,b.y);
          if(point.x>=minX-threshold&&point.x<=maxX+threshold&&
             point.y>=minY-threshold&&point.y<=maxY+threshold){
            if(d.shape==='rectangle'){
              const edge=Math.min(Math.abs(point.x-minX),Math.abs(point.x-maxX),
                Math.abs(point.y-minY),Math.abs(point.y-maxY));
              consider(d.id,null,edge);
            }else{
              const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy||1,
                t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/den));
              consider(d.id,null,Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy));
            }
          }
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


function installLineDragging(){
  const host=$('chartHost'),coords=e=>{
    const r=host.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    return x>=0&&x<r.width&&y>=0&&y<r.height?{x,y}:null;
  };
  const barIndex=x=>{
    const n=chart.timeScale().coordinateToLogical(x);
    return Number.isFinite(n)?Math.max(0,Math.min(state.data.length-1,Math.round(n))):-1;
  };
  const findIndex=time=>{
    let index=state.data.findIndex(d=>d.time===time);
    if(index>=0)return index;
    return state.data.reduce((best,item,i)=>Math.abs(item.time-time)<Math.abs(state.data[best].time-time)?i:best,0);
  };
  const hitAt=p=>{
    const drawing=drawingHitTest(p);
    let hit=drawing?{type:'drawing',id:drawing.id,fraction:drawing.fraction,
      anchorIndex:drawing.anchorIndex,distance:drawing.distance}:null;
    if($('toggleAlertLines').checked)for(const a of window.TradingFiewAlerts?.getPriceLevels?.(state.symbol)||[]){
      const y=candles.priceToCoordinate(a.target),distance=Math.abs(y-p.y);
      if(Number.isFinite(y)&&distance<=(window.innerWidth<=730?13:8)&&(!hit||distance<hit.distance))
        hit={type:'alert',id:a.id,distance};
    }
    return hit;
  };
  const rollback=d=>{
    if(d.type==='alert'){renderAlertPriceLines();return;}
    const item=state.drawings.find(x=>x.id===d.id);
    if(!item)return;
    if(item.kind==='price'){item.price=d.copy.price;item.line.applyOptions({price:item.price});}
    else if(item.kind==='fib'){
      item.anchors=d.copy.anchors?.map(p=>({...p}))||null;
      for(const line of item.levels){
        const saved=d.copy.levels.find(l=>l.fraction===line.fraction);
        if(saved){line.price=saved.price;if(line.line)line.line.applyOptions({price:line.price});}
      }
    }else if(item.kind==='series'){item.points=d.copy.points;item.line.setData(item.points);}
    else if(item.kind==='shape')item.points=d.copy.points.map(p=>({...p}));
    scheduleDrawingOverlay();
  };
  const move=(d,p,shift)=>{
    const py=candles.coordinateToPrice(Math.max(1,Math.min(host.clientHeight-4,p.y)));
    if(!Number.isFinite(py)||py<=0)return;
    const offset=py-d.startPrice;
    if(d.type==='alert'){
      d.newPrice=py;
      alertPriceLines.get(d.id)?.applyOptions({price:py});
      const node=[...$('alertLineHandles').children].find(v=>v.dataset.alertId===d.id);
      if(node){
        node.style.top=(host.getBoundingClientRect().top-$('alertLineHandles').getBoundingClientRect().top+p.y)+'px';
        const label=node.querySelector('.alert-handle-label');if(label)label.textContent='🔔 '+fmt(py);
      }
      return;
    }
    const item=state.drawings.find(x=>x.id===d.id);if(!item)return;
    if(item.kind==='price'){
      const next=d.copy.price+offset;if(next<=0)return;
      item.price=next;item.line.applyOptions({price:next});
    }else if(item.kind==='fib'){
      if(d.endpoint>=0&&d.copy.anchors?.length>=2){
        const anchors=d.copy.anchors.map(v=>({...v}));
        const at=barIndex(p.x);if(at<0)return;
        anchors[d.endpoint]={time:state.data[at].time,price:py};
        const prices=item.levels.map(l=>item.renderer==='svg'?
          Geometry.fibPrice(item.mode,anchors,l.fraction,item.style?.reverse):
          anchors[0].price+(anchors[1].price-anchors[0].price)*l.fraction);
        if(prices.some(price=>price<=0||!Number.isFinite(price)))return;
        item.anchors=anchors;
        item.levels.forEach((level,i)=>{
          level.price=prices[i];if(level.line)level.line.applyOptions({price:level.price});
        });
      }else if(item.renderer==='svg'&&d.copy.anchors?.length>=2){
        // Strict ratio geometry: moving a fib level shifts the whole construction;
        // never corrupt only one level while keeping stale anchor percentages.
        const anchors=d.copy.anchors.map(v=>({...v,price:v.price+offset}));
        if(anchors.some(v=>v.price<=0))return;
        const prices=item.levels.map(l=>Geometry.fibPrice(
          item.mode,anchors,l.fraction,item.style?.reverse));
        if(prices.some(price=>price<=0||!Number.isFinite(price)))return;
        item.anchors=anchors;
        item.levels.forEach((level,i)=>{level.price=prices[i];});
      }else{
        for(const level of item.levels){
          if(!shift&&level.fraction!==d.fraction)continue;
          const old=d.copy.levels.find(v=>v.fraction===level.fraction);
          if(!old||old.price+offset<=0)continue;
          level.price=old.price+offset;if(level.line)level.line.applyOptions({price:level.price});
        }
        if(shift&&d.copy.anchors){
          item.anchors=d.copy.anchors.map(v=>({...v,price:v.price+offset}));
        }else if(d.fraction!==null)item.anchors=null;
      }
      scheduleDrawingOverlay();
    }else if(item.kind==='shape'){
      const points=d.copy.points.map(v=>({...v}));
      if(d.endpoint>=0){
        const at=barIndex(p.x);if(at<0)return;
        points[d.endpoint]={time:state.data[at].time,price:py};
      }else{
        const begin=barIndex(d.start.x),now=barIndex(p.x);if(begin<0||now<0)return;
        const indices=points.map(v=>findIndex(v.time));
        const delta=Math.max(-Math.min(...indices),
          Math.min(state.data.length-1-Math.max(...indices),now-begin));
        for(let i=0;i<points.length;i++)
          points[i]={time:state.data[indices[i]+delta].time,price:points[i].price+offset};
      }
      if(points.some(v=>v.price<=0||!Number.isFinite(v.price)))return;
      item.points=points;scheduleDrawingOverlay();
    }else if(item.kind==='series'){
      let points=d.copy.points.map(v=>({...v}));
      if(d.endpoint>=0){
        const idx=barIndex(p.x);if(idx<0)return;
        const time=state.data[idx].time;if(time===points[1-d.endpoint].time)return;
        points[d.endpoint]={time,value:py};
      }else{
        const from=barIndex(d.start.x),to=barIndex(p.x);
        if(from<0||to<0)return;
        const a=findIndex(points[0].time),b=findIndex(points[1].time);
        const shiftBars=Math.max(-Math.min(a,b),Math.min(state.data.length-1-Math.max(a,b),to-from));
        points=points.map((v,i)=>({time:state.data[(i===0?a:b)+shiftBars].time,value:v.value+offset}));
        if(points.some(v=>v.value<=0))return;
      }
      points.sort((a,b)=>a.time-b.time);
      try{item.line.setData(points);item.points=points;}catch(error){console.warn('Trend move failed',error);}
    }
  };
  host.addEventListener('pointerdown',e=>{
    if(e.button!==0||state.drawMode!=='cursor'||!state.data.length||drawingDrag||alertDrag)return;
    const p=coords(e);if(!p)return;
    const hit=hitAt(p);if(!hit)return;
    const item=state.drawings.find(v=>v.id===hit.id);
    if(item?.style?.locked||item?.style?.hidden)return;
    const alert=hit.type==='alert'?window.TradingFiewAlerts?.getAlert?.(hit.id):null;
    if(hit.type==='alert'&&!alert)return;
    let endpoint=-1;
    if(item?.kind==='series')for(let i=0;i<2;i++){
      const point=item.points[i],x=chart.timeScale().timeToCoordinate(point.time),y=candles.priceToCoordinate(point.value);
      if(Number.isFinite(x)&&Number.isFinite(y)&&Math.hypot(x-p.x,y-p.y)<(window.innerWidth<=730?22:14)){endpoint=i;break;}
    }
    if(item?.kind==='fib'||item?.kind==='shape'){
      const anchors=item.kind==='fib'?item.anchors:item.points;
      if(Array.isArray(anchors)){
        let nearest=null;
        for(let i=0;i<anchors.length;i++){
          const anchor=drawingPos(anchors[i].time,anchors[i].price);
          if(!anchor)continue;
          const dist=Math.hypot(anchor.x-p.x,anchor.y-p.y);
          if(dist<(window.innerWidth<=730?24:16)&&(!nearest||dist<nearest.dist))
            nearest={index:i,dist};
        }
        if(nearest)endpoint=nearest.index;
      }
    }
    drawingDrag={...hit,start:p,startPrice:candles.coordinateToPrice(p.y),startX:e.clientX,startY:e.clientY,
      pointerId:e.pointerId,request:state.request,moved:false,endpoint,newPrice:alert?.target,
      copy:item?.kind==='price'?{price:item.price}:item?.kind==='fib'?{
        levels:item.levels.map(v=>({fraction:v.fraction,price:v.price})),
        anchors:item.anchors?.map(v=>({...v}))||null}:
        item?.kind==='series'?{points:item.points.map(v=>({...v}))}:
        item?.kind==='shape'?{points:item.points.map(v=>({...v}))}:null};
    if(item)selectDrawing(item.id,hit.fraction);
    hideChartContextMenu();
    chart.applyOptions({handleScroll:false,handleScale:false});
    host.classList.add('chart-line-dragging');
    try{host.setPointerCapture(e.pointerId);}catch{}
    e.preventDefault();e.stopPropagation();
  },true);
  host.addEventListener('pointermove',e=>{
    if(!drawingDrag){
      if(e.pointerType==='mouse'&&state.drawMode==='cursor'&&state.data.length){
        const p=coords(e);host.classList.toggle('chart-line-hover',!!p&&!!hitAt(p));
      }else host.classList.remove('chart-line-hover');
      return;
    }
    const d=drawingDrag;if(d.pointerId!==e.pointerId||d.request!==state.request)return;
    const p=coords(e);if(!p)return;
    if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>3)d.moved=true;
    if(d.moved)move(d,p,e.shiftKey);
    e.preventDefault();e.stopPropagation();
  },true);
  const finish=(e,cancel)=>{
    const d=drawingDrag;if(!d||e.pointerId!==d.pointerId)return;
    drawingDrag=null;host.classList.remove('chart-line-dragging','chart-line-hover');
    try{host.releasePointerCapture(e.pointerId);}catch{}
    chart.applyOptions({handleScroll:true,handleScale:true});
    if(d.request!==state.request)return;
    if(cancel)rollback(d);
    else if(d.moved){
      if(d.type==='alert'){
        const ok=window.TradingFiewAlerts?.setAlertPrice?.(d.id,d.newPrice,state.activePrice);
        toast(ok?'🔔 Alert moved to '+fmt(d.newPrice)+' · saved.':'Alert position could not be saved.',!ok);
        renderAlertPriceLines();
      }else{persistDrawings();renderDrawingPanel();scheduleDrawingOverlay();toast('Drawing moved and saved.');}
      suppressDrawingClickUntil=Date.now()+400;
    }else if(d.type==='alert')openAlertContextMenu(d.id,e.clientX,e.clientY);
    e.preventDefault();e.stopPropagation();
  };
  host.addEventListener('pointerup',e=>finish(e,false),true);
  host.addEventListener('pointercancel',e=>finish(e,true),true);
  window.addEventListener('blur',()=>{
    if(!drawingDrag)return;
    const d=drawingDrag;drawingDrag=null;
    host.classList.remove('chart-line-dragging','chart-line-hover');
    try{host.releasePointerCapture(d.pointerId);}catch{}
    chart.applyOptions({handleScroll:true,handleScale:true});rollback(d);
  });
}

/* User price alerts are separate from manually drawn lines.
 * Thin dotted amber guides have no right-axis price labels, avoiding a
 * second LAST price or overlapping S1 / R1 labels. */
/* Alert data is persisted by alerts.js; these canvas price guides and
 * HTML hit targets only visualise & manipulate the selected price level. */
function clearAlertPriceLines(){
  if(candles)for(const line of alertPriceLines.values()){
    try{candles.removePriceLine(line);}catch{}
  }
  alertPriceLines.clear();
  $('alertLineHandles')?.replaceChildren();
}
function priceAtClientY(clientY){
  const host=$('chartHost'),rect=host.getBoundingClientRect();
  const y=clientY-rect.top;
  return y>=0&&y<rect.height?candles.coordinateToPrice(y):null;
}
function layoutAlertHandles(){
  alertLayoutPending=false;
  if(!candles||!state.data.length)return;
  const holder=$('alertLineHandles'),chartRect=$('chartHost').getBoundingClientRect(),
    holderRect=holder.getBoundingClientRect();
  for(const node of holder.children){
    const id=node.dataset.alertId;
    if(alertDrag?.id===id&&alertDrag.moved)continue;
    const record=window.TradingFiewAlerts?.getAlert?.(id);
    if(!record){node.hidden=true;continue;}
    const y=candles.priceToCoordinate(record.target);
    if(!Number.isFinite(y)||y<0||y>chartRect.height-8){
      node.hidden=true;continue;
    }
    node.hidden=false;
    node.style.top=(chartRect.top-holderRect.top+y)+'px';
    const label=node.querySelector('.alert-handle-label');
    if(label)label.textContent='🔔 '+fmt(record.target);
  }
}
function scheduleAlertLayout(){
  if(alertLayoutPending)return;
  alertLayoutPending=true;
  requestAnimationFrame(layoutAlertHandles);
}
function alertPointerFinish(event,cancelled=false){
  const drag=alertDrag;
  if(!drag||event.pointerId!==drag.pointerId)return;
  alertDrag=null;
  const node=drag.node;
  try{node.releasePointerCapture(event.pointerId);}catch{}
  try{chart.applyOptions({handleScroll:true,handleScale:true});}catch{}
  if(drag.moved){
    if(!cancelled&&Number.isFinite(drag.price)&&drag.price>0){
      const ok=window.TradingFiewAlerts?.setAlertPrice?.(drag.id,drag.price,state.activePrice);
      if(ok)toast('🔔 Alert moved to '+fmt(drag.price)+' · saved.');
      else toast('Could not save the moved alert.',true);
    }
    renderAlertPriceLines();
  }else if(!cancelled){
    openAlertContextMenu(drag.id,event.clientX,event.clientY);
  }
  scheduleAlertLayout();
}
function bindAlertHitTarget(node){
  node.addEventListener('pointerdown',event=>{
    if(event.button!==0&&!['touch','pen'].includes(event.pointerType))return;
    if(alertDrag)return;
    const record=window.TradingFiewAlerts?.getAlert?.(node.dataset.alertId);
    if(!record)return;
    hideChartContextMenu();
    const y=candles.priceToCoordinate(record.target);
    if(!Number.isFinite(y))return;
    event.preventDefault();event.stopPropagation();
    alertDrag={
      id:record.id,node,pointerId:event.pointerId,originClientY:event.clientY,
      originY:y,price:record.target,moved:false
    };
    try{node.setPointerCapture(event.pointerId);}catch{}
  });
  node.addEventListener('pointermove',event=>{
    if(alertDrag?.node!==node||alertDrag.pointerId!==event.pointerId)return;
    const drag=alertDrag,shift=event.clientY-drag.originClientY;
    if(Math.abs(shift)>=4)drag.moved=true;
    if(!drag.moved)return;
    event.preventDefault();event.stopPropagation();
    // Constrain to plot area rather than extrapolating arbitrary prices.
    const rect=$('chartHost').getBoundingClientRect();
    const y=Math.max(3,Math.min(rect.height-30,drag.originY+shift));
    const price=candles.coordinateToPrice(y);
    if(!Number.isFinite(price)||price<=0)return;
    drag.price=price;
    const line=alertPriceLines.get(drag.id);
    try{line?.applyOptions({price});}catch{}
    node.style.top=(rect.top-$('alertLineHandles').getBoundingClientRect().top+y)+'px';
    node.querySelector('.alert-handle-label').textContent='🔔 '+fmt(price);
    node.classList.add('dragging');
  });
  node.addEventListener('pointerup',event=>{
    if(alertDrag?.node===node){event.preventDefault();event.stopPropagation();alertPointerFinish(event);}
  });
  node.addEventListener('pointercancel',event=>{if(alertDrag?.node===node)alertPointerFinish(event,true);});
  node.addEventListener('contextmenu',event=>{
    event.preventDefault();event.stopPropagation();
    openAlertContextMenu(node.dataset.alertId,event.clientX,event.clientY);
  });
  node.addEventListener('keydown',event=>{
    if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      const r=node.getBoundingClientRect();
      openAlertContextMenu(node.dataset.alertId,r.left+Math.min(90,r.width/2),r.top);
    }
  });
}
function renderAlertPriceLines(){
  if(!candles||!state.data.length||!window.TradingFiewAlerts?.getPriceLevels)return;
  if(!$('toggleAlertLines').checked){clearAlertPriceLines();return;}
  const current=window.TradingFiewAlerts.getPriceLevels(state.symbol);
  const liveIds=new Set(current.map(a=>a.id));
  for(const [id,line] of alertPriceLines){
    if(liveIds.has(id))continue;
    try{candles.removePriceLine(line);}catch{}
    alertPriceLines.delete(id);
  }
  const holder=$('alertLineHandles');
  for(const node of [...holder.children]){
    if(!liveIds.has(node.dataset.alertId))node.remove();
  }
  for(const item of current){
    let line=alertPriceLines.get(item.id);
    try{
      if(!line){
        line=candles.createPriceLine({
          price:item.target,color:'#e6b968',lineWidth:1,
          lineStyle:LW.LineStyle.Dotted,axisLabelVisible:false,title:'ALERT'
        });
        alertPriceLines.set(item.id,line);
      }else line.applyOptions({price:item.target});
      if(![...holder.children].some(node=>node.dataset.alertId===item.id)){
        const node=document.createElement('div');
        node.className='alert-hit-level';
        node.dataset.alertId=item.id;
        node.setAttribute('role','button');
        node.tabIndex=0;
        node.setAttribute('aria-label','Alert '+state.symbol+' at '+fmt(item.target)+'. Drag vertically to adjust, or press Enter for options');
        const grip=document.createElement('span');
        grip.className='alert-handle-grip';grip.textContent='⋮⋮';
        const label=document.createElement('span');
        label.className='alert-handle-label';label.textContent='🔔 '+fmt(item.target);
        node.append(grip,label);
        bindAlertHitTarget(node);holder.appendChild(node);
      }
    }catch(error){console.warn('Alert guide unavailable',error);}
  }
  scheduleAlertLayout();
}
function addChartPriceAlert(price){
  if(!Number.isFinite(price)||price<=0||!state.data.length){
    toast('Select a valid price on a loaded chart.',true);
    return false;
  }
  const result=window.TradingFiewAlerts?.createFromChart?.({
    symbol:state.symbol,price,currentPrice:state.activePrice
  });
  if(result)renderAlertPriceLines();
  return Boolean(result);
}
/* Context menu is a real menu rather than an immediate right-click order.
 * Alert controls are linked to an ID; the drag target stays local to this user. */
function hideChartContextMenu(){
  const menu=$('chartContextMenu');
  if(!menu)return;
  menu.classList.add('hidden');
  alertMenuTarget=null;
}
function showChartContextMenu(price,clientX,clientY,alertId=null){
  const menu=$('chartContextMenu');
  const record=alertId?window.TradingFiewAlerts?.getAlert?.(alertId):null;
  if(!record&&!Number.isFinite(price))return;
  alertMenuTarget={price:record?.target??price,id:record?.id??null,symbol:state.symbol};
  const managing=Boolean(record);
  $('chartContextTitle').textContent=managing?
    '🔔 '+record.symbol+' alert @ '+fmt(record.target):
    state.symbol+' · '+fmt(price);
  $('ctxAlertAdd').hidden=managing;
  $('ctxAlertEdit').hidden=!managing;
  $('ctxAlertToggle').hidden=!managing;
  $('ctxAlertSound').hidden=!managing;
  $('ctxAlertNotify').hidden=!managing;
  $('ctxAlertDelete').hidden=!managing;
  $('ctxAlertAdd').textContent='🔔 Add alert at '+fmt(price);
  $('ctxCopyPrice').textContent='⧉ Copy price '+fmt(record?.target??price);
  if(managing){
    const armed=record.enabled&&!record.triggered;
    $('ctxAlertToggle').textContent=armed?'Ⅱ Pause alert':'▷ Resume alert';
    $('ctxAlertSound').textContent=(record.sound?'✓ ':'○ ')+'Sound '+(record.sound?'ON':'OFF');
    $('ctxAlertSound').setAttribute('aria-checked',String(record.sound));
    $('ctxAlertNotify').textContent=(record.notify?'✓ ':'○ ')+'Notification '+(record.notify?'ON':'OFF');
    $('ctxAlertNotify').setAttribute('aria-checked',String(record.notify));
  }
  menu.classList.remove('hidden');
  menu.style.visibility='hidden';
  menu.style.left='0px';menu.style.top='0px';
  // Use fixed positioning so the menu cannot be cropped by chart panels.
  const rect=menu.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;
  const x=Math.max(6,Math.min(clientX,Math.max(6,vw-rect.width-7)));
  const y=Math.max(6,Math.min(clientY,Math.max(6,vh-rect.height-7)));
  menu.style.left=x+'px';menu.style.top=y+'px';
  menu.style.visibility='';
  const first=managing?$('ctxAlertEdit'):$('ctxAlertAdd');
  first.focus({preventScroll:true});
}
function openAlertContextMenu(id,x,y){
  const alert=window.TradingFiewAlerts?.getAlert?.(id);
  if(!alert)return;
  showChartContextMenu(alert.target,x,y,id);
}
function handleChartContextAction(id){
  const details=alertMenuTarget;
  if(!details)return;
  const api=window.TradingFiewAlerts;
  const record=details.id?api?.getAlert?.(details.id):null;
  const price=record?.target??details.price;
  hideChartContextMenu();
  if(id==='ctxAlertAdd'){addChartPriceAlert(price);return;}
  if(id==='ctxAlertEdit'&&record){api.openEdit(record.id);return;}
  if(id==='ctxAlertToggle'&&record){api.toggleAlert(record.id);return;}
  if(id==='ctxAlertSound'&&record){
    api.setAlertOption(record.id,'sound',!record.sound);return;
  }
  if(id==='ctxAlertNotify'&&record){
    api.setAlertOption(record.id,'notify',!record.notify);return;
  }
  if(id==='ctxAlertDelete'&&record){api.deleteAlert(record.id);return;}
  if(id==='ctxManageAlerts'){api?.open?.();return;}
  if(id==='ctxResetView'){focusRecentCandles();return;}
  if(id==='ctxCopyPrice'){
    const text=String(price);
    if(navigator.clipboard?.writeText){
      void navigator.clipboard.writeText(text).then(()=>toast('Copied '+text)).catch(()=>toast('Copy price unavailable.',true));
    }else{
      const input=document.createElement('textarea');
      input.value=text;input.style.position='fixed';input.style.opacity='0';
      document.body.appendChild(input);input.select();
      try{document.execCommand('copy');toast('Copied '+text);}catch{toast('Copy price unavailable.',true);}
      input.remove();
    }
  }
}
function cancelChartLongPress(){
  if(chartLongPress?.timer)clearTimeout(chartLongPress.timer);
  chartLongPress=null;
}
function installChartContextHandlers(){
  const host=$('chartHost'),menu=$('chartContextMenu');
  host.addEventListener('contextmenu',event=>{
    if(!state.data.length)return;
    event.preventDefault();
    cancelChartLongPress();
    const price=priceAtClientY(event.clientY);
    if(Number.isFinite(price)&&price>0)showChartContextMenu(price,event.clientX,event.clientY);
  });
  // A deliberate 600ms hold opens the menu on mobile. Regular pan & zoom
  // gestures remain native to Lightweight Charts, with movement cancelling.
  host.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch'||!state.data.length||alertDrag)return;
    cancelChartLongPress();
    const x=event.clientX,y=event.clientY;
    chartLongPress={x,y,timer:setTimeout(()=>{
      const price=priceAtClientY(y);
      if(Number.isFinite(price)&&price>0){
        suppressAlertClickUntil=Date.now()+850;
        showChartContextMenu(price,x,y);
      }
      chartLongPress=null;
    },610)};
  },{passive:true});
  host.addEventListener('pointermove',event=>{
    if(chartLongPress&&Math.hypot(event.clientX-chartLongPress.x,event.clientY-chartLongPress.y)>11)
      cancelChartLongPress();
  },{passive:true});
  for(const type of ['pointerup','pointercancel','pointerleave'])
    host.addEventListener(type,cancelChartLongPress,{passive:true});
  for(const id of ['ctxAlertAdd','ctxAlertEdit','ctxAlertToggle','ctxAlertSound',
    'ctxAlertNotify','ctxAlertDelete','ctxCopyPrice','ctxManageAlerts','ctxResetView']){
    $(id).addEventListener('click',()=>handleChartContextAction(id));
  }
  document.addEventListener('pointerdown',event=>{
    if(!menu.classList.contains('hidden')&&!menu.contains(event.target))hideChartContextMenu();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')hideChartContextMenu();
    if(event.key==='a'&&event.altKey&&!event.ctrlKey&&!event.metaKey&&
      !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){
      event.preventDefault();
      const r=host.getBoundingClientRect();
      const y=r.top+r.height*.45,price=priceAtClientY(y);
      if(Number.isFinite(price))showChartContextMenu(price,r.left+r.width*.6,y);
    }
  });
  window.addEventListener('resize',hideChartContextMenu,{passive:true});
}

/* Precision drawing tool: HTML pointer capture avoids LW chart clicks/pans
 * stealing the gesture, while SVG provides a real preview while moving.
 * Works with drag-and-release AND click-first / move / click-second. */
function drawingPos(time,price){
  const x=chart.timeScale().timeToCoordinate(time);
  const y=candles.priceToCoordinate(price);
  return Number.isFinite(x)&&Number.isFinite(y)?{x,y}:null;
}
function drawingPriceAt(event,allowAxis=false){
  if(!chart||!candles||!state.data.length)return null;
  const host=$('chartHost'),r=host.getBoundingClientRect(),x=event.clientX-r.left,y=event.clientY-r.top;
  const chartWidth=r.width-chart.priceScale('right').width();
  if(x<0||y<0||y>=r.height||x>chartWidth-1&&(!allowAxis||x>r.width))return null;
  let price=candles.coordinateToPrice(y);
  const logical=chart.timeScale().coordinateToLogical(x);
  if(!Number.isFinite(price)||price<=0||!Number.isFinite(logical))return null;
  const idx=Math.max(0,Math.min(state.data.length-1,Math.round(logical)));
  const bar=state.data[idx];
  if(!bar)return null;
  if(event.shiftKey){
    const snap=[bar.open,bar.high,bar.low,bar.close].map(v=>({v,d:Math.abs(candles.priceToCoordinate(v)-y)}))
       .sort((a,b)=>a.d-b.d)[0];
    if(snap&&snap.d<=24)price=snap.v;
  }
  return {x:Math.max(0,Math.min(chartWidth,x)),y:candles.priceToCoordinate(price),time:bar.time,price};
}
function svgLine(x1,y1,x2,y2,color,klass='draw-guide',width=1.5){
  if(![x1,y1,x2,y2].every(Number.isFinite))return '';
  return '<line class="'+klass+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+
    '" stroke="'+color+'" stroke-width="'+width+'"/>';
}
function svgCircle(x,y,color){
  if(![x,y].every(Number.isFinite))return '';
  return '<circle class="draw-anchor" cx="'+x+'" cy="'+y+'" r="4.4" fill="#0c192b" stroke="'+color+'"/>';
}
function svgLabel(x,y,value,color='#cde1ff'){
  if(![x,y].every(Number.isFinite))return '';
  return '<text class="draw-tag" x="'+x+'" y="'+Math.max(12,y)+'" fill="'+color+'">'+String(value)+'</text>';
}

function drawSegment(x1,y1,x2,y2,style,klass='draw-guide'){
  if(![x1,y1,x2,y2].every(Number.isFinite))return '';
  const st=safeStyle(style,'shape');
  return '<line class="'+klass+'" x1="'+x1+'" y1="'+y1+'" x2="'+x2+
    '" y2="'+y2+'" stroke="'+st.color+'" stroke-width="'+st.width+
    '" stroke-dasharray="'+dashArray(st)+'" vector-effect="non-scaling-stroke"/>';
}
function shapeMarkup(mode,points,w,h,highlight=false,rawStyle=null){
  const st=safeStyle(rawStyle,mode==='channel'?'channel':'shape');
  if(st.hidden)return '';
  const a=points?.[0],b=points?.[1],p=drawingPos(a?.time,a?.price),q=b?drawingPos(b.time,b.price):null;
  if(!p)return '';
  const color=st.color,selection=highlight?'#ffd668':color;
  if(mode==='vertical')
    return drawSegment(p.x,0,p.x,h,{...st,dash:st.dash==='solid'?'dashed':st.dash},'draw-vertical')+
      (highlight?svgCircle(p.x,p.y,selection):'');
  if(!q)return '';
  if(mode==='channel'){
    const geometry=Geometry.channel(points,time=>{
      const index=state.data.findIndex(c=>c.time===time);
      return index>=0?index:null;
    });
    if(!geometry)return drawSegment(p.x,p.y,q.x,q.y,st)+svgCircle(p.x,p.y,selection);
    const upA=drawingPos(geometry.upper[0].time,geometry.upper[0].price);
    const upB=drawingPos(geometry.upper[1].time,geometry.upper[1].price);
    if(!upA||!upB)return '';
    let lowerEnd=q,upperEnd=upB;
    if(st.extend&&Math.abs(q.x-p.x)>1){
      const plotRight=Math.max(10,w-chart.priceScale('right').width()-3);
      const t=(plotRight-p.x)/(q.x-p.x);
      const rightPrice=a.price+t*(b.price-a.price);
      const upperPrice=rightPrice+geometry.offset;
      const rightY=candles.priceToCoordinate(rightPrice);
      const upperY=candles.priceToCoordinate(upperPrice);
      if(rightPrice>0&&upperPrice>0&&Number.isFinite(rightY)&&Number.isFinite(upperY)){
        lowerEnd={x:plotRight,y:rightY};upperEnd={x:plotRight,y:upperY};
      }
    }
    const starts=p.x<=q.x?[p,upA]:[q,upB];
    const ends=st.extend&&lowerEnd!==q?[lowerEnd,upperEnd]:
      p.x<=q.x?[q,upB]:[p,upA];
    const lowStart=starts[0],upStart=starts[1],lowEnd=ends[0],upEnd=ends[1];
    let out='<polygon class="draw-channel-fill" points="'+
      [lowStart,lowEnd,upEnd,upStart].map(v=>v.x+','+v.y).join(' ')+'"/>';
    out+=drawSegment(lowStart.x,lowStart.y,lowEnd.x,lowEnd.y,st)+
      drawSegment(upStart.x,upStart.y,upEnd.x,upEnd.y,st);
    const midP={x:lowStart.x,y:(lowStart.y+upStart.y)/2},
      midQ={x:lowEnd.x,y:(lowEnd.y+upEnd.y)/2};
    out+=drawSegment(midP.x,midP.y,midQ.x,midQ.y,
      {...st,width:1,dash:'dotted'},'draw-channel-mid');
    if(highlight)for(const anchor of points){
      const coords=drawingPos(anchor.time,anchor.price);
      if(coords)out+=svgCircle(coords.x,coords.y,selection);
    }
    return out;
  }
  if(mode==='rectangle'){
    const x=Math.min(p.x,q.x),y=Math.min(p.y,q.y),
      width=Math.abs(q.x-p.x),height=Math.abs(q.y-p.y);
    return '<rect class="draw-box" x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+
      '" stroke="'+color+'" stroke-width="'+st.width+'" stroke-dasharray="'+dashArray(st)+'"/>'+
      (highlight?svgCircle(p.x,p.y,selection)+svgCircle(q.x,q.y,selection):'');
  }
  if(mode==='measure'){
    const diff=b.price-a.price,pct=(diff/a.price*100);
    const label=(diff>=0?'+':'')+fmt(diff)+' ('+(pct>=0?'+':'')+num(pct,2)+'%)';
    const x=Math.min(p.x,q.x),y=Math.min(p.y,q.y),bw=Math.abs(q.x-p.x),bh=Math.abs(q.y-p.y);
    return '<rect class="draw-range-box" x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'"/>'+
      drawSegment(p.x,p.y,q.x,q.y,st)+
      (highlight?svgCircle(p.x,p.y,selection)+svgCircle(q.x,q.y,selection):'')+
      svgLabel(Math.max(6,Math.min(w-180,x+6)),Math.max(13,y-6),label,color);
  }
  return '';
}
function svgFibDrawing(mode,anchors,w,style,selected=false,precomputed=null){
  const st=safeStyle(style,'fib');
  if(st.hidden||!Array.isArray(anchors))return '';
  const projected=anchors.map(a=>drawingPos(a.time,a.price));
  if(projected.some(x=>!x))return '';
  const plotWidth=Math.max(50,w-chart.priceScale('right').width());
  const x0=Math.max(0,Math.min(...projected.map(p=>p.x)));
  const right=Math.min(plotWidth-3,st.extend?plotWidth-3:Math.max(...projected.map(p=>p.x)));
  const levels=precomputed||Geometry.levels(mode,anchors,st.reverse);
  const color=st.color;
  let out='';
  if(selected){
    for(let i=0;i<projected.length-1;i++){
      const p=projected[i],q=projected[i+1];
      out+=drawSegment(p.x,p.y,q.x,q.y,{...st,color:'#b0b9d2',width:1,dash:'dashed'});
    }
  }
  for(const level of levels){
    if(!Number.isFinite(level.price)||level.price<=0)continue;
    const y=candles.priceToCoordinate(level.price);
    if(!Number.isFinite(y))continue;
    out+=drawSegment(x0,y,right,y,{...st,color:level.fraction===.618?'#f5bb65':color},'draw-fib-level');
    // Labels belong to their OWN line, not the far right axis of the whole chart.
    out+=svgLabel(Math.max(6,Math.min(right-105,plotWidth-108)),y-5,
      num(level.fraction*100,1)+'%  '+fmt(level.price),
      level.fraction===.618?'#f5bb65':color);
  }
  if(selected)for(const p of projected)out+=svgCircle(p.x,p.y,'#ffd668');
  return out;
}

function drawingPreviewMarkup(mode,a,b,w,h,c=null){
  const plotWidth=Math.max(10,w-chart.priceScale('right').width());
  if(!a)return '';
  const color='#ffd66a';
  if(mode==='horizontal'||mode==='alert'){
    const y=candles.priceToCoordinate(a.price);
    if(!Number.isFinite(y))return '';
    return svgLine(0,y,plotWidth,y,color)+svgLabel(8,y-8,(mode==='alert'?'🔔 ':'')+fmt(a.price),color);
  }
  if(mode==='vertical')return shapeMarkup(mode,[a],w,h,true);
  const p=drawingPos(a.time,a.price),q=b?drawingPos(b.time,b.price):null;
  if(!p)return '';
  if(!q)return svgCircle(p.x,p.y,color);
  if(mode==='channel'){
    if(c)return shapeMarkup('channel',[a,b,c],w,h,true,{color:'#62bfff',width:2,dash:'solid'});
    return drawSegment(p.x,p.y,q.x,q.y,{color,width:2,dash:'solid'})+
      svgCircle(p.x,p.y,color)+svgCircle(q.x,q.y,color)+
      svgLabel(q.x+8,q.y-9,'2/3 · choose channel width',color);
  }
  if(mode==='fibext'){
    if(c)return svgFibDrawing('fibext',[a,b,c],w,
      {color:'#f5bd68',width:1,dash:'dashed',extend:false},true);
    return drawSegment(p.x,p.y,q.x,q.y,{color,width:2,dash:'solid'})+
      svgCircle(p.x,p.y,color)+svgCircle(q.x,q.y,color)+
      svgLabel(q.x+8,q.y-9,'2/3 · place correction C',color);
  }
  if(mode==='trend'){
    return svgLine(p.x,p.y,q.x,q.y,color)+svgCircle(p.x,p.y,color)+
      svgCircle(q.x,q.y,color)+svgLabel(Math.min(plotWidth-115,Math.max(10,q.x+9)),q.y-10,fmt(b.price),color);
  }
  if(mode==='fib')return svgFibDrawing('fib',[a,b],w,
    {color:'#9e85f6',width:1,dash:'dashed',extend:false},true);
  return shapeMarkup(mode,[a,b],w,h,true);
}
function renderDrawingOverlay(){
  if(!chart||!candles)return;
  const overlay=$('drawingOverlay'),shapes=$('drawingShapes'),live=$('drawingLive');
  if(!overlay||!shapes||!live)return;
  const host=$('chartHost'),w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);
  overlay.setAttribute('viewBox','0 0 '+w+' '+h);
  let markup='';
  for(const d of state.drawings){
    if(d.style?.hidden)continue;
    if(d.kind==='shape')markup+=shapeMarkup(d.shape,d.points,w,h,state.selectedDrawingId===d.id,d.style);
    if(d.kind==='fib'&&d.anchors){
      if(d.renderer==='svg')markup+=svgFibDrawing(d.mode,d.anchors,w,d.style,
        state.selectedDrawingId===d.id,d.levels);
      else if(state.selectedDrawingId===d.id){
        const coords=d.anchors.map(a=>drawingPos(a.time,a.price)).filter(Boolean);
        if(coords.length===d.anchors.length){
          for(let i=0;i<coords.length-1;i++){
            markup+=svgLine(coords[i].x,coords[i].y,coords[i+1].x,coords[i+1].y,'#d4b2ff');
          }
          for(const p of coords)markup+=svgCircle(p.x,p.y,'#ffd668');
        }
      }
    }
  }
  shapes.innerHTML=markup;
  if(state.drawMode==='cursor'){live.replaceChildren();return;}
  const current=drawGesture?.latest||null;
  const staged=drawSequence;
  if(['horizontal','alert','vertical'].includes(state.drawMode))
    live.innerHTML=drawingPreviewMarkup(state.drawMode,current||state.drawStart,current,w,h);
  else if(['channel','fibext'].includes(state.drawMode)){
    if(staged.length===0)live.innerHTML='';
    else if(staged.length===1)
      live.innerHTML=drawingPreviewMarkup(state.drawMode,staged[0],current,w,h);
    else
      live.innerHTML=drawingPreviewMarkup(state.drawMode,staged[0],staged[1],w,h,current);
  }else live.innerHTML=drawingPreviewMarkup(state.drawMode,state.drawStart,current,w,h);
}
function scheduleDrawingOverlay(){
  if(!chart||!candles)return;
  if(scheduleDrawingOverlay.pending)return;
  scheduleDrawingOverlay.pending=true;
  requestAnimationFrame(()=>{scheduleDrawingOverlay.pending=false;renderDrawingOverlay();});
}
function addDrawingFromGesture(mode,start,end){
  if(!Number.isFinite(end?.price)||end.price<=0||!Number.isFinite(end.time))return false;
  if(mode==='horizontal'){
    const line=candles.createPriceLine({price:end.price,color:'#62aeff',lineWidth:2,
      lineStyle:LW.LineStyle.Dashed,axisLabelVisible:true,title:'USER LEVEL'});
    const d={id:++drawingSeq,kind:'price',price:end.price,line,style:defaultStyle('price')};
    state.drawings.push(d);selectDrawing(d.id);toast('Horizontal level '+fmt(end.price)+' saved.');
    return true;
  }
  if(mode==='alert'){addChartPriceAlert(end.price);return true;}
  if(mode==='vertical'){
    const d={id:++drawingSeq,kind:'shape',shape:'vertical',points:[{time:end.time,price:end.price}],style:defaultStyle('shape')};
    state.drawings.push(d);selectDrawing(d.id);toast('Vertical time marker added.');
    return true;
  }
  if(mode==='channel'||mode==='fibext'){
    const points=Array.isArray(start)?[...start,end]:[];
    if(points.length!==3||points.some(p=>!p||!Number.isFinite(p.price)||p.price<=0))return false;
    if(points[0].time===points[1].time){
      toast('A and B must be on different candles.',true);return false;
    }
    if(mode==='channel'){
      const geometry=Geometry.channel(points,time=>{
        const i=state.data.findIndex(c=>c.time===time);
        return i<0?null:i;
      });
      if(!geometry){toast('Channel points must have a valid positive price range.',true);return false;}
      const d={id:++drawingSeq,kind:'shape',shape:'channel',points,
        style:defaultStyle('channel')};
      state.drawings.push(d);selectDrawing(d.id);
      toast('Parallel Channel added · select it to edit width and color.');
      return true;
    }
    const levels=Geometry.levels('fibext',points,false);
    if(levels.length<2){toast('Extension is outside the positive price range.',true);return false;}
    const d={id:++drawingSeq,kind:'fib',renderer:'svg',mode:'fibext',
      anchors:points,levels,lines:[],style:defaultStyle('fib')};
    state.drawings.push(d);selectDrawing(d.id);
    toast('Trend-based Fibonacci Extension · 3 points saved.');
    return true;
  }
  if(!start||!['trend','fib','rectangle','measure'].includes(mode))return false;
  if(mode==='trend'&&start.time===end.time){toast('Choose points on different candles.',true);return false;}
  if(mode==='fib'&&start.price===end.price){toast('Choose different prices for Fibonacci.',true);return false;}
  if(['rectangle','measure'].includes(mode)&&start.time===end.time&&start.price===end.price){
    toast('Move to a different second point.',true);return false;
  }
  const anchors=[{time:start.time,price:start.price},{time:end.time,price:end.price}];
  if(mode==='trend'){
    const line=addLine('#64b7ff',2);
    const points=anchors.map(p=>({time:p.time,value:p.price})).sort((a,b)=>a.time-b.time);
    line.setData(points);
    const d={id:++drawingSeq,kind:'series',line,points,style:defaultStyle('series')};
    state.drawings.push(d);selectDrawing(d.id);toast('Trend line saved.');
  }else if(mode==='fib'){
    const levels=Geometry.levels('fib',anchors,false);
    if(levels.length<2){toast('Retracement is outside positive prices.',true);return false;}
    const d={id:++drawingSeq,kind:'fib',renderer:'svg',mode:'fib',
      anchors,levels,lines:[],style:defaultStyle('fib')};
    state.drawings.push(d);selectDrawing(d.id);
    toast('Fibonacci Retracement saved · 0% at B, 100% at A.');
  }else{
    const d={id:++drawingSeq,kind:'shape',shape:mode,points:anchors,style:defaultStyle('shape')};
    state.drawings.push(d);selectDrawing(d.id);
    toast(mode==='measure'?'Price range measured.':'Rectangle saved.');
  }
  return true;
}

function installPrecisionDraw(){
  const host=$('chartHost');
  let press=null;
  const drawingMode=()=>state.drawMode!=='cursor';
  const multiMode=()=>['channel','fibext'].includes(state.drawMode);
  const stop=e=>{e.preventDefault();e.stopPropagation();e.stopImmediatePropagation?.();};
  const hint=content=>{$('drawHint').textContent=content;};
  const finish=(mode,start,end)=>{
    const ok=addDrawingFromGesture(mode,start,end);
    if(ok){
      drawGesture=null;state.drawStart=null;drawSequence=[];
      suppressDrawingClickUntil=Date.now()+380;
    }
    renderDrawingOverlay();
  };
  host.addEventListener('pointerdown',e=>{
    if(!drawingMode()||e.button!==0||!state.data.length)return;
    const p=drawingPriceAt(e);
    if(!p)return;
    const mode=state.drawMode,stage=drawSequence.length;
    const already=!!state.drawStart;
    if(!multiMode()&&!already)state.drawStart=p;
    if(multiMode()&&stage===0)drawSequence=[p];
    press={id:e.pointerId,mode,stage,wasSecond:already,
      startClientX:e.clientX,startClientY:e.clientY,moved:false};
    drawGesture={latest:p,mode};
    try{host.setPointerCapture(e.pointerId);}catch{}
    renderDrawingOverlay();
    stop(e);
  },true);
  host.addEventListener('pointermove',e=>{
    if(!drawingMode()||!state.data.length)return;
    const point=drawingPriceAt(e);
    if(!point)return;
    if(press&&press.id===e.pointerId&&
       Math.hypot(e.clientX-press.startClientX,e.clientY-press.startClientY)>5)
      press.moved=true;
    drawGesture={...drawGesture,latest:point,mode:state.drawMode};
    renderDrawingOverlay();
    if(press&&press.id===e.pointerId)stop(e);
  },true);
  host.addEventListener('pointerup',e=>{
    if(!drawingMode()||!press||e.pointerId!==press.id)return;
    const point=drawingPriceAt(e)||drawGesture?.latest||state.drawStart;
    const mode=press.mode,dragged=press.moved,second=press.wasSecond,stage=press.stage;
    press=null;
    try{host.releasePointerCapture(e.pointerId);}catch{}
    if(['horizontal','vertical','alert'].includes(mode)){finish(mode,null,point);}
    else if(['channel','fibext'].includes(mode)){
      if(stage===0){
        if(dragged&&point.time!==drawSequence[0].time){
          drawSequence=[drawSequence[0],point];
          hint(mode==='channel'?
            '2/3 → Move mouse to set parallel channel width, then click point C':
            '2/3 → Move mouse to correction point C; 0% starts at C');
        }else hint('1/3 → Move mouse to mark impulse endpoint B');
      }else if(stage===1){
        if(point.time===drawSequence[0].time){
          hint('Point B must be on another candle. Choose B again.');
        }else{
          drawSequence=[drawSequence[0],point];
          hint(mode==='channel'?
            '2/3 → Click C to set channel width':
            '2/3 → Click C to project Fibonacci levels from correction');
        }
      }else if(stage===2){
        const anchors=drawSequence.slice(0,2);
        finish(mode,anchors,point);
      }
      renderDrawingOverlay();
    }else if(dragged||second){finish(mode,state.drawStart,point);}
    else{
      hint('Move pointer to preview · click second point to confirm · Shift snaps OHLC');
      renderDrawingOverlay();
    }
    stop(e);
  },true);
  host.addEventListener('pointercancel',e=>{
    if(!press||press.id!==e.pointerId)return;
    press=null;drawGesture=null;state.drawStart=null;drawSequence=[];
    renderDrawingOverlay();stop(e);
  },true);
  host.addEventListener('pointerleave',()=>{
    if(!press&&!state.drawStart&&drawSequence.length===0){drawGesture=null;renderDrawingOverlay();}
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      press=null;drawGesture=null;state.drawStart=null;drawSequence=[];
      renderDrawingOverlay();
    }
  });
}
function onChartClick(param){
  if(state.drawMode!=='cursor'||!param?.point||
     Date.now()<suppressAlertClickUntil||Date.now()<suppressDrawingClickUntil)return;
  const hit=drawingHitTest(param.point);
  if(hit)selectDrawing(hit.id,hit.fraction);
  else if(state.selectedDrawingId!==null){resetDrawingSelection();renderDrawingPanel();}
}
function setDrawMode(mode){
  if(!DRAW_MODES.includes(mode))mode='cursor';
  hideChartContextMenu();
  state.drawMode=mode;state.drawStart=null;drawGesture=null;drawSequence=[];
  const host=$('chartHost');
  host.classList.toggle('chart-alert-mode',mode==='alert');
  host.classList.toggle('chart-drawing-active',mode!=='cursor');
  if(chart)chart.applyOptions({handleScroll:mode==='cursor',handleScale:mode==='cursor'});
  document.querySelectorAll('[data-draw]').forEach(b=>{
    const enabled=b.dataset.draw===mode;
    b.classList.toggle('active',enabled);
    b.setAttribute('aria-pressed',String(enabled));
  });
  $('drawHint').classList.toggle('hidden',mode==='cursor');
  if(mode!=='cursor')$('drawHint').textContent=
    ['channel','fibext'].includes(mode)?
      'Choose A → B impulse (drag or 2 clicks), then click C for '+(mode==='channel'?'channel width':'extension projection'):
      'Press and drag · or click first and second points · Shift snaps OHLC';
  renderDrawingOverlay();
}

function clearDrawings({forget=true,notice=true}={}){
  const toRemove=[...state.drawings];
  for(const d of toRemove){
    try{
      if(d.kind==='price')candles.removePriceLine(d.line);
      else if(d.kind==='fib')d.levels.forEach(l=>{if(l.line)candles.removePriceLine(l.line);});
      else if(d.kind==='series')chart.removeSeries(d.line);
    }catch(e){console.warn('Drawing clear skipped',e);}
  }
  state.drawings=[];resetDrawingSelection();
  renderDrawingPanel();setDrawMode('cursor');
  if(forget)persistDrawings();
  scheduleDrawingOverlay();
  if(notice&&toRemove.length)toast('All drawings cleared.');
}
function downloadCsv(){
if(!state.data.length){toast('No candles to export yet',true);return;}
const header='timestamp_utc,open,high,low,close,volume';
const content=[header,...state.data.map(c=>[new Date(c.time*1000).toISOString(),c.open,c.high,c.low,c.close,c.volume].join(','))].join('\n');
const blob=new Blob([content],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
link.href=url;link.download='RibhLab_'+state.symbol+'_'+state.tf+'_OHLCV.csv';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('OHLCV CSV exported.');
}
const INDICATOR_IDS=['toggleEMA20','toggleEMA50','toggleEMA200','toggleVolume','toggleRSI','toggleZones','toggleBullishFvg','toggleBearishFvg','toggleMarkers','toggleSR','toggleAlertLines'];
function syncIndicatorLegend(){
  const switches=[
    ['ema20','toggleEMA20'],['ema50','toggleEMA50'],['ema200','toggleEMA200'],
    ['bullish','toggleBullishFvg'],['bearish','toggleBearishFvg']
  ];
  for(const [cls,id] of switches){
    const visible=$(id).checked;
    document.querySelectorAll('.legend-strip span').forEach(item=>{
      if(item.querySelector('.legend-dot.'+cls))item.classList.toggle('indicator-hidden',!visible);
    });
  }
  const enabled=$('toggleRSI').checked;
  $('stripRSI').classList.toggle('indicator-hidden',!enabled);
}
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
  // Preserve preferences of older TradingFiew sessions which had one EMA switch.
  if(typeof indicators.toggleEMA==='boolean'){
    for(const id of ['toggleEMA20','toggleEMA50','toggleEMA200']){
      if(typeof indicators[id]!=='boolean')indicators[id]=indicators.toggleEMA;
    }
  }
  for(const id of INDICATOR_IDS)if(typeof indicators[id]==='boolean')$(id).checked=indicators[id];
  syncIndicatorLegend();
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
    alignPriceScaleWidths();
    if(rsiTimelineReady)restoreSharedTimeScale();
    if(sharedCrosshairTime!==null)layoutSharedCrosshairGuide();
    scheduleLivePriceBadgeLayout();
    drawZones();scheduleDrawingOverlay();
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
for(const id of ['toggleEMA20','toggleEMA50','toggleEMA200'])
  $(id).addEventListener('change',refreshEMAs);
$('toggleVolume').addEventListener('change',()=>{if(state.data.length)vol.setData($('toggleVolume').checked?state.data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?'rgba(55,210,160,.19)':'rgba(240,94,125,.19)'})):[]);});
$('toggleRSI').addEventListener('change',()=>{refreshRsi();syncIndicatorLegend();});
$('toggleZones').addEventListener('change',drawZones);
for(const id of ['toggleBullishFvg','toggleBearishFvg']){
  $(id).addEventListener('change',()=>{drawZones();syncIndicatorLegend();});
}
$('toggleAlertLines').addEventListener('change',renderAlertPriceLines);
$('toggleMarkers').addEventListener('change',renderMarkers);
$('toggleSR').addEventListener('change',renderSupportResistance);
for(const id of INDICATOR_IDS){
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
installDrawingOptionsBar();
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

/* Public UI API: keeps chart internals private while allowing a standalone
 * viewport terminal to control visible history, resizing and exports. */
function terminalRange(range,{silent=false}={}){
  if(!chart||state.data.length<2)return false;
  const values={"1D":86400,"5D":432000,"1M":2592000,"3M":7776000,"6M":15552000,"1Y":31536000};
  const last=state.data.length-1;
  try{
    if(range==="ALL"){
      chart.timeScale().fitContent();
      return true;
    }
    if(!Object.hasOwn(values,range)&&range!=="YTD")return false;
    const lastTime=state.data[last].time;
    const cutoff=range==="YTD"?
      Date.UTC(new Date(lastTime*1000).getUTCFullYear(),0,1)/1000:
      lastTime-values[range];
    const from=state.data.findIndex(c=>c.time>=cutoff);
    const index=Math.max(0,from);
    const number=last-index+1;
    const first=state.data[0].time;
    chart.timeScale().setVisibleLogicalRange({
      from:Math.max(0,index-1),to:last+4
    });
    if(!silent&&cutoff<first){
      toast("Showing the full "+state.data.length+" available candles. More historical data isn't loaded for this timeframe.");
    }else if(!silent&&number<3){
      toast("Only "+number+" confirmed candles available in the selected period.");
    }
    return true;
  }catch(error){
    console.warn("Visible history range unavailable",error);
    return false;
  }
}
function terminalScreenshot(){
  if(!chart||!state.data.length){toast("Open a loaded chart to save an image.",true);return;}
  try{
    const main=chart.takeScreenshot(false,false);
    if(!main||!main.width||!main.height)throw Error("Chart capture unavailable");
    const showRsi=!$("rsiPanel").classList.contains("hidden");
    const bottom=showRsi?rsiChart.takeScreenshot(false,false):null;
    const scale=Math.max(.75,main.width/Math.max(1,$("chartHost").getBoundingClientRect().width));
    const header=Math.round(62*scale),footer=Math.round(43*scale),rsiHeight=bottom?.height||0;
    const output=document.createElement("canvas");output.width=main.width;
    output.height=header+main.height+rsiHeight+footer;
    const ctx=output.getContext("2d");
    if(!ctx)throw Error("Canvas unavailable");
    const bg=state.dark?"#0c1322":"#f7f9fc",fg=state.dark?"#e3edfc":"#172436";
    ctx.fillStyle=bg;ctx.fillRect(0,0,output.width,output.height);
    const inset=Math.round(15*scale);
    ctx.textBaseline="middle";
    ctx.fillStyle=fg;ctx.font="bold "+Math.round(18*scale)+"px sans-serif";
    ctx.fillText("TradingFiew  •  "+state.symbol+"  •  "+state.tf.toUpperCase(),inset,Math.round(21*scale));
    ctx.fillStyle=state.dark?"#99acc3":"#617184";
    ctx.font=Math.round(10*scale)+"px monospace";
    ctx.fillText("Market research  ·  "+new Date().toISOString().slice(0,19).replace("T"," ")+" UTC",
      inset,Math.round(46*scale));
    ctx.drawImage(main,0,header);
    // Overlaid FVG/OB regions are a separate canvas; include them explicitly.
    if(zoneCanvas?.width>0&&zoneCanvas?.height>0)ctx.drawImage(zoneCanvas,0,header,main.width,main.height);
    if(bottom)ctx.drawImage(bottom,0,header+main.height,main.width,rsiHeight);
    ctx.fillStyle=state.dark?"#9eafc4":"#586780";
    ctx.font=Math.round(9*scale)+"px sans-serif";
    ctx.fillText("TradingFiew  •  Charts by TradingView Lightweight Charts™  •  Indicative data where applicable",
      inset,output.height-Math.round(18*scale),output.width-inset*2);
    output.toBlob(blob=>{
      if(!blob){toast("Chart image could not be generated.",true);return;}
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download="TradingFiew_"+state.symbol+"_"+state.tf+"_"+new Date().toISOString().slice(0,10)+".png";
      document.body.appendChild(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      toast("Chart PNG saved, including price history and technical analysis.");
    },"image/png");
  }catch(error){
    console.warn("Chart capture error",error);
    toast("This browser could not capture the chart. Try the Share link instead.",true);
  }
}
function terminalSnapshot(){
  const market=activeMarket();
  return {
    symbol:state.symbol,tf:state.tf,provider:market.provider,
    open:market.provider==="binance"?state.live:state.quoteIsFresh,
    candleTime:state.data.at(-1)?.time||null
  };
}
window.TradingFiewChartAPI=Object.freeze({
  resize:()=>resizeChartWindow(),
  setRange:terminalRange,
  getSnapshot:terminalSnapshot,
  getCandleCountdown:candleCountdownData,
  refreshPriceBadge:scheduleLivePriceBadgeLayout,
  saveScreenshot:terminalScreenshot,
  getAlignmentDiagnostics:()=>{
    if(!chart||!rsiChart||!state.data.length)return null;
    const sample=state.data[Math.max(0,state.data.length-12)]?.time;
    const mainX=sample?chart.timeScale().timeToCoordinate(sample):null;
    const rsiX=sample?rsiChart.timeScale().timeToCoordinate(sample):null;
    return {
      sampleTime:sample,mainX,rsiX,
      differencePx:Number.isFinite(mainX)&&Number.isFinite(rsiX)?Math.abs(mainX-rsiX):null,
      mainAxisWidth:chart.priceScale('right').width(),
      rsiAxisWidth:rsiChart.priceScale('right').width(),
      mainLogicalRange:chart.timeScale().getVisibleLogicalRange(),
      rsiLogicalRange:rsiChart.timeScale().getVisibleLogicalRange(),
      mainCount:state.data.length,
      rsiCount:rsiSeries.data().length,
      rsiEnabled:$('toggleRSI').checked,
      rsiTimelineReady
    };
  }
});
function start(){
try{
let responsiveTimer=null;
window.addEventListener('resize',()=>{clearTimeout(responsiveTimer);responsiveTimer=setTimeout(()=>{resizeChartWindow();if(state.analysis){renderMarkers();drawZones();}},140);},{passive:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.data.length)void fetchTicker(state.symbol,state.request);});
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