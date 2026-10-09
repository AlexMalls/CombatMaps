// Run with: node --test tests/*.test.cjs (no dependencies).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Extract the actual inline functions; keep all browser adapters in this test.
function source(name) {
  const start = script.indexOf(`      function ${name}(`);
  if (start < 0) return '';
  return script.slice(start, script.indexOf('\n      }', start) + 8);
}
function layout(entries, width, height, cell) {
  const context = vm.createContext({ entries, width, height, cell });
  vm.runInContext(source('gridFootprintsOverlap') + source('planWorkspaceLayout'), context);
  assert.equal(vm.runInContext('typeof planWorkspaceLayout', context), 'function', 'bounded layout is missing');
  return vm.runInContext('planWorkspaceLayout(entries, width, height, cell)', context);
}
const defaults = [
  {col:0,row:0,size:1}, {col:3,row:1,size:1}, {col:-3,row:-2,size:1},
  {col:5,row:-2,size:1}, {col:-5,row:2,size:1}, {col:1,row:4,size:1}, {col:5,row:4,size:1}
];
function assertReachable(plan, width, height) {
  assert.ok(plan);
  assert.equal(plan.positions.length, 7);
  for (const p of plan.positions) {
    const x = width / 2 - plan.cell / 2 + p.col * plan.cell;
    const y = height / 2 - plan.cell / 2 + p.row * plan.cell;
    assert.ok(x >= 0 && y >= 0 && x + p.size * plan.cell <= width && y + p.size * plan.cell <= height,
      `token outside ${width}x${height}: ${JSON.stringify(p)}`);
  }
  for (let i=0;i<plan.positions.length;i++) for (let j=i+1;j<plan.positions.length;j++) {
    const a=plan.positions[i], b=plan.positions[j];
    assert.ok(a.col+a.size<=b.col || b.col+b.size<=a.col || a.row+a.size<=b.row || b.row+b.size<=a.row,
      `overlapping tokens ${i}/${j}`);
  }
}
test('initial phone layout keeps all seven tokens reachable without overlap', () => {
  const p=layout(defaults,340,740,48); assertReachable(p,340,740); assert.equal(p.cell,48);
});
test('160px grid on a laptop preserves the chosen size and relocates inaccessible tokens', () => {
  const p=layout(defaults,1346,748,160); assertReachable(p,1346,748); assert.equal(p.cell,160);
});
test('large grid on a phone reduces size only enough to fit the tokens', () => {
  const p=layout(defaults,340,740,160); assertReachable(p,340,740); assert.ok(p.cell>=8 && p.cell<160);
});
test('valid layout keeps its coordinates, and repeated reconciliation is stable', () => {
  const p=layout(defaults,1900,1060,48);
  assert.deepEqual(JSON.parse(JSON.stringify(p.positions)), defaults);
  const next=layout(p.positions,1900,1060,p.cell);
  assert.deepEqual(JSON.parse(JSON.stringify(next)),JSON.parse(JSON.stringify(p)));
});

