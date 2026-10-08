const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);return start<0?'':script.slice(start,script.indexOf('\n      }',start)+8);}
function setup(){
  const captures=new Set(), frames=new Map();let frameId=0;
  const element=()=>({dataset:{},attrs:{},style:{},setAttribute(k,v){this.attrs[k]=String(v)}});
  const label=element();label.offsetWidth=40;label.offsetHeight=20;
  const ctx=vm.createContext({state:{size:48,distance:1.5,cameraZoom:1,cameraX:0,cameraY:0,activeTool:'ruler'},
    workspaceLayers:{clientWidth:960,clientHeight:720},rulerSession:null,rulerFrame:0,highlightSession:null,highlightTouches:new Set(),highlightBlocked:false,finishHighlightStroke(){},
    rulerLayer:element(),rulerLine:element(),rulerGradient:element(),rulerLabel:label,
    rulerNumberFormat:new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}),
    cameraViewport:{clientWidth:960,clientHeight:720,getBoundingClientRect:()=>({left:10,top:20,right:970,bottom:740})},
    workspaceCard:{setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)},
    captures,frames,requestAnimationFrame(fn){const id=++frameId;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id)
  });
  for(const name of ['clamp','getGridOrigin','cameraViewportPoint','clientToWorkspaceLayer','releaseWorkspacePointer',
    'getRulerDistance','getRulerLabelPosition','rulerGridPointAtClient','renderRulerMeasurement','scheduleRulerMeasurement',
    'finishRulerMeasurement','dispatchRulerInput','ownsRulerPointer'])vm.runInContext(source(name),ctx);
  assert.equal(vm.runInContext('typeof dispatchRulerInput',ctx),'function','ruler dispatcher is missing');
  ctx.flush=()=>{for(const [id,fn] of [...frames]){frames.delete(id);fn()}};
  ctx.send=(type,overrides={})=>{
    ctx.event={type,pointerId:1,pointerType:'mouse',button:0,buttons:1,isPrimary:true,clientX:490,clientY:380,...overrides};
    vm.runInContext('dispatchRulerInput(event)',ctx);
  };
  return ctx;
}
test('counts horizontal, diagonal and shortest mixed grid paths',()=>{
  const c=setup();c.start={col:0,row:0};
  for(const [col,row,unit,want] of [[4,0,1.5,6],[4,-4,1.5,6],[3,-5,1,5],[-4,1,1,4],[0,0,1.5,0],[-3,-5,.5,2.5]]){
    c.end={col,row};c.unit=unit;assert.equal(vm.runInContext('getRulerDistance(start,end,unit)',c),want);
  }
});
test('places the label above horizontal lines and left of vertical lines without crossing diagonals',()=>{
  const c=setup();
  for(const [end,wantX,wantY] of [[{x:200,y:100},150,78],[{x:100,y:200},68,150],[{x:200,y:200},150,108]]){
    c.start={x:100,y:100};c.end=end;
    const result=vm.runInContext('getRulerLabelPosition(start,end,40,20)',c);
    assert.equal(result.x,wantX);assert.equal(result.y,wantY);
  }
});
test('mouse drag renders a snapped line and live total then removes both on release',()=>{
  const c=setup();c.send('pointerdown');assert.ok(c.captures.has(1));
  c.send('pointermove',{clientX:682});c.flush();
  assert.equal(c.rulerLabel.textContent,'6');assert.equal(c.rulerLine.attrs.x1,'480');assert.equal(c.rulerLine.attrs.x2,'672');
  assert.equal(c.rulerLayer.dataset.active,'true');c.send('pointerup',{buttons:0});
  assert.equal(c.rulerLayer.dataset.active,'false');assert.equal(c.rulerSession,null);assert.equal(c.captures.size,0);assert.equal(c.frames.size,0);
});
test('touch drag uses a single pointer and cancelling clears the measurement',()=>{
  const c=setup();c.send('pointerdown',{pointerType:'touch'});
  c.send('pointermove',{pointerType:'touch',pointerId:2,clientX:730});c.flush();assert.equal(c.rulerLabel.textContent,'0');
  c.send('pointermove',{pointerType:'touch',clientX:634,clientY:140});c.flush();assert.equal(c.rulerLabel.textContent,'7,5');
  c.send('pointercancel',{pointerType:'touch'});assert.equal(c.rulerSession,null);assert.equal(c.captures.size,0);
});
test('zoom and pan change pixel positions but preserve logical grid distances',()=>{
  const c=setup();c.state.cameraZoom=2;c.state.cameraX=-480;c.state.cameraY=-360;
  c.send('pointerdown');c.send('pointermove',{clientX:874});c.flush();
  assert.equal(c.rulerLabel.textContent,'6');assert.equal(c.rulerLine.attrs.x2,'864');
});
test('ending a captured gesture outside the map and losing the mouse button cannot leave it stuck',()=>{
  const c=setup();c.send('pointerdown');c.send('pointerup',{clientX:1500,buttons:0});assert.equal(c.rulerSession,null);
  c.send('pointerdown');c.send('pointermove',{clientX:600,buttons:0});assert.equal(c.rulerSession,null);assert.equal(c.frames.size,0);
});
test('focus cleanup removes an active ruler and cancels its pending frame',()=>{
  const c=setup();c.send('pointerdown');c.send('pointermove',{clientX:600});
  Object.assign(c,{canvasTapCandidates:new Map(),tokenTapCandidates:new Map(),touchDeselectPointers:new Map(),
    threeFingerPointers:new Map(),formationSession:null,lassoSession:null,desktopCameraPan:null,
    cancelPendingCanvasInteractions(){},finishExplorerGesture(){},cancelTokenDockDrag(){},finishTokenStatusDrag(){}, cancelAllTokenPresses(){},cancelActiveLasso(){},cancelBlockProjection(){},resetTouchPairState(){},closeTokenActionMenu(){}});
  vm.runInContext(source('cancelWorkspaceGestures')+';cancelWorkspaceGestures("blur")',c);
  assert.equal(c.rulerSession,null);assert.equal(c.frames.size,0);assert.equal(c.captures.size,0);assert.equal(c.rulerLayer.dataset.active,'false');
});
test('unexpected capture loss clears only the active measurement pointer',()=>{
  const c=setup();c.workspaceCard.addEventListener=(type,fn)=>{c.lostCapture=fn};
  const start=script.indexOf('      workspaceCard.addEventListener("lostpointercapture", event => {\n        if (rulerSession');
  const end=script.indexOf('      // O arraste de modelos',start);
  vm.runInContext(script.slice(start,end),c);
  c.send('pointerdown');c.lostCapture({pointerId:2});assert.ok(c.rulerSession);
  c.lostCapture({pointerId:1});assert.equal(c.rulerSession,null);assert.equal(c.rulerLayer.dataset.active,'false');
});
