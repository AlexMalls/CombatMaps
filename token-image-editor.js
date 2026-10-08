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
  const geometry = { selectionBounds, rectanglePoints, polygonArea, canvasPoint };
  if (typeof module !== "undefined" && module.exports) module.exports = geometry;
  if (!root.document) return;
  let ui, canvas, context, points = [], gesture = null, tool = "lasso", zoom = 1, history = [], generation = 0, busy = false, onApply;
  function init() {
    if (ui) return;
    const dialog = document.getElementById("token-image-editor");
    ui = { dialog, viewport: dialog.querySelector(".image-editor__viewport"), stage: dialog.querySelector(".image-editor__stage"), selection: dialog.querySelector("polygon"), overlay: dialog.querySelector("svg"), error: dialog.querySelector("[role=status]"), zoom: dialog.querySelector("input[type=range]") };
    canvas = document.getElementById("image-editor-canvas"); context = canvas.getContext("2d");
    dialog.querySelectorAll("[data-image-action]").forEach(button => button.addEventListener("click", () => action(button.dataset.imageAction)));
    ui.zoom.addEventListener("input", () => { zoom = Number(ui.zoom.value) / 100; render(); });
    canvas.addEventListener("pointerdown", begin);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", cancelGesture);
    canvas.addEventListener("lostpointercapture", cancelGesture);
    canvas.addEventListener("contextmenu", event => event.preventDefault());
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("keydown", event => {
      event.stopPropagation();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); action("undo"); }
      if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); action("delete"); }
    });
    window.addEventListener("blur", cancelGesture);
  }
  function render() {
    ui.stage.style.width = `${canvas.width * zoom}px`; ui.stage.style.height = `${canvas.height * zoom}px`;
    ui.overlay.setAttribute("viewBox", `0 0 ${canvas.width} ${canvas.height}`);
    ui.selection.setAttribute("points", points.map(p => `${p.x},${p.y}`).join(" "));
    ui.selection.setAttribute("stroke-width", String(1.5 / zoom));
    ui.zoom.value = String(Math.round(zoom * 100));
    const selected = !gesture && points.length >= 3 && polygonArea(points) > 0.5;
    ui.dialog.querySelectorAll("[data-image-action]").forEach(button => {
      const id = button.dataset.imageAction;
      button.disabled = !["close", "cancel"].includes(id) && (busy || (["crop", "delete"].includes(id) && !selected) || (id === "undo" && !history.length));
      if (["lasso", "rectangle", "pan"].includes(id)) button.setAttribute("aria-pressed", String(tool === id));
    });
  }
  function resetSelection() { points = []; render(); }
  function cancelGesture() {
    const current = gesture; gesture = null;
    if (current) {
      try { if (canvas.hasPointerCapture(current.id)) canvas.releasePointerCapture(current.id); } catch {}
      resetSelection();
    }
  }
  function point(event) { return canvasPoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height); }
  function begin(event) {
    if (busy || gesture || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const start = point(event); points = [start]; gesture = { id: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, scrollLeft: ui.viewport.scrollLeft, scrollTop: ui.viewport.scrollTop };
    canvas.setPointerCapture(event.pointerId); render();
  }
  function move(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    if (event.pointerType === "mouse" && !(event.buttons & 1)) { cancelGesture(); return; }
    event.preventDefault();
    if (tool === "pan") {
      ui.viewport.scrollLeft = gesture.scrollLeft - (event.clientX - gesture.clientX);
      ui.viewport.scrollTop = gesture.scrollTop - (event.clientY - gesture.clientY);
      points = [];
    }
    else if (tool === "rectangle") points = rectanglePoints(gesture.start, point(event));
    else for (const sample of [...(event.getCoalescedEvents?.() || []), event]) {
      const next = point(sample), last = points[points.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) >= 1) points.push(next);
    }
    render();
  }
  function end(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    move({ clientX: event.clientX, clientY: event.clientY, pointerId: event.pointerId, pointerType: event.pointerType, buttons: 1, preventDefault() {} });
    const id = gesture.id; gesture = null;
    try { canvas.releasePointerCapture(id); } catch {}
    render();
  }
  function newCanvas(width, height) { const node = document.createElement("canvas"); node.width = width; node.height = height; return node; }
  function snapshot() {
    const copy = newCanvas(canvas.width, canvas.height); copy.getContext("2d").drawImage(canvas, 0, 0); history.push(copy);
    // Até cinco estados; reduzir o histórico de imagens grandes para poupar RAM.
    while (history.length > 1 && (history.length > 5 || history.reduce((n, c) => n + c.width * c.height * 4, 0) > 32 * 1024 * 1024)) { const old = history.shift(); old.width = old.height = 0; }
  }
  function replaceCanvas(image) {
    canvas.width = image.width; canvas.height = image.height; context.drawImage(image, 0, 0); resetSelection();
  }
  function selectionPath(ctx) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
  }
  function action(id) {
    if (["close", "cancel"].includes(id)) { close(); return; }
    if (busy) return;
    if (["lasso", "rectangle", "pan"].includes(id)) { cancelGesture(); tool = id; resetSelection(); return; }
    if (gesture) return;
    ui.error.textContent = "";
    if (id === "undo" && history.length) { const old = history.pop(); replaceCanvas(old); old.width = old.height = 0; }
    if (["left", "right"].includes(id)) {
      snapshot(); const rotated = newCanvas(canvas.height, canvas.width), ctx = rotated.getContext("2d");
      ctx.translate(rotated.width / 2, rotated.height / 2); ctx.rotate((id === "right" ? 1 : -1) * Math.PI / 2); ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2); replaceCanvas(rotated); rotated.width = rotated.height = 0;
    }
    if (["crop", "delete"].includes(id) && points.length >= 3 && polygonArea(points) > 0.5) {
      const bounds = selectionBounds(points, canvas.width, canvas.height); if (!bounds) return;
      snapshot();
      if (id === "delete") {
        context.save(); selectionPath(context); context.clip(); context.clearRect(0, 0, canvas.width, canvas.height); context.restore(); resetSelection();
      } else {
        const cropped = newCanvas(bounds.width, bounds.height), ctx = cropped.getContext("2d");
        ctx.translate(-bounds.x, -bounds.y); selectionPath(ctx); ctx.clip(); ctx.drawImage(canvas, 0, 0); replaceCanvas(cropped); cropped.width = cropped.height = 0;
      }
    }
    if (id === "apply") {
      busy = true; render(); const version = generation;
      canvas.toBlob(blob => {
        if (version !== generation || !ui.dialog.open) return;
        busy = false;
        if (!blob) { ui.error.textContent = "Não foi possível salvar a imagem."; render(); return; }
        const callback = onApply; close(); callback(blob);
      }, "image/png");
    }
    render();
  }
  function close() {
    if (!ui) return;
    generation++; cancelGesture();
    if (ui.dialog.open) ui.dialog.close();
    history.forEach(c => { c.width = c.height = 0; }); history = []; points = []; onApply = null; busy = false; canvas.width = canvas.height = 1;
  }
  function open(url, callback) {
    init(); close(); const version = ++generation;
    onApply = callback; busy = true; tool = "lasso"; ui.error.textContent = "Carregando imagem…"; ui.dialog.showModal(); render();
    const image = new Image();
    image.onload = () => {
      if (version !== generation || !ui.dialog.open) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 16 * 1024 * 1024) { ui.error.textContent = "Use uma imagem de até 16 megapixels para editar."; return; }
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; context.drawImage(image, 0, 0);
      zoom = Math.max(0.1, Math.min(1, (ui.viewport.clientWidth - 32) / canvas.width, (ui.viewport.clientHeight - 32) / canvas.height));
      busy = false; ui.error.textContent = ""; render();
    };
    image.onerror = () => { if (version === generation) ui.error.textContent = "Não foi possível abrir a imagem."; };
    image.src = url;
  }
  root.TokenImageEditor = { open, close };
})(typeof window === "undefined" ? globalThis : window);
