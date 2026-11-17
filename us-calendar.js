/* Official TradingView economic calendar with the US filter.
 * The provider controls live releases and their timing; no fake Actual values. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
let lastTheme='',pending=false;
function render(){
  const host=$('usEconomicWidget');
  if(!host||pending)return;
  pending=true;
  const theme=document.body.classList.contains('light')?'light':'dark';
  lastTheme=theme;
  host.replaceChildren();
  const wrap=document.createElement('div');
  wrap.className='tradingview-widget-container';
  const slot=document.createElement('div');
  slot.className='tradingview-widget-container__widget';
  wrap.appendChild(slot);host.appendChild(wrap);
  const script=document.createElement('script');
  script.async=true;
  script.src='https://s3.tradingview.com/external-embedding/embed-widget-events.js';
  script.textContent=JSON.stringify({colorTheme:theme,isTransparent:false,locale:'en',countryFilter:'us',importanceFilter:'-1,0,1',width:'100%',height:510});
  script.onload=()=>{pending=false;};
  script.onerror=()=>{pending=false;host.insertAdjacentText('beforeend','Economic calendar is unavailable. Follow the TradingView link above to see releases.');};
  wrap.appendChild(script);
  const status=$('usCalendarUpdated');
  if(status)status.textContent='Refreshed '+new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
}
function start(){
 $('refreshUsCalendar')?.addEventListener('click',render);
 render();
 setInterval(()=>{if(!document.hidden)render();},180000);
 $('themeBtn')?.addEventListener('click',()=>requestAnimationFrame(()=>{
   if((document.body.classList.contains('light')?'light':'dark')!==lastTheme)render();
 }));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();