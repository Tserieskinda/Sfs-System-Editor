// ════════════════════════════════ TOOLS: TERRAIN DETAIL ════════════════════════════════

// 0 = fewest vertices, 100 = full resolution (default). Applied as a multiplier on _screenN.
window.terrainDetail = 30;

let _terrainDetailDropOpen = false;

function toggleTerrainDetailDrop(){
  _terrainDetailDropOpen = !_terrainDetailDropOpen;
  const dd = document.getElementById('terrain-detail-dropdown');
  if(_terrainDetailDropOpen){
    dd.style.display = 'block';
    const btn = document.getElementById('btn-terrain-detail');
    positionToolbarDropdown(dd, btn);
  } else {
    dd.style.display = 'none';
  }
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
  try {
    const wrap = document.getElementById('btn-terrain-detail');
    const dd   = document.getElementById('terrain-detail-dropdown');
    if(dd && dd.style.display !== 'none'){
      if((!wrap || !wrap.contains(e.target)) && !dd.contains(e.target)){
        _terrainDetailDropOpen = false;
        dd.style.display = 'none';
      }
    }
  } catch(_){}
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

// ════════════════════════════════ TOOLS: DISABLE PLANET SELECTION ════════════════════════════════

window._disablePlanetSelection = false;
function toggleDisablePlanetSelection(){
  window._disablePlanetSelection = !window._disablePlanetSelection;
  // Deselect current body immediately when disabling selection
  if(window._disablePlanetSelection && typeof closeSidebar === 'function') closeSidebar();
  // Update badge
  const badge = document.getElementById('disable-planet-selection-badge');
  if(badge){
    badge.textContent = window._disablePlanetSelection ? 'ON' : 'OFF';
    badge.style.color        = window._disablePlanetSelection ? 'rgba(48,224,144,.9)'  : 'rgba(255,180,80,.4)';
    badge.style.borderColor  = window._disablePlanetSelection ? 'rgba(48,224,144,.35)' : 'rgba(255,180,80,.2)';
    badge.style.background   = window._disablePlanetSelection ? 'rgba(48,224,144,.12)' : 'rgba(255,180,80,.12)';
  }
}

// ════════════════════════════════ TOOLS: DRAG ORBIT ════════════════════════════════

let _toolsDropOpen = false;
function toggleToolsDropdown(){
  _toolsDropOpen = !_toolsDropOpen;
  const dd = document.getElementById('tools-dropdown');
  if(_toolsDropOpen){
    dd.style.display = 'block';
    const btn = document.getElementById('btn-tools');
    positionToolbarDropdown(dd, btn);
    // Sync badge to current state on open
    const badge = document.getElementById('disable-planet-selection-badge');
    if(badge){
      const on = !!window._disablePlanetSelection;
      badge.textContent       = on ? 'ON' : 'OFF';
      badge.style.color       = on ? 'rgba(48,224,144,.9)'  : 'rgba(255,180,80,.4)';
      badge.style.borderColor = on ? 'rgba(48,224,144,.35)' : 'rgba(255,180,80,.2)';
      badge.style.background  = on ? 'rgba(48,224,144,.12)' : 'rgba(255,180,80,.12)';
    }
  }
  dd.style.display = _toolsDropOpen ? 'block' : 'none';
}
// Close dropdowns when clicking outside
document.addEventListener('mousedown', e => {
  try {
    const wrap = document.getElementById('tools-dropdown-wrap');
    const toolsDd = document.getElementById('tools-dropdown');
    if(wrap && !wrap.contains(e.target) && toolsDd && !toolsDd.contains(e.target)){ _toolsDropOpen = false; toolsDd.style.display='none'; }
    const envWrap = document.getElementById('env-dropdown-wrap');
    const envDd = document.getElementById('env-dropdown');
    if(envWrap && !envWrap.contains(e.target) && envDd && !envDd.contains(e.target)){ _envDropOpen = false; envDd.style.display='none'; }
  } catch(_){}
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
      const r = Math.max(iconR, br * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
      const d = Math.hypot(mx - sp.x, my - sp.y);
      if(d < r + 12) hits.push({name, iconR, d});
    });
    hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
    if(hits.length){
      const hitName = hits[0].name;
      // Group drag orbit with group-select is disabled; fall through to single-body drag
      if(false && groupSelectMode && groupSelected.has(hitName)){
        _gdob_start(hitName, e.clientX, e.clientY);
      } else {
        _dob_body = hitName;
        _dob_active = true;
        _dob_freeze(_dob_body);
        pushUndo();
        vp.style.cursor = 'grabbing';
      }
    }
    return; // never pan in drag orbit mode
  }
  dragging=true; dragSX=e.clientX; dragSY=e.clientY;
  // Image overlay: consume mousedown if it hits an image or its handles
  const _rect0 = vp.getBoundingClientRect();
  const _mx0 = e.clientX - _rect0.left, _my0 = e.clientY - _rect0.top;
  _imgConsumedDown = false;
  if(typeof imgMouseDown === 'function' && imgMouseDown(_mx0, _my0, e.clientX, e.clientY)){
    dragging = false; // don't pan while dragging an image
    _imgConsumedDown = true;
  }
});
addEventListener('mousemove', e => {
  if(dragOrbitMode){
    // Group drag takes precedence
    if(_gdob_active){
      _gdob_move(e.clientX, e.clientY);
      return;
    }
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
  // Image overlay drag takes priority over viewport pan
  if(typeof imgMouseMove === 'function' && imgMouseMove(e.clientX, e.clientY)) return;
  if(!dragging) return;
  vpOffX += (e.clientX-dragSX)/vpZ;
  vpOffY += (e.clientY-dragSY)/vpZ;
  dragSX=e.clientX; dragSY=e.clientY;
  drawViewport();
});
addEventListener('mouseup', e => {
  if(typeof imgMouseUp === 'function') imgMouseUp();
  _imgConsumedDown = false;
  if(dragOrbitMode && _gdob_active){ _gdob_end(); return; }
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
  if(window._disablePlanetSelection) return; // selection disabled
  // Ignore drag moves
  if(Math.abs(e.clientX - dragSX) > 4 || Math.abs(e.clientY - dragSY) > 4) return;
  // If a hold just opened the context menu, swallow the trailing click so the sidebar
  // doesn't open on top of it
  if(_ctxEl().style.display !== 'none') return;
  // If the image overlay handled the mousedown (select/deselect/drag), don't body-select
  if(_imgConsumedDown) { _imgConsumedDown = false; return; }
  // In group-select mode, taps toggle selection instead of opening sidebar
  if(_groupSelHandleTap(e.clientX, e.clientY)) return;
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
    const r = Math.max(iconR, bodyRadius_m * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
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
    const r = Math.max(iconR, br * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
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
let _hadMultiTouch = false; // set whenever 2+ fingers were down this gesture — suppresses tap on last-finger-up
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
      const r = Math.max(iconR, br * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
      const d = Math.hypot(mx - sp.x, my - sp.y);
      if(d < r + 16) hits.push({name, iconR, d});
    });
    hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
    if(hits.length){
      const hitName = hits[0].name;
      if(false && groupSelectMode && groupSelected.has(hitName)){
        _gdob_start(hitName, t.clientX, t.clientY);
      } else {
        _dob_body = hitName; _dob_active = true; _dob_freeze(_dob_body); pushUndo();
      }
    }
    return;
  }
  const ids = Object.keys(_touches);
  if(ids.length === 2){
    _hadMultiTouch = true;  // remember this gesture involved 2 fingers
    const t0 = _touches[ids[0]], t1 = _touches[ids[1]];
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
    // Check if both fingers land on the same image — if so, hand off to image pinch
    const rect2 = vp.getBoundingClientRect();
    const _imgPinchConsumed = typeof imgPinchStart === 'function'
      && imgPinchStart(t0.x - rect2.left, t0.y - rect2.top, t1.x - rect2.left, t1.y - rect2.top);
    if(!_imgPinchConsumed) {
      // Normal viewport pinch-zoom
      _pinchStartDist = dist;
      _lastPinchDist  = dist;
      _pinchStartZ    = vpZ;
      _pinchMidX = (t0.x + t1.x) / 2;
      _pinchMidY = (t0.y + t1.y) / 2;
      _wasPinching = true;
      _pinchMoved  = false;
      _gsPinchStart(dist);
    } else {
      // Image pinch active — suppress viewport pinch
      _pinchStartDist = null;
      _lastPinchDist  = null;
      _wasPinching = true;
      _pinchMoved  = false;
    }
  }
  if(ids.length === 1){
    dragSX = e.touches[0].clientX; dragSY = e.touches[0].clientY;
    // Image overlay touch — consume if it hits an image; suppress viewport pan if so
    const _t0 = e.touches[0];
    const _rect1 = vp.getBoundingClientRect();
    if(typeof imgMouseDown === 'function'){
      const _imgConsumed = imgMouseDown(_t0.clientX - _rect1.left, _t0.clientY - _rect1.top, _t0.clientX, _t0.clientY);
      if(_imgConsumed) { _imgConsumedDown = true; }
    }
  }
}, {passive: false});

vp.addEventListener('touchmove', e => {
  e.preventDefault();
  Array.from(e.changedTouches).forEach(t => { _touches[t.identifier] = {x: t.clientX, y: t.clientY}; });
  const ids = Object.keys(_touches);

  if(ids.length === 2 && _lastPinchDist){
    const t0 = _touches[ids[0]], t1 = _touches[ids[1]];
    const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);

    // If an image pinch is active, route to it instead of viewport zoom
    if(typeof imgPinchMove === 'function') {
      const rect2 = vp.getBoundingClientRect();
      if(imgPinchMove(t0.x - rect2.left, t0.y - rect2.top, t1.x - rect2.left, t1.y - rect2.top)){
        _pinchMoved = true;
        return;
      }
    }

    // Guard: skip frame if dist is degenerate (fingers overlapping during lag)
    if(dist > 1){
      // Group-select: scale SMAs proportional to total pinch ratio (from start)
      _gsPinchUpdate(dist);
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
    if(dragOrbitMode && _gdob_active){
      const t = e.touches[0];
      _gdob_move(t.clientX, t.clientY);
    } else if(dragOrbitMode && _dob_active && _dob_body && bodies[_dob_body]){
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
      // Image drag takes priority over viewport pan
      if(typeof imgMouseMove === 'function' && imgMouseMove(t.clientX, t.clientY)){
        dragSX = t.clientX; dragSY = t.clientY;
      } else {
        vpOffX += (t.clientX - dragSX) / vpZ;
        vpOffY += (t.clientY - dragSY) / vpZ;
        dragSX = t.clientX; dragSY = t.clientY;
        drawViewport();
      }
    }
  }
}, {passive: false});

vp.addEventListener('touchend', e => {
  Array.from(e.changedTouches).forEach(t => { delete _touches[t.identifier]; });
  if(typeof imgMouseUp === 'function') imgMouseUp();
  if(dragOrbitMode && _gdob_active){ _gdob_end(); return; }
  if(dragOrbitMode && _dob_active){
    _dob_active = false; _dob_body = null;
    _dob_frozenScale = null; _dob_frozenParentSP = null; _dob_frozenVpZ = null;
    _cachedSMAScale = null; drawViewport(); return;
  }
  const remaining = Object.keys(_touches).length;
  if(remaining < 2){
    _gsPinchEnd();
    _pinchStartDist = null; _pinchStartZ = null; _lastPinchDist = null;
    if(remaining === 1){
      const id = Object.keys(_touches)[0];
      dragSX = _touches[id].x; dragSY = _touches[id].y;
    }
  }
  // Clear wasPinching only when all fingers are fully gone.
  // Snapshot _pinchMoved BEFORE clearing — the tap-suppression check below needs it.
  const _wasPinchGesture = _pinchMoved || _hadMultiTouch;
  if(remaining === 0){ _wasPinching = false; _pinchMoved = false; _hadMultiTouch = false; }

  // Tap detection: only when all fingers lifted, not after a pinch/multi-touch gesture.
  if(e.changedTouches.length === 1 && remaining === 0 && !_wasPinchGesture){
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
          const r = Math.max(iconR, br * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
          const d = Math.hypot(mx-sp.x, my-sp.y);
          if(d < r + 10) hits.push({name, iconR, d});
        });
        hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
        if(hits.length){ zoomToBody(hits[0].name); _lastTapTime = 0; }
        return;
      }

      // Suppress tap if a hold-context-menu just fired on this same touch
      if(_holdFired){ _holdFired = false; return; }

      // Group-select mode: tap toggles body selection
      if(_groupSelHandleTap(t.clientX, t.clientY)) return;

      // Single tap: select body
      const sc2t = getSMAScale();
      const hitCandidatesT = [];
      Object.entries(bodyScreenPos).forEach(([name, sp]) => {
        if(!bodyVisibleMap[name]) return;
        const b = bodies[name];
        const br = (b.data.BASE_DATA||{}).radius || 1;
        const iconR = b.isCenter?18 : b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10:(b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7:b.preset==='moon'?5:4;
        const r = Math.max(iconR, br * sc2t * vpZ, bodyTerrainPeakPx[name] || 0);
        const d = Math.hypot(mx-sp.x, my-sp.y);
        if(d < r + 14) hitCandidatesT.push({name, iconR, d});
      });
      hitCandidatesT.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
      const hit = hitCandidatesT.length ? hitCandidatesT[0].name : null;
      if(hit && !window._disablePlanetSelection) selectBody(hit);
      else if(selectedBody){ selectedBody=null; document.getElementById('sb-sel').textContent='—'; document.getElementById('sidebar').classList.remove('open'); document.getElementById('statusbar').style.right='0'; setTimeout(resizeViewport,360); drawViewport(); }
    }
  }
}, {passive: false});

