// ════════════════════════════════ CANVAS / KEPLERIAN RENDERER ════════════════════════════════
const vp = document.getElementById('viewport');
const ctx2 = vp.getContext('2d');
let vpOffX = 0, vpOffY = 0, vpZ = 1;
let iconScale = parseFloat(localStorage.getItem('sfs_icon_scale') || '0.75');

function setIconScale(v){
  iconScale = Math.max(0.3, Math.min(1.5, v));
  localStorage.setItem('sfs_icon_scale', iconScale);
  const sl = document.getElementById('icon-scale-slider');
  if(sl) sl.value = iconScale;
  const lbl = document.getElementById('icon-scale-val');
  if(lbl) lbl.textContent = Math.round(iconScale * 100) + '%';
  drawViewport();
}
let bodyWorldPos = {};  // populated each drawViewport(); read by zoomToBody()
let viewDifficulty = 'normal'; // 'normal' | 'hard' | 'realistic'
// Data files use Title Case keys ('Normal','Hard','Realistic') — compute once on change
let viewDiffKey = 'Normal'; // Title-case version used for smaDifficultyScale / radiusDifficultyScale lookups
let dragging = false, dragSX, dragSY;
const BODY_PX = { star:28, planet:16, gasgiant:22, ringedgiant:22, marslike:14, mercurylike:12, moon:11, asteroid:7, blackhole:18, barycentre:5 };

// Draw a high-sided polygon approximating a circle — avoids the per-frame bezier
// tessellation cost of ctx.arc() when the radius is large on screen.
function polygonCircle(ctx, cx, cy, r, sides){
  const step = (Math.PI * 2) / sides;
  ctx.moveTo(cx + r, cy);
  for(let i = 1; i <= sides; i++) ctx.lineTo(cx + r * Math.cos(step * i), cy + r * Math.sin(step * i));
}

// SMA scale: map the largest SMA to ~38% of the viewport half-width in pixels
const SMA_SCALE_TARGET = 0.38;
let _cachedSMAScale = null; // invalidated at start of _drawViewportNow each frame
function getSMAScale(){
  if(_cachedSMAScale !== null) return _cachedSMAScale;
  const names = Object.keys(bodies);
  let maxSMA = 0;
  names.forEach(n=>{
    const od = bodies[n].data.ORBIT_DATA;
    if(od && effectiveSMA(od) > maxSMA) maxSMA = effectiveSMA(od);
  });
  const halfW = (vp.width || window.innerWidth) / 2;
  let result;
  if(maxSMA === 0){
    const centerName = names.find(n => bodies[n].isCenter);
    const centerR = centerName ? ((bodies[centerName].data.BASE_DATA||{}).radius || 1) : 1;
    result = 20 / centerR;
  } else {
    result = (halfW * SMA_SCALE_TARGET) / maxSMA;
  }
  _cachedSMAScale = result;
  return result;
}

// Convert SMA (metres) → pixels given current scale
function smaToPixels(sma){ return sma * getSMAScale(); }

// Returns SMA scaled by smaDifficultyScale for the current viewDifficulty.
function effectiveSMA(od){
  if(!od) return 0;
  const scale = od.smaDifficultyScale;
  const mult = (scale && scale[viewDiffKey] != null) ? scale[viewDiffKey] : 1;
  return od.semiMajorAxis * mult;
}

// Mirrors Difficulty.RadiusScale() — defaultPlanetScales: Normal=1, Hard=2, Realistic=20
const _DEF_RADIUS_SCALE = { normal: 1.0, hard: 2.0, realistic: 20.0 };
function getRadiusDifficultyMult(bd){
  if(!bd) return 1;
  const s = bd.radiusDifficultyScale;
  if(s && s[viewDiffKey] != null) return s[viewDiffKey];
  return _DEF_RADIUS_SCALE[viewDifficulty] ?? 1;
}

// Mirrors Difficulty.AtmosphereScale():
//   1. Try atmospherePhysics.heightDifficultyScale[difficulty]
//   2. Try atmosphereVisuals.GRADIENT.heightDifficultyScale[difficulty]
//   3. DefaultAtmoHeightScale: Normal=1.0, Hard=1.6667, Realistic=3.3333
const _DEF_ATMO_SCALE = { normal: 1.0, hard: 1.6666667, realistic: 3.3333333 };
function getAtmoDifficultyMult(bd){
  if(!bd) return 1;
  const physScale = bd.ATMOSPHERE_PHYSICS_DATA?.heightDifficultyScale;
  if(physScale && physScale[viewDiffKey] != null) return physScale[viewDiffKey];
  const gradScale = bd.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.heightDifficultyScale;
  if(gradScale && gradScale[viewDiffKey] != null) return gradScale[viewDiffKey];
  return _DEF_ATMO_SCALE[viewDifficulty] ?? 1;
}

function cycleDifficulty(){
  const order = ['normal','hard','realistic'];
  viewDifficulty = order[(order.indexOf(viewDifficulty) + 1) % order.length];
  viewDiffKey = viewDifficulty.charAt(0).toUpperCase() + viewDifficulty.slice(1); // 'Normal'|'Hard'|'Realistic'
  const labels = { normal:'⚖ NORMAL', hard:'⚔ HARD', realistic:'🌍 REALISTIC' };
  const btn = document.getElementById('btn-difficulty');
  if(btn) btn.textContent = labels[viewDifficulty];
  // Invalidate all cached gradient stops — they depend on difficulty (atmo, ring fades)
  if(drawViewport._atmoStopCache) drawViewport._atmoStopCache = {};
  if(drawViewport._ringStopCache) drawViewport._ringStopCache = {};
  drawViewport();
}

// Keplerian: given SMA(px), ecc, argPeriapsis, return {cx,cy,rx,ry,angle, bodyX, bodyY}
// In SFS, argument of periapsis rotates the ellipse. Body is placed at periapsis (true anomaly=0).
function orbitGeometry(smaPx, ecc, aopDeg, parentCX, parentCY){
  const aop = aopDeg * Math.PI / 180;
  const rx = smaPx;                   // semi-major
  const ry = smaPx * Math.sqrt(1 - ecc*ecc);  // semi-minor
  const c  = smaPx * ecc;             // focus offset along major axis
  // SFS is Y-up; canvas is Y-down — negate all sin/Y terms so AOP matches in-game
  const ellCX = parentCX - c *  Math.cos(aop);
  const ellCY = parentCY + c *  Math.sin(aop); // +sin = flip Y
  const bodyX = parentCX + (smaPx - c) *  Math.cos(aop);
  const bodyY = parentCY - (smaPx - c) *  Math.sin(aop); // -sin = flip Y
  return { ellCX, ellCY, rx, ry, angle: -aop, bodyX, bodyY }; // -aop flips ellipse rotation too
}

function resizeViewport(){
  const isMobile = window.innerWidth <= 640;
  const topH  = isMobile ? 52 : 48;
  const botH  = isMobile ? 44 : 28;
  const w = window.innerWidth;
  const h = window.innerHeight - topH - botH;
  if(w > 0 && h > 0){ vp.width = w; vp.height = h; }
  drawViewport();
}

function worldToScreen(wx, wy){
  return {
    x: (wx + vpOffX) * vpZ + vp.width/2,
    y: (wy + vpOffY) * vpZ + vp.height/2
  };
}

function screenToWorld(sx, sy){
  return {
    x: (sx - vp.width/2) / vpZ - vpOffX,
    y: (sy - vp.height/2) / vpZ - vpOffY
  };
}

// Module-level visibility map — updated each drawViewport call, used by click handler
let bodyVisible = {};

// Store computed screen positions and visibility for hit-testing
let bodyScreenPos = {};
let bodyVisibleMap = {};
let showFrontClouds = true; // legacy alias — kept for draw code gate
let dbgFogOpacity = 1.0;   // kept for any legacy references (unused by new system)

// ── Environment render flags ──
const envFlags = {
  soi:       true,
  atmo:      true,
  clouds:    true,
  fclouds:   true,
  fog:       true,
  water:     true,
  surface:   true,
  physAtmo:  false,
  postProc:  false,
  heightmaps: false,
};

function toggleEnvFlag(key){
  envFlags[key] = !envFlags[key];
  // Keep legacy alias in sync
  if(key === 'fclouds') showFrontClouds = envFlags.fclouds;
  // Remove GPU tint filter from canvas when post-proc is turned off
  if(key === 'postProc' && !envFlags.postProc) _clearPostProcessingFilter();
  // Invalidate clip path cache when heightmaps toggled so the smooth/terrain
  // disc is redrawn correctly on the next frame
  if(key === 'heightmaps') invalidateTerrainCache('*');
  _syncEnvButtons();
  drawViewport();
}

function _syncEnvButtons(){
  for(const key of Object.keys(envFlags)){
    const btn = document.getElementById('env-btn-' + key);
    if(!btn) continue;
    if(btn.classList.contains('tog')){
      btn.classList.toggle('on', !!envFlags[key]);
    } else {
      const flag = key === 'postProc' ? !envFlags[key] : envFlags[key];
      btn.classList.toggle('env-off', !flag);
    }
  }
}

let _envDropOpen = false;
function toggleEnvDropdown(){
  _envDropOpen = !_envDropOpen;
  const dd = document.getElementById('env-dropdown');
  if(_envDropOpen){
    const btn = document.getElementById('btn-env');
    const r = btn.getBoundingClientRect();
    dd.style.top  = (r.bottom + 6) + 'px';
    dd.style.right = (window.innerWidth - r.right) + 'px';
    dd.style.left  = 'auto';
  }
  dd.style.display = _envDropOpen ? 'block' : 'none';
}

// Legacy stubs — referenced by any surviving onclick attrs
function toggleFrontClouds(){ toggleEnvFlag('fclouds'); }
function toggleSOI(){ toggleEnvFlag('soi'); }

// ── SOI calculation (mirrors SFS game logic) ──
// Formula: SOI = effectiveSMA × (mass_body / mass_parent)^0.4 × multiplierSOI
// effectiveSMA = rawSMA × smaDifficultyScale[difficulty]  (Title Case keys, now fixed)
// If no per-body smaDifficultyScale, effectiveSMA = rawSMA (scale=1 on Normal).
// multiplierSOI is the raw value from ORBIT_DATA — no additional scaling.
function computeSOI_m(name){
  const b = bodies[name];
  const od = b?.data?.ORBIT_DATA;
  if(!od || !od.parent) return null;
  const parent = bodies[od.parent];
  if(!parent) return null;

  const bd  = b.data.BASE_DATA   || {};
  const pbd = parent.data.BASE_DATA || {};

  // Barycenters have gravity=0.0 in the JSON which breaks SOI math.
  // Use a small surrogate value (5.0) so the Hill sphere is still computable.
  const mass_b = ((bd.gravity  || 0) || 5) * Math.pow(bd.radius  || 1, 2);
  const mass_p = ((pbd.gravity || 0) || 5) * Math.pow(pbd.radius || 1, 2);
  if(mass_b <= 0 || mass_p <= 0) return null;

  const sma_eff = effectiveSMA(od);
  if(sma_eff <= 0) return null;

  const soiMult = od.multiplierSOI ?? 1.0;
  const rawSOI  = sma_eff * Math.pow(mass_b / mass_p, 0.4) * soiMult;

  // Apply soiDifficultyScale (game multiplies final SOI by this per-difficulty factor)
  const sds      = od.soiDifficultyScale || {};
  const soiScale = (sds[viewDiffKey] != null) ? sds[viewDiffKey] : 1.0;
  return rawSOI * soiScale;
}

function _fmtSOI_m(m){
  if(m === null || m === undefined || !isFinite(m)) return null;
  if(m >= 1e9)  return (m/1e9).toFixed(2) + ' Gm';
  if(m >= 1e6)  return (m/1e6).toFixed(2) + ' Mm';
  if(m >= 1e3)  return (m/1e3).toFixed(1) + ' km';
  return m.toFixed(0) + ' m';
}

function updateSOIDisplay(){
  const el = document.getElementById('or-soi-radius');
  if(!el) return;
  if(!selectedBody || !bodies[selectedBody]){el.textContent=''; return;}
  // System centre has no ORBIT_DATA → infinite SOI, skip display
  const od = bodies[selectedBody]?.data?.ORBIT_DATA;
  if(!od || !od.parent){el.textContent=''; return;}
  // Temporarily patch the live multiplier value into the data so computeSOI_m sees it
  const inputVal = parseFloat(document.getElementById('or-soi')?.value);
  const prev = od.multiplierSOI;
  if(!isNaN(inputVal)) od.multiplierSOI = inputVal;
  const soi_m = computeSOI_m(selectedBody);
  od.multiplierSOI = prev; // restore
  const fmt = _fmtSOI_m(soi_m);
  el.textContent = fmt ? '= ' + fmt : '';
}

// Throttle drawViewport to one RAF per call — prevents stacking on rapid scroll/zoom
let _drawPending = false;
function drawViewport(){
  if(_drawPending) return;
  _drawPending = true;
  requestAnimationFrame(() => { _drawPending = false; _drawViewportNow(); });
}
// ── Post-processing helpers (mirrors SFS PostProcessingModule.Evaluate + SetAmbient) ──
function _lerpPPKey(a, b, t){
  const L = (x,y) => x + (y-x)*t;
  return { height:L(a.height,b.height), shadowIntensity:L(a.shadowIntensity,b.shadowIntensity),
    starIntensity:L(a.starIntensity,b.starIntensity), hueShift:L(a.hueShift,b.hueShift),
    saturation:L(a.saturation,b.saturation), contrast:L(a.contrast,b.contrast),
    red:L(a.red,b.red), green:L(a.green,b.green), blue:L(a.blue,b.blue) };
}
function getPostProcessKey(bodyData, altM){
  const keys = bodyData?.POST_PROCESSING?.keys;
  if(!keys || keys.length === 0) return null;
  if(altM <= keys[0].height) return keys[0];
  if(altM >= keys[keys.length-1].height) return keys[keys.length-1];
  for(let i=0;i<keys.length-1;i++){
    if(altM < keys[i+1].height){
      const t = (altM - keys[i].height) / (keys[i+1].height - keys[i].height);
      return _lerpPPKey(keys[i], keys[i+1], t);
    }
  }
  return keys[keys.length-1];
}
// Offscreen canvas reused for the CSS-filter pass only
let _ppOffscreen = null;
// Brightness boost factor applied on top of the SFS post-processing values.
const PP_BRIGHTNESS_BOOST = 1.0;

// SVG filter injected into <defs> for GPU-side colour matrix (tint + brightness).
// Re-created only when the matrix values change.
let _ppSvgFilter = null;
let _ppSvgFilterKey = '';
function _ensureSvgFilter(filterId, mr, mg, mb, brightness){
  const key = `${mr.toFixed(4)},${mg.toFixed(4)},${mb.toFixed(4)},${brightness.toFixed(4)}`;
  if(key === _ppSvgFilterKey && _ppSvgFilter) return;
  _ppSvgFilterKey = key;
  if(_ppSvgFilter) _ppSvgFilter.remove();
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('style','position:absolute;width:0;height:0;overflow:hidden');
  svg.setAttribute('aria-hidden','true');
  const defs = document.createElementNS(ns, 'defs');
  const filter = document.createElementNS(ns, 'filter');
  filter.setAttribute('id', filterId);
  filter.setAttribute('color-interpolation-filters','sRGB');
  const fe = document.createElementNS(ns, 'feColorMatrix');
  fe.setAttribute('type','matrix');
  // feColorMatrix row format: R G B A offset
  // Apply per-channel multiply (tint) and brightness in one matrix.
  const br = brightness * mr, bg = brightness * mg, bb = brightness * mb;
  fe.setAttribute('values',
    `${br} 0 0 0 0  ` +
    `0 ${bg} 0 0 0  ` +
    `0 0 ${bb} 0 0  ` +
    `0 0 0 1 0`);
  filter.appendChild(fe);
  defs.appendChild(filter);
  svg.appendChild(defs);
  document.body.appendChild(svg);
  _ppSvgFilter = svg;
}

function _applyPostProcessingOverlay(ctx, w, h, key){
  if(!key) return;
  const hueRot = key.hueShift || 0;
  const sat    = key.saturation ?? 1;
  const con    = key.contrast   ?? 1;
  const r = key.red ?? 1, g = key.green ?? 1, b = key.blue ?? 1;
  const luma = 0.3*r + 0.59*g + 0.11*b || 1;
  const _mr0 = r/luma, _mg0 = g/luma, _mb0 = b/luma;
  const _mmax = Math.max(_mr0, _mg0, _mb0, 1);
  const mr = _mr0/_mmax, mg = _mg0/_mmax, mb = _mb0/_mmax;

  const filterNeeded = Math.abs(hueRot) > 0.1 || Math.abs(sat-1) > 0.005 || Math.abs(con-1) > 0.005;
  const tintNeeded   = Math.abs(mr-1) > 0.005 || Math.abs(mg-1) > 0.005 || Math.abs(mb-1) > 0.005;

  // ── Pass 1 (CPU): hue-rotate + saturate + contrast via CSS filter on offscreen ──
  // Only runs when these values are non-trivial.
  if(filterNeeded){
    if(!_ppOffscreen) _ppOffscreen = document.createElement('canvas');
    if(_ppOffscreen.width !== w || _ppOffscreen.height !== h){
      _ppOffscreen.width = w; _ppOffscreen.height = h;
    }
    const oc = _ppOffscreen.getContext('2d');
    oc.clearRect(0, 0, w, h);
    oc.filter = `hue-rotate(${hueRot}deg) saturate(${sat}) contrast(${con})`;
    oc.drawImage(ctx.canvas, 0, 0);
    oc.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(_ppOffscreen, 0, 0);
  }

  // ── Pass 2 (GPU): tint × brightness via SVG feColorMatrix on the canvas element ──
  // This replaces the getImageData pixel loop entirely — runs on the GPU, zero CPU cost.
  // The filter is injected into the DOM once and reused every frame until values change.
  const FILTER_ID = '_sfs_pp_tint';
  _ensureSvgFilter(FILTER_ID, mr, mg, mb, PP_BRIGHTNESS_BOOST);
  ctx.canvas.style.filter = `url(#${FILTER_ID})`;
}

