// ════════════════════════════════ LOAD FILES ════════════════════════════════
// ════════════════════════════════ LOAD FILES ════════════════════════════════
// ════════════════════════════════ ZIP READER ════════════════════════════════
// Parses a ZIP file (stored or deflated entries) and returns
// { "path/in/zip": Uint8Array } for every file entry.
function parseZip(buffer){
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const files = {};

  // Find End of Central Directory record by scanning backwards
  let eocdOff = -1;
  for(let i = buffer.byteLength - 22; i >= 0; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocdOff = i; break; }
  }
  if(eocdOff < 0) throw new Error('Not a valid ZIP file');

  const cdCount  = view.getUint16(eocdOff + 8,  true);
  const cdSize   = view.getUint32(eocdOff + 12, true);
  const cdOffset = view.getUint32(eocdOff + 16, true);

  let off = cdOffset;
  for(let i = 0; i < cdCount; i++){
    if(view.getUint32(off, true) !== 0x02014b50) break; // central dir signature
    const compression   = view.getUint16(off + 10, true);
    const compSize      = view.getUint32(off + 20, true);
    const uncompSize    = view.getUint32(off + 24, true);
    const nameLen       = view.getUint16(off + 28, true);
    const extraLen      = view.getUint16(off + 30, true);
    const commentLen    = view.getUint16(off + 32, true);
    const localOffset   = view.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.slice(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries
    if(name.endsWith('/') || uncompSize === 0 && compSize === 0) continue;

    // Read from local file header
    const lhNameLen  = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart  = localOffset + 30 + lhNameLen + lhExtraLen;

    if(compression === 0){
      // Stored — raw bytes
      files[name] = bytes.slice(dataStart, dataStart + uncompSize);
    } else if(compression === 8){
      // Deflate — use DecompressionStream
      // We'll handle this asynchronously; for now store compressed + metadata
      files[name] = { compressed: bytes.slice(dataStart, dataStart + compSize), uncompSize };
    } else {
      console.warn('Unsupported compression for', name, 'method', compression);
    }
  }
  return files;
}

