const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);return i<0?'':script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
  const captures=new Set();const node=()=>({attrs:{},dataset:{},classList:{add(){}},setAttribute(k,v){this.attrs[k]=String(v)}});
  const c=vm.createContext({state:{size:48,cameraZoom:1,cameraX:0,cameraY:0,activeTool:'highlight'},
    workspaceLayers:{clientWidth:960,clientHeight:720},cameraViewport:{clientWidth:960,clientHeight:720,getBoundingClientRect:()=>({left:10,top:20,right:970,bottom:740})},
    workspaceCard:{setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)},
    captures,highlightCells:new Map(),highlightTouches:new Set(),highlightBlocked:false,highlightSession:null,
    highlightCellsLayer:{children:[],append(n){this.children.push(n)},replaceChildren(...children){this.children=children}},highlightGuide:node(),
    document:{createElementNS:node}});
  for(const name of ['clamp','getGridOrigin','cameraViewportPoint','clientToWorkspaceLayer','releaseWorkspacePointer','getHighlightCells','highlightPointAtClient','createHighlightCell','renderHighlightCells','markHighlightSegment',
    'renderHighlightGuide','finishHighlightStroke','clearGridHighlights','ownsHighlightPointer','dispatchHighlightInput'])vm.runInContext(source(name),c);
  c.send=(type,overrides={})=>{c.event={type,pointerId:1,pointerType:'mouse',button:0,buttons:1,isPrimary:true,clientX:490,clientY:380,...overrides};vm.runInContext('dispatchHighlightInput(event)',c)};
  return c;
}
test('segment traversal fills horizontal, vertical and diagonal cells without holes',()=>{
  const c=setup();c.origin={x:0,y:0};c.start={x:24,y:24};
  for(const [end,expected] of [[{x:216,y:24},['0,0','1,0','2,0','3,0','4,0']], [{x:24,y:168},['0,0','0,1','0,2','0,3']], [{x:168,y:168},['0,0','1,1','2,2','3,3']]]){
    c.end=end;const cells=vm.runInContext('getHighlightCells(start,end,48,origin)',c);
    assert.deepEqual(Array.from(cells,p=>`${p.col},${p.row}`),expected);
  }
});
test('mouse and touch preview without committing, then release commits or erases',()=>{
 for(const pointerType of ['mouse','touch']){
  const c=setup();c.send('pointerdown',{pointerType});assert.equal(c.highlightCells.size,0);assert.equal(c.highlightCellsLayer.children.length,1);
  c.send('pointermove',{pointerType,clientX:730});assert.equal(c.highlightCells.size,0);assert.equal(c.highlightCellsLayer.children.length,6);assert.equal(c.highlightGuide.dataset.active,'true');
  c.send('pointerup',{pointerType,buttons:0,clientX:730});assert.equal(c.highlightCells.size,6);assert.equal(c.highlightSession,null);assert.equal(c.captures.size,0);
  c.send('pointerdown',{pointerType});assert.equal(c.highlightSession.erase,true);assert.equal(c.highlightCells.size,6);assert.equal(c.highlightCellsLayer.children.length,5);
  c.send('pointermove',{pointerType,clientX:730});assert.equal(c.highlightCells.size,6);assert.equal(c.highlightCellsLayer.children.length,0);
  c.send('pointerup',{pointerType,buttons:0,clientX:730});assert.equal(c.highlightCells.size,0);assert.equal(c.highlightGuide.dataset.active,'false');
 }
});
test('single clicking a committed cell toggles it off; crossing unmarked cells while erasing never marks them',()=>{
 const c=setup();c.send('pointerdown');c.send('pointerup',{buttons:0});assert.equal(c.highlightCells.size,1);
 c.send('pointerdown');c.send('pointerup',{buttons:0});assert.equal(c.highlightCells.size,0);
 c.send('pointerdown');c.send('pointerup',{buttons:0});c.send('pointerdown');c.send('pointermove',{clientX:730});c.send('pointerup',{buttons:0,clientX:730});assert.equal(c.highlightCells.size,0);
});
test('hover does not paint; right click clears marks without disabling the tool',()=>{
  const c=setup();c.send('pointermove');assert.equal(c.highlightCells.size,0);
  c.send('pointerdown');c.send('pointerup',{buttons:0});c.send('contextmenu');
  assert.equal(c.highlightCells.size,0);assert.equal(c.highlightCellsLayer.children.length,0);assert.equal(c.state.activeTool,'highlight');
});
test('two fingers clear and suppress painting until the gesture is released',()=>{
  const c=setup();c.send('pointerdown',{pointerType:'touch'});
  c.send('pointerdown',{pointerType:'touch',pointerId:2,isPrimary:false,clientX:600});assert.equal(c.highlightCells.size,0);
  c.send('pointermove',{pointerType:'touch',clientX:800});assert.equal(c.highlightCells.size,0);
  c.send('pointerup',{pointerType:'touch',pointerId:2,isPrimary:false,buttons:0});c.send('pointerup',{pointerType:'touch',buttons:0});
  c.send('pointerdown',{pointerType:'touch'});assert.equal(c.highlightCells.size,0);c.send('pointerup',{pointerType:'touch',buttons:0});assert.equal(c.highlightCells.size,1);
});
test('zoomed cell painting uses map coordinates and keeps the guide aligned',()=>{
  const c=setup();c.state.cameraZoom=2;c.state.cameraX=-480;c.state.cameraY=-360;
  c.send('pointerdown');c.send('pointermove',{clientX:682});assert.equal(c.highlightCells.size,0);assert.equal(c.highlightCellsLayer.children.length,3);
  assert.equal(c.highlightGuide.attrs.x1,'480');assert.equal(c.highlightGuide.attrs.x2,'576');
  assert.equal(Number(c.highlightGuide.attrs.x2)*c.state.cameraZoom+c.state.cameraX,672);
});
test('outside release and cancellation discard previews without changing committed marks',()=>{
  const c=setup();c.send('pointerdown');c.send('pointerup',{buttons:0});c.send('pointerdown',{clientX:730});c.send('pointerup',{buttons:0,clientX:2000});assert.equal(c.highlightSession,null);assert.equal(c.captures.size,0);assert.equal(c.highlightCells.size,1);
  c.send('pointerdown');c.send('pointercancel');assert.equal(c.highlightSession,null);assert.equal(c.highlightCells.size,1);
});

