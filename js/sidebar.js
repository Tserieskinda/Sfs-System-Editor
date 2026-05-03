// ════════════════════════════════ SIDEBAR ════════════════════════════════

// Render a shaded sphere SVG using the body's map color into #sbb-icon
function updateBodyIcon(r, g, b, a){
  const cr = Math.min(1, r||0), cg = Math.min(1, g||0), cb = Math.min(1, b||0);
  const alpha = (a === undefined || a === null) ? 1 : Math.min(1, Math.max(0, a));
  const toHex = v => Math.round(v * 255).toString(16).padStart(2,'0');
  const baseHex = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}`;
  const hiR = Math.min(1, cr + 0.42), hiG = Math.min(1, cg + 0.42), hiB = Math.min(1, cb + 0.42);
  const hiHex = `#${toHex(hiR)}${toHex(hiG)}${toHex(hiB)}`;
  const shR = cr * 0.28, shG = cg * 0.28, shB = cb * 0.28;
  const shHex = `#${toHex(shR)}${toHex(shG)}${toHex(shB)}`;
  const id = `bg_${Math.random().toString(36).slice(2,7)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <defs>
      <radialGradient id="${id}" cx="35%" cy="30%" r="65%">
        <stop offset="0%"   stop-color="${hiHex}" stop-opacity="${alpha}"/>
        <stop offset="45%"  stop-color="${baseHex}" stop-opacity="${alpha}"/>
        <stop offset="100%" stop-color="${shHex}" stop-opacity="${alpha}"/>
      </radialGradient>
    </defs>
    <circle cx="20" cy="20" r="18" fill="url(#${id})" />
  </svg>`;
  const el = document.getElementById('sbb-icon');
  if(el) el.innerHTML = svg;
}

function selectBody(name){
  selectedBody = name;
  if (typeof NameGen !== 'undefined') NameGen.clearSession(name);
  document.getElementById('sb-sel').textContent = name;
  fillSidebar(name);
  openSidebar();
  drawViewport();
}

function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('statusbar').style.right='340px';
  setTimeout(resizeViewport, 360);
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('statusbar').style.right='0';
  selectedBody=null;
  if (typeof NameGen !== 'undefined') NameGen.clearSession(null);
  document.getElementById('sb-sel').textContent='—';
  setTimeout(resizeViewport, 360);
  drawViewport();
}

// ── Delete body + all satellites recursively ──
function getSatelliteNames(parentName){
  const result = [];
  Object.keys(bodies).forEach(n => {
    if(bodies[n].data.ORBIT_DATA?.parent === parentName){
      result.push(n);
      result.push(...getSatelliteNames(n));
    }
  });
  return result;
}

function confirmDeleteBody(){
  if(!selectedBody || !bodies[selectedBody]) return;
  const sats = getSatelliteNames(selectedBody);
  const total = sats.length;
  const msg = total > 0
    ? `Delete "${selectedBody}" and its ${total} satellite${total>1?'s':''} (${sats.join(', ')})?`
    : `Delete "${selectedBody}"?`;
  if(!confirm(msg)) return;
  pushUndo();
  const toDelete = [selectedBody, ...sats];
  toDelete.forEach(n => delete bodies[n]);
  closeSidebar();
  drawViewport();
  syncAddBodyBtn();
}

// ── Replace body preset (keep orbit, satellites unaffected) ──
function replaceBodyPrompt(){
  if(!selectedBody || !bodies[selectedBody]) return;
  const existing = bodies[selectedBody];
  const isCenterBody = existing.isCenter;

  // Reuse the main preset modal in replace mode
  let _replaceKey = selectedPresetKey;
  isForCenter = isCenterBody;

  // Temporarily patch openPreset to replace instead of add
  const modal = document.getElementById('modal-preset');
  const confirmBtn = document.getElementById('prs-confirm-btn');
  const descEl = document.getElementById('mp-desc');

  descEl.innerHTML = `Replace <strong style="color:var(--sky2)">${selectedBody}</strong> — orbit and satellites are preserved`;
  confirmBtn.textContent = '⇄ REPLACE BODY';

  // Override confirm action
  const originalOnClick = confirmBtn.onclick;
  confirmBtn.onclick = () => {
    const all = buildAllPresets();
    const preset = all.find(p => p.key === selectedPresetKey);
    if(!preset) return;
    pushUndo();
    const old = bodies[selectedBody];
    const newData = JSON.parse(JSON.stringify(preset.data));
    if(old.data.ORBIT_DATA) newData.ORBIT_DATA = JSON.parse(JSON.stringify(old.data.ORBIT_DATA));
    else delete newData.ORBIT_DATA;
    bodies[selectedBody] = { data:newData, preset:preset.id, isCenter:old.isCenter, color:preset.color, glow:preset.glow, icon:preset.icon };
    closePreset();
    confirmBtn.onclick = originalOnClick; // restore
    fillSidebar(selectedBody);
    drawViewport();
  };

  // Reset tabs and search
  _prsTab = 'all';
  _prsSearch = '';
  document.querySelectorAll('.prs-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
  const searchEl = document.getElementById('prs-search');
  if(searchEl) searchEl.value = '';

  prsRebuild();
  modal.classList.add('open');

  // Make sure cancel restores the confirm button
  const origClose = window._prsCloseHook;
  window._prsCloseHook = () => { confirmBtn.onclick = originalOnClick; };
}

// ── Import a body directly from a .txt file (Upload TXT in preset modal) ──
function importBodyFromTxt(input){
  const file = input.files[0];
  input.value = ''; // reset so same file can be re-selected
  if(!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    let raw = e.target.result;
    // Lenient parse: same fixes as zip importer
    try {
      raw = raw
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/(\d)\.(?=[,\s}\]])/g, '$10');
    } catch(_){}

    let bodyData;
    try { bodyData = normalizeDiffScaleKeys(JSON.parse(raw)); }
    catch(err) { alert('Could not parse .txt file:\n' + err.message); return; }

    // Derive name from filename (strip .txt)
    let name = file.name.replace(/\.txt$/i, '').trim() || 'Body';

    // Deduplicate name if it already exists
    if(bodies[name]){
      let n = 2;
      while(bodies[name + '_' + n]) n++;
      name = name + '_' + n;
    }

    pushUndo();

    // Determine if this should be the center
    const lacksOrbit = !bodyData.ORBIT_DATA;
    const existingCenter = Object.values(bodies).find(b => b.isCenter);

    if(isForCenter){
      // Called from openPreset(true) — replace center slot
      if(existingCenter){
        alert('A system center already exists. Remove it first.');
        return;
      }
      delete bodyData.ORBIT_DATA;
    } else if(lacksOrbit && !existingCenter){
      // No center yet and file has no orbit — treat as center
      // (fine — user dropped a star txt as first body)
    } else if(lacksOrbit && existingCenter){
      // File has no orbit data but a center exists — inject a default orbit
      const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || 'Sun';
      const centerR = existingCenter.data.BASE_DATA?.radius || 1e6;
      bodyData.ORBIT_DATA = {
        parent: selectedBody && bodies[selectedBody] ? selectedBody : centerName,
        semiMajorAxis: centerR * 80,
        eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
        multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
      };
    }

    // Replace-mode: the confirm button was patched — honour the same orbit-preserve logic
    const replaceMode = document.getElementById('prs-confirm-btn').textContent.includes('REPLACE');
    if(replaceMode && selectedBody && bodies[selectedBody]){
      const old = bodies[selectedBody];
      if(old.data.ORBIT_DATA) bodyData.ORBIT_DATA = JSON.parse(JSON.stringify(old.data.ORBIT_DATA));
      else delete bodyData.ORBIT_DATA;
      name = selectedBody; // keep the same name slot
    } else if(bodyData.ORBIT_DATA){
      // File already has orbit data but its parent may be from a different system.
      // Repoint parent to wherever the user is adding this body (selected body or center).
      const centerName = Object.keys(bodies).find(n => bodies[n].isCenter);
      const targetParent = (selectedBody && bodies[selectedBody] && !bodies[selectedBody].isCenter)
        ? selectedBody
        : (centerName || bodyData.ORBIT_DATA.parent);
      bodyData.ORBIT_DATA.parent = targetParent;
    }

    const _meta = inferPresetMeta(name, bodyData);
    const isCenter = !bodyData.ORBIT_DATA && !existingCenter;
    bodies[name] = {
      data: bodyData,
      preset: _meta.id,
      isCenter,
      color: _meta.color,
      glow: _meta.glow,
      icon: _meta.icon
    };

    if(isCenter){
      document.getElementById('empty-state').classList.add('gone');
    }

    closePreset();
    syncAddBodyBtn();
    updateStatusBar();
    selectBody(name);
    drawViewport();
  };
  reader.readAsText(file);
}

// ── Smooth animated zoom to a body ──
function zoomToBody(name){
  const b = bodies[name];
  if(!b) return;
  const wp = bodyWorldPos[name];
  if(!wp) return;
  const vp = document.getElementById('viewport');
  const W = vp.width, H = vp.height;
  const bodyR   = (b.data.BASE_DATA||{}).radius || 1;
  const rMult   = getRadiusDifficultyMult(b.data.BASE_DATA);
  const sc      = getSMAScale();
  const physR   = bodyR * rMult * sc;
  const targetZ = physR > 0 ? (Math.min(W,H) * 0.18) / physR : 4;
  const endZ = Math.max(0.0001, targetZ);

  // On mobile the sidebar slides up from the bottom covering ~45vh + 44px statusbar.
  // Shift the pan target upward so the body appears centred in the visible area.
  const sb = document.getElementById('sidebar');
  const sbOpen = sb && sb.classList.contains('open');
  const isMobile = window.innerWidth <= 600;
  const sidebarCoverPx = (sbOpen && isMobile) ? (window.innerHeight * 0.45 + 44) : 0;
  // Convert pixel offset to world-space offset at the new zoom level
  const yShift = sidebarCoverPx / 2 / endZ;

  const startZ = vpZ, startX = vpOffX, startY = vpOffY;
  const endX = -wp.x, endY = -wp.y - yShift;
  const panDur = 380, zoomDur = 320;
  const t0 = performance.now();

  function _ease(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

  // Phase 1: pan to body at current zoom
  function panStep(now){
    const t = Math.min(1, (now-t0)/panDur);
    const e = _ease(t);
    vpOffX = startX + (endX-startX)*e;
    vpOffY = startY + (endY-startY)*e;
    const zb = document.getElementById('sb-zoom');
    if(zb) zb.textContent = Math.round(vpZ*100)+'%';
    drawViewport();
    if(t<1) requestAnimationFrame(panStep);
    else{ const t1 = performance.now(); requestAnimationFrame(now2 => zoomStep(t1, now2)); }
  }

  // Phase 2: zoom in once pan is done
  function zoomStep(t1, now){
    const t = Math.min(1, (now-t1)/zoomDur);
    const e = _ease(t);
    vpZ = startZ + (endZ-startZ)*e;
    const zb = document.getElementById('sb-zoom');
    if(zb) zb.textContent = Math.round(vpZ*100)+'%';
    drawViewport();
    if(t<1){ const _t1=t1; requestAnimationFrame(now2 => zoomStep(_t1, now2)); }
  }

  requestAnimationFrame(panStep);
}


function switchTab(id,btn){
  document.querySelectorAll('.sbt').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('tab-'+id).classList.add('on');
  // Scroll the clicked tab into view within the scrollable bar
  btn.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
  // When switching to JSON tab, populate with current body data
  if(id === 'json') refreshJsonView();
}

// ── Tab bar: drag-to-scroll + wheel-to-scroll + fade-edge indicators ──
(function(){
  const tabs  = document.getElementById('sb-tabs');
  const wrap  = document.getElementById('sb-tabs-wrap');
  if(!tabs || !wrap) return;

  // Update fade-edge classes
  function syncEdges(){
    const atStart = tabs.scrollLeft <= 2;
    const atEnd   = tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth - 2;
    wrap.classList.toggle('at-start', atStart);
    wrap.classList.toggle('at-end',   atEnd);
  }
  tabs.addEventListener('scroll', syncEdges, {passive:true});
  syncEdges();
  // Re-check after fonts load (tab widths may shift)
  window.addEventListener('load', syncEdges);

  // Mouse-wheel horizontal scroll
  tabs.addEventListener('wheel', e => {
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already horizontal
    e.preventDefault();
    tabs.scrollLeft += e.deltaY * 0.8;
  }, {passive: false});

  // Drag-to-scroll
  let dragging = false, startX = 0, startScroll = 0, moved = false;
  tabs.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    dragging = true; moved = false;
    startX = e.clientX;
    startScroll = tabs.scrollLeft;
    tabs.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if(!dragging) return;
    const dx = e.clientX - startX;
    if(Math.abs(dx) > 4) moved = true;
    tabs.scrollLeft = startScroll - dx;
  });
  window.addEventListener('mouseup', e => {
    if(!dragging) return;
    dragging = false;
    tabs.style.cursor = '';
    // If we dragged, swallow the next click so the button isn't fired
    if(moved){
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); tabs.removeEventListener('click', swallow, true); };
      tabs.addEventListener('click', swallow, {capture:true, once:true});
    }
  });

  // Touch drag (mobile passthrough already works via overflow-x, but keep cursor tidy)
})();

