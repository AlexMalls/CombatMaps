const {test}=require('node:test'),assert=require('node:assert/strict');
let tools;try{tools=require('../shared-demonstrations.js')}catch{}
const marks=()=>({sceneId:'s',cells:[[0,0]],preview:null,ruler:{start:{col:0,row:0},end:{col:3,row:2}},moves:[{id:'t',number:1,from:{col:0,row:0,size:1},to:{col:4,row:2,size:1}}]});
test('separate authors retain demonstrations and clear only their own marks',()=>{
 assert.equal(typeof tools?.merge,'function','shared demonstrations missing');
 let state=tools.merge({},'pc',marks(),1000);state=tools.merge(state,'phone',marks(),2000);state=tools.merge(state,'pc',null,3000);
 assert.deepEqual(Object.keys(state),['phone']);assert.equal(state.phone.sceneId,'s');
});
test('expired marks and malformed coordinates cannot appear in other browsers',()=>{
 assert.equal(typeof tools?.visible,'function','shared demonstration validation missing');
 const state=tools.merge({},'pc',marks(),1000);assert.equal(tools.visible(state,'s','phone',2000).length,1);assert.equal(tools.visible(state,'different','phone',2000).length,0);assert.equal(tools.visible(state,'s','pc',2000).length,0);assert.equal(tools.visible(state,'s','phone',100000).length,0);
 const invalid=marks();invalid.ruler.start.col=Infinity;assert.throws(()=>tools.normalize(invalid));assert.throws(()=>tools.normalize({...marks(),cells:Array(70000).fill([0,0])}));
});
test('transient camera settings are excluded and shapes retain grid coordinates',()=>{
 assert.equal(typeof tools?.normalize,'function','shared demonstration validation missing');
 const data=tools.normalize({...marks(),cameraZoom:3,preview:{shape:'cone',start:{col:0,row:0},end:{col:4,row:2},erase:false}});assert.equal(data.cameraZoom,undefined);assert.equal(data.preview.shape,'cone');assert.deepEqual(data.ruler.end,{col:3,row:2});
});
test('channel groups pointer changes, sends clears, and performs no idle writes',async()=>{
 let now=10000,current=null,saved=[],notify;const channel=tools.start({id:'pc',clock:()=>now,setTimer:()=>1,clearTimer(){},snapshot:()=>current,render(){},store:{watchDemonstrations(fn){notify=fn;fn({});return()=>{}},async saveDemonstration(id,value,time){saved.push({id,value,time})}}});
 await channel.tick();assert.equal(saved.length,0);
 current=marks();await channel.tick();assert.equal(saved.length,1);
 for(let i=1;i<=9;i++){now+=100;current.ruler.end.col=i;await channel.tick()}assert.equal(saved.length,1);
 now+=100;await channel.tick();assert.equal(saved.length,2);assert.equal(saved[1].value.ruler.end.col,9);
 now+=1000;current=null;await channel.tick();assert.equal(saved.length,3);assert.equal(saved[2].value,null);
 now+=120000;await channel.tick();assert.equal(saved.length,3);channel.stop();
});
test('visible marks renew their expiry once a minute and stop on quota errors',async()=>{
 let now=10000,count=0,quota=false;const channel=tools.start({id:'pc',clock:()=>now,setTimer:()=>1,clearTimer(){},snapshot:marks,render(){},store:{watchDemonstrations(){return()=>{}},async saveDemonstration(){count++;if(quota)throw Object.assign(Error('quota'),{code:'resource-exhausted'})}}});
 await channel.tick();now+=59000;await channel.tick();assert.equal(count,1);now+=1000;quota=true;await channel.tick();assert.equal(count,2);now+=120000;await channel.tick();assert.equal(count,2);channel.stop();
});
test('large supported grid areas remain shareable',()=>{const data=marks();data.cells=Array.from({length:10000},(_,i)=>[i%100,Math.floor(i/100)]);assert.equal(tools.normalize(data).cells.length,10000)});
test('server clock uses HTTP time rather than a skewed device clock',async()=>{let elapsed=1000;const clock=await tools.serverClock({fetchTime:async()=>({ok:true,headers:{get:key=>key==='date'?'Wed, 14 Oct 2026 18:00:00 GMT':null}}),elapsed:()=>elapsed});elapsed+=1500;assert.equal(clock(),Date.parse('2026-10-14T18:00:00Z')+1500)});
