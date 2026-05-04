// ════════════════════════════════ TOOLS: TERRAIN DETAIL ════════════════════════════════

// 0 = fewest vertices, 100 = full resolution (default). Applied as a multiplier on _screenN.
window.terrainDetail = 30;

let _terrainDetailDropOpen = false;

function toggleTerrainDetailDrop(){
  _terrainDetailDropOpen = !_terrainDetailDropOpen;
  const dd = document.getElementById('terrain-detail-dropdown');
  if(_terrainDetailDropOpen){
    const btn = document.getElementById('btn-terrain-detail');
    const r = btn.getBoundingClientRect();
    const ddW = 200; // min-width from inline style
    dd.style.top = (r.bottom + 6) + 'px';
    // If the dropdown would overflow the right edge, right-anchor it to the button's right edge
    if(r.left + ddW + 8 > window.innerWidth){
      dd.style.left  = 'auto';
      dd.style.right = (window.innerWidth - r.right) + 'px';
    } else {
      dd.style.left  = r.left + 'px';
      dd.style.right = 'auto';
    }
  }
  dd.style.display = _terrainDetailDropOpen ? 'block' : 'none';
}

function setTerrainDetail(val){
  window.terrainDetail = Math.max(0, Math.min(100, val));
  const slider  = document.getElementById('terrain-detail-slider');
  const valSpan = document.getElementById('terrain-detail-val');
  if(slider)  slider.value          = window.terrainDetail;
  if(valSpan) valSpan.textContent   = window.terrainDetail + '%';
  // Update the compact label on the TERRAIN button
  const lbl = document.getElementById('terrain-detail-label');
  if(lbl) lbl.textContent = window.terrainDetail + '%';
  // Lag warning: show above 70%
  const warn = document.getElementById('terrain-detail-warn');
  if(warn) warn.style.display = window.terrainDetail > 70 ? 'block' : 'none';
  // Flush terrain geometry cache (affects _screenN vertex count)
  if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
  // Flush surface A/B strip canvas cache (N and TEX_SZ both embed terrainDetail in cKey,
  // but clearing explicitly ensures stale entries don't accumulate indefinitely)
  if(typeof drawViewport === 'function' && drawViewport._surfCache)   drawViewport._surfCache   = {};
  // Flush texture C downscale cache
  if(typeof drawViewport === 'function' && drawViewport._tcDownCache) drawViewport._tcDownCache = {};
  if(typeof drawViewport === 'function') drawViewport();
}

// Close detail dropdown on outside click (registered together with other dropdowns)
// handled in the existing mousedown listener below — we append to it via a second listener
document.addEventListener('mousedown', e => {
  const wrap = document.getElementById('btn-terrain-detail');
  const dd   = document.getElementById('terrain-detail-dropdown');
  if(dd && dd.style.display !== 'none'){
    if((!wrap || !wrap.contains(e.target)) && !dd.contains(e.target)){
      _terrainDetailDropOpen = false;
      dd.style.display = 'none';
    }
  }
}, true);

// ════════════════════════════════ TOOLS: HIGH RES SURFACE ════════════════════════════════

// Global flag: when true, water/surface offscreen canvases use 1024px instead of 512px.
// Off by default for performance; toggled by the Tools menu item.
let _hiResSurface = false;

// Returns the offscreen canvas resolution to use for water, cloud, and fc canvases.
// All callers should use this instead of a hardcoded 512.
function _surfaceSZ(){ return _hiResSurface ? 1024 : 512; }

function toggleHighResSurface(){
  _hiResSurface = !_hiResSurface;
  // Update badge
  const badge = document.getElementById('hires-badge');
  if(badge){
    badge.textContent = _hiResSurface ? 'ON' : 'OFF';
    badge.style.background    = _hiResSurface ? 'rgba(48,224,144,.18)' : 'rgba(255,180,80,.12)';
    badge.style.color         = _hiResSurface ? 'rgba(48,224,144,.9)'  : 'rgba(255,180,80,.4)';
    badge.style.borderColor   = _hiResSurface ? 'rgba(48,224,144,.35)' : 'rgba(255,180,80,.2)';
  }
  // Flush all cached offscreen canvases so they are rebuilt at the new resolution
  if(drawViewport._waterCache)    drawViewport._waterCache    = {};
  if(drawViewport._cloudCache)    drawViewport._cloudCache    = {};
  if(drawViewport._fcCache)       drawViewport._fcCache       = {};
  if(drawViewport._atmoPolarCache)drawViewport._atmoPolarCache= {};
  // Close the dropdown and redraw
  _toolsDropOpen = false;
  document.getElementById('tools-dropdown').style.display = 'none';
  drawViewport();
}

// ════════════════════════════════ TOOLS: LOCK SIDEBAR ════════════════════════════════

window._lockSidebar = false;
function toggleLockSidebar(){
  window._lockSidebar = !window._lockSidebar;
  // Close sidebar immediately when locking
  if(window._lockSidebar && typeof closeSidebar === 'function') closeSidebar();
  // Update badge
  const badge = document.getElementById('lock-sidebar-badge');
  if(badge){
    badge.textContent = window._lockSidebar ? 'ON' : 'OFF';
    badge.style.color        = window._lockSidebar ? 'rgba(48,224,144,.9)'  : 'rgba(255,180,80,.4)';
    badge.style.borderColor  = window._lockSidebar ? 'rgba(48,224,144,.35)' : 'rgba(255,180,80,.2)';
    badge.style.background   = window._lockSidebar ? 'rgba(48,224,144,.12)' : 'rgba(255,180,80,.12)';
  }
}

// ════════════════════════════════ TOOLS: DRAG ORBIT ════════════════════════════════

let _toolsDropOpen = false;
function toggleToolsDropdown(){
  _toolsDropOpen = !_toolsDropOpen;
  const dd = document.getElementById('tools-dropdown');
  if(_toolsDropOpen){
    const btn = document.getElementById('btn-tools');
    const r = btn.getBoundingClientRect();
    dd.style.top  = (r.bottom + 6) + 'px';
    dd.style.right = (window.innerWidth - r.right) + 'px';
    dd.style.left  = 'auto';
  }
  dd.style.display = _toolsDropOpen ? 'block' : 'none';
}
// Close dropdowns when clicking outside
document.addEventListener('mousedown', e => {
  const wrap = document.getElementById('tools-dropdown-wrap');
  const toolsDd = document.getElementById('tools-dropdown');
  if(wrap && !wrap.contains(e.target) && toolsDd && !toolsDd.contains(e.target)){ _toolsDropOpen = false; toolsDd.style.display='none'; }
  const envWrap = document.getElementById('env-dropdown-wrap');
  const envDd = document.getElementById('env-dropdown');
  if(envWrap && !envWrap.contains(e.target) && envDd && !envDd.contains(e.target)){ _envDropOpen = false; envDd.style.display='none'; }
}, true);

