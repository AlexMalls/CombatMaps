// Shared CombatMaps project storage. Images remain in GitHub.
// This intentionally uses one shared Firestore project with no visible user login.
(function(root){
 'use strict';
 const config={apiKey:'AIzaSyCwQEiGG-6Wk9mYsB6gxkDo42vblwYOhT8',authDomain:'combatmaps-5f734.firebaseapp.com',projectId:'combatmaps-5f734',appId:'1:851486436173:web:b8e5d01344b32137106504'};
 let sdk;
 async function initialize(){
  if(!sdk)sdk=Promise.all(['app','firestore'].map(name=>import(`https://www.gstatic.com/firebasejs/12.19.0/firebase-${name}.js`))).then(([app,fire])=>{
   const instance=app.initializeApp(config);
   return {fire,db:fire.getFirestore(instance)};
  });
  return sdk;
 }
 async function create(){
  const s=await initialize();
  return {store(){
   let revision=0,baseline={};
   const meta=s.fire.doc(s.db,'projects','main');
   const part=key=>s.fire.doc(s.db,'projects','main','parts',key);
   return {
    async load(){
     return s.fire.runTransaction(s.db,async tx=>{
      const head=await tx.get(meta);
      if(!head.exists()){revision=0;baseline={};return null}
      const data=head.data(),parts={};
      for(const key of data.keys||[]){
       const item=await tx.get(part(key));
       if(!item.exists())throw Error('Projeto incompleto no banco.');
       parts[key]=item.data().json;
      }
      const project=ProjectStore.validateProject(ProjectStore.joinProject(parts));
      revision=data.revision;
      baseline=parts;
      return project;
     });
    },
    async save(project){
     const next=ProjectStore.partitionProject(project),changed=ProjectStore.diffParts(baseline,next),expected=revision;
     if(changed.length>400)throw Error('Projeto grande demais para uma gravação.');
     await s.fire.runTransaction(s.db,async tx=>{
      const head=await tx.get(meta);
      if((head.exists()?head.data().revision:0)!==expected)throw Object.assign(Error('Projeto alterado em outro dispositivo. Recarregue da nuvem antes de salvar.'),{code:'project/conflict'});
      for(const key of changed){
       if(key in next)tx.set(part(key),{json:next[key]});
       else tx.delete(part(key));
      }
      tx.set(meta,{version:1,revision:expected+1,keys:Object.keys(next),updatedAt:s.fire.serverTimestamp()});
     });
     revision=expected+1;
     baseline=next;
    },
    getRevision:()=>revision
   };
  }};
 }
 root.FirebaseProject={create};
})(globalThis);