function setLoadingMsg(msg){ document.getElementById('loading-msg').textContent = msg; }
function setLoadingTitle(t){ document.getElementById('loading-title').textContent = t; }
function showLoading(){ document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading(){ document.getElementById('loading-overlay').classList.remove('show'); }

function showLoadingBars(){ document.getElementById('loading-bars').style.display = ''; }
function hideLoadingBars(){ document.getElementById('loading-bars').style.display = 'none'; }

function setBar1(pct, label){
  const fill = document.getElementById('bar1-fill');
  const pctEl = document.getElementById('bar1-pct');
  const labelEl = document.getElementById('bar1-label');
  if(fill){ fill.style.width = pct + '%'; if(pct>=100) fill.classList.add('complete'); else fill.classList.remove('complete'); }
  if(pctEl) pctEl.textContent = Math.round(pct) + '%';
  if(label && labelEl) labelEl.textContent = label;
}
function setBar2(pct, label){
  const fill = document.getElementById('bar2-fill');
  const pctEl = document.getElementById('bar2-pct');
  const labelEl = document.getElementById('bar2-label');
  if(fill){ fill.style.width = pct + '%'; if(pct>=100) fill.classList.add('complete'); else fill.classList.remove('complete'); }
  if(pctEl) pctEl.textContent = pct === null ? '—' : Math.round(pct) + '%';
  if(label && labelEl) labelEl.textContent = label;
}

// Yield to the browser so it can repaint and stay responsive
function _yield(){ return new Promise(r => setTimeout(r, 0)); }

// Memory-safe Uint8Array → base64 string.
// btoa(Array.from(data).map(…).join('')) builds a single giant string that OOMs
// on weak mobile devices for large textures.  This version processes 32 KB at a
// time and is safe even for multi-MB images.
function bytesToBase64(bytes){
  const CHUNK = 32768;
  let s = '';
  for(let i = 0; i < bytes.length; i += CHUNK){
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

async function decompressEntries(raw, onProgress){
  const out = {};
  const keys = Object.keys(raw);
  const total = keys.length;
  for(let i = 0; i < total; i++){
    const name = keys[i];
    const val = raw[name];
    if(val instanceof Uint8Array){
      out[name] = val;
    } else {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(val.compressed);
        writer.close();
        const chunks = [];
        const reader = ds.readable.getReader();
        while(true){
          const {done, value} = await reader.read();
          if(done) break;
          chunks.push(value);
        }
        const full = new Uint8Array(val.uncompSize);
        let off2 = 0;
        for(const c of chunks){ full.set(c, off2); off2 += c.length; }
        out[name] = full;
      } catch(e){ console.warn('Decompress failed:', name, e); }
    }
    // Yield every 8 entries to let the browser repaint
    if(i % 8 === 0){
      if(onProgress) onProgress((i + 1) / total * 100);
      await _yield();
    }
  }
  if(onProgress) onProgress(100);
  return out;
}

function handleZipDrop(e){
  e.preventDefault();
  document.getElementById('zip-drop-zone').classList.remove('drag-over');
  const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.zip'));
  if(!file){ alert('Please drop a .zip file.'); return; }
  loadZipFile(file);
}

async function loadZipFile(file){
  if(!file) return;
  // Reset the file input immediately so the same file can be picked again on mobile
  const _fiZip = document.getElementById('fi-zip');
  if(_fiZip) _fiZip.value = '';
  showLoading(); setLoadingMsg('Reading zip…');

  try{
    const buffer = await file.arrayBuffer();
    setLoadingMsg('Parsing entries…');

    // Warn before clearing an active session
    if(Object.keys(bodies).length > 0){
      hideLoading(); hideLoadingBars();
      if(!confirm('Clear current system and load "' + file.name + '"?')){
        return; // user cancelled
      }
      showLoading(); setLoadingMsg('Parsing entries…');
    }

    showLoadingBars();
    setBar1(0, 'DECOMPRESSING');
    setBar2(0, 'LOADING BODIES');
    const rawEntries = parseZip(buffer);
    setLoadingMsg('Decompressing…');
    const entries = await decompressEntries(rawEntries, pct => setBar1(pct));

    const dec = bytes => new TextDecoder().decode(bytes);

    // Reset state — but preserve any asset-zip textures (vanilla/custom) that were
    // loaded before this system zip.  We snapshot them, wipe per-body state, then
    // restore so vanilla textures survive a system reload.
    const _savedTexCache    = Object.assign({}, textureCache);
    const _savedTexAssets   = assets.textures.slice();
    const _savedTexPixCache = Object.assign({}, texPixelCache);

    bodies = {};
    assets.textures = [];
    assets.heightmaps = []; assets.other = [];
    undoStack = [];
    _sfsDbgLogged = {}; // reset per-body draw warnings
    // Clear heightmap + terrain caches so entries from this system are re-parsed fresh.
    if(typeof _hmCache !== 'undefined') Object.keys(_hmCache).forEach(k => delete _hmCache[k]);
    if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    // Clear textureCache so stale textures from a previous load don't linger,
    // then immediately restore the asset-zip textures.
    Object.keys(textureCache).forEach(k => delete textureCache[k]);
    Object.keys(texPixelCache).forEach(k => delete texPixelCache[k]);
    Object.assign(textureCache,    _savedTexCache);
    Object.assign(texPixelCache,   _savedTexPixCache);
    // Restore asset-zip entries into assets.textures (system-zip textures will be added below)
    _savedTexAssets.forEach(e => assets.textures.push(e));
    console.log(`[SFS|LOAD] state reset — preserved ${Object.keys(_savedTexCache).length} asset-zip texture(s), textureCache: [${Object.keys(textureCache).join(',')}]`);
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('undo-btn').classList.remove('undo-active');
    const _agridTex = document.getElementById('agrid-textures'); if(_agridTex) _agridTex.innerHTML='';
    document.getElementById('alist-heightmaps').innerHTML = '';
    document.getElementById('alist-other').innerHTML = '';
    // Re-render thumbs for any asset-zip textures that survived the reset
    _savedTexAssets.forEach(e => renderAssetThumb(e));
    refreshTexPickerLists();

    let planetCount = 0;
    const entryKeys = Object.keys(entries);
    const entryTotal = entryKeys.length || 1;
    let entryIdx = 0;

    for(const [path, data] of Object.entries(entries)){
      entryIdx++;
      setBar2(entryIdx / entryTotal * 100);
      const parts = path.split('/');
      // Normalise: strip leading system folder if present
      // path could be: "Sun/Planet Data/Earth.txt" or "Planet Data/Earth.txt"
      const folder = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      const filename = parts[parts.length - 1];

      setLoadingMsg(`Loading ${filename}…`);

      if(folder === 'Planet Data' && filename.endsWith('.txt')){
        try{
          const raw = dec(data);
          const name = filename.replace('.txt','');
          if(name === 'Import_Settings'){ systemSettings.importSettings = JSON.parse(raw); continue; }
          if(name === 'Space_Center_Data'){ systemSettings.spaceCenterData = JSON.parse(raw); continue; }
          if(name === 'Version') continue;
          // Lenient parse: strip trailing commas, fix bare decimals, Unity Infinity/NaN
          const _fixedRaw = raw
            .replace(/,\s*([}\]])/g, '$1')           // trailing commas
            .replace(/(\d)\.(?=[,\s}\]])/g, '$10')   // bare decimals: 0. → 0.0
            .replace(/:\s*Infinity\b/g,  ': 1e38')   // Unity JsonUtility Infinity
            .replace(/:\s*-Infinity\b/g, ': -1e38')  // Unity JsonUtility -Infinity
            .replace(/:\s*NaN\b/g,       ': 0');      // Unity JsonUtility NaN
          const bodyData = normalizeDiffScaleKeys(JSON.parse(_fixedRaw));
          // isCenter determined later — first pass just stores data
          const lacksOrbit = !bodyData.ORBIT_DATA;
          const r   = bodyData.BASE_DATA?.radius || 0;
          const hasAtmo = !!bodyData.ATMOSPHERE_PHYSICS_DATA;
          let pid = 'planet';
          if(lacksOrbit)                             pid = 'star';
          else if(bodyData.RINGS_DATA)               pid = 'ringedgiant';
          else if(r < 500)                           pid = 'asteroid';
          else if(r < 200000)                        pid = 'moon';
          else if(hasAtmo && r > 1000000)            pid = 'gasgiant';
          else if(hasAtmo && bodyData.ATMOSPHERE_PHYSICS_DATA.density <= 0.001) pid = 'marslike';
          else if(!hasAtmo && r < 200000)            pid = 'mercurylike';
          const _meta = inferPresetMeta(name, bodyData);
          bodies[name] = { data: bodyData, preset: _meta.id, isCenter: false, _lacksOrbit: lacksOrbit, color: _meta.color, glow: _meta.glow, icon: _meta.icon };
          planetCount++;
        } catch(e){ console.warn('Failed to parse planet', filename, e); }

      } else if(folder === 'Heightmap Data' && filename.endsWith('.txt')){
        const content = dec(data);
        const entry = { name: filename, content, size: data.length };
        assets.heightmaps.push(entry);
        renderAssetRow(entry, 'heightmaps');
        injectCustomHeightmap(filename);

      } else if(folder === 'Heightmap Data' && /\.(png|jpe?g)$/i.test(filename)){
        const ext = filename.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        const entry = { name: filename, url, size: data.length };
        assets.heightmaps.push(entry);
        renderAssetRow(entry, 'heightmaps');
        injectCustomHeightmap(filename);

      } else if(folder === 'Texture Data'){
        const ext = filename.split('.').pop().toLowerCase();
        if(!['png','jpg','jpeg','webp'].includes(ext)) continue;
        console.log(`[SFS|LOAD] found texture in system zip: "${filename}"`);
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                   : ext === 'webp' ? 'image/webp' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        if(!assets.textures.find(a=>a.name===filename)){
          const entry = { name: filename, url, size: data.length };
          assets.textures.push(entry);
          renderAssetThumb(entry);
          const texName = filename.replace(/\.[^.]+$/, '');
          cacheTexture(texName, url);
        }

      } else if(filename === 'Import_Settings.txt'){
        try{ systemSettings.importSettings = JSON.parse(dec(data)); } catch(e){}
      } else if(filename === 'Space_Center_Data.txt'){
        try{ systemSettings.spaceCenterData = JSON.parse(dec(data)); } catch(e){}
      }
    }

    if(planetCount === 0){ hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM'); alert('No planet files found in zip. Make sure it contains a Planet Data/ folder.'); return; }

    // Elect exactly one center: the no-orbit body with the largest radius.
    // All other no-orbit bodies are left as non-center (they'll sit at world origin).
    const noOrbitBodies = Object.entries(bodies).filter(([,b]) => b._lacksOrbit);
    if(noOrbitBodies.length > 0){
      // Sort descending by radius — largest becomes the true center
      noOrbitBodies.sort(([,a],[,b]) => ((b.data.BASE_DATA||{}).radius||0) - ((a.data.BASE_DATA||{}).radius||0));
      noOrbitBodies[0][1].isCenter = true;
    }
    // Clean up temp flag
    Object.values(bodies).forEach(b => delete b._lacksOrbit);

    // Fix up empty-state visibility
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    if(hasCenter) document.getElementById('empty-state').classList.add('gone');
    else document.getElementById('empty-state').classList.remove('gone');

    updateStatusBar();
    syncAddBodyBtn();
    setLoadingMsg('Done!');
    refreshTexPickerLists();
    updateAssetEmptyState();
    console.log(`[SFS|LOAD] done — ${planetCount} bodies, textureCache keys: [${Object.keys(textureCache).join(',')}]`);
    setTimeout(() => { hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM'); goNew(); setTimeout(() => { console.log('[SFS|LOAD] delayed redraw, textureCache:', Object.keys(textureCache)); drawViewport(); }, 500); }, 350);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('Load error:', err);
    alert('Failed to load zip: ' + err.message);
  }
}


// ── Default texture zip loader ──
// Maps folder names from the default texture ZIP to asset categories.

// ── Remote assets URLs ────────────────────────────────────────────────────────
// raw.githubusercontent.com blocks cross-origin binary fetches, so we proxy
// through corsproxy.io which adds the required CORS headers.
// ─────────────────────────────────────────────────────────────────────────────
// ── Remote assets URLs ────────────────────────────────────────────────────────
// jsdelivr CDN mirrors GitHub repo files with proper CORS + Content-Length headers.
// Format: https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
// ─────────────────────────────────────────────────────────────────────────────
const REMOTE_ASSETS_URLS = [
  { url: 'assets/Vanilla Presets + textures.zip',  name: 'Vanilla Presets + textures.zip' },
  { url: 'assets/Vanilla Textures 2.zip',           name: 'Vanilla Textures 2.zip' },
  { url: 'assets/Custom and Terrain Files.zip',     name: 'Custom and Terrain Files.zip' },
];

// Auto-fetch remote asset zip on startup (online users only).
// Falls back gracefully if offline or URL is null.
let _remoteAbortCtrl = null;
function cancelRemoteAssets(){ if(_remoteAbortCtrl) _remoteAbortCtrl.abort(); }

async function autoLoadRemoteAssets(){
  if(!REMOTE_ASSETS_URLS || !REMOTE_ASSETS_URLS.length) return;
  const statusEl = document.getElementById('default-tex-status');
  const btn = document.getElementById('btn-load-assets');
  const cancelBtn = document.getElementById('btn-cancel-remote');
  if(statusEl){ statusEl.textContent = '⟳ Fetching assets…'; statusEl.style.color = 'var(--sky2)'; }

  let totalTextures = 0, totalPresets = 0, errors = 0, cancelled = false;
  _remoteAbortCtrl = new AbortController();
  const signal = _remoteAbortCtrl.signal;

  showLoading();
  showLoadingBars();
  setLoadingTitle('LOADING ASSETS');
  if(cancelBtn) cancelBtn.style.display = '';

  for(let i = 0; i < REMOTE_ASSETS_URLS.length; i++){
    if(signal.aborted){ cancelled = true; break; }
    const { url, name: fname } = REMOTE_ASSETS_URLS[i];
    setLoadingMsg(`(${i+1}/${REMOTE_ASSETS_URLS.length}) ${fname}`);
    setBar1(0, 'DOWNLOADING');
    setBar2(null, 'LOADING TEXTURES');

    try{
      const resp = await fetch(url, { signal });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);

      // Stream download with bar1 progress if Content-Length is known
      const contentLength = resp.headers.get('Content-Length');
      let buffer;
      if(contentLength){
        const total = parseInt(contentLength, 10);
        const reader = resp.body.getReader();
        const chunks = [];
        let received = 0;
        while(true){
          if(signal.aborted){ reader.cancel(); cancelled = true; break; }
          const {done, value} = await reader.read();
          if(done) break;
          chunks.push(value);
          received += value.length;
          setBar1(received / total * 100);
        }
        if(cancelled) break;
        const full = new Uint8Array(received);
        let off = 0;
        for(const c of chunks){ full.set(c, off); off += c.length; }
        buffer = full.buffer;
      } else {
        // No Content-Length — just fetch and pulse bar indeterminate
        setBar1(50, 'DOWNLOADING…');
        buffer = await resp.arrayBuffer();
        setBar1(100);
      }

      setBar1(100, 'DECOMPRESSING');
      const res = await _loadSFSAssetBuffer(
        buffer, fname,
        pct => setBar1(pct, 'DECOMPRESSING'),
        pct => setBar2(pct)
      );
      totalTextures += res.totalTextures;
      totalPresets  += res.totalPresets;
      errors        += res.errors;
    } catch(err){
      if(err.name === 'AbortError'){ cancelled = true; break; }
      console.warn(`[SFS] Failed to load ${fname}:`, err);
      errors++;
    }
  }

  _remoteAbortCtrl = null;
  if(cancelBtn) cancelBtn.style.display = 'none';
  hideLoading();
  hideLoadingBars();
  setLoadingTitle('LOADING SYSTEM');

  if(cancelled){
    if(statusEl){ statusEl.textContent = '⚠ Download cancelled — upload zips manually'; statusEl.style.color = 'var(--amber)'; }
    return;
  }

  const parts = [];
  if(totalTextures > 0) parts.push(`${totalTextures} texture${totalTextures!==1?'s':''}`);
  if(totalPresets  > 0) parts.push(`${totalPresets} preset${totalPresets!==1?'s':''}`);
  if(statusEl){
    if(errors > 0 && totalTextures === 0){
      statusEl.textContent = '⚠ Remote assets unavailable — upload zip manually';
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = parts.length ? `✓ Assets loaded: ${parts.join(', ')}` : '✓ Assets loaded';
      statusEl.style.color = 'var(--jade)';
    }
  }
  if(btn && totalTextures > 0){ btn.style.display = 'none'; }
}

