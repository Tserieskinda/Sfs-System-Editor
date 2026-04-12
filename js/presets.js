// ════════════════════════════════ PRESET DATA ════════════════════════════════
// ════════════ FILE-BASED PRESETS (loaded from Presets zip) ════════════
// Vanilla: 37 bodies from the base SFS solar system
// Custom:  17 special bodies (star types, black holes, exotic asteroids)
const FILE_PRESETS = {"vanilla":{},"custom":{
  "Blank Body": {
    "version": "1.5",
    "BASE_DATA": {
      "radius": 600000.0,
      "radiusDifficultyScale": {},
      "gravity": 9.8,
      "gravityDifficultyScale": {},
      "timewarpHeight": 25000.0,
      "velocityArrowsHeight": 5000.0,
      "mapColor": { "r": 0.6, "g": 0.6, "b": 0.6, "a": 1.0 },
      "significant": true,
      "rotateCamera": true
    },
    "TERRAIN_DATA": {
      "terrainFormulaDifficulties": {},
      "textureFormula": [],
      "verticeSize": 2.0,
      "collider": true,
      "flatZones": [],
      "flatZonesDifficulties": {}
    },
    "ACHIEVEMENT_DATA": {
      "Landed": true,
      "Takeoff": true,
      "Atmosphere": false,
      "Orbit": true,
      "Crash": true
    }
  }
}};

// ── Derive a type-id, icon, color and glow from the body data ──────────
function inferPresetMeta(name, data){
  const r    = data.BASE_DATA?.radius || 0;
  const g    = data.BASE_DATA?.gravity || 0;
  const hasAtmo  = !!data.ATMOSPHERE_PHYSICS_DATA;
  const hasRings = !!data.RINGS_DATA;
  const hasTerrain = !!data.TERRAIN_DATA;
  const hasOrbit = !!data.ORBIT_DATA;
  const collider = data.TERRAIN_DATA?.collider !== false;
  const n = name.toLowerCase();

  // Barycentre check FIRST — barycentres have no orbit so must be caught before the star block
  if(n.includes('barycentre') || n.includes('barycenter'))
    return {id:'barycentre', icon:'⊕', color:'#8888aa,#444466', glow:'#8888aa'};

  // Star / stellar types
  if(!hasOrbit || g > 5000) {
    if(n.includes('black') || n.includes(' bh') || n.endsWith('bh') || n.includes('solar mass bh'))
      return {id:'blackhole', icon:'🕳️', color:'#220044,#000000', glow:'#8800ff'};
    if(n.includes('brown') || n.includes('dwarf'))
      return {id:'star', icon:'🌑', color:'#884422,#442200', glow:'#cc6622'};
    if(n.includes('neutron'))
      return {id:'star', icon:'💫', color:'#aabbff,#6688ff', glow:'#aaccff'};
    if(n==='o'||n.includes('o type')||n.includes('_o'))
      return {id:'star', icon:'🔵', color:'#88aaff,#4466dd', glow:'#aaccff'};
    if(n==='b'||n.includes('b type')||n.includes('_b'))
      return {id:'star', icon:'🔵', color:'#aabbff,#6688ff', glow:'#ccddff'};
    if(n==='a'||n.includes('a type')||n.includes('_a'))
      return {id:'star', icon:'⚪', color:'#ffffff,#ddddff', glow:'#eeeeff'};
    if(n==='f'||n.includes('f type')||n.includes('_f'))
      return {id:'star', icon:'🌟', color:'#ffffcc,#ffff88', glow:'#ffffaa'};
    if(n==='g'||n.includes('g type')||n.includes('_g') || n==='sun')
      return {id:'star', icon:'☀️', color:'#ffd060,#ff8800', glow:'#ff9900'};
    if(n==='k'||n.includes('k type')||n.includes('_k'))
      return {id:'star', icon:'🟠', color:'#ffaa44,#cc6622', glow:'#ffbb44'};
    if(n==='m'||n.includes('m type')||n.includes('_m'))
      return {id:'star', icon:'🔴', color:'#ff6633,#cc2200', glow:'#ff6644'};
    // Generic star / no-orbit body
    return {id:'star', icon:'☀️', color:'#ffd060,#ff8800', glow:'#ff9900'};
  }
  // Barycentre: tiny radius + no terrain (catches unlabelled barycentres)
  if(r < 200 && !hasTerrain)
    return {id:'barycentre', icon:'⊕', color:'#8888aa,#444466', glow:'#8888aa'};
  if(hasRings)
    return {id:'ringedgiant', icon:'🪐', color:'#bb9944,#886622', glow:'#ccaa55'};
  if(hasAtmo && r > 500000)
    return {id:'gasgiant', icon:'🪐', color:'#cc8833,#886633', glow:'#ffaa44'};
  if(!hasTerrain || !collider){
    if(r > 200000) return {id:'gasgiant', icon:'🪐', color:'#cc8833,#886633', glow:'#ffaa44'};
    return {id:'asteroid', icon:'☄️', color:'#554433,#332211', glow:'#776655'};
  }
  if(r < 500)
    return {id:'asteroid', icon:'☄️', color:'#554433,#332211', glow:'#776655'};
  if(r < 50000)
    return {id:'moon', icon:'🌑', color:'#888888,#444444', glow:'#999999'};
  if(!hasAtmo && r < 200000)
    return {id:'mercurylike', icon:'🪨', color:'#776655,#443322', glow:'#998866'};
  if(hasAtmo && data.ATMOSPHERE_PHYSICS_DATA?.density <= 0.001)
    return {id:'marslike', icon:'🔴', color:'#884422,#552211', glow:'#aa5533'};
  if(r > 200000)
    return {id:'planet', icon:'🌍', color:'#4488ff,#226622', glow:'#4488ff'};
  return {id:'moon', icon:'🌑', color:'#888888,#444444', glow:'#999999'};
}

