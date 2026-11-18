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
  for(const file of ['analysis.js','market-data.js','market-panels.js','app.js','alerts.js',
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
  assert.ok(js.includes("else if(entry.kind==='shape'"));
  assert.ok(js.includes("item.kind==='shape'"));
  assert.ok(html.includes('data-draw="fibext"'));
  assert.ok(css.includes('.chart-host.chart-drawing-active'));
});
