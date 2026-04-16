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