function renderBody(name){ drawViewport(); }
// ── touchcancel: treat as all-fingers-up to prevent phantom stuck touches ────
// Fires when the OS interrupts touches (notifications, app switch, edge swipe,
// scroll takeover). Without this, cancelled touch identifiers stay in _touches
// permanently, making the next single-finger pan behave like a pinch-zoom.
vp.addEventListener('touchcancel', e => {
  // Remove every cancelled touch from our tracking map
  Array.from(e.changedTouches).forEach(t => { delete _touches[t.identifier]; });
  // If all touches are gone (most common case), do a full state reset
  if(Object.keys(_touches).length === 0){
    _pinchStartDist = null; _pinchStartZ = null; _lastPinchDist = null;
    _wasPinching = false; _pinchMoved = false; _hadMultiTouch = false;
    if(dragOrbitMode && _dob_active){
      _dob_active = false; _dob_body = null;
      _dob_frozenScale = null; _dob_frozenParentSP = null; _dob_frozenVpZ = null;
      _cachedSMAScale = null;
    }
    drawViewport();
  } else {
    // Some fingers still active — reset pinch state if we dropped below 2
    if(Object.keys(_touches).length < 2){
      _pinchStartDist = null; _pinchStartZ = null; _lastPinchDist = null;
    }
  }
}, {passive: false});

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
  mode: 'all',           // 'all' | 'select'
  selected: new Set(),   // body names chosen in 'select' mode
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
  _PSC.view = 'size';
  _PSC.selected = new Set();
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
    _pscSetView('size');
    _pscScheduleDraw();
  });
}