// Called when post-proc is disabled to remove the canvas filter
function _clearPostProcessingFilter(){
  if(vp) vp.style.filter = '';
}
function _drawViewportNow(){
  // Per-frame terrain clip path cache — cleared each frame so stale Path2D
  // objects from previous zoom/pan positions don't leak across frames.
  for (const k of Object.keys(_terrainClipCache)) delete _terrainClipCache[k];
  // Self-heal: if canvas has no size, set it now
  if(!vp.width || !vp.height){
    vp.width  = window.innerWidth;
    vp.height = Math.max(100, window.innerHeight - 76);
  }
  // Always clear the PP CSS filter at frame start — it is re-applied below only if active.
  // This prevents stale filters persisting across frames when PP is toggled or no body found.
  vp.style.filter = '';
  _cachedSMAScale = null; // invalidate per-frame cache
  ctx2.clearRect(0, 0, vp.width, vp.height);

  const names = Object.keys(bodies);
  if(names.length === 0) return;

  // ── STEP 1: compute all world positions (centre = origin) ──
  // Multi-pass so moons (children of planets) resolve correctly
  // Reset the module-level position map for this frame
  Object.keys(bodyWorldPos).forEach(k => delete bodyWorldPos[k]);
  // Seed center at origin; bodies with no orbit data also sit at origin
  names.forEach(n => { if(bodies[n].isCenter || !bodies[n].data.ORBIT_DATA) bodyWorldPos[n] = {x:0, y:0}; });
  // Also seed any parent name that's referenced but not in bodies (e.g. 'Sun' fallback)
  names.forEach(n => {
    const par = bodies[n].data.ORBIT_DATA?.parent;
    if(par && !bodies[par]) bodyWorldPos[par] = {x:0, y:0};
  });

  // Up to 5 passes to resolve nested parents
  for(let pass=0; pass<5; pass++){
    names.forEach(name => {
      if(bodyWorldPos[name]) return;
      const od = bodies[name].data.ORBIT_DATA;
      if(!od) return;
      const parentPos = bodyWorldPos[od.parent];
      if(!parentPos) return; // parent not yet resolved
      const smaPx = smaToPixels(effectiveSMA(od));
      const ecc = Math.min(od.eccentricity||0, 0.999);
      const aop = od.argumentOfPeriapsis||0;
      const g = orbitGeometry(smaPx, ecc, aop, parentPos.x, parentPos.y);
      bodyWorldPos[name] = {x: g.bodyX, y: g.bodyY};
    });
  }

  // ── STEP 3: compute LOD visibility/fade, then draw bodies ──
  // Every orbiting body fades based on its OWN screen-orbit size.
  // Tiny orbit on screen = too crowded to show = fade out.
  // Center body is always fully visible.
  // Selected body is always fully visible.
  //
  // Thresholds (screen pixels of the body's own SMA):
  //   < BODY_FADE_MIN  → invisible
  //   > BODY_FADE_MAX  → fully visible
  //   label fades in even later (at 2× BODY_FADE_MAX)

  const BODY_FADE_MIN = 20;   // own orbit px: below this body is hidden
  const BODY_FADE_MAX = 60;   // own orbit px: above this body is fully visible

  const bodyVisible  = {};
  const bodyFadeVal  = {};
  const labelFadeVal = {};

  names.forEach(name => {
    const b = bodies[name];
    const od = b.data.ORBIT_DATA;

    // Center: always fully visible
    if(b.isCenter || !od){
      bodyVisible[name]=true; bodyFadeVal[name]=1; labelFadeVal[name]=1; return;
    }

    // Own orbit in screen pixels
    const ownSMApx = smaToPixels(effectiveSMA(od)) * vpZ;

    const f  = Math.max(0, Math.min(1, (ownSMApx - BODY_FADE_MIN) / (BODY_FADE_MAX - BODY_FADE_MIN)));
    const lf = Math.max(0, Math.min(1, (ownSMApx - BODY_FADE_MAX) / BODY_FADE_MAX));

    bodyVisible[name]  = f > 0;
    bodyFadeVal[name]  = f;
    labelFadeVal[name] = lf;

    // Selected body always fully shown
    if(selectedBody === name){ bodyVisible[name]=true; bodyFadeVal[name]=1; labelFadeVal[name]=1; }
  });

  bodyVisibleMap = bodyVisible;

  // ── STEP 2: draw orbit ellipses ──
  const W = vp.width, H = vp.height;
  const diagPx = Math.hypot(W, H);
  // Pre-parse body colours once (cached per body color string, not per frame)
  if(!drawViewport._orbitRGBCache) drawViewport._orbitRGBCache = {};
  const orbitRGB = {};
  {
    // Only create the temp canvas when there's a cache miss
    let tmp = null, tc = null;
    names.forEach(name => {
      const colorStr = bodies[name].color.split(',')[0].trim();
      if(!drawViewport._orbitRGBCache[colorStr]){
        if(!tmp){ tmp = document.createElement('canvas'); tmp.width=1; tmp.height=1; tc = tmp.getContext('2d'); }
        tc.clearRect(0,0,1,1); tc.fillStyle = colorStr; tc.fillRect(0,0,1,1);
        const d = tc.getImageData(0,0,1,1).data;
        drawViewport._orbitRGBCache[colorStr] = [d[0], d[1], d[2]];
      }
      orbitRGB[name] = drawViewport._orbitRGBCache[colorStr];
    });
  }

  // Additive compositing — overlapping orbits brighten naturally
  ctx2.save();
  ctx2.globalCompositeOperation = 'lighter';

  names.forEach(name => {
    const b = bodies[name];
    const od = b.data.ORBIT_DATA;
    if(!od || b.isCenter) return;
    if((od.direction ?? 1) === 0) return; // stationary — no orbit ellipse
    const fade = bodyFadeVal[name] ?? 1;
    if(fade === 0 && selectedBody !== name) return;

    const smaPx = smaToPixels(effectiveSMA(od));
    const rxS = smaPx * vpZ;
    if(rxS < 0.5) return; // sub-pixel — skip

    const ecc = Math.min(od.eccentricity||0, 0.999);
    const aop = od.argumentOfPeriapsis||0;
    const parentPos = bodyWorldPos[od.parent] || {x:0,y:0};
    const g = orbitGeometry(smaPx, ecc, aop, parentPos.x, parentPos.y);
    const sc = worldToScreen(g.ellCX, g.ellCY);
    const ryS = g.ry * vpZ;

    // Off-screen cull: ellipse bounding box vs viewport (with margin)
    const margin = 4;
    if(sc.x + rxS < -margin || sc.x - rxS > W + margin ||
       sc.y + ryS < -margin || sc.y - ryS > H + margin) return;

    const isSelected = selectedBody === name;
    const [cr,cg,cb] = orbitRGB[name];
    const alpha = isSelected ? Math.min(1, 0.8 * fade) : Math.min(1, 0.22 * fade);

    ctx2.save();
    ctx2.strokeStyle = `rgba(${cr},${cg},${cb},${alpha})`;
    ctx2.lineWidth = isSelected ? 2 : 1;
    ctx2.beginPath();

    if(rxS > diagPx * 0.5) {
      // Zoomed in: ellipse is larger than viewport.
      // ctx2.ellipse() on a giant arc is slow because the browser bezier-approximates
      // the full curve. Instead: manually tessellate ONLY the visible arc window.

      // Direction from ellipse centre toward viewport centre, in ellipse-local space
      const cosRot = Math.cos(-g.angle), sinRot = Math.sin(-g.angle);
      const toVX = W * 0.5 - sc.x;
      const toVY = H * 0.5 - sc.y;
      const lx = toVX * cosRot - toVY * sinRot;
      const ly = toVX * sinRot + toVY * cosRot;
      // Parametric angle pointing toward viewport centre
      const baseAngle = Math.atan2(ly / (ryS || 1), lx / (rxS || 1));
      // Half-angle of arc to draw: enough to cover the screen plus 20% margin
      const halfAngle = Math.min(Math.PI, (diagPx * 2.4) / Math.max(rxS, ryS));

      const startA = baseAngle - halfAngle;
      const endA   = baseAngle + halfAngle;
      const segs   = 48; // fixed cost regardless of zoom
      const step   = (endA - startA) / segs;
      const cosG = Math.cos(g.angle), sinG = Math.sin(g.angle);
      for(let i = 0; i <= segs; i++){
        const t  = startA + i * step;
        const ex = rxS * Math.cos(t);
        const ey = ryS * Math.sin(t);
        const sx = sc.x + ex * cosG - ey * sinG;
        const sy = sc.y + ex * sinG + ey * cosG;
        i === 0 ? ctx2.moveTo(sx, sy) : ctx2.lineTo(sx, sy);
      }
    } else {
      // Small enough — native ellipse is fast and smooth
      ctx2.translate(sc.x, sc.y);
      ctx2.rotate(g.angle);
      ctx2.ellipse(0, 0, rxS, ryS, 0, 0, Math.PI * 2);
    }

    ctx2.stroke();
    ctx2.restore();
  });

  ctx2.restore(); // end lighter composite


  const centerName2 = names.find(n => bodies[n].isCenter);
  const centerR_m = centerName2 ? ((bodies[centerName2].data.BASE_DATA||{}).radius || 1) : 1;
  const CENTER_PX = BODY_PX['star'];

  bodyScreenPos = {};
  names.forEach(name => {
    const b = bodies[name];
    const wp = bodyWorldPos[name] || {x:0, y:0};
    const sp = worldToScreen(wp.x, wp.y);
    bodyScreenPos[name] = sp; // always store for hit-test even if not drawn

    if(!bodyVisible[name]){ 
      if(!_sfsDbgLogged['cull_'+name]){ _sfsDbgLogged['cull_'+name]=true; console.log(`[SFS|CULL] "${name}" hidden by LOD ownSMApx too small`); }
      return; // LOD cull
    }

    const bodyRadius_m = (b.data.BASE_DATA||{}).radius || 1;

    // Fixed icon sizes — always the same pixel size regardless of zoom.
    // physR_px grows as you zoom in; once it exceeds the icon, the icon takes over.
    // This way bodies are always visible at any zoom level.
    const iconR = (b.isCenter ? 18
                : b.preset === 'star'         ? 14
                : b.preset === 'blackhole'    ? 12
                : (b.preset === 'gasgiant' || b.preset === 'ringedgiant') ? 10
                : (b.preset === 'planet' || b.preset === 'marslike' || b.preset === 'mercurylike') ? 7
                : b.preset === 'moon'         ? 5
                : b.preset === 'barycentre'   ? 4
                : 4) * iconScale; // asteroid

    // Physical radius in screen pixels at current zoom.
    // Apply radiusDifficultyScale so the body disc scales correctly relative to
    // orbital distances — matches game's ScalePlanetData(basics.radius *= radiusScale).
    const scale = getSMAScale();
    const radiusMult = getRadiusDifficultyMult(b.data.BASE_DATA);
    const physR_px = bodyRadius_m * radiusMult * scale * vpZ;

    // Use whichever is larger: icon floor or physical size. No viewport cap —
    // removing it lets the planet fill and exceed the screen when zoomed in,
    // and keeps atmosphere/clouds proportional at all zoom levels.
    const r = Math.max(iconR, physR_px);

    // Screen-space cull: use atmosphere outer radius so atmo doesn't flicker
    // when the planet disc goes off-screen but the halo is still visible.
    // Also extend for rings — physR_px * (endRadius/bodyRadius) is the physical ring outer extent.
    let _cullR = r;
    if(b.data.ATMOSPHERE_PHYSICS_DATA && b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT){
      const _GRD = b.data.ATMOSPHERE_VISUALS_DATA.GRADIENT;
      const _outerM = (b.data.ATMOSPHERE_PHYSICS_DATA.height || 0) +
                      (_GRD.positionZ || 0) + (_GRD.height || 0);
      if(_outerM > 0) _cullR = Math.max(r, r * (bodyRadius_m + _outerM) / bodyRadius_m);
    }
    if(b.data.RINGS_DATA && b.data.RINGS_DATA.endRadius){
      // Use r (display-clamped radius) times the ring ratio for cull — safe and bounded
      const _ringRatio = b.data.RINGS_DATA.endRadius / ((b.data.BASE_DATA||{}).radius || 1);
      _cullR = Math.max(_cullR, r * _ringRatio);
    }
    if(sp.x + _cullR < 0 || sp.x - _cullR > W || sp.y + _cullR < 0 || sp.y - _cullR > H) return;

    const bodyFadeA  = bodyFadeVal[name]  ?? 1;
    const labelFadeA = labelFadeVal[name] ?? 1;
    const [c1, c2] = b.color.split(',');

    ctx2.save();
    ctx2.globalAlpha = bodyFadeA;

    // ── Barycentre: just a small cross marker ──
    if(b.preset === 'barycentre'){
      ctx2.strokeStyle = 'rgba(180,180,255,0.5)';
      ctx2.lineWidth = 1;
      ctx2.beginPath(); ctx2.moveTo(sp.x-6,sp.y); ctx2.lineTo(sp.x+6,sp.y); ctx2.stroke();
      ctx2.beginPath(); ctx2.moveTo(sp.x,sp.y-6); ctx2.lineTo(sp.x,sp.y+6); ctx2.stroke();
      ctx2.beginPath(); ctx2.arc(sp.x,sp.y,4,0,Math.PI*2);
      ctx2.strokeStyle='rgba(180,180,255,0.35)'; ctx2.stroke();
      if(selectedBody===name){ ctx2.beginPath(); polygonCircle(ctx2,sp.x,sp.y,10,64); ctx2.closePath(); ctx2.strokeStyle='rgba(80,180,255,0.75)'; ctx2.lineWidth=1.5; ctx2.setLineDash([3,3]); ctx2.stroke(); ctx2.setLineDash([]); }
      ctx2.fillStyle='rgba(150,200,240,0.7)'; ctx2.font='9px "JetBrains Mono",monospace'; ctx2.textAlign='center';
      ctx2.fillText(name, sp.x, sp.y+18);
      ctx2.restore(); // must restore before early return
      return;
    }

    // ── Star / black hole glow ──
    // Glow fades when either a cloud band or front-cloud disc renders over the body
    const hasCloudDisc = !!(
      (b.data.ATMOSPHERE_VISUALS_DATA?.CLOUDS?.texture &&
       b.data.ATMOSPHERE_VISUALS_DATA.CLOUDS.texture !== 'None') ||
      (b.data.FRONT_CLOUDS_DATA?.cloudsTexture &&
       b.data.FRONT_CLOUDS_DATA.cloudsTexture !== 'None')
    );
    const glowSuppressFade = hasCloudDisc ? Math.max(0, 1 - (physR_px - 10) / 20) : 1;
    if((b.preset==='star' || b.preset==='blackhole') && glowSuppressFade > 0){
      const isBH = b.preset === 'blackhole';

      // Derive surface colour from atmosphere texture inner row, else fallback to b.glow
      let sr = 255, sg = 255, sb = 255;
      const atmoTex2 = b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.texture;
      const apx = atmoTex2 && atmoTex2 !== 'None' && texPixelCache[atmoTex2 + '_atmos'];
      if(apx){
        // Row 63 = innermost (surface) colour
        sr = apx[63*4]; sg = apx[63*4+1]; sb = apx[63*4+2];
        // If too dark (black-as-transparent texture), brighten proportionally
        const bri = Math.max(sr, sg, sb);
        if(bri < 20){ sr = 255; sg = 255; sb = 255; } // pure white fallback
        else if(bri < 180){ const f = 255/bri; sr=Math.min(255,sr*f|0); sg=Math.min(255,sg*f|0); sb=Math.min(255,sb*f|0); }
      } else {
        // Parse b.glow hex/rgb into components — cached per glow string
        if(!drawViewport._glowRGBCache) drawViewport._glowRGBCache = {};
        if(!drawViewport._glowRGBCache[b.glow]){
          const tmp = document.createElement('canvas'); tmp.width=1; tmp.height=1;
          const tc = tmp.getContext('2d'); tc.fillStyle = b.glow; tc.fillRect(0,0,1,1);
          const pd = tc.getImageData(0,0,1,1).data;
          drawViewport._glowRGBCache[b.glow] = [pd[0], pd[1], pd[2]];
        }
        [sr, sg, sb] = drawViewport._glowRGBCache[b.glow];
      }
      // Multi-stop exponential glow: tight bright core + wide diffuse bloom
      // Inner radius = 0 so the disc centre is always filled (no black hole at large radii).
      const glowR = Math.min(r * (isBH ? 5 : 4), diagPx * 1.5);
      const grd = ctx2.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, glowR);
      if(isBH){
        // Black hole: dark centre, electric blue/purple ring
        grd.addColorStop(0,    `rgba(0,0,0,1)`);
        grd.addColorStop(0.08, `rgba(${sr},${sg},${sb},0.9)`);
        grd.addColorStop(0.18, `rgba(${sr},${sg},${sb},0.4)`);
        grd.addColorStop(0.35, `rgba(${sr},${sg},${sb},0.12)`);
        grd.addColorStop(1,    `rgba(${sr},${sg},${sb},0)`);
      } else {
        // Star: blinding white core fading through surface colour to transparent bloom
        grd.addColorStop(0,    `rgba(255,255,255,0.95)`);  // white hot centre
        grd.addColorStop(0.04, `rgba(255,255,255,0.9)`);   // keep white across core
        grd.addColorStop(0.12, `rgba(${sr},${sg},${sb},0.85)`); // transition to surface colour
        grd.addColorStop(0.25, `rgba(${sr},${sg},${sb},0.45)`);
        grd.addColorStop(0.45, `rgba(${sr},${sg},${sb},0.15)`);
        grd.addColorStop(0.7,  `rgba(${sr},${sg},${sb},0.04)`);
        grd.addColorStop(1,    `rgba(${sr},${sg},${sb},0)`);
      }
      ctx2.save();
      ctx2.globalAlpha *= glowSuppressFade;
      ctx2.globalCompositeOperation = 'lighter';
      ctx2.beginPath(); ctx2.arc(sp.x, sp.y, glowR, 0, Math.PI*2);
      ctx2.fillStyle = grd; ctx2.fill();
      ctx2.restore();
    }

    // ── Rings (RINGS_DATA) — drawn behind planet disc ──
    // Texture maps horizontally: left=inner edge, right=outer edge (radial gradient).
    // Black pixels = transparent (same convention as atmo/clouds).
    // positionZ controls vertical tilt — ignored in 2D top-down view.
    // Rings only fade in when physR_px > 4 (visible at system scale).
    if(b.data.RINGS_DATA){
      const RD = b.data.RINGS_DATA;
      const ringTex = RD.ringsTexture;
      const pxCache = ringTex && texPixelCache[ringTex + '_ring'];
      if(pxCache){
        const startR_m = RD.startRadius || 0;
        const endR_m   = RD.endRadius   || 0;
        const mc       = RD.mapColor    || {r:1,g:1,b:1,a:1};
        if(endR_m > startR_m && startR_m > 0){
          // SFS ring radii are from planet CENTER.
          // Use physR_px (true physical scale, unclamped) so rings don't shrink when zoomed.
          const ringScale  = physR_px / bodyRadius_m;
          const inner_px   = Math.max(ringScale * startR_m, physR_px); // never inside planet disc
          const outer_px   = ringScale * endR_m;
          // Fade rings out as we zoom into a child body (when ring inner leaves viewport).
          // ringFade = 1 when inner_px <= diagPx, fades to 0 at 3×diagPx.
          const ringFade   = Math.max(0, Math.min(1, 1 - (inner_px - diagPx) / (2 * diagPx)));
          if(ringFade > 0.01){
            const safeOuter  = Math.min(outer_px, diagPx * 4);
            const safeInner  = Math.min(inner_px, safeOuter * 0.9999);
            if(safeOuter > 0.5 && safeOuter > safeInner){
              // Cache ring stop strings per body+ringFade (colour-only, position-independent)
              if(!drawViewport._ringStopCache) drawViewport._ringStopCache = {};
              const mc = RD.mapColor || {r:1,g:1,b:1,a:1};
              const ringStopKey = ringTex + '|' + ringFade.toFixed(3)
                + '|' + mc.r.toFixed(3) + '|' + mc.g.toFixed(3)
                + '|' + mc.b.toFixed(3) + '|' + (mc.a??1).toFixed(3);
              if(!drawViewport._ringStopCache[ringStopKey]){
                const N = 64;
                const stops = [];
                for(let i = 0; i <= N; i++){
                  const t  = i / N;
                  const ci = Math.round(t * 63) * 4;
                  let cr = pxCache[ci], cg = pxCache[ci+1], cb = pxCache[ci+2], ca = pxCache[ci+3];
                  const brightness = Math.max(cr, cg, cb) / 255;
                  cr = Math.round(cr * mc.r);
                  cg = Math.round(cg * mc.g);
                  cb = Math.round(cb * mc.b);
                  const alpha = (ca / 255) * brightness * (mc.a !== undefined ? mc.a * 8 : 1.6) * ringFade;
                  stops.push([t, `rgba(${cr},${cg},${cb},${Math.min(1,alpha).toFixed(3)})`]);
                }
                drawViewport._ringStopCache[ringStopKey] = stops;
              }
              const stops = drawViewport._ringStopCache[ringStopKey];
              const grad = ctx2.createRadialGradient(sp.x, sp.y, safeInner, sp.x, sp.y, safeOuter);
              for(const [t, col] of stops) grad.addColorStop(t, col);
              ctx2.save();
              ctx2.beginPath();
              ctx2.arc(sp.x, sp.y, safeOuter, 0, Math.PI*2);
              ctx2.arc(sp.x, sp.y, safeInner, 0, Math.PI*2, true);
              ctx2.fillStyle = grad;
              ctx2.fill();
              ctx2.restore();
            }
          }
        }
      }
    }

    // ── Atmosphere halo — variable setup (draw call deferred to after front clouds) ──
    // Variables computed here because atmoFade is used by fog, water, cloud strip, etc.
    const _atmoH_m  = (b.data.ATMOSPHERE_PHYSICS_DATA?.height || 0) * getAtmoDifficultyMult(b.data);
    const _gradH_m  = (b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.height || _atmoH_m) * getAtmoDifficultyMult(b.data);
    const _R_eff_px = bodyRadius_m * radiusMult;
    const _atmoOuterPx = _atmoH_m > 0
      ? physR_px * (_R_eff_px + _gradH_m) / _R_eff_px
      : physR_px;
    // LOD threshold: larger atmospheres (by physical outer radius in metres) start
    // rendering from farther away (more screen pixels required before fade-in begins).
    // _atmoLod grows logarithmically with physical outer radius so a gas-giant atmosphere
    // (R+H ~500 000 km) fades in at ~32 px while a thin 50 km atmo uses the 2 px floor.
    const _atmoPhysOuter_m = _R_eff_px + _gradH_m; // metres, unscaled
    const _atmoLod = _atmoPhysOuter_m > 0
      ? Math.min(32, Math.max(2, 2 * Math.log10(Math.max(1, _atmoPhysOuter_m / 1e5))))
      : 2;
    const atmoFade = Math.max(0, Math.min(1, (_atmoOuterPx - _atmoLod) / Math.max(_atmoLod, 0.01)));

    // ── Physical atmosphere overlay (debug) ────────────────────────────────
    if(envFlags.physAtmo && b.data.ATMOSPHERE_PHYSICS_DATA){
      const _aphys_H  = (b.data.ATMOSPHERE_PHYSICS_DATA.height || 0) * getAtmoDifficultyMult(b.data);
      if(_aphys_H > 0){
        const _aphys_innerPx = physR_px;
        const _aphys_outerPx = physR_px * (bodyRadius_m * radiusMult + _aphys_H) / (bodyRadius_m * radiusMult);
        if(_aphys_outerPx > 0.5){
          const _NSIDES = 72;
          ctx2.save();
          ctx2.globalAlpha = 0.22;
          ctx2.fillStyle = '#7fc8ff';
          ctx2.beginPath();
          for(let _i=0;_i<_NSIDES;_i++){
            const _a = (_i/_NSIDES)*Math.PI*2;
            const _x = sp.x + Math.cos(_a)*_aphys_outerPx;
            const _y = sp.y + Math.sin(_a)*_aphys_outerPx;
            _i===0 ? ctx2.moveTo(_x,_y) : ctx2.lineTo(_x,_y);
          }
          ctx2.closePath();
          // cut out planet centre
          for(let _i=0;_i<_NSIDES;_i++){
            const _a = -(_i/_NSIDES)*Math.PI*2;
            const _ix = sp.x + Math.cos(_a)*_aphys_innerPx;
            const _iy = sp.y + Math.sin(_a)*_aphys_innerPx;
            _i===0 ? ctx2.moveTo(_ix,_iy) : ctx2.lineTo(_ix,_iy);
          }
          ctx2.closePath();
          ctx2.fill('evenodd');
          // border ring at outer edge
          ctx2.globalAlpha = 0.55;
          ctx2.strokeStyle = '#7fc8ff';
          ctx2.lineWidth = Math.max(1, Math.min(2, _aphys_outerPx * 0.012));
          ctx2.beginPath();
          for(let _i=0;_i<_NSIDES;_i++){
            const _a = (_i/_NSIDES)*Math.PI*2;
            const _x = sp.x + Math.cos(_a)*_aphys_outerPx;
            const _y = sp.y + Math.sin(_a)*_aphys_outerPx;
            _i===0 ? ctx2.moveTo(_x,_y) : ctx2.lineTo(_x,_y);
          }
          ctx2.closePath();
          ctx2.stroke();
          // label height
          if(_aphys_outerPx > 30){
            ctx2.globalAlpha = 0.85;
            ctx2.fillStyle = '#7fc8ff';
            ctx2.font = `bold ${Math.max(9, Math.min(13, _aphys_outerPx * 0.04))}px "JetBrains Mono", monospace`;
            ctx2.textAlign = 'left';
            ctx2.textBaseline = 'middle';
            const _hkm = (_aphys_H/1000).toFixed(0);
            ctx2.fillText(`atmo ${_hkm} km`, sp.x + _aphys_outerPx + 4, sp.y - _aphys_outerPx * 0.15);
          }
          ctx2.restore();
        }
      }
    }

    // ── Atmosphere halo ────────────────────────────────────────────────────
    // SFS atmosphere rendering rules:
    //   - Texture X = angle around planet (left=East, wraps CCW)
    //   - Texture bottom row (Y=SH-1) = planet circumference (radius r)
    //   - Texture top row    (Y=0)    = outer atmosphere edge (radius drawR)
    //   - Inside r: bottom row is stretched radially toward center (pizza slices)
    //   - No-terrain bodies (Sun): atmosphere is additive ('lighter') over star glow
    //   - Terrain bodies (Earth): atmosphere halo sits behind surface (source-over)
    //
    // We build a polar-warped disc canvas AT DRAW TIME (cached per body+zoomBin)
    // so we can correctly map pixel distance from center to texture row, taking
    // into account the actual r/drawR ratio at this zoom level.
    // This is the only way to preserve angular variation (sun flares, etc.)
    //
    // ── Surface base fill — non-terrain bodies only ──
    // For stars/gas-giants (no TERRAIN_DATA) the atmosphere uses 'lighter' blending,
    // which adds onto whatever is below. Without a solid fill the raw black canvas
    // bleeds through at the disc limb where the arc clip anti-aliases and where the
    // atmosphere texture bottom row is semi-transparent, producing a 1-2px dark ring.
    // Draw the surface colour as a solid disc here so the limb is always opaque.
    if(atmoFade > 0 && !b.data.TERRAIN_DATA && b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT){
      const atmoTex0 = b.data.ATMOSPHERE_VISUALS_DATA.GRADIENT.texture;
      if(atmoTex0 && atmoTex0 !== 'None'){
        // Derive surface colour from the cached innermost texture row (same source
        // used by the star glow code above), fallback to b.glow.
        let fr0 = 255, fg0 = 255, fb0 = 255;
        const apx0 = texPixelCache[atmoTex0 + '_atmos'];
        if(apx0){ fr0 = apx0[63*4]; fg0 = apx0[63*4+1]; fb0 = apx0[63*4+2]; }
        ctx2.save();
        ctx2.globalAlpha = atmoFade;
        ctx2.globalCompositeOperation = 'source-over';
        ctx2.beginPath(); ctx2.arc(sp.x, sp.y, physR_px, 0, Math.PI*2);
        ctx2.fillStyle = `rgb(${fr0},${fg0},${fb0})`;
        ctx2.fill();
        ctx2.restore();
      }
    }

    if(envFlags.atmo && !envFlags.heightmaps && atmoFade > 0 && b.data.ATMOSPHERE_PHYSICS_DATA && b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT){
      const APD = b.data.ATMOSPHERE_PHYSICS_DATA;
      const GRD = b.data.ATMOSPHERE_VISUALS_DATA.GRADIENT;
      const atmosH_m = APD.height || 0;
      const gradH_m  = GRD.height || atmosH_m;
      const atmoTex  = GRD.texture;

      if(atmosH_m > 0 && atmoTex && atmoTex !== 'None'){
        const srcImg = textureCache[atmoTex];
        if(srcImg && srcImg.complete && srcImg.naturalWidth > 0){
          // Always use physR_px (true physical pixel radius) for atmosphere sizing,
          // NOT the display-clamped r — the atmosphere must stay at its real physical
          // size regardless of the icon floor or zoom level.
          const outer_r_px = physR_px * (bodyRadius_m + gradH_m) / bodyRadius_m;
          if(outer_r_px > 0.5){
            const hasTerrain = !!b.data.TERRAIN_DATA;
            // When the atmosphere outer edge exceeds the viewport diagonal, the planet
            // disc has zoomed past the screen edge — only the surface is visible, not
            // the halo ring. Skip the polar warp entirely in this case; it would produce
            // a misaligned ring artifact at the limb because drawR clamping breaks the
            // innerFrac/clip relationship.
            // For non-terrain bodies (stars) the atmosphere fills inward so still render.
            const drawR = Math.min(outer_r_px, diagPx * 2);
            const innerFrac = physR_px / drawR; // physical ratio: planet disc / atmo outer
            if(hasTerrain && innerFrac >= 1.0){
              // Planet disc fills/exceeds viewport — nothing to draw
            } else {
            const innerFracClamped = Math.min(0.999, innerFrac);

            // ── Build or retrieve polar disc canvas ──
            // Quantise innerFrac to 0.025 steps (~40 buckets) so the cache doesn't
            // rebuild on every zoom tick. Previously .toFixed(4) caused a fresh
            // 512k-pixel rebuild every frame while zooming, causing severe lag.
            const innerFracQ = (Math.round(innerFracClamped / 0.025) * 0.025).toFixed(3);
            if(!drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
            const cacheKey = atmoTex + '|' + innerFracQ;
            let polarCanvas = drawViewport._atmoPolarCache[cacheKey];

            if(!polarCanvas){
              // Build source pixel buffer once per texture
              if(!drawViewport._atmoSrcCache) drawViewport._atmoSrcCache = {};
              if(!drawViewport._atmoSrcCache[atmoTex]){
                const sc = document.createElement('canvas');
                sc.width = srcImg.naturalWidth; sc.height = srcImg.naturalHeight;
                sc.getContext('2d').drawImage(srcImg, 0, 0);
                drawViewport._atmoSrcCache[atmoTex] = {
                  data: sc.getContext('2d').getImageData(0,0,sc.width,sc.height).data,
                  w: sc.width, h: sc.height
                };
              }
              const {data: srcD, w: SW, h: SH} = drawViewport._atmoSrcCache[atmoTex];

              // Use higher resolution for thin atmospheres (small innerFrac gap)
              // or large bodies (physR_px already big on screen), so each texture
              // row maps to enough polar-canvas pixels and the limb stays sharp.
              const atmoBandFrac = 1 - innerFracClamped;
              const SZ = (atmoBandFrac < 0.15 || physR_px > 120) ? 1024 : 512;
              polarCanvas = document.createElement('canvas');
              polarCanvas.width = SZ; polarCanvas.height = SZ;
              const pCtx = polarCanvas.getContext('2d');
              const outD = pCtx.createImageData(SZ, SZ);
              const od = outD.data;
              const half = SZ / 2;

              // Pre-sample the innermost texture row (bottom of atmosphere = planet surface colour)
              // so pixels inside innerFracClamped can be filled solid instead of left transparent.
              // Transparent inner pixels composite as black over the canvas → dark gap ring.
              let inner_r = 255, inner_g = 255, inner_b = 255, inner_a = 255;
              {
                const innerRow = SH - 1; // bottom row = planet surface
                let rSum=0,gSum=0,bSum=0,aSum=0, cnt=0;
                for(let ix=0;ix<SW;ix++){
                  const ii=(innerRow*SW+ix)*4;
                  rSum+=srcD[ii]; gSum+=srcD[ii+1]; bSum+=srcD[ii+2]; aSum+=srcD[ii+3]; cnt++;
                }
                inner_r=rSum/cnt+.5|0; inner_g=gSum/cnt+.5|0;
                inner_b=bSum/cnt+.5|0; inner_a=aSum/cnt+.5|0;
              }

              for(let py = 0; py < SZ; py++){
                for(let ppx = 0; ppx < SZ; ppx++){
                  const dx = ppx - half, dy = py - half;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  const radFrac = dist / half;
                  const oi = (py*SZ + ppx)*4;

                  if(radFrac > 1.0){ od[oi+3]=0; continue; }

                  // Pixels inside the planet disc: fill with innermost atmosphere colour
                  // (fully opaque) so there is no transparent zone that composites as black.
                  if(radFrac <= innerFracClamped){
                    od[oi]=inner_r; od[oi+1]=inner_g; od[oi+2]=inner_b; od[oi+3]=inner_a;
                    continue;
                  }

                  let cwAngle = Math.atan2(dy, dx) / (Math.PI*2);
                  if(cwAngle < 0) cwAngle += 1;
                  const u = (1 - cwAngle) % 1;

                  const t = (radFrac - innerFracClamped) / (1 - innerFracClamped);
                  const texRowF = (1 - t) * (SH - 1);
                  const sx = Math.min(SW-1, Math.max(0, Math.round(u * (SW-1))));
                  // Bilinear interpolation along Y to avoid hard row-quantisation rings
                  const sy0 = Math.min(SH-1, Math.max(0, Math.floor(texRowF)));
                  const sy1 = Math.min(SH-1, sy0 + 1);
                  const fy  = texRowF - sy0;
                  const si0 = (sy0 * SW + sx) * 4;
                  const si1 = (sy1 * SW + sx) * 4;
                  od[oi]   = srcD[si0]   + (srcD[si1]   - srcD[si0])   * fy + 0.5 | 0;
                  od[oi+1] = srcD[si0+1] + (srcD[si1+1] - srcD[si0+1]) * fy + 0.5 | 0;
                  od[oi+2] = srcD[si0+2] + (srcD[si1+2] - srcD[si0+2]) * fy + 0.5 | 0;
                  od[oi+3] = srcD[si0+3] + (srcD[si1+3] - srcD[si0+3]) * fy + 0.5 | 0;
                }
              }
              pCtx.putImageData(outD, 0, 0);
              drawViewport._atmoPolarCache[cacheKey] = polarCanvas;
            }

            // ── Draw the polar disc — viewport-cropped ──
            // When drawR is huge (large star atmosphere zoomed in) the full-disc
            // drawImage scales a 512px canvas to thousands of screen pixels, forcing
            // the GPU to process an enormous blit even though only a small viewport
            // slice is visible. Instead we compute exactly which portion of the polar
            // canvas maps onto the current viewport and only blit that rectangle.
            // The arc clip below then masks it to the correct disc/ring shape.
            ctx2.save();
            ctx2.globalAlpha = atmoFade;
            ctx2.globalCompositeOperation = hasTerrain ? 'source-over' : 'lighter';

            if(hasTerrain){
              ctx2.beginPath();
              ctx2.arc(sp.x, sp.y, drawR, 0, Math.PI*2);
              ctx2.clip();
            } else {
              ctx2.beginPath();
              ctx2.arc(sp.x, sp.y, drawR, 0, Math.PI*2);
              ctx2.clip();
            }

            {
              const SZ = polarCanvas.width; // 512
              const fullD = drawR * 2;      // full disc diameter in screen px

              // Destination rect: intersection of the full disc bounding box with viewport
              const discL = sp.x - drawR, discT = sp.y - drawR;
              const dstX = Math.max(0, discL);
              const dstY = Math.max(0, discT);
              const dstR = Math.min(W, discL + fullD);
              const dstB = Math.min(H, discT + fullD);
              const dstW = dstR - dstX;
              const dstH = dstB - dstY;

              if(dstW > 0 && dstH > 0){
                // Corresponding source rect in the 512×512 polar canvas
                const scale = SZ / fullD; // polar-canvas px per screen px
                const srcX = (dstX - discL) * scale;
                const srcY = (dstY - discT) * scale;
                const srcW = dstW * scale;
                const srcH = dstH * scale;
                ctx2.imageSmoothingEnabled = true;
                ctx2.imageSmoothingQuality = 'high';
                ctx2.drawImage(polarCanvas, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
              }
            }

            ctx2.restore();
            } // end else (innerFrac < 1.0)
          }
        }
      }
    }

    // ── Body disc ──
    // Draw order: (1) terrain polygon or fallback disc  (2) texture on top  (3) water overlay
    // The terrain polygon is ALWAYS the base fill — texture clips on top of it.
    const ptex = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTexture;
    const texImg = envFlags.surface && ptex && ptex !== 'None' && textureCache[ptex]
                   && textureCache[ptex].complete && textureCache[ptex].naturalWidth > 0
                   ? textureCache[ptex] : null;

    // ── LOD tier ─────────────────────────────────────────────────────────────
    // Controls sample counts for terrain / surface texture / rocks based on
    // how large the planet appears on screen (physR_px).
    //   0 = tiny (smooth disc only — no heightmap sampling at all)
    //   1 = far  (coarse terrain shape, no surface texture)
    //   2 = mid  (terrain shape + surface texture at low N)
    //   3 = near (full detail)
    const LOD = physR_px < 6   ? 0
              : physR_px < 40  ? 1
              : physR_px < 120 ? 2
              :                  3;
    // terrN: number of terrain polygon vertices around the full circumference.
    //
    // The game's LOD system scales with both screen size AND planet radius — a large
    // planet zoomed in has many more terrain vertices visible per screen pixel than
    // a small asteroid at the same screen size.
    //
    // Correct formula: we need ~2 vertices per screen pixel around the circumference.
    // Screen circumference in pixels = 2π × physR_px, so terrN = 2π × physR_px.
    // This replaces the old π × physR_px / 45 * 45 which under-sampled by ~2× and
    // was capped at 4096 — causing flat terrain on large planets when zoomed in.
    //
    // Hard physics cap: game never places vertices closer than verticeSize metres apart.
    //   maxN = floor(2π × radius_m / verticeSize)
    // This prevents over-sampling small bodies beyond the game's own resolution.
    const _vsRaw = b.data.TERRAIN_DATA?.verticeSize;
    const _vs = (_vsRaw > 0) ? _vsRaw : 2.0; // default 2m matches game default
    const _vsMaxN = Math.max(90, Math.floor(2 * Math.PI * (bodyRadius_m * radiusMult) / _vs));
    // Screen-based N: 2 vertices per pixel around the circumference.
    // Quantise to multiples of 360 at high zoom (stable cache keys, divisible by common angles),
    // multiples of 90 at low zoom (small bodies where cache thrash matters more than precision).
    const _rawScreenN = Math.ceil(2 * Math.PI * physR_px);
    const _qStep = physR_px > 500 ? 360 : 90;
    const _detailMult = (typeof window !== 'undefined' && window.terrainDetail != null)
      ? Math.max(0.01, window.terrainDetail / 100) : 1;
    const _screenN = Math.max(90, Math.ceil((_rawScreenN * _detailMult) / _qStep) * _qStep);
    const terrN = LOD === 0 ? 0 : Math.min(_vsMaxN, _screenN);

    // Minimum physR_px to draw terrain polygon. Water depression (up to ~3% of radius)
    // needs sufficient pixel resolution to look smooth rather than jagged.
    // Below this threshold, draw a smooth disc instead (matches game map-view behaviour).
    const hasWater = !!(b.data.WATER_DATA?.lowerTerrain && b.data.WATER_DATA?.oceanMaskTexture
                        && b.data.WATER_DATA.oceanMaskTexture !== 'None');
    const terrainDrawThreshold = hasWater ? 80 : 6;

    // ── Visible arc — computed once, shared by all terrain draw calls for this body ──
    // Only meaningful when the planet is large on screen (physR_px > 200); below that
    // the overhead of arc computation exceeds the savings from culling.
    // Disabled for small bodies (radius < 15000m) — at that scale the full circle
    // is cheap and arc-culling artifacts are visually prominent.
    const _canArcCull = envFlags.heightmaps && physR_px > 200 && (bodyRadius_m * radiusMult) >= 15000;
    const _arcInfo = _canArcCull
      ? _computeVisibleArc(sp, Math.max(r, physR_px), W, H)
      : null;

    // ── Step 1: Base fill — terrain polygon or icon gradient ─────────────────
    {
      const mc_disc = b.data.BASE_DATA?.mapColor;
      // Try to draw terrain polygon (returns false if no formula / still loading).
      // Use display radius `r` (not raw physR_px) so even sub-physical asteroids
      // draw a visible shaped polygon — physR_px < iconR collapses to sub-pixel otherwise.
      const _terrainDrawn = envFlags.heightmaps && b.data.TERRAIN_DATA && physR_px > terrainDrawThreshold && LOD > 0 &&
        drawTerrainBody(ctx2, b, name, sp, Math.max(r, physR_px), bodyRadius_m * radiusMult, mc_disc, terrN, _arcInfo, texImg);

      if(!_terrainDrawn){
        // Fallback: icon gradient disc. Stars/barycentres fade out when zoomed in;
        // terrain bodies waiting for assets stay fully opaque.
        // Skip the disc entirely when heightmaps are on and this body has TERRAIN_DATA
        // but terrain just hasn't computed yet — the unclipped disc bleeds outside the
        // terrain silhouette when the planet centre is off-screen (the artifact).
        // The terrain polygon will appear the next frame once the cache is warm.
        if(envFlags.heightmaps && b.data.TERRAIN_DATA && physR_px > terrainDrawThreshold){
          // intentionally empty — no fallback disc for terrain bodies while loading
        } else {
        const mc = mc_disc;
        const atmoH  = b.data.ATMOSPHERE_PHYSICS_DATA?.height  ?? 1;
        const atmoD  = b.data.ATMOSPHERE_PHYSICS_DATA?.density ?? 1;
        const gradH  = b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.height ?? 1;
        const hasCollider = b.data.TERRAIN_DATA?.collider !== false;
        const isStationary = (b.data.ORBIT_DATA?.direction ?? 1) === 0;
        const isBarycentre = b.preset === 'barycentre' ||
          (atmoH === 0 && atmoD === 0 && gradH === 0 && !hasCollider && isStationary);
        const mr = isBarycentre ? 102 : (mc ? Math.min(255, Math.round(mc.r * 255)) : 170);
        const mg = isBarycentre ? 102 : (mc ? Math.min(255, Math.round(mc.g * 255)) : 170);
        const mb = isBarycentre ? 136 : (mc ? Math.min(255, Math.round(mc.b * 255)) : 204);
        if(!drawViewport._iconColCache) drawViewport._iconColCache = {};
        const icKey = `${mr},${mg},${mb}`;
        if(!drawViewport._iconColCache[icKey]){
          drawViewport._iconColCache[icKey] = [
            `rgb(${Math.min(255,mr+50)},${Math.min(255,mg+50)},${Math.min(255,mb+50)})`,
            `rgb(${mr},${mg},${mb})`,
            `rgb(${Math.max(0,mr-60)},${Math.max(0,mg-60)},${Math.max(0,mb-60)})`
          ];
        }
        const [hi, mid, lo] = drawViewport._iconColCache[icKey];
        const iconFade = b.data.TERRAIN_DATA
          ? 1
          : Math.max(0, Math.min(1, 1 - (physR_px - 8) / 22));
        if(iconFade > 0){
          ctx2.save();
          ctx2.globalAlpha *= iconFade;
          const grad = ctx2.createRadialGradient(sp.x-r*.25, sp.y-r*.25, r*.1, sp.x, sp.y, r);
          grad.addColorStop(0,    hi);
          grad.addColorStop(0.45, mid);
          grad.addColorStop(1,    lo);
          ctx2.beginPath(); ctx2.arc(sp.x, sp.y, r, 0, Math.PI*2);
          ctx2.fillStyle = grad; ctx2.fill();
          ctx2.restore();
        }
        } // end else (not a terrain body with heightmaps on)
      }
    }

    // ── Step 2: Planet texture — clipped to terrain silhouette ───────────────
    if(texImg && physR_px > 1){
      let ptCutout      = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureCutout      ?? 0;
      let ptRotDeg      = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureRotation    ?? 0;
      let ptDontDistort = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureDontDistort ?? false;
      if(selectedBody === name && !liveSync._filling){
        const cutEl = document.getElementById('tt-cut');
        const rotEl = document.getElementById('tt-rot');
        const ndEl  = document.getElementById('tt-nd');
        if(cutEl && cutEl.value !== '') ptCutout  = parseFloat(cutEl.value) || 0;
        if(rotEl && rotEl.value !== '') ptRotDeg  = parseFloat(rotEl.value) || 0;
        if(ndEl) ptDontDistort = !ndEl.classList.contains('on');
      }

      // ── UV formula from Chunk.cs / Planet.cs ─────────────────────────────
      // (!DontDistortTextureCutout) ? vector2.normalized : (vector2 / radius)
      //
      // DontDistort = false  →  vector2.normalized  →  direction-only UV
      //   The texture is pegged to the sphere surface and does NOT stretch
      //   with terrain height. This is "no distortion" visually: mountains
      //   don't warp the texture. drawHalf = physR_px / cutoutAbs (fixed).
      //
      // DontDistort = true   →  vector2 / radius    →  linear UV
      //   Terrain height pushes UV coords outward — the texture stretches
      //   over bumps ("distortion" in the visual sense).
      //   drawHalf must cover the tallest peak.
      //   hasWater always forces this path (Planet.DontDistortTextureCutout).
      const hasWater    = !!(b.data.WATER_DATA);
      const dontDistort = hasWater || ptDontDistort;

      const cutoutAbs = Math.max(0.01, Math.abs((ptCutout !== 0) ? ptCutout : 1.0));
      const _baseR    = Math.max(r, physR_px);
      const rotRad    = -ptRotDeg * Math.PI / 180;

      let drawHalf;
      if(dontDistort){
        // Normalized UV (vector2.normalized): direction-only, height irrelevant.
        drawHalf = _baseR / cutoutAbs;
      } else {
        // Linear UV (vector2 / radius): terrain height shifts UVs outward.
        // Scale drawHalf to cover the tallest terrain point.
        const _tSamp = envFlags.heightmaps && _getTerrainSamples(name, b, bodyRadius_m * radiusMult, terrN, _arcInfo);
        let _maxFrac = 0;
        if(_tSamp){
          const R_m = bodyRadius_m * radiusMult;
          for(let _mi = 0; _mi < _tSamp.heights.length; _mi++){
            const f = _tSamp.heights[_mi] / R_m;
            if(f > _maxFrac) _maxFrac = f;
          }
        }
        drawHalf = _baseR * (1 + _maxFrac) / cutoutAbs;
      }

      const _displayR = Math.max(r, physR_px);
      const _tcp = envFlags.heightmaps && physR_px > terrainDrawThreshold && _terrainClipPath(b, name, sp, _displayR, bodyRadius_m * radiusMult, terrN, _arcInfo);

      ctx2.save();
      if (_tcp) {
        _applyTerrainClip(ctx2, _tcp, sp);
      } else {
        ctx2.beginPath(); ctx2.arc(sp.x, sp.y, _displayR, 0, Math.PI*2); ctx2.clip();
      }
      ctx2.translate(sp.x, sp.y);
      ctx2.rotate(rotRad);
      // Additional screen-bounds clip in rotated local space to prevent the GPU
      // rasterizing a massive off-screen rect. Compute viewport AABB in local space.
      { const cosR = Math.cos(-rotRad), sinR = Math.sin(-rotRad);
        const corners = [[0,0],[W,0],[0,H],[W,H]];
        let lxMn=Infinity,lxMx=-Infinity,lyMn=Infinity,lyMx=-Infinity;
        for (const [cx,cy] of corners) {
          const lx = cx-sp.x, ly = cy-sp.y;
          const rx = cosR*lx - sinR*ly, ry = sinR*lx + cosR*ly;
          if(rx<lxMn)lxMn=rx; if(rx>lxMx)lxMx=rx;
          if(ry<lyMn)lyMn=ry; if(ry>lyMx)lyMx=ry;
        }
        // Clamp to texture rect and add 1px margin
        const dx = Math.max(-drawHalf, lxMn-1), dy = Math.max(-drawHalf, lyMn-1);
        const dw = Math.min(drawHalf, lxMx+1) - dx, dh = Math.min(drawHalf, lyMx+1) - dy;
        if (dw > 0 && dh > 0) {
          // Map dest rect back to source UV
          const iw = texImg.naturalWidth, ih = texImg.naturalHeight;
          const toSrcX = iw / (drawHalf*2), toSrcY = ih / (drawHalf*2);
          const sx = Math.max(0, (dx + drawHalf) * toSrcX);
          const sy = Math.max(0, (dy + drawHalf) * toSrcY);
          const sw = Math.min(iw - sx, dw * toSrcX);
          const sh = Math.min(ih - sy, dh * toSrcY);
          if (sw > 0 && sh > 0)
            ctx2.drawImage(texImg, sx, sy, sw, sh, dx, dy, dw, dh);
        }
      }
      ctx2.restore();
    } else if(!texImg && ptex && ptex !== 'None'){
      // Texture named but not in cache yet — log once
      if(!_sfsDbgLogged) _sfsDbgLogged = {};
      if(!_sfsDbgLogged[name]){
        _sfsDbgLogged[name] = true;
        const cacheImg = textureCache[ptex];
        console.warn(`[SFS|NODRAW] ${name} | planetTexture:"${ptex}" | inCache:${!!cacheImg}` +
          (cacheImg ? ` | complete:${cacheImg.complete} naturalW:${cacheImg.naturalWidth}` : '') +
          ` | physR_px:${physR_px.toFixed(1)}`);
      }
    }

    // ── Water overlay (WATER_DATA) ─────────────────────────────────────────
    // Black = deep water, lighter grey = shallower, white = land.
    // We render the water mask as a colour overlay on the planet disc.
    // ── Surface Textures A & B — tiled world-space overlay on terrain surface ──────────
    // ── Surface Textures A & B — tiled strip at terrain surface ───────────────
    // Game tiles A and B in world-space arc coordinates, blended by textureFormula.
    if(envFlags.surface && b.data.TERRAIN_DATA && LOD >= 2){
      const TTD  = b.data.TERRAIN_DATA.TERRAIN_TEXTURE_DATA;
      const saName = TTD?.surfaceTexture_A;
      const sbName = TTD?.surfaceTexture_B;
      const saSize = TTD?.surfaceTextureSize_A;
      const sbSize = TTD?.surfaceTextureSize_B;
      const layerM  = (TTD?.surfaceLayerSize != null && TTD.surfaceLayerSize >= 0) ? TTD.surfaceLayerSize : 20;
      const maxFadeV = (TTD?.maxFade != null && TTD.maxFade >= 0) ? TTD.maxFade : 1.0;
      const minFadeV = (TTD?.minFade != null && TTD.minFade >= 0) ? TTD.minFade : 0.0;

      // Per-texture LOD thresholds — surfaceLOD_A/B override the default 80px fade-in distance.
      // Negative / missing = use default. The fade window is always 140px wide.
      const _lodA = (TTD?.surfaceLOD_A != null && TTD.surfaceLOD_A >= 0) ? TTD.surfaceLOD_A : 80;
      const _lodB = (TTD?.surfaceLOD_B != null && TTD.surfaceLOD_B >= 0) ? TTD.surfaceLOD_B : 80;
      // Combined fade start = minimum of the two active textures (show whichever kicks in first)
      const saHasTex = saName && saName !== 'None';
      const sbHasTex = sbName && sbName !== 'None';
      const abLodStart = (saHasTex && sbHasTex) ? Math.min(_lodA, _lodB)
                       : saHasTex ? _lodA : sbHasTex ? _lodB : 80;

      const saImg = saHasTex && textureCache[saName]?.complete && textureCache[saName].naturalWidth > 0 ? textureCache[saName] : null;
      const sbImg = sbHasTex && textureCache[sbName]?.complete && textureCache[sbName].naturalWidth > 0 ? textureCache[sbName] : null;

      if((saImg || sbImg) && layerM > 0){
        const surfFade = Math.min(1, (physR_px - abLodStart) / 140);
        if(surfFade > 0){
          const radius_m = bodyRadius_m * radiusMult;
          // N: strips per revolution — derived from LOD tier, then scaled by terrain detail.
          // LOD 2 (mid) = 90 strips, LOD 3 (near) = 180. Each strip is one drawImage call.
          const _detailFracSurf = (typeof window !== 'undefined' && window.terrainDetail != null)
            ? Math.max(0.05, window.terrainDetail / 100) : 1;
          const N = Math.max(12, Math.round((LOD >= 3 ? 180 : 90) * _detailFracSurf));

          // GetRepeat: SurfaceArea = 2π*radius_m, factor = 4.712389 = 3π/2
          // Negative sizes are valid sentinel values in SFS (-1 = default); use abs for tiling math.
          const SURF_AREA = 2 * Math.PI * radius_m;
          const REP_FACTOR = 4.712389;
          const saAbsX = saSize && saSize.x !== 0 ? Math.abs(saSize.x) : 100;
          const saAbsY = saSize && saSize.y !== 0 ? Math.abs(saSize.y) : 100;
          const sbAbsX = sbSize && sbSize.x !== 0 ? Math.abs(sbSize.x) : 100;
          const sbAbsY = sbSize && sbSize.y !== 0 ? Math.abs(sbSize.y) : 100;
          const repAx = saImg ? SURF_AREA / (saAbsX * REP_FACTOR) : 8;
          const repAy = saImg ? radius_m / saAbsY : 4;
          const repBx = sbImg ? SURF_AREA / (sbAbsX * REP_FACTOR) : 8;
          const repBy = sbImg ? radius_m / sbAbsY : 4;

          // textureFormula blend per angle
          const blendArr = _evalTextureFormula(name, b, radius_m, N);
          // terrain heights for surface-following strip
          const terrRes  = envFlags.heightmaps ? _getTerrainSamples(name, b, radius_m, N, _arcInfo) : null;

          const discR_px = Math.max(r, physR_px);
          const layerPx  = (layerM / radius_m) * discR_px;

          // Pre-sample textures at TEX_SZ resolution
          const TEX_SZ = Math.max(8, Math.round(128 * _detailFracSurf));
          function ensurePixels(img) {
            if(!img) return;
            // Re-sample if the cached size doesn't match the current TEX_SZ
            if(img._spx && img._spxSz === TEX_SZ) return;
            const tc = document.createElement('canvas'); tc.width = tc.height = TEX_SZ;
            tc.getContext('2d').drawImage(img, 0, 0, TEX_SZ, TEX_SZ);
            img._spx   = tc.getContext('2d').getImageData(0,0,TEX_SZ,TEX_SZ).data;
            img._spxSz = TEX_SZ;
          }
          ensurePixels(saImg); ensurePixels(sbImg);

          function sampleTex(img, u, v) {
            const tx = (((u % 1) + 1) % 1 * TEX_SZ) | 0;
            const ty = (((v % 1) + 1) % 1 * TEX_SZ) | 0;
            const i4 = (ty * TEX_SZ + tx) * 4;
            return [img._spx[i4]/255, img._spx[i4+1]/255, img._spx[i4+2]/255];
          }

          // ── Polar-mapped surface layer canvas ──────────────────────────────────
          // Render A/B surface textures into a square offscreen canvas in screen space,
          // sampling texture coordinates in polar space around the planet centre.
          // One drawImage call replaces the broken per-strip-rect approach.
          // Canvas size: 2*(discR_px+layerPx) square, planet centre at (SZ/2, SZ/2).
          // Size the offscreen canvas: diameter of planet + layer, scaled by detail,
          // capped at 1024 to keep memory/CPU reasonable.
          const _surfSZFull = Math.ceil((discR_px + layerPx) * 2);
          const _surfSZ = Math.min(1024, Math.max(64, Math.round(_surfSZFull * _detailFracSurf)));
          const _surfCx = _surfSZ / 2, _surfCy = _surfSZ / 2;
          const _pxPerM  = discR_px / radius_m; // screen pixels per metre

          const cKey = `sAB3|${name}|${radius_m.toFixed(0)}|${saName}|${sbName}|${layerM}|${maxFadeV}|${minFadeV}|${N}|${TEX_SZ}|${blendArr?1:0}|${terrRes?1:0}|${saAbsX}|${saAbsY}|${sbAbsX}|${sbAbsY}|${_lodA}|${_lodB}|${_surfSZ}`;
          if(!drawViewport._surfCache) drawViewport._surfCache = {};
          let surfOff = drawViewport._surfCache[cKey];

          if(!surfOff){
            surfOff = document.createElement('canvas');
            surfOff.width = surfOff.height = _surfSZ;
            const sc = surfOff.getContext('2d');
            const imgData = sc.createImageData(_surfSZ, _surfSZ);
            const pix = imgData.data;

            for(let py = 0; py < _surfSZ; py++){
              for(let px2 = 0; px2 < _surfSZ; px2++){
                const dx = px2 - _surfCx, dy = py - _surfCy;
                const distPx = Math.sqrt(dx*dx + dy*dy);

                // Terrain radius at this angle (pixels)
                const rawAngle = Math.atan2(-dy, dx); // trig angle
                const angle01  = ((rawAngle / (Math.PI*2)) + 1) % 1;
                let surfR_px = discR_px;
                if(terrRes && terrRes.heights){
                  // interpolate height at this angle
                  const hN = terrRes.heights.length;
                  const hIdx = angle01 * hN;
                  const hLo  = Math.floor(hIdx) % hN;
                  const hHi  = (hLo + 1) % hN;
                  const hFrac = hIdx - Math.floor(hIdx);
                  const h = terrRes.heights[hLo] * (1-hFrac) + terrRes.heights[hHi] * hFrac;
                  surfR_px = discR_px * (1 + h / radius_m);
                }
                const outerR_px = surfR_px + layerPx;

                // Only paint pixels in the surface layer band
                if(distPx < surfR_px || distPx > outerR_px) continue;

                // depthT: 0 at outer edge (surface top), 1 at inner edge (surface base)
                const depthT = layerPx > 0 ? (outerR_px - distPx) / layerPx : 0;
                const fade   = minFadeV + (maxFadeV - minFadeV) * (1 - depthT);
                if(fade < 0.005) continue;

                const ai    = Math.round(angle01 * (N-1));
                const blend = blendArr ? Math.max(0, Math.min(1, blendArr[ai])) : 0;
                const uA = angle01 * repAx,  vA = depthT * repAy;
                const uB = angle01 * repBx,  vB = depthT * repBy;

                let rr, gg, bb;
                if(saImg && sbImg){
                  const [ar,ag,ab] = sampleTex(saImg, uA, vA);
                  const [br,bg,bb2] = sampleTex(sbImg, uB, vB);
                  rr = ar+(br-ar)*blend; gg = ag+(bg-ag)*blend; bb = ab+(bb2-ab)*blend;
                } else if(saImg){
                  [rr,gg,bb] = sampleTex(saImg, uA, vA);
                } else {
                  [rr,gg,bb] = sampleTex(sbImg, uB, vB);
                }

                const idx = (py * _surfSZ + px2) * 4;
                pix[idx]   = Math.round(rr * 255);
                pix[idx+1] = Math.round(gg * 255);
                pix[idx+2] = Math.round(bb * 255);
                pix[idx+3] = Math.round(fade * 255);
              }
            }
            sc.putImageData(imgData, 0, 0);
            drawViewport._surfCache[cKey] = surfOff;
          }

          // Single drawImage — pixel loop already paints only in the surface layer band,
          // so no clip path is needed. Just save/restore for globalAlpha and composite.
          ctx2.save();
          ctx2.globalAlpha *= surfFade;
          ctx2.globalCompositeOperation = 'multiply';
          ctx2.imageSmoothingEnabled = true;
          ctx2.imageSmoothingQuality = 'high';
          ctx2.drawImage(surfOff,
            sp.x - _surfCx, sp.y - _surfCy, _surfSZ, _surfSZ);
          ctx2.restore();
        }
      }
    }

    if(envFlags.water && atmoFade > 0 && b.data.WATER_DATA){
      const WD = b.data.WATER_DATA;
      const maskTex = WD.oceanMaskTexture;
      const maskImg = maskTex && maskTex !== 'None' && textureCache[maskTex];
      if(maskImg && maskImg.complete && maskImg.naturalWidth > 0){
        // Build or reuse a water overlay canvas keyed on the mask + colour state.
        // FIX (Bug 3): include colour alpha values in cache key — previously alpha
        // wasn't hashed so different shallow/sand alpha settings shared the same canvas.
        const sandC   = WD.sand    || {r:.9, g:.86,b:.81,a:1};
        const shalC   = WD.shallow || {r:.1, g:.68,b:1,  a:.4};
        const deepC   = WD.deep    || {r:.1, g:.15,b:.55,a:1};
        const cacheKey = maskTex + '|' + _surfaceSZ()
          + [sandC.r,sandC.g,sandC.b,sandC.a,shalC.r,shalC.g,shalC.b,shalC.a,
             deepC.r,deepC.g,deepC.b,deepC.a].map(v=>v.toFixed(3)).join(',');
        if(!drawViewport._waterCache) drawViewport._waterCache = {};
        let wCanvas = drawViewport._waterCache[cacheKey];
        if(!wCanvas){
          const SZ = _surfaceSZ();
          wCanvas = document.createElement('canvas');
          wCanvas.width = wCanvas.height = SZ;
          const wx2 = wCanvas.getContext('2d');
          // Draw the mask into an offscreen canvas to read pixels
          const mc = document.createElement('canvas');
          mc.width = mc.height = SZ;
          const mx2 = mc.getContext('2d');
          mx2.drawImage(maskImg, 0, 0, SZ, SZ);
          const mData = mx2.getImageData(0, 0, SZ, SZ).data;
          // Build output image
          const oData = wx2.createImageData(SZ, SZ);
          const od = oData.data;
          // The ocean mask is an azimuthal disc projection: 0=open ocean, 128=coastline,
          // 255=land interior.  The coastal gradient on the water side spans roughly
          // maskVal 114-127 (~7-10px wide at 512px canvas resolution).
          //
          // FIX (Bug 2): the previous code used thresholds 116/124 which exposed too
          // wide a visible fringe of cyan/shallow colour.  Inspecting the vanilla Earth
          // mask and comparing to in-game screenshots reveals the water should appear
          // almost entirely as flat deep colour from orbit — only the last ~3-4 value
          // steps immediately before the 128 coast boundary should show any transition.
          //
          // Correct thresholds confirmed by pixel analysis of Earth_OceanMask_V2.png:
          //   0   – 123 : flat deep colour  (open ocean + most of coastal gradient)
          //   124 – 125 : deep → shallow blend  (~2px, nearly invisible)
          //   126 – 127 : shallow → sand blend  (~1-2px, barely a pixel fringe)
          //
          // The shallow colour's own alpha (e.g. Earth's shallow.a = 0.4) is correctly
          // preserved here.  The extra opacity_Surface global scale is applied at draw
          // time via globalAlpha, keeping the two knobs independent.
          const cx = SZ/2, cy = SZ/2, cr = SZ/2;
          for(let py=0; py<SZ; py++){
            for(let px2=0; px2<SZ; px2++){
              const dx = px2-cx, dy = py-cy;
              if(dx*dx+dy*dy > cr*cr) continue; // outside inscribed circle — skip
              const idx = (py*SZ+px2)*4;
              const maskVal = mData[idx];
              if(maskVal >= 128) continue; // land — skip
              let r2,g2,b2,a2;
              if(maskVal < 124){
                // Open ocean — flat deep colour (the vast majority of water pixels)
                r2=deepC.r; g2=deepC.g; b2=deepC.b; a2=deepC.a;
              } else if(maskVal < 126){
                // Narrow deep→shallow fringe (~2 value steps right at the coast)
                const t=(maskVal-124)/2;
                r2=deepC.r+(shalC.r-deepC.r)*t; g2=deepC.g+(shalC.g-deepC.g)*t;
                b2=deepC.b+(shalC.b-deepC.b)*t; a2=deepC.a+(shalC.a-deepC.a)*t;
              } else {
                // Shore pixel — shallow→sand (~2 value steps, right at land edge)
                const t=(maskVal-126)/2;
                r2=shalC.r+(sandC.r-shalC.r)*t; g2=shalC.g+(sandC.g-shalC.g)*t;
                b2=shalC.b+(sandC.b-shalC.b)*t; a2=shalC.a+(sandC.a-shalC.a)*t;
              }
              od[idx]   = Math.round(r2*255);
              od[idx+1] = Math.round(g2*255);
              od[idx+2] = Math.round(b2*255);
              od[idx+3] = Math.round(Math.min(1,a2)*255);
            }
          }
          wx2.putImageData(oData, 0, 0);
          drawViewport._waterCache[cacheKey] = wCanvas;
        }
        // Draw water overlay clipped to planet disc.
        // FIX (Bug 1): apply the same planetTextureRotation and planetTextureCutout
        // transforms used when drawing the surface texture so the ocean mask aligns
        // with the terrain beneath it.  Read live from sidebar when this body is selected.
        let wtCutout = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureCutout  ?? 1;
        let wtRotDeg = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureRotation ?? 0;
        if(selectedBody === name && !liveSync._filling){
          const cutEl = document.getElementById('tt-cut');
          const rotEl = document.getElementById('tt-rot');
          if(cutEl && cutEl.value !== '') wtCutout = parseFloat(cutEl.value) || 1;
          if(rotEl && rotEl.value !== '') wtRotDeg  = parseFloat(rotEl.value) || 0;
        }
        // wtCutoutAbs drives drawHalf sizing — sign of cutout has no visual effect in the editor.
        const wtCutoutAbs = Math.max(0.01, Math.min(1, Math.abs(wtCutout !== 0 ? wtCutout : 1.0)));
        const wtDrawHalf = r / wtCutoutAbs;
        const wtRotRad   = -wtRotDeg * Math.PI / 180;
        // atmoFade gates rendering (same as clouds) — on Titan the thick atmo naturally
        // tints the layer via the atmosphere renderer drawn on top.
        // opacity_Surface controls base transparency.
        const waterAlpha = Math.min(1, (WD.opacity_Surface ?? 0.8));
        ctx2.save();
        // Water clips to plain disc (NOT terrain polygon) — water fills the depressed areas
        // that were cut from the terrain polygon, so clipping to terrain would hide all water.
        ctx2.beginPath();
        ctx2.arc(sp.x, sp.y, Math.max(r, physR_px), 0, Math.PI * 2);
        ctx2.clip();
        ctx2.globalAlpha *= waterAlpha;
        ctx2.translate(sp.x, sp.y);
        ctx2.rotate(wtRotRad);
        ctx2.drawImage(wCanvas, -wtDrawHalf, -wtDrawHalf, wtDrawHalf*2, wtDrawHalf*2);
        ctx2.restore();
      }
    }

    // ── Terrain Texture C — tiled close-up detail overlay ──────────────────
    // terrainTexture_C is a repeating texture tiled in world-space over the
    // surface at surfaceTextureSize_C.x × surfaceTextureSize_C.y metres per tile.
    // It is only meaningful close-up; we fade it in when physR_px > 80px.
    if(envFlags.surface && b.data.TERRAIN_DATA){
      const TTD = b.data.TERRAIN_DATA.TERRAIN_TEXTURE_DATA;
      const tcName = TTD?.terrainTexture_C;
      const tcSize = TTD?.terrainTextureSize_C;
      const tcImg  = tcName && tcName !== 'None' && tcSize &&
                     textureCache[tcName] && textureCache[tcName].complete &&
                     textureCache[tcName].naturalWidth > 0
                     ? textureCache[tcName] : null;
      // Per-texture LOD threshold for C. surfaceLOD_C overrides the default 80px fade-in.
      const _lodC = (TTD?.surfaceLOD_C != null && TTD.surfaceLOD_C >= 0) ? TTD.surfaceLOD_C : 80;
      if(tcImg && physR_px > _lodC){
        // Negative sizes are valid SFS sentinels (-1 = default ~100m); use abs for tiling.
        const tcSzX = tcSize && tcSize.x !== 0 ? Math.abs(tcSize.x) : 100;
        const tcSzY = tcSize && tcSize.y !== 0 ? Math.abs(tcSize.y) : 100;
        const tileW_px = (tcSzX / (bodyRadius_m * radiusMult)) * physR_px;
        const tileH_px = (tcSzY / (bodyRadius_m * radiusMult)) * physR_px;
        if(tileW_px >= 0.5 && tileH_px >= 0.5){
          // Fade: 0 at lodC threshold, full 120px later
          const tcAlpha = Math.min(1, (physR_px - _lodC) / 120) * 0.55;
          ctx2.save();
          // Clip to terrain shape (or disc fallback)
          const _tccp = envFlags.heightmaps && physR_px > terrainDrawThreshold && _terrainClipPath(b, name, sp, Math.max(r, physR_px), bodyRadius_m * radiusMult, terrN, _arcInfo);
          if(_tccp){ _applyTerrainClip(ctx2, _tccp, sp); }
          else { ctx2.beginPath(); ctx2.arc(sp.x, sp.y, Math.max(r, physR_px), 0, Math.PI*2); ctx2.clip(); }
          // Tile the texture in a pattern centred on the body
          ctx2.globalAlpha *= tcAlpha;
          ctx2.globalCompositeOperation = 'multiply';
          // Scale down the source image for texture C when detail < 100 —
          // lower detail → smaller internal canvas → coarser tiling quality.
          const _detailFracC = (typeof window !== 'undefined' && window.terrainDetail != null)
            ? Math.max(0.05, window.terrainDetail / 100) : 1;
          const _tcSrc = (() => {
            if(_detailFracC >= 1) return tcImg;
            const _tcSz = Math.max(4, Math.round(tcImg.naturalWidth * _detailFracC));
            const _tcSzH = Math.max(4, Math.round(tcImg.naturalHeight * _detailFracC));
            const _ckC = `tcDown|${tcName}|${_tcSz}|${_tcSzH}`;
            if(!drawViewport._tcDownCache) drawViewport._tcDownCache = {};
            if(!drawViewport._tcDownCache[_ckC]){
              const _dc = document.createElement('canvas');
              _dc.width = _tcSz; _dc.height = _tcSzH;
              _dc.getContext('2d').drawImage(tcImg, 0, 0, _tcSz, _tcSzH);
              drawViewport._tcDownCache[_ckC] = _dc;
            }
            return drawViewport._tcDownCache[_ckC];
          })();
          const pat = ctx2.createPattern(_tcSrc, 'repeat');
          if(pat){
            // Scale the pattern to tileW_px × tileH_px, anchored at sp
            const mx = new DOMMatrix();
            mx.a = tileW_px / _tcSrc.width;
            mx.d = tileH_px / _tcSrc.height;
            mx.e = sp.x % tileW_px;
            mx.f = sp.y % tileH_px;
            pat.setTransform(mx);
            ctx2.fillStyle = pat;
            // Use the terrain-aware max radius so the fillRect covers the full
            // heightmap silhouette. When the heightmap extends beyond physR_px
            // (e.g. large terrain bumps), using plain `r` leaves the pattern
            // short of the terrain polygon edges, making the square rect boundary
            // visible as a box artifact against the bumpy silhouette.
            const _tcSamp = envFlags.heightmaps && _getTerrainSamples(name, b, bodyRadius_m * radiusMult, terrN, _arcInfo);
            let _tcMaxR = Math.max(r, physR_px);
            if(_tcSamp){
              const R_m = bodyRadius_m * radiusMult;
              for(let _tci = 0; _tci < _tcSamp.heights.length; _tci++){
                const _tcFrac = _tcSamp.heights[_tci] / R_m;
                const _tcR = physR_px * (1 + _tcFrac);
                if(_tcR > _tcMaxR) _tcMaxR = _tcR;
              }
            }
            ctx2.fillRect(sp.x - _tcMaxR - tileW_px, sp.y - _tcMaxR - tileH_px,
                          (_tcMaxR + tileW_px) * 2, (_tcMaxR + tileH_px) * 2);
          }
          ctx2.restore();
        }
      }
    }

    // ── Cloud texture band — gated on outer_px threshold, independent of atmoFade ──
    if(envFlags.clouds && !envFlags.heightmaps){
      const CLD = b.data.ATMOSPHERE_VISUALS_DATA?.CLOUDS;
      if(CLD && CLD.texture && CLD.texture !== 'None'){
        const srcImg = textureCache[CLD.texture];
        if(srcImg && srcImg.complete && srcImg.naturalWidth > 0){
          // ScalePlanetData multiplies all atmosphere heights by atmoMult before shader setup
          const atmoMult  = getAtmoDifficultyMult(b.data);
          const startH_m  = (CLD.startHeight || 0)                              * atmoMult;
          const cloudH_m  = Math.max(1, (CLD.height || 1))                      * atmoMult;
          const rawAlpha  = CLD.alpha || 0;
          const widthM    = Math.max(1, (CLD.width || 1)) * atmoMult; // ScalePlanetData: width *= atmoMult

          if(rawAlpha > 0.005){
            // Match Planet.cs exactly:
            //   _CloudStartY = (R + startH + gradH) / gradH - 1  (line 427)
            //   _CloudSizeY  = (R + gradH) / cloudH              (line 428)
            //   _CloudSizeX  = ceil((R + startH) * 2π / width)   (line 429)
            // Cloud mesh covers the full gradient disc (planet surface → R+gradH).
            // UV v=0 is disc outer edge, increasing inward. _CloudStartY offsets
            // where texture starts; _CloudSizeY tiles it radially.
            const R_eff_px    = bodyRadius_m * radiusMult;
            const gradH_cld   = _gradH_m;
            const atmoOuter_m = R_eff_px + gradH_cld;
            const atmoDisk_px = physR_px * atmoOuter_m / R_eff_px;
            // Cloud disc spans full gradient disc: planet surface → atmo outer
            const inner_px    = physR_px;
            const outer_px    = atmoDisk_px;

            const cldThr = 2;
            if(atmoDisk_px >= cldThr){
              const cldFade = Math.max(0, Math.min(1, (atmoDisk_px - cldThr) / Math.max(cldThr, 0.01)));
              if(cldFade > 0){
                const baseAlpha = Math.min(rawAlpha, 1) * cldFade;

                // _CloudSizeX = ceil((R + startH) * 2π / width)  — Planet.cs line 429
                const numTiles = Math.max(1, Math.ceil((R_eff_px + startH_m) * 6.283185307 / widthM));
                // _CloudSizeY = (R + gradH) / cloudH  — Planet.cs line 428
                const cloudSizeY = (R_eff_px + gradH_cld) / cloudH_m;
                // _CloudStartY = (R + startH + gradH) / gradH - 1  — Planet.cs line 427
                const cloudStartY_val = (R_eff_px + startH_m + gradH_cld) / gradH_cld - 1;

                if(!drawViewport._cldDbg) drawViewport._cldDbg = {};
                if(!drawViewport._cldDbg[name]){ drawViewport._cldDbg[name]=true; console.log(`[CLD] ${name}: R=${R_eff_px}, startH=${startH_m}, cloudH=${cloudH_m}, gradH=${gradH_cld}, numTiles=${numTiles}, cloudSizeY=${cloudSizeY.toFixed(3)}, cloudStartY=${cloudStartY_val.toFixed(3)}`); }

                const cacheKey = 'cld9:' + CLD.texture
                                + '|' + R_eff_px.toFixed(1)
                                + '|' + gradH_cld.toFixed(1)
                                + '|' + startH_m.toFixed(1)
                                + '|' + cloudH_m.toFixed(1)
                                + '|' + numTiles
                                + '|' + cloudSizeY.toFixed(3)
                                + '|' + _surfaceSZ();
                if(!drawViewport._cloudCache) drawViewport._cloudCache = {};
                let wc = drawViewport._cloudCache[cacheKey];
                if(!wc){
                  const SZ = _surfaceSZ();
                  wc = document.createElement('canvas');
                  wc.width = wc.height = SZ;
                  const wctx = wc.getContext('2d');

                  const sc = document.createElement('canvas');
                  sc.width = srcImg.naturalWidth; sc.height = srcImg.naturalHeight;
                  sc.getContext('2d').drawImage(srcImg, 0, 0);
                  const sd = sc.getContext('2d').getImageData(0, 0, sc.width, sc.height).data;
                  const tw = sc.width, th = sc.height;

                  const od = wctx.createImageData(SZ, SZ);
                  const out = od.data;
                  const cx0 = SZ / 2, cy0 = SZ / 2;
                  // outerN = half canvas = full gradient disc radius
                  const outerN = SZ / 2;
                  // innerN = planet surface radius in canvas px
                  const innerN = outerN * (physR_px / atmoDisk_px);

                  const edgeFade = 1.5;
                  for(let py = 0; py < SZ; py++){
                    for(let px2 = 0; px2 < SZ; px2++){
                      const dx = px2 - cx0, dy = py - cy0;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if(dist < innerN - edgeFade || dist > outerN + edgeFade) continue;
                      const innerAlpha = Math.min(1, (dist - (innerN - edgeFade)) / edgeFade);
                      const outerAlpha = Math.min(1, ((outerN + edgeFade) - dist) / edgeFade);
                      const edgeA = Math.min(innerAlpha, outerAlpha);
                      // v_disc: 0 at atmo outer edge, 1 at planet surface — matches shader
                      const v_disc = Math.max(0, Math.min(1, (outerN - dist) / (outerN - innerN)));
                      // shader: sample at cloudStartY + v_disc * cloudSizeY, tiled
                      const v_raw = cloudStartY_val + v_disc * cloudSizeY;
                      const v_frac = v_raw - Math.floor(v_raw);
                      let ang = Math.atan2(dy, dx) / (2 * Math.PI);
                      if(ang < 0) ang += 1;
                      const u = (ang * numTiles) % 1;
                      const sx = Math.min(tw - 1, Math.floor(u * tw));
                      // Unity V=0 is texture bottom; Canvas2D y=0 is top — flip
                      const sy = Math.min(th - 1, Math.floor(v_frac * th));
                      const si = (sy * tw + sx) * 4;
                      const oi = (py * SZ + px2) * 4;
                      out[oi]     = sd[si];
                      out[oi + 1] = sd[si + 1];
                      out[oi + 2] = sd[si + 2];
                      out[oi + 3] = Math.round(sd[si + 3] * edgeA);
                    }
                  }
                  wctx.putImageData(od, 0, 0);
                  drawViewport._cloudCache[cacheKey] = wc;
                }
                ctx2.save();
                ctx2.globalAlpha *= baseAlpha;
                ctx2.imageSmoothingEnabled = true;
                ctx2.imageSmoothingQuality = 'high';
                ctx2.drawImage(wc, sp.x - outer_px, sp.y - outer_px, outer_px * 2, outer_px * 2);
                ctx2.restore();
              }
            }
          }
        }
      }
    }

    // ── FOG overlay ────────────────────────────────────────────────────────
    // In-game: FOG.Evaluate(viewDistance) returns a single Color that is set as
    // a flat _Fog uniform on the terrain shader. The limb effect is produced by
    // the 3D shader using surface normals. In 2D we approximate this as a radial
    // gradient: fully transparent at the disc centre, full fog colour at the limb.
    //
    // FOG key `distance` = camera view distance in metres (Z from planet surface),
    // NOT altitude. We evaluate the gradient at bodyRadius_m (typical map-view
    // distance) to get the representative fog colour for the current zoom level,
    // then apply it as a centre→limb radial, scaled by dbgFogOpacity.
    if(envFlags.fog && !envFlags.heightmaps && atmoFade > 0 && b.data.ATMOSPHERE_VISUALS_DATA?.FOG?.keys){
      const fogKeys = b.data.ATMOSPHERE_VISUALS_DATA.FOG.keys;
      if(fogKeys.length >= 1){
        // ColorGradient.Evaluate — mirrors the C# implementation exactly:
        // clamp below first key, clamp above last key, lerp between keys.
        const evalFog = (keys, dist) => {
          const sorted = keys.slice().sort((a,b) => a.distance - b.distance);
          if(dist <= sorted[0].distance) return sorted[0].color;
          const last = sorted[sorted.length - 1];
          if(dist >= last.distance) return last.color;
          for(let i = 0; i < sorted.length - 1; i++){
            if(dist <= sorted[i+1].distance){
              const t = (dist - sorted[i].distance) / (sorted[i+1].distance - sorted[i].distance);
              const a = sorted[i].color, b = sorted[i+1].color;
              return { r: a.r+(b.r-a.r)*t, g: a.g+(b.g-a.g)*t,
                       b: a.b+(b.b-a.b)*t, a: a.a+(b.a-a.a)*t };
            }
          }
          return last.color;
        };
        // Evaluate at current view distance: physR_px encodes how zoomed we are,
        // but fog should represent a fixed "from space" look — use bodyRadius_m.
        const fogColor = evalFog(fogKeys, bodyRadius_m);
        const {r:fr, g:fg, b:fb, a:fa} = fogColor;
        const fogAlpha = Math.min(1, fa * dbgFogOpacity);
        if(fogAlpha > 0.005){
          // ── Fog is rendered from a cached 256×256 offscreen canvas ──
          // Previously ctx2.createRadialGradient used screen-space sp.x/sp.y/r, which
          // changes every frame while zooming — a new gradient object was allocated on
          // every draw call. Instead, build a fixed canvas once per fog colour+alpha
          // combination and scale it with drawImage (same approach as water/clouds).
          const frI = Math.round(fr*255), fgI = Math.round(fg*255), fbI = Math.round(fb*255);
          const fogCacheKey = 'fog:' + frI + ',' + fgI + ',' + fbI + ',' + fogAlpha.toFixed(4);
          if(!drawViewport._fogCache) drawViewport._fogCache = {};
          let fogCanvas = drawViewport._fogCache[fogCacheKey];
          if(!fogCanvas){
            const SZ = 256;
            fogCanvas = document.createElement('canvas');
            fogCanvas.width = fogCanvas.height = SZ;
            const fCtx = fogCanvas.getContext('2d');
            const half = SZ / 2;
            // Gradient centre→limb. Full opacity is placed at stop 0.94 so the
            // gradient is already at maximum density before reaching the canvas edge
            // and the arc-clip anti-alias fringe. The last stop repeats that opacity
            // all the way to the edge so no under-filled ring survives.
            const fogGrad = fCtx.createRadialGradient(half, half, 0, half, half, half);
            fogGrad.addColorStop(0,    `rgba(${frI},${fgI},${fbI},0)`);
            fogGrad.addColorStop(0.5,  `rgba(${frI},${fgI},${fbI},${(fogAlpha*0.25).toFixed(4)})`);
            fogGrad.addColorStop(0.94, `rgba(${frI},${fgI},${fbI},${fogAlpha.toFixed(4)})`);
            fogGrad.addColorStop(1.0,  `rgba(${frI},${fgI},${fbI},${fogAlpha.toFixed(4)})`);
            fCtx.fillStyle = fogGrad;
            fCtx.fillRect(0, 0, SZ, SZ);
            drawViewport._fogCache[fogCacheKey] = fogCanvas;
          }
          const fogR_px = physR_px;
          ctx2.save();
          ctx2.globalAlpha = 1;
          ctx2.globalCompositeOperation = 'source-over';
          ctx2.beginPath(); ctx2.arc(sp.x, sp.y, fogR_px, 0, Math.PI*2); ctx2.clip();
          ctx2.drawImage(fogCanvas, sp.x - fogR_px, sp.y - fogR_px, fogR_px * 2, fogR_px * 2);
          ctx2.restore();
        }
      }
    }

    // ── Front Clouds overlay (FRONT_CLOUDS_DATA) ──
    // Game builds the mesh at radius = planet.Radius + frontClouds.height, so the
    // cloud disc extends *beyond* the surface. Match that here.
    // Soft edge fade: the game's FrontClouds shader uses a _FadeZoneM that fades
    // alpha toward zero at the disc edge. We replicate this with a destination-out
    // radial mask applied after drawing the image.
    if(envFlags.fclouds && !envFlags.heightmaps && atmoFade > 0 && b.data.FRONT_CLOUDS_DATA){
      const FCD = b.data.FRONT_CLOUDS_DATA;
      const fcTex = FCD.cloudsTexture;
      const fcImg = fcTex && fcTex !== 'None' && textureCache[fcTex];
      if(fcImg && fcImg.complete && fcImg.naturalWidth > 0){
        let fcCutout = FCD.cloudTextureCutout ?? 0.5;
        if(selectedBody === name && !liveSync._filling){
          const fcCutEl = document.getElementById('fc-cut');
          if(fcCutEl && fcCutEl.value !== '') fcCutout = parseFloat(fcCutEl.value) ?? fcCutout;
        }
        const fcCutClamped = Math.max(0, Math.min(1, fcCutout));
        const fcAlpha = fcCutClamped * atmoFade;
        if(fcAlpha > 0.01){
          const fcHeight_m  = FCD.height || 0;
          const fcFadeZone_m = FCD.fadeZoneHeight || 0;
          const fcR_px      = physR_px * (bodyRadius_m + fcHeight_m) / bodyRadius_m;

          // fadeZoneHeight is world-space — convert to a fraction of the cloud radius
          // so it's zoom-independent (used in cache key and for rendering).
          const fadeZoneFrac = fcFadeZone_m > 0
            ? Math.min(1, fcFadeZone_m / (bodyRadius_m + fcHeight_m))
            : 0.08; // fallback: 8% of cloud radius if not specified

          // ── Build or retrieve front-cloud offscreen canvas ──
          // Cache key is entirely world-space: texture + cutout + fadeZone fraction.
          // The canvas is fixed 512x512 and scaled by drawImage — zoom is NOT part of
          // the key. Previously a new screen-sized canvas was created every frame
          // (fcDiam = fcR_px*2 pixels, growing to thousands at high zoom), which caused
          // massive per-frame allocations and browser crashes when zooming in.
          const fcCacheKey = 'fc:' + fcTex + '|' + fcCutClamped.toFixed(3) + '|' + fadeZoneFrac.toFixed(4) + '|' + _surfaceSZ();
          if(!drawViewport._fcCache) drawViewport._fcCache = {};
          let fcOff = drawViewport._fcCache[fcCacheKey];
          if(!fcOff){
            const SZ = _surfaceSZ();
            fcOff = document.createElement('canvas');
            fcOff.width = fcOff.height = SZ;
            const fcCtx = fcOff.getContext('2d');
            const cx = SZ / 2, cy = SZ / 2;
            const fcR_sz = SZ / 2; // disc radius in canvas coords

            // 1. Draw the cloud image clipped to the cloud disc radius.
            fcCtx.save();
            fcCtx.beginPath(); fcCtx.arc(cx, cy, fcR_sz, 0, Math.PI*2); fcCtx.clip();
            const dh = fcCutClamped > 0 ? fcR_sz / fcCutClamped : fcR_sz;
            fcCtx.drawImage(fcImg, cx - dh, cy - dh, dh*2, dh*2);
            fcCtx.restore();

            // 2. Apply a destination-out radial fade at the disc edge.
            const fadeZone_sz = fcR_sz * fadeZoneFrac;
            fcCtx.globalCompositeOperation = 'destination-out';
            const fadeGrad = fcCtx.createRadialGradient(cx, cy, Math.max(0, fcR_sz - fadeZone_sz), cx, cy, fcR_sz);
            fadeGrad.addColorStop(0, 'rgba(0,0,0,0)');
            fadeGrad.addColorStop(1, 'rgba(0,0,0,1)');
            fcCtx.fillStyle = fadeGrad;
            fcCtx.fillRect(0, 0, SZ, SZ);

            drawViewport._fcCache[fcCacheKey] = fcOff;
          }

          // 3. Composite the cached canvas onto the main canvas scaled to screen size.
          ctx2.save();
          ctx2.globalAlpha = fcAlpha;
          ctx2.drawImage(fcOff, sp.x - fcR_px, sp.y - fcR_px, fcR_px * 2, fcR_px * 2);
          ctx2.restore();
        }
      }
    }

    // ── Terrain surface helper (mirrors _lmSurfaceXY from landmarks) ──
    // Returns screen-space radius at a given trig angle (radians, CCW).
    // Uses the exact same formula as landmark placement: physR_px * (1 + h / radius_m)
    const _terrRes360 = (envFlags.heightmaps && b.data.TERRAIN_DATA && physR_px > terrainDrawThreshold)
      ? _getTerrainSamples(name, b, bodyRadius_m * radiusMult, 360, null)
      : null;
    const _terrRadius_m = bodyRadius_m * radiusMult;
    function _surfaceRpx(rad) {
      if(_terrRes360 && _terrRes360.heights){
        const normAng = ((rad % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
        const idx = Math.round(normAng / (Math.PI*2) * _terrRes360.N) % _terrRes360.N;
        const h = _terrRes360.heights[idx] || 0;
        return Math.max(r, physR_px * (1 + h / _terrRadius_m));
      }
      return r;
    }

    // ── Selection ring — traces the actual terrain surface ──
    if(selectedBody === name){
      const RING_GAP = 6;
      const ringSteps = 128;
      ctx2.beginPath();
      for(let _si = 0; _si <= ringSteps; _si++){
        const rad = (_si / ringSteps) * Math.PI * 2;
        const rPx = _surfaceRpx(rad) + RING_GAP;
        const px = sp.x + rPx * Math.cos(rad);
        const py = sp.y - rPx * Math.sin(rad);
        _si === 0 ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py);
      }
      ctx2.closePath();
      ctx2.strokeStyle='rgba(80,180,255,0.75)'; ctx2.lineWidth=1.5;
      ctx2.setLineDash([4,4]); ctx2.stroke(); ctx2.setLineDash([]);
    }

    ctx2.restore(); // end bodyFadeA globalAlpha

    // ── Label — fades out earlier than the body ──
    if(labelFadeA > 0.01){
      const fontSize = Math.round(9 * iconScale);
      ctx2.globalAlpha = labelFadeA;
      ctx2.font = `${fontSize}px "JetBrains Mono",monospace`;
      ctx2.textAlign = 'center';
      const displayName = (selectedBody===name && drawViewport._pendingName) ? drawViewport._pendingName : name;
      // Sample terrain at bottom of planet (trig 3π/2 = canvas straight-down)
      // so the label always sits below the actual surface, not buried in terrain.
      const bottomRpx = _surfaceRpx(Math.PI * 1.5);
      const labelY = sp.y + bottomRpx + fontSize + 2;
      // Dark shadow for readability against any background
      ctx2.fillStyle = 'rgba(0,0,0,0.65)';
      ctx2.fillText(displayName, sp.x+1, labelY + 1);
      ctx2.fillStyle = selectedBody===name ? 'rgba(180,230,255,0.98)' : 'rgba(160,210,255,0.85)';
      ctx2.fillText(displayName, sp.x, labelY);
      ctx2.globalAlpha = 1;
    }

    // ── Landmarks — show midpoint dot+label always when zoomed close enough (physR_px > 40),
    //              AND show full arc extent in neon when "SHOW ON PLANET" is checked ──
    const lms = b.data.LANDMARKS;
    if(lms && lms.length && physR_px > 40){
      const lmAlpha = Math.min(1, (physR_px - 40) / 60);
      // Neon palette — one colour per landmark index, cycles if more than 6
      const NEON_COLORS = [
        '#00ffff',   // cyan
        '#ff00ff',   // magenta
        '#00ff44',   // green
        '#ffee00',   // yellow
        '#ff6600',   // orange
        '#aa00ff',   // violet
      ];
      const showLmArcs = document.getElementById('lm-show')?.checked && selectedBody === name;

      // ── Terrain height lookup for landmark placement ──────────────────────
      // Fetch the N=360 full-circle sample (always cached; non-blocking).
      // When heightmaps are enabled and terrain exists, use actual surface radius
      // so landmark dots/arcs sit on the terrain surface rather than on the bare disc.
      const _lmTerrRes = envFlags.heightmaps && b.data.TERRAIN_DATA
        ? _getTerrainSamples(name, b, bodyRadius_m * radiusMult, 360, null)
        : null;
      const _lmRadius_m = bodyRadius_m * radiusMult;

      // Given a SFS angle in degrees → screen-space {x,y} on the terrain surface.
      // SFS convention: 0°=right, 90°=top.
      // Canvas convention: angle 0=right, positive=CW (y-down).
      // So canvas_rad = deg * PI/180, and we use cos(rad) for x, -sin(rad) for y
      // (because SFS +angle is CCW = canvas -y direction).
      function _lmSurfaceXY(deg) {
        const rad = deg * Math.PI / 180;  // trig angle (CCW)
        let rPx = physR_px;
        if(_lmTerrRes) {
          // Find nearest sample index for this angle
          const normAng = ((rad % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
          const idx = Math.round(normAng / (Math.PI*2) * _lmTerrRes.N) % _lmTerrRes.N;
          const h = _lmTerrRes.heights[idx] || 0;
          rPx = physR_px * (1 + h / _lmRadius_m);
        }
        return { x: sp.x + rPx * Math.cos(rad), y: sp.y - rPx * Math.sin(rad), rPx };
      }

      lms.forEach((lm, lmIdx) => {
        if(!lm.name) return;
        const neon = NEON_COLORS[lmIdx % NEON_COLORS.length];
        const midDeg = (lm.startAngle + lm.endAngle) / 2;
        const { x: lx, y: ly } = _lmSurfaceXY(midDeg);

        // ── Full arc extent (neon glow) — follows terrain surface ──
        if(showLmArcs){
          // Build a polyline along the terrain surface between startAngle and endAngle.
          // Step every 1° so the arc hugs the terrain bumps.
          const angMin = Math.min(lm.startAngle, lm.endAngle);
          const angMax = Math.max(lm.startAngle, lm.endAngle);
          const arcSteps = Math.max(2, Math.ceil(angMax - angMin));

          // Helper: build Path2D polyline along terrain surface for this arc
          function _buildLmArcPath(offset_px) {
            const p = new Path2D();
            for(let si = 0; si <= arcSteps; si++){
              const deg = angMin + (si / arcSteps) * (angMax - angMin);
              const rad = deg * Math.PI / 180;
              let rPx = physR_px;
              if(_lmTerrRes){
                const normAng = ((rad % (Math.PI*2)) + Math.PI*2) % (Math.PI*2);
                const idx = Math.round(normAng / (Math.PI*2) * _lmTerrRes.N) % _lmTerrRes.N;
                const h = _lmTerrRes.heights[idx] || 0;
                rPx = physR_px * (1 + h / _lmRadius_m);
              }
              rPx += offset_px;
              const px = sp.x + rPx * Math.cos(rad);
              const py = sp.y - rPx * Math.sin(rad);
              si === 0 ? p.moveTo(px, py) : p.lineTo(px, py);
            }
            return p;
          }

          // Outer glow pass
          ctx2.save();
          ctx2.globalAlpha = lmAlpha * 0.45;
          ctx2.strokeStyle = neon;
          ctx2.lineWidth = 10;
          ctx2.lineCap = 'round';
          ctx2.shadowColor = neon;
          ctx2.shadowBlur = 14;
          ctx2.stroke(_buildLmArcPath(5));
          ctx2.restore();

          // Solid neon arc
          ctx2.save();
          ctx2.globalAlpha = lmAlpha * 0.9;
          ctx2.strokeStyle = neon;
          ctx2.lineWidth = 3;
          ctx2.lineCap = 'round';
          ctx2.shadowColor = neon;
          ctx2.shadowBlur = 8;
          ctx2.stroke(_buildLmArcPath(5));
          ctx2.restore();
        }

        // ── Midpoint dot ──
        ctx2.save();
        ctx2.globalAlpha = lmAlpha;
        ctx2.beginPath(); ctx2.arc(lx, ly, 3.5, 0, Math.PI*2);
        ctx2.fillStyle = showLmArcs ? neon : 'rgba(255,255,255,0.95)';
        if(showLmArcs){
          ctx2.shadowColor = neon;
          ctx2.shadowBlur = 8;
        }
        ctx2.fill();

        // ── Label ──
        ctx2.font = 'bold 12px "JetBrains Mono",monospace';
        ctx2.fillStyle = showLmArcs ? neon : 'rgba(255,255,255,0.95)';
        ctx2.textAlign = 'center';
        ctx2.shadowColor = showLmArcs ? neon : 'rgba(0,0,0,0.85)';
        ctx2.shadowBlur = showLmArcs ? 8 : 4;
        ctx2.fillText(lm.name, lx, ly - 10);
        ctx2.restore();
      });
      ctx2.globalAlpha = 1;
    }

    // ── Flat Zones — draw arc on circumference when checkbox is on ──
    const showFZ = document.getElementById('fz-show')?.checked && selectedBody === name;
    if(showFZ && r > 8){
      // Read live from DOM so slider/input changes update immediately without Apply
      const liveFzs = collectFlatZones();
      const fzs = liveFzs.length ? liveFzs : (b.data.TERRAIN_DATA?.flatZones || []);
      if(fzs && fzs.length){
        fzs.forEach(fz => {
          // fz.angle is centre in radians, fz.width is half-width in metres
          // Convert to angular half-width: width / radius (in rad)
          const bodyR = (b.data.BASE_DATA||{}).radius || 1;
          const centre = fz.angle || 0; // radians, SFS coord (0=right,PI/2=top)
          const halfW  = (fz.width || 0) / bodyR; // radians
          // SFS to canvas: canvas_ang = -sfs_rad
          const cStart = -(centre + halfW);
          const cEnd   = -(centre - halfW);
          // Outer glow pass
          ctx2.beginPath();
          ctx2.arc(sp.x, sp.y, r + 4, cStart, cEnd);
          ctx2.strokeStyle = 'rgba(80,255,160,0.25)';
          ctx2.lineWidth = 7;
          ctx2.lineCap = 'round';
          ctx2.stroke();
          // Solid arc
          ctx2.beginPath();
          ctx2.arc(sp.x, sp.y, r + 4, cStart, cEnd);
          ctx2.strokeStyle = 'rgba(120,255,180,1.0)';
          ctx2.lineWidth = 3;
          ctx2.lineCap = 'round';
          ctx2.stroke();
          // Tick spike at centre
          const cx2 = sp.x + (r+2) * Math.cos(-centre);
          const cy2 = sp.y + (r+2) * Math.sin(-centre);
          const ox = sp.x + (r+14) * Math.cos(-centre);
          const oy = sp.y + (r+14) * Math.sin(-centre);
          ctx2.beginPath(); ctx2.moveTo(cx2, cy2); ctx2.lineTo(ox, oy);
          ctx2.strokeStyle = 'rgba(120,255,180,0.9)';
          ctx2.lineWidth = 2; ctx2.stroke();
        });
        ctx2.lineCap = 'butt';
      }
    }
  });

  bodyScreenPos = {};
  names.forEach(name => {
    const wp = bodyWorldPos[name] || {x:0, y:0};
    const sp = worldToScreen(wp.x, wp.y);
    bodyScreenPos[name] = sp; // always store for hit-test
  });

  // ── Post-processing overlay — applied after world render, before editor overlays ──
  // (SOI circles, physAtmo disk, labels are editor-only and must not be colour-graded)
  if(envFlags.postProc){
    // Prefer system center PP keys; fall back to any body that has keys.
    let _ppBody = null;
    const _cname = Object.keys(bodies).find(n => bodies[n].isCenter);
    if(_cname && bodies[_cname].data?.POST_PROCESSING?.keys?.length) _ppBody = bodies[_cname];
    if(!_ppBody){
      const _fallback = Object.keys(bodies).find(n => bodies[n].data?.POST_PROCESSING?.keys?.length);
      if(_fallback) _ppBody = bodies[_fallback];
    }
    if(_ppBody){
      const _ppKey = getPostProcessKey(_ppBody.data, 0);
      if(_ppKey) _applyPostProcessingOverlay(ctx2, vp.width, vp.height, _ppKey);
    }
  }

  // ── SOI pass — drawn on top of everything else ──
  if(envFlags.soi){
    ctx2.save();
    names.forEach(name => {
      const b = bodies[name];
      if(b.isCenter || !b.data.ORBIT_DATA) return;

      const soiR_m = computeSOI_m(name);
      if(!soiR_m || soiR_m <= 0) return;

      const wp  = bodyWorldPos[name] || {x:0, y:0};
      const sp  = worldToScreen(wp.x, wp.y);
      const sc  = getSMAScale();
      const soiR_px = soiR_m * sc * vpZ;  // SOI radius in screen pixels

      // Cull: SOI circle entirely off-screen
      const W2 = vp.width, H2 = vp.height;
      if(sp.x + soiR_px < 0 || sp.x - soiR_px > W2 ||
         sp.y + soiR_px < 0 || sp.y - soiR_px > H2) return;

      // Fade-out when the SOI circle is very small on screen (< 10px = almost invisible)
      // Fade-out also when very far away — use body's own LOD fade value.
      const bodyF   = bodyFadeVal[name] ?? 1;
      const sizeFade = Math.max(0, Math.min(1, (soiR_px - 6) / 10));
      let   alpha    = bodyF * sizeFade;

      // Selected body always gets full SOI alpha
      if(selectedBody === name) alpha = Math.max(alpha, 0.85);

      if(alpha < 0.01) return;

      const isSelected = selectedBody === name;

      // ── Draw SOI circle ──
      // When the SOI is larger than the viewport we are inside it — only a small
      // arc is visible. Draw only that arc with a fixed segment count so cost is
      // O(1) regardless of how large soiR_px grows.
      ctx2.beginPath();
      if(soiR_px > diagPx * 0.5) {
        const toVX = W2 * 0.5 - sp.x;
        const toVY = H2 * 0.5 - sp.y;
        const baseAngle = Math.atan2(toVY, toVX);
        const halfAngle = Math.min(Math.PI, (diagPx * 2.4) / soiR_px);
        const segs = 48;
        const startA = baseAngle - halfAngle;
        const arcStep = (halfAngle * 2) / segs;
        for(let i = 0; i <= segs; i++){
          const a = startA + i * arcStep;
          const px = sp.x + soiR_px * Math.cos(a);
          const py = sp.y + soiR_px * Math.sin(a);
          i === 0 ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py);
        }
        // open arc — no closePath
      } else {
        const sides = Math.max(32, Math.min(96, Math.ceil(soiR_px * 0.5)));
        const step  = (Math.PI * 2) / sides;
        for(let i = 0; i <= sides; i++){
          const a = i * step;
          const px = sp.x + soiR_px * Math.cos(a);
          const py = sp.y + soiR_px * Math.sin(a);
          i === 0 ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py);
        }
        ctx2.closePath();
      }

      if(isSelected){
        ctx2.setLineDash([8, 5]);
        ctx2.strokeStyle = `rgba(192,128,255,${(alpha * 0.9).toFixed(3)})`;
        ctx2.lineWidth = 1.5;
      } else {
        ctx2.setLineDash([4, 6]);
        ctx2.strokeStyle = `rgba(160,100,255,${(alpha * 0.55).toFixed(3)})`;
        ctx2.lineWidth = 1;
      }
      ctx2.stroke();
      ctx2.setLineDash([]);

      // Small label showing SOI radius when body is selected or SOI > 40px
      if((isSelected || soiR_px > 40) && alpha > 0.2){
        const soiKm = soiR_m / 1000;
        const soiLabel = soiKm >= 1e6
          ? (soiKm / 1e6).toFixed(2) + ' Gm'
          : soiKm >= 1e3
          ? (soiKm / 1e3).toFixed(1) + ' Mm'
          : soiKm.toFixed(0) + ' km';
        ctx2.globalAlpha = alpha * 0.75;
        ctx2.font = '8px "JetBrains Mono",monospace';
        ctx2.fillStyle = isSelected ? 'rgba(210,170,255,0.9)' : 'rgba(180,140,255,0.75)';
        ctx2.textAlign = 'center';
        ctx2.fillText('SOI ' + soiLabel, sp.x, sp.y - soiR_px - 4);
        ctx2.globalAlpha = 1;
      }
    });
    ctx2.restore();
  }
}

function shadeHex(hex, amt){
  // darken/lighten a hex colour string by amt (negative = darker)
  try {
    let c = hex.trim().replace('#','');
    if(c.length===3) c=c.split('').map(x=>x+x).join('');
    const n = parseInt(c,16);
    const r = Math.max(0,Math.min(255,((n>>16)&0xff)+amt));
    const g = Math.max(0,Math.min(255,((n>>8)&0xff)+amt));
    const b = Math.max(0,Math.min(255,(n&0xff)+amt));
    return `rgb(${r},${g},${b})`;
  } catch(e){ return hex; }
}



// ══════════════════════════════════════════════════════════════════════════════
//  SFS TERRAIN ENGINE — HeightMap evaluator + TerrainSampler JS port
//  Mirrors: HeightMap.cs · TerrainSampler.cs · TerrainModule.cs
// ══════════════════════════════════════════════════════════════════════════════

// ── HeightMap cache — keyed by asset name ────────────────────────────────────
const _hmCache = {};

// ── HeightMap.EvaluateDoubleOut — mirrors game C# exactly ────────────────────
// Game: a *= (points.Length-1); num = (int)a % (points.Length-1); frac = a % 1
// The caller passes a as angle_rad * (radius_m / width), which can be a very
// large number (e.g. 20000+). Operating directly on such values loses fractional
// precision: at a=80,000,000 a float64 has ~1 ULP of ~0.016, so
// (a - Math.floor(a)) snaps to 0 or 1 in chunks -> hard steps -> rectangular blocks.
// Fix: wrap a to [0,1) at low magnitude first, then scale by N.
function _hmEval(points, a) {
  const N = points.length - 1; // index range 0..N-1; points[N] is wrap sentinel
  if (N <= 0) return 0;
  // Wrap to [0,1) before scaling -- preserves fractional precision regardless of
  // how large the tiling multiplier (radius_m/width) is.
  a = ((a % 1) + 1) % 1;
  a *= N;
  const lo = Math.trunc(a) | 0;             // integer index, always in [0, N-1]
  const t  = a - lo;                        // fractional part, precise since a < N+1
  return points[lo] * (1 - t) + points[lo + 1] * t;
}

// ── Parse JSON-text heightmap → Float64Array ──────────────────────────────────
function _parseHmText(content, filename) {
  const label = filename ? `"${filename}"` : '(unknown)';
  if (!content || !content.trim()) {
    console.warn(`[SFS|HM] ${label}: empty content`);
    return new Float64Array([0, 1]);
  }

  // ── Format 1: Unity JsonUtility  { "points": [0.1, 0.2, ...] }
  try {
    const obj = JSON.parse(content);
    if (Array.isArray(obj.points) && obj.points.length > 1) {
      console.log(`[SFS|HM] ${label}: parsed JSON {points:[]} → ${obj.points.length} pts, range [${Math.min(...obj.points).toFixed(4)}, ${Math.max(...obj.points).toFixed(4)}]`);
      return new Float64Array(obj.points);
    }
    if (Array.isArray(obj) && obj.length > 1) {
      console.log(`[SFS|HM] ${label}: parsed JSON array → ${obj.length} pts`);
      return new Float64Array(obj);
    }
    console.warn(`[SFS|HM] ${label}: JSON parsed OK but no usable array (keys: ${Object.keys(obj).join(',')})`);
  } catch(e) {
    console.log(`[SFS|HM] ${label}: not JSON (${e.message.slice(0,40)}), trying plain float list…`);
  }

  // ── Format 2: plain whitespace/comma-separated floats (some export tools)
  const nums = content.trim().split(/[\s,;]+/).map(Number).filter(v => !isNaN(v));
  if (nums.length > 1) {
    console.log(`[SFS|HM] ${label}: parsed plain floats → ${nums.length} pts, range [${Math.min(...nums).toFixed(4)}, ${Math.max(...nums).toFixed(4)}]`);
    return new Float64Array(nums);
  }

  console.error(`[SFS|HM] ${label}: FAILED to parse — content starts with: ${JSON.stringify(content.slice(0,80))}`);
  return new Float64Array([0, 1]);
}

// ── Parse PNG heightmap → Promise<Float64Array> ───────────────────────────────
// SFS PNG heightmaps are silhouette images: terrain fills from the bottom up.
// Encoding: black = sky/empty, non-black = terrain body.
// Per column, scan TOP→BOTTOM to find the first non-black pixel.
// That row y gives height fraction = 1 - (y / H)  (0=flat, 1=full radius).
// Files are RGB with no alpha (sometimes JPEG data inside a .png extension).
// A luminance threshold of 8 rejects compression noise from near-black sky.
// Game convention: column x → points[W - x - 1] (horizontally mirrored).
function _parseHmPng(dataUrl) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const W = img.width, H = img.height;
      const oc = document.createElement('canvas');
      oc.width = W; oc.height = H;
      oc.getContext('2d').drawImage(img, 0, 0);
      const px = oc.getContext('2d').getImageData(0, 0, W, H).data;

      // Detect whether alpha channel varies (true RGBA PNG with transparency mask).
      // JPEG-inside-PNG and plain RGB PNGs will have alpha=255 everywhere.
      let hasAlphaVariation = false;
      for (let i = 3; i < px.length; i += 4) {
        if (px[i] < 255) { hasAlphaVariation = true; break; }
      }

      // Game (HeightMap.cs): scan bottom→top (Unity Y-up, j=0 is bottom row).
      // First pixel where alpha < 1.0 = terrain top edge.
      // height = (j + alpha_frac) / H   where j=0 means bottom of image.
      // Canvas pixel data is Y-down, so bottom row = index (H-1-j).
      // Only alpha is used — RGB content is irrelevant.
      const pts = new Float64Array(W);
      for (let x = 0; x < W; x++) {
        let frac = 1.0; // default: full height (all pixels opaque = solid column)
        for (let j = 0; j < H; j++) {
          // j=0 → bottom of image → canvas row (H-1)
          const canvasY = H - 1 - j;
          const a = px[(canvasY * W + x) * 4 + 3] / 255;
          if (a < 1.0) {
            frac = (j + a) / H;
            break;
          }
        }
        pts[W - x - 1] = frac;
      }
      if (!hasAlphaVariation) {
        console.warn(`[SFS|HM] PNG has no alpha variation — all columns will be height 1.0. ` +
          `SFS heightmap PNGs must have an alpha channel (RGBA). JPEG files are not supported.`);
      }

      resolve(pts);
    };
    img.onerror = () => resolve(new Float64Array([0, 1]));
    img.src = dataUrl;
  });
}