let dragOrbitMode = false;
let _dob_body = null;       // body being dragged
let _dob_startPos = null;   // world pos at drag start (for undo)
let _dob_active = false;    // pointer currently held down

function enterDragOrbitMode(){
  // Close dropdown
  _toolsDropOpen = false;
  document.getElementById('tools-dropdown').style.display = 'none';

  dragOrbitMode = true;

  // Swap wrench button → exit button
  const btn = document.getElementById('btn-tools');
  if(btn){
    btn.innerHTML = '✕ EXIT DRAG';
    btn.style.borderColor = 'rgba(255,80,80,.6)';
    btn.style.color = '#ff6060';
    btn.style.background = 'rgba(255,80,80,.1)';
    btn.onclick = exitDragOrbitMode;
    btn.title = 'Exit drag orbit mode';
  }

  // Close & disable sidebar
  if(selectedBody){ closeSidebar(); }
  document.getElementById('sidebar').style.pointerEvents = 'none';
  document.getElementById('sidebar').style.opacity = '0.3';

  // Change cursor on viewport
  vp.style.cursor = 'crosshair';

  // Overlay hint badge
  let hint = document.getElementById('drag-orbit-hint');
  if(!hint){
    hint = document.createElement('div');
    hint.id = 'drag-orbit-hint';
    hint.style.cssText = `position:fixed;bottom:36px;left:50%;transform:translateX(-50%);
      background:rgba(6,10,22,.92);border:1px solid rgba(255,180,80,.3);border-radius:4px;
      padding:6px 16px;font-family:'JetBrains Mono',monospace;font-size:.6rem;
      color:rgba(255,180,80,.85);letter-spacing:.07em;z-index:150;pointer-events:none;
      box-shadow:0 4px 16px rgba(0,0,0,.6)`;
    hint.textContent = '🪐  DRAG ORBIT  —  drag any body to reposition its orbit';
    document.body.appendChild(hint);
  }
  hint.style.display = 'block';
}

function exitDragOrbitMode(){
  dragOrbitMode = false;
  _dob_body = null;
  _dob_active = false;

  const btn = document.getElementById('btn-tools');
  if(btn){
    btn.innerHTML = '🔧';
    btn.style.borderColor = 'rgba(255,180,80,.35)';
    btn.style.color = '#ffb850';
    btn.style.background = '';
    btn.onclick = toggleToolsDropdown;
    btn.title = 'Tools';
  }

  document.getElementById('sidebar').style.pointerEvents = '';
  document.getElementById('sidebar').style.opacity = '';
  vp.style.cursor = '';

  const hint = document.getElementById('drag-orbit-hint');
  if(hint) hint.style.display = 'none';

  drawViewport();
}

// Convert screen coords → world orbit params for a body being dragged
// Returns { semiMajorAxis, argumentOfPeriapsis } or null if body has no orbit / is center
// Drag orbit state: scale + parent screen pos are frozen at drag-start to prevent runaway feedback
let _dob_frozenScale = null;      // getSMAScale() value frozen at mousedown
let _dob_frozenParentSP = null;   // parent screen pos frozen at mousedown
let _dob_frozenVpZ = null;        // vpZ frozen at mousedown

function _dob_freeze(bodyName){
  // Call once at drag start. Captures scale and parent screen pos so they can't drift.
  const b = bodies[bodyName];
  if(!b) return;
  const od = b.data.ORBIT_DATA;
  if(!od) return;
  _dob_frozenScale    = getSMAScale();  // read before any SMA mutation
  _dob_frozenVpZ      = vpZ;
  const parentName    = od.parent;
  const parentWP      = bodyWorldPos[parentName] || {x:0, y:0};
  _dob_frozenParentSP = worldToScreen(parentWP.x, parentWP.y);
}

function _dragOrbitCalcOrbit(bodyName, screenX, screenY){
  const b = bodies[bodyName];
  if(!b || b.isCenter) return null;
  const od = b.data.ORBIT_DATA;
  if(!od) return null;
  if(!_dob_frozenScale || !_dob_frozenParentSP) return null;

  // Canvas rect — screenX/Y are client coords
  const rect = vp.getBoundingClientRect();
  const canvasX = screenX - rect.left;
  const canvasY = screenY - rect.top;

  // Vector from frozen parent screen pos to drag point
  const dx_px = canvasX - _dob_frozenParentSP.x;
  const dy_px = canvasY - _dob_frozenParentSP.y;
  const dist_px = Math.hypot(dx_px, dy_px);
  if(dist_px < 2) return null;

  // Pixels → world metres using the frozen scale (never changes mid-drag)
  const dist_m = dist_px / _dob_frozenVpZ / _dob_frozenScale;

  // Preserve eccentricity; drag point = new periapsis
  // r_peri = SMA*(1-ecc)  =>  SMA = r_peri/(1-ecc)
  const ecc = od.eccentricity || 0;
  const newSMA = ecc < 1 ? dist_m / (1 - ecc) : dist_m;

  // AOP: atan2 of drag vector, Y-flipped for SFS Y-up convention.
  // From orbitGeometry: bodyX = parentX + (SMA-c)*cos(aop), bodyY = parentY - (SMA-c)*sin(aop)
  // So periapsis screen offset = (+cos(aop), -sin(aop)) * periapsis_px
  // Inverting: cos(aop) = dx_px/dist_px, sin(aop) = -dy_px/dist_px
  // => aop = atan2(-dy_px, dx_px)  [canvas dy is positive downward, SFS sin is positive upward]
  const aopDeg = Math.atan2(-dy_px, dx_px) * 180 / Math.PI;

  return { semiMajorAxis: newSMA, argumentOfPeriapsis: aopDeg };
}

