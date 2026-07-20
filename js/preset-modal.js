// ════════════════════════════════ PRESET MODAL ════════════════════════════════
// Preset modal state
let _prsTab = 'all';       // 'all' | 'vanilla' | 'custom' | 'system'
let _prsSearch = '';
let _prsMode = 'add';      // 'add' | 'save-preset'  — controls confirm behaviour

// SMA / parent state for the modal controls
let _prsSmaMetres = 0;        // current SMA in metres (raw, Normal-scale)
let _prsSmaUserPicked = false; // true once user has manually changed SMA
let _prsParentName = '';       // currently selected parent body name

// ── SMA unit helpers (mirrors units.js logic but self-contained for the modal) ─

const _PRS_UNIT_TO_M = {
  m: 1, km: 1e3, Mm: 1e6, Gm: 1e9,
  AU: 1.495978707e11, ly: 9.4607304725808e15
};

function _prsFmt(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e9)  return parseFloat(v.toPrecision(6)).toExponential(3);
  if (abs >= 100)  return parseFloat(v.toPrecision(6)).toString();
  return parseFloat(v.toPrecision(5)).toString();
}

function _prsBestUnit(m) {
  const abs = Math.abs(m);
  if (abs === 0)    return 'AU';
  if (abs < 1e6)    return 'km';
  if (abs < 1e9)    return 'Mm';
  if (abs < 5e12)   return 'AU';
  return 'ly';
}

function _prsMetresToDisplay(metres, unit) {
  const f = _PRS_UNIT_TO_M[unit] || 1;
  const v = metres / f;
  if (Math.abs(v) >= 1e9) return parseFloat(v.toPrecision(6)).toExponential(3);
  if (Math.abs(v) >= 100) return parseFloat(v.toPrecision(6)).toString();
  return parseFloat(v.toPrecision(6)).toString();
}

function _prsSetSmaDisplay(metres) {
  _prsSmaMetres = metres;
  const unitSel = document.getElementById('prs-sma-unit');
  const input   = document.getElementById('prs-sma-input');
  if (!input || !unitSel) return;
  if (!_prsSmaUserPicked) {
    unitSel.value = _prsBestUnit(metres);
  }
  input.value = metres > 0 ? _prsMetresToDisplay(metres, unitSel.value) : '';
  _prsUpdateSOI();
}

function _prsParseUnit(raw) {
  const aliases = { m:'m', km:'km', mm:'Mm', megameter:'Mm', gm:'Gm', gigameter:'Gm', au:'AU', ly:'ly' };
  const lc = (raw || '').toLowerCase().trim();
  return aliases[lc] || null;
}

function prsOnSmaInput() {
  const input   = document.getElementById('prs-sma-input');
  const unitSel = document.getElementById('prs-sma-unit');
  if (!input || !unitSel) return;
  const raw = input.value.trim();
  const m = raw.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-zA-Z_]*)$/);
  if (!m) return;
  let metres;
  if (m[2]) {
    const resolved = _prsParseUnit(m[2]);
    metres = parseFloat(m[1]) * (_PRS_UNIT_TO_M[resolved || unitSel.value] || 1);
    if (resolved && resolved !== unitSel.value) { unitSel.value = resolved; _prsSmaUserPicked = true; }
  } else {
    metres = parseFloat(m[1]) * (_PRS_UNIT_TO_M[unitSel.value] || 1);
  }
  _prsSmaMetres = metres;
  _prsUpdateSOI();
}

function prsOnSmaBlur() {
  const input   = document.getElementById('prs-sma-input');
  const unitSel = document.getElementById('prs-sma-unit');
  if (!input || !unitSel) return;
  // Re-normalise display
  const raw = input.value.trim();
  const m = raw.match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-zA-Z_]*)$/);
  if (m) {
    let metres;
    if (m[2]) {
      const resolved = _prsParseUnit(m[2]);
      metres = parseFloat(m[1]) * (_PRS_UNIT_TO_M[resolved || unitSel.value] || 1);
      if (resolved) { unitSel.value = resolved; _prsSmaUserPicked = true; }
    } else {
      metres = parseFloat(m[1]) * (_PRS_UNIT_TO_M[unitSel.value] || 1);
    }
    _prsSmaMetres = metres;
    input.value = _prsMetresToDisplay(metres, unitSel.value);
  }
  _prsUpdateSOI();
}

function prsOnSmaUnitChange() {
  const unitSel = document.getElementById('prs-sma-unit');
  const input   = document.getElementById('prs-sma-input');
  if (!unitSel || !input) return;
  _prsSmaUserPicked = true;
  input.value = _prsMetresToDisplay(_prsSmaMetres, unitSel.value);
}