// ── JSON tab ──
function refreshJsonView(){
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;
  const _jd = JSON.parse(JSON.stringify(b.data));
  const { version: _jv, ..._jr } = _jd;
  const out = { version: _jv || '1.5', ..._jr };
  const el = document.getElementById('json-editor');
  el.value = JSON.stringify(out, null, 2);
  el.style.borderColor = 'var(--ac15)';
  el.style.color = '#90d8a0';
  document.getElementById('json-error').style.display = 'none';
}

function validateJsonEdit(text){
  const el = document.getElementById('json-editor');
  const err = document.getElementById('json-error');
  try {
    JSON.parse(text);
    el.style.borderColor = 'rgba(48,200,100,.3)';
    el.style.color = '#90d8a0';
    err.style.display = 'none';
  } catch(e){
    el.style.borderColor = 'rgba(255,64,96,.4)';
    el.style.color = '#f08080';
    err.textContent = '⚠ ' + e.message;
    err.style.display = 'block';
  }
}

function applyJsonEdit(){
  if(!selectedBody) return;
  const text = document.getElementById('json-editor').value;
  try {
    const parsed = normalizeDiffScaleKeys(JSON.parse(text));
    // Remove version from data (it's added on export)
    delete parsed.version;
    pushUndo();
    bodies[selectedBody].data = parsed;
    // Refresh all other sidebar tabs from new data
    fillSidebar(selectedBody);
    // Stay on JSON tab
    document.querySelectorAll('.sbt').forEach(b=>b.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
    document.querySelector('.sbt[onclick*="json"]').classList.add('on');
    document.getElementById('tab-json').classList.add('on');
    refreshJsonView();
    drawViewport();
    const el = document.getElementById('json-editor');
    el.style.borderColor = 'rgba(48,200,100,.5)';
    setTimeout(()=>{ el.style.borderColor='var(--ac15)'; }, 1000);
  } catch(e){
    document.getElementById('json-error').textContent = '⚠ Cannot apply — invalid JSON: ' + e.message;
    document.getElementById('json-error').style.display = 'block';
  }
}

let _jsonAutoApplyTimer = null;
function _jsonAutoApply(text){
  clearTimeout(_jsonAutoApplyTimer);
  _jsonAutoApplyTimer = setTimeout(() => {
    try {
      JSON.parse(text); // validate first — throws if invalid
      applyJsonEdit();
    } catch(e){ /* invalid JSON — wait for more input */ }
  }, 800);
}

// Float value helper — like parseFloat but returns `fallback` only when the string is empty/NaN,
// NOT when the parsed value is 0 or negative (unlike the `|| fallback` pattern).
function _fv(str, fallback){ const n = parseFloat(str); return isNaN(n) ? fallback : n; }

function tog(id){ return document.getElementById(id).classList.contains('on'); }

// ── Gravity unit helpers (m/s², cm/s², km/s²) ────────────────────────────────
const _GRAV_TO_MS2 = { ms2: 1, cms2: 0.01, kms2: 1000 };

function _gravToMs2(val, unit) { return val * (_GRAV_TO_MS2[unit] ?? 1); }
function _ms2ToGrav(ms2, unit) { return ms2 / (_GRAV_TO_MS2[unit] ?? 1); }

function onGravUnitChange() {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  if (!input || !unitSel) return;
  // Convert displayed value from previous unit to new unit
  const raw = parseFloat(input.value);
  if (!isNaN(raw) && raw !== 0) {
    // Store ms2 from old unit, re-express in new unit
    // We track prev unit via data attribute
    const prevUnit = input.dataset.gravUnit || 'ms2';
    const ms2 = _gravToMs2(raw, prevUnit);
    input.value = parseFloat(_ms2ToGrav(ms2, unitSel.value).toPrecision(6));
  }
  input.dataset.gravUnit = unitSel.value;
  if (typeof liveSync === 'function') liveSync();
}

function getGravMs2() {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  const raw = parseFloat(input?.value) || 0;
  const unit = unitSel?.value || 'ms2';
  return _gravToMs2(raw, unit);
}

function setGravDisplay(ms2) {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  if (!input) return;
  const unit = unitSel?.value || 'ms2';
  const v = _ms2ToGrav(ms2, unit);
  input.value = ms2 !== 0 ? parseFloat(v.toPrecision(6)) : '';
  input.dataset.gravUnit = unit;
}

// ── Default difficulty scale button ───────────────────────────────────────────
// Sets Normal=1, Hard=2, Realistic=20 — matching SFS 1:20 / 1:10 / 1:1 ratio
function setDefaultScale(nId, hId, rId) {
  const n = document.getElementById(nId);
  const h = document.getElementById(hId);
  const r = document.getElementById(rId);
  if (n) n.value = '1';
  if (h) h.value = '2';
  if (r) r.value = '20';
  if (typeof liveSync === 'function') liveSync();
}

// ── Simple km/m toggle for atmosphere, clouds, water fields ──────────────────
// These fields store raw metres; we just scale display on unit change.
function onSimpleKmChange(inputId) {
  const input  = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  if (!input || !unitSel) return;
  const raw = parseFloat(input.value);
  if (isNaN(raw) || raw === 0) return;
  const newUnit = unitSel.value; // 'm' or 'km'
  const prevUnit = newUnit === 'km' ? 'm' : 'km';
  // Convert displayed value to metres, then to new unit
  const metres = prevUnit === 'km' ? raw * 1000 : raw;
  input.value = newUnit === 'km' ? parseFloat((metres / 1000).toPrecision(6)) : metres;
  if (typeof liveSync === 'function') liveSync();
}

// Read a simple km/m field back to metres for liveSync
function getSimpleKmMetres(inputId) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  const raw = parseFloat(input?.value) || 0;
  const unit = unitSel?.value || 'm';
  return unit === 'km' ? raw * 1000 : raw;
}

// Set a simple km/m field from metres, respecting current unit selection
function setSimpleKm(inputId, metres) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  if (!input) return;
  const unit = unitSel?.value || 'm';
  input.value = unit === 'km'
    ? (metres !== 0 ? parseFloat((metres / 1000).toPrecision(6)) : '')
    : (metres !== 0 ? metres : '');
}

function setTog(id, v){ document.getElementById(id).classList.toggle('on', !!v); }
function val(id){ return document.getElementById(id).value; }
function setVal(id, v){ if(document.getElementById(id)) document.getElementById(id).value = (v==null||v===undefined)?'':v; }

// Slider sync helpers
function _sliderPct(v, min, max){ return ((v - min) / (max - min) * 100).toFixed(2) + '%'; }
function syncSlider(id, min, max){
  // number input → slider; liveSync() fires via delegated sidebar 'input' listener
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = Math.max(min, Math.min(max, parseFloat(inp.value) || 0));
  sl.value = v;
  sl.style.setProperty('--pct', _sliderPct(v, min, max));
  if(val) val.textContent = inp.value;
  // Do NOT call liveSync() here — the number-input's own 'input' event
  // already bubbles to the sidebar delegated listener which calls liveSync().
  // Calling it again here was causing a double liveSync()+drawViewport() per tick.
}
function syncFromSlider(id, min, max, decimals){
  // slider → number input; liveSync() fires via delegated sidebar 'input' listener
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = parseFloat(sl.value);
  inp.value = v.toFixed(decimals);
  sl.style.setProperty('--pct', _sliderPct(v, min, max));
  if(val) val.textContent = inp.value;
  // Do NOT call liveSync() here — the slider's own 'input' event already
  // bubbles to the sidebar delegated listener which calls liveSync().
  // Calling it again here was causing a double liveSync()+drawViewport() per tick.
}
function setSlider(id, v, min, max){
  // Called from renderBody to initialise both input and slider
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp) return;
  const clamped = (v == null || v === undefined) ? min : Math.max(min, Math.min(max, v));
  inp.value = clamped;
  if(sl){ sl.value = clamped; sl.style.setProperty('--pct', _sliderPct(clamped, min, max)); }
  if(val) val.textContent = clamped;
}

// Call after populating a slider-augmented input to sync the thumb position
function initSlider(id, min, max){
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = parseFloat(inp.value);
  if(!isNaN(v)){
    const clamped = Math.max(min, Math.min(max, v));
    sl.value = clamped;
    sl.style.setProperty('--pct', _sliderPct(clamped, min, max));
    if(val) val.textContent = v;
  }
}

