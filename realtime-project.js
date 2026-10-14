(function(root){
 'use strict';
 const absent=Symbol('absent');
 function canonical(value){if(Array.isArray(value)){const items=value.map(canonical);if(items.every(item=>item&&typeof item==='object'&&typeof item.id==='string'))items.sort((a,b)=>a.id.localeCompare(b.id));return items;}if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,canonical(value[key])]));return value;}
 function shared(project){const p=JSON.parse(JSON.stringify(project));p.settings=p.activeSceneId?{}:Object.fromEntries(['visible','absolute','distance','opacity','size'].filter(key=>key in p.settings).map(key=>[key,p.settings[key]]));return canonical(p);}
 function equal(a,b){return a===b||(a!==absent&&b!==absent&&JSON.stringify(canonical(a))===JSON.stringify(canonical(b)));}
 function merge(base,local,remote){
  function combine(b,l,r){
   if(equal(l,b))return r;
   if(equal(r,b))return l;
   if(l===absent||r===absent)return absent; // A deletion wins over an older edit.
   if(Array.isArray(l)&&Array.isArray(r)&&Array.isArray(b)&&[...b,...l,...r].every(x=>x&&typeof x==='object'&&typeof x.id==='string')){
    const index=list=>new Map(list.map(x=>[x.id,x])),bi=index(b),li=index(l),ri=index(r),ids=[...new Set([...r,...l].map(x=>x.id))];
    return ids.map(id=>combine(bi.get(id)??absent,li.get(id)??absent,ri.get(id)??absent)).filter(x=>x!==absent);
   }
   if(l&&r&&typeof l==='object'&&typeof r==='object'&&!Array.isArray(l)&&!Array.isArray(r)){
    const before=b&&b!==absent&&typeof b==='object'?b:{},result={};
    for(const key of new Set([...Object.keys(before),...Object.keys(l),...Object.keys(r)])){const value=combine(key in before?before[key]:absent,key in l?l[key]:absent,key in r?r[key]:absent);if(value!==absent)result[key]=value;}return result;
   }
   return l;
  }
  return shared(combine(shared(base),shared(local),shared(remote)));
 }
 function encodePart(text,revision){return JSON.stringify({part:text,revision});}
 function decodePart(text){try{const value=JSON.parse(text);if(typeof value?.part==='string'&&Number.isSafeInteger(value.revision))return {text:value.part,revision:value.revision}}catch{}return {text,revision:0};}
 const api={shared,merge,canonical,encodePart,decodePart};if(typeof module==='object')module.exports=api;else root.RealtimeProject=api;
})(globalThis);