// ── Dynamic preset store — populated when asset zips are loaded ──────────────
// Overrides FILE_PRESETS when populated. Each key is a preset name, value is data.
const dynamicPresets = { vanilla: {}, custom: {} };

// Returns true if a zip path belongs to a heightmap folder (skip everything there)
function _isHeightmapPath(pathLower){
  return pathLower.includes('heightmap') || pathLower.includes('height map') || pathLower.includes('height_map')
      || pathLower.includes('/terrain/') || pathLower.includes('/terrain custom/')
      || pathLower.endsWith('/terrain') || pathLower.endsWith('/terrain custom');
}

// Detect category from folder name in the zip path
function _presetCategory(pathLower){
  if(pathLower.includes('vanilla')) return 'vanilla';
  if(pathLower.includes('custom'))  return 'custom';
  return null; // unknown — will be filed as custom
}

// Parse a preset .txt file leniently (same approach as the zip importer)
function _parsePresetTxt(raw, filename){
  try{
    let fixed = raw
      .replace(/,(\s*[}\]])/g, '$1')            // trailing commas
      .replace(/(\d)\.(?=[,\s}\]])/g, '$10')    // bare decimal: 0. → 0.0
      .replace(/:\s*Infinity\b/g,  ': 1e38')    // Unity JsonUtility Infinity
      .replace(/:\s*-Infinity\b/g, ': -1e38')   // Unity JsonUtility -Infinity
      .replace(/:\s*NaN\b/g,       ': 0');       // Unity JsonUtility NaN
    return normalizeDiffScaleKeys(JSON.parse(fixed));
  } catch(e){
    console.warn('[SFS|IO] Preset parse error' + (filename ? ` in "${filename}"` : '') + ':', e.message);
    return null;
  }
}

