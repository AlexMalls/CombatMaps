// One shared Firestore project; images stay in GitHub. No persistent browser cache.
(function(root){
 'use strict';
 const codec=root.ProjectStore||(typeof module==='object'?require('./project-store.js'):null);
 const rt=root.RealtimeProject||(typeof module==='object'?require('./realtime-project.js'):null);
 const config={apiKey:'AIzaSyCwQEiGG-6Wk9mYsB6gxkDo42vblwYOhT8',authDomain:'combatmaps-5f734.firebaseapp.com',projectId:'combatmaps-5f734',appId:'1:851486436173:web:b8e5d01344b32137106504'};
 let sdk;
 async function initialize(){if(!sdk)sdk=Promise.all(['app','firestore'].map(name=>import(`https://www.gstatic.com/firebasejs/12.19.0/firebase-${name}.js`))).then(([app,fire])=>{const instance=app.initializeApp(config);return {fire,db:fire.initializeFirestore(instance,{localCache:fire.memoryLocalCache()})}});return sdk;}
 function createStore(s){
  let revision=0,parts={},project=null,legacyRevision=0;
  const meta=s.fire.doc(s.db,'projects','main'),part=key=>s.fire.doc(s.db,'projects','main','parts',key);
  async function read(tx,head){const values=await Promise.all((head.keys||[]).map(async key=>{const item=await tx.get(part(key));if(!item.exists())throw Error('Projeto incompleto no banco.');return [key,rt.decodePart(item.data().json).text]}));const plain=Object.fromEntries(values);return {parts:plain,project:codec.validateProject(codec.joinProject(plain)),revision:head.revision};}
  function remember(result){if(result.revision>=revision){parts=result.parts;project=result.project;revision=result.revision;}}
  return {
   async load(){const result=await s.fire.runTransaction(s.db,async tx=>{const head=await tx.get(meta);return head.exists()?read(tx,head.data()):{parts:{},project:null,revision:0}});remember(result);legacyRevision=result.revision;return result.project;},
   watch(onChange,onError=()=>{}){
    let last='';return s.fire.onSnapshot(s.fire.collection(s.db,'projects','main','parts'),{includeMetadataChanges:true},snapshot=>{
     if(snapshot.metadata?.hasPendingWrites||snapshot.metadata?.fromCache)return;
     try{const next={},versions=[];for(const item of snapshot.docs){if(!/^(meta|types|statuses|scenes|maps)~\d+$/.test(item.id))continue;const decoded=rt.decodePart(item.data().json);next[item.id]=decoded.text;versions.push(decoded.revision);}
      if(!Object.keys(next).length){if(last!=='empty'){last='empty';onChange({project:null,revision:0})}return;}
      const nextRevision=Math.max(legacyRevision,...versions),signature=nextRevision+JSON.stringify(next);if(signature===last)return;
      const result={parts:next,project:codec.validateProject(codec.joinProject(next)),revision:nextRevision};remember(result);last=signature;onChange({project:result.project,revision:result.revision});
     }catch(error){onError(error)}
    },onError);
   },
   async save(local,{base=project,replace=false}={}){
    const result=await s.fire.runTransaction(s.db,async tx=>{
     const head=await tx.get(meta),currentRevision=head.exists()?head.data().revision:0;
     const current=currentRevision===revision&&project?{parts,project,revision}:head.exists()?await read(tx,head.data()):{parts:{},project:null,revision:0};
     const empty={version:1,types:[],statuses:[],scenes:[],maps:[],activeSceneId:null,settings:{}};
     const merged=codec.validateProject(replace?rt.shared(local):rt.merge(base||empty,local,current.project||empty));
     const next=codec.partitionProject(merged),before=current.project?rt.shared(current.project):null;
     if(before){for(const group of ['meta','types','statuses','scenes','maps']){
      const value=p=>group==='meta'?{version:p.version,activeSceneId:p.activeSceneId,settings:p.settings}:p[group];
      if(JSON.stringify(value(before))===JSON.stringify(value(merged))){for(const key of Object.keys(next))if(key.startsWith(group+'~'))delete next[key];for(const [key,text] of Object.entries(current.parts))if(key.startsWith(group+'~'))next[key]=text;}
     }}
     const changed=codec.diffParts(current.parts,next);if(!changed.length)return {...current,project:merged};
     if(changed.length>400)throw Error('Projeto grande demais para uma gravação.');
     const nextRevision=currentRevision+1,encoded=new Map(changed.filter(key=>key in next).map(key=>[key,rt.encodePart(next[key],nextRevision)]));
     if([...encoded.values()].reduce((sum,text)=>sum+new TextEncoder().encode(text).length,0)>8000000)throw Error('Alteração excede o limite de gravação.');
     for(const key of changed){if(key in next)tx.set(part(key),{json:encoded.get(key)});else tx.delete(part(key));}
     tx.set(meta,{version:1,revision:nextRevision,keys:Object.keys(next),updatedAt:s.fire.serverTimestamp()});
     return {parts:next,project:merged,revision:nextRevision};
    });remember(result);return {project:result.project,revision:result.revision};
   },
   getRevision:()=>revision
  };
 }
 // Keep the SDK lazy so the interface can explain connection failures.
 async function connect(){const connection=await initialize();return {store:()=>createStore(connection)}}
 const api={create:connect,createStore};if(typeof module==='object')module.exports=api;else root.FirebaseProject=api;
})(globalThis);
