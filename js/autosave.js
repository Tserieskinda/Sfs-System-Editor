// ════════════════════════════════ AUTOSAVE ════════════════════════════════
// Persists the full editor session to IndexedDB:
//   • bodies + systemSettings  (session record, key='session')
//   • non-vanilla textures      (one IDB record per entry, key='tex:<name>')
//   • heightmaps                (one IDB record per entry, key='hm:<name>')
//   • other assets              (one IDB record per entry, key='oth:<name>')
//   • dynamicPresetSources      (named featured-system buckets, key='dps')
//
// Vanilla textures are excluded — they are already cached in the 'assets'
// store by idb-cache.js and auto-reload from jsDelivr on startup.
//
// Storage keys live in the 'autosave' object store inside 'sfs-asset-cache'
// (same DB as idb-cache.js, version bumped to 2).
//
// Save triggers:
//   • 2-second debounce after every pushUndo() call
//   • 30-second heartbeat (dirty-flag guarded)
//   • autosaveFlush() exposed for external callers (e.g. importFeatured)
// ─────────────────────────────────────────────────────────────────────────────

const _AS_DB_NAME    = 'sfs-asset-cache';
const _AS_DB_VERSION = 2;
const _AS_STORE      = 'autosave';
const _AS_INTERVAL   = 30_000;
const _AS_SCHEMA_VER = 2;   // bump if saved shape changes (clears stale data)

let _asDb        = null;
let _asTimer     = null;
let _asDirty     = false;
let _asSaving    = false;   // re-entrancy guard

// ── DB open ────────────────────────────────────────────────────────────────
function _asOpenDB() {
  if (_asDb) return Promise.resolve(_asDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_AS_DB_NAME, _AS_DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_AS_STORE)) {
        db.createObjectStore(_AS_STORE, { keyPath: 'key' });
      }
      // Mirror: ensure idb-cache.js's store exists regardless of open order
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'url' });
      }
    };

    req.onsuccess  = e => { _asDb = e.target.result; resolve(_asDb); };
    req.onerror    = e => reject(e.target.error);
    req.onblocked  = ()  => console.warn('[SFS|AS] IDB upgrade blocked — close other tabs');
  });
}

// ── Low-level IDB helpers ──────────────────────────────────────────────────
function _asPut(db, record) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_AS_STORE, 'readwrite');
    const req = tx.objectStore(_AS_STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

function _asGet(db, key) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_AS_STORE, 'readonly');
    const req = tx.objectStore(_AS_STORE).get(key);
    req.onsuccess = e => resolve(e.target.result || null);
    req.onerror   = e => reject(e.target.error);
  });
}

function _asGetAll(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_AS_STORE, 'readonly');
    const req = tx.objectStore(_AS_STORE).getAll();
    req.onsuccess = e => resolve(e.target.result || []);
    req.onerror   = e => reject(e.target.error);
  });
}

function _asDeleteAll(db) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(_AS_STORE, 'readwrite');
    const req = tx.objectStore(_AS_STORE).clear();
    req.onsuccess = () => resolve();
    req.onerror   = e  => reject(e.target.error);
  });
}

// ── Collect assets that need saving ───────────────────────────────────────
// Vanilla textures (.vanilla === true) come from autoload zips already cached
// in idb-cache.js, so we skip them — they restore automatically on startup.
function _asCollectAssets() {
  const textures   = (typeof assets !== 'undefined' ? assets.textures   : []).filter(e => !e.vanilla);
  const heightmaps = (typeof assets !== 'undefined' ? assets.heightmaps : []);
  const other      = (typeof assets !== 'undefined' ? assets.other      : []);
  const dps        = (typeof dynamicPresetSources !== 'undefined') ? dynamicPresetSources : {};
  return { textures, heightmaps, other, dps };
}