function closePlanetComparison(){
  _PSC.open = false;
  document.getElementById('psc-modal').style.display = 'none';
  if(_PSC.animFrame){ cancelAnimationFrame(_PSC.animFrame); _PSC.animFrame = null; }
  if(_PSC.distFrame){ cancelAnimationFrame(_PSC.distFrame); _PSC.distFrame = null; }
}

// ── View switching: SIZE vs DISTANCE ─────────────────────────────────────
_PSC.view = 'size';   // 'size' | 'distance'
_PSC.distPanX = 0;    // horizontal scroll for distance view
_PSC.distFrame = null;

function _pscSetView(v){
  _PSC.view = v;
  const sizeWrap = document.getElementById('psc-canvas-wrap');
  const distWrap = document.getElementById('psc-dist-wrap');
  const modeBtns = document.getElementById('psc-mode-btns');
  const selRow   = document.getElementById('psc-sel-row');
  const tabSize  = document.getElementById('psc-tab-size');
  const tabDist  = document.getElementById('psc-tab-dist');

  if(v === 'size'){
    if(sizeWrap) sizeWrap.style.display = '';
    if(distWrap) distWrap.style.display = 'none';
    if(modeBtns) modeBtns.style.display = 'flex';
    if(tabSize){ tabSize.style.background='rgba(255,180,80,.18)'; tabSize.style.borderColor='rgba(255,180,80,.5)'; tabSize.style.color='#ffb850'; }
    if(tabDist){ tabDist.style.background='none'; tabDist.style.borderColor='rgba(255,180,80,.2)'; tabDist.style.color='rgba(255,180,80,.45)'; }
    _pscScheduleDraw();
  } else {
    if(sizeWrap) sizeWrap.style.display = 'none';
    if(distWrap) distWrap.style.display = '';
    // Hide SELECT BODIES row in distance view (distance always shows all)
    if(modeBtns) modeBtns.style.display = 'none';
    if(selRow)   selRow.style.display   = 'none';
    if(tabDist){ tabDist.style.background='rgba(255,180,80,.18)'; tabDist.style.borderColor='rgba(255,180,80,.5)'; tabDist.style.color='#ffb850'; }
    if(tabSize){ tabSize.style.background='none'; tabSize.style.borderColor='rgba(255,180,80,.2)'; tabSize.style.color='rgba(255,180,80,.45)'; }
    _pscScheduleDistDraw();
  }
}

// ── Distance view drawing ─────────────────────────────────────────────────
const _AU_M  = 1.496e11;          // metres per AU
const _LY_M  = 9.461e15;          // metres per light-year

function _pscFmtDist(m){
  if(m <= 0) return '0 AU';
  const au = m / _AU_M;
  if(au < 0.001) return (m / 1e9).toFixed(1) + ' Gm';
  if(au < 10)    return au.toFixed(3) + ' AU';
  if(au < 1e4)   return au.toFixed(1) + ' AU';
  const ly = m / _LY_M;
  if(ly < 0.1)   return au.toFixed(0) + ' AU';
  if(ly < 1000)  return ly.toFixed(3) + ' ly';
  return (ly / 1e3).toFixed(2) + ' kly';
}

function _pscScheduleDistDraw(){
  if(_PSC.distFrame) cancelAnimationFrame(_PSC.distFrame);
  _PSC.distFrame = requestAnimationFrame(_pscDrawDist);
}

function _pscDrawDist(){
  _PSC.distFrame = null;
  const cv = document.getElementById('psc-dist-canvas');
  const wrap = document.getElementById('psc-dist-wrap');
  if(!cv || !wrap) return;

  // Size canvas to wrapper
  const W = wrap.offsetWidth || 960;
  const ROW_H  = 52;    // pixels per body row
  const names  = Object.keys(bodies);
  // Collect orbiting bodies with SMA; include center at 0
  const items = names.map(n => {
    const b  = bodies[n];
    const od = b?.data?.ORBIT_DATA;
    const sma = od?.semiMajorAxis ?? 0;
    return { name: n, sma_m: sma, isCenter: b.isCenter || false };
  }).filter(it => it.isCenter || it.sma_m > 0);
  items.sort((a, b) => a.sma_m - b.sma_m);

  const H = Math.max(120, items.length * ROW_H + 60);
  cv.width  = W;
  cv.height = H;

  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#040810';
  ctx.fillRect(0, 0, W, H);
  _pscStars(ctx, W, H);

  if(!items.length){
    ctx.fillStyle = 'rgba(150,160,200,.45)';
    ctx.font = '12px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText('No bodies in system.', W/2, H/2);
    return;
  }

  const maxSMA  = Math.max(...items.map(i => i.sma_m), 1);
  const PAD_L   = 130;  // left margin for labels
  const PAD_R   = 20;
  const barW    = W - PAD_L - PAD_R;

  // Draw grid lines at round AU values
  const maxAU   = maxSMA / _AU_M;
  const step    = _pscNiceStep(maxAU, 6);
  ctx.strokeStyle = 'rgba(255,180,80,.08)';
  ctx.lineWidth   = 1;
  for(let au = 0; au <= maxAU + step; au += step){
    const x = PAD_L + (au / maxAU) * barW * (maxSMA / maxSMA);
    // normalised x
    const nx = PAD_L + barW * (au * _AU_M) / maxSMA;
    if(nx > W - PAD_R + 1) break;
    ctx.beginPath(); ctx.moveTo(nx, 0); ctx.lineTo(nx, H); ctx.stroke();
    ctx.fillStyle = 'rgba(255,180,80,.3)';
    ctx.font = '8px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText(_pscFmtDist(au * _AU_M), nx, 10);
  }

  // Draw rows
  items.forEach((it, i) => {
    const y     = 24 + i * ROW_H;
    const midY  = y + ROW_H / 2;
    const b     = bodies[it.name];
    const bd    = b?.data?.BASE_DATA || {};
    const mc    = bd.mapColor || { r:.5, g:.55, b:.7 };
    const col   = `rgb(${Math.round(mc.r*255)},${Math.round(mc.g*255)},${Math.round(mc.b*255)})`;

    // Dashed line from center to body
    const xBody = PAD_L + barW * (it.sma_m / maxSMA);
    ctx.strokeStyle = 'rgba(255,180,80,.18)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(PAD_L, midY); ctx.lineTo(xBody, midY); ctx.stroke();
    ctx.setLineDash([]);

    // Body dot
    const dotR = it.isCenter ? 8 : Math.max(3, Math.min(10, 3 + Math.log10(Math.max(bd.radius || 1e6, 1e4)) * 1.5));
    ctx.beginPath(); ctx.arc(xBody, midY, dotR, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.2)';
    ctx.lineWidth = 0.5; ctx.stroke();

    // Body name (left side)
    ctx.textAlign  = 'right';
    ctx.fillStyle  = 'rgba(220,230,255,.9)';
    ctx.font       = `bold 10px "JetBrains Mono",monospace`;
    ctx.fillText(it.name, PAD_L - 8, midY + 4);

    // Distance label (right of dot)
    if(!it.isCenter && it.sma_m > 0){
      const au  = it.sma_m / _AU_M;
      const ly  = it.sma_m / _LY_M;
      const line1 = _pscFmtDist(it.sma_m);
      const line2 = au >= 1e4 ? '' : `${ly.toExponential(2)} ly`;
      const lx = Math.min(xBody + dotR + 6, W - PAD_R - 50);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,200,100,.85)';
      ctx.font = '9px "JetBrains Mono",monospace';
      ctx.fillText(line1, lx, midY + 1);
      if(line2){
        ctx.fillStyle = 'rgba(160,170,210,.55)';
        ctx.fillText(line2, lx, midY + 11);
      }
    }
  });

  // Set canvas display height to match content
  cv.style.height = H + 'px';
}

