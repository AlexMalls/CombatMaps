(function(root){
 'use strict';
 function validateProject(input){
  const p=JSON.parse(JSON.stringify(input));if(p?.version!==1||!['types','statuses','scenes','maps'].every(k=>Array.isArray(p[k]))||!p.settings||typeof p.settings!=='object'||Array.isArray(p.settings))throw Error('Formato de projeto inválido.');
  const ids=list=>{const s=new Set();for(const x of list){if(!x||typeof x.id!=='string'||!x.id||x.id.length>160||/[\/]/.test(x.id)||['__proto__','constructor','prototype'].includes(x.id)||s.has(x.id))throw Error('ID inválido ou duplicado.');s.add(x.id)}return s};
  const bounded=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max;
  const grid=g=>g&&bounded(g.size,8,160)&&(!('opacity' in g)||bounded(g.opacity,0,100))&&(!('distance' in g)||bounded(g.distance,.5,50));
  const positive=n=>Number.isFinite(n)&&n>0&&n<=1e9;
  const path=url=>typeof url==='string'&&(url===''||/^Midia\/Storage\/(Tokens|Cenas)\/.+\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(url)&&!url.split('/').some(p=>p==='..'||p==='.'||p.startsWith('.'))&&!/[?#\\]/.test(url));
  const types=ids(p.types);ids(p.statuses);const scenes=ids(p.scenes);ids(p.maps);const instanceIds=new Set();
  for(const t of p.types)if(!path(t.image)||!t.image||!Number.isInteger(t.gridSize)||t.gridSize<1||t.gridSize>10||!positive(t.maxLife))throw Error('Tipo de token inválido.');
  for(const s of [...p.scenes,...p.maps]){if(!s.canvas||!positive(s.canvas.width)||!positive(s.canvas.height)||!grid(s.grid)||!path(s.backgroundUrl||''))throw Error('Cena inválida.');if(s.imageRect&&!['x','y','width','height'].every(k=>Number.isFinite(s.imageRect[k])) )throw Error('Recorte inválido.');if(s.tokens&&!Array.isArray(s.tokens))throw Error('Instâncias inválidas.');ids(s.tokens||[]);for(const t of s.tokens||[]){if(instanceIds.has(t.id)||!types.has(t.typeId)||!Number.isInteger(t.col)||!Number.isInteger(t.row)||!Number.isInteger(t.size)||t.size<1||t.size>10||!positive(t.maxLife)||!Number.isFinite(t.life)||t.life<0||t.life>t.maxLife)throw Error('Instância de token inválida.');instanceIds.add(t.id);}}
  for(const [key,min,max] of [['cameraZoom',.01,100],['cameraX',-1e9,1e9],['cameraY',-1e9,1e9],['blockSensitivity',1,3],['linkOpacity',0,100]])if(key in p.settings&&!bounded(p.settings[key],min,max))throw Error('Configuração inválida.');
  if('size' in p.settings&&!grid(p.settings))throw Error('Configuração de grid inválida.');
  if(p.activeSceneId!==null&&!scenes.has(p.activeSceneId))throw Error('Cena ativa inválida.');
  if(new TextEncoder().encode(JSON.stringify(p)).length>6000000)throw Error('Projeto excede o limite de 6 MB de dados.');return p;
 }
 function partitionProject(p){const parts={};const put=(key,value)=>{const text=JSON.stringify(value);for(let i=0;i<text.length;i+=100000)parts[`${key}~${i/100000}`]=text.slice(i,i+100000)};put('meta',{version:p.version,activeSceneId:p.activeSceneId,settings:p.settings});for(const key of ['types','statuses','scenes','maps'])put(key,p[key]);return parts;}
 function joinProject(parts){const read=key=>JSON.parse(Object.keys(parts).filter(k=>k.startsWith(key+'~')).sort((a,b)=>Number(a.split('~')[1])-Number(b.split('~')[1])).map(k=>parts[k]).join(''));return {...read('meta'),types:read('types'),statuses:read('statuses'),scenes:read('scenes'),maps:read('maps')};}
 function diffParts(before,after){return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>before[key]!==after[key]);}
 function createSync({snapshot,save,onState=()=>{}}){let accepted=null,busy=false,epoch=0;return {enabled:true,accept(p){epoch++;accepted=JSON.stringify(p)},dirty(){return JSON.stringify(snapshot())!==accepted},async flush(force=false){if(busy||(!force&&!this.enabled))return false;let current;try{current=validateProject(snapshot())}catch(e){onState('error',e);return false}const serialized=JSON.stringify(current);if(serialized===accepted)return false;busy=true;const savingEpoch=epoch;onState('saving');try{await save(current);if(savingEpoch!==epoch)return false;accepted=serialized;onState(this.dirty()?'pending':'saved');return true}catch(e){if(savingEpoch===epoch)onState('error',e);return false}finally{busy=false}}};}
 const api={validateProject,partitionProject,joinProject,diffParts,createSync};if(typeof module==='object')module.exports=api;else root.ProjectStore=api;
})(globalThis);
