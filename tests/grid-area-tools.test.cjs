const {test}=require('node:test'),assert=require('node:assert/strict'),g=require('../grid-area-tools.js');
const start={col:0,row:0},key=p=>`${p.col},${p.row}`;
test('diagonal strokes use one cell per step regardless of subcell crossing',()=>{
 for(const end of [{col:6,row:5},{col:-6,row:5},{col:3,row:-6},{col:0,row:6}]){const cells=g.path(start,end);assert.equal(cells.length,7);assert.equal(key(cells[0]),'0,0');assert.equal(key(cells.at(-1)),key(end));for(let i=1;i<cells.length;i++){assert.ok(Math.abs(cells[i].col-cells[i-1].col)<=1);assert.ok(Math.abs(cells[i].row-cells[i-1].row)<=1)}}
});
test('area modes do nothing on a click and line excludes the origin',()=>{
 for(const mode of ['line','circle','square','cone'])assert.equal(g.area(mode,start,start).cells.length,0);
 assert.equal(g.area('path',start,start).cells.length,1);
 const line=g.area('line',start,{col:6,row:6});assert.equal(line.steps,6);assert.equal(line.cells.length,6);assert.ok(!line.cells.some(p=>key(p)==='0,0'));
});
test('centered circle templates match the one-cell, cross and stepped disk references',()=>{
 assert.deepEqual(g.area('circle',start,{col:1,row:0}).cells,[start]);const small=g.area('circle',start,{col:2,row:0});assert.equal(small.cells.length,5);assert.ok(small.cells.some(p=>key(p)==='0,0'));assert.ok(!small.cells.some(p=>key(p)==='1,1'));
 const large=g.area('circle',start,{col:4,row:0});assert.equal(large.cells.length,37);const keys=new Set(large.cells.map(key));for(const p of large.cells){assert.ok(keys.has(`${-p.col},${p.row}`));assert.ok(keys.has(`${p.col},${-p.row}`))}
});
test('squares expand from their origin face and cardinal cones widen with length',()=>{
 for(const end of [{col:3,row:0},{col:0,row:-3},{col:3,row:3},{col:-3,row:3}]){const square=g.area('square',start,end);assert.equal(square.cells.length,9);assert.ok(!square.cells.some(p=>key(p)==='0,0'))}
 const cone=g.area('cone',start,{col:0,row:3});assert.equal(cone.cells.length,7);assert.equal(cone.cells.filter(p=>p.row===1).length,1);assert.equal(cone.cells.filter(p=>p.row===2).length,3);assert.equal(cone.cells.filter(p=>p.row===3).length,3);
 const diagonal=g.area('cone',start,{col:3,row:3});assert.equal(diagonal.cells.length,6);assert.ok(diagonal.cells.every(p=>p.col>=1&&p.row>=1&&p.col+p.row<=4));
});
test('huge shapes only iterate and return cells within visible map bounds',()=>{
 const bounds={minCol:-2,maxCol:2,minRow:-2,maxRow:2};for(const mode of ['circle','square','cone']){const area=g.area(mode,start,{col:10000,row:0},bounds);assert.ok(area.cells.length<=25);assert.ok(area.cells.every(p=>p.col>=-2&&p.col<=2&&p.row>=-2&&p.row<=2))}
});