function _pscNiceStep(maxVal, targetTicks){
  const raw  = maxVal / targetTicks;
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let nice = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return nice * mag || 1;
}

function _pscOnModeChange(m){ _PSC.mode = m; _PSC.zoom=1; _PSC.panX=0; _PSC.panY=0; _pscScheduleDraw(); }
function _pscOnSelChange(){ _PSC.zoom=1; _PSC.panX=0; _PSC.panY=0; _pscScheduleDraw(); }
function _pscPopulateSelects(){}

// ── Distance Indicators (viewport overlay) ────────────────────────────────
let _distIndicatorsOn = false;
// 'center' = center→selected (original), 'body-body' = user-picked A→B
let _distMode  = 'center';
let _distBodyA = null;   // name of body A in body-body mode
let _distBodyB = null;   // name of body B in body-body mode

function toggleDistanceIndicators(){
  _distIndicatorsOn = !_distIndicatorsOn;
  _updateDistBadge();
  _updateDistBodyPickers();
  if(typeof drawViewport === 'function') drawViewport();
}

function cycleDistanceMode(){
  if(!_distIndicatorsOn) return;
  _distMode = _distMode === 'center' ? 'body-body' : 'center';
  _updateDistBadge();
  _updateDistBodyPickers();
  if(typeof drawViewport === 'function') drawViewport();
}

function _updateDistBadge(){
  const badge = document.getElementById('dist-indicator-badge');
  if(!badge) return;
  if(!_distIndicatorsOn){
    badge.textContent = 'OFF';
    badge.style.color      = 'rgba(255,180,80,.4)';
    badge.style.background = 'rgba(255,180,80,.12)';
    badge.style.borderColor= 'rgba(255,180,80,.2)';
  } else if(_distMode === 'center'){
    badge.textContent = 'CENTER';
    badge.style.color      = 'rgba(100,220,180,.9)';
    badge.style.background = 'rgba(100,220,180,.15)';
    badge.style.borderColor= 'rgba(100,220,180,.4)';
  } else {
    badge.textContent = 'BODY↔BODY';
    badge.style.color      = 'rgba(140,160,255,.9)';
    badge.style.background = 'rgba(140,160,255,.15)';
    badge.style.borderColor= 'rgba(140,160,255,.4)';
  }
}

function _updateDistBodyPickers(){
  const row = document.getElementById('dist-body-picker-row');
  if(!row) return;
  row.style.display = (_distIndicatorsOn && _distMode === 'body-body') ? 'flex' : 'none';
  if(_distIndicatorsOn && _distMode === 'body-body') _populateDistBodyPickers();
}

function _populateDistBodyPickers(){
  const sa = document.getElementById('dist-body-a-sel');
  const sb = document.getElementById('dist-body-b-sel');
  if(!sa || !sb || !bodies) return;
  const names = Object.keys(bodies).filter(n => !bodies[n].isCenter).sort();
  [sa, sb].forEach((sel, idx) => {
    const prev = sel.value;
    sel.innerHTML = '<option value="">— pick body —</option>' +
      names.map(n => `<option value="${n}"${n===prev?' selected':''}>${n}</option>`).join('');
    // keep saved state
    if(idx === 0 && _distBodyA) sel.value = _distBodyA;
    if(idx === 1 && _distBodyB) sel.value = _distBodyB;
  });
}

function _distSetBodyA(v){ _distBodyA = v || null; if(typeof drawViewport==='function') drawViewport(); }
function _distSetBodyB(v){ _distBodyB = v || null; if(typeof drawViewport==='function') drawViewport(); }

// Helper: compute a non-center body's world position (px) from its orbit data
function _distBodyWorldPos(name){
  if(!bodies || !bodies[name]) return null;
  const b = bodies[name];
  if(b.isCenter) return { x: 0, y: 0 };
  const od = b.data?.ORBIT_DATA;
  if(!od) return null;
  if(typeof orbitGeometry !== 'function' || typeof smaToPixels !== 'function' || typeof effectiveSMA !== 'function') return null;
  const smaPx = smaToPixels(effectiveSMA(od));
  const ecc   = od.eccentricity || 0;
  const aop   = od.argumentOfPeriapsis || 0;
  let pWX = 0, pWY = 0;
  const parentName = od.parent;
  if(parentName && bodies[parentName] && !bodies[parentName].isCenter){
    const pod = bodies[parentName].data?.ORBIT_DATA;
    if(pod){
      const pg = orbitGeometry(smaToPixels(effectiveSMA(pod)), pod.eccentricity||0, pod.argumentOfPeriapsis||0, 0, 0);
      if(pg){ pWX = pg.bodyX; pWY = pg.bodyY; }
    }
  }
  const geom = orbitGeometry(smaPx, ecc, aop, pWX, pWY);
  return geom ? { x: geom.bodyX, y: geom.bodyY } : null;
}

