/* Geometria compartilhada da demarcação. Medidas em células, convertidas pela distância do grid.
   Templates discretos centrados nas células conforme as referências visuais do projeto.
   Cone/cubo/linha não incluem a célula de origem. Círculo inclui a origem no raio. */
(function(root){
  'use strict';
  function path(start,end){
    const dx=end.col-start.col,dy=end.row-start.row,n=Math.max(Math.abs(dx),Math.abs(dy));
    return Array.from({length:n+1},(_,i)=>({col:start.col+Math.round(n?dx*i/n:0),row:start.row+Math.round(n?dy*i/n:0)}));
  }
  function area(mode,start,end,bounds){
    const dx=end.col-start.col,dy=end.row-start.row,n=Math.max(Math.abs(dx),Math.abs(dy));
    const inside=p=>!bounds||(p.col>=bounds.minCol&&p.col<=bounds.maxCol&&p.row>=bounds.minRow&&p.row<=bounds.maxRow);
    if(mode==='path'||mode==='line')return {cells:(mode==='line'?path(start,end).slice(1):path(start,end)).filter(inside),steps:n};
    if(!n)return {cells:[],steps:0};
    const angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4;
    const sx=Math.round(Math.cos(angle)),sy=Math.round(Math.sin(angle));
    const cells=[],minX=Math.max(-n,bounds?bounds.minCol-start.col:-n),maxX=Math.min(n,bounds?bounds.maxCol-start.col:n),minY=Math.max(-n,bounds?bounds.minRow-start.row:-n),maxY=Math.min(n,bounds?bounds.maxRow-start.row:n);
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
      let hit=false;
      if(mode==='circle')hit=n===1?x===0&&y===0:x*x+y*y<n*(n-1);
      else if(sx&&sy){
        const a=x*sx,b=y*sy;
        hit=mode==='square'?a>=1&&b>=1&&a<=n&&b<=n:a>=1&&b>=1&&a+b<=n+1;
      }else{
        const along=sx?x*sx:y*sy,cross=sx?y:x;
        hit=along>=1&&along<=n&&(mode==='square'?cross>=-Math.floor((n-1)/2)&&cross<=Math.ceil((n-1)/2):Math.abs(cross)<=along/2);
      }
      if(hit)cells.push({col:start.col+x,row:start.row+y});
    }
    return {cells,steps:n};
  }
  const api={path,area};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.GridAreaTools=api;
})(typeof window==='undefined'?globalThis:window);