// ── Unified SFS asset zip loader ──────────────────────────────────────────────
// Accepts one or more zips containing any combination of:\n//   */Planet Data/*.txt       → preset files (vanilla or custom)\n//   */Texture Data/*.(img)    → textures\n//   */Heightmap Data/*.txt    → heightmaps (JSON points)\n//   */Heightmap Data/*.(img)  → heightmaps (PNG/JPG alpha-encoded)\n//   (legacy) flat image files  → textures (backwards compat with old texture-only zips)

// Core single-zip processor — used by both manual upload and remote auto-load.
async function _loadSFSAssetBuffer(buffer, zipName, onDecompProgress, onTexProgress){
  const rawEntries = parseZip(buffer);
  const entries = await decompressEntries(rawEntries, onDecompProgress);
  let totalTextures = 0, totalPresets = 0, errors = 0;

  // Pre-count texture entries for progress reporting
  const allEntries = Object.entries(entries);
  const texTotal = allEntries.filter(([path]) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    const ext = p.split('.').pop();
    return ['png','jpg','jpeg','webp'].includes(ext) && !_isHeightmapPath(p) && !p.includes('planet data');
  }).length || 1;
  let texDone = 0;

  for(let i = 0; i < allEntries.length; i++){
    const [path, data] = allEntries[i];
    const normPath = path.replace(/\\/g, '/');
    const pathLower = normPath.toLowerCase();
    const parts = normPath.split('/');
    const filename = parts[parts.length - 1];
    if(!filename) continue;

    if(_isHeightmapPath(pathLower)){
      // ── Heightmap Data files — load into assets.heightmaps ──
      const ext = filename.split('.').pop().toLowerCase();
      if(ext === 'txt'){
        const content = new TextDecoder().decode(data);
        const entry = { name: filename, content, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      } else if(['png','jpg','jpeg'].includes(ext)){
        const mime = (ext==='jpg'||ext==='jpeg') ? 'image/jpeg' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        const entry = { name: filename, url, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      }
      continue;
    }

    const ext = filename.split('.').pop().toLowerCase();

    if(ext === 'txt' && pathLower.includes('planet data')){
      const dec = new TextDecoder().decode(data);
      const parsed = _parsePresetTxt(dec);
      if(parsed){
        const pname = filename.replace(/\.txt$/i, '').trim();
        const cat = _presetCategory(pathLower) || 'custom';
        dynamicPresets[cat][pname] = parsed;
        totalPresets++;
      } else { errors++; }
      continue;
    }

    if(['png','jpg','jpeg','webp'].includes(ext)){
      const inOtherDataFolder = pathLower.includes('planet data') || pathLower.includes('heightmap');
      if(inOtherDataFolder) continue;

      const mime = (ext==='jpg'||ext==='jpeg') ? 'image/jpeg'
                 : ext==='webp' ? 'image/webp' : 'image/png';
      const b64 = bytesToBase64(data);
      const url = `data:${mime};base64,${b64}`;
      const texName = filename.replace(/\.[^.]+$/, '');
      cacheTexture(texName, url);

      if(!assets.textures.find(a=>a.name===filename)){
        const isVanillaTex = _presetCategory(pathLower) === 'vanilla';
        const entry = { name:filename, url, size:data.length, vanilla:isVanillaTex };
        assets.textures.push(entry);
        renderAssetThumb(entry);
        totalTextures++;
      }

      texDone++;
      if(onTexProgress) onTexProgress(texDone / texTotal * 100);
      // Yield every 4 textures — btoa on large images is expensive on weak devices
      if(texDone % 4 === 0) await _yield();
    }
  }

  if(totalTextures > 0){ refreshTexPickerLists(); updateAssetEmptyState(); drawViewport(); }
  return { totalTextures, totalPresets, errors };
}

async function loadSFSAssetZips(files){
  if(!files || !files.length) return;
  const statusEl = document.getElementById('default-tex-status');
  let totalTextures = 0, totalPresets = 0, errors = 0;

  showLoading();
  showLoadingBars();
  setLoadingTitle('LOADING ASSETS');
  setBar1(0, 'DECOMPRESSING');
  setBar2(null, 'LOADING TEXTURES');

  for(const file of Array.from(files)){
    setLoadingMsg(file.name);
    setBar1(0); setBar2(null);
    try{
      const buffer = await file.arrayBuffer();
      const res = await _loadSFSAssetBuffer(
        buffer, file.name,
        pct => setBar1(pct),
        pct => setBar2(pct)
      );
      totalTextures += res.totalTextures;
      totalPresets  += res.totalPresets;
      errors        += res.errors;
    } catch(err){
      console.error('Asset zip error:', file.name, err);
      errors++;
    }
  }

  hideLoading();
  hideLoadingBars();
  setLoadingTitle('LOADING SYSTEM');

  // Build status message
  const parts = [];
  if(totalTextures > 0) parts.push(`${totalTextures} texture${totalTextures!==1?'s':''}`);
  if(totalPresets  > 0) parts.push(`${totalPresets} preset${totalPresets!==1?'s':''}`);
  if(errors > 0)        parts.push(`${errors} error${errors!==1?'s':''}`);

  if(statusEl){
    if(parts.length === 0){
      statusEl.textContent = '⚠ No assets found — check zip contains Planet Data/ or Texture Data/ folders';
      statusEl.style.color = 'var(--amber)';
    } else if(errors > 0){
      statusEl.textContent = `⚠ Loaded: ${parts.join(', ')}`;
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = `✓ Loaded: ${parts.join(', ')}`;
      statusEl.style.color = 'var(--jade)';
    }
  }

  if(totalTextures > 0){ refreshTexPickerLists(); updateAssetEmptyState(); drawViewport();
    const btn = document.getElementById('btn-load-assets');
    if(btn) btn.style.display = 'none';
  }
}

// Init — resize on first load
setTimeout(resizeViewport, 50);
// Attach unit parsers to distance input fields
setTimeout(initUnitInputs, 100);
// Auto-fetch remote assets if URL is configured (no-op when REMOTE_ASSETS_URL is null)
autoLoadRemoteAssets();

