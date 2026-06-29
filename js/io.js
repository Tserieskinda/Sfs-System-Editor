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

    // Bulk mode: suppress per-texture redraws inside the decode queue.
    // loadZipFile can contain dozens of Texture Data images; without this flag
    // every cacheTexture() fires drawViewport+refreshTexPickerLists immediately
    // after each decode — cascading reflows that exhaust memory on low-end devices.
    _bulkLoadActive = true;

    let planetCount = 0;
    const entryKeys = Object.keys(entries);
    const entryTotal = entryKeys.length || 1;
    let entryIdx = 0;
    // Textures whose thumbs need rendering after the main loop (deferred to avoid
    // hammering the DOM and GC with 70+ image decodes in one synchronous burst).
    const _deferredThumbs = [];
    // Count of textures processed this batch, used to yield periodically.
    let _texBatchCount = 0;

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
          _deferredThumbs.push(entry);
          const texName = filename.replace(/\.[^.]+$/, '');
          cacheTexture(texName, url);
        }
        // Yield every 4 textures so the browser can breathe and GC can run
        // between base64 allocations — critical on memory-limited mobile devices.
        _texBatchCount++;
        if(_texBatchCount % 4 === 0) await _yield();

      } else if(filename === 'Import_Settings.txt'){
        try{ systemSettings.importSettings = JSON.parse(dec(data)); } catch(e){}
      } else if(filename === 'Space_Center_Data.txt'){
        try{ systemSettings.spaceCenterData = JSON.parse(dec(data)); } catch(e){}
      }
    }

    // Wait for decode queue to fully drain before touching the DOM further.
    // cacheTexture() calls above enqueue async Image decodes; rendering thumbs
    // or firing redraws before they finish causes OOM on low-end devices.
    setLoadingMsg('Rendering textures…');
    while(_decodeRunning || _decodeQueue.length > 0){
      await new Promise(r => setTimeout(r, 32));
    }
    _bulkLoadActive = false;

    // Now safe to render texture thumbs in batches of 8 (decode pressure gone).
    for(let _ti = 0; _ti < _deferredThumbs.length; _ti++){
      renderAssetThumb(_deferredThumbs[_ti]);
      if((_ti + 1) % 8 === 0) await _yield();
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
    if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
    setLoadingMsg('Done!');
    refreshTexPickerLists();
    updateAssetEmptyState();
    console.log(`[SFS|LOAD] done — ${planetCount} bodies, textureCache keys: [${Object.keys(textureCache).join(',')}]`);

    // ── Populate system presets from loaded bodies ─────────────────────
    // Clear previous system presets and repopulate from the newly loaded bodies.
    Object.keys(systemPresets).forEach(k => delete systemPresets[k]);
    const systemName = file.name.replace(/\.zip$/i, '');
    systemPresetsName = systemName;
    Object.entries(bodies).forEach(([name, b]) => {
      systemPresets[name] = JSON.parse(JSON.stringify(b.data));
    });
    // If this system was previously imported as a named bucket (via IMPORT),
    // remove that bucket so the same bodies don't appear under two separate tabs.
    const _derivedLabel = systemName.replace(/-?\d+(\.\d+)*$/, '').trim();
    if(typeof dynamicPresetSources !== 'undefined' && dynamicPresetSources[_derivedLabel]){
      delete dynamicPresetSources[_derivedLabel];
      if(typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
    }
    // Show/hide the SYSTEM tab in the preset modal based on whether bodies loaded
    prsRefreshSystemTab();

    setTimeout(() => { hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM'); goNew(); setTimeout(() => { console.log('[SFS|LOAD] delayed redraw, textureCache:', Object.keys(textureCache)); drawViewport(); }, 500); }, 350);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('Load error:', err);
    alert('Failed to load zip: ' + err.message);
  }
}


// ── Import a featured zip — loads assets only, does NOT open/switch the system ──
async function importFeatured(url, displayName){
  // Wait for startup autoload to finish so we don't clobber dynamicPresets mid-flight
  if(_autoLoadPromise){ try{ await _autoLoadPromise; } catch(_){} }

  showLoading(); showLoadingBars();
  setLoadingTitle('IMPORTING ASSETS');
  setLoadingMsg('Downloading ' + displayName + '…');
  try {
    setBar1(0, 'DOWNLOADING');
    const resp = await fetch(url);
    if(!resp.ok) throw new Error(`HTTP ${resp.status} — could not fetch ${displayName}`);

    const contentLength = resp.headers.get('Content-Length');
    let buffer;
    if(contentLength){
      const total = parseInt(contentLength, 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        received += value.length;
        setBar1(received / total * 100);
      }
      const full = new Uint8Array(received);
      let off = 0;
      for(const c of chunks){ full.set(c, off); off += c.length; }
      buffer = full.buffer;
    } else {
      setBar1(50, 'DOWNLOADING…');
      buffer = await resp.arrayBuffer();
      setBar1(100);
    }

    setBar1(100, 'DECOMPRESSING');
    // Derive a short label from the zip name (e.g. "BGH Full Release-1.2.1.zip" → "BGH Full Release")
    const _namedCat = displayName.replace(/\.zip$/i,'').replace(/-?\d+(\.\d+)*$/, '').trim();
    const res = await _loadSFSAssetBuffer(
      buffer, displayName,
      pct => setBar1(pct, 'DECOMPRESSING'),
      pct => setBar2(pct),
      _namedCat
    );

    // Show completion state on the overlay, then auto-dismiss
    hideLoadingBars();
    const spinner = document.querySelector('#loading-overlay .loading-spinner');
    if(spinner){ spinner.style.display = 'none'; }
    setLoadingTitle('IMPORT COMPLETE');
    const errNote = res.errors ? `  ·  ${res.errors} error(s)` : '';
    setLoadingMsg(`${res.totalTextures} texture(s)  ·  ${res.totalPresets} preset(s)${errNote}`);
    await new Promise(r => setTimeout(r, 2000));
    hideLoading();
    if(spinner){ spinner.style.display = ''; }
    setLoadingTitle('LOADING SYSTEM');
    setLoadingMsg('Reading zip…');
    // Refresh preset modal tabs and grid if open
    if(typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
    if(typeof prsRebuild === 'function') prsRebuild();
  } catch(err){
    hideLoading(); hideLoadingBars();
    console.error('Featured import error:', err);
    alert('Failed to import "' + displayName + '":\n' + err.message);
  }
}

// ── Load a system zip directly from a URL (used by Featured Systems cards) ──
// GitHub raw URLs are CORS-blocked, so we mirror through jsDelivr CDN.
// Pass a jsDelivr URL: https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
async function loadZipFromUrl(cdnUrl, displayName){
  showLoading(); setLoadingMsg('Downloading ' + displayName + '…');
  try {
    // Warn before clearing an active session
    if(Object.keys(bodies).length > 0){
      hideLoading(); hideLoadingBars();
      if(!confirm('Clear current system and load "' + displayName + '"?')){
        return;
      }
      showLoading(); setLoadingMsg('Downloading ' + displayName + '…');
    }

    showLoadingBars();
    setBar1(0, 'DOWNLOADING');

    const resp = await fetch(cdnUrl);
    if(!resp.ok) throw new Error(`HTTP ${resp.status} — could not fetch ${displayName}`);

    const contentLength = resp.headers.get('Content-Length');
    let buffer;
    if(contentLength){
      const total = parseInt(contentLength, 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        received += value.length;
        setBar1(received / total * 100);
      }
      const full = new Uint8Array(received);
      let off = 0;
      for(const c of chunks){ full.set(c, off); off += c.length; }
      buffer = full.buffer;
    } else {
      setBar1(50, 'DOWNLOADING…');
      buffer = await resp.arrayBuffer();
      setBar1(100);
    }

    // Feed through the same pipeline as a manually-uploaded zip
    const fakeFile = new File([buffer], displayName, { type: 'application/zip' });
    hideLoading(); hideLoadingBars();
    await loadZipFile(fakeFile);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('Featured system load error:', err);
    alert('Failed to download "' + displayName + '":\n' + err.message);
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
  { url: 'assets/Custom presets and Textures.zip',  name: 'Custom presets and Textures.zip' },
  { url: 'assets/Terrain.zip',                      name: 'Terrain.zip' },
  { url: 'assets/Terrain Custom.zip',               name: 'Terrain Custom.zip' },
];

// Auto-fetch remote asset zip on startup (online users only).
// Falls back gracefully if offline or URL is null.
let _remoteAbortCtrl = null;
let _autoLoadPromise = null;   // resolves when startup autoload finishes (or fails)
function cancelRemoteAssets(){ if(_remoteAbortCtrl) _remoteAbortCtrl.abort(); }

// ── IDB cache replay helpers ──────────────────────────────────────────────────

// Yield to the browser for one frame so the loading screen can paint.
function _yieldFrame(){ return new Promise(r => requestAnimationFrame(r)); }

// Replay a cached asset payload directly into the live stores (no network, no
// decompression).  Shows a loading screen with progress.
// Returns { totalTextures, totalPresets }.
async function _replayFromCache(record, { showUI = false, progressLabel = '' } = {}){
  let totalTextures = 0, totalPresets = 0;

  const textures = record.textures || [];
  const total    = textures.length;

  if(showUI && total > 0){
    showLoading();
    showLoadingBars();
    setLoadingTitle('LOADING ASSETS');
    setLoadingMsg(progressLabel || 'Reading cache…');
    setBar1(0, 'CACHE REPLAY');
    setBar2(null, 'LOADING TEXTURES');
    await _yieldFrame(); // let the overlay paint before we start work
  }

  // ── Bulk mode: tell the decode queue to suppress per-texture redraws ────────
  // On low-end phones, firing drawViewport + refreshTexPickerLists for every
  // decoded image causes cascading reflows that exhaust memory.  We collect
  // all cacheTexture() calls first (just enqueuing them), then let the queue
  // drain with only a single final notify at the end.
  _bulkLoadActive = true;

  // Collect entries that need adding (deduplicate against already-loaded)
  const toAdd = [];
  for(let i = 0; i < textures.length; i++){
    const t = textures[i];
    if(!assets.textures.find(a => a.name === t.name)){
      cacheTexture(t.name.replace(/\.[^.]+$/,''), t.url); // enqueue decode
      assets.textures.push(t);                             // register immediately
      toAdd.push(t);
      totalTextures++;
    }
    // Update progress bar periodically so the loading screen stays alive
    if(showUI && (i + 1) % 16 === 0){
      setBar1((i + 1) / total * 100, 'CACHE REPLAY');
      await _yieldFrame();
    }
  }
  if(showUI && total > 0) setBar1(100, 'CACHE REPLAY');

  // Wait for the decode queue to fully drain before touching the DOM.
  // Poll with short yields — avoids holding a microtask chain open.
  while(_decodeRunning || _decodeQueue.length > 0){
    await new Promise(r => setTimeout(r, 32));
    if(showUI) setBar1(100, 'CACHE REPLAY');
  }

  // Now it's safe to build DOM thumbnails (decode queue is idle, memory pressure gone)
  _bulkLoadActive = false;
  for(const t of toAdd) renderAssetThumb(t);

  // Presets (vanilla / custom)
  const dp = record.presets || {};
  for(const cat of ['vanilla','custom']){
    if(dp[cat]){
      for(const [k,v] of Object.entries(dp[cat])){
        dynamicPresets[cat][k] = v;
        totalPresets++;
      }
    }
  }

  // Named preset sources
  for(const [label, src] of Object.entries(record.namedSources || {})){
    dynamicPresetSources[label] = src;
    totalPresets += Object.keys(src.presets||{}).length;
  }

  // Heightmaps
  for(const h of (record.heightmaps || [])){
    if(!assets.heightmaps.find(a => a.name === h.name)){
      assets.heightmaps.push(h);
      renderAssetRow(h, 'heightmaps');
      injectCustomHeightmap(h.name);
    }
  }

  if(totalTextures > 0){ refreshTexPickerLists(); updateAssetEmptyState(); drawViewport(); }
  return { totalTextures, totalPresets };
}

// Snapshot assets that were added during a fresh load so we can persist them.
function _snapshotNewAssets(texBefore, presetsBefore, hmBefore){
  const textures = assets.textures.slice(texBefore);
  const heightmaps = assets.heightmaps.slice(hmBefore);

  // Preset delta (vanilla + custom)
  const presets = { vanilla:{}, custom:{} };
  const dpv = Object.keys(dynamicPresets.vanilla);
  const dpc = Object.keys(dynamicPresets.custom);
  dpv.slice(presetsBefore.vanilla).forEach(k => { presets.vanilla[k] = dynamicPresets.vanilla[k]; });
  dpc.slice(presetsBefore.custom ).forEach(k => { presets.custom[k]  = dynamicPresets.custom[k];  });

  // Snapshot named preset sources added during this load
  const namedSources = {};
  for(const [label, src] of Object.entries(dynamicPresetSources)){
    namedSources[label] = src;
  }

  return { textures, presets, heightmaps, namedSources };
}

// ── Main autoload (with IDB cache) ───────────────────────────────────────────
// Strategy: CACHE-FIRST (stale-while-revalidate)
//   1. Read IDB immediately — if cached, replay assets NOW with zero network I/O.
//   2. After serving from cache, do a background HEAD check per URL.
//      If ETag changed, re-download silently and update IDB for the next load.
//   3. If no cache entry exists, do a normal download (first-time user).
//
// Result: returning users see assets instantly; fresh assets arrive next visit.

async function autoLoadRemoteAssets(){
  if(!REMOTE_ASSETS_URLS || !REMOTE_ASSETS_URLS.length) return;
  const statusEl  = document.getElementById('default-tex-status');
  const btn       = document.getElementById('btn-load-assets');
  const cancelBtn = document.getElementById('btn-cancel-remote');

  _remoteAbortCtrl = new AbortController();
  const signal = _remoteAbortCtrl.signal;

  let totalTextures = 0, totalPresets = 0, errors = 0;
  let anyMissing = false;

  if(statusEl){ statusEl.textContent = '\u23f3 Loading assets\u2026'; statusEl.style.color = 'var(--sky2)'; }

  // ── PASS 1: serve everything already in IDB — no network ──────────────────
  // We show the loading screen even for cache hits so the user sees progress
  // instead of a frozen / unresponsive page while textures are being decoded.
  const cacheRecords = [];
  let   anyCacheHit  = false;
  for(let i = 0; i < REMOTE_ASSETS_URLS.length; i++){
    const { url, name: fname } = REMOTE_ASSETS_URLS[i];
    const cached = await idbCacheRead(url);
    cacheRecords.push(cached);
    // A valid cache record just needs to exist — it may have textures, presets,
    // heightmaps, or any combination. Don't gate on textures.length > 0.
    const isCacheHit = cached && (
      (cached.textures    && cached.textures.length    > 0) ||
      (cached.heightmaps  && cached.heightmaps.length  > 0) ||
      (cached.namedSources && Object.keys(cached.namedSources).length > 0) ||
      (cached.presets && (
        Object.keys(cached.presets.vanilla || {}).length > 0 ||
        Object.keys(cached.presets.custom  || {}).length > 0
      ))
    );
    if(isCacheHit){
      anyCacheHit = true;
      const label = `(${i+1}/${REMOTE_ASSETS_URLS.length}) ${fname}`;
      const r = await _replayFromCache(cached, { showUI: true, progressLabel: label });
      totalTextures += r.totalTextures;
      totalPresets  += r.totalPresets;
      console.log(`[SFS|IDB] Cache hit: "${fname}" (${r.totalTextures} tex, ${r.totalPresets} presets)`);
    } else {
      anyMissing = true;
    }
  }
  // Dismiss loading screen after the cache pass (before any download pass).
  if(anyCacheHit){
    hideLoading();
    hideLoadingBars();
    setLoadingTitle('LOADING SYSTEM');
  }

  // All served from cache — finalise and kick off background revalidation.
  if(!anyMissing){
    _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors);
    _revalidateCacheInBackground(REMOTE_ASSETS_URLS, cacheRecords).catch(() => {});
    return;
  }

  // ── PASS 2: download any URLs with no cache entry (first-time / cleared) ──
  showLoading();
  showLoadingBars();
  setLoadingTitle('LOADING ASSETS');
  if(cancelBtn) cancelBtn.style.display = '';
  let cancelled = false;

  for(let i = 0; i < REMOTE_ASSETS_URLS.length; i++){
    if(signal.aborted){ cancelled = true; break; }
    const cr = cacheRecords[i];
    const alreadyServed = cr && (
      (cr.textures    && cr.textures.length    > 0) ||
      (cr.heightmaps  && cr.heightmaps.length  > 0) ||
      (cr.namedSources && Object.keys(cr.namedSources).length > 0) ||
      (cr.presets && (
        Object.keys(cr.presets.vanilla || {}).length > 0 ||
        Object.keys(cr.presets.custom  || {}).length > 0
      ))
    );
    if(alreadyServed) continue; // already served from cache in Pass 1

    const { url, name: fname } = REMOTE_ASSETS_URLS[i];
    setLoadingMsg(`(${i+1}/${REMOTE_ASSETS_URLS.length}) ${fname}`);
    setBar1(0, 'DOWNLOADING');
    setBar2(null, 'LOADING TEXTURES');

    try{
      const resp = await fetch(url, { signal });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const freshEtag = resp.headers.get('ETag') || resp.headers.get('Last-Modified') || null;
      const freshSize = parseInt(resp.headers.get('Content-Length')||'0', 10);

      const contentLength = resp.headers.get('Content-Length');
      let buffer;
      if(contentLength){
        const total  = parseInt(contentLength, 10);
        const reader = resp.body.getReader();
        const chunks = []; let received = 0;
        while(true){
          if(signal.aborted){ reader.cancel(); cancelled = true; break; }
          const { done, value } = await reader.read();
          if(done) break;
          chunks.push(value); received += value.length;
          setBar1(received / total * 100);
        }
        if(cancelled) break;
        const full = new Uint8Array(received);
        let off = 0;
        for(const c of chunks){ full.set(c, off); off += c.length; }
        buffer = full.buffer;
      } else {
        setBar1(50, 'DOWNLOADING\u2026');
        buffer = await resp.arrayBuffer();
        setBar1(100);
      }

      const texBefore     = assets.textures.length;
      const hmBefore      = assets.heightmaps.length;
      const presetsBefore = {
        vanilla: Object.keys(dynamicPresets.vanilla).length,
        custom:  Object.keys(dynamicPresets.custom).length,
      };

      setBar1(100, 'DECOMPRESSING');
      const res = await _loadSFSAssetBuffer(
        buffer, fname,
        pct => setBar1(pct, 'DECOMPRESSING'),
        pct => setBar2(pct)
      );
      totalTextures += res.totalTextures;
      totalPresets  += res.totalPresets;
      errors        += res.errors;

      const payload = _snapshotNewAssets(texBefore, presetsBefore, hmBefore);
      const hasContent = payload.textures.length > 0 || payload.heightmaps.length > 0 ||
        Object.keys(payload.presets.vanilla).length > 0 ||
        Object.keys(payload.presets.custom).length  > 0 ||
        Object.keys(payload.namedSources).length    > 0;
      if(hasContent){
        idbCacheWrite(url, freshEtag, freshSize, payload).then(ok => {
          if(ok) console.log(`[SFS|IDB] Cached "${fname}" (${payload.textures.length} tex, etag=${freshEtag})`);
        });
      }

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
    if(statusEl){ statusEl.textContent = '\u26a0 Download cancelled \u2014 upload zips manually'; statusEl.style.color = 'var(--amber)'; }
    return;
  }

  _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors);
  _revalidateCacheInBackground(REMOTE_ASSETS_URLS, cacheRecords).catch(() => {});
}

// ── Shared UI finalise ────────────────────────────────────────────────────────
function _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors){
  if(cancelBtn) cancelBtn.style.display = 'none';
  const parts = [];
  if(totalTextures > 0) parts.push(`${totalTextures} texture${totalTextures!==1?'s':''}`);
  if(totalPresets  > 0) parts.push(`${totalPresets} preset${totalPresets!==1?'s':''}`);
  if(statusEl){
    if(errors > 0 && totalTextures === 0){
      statusEl.textContent = '\u26a0 Remote assets unavailable \u2014 upload zip manually';
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = parts.length
        ? `\u2713 Assets loaded: ${parts.join(', ')}`
        : '\u2713 Assets loaded';
      statusEl.style.color = 'var(--jade)';
    }
  }
  if(btn && totalTextures > 0) btn.style.display = 'none';
}

// ── Background revalidation ────────────────────────────────────────────────────
// Runs silently after assets are already displayed. Checks ETags via HEAD;
// if a zip changed, re-downloads it and updates IDB so the next startup is fresh.
async function _revalidateCacheInBackground(urls, cacheRecords){
  await new Promise(r => setTimeout(r, 3000)); // yield to let the page settle
  for(let i = 0; i < urls.length; i++){
    const { url, name: fname } = urls[i];
    const cached = cacheRecords[i];
    try{
      const head = await fetch(url, { method: 'HEAD' });
      if(!head.ok) continue;
      const freshEtag = head.headers.get('ETag') || head.headers.get('Last-Modified') || null;
      if(!freshEtag) continue; // server gives no ETag — cannot detect staleness
      if(cached && cached.etag === freshEtag){
        console.log(`[SFS|IDB] BG revalidate: "${fname}" still fresh`);
        continue;
      }
      // Stale — silently re-download for next startup
      console.log(`[SFS|IDB] BG revalidate: "${fname}" changed (${cached?.etag} \u2192 ${freshEtag}), refreshing cache\u2026`);
      const resp = await fetch(url);
      if(!resp.ok) continue;
      const freshSize = parseInt(resp.headers.get('Content-Length')||'0', 10);
      const buffer    = await resp.arrayBuffer();

      const texBefore     = assets.textures.length;
      const hmBefore      = assets.heightmaps.length;
      const presetsBefore = {
        vanilla: Object.keys(dynamicPresets.vanilla).length,
        custom:  Object.keys(dynamicPresets.custom).length,
      };
      await _loadSFSAssetBuffer(buffer, fname, ()=>{}, ()=>{});
      const payload = _snapshotNewAssets(texBefore, presetsBefore, hmBefore);
      await idbCacheWrite(url, freshEtag, freshSize, payload);
      console.log(`[SFS|IDB] BG revalidate: "${fname}" cache updated`);
    } catch(e){
      // Offline or CORS — silently skip, try again next load
    }
  }
}

// Expose cache-clear for the settings panel
async function clearAssetCache(){
  await idbCacheClear();
  console.log('[SFS|IDB] Asset cache cleared');
}

// ── Dynamic preset store — populated when asset zips are loaded ──────────────
// vanilla/custom are the two built-in categories from the autoload zips.
// namedSources holds presets from named imports (e.g. BGH), keyed by a short
// display label derived from the zip filename.
const dynamicPresets = { vanilla: {}, custom: {} };
const dynamicPresetSources = {}; // { label: { presets:{}, zipName:'' } }

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
async function _loadSFSAssetBuffer(buffer, zipName, onDecompProgress, onTexProgress, namedCategory){
  const rawEntries = parseZip(buffer);
  const entries = await decompressEntries(rawEntries, onDecompProgress);
  let totalTextures = 0, totalPresets = 0, errors = 0;
  // Treat every file in Terrain.zip / Terrain Custom.zip as heightmap assets
  const _zipNameLower = (zipName || '').toLowerCase();
  const _forceHeightmap = _zipNameLower === 'terrain.zip' || _zipNameLower === 'terrain custom.zip';

  // Bulk mode: suppress per-texture redraws inside the decode queue.
  _bulkLoadActive = true;
  const _thumbsDeferred = []; // renderAssetThumb calls deferred until queue drains

  // If this is a named import (e.g. BGH, HTSS), reset the bucket up-front so
  // re-importing the same system replaces it instead of accumulating duplicates.
  if(namedCategory) dynamicPresetSources[namedCategory] = { presets:{}, zipName };

  // Pre-count texture entries for progress reporting
  const allEntries = Object.entries(entries);
  const texTotal = allEntries.filter(([path]) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    const ext = p.split('.').pop();
    return ['png','jpg','jpeg','webp'].includes(ext) && !_forceHeightmap && !_isHeightmapPath(p) && !p.includes('planet data');
  }).length || 1;
  let texDone = 0;

  for(let i = 0; i < allEntries.length; i++){
    const [path, data] = allEntries[i];
    const normPath = path.replace(/\\/g, '/');
    const pathLower = normPath.toLowerCase();
    const parts = normPath.split('/');
    const filename = parts[parts.length - 1];
    if(!filename) continue;

    if(_forceHeightmap || _isHeightmapPath(pathLower)){
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
        if(namedCategory){
          // Named import (e.g. BGH) — store in its own bucket, never touch vanilla/custom
          if(!dynamicPresetSources[namedCategory]) dynamicPresetSources[namedCategory] = { presets:{}, zipName };
          dynamicPresetSources[namedCategory].presets[pname] = parsed;
        } else {
          const cat = _presetCategory(pathLower) || 'custom';
          dynamicPresets[cat][pname] = parsed;
        }
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
        _thumbsDeferred.push(entry); // render thumb after queue drains
        totalTextures++;
      }

      texDone++;
      if(onTexProgress) onTexProgress(texDone / texTotal * 100);
      // Yield every 4 textures — btoa on large images is expensive on weak devices
      if(texDone % 4 === 0) await _yield();
    }
  }

  // Wait for decode queue to fully drain, then render thumbnails and notify.
  while(_decodeRunning || _decodeQueue.length > 0){
    await new Promise(r => setTimeout(r, 32));
  }
  _bulkLoadActive = false;
  for(const entry of _thumbsDeferred) renderAssetThumb(entry);

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

// Init — deferred so all scripts have loaded regardless of order
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function(){ if(typeof resizeViewport==='function') resizeViewport(); }, 50);
  setTimeout(function(){ if(typeof initUnitInputs==='function') initUnitInputs(); }, 100);
});
// Auto-fetch remote assets if URL is configured (no-op when REMOTE_ASSETS_URL is null)
_autoLoadPromise = autoLoadRemoteAssets();