// ── Resolve heightmap by name → Float64Array (sync) or null (loading) ────────
function _getHeightMap(hmName) {
  if (!hmName || hmName === 'null' || hmName === 'None') return new Float64Array([0, 1]);
  if (_hmCache[hmName] instanceof Float64Array) return _hmCache[hmName];
  if (_hmCache[hmName]) return null; // Promise in-flight

  // Search assets — match by full name OR basename (formula uses name without extension,
  // but custom uploaded files have e.name = "Earth.txt")
  const assetList = (typeof assets !== 'undefined') ? assets.heightmaps : [];
  const entry = assetList.find(e =>
    e.name === hmName ||
    e.name.replace(/\.[^.]+$/, '') === hmName
  );

  if (!entry) {
    // Do NOT permanently cache flat here — assets load async and may arrive later.
    // Return flat without caching so the next render retries the lookup.
    return new Float64Array([0, 1]);
  }

  if (entry.content) {
    // .txt heightmap — parse JSON immediately and cache by lookup name
    const parsed = _parseHmText(entry.content, entry.name);
    _hmCache[hmName] = parsed;
    return _hmCache[hmName];
  }

  if (entry.url) {
    _hmCache[hmName] = _parseHmPng(entry.url).then(pts => {
      _hmCache[hmName] = pts;
      if (typeof drawViewport === 'function') drawViewport();
    });
    return null;
  }

  return new Float64Array([0, 1]);
}

