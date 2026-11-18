'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const base=path.resolve(__dirname,'..');
const source=name=>fs.readFileSync(path.join(base,name),'utf8');
const boot=name=>{
  const root={};
  vm.runInNewContext(source(name),{window:root,console,AbortController,setTimeout,clearTimeout}, {filename:name});
  return root;
};
test('all first-party browser JavaScript parses',()=>{
  for(const file of ['analysis.js','drawing-geometry.js','price-schedule-core.js','scheduled-prices.js','market-data.js','market-panels.js','app.js','alerts.js',
      'workspace.js','terminal-ui.js','us-calendar.js','adsense.js','share.js','donate.js',
      'smc-breakout-alerts.js','alerts-sw.js']){
    assert.doesNotThrow(()=>new vm.Script(source(file),{filename:file}),file);
  }
});
test('public market symbols and feeds have no fabricated prices',()=>{
  const markets=boot('market-data.js').TradingFiewMarkets;
  assert.ok(markets.instruments.length>=40);
  assert.equal(markets.get('XAUUSD').provider,'biquote');
  assert.equal(markets.get('BTCUSDT').provider,'binance');
  assert.equal(markets.get('__unknown__'),null);
});
test('OHLC rejects impossible candles and keeps newest duplicate',()=>{
  const m=boot('market-data.js').TradingFiewMarkets;
  const t=Math.floor(Date.now()/300000)*300;
  const rows=[
    [t*1000,'100','101','99','100.5','20'],
    [t*1000,'100','102','99','101','21'],
    [(t+300)*1000,'100','99','101','100','1'],
    [(t+600)*1000,'100','103','99','104','4'],
    [(t+900)*1000,'100','104','99','102','5']
  ];
  const actual=m.normalize(rows,'binance');
  assert.equal(actual.length,2);
  assert.equal(actual[0].close,101);
  assert.equal(actual[0].volume,21);
  assert.equal(actual[1].close,102);
});
test('indicative feed rejects invalid records and retains valid tick volume',()=>{
  const m=boot('market-data.js').TradingFiewMarkets;
  const now=Math.floor(Date.now()/300000)*300;
  const rows=[
    {openTime:new Date(now*1000).toISOString(),open:2,high:3,low:1,close:2.5,volume:-10,tickVolume:8,isOpen:false},
    {openTime:'unparseable',open:2,high:3,low:1,close:2,volume:1}
  ];
  const result=m.normalize(rows,'biquote');
  assert.equal(result.length,1);
  assert.equal(result[0].volume,8);
  assert.equal(result[0].isOpen,false);
});
test('confirmed bars do not lose final valid candle on a delayed feed',()=>{
  const m=boot('market-data.js').TradingFiewMarkets;
  const rows=[{time:100},{time:400},{time:700}];
  assert.equal(m.completedBars(rows,'5m','binance',810).length,2);
  assert.equal(m.completedBars(rows,'5m','binance',1300).length,3);
  const indicative=[{time:100,isOpen:false},{time:400,isOpen:true}];
  assert.equal(m.completedBars(indicative,'5m','biquote',810).length,1);
  assert.equal(m.completedBars(rows,'unsupported','binance',1300).length,0);
});
test('SMC analysis returns finite ATR, RSI and deterministic confirmed-bar results',()=>{
  const engine=boot('analysis.js').SmcEngine;
  const bars=Array.from({length:260},(_,i)=>{
    const close=100+i*0.08+Math.sin(i/9)*0.7,open=close-0.07;
    return {time:1700000000+i*300,open,high:close+0.6,low:open-0.6,close,volume:120};
  });
  const result=engine.calculate(bars);
  assert.equal(result.dataCount,bars.length);
  assert.ok(Number.isFinite(result.atr)&&result.atr>0);
  assert.ok(Number.isFinite(result.rsi)&&result.rsi>=0&&result.rsi<=100);
  assert.equal(result.ema20.at(-1).time,bars.at(-1).time);
  assert.equal(engine.calculate(bars).direction,result.direction);
});
function simulateAds({mobile=true,approved=false,consent=false,vignette=false}={}){
  let js=source('adsense.js');
  js=js.replace('siteReady:false','siteReady:'+approved)
       .replace('cmpReady:false','cmpReady:'+consent)
       .replace('mobileVignetteOnlyConfirmed:false','mobileVignetteOnlyConfirmed:'+vignette);
  let scripts=0,units=0,hidden=0,cleared=0;
  const placement={
    dataset:{adPlacement:'banner'},
    setAttribute(key){if(key==='hidden')hidden++;},
    classList:{remove(){},add(){}},replaceChildren(){cleared++;},appendChild(){}
  };
  const doc={
    readyState:'complete',referrer:mobile?'android-app://com.ribhlab.tradingfiew':'',
    querySelectorAll(){return [placement];},
    createElement(tag){
      if(tag==='ins')units++;
      return {style:{},classList:{add(){},remove(){}},setAttribute(){},addEventListener(){},appendChild(){}};
    },
    head:{appendChild(){scripts++;}}
  };
  const root={matchMedia:()=>({matches:mobile})};
  const sandbox={window:root,document:doc,
    navigator:{userAgent:mobile?'Android Chrome':'Desktop Chrome'},
    console,Date,setTimeout,clearTimeout};
  vm.runInNewContext(js,sandbox,{filename:'adsense.js'});
  return {scripts,units,hidden,cleared};
}
test('mobile never loads ad script without site approval and vignette-only verification',()=>{
  const state=simulateAds({mobile:true,approved:true,consent:true,vignette:false});
  assert.equal(state.scripts,0);
  assert.equal(state.units,0);
  assert.equal(state.hidden,1);
  assert.equal(state.cleared,1);
});
test('even with vignette allowed, mobile NEVER injects an inline banner or anchor',()=>{
  const state=simulateAds({mobile:true,approved:true,consent:true,vignette:true});
  assert.equal(state.scripts,1);
  assert.equal(state.units,0);
  assert.equal(state.hidden,1);
});
test('no mobile or desktop ads without approval and consent',()=>{
  assert.equal(simulateAds({mobile:true}).scripts,0);
  assert.equal(simulateAds({mobile:false}).scripts,0);
});
test('mobile calendar is a lazy-loaded modal; site has no duplicate IDs',()=>{
  const html=source('index.html'),calendar=source('us-calendar.js'),css=source('styles.css');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  assert.ok(html.includes('<dialog id="usEconomicCalendar"'));
  assert.ok(html.includes('id="usCalendarChartBtn"'));
  assert.ok(html.includes('id="chartMoreMenu"'));
  assert.ok(calendar.includes('dialog.showModal()'));
  assert.ok(css.includes('dialog.us-calendar-dialog:not([open]){display:none!important}'));
  assert.ok(!html.includes('<section class="us-economic-calendar"'));
});
test('all referenced local scripts and stylesheets exist',()=>{
  const html=source('index.html');
  for(const [,name] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:\?[^"]*)?"/g)){
    assert.ok(fs.existsSync(path.join(base,name)),name+' referenced but absent');
  }
});

