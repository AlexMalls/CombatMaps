const {test}=require('node:test'),assert=require('node:assert/strict');
const fullscreen=require('../fullscreen-controller.js');

test('fullscreen controller requests and exits fullscreen',async()=>{
  let requested=0,exited=0;
  const doc={
    fullscreenElement:null,
    documentElement:{requestFullscreen(){requested++;doc.fullscreenElement=doc.documentElement;}},
    exitFullscreen(){exited++;doc.fullscreenElement=null;}
  };
  await fullscreen.toggle(doc);
  assert.equal(requested,1);
  assert.equal(fullscreen.isFullscreen(doc),true);
  await fullscreen.toggle(doc);
  assert.equal(exited,1);
  assert.equal(fullscreen.isFullscreen(doc),false);
});

test('five finger tap toggles once and movement cancels it',async()=>{
  const handlers={};
  const target={
    addEventListener(type,fn){handlers[type]=fn;},
    removeEventListener(){}
  };
  let toggles=0;
  fullscreen.installFiveFingerTap(target,()=>{toggles++;});
  const touches=Array.from({length:5},(_,i)=>({identifier:i,clientX:i*10,clientY:10}));
  handlers.touchstart({touches});
  handlers.touchend({touches:[]});
  await Promise.resolve();
  assert.equal(toggles,1);

  handlers.touchstart({touches});
  handlers.touchmove({touches:touches.map((t,i)=>i===0?{...t,clientX:t.clientX+40}:t)});
  handlers.touchend({touches:[]});
  await Promise.resolve();
  assert.equal(toggles,1);
});
