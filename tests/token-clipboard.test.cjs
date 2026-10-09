const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);return script.slice(start,script.indexOf('\n      }',start)+8);}
const context=vm.createContext({});vm.runInContext(source('getTokenPasteTargets'),context);
test('ghost placement follows the requested grid cell preserving mixed-size formation',()=>{
 const items=[{cell:{col:2,row:2,size:2}},{cell:{col:5,row:3,size:1}}];
 const result=context.getTokenPasteTargets(items,7,4);
 assert.equal(result[0].col,7);assert.equal(result[0].row,4);assert.equal(result[1].col,10);assert.equal(result[1].row,5);assert.equal(result[0].size,2);
});
test('confirmation refuses one occupied footprint without splitting the group or adding history',()=>{
 let checks=0,changed=false;const c=vm.createContext({tokenPasteSession:{valid:true,targets:[{},{}]},canPlaceTokenFootprint:()=>++checks===1,cancelWorkspaceGestures(){changed=true}});
 vm.runInContext(source('confirmTokenPaste'),c);assert.equal(c.confirmTokenPaste(),false);assert.equal(changed,false);assert.ok(c.tokenPasteSession);
});
test('copy snapshots health, status and geometry independently of source mutations',()=>{
 const token={isConnected:true,cell:{col:1,row:2,size:3},info:{typeId:'soldier',life:4000,maxLife:10000,status:'Ferido'}};
 const c=vm.createContext({state:{touchMode:false,isMoving:false},hasPriorityTool:()=>false,getSelectedTokensInNumberOrder:()=>[token],getTokenInfo:t=>t.info,getTokenGridState:t=>t.cell,commandBar:null,tokenDockStatus:{},tokenClipboard:[]});vm.runInContext(source('copySelectedTokens'),c);
 assert.equal(c.copySelectedTokens(),true);token.info.life=100;token.cell.col=8;assert.equal(c.tokenClipboard[0].life,4000);assert.equal(c.tokenClipboard[0].cell.col,1);assert.equal(c.tokenClipboard[0].status,'Ferido');c.state.touchMode=true;assert.equal(c.copySelectedTokens(),false);
});
test('group paste undo and redo are atomic, including an occupied redo rejection',()=>{
 const a={dataset:{},isConnected:true,remove(){this.isConnected=false}},b={dataset:{},isConnected:true,remove(){this.isConnected=false}};
 const entry={kind:'spawn-group',items:[{token:a,cell:{col:1,row:1,size:1}},{token:b,cell:{col:2,row:1,size:1}}]};let free=true;
 const c=vm.createContext({state:{isMoving:false},hasPriorityTool:()=>false,movementHistory:[entry],movementRedoHistory:[],tokens:[a,b],cancelWorkspaceGestures(){},deselectToken(){},closeTokenStatus(){},cancelTokenDeath(){},updateAllTokens(){},updateMovementHistoryUI(){},canPlaceTokenFootprint:()=>free,workspaceLayers:{append(t){t.isConnected=true}},debugLog(){}});
 vm.runInContext(source('undoLastMovement')+'\n'+source('redoLastMovement'),c);assert.equal(c.undoLastMovement(),true);assert.equal(c.tokens.length,0);assert.equal(c.movementRedoHistory.length,1);free=false;assert.equal(c.redoLastMovement(),false);assert.equal(c.tokens.length,0);free=true;assert.equal(c.redoLastMovement(),true);assert.equal(c.tokens.length,2);assert.equal(c.tokens[0],a);assert.equal(c.tokens[1],b);
});

