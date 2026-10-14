(function(root){
 'use strict';
 function localDatabase(){return new Promise((resolve,reject)=>{const r=indexedDB.open('combatmaps-projects',1);r.onupgradeneeded=()=>r.result.createObjectStore('projects');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
 const database=localDatabase();
 async function cache(key,value){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('projects',value===undefined?'readonly':'readwrite'),store=tx.objectStore('projects');const r=value===undefined?store.get(key):store.put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onerror=()=>reject(tx.error)})}
 async function start(bridge){
  const byId=id=>document.getElementById(id),message=byId('project-save-state'),auto=byId('project-autosave');
  let remote=null,ready=false,blocked=false,forcePending=false,lastLocal='',sync;
  const sharedKey='shared';

  function report(state,error){
   const labels={saved:'Salvo na nuvem.',pending:'Alterações pendentes.',saving:'Salvando na nuvem…',error:'Salvamento pendente.'};
   message.textContent=error?`${labels.error} ${error.message}`:labels[state]||state;
   if(error?.code==='project/conflict')blocked=true;
  }

  sync=ProjectStore.createSync({
   snapshot:()=>bridge.snapshot(),
   save:async p=>{if(!remote||!ready||blocked)throw Error(blocked?'Recarregue da nuvem para resolver o conflito.':'Nuvem indisponível.');await remote.save(p)},
   onState:report
  });

  async function capture(){
   if(!ready||!bridge.stable())return;
   try{
    const p=ProjectStore.validateProject(bridge.snapshot()),record={project:p,pending:sync.dirty(),auto:auto.checked,forced:forcePending,revision:remote?.getRevision()||0},text=JSON.stringify(record);
    if(text!==lastLocal){
     await cache(sharedKey,record);
     lastLocal=text;
     if(sync.dirty())report('pending');
    }
   }catch(e){report('error',e)}
  }

  function setLoading(value){
   bridge.setLoading(value);
   for(const id of ['project-save','project-reload','project-import','project-export']){
    const el=byId(id); if(el)el.disabled=value;
   }
  }

  function hasProjectContent(project){
   if(!project)return false;
   return ['types','statuses','scenes','maps'].some(key=>Array.isArray(project[key])&&project[key].length);
  }

  async function initializeSharedProject(){
   setLoading(true);
   ready=false;
   try{
    const connection=await FirebaseProject.create();
    remote=connection.store();
    const [cloud,local,legacyGuest]=await Promise.all([remote.load(),cache(sharedKey),cache('guest')]);

    if(cloud){
     bridge.restore(cloud);
     sync.accept(bridge.snapshot());
     if(local?.pending){
      if(local.revision===remote.getRevision()||confirm('Existe uma cópia local pendente deste dispositivo. Deseja usar essa cópia e substituir o projeto atual da nuvem?')){
       bridge.restore(ProjectStore.validateProject(local.project));
       auto.checked=local.auto!==false;
       forcePending=Boolean(local.forced);
      }
     }
    }else{
     const migration=hasProjectContent(local?.project)?local:hasProjectContent(legacyGuest?.project)?legacyGuest:null;
     if(migration){
      bridge.restore(ProjectStore.validateProject(migration.project));
      auto.checked=migration.auto!==false;
      sync.accept(bridge.empty());
      forcePending=true;
     }else{
      bridge.restore(bridge.empty());
      sync.accept(bridge.snapshot());
     }
    }

    ready=true;
    lastLocal='';
    await capture();
    if(forcePending||sync.dirty()){
     sync.enabled=auto.checked;
     if(await sync.flush(true)){forcePending=false;blocked=false;await capture();}
    }else report('saved');
   }catch(e){
    remote=null;
    try{
     const local=await cache(sharedKey),legacy=await cache('guest');
     const fallback=local?.project||legacy?.project;
     if(fallback)bridge.restore(ProjectStore.validateProject(fallback));
     sync.accept(bridge.snapshot());
    }catch{}
    ready=true;
    report('error',Error(`Nuvem indisponível; usando a cópia local. ${e.message||''}`.trim()));
   }finally{
    setLoading(false);
   }
  }

  async function reloadRemote(force=false){
   if(!remote)return report('error',Error('Nuvem indisponível.'));
   if(!force&&sync.dirty())return;
   try{
    const p=await remote.load();
    if(!p)return;
    const current=ProjectStore.validateProject(bridge.snapshot());
    if(JSON.stringify(p)!==JSON.stringify(current)){
     bridge.restore(p);
     sync.accept(bridge.snapshot());
     forcePending=false;blocked=false;lastLocal='';
     await capture();
    }
    report('saved');
   }catch(e){report('error',e)}
  }

  auto.onchange=()=>{sync.enabled=auto.checked;lastLocal='';capture()};
  byId('project-save').onclick=async()=>{await capture();sync.enabled=auto.checked;if(await sync.flush(true)){forcePending=false;blocked=false;await capture();}};
  byId('project-reload').onclick=async()=>{
   if(sync.dirty()&&!confirm('Substituir alterações locais pelo projeto salvo na nuvem?'))return;
   try{ready=false;setLoading(true);blocked=false;await reloadRemote(true)}finally{ready=true;setLoading(false);capture()}
  };

  byId('project-export').onclick=()=>{try{const p=ProjectStore.validateProject(bridge.snapshot()),url=URL.createObjectURL(new Blob([JSON.stringify(p,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='CombatMaps-projeto.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}catch(e){report('error',e)}};

  const picker=byId('project-import-file');
  byId('project-import').onclick=()=>picker.click();
  picker.onchange=async()=>{
   const file=picker.files?.[0];picker.value='';
   if(!file)return;
   if(!ready)return report('error',Error('Aguarde o carregamento do projeto.'));
   try{
    if(file.size>6000000)throw Error('Arquivo de projeto muito grande.');
    const p=ProjectStore.validateProject(JSON.parse(await file.text()));
    if(!confirm('Substituir o projeto atual pelos dados importados?'))return;
    bridge.restore(p);lastLocal='';forcePending=true;await capture();
    if(await sync.flush(true)){forcePending=false;blocked=false;await capture();}
   }catch(e){report('error',e)}
  };

  document.addEventListener('pointerup',()=>setTimeout(capture,80),true);
  document.addEventListener('change',()=>setTimeout(capture,80),true);
  document.addEventListener('click',()=>setTimeout(capture,80),true);
  document.addEventListener('keyup',()=>setTimeout(capture,80),true);
  setInterval(capture,1000);
  setInterval(async()=>{
   sync.enabled=auto.checked;
   if(!ready||blocked||!bridge.stable())return;
   await capture();
   if(sync.dirty()){
    if(await sync.flush(forcePending)){forcePending=false;await capture();}
   }else{
    await reloadRemote(false);
   }
  },10000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)capture();else if(ready&&!sync.dirty())reloadRemote(false)});
  window.addEventListener('pagehide',capture);

  await initializeSharedProject();
  return {capture,reload:()=>reloadRemote(true)};
 }
 root.ProjectController={start};
})(globalThis);