// Draw live drag preview overlay (called after drawViewport so it renders on top)
function _drawDragOrbitPreview(bodyName, screenX, screenY){
  const b = bodies[bodyName];
  if(!b || b.isCenter) return;
  const od = b.data.ORBIT_DATA;
  if(!od || !_dob_frozenScale || !_dob_frozenParentSP) return;

  const rect = vp.getBoundingClientRect();
  const canvasX = screenX - rect.left;
  const canvasY = screenY - rect.top;

  const ecc = od.eccentricity || 0;
  // Use frozen scale so preview ellipse matches where the body actually is
  const smaPx  = od.semiMajorAxis * _dob_frozenScale * _dob_frozenVpZ;
  const smiPx  = smaPx * Math.sqrt(1 - ecc * ecc);
  const aopRad = od.argumentOfPeriapsis * Math.PI / 180;

  // Ellipse centre (same formula as orbitGeometry, in screen coords)
  const c = smaPx * ecc;
  const ellCX = _dob_frozenParentSP.x - c *  Math.cos(aopRad);
  const ellCY = _dob_frozenParentSP.y + c *  Math.sin(aopRad); // +sin = Y-flip

  const ctx = vp.getContext('2d');
  ctx.save();

  // Dashed orbit ellipse
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,180,80,.7)';
  ctx.translate(ellCX, ellCY);
  ctx.rotate(-aopRad);  // -aop matches orbitGeometry's angle:-aop
  ctx.beginPath();
  ctx.ellipse(0, 0, smaPx, smiPx, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Line from parent to drag point
  ctx.save();
  ctx.strokeStyle = 'rgba(255,180,80,.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(_dob_frozenParentSP.x, _dob_frozenParentSP.y);
  ctx.lineTo(canvasX, canvasY);
  ctx.stroke();
  ctx.setLineDash([]);

  // Periapsis dot at drag point
  ctx.fillStyle = 'rgba(255,200,80,1)';
  ctx.beginPath();
  ctx.arc(canvasX, canvasY, 4, 0, Math.PI * 2);
  ctx.fill();

  // SMA readout near drag point
  const smaKm = (od.semiMajorAxis / 1000).toLocaleString(undefined, {maximumFractionDigits: 0});
  ctx.font = '10px JetBrains Mono, monospace';
  ctx.fillStyle = 'rgba(255,210,100,.95)';
  ctx.fillText(`SMA ${smaKm} km  AOP ${od.argumentOfPeriapsis.toFixed(1)}°`, canvasX + 8, canvasY - 6);
  ctx.restore();
}

// ── Viewport events ──
vp.addEventListener('mousedown', e => {
  if(dragOrbitMode){
    // Hit-test for a body to drag
    const rect = vp.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const sc2 = getSMAScale();
    const hits = [];
    Object.entries(bodyScreenPos).forEach(([name, sp]) => {
      if(!bodyVisibleMap[name]) return;
      const b = bodies[name];
      if(b.isCenter) return; // center can't be orbit-dragged
      const br = (b.data.BASE_DATA||{}).radius || 1;
      const iconR = (b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4) * iconScale;
      const r = Math.max(iconR, br * sc2 * vpZ);
      const d = Math.hypot(mx - sp.x, my - sp.y);
      if(d < r + 12) hits.push({name, iconR, d});
    });
    hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
    if(hits.length){
      _dob_body = hits[0].name;
      _dob_active = true;
      _dob_freeze(_dob_body);   // freeze scale + parent pos BEFORE any SMA mutation
      pushUndo();
      vp.style.cursor = 'grabbing';
    }
    return; // never pan in drag orbit mode
  }
  dragging=true; dragSX=e.clientX; dragSY=e.clientY;
});
addEventListener('mousemove', e => {
  if(dragOrbitMode){
    if(_dob_active && _dob_body && bodies[_dob_body]){
      // Update orbit data live so drawViewport renders in new position
      const result = _dragOrbitCalcOrbit(_dob_body, e.clientX, e.clientY);
      if(result){
        const od = bodies[_dob_body].data.ORBIT_DATA;
        od.semiMajorAxis       = result.semiMajorAxis;
        od.argumentOfPeriapsis = result.argumentOfPeriapsis;
        // Do NOT invalidate _cachedSMAScale here — we use the frozen scale to prevent drift
      }
      drawViewport();
      // Draw preview overlay on top
      _drawDragOrbitPreview(_dob_body, e.clientX, e.clientY);
    }
    return;
  }
  if(!dragging) return;
  vpOffX += (e.clientX-dragSX)/vpZ;
  vpOffY += (e.clientY-dragSY)/vpZ;
  dragSX=e.clientX; dragSY=e.clientY;
  drawViewport();
});
addEventListener('mouseup', e => {
  if(dragOrbitMode && _dob_active && _dob_body){
    _dob_active = false;
    _dob_body = null;
    _dob_frozenScale = null;
    _dob_frozenParentSP = null;
    _dob_frozenVpZ = null;
    vp.style.cursor = 'crosshair';
    _cachedSMAScale = null;
    drawViewport();
    return;
  }
  dragging=false;
});
vp.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.25 : 0.80;
  const newZ = Math.max(0.0001, vpZ * factor);  // no upper cap — zoom in as far as needed

  // Zoom toward mouse cursor: keep the world point under the mouse fixed on screen
  const rect = vp.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  // World coords under mouse before zoom
  const wx = (mx - vp.width/2)  / vpZ - vpOffX;
  const wy = (my - vp.height/2) / vpZ - vpOffY;
  // Adjust offset so that same world point maps to same screen point at new zoom
  vpOffX = (mx - vp.width/2)  / newZ - wx;
  vpOffY = (my - vp.height/2) / newZ - wy;

  vpZ = newZ;
  document.getElementById('sb-zoom').textContent = Math.round(vpZ * 100) + '%';
  drawViewport();
}, {passive:false});
vp.addEventListener('click', e => {
  if(dragOrbitMode) return; // click does nothing in drag orbit mode
  // Ignore drag moves
  if(Math.abs(e.clientX - dragSX) > 4 || Math.abs(e.clientY - dragSY) > 4) return;
  const rect = vp.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  // Hit-test only VISIBLE bodies (respects LOD — hidden bodies can't be clicked)
  // Pick the one whose centre is nearest the tap point, within its hit radius.
  // Collect all bodies the click lands inside, then prefer largest (center/star wins)
  const sc2 = getSMAScale();
  const hitCandidates = [];
  Object.entries(bodyScreenPos).forEach(([name, sp]) => {
    if(!bodyVisibleMap[name]) return;
    const b = bodies[name];
    const bodyRadius_m = (b.data.BASE_DATA||{}).radius || 1;
    const iconR = (b.isCenter?18 : b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4) * iconScale;
    const r = Math.max(iconR, bodyRadius_m * sc2 * vpZ);
    const d = Math.hypot(mx - sp.x, my - sp.y);
    if(d < r + 10) hitCandidates.push({name, iconR, d});
  });
  // Pick largest iconR; tie-break by proximity
  hitCandidates.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
  const hit = hitCandidates.length ? hitCandidates[0].name : null;

  if(hit){
    selectBody(hit);
  } else {
    // Only deselect — never re-show empty-state on canvas click
    if(selectedBody){
      selectedBody = null;
      document.getElementById('sb-sel').textContent = '—';
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('statusbar').style.right = '0';
      setTimeout(resizeViewport, 360);
      drawViewport();
    }
  }
});
addEventListener('resize', resizeViewport);