// ════════════════════════════════════════════════════════════════════════════
// ── IMPORT SYSTEM — merge a second system zip into the current session ──
// ════════════════════════════════════════════════════════════════════════════

let _importOpt = 'a'; // 'a' = barycentre, 'b' = new orbits existing centre, 'c' = new orbits chosen body

function openImportSystemModal(){
  // Must have an active session to import into
  if(Object.keys(bodies).length === 0){
    alert('Load or create a system first before importing into it.');
    return;
  }
  // Populate parent-body dropdown for option C
  const sel = document.getElementById('imp-c-parent');
  sel.innerHTML = '';
  Object.keys(bodies).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    sel.appendChild(opt);
  });
  // Default selection to centre if present
  const centreName = Object.keys(bodies).find(n => bodies[n].isCenter);
  if(centreName) sel.value = centreName;

  _importOpt = 'a';
  selectImportOpt('a', /*silent*/true);
  document.getElementById('modal-import-system').classList.add('open');
}

function closeImportSystemModal(){
  document.getElementById('modal-import-system').classList.remove('open');
}

function selectImportOpt(opt, silent){
  _importOpt = opt;
  ['a','b','c'].forEach(o => {
    const card = document.getElementById('imp-opt-' + o);
    if(card) card.classList.toggle('imp-opt-sel', o === opt);
  });
}

