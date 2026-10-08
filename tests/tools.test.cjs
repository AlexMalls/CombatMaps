const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);return start<0?'':script.slice(start,script.indexOf('\n      }',start)+8);}
function setup(){
  const buttons=['ruler','highlight','heart'].map(id=>({dataset:{tool:id},attrs:{},setAttribute(k,v){this.attrs[k]=v}}));
  const ctx=vm.createContext({state:{toolsOpen:false,activeTool:null,visualTools:new Set(),isMoving:false,masterMode:true,masterMenuOpen:false},
    TOOL_DEFINITIONS:{ruler:{type:'priority'},heart:{type:'visual'},highlight:{type:'priority'},other:{type:'priority'}},toolButtons:buttons,
    masterMenu:{dataset:{},hidden:false,contains:()=>false},masterPanel:{inert:true,contains:()=>false},
    masterTrigger:{attrs:{},setAttribute(k,v){this.attrs[k]=v},focus(){}},masterModeCheckbox:{checked:true},
    toolsMenu:{dataset:{}},toolsTrigger:{setAttribute(){},focus(){}},toolsPanel:{inert:true,contains:()=>false},
    document:{documentElement:{dataset:{}}},closeAssetExplorer(){},workspaceCard:{contains:t=>t?.onMap===true},
    Element:class{},rulerSession:null,ownsHighlightPointer:()=>false,dispatchHighlightInput(){},clearGridHighlights(){ctx.cleared++},cleared:0,dispatchRulerInput(){},cancelWorkspaceGestures(){ctx.cancelled++},cancelled:0});
  for(const name of ['isMasterMode','syncMasterMenuUI','setMasterMenuOpen','setMasterMode','hasPriorityTool','syncToolsUI','setToolsOpen','toggleTool','blocksWorkspaceInput','ownsRulerPointer','interceptWorkspaceInput'])vm.runInContext(source(name),ctx);
  assert.equal(vm.runInContext('typeof toggleTool',ctx),'function','tool selection is missing');
  return ctx;
}
test('priority selection blocks the map and deselection restores it',()=>{
  const c=setup();vm.runInContext("toggleTool('ruler')",c);assert.equal(c.state.activeTool,'ruler');
  assert.equal(vm.runInContext('hasPriorityTool()',c),true);assert.equal(c.cancelled,1);
  vm.runInContext("toggleTool('ruler')",c);assert.equal(c.state.activeTool,null);
  assert.equal(vm.runInContext('hasPriorityTool()',c),false);
});
test('visual toggles are independent of the exclusive selection',()=>{
  const c=setup();vm.runInContext("toggleTool('ruler'); toggleTool('heart')",c);
  assert.equal(c.state.activeTool,'ruler');assert.ok(c.state.visualTools.has('heart'));
  vm.runInContext("toggleTool('heart')",c);assert.equal(c.state.activeTool,'ruler');assert.equal(c.state.visualTools.size,0);
  vm.runInContext("toggleTool('heart'); toggleTool('other')",c);assert.equal(c.state.activeTool,'other');assert.ok(c.state.visualTools.has('heart'));
});
test('closing the menu preserves selections and inert state follows visibility',()=>{
  const c=setup();vm.runInContext("setToolsOpen(true); toggleTool('ruler'); toggleTool('heart')",c);
  assert.equal(c.toolsPanel.inert,false);assert.equal(c.state.toolsOpen,true);
  vm.runInContext('setToolsOpen(false)',c);assert.equal(c.toolsPanel.inert,true);
  assert.equal(c.state.activeTool,'ruler');assert.ok(c.state.visualTools.has('heart'));
});
test('priority tools block mouse, touch, wheel and token keyboard events while controls remain usable',()=>{
  const c=setup();vm.runInContext("toggleTool('ruler')",c);
  c.target=vm.runInContext('new Element()',c);c.target.onMap=true;c.target.closest=()=>null;
  for(const type of ['pointerdown','pointerup','pointermove','click','dblclick','contextmenu','wheel','keydown']){
    let prevented=false,stopped=false;c.event={type,key:'Enter',target:c.target,cancelable:true,
      preventDefault(){prevented=true},stopImmediatePropagation(){stopped=true}};
    vm.runInContext('interceptWorkspaceInput(event)',c);assert.ok(prevented&&stopped,type);
  }
  c.target.closest=()=>({});c.event={type:'click',target:c.target};assert.equal(vm.runInContext('blocksWorkspaceInput(event)',c),false);
  c.target.closest=()=>null;c.event={type:'keydown',key:'Tab',target:c.target};assert.equal(vm.runInContext('blocksWorkspaceInput(event)',c),false);
});
test('visual-only activation leaves map input available and moving tokens cannot acquire a priority tool',()=>{
  const c=setup();vm.runInContext("toggleTool('heart')",c);assert.equal(vm.runInContext('hasPriorityTool()',c),false);
  c.state.isMoving=true;vm.runInContext("toggleTool('ruler')",c);assert.equal(c.state.activeTool,null);
  assert.ok(c.state.visualTools.has('heart'));
});
test('outside clicks keep the tools menu open',()=>{
  const c=setup();vm.runInContext('setToolsOpen(true)',c);
  c.tokenActionMenu={hidden:true};c.document.addEventListener=(type,fn)=>{c.outsideClick=fn};
  const start=script.indexOf('      document.addEventListener("pointerdown", event => {\n        if (state.open');
  vm.runInContext(script.slice(start,script.indexOf('      document.addEventListener("focusin"',start)),c);
  c.outsideClick({target:{}});assert.equal(c.state.toolsOpen,true);assert.equal(c.toolsPanel.inert,false);
});
test('Escape from a corner control preserves map selection while a priority tool is active',()=>{
  const c=setup();vm.runInContext("toggleTool('ruler')",c);
  c.selectedToken={selected:true};c.hasSelectedToken=()=>c.selectedToken.selected;
  c.clearTokenSelection=()=>{c.selectedToken.selected=false};
  c.desktopCameraPan=null;c.blockProjectionSession=null;c.lassoSession=null;c.tokenActionMenu={hidden:true};
  c.document.addEventListener=(type,fn)=>{c.keydown=fn};
  const start=script.indexOf('      document.addEventListener("keydown", event => {\n        if (state.debugEnabled)');
  const end=script.indexOf('      setDebugEnabled(true);',start);
  vm.runInContext(script.slice(start,end),c);
  const target=vm.runInContext('new Element()',c);target.closest=()=>null;
  c.keydown({key:'Escape',target,preventDefault(){}});
  assert.equal(c.selectedToken.selected,true);assert.equal(c.state.activeTool,'ruler');
});