// ── TerrainSampler JS port ────────────────────────────────────────────────────
// Mirrors Compiler.Compile() + Executor.Calculate().
// Returns Float64Array of heights (metres), or null if an asset is still loading.
//
// KEY DIFFERENCES FROM GAME:
//   - surfaceArea = radius_m  (game passes planet.data.basics.radius)
//   - Strings in formula lines may be quoted ("name") OR bare identifiers (name)
//   - OUTPUT is the required output variable name (game checks userVariables["OUTPUT"])
//
function _evalTerrainFormula(formulaLines, angles_rad, radius_m) {
  if (!formulaLines || formulaLines.length === 0) return null;

  const N = angles_rad.length;
  const userVars = {};
  // current output target — mirrors sampler.output pointer
  let outputTarget = new Float64Array(N); // default flat if no OUTPUT assigned
  let outputName = null;

  function getVar(name) {
    if (!userVars[name]) userVars[name] = new Float64Array(N);
    return userVars[name];
  }

  // ── Parser — mirrors game's character-by-character approach ─────────────────
  // Handles: VARNAME = FUNC(args)  and  FUNC(args)
  // Args: quoted strings "foo", bare identifiers bar, numbers 123.4
  for (const rawLine of formulaLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;

    // State machine parser (mirrors game exactly)
    let inString = false, inIdent = false, inNumber = false, inFunc = false;
    let strBuf = null, identBuf = null, numBuf = null;
    let fname = '', varName = null, isAssign = false;
    const args = [];

    for (let ci = 0; ci < line.length; ci++) {
      const c = line[ci];

      if (!inFunc) {
        // Outside function call — parsing "VARNAME =" or "FUNCNAME"
        if (c === '(') {
          // Open function
          if (inIdent) { fname = identBuf; identBuf = null; inIdent = false; }
          inFunc = true;
        } else if (c === '=' && inIdent) {
          // Assignment: varName = ...
          varName = identBuf.trim(); identBuf = null; inIdent = false; isAssign = true;
        } else if (c === ' ' || c === '\t') {
          // whitespace — if we were accumulating an ident and no = yet, keep it
          // (game trims names)
        } else if (char_isLetter(c)) {
          if (!inIdent) { inIdent = true; identBuf = ''; }
          identBuf += c;
        }
        continue;
      }

      // Inside function args
      if (inString) {
        if (c === '"') { inString = false; args.push(strBuf); strBuf = null; }
        else strBuf += c;
      } else if (inIdent) {
        if (c === ',' || c === ')') {
          args.push(identBuf.trim()); identBuf = null; inIdent = false;
          if (c === ')') { inFunc = false; }
        } else {
          identBuf += c;
        }
      } else if (inNumber) {
        if (c === ',' || c === ')') {
          args.push(parseFloat(numBuf)); numBuf = null; inNumber = false;
          if (c === ')') { inFunc = false; }
        } else {
          numBuf += c;
        }
      } else {
        if (c === '"') { inString = true; strBuf = ''; }
        else if (c === ')') { inFunc = false; }
        else if (c === ',') { /* separator between args */ }
        else if (c === ' ' || c === '\t') { /* skip whitespace */ }
        else if (c === '-' || char_isDigit(c)) { inNumber = true; numBuf = c; }
        else if (char_isLetter(c)) { inIdent = true; identBuf = c; }
      }
    }

    // Execute the parsed function call
    const target = isAssign ? getVar(varName) : outputTarget;
    if (isAssign) {
      outputTarget = target;
      outputName = varName;
    }

    switch (fname) {
      case 'AddHeightMap': {
        const hmName  = args[0];
        const width   = typeof args[1] === 'number' ? args[1] : parseFloat(args[1]);
        const hmHeight= typeof args[2] === 'number' ? args[2] : parseFloat(args[2]);
        const curveName = (args[3] && args[3] !== 'null' && args[3] !== 'None') ? args[3] : null;
        const multName  = args[4] ? args[4] : null;

        const pts = _getHeightMap(hmName);
        if (!pts) return null; // still loading

        const curvePts = curveName ? _getHeightMap(curveName) : null;
        if (curveName && !curvePts) return null;

        const multArr = multName ? getVar(multName) : null;
        // Game: num = surfaceArea / width  where surfaceArea = radius_m
        const num = radius_m / width;

        for (let i = 0; i < N; i++) {
          let v = _hmEval(pts, angles_rad[i] * num);
          if (curvePts) v = _hmEval(curvePts, Math.max(0, Math.min(1, v)));
          if (multArr)  v *= multArr[i];
          target[i] += v * hmHeight;
        }
        break;
      }
      case 'ApplyCurve': {
        const cPts = _getHeightMap(args[0]);
        if (!cPts) return null;
        for (let i = 0; i < N; i++) {
          target[i] = _hmEval(cPts, Math.max(0, Math.min(1, target[i])));
        }
        break;
      }
      case 'Add': {
        const v = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
        for (let i = 0; i < N; i++) target[i] += v;
        break;
      }
      case 'Multiply': {
        const v = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
        for (let i = 0; i < N; i++) target[i] *= v;
        break;
      }
      case 'ClampMinMax': {
        const mn = typeof args[0] === 'number' ? args[0] : parseFloat(args[0]);
        const mx = typeof args[1] === 'number' ? args[1] : parseFloat(args[1]);
        for (let i = 0; i < N; i++) target[i] = Math.max(mn, Math.min(mx, target[i]));
        break;
      }
      default:
        if (fname) console.warn('[SFS|TERRAIN] Unknown function:', fname);
    }
  }

  // Game returns userVariables["OUTPUT"] — if not set, returns zeros
  return userVars['OUTPUT'] || new Float64Array(N);
}

