const {test}=require('node:test'),assert=require('node:assert/strict'),t=require('../token-image-tools.js');
const rgba=colors=>new Uint8ClampedArray(colors.flatMap(rgb=>[...rgb,255]));
test('magic wand respects tolerance, connectivity and disconnected color matching',()=>{
 const pixels=rgba([[255,255,255],[252,255,255],[0,0,0],[255,255,255]]);
 assert.deepEqual([...t.magicMask(pixels,4,1,0,0,4,true)],[255,255,0,0]);assert.deepEqual([...t.magicMask(pixels,4,1,0,0,0,true)],[255,0,0,0]);assert.deepEqual([...t.magicMask(pixels,4,1,0,0,4,false)],[255,255,0,255]);
 const transparent=new Uint8ClampedArray([0,0,0,0,255,255,255,0,255,255,255,255]);assert.deepEqual([...t.magicMask(transparent,3,1,0,0,0,true)],[255,255,0]);
});
test('selection add subtract and intersect preserve unmodified masks',()=>{
 const a=new Uint8Array([255,0,255]),b=new Uint8Array([0,255,255]);assert.deepEqual([...t.combineMasks(a,b,'add')],[255,255,255]);assert.deepEqual([...t.combineMasks(a,b,'subtract')],[255,0,0]);assert.deepEqual([...t.combineMasks(a,b,'intersect')],[0,0,255]);assert.deepEqual([...a],[255,0,255]);
});
test('feather creates partial transparency, expanding grows and contracting shrinks selection',()=>{
 const a=new Uint8Array(25);a[12]=255;const f=t.featherMask(a,5,5,1);assert.ok(f[12]>0&&f[12]<255);assert.ok(f[11]>0);assert.equal(f[0],0);
 const grown=t.growMask(a,5,5);assert.equal([...grown].filter(Boolean).length,9);assert.deepEqual(t.maskBounds(grown,5,5),{x:1,y:1,width:3,height:3});const shrunk=t.growMask(grown,5,5,false);assert.equal([...shrunk].filter(Boolean).length,1);assert.equal(shrunk[12],255);
});
test('smoothing removes isolated speckles and color adjustments preserve alpha and selection',()=>{
 const m=new Uint8Array(25);m[12]=255;assert.equal(t.smoothMask(m,5,5)[12],0);
 const pixels=new Uint8ClampedArray([255,0,0,128,0,0,255,255]);const gray=t.adjustPixels(pixels,{grayscale:true},new Uint8Array([255,0]));assert.equal(gray[0],gray[1]);assert.equal(gray[1],gray[2]);assert.equal(gray[3],128);assert.deepEqual([...gray.slice(4)],[0,0,255,255]);
 assert.deepEqual([...t.adjustPixels(pixels,{invert:true}).slice(0,4)],[0,255,255,128]);assert.deepEqual([...pixels.slice(0,4)],[255,0,0,128]);
});
test('magic refinement fills tiny interior gaps and antialiases boundaries without shrinking full selections',()=>{
 const full=new Uint8Array(25).fill(255);full[12]=0;const refined=t.refineMagicMask(full,5,5);assert.equal(refined[12],255);assert.equal(refined[0],255);assert.equal(full[12],0);
 const half=new Uint8Array(25);for(let y=0;y<5;y++)for(let x=0;x<2;x++)half[y*5+x]=255;const soft=t.refineMagicMask(half,5,5);assert.ok(soft[11]>0&&soft[11]<255);assert.ok(soft[12]>0&&soft[12]<255);assert.equal(soft[14],0);
});
test('mosaic averages visible colors while preserving every transparent PNG pixel',()=>{
 const data=new Uint8ClampedArray([255,0,0,255,0,0,255,0]);const result=t.pixelatePixels(data,2,1,2);assert.deepEqual([...result],[255,0,0,255,255,0,0,0]);assert.deepEqual([...data],[255,0,0,255,0,0,255,0]);
});
