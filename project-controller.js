(function(root){
 'use strict';
 async function start(bridge){
  const byId=id=>document.getElementById(id),message=byId('project-save-state'),auto=byId('project-autosave');
  let remote=null,ready=false,sending=false,baseline=RealtimeProject.shared(bridge.empty()),revision=0,pending=null,ack=null,replaceNext=false,saveTimer=0,lastSend=0,unsubscribe=null,stopped=false,lastError=null,failures=0,retryAfter=0,paused=false,generation=0;
  const snapshot=()=>RealtimeProject.shared(bridge.snapshot());
  const stable=()=>bridge.stable()&&(bridge.canReceive?bridge.canReceive():true);
  function report(state,error){if(error)lastError=error;else if(state==='saved')lastError=null;message.textContent=error?`Alterações não salvas. ${error.message}`:({saved:'Sincronizado com a nuvem.',pending:'Alterações pendentes.',saving:'Sincronizando…',loading:'Carregando da nuvem…'}[state]||state);}
  function loading(value){bridge.setLoading(value);for(const id of ['project-save','project-reload','project-import','project-export'])byId(id).disabled=value;}
  function apply(project){const current=snapshot();if(JSON.stringify(current)===JSON.stringify(project))return;if(bridge.update)bridge.update(project);else bridge.restore(project);}
  const sync=ProjectStore.createSync({snapshot,save:async sent=>{
   if(!remote||!ready)throw Error('Nuvem indisponível.');
   sending=true;lastSend=Date.now();const replacing=replaceNext;replaceNext=false;
   try{const result=await remote.save(sent,{base:baseline,replace:replacing});failures=0;retryAfter=0;lastError=null;ack={sent,project:RealtimeProject.shared(result?.project||sent),revision:result?.revision??remote.getRevision()};}
   catch(error){replaceNext ||= replacing;failures++;retryAfter=Date.now()+Math.min(30000,1000*2**failures);paused=['permission-denied','resource-exhausted','failed-precondition'].some(code=>String(error.code||'').endsWith(code));throw error}
   finally{sending=false;setTimeout(drain,0)}
  },onState:report});
  function receive(event){if(!event?.project||event.revision<=revision)return;if(!pending||event.revision>=pending.revision)pending={project:RealtimeProject.shared(event.project),revision:event.revision};drain();}
  function drain(){
   if(!ready||sending||!stable())return;
   try{
    let changed=false;
    if(ack){const confirmed=ack;ack=null;changed=true;apply(RealtimeProject.merge(confirmed.sent,snapshot(),confirmed.project));baseline=confirmed.project;revision=confirmed.revision;sync.accept(baseline);}
    if(pending){const event=pending;pending=null;if(event.revision>revision){changed=true;apply(RealtimeProject.merge(baseline,snapshot(),event.project));baseline=event.project;revision=event.revision;sync.accept(baseline);}}
    if(!changed)return;
    if(sync.dirty()){if(!lastError)report('pending');scheduleSave()}else report('saved');
   }catch(error){report('error',error)}
  }
  function scheduleSave(){
   if(stopped||paused||navigator.onLine===false||saveTimer||!ready||!remote||(!auto.checked&&!replaceNext)||sending)return;
   const delay=Math.max(200,750-(Date.now()-lastSend),retryAfter-Date.now());
   saveTimer=setTimeout(async()=>{saveTimer=0;if(!ready||sending||!stable())return;sync.enabled=auto.checked;await sync.flush(replaceNext);drain();},delay);
  }
  function capture(){if(!ready)return;drain();if(!bridge.stable())return;try{if(sync.dirty()){if(!lastError)report('pending');scheduleSave()}}catch(error){report('error',error)}}
  function listen(){unsubscribe?.();unsubscribe=remote.watch(receive,error=>report('error',error));}
  async function connect(){
   const mine=++generation;unsubscribe?.();unsubscribe=null;
   loading(true);report('loading');ready=false;paused=false;lastError=null;
   try{
    const connection=await FirebaseProject.create();if(mine!==generation)return;
    remote=connection.store();let seen=false;
    const first=await new Promise((resolve,reject)=>{unsubscribe=remote.watch(event=>{if(mine!==generation)return;if(!seen){seen=true;resolve(event)}else receive(event)},error=>{if(!seen){seen=true;reject(error)}else report('error',error)})});
    if(mine!==generation)return;
    baseline=RealtimeProject.shared(first.project||bridge.empty());bridge.restore(baseline);revision=first.revision;sync.accept(snapshot());ready=true;report('saved');loading(false);bridge.startDemonstrations?.(remote);drain();
   }catch(error){if(mine!==generation)return;remote=null;ready=false;report('error',Error(`Não foi possível carregar o projeto. Verifique a conexão e clique em Recarregar da nuvem. ${error.message||''}`));loading(true);byId('project-reload').disabled=false;}
  }

  auto.onchange=()=>{sync.enabled=auto.checked;if(auto.checked)capture();else if(saveTimer){clearTimeout(saveTimer);saveTimer=0}};
  byId('project-save').onclick=async()=>{if(!ready||!stable())return;paused=false;sync.enabled=auto.checked;await sync.flush(true);drain()};
  byId('project-reload').onclick=async()=>{
   if(!ready)return connect();if(sending)return;
   if(sync.dirty()&&!confirm('Descartar alterações ainda não salvas e carregar o projeto da nuvem?'))return;
   loading(true);ready=false;paused=false;lastError=null;unsubscribe?.();unsubscribe=null;try{const project=await remote.load();baseline=RealtimeProject.shared(project||bridge.empty());bridge.restore(baseline);revision=remote.getRevision();pending=ack=null;replaceNext=false;sync.accept(snapshot());ready=true;report('saved');listen()}catch(error){report('error',error);ready=true}finally{loading(false);if(ready&&!unsubscribe)listen()}
  };
  byId('project-export').onclick=()=>{try{const project=ProjectStore.validateProject(bridge.snapshot()),url=URL.createObjectURL(new Blob([JSON.stringify(project,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='CombatMaps-projeto.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}catch(error){report('error',error)}};
  const picker=byId('project-import-file');byId('project-import').onclick=()=>picker.click();
  picker.onchange=async()=>{const file=picker.files?.[0];picker.value='';if(!file||!ready||sending)return;try{if(file.size>6000000)throw Error('Arquivo de projeto muito grande.');const project=ProjectStore.validateProject(JSON.parse(await file.text()));if(!ready||sending)return;if(!confirm('Substituir o projeto compartilhado pelos dados importados?'))return;bridge.restore(project);replaceNext=true;await sync.flush(true);drain()}catch(error){report('error',error)}};
  for(const event of ['pointerup','pointercancel','change','click','keyup'])document.addEventListener(event,()=>setTimeout(capture,80),true);
  const timer=setInterval(capture,500);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)capture()});
  window.addEventListener('online',()=>{if(ready){listen();capture()}else connect()});
  window.addEventListener('offline',()=>report('error',Error('Sem conexão. O projeto não é salvo neste navegador.')));
  window.addEventListener('pagehide',event=>{if(!event.persisted){stopped=true;clearInterval(timer);clearTimeout(saveTimer);unsubscribe?.();}});
  await connect();return {capture,reload:()=>byId('project-reload').onclick()};
 }
 root.ProjectController={start};
})(globalThis);