// ── SOI display beneath SMA field ─────────────────────────────────────────────
function _prsUpdateSOI() {
  const el = document.getElementById('prs-soi-display');
  if (!el) return;
  const parent = _prsParentName && bodies[_prsParentName];
  if (!parent) { el.textContent = ''; return; }

  if (parent.isCenter) {
    el.textContent = 'SOI: ∞  (system center)';
    el.style.color = 'var(--ink4)';
    return;
  }

  const soiM = computeSOI_m(_prsParentName);
  if (soiM == null) {
    el.textContent = 'SOI: —';
    el.style.color = 'var(--ink4)';
    return;
  }

  // Format SOI
  let soiStr;
  if (soiM >= 1e9)      soiStr = (soiM/1e9).toFixed(3) + ' Gm';
  else if (soiM >= 1e6) soiStr = (soiM/1e6).toFixed(3) + ' Mm';
  else if (soiM >= 1e3) soiStr = (soiM/1e3).toFixed(1) + ' km';
  else                  soiStr = soiM.toFixed(0) + ' m';

  // Also show in AU if large enough
  const soiAU = soiM / 1.495978707e11;
  const auStr = soiAU >= 0.001 ? `  ·  ${soiAU.toPrecision(3)} AU` : '';

  // Warn if SMA is outside SOI
  const warn = _prsSmaMetres > soiM * 0.95;
  el.textContent = `SOI: ${soiStr}${auStr}` + (warn ? '  ⚠ outside SOI' : '');
  el.style.color = warn ? 'var(--amber)' : 'var(--ink4)';
}

// ── Parent body selector ───────────────────────────────────────────────────────
function _prsBuildParentSelector() {
  const sel = document.getElementById('prs-parent-sel');
  if (!sel) return;

  // Collect all candidate parents (all bodies except the ones with no data)
  const candidates = Object.keys(bodies).filter(n => bodies[n] && n !== '');

  // Sort: center first, then by SMA ascending (nearest to farthest)
  candidates.sort((a, b) => {
    const ba = bodies[a], bb = bodies[b];
    if (ba.isCenter && !bb.isCenter) return -1;
    if (!ba.isCenter && bb.isCenter) return 1;
    const smaA = ba.data?.ORBIT_DATA?.semiMajorAxis || 0;
    const smaB = bb.data?.ORBIT_DATA?.semiMajorAxis || 0;
    return smaA - smaB;
  });

  sel.innerHTML = '';
  candidates.forEach(name => {
    const b = bodies[name];
    const opt = document.createElement('option');
    opt.value = name;
    // Label with distance hint
    const sma = b.data?.ORBIT_DATA?.semiMajorAxis;
    let distStr = '';
    if (b.isCenter) {
      distStr = ' [center]';
    } else if (sma) {
      const AU = 1.495978707e11;
      if (sma >= AU * 0.001) distStr = ` · ${(sma/AU).toPrecision(3)} AU`;
      else if (sma >= 1e6)   distStr = ` · ${(sma/1e6).toFixed(1)} Mm`;
      else if (sma >= 1e3)   distStr = ` · ${(sma/1e3).toFixed(0)} km`;
    }
    opt.textContent = name + distStr;
    if (name === _prsParentName) opt.selected = true;
    sel.appendChild(opt);
  });
}

function prsOnParentChange(reset) {
  const sel = document.getElementById('prs-parent-sel');
  if (reset || !sel) {
    // revert to default parent
    const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || '';
    _prsParentName = (selectedBody && bodies[selectedBody] && !bodies[selectedBody].isCenter)
      ? selectedBody : centerName;
    if (sel) sel.value = _prsParentName;
  } else {
    _prsParentName = sel.value;
  }

  // Recalculate default SMA for new parent (only if user hasn't manually set it)
  if (!_prsSmaUserPicked) {
    _prsRecalcDefaultSMA();
  }
  _prsUpdateSOI();
}

