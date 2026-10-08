const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const geometry=require('../token-image-editor.js');
const source=fs.readFileSync(path.join(__dirname,'../token-image-editor.js'),'utf8');
let native;try{native=require('@napi-rs/canvas')}catch{try{native=require(path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||'/nonexistent','@napi-rs/canvas'))}catch{}}
test('selection coordinates match zoomed canvas and rectangular crops stay within image bounds',()=>{
 assert.deepEqual(geometry.canvasPoint(150,100,{left:50,top:50,width:200,height:100},100,50),{x:50,y:25});
 assert.deepEqual(geometry.selectionBounds([{x:-20,y:-30},{x:50.1,y:40.2}],40,30),{x:0,y:0,width:40,height:30});
 assert.equal(geometry.selectionBounds([{x:0,y:0},{x:0,y:20}],40,30),null);
 assert.equal(geometry.polygonArea(geometry.rectanglePoints({x:6,y:5},{x:1,y:2})),15);
});
function editor(){
 const node=()=>({style:{},attrs:{},handlers:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.handlers[k]=f}});
 const actions=['close','cancel','lasso','rectangle','pan','left','right','crop','delete','undo','apply'];
 const buttons=Object.fromEntries(actions.map(id=>[id,{...node(),dataset:{imageAction:id}}]));
 const zoom=node(),polygon=node(),overlay=node(),error=node(),stage=node(),viewport={clientWidth:800,clientHeight:600,scrollLeft:50,scrollTop:50},dialog={...node(),open:false,showModal(){this.open=true},close(){this.open=false}};
 const canvas=native.createCanvas(8,4),captures=new Set();canvas.handlers={};canvas.addEventListener=(k,f)=>canvas.handlers[k]=f;
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:canvas.width,height:canvas.height});canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);canvas.toBlob=f=>queueMicrotask(()=>f(new Blob([canvas.toBuffer('image/png')],{type:'image/png'})));
 dialog.querySelector=s=>({'.image-editor__viewport':viewport,'.image-editor__stage':stage,polygon,svg:overlay,'[role=status]':error,'input[type=range]':zoom}[s]);dialog.querySelectorAll=()=>Object.values(buttons);
 const seed=native.createCanvas(8,4),ctx=seed.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,4,4);ctx.fillStyle='blue';ctx.fillRect(4,0,4,4);
 const images=[];
 class Image{constructor(){const image=native.createCanvas(8,4);image.getContext('2d').drawImage(seed,0,0);image.naturalWidth=8;image.naturalHeight=4;Object.defineProperty(image,'src',{set(){images.push(image)}});return image;}}
 const c=vm.createContext({Math,Image,document:{getElementById:id=>id==='token-image-editor'?dialog:canvas,createElement:()=>native.createCanvas(1,1)},window:{document:{},addEventListener(){}},Blob});
 // Script resolves global document and publishes its controller on window.
 vm.runInContext(source,c);
 const controller=c.window.TokenImageEditor;
 return {controller,images,canvas,dialog,buttons,error,captures,click(id){buttons[id].handlers.click()},open(){controller.open('fixture',blob=>{this.result=blob});images.at(-1).onload()},select(points,tool='rectangle',pointerType='mouse'){
  this.click(tool);points.forEach(([x,y],i)=>{const type=i===0?'pointerdown':i===points.length-1?'pointerup':'pointermove';canvas.handlers[type]({pointerId:1,isPrimary:true,button:0,buttons:type==='pointerup'?0:1,pointerType,clientX:x,clientY:y,preventDefault(){}})});
 },rgba(x,y){return Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data)}};
}
test('native pixels: rectangle delete creates transparency and undo restores original image',{skip:!native},()=>{
 const e=editor();e.open();e.select([[0,0],[4,4]],'rectangle','touch');assert.equal(e.captures.size,0);e.click('delete');assert.equal(e.rgba(1,1)[3],0);assert.deepEqual(e.rgba(6,1),[0,0,255,255]);e.click('undo');assert.deepEqual(e.rgba(1,1),[255,0,0,255]);assert.equal(e.canvas.width,8);
});
test('native pixels: rectangular crop trims dimensions and rotation swaps axes',{skip:!native},()=>{
 const e=editor();e.open();e.select([[2,1],[6,3]]);e.click('crop');assert.equal(e.canvas.width,4);assert.equal(e.canvas.height,2);assert.deepEqual(e.rgba(0,0),[255,0,0,255]);assert.deepEqual(e.rgba(3,0),[0,0,255,255]);e.click('right');assert.equal(e.canvas.width,2);assert.equal(e.canvas.height,4);e.click('undo');assert.equal(e.canvas.width,4);assert.equal(e.canvas.height,2);
});
test('native pixels: lasso crop preserves inside pixels and makes outside polygon transparent',{skip:!native},()=>{
 const e=editor();e.open();e.select([[1,0],[7,0],[1,4]],'lasso');e.click('crop');assert.equal(e.canvas.width,6);assert.equal(e.canvas.height,4);assert.equal(e.rgba(0,0)[3],255);assert.equal(e.rgba(5,3)[3],0);
});
test('cancelled pointer discards selection; cancel editor never applies and late decode is ignored',{skip:!native},()=>{
 const e=editor();e.open();e.canvas.handlers.pointerdown({pointerId:1,isPrimary:true,button:0,clientX:0,clientY:0,preventDefault(){}});e.canvas.handlers.pointercancel();assert.equal(e.captures.size,0);assert.equal(e.buttons.crop.disabled,true);e.click('cancel');assert.equal(e.result,undefined);assert.equal(e.dialog.open,false);
 e.controller.open('late',()=>{throw Error('should not apply')});const pending=e.images.at(-1);e.controller.close();pending.onload();assert.equal(e.canvas.width,1);
});
test('apply produces PNG only after confirmation and cancelled export does not leak into draft',{skip:!native},async()=>{
 const e=editor();e.open();e.click('apply');await new Promise(r=>setImmediate(r));assert.equal(e.result.type,'image/png');assert.equal(e.dialog.open,false);const bytes=Buffer.from(await e.result.arrayBuffer());assert.deepEqual([...bytes.subarray(0,4)],[137,80,78,71]);
 const f=editor();f.open();f.click('apply');f.click('cancel');await new Promise(r=>setImmediate(r));assert.equal(f.result,undefined);
});