// Double-click on a body zooms smoothly into it
vp.addEventListener('dblclick', e => {
  if(dragOrbitMode) return;
  if(Math.abs(e.clientX - dragSX) > 8 || Math.abs(e.clientY - dragSY) > 8) return;
  const rect = vp.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const sc2 = getSMAScale();
  const hits = [];
  Object.entries(bodyScreenPos).forEach(([name, sp]) => {
    if(!bodyVisibleMap[name]) return;
    const b = bodies[name];
    const br = (b.data.BASE_DATA||{}).radius || 1;
    const iconR = (b.isCenter?18 : b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4) * iconScale;
    const r = Math.max(iconR, br * sc2 * vpZ);
    const d = Math.hypot(mx-sp.x, my-sp.y);
    if(d < r + 10) hits.push({name, iconR, d});
  });
  hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
  if(hits.length) zoomToBody(hits[0].name);
});

// ── Touch support: pan (1 finger) + pinch zoom (2 fingers) ──
let _touches = {};
let _pinchStartDist = null;
let _pinchStartZ    = null;
let _pinchMidX = 0, _pinchMidY = 0;
let _lastPinchDist = null; // track delta-based zoom to prevent teleport
let _wasPinching = false;  // suppress tap-after-pinch
let _pinchMoved  = false;  // set on first pinch movement — suppresses sidebar open
// Double-tap detection
let _lastTapTime = 0;
let _lastTapX = 0, _lastTapY = 0;

vp.addEventListener('touchstart', e => {
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t => { _touches[t.identifier] = {x: t.clientX, y: t.clientY}; });
  if(dragOrbitMode && e.touches.length === 1){
    const t = e.touches[0];
    const rect = vp.getBoundingClientRect();
    const mx = t.clientX - rect.left, my = t.clientY - rect.top;
    const sc2 = getSMAScale();
    const hits = [];
    Object.entries(bodyScreenPos).forEach(([name, sp]) => {
      if(!bodyVisibleMap[name]) return;
      const b = bodies[name];
      if(b.isCenter) return;
      const br = (b.data.BASE_DATA||{}).radius || 1;
      const iconR = (b.preset==='star'?14:(b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4) * iconScale;
      const r = Math.max(iconR, br * sc2 * vpZ);
      const d = Math.hypot(mx - sp.x, my - sp.y);
      if(d < r + 16) hits.push({name, iconR, d});
    });
    hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
    if(hits.length){ _dob_body = hits[0].name; _dob_active = true; _dob_freeze(_dob_body); pushUndo(); }
    return;
  }
  const ids = Object.keys(_touches);
  if(ids.length === 2){
    const t0 = _touches[ids[0]], t1 = _touches[ids[1]];
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    _pinchStartDist = dist;
    _lastPinchDist  = dist;
    _pinchStartZ    = vpZ;
    _pinchMidX = (t0.x + t1.x) / 2;
    _pinchMidY = (t0.y + t1.y) / 2;
    _wasPinching = true;
    _pinchMoved  = false; // reset — will be set true on first actual movement
  }
  if(ids.length === 1){ dragSX = e.touches[0].clientX; dragSY = e.touches[0].clientY; }
}, {passive: false});

vp.addEventListener('touchmove', e => {
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t => { _touches[t.identifier] = {x: t.clientX, y: t.clientY}; });
  const ids = Object.keys(_touches);

  if(ids.length === 2 && _pinchStartDist && _lastPinchDist){
    const t0 = _touches[ids[0]], t1 = _touches[ids[1]];
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);

    // Guard: skip frame if dist is degenerate (fingers overlapping during lag)
    if(dist > 1){
      // Delta-based zoom: multiply by ratio of current-to-last distance each frame.
      // This prevents teleport when a third finger briefly touches or fingers rejoin.
      // Increased sensitivity: 1.8× multiplier on the delta
      const delta = dist / _lastPinchDist;
      // Clamp delta to sane range — avoids NaN/Inf during dropped frames on weak devices
      const clampedDelta = Math.max(0.5, Math.min(2.0, delta));
      const sensitivity = 1.8;
      const scaledDelta = 1 + (clampedDelta - 1) * sensitivity;
      const newZ = Math.max(0.0001, vpZ * scaledDelta);
      _lastPinchDist = dist;
      _pinchMoved = true; // mark that an actual pinch gesture occurred

      // Zoom toward midpoint between the two fingers
      const rect = vp.getBoundingClientRect();
      const midX = (t0.x + t1.x) / 2 - rect.left;
      const midY = (t0.y + t1.y) / 2 - rect.top;
      const wx = (midX - vp.width/2)  / vpZ - vpOffX;
      const wy = (midY - vp.height/2) / vpZ - vpOffY;
      vpOffX = (midX - vp.width/2)  / newZ - wx;
      vpOffY = (midY - vp.height/2) / newZ - wy;
      vpZ = newZ;
      document.getElementById('sb-zoom').textContent = Math.round(vpZ * 100) + '%';
      drawViewport();
    }

  } else if(ids.length === 1 && e.touches.length === 1){
    if(dragOrbitMode && _dob_active && _dob_body && bodies[_dob_body]){
      const t = e.touches[0];
      const result = _dragOrbitCalcOrbit(_dob_body, t.clientX, t.clientY);
      if(result){
        const od = bodies[_dob_body].data.ORBIT_DATA;
        od.semiMajorAxis       = result.semiMajorAxis;
        od.argumentOfPeriapsis = result.argumentOfPeriapsis;
      }
      drawViewport();
      if(result) _drawDragOrbitPreview(_dob_body, e.touches[0].clientX, e.touches[0].clientY);
    } else if(!dragOrbitMode){
      const t = e.touches[0];
      vpOffX += (t.clientX - dragSX) / vpZ;
      vpOffY += (t.clientY - dragSY) / vpZ;
      dragSX = t.clientX; dragSY = t.clientY;
      drawViewport();
    }
  }
}, {passive: false});

