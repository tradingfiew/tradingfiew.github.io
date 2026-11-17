/* TradingFiew / Market Panels v1.0
 * Public real Binance Spot partial order-book depth for supported crypto.
 * NO simulated books for MT5/CFD, forex, metals, indices or stocks.
 * Timeframe directions are independent heuristics on closed candles only.
 * No trade execution, paid data, or keys.
 */
(function(root){
  "use strict";
  const $=id=>document.getElementById(id);
  const Markets=root.TradingFiewMarkets,Engine=root.SmcEngine;
  const TFS=Object.freeze(["5m","15m","1h","4h","1d"]);
  const LABELS=Object.freeze({"5m":"5M","15m":"15M","1h":"1H","4h":"4H","1d":"1D"});
  const cache=new Map();
  const state={
    symbol:null,tf:"1h",serial:0,controller:null,ws:null,
    depthTimer:null,depthReconnect:null,depthWatchdog:null,
    trendTimer:null,book:null,received:0,depthBusy:false,wsConnected:false
  };
  const unit=v=>Number.isFinite(v)?Intl.NumberFormat("en-US",{maximumFractionDigits:2,notation:"compact"}).format(v):"—";
  const num=(v,max=4)=>Number.isFinite(v)?new Intl.NumberFormat("en-US",{maximumFractionDigits:max}).format(v):"—";
  function showStatus(message,type="neutral"){
    const el=$("orderBookStatus");if(!el)return;
    el.textContent=message;el.dataset.state=type;el.hidden=false;
  }
  function safeClose(){
    clearInterval(state.depthTimer);clearTimeout(state.depthReconnect);clearInterval(state.depthWatchdog);
    state.depthTimer=state.depthReconnect=state.depthWatchdog=null;
    if(state.ws){
      const socket=state.ws;state.ws=null;
      socket.onclose=socket.onmessage=socket.onerror=socket.onopen=null;
      try{socket.close();}catch{}
    }
    state.wsConnected=false;state.depthBusy=false;state.book=null;state.received=0;
  }
  function priceDecimals(value){
    if(value>=1000)return 2;
    if(value>=1)return 4;
    if(value>=.01)return 6;
    return 8;
  }
  function levels(raw,descending){
    if(!Array.isArray(raw))return [];
    return raw.map(pair=>({price:Number(pair[0]),qty:Number(pair[1])}))
      .filter(x=>Number.isFinite(x.price)&&x.price>0&&Number.isFinite(x.qty)&&x.qty>0)
      .sort((a,b)=>descending?b.price-a.price:a.price-b.price).slice(0,20);
  }
  function acceptDepth(payload,source){
    if(!payload||state.symbol===null||Markets.get(state.symbol)?.provider!=="binance")return;
    const bids=levels(payload.bids,true),asks=levels(payload.asks,false);
    if(!bids.length||!asks.length||bids[0].price>=asks[0].price){
      showStatus("Order book unavailable or inconsistent — retrying","warning");return;
    }
    const book={bids,asks,source};
    state.book=book;state.received=Date.now();
    renderBook(book);
  }
  function sideRows(id,data,kind,maximum){
    const parent=$(id);parent.replaceChildren();
    for(const level of data){
      const row=document.createElement("div");row.className="orderbook-level "+kind;
      const background=document.createElement("span");background.className="orderbook-depth-bg";
      background.style.width=(Math.max(0,Math.min(100,level.qty/maximum*100))).toFixed(2)+"%";
      const price=document.createElement("b");price.className="ob-price";price.textContent=num(level.price,priceDecimals(level.price));
      const amount=document.createElement("span");amount.className="ob-size";amount.textContent=unit(level.qty);
      const total=document.createElement("span");total.className="ob-total";total.textContent=unit(level.price*level.qty);
      row.append(background,price,amount,total);parent.appendChild(row);
    }
  }
  function renderBook(book){
    const bids=book.bids.slice(0,10),asks=book.asks.slice(0,10);
    const max=Math.max(1,...bids.concat(asks).map(x=>x.qty));
    sideRows("orderBookAsks",asks.slice().reverse(),"ask",max);
    sideRows("orderBookBids",bids,"bid",max);
    const bid=bids[0].price,ask=asks[0].price,mid=(bid+ask)/2,spread=ask-bid;
    $("orderBookMid").textContent=num(mid,priceDecimals(mid));
    $("orderBookSpread").textContent="Spread "+num(spread,priceDecimals(mid))+" ("+num(spread/mid*100,3)+"%)";
    const buyVolume=bids.reduce((sum,x)=>sum+x.qty,0),sellVolume=asks.reduce((sum,x)=>sum+x.qty,0);
    const buyPct=(buyVolume+sellVolume)?buyVolume/(buyVolume+sellVolume)*100:50;
    $("orderBookBidLabel").textContent="Bids "+buyPct.toFixed(1)+"%";
    $("orderBookAskLabel").textContent="Asks "+(100-buyPct).toFixed(1)+"%";
    $("orderBookBidBar").style.width=buyPct.toFixed(1)+"%";
    $("orderBookUpdated").textContent="Received "+new Date(state.received).toLocaleTimeString("en-GB",{timeZone:"UTC",hour12:false})+" UTC";
    $("orderBookContent").hidden=false;
    showStatus(book.source==="WS"?"LIVE · Binance Spot partial depth":"Binance Spot snapshot · reconnecting",book.source==="WS"?"live":"neutral");
  }
  async function fetchDepth(serial){
    if(serial!==state.serial||state.depthBusy||Markets.get(state.symbol)?.provider!=="binance")return;
    const symbol=state.symbol;state.depthBusy=true;
    try{
      let fetched=false;
      for(const base of ["https://data-api.binance.vision","https://api.binance.com"]){
        try{
          const response=await fetch(base+"/api/v3/depth?symbol="+encodeURIComponent(symbol)+"&limit=20",{cache:"no-store",signal:state.controller?.signal});
          if(!response.ok)throw Error("HTTP "+response.status);
          const data=await response.json();
          if(serial!==state.serial||symbol!==state.symbol)return;
          acceptDepth(data,"REST");
          fetched=true;break;
        }catch(e){if(e.name==="AbortError")return;}
      }
      if(!fetched&&serial===state.serial&&!state.book)showStatus("Binance depth unavailable here. Check your connection or try again.","warning");
    }finally{state.depthBusy=false;}
  }
  function fallbackPoll(serial){
    clearInterval(state.depthTimer);
    state.depthTimer=setInterval(()=>{
      if(!document.hidden&&serial===state.serial&&!state.wsConnected)void fetchDepth(serial);
    },12000);
  }
  function connectDepth(serial){
    if(serial!==state.serial||Markets.get(state.symbol)?.provider!=="binance")return;
    const symbol=state.symbol;
    if(!("WebSocket" in root)){fallbackPoll(serial);return;}
    try{
      const socket=new WebSocket("wss://data-stream.binance.vision/ws/"+symbol.toLowerCase()+"@depth20");
      state.ws=socket;
      socket.onopen=()=>{
        if(serial!==state.serial||state.ws!==socket)return;
        state.wsConnected=true;clearInterval(state.depthTimer);state.depthTimer=null;
      };
      socket.onmessage=event=>{
        if(serial!==state.serial||state.ws!==socket)return;
        try{
          const payload=JSON.parse(event.data);
          if(payload&&Array.isArray(payload.bids)&&Array.isArray(payload.asks))acceptDepth(payload,"WS");
        }catch{}
      };
      socket.onerror=()=>{if(serial===state.serial&&!state.book)showStatus("Depth stream blocked — using Binance REST where available","warning");};
      socket.onclose=()=>{
        if(serial!==state.serial||state.ws!==socket)return;
        state.ws=null;state.wsConnected=false;fallbackPoll(serial);
        if(state.book)showStatus("Streaming disconnected · last received snapshot","warning");
        clearTimeout(state.depthReconnect);
        state.depthReconnect=setTimeout(()=>{if(serial===state.serial&&!document.hidden)connectDepth(serial);},10000);
      };
    }catch{
      fallbackPoll(serial);
    }
  }
  function updateBookStatus(){
    if(Markets.get(state.symbol)?.provider!=="binance"||!state.book)return;
    if(Date.now()-state.received>15000)showStatus("STALE · last received book may be outdated","warning");
  }
  function trendRow(tf,result){
    const card=document.createElement("div");card.className="timeframe-trend";
    card.dataset.tf=tf;
    const title=document.createElement("span");title.className="tf-name";title.textContent=LABELS[tf];
    const direction=document.createElement("strong");direction.className="tf-direction";
    const detail=document.createElement("small");detail.className="tf-detail";
    if(result?.ok){
      const dirs={bull:"↗ BULLISH",bear:"↘ BEARISH",neutral:"↔ RANGING"};
      card.dataset.direction=result.dir;
      direction.textContent=dirs[result.dir]||"↔ RANGING";
      detail.textContent="RSI "+num(result.rsi,0)+" · EMA "+(result.emaBias||"mixed");
      card.title="Last confirmed candle: "+new Date(result.candleTime*1000).toLocaleString("en-GB",{timeZone:"UTC"})+" UTC. Based on closed candles. Not an investment signal.";
    }else{
      card.dataset.direction="unavailable";
      direction.textContent=result?.pending?"Checking…":"Unavailable";
      detail.textContent=result?.pending?"Loading candles":"No verified candles";
    }
    card.append(title,direction,detail);
    return card;
  }
  function showTrends(rows){
    const el=$("timeframeTrendsList");el.replaceChildren();
    for(const tf of TFS)el.appendChild(trendRow(tf,rows[tf]));
    const ok=TFS.map(tf=>rows[tf]).filter(x=>x?.ok);
    const buys=ok.filter(x=>x.dir==="bull").length,sells=ok.filter(x=>x.dir==="bear").length,flat=ok.filter(x=>x.dir==="neutral").length;
    $("timeframeTrendsSummary").textContent=ok.length?"Bull "+buys+" · Bear "+sells+" · Range "+flat:"No confirmed data";
    $("timeframeTrendsUpdated").textContent=ok.length?"Closed candles only · refreshed "+new Date().toLocaleTimeString("en-GB",{timeZone:"UTC",hour12:false})+" UTC":"Waiting for confirmed candles";
  }
  function trendFromBars(bars,provider){
    const closed=provider==="binance"?bars.slice(0,-1):bars.filter(x=>!x.isOpen);
    if(closed.length<65)throw Error("Not enough closed candles");
    const analysis=Engine.calculate(closed);
    const last=closed.at(-1);
    if(!Number.isFinite(analysis.ema20value)||!Number.isFinite(analysis.ema50value))throw Error("EMA not ready");
    const bullEma=analysis.ema20value>analysis.ema50value,above=last.close>analysis.ema20value;
    const bearEma=analysis.ema20value<analysis.ema50value,below=last.close<analysis.ema20value;
    const bull=analysis.direction==="bull",bear=analysis.direction==="bear";
    // Two or more criteria align; contradictory price direction stays ranging.
    const dir=bullEma&&above&&(bull||analysis.rsi>=55)?"bull":
      bearEma&&below&&(bear||analysis.rsi<=45)?"bear":"neutral";
    return {ok:true,dir,rsi:analysis.rsi,emaBias:bullEma?"20>50":bearEma?"20<50":"equal",candleTime:last.time};
  }
  async function refreshTrends(serial,{force=false}={}){
    if(serial!==state.serial)return;
    const symbol=state.symbol,provider=Markets.get(symbol)?.provider;
    if(!provider)return;
    const rows={},jobs=[];
    for(const tf of TFS){
      const cached=cache.get(symbol+":"+tf);
      if(!force&&cached&&Date.now()-cached.at<90000){rows[tf]=cached.value;continue;}
      rows[tf]={pending:true};jobs.push(tf);
    }
    showTrends(rows);
    async function worker(){
      while(jobs.length){
        const tf=jobs.shift();if(serial!==state.serial)return;
        try{
          const bars=await Markets.candles(symbol,tf,260,state.controller?.signal);
          if(serial!==state.serial)return;
          const value=trendFromBars(bars,provider);
          rows[tf]=value;cache.set(symbol+":"+tf,{at:Date.now(),value});
        }catch(e){
          if(serial!==state.serial||e.name==="AbortError")return;
          rows[tf]={ok:false};
        }
        if(serial===state.serial)showTrends(rows);
      }
    }
    await Promise.all([worker(),worker()]);
  }
  function resetBook(){
    $("orderBookContent").hidden=true;
    $("orderBookAsks").replaceChildren();$("orderBookBids").replaceChildren();
    const market=Markets.get(state.symbol);
    $("orderBookNotice").textContent=market?.provider==="binance"?
      "Top 20 bid/ask levels from Binance Spot. Displaying 10 per side. Depth can change instantly.":
      "Real order-book depth is not available from this market's indicative MT5/CFD feed. No synthetic orders are shown.";
    $("orderBookRefreshBtn").disabled=market?.provider!=="binance";
    showStatus(market?.provider==="binance"?"Connecting to Binance Spot order book…":"Not available for "+(market?.name||"this market"),market?.provider==="binance"?"neutral":"unavailable");
  }
  function select(symbol,tf){
    if(!Markets?.get(symbol))return;
    state.serial++;
    state.controller?.abort();state.controller=new AbortController();
    state.symbol=symbol;state.tf=tf;
    safeClose();resetBook();
    const serial=state.serial;
    const initial={};for(const f of TFS)initial[f]={pending:true};
    showTrends(initial);
    void refreshTrends(serial);
    if(Markets.get(symbol).provider==="binance"){
      void fetchDepth(serial);
      connectDepth(serial);
      fallbackPoll(serial);
    }
    clearInterval(state.trendTimer);
    state.trendTimer=setInterval(()=>{
      if(serial!==state.serial||document.hidden)return;
      void refreshTrends(serial);
    },90000);
    clearInterval(state.depthWatchdog);
    state.depthWatchdog=setInterval(updateBookStatus,5000);
  }
  function init(){
    $("trendsRefreshBtn")?.addEventListener("click",()=>{if(state.symbol)void refreshTrends(state.serial,{force:true});});
    $("orderBookRefreshBtn")?.addEventListener("click",()=>{if(state.symbol&&Markets.get(state.symbol)?.provider==="binance")void fetchDepth(state.serial);});
    document.addEventListener("visibilitychange",()=>{
      if(document.hidden)return;
      if(!state.symbol)return;
      void refreshTrends(state.serial);
      if(Markets.get(state.symbol)?.provider==="binance"){
        if(!state.wsConnected){void fetchDepth(state.serial);if(!state.ws)connectDepth(state.serial);}
        else updateBookStatus();
      }
    });
    root.addEventListener("pagehide",()=>{state.serial++;safeClose();state.controller?.abort();clearInterval(state.trendTimer);});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);
  else init();
  root.TradingFiewMarketPanels=Object.freeze({select,refresh:()=>state.symbol&&refreshTrends(state.serial,{force:true})});
})(window);