// Build a flat list of all presets for use throughout the system.
// If dynamicPresets have been loaded from a zip, those take priority over
// the baked-in FILE_PRESETS (dynamic entries can add new ones or override existing).
function buildAllPresets(){
  const list = [];

  // Merge: start with baked-in, then overlay dynamic (dynamic wins on name collision)
  const vanillaSrc = Object.keys(dynamicPresets.vanilla).length > 0
    ? { ...FILE_PRESETS.vanilla, ...dynamicPresets.vanilla }
    : FILE_PRESETS.vanilla;
  const customSrc  = Object.keys(dynamicPresets.custom).length > 0
    ? { ...FILE_PRESETS.custom,  ...dynamicPresets.custom  }
    : FILE_PRESETS.custom;

  Object.entries(vanillaSrc).forEach(([name, data]) => {
    const meta = inferPresetMeta(name, data);
    list.push({ key:name, name, category:'vanilla', data:JSON.parse(JSON.stringify(data)), ...meta });
  });
  Object.entries(customSrc).forEach(([name, data]) => {
    const meta = inferPresetMeta(name, data);
    list.push({ key:name, name, category:'custom', data:JSON.parse(JSON.stringify(data)), ...meta });
  });

  return list;
}


// ════════════════════════════════ PRESET MODAL ════════════════════════════════
// Preset modal state
let _prsTab = 'all';       // 'all' | 'vanilla' | 'custom'
let _prsSearch = '';

function prsSetTab(tab, btn){
  _prsTab = tab;
  document.querySelectorAll('.prs-tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  prsRebuild();
}

function prsRebuild(){
  const grid = document.getElementById('prs-grid');
  const searchEl = document.getElementById('prs-search');
  if(!grid) return;
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
  } else {
    filtered.forEach(p => grid.appendChild(makePrsCard(p)));
  }
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
    `<span class="prs-card-badge${p.category==='custom'?' custom':''}">` +
    `${p.category==='custom'?'CUSTOM':'SFS'}</span>`;
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
  // Default selection: Sun for center, Earth for body
  selectedPresetKey = forCenter ? 'Sun' : 'Earth';
  _prsTab = 'all';
  _prsSearch = '';

  // Reset tab UI
  document.querySelectorAll('.prs-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
  const searchEl = document.getElementById('prs-search');
  if(searchEl) searchEl.value = '';

  let desc;
  if(forCenter){
    desc = 'Choose your system center — no orbital data needed';
  } else {
    const parentName = (selectedBody && bodies[selectedBody]) ? selectedBody
      : (Object.keys(bodies).find(n => bodies[n].isCenter) || 'the center');
    desc = `New body will orbit <strong style="color:var(--sky2)">${parentName}</strong> — all properties editable after`;
  }
  document.getElementById('mp-desc').innerHTML = desc;
  document.getElementById('prs-confirm-btn').textContent = forCenter ? 'ADD CENTER →' : 'ADD BODY →';

  prsRebuild();
  document.getElementById('modal-preset').classList.add('open');
}

function closePreset(){
  document.getElementById('modal-preset').classList.remove('open');
  if(window._prsCloseHook){ window._prsCloseHook(); window._prsCloseHook = null; }
  // Restore confirm button text
  const btn = document.getElementById('prs-confirm-btn');
  if(btn) btn.textContent = isForCenter ? 'ADD CENTER →' : 'ADD BODY →';
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
  closePreset();
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
    const parentName = (selectedBody && bodies[selectedBody]) ? selectedBody : centerName;
    const parentBody = bodies[parentName];
    const centerBodyEntry = bodies[Object.keys(bodies).find(n => bodies[n].isCenter)];
    const centerRadius = (centerBodyEntry?.data?.BASE_DATA?.radius) || 34817000;
    const parentRadius = (parentBody?.data?.BASE_DATA?.radius) || centerRadius;

    const siblings = Object.values(bodies).filter(b =>
      b.data.ORBIT_DATA && b.data.ORBIT_DATA.parent === parentName
    );

    let defaultSMA;
    if(siblings.length > 0){
      const maxSibSMA = Math.max(...siblings.map(b => effectiveSMA(b.data.ORBIT_DATA)));
      defaultSMA = Math.max(maxSibSMA * 1.5, parentRadius * 80);
    } else {
      const parentOD = parentBody && parentBody.data.ORBIT_DATA;
      if(parentBody && parentBody.isCenter){
        defaultSMA = Math.max(parentRadius * 80, centerRadius * 0.15);
      } else if(parentOD && effectiveSMA(parentOD) > 0){
        defaultSMA = Math.max(effectiveSMA(parentOD) * 0.15, parentRadius * 20);
      } else {
        defaultSMA = Math.max(parentRadius * 20, centerRadius * 0.1);
      }
    }
    defaultSMA = Math.max(defaultSMA, parentRadius * 80);

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