vp.addEventListener('touchend', e => {
  Array.from(e.changedTouches).forEach(t => { delete _touches[t.identifier]; });
  if(dragOrbitMode && _dob_active){
    _dob_active = false; _dob_body = null;
    _dob_frozenScale = null; _dob_frozenParentSP = null; _dob_frozenVpZ = null;
    _cachedSMAScale = null; drawViewport(); return;
  }
  const remaining = Object.keys(_touches).length;
  if(remaining < 2){
    _pinchStartDist = null; _pinchStartZ = null; _lastPinchDist = null;
    if(remaining === 1){
      const id = Object.keys(_touches)[0];
      dragSX = _touches[id].x; dragSY = _touches[id].y;
    }
  }
  // Clear wasPinching only when all fingers are fully gone
  if(remaining === 0){ _wasPinching = false; _pinchMoved = false; }

  // Tap detection: only when all fingers lifted, not after a pinch gesture.
  // Use _pinchMoved (set during touchmove) — _wasPinching is already cleared above.
  if(e.changedTouches.length === 1 && remaining === 0 && !_pinchMoved){
    const t = e.changedTouches[0];
    if(Math.abs(t.clientX - dragSX) < 8 && Math.abs(t.clientY - dragSY) < 8){
      const rect = vp.getBoundingClientRect();
      const mx = t.clientX - rect.left, my = t.clientY - rect.top;

      // Double-tap: zoom to body under finger
      const now = Date.now();
      const isDoubleTap = !dragOrbitMode &&
                          (now - _lastTapTime < 350) &&
                          Math.hypot(t.clientX - _lastTapX, t.clientY - _lastTapY) < 30;
      _lastTapTime = now; _lastTapX = t.clientX; _lastTapY = t.clientY;

      if(isDoubleTap){
        const sc2 = getSMAScale();
        const hits = [];
        Object.entries(bodyScreenPos).forEach(([name, sp]) => {
          if(!bodyVisibleMap[name]) return;
          const b = bodies[name];
          const br = (b.data.BASE_DATA||{}).radius || 1;
          const iconR = (b.isCenter?18:b.preset==='star'?14:(b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4) * iconScale;
          const r = Math.max(iconR, br * sc2 * vpZ);
          const d = Math.hypot(mx-sp.x, my-sp.y);
          if(d < r + 10) hits.push({name, iconR, d});
        });
        hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
        if(hits.length){ zoomToBody(hits[0].name); _lastTapTime = 0; }
        return;
      }

      // Single tap: select body
      const sc2t = getSMAScale();
      const hitCandidatesT = [];
      Object.entries(bodyScreenPos).forEach(([name, sp]) => {
        if(!bodyVisibleMap[name]) return;
        const b = bodies[name];
        const br = (b.data.BASE_DATA||{}).radius || 1;
        const iconR = b.isCenter?18 : b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4;
        const r = Math.max(iconR, br * sc2t * vpZ);
        const d = Math.hypot(mx-sp.x, my-sp.y);
        if(d < r + 14) hitCandidatesT.push({name, iconR, d});
      });
      hitCandidatesT.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
      const hit = hitCandidatesT.length ? hitCandidatesT[0].name : null;
      if(hit) selectBody(hit);
      else if(selectedBody){ selectedBody=null; document.getElementById('sb-sel').textContent='—'; document.getElementById('sidebar').classList.remove('open'); document.getElementById('statusbar').style.right='0'; setTimeout(resizeViewport,360); drawViewport(); }
    }
  }
}, {passive: false});

function renderBody(name){ drawViewport(); }
function updateBodyVisual(name){ drawViewport(); }

function updateStatusBar(){
  const names = Object.keys(bodies);
  document.getElementById('sb-count').textContent = names.length;
  const center = names.find(n=>bodies[n].isCenter)||'NONE';
  document.getElementById('sb-center').textContent = center;
  syncAddBodyBtn();
}


// ════════════════════════════════════════════════════════════════════════════
// PLANET SIZE COMPARISON TOOL
// Opens a modal with a canvas that renders all bodies side-by-side, scaled to
// their true relative sizes.  A two-body compare mode is also available.
// ════════════════════════════════════════════════════════════════════════════

const _PSC = {           // namespace object for all comparison-tool state
  open: false,
  mode: 'all',           // 'all' | 'two'
  bodyA: null,
  bodyB: null,
  animFrame: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  dragging: false,
  dragSX: 0, dragSY: 0,
  dragPX: 0, dragPY: 0,
};

// ── Open / close ──────────────────────────────────────────────────────────
function openPlanetComparison(){
  if(!Object.keys(bodies).length){
    alert('No bodies in system yet.');
    return;
  }
  _toolsDropOpen = false;
  document.getElementById('tools-dropdown').style.display = 'none';
  _PSC.open = true;
  _PSC.zoom = 1; _PSC.panX = 0; _PSC.panY = 0;
  _PSC.mode = 'all';
  _PSC.bodyA = null; _PSC.bodyB = null;

  const modal = document.getElementById('psc-modal');
  modal.style.display = 'flex';
  // Size canvas to its container (must happen after display:flex)
  requestAnimationFrame(() => {
    const cv   = document.getElementById('psc-canvas');
    const wrap = document.getElementById('psc-canvas-wrap');
    if(cv && wrap){
      cv.width  = wrap.offsetWidth  || 860;
      cv.height = wrap.offsetHeight || 480;
      _pscStarList = null; // regenerate stars for new size
    }
    _pscPopulateSelects();
    _pscScheduleDraw();
  });
}

function closePlanetComparison(){
  _PSC.open = false;
  document.getElementById('psc-modal').style.display = 'none';
  if(_PSC.animFrame){ cancelAnimationFrame(_PSC.animFrame); _PSC.animFrame = null; }
}

// ── Populate the two dropdowns with current body names ────────────────────
function _pscPopulateSelects(){
  const names = Object.keys(bodies);
  ['psc-sel-a','psc-sel-b'].forEach((id,idx) => {
    const sel = document.getElementById(id);
    sel.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join('');
    if(names[idx]) sel.value = names[idx];
  });
  _PSC.bodyA = document.getElementById('psc-sel-a').value || names[0] || null;
  _PSC.bodyB = document.getElementById('psc-sel-b').value || names[Math.min(1,names.length-1)] || null;
}

function _pscOnModeChange(m){
  _PSC.mode = m;
  document.getElementById('psc-two-row').style.display = m === 'two' ? 'flex' : 'none';
  _PSC.zoom=1; _PSC.panX=0; _PSC.panY=0;
  _pscScheduleDraw();
}

function _pscOnSelChange(){
  _PSC.bodyA = document.getElementById('psc-sel-a').value;
  _PSC.bodyB = document.getElementById('psc-sel-b').value;
  _PSC.zoom=1; _PSC.panX=0; _PSC.panY=0;
  _pscScheduleDraw();
}

// ── Drawing ───────────────────────────────────────────────────────────────
function _pscScheduleDraw(){
  if(_PSC.animFrame) cancelAnimationFrame(_PSC.animFrame);
  _PSC.animFrame = requestAnimationFrame(_pscDraw);
}

function _pscDraw(){
  _PSC.animFrame = null;
  const cv = document.getElementById('psc-canvas');
  if(!cv) return;
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  ctx.clearRect(0,0,W,H);

  // Starfield background
  ctx.fillStyle = '#040810';
  ctx.fillRect(0,0,W,H);
  _pscStars(ctx,W,H);

  const allNames = _PSC.mode === 'two'
    ? [_PSC.bodyA, _PSC.bodyB].filter(Boolean)
    : Object.keys(bodies);

  if(!allNames.length) return;

  // Gather radii and sort smallest to largest
  const items = allNames.map(n => {
    const bd = bodies[n]?.data?.BASE_DATA || {};
    return { name: n, r_m: Math.max(bd.radius || 1, 1) };
  });
  items.sort((a, b) => a.r_m - b.r_m);

  const maxR = items[items.length - 1].r_m;

  // Reserve space at bottom for labels
  const LABEL_H  = 90;  // taller to fit rotated labels
  const PAD_Y    = 20;
  const usableH  = H - LABEL_H - PAD_Y * 2;

  // Largest planet diameter fills usableH
  const pxPerMetre = usableH / (maxR * 2);

  // Horizontal layout: pack left to right, bottom-aligned, with proportional gap
  const GAP = Math.max(20, usableH * 0.06);
  const baselineY = PAD_Y + usableH; // all planets sit on this line

  let xCursor = GAP;
  const layout = items.map(it => {
    const displayR = Math.max(it.r_m * pxPerMetre, 2);
    const cx = xCursor + displayR;
    const cy = baselineY - displayR;
    xCursor = cx + displayR + GAP;
    return { ...it, displayR, cx, cy };
  });

  const totalW = xCursor;

  // Clamp pan so content edge stays visible
  const minPanX = Math.min(0, W - totalW * _PSC.zoom);
  _PSC.panX = Math.min(0, Math.max(minPanX, _PSC.panX));

  ctx.save();
  ctx.translate(_PSC.panX, _PSC.panY);
  ctx.scale(_PSC.zoom, _PSC.zoom);

  layout.forEach(it => {
    const b = bodies[it.name];
    if(!b) return;

    _pscDrawBody(ctx, b, it.name, it.cx, it.cy, it.displayR, it.r_m);

    // Labels — rotated 45° upward from the baseline so names never overlap
    const fontSize = Math.max(9, Math.min(12, it.displayR * 0.35 + 8));
    ctx.save();
    ctx.translate(it.cx, baselineY + 6);
    ctx.rotate(-Math.PI / 4);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(180,200,255,.9)';
    ctx.font = `bold ${fontSize}px "JetBrains Mono",monospace`;
    ctx.fillText(it.name, 0, 0);
    ctx.fillStyle = 'rgba(120,150,200,.6)';
    ctx.font = `${Math.max(7, fontSize - 2)}px "JetBrains Mono",monospace`;
    ctx.fillText(_pscFmtRadius(it.r_m), 0, fontSize + 2);
    ctx.restore();
  });

  // Scale bar in two-body mode
  if(_PSC.mode === 'two' && layout.length === 2){
    _pscDrawScaleBar(ctx, layout.map(l => l.name), layout.map(l => l.r_m), totalW, H);
  }

  ctx.restore();

  // Scroll hint when content overflows
  if(totalW * _PSC.zoom > W){
    ctx.save();
    ctx.fillStyle = 'rgba(150,160,200,.35)';
    ctx.font = '9px "JetBrains Mono",monospace';
    ctx.textAlign = 'right';
    ctx.fillText('← drag to scroll →', W - 10, H - 8);
    ctx.restore();
  }
}

// ── Starfield (static, seeded by canvas size) ─────────────────────────────
let _pscStarList = null;
function _pscStars(ctx, W, H){
  if(!_pscStarList || _pscStarList.W !== W){
    _pscStarList = { W, H, pts:[] };
    for(let i=0;i<120;i++) _pscStarList.pts.push([Math.random()*W, Math.random()*H, Math.random()]);
  }
  _pscStarList.pts.forEach(([x,y,b])=>{
    ctx.fillStyle = `rgba(180,200,255,${0.15+b*0.45})`;
    ctx.beginPath(); ctx.arc(x,y,0.6+b*0.8,0,Math.PI*2); ctx.fill();
  });
}

// ── Draw a single body centred at (cx,cy) with display radius displayR ────
function _pscDrawBody(ctx, b, name, cx, cy, displayR, r_m){
  const d = b.data || {};
  const BD = d.BASE_DATA || {};
  // mapColor is 0–1 range in SFS data
  const mc = BD.mapColor || {r:0.5,g:0.55,b:0.7,a:1};
  const mr = Math.round((mc.r||0.5)*255);
  const mg = Math.round((mc.g||0.55)*255);
  const mb = Math.round((mc.b||0.7)*255);
  const baseColor = `rgb(${mr},${mg},${mb})`;

  // Correct texture key path
  const TTD        = d.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA;
  const ptex       = TTD?.planetTexture;
  const surfTexA   = TTD?.surfaceTexture_A;
  const hasTerrain = !!d.TERRAIN_DATA;
  const hasAtmo    = !!(d.ATMOSPHERE_PHYSICS_DATA && d.ATMOSPHERE_VISUALS_DATA?.GRADIENT);
  const hasClouds  = !!(d.ATMOSPHERE_VISUALS_DATA?.CLOUDS?.texture &&
                        d.ATMOSPHERE_VISUALS_DATA.CLOUDS.texture !== 'None');
  const hasFCloud  = !!(d.FRONT_CLOUDS_DATA?.cloudsTexture &&
                        d.FRONT_CLOUDS_DATA.cloudsTexture !== 'None');
  const hasFog     = !!(d.ATMOSPHERE_VISUALS_DATA?.FOG?.keys?.length);

  const isStar = b.preset === 'star';
  const isBH   = b.preset === 'blackhole';

  ctx.save();

  // ── Atmosphere halo (behind body) ────────────────────────────────────────
  if(hasAtmo && !isStar){
    const GRD = d.ATMOSPHERE_VISUALS_DATA.GRADIENT;
    const atmoH = (d.ATMOSPHERE_PHYSICS_DATA.height || 0);
    const atmoRatio = atmoH > 0 ? Math.min(1 + atmoH / Math.max(r_m,1), 2.5) : 1.15;
    const atmoR = displayR * atmoRatio;
    const atmoTex = GRD.texture;
    const apx = atmoTex && atmoTex !== 'None' && texPixelCache[atmoTex+'_atmos'];

    if(apx){
      // Sample the atmo texture column for a radial gradient approximation
      const grad = ctx.createRadialGradient(cx,cy,displayR*0.9,cx,cy,atmoR);
      // Row 63 = surface (inner), Row 0 = outer edge
      const inner = [apx[63*4],apx[63*4+1],apx[63*4+2],apx[63*4+3]/255];
      const mid   = [apx[32*4],apx[32*4+1],apx[32*4+2],apx[32*4+3]/255];
      const outer = [apx[4],apx[5],apx[6],apx[7]/255];
      grad.addColorStop(0,   `rgba(${inner[0]},${inner[1]},${inner[2]},${(inner[3]*0.7).toFixed(2)})`);
      grad.addColorStop(0.4, `rgba(${mid[0]},${mid[1]},${mid[2]},${(mid[3]*0.5).toFixed(2)})`);
      grad.addColorStop(1,   `rgba(${outer[0]},${outer[1]},${outer[2]},0)`);
      ctx.beginPath(); ctx.arc(cx,cy,atmoR,0,Math.PI*2);
      ctx.fillStyle = grad; ctx.fill();
    } else {
      // Fallback: soft coloured halo
      const grad = ctx.createRadialGradient(cx,cy,displayR*0.85,cx,cy,displayR*1.5);
      grad.addColorStop(0,'rgba(100,170,255,.25)'); grad.addColorStop(1,'rgba(60,120,220,0)');
      ctx.beginPath(); ctx.arc(cx,cy,displayR*1.5,0,Math.PI*2);
      ctx.fillStyle=grad; ctx.fill();
    }
  }

  // ── Fog glow (tint over planet edge) ─────────────────────────────────────
  if(hasFog){
    const fogKeys = d.ATMOSPHERE_VISUALS_DATA.FOG.keys;
    if(fogKeys.length){
      const fk = fogKeys[0];
      const fc = fk.color || {r:200,g:200,b:255,a:0.3};
      const grad = ctx.createRadialGradient(cx,cy,displayR*0.6,cx,cy,displayR*1.1);
      grad.addColorStop(0,`rgba(${fc.r|0},${fc.g|0},${fc.b|0},0)`);
      grad.addColorStop(1,`rgba(${fc.r|0},${fc.g|0},${fc.b|0},${Math.min((fc.a||0.3)*0.6,0.5)})`);
      ctx.beginPath(); ctx.arc(cx,cy,displayR*1.1,0,Math.PI*2);
      ctx.fillStyle=grad; ctx.fill();
    }
  }

  // ── Planet disc ───────────────────────────────────────────────────────────
  // Layer order: baseColor → surface texture → rim shadow → clouds → specular

  // Step 1: always paint baseColor as the foundation
  ctx.beginPath(); ctx.arc(cx, cy, Math.max(displayR, 1.5), 0, Math.PI*2);
  if(isStar){
    const sg = ctx.createRadialGradient(cx-displayR*0.25, cy-displayR*0.25, 0, cx, cy, displayR);
    sg.addColorStop(0, 'rgba(255,255,240,1)');
    sg.addColorStop(0.4, baseColor);
    sg.addColorStop(1, `rgb(${Math.min(mr*1.5,255)|0},${mg|0},0)`);
    ctx.fillStyle = sg;
    ctx.fill();
  } else if(isBH){
    ctx.fillStyle = '#000';
    ctx.fill();
  } else {
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Step 2: surface texture — try planetTexture first, then surfaceTexture_A
    if(hasTerrain && displayR > 4){
      const texName = (ptex && ptex !== 'None') ? ptex
                    : (surfTexA && surfTexA !== 'None') ? surfTexA
                    : null;
      const texImg = texName && textureCache[texName]?.complete
                     && textureCache[texName].naturalWidth > 0
                     ? textureCache[texName] : null;
      if(texImg){
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, displayR, 0, Math.PI*2); ctx.clip();
        ctx.drawImage(texImg, cx-displayR, cy-displayR, displayR*2, displayR*2);
        ctx.restore();
      }
    }

    // Step 3: rim shadow
    const rim = ctx.createRadialGradient(cx, cy, displayR*0.55, cx, cy, displayR);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(0,0,0,.60)');
    ctx.beginPath(); ctx.arc(cx, cy, displayR, 0, Math.PI*2);
    ctx.fillStyle = rim; ctx.fill();

    // Step 4: cloud overlay
    if((hasClouds || hasFCloud) && displayR > 5){
      const cTex = hasClouds ? d.ATMOSPHERE_VISUALS_DATA.CLOUDS.texture
                             : d.FRONT_CLOUDS_DATA.cloudsTexture;
      const cImg = cTex && cTex !== 'None' && textureCache[cTex]?.complete &&
                   textureCache[cTex].naturalWidth > 0 ? textureCache[cTex] : null;
      if(cImg){
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, displayR, 0, Math.PI*2); ctx.clip();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(cImg, cx-displayR, cy-displayR, displayR*2, displayR*2);
        ctx.restore();
      }
    }
  }

  // Step 5: specular highlight
  if(!isBH && displayR > 3){
    const hl = ctx.createRadialGradient(cx-displayR*0.3, cy-displayR*0.3, 0, cx, cy, displayR);
    hl.addColorStop(0, 'rgba(255,255,255,.18)');
    hl.addColorStop(0.5, 'rgba(255,255,255,.04)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(cx, cy, displayR, 0, Math.PI*2);
    ctx.fillStyle = hl; ctx.fill();
  }

  // ── Star glow corona ──────────────────────────────────────────────────────
  if(isStar && displayR > 2){
    const sg2 = ctx.createRadialGradient(cx,cy,displayR,cx,cy,displayR*1.8);
    sg2.addColorStop(0,`rgba(${mr},${mg},${mb},.35)`);
    sg2.addColorStop(1,'rgba(255,160,40,0)');
    ctx.beginPath(); ctx.arc(cx,cy,displayR*1.8,0,Math.PI*2);
    ctx.fillStyle=sg2; ctx.fill();
  }

  // ── Black hole accretion disc ─────────────────────────────────────────────
  if(isBH && displayR > 3){
    const ag = ctx.createRadialGradient(cx,cy,displayR*0.9,cx,cy,displayR*1.6);
    ag.addColorStop(0,'rgba(255,120,30,.6)'); ag.addColorStop(0.5,'rgba(255,60,0,.25)'); ag.addColorStop(1,'rgba(255,20,0,0)');
    ctx.beginPath(); ctx.arc(cx,cy,displayR*1.6,0,Math.PI*2);
    ctx.fillStyle=ag; ctx.fill();
  }

  ctx.restore();
}

