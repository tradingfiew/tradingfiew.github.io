/* TradingFiew US economic calendar. Accessible, lazy-loaded modal:
 * - Hidden calendar never participates in flex/grid page layout.
 * - Opening is user-directed; scrolling, resizing and chart drawing remain intact.
 * - TradingView is the source of schedule, forecast and actual figures.
 */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let opener = null;
  let refreshHandle = null;
  let lastRendered = 0;
  let lastTheme = null;
  let lastSize = null;
  let resizing = null;
  const UPDATE_MS = 180000;
  const dialog = $('usEconomicCalendar');

  function isOpen() { return Boolean(dialog?.open); }
  function theme() { return document.body.classList.contains('light') ? 'light' : 'dark'; }
  function setExpanded(expanded) {
    document.querySelectorAll('.us-calendar-trigger').forEach(control => {
      control.setAttribute('aria-expanded', String(expanded));
      control.classList.toggle('active', expanded);
    });
  }
  function renderCalendar(force = false) {
    if (!isOpen()) return;
    const host = $('usEconomicWidget');
    if (!host) return;
    const mode = theme();
    const size = {
      width: Math.round(host.clientWidth),
      height: Math.max(240, Math.round(host.clientHeight))
    };
    const needsResize = lastSize && (Math.abs(lastSize.width - size.width) > 60 ||
      Math.abs(lastSize.height - size.height) > 80);
    if (!force && lastRendered && mode === lastTheme && !needsResize &&
        Date.now() - lastRendered < UPDATE_MS) return;
    lastTheme = mode;
    lastRendered = Date.now();
    lastSize = size;
    host.replaceChildren();
    const wrap = document.createElement('div');
    wrap.className = 'tradingview-widget-container';
    const slot = document.createElement('div');
    slot.className = 'tradingview-widget-container__widget';
    wrap.appendChild(slot);
    host.appendChild(wrap);
    const loader = document.createElement('script');
    loader.async = true;
    loader.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js';
    loader.textContent = JSON.stringify({
      colorTheme: mode,
      isTransparent: false,
      locale: 'en',
      countryFilter: 'us',
      importanceFilter: '-1,0,1',
      width: '100%',
      height: size.height
    });
    loader.onerror = () => {
      $('usCalendarUpdated').textContent = 'Calendar provider unavailable';
      const message = document.createElement('p');
      message.className = 'us-calendar-provider-error';
      message.textContent = 'The data provider could not load. Open TradingView using Source above.';
      host.appendChild(message);
    };
    wrap.appendChild(loader);
    const stamp = new Date().toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    $('usCalendarUpdated').textContent = 'Checked ' + stamp;
  }
  function refresh() {
    lastRendered = 0;
    renderCalendar(true);
  }
  // Only an Android TWA session can request the native user-initiated
  // interstitial transition. Ordinary web users keep the current modal.
  let nativeTwa = false;
  try {
    if (new URLSearchParams(location.search).get('native') === '1')
      sessionStorage.setItem('tradingfiew:native-twa', '1');
    nativeTwa = sessionStorage.getItem('tradingfiew:native-twa') === '1';
  } catch (error) { nativeTwa = false; }

  function open(event) {
    if (!dialog || isOpen()) return;
    opener = event?.currentTarget || document.activeElement;
    dialog.showModal();
    setExpanded(true);
    $('closeUsCalendar')?.focus({preventScroll:true});
    renderCalendar(true);
    refreshHandle = window.setInterval(() => {
      if (isOpen() && !document.hidden) renderCalendar();
    }, UPDATE_MS);
  }
  function close() {
    if (isOpen()) dialog.close();
  }
  function onClose() {
    clearInterval(refreshHandle);
    refreshHandle = null;
    setExpanded(false);
    if (opener?.isConnected && typeof opener.focus === 'function')
      opener.focus({preventScroll:true});
    opener = null;
  }
  function init() {
    if (!dialog) return;
    document.querySelectorAll('.us-calendar-trigger').forEach(el => {
      el.addEventListener('click',open);
    });
    $('closeUsCalendar')?.addEventListener('click',close);
    $('refreshUsCalendar')?.addEventListener('click',refresh);
    // The small in-app calendar always opens instantly. Only the separate
    // external FULL-calendar link can invoke a native interstitial. This is a
    // genuine user-requested transition; editing charts is never interrupted.
    if (nativeTwa) {
      const fullCalendar = dialog.querySelector('a[href^="https://www.tradingview.com/economic-calendar/"]');
      fullCalendar?.addEventListener('click', event => {
        if (!event.isTrusted) return;
        event.preventDefault();
        location.href = 'intent://open-calendar#Intent;scheme=tradingfiew;package=com.ribhlab.tradingfiew;end';
        window.setTimeout(() => {
          if (!document.hidden) location.href = 'https://www.tradingview.com/economic-calendar/';
        }, 1600);
      });
    }

    dialog.addEventListener('close',onClose);
    dialog.addEventListener('click',e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
    });
    $('themeBtn')?.addEventListener('click',() => {
      if (isOpen()) window.requestAnimationFrame(() => renderCalendar(true));
    });
    document.addEventListener('visibilitychange',() => {
      if (isOpen() && !document.hidden) renderCalendar();
    });
    if (location.hash === '#usEconomicCalendar') {
      // Returned from user-driven native calendar transition.
      history.replaceState(null, '', location.pathname + location.search);
      open();
    }
    window.addEventListener('resize',() => {
      if (!isOpen()) return;
      clearTimeout(resizing);
      resizing = setTimeout(() => renderCalendar(),240);
    }, {passive:true});
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
