/* TradingFiew anonymous browser workspace.
 * No password, no account, no remote data upload.
 * localStorage is per-origin + browser profile. It does NOT secure two people
 * who use the same browser profile or sync between separate devices.
 * Do not store credentials, personal financial info or secrets here.
 */
(function(root){
"use strict";
const ROOT="tradingfiew:browser-space:v1";
const PREFIX="tradingfiew:workspace:v1:";
const memory=new Map();
let persistent=true;
let storage;
try{
  storage=root.localStorage;
  const probe=PREFIX+"probe";
  storage.setItem(probe,"1");
  storage.removeItem(probe);
}catch(_){persistent=false;storage=null;}
const getRaw=k=>{
  try{return persistent?storage.getItem(k):(memory.has(k)?memory.get(k):null);}
  catch(_){persistent=false;return memory.has(k)?memory.get(k):null;}
};
const setRaw=(k,v)=>{
  try{
    if(persistent)storage.setItem(k,v);
    else memory.set(k,v);
    return persistent;
  }catch(_){persistent=false;memory.set(k,v);return false;}
};
const removeRaw=k=>{
  try{if(persistent)storage.removeItem(k);else memory.delete(k);}
  catch(_){memory.delete(k);}
};
function id(){
  if(root.crypto?.randomUUID)return root.crypto.randomUUID();
  if(root.crypto?.getRandomValues){
    const arr=new Uint32Array(4);root.crypto.getRandomValues(arr);
    return Array.from(arr,x=>x.toString(16).padStart(8,"0")).join("-");
  }
  return "local-"+Math.random().toString(36).slice(2)+Date.now().toString(36);
}
let browserId=getRaw(ROOT);
if(!browserId||!/^[a-z0-9-]{14,100}$/i.test(browserId)){
  browserId=id();setRaw(ROOT,browserId);
}
function key(name){
  if(!/^[a-z0-9:_-]{1,130}$/i.test(name))throw Error("Invalid workspace setting key");
  return PREFIX+browserId+":"+name;
}
function get(name){return getRaw(key(name));}
function set(name,value){return setRaw(key(name),String(value));}
function getJSON(name,fallback){
  try{const v=get(name);return v===null?fallback:JSON.parse(v);}
  catch(_){return fallback;}
}
function setJSON(name,value){return set(name,JSON.stringify(value));}
function remove(name){removeRaw(key(name));}
function clearBrowser(){
  // Explicit destructive action. Erase every TradingFiew local workspace
  // on the current browser profile to make subsequent device reuse clean.
  if(persistent){
    try{
      const keys=[];
      for(let i=0;i<storage.length;i++){
        const k=storage.key(i);
        if(k&&(k.startsWith(PREFIX)||k.startsWith("smct_")||k===ROOT))keys.push(k);
      }
      keys.forEach(k=>storage.removeItem(k));
    }catch(_){persistent=false;}
  }
  for(const k of [...memory.keys()]){
    if(k.startsWith(PREFIX)||k.startsWith("smct_")||k===ROOT)memory.delete(k);
  }
  browserId=id();setRaw(ROOT,browserId);
}
function info(){return {id:browserId,persistent,localOnly:true};}
// One-time migration of the old browser-specific theme/favorites, not global
// across users or devices. This avoids silently discarding existing choices.
for(const old of ["theme","favorites"]){
  const oldKey="smct_"+old,oldValue=getRaw(oldKey);
  if(oldValue!==null&&get(old)===null)set(old,oldValue);
  if(oldValue!==null)removeRaw(oldKey);
}
root.TradingFiewWorkspace=Object.freeze({get,set,getJSON,setJSON,remove,clearBrowser,info});
})(window);