// ── Scale bar for two-body mode ────────────────────────────────────────────
function _pscDrawScaleBar(ctx, names, radii, W, H){
  const rA = radii[0], rB = radii[1];
  const ratio = (rA/rB).toFixed(2);
  const txt = `${names[0]} : ${names[1]} = ${ratio} : 1  |  ${_pscFmtRadius(rA)} vs ${_pscFmtRadius(rB)}`;
  ctx.save();
  ctx.font = '11px "JetBrains Mono",monospace';
  ctx.fillStyle='rgba(150,200,255,.7)';
  ctx.textAlign='center';
  ctx.fillText(txt, W/2, H - 14);
  ctx.restore();
}

function _pscFmtRadius(r){
  if(r >= 1e6) return (r/1e6).toFixed(2)+' Mm';
  if(r >= 1e3) return (r/1e3).toFixed(1)+' km';
  return r.toFixed(0)+' m';
}

// ── Zoom / pan interaction on the canvas ──────────────────────────────────
function _pscInitCanvasEvents(){
  const cv = document.getElementById('psc-canvas');
  if(!cv) return;

  cv.addEventListener('wheel', e=>{
    e.preventDefault();
    const rect = cv.getBoundingClientRect();
    // Mouse position in canvas CSS pixels
    const mx = (e.clientX - rect.left) * (cv.width / rect.width);
    const my = (e.clientY - rect.top)  * (cv.height / rect.height);
    const factor = e.deltaY < 0 ? 1.12 : 0.9;
    const newZoom = Math.max(0.3, Math.min(6, _PSC.zoom * factor));
    // Adjust pan so the point under the cursor stays fixed
    _PSC.panX = mx - (mx - _PSC.panX) * (newZoom / _PSC.zoom);
    _PSC.panY = my - (my - _PSC.panY) * (newZoom / _PSC.zoom);
    _PSC.zoom = newZoom;
    _pscScheduleDraw();
  }, {passive:false});

  cv.addEventListener('mousedown', e=>{
    _PSC.dragging=true; _PSC.dragSX=e.clientX; _PSC.dragSY=e.clientY;
    _PSC.dragPX=_PSC.panX; _PSC.dragPY=_PSC.panY;
  });
  window.addEventListener('mousemove', e=>{
    if(!_PSC.dragging) return;
    _PSC.panX=_PSC.dragPX+(e.clientX-_PSC.dragSX);
    _PSC.panY=_PSC.dragPY+(e.clientY-_PSC.dragSY);
    _pscScheduleDraw();
  });
  window.addEventListener('mouseup', ()=>{ _PSC.dragging=false; });

  // Touch pan/pinch
  let _touches = null;
  cv.addEventListener('touchstart', e=>{ e.preventDefault(); _touches=e.touches; _PSC.dragPX=_PSC.panX; _PSC.dragPY=_PSC.panY; },{passive:false});
  cv.addEventListener('touchmove', e=>{
    e.preventDefault();
    if(e.touches.length===1 && _touches?.length===1){
      _PSC.panX=_PSC.dragPX+(e.touches[0].clientX-_touches[0].clientX);
      _PSC.panY=_PSC.dragPY+(e.touches[0].clientY-_touches[0].clientY);
      _pscScheduleDraw();
    } else if(e.touches.length===2 && _touches?.length>=1){
      const d0=Math.hypot(_touches[0].clientX-(_touches[1]?.clientX??_touches[0].clientX),
                          _touches[0].clientY-(_touches[1]?.clientY??_touches[0].clientY));
      const d1=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,
                          e.touches[0].clientY-e.touches[1].clientY);
      if(d0>0) _PSC.zoom=Math.max(0.3,Math.min(6,_PSC.zoom*(d1/d0)));
      // Update snapshot AND anchor pan so zoom feels centered
      _touches=e.touches; _PSC.dragPX=_PSC.panX; _PSC.dragPY=_PSC.panY;
      _pscScheduleDraw();
    }
  },{passive:false});

  cv.addEventListener('touchend', e=>{
    if(e.touches.length === 0){
      _touches = null;
    } else {
      // One finger lifted from a pinch — re-anchor pan for the remaining finger
      _touches = e.touches;
      _PSC.dragPX = _PSC.panX;
      _PSC.dragPY = _PSC.panY;
    }
  },{passive:true});

  // Resize observer
  const ro = new ResizeObserver(()=>{
    const par = cv.parentElement;
    cv.width = par.offsetWidth; cv.height = par.offsetHeight;
    _pscStarList = null;
    _pscScheduleDraw();
  });
  ro.observe(cv.parentElement);
}

// Expose init (called after DOM ready from modal onload-equivalent)
window._pscInitCanvasEvents = _pscInitCanvasEvents;