// ── Toggle helpers ──
function toggleAtmos(){
  const on = tog('ap-has');
  document.getElementById('atmos-fields').style.opacity = on ? '1' : '0.3';
  document.getElementById('atmos-fields').style.pointerEvents = on ? 'all' : 'none';
  if(on && !val('ap-height')){
    const r = getDistMetres('b-radius');
    if(r) setVal('ap-height', Math.round(r / 10));
  }
}
function toggleRings(){
  const on = tog('rng-has');
  document.getElementById('rings-fields').style.opacity = on ? '1' : '0.35';
  document.getElementById('rings-fields').style.pointerEvents = on ? 'all' : 'none';
  if(on && !val('rng-sr') && !val('rng-er')){
    const r = getDistMetres('b-radius');
    if(r){
      setDistInput('rng-sr','rng-sr-unit','rng-sr-hint', Math.round(r * 1.2), 'radius');
      setDistInput('rng-er','rng-er-unit','rng-er-hint', Math.round(r * 3),   'radius');
    }
  }
}
function toggleAtmoSection(fieldId,togId){ const on=tog(togId); const el=document.getElementById(fieldId); if(el){el.style.opacity=on?'1':'0.3';el.style.pointerEvents=on?'all':'none';} }
function toggleOrbit(){ const on=tog('or-has'); document.getElementById('orbit-fields').style.opacity=on?'1':'0.35'; document.getElementById('orbit-fields').style.pointerEvents=on?'all':'none'; }
function toggleOrbitHas(){
  // If the body is NOT the center, orbit is mandatory — don't allow toggling off
  const b = selectedBody && bodies[selectedBody];
  if(b && !b.isCenter){
    // Force it back on
    setTog('or-has', true);
    toggleOrbit();
    return;
  }
  // Center body has no orbit — toggle is meaningless but allow for completeness
  document.getElementById('or-has').classList.toggle('on');
  toggleOrbit();
}
function toggleRings(){ const on=tog('rng-has'); document.getElementById('rings-fields').style.opacity=on?'1':'0.35'; document.getElementById('rings-fields').style.pointerEvents=on?'all':'none'; }
function toggleWater(){ const on=tog('wt-has'); document.getElementById('water-fields').style.opacity=on?'1':'0.35'; document.getElementById('water-fields').style.pointerEvents=on?'all':'none'; }
function toggleTerrain(){
  const on = tog('ter-has');
  document.getElementById('terrain-fields').style.opacity = on ? '1' : '0.35';
  document.getElementById('terrain-fields').style.pointerEvents = on ? 'all' : 'none';
  // Sync heightmap tab gating
  const hmNoTerrain = document.getElementById('heightmap-no-terrain');
  const hmFields    = document.getElementById('heightmap-fields');
  if(hmNoTerrain) hmNoTerrain.style.display = on ? 'none' : 'block';
  if(hmFields)    hmFields.style.display    = on ? ''     : 'none';
  liveSync();
}

function fillSidebar(name){
  liveSync._filling = true;
  const b = bodies[name];
  if(!b){ liveSync._filling = false; return; }
  const d = b.data;
  // Header
  const nameInput = document.getElementById('sbb-name-input');
  nameInput.value = name;
  nameInput.classList.remove('conflict');
  document.getElementById('sbb-type').textContent = b.isCenter ? 'System Center' : '';

  // BASE
  const BD = d.BASE_DATA||{};
  setDistInput('b-radius','b-radius-unit','b-radius-hint', BD.radius ?? 0, 'radius');
  const rds = BD.radiusDifficultyScale||{};
  setVal('b-radius-n', rds.Normal); setVal('b-radius-h', rds.Hard); setVal('b-radius-r', rds.Realistic);
  setGravDisplay(BD.gravity);
  const gds = BD.gravityDifficultyScale||{};
  setVal('b-grav-n', gds.Normal); setVal('b-grav-h', gds.Hard); setVal('b-grav-r', gds.Realistic);
  setVal('b-twh', BD.timewarpHeight);
  setVal('b-vah', BD.velocityArrowsHeight);
  const mc = BD.mapColor||{r:1,g:1,b:1,a:1};
  // HDR: Sun uses r=2,g=2,b=2. Store brightness multiplier separately, normalise to 0-1 for picker.
  const hdrMult = Math.max(1, mc.r, mc.g, mc.b);
  const hdrScale = hdrMult > 1 ? hdrMult : 1;
  setCpick('b-cpick','b-chex','b-cr','b-cg','b-cb',
    mc.r/hdrScale, mc.g/hdrScale, mc.b/hdrScale,
    'b-ca-slider','b-ca-val','b-ca', mc.a||1);
  setVal('b-hdr', hdrScale.toFixed(1));
  // Draw map-color sphere icon (uses clamped 0-1 values for the picker)
  updateBodyIcon(mc.r/hdrScale, mc.g/hdrScale, mc.b/hdrScale, mc.a||1);
  setTog('b-sig', BD.significant); setTog('b-rc', BD.rotateCamera);

  // Achievements
  const AC = d.ACHIEVEMENT_DATA||{};
  setTog('a-landed',AC.Landed); setTog('a-takeoff',AC.Takeoff); setTog('a-atmosphere',AC.Atmosphere);
  setTog('a-orbit',AC.Orbit); setTog('a-crash',AC.Crash);

  // ATMOSPHERE PHYSICS
  const hasAtmos = !!d.ATMOSPHERE_PHYSICS_DATA;
  setTog('ap-has', hasAtmos);
  const APD = d.ATMOSPHERE_PHYSICS_DATA||{};
  setSimpleKm('ap-height',APD.height); setVal('ap-density',APD.density); setVal('ap-curve',APD.curve);
  setVal('ap-chute',APD.parachuteMultiplier); setVal('ap-upper',APD.upperAtmosphere);
  setVal('ap-shock',APD.shockwaveIntensity); setVal('ap-mhvm',APD.minHeatingVelocityMultiplier);
  toggleAtmos();

  // ATMO VISUALS
  const hasAtmoVisuals = !!d.ATMOSPHERE_VISUALS_DATA;
  setTog('av-has', hasAtmoVisuals);
  const AVD = d.ATMOSPHERE_VISUALS_DATA||{};
  const GR = AVD.GRADIENT||{}; setVal('av-pz',GR.positionZ); setSimpleKm('av-height',GR.height);
  setSelectVal('av-tex', GR.texture);
  toggleAtmoSection('av-fields','av-has');

  // CLOUDS (sub-section of ATMO_VISUALS)
  const hasClouds = !!(AVD.CLOUDS && AVD.CLOUDS.texture && AVD.CLOUDS.texture !== 'None');
  setTog('cl-has', hasClouds);
  const CL = AVD.CLOUDS||{}; setSelectVal('cl-tex',CL.texture); setSimpleKm('cl-sh',CL.startHeight);
  setSimpleKm('cl-w',CL.width); setSimpleKm('cl-h',CL.height); setSlider('cl-a', CL.alpha, 0, 1); setCloudVelDisplay(CL.velocity || 0);
  initSlider('cl-a',0,1);
  toggleAtmoSection('cl-fields','cl-has');

  // FRONT CLOUDS
  const FC = d.FRONT_CLOUDS_DATA||{};
  const hasFrontClouds = !!d.FRONT_CLOUDS_DATA;
  setTog('fc-has', hasFrontClouds);
  setSelectVal('fc-tex',FC.cloudsTexture); setSlider('fc-cut', FC.cloudTextureCutout, -1, 1);
  initSlider('fc-cut',-1,1);
  setSimpleKm('fc-fzh',FC.fadeZoneHeight); setSimpleKm('fc-h',FC.height); setVal('fc-pz',FC.positionZ);
  setTog('fc-sa',FC.sharpenAlpha);
  toggleAtmoSection('fc-fields','fc-has');

  // FOG
  const fogKeys = (AVD.FOG||{}).keys||[];
  const hasFog = fogKeys.length > 0;
  setTog('fog-has', hasFog);
  buildFogKeys(fogKeys);
  toggleAtmoSection('fog-fields','fog-has');

  // TERRAIN
  const hasTerrain = !!d.TERRAIN_DATA;
  setTog('ter-has', hasTerrain);
  const TD = d.TERRAIN_DATA||{};
  const TTD = TD.TERRAIN_TEXTURE_DATA||{};
  setSelectVal('tt-pt',TTD.planetTexture); setSlider('tt-cut', TTD.planetTextureCutout, -1, 1);
  initSlider('tt-cut',-1,1);
  setSlider('tt-rot', TTD.planetTextureRotation, -360, 360); setTog('tt-nd', !TTD.planetTextureDontDistort);
  initSlider('tt-rot',-360,360);
  setSelectVal('tt-sa',TTD.surfaceTexture_A);
  const sa=TTD.surfaceTextureSize_A||{}; setVal('tt-sax',sa.x); setVal('tt-say',sa.y);
  setVal('tt-lod-a', TTD.surfaceLOD_A != null && TTD.surfaceLOD_A >= 0 ? TTD.surfaceLOD_A : '');
  setSelectVal('tt-sb',TTD.surfaceTexture_B);
  const sb=TTD.surfaceTextureSize_B||{}; setVal('tt-sbx',sb.x); setVal('tt-sby',sb.y);
  setVal('tt-lod-b', TTD.surfaceLOD_B != null && TTD.surfaceLOD_B >= 0 ? TTD.surfaceLOD_B : '');
  setSelectVal('tt-tc',TTD.terrainTexture_C);
  const tc=TTD.terrainTextureSize_C||{}; setVal('tt-tcx',tc.x); setVal('tt-tcy',tc.y);
  setVal('tt-lod-c', TTD.surfaceLOD_C != null && TTD.surfaceLOD_C >= 0 ? TTD.surfaceLOD_C : '');
  setVal('tt-sls',TTD.surfaceLayerSize); setSlider('tt-mif', TTD.minFade, 0, 1); setSlider('tt-maf', TTD.maxFade, 0, 1);
  initSlider('tt-mif',0,1);
  initSlider('tt-maf',0,1);
  setVal('tt-si',TTD.shadowIntensity); setVal('tt-sh',TTD.shadowHeight);

  const tfd = TD.terrainFormulaDifficulties||{};
  document.getElementById('tf-normal').value = (tfd.Normal||[]).join('\n');
  document.getElementById('tf-hard').value = (tfd.Hard||[]).join('\n');
  document.getElementById('tf-realistic').value = (tfd.Realistic||[]).join('\n');
  // textureFormula in MISC tab
  document.getElementById('tf-texture').value = (TD.textureFormula||[]).join('\n');
  setVal('ter-vs',TD.verticeSize); setTog('ter-col',TD.collider!==false);
  // Flat zones in MISC tab
  buildFlatZones(TD.flatZones||[]);

  const RK = TD.rocks||{};
  setSelectVal('rk-type',RK.rockType||'None'); setVal('rk-den',RK.rockDensity);
  setSlider('rk-min', RK.minSize, 0, 10); setSlider('rk-max', RK.maxSize, 0, 10);
  initSlider('rk-min',0,10);
  initSlider('rk-max',0,10);
  setVal('rk-pc',RK.powerCurve); setSlider('rk-ma', RK.maxAngle, 0, 90);
  initSlider('rk-ma',0,90);
  // Apply terrain toggle state (locks/unlocks terrain-fields + heightmap tab)
  toggleTerrain();
  // Sync the visual heightmap UI from the just-filled textareas
  setTimeout(hmSyncFromTextareas, 0);

  // RINGS
  const hasRings = !!d.RINGS_DATA;
  setTog('rng-has',hasRings);
  const RNG = d.RINGS_DATA||{};
  setSelectVal('rng-tex',RNG.ringsTexture);
  setDistInput('rng-sr','rng-sr-unit','rng-sr-hint', RNG.startRadius ?? 0, 'radius');
  setDistInput('rng-er','rng-er-unit','rng-er-hint', RNG.endRadius   ?? 0, 'radius');
  setVal('rng-pz',RNG.positionZ);
  const rmc = RNG.mapColor||{r:0.85,g:0.75,b:0.65,a:0.2};
  setCpick('rng-map-pick','rng-map-hex','rng-map-r','rng-map-g','rng-map-b',rmc.r,rmc.g,rmc.b,'rng-map-a-s','rng-map-a-v','rng-map-a',rmc.a);
  toggleRings();

  // WATER
  const hasWater = !!d.WATER_DATA;
  setTog('wt-has',hasWater);
  const WT = d.WATER_DATA||{};
  setSelectVal('wt-tex',WT.oceanMaskTexture); setTog('wt-lt',WT.lowerTerrain);
  setSimpleKm('wt-dep',WT.oceanDepth); setSlider('wt-so', WT.opacity_Surface, 0, 1); setSlider('wt-fo', WT.opacity_Far, 0, 1);
  initSlider('wt-so',0,1);
  initSlider('wt-fo',0,1);
  // Water colours
  const ws=WT.sand||{r:.9,g:.86,b:.81,a:1};
  setCpick('wt-sand-pick','wt-sand-hex','wt-sand-r','wt-sand-g','wt-sand-b',ws.r,ws.g,ws.b,'wt-sand-a-s','wt-sand-a-v','wt-sand-a',ws.a);
  const wsh=WT.shallow||{r:.1,g:.68,b:1,a:.4};
  setCpick('wt-shal-pick','wt-shal-hex','wt-shal-r','wt-shal-g','wt-shal-b',wsh.r,wsh.g,wsh.b,'wt-shal-a-s','wt-shal-a-v','wt-shal-a',wsh.a);
  const wd2=WT.deep||{r:.1,g:.15,b:.55,a:1};
  setCpick('wt-deep-pick','wt-deep-hex','wt-deep-r','wt-deep-g','wt-deep-b',wd2.r,wd2.g,wd2.b,'wt-deep-a-s','wt-deep-a-v','wt-deep-a',wd2.a);
  const wfl=WT.floor||{r:.25,g:.25,b:.25,a:1};
  setCpick('wt-floor-pick','wt-floor-hex','wt-floor-r','wt-floor-g','wt-floor-b',wfl.r,wfl.g,wfl.b,'wt-floor-a-s','wt-floor-a-v','wt-floor-a',wfl.a);
  // Map color
  const wmc=WT.mapColor||{r:wsh.r,g:wsh.g,b:wsh.b,a:.4};
  setCpick('wt-map-pick','wt-map-hex','wt-map-r','wt-map-g','wt-map-b',wmc.r,wmc.g,wmc.b,'wt-map-a-s','wt-map-a-v','wt-map-a',wmc.a);
  // Opacity / visibility
  setSlider('wt-fd', WT.opacity_FullDarkness??0.95, 0, 1); initSlider('wt-fd',0,1);
  setSimpleKm('wt-svd', WT.surfaceVisibilityDistance??1200);
  setSimpleKm('wt-fdd', WT.fullDarknessDepth??500);
  setSimpleKm('wt-fdvd', WT.fullDarknessVisibilityDistance??300);
  // Mask gradient — Water
  const mgw=WT.maskGradient_Water||{must:1000,cannot:700,global:2000};
  setVal('wt-mgw-must', mgw.must); setVal('wt-mgw-can', mgw.cannot); setVal('wt-mgw-glob', mgw.global);
  setVal('wt-wgwm', WT.waterGradientWidthMultiplier??0.5);
  // Mask gradient — Terrain
  const mgt=WT.maskGradient_Terrain||{must:25,cannot:25,global:50};
  setVal('wt-mgt-must', mgt.must); setVal('wt-mgt-can', mgt.cannot); setVal('wt-mgt-glob', mgt.global);
  setVal('wt-sgwm', WT.sandGradientWidthMultiplier??2.0);
  setVal('wt-fgwm', WT.floorGradientWidthMultiplier??10.0);
  // Noise & Waves
  const snz=WT.shoreNoiseSize||{x:3000,y:1000};
  setVal('wt-snx', snz.x); setVal('wt-sny', snz.y);
  const sndz=WT.sandNoiseSize||{x:500,y:100};
  setVal('wt-dnx', sndz.x); setVal('wt-dny', sndz.y);
  const wvz=WT.wavesSize||{x:16,y:0.3};
  setVal('wt-wvx', wvz.x); setVal('wt-wvy', wvz.y);
  toggleWater();

  // ORBIT
  const hasOrbit = !!d.ORBIT_DATA;
  const isCenter = b.isCenter;

  // Hide entire orbit tab button for center body; show for others
  const orbitTabBtn = document.querySelector('.sbt[onclick*="orbit"]');
  if(orbitTabBtn) orbitTabBtn.style.display = isCenter ? 'none' : '';

  // For non-center bodies, orbit is mandatory — show the lock hint, disable the toggle
  const orHasEl   = document.getElementById('or-has');
  const orLockedHint = document.getElementById('or-locked-hint');
  if(!isCenter){
    setTog('or-has', true);          // always on
    if(orHasEl){ orHasEl.style.opacity='0.4'; orHasEl.style.cursor='not-allowed'; }
    if(orLockedHint) orLockedHint.style.display = 'block';
  } else {
    setTog('or-has', hasOrbit);
    if(orHasEl){ orHasEl.style.opacity=''; orHasEl.style.cursor=''; }
    if(orLockedHint) orLockedHint.style.display = 'none';
  }

  const OR = d.ORBIT_DATA||{};
  setVal('or-par',OR.parent);
  setDistInput('or-sma','or-sma-unit','or-sma-hint', OR.semiMajorAxis ?? 0, 'sma');
  const sds=OR.smaDifficultyScale||{}; setVal('or-sn',sds.Normal); setVal('or-sh',sds.Hard); setVal('or-sr',sds.Realistic);
  setSlider('or-ecc', OR.eccentricity, 0, 0.999); setSlider('or-aop', OR.argumentOfPeriapsis, -360, 360);
  initSlider('or-ecc',0,0.999);
  initSlider('or-aop',-360,360);
  setSelectVal('or-dir', String(OR.direction ?? 1));  // ?? not || so 0 is preserved
  setVal('or-soi',OR.multiplierSOI);
  const ssds=OR.soiDifficultyScale||{}; setVal('or-soin',ssds.Normal); setVal('or-soih',ssds.Hard); setVal('or-soir',ssds.Realistic);
  updateSOIDisplay();
  toggleOrbit();

  // POST PROCESSING
  buildPPKeys(((d.POST_PROCESSING||{}).keys)||[]);

  // LANDMARKS
  buildLandmarks(d.LANDMARKS||[]);

  liveSync._filling = false;
}

