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

  /* Public recognition is opt-in, NEVER inferred from on-chain addresses.
   * Static GitHub Pages has no secure payment verification or anonymous write API.
   * After the donor explicitly requests credit, the owner must manually confirm
   * the donation and publish only the chosen name in supporters.json. */
  async function loadSupporters(){
    const targets=[$("supportersList"),$("supportersPublicList")].filter(Boolean);
    if(!targets.length)return;
    let names=[];
    try{
      const response=await fetch("./supporters.json",{cache:"no-store"});
      if(!response.ok)throw Error("Supporter records unavailable");
      const data=await response.json();
      if(!Array.isArray(data.supporters))throw Error("Invalid supporter list");
      names=data.supporters.filter(p=>
        p&&p.approved===true&&p.consent===true&&typeof p.name==="string"&&
        p.name.trim().length>=1&&p.name.length<=42).slice(0,150);
    }catch(error){console.warn("Supporter credits could not load",error);}
    for(const list of targets){
      list.replaceChildren();
      if(!names.length){
        const empty=document.createElement("span");empty.className="supporters-empty";
        empty.textContent="No publicly credited supporters yet · Anonymous donations are welcome";
        list.appendChild(empty);
      }else for(const item of names){
        const tag=document.createElement("span");tag.className="supporter-name";
        tag.textContent=item.name.trim();list.appendChild(tag);
      }
    }
  }
  function updateSupporterOptIn(){
    const allowed=$("supporterNameOptIn").checked;
    $("supporterForm").hidden=!allowed;
    if(!allowed){
      $("supporterDisplayName").value="";
      $("supporterFormStatus").textContent="";
    }
  }
  function requestPublicCredit(){
    const checkbox=$("supporterNameOptIn"),name=$("supporterDisplayName").value.trim();
    const status=$("supporterFormStatus");
    if(!checkbox.checked){status.textContent="Consent must be selected first.";return;}
    if(name.length<2||name.length>42||/[\r\n<>]/.test(name)){
      status.textContent="Enter a public display name of 2–42 characters.";return;
    }
    const networkLabel=CONFIG[network]?.chain||"Not specified";
    // No wallet address, amount or transaction history is exposed here.
    const title="Optional TradingFiew supporter credit: "+name;
    const body=[
      "I donated to support TradingFiew and voluntarily request public credit.",
      "",
      "Chosen public display name: "+name,
      "Donation network: "+networkLabel,
      "",
      "[x] I explicitly agree to publishing ONLY the chosen display name on TradingFiew's public supporters list.",
      "[x] I understand the request itself is a public GitHub issue associated with my GitHub account.",
      "[x] I understand my request is not automatically accepted; the project owner must verify the donation before publishing any credit.",
      "",
      "Do not post wallet recovery phrases, private keys or sensitive personal information."
    ].join("\n");
    const url="https://github.com/tradingfiew/tradingfiew.github.io/issues/new?title="+encodeURIComponent(title)+"&body="+encodeURIComponent(body);
    // Do not claim submission without the visitor completing the external form.
    status.textContent="A new GitHub page will open; review and submit your optional request there. Your name is not publicly listed yet.";
    const tab=window.open(url,"_blank","noopener,noreferrer");
    if(!tab)status.textContent="Your browser blocked the new page. Open the GitHub Issues link in another tab to submit your request.";
  }
  function initialize(){
    const modal=$("donateModal");
    if(!modal)return;
    $("donateBtn")?.addEventListener("click",open);
    $("supportersPublicDonate")?.addEventListener("click",open);
    $("sideDonateBtn")?.addEventListener("click",open);
    $("donateCloseBtn")?.addEventListener("click",close);
    $("donateDoneBtn")?.addEventListener("click",close);
    $("copyDonateBtn")?.addEventListener("click",copy);
    $("supporterNameOptIn")?.addEventListener("change",updateSupporterOptIn);
    $("requestPublicCreditBtn")?.addEventListener("click",requestPublicCredit);
    void loadSupporters();
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