function gestureContext() {
  const listeners = new Map(), captured = new Set();
  const card = {dataset:{}, addEventListener(type,fn){
    if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);
  },removeEventListener(){},setPointerCapture(id){captured.add(id)},
    hasPointerCapture(id){return captured.has(id)},releasePointerCapture(id){captured.delete(id)}};
  const ctx=vm.createContext({workspaceCard:card, window:{clearTimeout}, document:{hidden:true},
    performance:{now:()=>1000}, finishExplorerGesture(){},finishSceneImageGesture(){},cancelTokenDockDrag(){},cancelTokenPaste(){}, debugLog(){}, listeners, captured,
    state:{touchMode:false,isMoving:false},desktopCameraPan:null,desktopBlockCandidate:null,
    suppressContextMenuUntil:0,BLOCK_DRAG_THRESHOLD:14,blockProjectionSession:null,
    hasSelectedToken:()=>true, beginBlockProjection(){ctx.blockProjectionSession={pointerType:'mouse'};return true},
    renderBlockProjection(){ctx.renderCount++},renderCount:0,
    finishBlockProjection(){ctx.blockProjectionSession=null},
    touchDeselectPointers:new Map(),touchDeselectCandidate:null,
    canvasTapCandidates:new Map(),tokenTapCandidates:new Map(),lastCanvasPress:{},
    formationSession:null,lassoSession:null,touchBlockRenderFrame:0,pendingTouchBlockCentroid:null,
    cancelAnimationFrame(){},threeFingerPointers:new Map(),threeFingerGestureLatched:false,
    stopMagicTrail(){},finishRulerMeasurement(){},finishHighlightStroke(){},highlightTouches:new Set(),highlightBlocked:false,finishTokenStatusDrag(){}, cancelAllTokenPresses(){ctx.tokenTapCandidates.clear()},removeFormationPreviewMarkers(){},updateGridPointMarkers(){},
    movementGuidesLayer:{dataset:{}},lasso:{dataset:{}},lassoPath:{setAttribute(){}},
    closeTokenActionMenu(){},finishDesktopCameraPan(){ctx.desktopCameraPan=null},
    moveLasso(){},finishLasso(){},cancelLasso(){}
  });
  for(const name of ['releaseWorkspacePointer','cancelBlockProjection','cancelPendingCanvasInteractions','finishFormationPlacement',
    'cancelActiveLasso','cancelScheduledTouchBlockRender','resetTouchPairState','cancelWorkspaceGestures']) {
    vm.runInContext(source(name),ctx);
  }
  const blockStart=script.indexOf('      // Desktop: clique direito simples');
  const blockEnd=script.indexOf('      workspaceCard.addEventListener("pointerdown", event => {\n        if (!event.isPrimary',blockStart);
  vm.runInContext(script.slice(blockStart,blockEnd),ctx);
  ctx.event=(type,overrides={})=>{
    const e={pointerId:1,pointerType:'mouse',button:2,buttons:2,clientX:0,clientY:0,
      cancelable:true,preventDefault(){},target:{closest:()=>null},...overrides};
    for(const fn of listeners.get(type)||[])fn(e);
  };
  return ctx;
}
test('returning after an outside release cancels right-drag instead of continuing projection', () => {
  const ctx=gestureContext();ctx.event('pointerdown');ctx.event('pointermove',{clientX:20});
  assert.equal(ctx.renderCount,1);
  ctx.event('pointermove',{clientX:30,buttons:0});
  assert.equal(ctx.desktopBlockCandidate,null);assert.equal(ctx.blockProjectionSession,null);
  assert.equal(ctx.renderCount,1);
});
test('right-drag captures its pointer and releases capture after pointerup', () => {
  const ctx=gestureContext();ctx.event('pointerdown');ctx.event('pointermove',{clientX:20});
  assert.ok(ctx.captured.has(1));ctx.event('pointerup',{buttons:0});assert.equal(ctx.captured.size,0);
  assert.equal(ctx.desktopBlockCandidate,null);
});
test('focus loss clears single-pointer formation, pending timers and token taps', async () => {
  const ctx=gestureContext();let fired=false;
  ctx.formationSession={pointerId:4,baseCount:0};ctx.workspaceCard.dataset.formationActive='true';
  ctx.canvasTapCandidates.set(4,{holdTimer:setTimeout(()=>{fired=true},20)});
  ctx.tokenTapCandidates.set(9,{valid:true});ctx.captured.add(4);
  ctx.window.addEventListener=(type,fn)=>{ctx[type]=fn};ctx.document.addEventListener=()=>{};
  const start=script.indexOf('      window.addEventListener("blur",');
  const end=script.indexOf('      /*',start);
  vm.runInContext(script.slice(start,end),ctx);ctx.blur();
  assert.equal(ctx.formationSession,null);assert.equal(ctx.canvasTapCandidates.size,0);
  assert.equal(ctx.tokenTapCandidates.size,0);assert.equal(ctx.captured.size,0);
  await new Promise(resolve=>setTimeout(resolve,35));assert.equal(fired,false);
});
test('hidden page cancels lasso even when no touch pair remains', () => {
  const ctx=gestureContext();ctx.lassoSession={pointerId:5};ctx.captured.add(5);ctx.lasso.dataset.active='true';
  ctx.window.addEventListener=()=>{};ctx.document.addEventListener=(type,fn)=>{ctx[type]=fn};
  const start=script.indexOf('      window.addEventListener("blur",');
  const end=script.indexOf('      /*',start);
  vm.runInContext(script.slice(start,end),ctx);ctx.visibilitychange();
  assert.equal(ctx.lassoSession,null);assert.equal(ctx.lasso.dataset.active,'false');assert.equal(ctx.captured.size,0);
});