// ── Seeded RNG matching .NET System.Random (subtractive generator) ────────────
// .NET uses a 55-element subtractive table seeded from the integer seed.
// This matches DynamicTerrain.GenerateRocks: new System.Random((int)(from*100000))
function _seededRng(seed) {
  seed = seed | 0;
  // .NET System.Random init
  const MBIG = 2147483647;
  const table = new Int32Array(56);
  let mj = 161803398 - Math.abs(seed);
  table[55] = mj;
  let mk = 1;
  for (let i = 1; i < 55; i++) {
    const ii = (21 * i) % 55;
    table[ii] = mk;
    mk = mj - mk;
    if (mk < 0) mk += MBIG;
    mj = table[ii];
  }
  for (let k = 1; k < 5; k++) {
    for (let i = 1; i < 56; i++) {
      table[i] -= table[1 + (i + 30) % 55];
      if (table[i] < 0) table[i] += MBIG;
    }
  }
  let inext = 0, inextp = 21;
  return function() {
    if (++inext  >= 56) inext  = 1;
    if (++inextp >= 56) inextp = 1;
    let retVal = table[inext] - table[inextp];
    if (retVal < 0) retVal += MBIG;
    table[inext] = retVal;
    return retVal / MBIG;
  };
}

// ── Evaluate textureFormula → per-vertex blend [0..1] across N samples ────────
// Same evaluator as terrain formula but for the texture sampler.
// Returns Float64Array[N] with values in [0..1], or null if still loading.
function _evalTextureFormula(bodyName, b, radius_m, N) {
  const TD = b.data.TERRAIN_DATA;
  if (!TD) return null;
  const formula = TD.textureFormula;
  if (!formula || formula.length === 0) return new Float64Array(N); // all zeros → full A
  // Reuse terrain sample cache with a 'tex|' prefix key
  const fHash = formula.join('§');
  const key = `tex|${bodyName}|${radius_m.toFixed(0)}|${N}|${fHash}`;
  if (_terrainSampleCache[key]) return _terrainSampleCache[key].heights;
  const angles = new Float64Array(N);
  for (let i = 0; i < N; i++) angles[i] = (i / N) * Math.PI * 2;
  const result = _evalTerrainFormula(formula, angles, radius_m);
  if (!result) return null;
  // Clamp to [0,1]
  const clamped = new Float64Array(N);
  for (let i = 0; i < N; i++) clamped[i] = Math.max(0, Math.min(1, result[i]));
  _terrainSampleCache[key] = { heights: clamped, angles };
  return clamped;
}