// Called from _drawViewportNow right before imgDrawOverlays
function _drawDistanceIndicators(ctx, vpZ, vpOffX, vpOffY, vpW, vpH){
  if(!_distIndicatorsOn) return;
  if(typeof orbitGeometry !== 'function' || typeof smaToPixels !== 'function' || typeof effectiveSMA !== 'function') return;

  const toScr = (wx, wy) => ({
    x: (wx + vpOffX) * vpZ + vpW / 2,
    y: (wy + vpOffY) * vpZ + vpH / 2,
  });

  let ptA, ptB, distLabel1, distLabel2, lineColor, dotColor;

  if(_distMode === 'center'){
    // ── Original mode: center → selected body ─────────────────────────────
    if(!bodies || !selectedBody || !bodies[selectedBody]) return;
    const selBody = bodies[selectedBody];
    if(!selBody || selBody.isCenter) return;
    const od = selBody.data?.ORBIT_DATA;
    if(!od) return;
    const wp = _distBodyWorldPos(selectedBody);
    if(!wp) return;

    ptA = toScr(0, 0);
    ptB = toScr(wp.x, wp.y);

    const sma_m = od.semiMajorAxis || 0;
    const au    = sma_m / _AU_M;
    const ly    = sma_m / _LY_M;
    distLabel1 = _pscFmtDist(sma_m) + ' (SMA)';
    distLabel2 = au < 1e4 ? ly.toExponential(3) + ' ly' : '';
    lineColor = 'rgba(100,220,180,.55)';
    dotColor  = 'rgba(100,220,180,.7)';

  } else {
    // ── Body-body mode: _distBodyA → _distBodyB ───────────────────────────
    if(!_distBodyA || !_distBodyB || _distBodyA === _distBodyB) return;
    const wpA = _distBodyWorldPos(_distBodyA);
    const wpB = _distBodyWorldPos(_distBodyB);
    if(!wpA || !wpB) return;

    ptA = toScr(wpA.x, wpA.y);
    ptB = toScr(wpB.x, wpB.y);

    // Euclidean distance between their world positions (px → metres)
    if(typeof smaToPixels !== 'function') return;
    // Reverse-convert: 1 px = how many metres? Use a reference SMA if possible
    // smaToPixels(sma_m) = sma_m * vpZ * scale → we need 1/( vpZ * scale )
    // But we don't have scale directly here. Use the ratio: measure in world-px then
    // convert using smaToPixels(1) which equals vpZ*scale_factor.
    const onePxInM = 1 / smaToPixels(1);   // metres per world-px
    const dxPx = wpB.x - wpA.x;
    const dyPx = wpB.y - wpA.y;
    const dist_m = Math.hypot(dxPx, dyPx) * onePxInM;
    distLabel1 = _pscFmtDist(dist_m);
    distLabel2 = (dist_m / _AU_M).toExponential(3) + ' AU';
    lineColor = 'rgba(140,160,255,.6)';
    dotColor  = 'rgba(140,160,255,.8)';
  }

  // ── Shared drawing ─────────────────────────────────────────────────────
  ctx.save();
  ctx.strokeStyle = lineColor;
  ctx.lineWidth   = 1.2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(ptA.x, ptA.y);
  ctx.lineTo(ptB.x, ptB.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const mx = (ptA.x + ptB.x) / 2;
  const my = (ptA.y + ptB.y) / 2;
  const lines = [distLabel1, distLabel2].filter(Boolean);
  const fSize = 10;
  const boxW  = Math.max(...lines.map(l => l.length)) * fSize * 0.6 + 14;
  const boxH  = lines.length * (fSize + 3) + 8;

  ctx.fillStyle = 'rgba(4,10,24,.82)';
  ctx.strokeStyle = lineColor.replace('.55','.35').replace('.6','.35');
  ctx.lineWidth = 0.8;
  _roundRect(ctx, mx - boxW/2, my - boxH/2, boxW, boxH, 4);
  ctx.fill(); ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = `bold ${fSize}px "JetBrains Mono",monospace`;
  lines.forEach((l, i) => {
    ctx.fillStyle = i === 0 ? lineColor.replace('.55','.95').replace('.6','.95') : 'rgba(160,200,180,.6)';
    ctx.fillText(l, mx, my - boxH/2 + 14 + i * (fSize + 3));
  });

  ctx.fillStyle = dotColor;
  ctx.beginPath(); ctx.arc(ptA.x, ptA.y, 3, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(ptB.x, ptB.y, 3, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

function _roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x, y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
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

  const allNames = _PSC.mode === 'select'
    ? [..._PSC.selected].filter(n => bodies[n])
    : Object.keys(bodies);

  if(!allNames.length){
    ctx.fillStyle = 'rgba(150,160,200,.45)';
    ctx.font = '13px "JetBrains Mono",monospace';
    ctx.textAlign = 'center';
    ctx.fillText(_PSC.mode === 'select' ? 'Select at least one body above.' : 'No bodies in system.', W/2, H/2);
    return;
  }

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

  // Label extent: rotated 45° text extends diagonally up-left from the baseline.
  // Longest label ≈ fontSize * name.length * 0.6 px. At 45° the vertical rise
  // equals the horizontal extent. Reserve enough padding so labels are never clipped.
  const maxLabelPx = Math.max(...layout.map(it => {
    const fontSize = Math.max(9, Math.min(12, it.displayR * 0.35 + 8));
    return (it.name.length * fontSize * 0.6 + 24) * Math.SQRT2; // diagonal length
  }));

  // Clamp pan so content stays reachable in both axes.
  // X: rightmost edge must not scroll fully off left; leftmost must not scroll off right.
  const minPanX = Math.min(0, W - totalW * _PSC.zoom);
  _PSC.panX = Math.min(0, Math.max(minPanX, _PSC.panX));
  // Y: allow scrolling up enough to reveal labels (they extend above baselineY)
  const contentH = (usableH + maxLabelPx) * _PSC.zoom;
  const minPanY = Math.min(0, H - contentH);
  _PSC.panY = Math.min(0, Math.max(minPanY, _PSC.panY));

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

  ctx.save();

  // ── Lighted circle: base color fill + rim shadow for spherical lighting ──
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(displayR, 1.5), 0, Math.PI*2);
  ctx.fillStyle = baseColor;
  ctx.fill();

  // Rim shadow to simulate lighting
  const rim = ctx.createRadialGradient(cx, cy, displayR*0.55, cx, cy, displayR);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,.60)');
  ctx.beginPath();
  ctx.arc(cx, cy, displayR, 0, Math.PI*2);
  ctx.fillStyle = rim;
  ctx.fill();

  // Specular highlight for extra depth
  if(displayR > 3){
    const hl = ctx.createRadialGradient(cx-displayR*0.3, cy-displayR*0.3, 0, cx, cy, displayR);
    hl.addColorStop(0, 'rgba(255,255,255,.18)');
    hl.addColorStop(0.5, 'rgba(255,255,255,.04)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(cx, cy, displayR, 0, Math.PI*2);
    ctx.fillStyle = hl;
    ctx.fill();
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

  // Resize observer — handles both size canvas and distance canvas
  const ro = new ResizeObserver(()=>{
    const par = cv.parentElement;
    cv.width = par.offsetWidth; cv.height = par.offsetHeight;
    _pscStarList = null;
    _pscScheduleDraw();
    // Also redraw distance canvas if visible
    if(_PSC.view === 'distance') _pscScheduleDistDraw();
  });
  ro.observe(cv.parentElement);

  // Distance canvas: no extra touch handling needed — wrapper div uses
  // overflow-y:auto / touch-action:pan-y so native scroll just works.
  // We do need a ResizeObserver to re-render when the wrapper resizes.
  const distCv = document.getElementById('psc-dist-canvas');
  if(distCv && distCv.parentElement){
    const roD = new ResizeObserver(() => {
      if(_PSC.view === 'distance') _pscScheduleDistDraw();
    });
    roD.observe(distCv.parentElement);
  }
}

// Expose init (called after DOM ready from modal onload-equivalent)
window._pscInitCanvasEvents = _pscInitCanvasEvents;


// ════════════════════════════════════════════════════════════════════════════
// ── BODY CONTEXT MENU (hold-click / long-press) ──────────────────────────
// ════════════════════════════════════════════════════════════════════════════

let _ctxMenu       = null;   // the DOM element (fetched on first use)
let _ctxMenuBody   = null;   // which body the menu is showing for
let _holdTimer     = null;   // setTimeout handle
let _holdMoved     = false;  // pointer moved too far during hold → cancel
let _holdFired     = false;  // hold completed and ctx menu opened — suppress next touchend tap
let _holdStartX    = 0;
let _holdStartY    = 0;
const HOLD_MS               = 400;   // hold duration (ms)
const HOLD_MAX_MOVE_TOUCH   = 20;    // px movement cancels hold

function _ctxEl(){ return _ctxMenu || (_ctxMenu = document.getElementById('body-ctx-menu')); }

function _hitBodyAt(clientX, clientY){
  const rect = vp.getBoundingClientRect();
  const mx = clientX - rect.left, my = clientY - rect.top;
  const sc2 = getSMAScale();
  const hits = [];
  Object.entries(bodyScreenPos).forEach(([name, sp]) => {
    const b = bodies[name];
    if(!b) return;
    const br = (b.data.BASE_DATA||{}).radius || 1;
    const iconR = (b.isCenter?18 : b.preset==='star'?14 : (b.preset==='gasgiant'||b.preset==='ringedgiant')?10 :
                  (b.preset==='planet'||b.preset==='marslike'||b.preset==='mercurylike')?7 : b.preset==='moon'?5:4) * iconScale;
    const r = Math.max(iconR, br * sc2 * vpZ, bodyTerrainPeakPx[name] || 0);
    const d = Math.hypot(mx - sp.x, my - sp.y);
    if(d < r + 14) hits.push({name, iconR, d});
  });
  hits.sort((a,b) => b.iconR - a.iconR || a.d - b.d);
  return hits.length ? hits[0].name : null;
}

function openBodyCtxMenu(bodyName, clientX, clientY){
  _updatePasteState();
  _ctxMenuBody = bodyName;
  const el = _ctxEl();
  document.getElementById('bctx-title').textContent = bodyName.toUpperCase();

  // Disable Cut and Group Select for the system centre
  const isCenter = !!(bodies[bodyName]?.isCenter);
  const cutBtn   = document.getElementById('bctx-cut');
  const grpBtn   = document.getElementById('bctx-group');
  const copyBtn  = document.getElementById('bctx-copy');
  if(cutBtn)  cutBtn.classList.toggle('disabled', isCenter);
  if(copyBtn) copyBtn.classList.toggle('disabled', isCenter);
  if(grpBtn)  grpBtn.classList.toggle('disabled', isCenter);

  // Position: keep inside viewport
  el.style.display = 'block';
  el.style.left = '0'; el.style.top = '0'; // reset for measurement
  requestAnimationFrame(() => {
    const W = el.offsetWidth, H = el.offsetHeight;
    const vW = window.innerWidth, vH = window.innerHeight;
    let x = clientX + 8, y = clientY + 8;
    if(x + W > vW - 8) x = clientX - W - 8;
    if(y + H > vH - 8) y = clientY - H - 8;
    if(x < 8) x = 8;
    if(y < 48) y = 48; // below topbar
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
  });
}

function closeBodyCtxMenu(){
  _ctxEl().style.display = 'none';
  _ctxMenuBody = null;
}

// Dismiss when clicking/tapping outside
function _dismissCtxIfOutside(target) {
  if(_ctxEl().style.display !== 'none' && !_ctxEl().contains(target)) closeBodyCtxMenu();
}
document.addEventListener('mousedown', e => _dismissCtxIfOutside(e.target), true);
document.addEventListener('touchstart', e => _dismissCtxIfOutside(e.target), { capture: true, passive: true });

// ── Hold-detect (mouse + touch) ───────────────────────────────────────────
function _startHold(clientX, clientY, isTouch) {
  _holdMoved  = false;
  _holdFired  = false;
  _holdStartX = clientX;
  _holdStartY = clientY;
  clearTimeout(_holdTimer);
  _holdTimer = setTimeout(() => {
    if(_holdMoved) return;
    const hit = _hitBodyAt(clientX, clientY);
    if(hit) {
      if(isTouch && navigator.vibrate) navigator.vibrate(40);
      _holdFired = true;
      openBodyCtxMenu(hit, clientX, clientY);
    }
  }, HOLD_MS);
}

function _cancelHold() {
  clearTimeout(_holdTimer);
}

// Mouse
vp.addEventListener('mousedown', e => {
  if(e.button !== 0) return;
  _startHold(e.clientX, e.clientY, false);
});
vp.addEventListener('mousemove', e => {
  if(Math.hypot(e.clientX - _holdStartX, e.clientY - _holdStartY) > HOLD_MAX_MOVE_TOUCH) {
    _holdMoved = true; _cancelHold();
  }
});
vp.addEventListener('mouseup', _cancelHold);

// Touch — piggyback on the existing touchstart/touchend (non-capture, after e.preventDefault)
// We attach with capture:false so the existing handler's e.preventDefault() doesn't affect us,
// and passive:true so we don't block scrolling.
vp.addEventListener('touchstart', e => {
  if(e.touches.length !== 1) { _cancelHold(); return; }
  const t = e.touches[0];
  _startHold(t.clientX, t.clientY, true);
}, { passive: true });

vp.addEventListener('touchmove', e => {
  if(e.touches.length !== 1) { _holdMoved = true; _cancelHold(); return; }
  const t = e.touches[0];
  if(Math.hypot(t.clientX - _holdStartX, t.clientY - _holdStartY) > HOLD_MAX_MOVE_TOUCH) {
    _holdMoved = true; _cancelHold();
  }
}, { passive: true });

vp.addEventListener('touchend',    _cancelHold, { passive: true });
vp.addEventListener('touchcancel', _cancelHold, { passive: true });

// ── Menu action functions ─────────────────────────────────────────────────
// ── Clipboard state ───────────────────────────────────────────────────────
// Array of { name, data, preset } — persists across cuts/copies
let _bodyClipboard = [];

function _clipboardAdd(name, removeFromSystem){
  if(!name || !bodies[name] || bodies[name].isCenter) return;
  const entry = {
    name,
    data:   JSON.parse(JSON.stringify(bodies[name].data)),
    preset: bodies[name].preset
  };
  // Avoid duplicates by name — replace if already in clipboard
  const idx = _bodyClipboard.findIndex(e => e.name === name);
  if(idx !== -1) _bodyClipboard.splice(idx, 1, entry);
  else _bodyClipboard.push(entry);

  if(removeFromSystem){
    pushUndo();
    delete bodies[name];
    if(typeof selectedBody !== 'undefined' && selectedBody === name){
      selectedBody = null;
      const sbSel = document.getElementById('sb-sel');
      if(sbSel) sbSel.textContent = '—';
    }
    if(typeof drawViewport === 'function') drawViewport();
    if(typeof updateStatusBar === 'function') updateStatusBar();
  }
  // Refresh clipboard tab badge
  _updateClipboardBadge();
}

function _updateClipboardBadge(){
  const tab = document.getElementById('prs-tab-clipboard');
  if(!tab) return;
  const n = _bodyClipboard.length;
  tab.textContent = n > 0 ? `📋 CLIPBOARD (${n})` : '📋 CLIPBOARD';
}

function bctxCut(){
  const name = _ctxMenuBody;
  closeBodyCtxMenu();
  if(!name || !bodies[name]) return;
  if(bodies[name].isCenter) return;
  _clipboardAdd(name, true);
}

function bctxCopy(){
  const name = _ctxMenuBody;
  closeBodyCtxMenu();
  if(!name || !bodies[name]) return;
  if(bodies[name].isCenter) return;
  _clipboardAdd(name, false);
}

// _updatePasteState kept as no-op for compatibility
function _updatePasteState(){}

// Keyboard shortcuts: Ctrl/Cmd + X / C
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if(!mod) return;
  if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) return;

  if(e.key === 'x' || e.key === 'X'){
    const name = _ctxMenuBody || (typeof selectedBody !== 'undefined' ? selectedBody : null);
    if(name && bodies[name] && !bodies[name].isCenter){
      _ctxMenuBody = name;
      e.preventDefault();
      bctxCut();
    }
  } else if(e.key === 'c' || e.key === 'C'){
    const name = _ctxMenuBody || (typeof selectedBody !== 'undefined' ? selectedBody : null);
    if(name && bodies[name] && !bodies[name].isCenter){
      _ctxMenuBody = name;
      e.preventDefault();
      bctxCopy();
    }
  }
});

