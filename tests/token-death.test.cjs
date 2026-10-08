const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);return script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
  const timers=new Map();let next=0;
  const token={dataset:{tokenId:'soldados-01',selected:'false',gridCol:'2',gridRow:'3',gridSize:'1'},
    isConnected:true,style:{values:{},setProperty(k,v){this.values[k]=v}},attrs:{},
    setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},contains:()=>false,
    getBoundingClientRect:()=>({left:100,right:148,top:200,bottom:248,width:48,height:48}),classList:{add(){},remove(){}}};
  const c=vm.createContext({TOKEN_TYPES:{},token,tokens:[token],tokenIds:new WeakMap(),tokenData:new Map(),tokenDeaths:new Map(),tokenStatusPanels:new Map(),
    tokenLifeFormat:new Intl.NumberFormat('pt-BR'),state:{isMoving:false,touchMode:false},
    movementHistory:[],movementRedoHistory:[],MOVEMENT_HISTORY_LIMIT:5,hasPriorityTool:()=>false,
    scheduleTokenStatusPositions(){},updateMovementHistoryUI(){},debugLog(){},closeTokenStatus(){},
    deselectToken:t=>{t.dataset.selected='false'},closeTokenActionMenu(){},updateTokenGeometry(){},updateTokenSelectionNumbers(){},updateGridPointMarkers(){},updateAllTokens(){},
    requestAnimationFrame:fn=>fn(),window:{setTimeout(fn,delay){const id=++next;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id)},
    workspaceCard:{getBoundingClientRect:()=>({left:0,top:0})},
    tokenStatusLayer:{append(node){c.puff=node}},document:{activeElement:null,createElement(){return {style:{},setAttribute(){},remove(){this.removed=true}}}},
    removeLastGridPoint:()=>false,hasSelectedToken:()=>false,clearTokenSelection(){}});
  for(const name of ['registerTokenData','getTokenInfo','getTokenDamagePercent','updateTokenHealthVisuals','cancelTokenDeath','beginTokenDeath','applyTokenLifeState','changeTokenLife',
    'undoLastMovement','redoLastMovement','undoGridPointOrClearSelection','clearMovementHistory','getTokenGridState','recordMovementHistory'])vm.runInContext(source(name),c);
  vm.runInContext('registerTokenData(token)',c);
  c.run=(text)=>vm.runInContext(text,c);
  c.tick=delay=>{for(const [id,t] of [...timers])if(t.delay===delay){timers.delete(id);t.fn()}};
  c.timers=timers;return c;
}
test('death progresses through flash, grey, puff and hidden without deleting token identity or position',()=>{
  const c=setup();c.run('changeTokenLife(token,-10000)');
  assert.equal(c.token.dataset.deathPhase,'flash');assert.equal(c.token.tabIndex,-1);
  c.tick(620);assert.equal(c.token.dataset.deathPhase,'grey');
  c.tick(900);assert.equal(c.token.dataset.deathPhase,'puff');assert.ok(c.puff);
  c.tick(1520);assert.equal(c.token.dataset.dead,'true');assert.equal(c.puff.removed,true);
  assert.equal(c.token.dataset.gridCol,'2');assert.equal(c.run('getTokenInfo(token).id'),'soldados-01');
});
test('undo during death restores exact previous health and prevents stale timers from hiding the restored token',()=>{
  const c=setup();c.run('getTokenInfo(token).life=1000;changeTokenLife(token,-1000)');
  const queued=[...c.timers.values()].map(t=>t.fn);
  assert.equal(c.run('undoLastMovement()'),true);
  assert.equal(c.run('getTokenInfo(token).life'),1000);assert.equal(c.token.style.values['--token-life-remaining'],'10%');
  assert.equal(c.token.dataset.dead,'false');assert.equal(c.token.tabIndex,0);assert.equal(c.timers.size,0);
  queued.forEach(fn=>fn());assert.equal(c.token.dataset.dead,'false');assert.equal(c.token.dataset.deathPhase,'');
});
test('lethal damage of any size saves the previous health; undo after disappearance and redo remain reversible',()=>{
  const c=setup();c.run('getTokenInfo(token).life=7000;changeTokenLife(token,-9000)');c.tick(620);c.tick(900);c.tick(1520);
  c.run('undoLastMovement()');assert.equal(c.run('getTokenInfo(token).life'),7000);assert.equal(c.token.dataset.dead,'false');
  c.run('redoLastMovement()');assert.equal(c.run('getTokenInfo(token).life'),0);assert.equal(c.token.dataset.deathPhase,'flash');
  c.run('undoLastMovement()');assert.equal(c.run('getTokenInfo(token).life'),7000);assert.equal(c.timers.size,0);
});
test('mobile undo gesture reaches health history and restores previous life',()=>{
  const c=setup();c.state.touchMode=true;c.run('getTokenInfo(token).life=1000;changeTokenLife(token,-1000)');
  assert.equal(c.run('undoGridPointOrClearSelection()'),true);assert.equal(c.run('getTokenInfo(token).life'),1000);
});
test('geometry and mode resets retain health undo and redo while discarding incompatible movements',()=>{
  const c=setup();c.run('changeTokenLife(token,-1000);changeTokenLife(token,-1000);undoLastMovement()');
  c.movementHistory.unshift({items:[]});c.movementRedoHistory.unshift({items:[]});
  c.run('clearMovementHistory("geometria alterada")');assert.equal(c.movementHistory.length,1);assert.equal(c.movementRedoHistory.length,1);
  c.run('undoLastMovement()');assert.equal(c.run('getTokenInfo(token).life'),10000);
});
test('health and movement undo share chronological history instead of skipping the last action',()=>{
  const c=setup();c.run('changeTokenLife(token,-1000)');
  c.movementHistory.push({items:[{token:c.token,tokenId:'soldados-01',from:{col:2,row:3,size:1},to:{col:4,row:5,size:1}}]});
  c.token.dataset.gridCol='4';c.token.dataset.gridRow='5';
  c.run('getTokenInfo(token).life=1000;changeTokenLife(token,-1000);undoLastMovement()');
  assert.equal(c.run('getTokenInfo(token).life'),1000);assert.equal(c.token.dataset.gridCol,'4');
  c.run('undoLastMovement()');c.tick(400);assert.equal(c.token.dataset.gridCol,'2');assert.equal(c.token.dataset.gridRow,'3');
  c.run('undoLastMovement()');assert.equal(c.run('getTokenInfo(token).life'),10000);
});

test('mobile movements and health share history so a newer move is undone before a death',()=>{
  const c=setup();c.state.touchMode=true;c.run('getTokenInfo(token).life=1000;changeTokenLife(token,-1000)');
  const other={dataset:{tokenId:'other',gridCol:'0',gridRow:'0',gridSize:'1'},isConnected:true,classList:{add(){},remove(){}}};
  c.other=other;c.run('recordMovementHistory([{token:other,target:{col:5,row:4,size:1}}])');
  other.dataset.gridCol='5';other.dataset.gridRow='4';
  c.run('undoGridPointOrClearSelection()');c.tick(400);
  assert.equal(other.dataset.gridCol,'0');assert.equal(c.run('getTokenInfo(token).life'),0);
  c.run('undoGridPointOrClearSelection()');assert.equal(c.run('getTokenInfo(token).life'),1000);
});