// ── FOG KEYS ──
function buildFogKeys(keys){
  const el = document.getElementById('fog-keys-list'); el.innerHTML='';
  keys.forEach((k,i)=>{
    el.appendChild(makeFogKey(k,i));
  });
}
function makeFogKey(k,i){
  const col = k.color||{r:0,g:0,b:0,a:0};
  const hex = rgbToHex(col.r, col.g, col.b);
  const alpha = (col.a||0).toFixed(2);
  const d=document.createElement('div'); d.className='pp-key'; d.id='fk-'+i;
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">FOG KEY ${i+1}</span><button class="pp-key-del" onclick="delFogKey(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Distance</span><input class="finput" id="fk-${i}-d" type="number" step="100" value="${k.distance||0}" oninput="liveSync()"></div>
  <div class="cpick-wrap"><span class="flabel">Color</span>
    <input type="color" class="cpick-swatch" id="fk-${i}-pick" value="${hex}" oninput="onCpick('fk-${i}-pick','fk-${i}-hex','fk-${i}-r','fk-${i}-g','fk-${i}-b');liveSync()">
    <input type="text" class="cpick-hex" id="fk-${i}-hex" value="${hex}" maxlength="7" oninput="onChex('fk-${i}-hex','fk-${i}-pick','fk-${i}-r','fk-${i}-g','fk-${i}-b');liveSync()">
  </div>
  <div class="cpick-alpha-row"><span class="cpick-alpha-label">A</span>
    <input type="range" class="cpick-alpha" id="fk-${i}-a-s" min="0" max="1" step="0.01" value="${alpha}" oninput="document.getElementById('fk-${i}-a-v').textContent=parseFloat(this.value).toFixed(2);document.getElementById('fk-${i}-a').value=this.value;liveSync()">
    <span class="cpick-alpha-val" id="fk-${i}-a-v">${alpha}</span>
  </div>
  <input type="hidden" id="fk-${i}-r" value="${col.r||0}">
  <input type="hidden" id="fk-${i}-g" value="${col.g||0}">
  <input type="hidden" id="fk-${i}-b" value="${col.b||0}">
  <input type="hidden" id="fk-${i}-a" value="${col.a||0}">`;
  return d;
}
function addFogKey(){ const l=document.getElementById('fog-keys-list'); const i=l.children.length; l.appendChild(makeFogKey({distance:0,color:{r:0,g:0,b:0,a:0}},i)); liveSync(); }
function delFogKey(i){ document.getElementById('fk-'+i)?.remove(); liveSync(); }

// ── PP KEYS ──
function buildPPKeys(keys){
  const el=document.getElementById('pp-keys-list'); el.innerHTML='';
  keys.forEach((k,i)=>el.appendChild(makePPKey(k,i)));
}
function makePPKey(k,i){
  const hex = rgbToHex(k.red||1, k.green||1, k.blue||1);
  const d=document.createElement('div'); d.className='pp-key'; d.id='ppk-'+i;
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">KEY ${i+1}</span><button class="pp-key-del" onclick="delPPKey(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Height</span><input class="finput" id="ppk-${i}-h" type="number" step="100" value="${k.height||0}"></div>
  <div class="frow"><span class="flabel">Shadow Intens.</span><input class="finput" id="ppk-${i}-si" type="number" step="0.05" value="${k.shadowIntensity||1}"></div>
  <div class="frow"><span class="flabel">Star Intens.</span><input class="finput" id="ppk-${i}-sti" type="number" step="0.1" value="${k.starIntensity||0}"></div>
  <div class="frow"><span class="flabel">Hue Shift</span><input class="finput" id="ppk-${i}-hs" type="number" step="0.1" value="${k.hueShift||0}"></div>
  <div class="frow"><span class="flabel">Saturation</span><input class="finput" id="ppk-${i}-sat" type="number" step="0.01" value="${k.saturation||1}"></div>
  <div class="frow"><span class="flabel">Contrast</span><input class="finput" id="ppk-${i}-con" type="number" step="0.01" value="${k.contrast||1}"></div>
  <div class="cpick-wrap"><span class="flabel">RGB Tint</span>
    <input type="color" class="cpick-swatch" id="ppk-${i}-pick" value="${hex}"
      oninput="onCpick('ppk-${i}-pick','ppk-${i}-hex','ppk-${i}-r','ppk-${i}-g','ppk-${i}-b');liveSync()">
    <input type="text" class="cpick-hex" id="ppk-${i}-hex" value="${hex}" maxlength="7"
      oninput="onChex('ppk-${i}-hex','ppk-${i}-pick','ppk-${i}-r','ppk-${i}-g','ppk-${i}-b');liveSync()">
  </div>
  <input type="hidden" id="ppk-${i}-r" value="${(k.red||1).toFixed(4)}">
  <input type="hidden" id="ppk-${i}-g" value="${(k.green||1).toFixed(4)}">
  <input type="hidden" id="ppk-${i}-b" value="${(k.blue||1).toFixed(4)}">`;
  return d;
}
function addPPKey(){ const l=document.getElementById('pp-keys-list'); const i=l.children.length; l.appendChild(makePPKey({height:0,shadowIntensity:1.75,starIntensity:0,hueShift:0,saturation:0.95,contrast:1.2,red:1,green:1,blue:1},i)); }
function delPPKey(i){ document.getElementById('ppk-'+i)?.remove(); }

// ── LANDMARKS ──
function buildLandmarks(lms){
  const el=document.getElementById('lm-list'); el.innerHTML='';
  lms.forEach((l,i)=>el.appendChild(makeLandmark(l,i)));
}
function makeLandmark(l,i){
  const d=document.createElement('div'); d.className='lm-item'; d.id='lm-'+i;
  const sa = l.startAngle||0, ea = l.endAngle||0;
  // Slider + synced number input for precision entry.
  // The number input accepts any value in [-360,360] typed directly; slider stays in sync.
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">LANDMARK ${i+1}</span><button class="lm-del" onclick="delLandmark(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Name</span><input class="finput" id="lm-${i}-n" type="text" value="${l.name||''}" onblur="liveSync()"></div>
  <div class="frow" style="flex-direction:column;gap:4px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="flabel">Start Angle</span>
      <input type="number" id="lm-${i}-s-num" value="${sa}" min="-360" max="360" step="0.5"
        style="width:64px;font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--sky2);background:var(--bg2);border:1px solid var(--ink5);border-radius:3px;padding:1px 4px;text-align:right"
        oninput="const v=parseFloat(this.value)||0;const sl=document.getElementById('lm-${i}-s');if(sl){sl.value=Math.max(-360,Math.min(360,v));}liveSync()">
    </div>
    <input type="range" class="finput" id="lm-${i}-s" min="-360" max="360" step="0.5" value="${sa}" style="padding:0;height:6px;cursor:pointer"
      oninput="const num=document.getElementById('lm-${i}-s-num');if(num)num.value=parseFloat(this.value).toFixed(1);liveSync()">
  </div>
  <div class="frow" style="flex-direction:column;gap:4px">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="flabel">End Angle</span>
      <input type="number" id="lm-${i}-e-num" value="${ea}" min="-360" max="360" step="0.5"
        style="width:64px;font-family:'JetBrains Mono',monospace;font-size:.68rem;color:var(--sky2);background:var(--bg2);border:1px solid var(--ink5);border-radius:3px;padding:1px 4px;text-align:right"
        oninput="const v=parseFloat(this.value)||0;const sl=document.getElementById('lm-${i}-e');if(sl){sl.value=Math.max(-360,Math.min(360,v));}liveSync()">
    </div>
    <input type="range" class="finput" id="lm-${i}-e" min="-360" max="360" step="0.5" value="${ea}" style="padding:0;height:6px;cursor:pointer"
      oninput="const num=document.getElementById('lm-${i}-e-num');if(num)num.value=parseFloat(this.value).toFixed(1);liveSync()">
  </div>`;
  return d;
}
function addLandmark(){ const l=document.getElementById('lm-list'); const i=l.children.length; l.appendChild(makeLandmark({name:'',startAngle:-5,endAngle:5},i)); }
function delLandmark(i){ document.getElementById('lm-'+i)?.remove(); }

// Auto-save: any text/number input in the sidebar triggers liveSync on blur
// ── Colour picker helpers ──
// All SFS colours are stored as 0–1 floats. The picker works in hex (#rrggbb)
// and writes back to hidden float inputs (0–1).

function rgbToHex(r, g, b){
  const clamp = v => Math.max(0, Math.min(1, v));
  const toH = v => Math.round(clamp(v) * 255).toString(16).padStart(2,'0');
  return '#' + toH(r) + toH(g) + toH(b);
}
function hexToRgb01(hex){
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  if(hex.length !== 6) return null;
  const n = parseInt(hex, 16);
  if(isNaN(n)) return null;
  return { r: ((n>>16)&0xff)/255, g: ((n>>8)&0xff)/255, b: (n&0xff)/255 };
}
// Called when the native colour swatch changes → update hex text + hidden floats
function onCpick(pickId, hexId, rId, gId, bId){
  const hex = document.getElementById(pickId).value;
  document.getElementById(hexId).value = hex;
  const rgb = hexToRgb01(hex);
  if(rgb){
    document.getElementById(rId).value = rgb.r.toFixed(4);
    document.getElementById(gId).value = rgb.g.toFixed(4);
    document.getElementById(bId).value = rgb.b.toFixed(4);
  }
  // Update alpha slider gradient
  const slider = document.getElementById(hexId.replace('-hex','-a-s')) ||
                 document.getElementById(pickId.replace('-pick','-a-s'));
  if(slider) slider.style.setProperty('--swatch-color', hex);
  liveSync();
}
// Called when hex text changes → update swatch + hidden floats
function onChex(hexId, pickId, rId, gId, bId){
  let hex = document.getElementById(hexId).value.trim();
  if(!hex.startsWith('#')) hex = '#'+hex;
  const rgb = hexToRgb01(hex);
  if(rgb){
    document.getElementById(pickId).value = hex;
    document.getElementById(rId).value = rgb.r.toFixed(4);
    document.getElementById(gId).value = rgb.g.toFixed(4);
    document.getElementById(bId).value = rgb.b.toFixed(4);
  }
  liveSync();
}
// Set a colour picker group from 0–1 float values
function setCpick(pickId, hexId, rId, gId, bId, r, g, b, aSlider, aVal, aHid, a){
  const hex = rgbToHex(r||0, g||0, b||0);
  const el = id => document.getElementById(id);
  const aVal2 = (a == null) ? 1 : a;  // null/undefined → 1, but preserve 0
  if(el(pickId)) el(pickId).value = hex;
  if(el(hexId))  el(hexId).value  = hex;
  if(el(rId))    el(rId).value    = (r||0).toFixed(4);
  if(el(gId))    el(gId).value    = (g||0).toFixed(4);
  if(el(bId))    el(bId).value    = (b||0).toFixed(4);
  if(aSlider && el(aSlider)){ el(aSlider).value = aVal2; el(aSlider).style.setProperty('--swatch-color', hex); }
  if(aVal    && el(aVal))    el(aVal).textContent  = aVal2.toFixed(2);
  if(aHid    && el(aHid))    el(aHid).value        = aVal2.toFixed(4);
}
// Read a colour picker group → returns {r,g,b,a} in 0–1 floats, with HDR multiplier applied
function getCpick(rId, gId, bId, aHid, hdrId){
  const fv = id => { const el=document.getElementById(id); if(!el) return 0; const v=parseFloat(el.value); return isNaN(v)?0:v; };
  const fa = id => { const el=document.getElementById(id); if(!el||el.value==='') return 1; const v=parseFloat(el.value); return isNaN(v)?1:v; };
  const hdr = hdrId ? (parseFloat(document.getElementById(hdrId)?.value)||1) : 1;
  return { r: fv(rId)*hdr, g: fv(gId)*hdr, b: fv(bId)*hdr, a: fa(aHid||'_none') };
}

// ── Universal live-sync ──
// Every input/change in the sidebar instantly writes back to bodies[selectedBody].data
// and redraws. "Apply Changes" is now just a save-confirmation, not the only sync point.

function liveSync(){
  if(liveSync._filling) return;
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;

  // Debounced undo: snapshot pre-edit state once, push after 800ms quiet
  if(!liveSync._undoPending){
    liveSync._undoPending = true;
    liveSync._preEditSnapshot = JSON.stringify(bodies);
    setTimeout(()=>{
      const after = JSON.stringify(bodies);
      if(liveSync._preEditSnapshot !== after){
        undoStack.push(liveSync._preEditSnapshot);
        if(undoStack.length > MAX_UNDO) undoStack.shift();
        document.getElementById('undo-btn').disabled = false;
        document.getElementById('undo-btn').classList.add('undo-active');
      }
      liveSync._undoPending = false;
      liveSync._preEditSnapshot = null;
    }, 800);
  }

  // Throttle: run the full sync + redraw at most once per animation frame.
  // On weak mobile, oninput fires faster than the canvas can redraw —
  // without this every keystroke queues a synchronous full render.
  if(liveSync._rafPending) return;
  liveSync._rafPending = true;
  requestAnimationFrame(() => {
    liveSync._rafPending = false;
    _liveSyncNow();
  });
}

function _liveSyncNow(){
  if(liveSync._filling) return;
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;
  const d = b.data;

  // Only invalidate terrain cache when a terrain-relevant field triggered the sync.
  // Invalidating on every keystroke (e.g. body name, map color) forces expensive
  // heightmap re-evaluation each frame on weak devices.
  if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache(selectedBody);

  // BASE DATA
  d.BASE_DATA = d.BASE_DATA || {};
  d.BASE_DATA.radius              = getDistMetres('b-radius') || d.BASE_DATA.radius;
  d.BASE_DATA.radiusDifficultyScale = buildDiffScale('b-radius-n','b-radius-h','b-radius-r');
  d.BASE_DATA.gravity             = getGravMs2() || d.BASE_DATA.gravity;
  d.BASE_DATA.gravityDifficultyScale = buildDiffScale('b-grav-n','b-grav-h','b-grav-r');
  d.BASE_DATA.timewarpHeight      = parseFloat(val('b-twh'))    || d.BASE_DATA.timewarpHeight;
  d.BASE_DATA.velocityArrowsHeight= parseFloat(val('b-vah'));
  d.BASE_DATA.mapColor = getCpick('b-cr','b-cg','b-cb','b-ca','b-hdr');
  // Keep sphere icon in sync with map color (picker values are already 0-1 clamped)
  { const _mc = d.BASE_DATA.mapColor;
    updateBodyIcon(_mc.r, _mc.g, _mc.b, _mc.a); }
  d.BASE_DATA.significant         = tog('b-sig');
  d.BASE_DATA.rotateCamera        = tog('b-rc');

  // ACHIEVEMENTS
  d.ACHIEVEMENT_DATA = { Landed:tog('a-landed'), Takeoff:tog('a-takeoff'), Atmosphere:tog('a-atmosphere'), Orbit:tog('a-orbit'), Crash:tog('a-crash') };

  // ATMOSPHERE PHYSICS
  if(tog('ap-has')){
    // Preserve fields with no UI controls so edits don't wipe per-body difficulty scales
    const _apPrev = d.ATMOSPHERE_PHYSICS_DATA || {};
    d.ATMOSPHERE_PHYSICS_DATA = {
      height: getSimpleKmMetres('ap-height'), density: parseFloat(val('ap-density'))||0,
      curve: parseFloat(val('ap-curve'))||0, curveScale: _apPrev.curveScale || {},
      parachuteMultiplier: parseFloat(val('ap-chute'))||1,
      upperAtmosphere: parseFloat(val('ap-upper'))||0,
      heightDifficultyScale: _apPrev.heightDifficultyScale || {},
      shockwaveIntensity: parseFloat(val('ap-shock'))||0,
      minHeatingVelocityMultiplier: parseFloat(val('ap-mhvm'))||1
    };
  } else delete d.ATMOSPHERE_PHYSICS_DATA;

  // ATMO VISUALS
  if(tog('av-has')){
    const cloudsObj = tog('cl-has')
      ? { texture:val('cl-tex'), startHeight:getSimpleKmMetres('cl-sh'), width:getSimpleKmMetres('cl-w'), height:getSimpleKmMetres('cl-h'), alpha:parseFloat(val('cl-a'))||0, velocity:parseFloat(val('cl-v'))||0 }
      : { texture:'None', startHeight:0, width:0, height:0, alpha:0, velocity:0 };
    const fogObj = tog('fog-has')
      ? { keys: collectFogKeys() }
      : { keys: [] };
    // Preserve heightDifficultyScale on GRADIENT — it has no UI control
    const _gradPrev = d.ATMOSPHERE_VISUALS_DATA?.GRADIENT || {};
    d.ATMOSPHERE_VISUALS_DATA = {
      GRADIENT: { positionZ:parseInt(val('av-pz'))||0, height:getSimpleKmMetres('av-height'), heightDifficultyScale: _gradPrev.heightDifficultyScale || {}, texture:val('av-tex') },
      CLOUDS: cloudsObj,
      FOG: fogObj
    };
  } else delete d.ATMOSPHERE_VISUALS_DATA;

  // FRONT CLOUDS
  if(tog('fc-has')){
    const fctex = val('fc-tex');
    d.FRONT_CLOUDS_DATA = { cloudsTexture:fctex||'None', cloudTextureCutout:parseFloat(val('fc-cut'))||1, fadeZoneHeight:getSimpleKmMetres('fc-fzh'), height:getSimpleKmMetres('fc-h'), positionZ:parseFloat(val('fc-pz'))||0, sharpenAlpha:tog('fc-sa') };
  } else delete d.FRONT_CLOUDS_DATA;

  // TERRAIN — respect the "Has Terrain Data" toggle
  if(tog('ter-has'))
  {
    const ptex = val('tt-pt');
    const tfd = {};
    const tn = document.getElementById('tf-normal').value.trim();
    const th = document.getElementById('tf-hard').value.trim();
    const tr = document.getElementById('tf-realistic').value.trim();
    if(tn) tfd.Normal   = tn.split('\n').map(s=>s.trim()).filter(Boolean);
    if(th) tfd.Hard     = th.split('\n').map(s=>s.trim()).filter(Boolean);
    if(tr) tfd.Realistic= tr.split('\n').map(s=>s.trim()).filter(Boolean);
    d.TERRAIN_DATA = {
      TERRAIN_TEXTURE_DATA: {
        planetTexture: ptex || 'None',
        planetTextureCutout:_fv(val('tt-cut'),-1),
        planetTextureRotation:parseFloat(val('tt-rot'))||0, planetTextureDontDistort:!tog('tt-nd'),
        surfaceTexture_A:val('tt-sa'), surfaceTextureSize_A:{x:_fv(val('tt-sax'),-1), y:_fv(val('tt-say'),-1)},
        surfaceLOD_A: _fv(val('tt-lod-a'), -1),
        surfaceTexture_B:val('tt-sb'), surfaceTextureSize_B:{x:_fv(val('tt-sbx'),-1), y:_fv(val('tt-sby'),-1)},
        surfaceLOD_B: _fv(val('tt-lod-b'), -1),
        terrainTexture_C:val('tt-tc'), terrainTextureSize_C:{x:_fv(val('tt-tcx'),-1), y:_fv(val('tt-tcy'),-1)},
        surfaceLOD_C: _fv(val('tt-lod-c'), -1),
        surfaceLayerSize:_fv(val('tt-sls'),-1), minFade:_fv(val('tt-mif'),-1),
        maxFade:_fv(val('tt-maf'),-1), shadowIntensity:_fv(val('tt-si'),-1), shadowHeight:_fv(val('tt-sh'),-1)
      },
      terrainFormulaDifficulties: tfd,
      textureFormula: document.getElementById('tf-texture').value.trim()
        ? document.getElementById('tf-texture').value.trim().split('\n').map(s=>s.trim()).filter(Boolean)
        : [],
      verticeSize:parseFloat(val('ter-vs'))||2,
      collider:tog('ter-col'),
      flatZones: collectFlatZones(),
      flatZonesDifficulties: (bodies[selectedBody]?.data?.TERRAIN_DATA?.flatZonesDifficulties) || {}
    };
    const rktype = val('rk-type');
    if(rktype && rktype !== 'None'){
      d.TERRAIN_DATA.rocks = { rockType:rktype, rockDensity:parseFloat(val('rk-den'))||0.5, minSize:parseFloat(val('rk-min'))||0.2, maxSize:parseFloat(val('rk-max'))||0.8, powerCurve:parseFloat(val('rk-pc'))||2, maxAngle:parseFloat(val('rk-ma'))||25 };
    }
    // Invalidate cloud/water/atmo caches when texture changes
    if(drawViewport._cloudCache) drawViewport._cloudCache = {};
    if(drawViewport._waterCache) drawViewport._waterCache = {};
    if(drawViewport._atmoStopCache) drawViewport._atmoStopCache = {};
    if(drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
    if(drawViewport._atmoSrcCache) drawViewport._atmoSrcCache = {};
    if(drawViewport._fcCache) drawViewport._fcCache = {};
    if(drawViewport._fogCache) drawViewport._fogCache = {};
  } else {
    delete d.TERRAIN_DATA;
    // Flush surface caches when terrain is removed
    if(drawViewport._cloudCache) drawViewport._cloudCache = {};
    if(drawViewport._waterCache) drawViewport._waterCache = {};
    if(drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
  }

  // RINGS
  if(tog('rng-has')){
    const rngMap = getCpick('rng-map-r','rng-map-g','rng-map-b','rng-map-a');
    d.RINGS_DATA = { ringsTexture:val('rng-tex'), startRadius:getDistMetres('rng-sr'), endRadius:getDistMetres('rng-er'), positionZ:parseFloat(val('rng-pz'))||0, mapColor:{r:rngMap.r,g:rngMap.g,b:rngMap.b,a:rngMap.a} };
    // Rings visually affect body size on canvas
    b.hasRings = true;
    b.ringsInner = getDistMetres('rng-sr');
    b.ringsOuter = getDistMetres('rng-er');
  } else {
    delete d.RINGS_DATA;
    b.hasRings = false;
  }

  // WATER
  if(tog('wt-has')){
    const wSand  = getCpick('wt-sand-r','wt-sand-g','wt-sand-b','wt-sand-a');
    const wShal  = getCpick('wt-shal-r','wt-shal-g','wt-shal-b','wt-shal-a');
    const wDeep  = getCpick('wt-deep-r','wt-deep-g','wt-deep-b','wt-deep-a');
    const wFloor = getCpick('wt-floor-r','wt-floor-g','wt-floor-b','wt-floor-a');
    const wMap   = getCpick('wt-map-r','wt-map-g','wt-map-b','wt-map-a');
    d.WATER_DATA = {
      oceanMaskTexture: val('wt-tex'),
      lowerTerrain: tog('wt-lt'),
      oceanDepth: getSimpleKmMetres('wt-dep')||5000,
      sand:    { r:wSand.r,  g:wSand.g,  b:wSand.b,  a:wSand.a  },
      floor:   { r:wFloor.r, g:wFloor.g, b:wFloor.b, a:wFloor.a },
      shallow: { r:wShal.r,  g:wShal.g,  b:wShal.b,  a:wShal.a  },
      deep:    { r:wDeep.r,  g:wDeep.g,  b:wDeep.b,  a:wDeep.a  },
      maskGradient_Water:  { must:parseFloat(val('wt-mgw-must'))||1000, cannot:parseFloat(val('wt-mgw-can'))||700,  global:parseFloat(val('wt-mgw-glob'))||2000 },
      waterGradientWidthMultiplier: parseFloat(val('wt-wgwm'))||0.5,
      maskGradient_Terrain: { must:parseFloat(val('wt-mgt-must'))||25, cannot:parseFloat(val('wt-mgt-can'))||25, global:parseFloat(val('wt-mgt-glob'))||50 },
      sandGradientWidthMultiplier:  parseFloat(val('wt-sgwm'))||2.0,
      floorGradientWidthMultiplier: parseFloat(val('wt-fgwm'))||10.0,
      shoreNoiseSize: { x:parseFloat(val('wt-snx'))||3000, y:parseFloat(val('wt-sny'))||1000 },
      sandNoiseSize:  { x:parseFloat(val('wt-dnx'))||500,  y:parseFloat(val('wt-dny'))||100  },
      wavesSize:      { x:parseFloat(val('wt-wvx'))||16,   y:parseFloat(val('wt-wvy'))||0.3  },
      opacity_Surface: parseFloat(val('wt-so'))||0.8,
      opacity_Far: parseFloat(val('wt-fo'))||1,
      opacity_FullDarkness: parseFloat(val('wt-fd'))??0.95,
      surfaceVisibilityDistance: getSimpleKmMetres('wt-svd')||1200,
      fullDarknessDepth: getSimpleKmMetres('wt-fdd')||500,
      fullDarknessVisibilityDistance: getSimpleKmMetres('wt-fdvd')||300,
      mapColor: { r:wMap.r, g:wMap.g, b:wMap.b, a:wMap.a }
    };
  } else delete d.WATER_DATA;
  // Invalidate the water colour canvas cache so changes render immediately
  if(drawViewport._waterCache) drawViewport._waterCache = {};
  if(drawViewport._cloudCache) drawViewport._cloudCache = {};
  if(drawViewport._fcCache) drawViewport._fcCache = {};
  if(drawViewport._fogCache) drawViewport._fogCache = {};

  // ORBIT — the most critical for visual update
  // Non-center bodies always have orbit (it's mandatory)
  const _orbitAllowed = tog('or-has') || !b.isCenter;
  if(_orbitAllowed){
    const dirRaw = document.getElementById('or-dir').value;
    d.ORBIT_DATA = {
      parent:             val('or-par') || 'Sun',
      semiMajorAxis:      getDistMetres('or-sma'),
      smaDifficultyScale: buildDiffScale('or-sn','or-sh','or-sr'),
      eccentricity:       Math.min(parseFloat(val('or-ecc')) || 0, 0.999),
      argumentOfPeriapsis:parseFloat(val('or-aop')) || 0,
      direction:          parseInt(dirRaw),   // parseInt('0') = 0 correctly
      multiplierSOI:      parseFloat(val('or-soi')) || 2.5,
      soiDifficultyScale: buildDiffScale('or-soin','or-soih','or-soir')
    };
  } else delete d.ORBIT_DATA;

  // POST PROCESSING — only write if keys exist (off by default)
  const _ppKeys = collectPPKeys();
  if(_ppKeys.length) d.POST_PROCESSING = { keys: _ppKeys };
  else delete d.POST_PROCESSING;

  // LANDMARKS
  d.LANDMARKS = collectLandmarks();

  // Update sidebar header to reflect current body state
  document.getElementById('sbb-type').textContent = b.isCenter ? 'System Center' : (d.ORBIT_DATA ? `orbiting ${d.ORBIT_DATA.parent}` : '');

  // Invalidate cloud canvas cache so any atmosphere/texture change renders immediately
  if(drawViewport._cloudCache) drawViewport._cloudCache = {};

  drawViewport();
}

// Wire liveSync to every input element inside the sidebar body
// Delegated real-time sync: catches all current AND dynamically-added sidebar inputs/selects.
// This fires liveSync on any input or change event bubbling up from the sidebar.
document.getElementById('sidebar').addEventListener('input',  e => {
  // bsearch-input is a search filter, not a body-data field — don't trigger liveSync
  if(e.target.id === 'bsearch-input') return;
  // hm-raw-view: live sync — push raw text into the hidden textarea then refresh
  if(e.target.id === 'hm-raw-view'){
    const lines = e.target.value.split('\n').filter(l => l.trim());
    const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
    const el = document.getElementById(id);
    if(el) el.value = lines.join('\n');
    _hmRenderFormulaList();
    if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    if(typeof drawViewport !== 'undefined'){
      if(drawViewport._surfCache) drawViewport._surfCache = {};
      if(drawViewport._terrCache) drawViewport._terrCache = {};
    }
    if(!liveSync._filling) liveSync();
    return;
  }
  if(!liveSync._filling) liveSync();
});
document.getElementById('sidebar').addEventListener('change', e => {
  if(e.target.id === 'bsearch-input') return;
  if(e.target.id === 'hm-raw-view') return;
  if(!liveSync._filling) liveSync();
});
// Delegated click on all toggles — fires after their own onclick toggles the class
document.getElementById('sidebar').addEventListener('click', e => {
  if(e.target.classList.contains('tog')) setTimeout(liveSync, 0);
});

// ── Body renaming ──
// In SFS the body name IS the filename (Earth → Earth.txt), so renaming is first-class.


// ── Cloud Width auto-generator ────────────────────────────────────────────────
// Formula: 2π × (StartHeight + Radius) / N
function _clWidthCalc(){
  const b      = selectedBody && bodies[selectedBody];
  const radius = getDistMetres('b-radius') || b?.data?.BASE_DATA?.radius || 314970;
  const startH = getSimpleKmMetres('cl-sh') || 0;
  const N      = parseFloat(document.getElementById('cl-w-n')?.value) || 100;
  if(N <= 0) return null;
  return (2 * Math.PI * (startH + radius)) / N;
}

function clWidthAutoSync(){
  const w = _clWidthCalc();
  const preview = document.getElementById('cl-w-preview');
  if(w === null || !isFinite(w)){
    if(preview) preview.textContent = '';
    return;
  }
  const rounded = Math.round(w);
  const input = document.getElementById('cl-w');
  if(input) input.value = rounded;
  if(preview) preview.textContent = `≈ ${rounded.toLocaleString()} m`;
  liveSync();
}

function syncCloudVel(){
  const mode  = document.getElementById('cl-v-mode')?.value || 'ms';
  const raw   = parseFloat(document.getElementById('cl-v-input')?.value) || 0;
  const hint  = document.getElementById('cl-v-hint');
  const hidden= document.getElementById('cl-v');
  // Need planet circumference to convert rot↔m/s
  // Use current body radius + cloud startHeight for inner circumference
  const b = selectedBody && bodies[selectedBody];
  const radius = (b?.data?.BASE_DATA?.radius) || 314970;
  const startH = getSimpleKmMetres('cl-sh') || 0;
  const innerCirc = 2 * Math.PI * (radius + startH); // metres

  let ms = 0; // final value in m/s
  if(mode === 'ms'){
    ms = raw;
  } else if(mode === 'rph'){
    ms = (raw * innerCirc) / 3600;
  } else if(mode === 'rps'){
    ms = raw * innerCirc;
  }
  if(hidden) hidden.value = ms;

  // Show hint with other units
  if(hint && innerCirc > 0 && ms !== 0){
    const rps = ms / innerCirc;
    const rph = rps * 3600;
    const period_s = 1 / Math.abs(rps);
    const period_h = period_s / 3600;
    if(mode === 'ms')
      hint.textContent = `${rph.toExponential(2)} rot/hr  ·  1 rot = ${period_h.toFixed(1)}h`;
    else if(mode === 'rph')
      hint.textContent = `${ms.toExponential(2)} m/s  ·  1 rot = ${period_h.toFixed(1)}h`;
    else
      hint.textContent = `${ms.toExponential(2)} m/s  ·  1 rot = ${period_h.toFixed(1)}h`;
  } else if(hint){
    hint.textContent = '';
  }
  liveSync();
}

// Populate cl-v-input from a raw m/s value (called when loading body)
function setCloudVelDisplay(ms){
  const mode = document.getElementById('cl-v-mode')?.value || 'ms';
  const b = selectedBody && bodies[selectedBody];
  const radius = (b?.data?.BASE_DATA?.radius) || 314970;
  const startH = getSimpleKmMetres('cl-sh') || 0;
  const innerCirc = 2 * Math.PI * (radius + startH);
  let display = ms;
  if(mode === 'rph' && innerCirc > 0) display = (ms * 3600) / innerCirc;
  else if(mode === 'rps' && innerCirc > 0) display = ms / innerCirc;
  const inp = document.getElementById('cl-v-input');
  if(inp) inp.value = display ? display.toFixed(4).replace(/\.?0+$/, '') : '';
  const hidden = document.getElementById('cl-v');
  if(hidden) hidden.value = ms;
  syncCloudVel();
}
let _finaliseRenameTimer = null;
function _schedFinaliseRename(newName){
  clearTimeout(_finaliseRenameTimer);
  _finaliseRenameTimer = setTimeout(() => finaliseRename(newName), 600);
}

function renameBody(newName){
  if(!selectedBody || !newName) return;
  const input = document.getElementById('sbb-name-input');
  // Check for conflict (another body already has this name)
  const conflict = newName !== selectedBody && bodies[newName] !== undefined;
  input.classList.toggle('conflict', conflict);
  // Live-update the canvas label even while typing (don't commit yet)
  drawViewport._pendingName = newName;
  drawViewport();
}

function finaliseRename(newName){
  clearTimeout(_finaliseRenameTimer);
  if(!selectedBody || !newName || newName === selectedBody) return;
  const input = document.getElementById('sbb-name-input');

  // Sanitise: no path chars, no spaces (SFS uses filenames)
  newName = newName.trim().replace(/[\/\\:*?"<>|]/g, '');
  if(!newName){ input.value = selectedBody; return; } // revert if blank after sanitise

  // Block if name already taken
  if(bodies[newName]){
    input.classList.add('conflict');
    input.value = newName;
    return;
  }

  // Commit: rename the key in bodies{}
  pushUndo();
  const oldName = selectedBody;
  bodies[newName] = bodies[oldName];
  delete bodies[oldName];

  // Update any other bodies that orbit this one
  Object.values(bodies).forEach(b => {
    if(b.data.ORBIT_DATA && b.data.ORBIT_DATA.parent === oldName){
      b.data.ORBIT_DATA.parent = newName;
    }
  });

  // Update statusbar center reference
  if(bodies[newName].isCenter){
    document.getElementById('sb-center').textContent = newName;
  }

  selectedBody = newName;
  input.value = newName;
  input.classList.remove('conflict');
  drawViewport._pendingName = null;
  document.getElementById('sb-sel').textContent = newName;
  document.getElementById('sbb-type').textContent = bodies[newName].isCenter ? 'System Center' : (bodies[newName].data.ORBIT_DATA ? `orbiting ${bodies[newName].data.ORBIT_DATA.parent}` : '');
  updateStatusBar();
  drawViewport();
}

// Normalises difficulty-scale sub-objects so lowercase keys from SFS game files
// ('normal','hard','realistic') become Title Case ('Normal','Hard','Realistic').
// Must be called on every bodyData object right after JSON.parse.
function normalizeDiffScaleKeys(bodyData){
  if(!bodyData || typeof bodyData !== 'object') return bodyData;
  const DIFF_FIELDS = [
    'radiusDifficultyScale','gravityDifficultyScale',
    'smaDifficultyScale','soiDifficultyScale',
    'heightDifficultyScale','terrainFormulaDifficulties',
    'flatZonesDifficulties'
  ];
  const LC = ['normal','hard','realistic'];
  function fixScaleObj(o){
    if(!o || typeof o !== 'object') return;
    for(const lk of LC){
      if(o[lk] !== undefined){
        const tk = lk.charAt(0).toUpperCase() + lk.slice(1);
        if(o[tk] === undefined) o[tk] = o[lk];
        delete o[lk];
      }
    }
  }
  function walk(node){
    if(!node || typeof node !== 'object') return;
    for(const field of DIFF_FIELDS){
      if(node[field]) fixScaleObj(node[field]);
    }
    // Recurse one level into nested sections (ATMOSPHERE_PHYSICS_DATA, etc.)
    for(const k of Object.keys(node)){
      if(node[k] && typeof node[k] === 'object' && !Array.isArray(node[k])) walk(node[k]);
    }
  }
  walk(bodyData);
  return bodyData;
}

function buildDiffScale(nId,hId,rId){
  const n=parseFloat(val(nId)), h=parseFloat(val(hId)), r=parseFloat(val(rId));
  const obj={};
  if(!isNaN(n)) obj.Normal=n;
  if(!isNaN(h)) obj.Hard=h;
  if(!isNaN(r)) obj.Realistic=r;
  return obj;
}

function collectFogKeys(){
  const keys=[]; let i=0;
  while(document.getElementById('fk-'+i)){
    const fv = id => { const el=document.getElementById(id); return el ? parseFloat(el.value) : 0; };
    const fa = id => { const el=document.getElementById(id); if(!el) return 0; const v=parseFloat(el.value); return isNaN(v)?0:v; };
    keys.push({
      color:{ r:fa('fk-'+i+'-r'), g:fa('fk-'+i+'-g'), b:fa('fk-'+i+'-b'), a:fa('fk-'+i+'-a') },
      distance: fv('fk-'+i+'-d')||0
    });
    i++;
  }
  return keys;
}
function collectPPKeys(){
  const keys=[]; let i=0;
  while(document.getElementById('ppk-'+i)){
    const f = id => parseFloat(document.getElementById(id)?.value) || 0;
    const fnn = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? 1 : v; };
    keys.push({
      height:          f('ppk-'+i+'-h'),
      shadowIntensity: fnn('ppk-'+i+'-si'),
      starIntensity:   f('ppk-'+i+'-sti'),
      hueShift:        f('ppk-'+i+'-hs'),
      saturation:      fnn('ppk-'+i+'-sat'),
      contrast:        fnn('ppk-'+i+'-con'),
      red:             fnn('ppk-'+i+'-r'),
      green:           fnn('ppk-'+i+'-g'),
      blue:            fnn('ppk-'+i+'-b'),
    });
    i++;
  }
  return keys;
}
function collectLandmarks(){
  const lms=[]; let i=0;
  while(document.getElementById('lm-'+i)){
    const n=val('lm-'+i+'-n');
    // Read from number inputs (precise); fall back to range slider if not present
    const lmS = parseFloat(document.getElementById('lm-'+i+'-s-num')?.value ?? val('lm-'+i+'-s')) || 0;
    const lmE = parseFloat(document.getElementById('lm-'+i+'-e-num')?.value ?? val('lm-'+i+'-e')) || 0;
    if(n) lms.push({name:n, startAngle:lmS, endAngle:lmE});
    i++;
  }
  return lms;
}


// ── Heightmap visual UI ───────────────────────────────────────────────────────
let _hmActiveDiff = 'Normal';

function hmUploadClick(){
  document.getElementById('hm-file-input').click();
}

function hmFileAdded(files){
  if(!files || !files.length) return;
  // Route through existing asset upload system
  handleFiles(files, 'heightmaps');
  // Refresh the loaded list after a short delay so the asset registers
  setTimeout(hmRefreshLoadedList, 300);
}

function hmToggleLibrary(){
  const wrap = document.getElementById('hm-library-wrap');
  const btn  = document.getElementById('hm-collapse-btn');
  if(!wrap || !btn) return;
  const collapsed = wrap.style.display === 'none';
  wrap.style.display = collapsed ? '' : 'none';
  btn.textContent = collapsed ? '▾ HIDE' : '▸ SHOW';
}

// Build the list of loaded heightmap cards
function hmRefreshLoadedList(){
  const list = document.getElementById('hm-loaded-list');
  const hint = document.getElementById('hm-empty-hint');
  const insertRow = document.getElementById('hm-insert-row');
  const mapSel = document.getElementById('hm-map');
  if(!list) return;

  const hms = (typeof assets !== 'undefined') ? (assets.heightmaps || []) : [];

  // Populate the map picker with loaded names + builtins
  const builtins = ['Perlin'];
  const customNames = hms.map(e => e.name.replace(/\.[^.]+$/, ''));
  const allMaps = [...new Set([...builtins, ...customNames])];
  const curMap = mapSel.value;
  mapSel.innerHTML = allMaps.map(n =>
    `<option value="${n}"${n===curMap?' selected':''}>${n}${builtins.includes(n)?' (built-in)':' (custom)'}</option>`
  ).join('');

  if(hms.length === 0){
    list.innerHTML = '';
    hint.style.display = '';
    insertRow.style.display = 'none';
    insertRow.innerHTML = '';
    return;
  }

  hint.style.display = 'none';
  insertRow.style.display = 'none'; // handled inside list now

  // Separate into image and text groups
  const imgHMs = hms.filter(e => /\.(png|jpe?g)/i.test(e.name));
  const txtHMs = hms.filter(e => /\.txt$/i.test(e.name));

  // Track collapse state per group (persisted in memory only)
  if(!hmRefreshLoadedList._collapsed) hmRefreshLoadedList._collapsed = {};
  const _col = hmRefreshLoadedList._collapsed;

  function buildGroup(items, groupLabel, groupKey){
    if(!items.length) return '';
    const isCollapsed = !!_col[groupKey];
    const cards = items.map(e => {
      const base = e.name.replace(/\.[^.]+$/, '');
      const isImg = /\.(png|jpe?g)/i.test(e.name);
      const preview = isImg && e.url
        ? `<img src="${e.url}" style="width:100%;height:52px;object-fit:cover;border-radius:3px 3px 0 0;image-rendering:pixelated;display:block">`
        : `<div style="width:100%;height:52px;border-radius:3px 3px 0 0;background:var(--bg1);display:flex;align-items:center;justify-content:center;font-size:.72rem;color:var(--sky2);font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:.04em">TXT</div>`;
      return `<div style="background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--ink6,#2a2a2a);cursor:pointer;transition:border-color .15s" onclick="hmInsertMap('${base}')" title="Click to use: ${base}">
        ${preview}
        <div style="padding:4px 5px;font-size:.72rem;font-family:'JetBrains Mono',monospace;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${base}">${base}</div>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:6px">
      <div onclick="hmToggleGroup('${groupKey}')" style="font-size:.68rem;color:var(--ink3);font-family:'JetBrains Mono',monospace;letter-spacing:.06em;margin-bottom:4px;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;user-select:none">
        <span style="color:var(--sky2);font-size:.7rem">${isCollapsed ? '▸' : '▾'}</span>
        <span>${groupLabel} (${items.length})</span>
      </div>
      <div id="hm-group-${groupKey}" style="display:${isCollapsed ? 'none' : 'grid'};grid-template-columns:repeat(3,1fr);gap:4px">${cards}</div>
    </div>`;
  }

  list.innerHTML =
    `<div style="font-size:.65rem;color:var(--ink4);font-family:'JetBrains Mono',monospace;margin-bottom:6px;line-height:1.5">
      <span style="color:var(--sky2)">Tap a card</span> to set it as the active map in the formula builder below.
    </div>` +
    buildGroup(imgHMs, 'Image maps', 'img') +
    buildGroup(txtHMs, 'Text maps', 'txt');
}

function hmApplyFilter(){ /* filter removed — grid is compact enough */ }
function hmToggleCollapse(){ /* no-op */ }
function hmToggleGroup(key){
  if(!hmRefreshLoadedList._collapsed) hmRefreshLoadedList._collapsed = {};
  const _col = hmRefreshLoadedList._collapsed;
  _col[key] = !_col[key];
  hmRefreshLoadedList();
}

// Insert a heightmap name into the map picker and focus add-line
function hmInsertMap(name){
  const mapSel = document.getElementById('hm-map');
  // Select this map in the picker
  for(let i = 0; i < mapSel.options.length; i++){
    if(mapSel.options[i].value === name){ mapSel.selectedIndex = i; break; }
  }
  // Scroll to add-line area
  document.getElementById('hm-scale').focus();
}

function hmSetDiff(diff){
  // Save current textarea to hidden field first
  _hmFlushRawToHidden();
  _hmActiveDiff = diff;
  // Update button styles
  ['Normal','Hard','Realistic'].forEach(d => {
    const btn = document.getElementById('hm-btn-' + d[0].toLowerCase() + d.slice(1).toLowerCase().replace('istic','').replace('ard','')[0]);
    // simpler: by id pattern
  });
  document.getElementById('hm-btn-n').style.background = diff==='Normal' ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-n').style.color      = diff==='Normal' ? '#000' : 'var(--ink3)';
  document.getElementById('hm-btn-h').style.background = diff==='Hard'   ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-h').style.color      = diff==='Hard'   ? '#000' : 'var(--ink3)';
  document.getElementById('hm-btn-r').style.background = diff==='Realistic' ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-r').style.color      = diff==='Realistic' ? '#000' : 'var(--ink3)';
  document.getElementById('hm-diff-badge').textContent = diff;
  _hmRenderFormulaList();
  _hmSyncRawView();
}

// Get lines for active difficulty from the hidden textareas
function _hmGetLines(){
  const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
  const txt = document.getElementById(id)?.value.trim() || '';
  return txt ? txt.split('\n').filter(l => l.trim()) : [];
}
function _hmSetLines(lines){
  const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
  const el = document.getElementById(id);
  if(el) el.value = lines.join('\n');
  _hmRenderFormulaList();
  _hmSyncRawView();
  // Bust all terrain-related caches so the viewport re-evaluates the formula immediately.
  // _surfCache is keyed with only a 0/1 terrRes flag (not the formula content), so it must
  // be explicitly cleared here to prevent stale surface strips after a formula edit.
  if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
  if(typeof drawViewport !== 'undefined'){
    if(drawViewport._surfCache) drawViewport._surfCache = {};
    if(drawViewport._terrCache) drawViewport._terrCache = {};
  }
  if(typeof liveSync === 'function') liveSync();
}

function _hmRenderFormulaList(){
  const container = document.getElementById('hm-formula-list');
  if(!container) return;
  const lines = _hmGetLines();
  if(lines.length === 0){
    container.innerHTML = `<div style="font-size:.6rem;color:var(--ink4);font-family:'JetBrains Mono',monospace;padding:4px 2px;font-style:italic">No lines yet — add one below.</div>`;
    return;
  }
  container.innerHTML = lines.map((line, i) => {
    // Parse for display: "OUTPUT = Op(map, scale, height)"
    const m = line.match(/OUTPUT\s*=\s*(\w+)\(([^)]*)\)/);
    let label = line;
    let tag = '';
    if(m){
      const op   = m[1].replace('HeightMap','').replace('Output','');
      const args = m[2].split(',').map(s=>s.trim());
      const map  = args[0] || '?';
      const sc   = args[1] ? (parseFloat(args[1])/1000).toFixed(0)+'k' : '';
      const ht   = args[2] || '';
      label = `<strong style="color:var(--sky2)">${op}</strong> <span style="color:var(--ink2)">${map}</span>${sc?' <span style="color:var(--ink4)">'+sc+'</span>':''}${ht?' <span style="color:var(--ink4)">h:'+ht+'m</span>':''}`;
      tag = op;
    }
    return `<div style="display:flex;align-items:center;gap:5px;padding:4px 6px;background:var(--bg2);border-radius:4px;margin-bottom:2px">
      <span style="flex:1;font-size:.6rem;font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
      <button onclick="hmMoveLine(${i},-1)" title="Move up"   style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--ink2);border:1px solid var(--ink5);cursor:pointer" ${i===0?'disabled':''}>▲</button>
      <button onclick="hmMoveLine(${i}, 1)" title="Move down" style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--ink2);border:1px solid var(--ink5);cursor:pointer" ${i===lines.length-1?'disabled':''}>▼</button>
      <button onclick="hmRemoveLine(${i})" title="Delete"     style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:transparent;color:#f66;border:1px solid #f66;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

function hmAddLine(){
  const op     = document.getElementById('hm-op').value;
  const map    = document.getElementById('hm-map').value;
  const scale  = parseFloat(document.getElementById('hm-scale').value) || 100000;
  const height = parseFloat(document.getElementById('hm-height').value) || 35;
  const line   = `OUTPUT = ${op.split(' = ')[1]}(${map}, ${scale}, ${height})`;
  const lines  = _hmGetLines();
  lines.push(line);
  _hmSetLines(lines);
}

function hmRemoveLine(i){
  const lines = _hmGetLines();
  lines.splice(i, 1);
  _hmSetLines(lines);
}

function hmMoveLine(i, dir){
  const lines = _hmGetLines();
  const j = i + dir;
  if(j < 0 || j >= lines.length) return;
  [lines[i], lines[j]] = [lines[j], lines[i]];
  _hmSetLines(lines);
}

function _hmSyncRawView(){
  const rv = document.getElementById('hm-raw-view');
  if(!rv) return;
  // Only update if not focused — don't clobber user typing
  if(document.activeElement !== rv){
    rv.value = _hmGetLines().join('\n');
  }
}

// Legacy stubs — raw view is always live now
function hmEditRaw(){ document.getElementById('hm-raw-view')?.focus(); }
function hmSaveRaw(){ /* no-op — live */ }

function _hmFlushRawToHidden(){
  // no-op: hidden textareas are kept in sync by _hmSetLines
}

// Call after fillSidebar to populate the visual UI from the textareas
function hmSyncFromTextareas(){
  _hmActiveDiff = 'Normal';
  hmSetDiff('Normal');
  hmRefreshLoadedList();
}
