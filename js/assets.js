// ════════════════════════════════ TEXTURE CACHE ════════════════════════════════
// Maps texture name (without extension) → HTMLImageElement
const textureCache  = {};
const texPixelCache = {};
let _sfsDbgLogged   = {}; // throttle per-body NODRAW warnings to once per load

function cacheTexture(name, dataUrl){
  console.log(`[SFS|CACHE] queueing "${name}" (${dataUrl.length} chars)`);
  const img = new Image();
  img.onload = () => {
    textureCache[name] = img;
    console.log(`[SFS|CACHE] loaded "${name}" ${img.naturalWidth}×${img.naturalHeight}`);
    try {
      // ── Ring strip: 1-D horizontal sample ──────────────────────────────────
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0, 64, 64);
      texPixelCache[name + '_ring'] = x.getImageData(0, 0, 64, 1).data;
      // _atmos: always 64 rows, row 0=outer(transparent), row 63=inner(surface)
      texPixelCache[name + '_atmos'] = x.getImageData(0, 0, 1, 64).data;

      // ── Atmosphere polar canvas ────────────────────────────────────────────
      // Pre-warp the texture into polar coordinates so we can drawImage it
      // directly onto the atmosphere disc at render time.
      //
      // SFS wrapping rules:
      //   - Texture left  edge (U=0) = rightmost point of planet (East, angle=0)
      //   - Texture right edge (U=1) = wraps back after 360° counter-clockwise
      //   - Wrapping is CCW: East→North→West→South→East = left→right of texture
      //   - Texture bottom row (Y=SH-1) = planet surface (radFrac=0)
      //   - Texture top    row (Y=0)    = outer atmosphere edge (radFrac=1)
      //
      // Canvas atan2: angle=0 → East, increases clockwise (CW).
      // To get CCW from East: u = 1 - normalised_CW_angle  (flip direction)
      const SZ = 256;
      const pc = document.createElement('canvas');
      pc.width = SZ; pc.height = SZ;
      const px2 = pc.getContext('2d');
      const srcC = document.createElement('canvas');
      srcC.width = img.naturalWidth; srcC.height = img.naturalHeight;
      const srcX = srcC.getContext('2d');
      srcX.drawImage(img, 0, 0);
      const srcD = srcX.getImageData(0, 0, srcC.width, srcC.height).data;
      const SW = srcC.width, SH = srcC.height;
      const outD = px2.createImageData(SZ, SZ);
      const od = outD.data;
      const halfSZ = SZ / 2;
      for(let py = 0; py < SZ; py++){
        for(let ppx = 0; ppx < SZ; ppx++){
          const dx = ppx - halfSZ, dy = py - halfSZ;
          const radFrac = Math.sqrt(dx*dx + dy*dy) / halfSZ;
          const oi = (py*SZ + ppx)*4;
          if(radFrac > 1.0){
            od[oi]=od[oi+1]=od[oi+2]=od[oi+3]=0;
            continue;
          }
          // Normalised CW angle: 0=East, increases clockwise, range 0..1
          let cwAngle = Math.atan2(dy, dx) / (Math.PI*2);
          if(cwAngle < 0) cwAngle += 1;
          // CCW from East: flip so U=0=East and direction is counter-clockwise
          const u = (1 - cwAngle) % 1;
          // radFrac=0 (surface/inner) → texture bottom (SH-1)
          // radFrac=1 (outer edge)    → texture top    (0)
          const sx = Math.min(SW-1, Math.max(0, Math.round(u * (SW-1))));
          const sy = Math.min(SH-1, Math.max(0, Math.round((1 - radFrac) * (SH-1))));
          const si = (sy * SW + sx) * 4;
          od[oi]   = srcD[si];
          od[oi+1] = srcD[si+1];
          od[oi+2] = srcD[si+2];
          od[oi+3] = srcD[si+3];
        }
      }
      px2.putImageData(outD, 0, 0);
      texPixelCache[name + '_atmoCanvas'] = pc;
    } catch(e) { console.warn('[SFS|CACHE] atmo polar warp failed:', e); }
    drawViewport();
  };
  img.src = dataUrl;
}

// ════════════════════════════════ ASSETS SYSTEM ════════════════════════════════
const assets = {
  textures: [],   // all uploaded image textures (flat list, no categories)
  heightmaps: [], other: []
};

function openAssets(){ document.getElementById('modal-assets').classList.add('open'); }
function closeAssets(){ document.getElementById('modal-assets').classList.remove('open'); }

