const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);return script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
 const buttons=['line','circle','square','cone'].map(shape=>({dataset:{highlightShape:shape},attrs:{},setAttribute(k,v){this.attrs[k]=v},getAttribute:()=>shape,querySelector:()=>({cloneNode:()=>({shape})})})),timers=new Map();
 const c=vm.createContext({state:{activeTool:'ruler',highlightShape:'path',isMoving:false},highlightShapeButtons:buttons,highlightShapesMenu:{hidden:true},highlightShapeBadge:{children:[],replaceChildren(){this.children=[]},append(n){this.children.push(n)}},highlightToolButton:{attrs:{},focus(){},setAttribute(k,v){this.attrs[k]=v},setPointerCapture(){}},highlightToolPress:null,suppressHighlightToolClick:false,window:{setTimeout(fn){timers.set(1,fn);return 1},clearTimeout(id){timers.delete(id)}},finishHighlightStroke(){c.cancelled=true},toggleTool(id){c.state.activeTool=id}});
 for(const name of ['setHighlightShapesOpen','selectHighlightShape','cancelHighlightToolPress','beginHighlightToolPress'])vm.runInContext(source(name),c);return {c,timers};
}
test('short click never opens submenu; holding activates highlight and opens its shape choices',()=>{
 const {c,timers}=setup(),event={isPrimary:true,button:0,pointerId:1,clientX:5,clientY:5};c.beginHighlightToolPress(event);c.cancelHighlightToolPress();assert.equal(timers.size,0);assert.equal(c.highlightShapesMenu.hidden,true);
 c.beginHighlightToolPress(event);timers.get(1)();assert.equal(c.state.activeTool,'highlight');assert.equal(c.highlightShapesMenu.hidden,false);assert.equal(c.suppressHighlightToolClick,true);assert.equal(c.highlightToolButton.attrs['aria-expanded'],'true');
});
test('selection closes submenu, shows a miniature of the chosen icon and can restore free stroke',()=>{
 const {c}=setup();c.setHighlightShapesOpen(true);c.selectHighlightShape('circle');assert.equal(c.state.highlightShape,'circle');assert.equal(c.state.activeTool,'highlight');assert.equal(c.highlightShapesMenu.hidden,true);assert.equal(c.highlightShapeBadge.hidden,false);assert.equal(c.highlightShapeBadge.children[0].shape,'circle');assert.equal(c.highlightShapeButtons[1].attrs['aria-pressed'],'true');
 c.selectHighlightShape('circle');assert.equal(c.state.highlightShape,'path');assert.equal(c.highlightShapeBadge.hidden,true);assert.equal(c.highlightShapeBadge.children.length,0);
});
test('leaving highlight resets its shape and badge, while the visual heart preserves both',()=>{
 const {c}=setup();c.TOOL_DEFINITIONS={highlight:{type:'priority'},ruler:{type:'priority'},heart:{type:'visual'}};c.state.visualTools=new Set();c.clearGridHighlights=()=>{};c.cancelWorkspaceGestures=()=>{};c.syncToolsUI=()=>{};
 vm.runInContext(source('resetHighlightShape')+source('toggleTool'),c);
 c.selectHighlightShape('circle');c.toggleTool('heart');assert.equal(c.state.highlightShape,'circle');assert.equal(c.highlightShapeBadge.hidden,false);
 c.toggleTool('highlight');assert.equal(c.state.activeTool,null);assert.equal(c.state.highlightShape,'path');assert.equal(c.highlightShapeBadge.hidden,true);assert.equal(c.highlightShapeBadge.children.length,0);assert.ok(c.highlightShapeButtons.every(button=>button.attrs['aria-pressed']==='false'));assert.match(c.highlightToolButton.attrs['aria-label'],/Traço livre/);
 c.toggleTool('highlight');assert.equal(c.state.highlightShape,'path');c.selectHighlightShape('cone');c.toggleTool('ruler');assert.equal(c.state.activeTool,'ruler');assert.equal(c.state.highlightShape,'path');assert.equal(c.highlightShapeBadge.hidden,true);
});
test('animation and secondary pointers cannot start a submenu hold',()=>{
 const {c,timers}=setup();c.beginHighlightToolPress({isPrimary:false,button:0});assert.equal(timers.size,0);c.state.isMoving=true;c.beginHighlightToolPress({isPrimary:true,button:0});assert.equal(timers.size,0);c.selectHighlightShape('cone');assert.equal(c.state.highlightShape,'path');
});
test('shape choices are exactly four and close icons use centered vector paths',()=>{
 const menu=html.match(/<div id="highlight-shapes"[\s\S]*?<\/div>/)[0];assert.equal((menu.match(/data-highlight-shape=/g)||[]).length,4);assert.equal((html.match(/class="asset-explorer__close"[^>]*>[\s\S]*?<\/button>/g)||[]).filter(button=>button.includes('<svg')).length,6);assert.ok(!html.includes('>×</button>'));assert.match(source('renderAssetExplorerContent'),/M12 5v14M5 12h14/);
});
