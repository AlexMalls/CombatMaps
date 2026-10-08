// Probe only: real scene-loading/layout functions with a lightweight DOM adapter.
// Results exclude browser layout/paint, decoded-image memory, GPU and mobile FPS.
// Run: node scripts/benchmark-scenes.cjs
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{performance}=require('node:perf_hooks'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0,name);return script.slice(i,script.indexOf('\n      }',i)+8);}
function probe(sceneCount,perScene){
 const scenes=Array.from({length:sceneCount},(_,i)=>({id:`scene-${i}`,name:`Scene ${i}`,grid:{visible:true,absolute:false,size:32,opacity:5,distance:1.5},workspaceTokens:Array.from({length:perScene},(_,j)=>({
  dataset:{gridCol:String(j%60-30),gridRow:String(Math.floor(j/60)-30),gridSize:'1'},info:{life:10000},remove(){this.isConnected=false},setAttribute(){},removeAttribute(){}
 }))}));
 const c=vm.createContext({Math,scenes,activeSceneId:scenes[0].id,tokens:scenes[0].workspaceTokens.slice(),
  state:{visible:true,absolute:false,size:32,opacity:5,distance:1.5,isMoving:false},sceneEditor:{open:false},tokenTemplateEditor:{open:false},
  workspaceLayers:{clientWidth:4096,clientHeight:4096,append(t){t.isConnected=true}},movementHistory:[],movementRedoHistory:[],appliedWorkspaceGeometry:'4096x4096@32',
  isMasterMode:()=>true,getTokenInfo:t=>t.info,cancelWorkspaceGestures(){},clearTokenSelection(){},closeAllTokenStatus(){},clearAllGridPoints(){},clearGridHighlights(){},cancelTokenDeath(){},
  setVisible(v){c.state.visible=v},setAbsolute(v){c.state.absolute=v},distanceControl:{set(v){c.state.distance=v}},opacityControl:{set(v){c.state.opacity=v}},
  sizeControl:{set(v){const entries=c.tokens.map(c.getTokenGridState);const plan=c.planWorkspaceLayout(entries,4096,4096,v);assert.ok(plan);c.state.size=plan.cell;
   const applied=c.planWorkspaceLayout(entries,4096,4096,plan.cell);applied.positions.forEach((p,i)=>Object.assign(c.tokens[i].dataset,{gridCol:String(p.col),gridRow:String(p.row)}));c.appliedWorkspaceGeometry=`4096x4096@${plan.cell}`;}},
  updates:0,updateTokenGeometry(){c.updates++},updateTokenSelectionNumbers(){},updateGridPointMarkers(){},setCameraTransform(){},renderActiveSceneBackground(){},updateMovementHistoryUI(){},renderSceneDock(){},tokenDockStatus:{}});
 for(const name of ['getTokenGridState','gridFootprintsOverlap','planWorkspaceLayout','getSceneGridSettings','settleSceneTokenDeaths','updateAllTokens','loadScene'])vm.runInContext(source(name),c);
 c.updates=0;c.updateAllTokens();assert.equal(c.updates,perScene); // inactive tokens are not traversed.
 const samples=[];
 for(let i=0;i<30;i++){
  const id=scenes[(i+1)%sceneCount].id,t=performance.now();c.loadScene(id);if(i>=5)samples.push(performance.now()-t);
 }
 samples.sort((a,b)=>a-b);
 return {scenes:sceneCount,tokensPerScene:perScene,totalTokens:sceneCount*perScene,updatedTokensPerRefresh:perScene,logicSwitchMedianMs:+samples[Math.floor(samples.length/2)].toFixed(3),logicSwitchP95Ms:+samples[Math.floor(samples.length*.95)].toFixed(3)};
}
const results=[probe(2,100),probe(15,100),probe(15,250),probe(15,500),probe(15,1000)];
console.log(JSON.stringify({scope:'Node.js logic only; 4096x4096 map, 32px cells, no browser rendering/image decoding',runtime:process.version,results},null,2));
