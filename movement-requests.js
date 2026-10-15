// Durable proposals. Only a decision can change authoritative token coordinates.
(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const clean=state=>({pending:state?.pending||[],decisions:state?.decisions||[]});
 function group(plan){const groups=new Map();plan.forEach(item=>{const key=item.groupId||Symbol();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)});return [...groups.values()]}
 function enqueue(state,requests){const next=clone(clean(state)),known=new Set([...next.pending,...next.decisions].map(x=>x.id));for(const r of requests){if(known.has(r.id))continue;if(!r.id||!r.actorId||!r.sceneId||!Array.isArray(r.moves)||!r.moves.length)throw Error('Pedido de movimento inválido.');next.pending.push(clone(r));known.add(r.id)}if(next.pending.length>100)throw Error('A fila está cheia. Aguarde o Mestre avaliar os pedidos.');return next}
 const overlap=(a,b)=>a.col<b.col+b.size&&a.col+a.size>b.col&&a.row<b.row+b.size&&a.row+a.size>b.row;
 function valid(scene,r){
  if(!scene||scene.grid.size!==r.gridSize||scene.canvas.width!==r.canvas.width||scene.canvas.height!==r.canvas.height)return false;
  const ids=new Set(r.moves.map(m=>m.id));if(ids.size!==r.moves.length)return false;
  for(const m of r.moves){const token=scene.tokens.find(t=>t.id===m.id);if(!token||token.life<=0||!['col','row','size'].every(k=>token[k]===m.from[k]))return false;
   const p=m.to;if(!['col','row','size'].every(k=>Number.isInteger(p[k]))||p.size!==token.size||p.size<1)return false;
   const x=scene.canvas.width/2-r.gridSize/2+p.col*r.gridSize,y=scene.canvas.height/2-r.gridSize/2+p.row*r.gridSize;
   if(x<0||y<0||x+p.size*r.gridSize>scene.canvas.width||y+p.size*r.gridSize>scene.canvas.height)return false;
   if(scene.tokens.some(t=>!ids.has(t.id)&&t.life>0&&overlap(t,p)))return false;
  }
  return !r.moves.some((m,i)=>r.moves.slice(i+1).some(n=>overlap(m.to,n.to)));
 }
 function decide(state,project,ids,accept){const next=clone(clean(state)),updated=clone(project),wanted=new Set(ids),acceptedIds=new Set();let changed=false;
  if(accept){
   // Resolve the requested final arrangement together, including swaps. Drop
   // invalid groups until no accepted move depends on a rejected departure.
   for(const scene of updated?.scenes||[]){let candidates=next.pending.filter(r=>wanted.has(r.id)&&r.sceneId===scene.id);
    const seen=new Set();candidates=candidates.filter(r=>{if(r.moves.some(m=>seen.has(m.id)))return false;r.moves.forEach(m=>seen.add(m.id));return true});
    let again=true;while(again){again=false;const all=candidates.flatMap(r=>r.moves),moving=new Set(all.map(m=>m.id));
     const kept=candidates.filter(r=>{const isolated={...scene,tokens:scene.tokens.filter(t=>!moving.has(t.id)||r.moves.some(m=>m.id===t.id))};return valid(isolated,r)&&!r.moves.some(m=>all.some(n=>n.id!==m.id&&!r.moves.includes(n)&&overlap(m.to,n.to)))});
     if(kept.length!==candidates.length){candidates=kept;again=true;}
    }
    for(const r of candidates){acceptedIds.add(r.id);for(const m of r.moves)Object.assign(scene.tokens.find(t=>t.id===m.id),m.to);}
   }
  }
  next.pending=next.pending.filter(r=>{if(!wanted.has(r.id))return true;changed=true;const accepted=acceptedIds.has(r.id);next.decisions.push({id:r.id,actorId:r.actorId,status:accepted?'accepted':'rejected',reason:accept&&!accepted?'O cenário ou os tokens mudaram; planeje novamente.':''});return false});
  next.decisions=next.decisions.slice(-200);return {state:next,project:updated,changed};
 }

 const api={group,enqueue,decide};if(typeof module==='object')module.exports=api;else root.MovementRequests=api;
})(globalThis);