test('grid control reflects the fitted size and writes the bounded positions to the real token datasets', () => {
  const elements=new Map();
  for (const id of ['range','value']) elements.set(id,{
    min:'8',max:'160',step:'1',value:'48',style:{setProperty(){}},
    setAttribute(){},addEventListener(){},select(){}
  });
  const tokens=defaults.map(p=>({dataset:{gridCol:String(p.col),gridRow:String(p.row),gridSize:'1'},
    style:{setProperty(){}},querySelector:()=>null}));
  const ctx=vm.createContext({tokens,state:{size:48,isMoving:false},appliedWorkspaceGeometry:'',
    workspaceLayers:{clientWidth:340,clientHeight:740},grid:{style:{setProperty(){}}},
    document:{getElementById:id=>elements.get(id)},cancelWorkspaceGestures(){},scheduleTokenStatusPositions(){},
    clearAllGridPoints(){},clearMovementHistory(){},clearGridHighlights(){},updateTokenSelectionNumbers(){},updateGridPointMarkers(){}});
  for(const name of ['parseNumber','createNumericControl','gridFootprintsOverlap','planWorkspaceLayout',
    'getGridOrigin','getTokenGridState','constrainWorkspaceCell','applyWorkspaceLayout','updateTokenGeometry','updateAllTokens'])
    vm.runInContext(source(name),ctx);
  vm.runInContext(`control=createNumericControl({rangeId:'range',valueId:'value',stateKey:'size',
    format:v=>({input:String(v),aria:String(v)}),constrain:constrainWorkspaceCell,apply:applyWorkspaceLayout});
    control.set(160)`,ctx);
  assert.equal(elements.get('range').value,String(ctx.state.size));
  assert.equal(elements.get('value').value,String(ctx.state.size));
  assert.ok(ctx.state.size<160);
  const positions=tokens.map(t=>({col:Number(t.dataset.gridCol),row:Number(t.dataset.gridRow),size:1}));
  assertReachable({cell:ctx.state.size,positions},340,740);
  vm.runInContext('state.isMoving=true; control.set(90)',ctx);
  assert.equal(elements.get('range').value,String(ctx.state.size));
  assertReachable({cell:ctx.state.size,positions},340,740);
});

test('resizing across phone, tablet and desktop widths never strands or overlaps the default tokens', () => {
  for(const [width,height] of [[300,600],[340,740],[740,340],[748,1004],[1346,748],[1900,1060]]) {
    for(const cell of [8,48,90,160]) assertReachable(layout(defaults,width,height,cell),width,height);
  }
});

test('changing grid geometry invalidates undo and redo even when current positions still fit', () => {
  const tokens=defaults.map(p=>({dataset:{gridCol:String(p.col),gridRow:String(p.row),gridSize:'1'}}));
  const history=[{items:[{from:{col:12,row:0,size:1}}]}];
  const redo=[{items:[{to:{col:12,row:0,size:1}}]}];
  const ctx=vm.createContext({tokens,state:{size:80,isMoving:false},appliedWorkspaceGeometry:'1280x800@48',
    workspaceLayers:{clientWidth:1280,clientHeight:800},grid:{style:{setProperty(){}}},
    movementHistory:history,movementRedoHistory:redo,
    cancelWorkspaceGestures(){},clearGridHighlights(){},clearAllGridPoints(){},updateAllTokens(){},updateMovementHistoryUI(){},debugLog(){}});
  for(const name of ['gridFootprintsOverlap','planWorkspaceLayout','getTokenGridState','applyWorkspaceLayout','clearMovementHistory'])
    vm.runInContext(source(name),ctx);
  vm.runInContext('applyWorkspaceLayout(80)',ctx);
  assert.equal(history.length,0);assert.equal(redo.length,0);
  assert.deepEqual(tokens.map(t=>({col:Number(t.dataset.gridCol),row:Number(t.dataset.gridRow),size:1})),defaults);
});
