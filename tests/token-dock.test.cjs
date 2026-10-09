const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0,name);return script.slice(i,script.indexOf('\n      }',i)+8);}
function context(extra={}){
 const c=vm.createContext({state:{size:48,cameraZoom:1,cameraX:0,cameraY:0,isMoving:false,tokenDockOpen:true},
  TOKEN_TYPES:{soldiers:{id:'soldiers',name:'Soldados',gridSize:1,image:'soldiers.png',maxLife:10000,status:'Normal'}},
  tokenData:new Map([['soldados-01',{}]]),nextTokenInstanceId:1,tokens:[],gridPointMarkers:[],
  workspaceLayers:{clientWidth:480,clientHeight:480},getGridOrigin:()=>({x:0,y:0}),
  clientToWorkspaceLayer:(x,y)=>({x,y,insideViewport:x>=0&&y>=0&&x<480&&y<480}),
  getTokenInfo:t=>t.info,getTokenGridState:t=>t.grid,isMasterMode:()=>true,hasPriorityTool:()=>false,
  ...extra});
 for(const name of ['gridFootprintsOverlap','canPlaceTokenFootprint','getTokenDropCell','nextTokenId'])vm.runInContext(source(name),c);
 return c;
}
test('drop snaps to the grid and rejects occupied cells, destinations and out-of-map footprints',()=>{
 const c=context();assert.deepEqual(JSON.parse(JSON.stringify(c.getTokenDropCell('soldiers',100,110))),{col:2,row:2,size:1});
 c.tokens=[{grid:{col:2,row:2,size:1},info:{life:10000}}];assert.equal(c.getTokenDropCell('soldiers',100,110),null);
 c.tokens[0].info.life=0;assert.ok(c.getTokenDropCell('soldiers',100,110));
 c.gridPointMarkers=[{col:2,row:2,size:1}];assert.equal(c.getTokenDropCell('soldiers',100,110),null);
 assert.equal(c.getTokenDropCell('soldiers',-1,110),null);assert.equal(c.getTokenDropCell('missing',100,100),null);
 c.TOKEN_TYPES.giant={gridSize:3};assert.equal(c.getTokenDropCell('giant',450,450),null);
});
test('drop coordinates respect zoom and pan without changing the fixed grid size',()=>{
 const c=context({clientToWorkspaceLayer:(x,y)=>({x:(x-20)/2,y:(y+40)/2,insideViewport:true})});
 assert.deepEqual(JSON.parse(JSON.stringify(c.getTokenDropCell('soldiers',220,180))),{col:2,row:2,size:1});assert.equal(c.state.size,48);
});
test('new instances receive unique IDs even after their previous instances are undone',()=>{
 const c=context();c.tokenData.set('soldiers-01',{});
 const a=c.nextTokenId('soldiers');c.tokenData.set(a,{});const b=c.nextTokenId('soldiers');assert.notEqual(a,b);assert.notEqual(a,'soldiers-01');
});
test('master pawn toggles the dock and disabled master mode prevents opening',()=>{
 const c=context({tokenDock:{dataset:{},contains:()=>false},tokenDockList:{querySelectorAll:()=>[]},masterTokenButton:{setAttribute(k,v){this[k]=v},focus(){}},setSceneDockOpen(){},cancelTokenDockDrag(){},document:{activeElement:null}});
 vm.runInContext(source('syncTokenDockAvailability')+source('setTokenDockOpen'),c);
 c.setTokenDockOpen(true);assert.equal(c.tokenDock.dataset.open,'true');assert.equal(c.tokenDock.inert,false);
 c.setTokenDockOpen(false);assert.equal(c.tokenDock.inert,true);assert.equal(c.masterTokenButton['aria-expanded'],'false');
 c.isMasterMode=()=>false;c.setTokenDockOpen(true);assert.equal(c.state.tokenDockOpen,false);
 assert.match(source('setMasterMode'),/setTokenDockOpen\(false/);
});
function dragContext(){
 const captures=new Set();let stopped=0;
 const node=()=>({children:[],dataset:{},style:{},append(...children){this.children.push(...children)},remove(){this.removed=true},setAttribute(){}});
 const target={setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
 const c=context({notifyPriorityToolBlocked(){c.warned=(c.warned||0)+1},tokenDockDrag:null,document:{createElement:node,body:node()},cancelWorkspaceGestures(){},tokenDockStatus:{},
  getDockDropAtClient:(id,x,y)=> x>=0&&x<480&&y>=0&&y<480?c.getTokenDropCell(id,x,y):null,
  cameraViewport:{getBoundingClientRect:()=>({left:0,top:0})},createTokenFromType(id,cell){c.created={id,cell}}});
 for(const name of ['updateTokenDockGhost','cancelTokenDockDrag','beginTokenDockDrag','dispatchTokenDockInput'])vm.runInContext(source(name),c);
 c.event=(type,changes={})=>({type,pointerId:9,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:100,clientY:600,currentTarget:target,cancelable:true,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){stopped++},...changes});
 c.captures=captures;c.stops=()=>stopped;return c;
}
test('mouse and touch drag preview snaps then creates exactly one token on release',()=>{
 for(const pointerType of ['mouse','touch']){
  const c=dragContext();c.beginTokenDockDrag(c.event('pointerdown',{pointerType}),'soldiers');assert.ok(c.captures.has(9));
  const ghost=c.tokenDockDrag.ghost;c.dispatchTokenDockInput(c.event('pointermove',{pointerType,clientY:110}));
  assert.equal(ghost.style.left,'96px');assert.equal(ghost.dataset.valid,'true');assert.equal(c.created,undefined);
  c.dispatchTokenDockInput(c.event('pointerup',{pointerType,clientY:110,buttons:0}));assert.equal(c.created.id,'soldiers');assert.equal(c.created.cell.col,2);assert.equal(c.tokenDockDrag,null);assert.equal(c.captures.size,0);assert.ok(ghost.removed);assert.equal(c.stops(),2);
 }
});
test('clicks, outside drops, second finger, cancellation and mouse-button loss do not create tokens',()=>{
 for(const cancel of ['click','outside','pointercancel','lostpointercapture','second-touch','released-mouse','blur']){
  const c=dragContext();c.beginTokenDockDrag(c.event('pointerdown'),'soldiers');
  if(cancel==='click')c.dispatchTokenDockInput(c.event('pointerup'));
  else if(cancel==='outside')c.dispatchTokenDockInput(c.event('pointerup',{clientX:900}));
  else if(cancel==='second-touch')c.dispatchTokenDockInput(c.event('pointerdown',{pointerType:'touch',pointerId:10}));
  else if(cancel==='released-mouse')c.dispatchTokenDockInput(c.event('pointermove',{buttons:0,clientY:110}));
  else if(cancel==='blur')c.cancelTokenDockDrag();
  else c.dispatchTokenDockInput(c.event(cancel));
  assert.equal(c.created,undefined,cancel);assert.equal(c.tokenDockDrag,null,cancel);assert.equal(c.captures.size,0,cancel);
 }
 assert.match(source('cancelWorkspaceGestures'),/cancelTokenDockDrag\(\)/);
});
test('exclusive tools, animation and master-off prevent beginning a template drag',()=>{
 for(const guard of ['master','priority','moving']){
  const c=dragContext();if(guard==='master')c.isMasterMode=()=>false;if(guard==='priority')c.hasPriorityTool=()=>true;if(guard==='moving')c.state.isMoving=true;
  c.beginTokenDockDrag(c.event('pointerdown'),'soldiers');assert.equal(c.tokenDockDrag,null);
 }
});
test('UI overlays cannot be drop targets even when covering valid map coordinates',()=>{
 const c=context({document:{elementFromPoint:()=>({closest:()=>({})})},cameraViewport:{contains:()=>true}});
 vm.runInContext(source('getDockDropAtClient'),c);assert.equal(c.getDockDropAtClient('soldiers',100,110),null);
 c.document.elementFromPoint=()=>({closest:()=>null});assert.ok(c.getDockDropAtClient('soldiers',100,110));
 c.cameraViewport.contains=()=>false;assert.equal(c.getDockDropAtClient('soldiers',100,110),null);
});
test('created units are fully initialized and undo/redo preserve canonical identity and data',()=>{
 const node=tag=>({tag,children:[],dataset:{},attrs:{},style:{setProperty(){}},classList:{add(){},remove(){}},
  append(...children){this.children.push(...children);children.forEach(n=>{n.isConnected=true})},setAttribute(k,v){this.attrs[k]=v},addEventListener(){},remove(){this.isConnected=false},querySelector:()=>null});
 const layer=node('section');layer.clientWidth=480;layer.clientHeight=480;
 const c=context({document:{createElement:node},workspaceLayers:layer,tokenIds:new WeakMap(),TOKEN_RESIZE_ENABLED:false,
  movementHistory:[],movementRedoHistory:[],MOVEMENT_HISTORY_LIMIT:5,tokenDockStatus:{},
  initializeTokenDamage(t){t.damageInitialized=true},initializeTokenInteraction(t){t.interactionInitialized=true},updateTokenGeometry(t){t.positioned=true},
  updateMovementHistoryUI(){},cancelWorkspaceGestures(){},deselectToken(){},closeTokenStatus(){},updateAllTokens(){},debugLog(){}});
 for(const name of ['registerTokenData','getTokenInfo','buildTokenInstance','createTokenFromType','undoLastMovement','redoLastMovement'])vm.runInContext(source(name),c);
 const t=c.createTokenFromType('soldiers',{col:2,row:2,size:1});assert.ok(t.damageInitialized&&t.interactionInitialized&&t.positioned);assert.equal(t.dataset.selected,'false');
 const info=c.getTokenInfo(t);assert.equal(info.life,10000);assert.equal(info.typeId,'soldiers');assert.equal(c.tokens.length,1);assert.equal(c.movementHistory[0].kind,'spawn');
 assert.equal(c.undoLastMovement(),true);assert.equal(c.tokens.length,0);assert.equal(t.isConnected,false);assert.equal(c.getTokenInfo(t),info);
 assert.equal(c.redoLastMovement(),true);assert.equal(c.tokens[0],t);assert.equal(c.getTokenInfo(t).id,info.id);assert.equal(c.getTokenInfo(t).life,10000);
 assert.equal(c.undoLastMovement(),true);const second=c.createTokenFromType('soldiers',{col:2,row:2,size:1});assert.notEqual(c.getTokenInfo(second).id,info.id);assert.equal(c.movementRedoHistory.length,0);
});

test('priority blocks mouse and touch token drags and points to the active tool',()=>{
 for(const pointerType of ['mouse','touch']){const c=dragContext();c.hasPriorityTool=()=>true;c.beginTokenDockDrag(c.event('pointerdown',{pointerType}),'soldiers');assert.equal(c.warned,1);assert.equal(c.tokenDockDrag,null);assert.equal(c.captures.size,0);}
});
test('priority-disabled dock items remain event targets but master and movement still disable them',()=>{
 const button={setAttribute(k,v){this[k]=v}},c=context({tokenDockList:{querySelectorAll:()=>[button]}});vm.runInContext(source('syncTokenDockAvailability'),c);c.hasPriorityTool=()=>true;c.syncTokenDockAvailability();assert.equal(button.disabled,false);assert.equal(button['aria-disabled'],'true');c.hasPriorityTool=()=>false;c.syncTokenDockAvailability();assert.equal(button['aria-disabled'],'false');c.state.isMoving=true;c.syncTokenDockAvailability();assert.equal(button.disabled,true);
});
