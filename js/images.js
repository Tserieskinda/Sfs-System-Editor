// ══════════════════════════════════════════════════════════════════════════════
//  images.js  —  Viewport image overlay system
//  Supports: import, drag, resize, rotate, opacity, click-through, lock-to-planet
// ══════════════════════════════════════════════════════════════════════════════

// ── State ─────────────────────────────────────────────────────────────────────
const _imgOverlays = [];     // array of overlay objects
let   _imgSelected = null;   // currently selected overlay id
let   _imgNextId   = 1;
let   _imgAspectLocked = true; // aspect ratio lock (default on)

// Each overlay: { id, name, img, worldX, worldY, worldW, worldH, rotation,
//                opacity, clickThrough, lockToBody, _imgEl(HTMLImageElement) }

// ── Panel open/close ───────────────────────────────────────────────────────────
function openImagePanel() {
  console.log('openImagePanel called');
  if (typeof _utilsDropOpen !== 'undefined') _utilsDropOpen = false;
  const dropdown = document.getElementById('utils-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  const panel = document.getElementById('img-panel');
  console.log('img-panel element:', panel);
  if (panel) {
    panel.classList.add('open');
    console.log('Added open class, transform should be:', window.getComputedStyle(panel).transform);
  } else {
    console.error('img-panel element not found!');
  }
}
function closeImagePanel() {
  document.getElementById('img-panel').classList.remove('open');
}

// ── Import from device ────────────────────────────────────────────────────────
function imgTriggerFileInput() {
  document.getElementById('img-file-input').click();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('img-file-input').addEventListener('change', e => {
    const files = Array.from(e.target.files || []);
    files.forEach(f => {
      if(!/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) return;
      const reader = new FileReader();
      reader.onload = ev => _imgAddOverlay(f.name, ev.target.result);
      reader.readAsDataURL(f);
    });
    e.target.value = '';
  });

  // Drag-and-drop onto the LOAD IMAGES area
  const drop = document.getElementById('img-drop-zone');
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    Array.from(e.dataTransfer.files).forEach(f => {
      if(!/\.(png|jpe?g|gif|webp|svg)$/i.test(f.name)) return;
      const reader = new FileReader();
      reader.onload = ev => _imgAddOverlay(f.name, ev.target.result);
      reader.readAsDataURL(f);
    });
  });
});

// ── Add a new overlay ─────────────────────────────────────────────────────────
function _imgAddOverlay(name, dataUrl) {
  const img = new Image();
  img.onload = () => {
    // Place it at the current viewport centre in world coords, default 200px wide
    const wc = screenToWorld(vp.width / 2, vp.height / 2);
    const worldW = 200 / vpZ;
    const worldH = worldW * (img.naturalHeight / img.naturalWidth);
    const ov = {
      id: _imgNextId++,
      name: name.replace(/\.[^.]+$/, ''),
      img,
      worldX: wc.x - worldW / 2,
      worldY: wc.y - worldH / 2,
      worldW,
      worldH,
      rotation: 0,
      opacity: 1,
      clickThrough: false,
      lockToBody: 'None',
      _lockOffX: 0,
      _lockOffY: 0,
    };
    _imgOverlays.push(ov);
    _imgSelectOverlay(ov.id);
    _imgRebuildList();
    drawViewport();
  };
  img.src = dataUrl;
}

