(function(root){
 'use strict';
 const KEY='combatmaps.browser-preferences.v1';
 function normalize(value={}){return {role:['master','player'].includes(value?.role)?value.role:null,visible:typeof value?.visible==='boolean'?value.visible:true,opacity:Number.isFinite(value?.opacity)&&value.opacity>=0&&value.opacity<=100?Math.round(value.opacity):10};}
 function read(storage){try{return normalize(JSON.parse((storage||root.localStorage).getItem(KEY)||'{}'))}catch{return normalize()}}
 function save(value,storage){const clean=normalize(value);try{const target=storage||root.localStorage,text=JSON.stringify(clean);if(target.getItem(KEY)!==text)target.setItem(KEY,text)}catch{}return clean;}
 const api={KEY,read,save};if(typeof module==='object')module.exports=api;else root.BrowserPreferences=api;
})(globalThis);