test('no mobile ad slot can consume space even when a panel becomes visible',()=>{
  const css=source('styles.css');
  assert.match(css,/\.ad-placement\[hidden\][^{]*\{display:none!important/);
  assert.match(css,/@media\(max-width:730px\), \(pointer:coarse\)/);
});
test('silent live WebSockets are downgraded to REST fallback',()=>{
  const app=source('app.js');
  assert.ok(app.includes("state.streamLastMessageAt=Date.now()"));
  assert.ok(app.includes("connection('STALE FEED'"));
  assert.ok(app.includes("startPolling(request);"));
});


test('drawing UI exposes preview and all precise tools with unique modes',()=>{
  const html=source('index.html');
  const modes=[...html.matchAll(/data-draw="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(modes).size,modes.length,'duplicate drawing control');
  for(const mode of ['cursor','horizontal','alert','trend','fib','fibext','rectangle','measure','vertical'])
    assert.ok(modes.includes(mode),mode+' drawing tool missing');
  for(const id of ['drawingOverlay','drawingShapes','drawingLive'])
    assert.ok(html.includes('id="'+id+'"'),id+' missing');
});
test('Fibonacci retracement and extensions contain exact standard ratios',()=>{
  const js=source('app.js');
  const levels=name=>{
    const hit=js.match(new RegExp('const '+name+'=\\[([^\\]]+)\\]'));
    assert.ok(hit,name+' not declared');
    return hit[1].split(',').map(Number);
  };
  const retrace=levels('FIB_RETRACE'),extension=levels('FIB_EXTEND');
  for(const val of [0,.236,.382,.5,.618,.786,1])assert.ok(retrace.includes(val),'retracement missing '+val);
  for(const val of [1,1.272,1.618,2,2.618])assert.ok(extension.includes(val),'extension missing '+val);
  assert.ok(retrace.every((n,i)=>i===0||n>retrace[i-1]));
  assert.ok(extension.every((n,i)=>i===0||n>extension[i-1]));
});
test('drawing gestures preview through pointer capture and persist edited objects',()=>{
  const js=source('app.js'),html=source('index.html'),css=source('styles.css');
  assert.ok(js.includes('function installPrecisionDraw()'));
  assert.ok(js.includes('host.setPointerCapture(e.pointerId)'));
  assert.ok(js.includes('function drawingPreviewMarkup('));
  assert.ok(js.includes('scheduleDrawingOverlay()'));
  assert.ok(js.includes("if(d.kind==='shape')return {kind:'shape'"));
  assert.ok(js.includes("entry.kind==='shape'"));
  assert.ok(js.includes("item.kind==='shape'"));
  assert.ok(html.includes('data-draw="fibext"'));
  assert.ok(css.includes('.chart-host.chart-drawing-active'));
});


test('fib retracement 0 at B and 100 at A; reverse direction is deterministic',()=>{
  const g=boot('drawing-geometry.js').TradingFiewDrawingGeometry;
  const anchors=[{time:1,price:120},{time:2,price:100}];
  assert.equal(g.fibPrice('fib',anchors,0),100);
  assert.equal(g.fibPrice('fib',anchors,1),120);
  assert.equal(g.fibPrice('fib',anchors,.618),112.36);
  assert.equal(g.fibPrice('fib',anchors,0,true),120);
  assert.equal(g.fibPrice('fib',anchors,1,true),100);
});
test('trend-based fib extension is C + ratio*(B-A), not old two-point extrapolation',()=>{
  const g=boot('drawing-geometry.js').TradingFiewDrawingGeometry;
  const anchors=[{time:1,price:100},{time:2,price:150},{time:3,price:130}];
  assert.equal(g.fibPrice('fibext',anchors,0),130);
  assert.equal(g.fibPrice('fibext',anchors,1),180);
  assert.ok(Math.abs(g.fibPrice('fibext',anchors,1.618)-210.9)<1e-9);
  assert.ok(Math.abs(g.fibPrice('fibext',anchors,1.618,true)-49.1)<1e-9);
  assert.equal(g.fibPrice('fibext',anchors.slice(0,2),1.618),null);
  assert.equal(g.fibPrice('fibext',anchors,1.618).toFixed(1),'210.9');
});
test('parallel channel uses third price anchor as exact offset over baseline',()=>{
  const g=boot('drawing-geometry.js').TradingFiewDrawingGeometry;
  const anchors=[{time:100,price:100},{time:200,price:120},{time:300,price:125}];
  const idx=new Map([[100,0],[200,10],[300,20]]);
  const channel=g.channel(anchors,time=>idx.get(time));
  assert.ok(channel);
  assert.equal(channel.offset,-15);
  assert.equal(channel.upper[0].price,85);
  assert.equal(channel.upper[1].price,105);
  assert.equal(channel.upper[1].price-channel.upper[0].price,
    anchors[1].price-anchors[0].price);
  assert.equal(g.channel(anchors.slice(0,2),time=>idx.get(time)),null);
});
test('channel and Fibonacci toolbars contain functioning interactive controls',()=>{
  const html=source('index.html'),js=source('app.js');
  for(const id of ['drawingOptionsBar','drawingStyleColor','drawingStyleWidth','drawingStyleDash',
    'drawingReverseBtn','drawingExtendBtn','drawingVisibilityBtn','drawingLockBtn',
    'drawingDeleteBtn','drawingDeselectBtn','drawingRepairBtn']){
    assert.ok(html.includes('id="'+id+'"'),id);
  }
  assert.ok(html.includes('data-draw="channel"'));
  assert.ok(html.includes('./drawing-geometry.js'));
  assert.ok(js.includes("function installDrawingOptionsBar()"));
  assert.ok(js.includes("function syncDrawingOptionsBar(d)"));
  assert.ok(js.includes("const staged=drawSequence;"));
  assert.ok(js.includes("mode==='channel'||mode==='fibchannel'||mode==='fibext'"));
  assert.ok(js.includes("Geometry.fibPrice("));
  assert.ok(js.includes("Geometry.channel("));
});


test('legacy two-point fib extensions are preserved, marked and never rendered as valid levels',()=>{
  const js=source('app.js'),html=source('index.html');
  assert.ok(js.includes("invalidOldExtension=renderer==='legacy'&&mode==='fibext'"));
  assert.ok(js.includes("if(invalidOldExtension)style.hidden=true"));
  assert.ok(js.includes("!invalidOldExtension?candles.createPriceLine"));
  assert.ok(js.includes("legacyWrong:invalidOldExtension"));
  assert.ok(html.includes('id="drawingRepairBtn"'));
  assert.ok(js.includes("setDrawMode('fibext')"));
});
test('drawing style options persist without covering the chart',()=>{
  const js=source('app.js'),css=source('styles.css');
  assert.ok(js.includes('function safeStyle('));
  for(const v of ["st.color=e.target.value","st.width=Number(e.target.value)",
    "st.dash=e.target.value","st.reverse=!st.reverse","st.extend=!st.extend",
    "st.hidden=!st.hidden","st.locked=!st.locked"]){
      assert.ok(js.includes(v),'style action '+v);
  }
  assert.ok(css.includes('.drawing-options-bar{'));
  assert.ok(css.includes('overflow-x:auto'));
  assert.ok(css.includes('.selected-drawing-bar{display:none!important}'));
});


test('local-time price schedules reject invalid dates and past one-shot deliveries',()=>{
  const clock=boot('price-schedule-core.js').TradingFiewPriceScheduleCore;
  const now=new Date(2026,10,18,12,0,0,0).getTime();
  assert.equal(clock.build('once','11:00','2026-11-18',now),null);
  assert.equal(clock.build('once','09:00','2026-02-30',now),null);
  assert.equal(clock.build('once','25:00','2026-12-18',now),null);
  const future=clock.build('once','13:15','2026-11-18',now);
  assert.ok(future);
  assert.equal(new Date(future.nextAt).getHours(),13);
  assert.equal(new Date(future.nextAt).getMinutes(),15);
});
test('recurring local-time schedules respect daily, weekdays and 15-minute increments',()=>{
  const clock=boot('price-schedule-core.js').TradingFiewPriceScheduleCore;
  const friday=new Date(2026,10,20,16,30,0).getTime();
  const weekdays=clock.build('weekdays','09:30','',friday);
  assert.equal(new Date(weekdays.nextAt).getDay(),1);
  assert.equal(new Date(weekdays.nextAt).getHours(),9);
  assert.equal(new Date(weekdays.nextAt).getMinutes(),30);
  const daily=clock.build('daily','17:10','',friday);
  assert.equal(new Date(daily.nextAt).getHours(),17);
  const cycle=clock.build('every15','16:45','',friday);
  assert.equal(new Date(cycle.nextAt).getMinutes(),45);
  assert.equal(clock.nextAt(cycle,cycle.nextAt).valueOf(),cycle.nextAt+15*60000);
});
test('scheduled prices only use a fresh verified market quote',()=>{
  const clock=boot('price-schedule-core.js').TradingFiewPriceScheduleCore;
  const now=Date.now(),valid={price:27253.94,quoteAt:now/1000,stale:false,marketState:'open'};
  assert.equal(clock.marketIsFresh(valid,now),true);
  assert.equal(clock.marketIsFresh({...valid,stale:true},now),false);
  assert.equal(clock.marketIsFresh({...valid,marketState:'closed'},now),false);
  assert.equal(clock.marketIsFresh({...valid,price:0},now),false);
  assert.equal(clock.marketIsFresh({...valid,quoteAt:(now-3*60000)/1000},now),false);
  assert.equal(clock.marketIsFresh({...valid,quoteAt:null},now),false);
});
test('scheduled price notice UI is connected to available market feeds and mobile menu',()=>{
  const html=source('index.html'),client=source('scheduled-prices.js');
  for(const id of ['scheduledPricePanel','scheduledPriceForm','scheduledSymbol','scheduledFrequency',
    'scheduledTime','scheduledDate','scheduledPriceList','scheduledAllowBtn','scheduledTestBtn',
    'schedulePriceChartBtn','scheduledPermissionStatus']){
    assert.ok(html.includes('id="'+id+'"'),id+' not present');
  }
  assert.ok(html.includes('./price-schedule-core.js'));
  assert.ok(html.includes('./scheduled-prices.js'));
  assert.ok(html.includes('data-more-chart-action="schedulePriceChartBtn"'));
  assert.ok(client.includes('Market.quote('));
  assert.ok(client.includes('Clock.marketIsFresh('));
  assert.ok(client.includes('reg.showNotification('));
  assert.ok(client.includes('root.setInterval(()=>void checkNow(),10000)'));
  assert.ok(client.includes('300000'));
});


test('Fibonacci Channel uses parallel price ratios; Time Zone uses candle intervals',()=>{
  const g=boot('drawing-geometry.js').TradingFiewDrawingGeometry;
  const points=[{time:100,price:100},{time:110,price:120},{time:120,price:125}];
  const indices=new Map([[100,0],[110,10],[120,20]]);
  const values=g.channelLevels(points,time=>indices.get(time));
  assert.ok(values.length>=9);
  const zero=values.find(x=>x.fraction===0),one=values.find(x=>x.fraction===1);
  assert.equal(zero.points[0].price,100);
  assert.equal(one.points[0].price,85);
  assert.equal(one.points[1].price,105);
  assert.equal(one.points[1].price-one.points[0].price,20);
  const zones=g.fibTimeZones(100,110);
  assert.equal(zones.find(x=>x.fraction===13).index,230);
  assert.equal(zones.find(x=>x.fraction===21).index,310);
  assert.ok(zones.every((x,i)=>i===0||x.index>zones[i-1].index));
});
test('all four Fibonacci tools are present, persisted and selectable from their geometry',()=>{
  const html=source('index.html'),js=source('app.js');
  for(const mode of ['fib','fibext','fibchannel','fibtime']){
    assert.ok(html.includes('data-draw="'+mode+'"'),mode);
    assert.ok(js.includes("'"+mode+"'"),mode+' not registered');
  }
  assert.ok(js.includes("function fibChannelMarkup("));
  assert.ok(js.includes("function fibTimeMarkup("));
  assert.ok(js.includes("d.shape==='fibchannel'"));
  assert.ok(js.includes("d.shape==='fibtime'"));
  assert.ok(js.includes("Geometry.channelLevels("));
  assert.ok(js.includes("Geometry.fibTimeZones("));
});


test('mobile drawing editor fits every visible editing control without scroll-only actions',()=>{
  const css=source('styles.css');
  const html=source('index.html');
  assert.ok(css.includes('2026-11 mobile drawing editor audit'));
  assert.ok(css.includes('grid-template-columns:repeat(6,minmax(0,1fr))'));
  assert.ok(css.includes('grid-column:span 2'));
  assert.ok(css.includes('overflow-x:clip!important'));
  assert.ok(css.includes('scrollbar-width:thin!important'));
  assert.ok(html.includes('styles.css?v=20261118-mobile-compact4'));
  for(const id of ['drawingStyleColor','drawingStyleWidth','drawingStyleDash',
    'drawingReverseBtn','drawingExtendBtn','drawingVisibilityBtn',
    'drawingLockBtn','drawingDeleteBtn','drawingDeselectBtn']){
      assert.ok(html.includes('id="'+id+'"'));
  }
});


test('short mobile screens keep a usable chart and landscape phones avoid desktop sidebars',()=>{
 const css=source('styles.css');
 assert.ok(css.includes('display:none!important;')&&css.includes('.terminal-rangebar'));
 assert.ok(css.includes('body.terminal-mode .workspace[data-analysis-panel="collapsed"]'));
 assert.ok(css.includes('Rotated small phones need a full-width chart'));
 assert.ok(css.includes('body.terminal-mode .center-pane .instrument-header{display:none!important}'));
});


test('rotated phones preserve chart layout and expose functional mobile dock navigation',()=>{
 const html=source('index.html'),css=source('styles.css'),ui=source('terminal-ui.js');
 assert.ok(html.includes('terminal-ui.js?v=20261118-landscape-navigation1'));
 assert.ok(ui.includes('(orientation:landscape) and (max-height:550px)'));
 assert.ok(css.includes('Compact landscape smartphones: one full-width terminal'));
 assert.ok(css.includes('grid-template-columns:repeat(12,minmax(0,1fr))'));
 assert.ok(css.includes('workspace[data-mobile-view="markets"] .left-sidebar'));
 assert.ok(css.includes('workspace[data-mobile-view="analysis"] .right-sidebar'));
 assert.ok(css.includes('terminal-mobile-dock{'));
});


test('mobile drawing toolbar uses compact two-row controls and stays visible',()=>{
 const css=source('styles.css'),html=source('index.html');
 assert.ok(css.includes('Compact mobile drawing controls: two edit rows'));
 assert.ok(css.includes('grid-template-columns:repeat(15,minmax(0,1fr))'));
 assert.ok(css.includes('grid-row:3;grid-column:span 3'));
 assert.ok(css.includes('height:30px!important'));
 assert.ok(css.includes('width:28px!important'));
 assert.ok(html.includes('styles.css?v=20261118-mobile-compact4'));
});


test('public privacy policy covers all supported languages and Android permissions',()=>{
  const html=source('privacy.html');
  const manifest=source('android/app/src/main/AndroidManifest.xml');
  const ads=source('adsense.js');
  assert.ok(html.includes('rel="canonical" href="https://tradingfiew.github.io/privacy.html"'));
  for(const id of ['english','francais','arabic'])assert.ok(html.includes('id="'+id+'"'));
  assert.ok(html.includes('com.ribhlab.tradingfiew'));
  for(const word of ['Binance','biquote','TradingView','GitHub Pages','POST_NOTIFICATIONS',
                       'My Space','mailto:rachid022note7@gmail.com'])assert.ok(html.includes(word),word);
  assert.ok(manifest.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(manifest.includes('android.permission.INTERNET'));
  assert.ok(ads.includes('siteReady:false'));
  assert.ok(ads.includes('mobileVignetteOnlyConfirmed:false'));
  assert.ok(html.indexOf('adsbygoogle.js')===-1);
});