function bctxGroupSelect(){
  const name = _ctxMenuBody;
  closeBodyCtxMenu();
  if(!name || !bodies[name]) return;
  if(bodies[name].isCenter) return; // cannot group-select the system centre
  enterGroupSelect(name);
}



// ════════════════════════════════════════════════════════════════════════════
// ── GROUP SELECT ──────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════

// Set of body names currently group-selected
let groupSelected = new Set();
let groupSelectMode = false;

function _gsPanel(){ return document.getElementById('group-sel-panel'); }

function enterGroupSelect(seedBody){
  // Don't activate if no system is loaded (viewport not active)
  if(!document.getElementById('viewport').classList.contains('active')) return;
  groupSelectMode = true;
  groupSelected   = new Set();
  if(seedBody) groupSelected.add(seedBody);
  // Force-close and lock out the main planet sidebar
  if(typeof selectedBody !== 'undefined'){
    selectedBody = null;
    const sbSel = document.getElementById('sb-sel');
    if(sbSel) sbSel.textContent = '—';
  }
  const mainSidebar = document.getElementById('sidebar');
  if(mainSidebar){ mainSidebar.classList.remove('open'); mainSidebar.classList.add('gs-locked'); }
  document.getElementById('statusbar').style.right = '0';
  setTimeout(resizeViewport, 360);
  _gsOpenPanel();
  drawViewport();
}

