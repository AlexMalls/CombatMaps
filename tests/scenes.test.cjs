const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0,name);return script.slice(i,script.indexOf('\n      }',i)+8);}
function geometry(){const c=vm.createContext({Math});for(const name of ['fitSceneBackground','resizeSceneBackground','moveSceneBackground'])vm.runInContext(source(name),c);return c;}
function plain(value){return JSON.parse(JSON.stringify(value));}
test('initial background fits portrait and landscape without stretching or cropping',()=>{
 const c=geometry();assert.deepEqual(plain(c.fitSceneBackground(100,200,800,400)),{x:300,y:0,width:200,height:400});
 assert.deepEqual(plain(c.fitSceneBackground(200,100,400,800)),{x:0,y:300,width:400,height:200});
});
test('corner resize is independent on both axes and image can be moved to fill the grid',()=>{
 const c=geometry();const b=c.fitSceneBackground(100,200,800,400);
 const moved=c.moveSceneBackground(b,-999,0,800,400);assert.equal(moved.x,0);
 assert.deepEqual(plain(c.resizeSceneBackground(moved,600,0,800,400)),{x:0,y:0,width:800,height:400});
 const min=c.resizeSceneBackground(moved,-999,-999,800,400);assert.equal(min.width,16);assert.equal(min.height,16);
});
test('all category plus buttons route to scene creation or native file selection',()=>{
 let opened=0,clicked=0;const c=vm.createContext({isMasterMode:()=>true,assetExplorer:{open:true},explorerState:{category:'scenes'},openSceneEditor(){opened++},chooseTokenImage(){clicked++},tokenImagePicker:{value:'old',click(){clicked++}}});
 vm.runInContext(source('addAssetForCategory'),c);c.addAssetForCategory();assert.equal(opened,1);
 for(const category of ['tokens','maps','status']){c.explorerState.category=category;c.addAssetForCategory();}assert.equal(clicked,3);assert.equal(c.tokenImagePicker.accept,'');
 c.isMasterMode=()=>false;c.addAssetForCategory();assert.equal(clicked,3);
});
function sceneContext(){
 const revoked=[],images=[];
 class FakeImage{constructor(){images.push(this);this.naturalWidth=100;this.naturalHeight=200}}
 const c=vm.createContext({Math,Image:FakeImage,URL:{createObjectURL:file=>`blob:${file.name}`,revokeObjectURL:url=>revoked.push(url)},
  state:{visible:true,absolute:false,distance:1.5,opacity:5,size:48},sceneGridSettings:{visible:true,absolute:false,distance:2,opacity:30,size:64},
  isMasterMode:()=>true,sceneEditor:{open:true,close(){this.open=false}},assetExplorer:{open:true},explorerCategories:[],
  sceneEditorState:{draft:{canvas:{width:800,height:400},backgroundUrl:'',fileName:'',fileSize:0,imageRect:null,loading:false},loadVersion:0,pendingUrl:null,gesture:null,scale:0.5},
  sceneControls:[],sceneConfirm:{},sceneBackgroundPicker:{value:'file'},sceneEditorError:{},sceneBackground:{removeAttribute(){}},
  sceneImageBox:{setPointerCapture(id){c.captured=id},hasPointerCapture:id=>c.captured===id,releasePointerCapture(){c.captured=null}},
  scenes:[],nextSceneId:1,explorerState:{category:'scenes'},renderScenePreview(){c.renders=(c.renders||0)+1},renderAssetExplorerContent(){c.catalogRendered=true}});
 for(const name of ['fitSceneBackground','resizeSceneBackground','moveSceneBackground','selectSceneBackground','finishSceneImageGesture','beginSceneImageGesture','moveSceneImageGesture','closeSceneEditor','confirmScene'])vm.runInContext(source(name),c);
 c.revoked=revoked;c.images=images;c.select=name=>c.selectSceneBackground({target:{files:[{name,type:'image/png',size:1234}]}});return c;
}
test('local file preview retains real filename and aspect; superseded loads cannot replace it',()=>{
 const c=sceneContext();c.select('first.png');assert.equal(c.sceneConfirm.disabled,true);c.select('second.png');
 c.images[0].onload();assert.equal(c.sceneEditorState.draft.backgroundUrl,'');
 c.images[1].onload();assert.equal(c.sceneEditorState.draft.fileName,'second.png');assert.equal(c.sceneBackground.src,'blob:second.png');
 assert.deepEqual(plain(c.sceneEditorState.draft.imageRect),{x:300,y:0,width:200,height:400});assert.equal(c.sceneConfirm.disabled,false);
 assert.ok(c.revoked.includes('blob:first.png'));assert.equal(c.sceneBackgroundPicker.value,'');
});
test('cancelling frees loaded and pending images, creates no scene and blocks late callbacks',()=>{
 const c=sceneContext();c.select('loaded.png');c.images[0].onload();c.select('pending.png');c.closeSceneEditor();
 assert.ok(c.revoked.includes('blob:loaded.png'));assert.ok(c.revoked.includes('blob:pending.png'));assert.equal(c.sceneEditorState.draft,null);assert.equal(c.scenes.length,0);
 c.images[1].onload();assert.equal(c.sceneEditorState.draft,null);assert.equal(c.scenes.length,0);
});
test('bad images give an error and release their URL without preventing another choice',()=>{
 const c=sceneContext();c.select('bad.png');c.images[0].onerror();assert.equal(c.sceneConfirm.disabled,false);assert.equal(c.sceneEditorState.draft.loading,false);assert.match(c.sceneEditorError.textContent,/Não foi possível/);assert.ok(c.revoked.includes('blob:bad.png'));
 c.select('good.png');c.images[1].onload();assert.equal(c.sceneEditorError.textContent,'');assert.equal(c.sceneEditorState.draft.fileName,'good.png');
});
test('confirm stores an independent scene snapshot without loading it or revoking its retained image',()=>{
 const c=sceneContext();const before=plain(c.state);c.select('forest.png');c.images[0].onload();const draft=c.sceneEditorState.draft;
 c.confirmScene();assert.equal(c.scenes.length,1);assert.equal(c.scenes[0].name,'forest');assert.equal(c.scenes[0].backgroundUrl,'blob:forest.png');assert.equal(c.scenes[0].fileSize,1234);assert.equal(c.catalogRendered,true);assert.equal(c.sceneEditor.open,false);assert.deepEqual(plain(c.state),before);assert.ok(!c.revoked.includes('blob:forest.png'));
 c.sceneGridSettings.size=80;draft.imageRect.x=0;assert.equal(c.scenes[0].grid.size,64);assert.equal(c.scenes[0].imageRect.x,300);
});
test('confirm is blocked during image decode and an empty scene can be created',()=>{
 const c=sceneContext();c.select('wait.png');c.confirmScene();assert.equal(c.scenes.length,0);c.images[0].onerror();c.confirmScene();assert.equal(c.scenes.length,1);assert.equal(c.scenes[0].name,'Cena 1');assert.equal(c.scenes[0].backgroundUrl,'');
});
test('mouse and touch corner resize use logical coordinates at scaled preview sizes',()=>{
 for(const pointerType of ['mouse','touch']){
  const c=sceneContext();c.sceneEditorState.draft.imageRect={x:0,y:0,width:200,height:200};
  const e={pointerId:2,isPrimary:true,button:0,buttons:1,pointerType,clientX:100,clientY:100,target:{closest:()=>({})},preventDefault(){},stopPropagation(){}};
  c.beginSceneImageGesture(e);c.moveSceneImageGesture({...e,clientX:200,clientY:150});assert.equal(c.sceneEditorState.draft.imageRect.width,400);assert.equal(c.sceneEditorState.draft.imageRect.height,300);
  c.finishSceneImageGesture({pointerId:99});assert.ok(c.sceneEditorState.gesture);c.finishSceneImageGesture(e);assert.equal(c.sceneEditorState.gesture,null);assert.equal(c.captured,null);
 }
});
test('shared numeric controls update scene defaults without mutating the current map settings',()=>{
 const field=()=>({value:'',style:{setProperty(){}},setAttribute(){},addEventListener(){},select(){}});
 const range={...field(),min:'8',max:'160',step:'1'},input=field();
 const c=vm.createContext({state:{size:48},scene:{size:64},document:{getElementById:id=>id==='range'?range:input}});
 vm.runInContext(source('parseNumber')+source('createNumericControl'),c);
 c.options={rangeId:'range',valueId:'input',stateKey:'size',targetState:c.scene,format:v=>({input:String(v),aria:String(v)}),apply(){}};
 vm.runInContext('const control=createNumericControl(options);control.set(83)',c);assert.equal(c.scene.size,83);assert.equal(c.state.size,48);assert.equal(input.value,'83');
});
