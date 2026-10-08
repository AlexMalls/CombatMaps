/* Editor raster local: as ferramentas trabalham numa cópia e só Aplicar altera o rascunho. */
(function (root) {
  "use strict";
  function selectionBounds(points, width, height) {
    if (!points.length) return null;
    const x = Math.max(0, Math.floor(Math.min(...points.map(p => p.x))));
    const y = Math.max(0, Math.floor(Math.min(...points.map(p => p.y))));
    const right = Math.min(width, Math.ceil(Math.max(...points.map(p => p.x))));
    const bottom = Math.min(height, Math.ceil(Math.max(...points.map(p => p.y))));
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  }
  function rectanglePoints(start, end) {
    return [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }];
  }
  function polygonArea(points) {
    return Math.abs(points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p.x * q.y - q.x * p.y;
    }, 0)) / 2;
  }
  function canvasPoint(clientX, clientY, rect, width, height) {
    return { x: Math.max(0, Math.min(width, (clientX - rect.left) * width / rect.width)), y: Math.max(0, Math.min(height, (clientY - rect.top) * height / rect.height)) };
  }
  function loupePosition(x, y, size, width, height) {
    return { left: Math.max(8, Math.min(width - size - 8, x - size / 2)), top: Math.max(8, Math.min(height - size - 8, y >= size + 32 ? y - size - 32 : y + 32)) };
  }
  const geometry = { selectionBounds, rectanglePoints, polygonArea, canvasPoint, loupePosition };
  if (typeof module !== "undefined" && module.exports) module.exports = geometry;
  if (!root.document) return;
  const ACTIVE_TOOLS = new Set(["pan", "rectangle", "ellipse", "lasso", "wand"]);
  const touches = new Map();
  let pinch = null, pinchBlocked = false, pendingTouchAction = null, filterDraft = null, changingCapture = false;
  const TOOLS = ["pan", "rectangle", "ellipse", "lasso", "wand", "brush", "eraser", "bucket", "eyedropper"];
  const pixelTools = root.TokenImageTools;
  let loupePointer = null;
  let ui, canvas, context, maskCanvas, mask = null, maskRect = null, original, points = [], gesture = null, tool = "lasso", zoom = 1, history = [], redo = [], generation = 0, busy = false, onApply;
  function setting(name, fallback) { return ui.dialog.querySelector(`[data-image-setting="${name}"]`)?.value ?? fallback; }
  function checked(name, fallback) { return ui.dialog.querySelector(`[data-image-setting="${name}"]`)?.checked ?? fallback; }
  function init() {
    if (ui) return;
    const dialog = document.getElementById("token-image-editor");
    ui = { dialog, viewport: dialog.querySelector(".image-editor__viewport"), stage: dialog.querySelector(".image-editor__stage"), selection: dialog.querySelector("polygon"), overlay: dialog.querySelector("svg"), error: dialog.querySelector("[role=status]"), zoom: dialog.querySelector("[data-image-setting=zoom]") || dialog.querySelector("input[type=range]"), maskOverlay: dialog.querySelector("#image-editor-mask") || newCanvas(1, 1) };
    ui.loupe = dialog.querySelector("#image-editor-loupe");
    canvas = document.getElementById("image-editor-canvas"); context = canvas.getContext("2d"); maskCanvas = newCanvas(1, 1);
    dialog.querySelectorAll("[data-image-action]").forEach(button => button.addEventListener("click", () => action(button.dataset.imageAction)));
    ui.zoom?.addEventListener("input", () => { cancelGesture(); zoom = Number(ui.zoom.value) / 100; render(); });
    dialog.querySelectorAll("[data-image-setting]").forEach(input => { if (input.dataset.imageSetting !== "zoom") input.addEventListener("input", render); });
    canvas.addEventListener("pointerdown", begin); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", event => { endTouch(event); cancelGesture(); }); canvas.addEventListener("lostpointercapture", event => { if (changingCapture || canvas.hasPointerCapture(event.pointerId)) return; if (touches.has(event.pointerId)) resetTouches(); cancelGesture(); }); canvas.addEventListener("contextmenu", event => event.preventDefault());
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.target?.matches?.("input, select, textarea")) return;
      const key = event.key.toLowerCase(), modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "z") { event.preventDefault(); action(event.shiftKey ? "redo" : "undo"); }
      else if (modifier && key === "y") { event.preventDefault(); action("redo"); }
      else if (modifier && key === "a") { event.preventDefault(); action("select-all"); }
      else if (modifier && key === "d") { event.preventDefault(); action("deselect"); }
      else if (["delete", "backspace"].includes(key)) { event.preventDefault(); action("delete"); }
      else if (!modifier && { v: "pan", m: "rectangle", l: "lasso", w: "wand", b: "brush", e: "eraser", g: "bucket", i: "eyedropper" }[key]) action({ v: "pan", m: "rectangle", l: "lasso", w: "wand", b: "brush", e: "eraser", g: "bucket", i: "eyedropper" }[key]);
    });
    ui.viewport.addEventListener?.("pointerdown", event => { if (event.target !== canvas && event.pointerType === "touch") startTouch(event); });
    ui.viewport.addEventListener?.("pointermove", event => { if (event.target !== canvas && event.pointerType === "touch") moveTouch(event); });
    ui.viewport.addEventListener?.("pointerup", event => { if (event.target !== canvas) endTouch(event); });
    ui.viewport.addEventListener?.("pointercancel", event => { if (event.target !== canvas) endTouch(event); });
    ui.dialog.addEventListener("selectstart", event => { if (!event.target?.matches?.("input, textarea")) event.preventDefault(); });
    ui.filters = ui.dialog.querySelector("#image-filters") || document.querySelector?.("#image-filters");
    if (ui.filters) {
      ui.filters.querySelectorAll("[data-filter-setting]").forEach(input => input.addEventListener("input", previewFilters));
      ui.filters.querySelectorAll("[data-filter-close]").forEach(button => button.addEventListener("click", () => closeFilters(false)));
      ui.filters.querySelector("[data-filter-apply]").addEventListener("click", () => closeFilters(true));
      ui.filters.addEventListener("cancel", event => { event.preventDefault(); closeFilters(false); });
      ui.filters.addEventListener("keydown", event => event.stopPropagation());
    }
    window.addEventListener("blur", () => { resetTouches(); cancelGesture(); });
  }
  function render() {
    ui.stage.style.width = `${canvas.width * zoom}px`; ui.stage.style.height = `${canvas.height * zoom}px`;
    ui.stage.dataset.tool = tool;
    ui.overlay.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    ui.selection.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
    ui.selection.setAttribute("stroke-width", String(1.5 / zoom)); if (ui.zoom) ui.zoom.value = String(Math.round(zoom * 100));
    const info = ui.dialog.querySelector("#image-editor-info"); if (info) info.textContent = `${canvas.width} × ${canvas.height} px · ${Math.round(zoom * 100)}%`;
    ui.dialog.querySelectorAll("[data-image-readout]").forEach(output => { output.textContent = output.dataset.imageReadout === "zoom" ? `${Math.round(zoom * 100)}%` : setting(output.dataset.imageReadout, ""); });
    const selected = !gesture && Boolean(maskRect);
    ui.dialog.querySelectorAll("[data-image-action]").forEach(button => {
      const id = button.dataset.imageAction;
      button.disabled = !["close", "cancel"].includes(id) && (busy || (["crop", "delete", "feather", "smooth", "expand", "contract"].includes(id) && !selected) || (id === "undo" && !history.length) || (id === "redo" && !redo.length));
      if (TOOLS.includes(id)) button.setAttribute("aria-pressed", String(tool === id));
    });
  }
  function hideLoupe() {
    const id = loupePointer; loupePointer = null; if (ui?.loupe) ui.loupe.hidden = true;
    if (id !== null && !gesture) try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch {}
  }
  function showLoupe(event) {
    if (!ui.loupe || event.pointerType !== "touch" || tool === "pan") return;
    loupePointer = event.pointerId;
    const size = 116, p = point(event), position = loupePosition(event.clientX, event.clientY, size, window.innerWidth, window.innerHeight);
    Object.assign(ui.loupe.style, { left: `${position.left}px`, top: `${position.top}px` }); ui.loupe.hidden = false;
    const ctx = ui.loupe.getContext("2d"), magnification = zoom * 3;
    ctx.clearRect(0, 0, size, size); ctx.save(); ctx.translate(size / 2, size / 2); ctx.scale(magnification, magnification); ctx.translate(-p.x, -p.y);
    ctx.drawImage(canvas, 0, 0); ctx.drawImage(ui.maskOverlay, 0, 0);
    if (points.length > 1) { ctx.beginPath(); points.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)); ctx.strokeStyle = "#79dfb5"; ctx.lineWidth = 1.5 / magnification; ctx.stroke(); }
    ctx.restore(); ctx.beginPath(); ctx.moveTo(size / 2 - 8, size / 2); ctx.lineTo(size / 2 + 8, size / 2); ctx.moveTo(size / 2, size / 2 - 8); ctx.lineTo(size / 2, size / 2 + 8); ctx.strokeStyle = "#002d2b"; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = "#e4f3ed"; ctx.lineWidth = 1; ctx.stroke();
  }
  function newCanvas(width, height) { const node = document.createElement("canvas"); node.width = width; node.height = height; return node; }
  function cloneCanvas(source) { const result = newCanvas(source.width, source.height); result.getContext("2d").drawImage(source, 0, 0); return result; }
  function release(entry) { entry.image.width = entry.image.height = 0; entry.mask = null; }
  function capture() { return { image: cloneCanvas(canvas), mask: mask?.slice() || null }; }
  function trimHistory() {
    while (history.length + redo.length > 1 && (history.length + redo.length > 10 || [...history, ...redo].reduce((n, entry) => n + entry.image.width * entry.image.height * 4 + (entry.mask?.length || 0), 0) > 32 * 1024 * 1024)) {
      if (history.length > 1) release(history.shift()); else release(redo.shift());
    }
  }
  function pushHistory(entry) { redo.forEach(release); redo = []; history.push(entry); trimHistory(); }
  function snapshot() { pushHistory(capture()); }
  function setMask(next) {
    mask = next; maskRect = mask ? pixelTools.maskBounds(mask, canvas.width, canvas.height) : null;
    maskCanvas.width = ui.maskOverlay.width = canvas.width; maskCanvas.height = ui.maskOverlay.height = canvas.height;
    if (mask) {
      const ctx = maskCanvas.getContext("2d"), data = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < mask.length; i++) { data.data[i * 4] = data.data[i * 4 + 1] = data.data[i * 4 + 2] = 255; data.data[i * 4 + 3] = mask[i]; }
      ctx.putImageData(data, 0, 0);
      for (let i = 0; i < mask.length; i++) { data.data[i * 4] = 110; data.data[i * 4 + 1] = 240; data.data[i * 4 + 2] = 198; data.data[i * 4 + 3] = Math.round(mask[i] * .24); }
      ui.maskOverlay.getContext("2d").putImageData(data, 0, 0);
    }
    points = []; render();
  }
  function selectionPath(ctx) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
  function selectPolygon() {
    if (points.length < 3 || polygonArea(points) <= .5) { points = []; render(); return; }
    const shape = newCanvas(canvas.width, canvas.height), ctx = shape.getContext("2d"); selectionPath(ctx); ctx.fillStyle = "white"; ctx.fill();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data, selected = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < selected.length; i++) selected[i] = data[i * 4 + 3]; shape.width = shape.height = 0;
    snapshot(); setMask(pixelTools.combineMasks(mask, selected, setting("selection-mode", "replace")));
  }
  function replaceCanvas(image, nextMask = null) { canvas.width = image.width; canvas.height = image.height; context.drawImage(image, 0, 0); setMask(nextMask); }
  function cancelGesture() {
    hideLoupe(); pendingTouchAction = null;
    const current = gesture; gesture = null;
    if (current) {
      try { if (canvas.hasPointerCapture(current.id)) canvas.releasePointerCapture(current.id); } catch {}
      if (current.before) { replaceCanvas(current.before.image, current.before.mask); release(current.before); }
      current.paint?.remove?.(); if (current.paint) current.paint.width = current.paint.height = 0;
      points = []; render();
    }
  }
  function touchMetrics() {
    const [a, b] = [...touches.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  function resetTouches() {
    const ids = [...touches.keys()], previous = changingCapture;
    touches.clear(); pinch = null; pinchBlocked = false; pendingTouchAction = null; hideLoupe();
    changingCapture = true;
    try { ids.forEach(id => { try { if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id); } catch {} }); }
    finally { changingCapture = previous; }
  }
  function startTouch(event) {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (touches.size >= 2) {
      if (!pinch) {
        const m = touchMetrics(), rect = canvas.getBoundingClientRect();
        pinch = { distance: m.distance, zoom, anchorX: (m.x - rect.left) / zoom, anchorY: (m.y - rect.top) / zoom };
        pinchBlocked = true; pendingTouchAction = null; changingCapture = true;
        try { cancelGesture(); touches.forEach((_, id) => { try { canvas.setPointerCapture(id); } catch {} }); } finally { changingCapture = false; }
      }
      event.preventDefault(); touches.forEach((_, id) => { try { canvas.setPointerCapture(id); } catch {} }); return true;
    }
    return pinchBlocked;
  }
  function moveTouch(event) {
    if (!touches.has(event.pointerId)) return false;
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!pinch || touches.size < 2) return pinchBlocked;
    event.preventDefault(); const m = touchMetrics(); zoom = Math.max(.1, Math.min(8, pinch.zoom * m.distance / pinch.distance)); render();
    const rect = canvas.getBoundingClientRect();
    ui.viewport.scrollLeft += rect.left + pinch.anchorX * zoom - m.x;
    ui.viewport.scrollTop += rect.top + pinch.anchorY * zoom - m.y;
    return true;
  }
  function endTouch(event) {
    if (!event || event.pointerType !== "touch") return;
    touches.delete(event.pointerId); if (touches.size < 2) pinch = null;
    if (!touches.size) pinchBlocked = false;
    try { if (!gesture && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); } catch {}
  }
  function point(event) { return canvasPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height); }
  function magicAt(p) { const result = pixelTools.magicMask(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, p.x, p.y, Number(setting("tolerance", 24)), checked("contiguous", true)); return checked("antialias", true) ? pixelTools.refineMagicMask(result, canvas.width, canvas.height) : result; }
  function color() { const value = setting("color", "#79dfb5"); return [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16)); }
  function fillAt(p) {
    const selected = magicAt(p), data = context.getImageData(0, 0, canvas.width, canvas.height), rgb = color(), opacity = Number(setting("opacity", 100)) / 100;
    snapshot(); for (let i = 0; i < selected.length; i++) if (selected[i]) {
      const a = opacity * (mask ? mask[i] / 255 : 1), old = data.data[i * 4 + 3] / 255, result = a + old * (1 - a); if (!result) continue;
      for (let k = 0; k < 3; k++) data.data[i * 4 + k] = (rgb[k] * a + data.data[i * 4 + k] * old * (1 - a)) / result;
      data.data[i * 4 + 3] = result * 255;
    } context.putImageData(data, 0, 0); render();
  }
  function brushTo(p, compose = true) {
    const paint = gesture.paint.getContext("2d"), last = gesture.last, size = Number(setting("brush-size", 12));
    paint.strokeStyle = paint.fillStyle = setting("color", "#79dfb5"); paint.lineWidth = size; paint.lineCap = paint.lineJoin = "round";
    paint.beginPath(); paint.moveTo(last.x, last.y); paint.lineTo(p.x, p.y); paint.stroke(); paint.beginPath(); paint.arc(p.x, p.y, size / 2, 0, Math.PI * 2); paint.fill();
    gesture.last = p;
    if (!compose) return;
    const visible = cloneCanvas(gesture.paint), ctx = visible.getContext("2d"); if (mask) { ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(maskCanvas, 0, 0); }
    context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(gesture.before.image, 0, 0);
    context.save(); context.globalAlpha = Number(setting("opacity", 100)) / 100; context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over"; context.drawImage(visible, 0, 0); context.restore();
    visible.width = visible.height = 0; gesture.last = p;
  }
  function begin(event) {
    if (busy || filterDraft) return;
    if (event.pointerType === "touch" && startTouch(event)) return;
    if (gesture || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); const start = point(event); showLoupe(event);
    if (event.pointerType === "touch" && ["wand", "bucket", "eyedropper"].includes(tool)) canvas.setPointerCapture(event.pointerId);
    if (tool === "wand" && event.pointerType === "touch") { pendingTouchAction = { id: event.pointerId, p: start }; return; }
    if (tool === "wand") { snapshot(); setMask(pixelTools.combineMasks(mask, magicAt(start), setting("selection-mode", "replace"))); return; }
    if (tool === "bucket") { fillAt(start); return; }
    if (tool === "eyedropper") { const rgb = context.getImageData(Math.min(canvas.width - 1, Math.floor(start.x)), Math.min(canvas.height - 1, Math.floor(start.y)), 1, 1).data; const input = ui.dialog.querySelector('[data-image-setting="color"]'); if (input) input.value = `#${Array.from(rgb).slice(0, 3).map(v => v.toString(16).padStart(2, "0")).join("")}`; return; }
    points = [start]; gesture = { id: event.pointerId, start, last: start, clientX: event.clientX, clientY: event.clientY, scrollLeft: ui.viewport.scrollLeft, scrollTop: ui.viewport.scrollTop };
    if (["brush", "eraser"].includes(tool)) { gesture.before = capture(); gesture.paint = newCanvas(canvas.width, canvas.height); brushTo(start); points = []; }
    canvas.setPointerCapture(event.pointerId); render();
  }
  function move(event) {
    if (event.pointerType === "touch" && moveTouch(event)) return;
    if (pendingTouchAction?.id === event.pointerId) pendingTouchAction.p = point(event);
    if (!gesture || gesture.id !== event.pointerId) { if (loupePointer === event.pointerId) showLoupe(event); return; }
    if (event.pointerType === "mouse" && !(event.buttons & 1)) { cancelGesture(); return; } event.preventDefault();
    if (tool === "pan") { ui.viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX); ui.viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY); points = []; }
    else if (["brush", "eraser"].includes(tool)) { for (const sample of [...(event.getCoalescedEvents?.() || []), event]) brushTo(point(sample), false); brushTo(gesture.last); }
    else if (tool === "rectangle") points = rectanglePoints(gesture.start, point(event));
    else if (tool === "ellipse") { const p = point(event), cx = (p.x + gesture.start.x) / 2, cy = (p.y + gesture.start.y) / 2; points = Array.from({ length: 64 }, (_, i) => ({ x: cx + Math.abs(p.x - gesture.start.x) / 2 * Math.cos(i * Math.PI / 32), y: cy + Math.abs(p.y - gesture.start.y) / 2 * Math.sin(i * Math.PI / 32) })); }
    else for (const sample of [...(event.getCoalescedEvents?.() || []), event]) { const next = point(sample), last = points[points.length - 1]; if (Math.hypot(next.x - last.x, next.y - last.y) >= 1) points.push(next); }
    if (loupePointer === event.pointerId) showLoupe(event);
    render();
  }
  function end(event) {
    const blocked = pinchBlocked;
    if (pendingTouchAction?.id === event.pointerId && !blocked) { const pending = pendingTouchAction; pendingTouchAction = null; snapshot(); setMask(pixelTools.combineMasks(mask, magicAt(pending.p), setting("selection-mode", "replace"))); }
    endTouch(event);
    if (blocked) return;
    if (loupePointer === event.pointerId) hideLoupe();
    if (!gesture || gesture.id !== event.pointerId) return;
    move({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType, buttons: 1, preventDefault() {} });
    const current = gesture; gesture = null;
    if (current.before) { pushHistory(current.before); current.paint.width = current.paint.height = 0; }
    else if (tool !== "pan") selectPolygon();
    try { canvas.releasePointerCapture(current.id); } catch {} render();
  }
  function applyColor(options) { snapshot(); const data = context.getImageData(0, 0, canvas.width, canvas.height); data.data.set(pixelTools.adjustPixels(data.data, options, mask)); context.putImageData(data, 0, 0); render(); }
  function fit() { zoom = Math.max(.1, Math.min(1, (ui.viewport.clientWidth - 32) / canvas.width, (ui.viewport.clientHeight - 32) / canvas.height)); render(); }
  function action(id) {
    if (["close", "cancel"].includes(id)) { close(); return; } if (busy) return;
    if (TOOLS.includes(id) && !ACTIVE_TOOLS.has(id)) return;
    if (TOOLS.includes(id)) { resetTouches(); cancelGesture(); tool = id; points = []; render(); return; } if (gesture) return; ui.error.textContent = "";
    if ((id === "undo" && history.length) || (id === "redo" && redo.length)) {
      const source = id === "undo" ? history : redo, target = id === "undo" ? redo : history, old = source.pop(); target.push(capture()); replaceCanvas(old.image, old.mask); release(old); trimHistory();
    }
    if (id === "filters") openFilters();
    if (id === "fit") fit(); if (id === "actual") { zoom = 1; render(); }
    if (id === "reset") { snapshot(); replaceCanvas(original); fit(); }
    if (["select-all", "deselect", "invert-selection"].includes(id)) { snapshot(); const selected = new Uint8Array(canvas.width * canvas.height); if (id === "select-all") selected.fill(255); else if (id === "invert-selection") for (let i = 0; i < selected.length; i++) selected[i] = 255 - (mask?.[i] || 0); setMask(id === "deselect" ? null : selected); }
    if (["feather", "smooth", "expand", "contract"].includes(id) && maskRect) { snapshot(); setMask(id === "feather" ? pixelTools.featherMask(mask, canvas.width, canvas.height, Number(setting("feather", 2))) : id === "smooth" ? pixelTools.smoothMask(mask, canvas.width, canvas.height) : pixelTools.growMask(mask, canvas.width, canvas.height, id === "expand")); }
    if (["left", "right", "flip-x", "flip-y"].includes(id)) {
      snapshot(); const rotate = ["left", "right"].includes(id), result = newCanvas(rotate ? canvas.height : canvas.width, rotate ? canvas.width : canvas.height), ctx = result.getContext("2d");
      ctx.translate(result.width / 2, result.height / 2); if (rotate) ctx.rotate((id === "right" ? 1 : -1) * Math.PI / 2); else ctx.scale(id === "flip-x" ? -1 : 1, id === "flip-y" ? -1 : 1);
      ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2); replaceCanvas(result); result.width = result.height = 0;
    }
    if (["crop", "delete"].includes(id) && maskRect) {
      snapshot(); if (id === "delete") { context.save(); context.globalCompositeOperation = "destination-out"; context.drawImage(maskCanvas, 0, 0); context.restore(); setMask(null); }
      else { const b = maskRect, result = newCanvas(b.width, b.height), ctx = result.getContext("2d"); ctx.drawImage(canvas, -b.x, -b.y); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(maskCanvas, -b.x, -b.y); replaceCanvas(result); result.width = result.height = 0; }
    }
    if (id === "adjust") applyColor({ brightness: Number(setting("brightness", 0)), contrast: Number(setting("contrast", 0)), saturation: Number(setting("saturation", 0)) });
    if (id === "grayscale") applyColor({ grayscale: true }); if (id === "invert-color") applyColor({ invert: true });
    if (id === "apply") {
      busy = true; render(); const version = generation;
      canvas.toBlob(blob => { if (version !== generation || !ui.dialog.open) return; busy = false; if (!blob) { ui.error.textContent = "Não foi possível salvar a imagem."; render(); return; } const callback = onApply; close(); callback(blob); }, "image/png");
    } render();
  }
  function openFilters() {
    if (!ui.filters || filterDraft) return;
    resetTouches(); cancelGesture(); filterDraft = capture();
    ui.filters.querySelectorAll("[data-filter-setting]").forEach(input => { input.value = input.getAttribute("data-default") || input.defaultValue; });
    ui.filters.showModal(); renderFilterPreview();
  }
  function previewFilters() {
    if (!filterDraft) return;
    const value = key => ui.filters.querySelector(`[data-filter-setting="${key}"]`).value;
    const source = filterDraft.image.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    let pixels = pixelTools.adjustPixels(source.data, { brightness: Number(value("brightness")), saturation: Number(value("saturation")), contrast: Number(value("contrast")), grayscale: value("preset") === "grayscale" });
    const block = Number(value("pixel-size"));
    if (value("preset") === "pixelate") pixels = pixelTools.pixelatePixels(pixels, canvas.width, canvas.height, block);
    if (filterDraft.mask) for (let i = 0; i < pixels.length; i++) if (i % 4 !== 3) pixels[i] = source.data[i] + (pixels[i] - source.data[i]) * filterDraft.mask[Math.floor(i / 4)] / 255;
    source.data.set(pixels); context.putImageData(source, 0, 0); renderFilterPreview();
  }
  function renderFilterPreview() {
    const preview = ui.filters.querySelector("#image-filter-preview"); if (!preview) return;
    const scale = Math.min(1, 320 / canvas.width, 180 / canvas.height);
    preview.width = Math.max(1, Math.round(canvas.width * scale)); preview.height = Math.max(1, Math.round(canvas.height * scale));
    preview.getContext("2d").drawImage(canvas, 0, 0, preview.width, preview.height);
  }
  function closeFilters(commit) {
    if (!filterDraft) return;
    if (commit) previewFilters();
    const previous = filterDraft; filterDraft = null;
    if (commit) { pushHistory(previous); } else { replaceCanvas(previous.image, previous.mask); release(previous); }
    if (ui.filters.open) ui.filters.close(); render();
  }
  function close() {
    if (!ui) return; generation++; resetTouches(); cancelGesture(); closeFilters(false); if (ui.dialog.open) ui.dialog.close();
    history.forEach(release); redo.forEach(release); history = []; redo = []; points = []; mask = null; maskRect = null; onApply = null; busy = false;
    if (original) original.width = original.height = 0; original = null; canvas.width = canvas.height = maskCanvas.width = maskCanvas.height = ui.maskOverlay.width = ui.maskOverlay.height = 1;
  }
  function open(url, callback) {
    init(); close(); const version = ++generation; onApply = callback; busy = true; tool = "lasso";
    ui.dialog.querySelectorAll("[data-image-setting]").forEach(input => { if (input.type === "checkbox") input.checked = input.defaultChecked; else input.value = input.getAttribute("data-default") || input.defaultValue; });
    ui.error.textContent = "Carregando imagem…"; ui.dialog.showModal(); render(); const image = new Image();
    image.onload = () => { if (version !== generation || !ui.dialog.open) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024) { ui.error.textContent = "Use uma imagem de até 16 megapixels para editar."; return; }
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; context.drawImage(image, 0, 0); original = cloneCanvas(canvas);
      busy = false; ui.error.textContent = ""; setMask(null); fit();
    }; image.onerror = () => { if (version === generation) ui.error.textContent = "Não foi possível abrir a imagem."; }; image.src = url;
  }
  root.TokenImageEditor = { open, close };
})(typeof window === "undefined" ? globalThis : window);