test('touch long-press context menus do not clear marks',()=>{
  const c=setup();c.send('pointerdown',{pointerType:'touch'});c.send('contextmenu',{pointerType:'touch'});assert.equal(c.highlightCells.size,0);assert.ok(c.highlightSession);c.send('pointerup',{pointerType:'touch',buttons:0});assert.equal(c.highlightCells.size,1);
});
test('preview follows only current endpoint instead of retaining an earlier curved path',()=>{
 const c=setup();c.send('pointerdown');c.send('pointermove',{clientX:634});assert.equal(c.highlightCellsLayer.children.length,4);
 c.send('pointermove',{clientX:490,clientY:524,getCoalescedEvents:()=>[{clientX:634,clientY:380}]});assert.equal(c.highlightCellsLayer.children.length,4);assert.equal(c.highlightSession.preview.has('3,0'),false);
 c.send('pointerup',{clientX:490,clientY:524,buttons:0});assert.equal(c.highlightCells.size,4);assert.ok(c.highlightCells.has('0,3'));assert.equal(c.highlightCells.has('3,0'),false);
});

test('exact corner endpoints in opposing directions do not paint beyond the pointer',()=>{
  const c=setup();c.origin={x:0,y:0};
  for(const [start,end,want] of [[{x:24,y:72},{x:48,y:48},['0,1','1,1']], [{x:72,y:24},{x:48,y:48},['1,0','1,1']], [{x:72,y:72},{x:48,y:48},['1,1']]]){
    c.start=start;c.end=end;const cells=vm.runInContext('getHighlightCells(start,end,48,origin)',c);
    assert.deepEqual(Array.from(cells,p=>`${p.col},${p.row}`),want);
  }
});
