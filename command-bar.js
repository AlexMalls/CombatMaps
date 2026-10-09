/* Barra de comando: seleção de consulta independente da seleção de movimento.
 * UI usa os componentes e a paleta globais. Nenhuma imagem/dado vai para servidor. */
(function (root) {
  'use strict';
  function visibilityFade(item, viewport, orientation, fade = 22) {
    const horizontal = orientation === 'top';
    const start = horizontal ? item.left : item.top, end = horizontal ? item.right : item.bottom;
    const min = horizontal ? viewport.left : viewport.top, max = horizontal ? viewport.right : viewport.bottom;
    const size = end - start;
    if (size <= 0 || end <= min || start >= max) return 0;
    const visible = Math.max(0, Math.min(end, max) - Math.max(start, min)) / size;
    const center = (start + end) / 2;
    return Math.max(0, Math.min(1, visible, (center - min) / fade, (max - center) / fade));
  }
  function planBatch(tokens, getInfo, kind, value) {
    if (!['damage','heal','status'].includes(kind)) return [];
    const amount = Number(value);
    if (kind !== 'status' && (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount))) return [];
    if (kind === 'status' && !String(value || '').trim()) return [];
    return tokens.flatMap(token => {
      const info = getInfo(token);
      if (!info || !token.isConnected) return [];
      const before = { life: info.life, status: info.status };
      const after = { life: kind === 'status' ? info.life : Math.min(info.maxLife, Math.max(0, info.life + (kind === 'damage' ? -amount : amount))), status: kind === 'status' ? String(value) : info.status };
      return before.life === after.life && before.status === after.status ? [] : [{ token, before, after }];
    });
  }
  class Selection {
    constructor() { this.tokens = new Set(); }
    toggle(token) { if (this.tokens.has(token)) this.tokens.delete(token); else this.tokens.add(token); }
    add(tokens) { tokens.forEach(token => this.tokens.add(token)); }
    reconcile(tokens) { const available = new Set(tokens); for (const token of this.tokens) if (!available.has(token) || !token.isConnected) this.tokens.delete(token); }
    clear() { this.tokens.clear(); }
  }
  function create(options) {
    const bar = document.getElementById('command-bar'), list = document.getElementById('command-list');
    const links = document.getElementById('command-links'), group = document.getElementById('command-links-group');
    const showLinks = document.getElementById('command-show-links'), status = document.getElementById('command-status-value');
    const damage = document.getElementById('command-damage-value'), heal = document.getElementById('command-heal-value');
    const message = document.getElementById('command-message');
    const selection = new Selection(), rows = new Map(), drawings = new Map();
    const format = new Intl.NumberFormat('pt-BR');
    let open = false, orientation = 'top', hovered = null, frame = 0, gesture = null, dragFrame = 0;
    let previousStatuses = '', suppressClick = false;
    const svgNode = (name, attrs = {}) => { const node = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v); return node; };
    function pulse(token) {
      if (!token || options.getInfo(token)?.life <= 0) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      token.getAnimations().filter(animation => animation.id === 'command-identify').forEach(animation => animation.cancel());
      const animation = token.animate([{filter:'brightness(1)',scale:'1'}, {filter:'brightness(1.8)',scale:reduced?'1':'1.1'}, {filter:'brightness(1)',scale:'1'}], {duration:reduced?350:650,easing:'ease-in-out'});
      animation.id = 'command-identify';
    }
    function syncSelection() {
      rows.forEach((row, token) => row.button.setAttribute('aria-pressed', String(selection.tokens.has(token))));
      const count = selection.tokens.size;
      document.getElementById('command-count').textContent = `${count} selecionado${count === 1 ? '' : 's'}`;
      bar.querySelectorAll('[data-command-action]').forEach(button => { button.disabled = !count || options.isMoving(); });
      schedule();
    }
    function setSelected(token, selected, identify = true) {
      if (!rows.has(token)) return;
      if (selected) selection.tokens.add(token); else selection.tokens.delete(token);
      options.clearMovementSelection();
      if (identify && !showLinks.checked) pulse(token);
      syncSelection();
    }
    function refreshToken(token) {
      const row = rows.get(token), info = options.getInfo(token);
      if (!row || !info) return;
      row.name.textContent = options.getName(token);
      row.life.textContent = `Vida: ${format.format(info.life)} / ${format.format(info.maxLife)}`;
      row.status.textContent = `Status: ${info.status}`;
      row.button.dataset.dead = String(info.life <= 0);
      row.button.setAttribute('aria-label', `${options.getName(token)}. Vida ${format.format(info.life)} de ${format.format(info.maxLife)}. Status ${info.status}`);
      schedule();
    }
    function refreshStatusOptions() {
      const statuses = options.getStatuses();
      const signature = JSON.stringify(statuses);
      if (signature === previousStatuses) return;
      previousStatuses = signature;
      const previous = status.value;
      status.replaceChildren(new Option('Escolher status', ''));
      statuses.forEach(name => status.add(new Option(name, name)));
      if (statuses.includes(previous)) status.value = previous;
    }
    function refresh() {
      if (!open) return;
      const tokens = options.getTokens().filter(token => token.isConnected);
      selection.reconcile(tokens);
      if (hovered && !tokens.includes(hovered)) hovered = null;
      rows.forEach((row,token) => { if (!tokens.includes(token)) { row.button.remove(); rows.delete(token); } });
      tokens.forEach(token => {
        if (!rows.has(token)) {
          const button = document.createElement('button'); button.type = 'button'; button.className = 'command-bar__token'; button.setAttribute('aria-pressed','false');
          const image = document.createElement('img'); image.src = token.querySelector('.token__image').getAttribute('src'); image.alt = ''; image.draggable = false;
          const data = document.createElement('span'); data.className = 'command-bar__token-data';
          const name = document.createElement('strong'), life = document.createElement('span'), statusLabel = document.createElement('span'); data.append(name,life,statusLabel); button.append(image,data); list.append(button);
          rows.set(token,{button,name,life,status:statusLabel});
          button.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && !gesture) { hovered=token; if (!showLinks.checked) pulse(token); schedule(); } });
          button.addEventListener('pointerleave', () => { if (!gesture) { hovered=null; schedule(); } });
          button.addEventListener('focus', () => { hovered=token; schedule(); });
          button.addEventListener('blur', () => { hovered=null; schedule(); });
          button.addEventListener('click', event => { if (suppressClick || event.detail !== 0) return; selection.toggle(token); options.clearMovementSelection(); if (!showLinks.checked) pulse(token); syncSelection(); });
          button.addEventListener('contextmenu', event => event.preventDefault());
        }
        refreshToken(token);
      });
      if (!tokens.length) {
        if (!list.querySelector('.command-bar__empty')) { const empty=document.createElement('p');empty.className='command-bar__empty';empty.textContent='Nenhum token nesta cena.';list.append(empty); }
      } else list.querySelector('.command-bar__empty')?.remove();
      refreshStatusOptions(); syncSelection();
    }
    function clearDrawings() { group.replaceChildren(); drawings.clear(); }
    function renderLinks() {
      frame=0;
      if (!open || !showLinks.checked) { clearDrawings(); return; }
      const active = new Set(selection.tokens); if (hovered) active.add(hovered);
      drawings.forEach((drawing, token) => { if (!active.has(token) || options.getInfo(token)?.life <= 0 || !token.isConnected) { drawing.line.remove(); drawing.outline.remove(); drawings.delete(token); } });
      const viewport=list.getBoundingClientRect();
      active.forEach(token => {
        if (!rows.has(token) || options.getInfo(token)?.life <= 0 || !token.isConnected) return;
        let drawing=drawings.get(token);
        if (!drawing) {
          const line=svgNode('line',{stroke:'url(#command-spectrum)',class:'command-bar__link'}), outline=svgNode('rect',{stroke:'url(#command-spectrum)',class:'command-bar__outline',fill:'none'});
          group.append(line,outline);drawing={line,outline};drawings.set(token,drawing);
        }
        const tokenRect=token.getBoundingClientRect(), rowRect=rows.get(token).button.getBoundingClientRect();
        const outline=options.getOutline(tokenRect), endpoints=options.getLink(tokenRect,{x:rowRect.left,y:rowRect.top,width:rowRect.width,height:rowRect.height});
        for (const [k,v] of Object.entries(outline)) drawing.outline.setAttribute(k,v);
        for (const [k,v] of Object.entries(endpoints)) drawing.line.setAttribute(k,v);
        drawing.line.style.opacity=String(visibilityFade(rowRect,viewport,orientation));
        // O token conserva seu contorno mesmo quando o registro sai da rolagem.
        const map=options.getMapRect();
        drawing.outline.style.opacity=String(tokenRect.right>map.left && tokenRect.left<map.right && tokenRect.bottom>map.top && tokenRect.top<map.bottom ? 1 : 0);
      });
      if (options.isMoving() || bar.getAnimations().length) schedule();
    }
    function schedule() { if (open && !frame) frame=requestAnimationFrame(renderLinks); }
    function stopGesture() {
      const previous=gesture;gesture=null;
      if (previous?.timer) window.clearTimeout(previous.timer);
      if (dragFrame) cancelAnimationFrame(dragFrame);dragFrame=0;
      if (previous) { try { list.releasePointerCapture(previous.id); } catch {} }
    }
    function setOpen(value, transfer=[]) {
      value=Boolean(value);
      if (value === open) { if (value) refresh(); return; }
      open=value;stopGesture();hovered=null;
      bar.dataset.open=String(open);bar.inert=!open;bar.setAttribute('aria-hidden',String(!open));if (open) links.removeAttribute('hidden'); else links.setAttribute('hidden','');
      if (open) { selection.add(transfer);refresh(); }
      else { selection.clear();clearDrawings();if(frame)cancelAnimationFrame(frame);frame=0; }
    }
    function setOrientation(value) {
      orientation=value==='side'?'side':'top';bar.dataset.orientation=orientation;stopGesture();schedule();
    }
    function inspect(tokens, focusToken) {
      if (!open) return;
      selection.add(tokens.filter(token=>rows.has(token)));options.clearMovementSelection();syncSelection();
      const row=rows.get(focusToken);
      row?.button.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
      if (!showLinks.checked) pulse(focusToken);
      schedule();
    }
    function tokenFromElement(element) { const button=element?.closest?.('.command-bar__token');return [...rows].find(([,row])=>row.button===button)?.[0] || null; }
    function dragSelectAt(x,y) {
      const token=tokenFromElement(document.elementFromPoint(x,y));
      if (!token) return;
      const order=[...rows.keys()],index=order.indexOf(token),from=gesture.lastIndex;
      for(let i=Math.min(from,index);i<=Math.max(from,index);i++)setSelected(order[i],gesture.select,false);
      gesture.lastIndex=index;
    }
    function autoScroll() {
      dragFrame=0;if(!gesture?.dragging)return;
      const rect=list.getBoundingClientRect(),horizontal=orientation==='top';
      const coordinate=horizontal?gesture.x:gesture.y,start=horizontal?rect.left:rect.top,end=horizontal?rect.right:rect.bottom;
      const delta=coordinate<start+28?-6:coordinate>end-28?6:0;
      if(delta){if(horizontal)list.scrollLeft+=delta;else list.scrollTop+=delta;dragSelectAt(gesture.x,gesture.y);schedule();}
      dragFrame=requestAnimationFrame(autoScroll);
    }
    list.addEventListener('pointerdown',event=>{
      if(!event.isPrimary || event.button!==0)return;
      const token=tokenFromElement(event.target);if(!token)return;
      stopGesture();suppressClick=true;
      gesture={id:event.pointerId,token,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,lastIndex:[...rows.keys()].indexOf(token),select:!selection.tokens.has(token),dragging:false,held:false,touch:event.pointerType==='touch',scrollLeft:list.scrollLeft,scrollTop:list.scrollTop};
      if (gesture.touch) {
        const current=gesture;
        current.timer=window.setTimeout(()=>{if(gesture!==current || current.scrolling)return;current.held=true;current.dragging=true;setSelected(current.token,current.select);hovered=null;autoScroll();},400);
      }
      list.setPointerCapture(event.pointerId);event.preventDefault();
    });
    list.addEventListener('pointermove',event=>{
      if(!gesture || gesture.id!==event.pointerId)return;
      gesture.x=event.clientX;gesture.y=event.clientY;
      const moved=Math.hypot(event.clientX-gesture.startX,event.clientY-gesture.startY)>8;
      if(gesture.touch && !gesture.held && (moved || gesture.scrolling)) {
        gesture.scrolling=true;window.clearTimeout(gesture.timer);
        if(orientation==='top')list.scrollLeft=gesture.scrollLeft-(event.clientX-gesture.startX);else list.scrollTop=gesture.scrollTop-(event.clientY-gesture.startY);
        event.preventDefault();schedule();return;
      }
      if(!gesture.dragging && moved){gesture.dragging=true;setSelected(gesture.token,gesture.select);hovered=null;autoScroll();}
      if(gesture.dragging){event.preventDefault();dragSelectAt(event.clientX,event.clientY);}
    });
    list.addEventListener('pointerup',event=>{
      if(!gesture || gesture.id!==event.pointerId)return;
      if(!gesture.dragging && !gesture.scrolling)setSelected(gesture.token,gesture.select);
      stopGesture();window.setTimeout(()=>{suppressClick=false;},0);
    });
    list.addEventListener('pointercancel',()=>{stopGesture();suppressClick=false;});
    list.addEventListener('lostpointercapture',()=>{if(gesture)stopGesture();});
    list.addEventListener('scroll',schedule,{passive:true});
    bar.addEventListener('transitionrun',schedule);bar.addEventListener('transitionend',schedule);
    window.addEventListener('resize',schedule);
    showLinks.addEventListener('change',()=>{if(!showLinks.checked)clearDrawings();else schedule();});
    [damage,heal].forEach(input=>{input.addEventListener('input',()=>{input.value=input.value.replace(/[^0-9]/g,'').slice(0,12);});});
    bar.querySelectorAll('[data-command-action]').forEach(button=>button.addEventListener('click',()=>{
      const kind=button.dataset.commandAction, value=kind==='damage'?damage.value:kind==='heal'?heal.value:status.value;
      if(kind==='status' && !options.getStatuses().includes(value)){message.textContent='Escolha um status.';return;}
      const count=options.applyBatch([...selection.tokens],kind,value);
      message.textContent=count?`${kind==='damage'?'Dano':kind==='heal'?'Cura':'Status'} aplicado em ${count} token${count===1?'':'s'}.`:'Nenhuma alteração aplicada.';
      if(kind==='status' && value)status.value='';
      refresh();
    }));
    return {setOpen,setOrientation,inspect,refresh,refreshToken,schedule,isOpen:()=>open,getSelected:()=>[...selection.tokens],selection};
  }
  const api={create,Selection,visibilityFade,planBatch};
  if(typeof module!=='undefined' && module.exports)module.exports=api;else root.CommandBar=api;
})(typeof globalThis!=='undefined'?globalThis:this);
