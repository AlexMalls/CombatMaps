const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const start=script.indexOf(`      function ${name}(`);assert.ok(start>=0,`${name} is implemented`);return script.slice(start,script.indexOf('\n      }',start)+8);}
function setup(extra={}){const c=vm.createContext({Math,Number,Map,Promise,Intl,maps:[],statusTypes:[],scenes:[],explorerState:{fileSizes:new Map()},...extra});for(const name of ['constrainExplorerBounds','resizeExplorerBounds','getAssetFileSize'])vm.runInContext(source(name),c);return c;}
function call(c,name,...args){c.args=args;return JSON.parse(JSON.stringify(vm.runInContext(`${name}(...args)`,c)));}
test('window fits narrow mobile and stays inside viewport after rotation',()=>{
 const c=setup();const b=call(c,'constrainExplorerBounds',{x:700,y:500,width:760,height:480},{width:360,height:640});
 assert.equal(b.width,336);assert.equal(b.x,12);assert.ok(b.y+b.height<=628);
 const landscape=call(c,'constrainExplorerBounds',b,{width:640,height:300});assert.equal(landscape.height,276);assert.equal(landscape.y,12);
});
test('all four resize corners preserve the opposite corner',()=>{
 const c=setup();const b={x:200,y:200,width:600,height:400},v={width:1200,height:900};
 for(const corner of ['nw','ne','sw','se']){
  const r=call(c,'resizeExplorerBounds',b,corner,40,30,v);
  assert.equal(corner.includes('w')?r.x+r.width:r.x,corner.includes('w')?800:200);
  assert.equal(corner.includes('n')?r.y+r.height:r.y,corner.includes('n')?600:200);
 }
});
test('resize respects minimum size and screen edges without moving the opposite anchor',()=>{
 const c=setup();const b={x:200,y:200,width:600,height:400},v={width:1200,height:900};
 const small=call(c,'resizeExplorerBounds',b,'nw',9999,9999,v);assert.equal(small.width,420);assert.equal(small.height,300);assert.equal(small.x+small.width,800);
 const large=call(c,'resizeExplorerBounds',b,'se',9999,9999,v);assert.equal(large.x+large.width,1188);assert.equal(large.y+large.height,888);
});
test('file metadata is fetched once per image including concurrent requests',async()=>{
 let calls=0;const c=setup({fetch:async()=>{calls++;return {ok:true,headers:{get:()=> '1234567'}}}});
 const values=await Promise.all([c.getAssetFileSize('token.png'),c.getAssetFileSize('token.png')]);
 assert.deepEqual(values,[1234567,1234567]);assert.equal(calls,1);
});
test('unknown size is never invented and failed metadata can be retried',async()=>{
 let calls=0;const c=setup({fetch:async()=>{calls++;if(calls===1)throw Error('offline');return {ok:true,headers:{get:()=>null}}}});
 assert.equal(await c.getAssetFileSize('token.png'),null);assert.equal(await c.getAssetFileSize('token.png'),null);assert.equal(calls,2);
});
test('master mode gates opening and its deactivation closes the file window',()=>{
 const c=setup({isMasterMode:()=>false,assetExplorer:{open:false},document:{}});
 vm.runInContext(source('openAssetExplorer'),c);vm.runInContext('openAssetExplorer()',c);assert.equal(c.assetExplorer.open,false);
 assert.match(source('setMasterMode'),/closeAssetExplorer/);
});
test('Explorer is nonmodal and folder is wired to opening it',()=>{
 assert.match(source('openAssetExplorer'),/assetExplorer\.show\(\)/);assert.doesNotMatch(source('openAssetExplorer'),/showModal/);
 assert.match(script,/masterFilesButton\.addEventListener\("click", openAssetExplorer\)/);
 for(const corner of ['nw','ne','sw','se'])assert.match(html,new RegExp(`data-explorer-corner="${corner}"`));
 assert.match(html,/id="master-token"/);
});
test('mouse and touch move and resize without changing map state, and capture is cleaned up',()=>{
 for(const pointerType of ['mouse','touch']){
  const captures=new Set();const handle={setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id)};
  const c=setup({assetExplorer:{open:true},window:{innerWidth:1200,innerHeight:900},explorerState:{bounds:{x:200,y:200,width:600,height:400},gesture:null,fileSizes:new Map()},applyExplorerBounds(b){c.explorerState.bounds=b}});
  for(const name of ['beginExplorerGesture','moveExplorerGesture','finishExplorerGesture'])vm.runInContext(source(name),c);
  const event={pointerId:8,pointerType,button:0,buttons:1,clientX:400,clientY:400,target:{closest:()=>null},currentTarget:handle,preventDefault(){},stopPropagation(){}};
  c.beginExplorerGesture(event);assert.ok(captures.has(8));
  c.moveExplorerGesture({...event,clientX:450,clientY:430});assert.equal(c.explorerState.bounds.x,250);assert.equal(c.explorerState.bounds.y,230);
  c.finishExplorerGesture({pointerId:99});assert.ok(c.explorerState.gesture);
  c.finishExplorerGesture(event);assert.equal(c.explorerState.gesture,null);assert.equal(captures.size,0);
  c.beginExplorerGesture(event,'se');c.moveExplorerGesture({...event,clientX:450,clientY:430});assert.equal(c.explorerState.bounds.width,650);assert.equal(c.explorerState.bounds.height,430);
  if(pointerType==='mouse'){c.moveExplorerGesture({...event,buttons:0,clientX:800});assert.equal(c.explorerState.gesture,null);assert.equal(c.explorerState.bounds.width,650);}
  c.finishExplorerGesture();assert.equal(captures.size,0);
 }
 assert.match(source('cancelWorkspaceGestures'),/finishExplorerGesture\(\)/);
});
test('Explorer right-click does not undo map destinations or clear selection',()=>{
 const c=setup({document:{addEventListener(type,handler){c.handler=handler}},performance:{now:()=>1000},suppressContextMenuUntil:0,state:{touchMode:false},gridPointMarkers:[{}],hasSelectedToken:()=>true,closeTokenActionMenu(){throw Error('map changed')},undoGridPointOrClearSelection(){throw Error('map changed')}});
 const start=script.indexOf('      document.addEventListener("contextmenu", event => {');
 const end=script.indexOf('      document.addEventListener("keydown", event => {',start);
 vm.runInContext(script.slice(start,end),c);
 c.handler({target:{closest:()=>({})},preventDefault(){throw Error('native menu blocked')}});
});
test('catalog lists loaded types once even with many map tokens, using template health',async()=>{
 const node=()=>({children:[],dataset:{},addEventListener(){},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},setAttribute(k,v){this[k]=v}});
 const content=node(),buttons=['tokens','maps','scenes','status'].map(id=>({...node(),dataset:{assetCategory:id}}));
 const types={soldiers:{id:'soldiers',name:'Soldados',image:'token.png',gridSize:1,maxLife:10000},giant:{id:'giant',name:'Gigante',image:'giant.gif',gridSize:3,maxLife:20000}};
 const c=setup({document:{createElement:node,createElementNS:()=>node()},explorerContent:content,explorerCategories:buttons,explorerState:{category:'tokens',fileSizes:new Map()},TOKEN_TYPES:types,tokens:Array(7).fill({life:0}),tokenLifeFormat:new Intl.NumberFormat('pt-BR'),fetch:async()=>({ok:true,headers:{get:()=> '2500000'}})});
 vm.runInContext(source('addAssetForCategory')+source('renderAssetExplorerContent'),c);c.renderAssetExplorerContent();
 const list=content.children[1];assert.equal(list.children.length,2);
 const item=list.children[0];assert.equal(item.children[0].src,'token.png');assert.equal(item.children[1].textContent,'Soldados');
 const rows=item.children[2].children;assert.equal(rows[0].children[1].textContent,'1 × 1');assert.equal(rows[1].children[1].textContent,'10.000');
 assert.equal(list.children[1].children[2].children[0].children[1].textContent,'3 × 3');
 await new Promise(resolve=>setImmediate(resolve));assert.equal(rows[3].children[1].textContent,'2,5 MB');
 c.tokens=[];c.renderAssetExplorerContent();assert.equal(content.children[1].children.length,2);
 for(const category of ['maps','scenes','status']){c.explorerState.category=category;c.renderAssetExplorerContent();assert.equal(content.children.length,2);assert.match(content.children[1].textContent,/Nenhum arquivo/);}
});
test('native image picker resets selections without importing or modifying the catalog',()=>{
 let clicks=0;const input={value:'previous.png',click(){clicks++}};
 const c=setup({isMasterMode:()=>true,explorerState:{category:'tokens',fileSizes:new Map()},assetExplorer:{open:true},tokenImagePicker:input});
 vm.runInContext(source('chooseTokenImage'),c);c.chooseTokenImage();assert.equal(clicks,1);assert.equal(input.value,'');
 input.value='chosen.gif';c.discardTokenImageSelection=undefined;vm.runInContext(source('discardTokenImageSelection'),c);c.discardTokenImageSelection();assert.equal(input.value,'');
 c.isMasterMode=()=>false;c.chooseTokenImage();assert.equal(clicks,1);
 c.isMasterMode=()=>true;c.explorerState.category='maps';c.chooseTokenImage();assert.equal(clicks,1);
 assert.match(html,/id="token-image-picker"[^>]*type="file"[^>]*accept="image\/\*"/);
 assert.match(script,/tokenImagePicker\.addEventListener\("change", discardTokenImageSelection\)/);
});
