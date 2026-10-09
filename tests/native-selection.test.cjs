const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function source(name){const i=script.indexOf(`      function ${name}(`);assert.ok(i>=0);return script.slice(i,script.indexOf('\n      }',i)+8);}
function setup(){
 class Element{constructor(tagName='BUTTON',type=''){this.tagName=tagName;this.type=type}closest(){return ['INPUT','TEXTAREA'].includes(this.tagName)||this.isContentEditable||this.log?this:null}matches(){return Boolean(this.log)}}
 const selection={isCollapsed:false,anchorNode:null,focusNode:null,cleared:0,removeAllRanges(){this.cleared++}};
 const c=vm.createContext({Element,window:{getSelection:()=>selection},document:{body:{contains:()=>true}}});
 for(const name of ['allowsNativeTextSelection','preventInterfaceTextSelection','clearInterfaceTextSelection'])vm.runInContext(source(name),c);
 return {c,selection,Element};
}
test('map, tool icons, labels, dock and nontext controls refuse native selection',()=>{
 const {c,Element}=setup();for(const tag of ['DIV','BUTTON','IMG','SVG','SPAN']){const target=new Element(tag);let prevented=false;c.preventInterfaceTextSelection({target,preventDefault(){prevented=true}});assert.equal(prevented,true,tag)}
 for(const type of ['checkbox','range','file','color','radio'])assert.equal(c.allowsNativeTextSelection(new Element('INPUT',type)),false);
});
test('text fields, editable content and logs keep normal selection and copying',()=>{
 const {c,Element}=setup();const fields=['text','number','email','url','tel','search','password'].map(type=>new Element('INPUT',type));fields.push(new Element('TEXTAREA'),Object.assign(new Element('DIV'),{isContentEditable:true}),Object.assign(new Element('PRE'),{log:true}));
 for(const target of fields){assert.equal(c.allowsNativeTextSelection(target),true);c.preventInterfaceTextSelection({target,preventDefault(){throw Error('must preserve text selection')}});assert.equal(c.allowsNativeTextSelection({parentElement:target}),true)}
});
test('Safari fallback removes interface ranges while preserving field ranges',()=>{
 const {c,selection,Element}=setup();selection.anchorNode={parentElement:new Element('SPAN')};selection.focusNode={parentElement:new Element('BUTTON')};c.clearInterfaceTextSelection();assert.equal(selection.cleared,1);
 selection.anchorNode={parentElement:new Element('INPUT','text')};c.clearInterfaceTextSelection();assert.equal(selection.cleared,1);selection.anchorNode={parentElement:new Element('DIV')};selection.isCollapsed=true;c.clearInterfaceTextSelection();assert.equal(selection.cleared,1);
});
test('Safari CSS protection covers all interface descendants without depending on touch mode',()=>{
 assert.match(html,/body, body \* \{ -webkit-user-select: none; user-select: none; -webkit-touch-callout: none;/);assert.match(html,/body img, body svg \{ -webkit-user-drag: none;/);assert.match(html,/document.addEventListener\("selectstart", preventInterfaceTextSelection, true\)/);
});