function char_isLetter(c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_'; }
function char_isDigit(c)  { return c >= '0' && c <= '9'; }

// ── Water depression (mirrors GetTerrainSamples water loop) ──────────────────
// Game: num = GetWaterColor(CosSin(angle - texRotRad)) * 2f
//       depression = num * oceanDepth + 50
// GetWaterColor samples the ocean mask texture: black(0)=water, white(1)=land
// So waterMask = maskR (red channel, 0=ocean, 1=land)
// num = (1 - maskR) * 2  → ranges 0 (land) to 2 (deep ocean)
// cutout mirrors game's GetWaterColor UV formula:
//   vector = normalPosition * (cutout * 0.5) + (0.5, 0.5)
// where normalPosition is a unit vector (cos,sin).
// The mask canvas stores the texture occupying the full [0,1] UV space,
// so we must scale the unit circle by (cutout * 0.5) before mapping to pixels.
function _applyWaterDepression(heights, angles_rad, maskPixels, maskSZ, oceanDepth, texRotRad, cutout) {
  if (!maskPixels) return;
  const SZ = maskSZ;
  // cutout scales how far from centre the planet edge sits in UV space.
  // cutout=1 → edge at UV 0 or 1 (full texture). cutout<1 → edge sits inside.
  // Game: vector = normalPosition * (cutout * 0.5) + 0.5
  // Negative cutout flips both axes (same as the main texture). Use signed value.
  const uvScale = cutout * 0.5; // signed — game passes cutout directly (can be negative)
  const SZ2 = SZ;
  for (let i = 0; i < angles_rad.length; i++) {
    const ang = angles_rad[i] - texRotRad;
    // Game UV: vec = normalPos * (cutout*0.5) + 0.5  — Y-up in game, flip for canvas
    const uvX =  Math.cos(ang) * uvScale + 0.5;
    const uvY = -Math.sin(ang) * uvScale + 0.5;  // negate sin: game +Y is up, canvas +Y is down
    // Convert UV [0,1] → pixel [0,SZ]
    const fx = uvX * SZ;
    const fy = uvY * SZ;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = x0 + 1, y1 = y0 + 1;
    const tx = fx - x0, ty = fy - y0;
    const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
    const sample = (px, py) => {
      const cx2 = clamp(px, 0, SZ-1), cy2 = clamp(py, 0, SZ-1);
      return maskPixels[(cy2 * SZ + cx2) * 4] / 255;
    };
    const r00 = sample(x0, y0), r10 = sample(x1, y0);
    const r01 = sample(x0, y1), r11 = sample(x1, y1);
    const pixelR = r00*(1-tx)*(1-ty) + r10*tx*(1-ty) + r01*(1-tx)*ty + r11*tx*ty;
    // Game: GetWaterColor = 1 - r - 0.5 = 0.5 - r
    //       num = GetWaterColor * 2  (ranges -1 land → +1 ocean)
    //       depression = num * oceanDepth + 50
    const num = (0.5 - pixelR) * 2 * oceanDepth + 50;
    if (num > 0) heights[i] -= num;
  }
}

// ── FlatZones (mirrors GetTerrainSamples flatzone loop exactly) ───────────────
// Game code uses raw angles_Rad[k] with no wrapping — it does a bounds check
// (num3 > endAngle, num4 < startAngle) to skip irrelevant zones, then applies
// InverseLerp directly on the raw angle values.  We replicate that exactly.
// The editor's angles array runs [0, 2π), and fz.angle is stored in that same
// space, so no wrapping is needed or correct here.
function _applyFlatZones(heights, angles_rad, flatZones, radius_m) {
  if (!flatZones || !flatZones.length) return;
  for (const fz of flatZones) {
    // Game: num2 = (width + transition) / radius / 2
    const halfFull  = (fz.width + fz.transition) / radius_m / 2;  // outer half-angle (rad)
    const halfInner = fz.width / radius_m / 2;                     // inner half-angle (rad)
    const angleCenter = fz.angle; // radians — stored directly from JSON
    const zoneMin = angleCenter - halfFull;   // num3
    const zoneMax = angleCenter + halfFull;   // num4
    const innerMin = angleCenter - halfInner; // b
    const innerMax = angleCenter + halfInner; // b2

    // Game skips the whole zone if it is entirely outside the chunk's angle range.
    // In the editor we always process all angles, so skip the start/end guard.
    for (let i = 0; i < angles_rad.length; i++) {
      const a = angles_rad[i]; // raw angle, no wrapping
      // Game: value3 = Min(InverseLerp(num3, b, a), InverseLerp(num4, b2, a))
      // Left ramp:  0 at outer edge (zoneMin), 1 at inner edge (innerMin)
      // Right ramp: 0 at outer edge (zoneMax), 1 at inner edge (innerMax)
      const tLeft  = halfFull === halfInner ? 0 : (a - zoneMin)  / (innerMin - zoneMin);
      const tRight = halfFull === halfInner ? 0 : (a - zoneMax)  / (innerMax - zoneMax);
      const tc = Math.max(0, Math.min(1, Math.min(tLeft, tRight)));
      if (tc > 0) heights[i] = heights[i] * (1 - tc) + fz.height * tc;
    }
  }
}

// ── Visible arc computation ───────────────────────────────────────────────────
// Returns the angular range [arcStart, arcEnd] of the planet circumference that
// is actually visible within the viewport rectangle [0,W]×[0,H].
// When the entire circumference is visible (planet fits on screen) returns
// { fullCircle: true }.  The arc is expressed in the canvas coordinate system
// (angles increase clockwise, angle 0 = right) and arcEnd >= arcStart always.
// If arc spans > 355° we also set fullCircle=true to avoid rounding edge cases.
function _computeVisibleArc(sp, physR_px, vpW, vpH) {
  // If the planet is small enough to fit fully on screen → full circle
  if (sp.x - physR_px >= 0 && sp.x + physR_px <= vpW &&
      sp.y - physR_px >= 0 && sp.y + physR_px <= vpH) {
    return { fullCircle: true, arcStart: 0, arcEnd: Math.PI * 2 };
  }

  // If the entire viewport is inside the planet disc → full circle
  // (planet centre is off-screen but disc covers the whole canvas)
  const corners = [[0,0],[vpW,0],[0,vpH],[vpW,vpH]];
  const r2 = physR_px * physR_px;
  if (corners.every(([cx,cy]) => (cx-sp.x)**2 + (cy-sp.y)**2 <= r2)) {
    // Viewport fully inside disc — fall through to arc intersection logic below.
    // Culling is most valuable here: only a small arc of terrain is near the screen edges.
  }

  // Collect candidate angles: where the planet disc edge intersects each
  // viewport edge (top, bottom, left, right).  Also include planet-centre
  // angles toward each screen corner so we never miss a partially visible arc.
  const angles = [];

  // Planet-centre → corner angles (always include even if outside disc)
  for (const [cx, cy] of corners) {
    angles.push(Math.atan2(-(cy - sp.y), cx - sp.x)); // canvas Y-down → negate for trig
  }

  // Intersections of planet disc with horizontal lines y = 0 and y = vpH
  for (const ey of [0, vpH]) {
    const dy = -(ey - sp.y); // negate for canvas Y-down
    const disc = r2 - dy * dy;
    if (disc >= 0) {
      const dx = Math.sqrt(disc);
      angles.push(Math.atan2(dy,  dx));
      angles.push(Math.atan2(dy, -dx));
    }
  }
  // Intersections with vertical lines x = 0 and x = vpW
  for (const ex of [0, vpW]) {
    const dx = ex - sp.x;
    const disc = r2 - dx * dx;
    if (disc >= 0) {
      const dy = Math.sqrt(disc);
      angles.push(Math.atan2( dy, dx));
      angles.push(Math.atan2(-dy, dx));
    }
  }

  // Normalise angles to [0, 2π)
  const TWO_PI = Math.PI * 2;
  const norm = angles.map(a => ((a % TWO_PI) + TWO_PI) % TWO_PI);

  // Filter to angles where that point on the disc is actually inside the viewport
  const MARGIN = 2; // 2px tolerance
  const visible = norm.filter(a => {
    const px = sp.x + Math.cos(a) * physR_px;
    const py = sp.y - Math.sin(a) * physR_px;
    return px >= -MARGIN && px <= vpW + MARGIN && py >= -MARGIN && py <= vpH + MARGIN;
  });

  if (visible.length < 2) {
    // Disc intersects screen but we couldn't find endpoints → full circle fallback
    return { fullCircle: true, arcStart: 0, arcEnd: TWO_PI };
  }

  // Find the min and max angle of the visible set, but we need the smallest arc
  // that contains all visible angles — handle wrap-around by choosing the
  // complement arc if it's smaller.
  const sorted = [...visible].sort((a, b) => a - b);
  // Largest gap between consecutive angles (mod circle) tells us the hidden arc
  let maxGap = 0, gapAfter = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = sorted[(i + 1) % sorted.length];
    const gap = i + 1 < sorted.length ? next - sorted[i] : sorted[0] + TWO_PI - sorted[i];
    if (gap > maxGap) { maxGap = gap; gapAfter = i; }
  }
  // The visible arc is everything EXCEPT the largest gap
  const arcStart = sorted[(gapAfter + 1) % sorted.length];
  const arcEndRaw = sorted[gapAfter];
  const arcEnd   = arcEndRaw < arcStart ? arcEndRaw + TWO_PI : arcEndRaw;
  const arcSpan  = arcEnd - arcStart;

  if (arcSpan >= TWO_PI * (355 / 360)) {
    return { fullCircle: true, arcStart: 0, arcEnd: TWO_PI };
  }


  // Add a small angular margin (~3°) so we never clip a vertex right on the edge
  const ANGLE_MARGIN = 0.05;
  return {
    fullCircle: false,
    arcStart: arcStart - ANGLE_MARGIN,
    arcEnd:   arcEnd   + ANGLE_MARGIN,
  };
}