function switchAssetTab(name, btn){
  document.querySelectorAll('.atab').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.asset-panel').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('apanel-'+name).classList.add('on');
}

function handleDrop(e, type){
  e.preventDefault();
  handleFiles(e.dataTransfer.files, type);
}

function handleFiles(files, type){
  Array.from(files).forEach(file => {
    const reader = new FileReader();
    if(type === 'textures'){
      reader.onload = ev => {
        // Auto-rename duplicates: "Tex.png" → "Tex_1.png" → "Tex_2.png" …
        const ext  = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
        let   base = file.name.slice(0, file.name.length - ext.length);
        let   finalName = file.name;
        let   n = 1;
        while(assets.textures.find(a => a.name === finalName)){
          finalName = base + '_' + n + ext;
          n++;
        }
        const entry = { name: finalName, url: ev.target.result, size: file.size };
        assets.textures.push(entry);
        renderAssetThumb(entry);
        const texName = finalName.replace(/\.[^.]+$/, '');
        cacheTexture(texName, ev.target.result);
        refreshTexPickerLists();
        updateAssetEmptyState();
      };
      reader.readAsDataURL(file);
    } else if(type==='heightmaps' && /\.(png|jpe?g)$/i.test(file.name)){
      reader.onload = ev => {
        const entry = { name: file.name, url: ev.target.result, size: file.size };
        assets.heightmaps.push(entry);
        renderAssetRow(entry, 'heightmaps');
        injectCustomHeightmap(entry.name);
      };
      reader.readAsDataURL(file);
    } else if(type==='heightmaps' || type==='other'){
      reader.onload = ev => {
        const entry = { name: file.name, content: ev.target.result, size: file.size };
        assets[type].push(entry);
        renderAssetRow(entry, type);
        if(type==='heightmaps') injectCustomHeightmap(entry.name);
      };
      reader.readAsText(file);
    }
  });
}

function renderAssetThumb(entry){
  const grid = document.getElementById('agrid-textures');
  if(!grid) return;
  const safe = sanitize(entry.name);
  const div = document.createElement('div');
  div.className = 'asset-thumb'; div.id='asset-tex-'+safe;
  div.dataset.name = entry.name.replace(/\.[^.]+$/,'').toLowerCase();
  div.innerHTML = `<img src="${entry.url}" alt="${entry.name}">
    <div class="asset-thumb-name">${entry.name}</div>
    <button class="adel" onclick="removeAsset('${safe}')">✕</button>`;
  grid.appendChild(div);
}

function renderAssetRow(entry, type){
  const list = document.getElementById('alist-'+type);
  if(!list) return;
  const div = document.createElement('div');
  div.className = 'asset-row'; div.id='asset-'+type+'-'+sanitize(entry.name);
  const icon = type==='heightmaps' ? '📊' : '📎';
  const kb = Math.round((entry.size||0)/1024*10)/10;
  div.innerHTML = `<span class="asset-row-icon">${icon}</span>
    <span class="asset-row-name">${entry.name}</span>
    <span class="asset-row-size">${kb} KB</span>
    <button class="asset-row-del" onclick="removeAsset('${sanitize(entry.name)}','${type}')">✕</button>`;
  list.appendChild(div);
}

function removeAsset(safeName, type){
  if(type && type !== 'textures'){
    if(assets[type]) assets[type] = assets[type].filter(a=>sanitize(a.name)!==safeName);
    document.getElementById('asset-'+type+'-'+safeName)?.remove();
    return;
  }
  // Remove from textures list
  assets.textures = assets.textures.filter(a=>sanitize(a.name)!==safeName);
  document.getElementById('asset-tex-'+safeName)?.remove();
  refreshTexPickerLists();
  updateAssetEmptyState();
}

function updateAssetEmptyState(){
  const empty = document.getElementById('asset-tex-empty');
  if(empty) empty.style.display = assets.textures.length === 0 ? 'block' : 'none';
}

function filterAssetGrid(){
  const q = (document.getElementById('asset-tex-search')?.value||'').toLowerCase();
  document.querySelectorAll('#agrid-textures .asset-thumb').forEach(el=>{
    const n = el.dataset.name || '';
    el.style.display = (!q || n.includes(q)) ? '' : 'none';
  });
}

function sanitize(name){ return name.replace(/[^a-zA-Z0-9_\-]/g,'_'); }

function injectCustomHeightmap(name){ /* heightmaps referenced by formula name, no picker needed */ }
function refreshSortUI(){ /* removed — no sorting anymore */ }