test('Ctrl+V starts only a ghost without creating real instances or history',()=>{
 const node=()=>({children:[],style:{},dataset:{},setAttribute(){},append(n){this.children.push(n)},remove(){this.removed=true}});
 const c=vm.createContext({state:{touchMode:false,isMoving:false},isMasterMode:()=>true,hasPriorityTool:()=>false,tokenClipboard:[{typeId:'soldier',cell:{col:1,row:2,size:1},life:4000,maxLife:10000,status:'Ferido'}],TOKEN_TYPES:{soldier:{image:'soldier.png'}},document:{createElement:node,body:node()},cancelWorkspaceGestures(){},tokenPasteSession:null,tokenPastePointer:{x:123,y:456},cameraViewport:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},updateTokenPasteGhost(x,y){c.position=[x,y]},tokenDockStatus:{}});
 vm.runInContext(source('pasteCopiedTokens'),c);assert.equal(c.pasteCopiedTokens(),true);assert.equal(c.document.body.children.length,1);assert.deepEqual(c.position,[123,456]);assert.equal(c.tokenPasteSession.snapshots[0].life,4000);assert.notEqual(c.tokenPasteSession.snapshots,c.tokenClipboard);
});
test('valid confirmation creates all snapshots and a single undo entry only after the click',()=>{
 const snapshots=[{typeId:'soldier',life:4000,maxLife:10000,status:'Ferido',cell:{size:2}},{typeId:'soldier',life:9000,maxLife:10000,status:'Normal',cell:{size:1}}];
 const c=vm.createContext({tokenPasteSession:{valid:true,snapshots,targets:[{col:3,row:4,size:2},{col:6,row:4,size:1}]},canPlaceTokenFootprint:()=>true,cancelWorkspaceGestures(){c.tokenPasteSession=null},buildTokenInstance:()=>({dataset:{},info:{}}),getTokenInfo:t=>t.info,workspaceLayers:{append(){}},tokens:[],movementHistory:[],movementRedoHistory:[{}],MOVEMENT_HISTORY_LIMIT:50,updateTokenHealthVisuals(){},updateAllTokens(){},selectTokenSet(items){c.selected=items},updateMovementHistoryUI(){},tokenDockStatus:{}});
 vm.runInContext(source('confirmTokenPaste'),c);assert.equal(c.confirmTokenPaste(),true);assert.equal(c.tokens.length,2);assert.equal(c.tokens[0].info.life,4000);assert.equal(c.tokens[0].dataset.gridSize,'2');assert.equal(c.movementHistory.length,1);assert.equal(c.movementHistory[0].kind,'spawn-group');assert.equal(c.movementRedoHistory.length,0);assert.equal(c.selected.length,2);assert.equal(c.tokenPasteSession,null);
});
test('blocked click flashes the entire ghost, keeps it active and prevents underlying gestures',()=>{
 let flashed=0,prevented=0,stopped=0;const c=vm.createContext({tokenPasteSession:{ghost:{getAnimations:()=>[],animate(){flashed++}}},tokenPasteRelease:null,tokenPasteClickUntil:0,cameraViewport:{contains:()=>true},updateTokenPasteGhost(){},confirmTokenPaste:()=>false,tokenDockStatus:{},performance:{now:()=>0}});
 vm.runInContext(source('dispatchTokenPasteInput'),c);c.dispatchTokenPasteInput({type:'pointerdown',pointerType:'mouse',pointerId:1,button:0,clientX:10,clientY:20,target:{closest:()=>null},preventDefault(){prevented++},stopImmediatePropagation(){stopped++}});assert.equal(flashed,1);assert.equal(prevented,1);assert.equal(stopped,1);assert.ok(c.tokenPasteSession);assert.equal(c.tokenPasteRelease,1);
});
test('Escape cancels the ghost without creating tokens',()=>{
 const c=vm.createContext({tokenPasteSession:{ghost:{remove(){c.removed=true}}},tokenPasteRelease:null});vm.runInContext(source('cancelTokenPaste')+'\n'+source('dispatchTokenPasteInput'),c);c.dispatchTokenPasteInput({type:'keydown',key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.equal(c.tokenPasteSession,null);assert.equal(c.removed,true);
});
