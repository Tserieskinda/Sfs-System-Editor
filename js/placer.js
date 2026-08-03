// ════════════════════════════════════════════════════════════
//  placer.js  —  Precise Object Placer
//  Click anywhere on the viewport to place a body at that
//  exact position (SMA + AOP computed from click relative
//  to the chosen parent body).
// ════════════════════════════════════════════════════════════

let _placerOpen      = false;
let _placerActive    = false;   // click-to-place mode on
let _placerPresetKey = null;    // selected preset key
let _placerParent    = null;    // parent body name
let _placerPlaced    = 0;       // count of bodies placed this session
let _placerDirection = 1;       // orbit direction: 1 CW / -1 CCW
let _placerEcc       = 0;       // eccentricity for placed bodies (0 = circular)

// ── Open / Close ─────────────────────────────────────────────
function openPlacer() {
  if (typeof _utilsDropOpen !== 'undefined') _utilsDropOpen = false;
  const dropdown = document.getElementById('utils-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  _placerOpen = true;
  const panel = document.getElementById('placer-panel');
  if (panel) panel.classList.add('open');

  _placerRefreshParents();
  _placerRefreshPresets();
  _placerSyncUI();
}

function closePlacer() {
  _placerOpen = false;
  _placerActive = false;
  const panel = document.getElementById('placer-panel');
  if (panel) panel.classList.remove('open');
  _placerSyncActive();
}

// ── Sync UI state ─────────────────────────────────────────────
function _placerSyncUI() {
  const btn   = document.getElementById('placer-toggle-btn');
  const hint  = document.getElementById('placer-hint');
  if (!btn) return;
  if (_placerActive) {
    btn.innerHTML  = '<svg class="icon"><use href="#icon-octagon"></use></svg> STOP PLACING';
    btn.style.background    = 'rgba(220,80,80,.15)';
    btn.style.borderColor   = 'rgba(220,80,80,.5)';
    btn.style.color         = 'rgba(255,140,140,.9)';
    if (hint) hint.style.opacity = '1';
  } else {
    btn.innerHTML = '<svg class="icon"><use href="#icon-map-pin"></use></svg> START PLACING';
    btn.style.background    = 'rgba(100,220,180,.08)';
    btn.style.borderColor   = 'rgba(100,220,180,.4)';
    btn.style.color         = 'rgba(100,220,180,.9)';
    if (hint) hint.style.opacity = '0.4';
  }
  const countEl = document.getElementById('placer-count');
  if (countEl) countEl.textContent = _placerPlaced;
}

function _placerSyncActive() {
  _placerSyncUI();
  // Change cursor on viewport
  const vp = document.getElementById('viewport');
  if (vp) vp.style.cursor = _placerActive ? 'crosshair' : '';
}

// ── Toggle click-to-place mode ────────────────────────────────
function placerToggleActive() {
  if (!_placerPresetKey) { alert('Select a body type first.'); return; }
  if (!_placerParent)    { alert('Select a parent body first.'); return; }
  _placerActive = !_placerActive;
  _placerSyncActive();
}

// ── Reset placed counter ─────────────────────────────────────
function placerResetCount() {
  _placerPlaced = 0;
  _placerSyncUI();
}

// ── Populate parent selector ──────────────────────────────────
function _placerRefreshParents() {
  const sel = document.getElementById('placer-parent-sel');
  if (!sel) return;
  const prev = _placerParent;
  sel.innerHTML = '';

  const names = Object.keys(bodies || {});
  if (names.length === 0) {
    sel.innerHTML = '<option value="">— no bodies —</option>';
    _placerParent = null;
    return;
  }

  // Center body first, then others sorted by SMA
  const sorted = names.slice().sort((a, b) => {
    const ac = bodies[a].isCenter, bc = bodies[b].isCenter;
    if (ac && !bc) return -1;
    if (!ac && bc) return  1;
    const sa = bodies[a].data?.ORBIT_DATA?.semiMajorAxis || 0;
    const sb = bodies[b].data?.ORBIT_DATA?.semiMajorAxis || 0;
    return sa - sb;
  });

  sorted.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n + (bodies[n].isCenter ? ' (center)' : '');
    sel.appendChild(opt);
  });

  if (prev && bodies[prev]) {
    sel.value = prev;
    _placerParent = prev;
  } else {
    _placerParent = sorted[0] || null;
    sel.value = _placerParent || '';
  }
}

function placerOnParentChange() {
  const sel = document.getElementById('placer-parent-sel');
  _placerParent = sel ? sel.value : null;
}

// ── Populate preset selector ──────────────────────────────────
function _placerRefreshPresets() {
  const sel = document.getElementById('placer-preset-sel');
  if (!sel) return;

  if (typeof buildAllPresets !== 'function') return;
  const all = buildAllPresets().filter(p => !p.isSystem);

  sel.innerHTML = '<option value="">— choose body type —</option>';

  // Group by category
  const cats = {};
  all.forEach(p => {
    const cat = p.category || 'other';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(p);
  });

  Object.keys(cats).sort().forEach(cat => {
    const og = document.createElement('optgroup');
    og.label = cat.toUpperCase();
    cats[cat].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.key;
      opt.textContent = p.name;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });

  if (_placerPresetKey) sel.value = _placerPresetKey;
}

function placerOnPresetChange() {
  const sel = document.getElementById('placer-preset-sel');
  _placerPresetKey = sel ? (sel.value || null) : null;
}

// ── Direction / eccentricity controls ────────────────────────
function placerOnDirChange() {
  const sel = document.getElementById('placer-dir-sel');
  _placerDirection = parseInt(sel?.value ?? '1') || 1;
}

