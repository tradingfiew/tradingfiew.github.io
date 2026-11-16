(function(){'use strict';
const PUBLISHER='ca-pub-7945572016731367';
const SITE_READY=false; // set true only after AdSense Sites shows Ready
const CONSENT_READY=false; // requires suitable consent management (EEA/UK/CH)
if(!SITE_READY||!CONSENT_READY)return;
const s=document.createElement('script');s.async=true;s.crossOrigin='anonymous';
s.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+PUBLISHER;document.head.appendChild(s);
})();