/**
 * Produce truthful, unaltered captures of the LIVE TradingFiew interface.
 * These are Chromium Android-mobile viewport captures, not native APK emulator captures.
 * UI and quotes are never fabricated. No mock screenshots or painted price candles.
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const dir=path.resolve('publishing/screenshots/phone');
await fs.mkdir(dir,{recursive:true});
const report={created:new Date().toISOString(),source:'https://tradingfiew.github.io/',capture:'Chromium mobile emulation, 540x960 CSS pixels, deviceScaleFactor 2',viewport:'1080x1920 pixels',checks:[],screenshots:[],notes:[]};
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const context=await browser.newContext({
  viewport:{width:540,height:960},
  deviceScaleFactor:2,
  isMobile:true,
  hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  locale:'en-US',
  colorScheme:'dark',
  reducedMotion:'reduce',
  serviceWorkers:'block'
});
const page=await context.newPage();
page.on('pageerror',e=>report.notes.push('JS error: '+e.message.slice(0,200)));
async function button(selector){
  const el=page.locator(selector).first();
  if(!await el.count()) {report.checks.push({selector,success:false,reason:'not present'});return false;}
  try {
    await el.click({timeout:8000});
    report.checks.push({selector,success:true});
    await page.waitForTimeout(1000);
    return true;
  }catch(e){report.checks.push({selector,success:false,reason:String(e).slice(0,180)});return false;}
}
async function shot(filename){
  await page.screenshot({path:path.join(dir,filename),animations:'disabled',fullPage:false});
  report.screenshots.push(filename);
}
try {
  const response=await page.goto('https://tradingfiew.github.io/',{waitUntil:'domcontentloaded',timeout:65000});
  report.httpStatus=response?.status();
  await page.waitForTimeout(12000);
  report.title=await page.title();
  report.chartCanvasCount=await page.locator('canvas').count();
  report.chartWindowVisible=await page.locator('#chartWindow').isVisible();
  report.bodyText=(await page.locator('body').innerText()).slice(0,1300);
  if(!report.chartWindowVisible) throw new Error('Live chart window is not visible: refusing to produce misleading screenshots');
  if(report.httpStatus!==200) throw new Error('Live website HTTP '+report.httpStatus);
  await shot('01-real-chart.png');
  if(await button('#alertsBtn')){
    if(await page.locator('#alertsModal').isVisible()) await shot('02-real-alert-manager.png');
    await button('#alertsCloseBtn');
  }
  if(await button('#toggleMarketsBtn')){
    await button('#marketCategories button[data-category="crypto"]');
    await shot('03-real-market-watch.png');
    await button('#toggleMarketsBtn');
  }
  if(await button('#toggleAnalysisBtn')){
    await shot('04-real-smc-panel.png');
  }
  await button('#themeBtn');
  await shot('05-real-day-theme.png');
} catch(e){
  report.fatal=String(e);
} finally {
  await fs.writeFile(path.resolve('publishing/screenshots/capture-report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
if(report.fatal || report.screenshots.length<2) {
  console.error('Screenshot capture incomplete',report);
  process.exitCode=1;
} else {
  console.log('Real TradingFiew captures',report.screenshots,report.chartCanvasCount);
}
