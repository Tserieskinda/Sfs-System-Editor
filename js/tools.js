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

    // Delta-based zoom: multiply by ratio of current-to-last distance each frame.
    // This prevents teleport when a third finger briefly touches or fingers rejoin.
    // Increased sensitivity: 1.8× multiplier on the delta
    const delta = dist / _lastPinchDist;
    const sensitivity = 1.8;
    const scaledDelta = 1 + (delta - 1) * sensitivity;
    const newZ = Math.max(0.0001, vpZ * scaledDelta);
    _lastPinchDist = dist;

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
    // Reset pinch when we drop below 2 fingers
    _pinchStartDist = null; _pinchStartZ = null; _lastPinchDist = null;
    // If 1 finger remains, reset pan start to avoid jump
    if(remaining === 1){
      const id = Object.keys(_touches)[0];
      dragSX = _touches[id].x; dragSY = _touches[id].y;
    }
  }
  // Tap detection
  if(e.changedTouches.length === 1 && remaining === 0){
    const t = e.changedTouches[0];
    if(Math.abs(t.clientX - dragSX) < 8 && Math.abs(t.clientY - dragSY) < 8){
      const rect = vp.getBoundingClientRect();
      const mx = t.clientX - rect.left, my = t.clientY - rect.top;
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

