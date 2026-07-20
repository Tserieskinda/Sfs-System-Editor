// ════════════════════════════════════════════════════════════
//  procgen.js  —  Procedural System Generation
// ════════════════════════════════════════════════════════════

const AU = 1.496e11;

const PG = {
  types: {
    // Stars (by spectral class + special types)
    star_O:           { label:'O-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#a0c0ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'O' },
    star_B:           { label:'B-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#b8d0ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'B' },
    star_A:           { label:'A-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#d8e8ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'A' },
    star_F:           { label:'F-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#f8f8ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'F' },
    star_G:           { label:'G-class Star (Sun)', icon:'⭐', enabled:true,  weight:20, color:'#ffd060', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'Sun' },
    star_K:           { label:'K-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#ffb060', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'K' },
    star_M:           { label:'M-class Star',       icon:'⭐', enabled:false, weight:0,  color:'#ff8040', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'M' },
    star_blue_giant:  { label:'Blue Giant',         icon:'💠', enabled:false, weight:0,  color:'#6090ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'Blue Giant' },
    star_white_dwarf: { label:'White Dwarf',        icon:'⚪', enabled:false, weight:0,  color:'#e8e8ff', eccMax:0.05, soiScale:1.0, isStar:true, presetName:'White Dwarf' },
    // Regular bodies
    planet:      { label:'Planets',      icon:'🌍', enabled:true,  weight:55, color:'#4488ff', eccMax:0.15, soiScale:1.0 },
    moon:        { label:'Moons',        icon:'🌙', enabled:true,  weight:18, color:'#aaaaaa', eccMax:0.05, soiScale:1.0 },
    asteroid:    { label:'Asteroids',    icon:'☄️', enabled:false, weight:0,  color:'#886644', eccMax:0.55, soiScale:0.3 },
    brown_dwarf: { label:'Brown Dwarfs', icon:'🟤', enabled:false, weight:0,  color:'#cc6622', eccMax:0.10, soiScale:1.0 },
    blackhole:   { label:'Black Holes',  icon:'⚫', enabled:false, weight:0,  color:'#8800ff', eccMax:0.05, soiScale:2.0 },
  },
  modes: {
    asteroid_cluster: { label:'Asteroid Cluster', enabled:false, weight:0 },
    star_cluster:     { label:'Star Cluster',     enabled:false, weight:0 },
  },
  tune: {
    bodyCount:    { min:1,    max:9999, val:6,    step:1,    label:'Body Count' },
    orbitMin:     { min:0,    max:9999, val:0.3,  step:0.1,  label:'Min Orbit (AU)' },
    orbitMax:     { min:0.1,  max:9999, val:15,   step:1,    label:'Max Orbit (AU)' },
    radiusScale:  { min:0.01, max:9999, val:1.0,  step:0.1,  label:'Radius Scale' },
    eccentricity: { min:0,    max:0.99, val:0.9,  step:0.01, label:'Ecc Ceiling (all types)' },
  },
  misc: {
    addMoons:              true,
    addRings:              true,
    addAtmospheres:        true,
    randomizeTextures:     false,
    randomizeAtmoTextures: false,
  },
  preview: { bodies:[], center:null },
  canvas:  { pan:{x:0,y:0}, zoom:1, drag:false, lastP:null, hovered:null, selected:null },
};

// ── Seed lock ─────────────────────────────────────────────────
// When locked, pgGenerate() replays the same seeded sequence so
// the body layout is identical — only the post-generation settings
// (SOI multipliers, radius scale, etc.) are recalculated fresh.
let _pgSeedLocked = false;
let _pgSavedSeed  = null;   // array of random values consumed during last gen

function pgToggleSeedLock() {
  _pgSeedLocked = !_pgSeedLocked;
  const btn = document.getElementById('pg-seed-lock-btn');
  if (btn) {
    btn.textContent = _pgSeedLocked ? '🔒 SEED' : '🔓 SEED';
    btn.classList.toggle('seed-locked', _pgSeedLocked);
    btn.title = _pgSeedLocked
      ? 'Seed locked — GEN will reuse the same layout. Click to unlock.'
      : 'Lock seed — regenerate with same body layout but updated settings';
  }
  if (_pgSeedLocked && !_pgSavedSeed) {
    pgShowStatus('⚠ Generate first to capture a seed.', 'warn');
    _pgSeedLocked = false;
    if (btn) { btn.textContent = '🔓 SEED'; btn.classList.remove('seed-locked'); }
  } else {
    pgShowStatus(_pgSeedLocked ? '🔒 Seed locked — layout will be preserved on next GEN' : '🔓 Seed unlocked', _pgSeedLocked ? 'ok' : 'info');
  }
  try { SFX.select(); } catch(_) {}
}

// Seeded RNG — replaces Math.random() during generation so we can replay
let _pgRngPool = null;
let _pgRngIdx  = 0;
let _pgRngRecord = null;   // records values when not locked

function _pgRand() {
  if (_pgRngPool) {
    // Replay from saved seed
    const v = _pgRngPool[_pgRngIdx % _pgRngPool.length];
    _pgRngIdx++;
    return v;
  }
  // Fresh random — record for potential future lock
  const v = Math.random();
  if (_pgRngRecord) _pgRngRecord.push(v);
  return v;
}

// ── SOI controls ─────────────────────────────────────────────
// These mirror the constants in _pgComputeSOIMultipliers but are
// user-adjustable. On each GEN they are read from the sliders.
let _pgSOIGlobal = 1.0;

function pgSetSOIGlobal(v) {
  _pgSOIGlobal = parseFloat(v) || 1.0;
  const lbl = document.getElementById('pg-soi-global-val');
  if (lbl) lbl.textContent = _pgSOIGlobal.toFixed(2) + '×';
}
function pgSetSOIFill(v) {
  _PG_SOI_FILL_DYN = parseFloat(v) || 0.45;
  const lbl = document.getElementById('pg-soi-fill-val');
  if (lbl) lbl.textContent = _PG_SOI_FILL_DYN.toFixed(2);
}
function pgSetSOIMinR(v) {
  _PG_SOI_MIN_R_DYN = parseFloat(v) || 4.0;
  const lbl = document.getElementById('pg-soi-minr-val');
  if (lbl) lbl.textContent = _PG_SOI_MIN_R_DYN.toFixed(1) + '×';
}
function pgSetSOIMaxR(v) {
  _PG_SOI_MAX_R_DYN = parseFloat(v) || 0.45;
  const lbl = document.getElementById('pg-soi-maxr-val');
  if (lbl) lbl.textContent = _PG_SOI_MAX_R_DYN.toFixed(2);
}

let _PG_SOI_FILL_DYN  = 0.45;
let _PG_SOI_MIN_R_DYN = 4.0;
let _PG_SOI_MAX_R_DYN = 0.45;


function openProceduralGen() {
  _utilsDropOpen = false;
  document.getElementById('utils-dropdown').style.display = 'none';
  const modal = document.getElementById('procgen-modal');
  modal.style.display = 'flex';
  pgBuildUI();
  pgRefreshCenterSel();
}

function pgRefreshCenterSel() {
  const sel = document.getElementById('pg-center-sel');
  if (!sel) return;
  const prev = sel.value;   // preserve current selection before rebuilding
  const currentBodies = typeof bodies !== 'undefined' ? Object.keys(bodies) : [];
  sel.innerHTML = '<option value="">— new system —</option>'
    + currentBodies.map(n => `<option value="${n}">${n}${bodies[n]?.isCenter ? ' ★' : ''}</option>`).join('');
  // Restore selection if the body still exists
  if (prev && currentBodies.includes(prev)) sel.value = prev;
}
function closeProceduralGen() {
  _pgGenAbort = true;
  _pgHideLoader();
  document.getElementById('procgen-modal').style.display = 'none';
}

// pgTogglePanel removed — panel is always visible inside the sidebar

function pgSwitchTab(name, el) {
  document.querySelectorAll('.pg-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.pg-tab-panel').forEach(p => p.classList.remove('on'));
  if (el) el.classList.add('on');
  const panel = document.getElementById('pg-tabp-' + name);
  if (panel) panel.classList.add('on');
  if (name === 'presets') { if (typeof pgPresetsRender === 'function') pgPresetsRender(); }
  if (name === 'options')  pgRenderMiscOptions();
}

document.addEventListener('DOMContentLoaded', () => {});

// ── Build UI ──────────────────────────────────────────────────
function pgBuildUI() {
  pgRenderBodyTypeGrid();
  pgRenderFrequencyControls();
  pgRenderFineTuning();
  pgRenderMiscOptions();
  pgRenderSOIByType();
}

function pgRenderBodyTypeGrid() {
  const grid = document.getElementById('pg-body-type-grid');
  if (!grid) return;
  
  const stars  = Object.entries(PG.types).filter(([,t]) => t.isStar);
  const bodies = Object.entries(PG.types).filter(([,t]) => !t.isStar);
  const modes  = Object.entries(PG.modes);
  
  let html = '';
  
  if (stars.length) {
    html += '<div class="pg-group-title">STARS</div>';
    html += stars.map(([key, t]) => `
      <div class="pg-body-row">
        <label class="pg-body-btn ${t.enabled?'pg-body-btn--on':''}" data-type="${key}"
          onclick="pgToggleType('${key}',this)">
          <span class="pg-body-icon">${t.icon}</span>
          <span class="pg-body-label">${t.label}</span>
          <span class="pg-body-check">${t.enabled?'✓':''}</span>
        </label>
      </div>`).join('');
  }
  
  if (bodies.length) {
    html += '<div class="pg-group-title">BODIES</div>';
    html += bodies.map(([key, t]) => `
      <div class="pg-body-row">
        <label class="pg-body-btn ${t.enabled?'pg-body-btn--on':''}" data-type="${key}"
          onclick="pgToggleType('${key}',this)">
          <span class="pg-body-icon">${t.icon}</span>
          <span class="pg-body-label">${t.label}</span>
          <span class="pg-body-check">${t.enabled?'✓':''}</span>
        </label>
      </div>`).join('');
  }
  
  if (modes.length) {
    html += '<div class="pg-group-title">SPAWN MODES</div>';
    html += modes.map(([key, m]) => `
      <div class="pg-body-row">
        <label class="pg-body-btn ${m.enabled?'pg-body-btn--on':''}" data-type="${key}"
          onclick="pgToggleMode('${key}',this)">
          <span class="pg-body-icon">${m.label.includes('Asteroid') ? '☄️☄️' : '⭐⭐'}</span>
          <span class="pg-body-label">${m.label}</span>
          <span class="pg-body-check">${m.enabled?'✓':''}</span>
        </label>
      </div>`).join('');
  }
  
  grid.innerHTML = html;
}

function pgToggleType(key, el) {
  PG.types[key].enabled = !PG.types[key].enabled;
  el.classList.toggle('pg-body-btn--on', PG.types[key].enabled);
  el.querySelector('.pg-body-check').textContent = PG.types[key].enabled ? '✓' : '';
  pgRenderFrequencyControls();
}

function pgToggleMode(key, el) {
  PG.modes[key].enabled = !PG.modes[key].enabled;
  el.classList.toggle('pg-body-btn--on', PG.modes[key].enabled);
  el.querySelector('.pg-body-check').textContent = PG.modes[key].enabled ? '✓' : '';
  pgRenderFrequencyControls();
}

function pgRenderFrequencyControls() {
  const container = document.getElementById('pg-freq-controls');
  if (!container) return;
  
  const enabledTypes = Object.entries(PG.types).filter(([,t]) => t.enabled);
  const enabledModes = Object.entries(PG.modes).filter(([,m]) => m.enabled);
  const allEnabled   = [...enabledTypes, ...enabledModes];
  
  if (!allEnabled.length) {
    container.innerHTML = '<div style="font-size:.7rem;color:rgba(150,160,200,.5)">Enable a body type or mode above.</div>';
    return;
  }
  
  const totalW = allEnabled.reduce((s,[,t]) => s+t.weight, 0);
  
  let html = '';
  
  const stars  = enabledTypes.filter(([,t]) => t.isStar);
  const bodies = enabledTypes.filter(([,t]) => !t.isStar);
  
  if (stars.length) {
    html += '<div class="pg-group-title" style="margin-top:0">STARS</div>';
    html += stars.map(([key,t]) => {
      const pct = totalW > 0 ? Math.round((t.weight/totalW)*100) : 0;
      return `<div class="pg-freq-row">
        <span class="pg-freq-icon">${t.icon}</span>
        <span class="pg-freq-name">${t.label}</span>
        <input type="range" class="pg-freq-slider" min="0" max="100" value="${t.weight}"
          oninput="pgSetWeight('${key}',this.value)" style="accent-color:${t.color}">
        <span class="pg-freq-pct" id="pg-pct-${key}">${pct}%</span>
      </div>`;
    }).join('');
  }
  
  if (bodies.length) {
    html += '<div class="pg-group-title">BODIES</div>';
    html += bodies.map(([key,t]) => {
      const pct = totalW > 0 ? Math.round((t.weight/totalW)*100) : 0;
      return `<div class="pg-freq-row">
        <span class="pg-freq-icon">${t.icon}</span>
        <span class="pg-freq-name">${t.label}</span>
        <input type="range" class="pg-freq-slider" min="0" max="100" value="${t.weight}"
          oninput="pgSetWeight('${key}',this.value)" style="accent-color:${t.color}">
        <span class="pg-freq-pct" id="pg-pct-${key}">${pct}%</span>
      </div>`;
    }).join('');
  }
  
  if (enabledModes.length) {
    html += '<div class="pg-group-title">MODES</div>';
    html += enabledModes.map(([key,m]) => {
      const pct = totalW > 0 ? Math.round((m.weight/totalW)*100) : 0;
      return `<div class="pg-freq-row">
        <span class="pg-freq-icon">${key.includes('asteroid') ? '☄️' : '⭐'}</span>
        <span class="pg-freq-name">${m.label}</span>
        <input type="range" class="pg-freq-slider" min="0" max="100" value="${m.weight}"
          oninput="pgSetModeWeight('${key}',this.value)" style="accent-color:#888">
        <span class="pg-freq-pct" id="pg-pct-${key}">${pct}%</span>
      </div>`;
    }).join('');
  }
  
  container.innerHTML = html;
}

function pgSetWeight(key, val) {
  PG.types[key].weight = parseInt(val);
  const enabledTypes = Object.entries(PG.types).filter(([,t])=>t.enabled);
  const enabledModes = Object.entries(PG.modes).filter(([,m])=>m.enabled);
  const totalW  = [...enabledTypes, ...enabledModes].reduce((s,[,t])=>s+t.weight,0);
  [...enabledTypes, ...enabledModes].forEach(([k,t]) => {
    const el = document.getElementById(`pg-pct-${k}`);
    if (el) el.textContent = (totalW > 0 ? Math.round((t.weight/totalW)*100) : 0)+'%';
  });
}

function pgSetModeWeight(key, val) {
  PG.modes[key].weight = parseInt(val);
  const enabledTypes = Object.entries(PG.types).filter(([,t])=>t.enabled);
  const enabledModes = Object.entries(PG.modes).filter(([,m])=>m.enabled);
  const totalW  = [...enabledTypes, ...enabledModes].reduce((s,[,t])=>s+t.weight,0);
  [...enabledTypes, ...enabledModes].forEach(([k,t]) => {
    const el = document.getElementById(`pg-pct-${k}`);
    if (el) el.textContent = (totalW > 0 ? Math.round((t.weight/totalW)*100) : 0)+'%';
  });
}

function pgRenderFineTuning() {
  const container = document.getElementById('pg-fine-tuning');
  if (!container) return;

  const globalInputs = Object.entries(PG.tune).map(([key,t]) => `
    <div>
      <div class="pg-tune-label">${t.label}</div>
      <div class="pg-tune-controls">
        <input type="number" class="pg-tune-input"
          step="${t.step}" value="${t.val}"
          onchange="pgSetTune('${key}',this.value)" id="pg-tune-input-${key}">
      </div>
    </div>`).join('');

  const eccInputs = Object.entries(PG.types).map(([key,t]) => `
    <div>
      <div class="pg-tune-label" style="display:flex;align-items:center;gap:5px">
        <span>${t.icon}</span><span>${t.label} Ecc</span>
      </div>
      <div class="pg-tune-controls">
        <input type="number" class="pg-tune-input"
          min="0" max="0.99" step="0.01" value="${t.eccMax}"
          onchange="pgSetTypeEcc('${key}',this.value)" id="pg-ecc-input-${key}">
      </div>
    </div>`).join('');

  container.innerHTML = globalInputs;

  const eccContainer = document.getElementById('pg-ecc-by-type');
  if (eccContainer) eccContainer.innerHTML = eccInputs;
}

function pgSetTypeEcc(key, val) {
  PG.types[key].eccMax = parseFloat(val) || 0;
}

function pgSetTypeSOI(key, val) {
  PG.types[key].soiScale = Math.max(0.01, parseFloat(val) || 1.0);
}

function pgRenderSOIByType() {
  const container = document.getElementById('pg-soi-by-type');
  if (!container) return;
  container.innerHTML = Object.entries(PG.types).map(([key, t]) => `
    <div>
      <div class="pg-tune-label" style="display:flex;align-items:center;gap:5px">
        <span>${t.icon}</span><span>${t.label} SOI Scale</span>
      </div>
      <div class="pg-tune-controls">
        <input type="range" class="pg-freq-slider" min="0.01" max="4" step="0.01"
          value="${t.soiScale ?? 1.0}"
          oninput="pgSetTypeSOI('${key}',this.value);document.getElementById('pg-soi-type-val-${key}').textContent=parseFloat(this.value).toFixed(2)+'×'"
          style="accent-color:${t.color}">
        <span id="pg-soi-type-val-${key}" style="min-width:40px;text-align:right;color:rgba(100,220,180,.88);font-size:.75rem">${(t.soiScale ?? 1.0).toFixed(2)}×</span>
      </div>
    </div>`).join('');
}

function pgSetTune(key, val) {
  PG.tune[key].val = parseFloat(val) || 0;
}

function pgRenderMiscOptions() {
  const container = document.getElementById('pg-misc-options');
  if (!container) return;
  const opts = [
    { key:'addMoons',              label:'Allow moon generation' },
    { key:'addRings',              label:'Allow ring systems' },
    { key:'addAtmospheres',        label:'Allow atmospheres' },
    { key:'randomizeTextures',     label:'Randomize surface textures' },
    { key:'randomizeAtmoTextures', label:'Randomize atmosphere textures' },
  ];
  container.innerHTML = opts.map(o => `
    <label class="pg-misc-row">
      <input type="checkbox" ${PG.misc[o.key]?'checked':''}
        onchange="PG.misc['${o.key}']=this.checked" style="accent-color:#64dcb4;width:18px;height:18px">
      <span>${o.label}</span>
    </label>`).join('')
    + `<div style="margin-top:6px;padding:7px 10px;border-radius:4px;background:rgba(100,220,180,.05);border:1px solid rgba(100,220,180,.12);font-family:'JetBrains Mono',monospace;font-size:.58rem;color:rgba(100,220,180,.55);letter-spacing:.04em">
        🔒 Lock texture to surface is always enabled
      </div>`;
}

// ── Loading overlay ───────────────────────────────────────────
function _pgShowLoader(msg, pct) {
  let ov = document.getElementById('pg-loader-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'pg-loader-overlay';
    ov.style.cssText = [
      'position:fixed','top:0','left:0','bottom:0',
      // Stop before the sidebar panel so the user can still interact with it
      'right:360px',
      'background:rgba(4,8,20,.72)','z-index:99998','display:flex',
      'flex-direction:column','align-items:center','justify-content:center',
      'gap:14px','pointer-events:all',
    ].join(';');
    ov.innerHTML = `
      <div style="font-family:'Orbitron',sans-serif;font-size:.72rem;letter-spacing:.18em;color:var(--sky2)" id="pg-loader-msg">GENERATING…</div>
      <div style="width:220px;height:4px;background:rgba(100,150,255,.15);border-radius:2px;overflow:hidden">
        <div id="pg-loader-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#4488ff,#88ccff);border-radius:2px;transition:width .12s"></div>
      </div>
      <div id="pg-loader-sub" style="font-size:.55rem;color:rgba(120,150,210,.5)">0 / 0 bodies</div>
      <button onclick="_pgGenAbort=true;_pgHideLoader()" style="
        margin-top:6px;padding:6px 18px;background:rgba(255,80,80,.1);
        border:1px solid rgba(255,80,80,.35);border-radius:4px;cursor:pointer;
        color:rgba(255,130,130,.88);font-family:'JetBrains Mono',monospace;
        font-size:.65rem;letter-spacing:.06em">CANCEL</button>`;
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  // On mobile the sidebar is full-width, so loader covers full screen there
  const modal = document.getElementById('procgen-modal');
  const isNarrow = window.innerWidth <= 700;
  ov.style.right = (!isNarrow && modal && modal.style.display !== 'none') ? '360px' : '0';
  const msgEl = document.getElementById('pg-loader-msg');
  const barEl = document.getElementById('pg-loader-bar');
  if (msgEl) msgEl.textContent = msg || 'GENERATING…';
  if (barEl && pct != null) barEl.style.width = Math.min(100, pct) + '%';
}
function _pgHideLoader() {
  const ov = document.getElementById('pg-loader-overlay');
  if (ov) ov.style.display = 'none';
}
function _pgLoaderSub(text) {
  const el = document.getElementById('pg-loader-sub');
  if (el) el.textContent = text;
}

// ── Async chunked generation ──────────────────────────────────
// Generation ONLY populates PG.preview — it never touches `bodies`.
// Call pgApply() to commit the preview to the live system.
const _PG_CHUNK = 30;
let   _pgGenAbort = false;

async function pgGenerate() {
  const enabled = Object.entries(PG.types).filter(([,t])=>t.enabled);
  if (!enabled.length) { pgShowStatus('Enable at least one body type.','warn'); return; }

  // Wait for the startup autoload to finish so dynamicPresets are available
  if (typeof _autoLoadPromise !== 'undefined' && _autoLoadPromise) {
    pgShowStatus('Waiting for presets to load…', 'info');
    try { await _autoLoadPromise; } catch(_) {}
  }

  // Verify presets are actually available — "Blank Body" alone isn't enough for a star
  if (typeof buildAllPresets === 'function') {
    const all = buildAllPresets();
    const hasUsable = all.some(p => ['star','planet','moon','gasgiant','ringedgiant','mercurylike','marslike'].includes(p.id));
    if (!hasUsable) {
      pgShowStatus('No presets loaded — drop your preset zip onto the editor first.', 'warn');
      return;
    }
  }

  // ── Seed setup ────────────────────────────────────────────────
  if (_pgSeedLocked && _pgSavedSeed) {
    // Replay the saved seed
    _pgRngPool = _pgSavedSeed;
    _pgRngIdx  = 0;
    _pgRngRecord = null;
  } else {
    // Fresh run — record values for future lock
    _pgRngPool   = null;
    _pgRngRecord = [];
  }

  _pgGenAbort = false;
  PG.preview.bodies = [];
  PG.preview.center = null;
  PG.canvas.selected = null;
  PG.canvas.hovered  = null;

  // Check if user picked an existing body to orbit around
  const selEl = document.getElementById('pg-center-sel');
  const chosenParentName = selEl?.value || '';
  const chosenParentBody = (chosenParentName && typeof bodies !== 'undefined') ? bodies[chosenParentName] : null;

  let centerName, center;
  if (chosenParentBody) {
    // Use the existing body as the center for orbit math — don't generate a new star
    centerName = chosenParentName;
    center = {
      name:     centerName,
      preset:   { data: chosenParentBody.data || {} },
      isCenter: true,
      orbitSMA: 0,
      radius:   (chosenParentBody.data?.BASE_DATA?.radius || 34817000),
      color:    chosenParentBody.color || '#ffd060',
      icon:     chosenParentBody.icon  || '⭐',
      _angle:   0,
      children: [],
    };
  } else {
    // New system: pick a center from enabled star types (or fallback to first enabled type)
    const starTypes   = enabled.filter(([,t]) => t.isStar);
    const centerType  = starTypes.length ? starTypes[0][0] : enabled[0][0];
    const centerPreset = pgPickPreset(centerType);
    if (!centerPreset) { pgShowStatus('No presets loaded — load a preset pack first.','warn'); return; }
    centerName = NameGen.generate();
    center = {
      name:     centerName,
      type:     centerType,
      preset:   centerPreset,
      isCenter: true,
      orbitSMA: 0,
      radius:   (centerPreset.data.BASE_DATA?.radius || 34817000),
      color:    PG.types[centerType]?.color || '#ffd060',
      icon:     PG.types[centerType]?.icon  || '⭐',
      _angle:   0,
      children: [],
    };
  }
  PG.preview.center = center;
  PG.preview.bodies.push(center);

  const count    = Math.max(0, PG.tune.bodyCount.val - 1);
  const orbitMin = PG.tune.orbitMin.val * AU;
  const orbitMax = PG.tune.orbitMax.val * AU;
  const spacing  = (orbitMax - orbitMin) / Math.max(count, 1);

  const starRadius    = center.radius || 34817000;
  const safeClearance = Math.max(orbitMin, starRadius * 8);

  // Stars never orbit another body unless star_cluster mode is active
  const starClusterMode = PG.modes.star_cluster?.enabled || false;
  const orbitTypes = enabled.filter(([k,t]) => !t.isStar || starClusterMode);
  const pickPool   = orbitTypes.length ? orbitTypes : enabled;

  if (count === 0) {
    _pgCommitToSystem();
    return;
  }

  _pgShowLoader('GENERATING…', 0);

  let i = 0;
  function _chunk() {
    if (_pgGenAbort) { _pgHideLoader(); return; }
    const end = Math.min(i + _PG_CHUNK, count);

    for (; i < end; i++) {
      // Check if we should generate a cluster instead of a normal body
      const enabledModes = Object.entries(PG.modes).filter(([,m]) => m.enabled);
      const allChoices = [
        ...pickPool.map(([k]) => [k, PG.types[k].weight, 'type']),
        ...enabledModes.map(([k,m]) => [k, m.weight, 'mode']),
      ];
      const [chosen, chosenWeight, chosenKind] = pgWeightedPickWithKind(allChoices);
      
      if (chosenKind === 'mode' && chosen === 'asteroid_cluster') {
        // Generate asteroid cluster: 5-15 asteroids in a tight band
        const clusterCount = 5 + Math.floor(_pgRand() * 11);
        const clusterOrbit = orbitMin + spacing * i;
        const clusterWidth = spacing * 0.3;
        for (let c = 0; c < clusterCount; c++) {
          const preset = pgPickPreset('asteroid');
          if (!preset) continue;
          const sma    = clusterOrbit + (_pgRand() - 0.5) * clusterWidth;
          const ecc    = _pgRand() * 0.3;
          const name   = NameGen.generate();
          const radius = (preset.data.BASE_DATA?.radius || 50000) * (0.2 + _pgRand() * 0.6);
          const body = {
            name, type: 'asteroid', preset, isCenter: false,
            parent: centerName, orbitSMA: sma, orbitEcc: ecc,
            orbitDir: _pgRand() > 0.1 ? 1 : -1,
            orbitAoP: _pgRand() * 360,
            radius, color: '#886644', icon: '☄️',
            _angle: _pgRand() * Math.PI * 2, children: [],
          };
          center.children.push(body);
        }
        continue;
      }
      
      if (chosenKind === 'mode' && chosen === 'star_cluster') {
        // Star cluster: pick a random enabled star type
        const starChoices = pickPool.filter(([,t]) => t.isStar);
        if (!starChoices.length) continue;
        const starType = starChoices[Math.floor(_pgRand() * starChoices.length)][0];
        const preset = pgPickPreset(starType);
        if (!preset) continue;
        const sma  = orbitMin + spacing * i;
        const ecc  = _pgRand() * 0.05;
        const name = NameGen.generate();
        const radius = (preset.data.BASE_DATA?.radius || 34817000) * PG.tune.radiusScale.val;
        const body = {
          name, type: starType, preset, isCenter: false,
          parent: centerName, orbitSMA: sma, orbitEcc: ecc,
          orbitDir: 1, orbitAoP: _pgRand() * 360,
          radius, color: PG.types[starType]?.color || '#ffd060',
          icon: PG.types[starType]?.icon || '⭐',
          _angle: _pgRand() * Math.PI * 2, children: [],
        };
        center.children.push(body);
        continue;
      }
      
      // Normal body generation
      const type   = chosen;
      const preset = pgPickPreset(type);
      if (!preset) continue;

      const baseSma    = orbitMin + spacing * i;
      const jitter     = spacing * (0.4 * _pgRand() - 0.2);
      const sma        = Math.max(safeClearance, Math.min(orbitMax, baseSma + jitter));
      const typeEccMax = Math.min(PG.types[type]?.eccMax ?? 0.15, PG.tune.eccentricity.val);
      const ecc        = _pgRand() * typeEccMax;
      const name       = NameGen.generate();
      const radius     = (preset.data.BASE_DATA?.radius || 600000) * PG.tune.radiusScale.val;

      const bodyGrav   = preset.data.BASE_DATA?.gravity  || 9.8;
      const centerGrav = center.preset.data.BASE_DATA?.gravity || 274;
      const centerR    = center.radius;
      const massRatio  = (bodyGrav * radius * radius) / (centerGrav * centerR * centerR);

      const body = {
        name, type, preset, isCenter: false,
        parent:   centerName,
        orbitSMA: sma,
        orbitEcc: ecc,
        orbitDir: _pgRand() > 0.1 ? 1 : -1,
        orbitAoP: _pgRand() * 360,
        radius,
        color: PG.types[type]?.color || '#aaaaaa',
        icon:  PG.types[type]?.icon  || '🌍',
        _angle: _pgRand() * Math.PI * 2,
        children: [],
      };

      if (PG.misc.addMoons && (type === 'planet' || type === 'gasgiant') && _pgRand() > 0.5) {
        const moonCount  = Math.floor(_pgRand() * 3) + 1;
        const moonEccMax = PG.types['moon']?.eccMax ?? 0.05;
        for (let m = 0; m < moonCount; m++) {
          const moonPreset = pgPickPreset('moon');   // fresh pick per moon
          if (!moonPreset) continue;
          const moon = {
            name:     NameGen.generate(),
            type:     'moon',
            parent:   name,
            preset:   moonPreset,
            orbitSMA: radius * (8 + m * 6 + _pgRand() * 3),
            orbitEcc: _pgRand() * moonEccMax,
            orbitAoP: _pgRand() * 360,
            orbitDir: 1,
            radius:   (moonPreset.data?.BASE_DATA?.radius || 300000) * 0.3,
            color:    '#999999',
            icon:     '🌙',
            _angle:   _pgRand() * Math.PI * 2,
            children: [],
          };
          body.children.push(moon);
        }
      }

      PG.preview.bodies.push(body);
      center.children.push(body);
    }

    const pct   = Math.round((i / count) * 100);
    const total = PG.preview.bodies.reduce((s, b) => s + 1 + b.children.length, 0);
    _pgLoaderSub(`${total} bodies — ${pct}%`);
    const bar = document.getElementById('pg-loader-bar');
    if (bar) bar.style.width = pct + '%';

    if (i < count) {
      setTimeout(_chunk, 0);
    } else {
      // Save the recorded random sequence for future seed-lock replays
      if (_pgRngRecord) {
        _pgSavedSeed = _pgRngRecord.slice();
        _pgRngRecord = null;
      }

      // Compute gap-based SOI multipliers
      const cGrav    = center.preset.data.BASE_DATA?.gravity || 274;
      const cR       = center.radius;
      const orbiters = PG.preview.bodies.filter(b => !b.isCenter);
      _pgComputeSOIMultipliers(orbiters, cGrav, cR);
      for (const planet of orbiters) {
        if (planet.children.length > 0) {
          const pGrav = planet.preset?.data?.BASE_DATA?.gravity || 9.8;
          _pgComputeSOIMultipliers(planet.children, pGrav, planet.radius);
        }
      }

      _pgHideLoader();
      // Auto-apply directly to main system
      _pgCommitToSystem();
    }
  }
  setTimeout(_chunk, 0);
}

// ── SOI multiplier calculation ────────────────────────────────
const _PG_SOI_FILL    = 0.45;  // fallback defaults (not used when dynamic vars are set)
const _PG_SOI_MIN_R   = 4.0;
const _PG_SOI_MAX_R   = 0.45;
const _PG_SOI_MULT_MIN = 0.05;
const _PG_SOI_MULT_MAX = 20.0;

function _pgComputeSOIMultipliers(list, parentGrav, parentR) {
  if (!list.length) return;

  // Read dynamic SOI settings (set by sliders) or fall back to defaults
  const soiFill  = (typeof _PG_SOI_FILL_DYN  !== 'undefined') ? _PG_SOI_FILL_DYN  : _PG_SOI_FILL;
  const soiMinR  = (typeof _PG_SOI_MIN_R_DYN  !== 'undefined') ? _PG_SOI_MIN_R_DYN  : _PG_SOI_MIN_R;
  const soiMaxR  = (typeof _PG_SOI_MAX_R_DYN  !== 'undefined') ? _PG_SOI_MAX_R_DYN  : _PG_SOI_MAX_R;
  const globalMult = (typeof _pgSOIGlobal !== 'undefined') ? _pgSOIGlobal : 1.0;

  const sorted = list.slice().sort((a, b) => a.orbitSMA - b.orbitSMA);
  const n = sorted.length;

  for (let i = 0; i < n; i++) {
    const body = sorted[i];
    const sma  = body.orbitSMA;
    if (!sma || sma <= 0) { body.soiMultiplier = 1.0 * globalMult; continue; }

    const innerBody = sorted[i - 1];
    const outerBody = sorted[i + 1];
    const innerEdge = innerBody ? innerBody.orbitSMA * (1 + (innerBody.orbitEcc || 0)) : 0;
    const outerEdge = outerBody ? outerBody.orbitSMA * (1 - (outerBody.orbitEcc || 0)) : sma * 2;
    const periapsis = sma * (1 - (body.orbitEcc || 0));
    const apoapsis  = sma * (1 + (body.orbitEcc || 0));
    const innerGap  = Math.max(0, periapsis - innerEdge);
    const outerGap  = Math.max(0, outerEdge - apoapsis);

    const gapSOI    = Math.min(innerGap, outerGap) * soiFill;
    const minSOI    = body.radius * soiMinR;
    const maxSOI    = sma * soiMaxR;
    const targetSOI = Math.max(minSOI, Math.min(maxSOI, gapSOI > 0 ? gapSOI : minSOI));

    const bodyGrav  = body.preset?.data?.BASE_DATA?.gravity || 9.8;
    const massRatio = (bodyGrav * body.radius * body.radius) / (parentGrav * parentR * parentR);
    const rawHill   = sma * Math.pow(Math.max(massRatio, 1e-12), 0.4);
    const mult      = rawHill > 0 ? targetSOI / rawHill : 1.0;
    const typeSoiScale = PG.types[body.type]?.soiScale ?? 1.0;
    body.soiMultiplier = Math.max(_PG_SOI_MULT_MIN, Math.min(_PG_SOI_MULT_MAX, mult * globalMult * typeSoiScale));
  }
}

function pgPickPreset(type) {
  if (typeof buildAllPresets !== 'function') return null;
  const all = buildAllPresets();
  if (!all.length) return null;

  // Check if type has a specific presetName (star subtypes e.g. 'Sun', 'K', 'Blue Giant')
  const typeObj = PG.types[type];
  if (typeObj?.presetName) {
    const match = all.find(p => p.name === typeObj.presetName);
    if (match) return match;
    // Fallback: any star preset
    const starFallback = all.find(p => p.id === 'star');
    if (starFallback) return starFallback;
  }

  const typeMap = {
    planet:      ['planet', 'mercurylike', 'marslike', 'gasgiant', 'ringedgiant'],
    moon:        ['moon'],
    asteroid:    ['asteroid'],
    gasgiant:    ['gasgiant', 'ringedgiant', 'planet'],
    brown_dwarf: ['star'],
    blackhole:   ['blackhole', 'star'],
  };

  const ids     = typeMap[type] || (typeObj?.isStar ? ['star'] : ['planet', 'moon']);
  const matches = all.filter(p => ids.includes(p.id));
  // Always return something — fall back to full pool if no type match
  const pool    = matches.length ? matches : all;
  return pool[Math.floor(_pgRand() * pool.length)];
}

function pgWeightedPick(pairs) {
  const total = pairs.reduce((s, [,w]) => s + w, 0);
  let r = _pgRand() * total;
  for (const [k, w] of pairs) { r -= w; if (r <= 0) return k; }
  return pairs[pairs.length - 1][0];
}

function pgWeightedPickWithKind(triples) {
  // triples: [[key, weight, kind], ...]
  const total = triples.reduce((s, [, w]) => s + (w || 0), 0);
  if (total <= 0) {
    const last = triples[triples.length - 1];
    return [last[0], last[1], last[2]];
  }
  let r = _pgRand() * total;
  for (const [k, w, kind] of triples) {
    r -= (w || 0);
    if (r <= 0) return [k, w, kind];
  }
  const last = triples[triples.length - 1];
  return [last[0], last[1], last[2]];
}

// ── Commit preview → main system ─────────────────────────────
// If a center body is selected in the dropdown, orbits are added around it.
// Otherwise the whole system is replaced.
function _pgCommitToSystem() {
  if (!PG.preview.center) return;
  if (typeof pushUndo === 'function') pushUndo();

  const sel = document.getElementById('pg-center-sel');
  const chosenCenter = sel?.value || '';

  if (chosenCenter && typeof bodies !== 'undefined' && bodies[chosenCenter]) {
    // ADD orbits around the chosen existing body
    document.getElementById('empty-state')?.classList.add('gone');
    _pgAddOrbiters(chosenCenter, () => {
      pgRefreshCenterSel();
      _pgFinish(chosenCenter);
    });
  } else {
    // REPLACE: wipe and build fresh system
    if (typeof bodies !== 'undefined') Object.keys(bodies).forEach(k => delete bodies[k]);
    document.getElementById('empty-state')?.classList.add('gone');
    const c  = PG.preview.center;
    const cd = JSON.parse(JSON.stringify(c.preset.data));
    delete cd.ORBIT_DATA;
    const cm = typeof inferPresetMeta === 'function' ? inferPresetMeta(c.name, cd) : {};
    bodies[c.name] = { data:cd, preset:cm.id||'star', isCenter:true,
      color:cm.color||c.color, glow:cm.glow||c.color, icon:cm.icon||c.icon };
    _pgAddOrbiters(c.name, () => {
      pgRefreshCenterSel();
      _pgFinish(c.name);
    });
  }
}

function pgApply() {
  if (!PG.preview.center) { pgShowStatus('Generate a system first.', 'warn'); return; }
  _pgCommitToSystem();
}

function pgImportCancel() {
  document.getElementById('pg-import-dialog').style.display = 'none';
}

function pgImportReplace() {
  pgImportCancel();
  if (typeof pushUndo === 'function') pushUndo();

  // Wipe current system
  if (typeof bodies !== 'undefined') {
    Object.keys(bodies).forEach(k => delete bodies[k]);
  }
  document.getElementById('empty-state')?.classList.add('gone');

  const c  = PG.preview.center;
  const cd = JSON.parse(JSON.stringify(c.preset.data));
  delete cd.ORBIT_DATA;
  const cm = typeof inferPresetMeta === 'function' ? inferPresetMeta(c.name, cd) : {};
  bodies[c.name] = {
    data: cd, preset: cm.id || 'star', isCenter: true,
    color: cm.color || c.color, glow: cm.glow || c.color, icon: cm.icon || c.icon,
  };

  _pgAddOrbiters(c.name, () => _pgFinish(c.name));
}

function pgImportOrbit() {
  const parentName = document.getElementById('pg-orbit-parent-sel').value;
  if (!parentName || !bodies[parentName]) {
    alert('Select a valid parent body first.'); return;
  }
  pgImportCancel();
  if (typeof pushUndo === 'function') pushUndo();
  document.getElementById('empty-state')?.classList.add('gone');

  const c  = PG.preview.center;
  const cd = JSON.parse(JSON.stringify(c.preset.data));
  const parentR = bodies[parentName]?.data?.BASE_DATA?.radius || 34817000;
  cd.ORBIT_DATA = {
    parent: parentName, semiMajorAxis: parentR * 80,
    eccentricity: 0.05, argumentOfPeriapsis: Math.random() * 360, direction: 1,
  };
  const cm = typeof inferPresetMeta === 'function' ? inferPresetMeta(c.name, cd) : {};
  bodies[c.name] = {
    data: cd, preset: cm.id || 'star', isCenter: false,
    color: cm.color || c.color, glow: cm.glow || c.color, icon: cm.icon || c.icon,
  };

  _pgAddOrbiters(c.name, () => _pgFinish(null));
}

function pgImportMerge() {
  pgImportCancel();
  if (typeof pushUndo === 'function') pushUndo();
  document.getElementById('empty-state')?.classList.add('gone');

  const existingCenter = typeof bodies !== 'undefined'
    ? Object.keys(bodies).find(k => bodies[k].isCenter) : null;

  if (!existingCenter) { pgImportReplace(); return; }
  _pgAddOrbiters(existingCenter, () => _pgFinish(existingCenter));
}

function _pgAddOrbiters(parentName, onDone) {
  const orbiters = PG.preview.bodies.filter(b => !b.isCenter);
  if (!orbiters.length) { if (onDone) onDone(); return; }

  const work = [];
  for (const body of orbiters) {
    work.push([body, parentName]);
    for (const moon of body.children) work.push([moon, body.name]);
  }

  _pgShowLoader('APPLYING…', 0);
  let idx = 0;
  const total = work.length;

  function _applyChunk() {
    if (_pgGenAbort) { _pgHideLoader(); return; }
    const end = Math.min(idx + _PG_CHUNK, total);
    for (; idx < end; idx++) {
      const [body, parent] = work[idx];
      _pgAddBody(body, parent);
    }
    const pct = Math.round((idx / total) * 100);
    const bar = document.getElementById('pg-loader-bar');
    if (bar) bar.style.width = pct + '%';
    _pgLoaderSub(`${idx} / ${total} bodies`);

    if (idx < total) {
      setTimeout(_applyChunk, 0);
    } else {
      _pgHideLoader();
      if (onDone) onDone();
    }
  }
  setTimeout(_applyChunk, 0);
}

// ════════════════════════════════════════════════════════════
//  SURFACE TEXTURE CATEGORIES
//
//  Categorized by visual appearance, confirmed against actual
//  texture images and planet file usage.
//
//  Three kinds of slot:
//    planetTexture   — full-sphere base texture (equirectangular)
//    surfaceTexture_A/B — tiling close-up detail layer
//    terrainTexture_C   — tiling mid-distance blend layer
//
//  Each named pool is an array the randomizer draws from.
// ════════════════════════════════════════════════════════════
const PG_TEX = {

  // ── surfaceTexture_A / B / terrainTexture_C detail tile pools ─────────────
  // Confirmed from Terrain/ folder PNGs and actual planet file usage.
  surface: {

    // Rough bare rock — used on Mars, Mercury, moons, asteroids
    rocky: [
      'Hard_Rocks', 'HardRocks02', 'Soft_Rocks', 'DryGround', 'Limestone',
    ],

    // Ice crystal / snow surface — used on Europa, Enceladus, icy moons
    icy: [
      'Ice', 'Ice02', 'Snow',
    ],

    // Fine dark dust particles — used on Io, asteroid presets, small moons
    dusty: [
      'Dark_Dust', 'DarkDust02',
    ],

    // Sandy / granular loose surface — used on Deimos, desert worlds
    sandy: [
      'Sand',
    ],

    // Craters / pockmarks pattern — used on Phobos, Ganymede, Callisto, Miranda
    cratered: [
      'Dots02', 'Circles', 'Circles02',
    ],

    // Smooth / blurred — used on water worlds, gas-covered surfaces
    smooth: [
      'Neutral', 'Blured02',
    ],

    // Black / void fill — used on asteroid presets as secondary
    dark: [
      'Black_Dust',
    ],
  },

  // ── planetTexture full-sphere base texture pools ──────────────────────────
  // Grouped by visual biome / body class, derived from screenshots + usage map.
  planet: {

    // Blue-green Earth-type worlds with continents and oceans
    earthlike: [
      'Earth_WithOceans',   // vanilla Earth with ocean mask
      'SuperEarth',         // larger version, green continents
      'RPBD_c',             // red/purple banded — exotic earthlike
    ],

    // Arid, rocky, heavily cratered terrestrial worlds (Venus/Mars-like)
    rocky_terrestrial: [
      'Mars',           // red-orange barren
      'Mercury',        // grey heavily-cratered
      'Venus',          // pale yellow/tan cloud bands
      'DesertWorld',    // tan/ochre desert surface
      'Caryhuang',      // orange rocky textured (custom)
    ],

    // Icy / frost-covered worlds — bright whites and pale blues
    icy_world: [
      'Europa',     // white cracked ice
      'Enceladus',  // bright white smooth ice
      'Frozen',     // custom — stark black/white ice fractures
      'Charon',     // grey-white cracked ice
      'Triton',     // pale grey-blue icy
      'Pluto',      // tan-grey icy dwarf
    ],

    // Dwarf planets and large trans-Neptunian objects
    dwarf_planet: [
      'Makemake',   // reddish-tan dwarf planet
      'Gonggong',   // red-tinted dwarf (custom — used as Small Moon planetTex)
      'Sedna',      // deep red-pink (custom)
      'Orcus',      // grey icy dwarf
      'Salacia',    // grey-white icy dwarf (custom)
      'Ceres',      // grey cratered dwarf
    ],

    // Rocky cratered moons — grey/brown tones
    moon_rocky: [
      'Moon',       // grey cratered
      'Callisto',   // dark cratered
      'Ganymede',   // grey-brown grooved
      'Iapetus',    // two-tone dark/light
      'Mimas',      // grey cratered (Death Star)
      'Miranda',    // heavily fractured grey
      'Oberon',     // dark grey cratered
      'Rhea',       // light grey cratered
      'Tethys',     // pale grey smooth+cratered
      'Titania',    // mid-grey cratered
      'Umbriel',    // dark grey cratered
      'Ariel',      // grey with bright streaks
      'Dione',      // pale grey wispy streaks
      'Phobos',     // dark brown grooved
      'Deimos',     // dark grey dusty
      'Hydra',      // grey irregular
      'Nix',        // pale grey
      'Pan',        // grey smooth disc-shape
      'Naiad',      // dark grey irregular
      'Puck',       // dark grey spherical
      'Proteus',    // dark grey cratered
      'Thebe',      // dark irregular (vanilla + custom versions)
      'Amalthea',   // dark reddish irregular (custom)
      'Apougu',     // dark brown rugged (custom)
    ],

    // Icy moons with distinct bright-ice appearance
    moon_icy: [
      'Europa',     // white cracked ice
      'Enceladus',  // bright white
      'Charon',     // grey-white
      'Triton',     // pale icy
    ],

    // Volcanic / lava surface worlds
    volcanic: [
      'Io',   // yellow-orange volcanic patches
    ],

    // Gas and ice giants — banded swirling atmospheres
    gas_giant: [
      'Jupiter',         // orange-tan cloud bands
      'Saturn',          // golden tan banded
      'Neptune',         // deep blue banded
      'Uranus',          // pale cyan smooth
      'Titan',           // orange haze
      'Blue_Gas_Giant',  // vivid blue swirling (custom)
      'Ringed_Giant',    // pale yellow-green banded (custom)
    ],

    // Comets and asteroids — dark, irregular, rocky
    asteroid: [
      'Asteroid',    // vanilla grey cratered
      'Basteroid',   // dark grey-brown
      'Casteroid',   // brown cratered
      'Dasteroid',   // dark grey-brown
      'Easteroid',   // grey cratered
      'Fasteroid',   // orange-brown comet
      'Gasteroid',   // dark grey irregular
      'Kasteroid',   // dark brown
      'Lasteroid',   // dark grey
      'Masteroid',   // medium grey
      'Rasteroid',   // reddish-brown
      'Sasteroid',   // grey-brown (used for Long/Round asteroid presets)
      'Tasteroid',   // tan-brown
      'Vasteroid',   // grey cratered
      '95P',         // comet 95P — elongated dark (custom)
    ],

    // Black holes — photon ring / accretion disc
    exotic: [
      'PhotonSphere',  // black + bright photon ring (used for all BH presets)
    ],
  },

  // ── Atmosphere gradient texture pools ────────────────────────────────────
  // Used in ATMOSPHERE_VISUALS_DATA.GRADIENT.texture
  // Sorted by visual appearance of the gradient (tall vertical strip):
  atmo: {

    // Very thin / barely-there haze — faint edge glow only
    thin_haze: [
      'Atmo_Europa',     // thin icy blue fringe
      'Atmo_Enceladus',  // thin white fringe
      'Atmo_Pluto',      // faint blue-grey wisp
      'Atmo_Triton',     // thin blue-grey edge
    ],

    // Cool blue / cyan skies — clear terrestrial or icy worlds
    blue_sky: [
      'Atmo_Earth',    // vivid blue sky gradient
      'Atmo_Neptune',  // deep blue column
      'Atmo_Uranus',   // pale cyan column
      'Atmo_B_Type',   // blue-white stellar glow
      'Atmo_O_Type',   // vivid blue stellar
    ],

    // Warm orange / tan / brown hazes — dusty or hot worlds
    warm_haze: [
      'Atmo_Mars',     // reddish-tan sky gradient
      'Atmo_Venus',    // thick yellow-tan haze
      'Atmo_Titan',    // thick orange haze (dense column)
      'Atmo_Jupiter',  // orange-tan banded
      'Atmo_Saturn',   // golden tan column
      'Atmo_K_Type',   // orange stellar glow
      'Atmo_M_Type',   // deep orange-red glow
      'Atmo_Tstar',    // T-type brown dwarf orange
    ],

    // White / neutral / pale gradients — bright stars or neutral hazes
    pale_neutral: [
      'Atmo_Sun',        // yellow-white solar corona
      'Atmo_F_Type',     // pale yellow stellar
      'Atmo_G_Type',     // warm yellow (sun-like)
      'Atmo_A_Type',     // bright white stellar
      'Atmo_White_Dwarf',// faint white-blue
      'Atmo_P9',         // cold grey-white haze
    ],

    // Exotic / vivid — red, purple, unusual colours
    exotic: [
      'Atmo_RPBD',    // red/purple exotic gradient
      'Atmo_Saggi',   // Sagittarius deep-field glow
      'Atmo_Proxima', // red dwarf glow
    ],
  },
};

// ── Per-body-type texture randomization rules ─────────────────────────────────
// Maps procgen body type → which PG_TEX pools to sample per slot.
// null = leave the preset's existing texture value unchanged for that slot.
// Arrays of pool names are flattened and picked from uniformly.
const _PG_TEX_RULES = {

  // Temperate/terrestrial planets — broad variety
  planet: {
    planetTexture:    ['earthlike', 'rocky_terrestrial', 'icy_world', 'volcanic'],
    surfaceTexture_A: ['rocky', 'icy', 'dusty', 'smooth'],
    surfaceTexture_B: ['rocky', 'dusty', 'sandy', 'smooth'],
    terrainTexture_C: ['rocky', 'cratered', 'smooth'],
    atmoTexture:      ['blue_sky', 'warm_haze', 'thin_haze'],
  },

  // Moons — rocky or icy, cratered
  moon: {
    planetTexture:    ['moon_rocky', 'moon_icy'],
    surfaceTexture_A: ['rocky', 'dusty', 'icy', 'cratered'],
    surfaceTexture_B: ['rocky', 'dusty', 'smooth'],
    terrainTexture_C: ['rocky', 'cratered', 'smooth'],
    atmoTexture:      ['thin_haze'],
  },

  // Gas giants — only swap the base sphere texture; detail tiles not applicable
  gasgiant: {
    planetTexture:    ['gas_giant'],
    surfaceTexture_A: null,
    surfaceTexture_B: null,
    terrainTexture_C: null,
    atmoTexture:      ['warm_haze', 'blue_sky', 'pale_neutral'],
  },

  // Ringed gas giants — same as gas giant
  ringedgiant: {
    planetTexture:    ['gas_giant'],
    surfaceTexture_A: null,
    surfaceTexture_B: null,
    terrainTexture_C: null,
    atmoTexture:      ['warm_haze', 'blue_sky', 'pale_neutral'],
  },

  // Asteroids — dark/rocky/dusty
  asteroid: {
    planetTexture:    ['asteroid'],
    surfaceTexture_A: ['rocky', 'dusty', 'dark'],
    surfaceTexture_B: ['rocky', 'dusty', 'smooth'],
    terrainTexture_C: ['rocky', 'cratered'],
    atmoTexture:      null,   // asteroids rarely have atmosphere
  },

  // Mercury-like airless rocky bodies
  mercurylike: {
    planetTexture:    ['moon_rocky', 'rocky_terrestrial'],
    surfaceTexture_A: ['rocky', 'dusty', 'cratered'],
    surfaceTexture_B: ['rocky', 'dusty', 'smooth'],
    terrainTexture_C: ['rocky', 'cratered'],
    atmoTexture:      ['thin_haze'],
  },

  // Mars-like — thin-atmo reddish worlds
  marslike: {
    planetTexture:    ['rocky_terrestrial'],
    surfaceTexture_A: ['rocky', 'dusty', 'sandy'],
    surfaceTexture_B: ['dusty', 'sandy', 'smooth'],
    terrainTexture_C: ['rocky', 'smooth'],
    atmoTexture:      ['warm_haze', 'thin_haze'],
  },

  // Dwarf planets — icy/rocky mixed
  dwarf_planet: {
    planetTexture:    ['dwarf_planet', 'moon_rocky', 'icy_world'],
    surfaceTexture_A: ['rocky', 'icy', 'dusty'],
    surfaceTexture_B: ['rocky', 'icy', 'smooth'],
    terrainTexture_C: ['rocky', 'smooth'],
    atmoTexture:      ['thin_haze', 'pale_neutral'],
  },

  // Black holes — no surface detail
  blackhole: {
    planetTexture:    ['exotic'],
    surfaceTexture_A: null,
    surfaceTexture_B: null,
    terrainTexture_C: null,
    atmoTexture:      ['exotic', 'pale_neutral'],
  },
};

// Pick a random texture from the given category array using the seeded RNG.
function _pgPickTex(pools, poolNames) {
  if (!poolNames) return null;
  // Flatten all nominated pools into one list
  const merged = poolNames.flatMap(pn => pools[pn] || []);
  if (!merged.length) return null;
  return merged[Math.floor(_pgRand() * merged.length)];
}

// Apply randomized textures to a body data object in-place.
function _pgRandomizeTextures(bd, bodyType) {
  const rules = _PG_TEX_RULES[bodyType];
  if (!rules) return;   // no rules for this type — leave untouched

  const td = bd?.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA;
  if (td) {
    // planetTexture
    const pt = _pgPickTex(PG_TEX.planet, rules.planetTexture);
    if (pt) td.planetTexture = pt;

    // surfaceTexture_A
    if (rules.surfaceTexture_A !== null) {
      const sa = _pgPickTex(PG_TEX.surface, rules.surfaceTexture_A);
      if (sa) td.surfaceTexture_A = sa;
    }

    // surfaceTexture_B
    if (rules.surfaceTexture_B !== null) {
      const sb = _pgPickTex(PG_TEX.surface, rules.surfaceTexture_B);
      if (sb) td.surfaceTexture_B = sb;
    }

    // terrainTexture_C
    if (rules.terrainTexture_C !== null) {
      const tc = _pgPickTex(PG_TEX.surface, rules.terrainTexture_C);
      if (tc) td.terrainTexture_C = tc;
    }
  }
}

// Randomize only the atmosphere gradient texture.
function _pgRandomizeAtmoTexture(bd, bodyType) {
  const rules = _PG_TEX_RULES[bodyType];
  if (!rules || rules.atmoTexture === null) return;
  if (!bd?.ATMOSPHERE_VISUALS_DATA?.GRADIENT) return;
  const at = _pgPickTex(PG_TEX.atmo, rules.atmoTexture);
  if (at) bd.ATMOSPHERE_VISUALS_DATA.GRADIENT.texture = at;
}

function _pgAddBody(body, parentName) {
  let name = body.name, suffix = 2;
  while (bodies[name]) name = body.name + '_' + (suffix++);

  const bd = JSON.parse(JSON.stringify(body.preset?.data || {}));
  if (bd.BASE_DATA) bd.BASE_DATA.radius = body.radius;

  // Randomize surface textures if the option is enabled
  if (PG.misc.randomizeTextures) _pgRandomizeTextures(bd, body.type);

  // Randomize atmosphere texture separately if enabled
  if (PG.misc.randomizeAtmoTextures) _pgRandomizeAtmoTexture(bd, body.type);

  // Always lock texture to surface (planetTextureDontDistort)
  if (bd?.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA) {
    bd.TERRAIN_DATA.TERRAIN_TEXTURE_DATA.planetTextureDontDistort = true;
  }

  bd.ORBIT_DATA = {
    parent:              parentName,
    semiMajorAxis:       body.orbitSMA,
    eccentricity:        body.orbitEcc    || 0,
    argumentOfPeriapsis: body.orbitAoP    || 0,
    direction:           body.orbitDir    || 1,
    multiplierSOI:       body.soiMultiplier ?? 1.0,
  };
  if (!PG.misc.addRings)       delete bd.RINGS_DATA;
  if (!PG.misc.addAtmospheres) { delete bd.ATMOSPHERE_PHYSICS_DATA; delete bd.ATMOSPHERE_VISUALS_DATA; }

  const m = typeof inferPresetMeta === 'function' ? inferPresetMeta(name, bd) : {};
  bodies[name] = {
    data: bd, preset: m.id || body.type, isCenter: false,
    color: m.color || body.color, glow: m.glow || body.color, icon: m.icon || body.icon,
  };
  if (name !== body.name) body.name = name;
}

function _pgFinish(selectName) {
  if (typeof drawViewport    === 'function') drawViewport();
  if (typeof updateStatusBar === 'function') updateStatusBar();
  if (selectName && typeof selectBody === 'function') selectBody(selectName);
  pgShowStatus('✓ System applied successfully!', 'ok');
}

function pgClear() {
  _pgGenAbort = true;
  _pgHideLoader();
  PG.preview.bodies  = [];
  PG.preview.center  = null;
  PG.canvas.selected = null;
  PG.canvas.hovered  = null;
  // Unlock seed and clear saved seed so next GEN starts fresh
  _pgSeedLocked = false;
  _pgSavedSeed  = null;
  _pgRngPool    = null;
  _pgRngRecord  = null;
  const btn = document.getElementById('pg-seed-lock-btn');
  if (btn) { btn.textContent = '🔓 SEED'; btn.classList.remove('seed-locked'); }
  pgShowStatus('', '');
}

function pgShowStatus(msg, type) {
  const el = document.getElementById('pg-status');
  if (!el) return;
  el.textContent   = msg;
  el.style.color   = type === 'ok'   ? 'rgba(100,220,180,.9)'
                   : type === 'warn' ? 'rgba(255,180,80,.9)'
                   : 'rgba(150,160,200,.5)';
  el.style.display = msg ? 'block' : 'none';
}

// ── Canvas removed — procgen now operates directly on the main viewport ──
function pgInitCanvas()   { /* no-op: preview canvas removed */ }
function pgResizeCanvas() { /* no-op */ }
function pgDrawCanvas()   { /* no-op */ }

// (all _pgStarfield, _pgGrid, _pgOrbit, _pgBody, _pgTooltip, _pgLegend,
//  _pgHoverTest, _pgClickTest functions below are kept for reference but
//  are never called since pg-canvas no longer exists)

// pgResizeCanvas: removed (no preview canvas)

// pgDrawCanvas: removed (no preview canvas — results appear directly on main viewport)

function _pgStarfield(ctx, W, H) {
  ctx.save();
  for (let i = 0; i < 100; i++) {
    const x = ((i * 7919) % W + W) % W, y = ((i * 6271) % H + H) % H;
    ctx.globalAlpha = 0.08 + (i % 5) * 0.07;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x, y, 0.5 + (i % 3) * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

function _pgGrid(ctx, W, H, s, dpr) {
  const cx = W / 2 + s.pan.x * dpr, cy = H / 2 + s.pan.y * dpr;
  const aupx = AU_PX * s.zoom * dpr;
  ctx.save(); ctx.strokeStyle = 'rgba(40,70,120,.2)'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
  for (let r = 1; r <= 30; r++) {
    const rpx = r * aupx; if (rpx > W * 1.6) break;
    ctx.beginPath(); ctx.arc(cx, cy, rpx, 0, Math.PI * 2); ctx.stroke();
    if (rpx > 24 && rpx < W * 0.82) {
      ctx.save();
      ctx.font = `${Math.round(9 * dpr)}px 'JetBrains Mono',monospace`;
      ctx.fillStyle = 'rgba(50,90,160,.4)'; ctx.textAlign = 'left'; ctx.globalAlpha = .7; ctx.setLineDash([]);
      ctx.fillText(`${r}AU`, cx + rpx + 4 * dpr, cy - 4 * dpr);
      ctx.restore(); ctx.setLineDash([3, 7]);
    }
  }
  ctx.setLineDash([]); ctx.restore();
}

function _pgBodyPos(body, parent) {
  if (body.isCenter) return { x: 0, y: 0 };
  const a    = (body.orbitSMA / AU) * AU_PX;
  const ecc  = Math.min(body.orbitEcc || 0, 0.999);
  const b    = a * Math.sqrt(1 - ecc * ecc);
  const c    = a * ecc;
  const ang  = body._angle || 0;
  const aopB = (body.orbitAoP || 0) * Math.PI / 180;
  const localX = c + a * Math.cos(ang);
  const localY = b * Math.sin(ang);
  const rotX = localX * Math.cos(-aopB) - localY * Math.sin(-aopB);
  const rotY = localX * Math.sin(-aopB) + localY * Math.cos(-aopB);
  let ox = 0, oy = 0;
  if (parent && !parent.isCenter) {
    ox = (parent.orbitSMA / AU) * AU_PX * Math.cos(parent._angle || 0);
    oy = (parent.orbitSMA / AU) * AU_PX * Math.sin(parent._angle || 0);
  }
  return { x: ox + rotX, y: oy + rotY };
}

function _pgOrbit(ctx, body, parent) {
  const a   = (body.orbitSMA / AU) * AU_PX;
  const ecc = Math.min(body.orbitEcc || 0, 0.999);
  const b   = a * Math.sqrt(1 - ecc * ecc);
  const c   = a * ecc;
  const aop = (body.orbitAoP || 0) * Math.PI / 180;
  let ox = c * Math.cos(aop), oy = -c * Math.sin(aop);
  if (parent && !parent.isCenter) {
    ox += (parent.orbitSMA / AU) * AU_PX * Math.cos(parent._angle || 0);
    oy += (parent.orbitSMA / AU) * AU_PX * Math.sin(parent._angle || 0);
  }
  ctx.save();
  ctx.strokeStyle = parent ? 'rgba(80,120,180,.15)' : 'rgba(80,140,255,.22)';
  ctx.lineWidth   = parent ? 0.5 : 1;
  ctx.setLineDash(parent ? [2, 5] : []);
  ctx.beginPath();
  ctx.ellipse(ox, oy, a, b, -aop, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]); ctx.restore();
}

function _pgBody(ctx, body, parent, s, dpr) {
  const pos   = _pgBodyPos(body, parent);
  const isSel = s.selected?.name === body.name;
  const isHov = s.hovered?.name  === body.name;
  const minR  = body.isCenter ? 14 : (parent ? 3 : 5);
  const visR  = Math.max(minR, Math.log10(Math.max(body.radius, 1e4) / 1e5) * 6 + minR);

  if (body.isCenter || body.type === 'star' || body.type === 'brown_dwarf' || body.type === 'blackhole') {
    const g = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, visR * 3.5);
    g.addColorStop(0, body.color + 'bb'); g.addColorStop(0.5, body.color + '33'); g.addColorStop(1, body.color + '00');
    ctx.save(); ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, visR * 3.5, 0, Math.PI * 2);
    ctx.fillStyle = g; ctx.fill(); ctx.restore();
  }

  const g2 = ctx.createRadialGradient(pos.x - visR * .3, pos.y - visR * .3, 0, pos.x, pos.y, visR);
  g2.addColorStop(0, _pgLighten(body.color, .5)); g2.addColorStop(1, body.color);
  ctx.save(); ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(pos.x, pos.y, visR, 0, Math.PI * 2); ctx.fill();

  if (isSel || isHov) {
    ctx.strokeStyle = isSel ? 'rgba(255,255,100,.9)' : 'rgba(100,220,180,.75)';
    ctx.lineWidth   = isSel ? 2 : 1.5;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, visR + 3, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();

  if (!parent || isSel || isHov) {
    ctx.save();
    ctx.font = `${body.isCenter ? 9 : 7}px 'JetBrains Mono',monospace`;
    ctx.fillStyle = isSel ? 'rgba(255,255,140,.95)' : 'rgba(180,200,255,.72)';
    ctx.textAlign = 'center';
    ctx.fillText(body.name, pos.x, pos.y + visR + 10);
    ctx.restore();
  }

  body._sx = pos.x; body._sy = pos.y; body._sr = visR;
}

function _pgTooltip(ctx, body, W, H, dpr) {
  const s = PG.canvas;
  if (body._sx === undefined) return;
  const sx = W / 2 + (s.pan.x + body._sx * s.zoom) * dpr;
  const sy = H / 2 + (s.pan.y + body._sy * s.zoom) * dpr;
  const lines = [
    body.name,
    `Type: ${body.type}`,
    body.isCenter ? 'System center' : `Orbit: ${(body.orbitSMA / AU).toFixed(2)} AU`,
    `Radius: ${_pgFmt(body.radius)} m`,
    ...(body.children.length ? [`Moons: ${body.children.length}`] : []),
  ];
  const pad = 10 * dpr, lh = 15 * dpr, tw = 140 * dpr, th = lines.length * lh + pad * 2;
  let tx = sx + 16 * dpr, ty = sy - th / 2;
  tx = Math.max(6 * dpr, Math.min(tx, W - tw - 6 * dpr));
  ty = Math.max(6 * dpr, Math.min(ty, H - th - 6 * dpr));
  ctx.save();
  ctx.fillStyle = 'rgba(3,7,18,.93)'; ctx.strokeStyle = 'rgba(100,220,180,.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(tx, ty, tw, th, 4 * dpr); ctx.fill(); ctx.stroke();
  ctx.font = `bold ${Math.round(8.5 * dpr)}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = 'rgba(100,220,180,.95)'; ctx.textAlign = 'left';
  ctx.fillText(lines[0], tx + pad, ty + pad + 9 * dpr);
  ctx.font = `${Math.round(7.5 * dpr)}px 'JetBrains Mono',monospace`;
  ctx.fillStyle = 'rgba(170,195,255,.75)';
  for (let i = 1; i < lines.length; i++) ctx.fillText(lines[i], tx + pad, ty + pad + (i + 1) * lh);
  ctx.restore();
}

function _pgLegend(ctx, W, H, dpr) {
  const enabled = Object.entries(PG.types).filter(([,t]) => t.enabled);
  if (!enabled.length) return;
  const pad = 10 * dpr, lh = 16 * dpr, bw = 110 * dpr, bh = enabled.length * lh + pad * 2;
  const bx = 10 * dpr, by = H - bh - 10 * dpr;
  ctx.save(); ctx.globalAlpha = 0.8;
  ctx.fillStyle = 'rgba(2,5,16,.85)'; ctx.strokeStyle = 'rgba(50,80,140,.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 4 * dpr); ctx.fill(); ctx.stroke();
  ctx.font = `${Math.round(7.5 * dpr)}px 'JetBrains Mono',monospace`;
  enabled.forEach(([,t], i) => {
    const y = by + pad + (i + 0.75) * lh;
    ctx.fillStyle = t.color; ctx.beginPath(); ctx.arc(bx + pad + 5 * dpr, y, 4 * dpr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(175,195,255,.75)'; ctx.textAlign = 'left';
    ctx.fillText(t.label, bx + pad + 14 * dpr, y + 3 * dpr);
  });
  ctx.restore();
}

function _pgHoverTest(cv, cx, cy) {
  const r = cv.getBoundingClientRect(), s = PG.canvas;
  const mx = (cx - r.left - r.width  / 2 - s.pan.x) / s.zoom;
  const my = (cy - r.top  - r.height / 2 - s.pan.y) / s.zoom;
  let found = null;
  outer: for (const b of PG.preview.bodies) {
    if (b._sx !== undefined && Math.hypot(mx - b._sx, my - b._sy) <= b._sr + 6) { found = b; break; }
    for (const m of b.children) {
      if (m._sx !== undefined && Math.hypot(mx - m._sx, my - m._sy) <= m._sr + 6) { found = m; break outer; }
    }
  }
  if (s.hovered?.name !== found?.name) {
    s.hovered = found;
    cv.style.cursor = found ? 'pointer' : 'grab';
    pgDrawCanvas();
  }
}

function _pgClickTest(cv, cx, cy) {
  const r = cv.getBoundingClientRect(), s = PG.canvas;
  const mx = (cx - r.left - r.width  / 2 - s.pan.x) / s.zoom;
  const my = (cy - r.top  - r.height / 2 - s.pan.y) / s.zoom;
  let found = null;
  outer: for (const b of PG.preview.bodies) {
    if (b._sx !== undefined && Math.hypot(mx - b._sx, my - b._sy) <= b._sr + 6) { found = b; break; }
    for (const m of b.children) {
      if (m._sx !== undefined && Math.hypot(mx - m._sx, my - m._sy) <= m._sr + 6) { found = m; break outer; }
    }
  }
  s.selected = found;
  pgDrawCanvas();
  if (found) {
    const el = document.getElementById('pg-body-info');
    if (el) {
      el.innerHTML = [
        `<b>${found.icon} ${found.name}</b>`,
        `Type: ${found.type}`,
        found.isCenter ? 'System center' : `Orbit: ${(found.orbitSMA / AU).toFixed(2)} AU`,
        `Radius: ${_pgFmt(found.radius)} m`,
        found.children.length ? `Moons: ${found.children.length}` : '',
        `Preset: ${found.preset?.name || '—'}`,
      ].filter(Boolean).join('<br>');
      el.style.display = 'block';
    }
  }
}

function _pgLighten(hex, amt) {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgb(${Math.min(255, (n >> 16) + ~~(255 * amt))},${Math.min(255, ((n >> 8) & 0xff) + ~~(255 * amt))},${Math.min(255, (n & 0xff) + ~~(255 * amt))})`;
  } catch { return hex; }
}
function _pgFmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.round(n) + '';
}


// ════════════════════════════════════════════════════════════
//  MANAGE PRESETS TAB  (pg-tabp-presets)
// ════════════════════════════════════════════════════════════

// User-added presets — keyed by name, value = {data, category, typeOverride}
const _pgUserPresets = {};
let _pgPresetsFilter = 'all';
let _pgAddBodySelected = null;   // selected body name in "Add from System" dialog

// ── Category filter ───────────────────────────────────────────
function pgPresetsFilter(filter, btn) {
  _pgPresetsFilter = filter;
  document.querySelectorAll('.pg-preset-filter-btn').forEach(b => b.classList.remove('pg-preset-filter-btn--on'));
  if (btn) btn.classList.add('pg-preset-filter-btn--on');
  pgPresetsRender();
}

// ── Render preset list ────────────────────────────────────────
function pgPresetsRender() {
  const list = document.getElementById('pg-presets-list');
  if (!list) return;

  const search    = (document.getElementById('pg-presets-search')?.value || '').toLowerCase().trim();
  const all       = typeof buildAllPresets === 'function' ? buildAllPresets() : [];
  const userNames = new Set(Object.keys(_pgUserPresets));

  // Expanded filter buckets: asteroid filter also matches rocky sub-types
  const filterMap = {
    asteroid: ['asteroid', 'mercurylike', 'marslike'],
    planet:   ['planet'],
    moon:     ['moon'],
    gasgiant: ['gasgiant', 'ringedgiant'],
    star:     ['star'],
  };

  let items = all.filter(p => {
    if (_pgPresetsFilter === '_user') return userNames.has(p.name);
    if (_pgPresetsFilter !== 'all') {
      const ids = filterMap[_pgPresetsFilter] || [_pgPresetsFilter];
      if (!ids.includes(p.id)) return false;
    }
    if (search && !p.name.toLowerCase().includes(search) && !(p.id || '').toLowerCase().includes(search)) return false;
    return true;
  });

  if (!items.length) {
    list.innerHTML = '<div class="pg-preset-empty">No presets match</div>';
    return;
  }

  items = items.slice().sort((a, b) => a.name.localeCompare(b.name));

  list.innerHTML = items.map(p => {
    const isUser   = userNames.has(p.name);
    const tagLabel = _idToLabel(p.id);
    const delBtn   = isUser
      ? `<button class="pg-preset-del-btn" onclick="pgPresetsRemove(${JSON.stringify(p.name)})" title="Remove preset">✕</button>`
      : '';
    return `<div class="pg-preset-row${isUser ? ' pg-preset-row--user' : ''}">
      <span class="pg-preset-row-icon">${p.icon || '🌑'}</span>
      <span class="pg-preset-row-name" title="${p.name}">${p.name}</span>
      <span class="pg-preset-row-tag${isUser ? ' pg-preset-row-tag--user' : ''}">${tagLabel}</span>
      ${delBtn}
    </div>`;
  }).join('');
}

function _idToLabel(id) {
  const map = {
    star:'STAR', planet:'PLANET', moon:'MOON', gasgiant:'GAS GIANT',
    ringedgiant:'RINGED', blackhole:'BLACK HOLE', asteroid:'ASTEROID',
    mercurylike:'ROCKY', marslike:'MARS-LIKE', barycentre:'BARYCENTRE',
  };
  return map[id] || (id || 'BODY').toUpperCase();
}

// ── Open / close Add-from-JSON dialog ────────────────────────
function pgShowAddPresetDialog() {
  const dlg = document.getElementById('pg-add-json-dialog');
  if (!dlg) return;
  const nameEl = document.getElementById('pg-add-json-name');
  const dataEl = document.getElementById('pg-add-json-data');
  const errEl  = document.getElementById('pg-add-json-err');
  if (nameEl) nameEl.value = '';
  if (dataEl) dataEl.value = '';
  if (errEl)  { errEl.textContent = ''; errEl.style.display = 'none'; }
  dlg.classList.add('open');
  if (nameEl) nameEl.focus();
}
function pgCloseAddJsonDialog() {
  const dlg = document.getElementById('pg-add-json-dialog');
  if (dlg) dlg.classList.remove('open');
}

// ── Add a user preset from JSON ───────────────────────────────
function pgPresetsAdd() {
  const nameEl   = document.getElementById('pg-add-json-name');
  const catEl    = document.getElementById('pg-add-json-cat');
  const typeEl   = document.getElementById('pg-add-json-type');
  const jsonEl   = document.getElementById('pg-add-json-data');
  const errEl    = document.getElementById('pg-add-json-err');

  const name     = (nameEl?.value || '').trim();
  const cat      = catEl?.value  || 'custom';
  const typeOver = typeEl?.value || '';
  const jsonTxt  = (jsonEl?.value || '').trim();

  const showErr = msg => { if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; } };
  if (errEl) errEl.style.display = 'none';

  if (!name)    { showErr('Please enter a preset name.'); return; }
  if (!jsonTxt) { showErr('Please paste the preset JSON.'); return; }

  let parsed = null;
  try {
    let fixed = jsonTxt
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/(\d)\.(?=[,\s}\]])/g, '$10')
      .replace(/:\s*Infinity\b/g,  ': 1e38')
      .replace(/:\s*-Infinity\b/g, ': -1e38')
      .replace(/:\s*NaN\b/g,       ': 0');
    parsed = JSON.parse(fixed);
  } catch(e) {
    showErr('Invalid JSON: ' + e.message);
    return;
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    showErr('JSON must be an object with SFS body data.');
    return;
  }

  _pgRegisterUserPreset(name, parsed, cat, typeOver);
  pgCloseAddJsonDialog();
  pgPresetsRender();
  try { SFX.select(); } catch(_) {}
  pgShowStatus(`✓ Preset "${name}" added to ${cat} pool`, 'ok');
}

