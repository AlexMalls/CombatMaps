// Temporary shared annotations. Independent of project persistence and device camera.
(function(root){
 'use strict';
 const LEASE=90000,HEARTBEAT=60000,INTERVAL=1000;
 function point(p,size=false){if(!p||!Number.isInteger(p.col)||!Number.isInteger(p.row)||Math.abs(p.col)>1e6||Math.abs(p.row)>1e6)throw Error('Coordenadas da demonstração inválidas.');const result={col:p.col,row:p.row};if(size){if(!Number.isInteger(p.size)||p.size<1||p.size>10)throw Error('Tamanho da demonstração inválido.');result.size=p.size}return result;}
 function normalize(value){
  if(!value)return null;
  if(typeof value.sceneId!=='string'||!value.sceneId||value.sceneId.length>160)throw Error('Cena da demonstração inválida.');
  if(!Array.isArray(value.cells)||value.cells.length>65536||!Array.isArray(value.moves)||value.moves.length>500)throw Error('Demonstração excede o limite de marcações.');
  const cells=value.cells.map(([col,row])=>{point({col,row});return [col,row]}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const ruler=value.ruler?{start:point(value.ruler.start),end:point(value.ruler.end)}:null;
  let preview=null;if(value.preview){const p=value.preview;if(!['path','line','circle','square','cone'].includes(p.shape))throw Error('Forma inválida.');preview={shape:p.shape,start:point(p.start),end:point(p.end),erase:!!p.erase};}
  const moves=value.moves.map(m=>{if(typeof m.id!=='string'||m.id.length>160||!Number.isInteger(m.number)||m.number<1||m.number>500)throw Error('Movimento inválido.');return {id:m.id,number:m.number,from:point(m.from,true),to:point(m.to,true)}}).sort((a,b)=>a.id.localeCompare(b.id));
  return cells.length||ruler||preview||moves.length?{sceneId:value.sceneId,cells,preview,ruler,moves}:null;
 }
 function merge(state,id,value,now=Date.now()){
  const result={};for(const [key,entry] of Object.entries(state||{})){if(key===id||!Number.isFinite(entry?.expiresAt)||entry.expiresAt<=now)continue;try{const clean=normalize(entry);if(clean)result[key]={...clean,expiresAt:entry.expiresAt}}catch{}}
  const clean=normalize(value);if(clean)result[id]={...clean,expiresAt:now+LEASE};
  if(new TextEncoder().encode(JSON.stringify(result)).length>350000)throw Error('Muitas demonstrações simultâneas. Limpe algumas marcações.');return result;
 }
 function visible(state,sceneId,self,now=Date.now()) {return Object.entries(state||{}).flatMap(([id,value])=>{if(id===self||value.sceneId!==sceneId||value.expiresAt<=now)return [];try{const clean=normalize(value);return clean?[{id,...clean}]:[]}catch{return []}});}
 async function serverClock({fetchTime=()=>fetch(location.pathname+'?demonstration-clock='+crypto.randomUUID(),{method:'HEAD',cache:'no-store'}),elapsed=()=>performance.now()}={}){
  const before=elapsed(),response=await fetchTime(),after=elapsed();
  const date=Date.parse(response.headers.get('date')),age=Number(response.headers.get('age')||0);
  if(!response.ok||!Number.isFinite(date)||!Number.isFinite(age))throw Error('Não foi possível conferir o horário do servidor. Recarregue a página.');
  const anchor=date+age*1000+(after-before)/2;return()=>anchor+elapsed()-after;
 }
 function start({store,snapshot,render,onError=()=>{},id=crypto.randomUUID(),clock=Date.now,setTimer=setInterval,clearTimer=clearInterval}){
  let remote={},sent='null',last=0,busy=false,stopped=false,retryAt=0,failures=0,paused=false;
  const stopWatch=store.watchDemonstrations(state=>{remote=state;render(remote,id,clock())},onError);
  async function tick(){
   if(stopped)return;render(remote,id,clock());if(busy||paused||clock()<retryAt||root.navigator?.onLine===false)return;
   let value,text;try{value=normalize(snapshot());text=JSON.stringify(value)}catch(error){onError(error);return}
   const now=clock();if(now-last<INTERVAL||(text===sent&&(!value||now-last<HEARTBEAT)))return;
   busy=true;last=now;try{await store.saveDemonstration(id,value,now);sent=text;failures=0;retryAt=0;onError(null)}catch(error){failures++;retryAt=now+Math.min(30000,1000*2**failures);paused=['permission-denied','resource-exhausted','failed-precondition'].some(code=>String(error.code||'').endsWith(code));onError(error)}finally{busy=false}
  }
  const timer=setTimer(tick,250),online=()=>{paused=false;retryAt=0;tick()};root.addEventListener?.('online',online);
  return {tick,stop(){stopped=true;clearTimer(timer);stopWatch();root.removeEventListener?.('online',online);render({},id,clock());/* Expiry handles interrupted connections without an unreliable unload write. */}};
 }
 const api={normalize,merge,visible,start,serverClock,LEASE};if(typeof module==='object')module.exports=api;else root.SharedDemonstrations=api;
})(globalThis);
