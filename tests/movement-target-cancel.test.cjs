const {test}=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm');
const script=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);assert.ok(start>=0);return script.slice(start,script.indexOf('\n      }',start)+8);}
function setup(){
 const tokens=Array.from({length:5},(_,i)=>({grid:{col:i,row:0,size:1},dataset:{selected:'true'},isConnected:true}));
 const c=vm.createContext({tokens,state:{size:48,selectionOrder:tokens,isMoving:false},gridPointMarkers:[],nextGridPointId:1,workspaceLayers:{clientWidth:960,clientHeight:960},clientToWorkspaceLayer:(x,y)=>({x,y,insideViewport:true}),getGridOrigin:()=>({x:0,y:0}),getTokenGridState:t=>t.grid,getTokenInfo:()=>({life:10000}),debugLog(){},showInvalidGridPoint(){},updateGridPointMarkers(){},gridPointMarkersLayer:{append(){}},movementGuidesLayer:{dataset:{}},tokenActionMenu:{hidden:true},renderMovementGuides(){},setGridPointMarkerGeometry(el,col,row,size,num){el.number=num},document:{createElement:()=>({dataset:{},remove(){this.removed=true}})}});
 for(const name of ['getSelectedTokensInNumberOrder','getGridPointForSelectionIndex','getGridFootprintRect','getGridPointMarkerAtClient','gridFootprintsOverlap','footprintOverlapsUnselectedToken','tokenFits','canExecuteMoveSelection','removeGridPointById','addGridPointAtClient','setGridPointMarkerList','reconcileSelectionArtifacts','snapshotGridPointMarkers','replaceGridPointMarkersFromData','removeFormationPreviewMarkers','setFormationMarkers'])vm.runInContext(source(name),c);
 return c;
}
function place(c,col,row=4){return c.addGridPointAtClient(col*48+24,row*48+24);}
test('cancel a middle destination, refill that token first, and preserve all later targets',()=>{
 const c=setup();for(let i=0;i<4;i++)place(c,i*2);const second=c.gridPointMarkers[1];const third=c.gridPointMarkers[2],fourth=c.gridPointMarkers[3];
 assert.equal(place(c,2),null);assert.equal(second.element.removed,true);assert.equal(c.gridPointMarkers.length,3);assert.equal(c.getGridPointForSelectionIndex(1),null);
 place(c,8);assert.equal(c.getGridPointForSelectionIndex(1).col,8);assert.equal(c.getGridPointForSelectionIndex(2),third);assert.equal(c.getGridPointForSelectionIndex(3),fourth);assert.equal(c.getGridPointForSelectionIndex(4),null);
 place(c,10);assert.equal(c.getGridPointForSelectionIndex(4).col,10);assert.equal(c.canExecuteMoveSelection(),true);
});
test('cancel when every token already has a destination and hit any cell of a larger footprint',()=>{
 const c=setup();c.tokens[1].grid.size=2;for(let i=0;i<5;i++)place(c,i*3);assert.equal(c.canExecuteMoveSelection(),true);
 place(c,4,5);assert.equal(c.getGridPointForSelectionIndex(1),null);assert.equal(c.canExecuteMoveSelection(),false);place(c,16);assert.equal(c.getGridPointForSelectionIndex(1).size,2);assert.equal(c.canExecuteMoveSelection(),true);
});
test('selection changes preserve the owning token after a destination gap',()=>{
 const c=setup();for(let i=0;i<4;i++)place(c,i*2);place(c,2);const third=c.getGridPointForSelectionIndex(2);const previous=c.tokens.slice(),next=previous.slice(1);c.state.selectionOrder=next;c.reconcileSelectionArtifacts(previous,next);
 assert.equal(c.getGridPointForSelectionIndex(0),null);assert.equal(c.getGridPointForSelectionIndex(1),third);assert.equal(third.selectionIndex,1);
});
test('cancelled block projections restore destination gaps and token associations',()=>{
 const c=setup();for(let i=0;i<4;i++)place(c,i*2);place(c,2);const saved=c.snapshotGridPointMarkers();c.replaceGridPointMarkersFromData(saved);
 assert.equal(c.getGridPointForSelectionIndex(1),null);assert.equal(c.getGridPointForSelectionIndex(2).col,4);assert.equal(c.getGridPointForSelectionIndex(2).element.number,3);
});
test('dragged formation fills missing token indices without moving established destinations',()=>{
 const c=setup();for(let i=0;i<4;i++)place(c,i*2);place(c,2);const third=c.getGridPointForSelectionIndex(2);
 const session={baseCount:3,selectedTokens:c.tokens,pendingTokens:[c.tokens[1],c.tokens[4]]};c.setFormationMarkers(session,[{col:10,row:8,size:1},{col:12,row:8,size:1}],false);
 assert.equal(c.getGridPointForSelectionIndex(1).element.number,2);assert.equal(c.getGridPointForSelectionIndex(4).element.number,5);assert.equal(c.getGridPointForSelectionIndex(2),third);assert.equal(c.canExecuteMoveSelection(),true);
});