// ── Terrain sample cache ──────────────────────────────────────────────────────
const _terrainSampleCache = {};
// Per-frame clip path cache — keyed by "bodyName|N|spx|spy|physR_px" so it's
// reused when drawTerrainBody and _terrainClipPath request the same shape in
// the same frame without recomputing the Path2D.
const _terrainClipCache = {};

function invalidateTerrainCache(bodyName) {
  const all = bodyName === '*';
  const prefix = bodyName + '|';
  for (const k of Object.keys(_terrainSampleCache)) {
    if (all || k.startsWith(prefix)) delete _terrainSampleCache[k];
  }
  for (const k of Object.keys(_terrainClipCache)) {
    if (all || k.startsWith(prefix)) delete _terrainClipCache[k];
  }
  // Also clear _lastSample so stale geometry (e.g. after radius edit) doesn't
  // persist as the clip source for the next frame.
  if (drawTerrainBody._lastSample) {
    if (all) {
      for (const k of Object.keys(drawTerrainBody._lastSample)) delete drawTerrainBody._lastSample[k];
    } else if (drawTerrainBody._lastSample[bodyName]) {
      delete drawTerrainBody._lastSample[bodyName];
    }
  }
}

// ── Main sample resolver — cached, arc-culled ─────────────────────────────────
// arcInfo: optional { fullCircle, arcStart, arcEnd } from _computeVisibleArc.
// When arcInfo is provided and NOT fullCircle, we use a two-tier strategy:
//   • Coarse baseline (360 vertices, full circle) — always evaluated, cheap.
//   • Fine detail (N vertices) — evaluated ONLY for the visible arc slice.
// The returned result always has N entries covering the full 0…2π range, but
// only the arc region has high-res formula heights; the rest use the coarse
// baseline.  This reduces formula evaluation work from O(N) to
// O(360 + N × arcFraction), typically 10–50× faster when zoomed in.
// ── Main sample resolver — cached, arc-culled when zoomed in ─────────────────
// arcInfo: optional { fullCircle, arcStart, arcEnd } from _computeVisibleArc.
//
// STRATEGY: when physR_px is large and only a partial arc is visible, we evaluate
// the terrain formula only for the ~arcFraction × N angles that fall inside the
// visible arc.  The result carries those arc angles+heights directly.  The draw
// functions close the polygon on the hidden side with a single ctx.arc() call at
// the bare disc radius — no need to evaluate hidden terrain at all.
//
// Cache keys snap arcStart/arcEnd to the nearest 2° bucket so that small pans
// don't bust the cache on every pixel.
function _getTerrainSamples(bodyName, b, radius_m, N, arcInfo) {
  const TD = b.data.TERRAIN_DATA;
  if (!TD) return null;

  const tfd = TD.terrainFormulaDifficulties;
  const formula = (tfd && (tfd[viewDiffKey] || tfd[viewDifficulty] || tfd['Normal'] || tfd['normal'])) || TD.terrainFormula;
  if (!formula || !formula.length) return null;

  const fHash = formula.join('§');
  const TWO_PI = Math.PI * 2;

  // Arc culling is only worthwhile at high N with a partial arc visible
  const useArcCull = arcInfo && !arcInfo.fullCircle && N > 180;

  if (!useArcCull) {
    // ── Full-circle path ──────────────────────────────────────────────────
    const key = `${bodyName}|${radius_m.toFixed(0)}|${viewDiffKey}|${N}|${fHash}`;
    if (_terrainSampleCache[key]) return _terrainSampleCache[key];

    // Return nearest cached N as fallback while computing (avoids blank frames)
    let fallback = null;
    for (const k of Object.keys(_terrainSampleCache)) {
      if (k.startsWith(`${bodyName}|${radius_m.toFixed(0)}|${viewDiffKey}|`) &&
          !k.includes('|arc|')) {
        fallback = _terrainSampleCache[k]; break;
      }
    }

    const angles = new Float64Array(N);
    for (let i = 0; i < N; i++) angles[i] = (i / N) * TWO_PI;
    const heights = _evalTerrainFormula(formula, angles, radius_m);
    if (!heights) return fallback; // async heightmap — return stale data if available

    _applyWaterDepressionIfNeeded(b, TD, heights, angles);
    const fzd = TD.flatZonesDifficulties;
    const flatZones = (fzd && (fzd[viewDiffKey] || fzd['Normal'])) || TD.flatZones || [];
    _applyFlatZones(heights, angles, flatZones, radius_m);

    const result = { heights, angles, N, arcCulled: false };
    const keys = Object.keys(_terrainSampleCache);
    if (keys.length >= 50) delete _terrainSampleCache[keys[0]];
    _terrainSampleCache[key] = result;
    return result;
  }

  // ── Arc-culled path ───────────────────────────────────────────────────────
  // Snap arc bounds to 2° buckets → stable cache key while panning
  const DEG2 = TWO_PI / 180;
  const snapS = Math.round(arcInfo.arcStart / DEG2) * DEG2;
  const snapE = Math.round(arcInfo.arcEnd   / DEG2) * DEG2;

  const arcKey = `${bodyName}|${radius_m.toFixed(0)}|${viewDiffKey}|arc|${N}|${snapS.toFixed(4)}|${snapE.toFixed(4)}|${fHash}`;
  if (_terrainSampleCache[arcKey]) return _terrainSampleCache[arcKey];

  // Determine which of the N full-circle indices fall inside the visible arc
  const arcSpan = snapE - snapS; // > 0, < 2π
  const arcAngles = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TWO_PI;
    const d = ((a - snapS) % TWO_PI + TWO_PI) % TWO_PI;
    if (d <= arcSpan) arcAngles.push(a);
  }

  if (arcAngles.length === 0) {
    // Visible arc maps to zero vertices at this N — return full-circle baseline
    return _getTerrainSamples(bodyName, b, radius_m, 360, null);
  }

  const angArr = new Float64Array(arcAngles);
  const heights = _evalTerrainFormula(formula, angArr, radius_m);
  if (!heights) {
    // Still loading — return baseline if available
    return _getTerrainSamples(bodyName, b, radius_m, 360, null);
  }

  _applyWaterDepressionIfNeeded(b, TD, heights, angArr);
  const fzd = TD.flatZonesDifficulties;
  const flatZones = (fzd && (fzd[viewDiffKey] || fzd['Normal'])) || TD.flatZones || [];
  _applyFlatZones(heights, angArr, flatZones, radius_m);

  const result = {
    heights,
    angles: angArr,
    N: angArr.length,
    arcCulled: true,
    arcStart: snapS,
    arcEnd:   snapE,
    discR_px: null, // filled in by draw functions from physR_px
  };
  const keys = Object.keys(_terrainSampleCache);
  if (keys.length >= 60) delete _terrainSampleCache[keys[0]];
  _terrainSampleCache[arcKey] = result;
  return result;
}

