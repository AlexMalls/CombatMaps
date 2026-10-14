(function(root){
  'use strict';

  function fullscreenElement(doc){
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  }

  function isFullscreen(doc){
    return Boolean(fullscreenElement(doc));
  }

  function canFullscreen(doc){
    const el=doc && doc.documentElement;
    return Boolean(el && (el.requestFullscreen || el.webkitRequestFullscreen));
  }

  function request(doc){
    const el=doc && doc.documentElement;
    if(!el) return Promise.reject(new Error('Documento indisponível.'));
    const standard=el.requestFullscreen;
    const webkit=el.webkitRequestFullscreen;
    if(!standard&&!webkit) return Promise.reject(new Error('Tela cheia não suportada.'));
    try{
      if(standard){
        try{return Promise.resolve(standard.call(el,{navigationUI:'hide'}));}
        catch{return Promise.resolve(standard.call(el));}
      }
      return Promise.resolve(webkit.call(el));
    }catch(error){
      return Promise.reject(error);
    }
  }

  function exit(doc){
    const fn=doc.exitFullscreen || doc.webkitExitFullscreen;
    if(!fn) return Promise.resolve();
    try{return Promise.resolve(fn.call(doc));}
    catch(error){return Promise.reject(error);}
  }

  function toggle(doc){
    return isFullscreen(doc) ? exit(doc) : request(doc);
  }

  function isStandalone(win){
    if(!win) return false;
    const standalone=Boolean(win.navigator && win.navigator.standalone);
    const displayMode=typeof win.matchMedia==='function' &&
      (win.matchMedia('(display-mode: fullscreen)').matches || win.matchMedia('(display-mode: standalone)').matches);
    return standalone || displayMode;
  }

  function installFiveFingerTap(target,onToggle,options){
    if(!target || typeof target.addEventListener!=='function') return function(){};
    const maxDuration=options?.maxDuration ?? 700;
    const maxMovement=options?.maxMovement ?? 28;
    let gesture=null;

    function snapshot(touches){
      const points=new Map();
      for(const touch of touches) points.set(touch.identifier,{x:touch.clientX,y:touch.clientY});
      return points;
    }

    function onStart(event){
      if(event.touches.length===5){
        gesture={started:Date.now(),points:snapshot(event.touches),moved:false};
      }else if(event.touches.length>5){
        gesture=null;
      }
    }

    function onMove(event){
      if(!gesture) return;
      for(const touch of event.touches){
        const start=gesture.points.get(touch.identifier);
        if(!start) continue;
        if(Math.hypot(touch.clientX-start.x,touch.clientY-start.y)>maxMovement){
          gesture.moved=true;
          break;
        }
      }
    }

    function onEnd(event){
      if(!gesture) return;
      if(event.touches.length===0){
        const current=gesture;
        gesture=null;
        if(!current.moved && Date.now()-current.started<=maxDuration){
          Promise.resolve(onToggle()).catch(function(){});
        }
      }
    }

    function onCancel(){gesture=null;}

    target.addEventListener('touchstart',onStart,{passive:true,capture:true});
    target.addEventListener('touchmove',onMove,{passive:true,capture:true});
    target.addEventListener('touchend',onEnd,{passive:true,capture:true});
    target.addEventListener('touchcancel',onCancel,{passive:true,capture:true});

    return function(){
      target.removeEventListener('touchstart',onStart,true);
      target.removeEventListener('touchmove',onMove,true);
      target.removeEventListener('touchend',onEnd,true);
      target.removeEventListener('touchcancel',onCancel,true);
    };
  }

  const api={fullscreenElement,isFullscreen,canFullscreen,request,exit,toggle,isStandalone,installFiveFingerTap};
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.FullscreenController=api;
})(globalThis);