// ── Draw all overlays (called from _drawViewportNow hook) ─────────────────────
function imgDrawOverlays(ctx, vpZ_, vpOffX_, vpOffY_, vpW, vpH) {
  _imgOverlays.forEach(ov => {
    // Resolve lock-to-body: _lockOffX/Y is offset of image TOP-LEFT from body centre
    // When first locked (image already placed), offset preserves visual position.
    // The centre of the image = body + offset + (w/2, h/2)
    let wx = ov.worldX, wy = ov.worldY;
    if(ov.lockToBody && ov.lockToBody !== 'None') {
      if(typeof bodyWorldPos === 'undefined'){
        console.warn('[IMG] bodyWorldPos is undefined!');
      } else {
        const bp = bodyWorldPos[ov.lockToBody];
        if(bp) {
          wx = bp.x + ov._lockOffX;
          wy = bp.y + ov._lockOffY;
        } else {
          console.warn('[IMG] Body not found in bodyWorldPos:', ov.lockToBody, 'Available:', Object.keys(bodyWorldPos));
        }
      }
    }

    const sx = (wx + vpOffX_) * vpZ_ + vpW / 2;
    const sy = (wy + vpOffY_) * vpZ_ + vpH / 2;
    const sw = ov.worldW * vpZ_;
    const sh = ov.worldH * vpZ_;

    // Cull if entirely off-screen (generous margin for rotated images)
    const diag = Math.hypot(sw, sh) / 2;
    if(sx + diag < 0 || sx - diag > vpW || sy + diag < 0 || sy - diag > vpH) return;

    ctx.save();
    ctx.globalAlpha = ov.opacity;
    ctx.translate(sx + sw / 2, sy + sh / 2);
    ctx.rotate(ov.rotation);
    ctx.drawImage(ov.img, -sw / 2, -sh / 2, sw, sh);

    // Selection outline
    if(_imgSelected === ov.id) {
      ctx.strokeStyle = 'rgba(100,220,180,0.85)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.setLineDash([]);
      // Corner handles — fixed 5px screen-space squares
      const hr = 5;
      _imgHandleCorners(sw, sh).forEach(([hx, hy]) => {
        ctx.fillStyle = 'rgba(100,220,180,0.9)';
        ctx.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
      });
      // Rotation handle (top-centre) — fixed 5px radius, 18px above top edge
      ctx.beginPath();
      ctx.arc(0, -sh / 2 - 18, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,200,80,0.9)';
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.restore();
  });
}

function _imgHandleCorners(sw, sh) {
  return [
    [-sw/2, -sh/2], [sw/2, -sh/2],
    [-sw/2,  sh/2], [sw/2,  sh/2],
  ];
}

// ── Hit-test helpers ──────────────────────────────────────────────────────────
// Returns overlay id (or null) for a screen point, top (last) first.
function imgHitTest(sx, sy) {
  for(let i = _imgOverlays.length - 1; i >= 0; i--) {
    const ov = _imgOverlays[i];
    if(ov.clickThrough) continue;
    if(_imgPointInOverlay(sx, sy, ov)) return ov.id;
  }
  return null;
}

function _imgWorldXY(ov) {
  let wx = ov.worldX, wy = ov.worldY;
  if(ov.lockToBody && ov.lockToBody !== 'None' && typeof bodyWorldPos !== 'undefined') {
    const bp = bodyWorldPos[ov.lockToBody];
    if(bp) { wx = bp.x + ov._lockOffX; wy = bp.y + ov._lockOffY; }
  }
  return { wx, wy };
}

function _imgPointInOverlay(sx, sy, ov) {
  const { wx, wy } = _imgWorldXY(ov);
  const cx = (wx + vpOffX) * vpZ + vp.width  / 2 + (ov.worldW * vpZ) / 2;
  const cy = (wy + vpOffY) * vpZ + vp.height / 2 + (ov.worldH * vpZ) / 2;
  const dx = sx - cx, dy = sy - cy;
  const cos = Math.cos(-ov.rotation), sin = Math.sin(-ov.rotation);
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;
  return Math.abs(lx) <= (ov.worldW * vpZ) / 2 + 6
      && Math.abs(ly) <= (ov.worldH * vpZ) / 2 + 6;
}

// Returns 'corner'|'rotate'|'body'|null for a screen point on the selected overlay
function _imgHandleAt(sx, sy) {
  if(_imgSelected === null) return null;
  const ov = _imgOverlays.find(o => o.id === _imgSelected);
  if(!ov) return null;
  const { wx, wy } = _imgWorldXY(ov);
  const sw = ov.worldW * vpZ, sh = ov.worldH * vpZ;
  const cx = (wx + vpOffX) * vpZ + vp.width  / 2 + sw / 2;
  const cy = (wy + vpOffY) * vpZ + vp.height / 2 + sh / 2;
  const dx = sx - cx, dy = sy - cy;
  const cos = Math.cos(-ov.rotation), sin = Math.sin(-ov.rotation);
  const lx = cos * dx - sin * dy;
  const ly = sin * dx + cos * dy;

  // Rotation handle — 18px above top edge, 11px hit radius
  if(Math.hypot(lx, ly - (-sh / 2 - 18)) < 11) return 'rotate';
  // Corner handles — 11px hit radius (fixed screen pixels)
  const corners = _imgHandleCorners(sw, sh);
  for(let i = 0; i < corners.length; i++) {
    const [hx, hy] = corners[i];
    if(Math.hypot(lx - hx, ly - hy) < 11) return i;
  }
  return null;
}

// ── Interaction state ─────────────────────────────────────────────────────────
let _imgDrag    = null; // { type:'move'|'corner'|'rotate', ovId, startX, startY, startWX, startWY, startW, startH, startRot, cornerIdx }
let _imgPinch   = null; // { ovId, startDist, startW, startH, startWX, startWY, startMidClientX, startMidClientY }

// ── Touch pinch: begin (call when 2 fingers down and both hit the same image) ─
// Returns true if consumed (both fingers on a non-clickThrough image).
function imgPinchStart(t0x, t0y, t1x, t1y) {
  // Both touch points must hit the same non-clickThrough image
  const id0 = imgHitTest(t0x, t0y);
  const id1 = imgHitTest(t1x, t1y);
  if(id0 === null || id0 !== id1) return false;
  const ov = _imgOverlays.find(o => o.id === id0);
  if(!ov) return false;
  _imgSelectOverlay(id0);
  const dist = Math.hypot(t1x - t0x, t1y - t0y);
  _imgPinch = {
    ovId: id0,
    startDist: dist,
    startW: ov.worldW,
    startH: ov.worldH,
    startWX: ov.worldX,
    startWY: ov.worldY,
    aspect: ov.worldH / ov.worldW,
    startMidClientX: (t0x + t1x) / 2,
    startMidClientY: (t0y + t1y) / 2,
  };
  _imgDrag = null; // cancel any single-finger drag
  return true;
}

// Returns true if a pinch is active (caller should skip viewport zoom).
function imgPinchMove(t0x, t0y, t1x, t1y) {
  if(!_imgPinch) return false;
  const ov = _imgOverlays.find(o => o.id === _imgPinch.ovId);
  if(!ov) { _imgPinch = null; return false; }
  const dist = Math.hypot(t1x - t0x, t1y - t0y);
  const scale = dist / _imgPinch.startDist;
  const newW = Math.max(20 / vpZ, _imgPinch.startW * scale);
  const newH = _imgAspectLocked ? newW * _imgPinch.aspect
                                : Math.max(20 / vpZ, _imgPinch.startH * scale);
  // Keep centre of image pinned to the start midpoint in world coords
  const rect = vp.getBoundingClientRect();
  const midSx = _imgPinch.startMidClientX - rect.left;
  const midSy = _imgPinch.startMidClientY - rect.top;
  const midWx = (midSx - vp.width  / 2) / vpZ - vpOffX;
  const midWy = (midSy - vp.height / 2) / vpZ - vpOffY;
  ov.worldW = newW;
  ov.worldH = newH;
  // Place top-left so centre stays at midWx/midWy
  if(ov.lockToBody && ov.lockToBody !== 'None') {
    const bp = typeof bodyWorldPos !== 'undefined' ? bodyWorldPos[ov.lockToBody] : null;
    if(bp) { ov._lockOffX = midWx - bp.x - newW / 2; ov._lockOffY = midWy - bp.y - newH / 2; }
  } else {
    ov.worldX = midWx - newW / 2;
    ov.worldY = midWy - newH / 2;
  }
  _imgUpdateSidebar();
  drawViewport();
  return true;
}

function imgPinchEnd() {
  _imgPinch = null;
}

function _imgSelectOverlay(id) {
  _imgSelected = id;
  _imgUpdateSidebar();
  drawViewport();
}

// ── Mouse / touch wiring ──────────────────────────────────────────────────────
// Called from tools.js mousedown BEFORE body hit-test
function imgMouseDown(mx, my, clientX, clientY) {
  // Check handles first (only if an image is selected)
  const handle = _imgHandleAt(mx, my);
  if(handle !== null && handle !== false) {
    const ov = _imgOverlays.find(o => o.id === _imgSelected);
    _imgDrag = {
      type: typeof handle === 'number' ? 'corner' : handle === 'rotate' ? 'rotate' : 'corner',
      ovId: ov.id,
      startX: clientX, startY: clientY,
      startWX: ov.worldX, startWY: ov.worldY,
      startW: ov.worldW, startH: ov.worldH,
      startRot: ov.rotation,
      aspect: ov.worldH / ov.worldW,
      cornerIdx: typeof handle === 'number' ? handle : 0,
    };
    return true; // consumed
  }
  // Check body hit
  const hitId = imgHitTest(mx, my);
  if(hitId !== null) {
    _imgSelectOverlay(hitId);
    const ov = _imgOverlays.find(o => o.id === hitId);
    _imgDrag = {
      type: 'move',
      ovId: hitId,
      startX: clientX, startY: clientY,
      startWX: ov.worldX, startWY: ov.worldY,
      startOffX: ov._lockOffX, startOffY: ov._lockOffY,
    };
    return true; // consumed — don't pan
  }
  // Clicked empty space while an image was selected → deselect
  if(_imgSelected !== null) {
    _imgSelected = null;
    _imgUpdateSidebar();
    drawViewport();
  }
  return false;
}

function imgMouseMove(clientX, clientY) {
  if(!_imgDrag) return false;
  const ov = _imgOverlays.find(o => o.id === _imgDrag.ovId);
  if(!ov) { _imgDrag = null; return false; }
  const dx = (clientX - _imgDrag.startX) / vpZ;
  const dy = (clientY - _imgDrag.startY) / vpZ;

  if(_imgDrag.type === 'move') {
    if(ov.lockToBody && ov.lockToBody !== 'None') {
      ov._lockOffX = _imgDrag.startOffX + dx;
      ov._lockOffY = _imgDrag.startOffY + dy;
    } else {
      ov.worldX = _imgDrag.startWX + dx;
      ov.worldY = _imgDrag.startWY + dy;
    }
  } else if(_imgDrag.type === 'corner') {
    // Which corner index: 0=TL,1=TR,2=BL,3=BR
    const ci = _imgDrag.cornerIdx;
    const signX = (ci === 1 || ci === 3) ? 1 : -1; // right corners → positive X
    const signY = (ci === 2 || ci === 3) ? 1 : -1; // bottom corners → positive Y
    // Project drag delta onto the image axes (accounting for rotation)
    const cos = Math.cos(ov.rotation), sin = Math.sin(ov.rotation);
    const ldx = cos * dx + sin * dy; // delta in image-local X
    const ldy = -sin * dx + cos * dy; // delta in image-local Y
    const newW = Math.max(20 / vpZ, _imgDrag.startW + signX * ldx);
    const newH = _imgAspectLocked
      ? newW * _imgDrag.aspect
      : Math.max(20 / vpZ, _imgDrag.startH + signY * ldy);
    // Keep centre fixed: adjust worldX/Y so centre (startWX + startW/2) doesn't move
    const dw = newW - _imgDrag.startW;
    const dh = newH - _imgDrag.startH;
    ov.worldW = newW;
    ov.worldH = newH;
    ov.worldX = _imgDrag.startWX - dw / 2;
    ov.worldY = _imgDrag.startWY - dh / 2;
  } else if(_imgDrag.type === 'rotate') {
    const { wx, wy } = _imgWorldXY(ov);
    const cx = (wx + vpOffX) * vpZ + vp.width  / 2 + ov.worldW * vpZ / 2;
    const cy = (wy + vpOffY) * vpZ + vp.height / 2 + ov.worldH * vpZ / 2;
    const rect = vp.getBoundingClientRect();
    const sx = clientX - rect.left, sy = clientY - rect.top;
    ov.rotation = Math.atan2(sy - cy, sx - cx) + Math.PI / 2;
  }
  _imgUpdateSidebar();
  drawViewport();
  return true;
}

function imgMouseUp() {
  _imgDrag  = null;
  _imgPinch = null;
}

// ── Sidebar panel ─────────────────────────────────────────────────────────────
function _imgUpdateSidebar() {
  const ov = _imgSelected !== null ? _imgOverlays.find(o => o.id === _imgSelected) : null;
  const det = document.getElementById('img-detail');
  const none = document.getElementById('img-detail-none');
  if(!ov) {
    if(det)  det.style.display  = 'none';
    if(none) none.style.display = '';
    return;
  }
  if(det)  det.style.display  = '';
  if(none) none.style.display = 'none';

  _imgSetField('img-d-name',    ov.name);
  _imgSetField('img-d-opacity', Math.round(ov.opacity * 100));
  _imgSetField('img-d-rotate',  Math.round(ov.rotation * 180 / Math.PI));
  _imgSetField('img-d-width',   Math.round(ov.worldW));
  _imgSetField('img-d-height',  Math.round(ov.worldH));
  _imgSetCheck('img-d-clickthrough', ov.clickThrough);

  // Sync aspect lock button
  const alBtn = document.getElementById('img-d-aspect-lock');
  if(alBtn) {
    alBtn.textContent = _imgAspectLocked ? '🔗' : '⛓️‍💥';
    alBtn.style.borderColor = _imgAspectLocked ? 'var(--ac65)' : 'var(--ac20)';
    alBtn.style.background  = _imgAspectLocked ? 'var(--hp1)'  : 'var(--dp3)';
    alBtn.title = _imgAspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked';
  }

  // Sync range sliders
  const osl = document.getElementById('img-d-opacity-sl');
  const rsl = document.getElementById('img-d-rotate-sl');
  if(osl) osl.value = Math.round(ov.opacity * 100);
  if(rsl) rsl.value = Math.round(ov.rotation * 180 / Math.PI);

  // Lock-to-body dropdown
  const sel = document.getElementById('img-d-lock');
  if(sel) {
    const bodyNames = (typeof bodies !== 'undefined' && bodies) ? Object.keys(bodies) : [];
    const names = ['None', ...bodyNames].sort();
    sel.innerHTML = names.map(n => `<option value="${n}"${ov.lockToBody===n?' selected':''}>${n}</option>`).join('');
  }
}

function _imgSetField(id, val) {
  const el = document.getElementById(id);
  if(el && document.activeElement !== el) el.value = val;
}
function _imgSetCheck(id, val) {
  const el = document.getElementById(id);
  if(el) el.checked = val;
}

// ── Sidebar field change handlers ─────────────────────────────────────────────
function imgFieldChange(field, value) {
  const ov = _imgSelected !== null ? _imgOverlays.find(o => o.id === _imgSelected) : null;
  if(!ov) return;
  if(field === 'name')        ov.name        = value;
  if(field === 'opacity')     ov.opacity     = Math.max(0, Math.min(1, parseFloat(value) / 100)) || 1;
  if(field === 'rotate')      ov.rotation    = (parseFloat(value) || 0) * Math.PI / 180;
  if(field === 'width')  {
    const w = Math.max(1, parseFloat(value) || 1);
    if(_imgAspectLocked) ov.worldH = ov.worldH * (w / ov.worldW);
    ov.worldW = w;
  }
  if(field === 'height') {
    const h = Math.max(1, parseFloat(value) || 1);
    if(_imgAspectLocked) ov.worldW = ov.worldW * (h / ov.worldH);
    ov.worldH = h;
  }
  if(field === 'clickthrough') ov.clickThrough = value;
  if(field === 'lock') {
    const prev = ov.lockToBody;
    ov.lockToBody = value;
    if(value !== 'None') {
      // drawViewport populates bodyWorldPos — call it first to ensure positions are current
      drawViewport();
      const bp = typeof bodyWorldPos !== 'undefined' ? bodyWorldPos[value] : null;
      if(bp) {
        // Centre the image on the body: _lockOffX/Y = offset of top-left from body centre
        ov._lockOffX = -ov.worldW / 2;
        ov._lockOffY = -ov.worldH / 2;
        // Bake into worldX/Y so unlocking preserves position
        ov.worldX = bp.x + ov._lockOffX;
        ov.worldY = bp.y + ov._lockOffY;
      }
    } else if(prev !== 'None') {
      // Unlocking: bake current locked world position into worldX/Y
      const { wx, wy } = _imgWorldXY(ov);
      ov.worldX = wx; ov.worldY = wy;
    }
  }
  _imgUpdateSidebar();
  drawViewport();
}

function imgToggleAspectLock() {
  _imgAspectLocked = !_imgAspectLocked;
  const btn = document.getElementById('img-d-aspect-lock');
  if(btn) {
    btn.textContent = _imgAspectLocked ? '🔗' : '⛓️‍💥';
    btn.style.borderColor = _imgAspectLocked ? 'var(--ac65)' : 'var(--ac20)';
    btn.style.background  = _imgAspectLocked ? 'var(--hp1)'  : 'var(--dp3)';
    btn.title = _imgAspectLocked ? 'Aspect ratio locked' : 'Aspect ratio unlocked';
  }
}

function imgDeleteSelected() {
  if(_imgSelected === null) return;
  const idx = _imgOverlays.findIndex(o => o.id === _imgSelected);
  if(idx >= 0) _imgOverlays.splice(idx, 1);
  _imgSelected = null;
  _imgRebuildList();
  _imgUpdateSidebar();
  drawViewport();
}

function imgDuplicateSelected() {
  const ov = _imgSelected !== null ? _imgOverlays.find(o => o.id === _imgSelected) : null;
  if(!ov) return;
  const copy = { ...ov, id: _imgNextId++, name: ov.name + '_copy',
                  worldX: ov.worldX + 20/vpZ, worldY: ov.worldY + 20/vpZ };
  _imgOverlays.push(copy);
  _imgSelectOverlay(copy.id);
  _imgRebuildList();
  drawViewport();
}

function imgBringForward() {
  const idx = _imgOverlays.findIndex(o => o.id === _imgSelected);
  if(idx < 0 || idx === _imgOverlays.length - 1) return;
  [_imgOverlays[idx], _imgOverlays[idx+1]] = [_imgOverlays[idx+1], _imgOverlays[idx]];
  _imgRebuildList(); drawViewport();
}
function imgSendBackward() {
  const idx = _imgOverlays.findIndex(o => o.id === _imgSelected);
  if(idx <= 0) return;
  [_imgOverlays[idx], _imgOverlays[idx-1]] = [_imgOverlays[idx-1], _imgOverlays[idx]];
  _imgRebuildList(); drawViewport();
}

// ── Image list in panel ───────────────────────────────────────────────────────
function _imgRebuildList() {
  const list = document.getElementById('img-list');
  if(!list) return;
  if(_imgOverlays.length === 0) {
    list.innerHTML = '<div style="padding:12px;font-size:.62rem;color:var(--ink4);text-align:center">No images loaded</div>';
    return;
  }
  list.innerHTML = [..._imgOverlays].reverse().map(ov => `
    <div class="img-list-row${_imgSelected === ov.id ? ' selected' : ''}" onclick="imgSelectFromList(${ov.id})">
      <img src="${ov.img.src}" class="img-list-thumb" alt="">
      <span class="img-list-name">${ov.name}</span>
      ${ov.clickThrough ? '<span class="img-list-badge">click-thru</span>' : ''}
      ${ov.lockToBody && ov.lockToBody !== 'None' ? '<span class="img-list-badge lock">🔒</span>' : ''}
    </div>
  `).join('');
}

function imgSelectFromList(id) {
  _imgSelectOverlay(id);
  _imgRebuildList();
}
