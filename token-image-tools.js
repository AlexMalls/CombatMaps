/* Operações puras sobre pixels/máscaras, compartilhadas pelo editor e pelos testes. */
(function(root){
  'use strict';
  function magicMask(data,width,height,x,y,tolerance=24,contiguous=true){
    const count=width*height,mask=new Uint8Array(count),seed=(Math.max(0,Math.min(height-1,Math.floor(y)))*width+Math.max(0,Math.min(width-1,Math.floor(x))))*4;
    const matches=i=>{const p=i*4;if(Math.abs(data[p+3]-data[seed+3])>tolerance)return false;if(data[seed+3]===0)return data[p+3]<=tolerance;return Math.max(Math.abs(data[p]-data[seed]),Math.abs(data[p+1]-data[seed+1]),Math.abs(data[p+2]-data[seed+2]))<=tolerance;};
    if(!contiguous){for(let i=0;i<count;i++)if(matches(i))mask[i]=255;return mask;}
    const queue=new Uint32Array(count),seen=new Uint8Array(count);let head=0,tail=0;
    const visit=i=>{if(seen[i])return;seen[i]=1;if(matches(i)){mask[i]=255;queue[tail++]=i;}};
    visit(seed/4);while(head<tail){const i=queue[head++],col=i%width;if(col>0)visit(i-1);if(col<width-1)visit(i+1);if(i>=width)visit(i-width);if(i+width<count)visit(i+width);}
    return mask;
  }
  function combineMasks(previous,next,mode='replace'){
    if(!previous||mode==='replace')return next;
    const result=new Uint8Array(next.length);for(let i=0;i<next.length;i++)result[i]=mode==='add'?Math.max(previous[i],next[i]):mode==='subtract'?Math.max(0,previous[i]-next[i]):Math.min(previous[i],next[i]);return result;
  }
  function maskBounds(mask,width,height){
    let left=width,right=-1,top=height,bottom=-1;for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
    return right<left?null:{x:left,y:top,width:right-left+1,height:bottom-top+1};
  }
  function featherMask(mask,width,height,radius){
    radius=Math.max(0,Math.min(30,Math.round(radius)));if(!radius)return mask.slice();
    const temp=new Uint8Array(mask.length),result=new Uint8Array(mask.length),diameter=radius*2+1;
    for(let y=0;y<height;y++){let sum=0;for(let x=-radius;x<=radius;x++)if(x>=0&&x<width)sum+=mask[y*width+x];for(let x=0;x<width;x++){temp[y*width+x]=Math.round(sum/diameter);if(x-radius>=0)sum-=mask[y*width+x-radius];if(x+radius+1<width)sum+=mask[y*width+x+radius+1];}}
    for(let x=0;x<width;x++){let sum=0;for(let y=-radius;y<=radius;y++)if(y>=0&&y<height)sum+=temp[y*width+x];for(let y=0;y<height;y++){result[y*width+x]=Math.round(sum/diameter);if(y-radius>=0)sum-=temp[(y-radius)*width+x];if(y+radius+1<height)sum+=temp[(y+radius+1)*width+x];}}
    return result;
  }
  function smoothMask(mask,width,height){
    const result=new Uint8Array(mask.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){let sum=0,n=0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy;if(nx>=0&&ny>=0&&nx<width&&ny<height){sum+=mask[ny*width+nx];n++;}}result[y*width+x]=sum/n>=128?255:0;}return result;
  }
  function growMask(mask,width,height,expand=true){
    const result=new Uint8Array(mask.length);for(let y=0;y<height;y++)for(let x=0;x<width;x++){let value=expand?0:255;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,v=nx>=0&&ny>=0&&nx<width&&ny<height?mask[ny*width+nx]:0;value=expand?Math.max(value,v):Math.min(value,v);}result[y*width+x]=value;}return result;
  }
  function adjustPixels(data,options={},mask=null){
    const result=new Uint8ClampedArray(data),brightness=(options.brightness||0)*2.55,contrast=(100+(options.contrast||0))/100,saturation=(100+(options.saturation||0))/100;
    for(let i=0;i<data.length;i+=4){const weight=mask?mask[i/4]/255:1;if(!weight)continue;let rgb=[data[i],data[i+1],data[i+2]];
      if(options.invert)rgb=rgb.map(c=>255-c);const gray=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      rgb=rgb.map(c=>options.grayscale?gray:gray+(c-gray)*saturation);rgb=rgb.map(c=>(c-128)*contrast+128+brightness);
      for(let k=0;k<3;k++)result[i+k]=data[i+k]+(Math.max(0,Math.min(255,rgb[k]))-data[i+k])*weight;
    }return result;
  }
  const api={magicMask,combineMasks,maskBounds,featherMask,smoothMask,growMask,adjustPixels};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.TokenImageTools=api;
})(typeof window==='undefined'?globalThis:window);
