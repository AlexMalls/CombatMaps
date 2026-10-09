const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);return script.slice(start,script.indexOf('\n      }',start)+8);}
const context=vm.createContext({});vm.runInContext(source('findTokenPasteTargets'),context);
test('paste preserves mixed-size group formation and avoids occupied footprints',()=>{
 const items=[{cell:{col:2,row:2,size:2}},{cell:{col:5,row:3,size:1}}];
 const result=context.findTokenPasteTargets(items,12,12,cell=>!(cell.col<6&&cell.row<6));
 assert.ok(result);assert.equal(result[1].col-result[0].col,3);assert.equal(result[1].row-result[0].row,1);assert.equal(result[0].size,2);assert.ok(result.every(cell=>cell.col>=6||cell.row>=6));
});
test('paste refuses insufficient space without splitting the group',()=>{
 const items=[{cell:{col:0,row:0,size:2}},{cell:{col:3,row:0,size:2}}];
 assert.equal(context.findTokenPasteTargets(items,4,4,()=>true),null);assert.equal(context.findTokenPasteTargets(items,10,10,()=>false),null);
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