// ── Open / close Add-from-System dialog ──────────────────────
// Merged into the main preset modal (openPresetForSave) — no separate dialog needed.
function pgShowAddFromBodyDialog() {
  if(typeof openPresetForSave === 'function'){
    openPresetForSave();
  } else {
    console.warn('[SFS] openPresetForSave not available');
  }
}

// Stubs kept for backwards compatibility (old HTML buttons / external calls)
function pgAddBodySelectItem()   {}
function pgCloseAddBodyDialog()  {}
function pgPresetsAddFromBody()  {}

// ── Internal: register into dynamicPresets + tracking map ─────
function _pgRegisterUserPreset(name, data, category, typeOverride) {
  if (typeof dynamicPresets === 'undefined') return;
  if (typeOverride && data) data._pgTypeHint = typeOverride;
  if (category === 'vanilla') dynamicPresets.vanilla[name] = data;
  else                        dynamicPresets.custom[name]  = data;
  _pgUserPresets[name] = { data, category, typeOverride };
}

// ── Remove a user preset ──────────────────────────────────────
function pgPresetsRemove(name) {
  if (!_pgUserPresets[name]) return;
  const { category } = _pgUserPresets[name];
  if (typeof dynamicPresets !== 'undefined') {
    if (category === 'vanilla') delete dynamicPresets.vanilla[name];
    else                        delete dynamicPresets.custom[name];
  }
  delete _pgUserPresets[name];
  pgPresetsRender();
  try { SFX.click(); } catch(_) {}
  pgShowStatus(`Preset "${name}" removed`, 'info');
}

// ── Close dialogs on backdrop click ───────────────────────────
document.addEventListener('click', e => {
  if (e.target.id === 'pg-add-json-dialog') pgCloseAddJsonDialog();
});

// ── Hook into pgSwitchTab to refresh when Presets tab opens ───
const _pgSwitchTabOrig = pgSwitchTab;
if (typeof pgSwitchTab === 'function') {
  window.pgSwitchTab = function(name, btn) {
    _pgSwitchTabOrig(name, btn);
    if (name === 'presets') pgPresetsRender();
  };
}