test('master mode and heart start enabled in the real default state',()=>{
  const c=vm.createContext({touchCapable:false});
  const start=script.indexOf('      const state = {');const stop=script.indexOf('      function hasPriorityTool()',start);
  vm.runInContext(script.slice(start,stop),c);
  assert.equal(vm.runInContext('state.masterMode',c),true);
  assert.equal(vm.runInContext('state.visualTools.has("heart")',c),true);
});
test('master checkbox updates the shared mode flag for future exclusive features',()=>{
  const c=setup();c.masterModeCheckbox={checked:true};
  vm.runInContext(source('isMasterMode')+source('setMasterMode'),c);
  vm.runInContext('setMasterMode(false)',c);assert.equal(c.masterModeCheckbox.checked,false);
  assert.equal(c.document.documentElement.dataset.masterMode,'false');assert.equal(vm.runInContext('isMasterMode()',c),false);
  vm.runInContext('setMasterMode(true)',c);assert.equal(c.masterModeCheckbox.checked,true);assert.equal(vm.runInContext('isMasterMode()',c),true);
});
test('heart switches only the shared damage visibility flag while keeping the active priority tool',()=>{
  const c=setup();c.state.visualTools.add('heart');vm.runInContext('syncToolsUI()',c);
  assert.equal(c.document.documentElement.dataset.showTokenDamage,'true');
  vm.runInContext('toggleTool("ruler");toggleTool("heart")',c);
  assert.equal(c.document.documentElement.dataset.showTokenDamage,'false');assert.equal(c.state.activeTool,'ruler');
  vm.runInContext('toggleTool("heart")',c);assert.equal(c.document.documentElement.dataset.showTokenDamage,'true');
});

test('master toolbar opens by its trigger, stays open outside and becomes inert when closed',()=>{
  const c=setup();vm.runInContext('setMasterMenuOpen(true)',c);
  assert.equal(c.masterMenu.dataset.open,'true');assert.equal(c.masterPanel.inert,false);assert.equal(c.masterTrigger.attrs['aria-expanded'],'true');
  c.tokenActionMenu={hidden:true};c.document.addEventListener=(type,fn)=>{c.outsideClick=fn};
  const start=script.indexOf('      document.addEventListener("pointerdown", event => {\n        if (state.open');
  vm.runInContext(script.slice(start,script.indexOf('      document.addEventListener("focusin"',start)),c);
  c.outsideClick({target:{}});assert.equal(c.masterMenu.dataset.open,'true');
  vm.runInContext('setMasterMenuOpen(false)',c);assert.equal(c.masterPanel.inert,true);assert.equal(c.masterTrigger.attrs['aria-expanded'],'false');
});
test('disabling master mode hides its toolbar, closes it, and prevents opening until enabled',()=>{
  const c=setup();vm.runInContext('setMasterMenuOpen(true);setMasterMode(false);setMasterMenuOpen(true)',c);
  assert.equal(c.masterMenu.hidden,true);assert.equal(c.state.masterMenuOpen,false);assert.equal(c.masterPanel.inert,true);
  vm.runInContext('setMasterMode(true)',c);assert.equal(c.masterMenu.hidden,false);assert.equal(c.masterMenu.dataset.open,'false');
});

test('highlight is exclusive and clears on disable or switching tools, while heart preserves it',()=>{
  const c=setup();vm.runInContext('toggleTool("highlight")',c);assert.equal(vm.runInContext('hasPriorityTool()',c),true);
  vm.runInContext('toggleTool("heart")',c);assert.equal(c.state.activeTool,'highlight');assert.equal(c.cleared,0);
  vm.runInContext('toggleTool("highlight")',c);assert.equal(c.state.activeTool,null);assert.equal(c.cleared,1);
  vm.runInContext('toggleTool("highlight");toggleTool("ruler")',c);assert.equal(c.state.activeTool,'ruler');assert.equal(c.cleared,2);
});