async function importSystemZip(file){
  if(!file) return;
  closeImportSystemModal();

  const AU_m = 1.496e11;
  const opt  = _importOpt;
  const baryAU  = parseFloat(document.getElementById('imp-bary-au')?.value) || 10;
  const bAU     = parseFloat(document.getElementById('imp-b-au')?.value)    || 20;
  const cParent = document.getElementById('imp-c-parent')?.value            || '';
  const cAU     = parseFloat(document.getElementById('imp-c-au')?.value)    || 5;

  showLoading(); showLoadingBars();
  setLoadingTitle('IMPORTING SYSTEM');
  setLoadingMsg('Reading zip…');

  try {
    const buffer = await file.arrayBuffer();
    setLoadingMsg('Parsing entries…');
    setBar1(0, 'DECOMPRESSING');
    const rawEntries = parseZip(buffer);
    const entries    = await decompressEntries(rawEntries, pct => setBar1(pct));
    const dec = bytes => new TextDecoder().decode(bytes);

    // ── Parse the incoming system into a temporary bodies map ──
    const inBodies = {}; // name → { data, isCenter, _lacksOrbit, preset, color, glow, icon }
    let   planetCount = 0;
    setBar2(0, 'LOADING BODIES');
    const entryKeys  = Object.keys(entries);
    const entryTotal = entryKeys.length || 1;
    let   entryIdx   = 0;

    for(const [path, data] of Object.entries(entries)){
      entryIdx++;
      setBar2(entryIdx / entryTotal * 100);
      const parts    = path.split('/');
      const folder   = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      const filename = parts[parts.length - 1];
      setLoadingMsg(`Loading ${filename}…`);

      if(folder === 'Planet Data' && filename.endsWith('.txt')){
        try{
          const raw = dec(data);
          const name = filename.replace('.txt','');
          if(['Import_Settings','Space_Center_Data','Version'].includes(name)) continue;
          const fixedRaw = raw
            .replace(/,\s*([}\]])/g, '$1')
            .replace(/(\d)\.(?=[,\s}\]])/g, '$10')
            .replace(/:\s*Infinity\b/g,  ': 1e38')
            .replace(/:\s*-Infinity\b/g, ': -1e38')
            .replace(/:\s*NaN\b/g,       ': 0');
          const bodyData = normalizeDiffScaleKeys(JSON.parse(fixedRaw));
          const lacksOrbit = !bodyData.ORBIT_DATA;
          const _meta = inferPresetMeta(name, bodyData);
          inBodies[name] = { data: bodyData, preset: _meta.id, isCenter: false,
                             _lacksOrbit: lacksOrbit, color: _meta.color, glow: _meta.glow, icon: _meta.icon };
          planetCount++;
        } catch(e){ console.warn('[IMPORT] failed to parse', filename, e); }

      } else if(folder === 'Texture Data'){
        const ext = filename.split('.').pop().toLowerCase();
        if(!['png','jpg','jpeg','webp'].includes(ext)) continue;
        const mime  = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        const b64   = bytesToBase64(data);
        const url   = `data:${mime};base64,${b64}`;
        if(!assets.textures.find(a => a.name === filename)){
          const entry = { name: filename, url, size: data.length };
          assets.textures.push(entry);
          renderAssetThumb(entry);
          cacheTexture(filename.replace(/\.[^.]+$/, ''), url);
        }

      } else if(folder === 'Heightmap Data' && filename.endsWith('.txt')){
        const content = dec(data);
        const entry = { name: filename, content, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }

      } else if(folder === 'Heightmap Data' && /\.(png|jpe?g)$/i.test(filename)){
        const ext  = filename.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const url  = `data:${mime};base64,${bytesToBase64(data)}`;
        if(!assets.heightmaps.find(a => a.name === filename)){
          const entry = { name: filename, url, size: data.length };
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      }
    }

    if(planetCount === 0){
      hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
      alert('No planet files found in the import zip.');
      return;
    }

    // Elect incoming centre (no-orbit body with largest radius)
    const noOrbit = Object.entries(inBodies).filter(([,b]) => b._lacksOrbit);
    let inCentreName = null;
    if(noOrbit.length > 0){
      noOrbit.sort(([,a],[,b]) => ((b.data.BASE_DATA||{}).radius||0) - ((a.data.BASE_DATA||{}).radius||0));
      noOrbit[0][1].isCenter = true;
      inCentreName = noOrbit[0][0];
    }
    Object.values(inBodies).forEach(b => delete b._lacksOrbit);

    // ── Resolve name collisions: prefix all imported names with the zip stem ──
    const stem    = file.name.replace(/\.zip$/i,'').replace(/[^A-Za-z0-9_\- ]/g,'').trim() || 'Imported';
    const renamed = {}; // oldName → newName

    Object.keys(inBodies).forEach(oldName => {
      let newName = oldName;
      if(bodies[newName]){
        newName = stem + '_' + oldName;
        let counter = 2;
        while(bodies[newName] || renamed[newName]) newName = stem + '_' + oldName + '_' + (counter++);
      }
      renamed[oldName] = newName;
    });

    // Rewrite parent references inside imported system
    Object.entries(inBodies).forEach(([, b]) => {
      if(b.data.ORBIT_DATA?.parent){
        const oldParent = b.data.ORBIT_DATA.parent;
        if(renamed[oldParent]) b.data.ORBIT_DATA.parent = renamed[oldParent];
      }
    });

    // ── Determine existing centre ──
    const exCentreName = Object.keys(bodies).find(n => bodies[n].isCenter) || null;

    // ── Apply merge mode ──
    const importedCentreBody = inCentreName ? inBodies[inCentreName] : null;

    if(opt === 'a'){
      // ── Mode A: Shared barycentre ──
      // 1. Create a barycentre body (no mass, no atmosphere, just a marker)
      const baryName = _uniqueName('Barycentre', bodies);
      const barySMA  = baryAU * AU_m;

      // Give existing centre an orbit around barycentre
      if(exCentreName){
        bodies[exCentreName].isCenter = false;
        bodies[exCentreName].data.ORBIT_DATA = {
          parent: baryName, semiMajorAxis: barySMA * 0.5,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

      // Give imported centre an orbit around barycentre
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: baryName, semiMajorAxis: barySMA * 0.5,
          eccentricity: 0, argumentOfPeriapsis: 180, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

      // Insert barycentre as new system centre (tiny invisible body)
      bodies[baryName] = {
        data: {
          BASE_DATA: { radius: 1000, gravity: 0, gravityDifficultyScale: {},
                       radiusDifficultyScale: {}, bodyType: 0 }
        },
        preset: 'asteroid', isCenter: true,
        color: '#aaaaaa', glow: false, icon: '⚫'
      };

    } else if(opt === 'b'){
      // ── Mode B: Imported centre orbits existing centre ──
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: exCentreName || Object.keys(bodies)[0],
          semiMajorAxis: bAU * AU_m,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

    } else if(opt === 'c'){
      // ── Mode C: Imported centre orbits chosen body ──
      const parentBody = cParent && bodies[cParent] ? cParent : (exCentreName || Object.keys(bodies)[0]);
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: parentBody,
          semiMajorAxis: cAU * AU_m,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }
    }

    // ── Commit renamed imported bodies into global bodies map ──
    Object.entries(inBodies).forEach(([oldName, b]) => {
      const newName = renamed[oldName];
      bodies[newName] = b;
    });

    // ── Wrap up ──
    if(typeof fillSidebar === 'function') fillSidebar();
    updateStatusBar();
    syncAddBodyBtn();
    if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
    refreshTexPickerLists();
    updateAssetEmptyState();
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    if(hasCenter) document.getElementById('empty-state').classList.add('gone');

    setLoadingMsg('Done!');
    setTimeout(() => {
      hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
      goNew();
      setTimeout(() => drawViewport(), 400);
    }, 350);

    console.log(`[SFS|IMPORT] merged ${planetCount} bodies using mode "${opt}"; renamed:`, renamed);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('[SFS|IMPORT] error:', err);
    alert('Failed to import zip: ' + err.message);
  }
}

/** Return a name not already in bodies, appending _2, _3, … as needed. */
function _uniqueName(base, bodyMap){
  if(!bodyMap[base]) return base;
  let i = 2;
  while(bodyMap[base + '_' + i]) i++;
  return base + '_' + i;
}