function placerOnEccInput() {
  const sl = document.getElementById('placer-ecc-sl');
  _placerEcc = parseFloat(sl?.value ?? '0') || 0;
  const lbl = document.getElementById('placer-ecc-val');
  if (lbl) lbl.textContent = _placerEcc.toFixed(2);
}

// ── Get parent body world position ────────────────────────────
function _placerParentWorldPos(parentName) {
  if (!parentName || !bodies[parentName]) return { x: 0, y: 0 };
  const b = bodies[parentName];
  if (b.isCenter) return { x: 0, y: 0 };

  const od = b.data?.ORBIT_DATA;
  if (!od) return { x: 0, y: 0 };

  // Get parent's parent position (recurse one level — good enough for most cases)
  const grandparentPos = _placerParentWorldPos(od.parent);
  const smaPx = typeof smaToPixels === 'function' ? smaToPixels(typeof effectiveSMA === 'function' ? effectiveSMA(od) : od.semiMajorAxis) : 0;
  const aopRad = (od.argumentOfPeriapsis || 0) * Math.PI / 180;
  const ecc = od.eccentricity || 0;
  const c = smaPx * ecc;
  // Body starts at periapsis (true anomaly = 0), same as orbitGeometry bodyX/bodyY
  const bodyX = grandparentPos.x + (smaPx - c) *  Math.cos(aopRad);
  const bodyY = grandparentPos.y - (smaPx - c) *  Math.sin(aopRad);
  return { x: bodyX, y: bodyY };
}

// ── Place a body at a world position ─────────────────────────
function _placerPlaceAt(worldX, worldY) {
  if (!_placerPresetKey || !_placerParent) return;
  if (typeof buildAllPresets !== 'function') return;

  const all = buildAllPresets();
  const preset = all.find(p => p.key === _placerPresetKey);
  if (!preset) return;

  const parentPos = _placerParentWorldPos(_placerParent);
  const dx = worldX - parentPos.x;
  const dy = worldY - parentPos.y;

  // Distance in world units → SMA in metres
  const distPx  = Math.sqrt(dx * dx + dy * dy);
  const smaPx   = Math.max(distPx, 1);
  const smaM    = typeof getSMAScale === 'function' ? (smaPx / getSMAScale()) : smaPx;

  // Angle from parent to click: atan2 in canvas space (Y-down)
  // SFS AOP: 0° = right, increases counterclockwise in math space.
  // orbitGeometry bodyX = parentX + (sma - c)*cos(aop), bodyY = parentY - (sma-c)*sin(aop)
  // So aop = atan2(-(worldY - parentY), worldX - parentX)
  const aopRad = Math.atan2(-dy, dx);
  const aopDeg = aopRad * 180 / Math.PI;

  const data = JSON.parse(JSON.stringify(preset.data));
  data.ORBIT_DATA = {
    parent:             _placerParent,
    semiMajorAxis:      smaM,
    smaDifficultyScale: {},
    eccentricity:       _placerEcc,
    argumentOfPeriapsis: aopDeg,
    direction:          _placerDirection,
    multiplierSOI:      2.5,
    soiDifficultyScale: {}
  };

  // Unique name
  let baseName = preset.name.replace(/\s+/g, '_');
  let name = baseName; let n = 1;
  while (bodies[name]) { name = baseName + '_' + (++n); }

  if (typeof pushUndo === 'function') pushUndo();
  bodies[name] = { data, preset: preset.id, isCenter: false, color: preset.color, glow: preset.glow, icon: preset.icon };

  if (typeof drawViewport       === 'function') drawViewport();
  if (typeof updateStatusBar    === 'function') updateStatusBar();
  if (typeof syncAddBodyBtn     === 'function') syncAddBodyBtn();

  _placerPlaced++;
  _placerSyncUI();
}

// ── Viewport click + touch handler ───────────────────────────
// Returns true if the placer consumed the event.
function placerHandleViewportClick(e) {
  if (!_placerActive) return false;

  const vpEl = document.getElementById('viewport');
  if (!vpEl) return false;
  const rect = vpEl.getBoundingClientRect();

  // Support both mouse events and touch events
  let clientX, clientY;
  if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  const sx = clientX - rect.left;
  const sy = clientY - rect.top;

  if (typeof screenToWorld !== 'function') return false;
  const wp = screenToWorld(sx, sy);
  _placerPlaceAt(wp.x, wp.y);
  return true;
}

// ── Wire up the viewport click + touchend at DOM-ready ────────
document.addEventListener('DOMContentLoaded', () => {
  const vpEl = document.getElementById('viewport');
  if (!vpEl) return;

  // Mouse click (capture phase — runs before existing viewport handlers)
  vpEl.addEventListener('click', e => {
    if (placerHandleViewportClick(e)) {
      e.stopPropagation();
    }
  }, true);

  // Touch: use touchend for instant response, no 300ms delay.
  // Only fires if the touch didn't move significantly (i.e. it was a tap, not a pan).
  let _placerTouchStartX = 0, _placerTouchStartY = 0;
  vpEl.addEventListener('touchstart', e => {
    if (!_placerActive) return;
    _placerTouchStartX = e.touches[0].clientX;
    _placerTouchStartY = e.touches[0].clientY;
  }, { passive: true });

  vpEl.addEventListener('touchend', e => {
    if (!_placerActive) return;
    if (e.changedTouches.length !== 1) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - _placerTouchStartX;
    const dy = t.clientY - _placerTouchStartY;
    // Only place if finger didn't move (tap, not pan/pinch)
    if (Math.sqrt(dx * dx + dy * dy) > 10) return;
    if (placerHandleViewportClick(e)) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, { passive: false, capture: true });
});
