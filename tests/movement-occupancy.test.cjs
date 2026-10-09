const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const script=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0);return script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
 const mover={grid:{col:0,row:0,size:2},life:10000},stationary={grid:{col:4,row:4,size:1},life:10000};
 const c=vm.createContext({mover,stationary,tokens:[mover,stationary],state:{size:48},workspaceLayers:{clientWidth:480,clientHeight:480},gridPointMarkers:[],nextGridPointId:1,getSelectedTokensInNumberOrder:()=>[mover],getTokenGridState:t=>t.grid,getTokenInfo:t=>({life:t.life}),getGridOrigin:()=>({x:0,y:0}),clientToWorkspaceLayer:(x,y)=>({x,y,insideViewport:true}),debugLog(){},showInvalidGridPoint(){c.invalid=true},gridPointMarkersLayer:{append(){}},document:{createElement:()=>({dataset:{}})},updateGridPointMarkers(){}});
 for(const name of ['gridFootprintsOverlap','footprintOverlapsUnselectedToken','tokenFits','canExecuteMoveSelection','getGridPointForSelectionIndex','getGridPointMarkerAtClient','getGridFootprintRect','removeGridPointById','addGridPointAtClient'])vm.runInContext(source(name),c);return c;
}
test('every cell of a 2x2 token destination is checked against stationary units',()=>{
 const c=setup();assert.equal(c.addGridPointAtClient(3*48+2,3*48+2),null);assert.equal(c.invalid,true);assert.equal(c.gridPointMarkers.length,0);assert.ok(c.addGridPointAtClient(2*48+2,2*48+2));
 c.stationary.life=0;c.gridPointMarkers=[];assert.ok(c.addGridPointAtClient(3*48+2,3*48+2));
});
test('execution rechecks occupancy and cannot move overlapping footprints',()=>{
 const c=setup();c.gridPointMarkers=[{col:3,row:3,size:2}];assert.equal(c.canExecuteMoveSelection(),false);c.gridPointMarkers=[{col:2,row:2,size:2}];assert.equal(c.canExecuteMoveSelection(),true);
 c.tokens.push({grid:{col:3,row:2,size:1},life:10000});assert.equal(c.canExecuteMoveSelection(),false);
});
test('a moving group may exchange starting positions but its final destinations stay disjoint',()=>{
 const c=setup();c.getSelectedTokensInNumberOrder=()=>[c.mover,c.stationary];c.gridPointMarkers=[{col:3,row:3,size:2},{col:0,row:0,size:1}];assert.equal(c.canExecuteMoveSelection(),true);c.gridPointMarkers[1]={col:4,row:4,size:1};assert.equal(c.canExecuteMoveSelection(),false);
});
