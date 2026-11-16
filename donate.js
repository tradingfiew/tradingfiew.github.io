/* TradingFiew voluntary cryptocurrency donations.
 * Maintainer: configure ONLY verified receiving addresses that YOU control.
 * No addresses are shipped by default; a false or incorrect wallet could
 * irreversibly divert donations. BTC and token networks must not be mixed.
 */
(function(){
  "use strict";
  const CONFIG = Object.freeze({
    BTC: {label:"Bitcoin · BTC",chain:"Bitcoin mainnet",address:""},
    ETH: {label:"Ethereum · ETH",chain:"Ethereum mainnet",address:""},
    USDT_TRC20: {label:"Tether · USDT",chain:"Tron TRC-20",address:"TBZuH1prYTYh8btnWEW9Der1KwpmGVq4yw"},
    USDT_ERC20: {label:"Tether · USDT",chain:"Ethereum ERC-20",address:""}
  });
  const $=id=>document.getElementById(id);
  let network="USDT_TRC20",lastTrigger=null;
  function validAddress(asset,address){
    const value=String(address||"").trim();
    if(!value||/[ \t\r\n]/.test(value))return false;
    switch(asset){
      case "BTC": return /^(bc1[ac-hj-np-z02-9]{25,89}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value);
      case "ETH":
      case "USDT_ERC20":return /^0x[0-9a-fA-F]{40}$/.test(value);
      case "USDT_TRC20":return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
      default:return false;
    }
  }
  function render(){
    const conf=CONFIG[network],ready=validAddress(network,conf.address);
    $("donateChain").textContent=conf.chain+" · "+conf.label;
    $("donateAvailability").textContent=ready?"Wallet available":"Wallet not configured";
    $("donateAvailability").classList.toggle("is-ready",ready);
    $("donateAddress").textContent=ready?conf.address.trim():"Donation wallet not configured yet";
    $("donateAddress").classList.toggle("is-ready",ready);
    $("copyDonateBtn").disabled=!ready;
    $("copyDonateBtn").textContent=ready?"Copy "+conf.label+" address":"Copy wallet address";
    document.querySelectorAll("[data-donate-network]").forEach(button=>{
      const selected=button.dataset.donateNetwork===network;
      button.classList.toggle("active",selected);
      button.setAttribute("aria-pressed",selected?"true":"false");
    });
  }
  function open(e){
    const modal=$("donateModal");
    if(!modal)return;
    lastTrigger=e?.currentTarget||$("donateBtn");
    modal.classList.remove("hidden");
    render();
    $("donateCloseBtn").focus();
    document.body.classList.add("donate-open");
  }
  function close(){
    $("donateModal").classList.add("hidden");
    document.body.classList.remove("donate-open");
    if(lastTrigger&&typeof lastTrigger.focus==="function")lastTrigger.focus();
  }
  async function copy(){
    const address=CONFIG[network].address.trim();
    if(!validAddress(network,address))return;
    const btn=$("copyDonateBtn");
    try{
      if(!navigator.clipboard||!navigator.clipboard.writeText)throw Error("Clipboard unavailable");
      await navigator.clipboard.writeText(address);
      btn.textContent="Copied — check the correct network ✓";
    }catch{
      btn.textContent="Select and copy the wallet address above";
      $("donateAddress").focus?.();
    }
  }
  function initialize(){
    const modal=$("donateModal");
    if(!modal)return;
    $("donateBtn")?.addEventListener("click",open);
    $("sideDonateBtn")?.addEventListener("click",open);
    $("donateCloseBtn")?.addEventListener("click",close);
    $("donateDoneBtn")?.addEventListener("click",close);
    $("copyDonateBtn")?.addEventListener("click",copy);
    $("donateNetworks")?.addEventListener("click",e=>{
      const button=e.target.closest("[data-donate-network]");
      if(button&&CONFIG[button.dataset.donateNetwork]){
        network=button.dataset.donateNetwork;
        render();
      }
    });
    modal.addEventListener("click",e=>{if(e.target===modal)close();});
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&!modal.classList.contains("hidden")){e.preventDefault();close();}
      if(e.key==="Tab"&&!modal.classList.contains("hidden")){
        const controls=[...modal.querySelectorAll("button:not([disabled])")];
        if(!controls.length)return;
        if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus();}
        else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}
      }
    });
    render();
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize);
  else initialize();
  window.TradingFiewDonation={validAddress,networks:Object.keys(CONFIG)};
})();