function exitGroupSelect(){
  groupSelectMode = false;
  groupSelected.clear();
  const mainSidebar = document.getElementById('sidebar');
  if(mainSidebar) mainSidebar.classList.remove('gs-locked');
  _gsClosePanel();
  drawViewport();
}

// ── Panel open / close ────────────────────────────────────────────────────

function _gsOpenPanel(){
  const p = _gsPanel();
  if(p) p.classList.add('open');
  // On mobile the statusbar always stays full-width (CSS override), so only
  // push it on desktop.
  const isMobile = window.matchMedia('(max-width:640px)').matches;
  if(!isMobile) document.getElementById('statusbar').style.right = '190px';
  setTimeout(resizeViewport, 360);
  _gsRebuildPanel();
}

function _gsClosePanel(){
  const p = _gsPanel();
  if(p) p.classList.remove('open');
  document.getElementById('statusbar').style.right = '0';
  setTimeout(resizeViewport, 360);
}

function _gsRebuildPanel(){
  const countEl = document.getElementById('gsp-count');
  if(countEl) countEl.textContent = groupSelected.size + ' selected';
}

// Toggle a body in/out of group selection (called on tap while in group mode)
function groupSelToggle(name){
  if(!groupSelectMode) return;
  if(bodies[name]?.isCenter) return; // centre can never be group-selected
  if(groupSelected.has(name)) groupSelected.delete(name);
  else groupSelected.add(name);
  _gsRebuildPanel();
  drawViewport();
}

// ── Operations ───────────────────────────────────────────────────────────

// Delete all group-selected bodies (plus their satellites)
function groupSelDeleteAll(){
  if(!groupSelected.size) return;
  const names = [...groupSelected];
  const toDelete = new Set();
  names.forEach(n => {
    toDelete.add(n);
    if(typeof getSatelliteNames === 'function'){
      getSatelliteNames(n).forEach(s => toDelete.add(s));
    }
  });
  const total = toDelete.size;
  if(!confirm(`Delete ${total} bod${total===1?'y':'ies'}?`)) return;
  pushUndo();
  toDelete.forEach(n => delete bodies[n]);
  exitGroupSelect();
  drawViewport();
  if(typeof updateStatusBar === 'function') updateStatusBar();
}

// Invert selection (all orbital bodies, not system center)
function groupSelInvert(){
  const all = Object.keys(bodies).filter(n => bodies[n].data.ORBIT_DATA);
  const newSel = new Set(all.filter(n => !groupSelected.has(n)));
  groupSelected = newSel;
  _gsRebuildPanel();
  drawViewport();
}

// Scale SMA of all selected bodies by a factor
function groupSelScaleSMA(){
  if(!groupSelected.size){ alert('No bodies selected.'); return; }
  const raw = prompt('Scale SMA — enter factor (e.g. 2) or percentage (e.g. 150%):');
  if(raw === null || raw.trim() === '') return;
  const factor = _gsParseFactorOrPct(raw);
  if(factor === null){ alert('Invalid value.'); return; }
  pushUndo();
  groupSelected.forEach(name => {
    const od = bodies[name]?.data?.ORBIT_DATA;
    if(od && od.semiMajorAxis != null){
      od.semiMajorAxis = Math.max(1000, od.semiMajorAxis * factor);
    }
  });
  drawViewport();
}

// Scale radii of all selected bodies by a factor
function groupSelScaleRadii(){
  if(!groupSelected.size){ alert('No bodies selected.'); return; }
  const raw = prompt('Scale Radii — enter factor (e.g. 0.5) or percentage (e.g. 75%):');
  if(raw === null || raw.trim() === '') return;
  const factor = _gsParseFactorOrPct(raw);
  if(factor === null){ alert('Invalid value.'); return; }
  pushUndo();
  groupSelected.forEach(name => {
    const bd = bodies[name]?.data?.BASE_DATA;
    if(bd && bd.radius != null){
      bd.radius = Math.max(100, bd.radius * factor);
    }
  });
  drawViewport();
}

// Jitter SMA: randomise each selected body's SMA by ±bound%
function groupSelJitterSMA(){
  if(!groupSelected.size){ alert('No bodies selected.'); return; }
  const raw = prompt('Jitter SMA — enter max percentage offset (e.g. 10 for ±10%):');
  if(raw === null || raw.trim() === '') return;
  const pct = parseFloat(raw.replace('%',''));
  if(isNaN(pct) || pct < 0){ alert('Invalid value.'); return; }
  pushUndo();
  const bound = pct / 100;
  groupSelected.forEach(name => {
    const od = bodies[name]?.data?.ORBIT_DATA;
    if(od && od.semiMajorAxis != null){
      const jitter = 1 + (Math.random() * 2 - 1) * bound;
      od.semiMajorAxis = Math.max(1000, od.semiMajorAxis * jitter);
    }
  });
  drawViewport();
}

