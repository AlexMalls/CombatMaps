const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm');
const CommandBar=require('../command-bar.js');
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);assert.ok(start>=0);return script.slice(start,script.indexOf('\n      }',start)+8);}
const token=(life=10000,maxLife=10000)=>({isConnected:true,info:{life,maxLife,status:'Normal'}});
test('command selection is independent, supports toggles and survives offscreen scrolling',()=>{
 const a=token(),b=token(),selection=new CommandBar.Selection();selection.add([a,b]);selection.toggle(a);assert.deepEqual([...selection.tokens],[b]);selection.reconcile([a,b]);assert.deepEqual([...selection.tokens],[b]);selection.clear();assert.equal(selection.tokens.size,0);
});
test('scene changes remove stale references from command selection',()=>{
 const a=token(),b=token(),c=token(),selection=new CommandBar.Selection();selection.add([a,b]);b.isConnected=false;selection.reconcile([b,c]);assert.equal(selection.tokens.size,0);
});
test('links fade smoothly at viewport edges, disappear outside, and do not change selection',()=>{
 const viewport={left:100,right:400,top:100,bottom:400};assert.equal(CommandBar.visibilityFade({left:180,right:260},viewport,'top'),1);
 const partial=CommandBar.visibilityFade({left:80,right:160},viewport,'top');assert.ok(partial>0 && partial<1);assert.equal(CommandBar.visibilityFade({left:0,right:100},viewport,'top'),0);
 assert.equal(CommandBar.visibilityFade({top:180,bottom:260},viewport,'side'),1);assert.equal(CommandBar.visibilityFade({top:400,bottom:480},viewport,'side'),0);
});
test('damage affects every selected token once and clamps independently at zero',()=>{
 const a=token(7000),b=token(1000),c=token(8000);const plan=CommandBar.planBatch([a,b,c],t=>t.info,'damage','5000');assert.deepEqual(plan.map(x=>x.after.life),[2000,0,3000]);assert.deepEqual(plan.map(x=>x.before.life),[7000,1000,8000]);assert.equal(a.info.life,7000);
});
test('healing respects each token maximum, including resurrection, and ignores unchanged records',()=>{
 const a=token(0),b=token(9000),c=token(3000,3000);const plan=CommandBar.planBatch([a,b,c],t=>t.info,'heal','5000');assert.deepEqual(plan.map(x=>x.after.life),[5000,10000]);assert.equal(plan.length,2);
});
test('invalid amounts cannot corrupt health or create a history entry',()=>{
 const a=token();for(const value of ['','abc',NaN,Infinity,-100,0,1.5])assert.equal(CommandBar.planBatch([a],t=>t.info,'damage',value).length,0);assert.equal(CommandBar.planBatch([a],t=>t.info,'unknown',100).length,0);
});
test('status application preserves health and captures previous status for undo',()=>{
 const a=token(3000),b=token(7000);b.info.status='Envenenado';const plan=CommandBar.planBatch([a,b],t=>t.info,'status','Atordoado');assert.deepEqual(plan.map(x=>x.after),[{life:3000,status:'Atordoado'},{life:7000,status:'Atordoado'}]);assert.equal(plan[1].before.status,'Envenenado');assert.equal(CommandBar.planBatch([a],t=>t.info,'status','').length,0);
});
function integration(){
 const a=token(1000),b=token(7000),c=vm.createContext({tokens:[a,b],a,b,CommandBar,state:{isMoving:false},movementHistory:[],movementRedoHistory:[],MOVEMENT_HISTORY_LIMIT:5,tokenStatusPanels:new Map(),getTokenInfo:t=>t.info,updateMovementHistoryUI(){},updateTokenHealthVisuals(){},applyTokenLifeState(t,life){t.info.life=life;t.dead=life===0},commandBar:{refresh(){}},hasPriorityTool:()=>false,debugLog(){}});
 for(const name of ['applyCommandHistory','applyCommandBatch','undoLastMovement','redoLastMovement'])vm.runInContext(source(name),c);return c;
}
test('one group damage produces one undo entry and restores each token exact pre-death life',()=>{
 const c=integration();assert.equal(c.applyCommandBatch([c.a,c.b],'damage','5000'),2);assert.equal(c.movementHistory.length,1);assert.equal(c.a.dead,true);assert.equal(c.b.info.life,2000);
 assert.equal(c.undoLastMovement(),true);assert.equal(c.a.info.life,1000);assert.equal(c.b.info.life,7000);assert.equal(c.a.dead,false);assert.equal(c.redoLastMovement(),true);assert.equal(c.a.info.life,0);assert.equal(c.b.info.life,2000);
});
test('status commands undo and redo without resetting health',()=>{
 const c=integration();c.b.info.status='Envenenado';c.applyCommandBatch([c.a,c.b],'status','Atordoado');c.undoLastMovement();assert.equal(c.a.info.status,'Normal');assert.equal(c.b.info.status,'Envenenado');assert.equal(c.b.info.life,7000);c.redoLastMovement();assert.equal(c.b.info.status,'Atordoado');
});
test('commands reject old scene tokens and cannot run during movement',()=>{
 const c=integration(),foreign=token();assert.equal(c.applyCommandBatch([foreign],'damage','1000'),0);c.state.isMoving=true;assert.equal(c.applyCommandBatch([c.a],'damage','1000'),0);assert.equal(c.movementHistory.length,0);
});
test('opening command bar transfers floating cards; closing never recreates them',()=>{
 const a=token(),b=token();let selected=[],closed=0;const c=vm.createContext({tokenStatusPanels:new Map([['a',{token:a}],['b',{token:b}]]),closeAllTokenStatus(){closed++;c.tokenStatusPanels.clear()},commandBar:{setOpen(open,transfer){selected=open?transfer:[]}}});vm.runInContext(source('setCommandBarOpen'),c);c.setCommandBarOpen(true);assert.equal(closed,1);assert.deepEqual([...selected],[a,b]);c.setCommandBarOpen(false);assert.equal(closed,1);assert.equal(selected.length,0);
});
test('holding map tokens redirects consultation into the command bar without floating cards',()=>{
 const a=token(),b=token();let targets,focus,cleared=0,floating=0;const c=vm.createContext({getSelectedTokensInNumberOrder:()=>[a,b],openTokenStatus(){floating++},clearTokenSelection(){cleared++},commandBar:{isOpen:()=>true,inspect(items,token){targets=items;focus=token}}});vm.runInContext(source('openStatusForToken'),c);c.openStatusForToken(b);assert.deepEqual([...targets],[a,b]);assert.equal(focus,b);assert.equal(cleared,1);assert.equal(floating,0);
});