// ── Write ──────────────────────────────────────────────────────────────────
async function autosaveWrite() {
  if (_asSaving) return;
  if (typeof bodies === 'undefined') return;
  const bodyCount = Object.keys(bodies).length;
  if (bodyCount === 0) return;

  _asSaving = true;
  try {
    const db = await _asOpenDB();
    const { textures, heightmaps, other, dps } = _asCollectAssets();

    const now = Date.now();

    // 1 — session record (bodies + settings, no binary data)
    await _asPut(db, {
      key:        'session',
      _schemaVer: _AS_SCHEMA_VER,
      savedAt:    now,
      bodyCount,
      texCount:   textures.length,
      hmCount:    heightmaps.length,
      othCount:   other.length,
      dpsKeys:    Object.keys(dps),
      bodies:     JSON.parse(JSON.stringify(bodies)),
      settings:   JSON.parse(JSON.stringify(
                    typeof systemSettings !== 'undefined' ? systemSettings : {}
                  )),
    });

    // 2 — non-vanilla textures (one record each, keyed by name)
    for (const t of textures) {
      await _asPut(db, { key: 'tex:' + t.name, name: t.name, url: t.url, size: t.size });
    }

    // 3 — heightmaps (one record each)
    for (const h of heightmaps) {
      // heightmaps from ZIPs use .content (text), user-uploaded images use .url
      await _asPut(db, { key: 'hm:' + h.name, name: h.name,
                         url: h.url || null, content: h.content || null, size: h.size });
    }

    // 4 — other assets (one record each)
    for (const o of other) {
      await _asPut(db, { key: 'oth:' + o.name, name: o.name,
                         url: o.url || null, content: o.content || null, size: o.size });
    }

    // 5 — dynamicPresetSources (featured system named buckets)
    if (Object.keys(dps).length > 0) {
      await _asPut(db, { key: 'dps', data: JSON.parse(JSON.stringify(dps)) });
    }

    _asDirty = false;
    console.log(`[SFS|AS] saved — ${bodyCount} bodies, ${textures.length} tex, ${heightmaps.length} hm, ${other.length} other, ${Object.keys(dps).length} dps`);
  } catch (e) {
    console.warn('[SFS|AS] write error:', e);
  } finally {
    _asSaving = false;
  }
}

// Public flush — call after importFeatured / asset upload to force immediate save
async function autosaveFlush() {
  clearTimeout(pushUndo._debounce);
  await autosaveWrite();
}

// ── Clear ──────────────────────────────────────────────────────────────────
async function autosaveClear() {
  try {
    const db = await _asOpenDB();
    await _asDeleteAll(db);
    console.log('[SFS|AS] cleared');
  } catch (e) {
    console.warn('[SFS|AS] clear error:', e);
  }
}

// ── Read session manifest ──────────────────────────────────────────────────
async function _asReadSession() {
  try {
    const db  = await _asOpenDB();
    const rec = await _asGet(db, 'session');
    if (!rec) return null;
    if (rec._schemaVer !== _AS_SCHEMA_VER) {
      console.log('[SFS|AS] stale schema — discarding');
      await _asDeleteAll(db);
      return null;
    }
    return rec;
  } catch (e) {
    console.warn('[SFS|AS] read error:', e);
    return null;
  }
}

