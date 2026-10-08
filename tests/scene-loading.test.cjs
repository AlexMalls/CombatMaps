const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0,name);return script.slice(i,script.indexOf('\n      }',i)+8);}
function plain(v){return JSON.parse(JSON.stringify(v));}
test('custom backgrounds fit uniformly across viewports while preserving saved layout',()=>{
 const c=vm.createContext({Math});vm.runInContext(source('fitSceneImageForViewport'),c);
 const rect={x:100,y:0,width:200,height:400},canvas={width:800,height:400};
 assert.deepEqual(plain(c.fitSceneImageForViewport(rect,canvas,400,800)),{x:50,y:300,width:100,height:200});
 assert.deepEqual(rect,{x:100,y:0,width:200,height:400});
});
test('scene docks share the tab design and active scene is announced by its button',()=>{
 assert.match(html,/id="master-scenes"/);assert.match(html,/id="scene-dock" class="token-dock/);assert.match(html,/id="scene-name"/);assert.match(html,/id="scene-preview-universe"/);
 assert.match(source('renderSceneDock'),/aria-pressed/);assert.match(source('initializeDefaultScenes'),/Formação de teste/);
});
function sceneWorkspace(){
 const node=(id,life=10000)=>({id,info:{id,life,maxLife:10000},dataset:{},tabIndex:0,remove(){this.attached=false},setAttribute(k,v){this[k]=v},removeAttribute(k){delete this[k]}});
 const first=node('soldier-1',7000),second=node('soldier-2'),dead=node('soldier-3',0);
 const c=vm.createContext({Math,state:{masterMode:true,isMoving:false,size:48,distance:1.5,opacity:5,visible:true,absolute:false},
  activeSceneId:'a',tokens:[first,dead],scenes:[{id:'a',name:'A',grid:{size:48,distance:1.5,opacity:5,visible:true,absolute:false}},{id:'b',name:'B',grid:{size:64,distance:2,opacity:20,visible:false,absolute:true},workspaceTokens:[second]}],
  sceneEditor:{open:false},movementHistory:[{kind:'health',token:first,before:8000,after:7000}],movementRedoHistory:[{kind:'movement',token:first}],appliedWorkspaceGeometry:'480x480@48',
  workspaceLayers:{clientWidth:480,clientHeight:480,append(t){t.attached=true}},isMasterMode(){return c.state.masterMode},getTokenGridState:t=>t.cell||{col:0,row:0,size:1},getTokenInfo:t=>t.info,cancelTokenDeath(t){t.dataset.dead='false';c.settled=(c.settled||0)+1},
  cancelWorkspaceGestures(){c.cancelled=true},clearTokenSelection(){c.selectionCleared=true},closeAllTokenStatus(){c.panelsClosed=true},clearAllGridPoints(){},clearGridHighlights(){},
  setVisible(v){c.state.visible=v},setAbsolute(v){c.state.absolute=v},distanceControl:{set(v){c.state.distance=v}},opacityControl:{set(v){c.state.opacity=v}},sizeControl:{set(v){c.state.size=v;c.appliedWorkspaceGeometry=`480x480@${v}`}},
  setCameraTransform(){c.cameraReset=true},updateAllTokens(){},renderActiveSceneBackground(){},updateMovementHistoryUI(){},renderSceneDock(){},tokenDockStatus:{}});
 for(const name of ['getSceneGridSettings','settleSceneTokenDeaths','loadScene'])vm.runInContext(source(name),c);
 return {c,first,second,dead};
}
test('switching scenes preserves canonical units, health, death and separate undo/redo histories',()=>{
 const {c,first,second,dead}=sceneWorkspace();
 assert.equal(c.loadScene('b'),true);assert.equal(c.tokens[0],second);assert.equal(first.attached,false);assert.equal(dead.dataset.dead,'true');assert.equal(dead.tabIndex,-1);
 assert.equal(c.state.size,64);assert.equal(c.state.distance,2);assert.equal(c.state.visible,false);assert.equal(c.movementHistory.length,0);assert.equal(c.movementRedoHistory.length,0);
 second.info.life=4000;c.movementHistory.push({kind:'health',token:second,before:5000,after:4000});
 assert.equal(c.loadScene('a'),true);assert.equal(c.tokens[0],first);assert.equal(c.tokens[1],dead);assert.equal(first.info.life,7000);assert.equal(c.movementHistory[0].token,first);assert.equal(c.movementRedoHistory[0].token,first);
 assert.equal(c.loadScene('b'),true);assert.equal(c.tokens[0],second);assert.equal(second.info.life,4000);assert.equal(c.movementHistory[0].token,second);assert.ok(c.cancelled&&c.selectionCleared&&c.panelsClosed&&c.cameraReset);
});
test('scene switches are blocked during movement, editing or master-off; new scenes start empty',()=>{
 for(const guard of ['moving','editing','master','unknown','same']){
  const {c,first}=sceneWorkspace();if(guard==='moving')c.state.isMoving=true;if(guard==='editing')c.sceneEditor.open=true;if(guard==='master')c.state.masterMode=false;
  assert.equal(c.loadScene(guard==='unknown'?'missing':guard==='same'?'a':'b'),false,guard);assert.equal(c.tokens[0],first);assert.equal(c.cancelled,undefined);
 }
 const {c}=sceneWorkspace();delete c.scenes[1].workspaceTokens;c.loadScene('b');assert.equal(c.tokens.length,0);
});
test('viewport changes discard incompatible movement history but preserve health undo',()=>{
 const {c,first}=sceneWorkspace();c.loadScene('b');c.workspaceLayers.clientWidth=320;
 c.sizeControl.set=v=>{c.state.size=v;c.appliedWorkspaceGeometry=`320x480@${v}`};
 c.loadScene('a');assert.equal(c.movementHistory.length,1);assert.equal(c.movementHistory[0].token,first);assert.equal(c.movementRedoHistory.length,0);
});
test('default universe and custom background layer are mutually exclusive and retain image geometry',()=>{
 const c=vm.createContext({Math,activeSceneId:'default',scenes:[{id:'default',backgroundUrl:''},{id:'custom',backgroundUrl:'blob:map',canvas:{width:800,height:400},imageRect:{x:100,y:0,width:200,height:400}}],
 workspaceLayers:{clientWidth:400,clientHeight:800},defaultUniverseLayer:{},sceneBackgroundLayer:{},activeSceneBackground:{style:{},getAttribute(){return this.src},removeAttribute(){this.src=undefined}}});
 vm.runInContext(source('fitSceneImageForViewport')+source('renderActiveSceneBackground'),c);
 c.renderActiveSceneBackground();assert.equal(c.defaultUniverseLayer.hidden,false);assert.equal(c.sceneBackgroundLayer.hidden,true);
 c.activeSceneId='custom';c.renderActiveSceneBackground();assert.equal(c.defaultUniverseLayer.hidden,true);assert.equal(c.sceneBackgroundLayer.hidden,false);assert.equal(c.activeSceneBackground.src,'blob:map');assert.equal(c.activeSceneBackground.style.top,'300px');assert.equal(c.activeSceneBackground.style.width,'100px');
 c.activeSceneId='default';c.renderActiveSceneBackground();assert.equal(c.activeSceneBackground.src,undefined);
});
test('token and scene docks share exclusive opening and respect master mode',()=>{
 const control=()=>({dataset:{},setAttribute(k,v){this[k]=v},focus(){},contains:()=>false,querySelectorAll:()=>[]});
 const c=vm.createContext({state:{masterMode:true},isMasterMode(){return c.state.masterMode},tokenDock:control(),sceneDock:control(),tokenDockList:control(),sceneDockList:control(),masterScenesButton:control(),masterTokenButton:control(),document:{activeElement:null},cancelTokenDockDrag(){},syncTokenDockAvailability(){}});
 for(const name of ['syncSceneDockAvailability','setSceneDockOpen','setTokenDockOpen'])vm.runInContext(source(name),c);
 c.setTokenDockOpen(true);c.setSceneDockOpen(true);assert.equal(c.tokenDock.inert,true);assert.equal(c.sceneDock.inert,false);assert.equal(c.masterScenesButton['aria-expanded'],'true');
 c.setTokenDockOpen(true);assert.equal(c.sceneDock.inert,true);assert.equal(c.tokenDock.inert,false);
 c.state.masterMode=false;c.setSceneDockOpen(true);assert.equal(c.sceneDock.inert,true);
});
test('default scenes include two distinct formations without sharing token objects or grid state',()=>{
 const initial={id:'existing'};let next=7;
 const c=vm.createContext({Math,state:{visible:true,absolute:false,size:48,distance:1.5,opacity:5},workspaceLayers:{clientWidth:480,clientHeight:800},scenes:[],tokens:[initial],activeSceneId:null,renderSceneDock(){},buildTokenInstance(type,cell){return {id:++next,type,cell}}});
 vm.runInContext(source('getSceneGridSettings')+source('initializeDefaultScenes'),c);c.initializeDefaultScenes();
 assert.equal(c.activeSceneId,'scene-default');assert.equal(c.scenes.length,2);assert.equal(c.scenes[0].workspaceTokens[0],initial);assert.equal(c.scenes[1].workspaceTokens.length,7);assert.notEqual(c.scenes[0].grid,c.scenes[1].grid);
 assert.equal(new Set(c.scenes[1].workspaceTokens.map(t=>t.id)).size,7);assert.equal(new Set(c.scenes[1].workspaceTokens.map(t=>`${t.cell.col},${t.cell.row}`)).size,7);assert.ok(c.scenes.every(s=>s.backgroundUrl===''));
});
test('relocated token coordinates prevent restoring stale movements even at matching viewport geometry',()=>{
 const {c,first}=sceneWorkspace();c.loadScene('b');c.scenes[0].history.undo.push({kind:'movement',token:first});
 c.sizeControl.set=v=>{c.state.size=v;c.appliedWorkspaceGeometry=`480x480@${v}`;first.cell={col:1,row:0,size:1}};
 c.loadScene('a');assert.equal(c.movementHistory.length,1);assert.equal(c.movementHistory[0].kind,'health');assert.equal(c.movementRedoHistory.length,0);
});
