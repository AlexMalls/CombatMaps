const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);return i<0?'':script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
  let timerId=0;const timers=new Map(),opened=new Set();
  const makeToken=id=>({dataset:{tokenId:id,selected:'false'},captures:new Set(),
    setPointerCapture(id){this.captures.add(id)},hasPointerCapture(id){return this.captures.has(id)},releasePointerCapture(id){this.captures.delete(id)},
    getBoundingClientRect:()=>({left:0,right:200,top:0,bottom:200})});
  const a=makeToken('soldados-01'),b=makeToken('soldados-02');
  const c=vm.createContext({tokenIds:new WeakMap(),tokenData:new Map(),tokenTapCandidates:new Map(),
    TOKEN_TAP_MOVE_TOLERANCE:12,TOKEN_STATUS_HOLD_MS:400,state:{isMoving:false,touchMode:false},
    touchDeselectPointers:new Map(),hasPriorityTool:()=>false,selected:[],
    getSelectedTokensInNumberOrder:()=>c.selected,openTokenStatus(token){opened.add(c.tokenIds.get(token))},
    closeAllTokenStatus(){opened.clear()},toggleTokenSelection(token){token.dataset.selected=token.dataset.selected==='true'?'false':'true'},
    window:{setTimeout(fn){const id=++timerId;timers.set(id,fn);return id},clearTimeout:id=>timers.delete(id)},
    performance:{now:()=>1000},statusLongClickToken:null,statusLongClickUntil:0,
    a,b,opened,timers});
  for(const name of ['registerTokenData','getTokenInfo','openStatusForToken','releaseTokenPressPointer',
    'cancelTokenPress','cancelAllTokenPresses','beginTokenPress','moveTokenPress','endTokenPress'])vm.runInContext(source(name),c);
  assert.equal(vm.runInContext('typeof beginTokenPress',c),'function','token press classification is missing');
  vm.runInContext('registerTokenData(a);registerTokenData(b)',c);
  c.event=(id=1,overrides={})=>({pointerId:id,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:100,clientY:100,
    target:{closest:()=>null},...overrides});
  c.hold=()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn()}};
  return c;
}
test('identity stays immutable and each token has its own initial life/status record',()=>{
  const c=setup();assert.equal(vm.runInContext('getTokenInfo(a).life',c),10000);assert.equal(vm.runInContext('getTokenInfo(a).status',c),'Normal');
  c.a.dataset.tokenId='changed';assert.equal(vm.runInContext('getTokenInfo(a).id',c),'soldados-01');
  assert.throws(()=>vm.runInContext('"use strict";getTokenInfo(a).id="changed"',c));
  vm.runInContext('getTokenInfo(a).life=9000',c);assert.equal(vm.runInContext('getTokenInfo(b).life',c),10000);
});
test('short mouse click selects only on release',()=>{
  const c=setup();c.e=c.event();vm.runInContext('beginTokenPress(e,a)',c);assert.equal(c.a.dataset.selected,'false');
  vm.runInContext('endTokenPress(e)',c);assert.equal(c.a.dataset.selected,'true');assert.equal(c.timers.size,0);assert.equal(c.a.captures.size,0);
});
test('holding opens status without selection and release preserves the panel',()=>{
  const c=setup();c.e=c.event();vm.runInContext('beginTokenPress(e,a)',c);c.hold();assert.ok(c.opened.has('soldados-01'));assert.equal(c.a.dataset.selected,'false');
  vm.runInContext('endTokenPress(e)',c);assert.ok(c.opened.has('soldados-01'));assert.equal(c.a.dataset.selected,'false');
});
test('individual holds accumulate panels and a multi-selection hold opens the selected group',()=>{
  const c=setup();c.e=c.event();vm.runInContext('beginTokenPress(e,a)',c);c.hold();vm.runInContext('endTokenPress(e);beginTokenPress(e,b)',c);c.hold();
  assert.deepEqual([...c.opened],['soldados-01','soldados-02']);vm.runInContext('endTokenPress(e)',c);
  c.opened.clear();c.selected=[c.a,c.b];vm.runInContext('beginTokenPress(e,b)',c);c.hold();assert.equal(c.opened.size,2);
});
test('movement, cancelled gestures and priority activation prevent stale hold timers',()=>{
  const c=setup();c.e=c.event();vm.runInContext('beginTokenPress(e,a)',c);c.e=c.event(1,{clientX:140});vm.runInContext('moveTokenPress(e)',c);c.hold();vm.runInContext('endTokenPress(e)',c);
  assert.equal(c.opened.size,0);assert.equal(c.a.dataset.selected,'false');
  c.e=c.event();vm.runInContext('beginTokenPress(e,a);cancelAllTokenPresses()',c);c.hold();assert.equal(c.opened.size,0);assert.equal(c.a.captures.size,0);
  c.hasPriorityTool=()=>true;vm.runInContext('beginTokenPress(e,a)',c);assert.equal(c.timers.size,0);
});
test('touch short taps and long presses use the same classification',()=>{
  const c=setup();c.state.touchMode=true;c.e=c.event(1,{pointerType:'touch'});vm.runInContext('beginTokenPress(e,a);endTokenPress(e)',c);assert.equal(c.a.dataset.selected,'true');
  vm.runInContext('beginTokenPress(e,a)',c);c.hold();vm.runInContext('endTokenPress(e)',c);assert.equal(c.a.dataset.selected,'true');assert.equal(c.opened.size,1);
});
test('status placement stays within the card and avoids an occupied panel when space exists',()=>{
  const c=setup();vm.runInContext(source('clamp')+source('getTokenStatusPosition'),c);
  c.anchor={left:100,right:148,top:250,bottom:298};c.bounds={width:340,height:740};c.occupied=[];
  const first=vm.runInContext('getTokenStatusPosition(anchor,168,90,bounds,occupied)',c);
  assert.ok(first.x>=8&&first.y>=8&&first.x+168<=332&&first.y+90<=732);
  c.occupied=[first];const second=vm.runInContext('getTokenStatusPosition(anchor,168,90,bounds,occupied)',c);
  assert.ok(second.x+168<=first.x||first.x+168<=second.x||second.y+90<=first.y||first.y+90<=second.y);
});
test('outside click and Escape close panels, while clicks inside and long-release clicks preserve them',()=>{
  const c=setup();const panels=new Map([['soldados-01',{}]]);c.tokenStatusPanels=panels;
  c.closeAllTokenStatus=()=>panels.clear();c.listeners=new Map();c.document={addEventListener:(type,fn)=>c.listeners.set(type,fn)};
  const start=script.indexOf('      document.addEventListener("click", event => {\n        if (!tokenStatusPanels.size');
  // The next priority-listener registration is the end of this independent dismiss block.
  const stop=script.indexOf('      ["pointerdown",',start);
  vm.runInContext(script.slice(start,stop),c);
  c.listeners.get('click')({target:{closest:selector=>selector==='.token-status'?{}:null}});assert.equal(panels.size,1);
  c.statusLongClickToken=c.a;c.statusLongClickUntil=1600;
  c.listeners.get('click')({target:{closest:selector=>selector.includes('data-type')?c.a:null}});assert.equal(panels.size,1);
  c.listeners.get('click')({target:{closest:()=>null}});assert.equal(panels.size,0);
  panels.set('soldados-01',{});let stopped=false;c.listeners.get('keydown')({key:'Escape',preventDefault(){},stopImmediatePropagation(){stopped=true}});
  assert.equal(panels.size,0);assert.equal(stopped,true);
});

test('context menus during a hold cannot bubble into map selection actions',()=>{
  const c=setup();c.e=c.event();vm.runInContext('beginTokenPress(e,a)',c);c.hold();
  const start=script.indexOf('token.addEventListener("contextmenu", event => {');
  const end=script.indexOf('          if (performance.now() < suppressContextMenuUntil)',start);
  const body=script.slice(start+'token.addEventListener("contextmenu", event => {'.length,end);
  c.token=c.a;let prevented=false,stopped=false;
  c.contextEvent={pointerId:1,preventDefault(){prevented=true},stopPropagation(){stopped=true}};
  vm.runInContext('(event => {'+body+'})(contextEvent)',c);
  assert.equal(prevented,true);assert.equal(stopped,true);
});