// ── Restore ────────────────────────────────────────────────────────────────
async function _asRestoreSession(rec) {
  const db = await _asOpenDB();

  // Show a small progress indicator
  const prog = document.createElement('div');
  prog.style.cssText = [
    'position:fixed','bottom:0','left:0','right:0','z-index:10000',
    'background:var(--dp2,#12141a)','padding:8px 16px',
    'font-family:var(--font-mono,"JetBrains Mono",monospace)',
    'font-size:11px','color:var(--ac50,#6070a0)',
    'border-top:1px solid var(--ac18,#1e2535)',
  ].join(';');
  prog.textContent = 'Restoring session…';
  document.body.appendChild(prog);

  try {
    // ── 1. Restore textures ──────────────────────────────────────────────
    if (rec.texCount > 0) {
      prog.textContent = `Restoring textures (0 / ${rec.texCount})…`;
      let done = 0;
      const _allRecs = await _asGetAll(db);
      for (const r of _allRecs) {
        if (!r.key.startsWith('tex:')) continue;
        const entry = { name: r.name, url: r.url, size: r.size };
        if (!assets.textures.find(a => a.name === r.name)) {
          assets.textures.push(entry);
          const texName = r.name.replace(/\.[^.]+$/, '');
          if (typeof cacheTexture === 'function') cacheTexture(texName, r.url);
          if (typeof renderAssetThumb === 'function') renderAssetThumb(entry);
        }
        done++;
        if (done % 5 === 0) {
          prog.textContent = `Restoring textures (${done} / ${rec.texCount})…`;
          await new Promise(r => setTimeout(r, 0)); // yield
        }
      }
    }

    // ── 2. Restore heightmaps ────────────────────────────────────────────
    if (rec.hmCount > 0) {
      prog.textContent = `Restoring heightmaps (${rec.hmCount})…`;
      const all = await _asGetAll(db);
      for (const r of all) {
        if (!r.key.startsWith('hm:')) continue;
        const entry = { name: r.name, size: r.size };
        if (r.url)     entry.url     = r.url;
        if (r.content) entry.content = r.content;
        if (!assets.heightmaps.find(a => a.name === r.name)) {
          assets.heightmaps.push(entry);
          if (typeof renderAssetRow       === 'function') renderAssetRow(entry, 'heightmaps');
          if (typeof injectCustomHeightmap === 'function') injectCustomHeightmap(entry.name);
        }
      }
    }

    // ── 3. Restore other assets ──────────────────────────────────────────
    if (rec.othCount > 0) {
      prog.textContent = `Restoring assets (${rec.othCount})…`;
      const all = await _asGetAll(db);
      for (const r of all) {
        if (!r.key.startsWith('oth:')) continue;
        const entry = { name: r.name, size: r.size };
        if (r.url)     entry.url     = r.url;
        if (r.content) entry.content = r.content;
        if (!assets.other.find(a => a.name === r.name)) {
          assets.other.push(entry);
          if (typeof renderAssetRow === 'function') renderAssetRow(entry, 'other');
        }
      }
    }

    // ── 4. Restore dynamicPresetSources ─────────────────────────────────
    if (rec.dpsKeys && rec.dpsKeys.length > 0) {
      prog.textContent = 'Restoring featured presets…';
      const dpsRec = await _asGet(db, 'dps');
      if (dpsRec && dpsRec.data) {
        for (const [label, src] of Object.entries(dpsRec.data)) {
          dynamicPresetSources[label] = src;
          // Inject into dynamicPresets so buildAllPresets() sees them
          for (const [pname, pdata] of Object.entries(src.presets || {})) {
            if (!dynamicPresets.vanilla[pname] && !dynamicPresets.custom[pname]) {
              dynamicPresets.custom[pname] = pdata;
            }
          }
        }
        if (typeof buildAllPresets  === 'function') buildAllPresets();
        if (typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
      }
    }

    // ── 5. Restore bodies + settings ────────────────────────────────────
    prog.textContent = 'Restoring system…';
    bodies = rec.bodies;
    if (rec.settings && typeof systemSettings !== 'undefined') {
      Object.assign(systemSettings, rec.settings);
    }

    // Ensure a center body is elected
    if (!Object.values(bodies).some(b => b.isCenter)) {
      const sorted = Object.entries(bodies).sort(
        ([, a], [, b]) =>
          ((b.data && b.data.BASE_DATA ? b.data.BASE_DATA.radius : 0) || 0) -
          ((a.data && a.data.BASE_DATA ? a.data.BASE_DATA.radius : 0) || 0)
      );
      if (sorted.length) sorted[0][1].isCenter = true;
    }

    // Clear stale terrain/texture caches
    if (typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    if (typeof _hmCache !== 'undefined') Object.keys(_hmCache).forEach(k => delete _hmCache[k]);

    // Update UI
    if (Object.values(bodies).some(b => b.isCenter)) {
      const es = document.getElementById('empty-state');
      if (es) es.classList.add('gone');
    }
    if (typeof refreshTexPickerLists  === 'function') refreshTexPickerLists();
    if (typeof updateAssetEmptyState  === 'function') updateAssetEmptyState();
    if (typeof updateStatusBar        === 'function') updateStatusBar();
    if (typeof syncAddBodyBtn         === 'function') syncAddBodyBtn();
    if (typeof buildAllPresets        === 'function') buildAllPresets();

    // Navigate into editor
    if (typeof goNew === 'function') goNew();
    setTimeout(() => {
      if (typeof resizeViewport === 'function') resizeViewport();
      if (typeof drawViewport   === 'function') drawViewport();
    }, 300);

  } catch (e) {
    console.error('[SFS|AS] restore error:', e);
  } finally {
    prog.remove();
  }
}

// ── Heartbeat ──────────────────────────────────────────────────────────────
function _asStartTimer() {
  if (_asTimer) return;
  _asTimer = setInterval(() => { if (_asDirty) autosaveWrite(); }, _AS_INTERVAL);
}

// ── Hook: pushUndo ─────────────────────────────────────────────────────────
(function _hookPushUndo() {
  if (typeof pushUndo !== 'function') return;
  const _orig = pushUndo;
  pushUndo = function () {
    _orig.apply(this, arguments);
    _asDirty = true;
    clearTimeout(pushUndo._debounce);
    pushUndo._debounce = setTimeout(autosaveWrite, 2000);
  };
})();

// ── Hook: importFeatured — save after a featured system is downloaded ──────
(function _hookImportFeatured() {
  if (typeof importFeatured !== 'function') return;
  const _orig = importFeatured;
  importFeatured = async function () {
    await _orig.apply(this, arguments);
    // Give the load pipeline a moment to settle, then flush
    setTimeout(autosaveFlush, 1500);
  };
})();

// ── Recovery banner ────────────────────────────────────────────────────────
function _asFmtAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90)  return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48)  return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function _asShowBanner(rec) {
  const old = document.getElementById('as-recovery-banner');
  if (old) old.remove();

  const age      = _asFmtAge(Date.now() - rec.savedAt);
  const bodyWord = rec.bodyCount === 1 ? 'body' : 'bodies';
  const parts    = [`${rec.bodyCount} ${bodyWord}`];
  if (rec.texCount  > 0) parts.push(`${rec.texCount} texture${rec.texCount  > 1 ? 's' : ''}`);
  if (rec.hmCount   > 0) parts.push(`${rec.hmCount} heightmap${rec.hmCount   > 1 ? 's' : ''}`);
  if (rec.dpsKeys && rec.dpsKeys.length > 0) parts.push(`${rec.dpsKeys.length} featured pack${rec.dpsKeys.length > 1 ? 's' : ''}`);

  const banner = document.createElement('div');
  banner.id = 'as-recovery-banner';
  banner.style.cssText = [
    'position:fixed','bottom:0','left:0','right:0','z-index:9999',
    'background:var(--dp2,#12141a)','border-top:1px solid var(--ac28,#2a3040)',
    'padding:10px 16px','display:flex','align-items:center',
    'gap:10px','font-family:var(--font-mono,"JetBrains Mono",monospace)',
    'font-size:12px','color:var(--ac75,#b0bcd0)',
  ].join(';');

  const icon = document.createElement('span');
  icon.textContent = '💾';
  icon.style.fontSize = '18px';

  const msg = document.createElement('span');
  msg.style.flex = '1';
  msg.innerHTML =
    `Unsaved session found &mdash; <strong style="color:var(--ac90,#dce8f8)">${parts.join(', ')}</strong>` +
    ` saved <span style="color:var(--jade,#38e090)">${age}</span>`;

  const btnRestore = document.createElement('button');
  btnRestore.textContent = 'RESTORE';
  btnRestore.style.cssText = [
    'background:var(--jade,#38e090)','color:#000','border:none',
    'border-radius:4px','padding:5px 12px','font-weight:700',
    'font-family:inherit','font-size:11px','cursor:pointer','letter-spacing:.06em',
  ].join(';');
  btnRestore.onclick = () => { banner.remove(); _asRestoreSession(rec); };

  const btnDiscard = document.createElement('button');
  btnDiscard.textContent = 'DISCARD';
  btnDiscard.style.cssText = [
    'background:transparent','color:var(--ac50,#6070a0)','border:1px solid var(--ac20,#222a3a)',
    'border-radius:4px','padding:5px 12px','font-weight:600',
    'font-family:inherit','font-size:11px','cursor:pointer','letter-spacing:.06em',
  ].join(';');
  btnDiscard.onclick = () => { banner.remove(); autosaveClear(); };

  banner.append(icon, msg, btnRestore, btnDiscard);
  document.body.appendChild(banner);
}

// ── Init ───────────────────────────────────────────────────────────────────
async function _asInit() {
  _asStartTimer();

  const rec = await _asReadSession();
  if (!rec || !rec.bodies || Object.keys(rec.bodies).length === 0) return;

  // Skip if bodies are already in memory (e.g. hash-loaded system)
  if (typeof bodies !== 'undefined' && Object.keys(bodies).length > 0) return;

  setTimeout(() => _asShowBanner(rec), 600);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _asInit);
} else {
  _asInit();
}