function _prsRecalcDefaultSMA() {
  // Reuse the same logic as confirmPreset but just compute defaultSMA for display
  const parentName = _prsParentName;
  const parentBody = bodies[parentName];
  if (!parentName || !parentBody) { _prsSetSmaDisplay(0); return; }

  const centerBodyEntry = bodies[Object.keys(bodies).find(n => bodies[n].isCenter)];
  const centerRadius = (centerBodyEntry?.data?.BASE_DATA?.radius) || 34817000;
  const parentRadius = (parentBody?.data?.BASE_DATA?.radius) || centerRadius;

  const siblings = Object.values(bodies).filter(b =>
    b.data?.ORBIT_DATA && b.data.ORBIT_DATA.parent === parentName
  );

  const AU = 1.495978707e11;

  function _getParentSOI_m(pName) {
    const pb = bodies[pName];
    if (!pb) return null;
    if (pb.isCenter) return null;
    return computeSOI_m(pName);
  }

  const parentSOI_m = _getParentSOI_m(parentName);
  const MIN_CLEAR   = parentRadius * 5;
  const HARD_FLOOR  = 0.01 * AU;

  let defaultSMA;

  if (parentSOI_m === null) {
    const minForCenter = Math.max(parentRadius * 80, HARD_FLOOR);
    if (siblings.length > 0) {
      const maxSibSMA = Math.max(...siblings.map(b => b.data.ORBIT_DATA.semiMajorAxis || 0));
      defaultSMA = Math.max(maxSibSMA * 1.5, minForCenter);
    } else {
      defaultSMA = minForCenter;
    }
  } else if (parentSOI_m <= parentRadius) {
    defaultSMA = parentRadius * 80;
  } else {
    const soiSafe = parentSOI_m * 0.80;
    if (siblings.length > 0) {
      const maxSibSMA = Math.max(...siblings.map(b => b.data.ORBIT_DATA.semiMajorAxis || 0));
      const candidate = maxSibSMA * 1.5;
      if (candidate <= soiSafe) {
        defaultSMA = candidate;
      } else if (maxSibSMA < soiSafe) {
        defaultSMA = maxSibSMA + (soiSafe - maxSibSMA) * 0.5;
      } else {
        defaultSMA = soiSafe * 0.5;
      }
    } else {
      defaultSMA = soiSafe * 0.33;
    }
    defaultSMA = Math.min(defaultSMA, soiSafe);
    defaultSMA = Math.max(defaultSMA, MIN_CLEAR);
    if (MIN_CLEAR >= soiSafe) {
      defaultSMA = (parentRadius + soiSafe) * 0.5;
    }
  }

  defaultSMA = Math.max(defaultSMA, parentRadius * 5);
  _prsSetSmaDisplay(defaultSMA);
}

// ── NEXT button (multi-body flow placeholder) ──────────────────────────────────
function prsNext() {
  // Confirm current preset and re-open for another body
  confirmPreset();
  // Re-open the modal for adding another body
  setTimeout(() => openPreset(false), 80);
}