// Jitter eccentricity: randomise each selected body's ecc by ±bound
function groupSelJitterEcc(){
  if(!groupSelected.size){ alert('No bodies selected.'); return; }
  const raw = prompt('Jitter Eccentricity — enter max absolute offset (e.g. 0.05 for ±0.05):');
  if(raw === null || raw.trim() === '') return;
  const bound = parseFloat(raw);
  if(isNaN(bound) || bound < 0){ alert('Invalid value.'); return; }
  pushUndo();
  groupSelected.forEach(name => {
    const od = bodies[name]?.data?.ORBIT_DATA;
    if(od != null){
      const cur = od.eccentricity || 0;
      const delta = (Math.random() * 2 - 1) * bound;
      od.eccentricity = Math.min(0.99, Math.max(0, cur + delta));
    }
  });
  drawViewport();
}

// Parse "2", "2x", "150%" → multiplicative factor; null on error
function _gsParseFactorOrPct(s){
  s = s.trim();
  if(s.endsWith('%')){
    const v = parseFloat(s);
    if(isNaN(v) || v <= 0) return null;
    return v / 100;
  }
  s = s.replace(/x$/i,'');
  const v = parseFloat(s);
  if(isNaN(v) || v <= 0) return null;
  return v;
}

// ── Intercept tap/click in group-select mode ──────────────────────────────
// We patch the existing click and touchend paths: when groupSelectMode is on,
// a normal tap toggles selection instead of opening the sidebar.

function _groupSelHandleTap(clientX, clientY){
  if(!groupSelectMode) return false;
  const hit = _hitBodyAt(clientX, clientY);
  if(hit){
    groupSelToggle(hit);
  } else {
    // Tapping empty space exits group select
    exitGroupSelect();
  }
  return true; // consumed
}


// ════════════════════════════════════════════════════════════════════════════
// ── GROUP-SELECT PINCH: SHRINK/GROW SMA OF SELECTED BODIES ───────────────
// The standard two-finger pinch zooms the viewport. In group-select mode,
// pinching while bodies are selected ALSO scales their semi-major axes.
// Both gestures happen simultaneously: viewport zoom + SMA scale.
// ════════════════════════════════════════════════════════════════════════════

// Last pinch scale factor (ratio between current and start dist) tracked
// per-gesture so we can apply the SMA delta each frame.
let _gsPinchStartSMAs = null;  // { bodyName: sma } snapshot at pinch start
let _gsPinchStartDist = null;

function _gsPinchStart(dist){
  if(!groupSelectMode || groupSelected.size === 0) return;
  // Snapshot current SMAs
  _gsPinchStartSMAs = {};
  _gsPinchStartDist = dist;
  groupSelected.forEach(name => {
    const od = bodies[name]?.data?.ORBIT_DATA;
    if(od) _gsPinchStartSMAs[name] = od.semiMajorAxis;
  });
}

function _gsPinchUpdate(dist){
  if(!_gsPinchStartSMAs || !_gsPinchStartDist) return;
  const ratio = dist / _gsPinchStartDist;
  // Apply to each selected body's SMA, clamped to reasonable range
  groupSelected.forEach(name => {
    const od = bodies[name]?.data?.ORBIT_DATA;
    if(od && _gsPinchStartSMAs[name] != null){
      od.semiMajorAxis = Math.max(1000, _gsPinchStartSMAs[name] * ratio);
    }
  });
  if(typeof liveSync === 'function' && typeof selectedBody !== 'undefined'){
    // Don't call liveSync (it reads sidebar) — just redraw
  }
  drawViewport();
}

function _gsPinchEnd(){
  if(_gsPinchStartSMAs){
    // Push undo after the gesture completes
    // (we already called pushUndo at pinch start if needed — do it on end for clean undo point)
  }
  _gsPinchStartSMAs = null;
  _gsPinchStartDist = null;
}


// ════════════════════════════════════════════════════════════════════════════
// ── GROUP DRAG ORBIT: move only root selected bodies ─────────────────────
// When dragOrbitMode is on AND groupSelectMode is on, dragging a selected
// body moves all "root" selected bodies (those whose parent is NOT in the
// selection set).  Satellites of selected bodies move automatically because
// their orbit parent is moving, so we do NOT also drag them.
// ════════════════════════════════════════════════════════════════════════════

// Returns the set of root bodies in the group selection:
// a body is a root if none of its ancestors (up to system center) are also selected.
function _groupSelRoots(){
  const roots = new Set();
  groupSelected.forEach(name => {
    let cur = name;
    let isRoot = true;
    // Walk up parent chain
    for(let depth = 0; depth < 20; depth++){
      const od = bodies[cur]?.data?.ORBIT_DATA;
      if(!od) break;
      const par = od.parent;
      if(!par) break;
      if(groupSelected.has(par)){ isRoot = false; break; }
      cur = par;
    }
    if(isRoot) roots.add(name);
  });
  return roots;
}

// Active group drag state
let _gdob_bodies   = [];   // array of { name, frozenSMA, frozenAOP, frozenParentSP, frozenScale, frozenVpZ }
let _gdob_active   = false;
let _gdob_dragBody = null; // the body the pointer is actually over (reference)

function _gdob_start(primaryBody, clientX, clientY){
  if(!groupSelectMode || groupSelected.size === 0) return false;
  if(!groupSelected.has(primaryBody)) return false;
  pushUndo();
  const roots = _groupSelRoots();
  _gdob_bodies = [];
  const rect = vp.getBoundingClientRect();
  const mx = clientX - rect.left, my = clientY - rect.top;
  roots.forEach(name => {
    const b = bodies[name];
    if(!b || b.isCenter) return;
    const od = b.data?.ORBIT_DATA;
    if(!od) return;
    const frozenScale    = getSMAScale();
    const frozenVpZ      = vpZ;
    const parentWP       = bodyWorldPos[od.parent] || {x:0,y:0};
    const frozenParentSP = worldToScreen(parentWP.x, parentWP.y);
    _gdob_bodies.push({
      name,
      frozenSMA:      od.semiMajorAxis,
      frozenAOP:      od.argumentOfPeriapsis,
      frozenScale,
      frozenVpZ,
      frozenParentSP
    });
  });
  _gdob_active   = true;
  _gdob_dragBody = primaryBody;
  return true;
}

function _gdob_move(clientX, clientY){
  if(!_gdob_active) return;
  const rect = vp.getBoundingClientRect();
  const canvasX = clientX - rect.left;
  const canvasY = clientY - rect.top;

  _gdob_bodies.forEach(entry => {
    const b  = bodies[entry.name];
    if(!b) return;
    const od = b.data?.ORBIT_DATA;
    if(!od) return;

    // Use each body's own frozen parent screen pos
    const dx_px = canvasX - entry.frozenParentSP.x;
    const dy_px = canvasY - entry.frozenParentSP.y;
    const dist_px = Math.hypot(dx_px, dy_px);
    if(dist_px < 0.5) return;
    const dist_m = dist_px / entry.frozenVpZ / entry.frozenScale;
    const ecc    = od.eccentricity || 0;
    const c_m    = dist_m;  // treat drag radius as SMA (simplified — same as single drag)
    const newSMA = Math.max(1000, dist_m / (1 - ecc)); // periapsis distance = SMA*(1-ecc)
    const newAOP = Math.atan2(-dy_px, dx_px) * (180 / Math.PI);
    od.semiMajorAxis       = newSMA;
    od.argumentOfPeriapsis = ((newAOP % 360) + 360) % 360;
  });
  drawViewport();
}

function _gdob_end(){
  _gdob_active   = false;
  _gdob_bodies   = [];
  _gdob_dragBody = null;
  _cachedSMAScale = null;
  drawViewport();
}
