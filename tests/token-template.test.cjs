const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0,name);return script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
 const revoked=[],images=[];let seq=0;
 class Image{constructor(){images.push(this);this.naturalWidth=100;this.naturalHeight=200}}
 const c=vm.createContext({Math,Object,Promise,Image,URL:{createObjectURL:f=>`blob:${++seq}:${f.name}`,revokeObjectURL:url=>revoked.push(url)},
  isMasterMode:()=>true,assetExplorer:{open:true},tokenTemplateEditor:{open:false,showModal(){this.open=true},close(){this.open=false}},
  tokenTemplateLife:{value:'10000'},tokenTemplateStatus:{value:'Normal'},tokenTemplateEditImage:{},tokenTemplateTitle:{},tokenTemplateName:{value:''},tokenTemplatePicker:{value:''},tokenTemplatePreview:{removeAttribute(){delete this.src}},tokenTemplateEmpty:{},tokenTemplateFile:{},tokenTemplateError:{},tokenTemplateConfirm:{},
  tokenTemplateState:{draft:null,pendingUrl:null,loadVersion:0},tokenTemplateSettings:{size:1},tokenTemplateSizeControl:{set(v){c.tokenTemplateSettings.size=v},commit(){c.tokenTemplateSettings.size=Math.max(1,Math.min(10,Math.round(c.tokenTemplateSettings.size))) }},
  cancelWorkspaceGestures(){},explorerContent:{querySelector:()=>null},explorerState:{category:'tokens',fileSizes:new Map()},TOKEN_TYPES:{},nextTokenTypeId:1,
  renderAssetExplorerContent(){c.catalogRendered=true},renderTokenDock(){c.dockRendered=true},tokenDockStatus:{}});
 for(const name of ['openTokenTemplateEditor','selectTokenTemplateImage','closeTokenTemplateEditor','confirmTokenTemplate'])vm.runInContext(source(name),c);
 c.images=images;c.revoked=revoked;c.select=(name,type='image/png')=>c.selectTokenTemplateImage({target:{files:[{name,type,size:250000}]}});return c;
}
test('new token resets footprint to1 and requires a decoded image before creating',()=>{
 const c=setup();c.tokenTemplateSettings.size=9;c.openTokenTemplateEditor();assert.equal(c.tokenTemplateSettings.size,1);assert.equal(c.tokenTemplateConfirm.disabled,true);assert.equal(c.confirmTokenTemplate(),false);
 c.select('mage.gif','image/gif');assert.equal(c.confirmTokenTemplate(),false);c.images[0].onload();assert.equal(c.tokenTemplateConfirm.disabled,false);
 c.tokenTemplateName.value='  Mago  ';c.tokenTemplateSettings.size=3;assert.equal(c.confirmTokenTemplate(),true);
 const type=c.TOKEN_TYPES['custom-1'];assert.equal(type.name,'Mago');assert.equal(type.gridSize,3);assert.equal(type.maxLife,10000);assert.equal(type.status,'Normal');assert.equal(type.fileSize,250000);assert.ok(c.catalogRendered&&c.dockRendered);assert.equal(c.tokenTemplateEditor.open,false);assert.ok(!c.revoked.includes(type.image));
});
test('names fall back to image basename and IDs stay unique across imports',()=>{
 const c=setup();for(let i=0;i<2;i++){c.openTokenTemplateEditor();c.select('soldado.png');c.images[i].onload();c.confirmTokenTemplate();}
 assert.equal(Object.keys(c.TOKEN_TYPES).length,2);assert.equal(c.TOKEN_TYPES['custom-1'].name,'soldado');assert.notEqual(c.TOKEN_TYPES['custom-1'].instancePrefix,c.TOKEN_TYPES['custom-2'].instancePrefix);
});
test('cancel, master-off, failed images and stale callbacks never register tokens',()=>{
 const c=setup();c.openTokenTemplateEditor();c.select('first.png');c.select('last.png');c.images[0].onload();assert.equal(c.tokenTemplateState.draft.image,'');
 c.images[1].onload();const url=c.tokenTemplateState.draft.image;c.closeTokenTemplateEditor();assert.ok(c.revoked.includes(url));assert.equal(c.confirmTokenTemplate(),false);
 c.openTokenTemplateEditor();c.select('bad.jpg','image/jpeg');c.images[2].onerror();assert.equal(c.tokenTemplateConfirm.disabled,true);assert.equal(c.confirmTokenTemplate(),false);
 c.select('pending.png');c.closeTokenTemplateEditor();c.images[3].onload();assert.equal(Object.keys(c.TOKEN_TYPES).length,0);
 c.isMasterMode=()=>false;c.openTokenTemplateEditor();assert.equal(c.tokenTemplateEditor.open,false);
});
test('image replacement releases discarded files but keeps the committed URL alive',()=>{
 const c=setup();c.openTokenTemplateEditor();c.select('one.png');c.images[0].onload();const old=c.tokenTemplateState.draft.image;
 c.select('two.jpeg','image/jpeg');c.images[1].onload();assert.ok(c.revoked.includes(old));c.confirmTokenTemplate();const url=c.TOKEN_TYPES['custom-1'].image;assert.ok(!c.revoked.includes(url));
});
test('token editor shares controls and aesthetics; size slider uses integer steps1..10',()=>{
 assert.match(html,/id="token-template-editor" class="scene-editor/);assert.match(html,/id="token-template-size"[^>]*min="1"[^>]*max="10"[^>]*step="1"[^>]*value="1"/);
 assert.match(source('initializeTokenTemplateControls'),/createNumericControl/);assert.match(source('addAssetForCategory'),/openTokenTemplateEditor/);
});
test('editing preserves type ID and instance prefix, updates all defaults without changing existing units',()=>{
 const c=setup();const old={id:'soldiers',instancePrefix:'soldados',name:'Soldados',maxLife:10000,status:'Normal',image:'soldiers.png',gridSize:1};c.TOKEN_TYPES.soldiers=old;
 const instance={life:4000,maxLife:10000,image:old.image};c.openTokenTemplateEditor('soldiers');assert.equal(c.tokenTemplateLife.value,'10000');assert.equal(c.tokenTemplateConfirm.disabled,false);assert.equal(c.tokenTemplateState.draft.ownsImage,false);
 c.tokenTemplateName.value='Guardas';c.tokenTemplateLife.value='25000';c.tokenTemplateStatus.value='Alerta';c.tokenTemplateSettings.size=2;c.confirmTokenTemplate();
 const type=c.TOKEN_TYPES.soldiers;assert.equal(type.id,'soldiers');assert.equal(type.instancePrefix,'soldados');assert.equal(type.maxLife,25000);assert.equal(type.status,'Alerta');assert.equal(type.gridSize,2);assert.equal(c.nextTokenTypeId,1);assert.ok(!c.revoked.includes(old.image));assert.deepEqual(instance,{life:4000,maxLife:10000,image:'soldiers.png'});
});
test('cancel or image replacement while editing never revokes the previously saved image',()=>{
 const c=setup();c.TOKEN_TYPES.soldiers={id:'soldiers',image:'blob:saved',name:'Soldados',maxLife:10000,gridSize:1};c.openTokenTemplateEditor('soldiers');c.closeTokenTemplateEditor();assert.ok(!c.revoked.includes('blob:saved'));
 c.openTokenTemplateEditor('soldiers');c.select('new.png');c.images[0].onload();assert.ok(!c.revoked.includes('blob:saved'));const fresh=c.tokenTemplateState.draft.image;c.closeTokenTemplateEditor();assert.ok(c.revoked.includes(fresh));assert.equal(c.TOKEN_TYPES.soldiers.image,'blob:saved');
});
test('invalid initial health does not mutate the type or close the editor',()=>{
 for(const value of ['0','-1','1.5','NaN','1000000001']){const c=setup();c.openTokenTemplateEditor();c.select('token.png');c.images[0].onload();c.tokenTemplateLife.value=value;assert.equal(c.confirmTokenTemplate(),false);assert.equal(Object.keys(c.TOKEN_TYPES).length,0);assert.equal(c.tokenTemplateEditor.open,true);}
});