// ════════ TEX-PICKER WIDGET SYSTEM ════════
// All texture fields (av-tex, cl-tex, etc.) are now tpick widgets.
// Each has: input#id (holds the value), dropdown#tpd-id (the open list).
// On load/change, setTexPick(id, value) populates the input display.
// val(id) just reads .value directly from the input — unchanged.

const TPICK_IDS = ['av-tex','cl-tex','fc-tex','tt-pt','tt-sa','tt-sb','tt-tc','rng-tex','wt-tex'];

// All texture names available (from loaded ZIPs only)
function allTexNames(){
  const uploaded = assets.textures.map(a => a.name.replace(/\.[^.]+$/,''));
  return [...new Set(uploaded)].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
}

function getTexThumb(name){
  // Check textureCache first (works for all built-ins and uploads)
  const img = textureCache[name];
  if(img && img.src) return img.src;
  // Check uploaded entry
  const entry = assets.textures.find(a=>a.name.replace(/\.[^.]+$/,'')===name);
  if(entry) return entry.url;
  return null;
}

function buildDropdownItems(pickId, query){
  const names = allTexNames();
  const q = query.toLowerCase();
  const filtered = names.filter(n => !q || n.toLowerCase().includes(q));
  const dd = document.getElementById('tpd-'+pickId);
  if(!dd) return;
  dd.innerHTML = '';
  // Always show None at top
  if(!q || 'none'.includes(q)){
    const noneEl = document.createElement('div');
    noneEl.className = 'tpick-opt tpick-none';
    noneEl.textContent = 'None';
    noneEl.onclick = () => commitTexPick(pickId, 'None');
    dd.appendChild(noneEl);
  }
  if(filtered.length === 0 && q){
    const emp = document.createElement('div');
    emp.className = 'tpick-empty';
    emp.textContent = 'No textures match "' + query + '"';
    dd.appendChild(emp);
    return;
  }
  filtered.forEach(name => {
    const el = document.createElement('div');
    el.className = 'tpick-opt';
    const thumb = getTexThumb(name);
    el.innerHTML = thumb
      ? `<img class="tpick-opt-thumb" src="${thumb}"><span class="tpick-opt-name">${name}</span>`
      : `<span style="width:24px;height:24px;flex-shrink:0;background:var(--ac10);border:1px solid var(--rim)"></span><span class="tpick-opt-name">${name}</span>`;
    el.onclick = () => commitTexPick(pickId, name);
    dd.appendChild(el);
  });
}

function commitTexPick(pickId, name){
  const inp = document.getElementById(pickId);
  if(!inp) return;
  inp.value = name;
  inp.dataset.lastCommit = name;
  inp.classList.toggle('has-val', name !== 'None' && name !== '');
  const clr = document.getElementById('tpc-'+pickId);
  if(clr) clr.classList.toggle('show', name !== 'None' && name !== '');
  closeTexPicker(pickId);
  liveSync();
}

function openTexPicker(pickId){
  // Close any other open pickers first
  TPICK_IDS.forEach(id => { if(id !== pickId) closeTexPicker(id); });
  const dd = document.getElementById('tpd-'+pickId);
  const inp = document.getElementById(pickId);
  if(!dd || !inp) return;
  // On touch devices the dropdown is position:absolute (CSS override),
  // so fixed coords are not needed and would be wrong after keyboard resize.
  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if(!isTouch){
    // Desktop: position dropdown using fixed coords (escapes overflow:auto sidebar)
    const rect = inp.getBoundingClientRect();
    dd.style.left  = rect.left + 'px';
    dd.style.width = rect.width + 'px';
    const spaceBelow = window.innerHeight - rect.bottom;
    if(spaceBelow >= 160 || spaceBelow > window.innerHeight - rect.top){
      dd.style.top    = (rect.bottom + 2) + 'px';
      dd.style.bottom = 'auto';
    } else {
      dd.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
      dd.style.top    = 'auto';
    }
  }
  buildDropdownItems(pickId, '');
  // Select-all so first keypress replaces the displayed name with a fresh query
  requestAnimationFrame(() => inp.select());
  dd.classList.add('open');
}

function closeTexPicker(pickId){
  const dd = document.getElementById('tpd-'+pickId);
  if(dd) dd.classList.remove('open');
  // Restore display text if user typed but didn't pick a result
  const inp = document.getElementById(pickId);
  if(inp && inp.dataset.lastCommit !== undefined){
    inp.value = inp.dataset.lastCommit;
    inp.classList.toggle('has-val', inp.dataset.lastCommit !== 'None' && inp.dataset.lastCommit !== '');
  }
}