function prsSetTab(tab, btn){
  _prsTab = tab;
  document.querySelectorAll('.prs-tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  prsRebuild();
}

// Show/hide the SYSTEM tab and update its label based on loaded system
function prsRefreshNamedTabs(){
  const tabBar = document.querySelector('.prs-tabs');
  if(!tabBar) return;
  // Remove any previously injected named tabs
  tabBar.querySelectorAll('.prs-tab-named').forEach(t => t.remove());
  if(typeof dynamicPresetSources === 'undefined') return;
  Object.keys(dynamicPresetSources).forEach(label => {
    const btn = document.createElement('button');
    btn.className = 'prs-tab prs-tab-named';
    btn.textContent = '🚀 ' + label;
    btn.onclick = function(){ prsSetTab(label, this); };
    // Insert before the system tab
    const sysTab = document.getElementById('prs-tab-system');
    tabBar.insertBefore(btn, sysTab);
  });
}

function prsRefreshSystemTab(){
  const btn = document.getElementById('prs-tab-system');
  if(!btn) return;
  const hasSystem = Object.keys(systemPresets).length > 0;
  btn.style.display = hasSystem ? '' : 'none';
  btn.textContent = hasSystem ? `🚀 ${systemPresetsName || 'SYSTEM'}` : '';
  // If currently on system tab but system was cleared, fall back to all
  if(!hasSystem && _prsTab === 'system'){
    _prsTab = 'all';
    document.querySelectorAll('.prs-tab').forEach((t,i) => t.classList.toggle('on', i===0));
  }
}

function prsRebuild(){
  const grid = document.getElementById('prs-grid');
  const searchEl = document.getElementById('prs-search');
  if(!grid) return;

  // Clipboard tab — completely separate rendering path
  if(_prsTab === 'clipboard'){
    searchEl && (searchEl.parentElement.style.display = 'none');
    grid.innerHTML = '';
    const clip = typeof _bodyClipboard !== 'undefined' ? _bodyClipboard : [];
    if(clip.length === 0){
      grid.innerHTML = '<div class="prs-empty">Clipboard is empty.<br>Use <b>Cut/Copy to Clipboard</b> on any body.</div>';
    } else {
      clip.forEach((entry, idx) => grid.appendChild(makeClipboardCard(entry, idx)));
    }
    return;
  }
  searchEl && (searchEl.parentElement.style.display = '');

  _prsSearch = (searchEl?.value || '').toLowerCase().trim();
  const all = buildAllPresets();
  const hasCenter = Object.values(bodies).some(b => b.isCenter);

  // Filter
  let filtered = all.filter(p => {
    if(_prsTab !== 'all' && p.category !== _prsTab) return false;
    if(isForCenter && !['star','blackhole','barycentre'].includes(p.id)) return false;
    if(_prsSearch && !p.name.toLowerCase().includes(_prsSearch)) return false;
    return true;
  });

  grid.innerHTML = '';

  if(filtered.length === 0){
    grid.innerHTML = '<div class="prs-empty">No presets match your search.</div>';
    return;
  }

  // Group headers when showing all
  if(_prsTab === 'all'){
    const vanillaItems = filtered.filter(p => p.category === 'vanilla');
    const customItems  = filtered.filter(p => p.category === 'custom');
    const systemItems  = filtered.filter(p => p.category === 'system');
    if(vanillaItems.length){
      const hdr = document.createElement('div');
      hdr.className = 'prs-group-hdr';
      hdr.textContent = '🌍 Vanilla Solar System';
      grid.appendChild(hdr);
      vanillaItems.forEach(p => grid.appendChild(makePrsCard(p)));
    }
    if(customItems.length){
      const hdr = document.createElement('div');
      hdr.className = 'prs-group-hdr';
      hdr.textContent = '⭐ Custom Presets';
      grid.appendChild(hdr);
      customItems.forEach(p => grid.appendChild(makePrsCard(p)));
    }
    if(systemItems.length){
      const hdr = document.createElement('div');
      hdr.className = 'prs-group-hdr';
      hdr.textContent = `🚀 ${systemPresetsName || 'Loaded System'}`;
      grid.appendChild(hdr);
      systemItems.forEach(p => grid.appendChild(makePrsCard(p)));
    }
    // Named import buckets (BGH etc.)
    if(typeof dynamicPresetSources !== 'undefined'){
      Object.keys(dynamicPresetSources).forEach(label => {
        const namedItems = filtered.filter(p => p.category === label);
        if(!namedItems.length) return;
        const hdr = document.createElement('div');
        hdr.className = 'prs-group-hdr';
        hdr.textContent = '🚀 ' + label;
        grid.appendChild(hdr);
        namedItems.forEach(p => grid.appendChild(makePrsCard(p)));
      });
    }
  } else {
    filtered.forEach(p => grid.appendChild(makePrsCard(p)));
  }
}

function makeClipboardCard(entry, idx){
  const card = document.createElement('div');
  card.className = 'prs-card prs-card-clipboard';

  // Draw sphere icon same as makePrsCard
  const p = entry.preset || {};
  const SZ = 32;
  const ic = document.createElement('canvas');
  ic.width = SZ; ic.height = SZ;
  ic.style.cssText = 'display:block;margin:0 auto 3px';
  const ix = ic.getContext('2d');
  const cx = SZ/2, cy = SZ/2;
  const pid = p.id || 'planet';
  const cols = (p.color||'#aaaaaa,#555555').split(',');
  const hi = cols[0]||'#aaaaaa', lo = cols[1]||'#555555', gl = p.glow||hi;
  const ir = pid==='star'||pid==='blackhole' ? SZ*0.42
           : pid==='gasgiant'||pid==='ringedgiant' ? SZ*0.36
           : pid==='planet'||pid==='marslike'||pid==='mercurylike' ? SZ*0.30
           : pid==='moon' ? SZ*0.24 : SZ*0.20;
  if(pid==='star'||pid==='blackhole'){
    const gg = ix.createRadialGradient(cx,cy,ir*0.5,cx,cy,ir*1.9);
    gg.addColorStop(0, gl+'55'); gg.addColorStop(1, gl+'00');
    ix.beginPath(); ix.arc(cx,cy,ir*1.9,0,Math.PI*2); ix.fillStyle=gg; ix.fill();
  }
  const sg = ix.createRadialGradient(cx-ir*0.28,cy-ir*0.28,ir*0.08,cx,cy,ir);
  sg.addColorStop(0, hi); sg.addColorStop(0.5, hi); sg.addColorStop(1, lo);
  ix.beginPath(); ix.arc(cx,cy,ir,0,Math.PI*2); ix.fillStyle=sg; ix.fill();

  const r = entry.data.BASE_DATA?.radius;
  const g = entry.data.BASE_DATA?.gravity;
  const sub = r ? `r: ${r >= 1e6 ? (r/1e6).toFixed(2)+'M' : r >= 1e3 ? (r/1e3).toFixed(1)+'k' : r} m  g: ${g}` : '';

  card.innerHTML =
    `<span class="prs-card-name">${entry.name}</span>` +
    (sub ? `<span class="prs-card-sub">${sub}</span>` : '') +
    `<span class="prs-card-badge" style="background:rgba(255,160,50,.18);color:rgba(255,190,80,.9);border-color:rgba(255,160,50,.3)">📋</span>` +
    `<button class="prs-clip-del" title="Remove from clipboard" onclick="event.stopPropagation();clipboardRemove(${idx})">✕</button>`;
  card.insertBefore(ic, card.firstChild);

  card.onclick = () => {
    document.querySelectorAll('.prs-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    // Store a synthetic preset key that encodes the clipboard index
    selectedPresetKey = '__clip__' + idx;
  };
  return card;
}

function clipboardRemove(idx){
  if(typeof _bodyClipboard === 'undefined') return;
  _bodyClipboard.splice(idx, 1);
  if(typeof _updateClipboardBadge === 'function') _updateClipboardBadge();
  prsRebuild();
}

function makePrsCard(p){
  const card = document.createElement('div');
  card.className = 'prs-card' + (p.key === selectedPresetKey ? ' sel' : '');
  card.dataset.key = p.key;

  const r = p.data.BASE_DATA?.radius;
  const g = p.data.BASE_DATA?.gravity;
  const sub = r ? `r: ${r >= 1e6 ? (r/1e6).toFixed(2)+'M' : r >= 1e3 ? (r/1e3).toFixed(1)+'k' : r} m  g: ${g}` : '';

  // Canvas sphere icon uses preset color/glow — no emoji inconsistency across platforms
  const SZ = 32;
  const ic = document.createElement('canvas');
  ic.width = SZ; ic.height = SZ;
  ic.style.cssText = 'display:block;margin:0 auto 3px';
  const ix = ic.getContext('2d');
  const cx = SZ/2, cy = SZ/2;
  if(p.id === 'barycentre'){
    ix.strokeStyle = '#8899bb'; ix.lineWidth = 1.5;
    const br = SZ * 0.35;
    ix.beginPath(); ix.arc(cx,cy,br,0,Math.PI*2); ix.stroke();
    ix.beginPath(); ix.moveTo(cx-br,cy); ix.lineTo(cx+br,cy); ix.stroke();
    ix.beginPath(); ix.moveTo(cx,cy-br); ix.lineTo(cx,cy+br); ix.stroke();
  } else {
    const cols = (p.color||'#aaaaaa,#555555').split(',');
    const hi = cols[0]||'#aaaaaa', lo = cols[1]||'#555555', gl = p.glow||hi;
    const ir = p.id==='star'||p.id==='blackhole' ? SZ*0.42
             : p.id==='gasgiant'||p.id==='ringedgiant' ? SZ*0.36
             : p.id==='planet'||p.id==='marslike'||p.id==='mercurylike' ? SZ*0.30
             : p.id==='moon' ? SZ*0.24 : SZ*0.18;
    if(p.id==='star'||p.id==='blackhole'){
      const gg = ix.createRadialGradient(cx,cy,ir*0.5,cx,cy,ir*1.9);
      gg.addColorStop(0, gl+'55'); gg.addColorStop(1, gl+'00');
      ix.beginPath(); ix.arc(cx,cy,ir*1.9,0,Math.PI*2); ix.fillStyle=gg; ix.fill();
    }
    const sg = ix.createRadialGradient(cx-ir*0.28,cy-ir*0.28,ir*0.08,cx,cy,ir);
    sg.addColorStop(0, hi); sg.addColorStop(0.5, hi); sg.addColorStop(1, lo);
    ix.beginPath(); ix.arc(cx,cy,ir,0,Math.PI*2); ix.fillStyle=sg; ix.fill();
    if(p.id==='ringedgiant'){
      ix.save(); ix.translate(cx,cy); ix.scale(1,0.28);
      ix.strokeStyle=hi+'aa'; ix.lineWidth=2.5;
      ix.beginPath(); ix.arc(0,0,ir*1.6,0,Math.PI*2); ix.stroke();
      ix.restore();
    }
  }

  card.innerHTML =
    `<span class="prs-card-name">${p.name}</span>` +
    (sub ? `<span class="prs-card-sub">${sub}</span>` : '') +
    `<span class="prs-card-badge${p.category==='custom'?' custom':p.category==='system'?' system':''}">` +
    `${p.category==='custom'?'CUSTOM':p.category==='system'?'SYS':'SFS'}</span>`;
  card.insertBefore(ic, card.firstChild);

  card.onclick = () => {
    document.querySelectorAll('.prs-card').forEach(c => c.classList.remove('sel'));
    card.classList.add('sel');
    selectedPresetKey = p.key;
  };
  return card;
}

function openPreset(forCenter){
  isForCenter = forCenter;
  _prsMode = 'add';
  // Default selection: Sun for center, Earth for body
  selectedPresetKey = forCenter ? 'Sun' : 'Earth';
  _prsTab = 'all';
  _prsSearch = '';
  _prsSmaUserPicked = false;

  // Inject named import tabs, then reset all tabs so ALL is active
  try { prsRefreshNamedTabs(); } catch(_){}
  document.querySelectorAll('.prs-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
  const searchEl = document.getElementById('prs-search');
  if(searchEl) searchEl.value = '';

  // Show/hide orbit controls and NEXT button
  const orbitCtrl = document.getElementById('prs-orbit-controls');
  const nextBtn   = document.getElementById('prs-next-btn');
  const saveFields = document.getElementById('prs-save-preset-fields');
  const uploadBtn  = document.getElementById('prs-upload-btn');
  if(orbitCtrl)  orbitCtrl.style.display  = forCenter ? 'none' : '';
  if(nextBtn)    nextBtn.style.display    = forCenter ? 'none' : '';
  if(saveFields) saveFields.style.display = 'none';
  if(uploadBtn)  uploadBtn.style.display  = '';

  let desc;
  if(forCenter){
    desc = 'Choose your system center — no orbital data needed';
  } else {
    // Determine default parent
    const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || '';
    _prsParentName = (selectedBody && bodies[selectedBody] && !bodies[selectedBody].isCenter)
      ? selectedBody : centerName;

    // Populate parent selector sorted nearest→farthest
    _prsBuildParentSelector();

    // Compute default SMA for this parent
    _prsRecalcDefaultSMA();

    const parentDisplay = _prsParentName || 'the center';
    desc = `New body will orbit <strong style="color:var(--sky2)">${parentDisplay}</strong> — all properties editable after`;
  }
  document.getElementById('mp-desc').innerHTML = desc;
  document.getElementById('prs-confirm-btn').textContent = forCenter ? 'ADD CENTER →' : 'ADD BODY →';
  document.getElementById('prs-confirm-btn').style.borderColor = '';
  document.getElementById('prs-confirm-btn').style.color = '';
  document.getElementById('prs-confirm-btn').style.background = '';

  // Open the modal first so it's visible even if prsRebuild is slow
  document.getElementById('modal-preset').classList.add('open');
  try { prsRebuild(); } catch(e){
    console.error('[SFS] prsRebuild:', e);
    const grid = document.getElementById('prs-grid');
    if(grid) grid.innerHTML = '<div class="prs-empty">Error loading presets — check console.</div>';
  }
}

// ── Open modal in "save as procgen preset" mode ────────────────────────────────
function openPresetForSave(){
  _prsMode = 'save-preset';
  isForCenter = false;   // must be false so prsRebuild doesn't restrict to stars/BHs
  selectedPresetKey = 'Earth';
  _prsTab = 'all';
  _prsSearch = '';
  _prsSmaUserPicked = false;

  try { prsRefreshNamedTabs(); } catch(_){}
  document.querySelectorAll('.prs-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
  const searchEl = document.getElementById('prs-search');
  if(searchEl) searchEl.value = '';

  // Hide orbit controls and NEXT (not relevant for saving)
  const orbitCtrl  = document.getElementById('prs-orbit-controls');
  const nextBtn    = document.getElementById('prs-next-btn');
  const saveFields = document.getElementById('prs-save-preset-fields');
  const uploadBtn  = document.getElementById('prs-upload-btn');
  if(orbitCtrl)  orbitCtrl.style.display  = 'none';
  if(nextBtn)    nextBtn.style.display    = 'none';
  if(saveFields){ saveFields.style.display = ''; }
  if(uploadBtn)  uploadBtn.style.display  = 'none';

  // Reset save fields
  const nameEl = document.getElementById('prs-save-name');
  const catEl  = document.getElementById('prs-save-cat');
  if(nameEl) nameEl.value = '';
  if(catEl)  catEl.value  = 'custom';

  document.getElementById('mp-desc').innerHTML =
    'Pick any preset to save into the <strong style="color:var(--sky2)">procgen preset pool</strong> — choose a name and category below';

  const confirmBtn = document.getElementById('prs-confirm-btn');
  confirmBtn.textContent = 'SAVE AS PRESET →';
  confirmBtn.style.borderColor = 'rgba(100,220,180,.55)';
  confirmBtn.style.color       = 'rgba(100,220,180,.95)';
  confirmBtn.style.background  = 'rgba(100,220,180,.10)';

  document.getElementById('modal-preset').classList.add('open');
  try { prsRebuild(); } catch(e){
    console.error('[SFS] prsRebuild:', e);
    const grid = document.getElementById('prs-grid');
    if(grid) grid.innerHTML = '<div class="prs-empty">Error loading presets — check console.</div>';
  }
}

function closePreset(){
  document.getElementById('modal-preset').classList.remove('open');
  if(window._prsCloseHook){ window._prsCloseHook(); window._prsCloseHook = null; }
  // Reset mode
  _prsMode = 'add';
  // Restore confirm button text/style
  const btn = document.getElementById('prs-confirm-btn');
  if(btn){
    btn.textContent = isForCenter ? 'ADD CENTER →' : 'ADD BODY →';
    btn.style.borderColor = '';
    btn.style.color       = '';
    btn.style.background  = '';
  }
  // Hide save-preset fields
  const sf = document.getElementById('prs-save-preset-fields');
  if(sf) sf.style.display = 'none';
  // Restore upload button
  const ub = document.getElementById('prs-upload-btn');
  if(ub) ub.style.display = '';
}
function syncAddBodyBtn(){
  const btn = document.getElementById('btn-add-body');
  if(!btn) return;
  const hasCenter = Object.values(bodies).some(b => b.isCenter);
  btn.disabled = !hasCenter;
  if(hasCenter){
    btn.style.opacity = '';
    btn.style.cursor  = '';
    btn.title = 'Add a body orbiting the system center';
  } else {
    btn.style.opacity = '0.35';
    btn.style.cursor  = 'not-allowed';
    btn.title = 'Add a system center first (＋ ADD BODY → select a star or center body)';
  }
}
function addBodyPrompt(){ openPreset(false); }

function confirmPreset(){
  // ── Save-as-preset mode: register into procgen pool instead of adding to scene ──
  if(_prsMode === 'save-preset'){
    const all    = buildAllPresets();
    const preset = all.find(p => p.key === selectedPresetKey);
    if(!preset){ alert('No preset selected.'); return; }

    const nameEl = document.getElementById('prs-save-name');
    const catEl  = document.getElementById('prs-save-cat');
    const name   = (nameEl?.value || '').trim() || preset.name;
    const cat    = catEl?.value || 'custom';

    const bd = JSON.parse(JSON.stringify(preset.data || {}));
    delete bd.ORBIT_DATA;

    if(typeof _pgRegisterUserPreset === 'function'){
      _pgRegisterUserPreset(name, bd, cat, preset.id || '');
    }
    if(typeof pgPresetsRender === 'function') pgPresetsRender();
    try { SFX.select(); } catch(_){}
    if(typeof pgShowStatus === 'function') pgShowStatus(`✓ Preset "${name}" saved to ${cat} pool`, 'ok');

    closePreset();
    return;
  }

  closePreset();

  // Clipboard entry selected
  if(typeof selectedPresetKey === 'string' && selectedPresetKey.startsWith('__clip__')){
    const idx = parseInt(selectedPresetKey.slice(8), 10);
    const entry = (typeof _bodyClipboard !== 'undefined') ? _bodyClipboard[idx] : null;
    if(!entry){ alert('Clipboard entry not found.'); return; }
    let newName = entry.name;
    let n = 2;
    while(bodies[newName]) { newName = entry.name + '_copy' + (n++); }
    pushUndo();
    const newData = JSON.parse(JSON.stringify(entry.data));
    delete newData.isCenter;
    if(newData.ORBIT_DATA){
      newData.ORBIT_DATA.SMA = (parseFloat(newData.ORBIT_DATA.SMA) || 0) * 1.1 || 1e8;
    } else {
      const centre = Object.keys(bodies).find(k => bodies[k].isCenter);
      newData.ORBIT_DATA = { parent: centre || 'Sun', SMA: 1e8, E: 0, direction: 1 };
    }
    bodies[newName] = { preset: entry.preset, data: newData };
    if(typeof drawViewport === 'function') drawViewport();
    if(typeof updateStatusBar === 'function') updateStatusBar();
    return;
  }

  const all = buildAllPresets();
  const preset = all.find(p => p.key === selectedPresetKey);
  if(!preset){ alert('No preset selected.'); return; }

  // Guard: only one center allowed
  if(isForCenter && Object.values(bodies).some(b => b.isCenter)){
    alert('A system center already exists. Remove it first, or add this body as an orbiting body instead.');
    return;
  }

  const data = JSON.parse(JSON.stringify(preset.data));

  if(isForCenter){
    delete data.ORBIT_DATA;
  } else {
    const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || 'Sun';
    // Use parent from modal selector; fall back to selected/center
    const parentName = (_prsParentName && bodies[_prsParentName]) ? _prsParentName
      : ((selectedBody && bodies[selectedBody]) ? selectedBody : centerName);

    // Use SMA from modal input if set and valid; otherwise recalc
    let defaultSMA = _prsSmaMetres;
    if (!defaultSMA || defaultSMA <= 0) {
      // fallback: recalc same way as before
      const parentBody = bodies[parentName];
      const centerBodyEntry = bodies[Object.keys(bodies).find(n => bodies[n].isCenter)];
      const centerRadius = (centerBodyEntry?.data?.BASE_DATA?.radius) || 34817000;
      const parentRadius = (parentBody?.data?.BASE_DATA?.radius) || centerRadius;
      const siblings = Object.values(bodies).filter(b =>
        b.data.ORBIT_DATA && b.data.ORBIT_DATA.parent === parentName
      );
      const AU = 1.496e11;
      function _getParentSOI_m2(pName){
        const pb = bodies[pName];
        if(!pb) return null;
        if(pb.isCenter) return null;
        return computeSOI_m(pName);
      }
      const parentSOI_m = _getParentSOI_m2(parentName);
      const MIN_CLEAR   = parentRadius * 5;
      const HARD_FLOOR  = 0.01 * AU;
      if(parentSOI_m === null){
        const minForCenter = Math.max(parentRadius * 80, HARD_FLOOR);
        defaultSMA = siblings.length > 0
          ? Math.max(Math.max(...siblings.map(b => b.data.ORBIT_DATA.semiMajorAxis || 0)) * 1.5, minForCenter)
          : minForCenter;
      } else if(parentSOI_m <= parentRadius){
        defaultSMA = parentRadius * 80;
      } else {
        const soiSafe = parentSOI_m * 0.80;
        if(siblings.length > 0){
          const maxSibSMA = Math.max(...siblings.map(b => b.data.ORBIT_DATA.semiMajorAxis || 0));
          const candidate = maxSibSMA * 1.5;
          if(candidate <= soiSafe) defaultSMA = candidate;
          else if(maxSibSMA < soiSafe) defaultSMA = maxSibSMA + (soiSafe - maxSibSMA) * 0.5;
          else defaultSMA = soiSafe * 0.5;
        } else {
          defaultSMA = soiSafe * 0.33;
        }
        defaultSMA = Math.min(defaultSMA, soiSafe);
        defaultSMA = Math.max(defaultSMA, MIN_CLEAR);
        if(MIN_CLEAR >= soiSafe) defaultSMA = (parentRadius + soiSafe) * 0.5;
      }
      defaultSMA = Math.max(defaultSMA, parentRadius * 5);
    }

    data.ORBIT_DATA = {
      parent: parentName,
      semiMajorAxis: defaultSMA,
      smaDifficultyScale: {},
      eccentricity: 0,
      argumentOfPeriapsis: 0,
      direction: 1,
      multiplierSOI: 2.5,
      soiDifficultyScale: {}
    };
  }

  // Generate unique body name from preset name
  let baseName = preset.name.replace(/\s+/g,'_');
  let name = baseName; let n = 1;
  while(bodies[name]){ name = baseName + '_' + (++n); }

  pushUndo();
  bodies[name] = { data, preset:preset.id, isCenter:isForCenter, color:preset.color, glow:preset.glow, icon:preset.icon };
  document.getElementById('empty-state').classList.add('gone');

  if(isForCenter){
    document.getElementById('sb-center').textContent = name;
  }

  resizeViewport();
  renderBody(name);
  updateStatusBar();
  syncAddBodyBtn();
  selectBody(name);
}

