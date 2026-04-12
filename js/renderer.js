// ════════════════════════════════ CANVAS / KEPLERIAN RENDERER ════════════════════════════════
const vp = document.getElementById('viewport');
const ctx2 = vp.getContext('2d');
let vpOffX = 0, vpOffY = 0, vpZ = 1;
let bodyWorldPos = {};  // populated each drawViewport(); read by zoomToBody()
let viewDifficulty = 'normal'; // 'normal' | 'hard' | 'realistic'
// Data files use Title Case keys ('Normal','Hard','Realistic') — compute once on change
let viewDiffKey = 'Normal'; // Title-case version used for smaDifficultyScale / radiusDifficultyScale lookups
let dragging = false, dragSX, dragSY;
const BODY_PX = { star:28, planet:16, gasgiant:22, ringedgiant:22, marslike:14, mercurylike:12, moon:11, asteroid:7, blackhole:18, barycentre:5 };

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
  soi:     true,
  atmo:    true,
  clouds:  true,
  fclouds: true,
  fog:     true,
  water:   true,
  surface: true,
  physAtmo: false,
  postProc: false,
};

function toggleEnvFlag(key){
  envFlags[key] = !envFlags[key];
  // Keep legacy alias in sync
  if(key === 'fclouds') showFrontClouds = envFlags.fclouds;
  // Remove GPU tint filter from canvas when post-proc is turned off
  if(key === 'postProc' && !envFlags.postProc) _clearPostProcessingFilter();
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
    const iconR = b.isCenter ? 18
                : b.preset === 'star'         ? 14
                : b.preset === 'blackhole'    ? 12
                : (b.preset === 'gasgiant' || b.preset === 'ringedgiant') ? 10
                : (b.preset === 'planet' || b.preset === 'marslike' || b.preset === 'mercurylike') ? 7
                : b.preset === 'moon'         ? 5
                : b.preset === 'barycentre'   ? 4
                : 4; // asteroid

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
      if(selectedBody===name){ ctx2.beginPath(); ctx2.arc(sp.x,sp.y,10,0,Math.PI*2); ctx2.strokeStyle='rgba(80,180,255,0.75)'; ctx2.lineWidth=1.5; ctx2.setLineDash([3,3]); ctx2.stroke(); ctx2.setLineDash([]); }
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

    if(envFlags.atmo && atmoFade > 0 && b.data.ATMOSPHERE_PHYSICS_DATA && b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT){
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
            // Cache key: texture + exact innerFrac (4 decimal places).
            if(!drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
            const cacheKey = atmoTex + '|' + innerFracClamped.toFixed(4);
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
              // so each texture row maps to enough polar-canvas pixels.
              // Cap at 1024 to stay GPU-friendly; floor at 512 for large atmospheres.
              const atmoBandFrac = 1 - innerFracClamped;
              const SZ = atmoBandFrac < 0.15 ? 1024 : 512;
              polarCanvas = document.createElement('canvas');
              polarCanvas.width = SZ; polarCanvas.height = SZ;
              const pCtx = polarCanvas.getContext('2d');
              const outD = pCtx.createImageData(SZ, SZ);
              const od = outD.data;
              const half = SZ / 2;

              for(let py = 0; py < SZ; py++){
                for(let ppx = 0; ppx < SZ; ppx++){
                  const dx = ppx - half, dy = py - half;
                  const dist = Math.sqrt(dx*dx + dy*dy);
                  const radFrac = dist / half;
                  const oi = (py*SZ + ppx)*4;

                  if(radFrac > 1.0){ od[oi+3]=0; continue; }

                  let cwAngle = Math.atan2(dy, dx) / (Math.PI*2);
                  if(cwAngle < 0) cwAngle += 1;
                  const u = (1 - cwAngle) % 1;

                  let texRowF;
                  if(radFrac <= innerFracClamped){
                    texRowF = SH - 1;
                  } else {
                    const t = (radFrac - innerFracClamped) / (1 - innerFracClamped);
                    texRowF = (1 - t) * (SH - 1);
                  }

                  const sx = Math.min(SW-1, Math.max(0, Math.round(u * (SW-1))));
                  // Bilinear interpolation along Y to avoid hard row-quantisation rings
                  const sy0 = Math.min(SH-1, Math.max(0, Math.floor(texRowF)));
                  const sy1 = Math.min(SH-1, sy0 + 1);
                  const fy  = texRowF - sy0; // fractional part [0,1)
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
    const ptex = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTexture;
    // When surface texture rendering is disabled, treat as if no texture is loaded
    const texImg = envFlags.surface && ptex && ptex !== 'None' && textureCache[ptex];

    // Only draw the texture when the body is physically larger than its icon floor —
    // this prevents a blurry low-res stamp at system-zoom scale.
    if(texImg && texImg.complete && texImg.naturalWidth > 0 && physR_px > iconR){
      if(!_sfsDbgLogged[name + '_drawn']){ _sfsDbgLogged[name + '_drawn'] = true; console.log(`[SFS|DRAW] texture "${ptex}" drawn on "${name}" physR_px:${physR_px.toFixed(1)}`); }
      // Read cutout & rotation live from sidebar if this is the selected body,
      // otherwise read from stored data.  This makes the sliders update in real-time.
      let ptCutout  = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureCutout  ?? 0;
      let ptRotDeg  = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTextureRotation ?? 0;
      if(selectedBody === name && !liveSync._filling){
        const cutEl = document.getElementById('tt-cut');
        const rotEl = document.getElementById('tt-rot');
        if(cutEl && cutEl.value !== '') ptCutout = parseFloat(cutEl.value) || 0;
        if(rotEl && rotEl.value !== '') ptRotDeg  = parseFloat(rotEl.value) || 0;
      }

      // planetTextureCutout: 1 = full image shown (no zoom), 0.8 = inscribed circle of square
      // Values < 1 zoom into the image so the circle fills more of the texture.
      // Negative values are not meaningful here — clamp to [0, 1].
      const cutout = Math.max(0, Math.min(1, ptCutout));
      // scale factor: cutout=1 → draw full r*2 square; cutout<1 → image is enlarged so
      // only the central portion (inscribed circle) is visible inside the clipped arc.
      // When cutout=1 the image fits exactly; when cutout<1 we scale the image up so
      // the drawn square is r*2 / cutout and centred on the body.
      const drawHalf = cutout > 0 ? r / cutout : r;

      // planetTextureRotation: editor 0° = North Up; +90° rotates texture CCW.
      // Canvas rotation is CW-positive, so negate the angle.
      const rotRad = -ptRotDeg * Math.PI / 180;

      ctx2.save();
      ctx2.beginPath(); ctx2.arc(sp.x, sp.y, r, 0, Math.PI*2); ctx2.clip();
      ctx2.translate(sp.x, sp.y);
      ctx2.rotate(rotRad);
      ctx2.drawImage(texImg, -drawHalf, -drawHalf, drawHalf*2, drawHalf*2);
      ctx2.restore();
    } else {
      // No texture rendered — log why once per body per session
      if(!_sfsDbgLogged) _sfsDbgLogged = {};
      if(!_sfsDbgLogged[name]){
        _sfsDbgLogged[name] = true;
        const hasTD   = !!b.data.TERRAIN_DATA;
        const hasTTD  = !!b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA;
        const rawPtex = b.data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.planetTexture;
        const inCache = rawPtex ? !!textureCache[rawPtex] : false;
        const cacheImg = rawPtex ? textureCache[rawPtex] : null;
        console.warn(
          `[SFS|NODRAW] ${name}` +
          ` | TERRAIN_DATA:${hasTD}` +
          ` | TERRAIN_TEXTURE_DATA:${hasTTD}` +
          ` | planetTexture:"${rawPtex}"` +
          ` | inCache:${inCache}` +
          (cacheImg ? ` | img.complete:${cacheImg.complete} naturalW:${cacheImg.naturalWidth}` : '') +
          ` | physR_px:${physR_px.toFixed(1)} iconR:${iconR}` +
          ` | assets.textures:[${assets.textures.map(a=>a.name).join(',')}]`
        );
      }

      // Only fill pure black when planetTexture is explicitly "None" or not set —
      // i.e. the designer intentionally has no surface texture.
      // EXCEPTION: if the planet has WATER_DATA, skip the black fill and let the water
      // render instead, so the entire planet appears covered with water.
      // If a texture name is set but not in cache yet, fall through to icon gradient.
      const texIsNone = !ptex || ptex === 'None';
      const hasWater = !!b.data.WATER_DATA;
      if(b.data.TERRAIN_DATA && texIsNone && physR_px > iconR && !hasWater){
        ctx2.save();
        ctx2.beginPath(); ctx2.arc(sp.x, sp.y, r, 0, Math.PI*2);
        ctx2.fillStyle = '#000000';
        ctx2.fill();
        ctx2.restore();
      } else {
        // Fallback disc: use mapColor gradient at all zoom levels.
        // iconFade only applies to non-terrain bodies (stars, barycentres) which
        // should shrink to a dot at close zoom. Terrain bodies always fill the disc.
        const mc = b.data.BASE_DATA?.mapColor;
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
        // For non-terrain bodies (stars, barycentres), fade out at large zoom.
        // For terrain bodies with a pending texture, always draw full opacity.
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
      }
    }

    // ── Water overlay (WATER_DATA) ─────────────────────────────────────────
    // Black = deep water, lighter grey = shallower, white = land.
    // We render the water mask as a colour overlay on the planet disc.
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
        const wtCutoutClamped = Math.max(0.01, Math.min(1, wtCutout));
        const wtDrawHalf = r / wtCutoutClamped;
        const wtRotRad   = -wtRotDeg * Math.PI / 180;
        // atmoFade gates rendering (same as clouds) — on Titan the thick atmo naturally
        // tints the layer via the atmosphere renderer drawn on top.
        // opacity_Surface controls base transparency.
        const waterAlpha = Math.min(1, (WD.opacity_Surface ?? 0.8));
        ctx2.save();
        ctx2.beginPath(); ctx2.arc(sp.x, sp.y, r, 0, Math.PI*2); ctx2.clip();
        ctx2.globalAlpha *= waterAlpha;
        ctx2.translate(sp.x, sp.y);
        ctx2.rotate(wtRotRad);
        ctx2.drawImage(wCanvas, -wtDrawHalf, -wtDrawHalf, wtDrawHalf*2, wtDrawHalf*2);
        ctx2.restore();
      }
    }

    // ── Cloud texture band — gated on outer_px threshold, independent of atmoFade ──
    if(envFlags.clouds){
      const CLD = b.data.ATMOSPHERE_VISUALS_DATA?.CLOUDS;
      if(CLD && CLD.texture && CLD.texture !== 'None'){
        const srcImg = textureCache[CLD.texture];
        if(srcImg && srcImg.complete && srcImg.naturalWidth > 0){
          // ScalePlanetData multiplies all atmosphere heights by atmoMult before shader setup
          const atmoMult  = getAtmoDifficultyMult(b.data);
          const startH_m  = (CLD.startHeight || 0)                              * atmoMult;
          const cloudH_m  = Math.max(1, (CLD.height || 1))                      * atmoMult;
          const rawAlpha  = CLD.alpha || 0;
          const widthM    = Math.max(1, (CLD.width || 1))                       * atmoMult;
          const gradH_m   = (b.data.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.height || (CLD.height||1)) * atmoMult;

          if(rawAlpha > 0.005){
            const cldScale = 1;
            // outer = R + startH + cloudH — the true cloud disc extent.
            // Use R_eff (difficulty-scaled radius) for all cloud geometry — the game calls
            // ScalePlanetData before CreateAtmosphereMaterial so R in the shader = R * radiusMult.
            const R_eff_px = bodyRadius_m * radiusMult;
            const inner_px = physR_px * (R_eff_px + startH_m) / R_eff_px * cldScale;
            const outer_px = physR_px * (R_eff_px + startH_m + cloudH_m) / R_eff_px * cldScale;
            const band_px  = outer_px - inner_px;

            // Scale threshold inversely with cloud size so big clouds render from further away.
            const cldThr = 2;
            const cldLod = cldThr * R_eff_px / (R_eff_px + startH_m + cloudH_m);
            if(outer_px >= cldLod){
              const cldFade = Math.max(0, Math.min(1, (outer_px - cldLod) / Math.max(cldLod, 0.01)));
              if(cldFade > 0){
                const baseAlpha = Math.min(rawAlpha, 1) * cldFade;

                // Shader uniforms must use R_eff (difficulty-scaled radius) — the game
                // calls ScalePlanetData(radius *= radiusScale) before CreateAtmosphereMaterial.
                // Using raw bodyRadius_m gives wrong numTiles (e.g. 10× instead of 1 for wormholes).
                // _CloudSizeX: horizontal tile count around circumference
                const numTiles = Math.max(1, Math.ceil((R_eff_px + startH_m) * 6.283185307 / widthM));

                // _CloudSizeY: how many texture heights fit in the gradient span
                const cloudSizeY = (R_eff_px + gradH_m) / cloudH_m;

                // _CloudStartY: V offset where the cloud band begins in the gradient strip
                const cloudStartY = (R_eff_px + startH_m + gradH_m) / gradH_m - 1;

                // Cache key: all world-space, zoom-independent
                const cacheKey = 'cld5:' + CLD.texture
                                + '|' + cloudStartY.toFixed(5)
                                + '|' + cloudSizeY.toFixed(5)
                                + '|' + numTiles
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
                  const outerN = SZ / 2;
                  // innerFrac from world-space: inner_m / outer_m (zoom-independent)
                  const inner_m = R_eff_px + startH_m;
                  const outer_m = R_eff_px + startH_m + cloudH_m;
                  const innerFrac = inner_m / outer_m;
                  const innerN = outerN * innerFrac;

                  const edgeFade = 1.5; // px to feather inner/outer edges
                  for(let py = 0; py < SZ; py++){
                    for(let px2 = 0; px2 < SZ; px2++){
                      const dx = px2 - cx0, dy = py - cy0;
                      const dist = Math.sqrt(dx * dx + dy * dy);
                      if(dist < innerN - edgeFade || dist > outerN + edgeFade) continue;
                      // Soft fade at inner and outer edges
                      const innerAlpha = Math.min(1, (dist - (innerN - edgeFade)) / edgeFade);
                      const outerAlpha = Math.min(1, ((outerN + edgeFade) - dist) / edgeFade);
                      const edgeA = Math.min(innerAlpha, outerAlpha);
                      // radFrac_world: 0 at inner edge (planet surface), 1 at outer edge
                      const radFrac_world = Math.max(0, Math.min(1, (dist - innerN) / (outerN - innerN)));
                      let ang = Math.atan2(dy, dx) / (2 * Math.PI);
                      if(ang < 0) ang += 1;
                      const u = (ang * numTiles) % 1;
                      const v = (radFrac_world * cloudSizeY + cloudStartY) % 1;
                      const sx = Math.min(tw - 1, Math.floor(u * tw));
                      // Unity V=0 is texture bottom; Canvas2D y=0 is top — flip required
                      const sy = Math.min(th - 1, Math.floor((1 - v) * th));
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
    if(envFlags.fog && atmoFade > 0 && b.data.ATMOSPHERE_VISUALS_DATA?.FOG?.keys){
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
    if(envFlags.fclouds && atmoFade > 0 && b.data.FRONT_CLOUDS_DATA){
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

    // ── Selection ring ──
    if(selectedBody === name){
      ctx2.beginPath(); ctx2.arc(sp.x, sp.y, r+6, 0, Math.PI*2);
      ctx2.strokeStyle='rgba(80,180,255,0.75)'; ctx2.lineWidth=1.5;
      ctx2.setLineDash([4,4]); ctx2.stroke(); ctx2.setLineDash([]);
    }

    ctx2.restore(); // end bodyFadeA globalAlpha

    // ── Label — fades out earlier than the body ──
    if(labelFadeA > 0.01){
      const fontSize = 9;
      ctx2.globalAlpha = labelFadeA;
      ctx2.fillStyle = selectedBody===name ? 'rgba(180,230,255,0.95)' : 'rgba(150,200,240,0.7)';
      ctx2.font = `${fontSize}px "JetBrains Mono",monospace`;
      ctx2.textAlign = 'center';
      const displayName = (selectedBody===name && drawViewport._pendingName) ? drawViewport._pendingName : name;
      ctx2.fillText(displayName, sp.x, sp.y + r + fontSize + 2);
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

      lms.forEach((lm, lmIdx) => {
        if(!lm.name) return;
        const neon = NEON_COLORS[lmIdx % NEON_COLORS.length];
        const midDeg = (lm.startAngle + lm.endAngle) / 2;
        // SFS: 0°=right, 90°=top.  Canvas: 0=right, -PI/2=top.
        // canvas_ang = -deg * PI/180
        const ang = -midDeg * Math.PI / 180;
        const lx = sp.x + r * Math.cos(ang);
        const ly = sp.y + r * Math.sin(ang);

        // ── Full arc extent (neon glow) ──
        if(showLmArcs){
          const startRad = -lm.startAngle * Math.PI / 180;
          const endRad   = -lm.endAngle   * Math.PI / 180;
          // Determine arc direction: draw from startAngle to endAngle in the short direction
          // SFS stores start < end typically; canvas arc goes CCW when end < start in canvas coords.
          // We always draw from startRad toward endRad anticlockwise (canvas CCW = decreasing angle).
          const arcStart = Math.min(startRad, endRad);
          const arcEnd   = Math.max(startRad, endRad);

          // Outer glow pass
          ctx2.save();
          ctx2.globalAlpha = lmAlpha * 0.45;
          ctx2.beginPath();
          ctx2.arc(sp.x, sp.y, r + 5, arcStart, arcEnd);
          ctx2.strokeStyle = neon;
          ctx2.lineWidth = 10;
          ctx2.lineCap = 'round';
          ctx2.shadowColor = neon;
          ctx2.shadowBlur = 14;
          ctx2.stroke();
          ctx2.restore();

          // Solid neon arc
          ctx2.save();
          ctx2.globalAlpha = lmAlpha * 0.9;
          ctx2.beginPath();
          ctx2.arc(sp.x, sp.y, r + 5, arcStart, arcEnd);
          ctx2.strokeStyle = neon;
          ctx2.lineWidth = 3;
          ctx2.lineCap = 'round';
          ctx2.shadowColor = neon;
          ctx2.shadowBlur = 8;
          ctx2.stroke();
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


