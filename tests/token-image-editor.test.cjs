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
 const node=()=>({dataset:{},style:{},attrs:{},handlers:{},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,f){this.handlers[k]=f}});
 const actions=['close','cancel','lasso','rectangle','ellipse','wand','brush','eraser','bucket','eyedropper','pan','left','right','crop','delete','undo','redo','apply','select-all','deselect','invert-selection','feather','smooth','expand','contract','adjust','grayscale','invert-color','flip-x','flip-y','reset'];
 const buttons=Object.fromEntries(actions.map(id=>[id,{...node(),dataset:{imageAction:id}}]));
 const zoom=node(),polygon=node(),overlay=node(),error=node(),stage=node(),viewport={clientWidth:800,clientHeight:600,scrollLeft:50,scrollTop:50},dialog={...node(),open:false,showModal(){this.open=true},close(){this.open=false}};
 const canvas=native.createCanvas(8,4),captures=new Set();canvas.handlers={};canvas.addEventListener=(k,f)=>canvas.handlers[k]=f;
 canvas.getBoundingClientRect=()=>({left:0,top:0,width:canvas.width,height:canvas.height});canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>captures.delete(id);canvas.toBlob=f=>queueMicrotask(()=>f(new Blob([canvas.toBuffer('image/png')],{type:'image/png'})));
 const settings=Object.fromEntries(Object.entries({'selection-mode':'replace',tolerance:'24',color:'#79dfb5','brush-size':'12',opacity:'100',feather:'2',brightness:'0',contrast:'0',saturation:'0'}).map(([key,value])=>[key,{...node(),value,defaultValue:value}]));settings.contiguous={...node(),type:'checkbox',checked:true,defaultChecked:true};
 const loupe=native.createCanvas(116,116);loupe.style={};loupe.hidden=true;
 dialog.querySelector=s=>{const match=s.match(/data-image-setting=["']?([^"'\]]+)/);return match?settings[match[1]]:({'.image-editor__viewport':viewport,'.image-editor__stage':stage,polygon,svg:overlay,'[role=status]':error,'input[type=range]':zoom,'#image-editor-loupe':loupe}[s]);};
 dialog.querySelectorAll=s=>s==="[data-image-action]"?Object.values(buttons):s==="[data-image-setting]"?Object.values(settings):[];
 const seed=native.createCanvas(8,4),ctx=seed.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,4,4);ctx.fillStyle='blue';ctx.fillRect(4,0,4,4);
 const images=[];
 class Image{constructor(){const image=native.createCanvas(8,4);image.getContext('2d').drawImage(seed,0,0);image.naturalWidth=8;image.naturalHeight=4;Object.defineProperty(image,'src',{set(){images.push(image)}});return image;}}
 const c=vm.createContext({Math,Image,document:{getElementById:id=>id==='token-image-editor'?dialog:canvas,createElement:()=>native.createCanvas(1,1)},window:{innerWidth:800,innerHeight:600,document:{},TokenImageTools:require("../token-image-tools.js"),addEventListener(){}},Blob});
 // Script resolves global document and publishes its controller on window.
 vm.runInContext(source,c);
 const controller=c.window.TokenImageEditor;
 return {controller,images,canvas,dialog,buttons,error,captures,settings,loupe,click(id){buttons[id].handlers.click()},open(){controller.open('fixture',blob=>{this.result=blob});images.at(-1).onload()},select(points,tool='rectangle',pointerType='mouse'){
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
test('wand deletes only matched pixels and undo/redo restore image and selection',{skip:!native},()=>{
 const e=editor();e.open();e.click('wand');e.canvas.handlers.pointerdown({pointerId:2,pointerType:'mouse',isPrimary:true,button:0,clientX:1,clientY:1,preventDefault(){}});e.click('delete');assert.equal(e.rgba(1,1)[3],0);assert.equal(e.rgba(6,1)[3],255);e.click('undo');assert.equal(e.rgba(1,1)[3],255);e.click('redo');assert.equal(e.rgba(1,1)[3],0);
});
test('brush and eraser respect selection; cancelled strokes restore pixels',{skip:!native},()=>{
 const e=editor();e.open();e.select([[0,0],[4,4]]);e.settings['brush-size'].value='12';e.settings.color.value='#00ff00';e.select([[1,1],[7,1]],'brush');assert.equal(e.rgba(1,1)[1],255);assert.deepEqual(e.rgba(6,1),[0,0,255,255]);
 e.click('undo');assert.deepEqual(e.rgba(1,1),[255,0,0,255]);e.click('eraser');e.canvas.handlers.pointerdown({pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:1,clientY:1,preventDefault(){}});assert.equal(e.rgba(1,1)[3],0);e.canvas.handlers.pointercancel();assert.deepEqual(e.rgba(1,1),[255,0,0,255]);assert.equal(e.loupe.hidden,true);
});
test('fill, flip, selected color adjustment and reset operate on native pixels',{skip:!native},()=>{
 const e=editor();e.open();e.settings.color.value='#00ff00';e.click('bucket');e.canvas.handlers.pointerdown({pointerId:1,isPrimary:true,button:0,clientX:1,clientY:1,preventDefault(){}});assert.deepEqual(e.rgba(1,1),[0,255,0,255]);assert.deepEqual(e.rgba(6,1),[0,0,255,255]);e.click('flip-x');assert.deepEqual(e.rgba(1,1),[0,0,255,255]);e.click('reset');assert.deepEqual(e.rgba(1,1),[255,0,0,255]);e.select([[0,0],[4,4]]);e.click('grayscale');assert.equal(e.rgba(1,1)[0],e.rgba(1,1)[1]);assert.deepEqual(e.rgba(6,1),[0,0,255,255]);
});
test('touch loupe follows the finger above it, stays hidden for mouse and cleans up',{skip:!native},()=>{
 const e=editor();e.open();e.canvas.getBoundingClientRect=()=>({left:392,top:298,width:8,height:4});
 const event={pointerId:1,pointerType:'touch',isPrimary:true,button:0,buttons:1,clientX:396,clientY:300,preventDefault(){}};
 e.canvas.handlers.pointerdown(event);assert.equal(e.loupe.hidden,false);assert.ok(parseFloat(e.loupe.style.top)+116<event.clientY);e.canvas.handlers.pointermove({...event,clientX:398});assert.equal(e.loupe.style.left,'340px');e.canvas.handlers.pointerup({...event,buttons:0});assert.equal(e.loupe.hidden,true);assert.equal(e.captures.size,0);
 e.canvas.handlers.pointerdown({...event,pointerType:'mouse'});assert.equal(e.loupe.hidden,true);e.canvas.handlers.pointercancel();
 e.click('wand');e.canvas.handlers.pointerdown(event);assert.ok(e.captures.has(1));e.canvas.handlers.pointerup({...event,buttons:0});assert.equal(e.captures.size,0);assert.equal(e.loupe.hidden,true);
});
test('feathered selections delete softly and loupe stays inside screen edges',{skip:!native},()=>{
 const e=editor();e.open();e.select([[0,0],[4,4]]);e.settings.feather.value='1';e.click('feather');e.click('delete');const alpha=e.rgba(3,1)[3];assert.ok(alpha>0&&alpha<255);assert.equal(e.rgba(7,1)[3],255);
 for(const [x,y] of [[0,0],[799,599],[400,300]]){const p=geometry.loupePosition(x,y,116,800,600);assert.ok(p.left>=8&&p.left+116<=792);assert.ok(p.top>=8&&p.top+116<=592);}
});