// ── Water depression helper ───────────────────────────────────────────────────
function _applyWaterDepressionIfNeeded(b, TD, heights, angles) {
  if (!b.data.WATER_DATA?.lowerTerrain) return;
  const WD = b.data.WATER_DATA;
  const maskTex = WD.oceanMaskTexture;
  if (!maskTex || maskTex === 'None') return;
  if (!drawViewport._waterMaskPx) drawViewport._waterMaskPx = {};
  const cacheKey = maskTex + '_px';
  if (!drawViewport._waterMaskPx[cacheKey]) {
    const img = typeof textureCache !== 'undefined' && textureCache[maskTex];
    if (img && img.complete && img.naturalWidth > 0) {
      const SZ = 1024;
      const src = document.createElement('canvas'); src.width = src.height = SZ;
      src.getContext('2d').drawImage(img, 0, 0, SZ, SZ);
      const mc = document.createElement('canvas'); mc.width = mc.height = SZ;
      const mCtx = mc.getContext('2d');
      mCtx.filter = 'blur(3px)';
      mCtx.drawImage(src, 0, 0);
      mCtx.filter = 'none';
      drawViewport._waterMaskPx[cacheKey] = { px: mCtx.getImageData(0,0,SZ,SZ).data, sz: SZ };
    }
  }
  const wmp = drawViewport._waterMaskPx[cacheKey];
  if (wmp) {
    const texRotRad = (TD.TERRAIN_TEXTURE_DATA?.planetTextureRotation ?? 0) * Math.PI / 180;
    const cutout = TD.TERRAIN_TEXTURE_DATA?.planetTextureCutout ?? 1.0;
    _applyWaterDepression(heights, angles, wmp.px, wmp.sz, WD.oceanDepth || 3000, texRotRad, cutout);
  }
}

// ── Shared polygon builder ────────────────────────────────────────────────────
// Draws (or builds into a Path2D) the terrain silhouette.
// When result.arcCulled is true the hidden back is closed with a single arc()
// call at the base disc radius — this correctly fills the interior.
//
// Canvas arc() convention:  angles increase CLOCKWISE (Y-down).
// Our terrain angles are trig-space (Y-up): canvas_angle = -trig_angle.
// arc(cx, cy, r, startAngle, endAngle, anticlockwise):
//   anticlockwise=true  → goes counter-clockwise in canvas space = CLOCKWISE in trig = hidden interior
//   anticlockwise=false → goes clockwise in canvas space = the visible circumference side
//
// To close the hidden back from arcEnd → arcStart going THROUGH the interior
// (the short way, not around the visible front), we use anticlockwise=true.
function _buildTerrainPath(ctx_or_p, result, sp, physR_px, radius_m) {
  const { heights, angles, arcCulled, arcStart, arcEnd } = result;
  const N = angles.length;

  if (!arcCulled) {
    // Full circle — emit all vertices
    const r0 = physR_px * (1 + heights[0] / radius_m);
    ctx_or_p.moveTo(sp.x + Math.cos(angles[0]) * r0, sp.y - Math.sin(angles[0]) * r0);
    for (let i = 1; i < N; i++) {
      const rPx = physR_px * (1 + heights[i] / radius_m);
      ctx_or_p.lineTo(sp.x + Math.cos(angles[i]) * rPx, sp.y - Math.sin(angles[i]) * rPx);
    }
  } else {
    if (N === 0) {
      // No arc vertices — plain disc
      ctx_or_p.arc(sp.x, sp.y, physR_px, 0, Math.PI * 2);
      return;
    }
    // Enter arc at arcStart on the disc
    ctx_or_p.moveTo(sp.x + Math.cos(arcStart) * physR_px,
                    sp.y - Math.sin(arcStart) * physR_px);
    // Emit terrain vertices for the visible arc
    for (let i = 0; i < N; i++) {
      const rPx = physR_px * (1 + heights[i] / radius_m);
      ctx_or_p.lineTo(sp.x + Math.cos(angles[i]) * rPx,
                      sp.y - Math.sin(angles[i]) * rPx);
    }
    // Return to disc edge at arcEnd
    ctx_or_p.lineTo(sp.x + Math.cos(arcEnd) * physR_px,
                    sp.y - Math.sin(arcEnd) * physR_px);
    // Close through the interior (hidden back of planet) via anticlockwise arc.
    // canvas arc angle = -trig angle.
    // We want to sweep from arcEnd back to arcStart going the short hidden way.
    // In canvas coords: from -arcEnd to -arcStart, anticlockwise=true.
    ctx_or_p.arc(sp.x, sp.y, physR_px, -arcEnd, -arcStart, true);
  }
}

// ── drawTerrainBody — polygon fill ────────────────────────────────────────────
// Also caches the built Path2D (in screen space) into drawTerrainBody._lastPath[bodyName]
// so _terrainClipPath can reuse it directly — guaranteeing clip == polygon, same frame.
function drawTerrainBody(ctx, b, bodyName, sp, physR_px, radius_m, mapColor, N, arcInfo, texImg) {
  if (!b.data.TERRAIN_DATA) return false;
  if (!N) N = physR_px < 10 ? 90 : physR_px < 40 ? 180 : 360;

  // Always kick off a full-circle N=360 request so it's cached by next frame.
  // This ensures _terrainClipPath always has a non-arc-culled result available.
  _getTerrainSamples(bodyName, b, radius_m, 360, null);

  const result = _getTerrainSamples(bodyName, b, radius_m, N, arcInfo);
  if (!result) return false;

  // ── Edge-disk fill ───────────────────────────────────────────────────────
  // Sample the outermost few rows of the planet texture once and cache the
  // result on the img object.  Build a radial gradient from the mean centre
  // colour to the per-column edge colours around the rim so the terrain
  // silhouette looks like the planet surface extends into the heightmap bumps
  // rather than showing a flat mapColor blob.
  let fillStyle;
  if (texImg && texImg.complete && texImg.naturalWidth > 0 && radius_m >= 15000) {
    if (!texImg._edgeDisk) {
      const tw = texImg.naturalWidth, th = texImg.naturalHeight;
      const ec = document.createElement('canvas');
      ec.width = tw; ec.height = th;
      ec.getContext('2d').drawImage(texImg, 0, 0);
      const px = ec.getContext('2d').getImageData(0, 0, tw, th).data;

      // Sample the equator band (middle 10% of rows).
      // Bottom/top rows are often black (transparent poles in SFS) — equator
      // is what's visible at the terrain silhouette edge.
      const bandH    = Math.max(2, Math.round(th * 0.10));
      const startRow = Math.floor((th - bandH) / 2);
      const endRow   = startRow + bandH;

      const colR = new Float32Array(tw);
      const colG = new Float32Array(tw);
      const colB = new Float32Array(tw);
      for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < tw; col++) {
          const i = (row * tw + col) * 4;
          colR[col] += px[i];
          colG[col] += px[i+1];
          colB[col] += px[i+2];
        }
      }
      let sumR = 0, sumG = 0, sumB = 0;
      for (let col = 0; col < tw; col++) {
        colR[col] /= bandH; colG[col] /= bandH; colB[col] /= bandH;
        sumR += colR[col]; sumG += colG[col]; sumB += colB[col];
      }
      const meanR = sumR / tw, meanG = sumG / tw, meanB = sumB / tw;
      texImg._edgeDisk = { colR, colG, colB, meanR, meanG, meanB, tw };
    }

    // Build gradient: centre = mean colour, outer rim uses per-angle edge colours.
    // The 64×64 canvas is zoom-independent — it's always stretched via drawImage
    // destination rect, so no per-zoom regeneration.
    const { colR, colG, colB, meanR, meanG, meanB, tw } = texImg._edgeDisk;

    const SZ = 128;
    if (!texImg._edgePat) {
      const pc = document.createElement('canvas');
      pc.width = SZ; pc.height = SZ;
      const pctx = pc.getContext('2d');
      const imgData = pctx.createImageData(SZ, SZ);
      const d = imgData.data;
      const cx = SZ / 2, cy = SZ / 2;
      for (let py = 0; py < SZ; py++) {
        for (let px2 = 0; px2 < SZ; px2++) {
          const dx = px2 - cx, dy = py - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const maxR = cx;
          if (dist > maxR) {
            // Outside circle — fill with mean colour so clip boundary has no seam
            const i4=(py*SZ+px2)*4;
            d[i4]=Math.round(meanR); d[i4+1]=Math.round(meanG); d[i4+2]=Math.round(meanB); d[i4+3]=255;
            continue;
          }
          const angle = (Math.atan2(-dy, dx) / (Math.PI*2) + 1) % 1;
          const col   = Math.round(angle * (tw - 1));
          const frac  = dist / maxR;
          const er = colR[col], eg = colG[col], eb = colB[col];
          const i4 = (py * SZ + px2) * 4;
          d[i4]   = Math.round(meanR + (er - meanR) * frac);
          d[i4+1] = Math.round(meanG + (eg - meanG) * frac);
          d[i4+2] = Math.round(meanB + (eb - meanB) * frac);
          d[i4+3] = 255;
        }
      }
      pctx.putImageData(imgData, 0, 0);
      texImg._edgePat = pc;
    }

    // Draw the edge-disk clipped to terrain shape.
    // Skip entirely when the planet is so large on screen that the surface
    // texture (drawn next) will fully cover the viewport — the edge-disk is
    // only needed to colour the heightmap bumps beyond the texture boundary,
    // which are sub-pixel when the body exceeds ~4× the viewport diagonal.
    const _diagPx2 = Math.sqrt(ctx.canvas.width * ctx.canvas.width + ctx.canvas.height * ctx.canvas.height);
    if (physR_px <= _diagPx2 * 4) {
      const _arcKey = result.arcCulled ? `a${(result.arcStart*10)|0}_${(result.arcEnd*10)|0}` : 'full';
      const _cacheKey = `${bodyName}|${N}|${sp.x|0}|${sp.y|0}|${physR_px|0}|${_arcKey}`;
      let _terrPath = _terrainClipCache[_cacheKey];
      if (!_terrPath) {
        _terrPath = new Path2D();
        _buildTerrainPath(_terrPath, result, sp, physR_px, radius_m);
        _terrainClipCache[_cacheKey] = _terrPath;
      }
      // Clamp destination rect to viewport so the GPU only blits visible pixels.
      const fullL = sp.x - physR_px, fullT = sp.y - physR_px, fullS = physR_px * 2;
      const dstX = Math.max(0, fullL), dstY = Math.max(0, fullT);
      const dstR = Math.min(ctx.canvas.width,  fullL + fullS);
      const dstB = Math.min(ctx.canvas.height, fullT + fullS);
      const dstW = dstR - dstX, dstH = dstB - dstY;
      if (dstW > 0 && dstH > 0) {
        const SZ = texImg._edgePat.width;
        const scale = SZ / fullS;
        const srcX = (dstX - fullL) * scale, srcY = (dstY - fullT) * scale;
        const srcW = dstW * scale,            srcH = dstH * scale;
        ctx.save();
        ctx.clip(_terrPath);
        ctx.drawImage(texImg._edgePat, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
        ctx.restore();
      }
    } else {
      // Planet fills screen — just write the cache key with a plain disc clip
      // so downstream _terrainClipPath calls still get a cached Path2D.
      const _arcKey = result.arcCulled ? `a${(result.arcStart*10)|0}_${(result.arcEnd*10)|0}` : 'full';
      const _cacheKey = `${bodyName}|${N}|${sp.x|0}|${sp.y|0}|${physR_px|0}|${_arcKey}`;
      if (!_terrainClipCache[_cacheKey]) {
        const _terrPath = new Path2D();
        _buildTerrainPath(_terrPath, result, sp, physR_px, radius_m);
        _terrainClipCache[_cacheKey] = _terrPath;
      }
    }
  } else {
    // Fallback: flat mapColor disc (no texture loaded)
    const mc = mapColor;
    const mr = mc ? Math.min(255, Math.round(mc.r * 255)) : 100;
    const mg = mc ? Math.min(255, Math.round(mc.g * 255)) : 100;
    const mb = mc ? Math.min(255, Math.round(mc.b * 255)) : 120;

    ctx.save();
    ctx.beginPath();
    _buildTerrainPath(ctx, result, sp, physR_px, radius_m);
    ctx.closePath();
    ctx.fillStyle = `rgb(${mr},${mg},${mb})`;
    ctx.fill();
    ctx.restore();
  }

  // Store the sample result so _terrainClipPath can build an exact-match clip this frame.
  // Store full-circle result for clip — NEVER store arc-culled result.
  // Arc-culled path only covers the visible wedge; used as a clip it leaves
  // the rest of the disc unclipped → texture bleeds when body is near screen edge.
  // Try progressively smaller N until we find a cached full-circle result.
  if (!drawTerrainBody._lastSample) drawTerrainBody._lastSample = {};
  let fullResult = null;
  if (!result.arcCulled) {
    fullResult = result; // already full-circle
  } else {
    // N=360 is the cheapest full-circle; always computed within 1-2 frames.
    for (const tryN of [360, 180, 90, N]) {
      const r2 = _getTerrainSamples(bodyName, b, radius_m, tryN, null);
      if (r2 && !r2.arcCulled) { fullResult = r2; break; }
    }
  }
  // Only store if we have a genuine full-circle result — stale is fine, missing is not.
  if (fullResult) {
    drawTerrainBody._lastSample[bodyName] = { result: fullResult, physR_px, radius_m };
  }

  return true;
}

// Terrain clip path — always builds fresh from cached sample data so it exactly
// matches the terrain polygon drawn this frame at the current sp and scale.
//
// Priority:
//  1. Use the sample stored by drawTerrainBody this frame (same scale, guaranteed).
//  2. Find any cached full-circle samples for this body at any N.
//  3. Return null (caller falls back to plain disc clip).
function _terrainClipPath(b, bodyName, sp, physR_px, radius_m, N, arcInfo) {
  if (!b.data.TERRAIN_DATA) return null;
  if (!N) N = physR_px < 10 ? 90 : physR_px < 40 ? 180 : 360;

  // Resolve the sample first so we can build an arc-aware cache key.
  // Use the same arcInfo that drawTerrainBody used — this guarantees the
  // clip path has the exact same shape as the filled polygon.
  let result = _getTerrainSamples(bodyName, b, radius_m, N, arcInfo);
  if (!result) {
    // Fallback: full-circle at any available N
    result = _getTerrainSamples(bodyName, b, radius_m, 360, null);
    if (!result) {
      for (const fallN of [720, 180, 90]) {
        result = _getTerrainSamples(bodyName, b, radius_m, fallN, null);
        if (result) break;
      }
    }
  }
  if (!result) return null;

  const _arcKey = result.arcCulled ? `a${(result.arcStart*10)|0}_${(result.arcEnd*10)|0}` : 'full';
  const _cacheKey = `${bodyName}|${N}|${sp.x|0}|${sp.y|0}|${physR_px|0}|${_arcKey}`;
  if (_terrainClipCache[_cacheKey]) return _terrainClipCache[_cacheKey];

  const p = new Path2D();
  _buildTerrainPath(p, result, sp, physR_px, radius_m);
  _terrainClipCache[_cacheKey] = p;
  return p;
}

// Apply a screen-space terrain clip path (already in screen coordinates).
function _applyTerrainClip(ctx, path, sp) {
  ctx.clip(path);
}