function setTexPick(pickId, value){
  const inp = document.getElementById(pickId);
  if(!inp) return;
  const v = value || 'None';
  inp.value = v;
  inp.dataset.lastCommit = v;
  inp.classList.toggle('has-val', v !== 'None');
  const clr = document.getElementById('tpc-'+pickId);
  if(clr) clr.classList.toggle('show', v !== 'None');
}

// val() override for tpick inputs — reading .value gives the texture name directly, 
// so val() still works unchanged. But setSelectVal must route to setTexPick:
function setSelectVal(id, v){
  if(TPICK_IDS.includes(id)){
    setTexPick(id, v);
    return;
  }
  const el = document.getElementById(id); if(!el) return;
  for(let i=0;i<el.options.length;i++){ if(el.options[i].value===v||el.options[i].text===v){ el.selectedIndex=i; return; } }
}

// Rebuild all picker dropdowns when texture list changes (uploads etc.)
function refreshTexPickerLists(){
  // Nothing to pre-build — dropdowns are built on open. Just update thumbs if open.
  TPICK_IDS.forEach(id => {
    const dd = document.getElementById('tpd-'+id);
    if(dd && dd.classList.contains('open')){
      const inp = document.getElementById(id);
      buildDropdownItems(id, inp ? inp.value : '');
    }
  });
}

// Wire up all tpick widgets
function initTexPickers(){
  TPICK_IDS.forEach(pickId => {
    const inp = document.getElementById(pickId);
    const clr = document.getElementById('tpc-'+pickId);
    let   dd  = document.getElementById('tpd-'+pickId);
    if(!inp || !dd) return;

    // Move the dropdown to <body> so it escapes the sidebar's transform stacking context.
    // (sidebar uses transform:translateX which makes position:fixed relative to sidebar, not viewport)
    document.body.appendChild(dd);

    // mousedown on input: open picker, stop propagation so _tpickOutside doesn't
    // immediately close it on the same event.
    inp.addEventListener('mousedown', e => {
      e.stopPropagation();
      if(!dd.classList.contains('open')) openTexPicker(pickId);
      // If already open, leave it — user may be clicking to reposition cursor for typing
    });
    // Mobile
    inp.addEventListener('touchend', e => {
      e.stopPropagation();
      openTexPicker(pickId);
    }, { passive: false });

    // Type to filter — always use current inp.value as the live query
    inp.addEventListener('input', () => {
      // Reposition on desktop
      const isTouch = window.matchMedia('(pointer: coarse)').matches;
      if(!isTouch){
        const rect = inp.getBoundingClientRect();
        dd.style.left  = rect.left + 'px';
        dd.style.width = rect.width + 'px';
        const spaceBelow = window.innerHeight - rect.bottom;
        if(spaceBelow >= 160 || spaceBelow > window.innerHeight - rect.top){
          dd.style.top    = (rect.bottom + 2) + 'px';
          dd.style.bottom = 'auto';
        } else {
          dd.style.bottom = (window.innerHeight - rect.top + 2) + 'px';
          dd.style.top    = 'auto';
        }
      }
      dd.classList.add('open');
      buildDropdownItems(pickId, inp.value);
    });
    // Clear button
    if(clr) clr.addEventListener('click', e => {
      e.stopPropagation();
      commitTexPick(pickId, 'None');
    });
    // Set initial display
    setTexPick(pickId, inp.value || 'None');
  });

  // Click/touch outside closes all
  function _tpickOutside(e){
    TPICK_IDS.forEach(id => {
      const wrap = document.getElementById('tpw-'+id);
      const dd   = document.getElementById('tpd-'+id);
      if(wrap && !wrap.contains(e.target) && dd && !dd.contains(e.target))
        closeTexPicker(id);
    });
  }
  document.addEventListener('mousedown',  _tpickOutside);
  document.addEventListener('touchstart', _tpickOutside, { passive: true });
  // Stop mousedown on any dropdown from bubbling to _tpickOutside
  document.querySelectorAll('.tpick-dropdown').forEach(dd => {
    dd.addEventListener('mousedown', e => e.stopPropagation());
    dd.addEventListener('touchstart', e => e.stopPropagation(), { passive: true });
  });
  // Close on sb-body scroll (the actual scrolling element — fixed dropdown drifts)
  const sbBody = document.querySelector('.sb-body');
  if(sbBody) sbBody.addEventListener('scroll', () => {
    TPICK_IDS.forEach(id => closeTexPicker(id));
  }, {passive: true});
}

