(function(root){
 'use strict';
 function fitScale(world,viewport){return Math.min(Math.max(1,viewport.width)/Math.max(1,world.width),Math.max(1,viewport.height)/Math.max(1,world.height));}
 function clampCamera(world,viewport,zoom,x,y){const scale=fitScale(world,viewport)*zoom;const axis=(position,available,extent)=>{const gap=available-extent*scale;return gap>=0?gap/2:Math.max(gap,Math.min(0,position));};return {x:axis(x,viewport.width,world.width),y:axis(y,viewport.height,world.height)};}
 function worldPoint(point,world,viewport,camera){const scale=fitScale(world,viewport)*camera.zoom;return {x:(point.x-camera.x)/scale,y:(point.y-camera.y)/scale};}
 function reframeCamera(world,before,after,camera){const center=worldPoint({x:before.width/2,y:before.height/2},world,before,camera),scale=fitScale(world,after)*camera.zoom;return clampCamera(world,after,camera.zoom,after.width/2-center.x*scale,after.height/2-center.y*scale);}
 const api={fitScale,clampCamera,worldPoint,reframeCamera};if(typeof module==='object')module.exports=api;else root.WorldGeometry=api;
})(globalThis);
