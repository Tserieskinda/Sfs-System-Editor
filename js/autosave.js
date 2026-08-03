// ════════════════════════════════ AUTOSAVE ════════════════════════════════
// Persists the full editor session to IndexedDB:
//   • bodies + systemSettings  (session record, key='session')
//   • non-vanilla textures      (one IDB record per entry, key='tex:<name>')
//   • heightmaps                (one IDB record per entry, key='hm:<name>')
//   • other assets              (one IDB record per entry, key='oth:<name>')
//   • dynamicPresetSources      (named featured-system buckets, key='dps')
//
// Vanilla textures are excluded — already cached in 'assets' store by
// idb-cache.js and auto-reload from jsDelivr on startup.
//
// Save triggers:
//   • 2 s debounce after every pushUndo() call
//   • 30 s heartbeat (dirty-flag guarded)
//   • autosaveFlush() — exposed for external callers
// ─────────────────────────────────────────────────────────────────────────────

const _AS_DB_NAME    = 'sfs-asset-cache';
const _AS_DB_VERSION = 2;
const _AS_STORE      = 'autosave';
const _AS_INTERVAL   = 30_000;
const _AS_SCHEMA_VER = 2;

let _asDb        = null;
let _asTimer     = null;
let _asDirty     = false;
let _asSaving    = false;

// ── DB open ────────────────────────────────────────────────────────────────
function _asOpenDB() {
  if (_asDb) return Promise.resolve(_asDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_AS_DB_NAME, _AS_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(_AS_STORE))
        db.createObjectStore(_AS_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains('assets'))
        db.createObjectStore('assets', { keyPath: 'url' });
    };
    req.onsuccess  = e => { _asDb = e.target.result; resolve(_asDb); };
    req.onerror    = e => reject(e.target.error);
    req.onblocked  = ()  => console.warn('[SFS|AS] IDB upgrade blocked — close other tabs');
  });
}

// ── IDB helpers ────────────────────────────────────────────────────────────
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

// ── Write ──────────────────────────────────────────────────────────────────
async function autosaveWrite() {
  if (_asSaving) return;
  if (typeof bodies === 'undefined') return;
  const bodyCount = Object.keys(bodies).length;
  if (bodyCount === 0) return;

  _asSaving = true;
  try {
    const db = await _asOpenDB();

    const textures   = (typeof assets !== 'undefined' ? assets.textures   : []).filter(e => !e.vanilla);
    const heightmaps = (typeof assets !== 'undefined' ? assets.heightmaps : []);
    const other      = (typeof assets !== 'undefined' ? assets.other      : []);
    const dps        = (typeof dynamicPresetSources !== 'undefined') ? dynamicPresetSources : {};

    await _asPut(db, {
      key:        'session',
      _schemaVer: _AS_SCHEMA_VER,
      savedAt:    Date.now(),
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

    for (const t of textures)
      await _asPut(db, { key: 'tex:' + t.name, name: t.name, url: t.url, size: t.size });

    for (const h of heightmaps)
      await _asPut(db, { key: 'hm:' + h.name, name: h.name,
                         url: h.url || null, content: h.content || null, size: h.size });

    for (const o of other)
      await _asPut(db, { key: 'oth:' + o.name, name: o.name,
                         url: o.url || null, content: o.content || null, size: o.size });

    if (Object.keys(dps).length > 0)
      await _asPut(db, { key: 'dps', data: JSON.parse(JSON.stringify(dps)) });

    _asDirty = false;
    console.log(`[SFS|AS] saved — ${bodyCount} bodies, ${textures.length} tex, ${heightmaps.length} hm`);
  } catch (e) {
    console.warn('[SFS|AS] write error:', e);
  } finally {
    _asSaving = false;
  }
}

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
async function autosaveRestore() {
  // Remove the restore button from start screen immediately
  const btn = document.getElementById('as-restore-btn');
  if (btn) btn.remove();

  const db = await _asOpenDB();

  // Progress overlay
  const prog = document.createElement('div');
  prog.style.cssText = [
    'position:fixed','inset:0','z-index:10001',
    'background:var(--dp0,#0a0c12)',
    'display:flex','flex-direction:column',
    'align-items:center','justify-content:center','gap:12px',
    'font-family:var(--font-mono,"JetBrains Mono",monospace)',
    'font-size:13px','color:var(--ac65,#8898c0)',
  ].join(';');
  const progIcon = document.createElement('div');
  progIcon.style.cssText = 'font-size:28px';
  progIcon.innerHTML = '<svg class="icon" style="width:1em;height:1em"><use href="#icon-save"></use></svg>';
  const progMsg = document.createElement('div');
  progMsg.textContent = 'Restoring session…';
  prog.append(progIcon, progMsg);
  document.body.appendChild(prog);

  const setMsg = t => { progMsg.textContent = t; };

  try {
    const rec = await _asGet(db, 'session');
    if (!rec) { prog.remove(); return; }

    const allRecs = await _asGetAll(db);

    // 1. Textures
    if (rec.texCount > 0) {
      setMsg(`Restoring textures…`);
      let done = 0;
      for (const r of allRecs) {
        if (!r.key.startsWith('tex:')) continue;
        if (!assets.textures.find(a => a.name === r.name)) {
          const entry = { name: r.name, url: r.url, size: r.size };
          assets.textures.push(entry);
          const texName = r.name.replace(/\.[^.]+$/, '');
          if (typeof cacheTexture    === 'function') cacheTexture(texName, r.url);
          if (typeof renderAssetThumb === 'function') renderAssetThumb(entry);
        }
        done++;
        if (done % 5 === 0) {
          setMsg(`Restoring textures (${done} / ${rec.texCount})…`);
          await new Promise(r => setTimeout(r, 0));
        }
      }
    }

    // 2. Heightmaps
    if (rec.hmCount > 0) {
      setMsg(`Restoring heightmaps…`);
      for (const r of allRecs) {
        if (!r.key.startsWith('hm:')) continue;
        if (!assets.heightmaps.find(a => a.name === r.name)) {
          const entry = { name: r.name, size: r.size };
          if (r.url)     entry.url     = r.url;
          if (r.content) entry.content = r.content;
          assets.heightmaps.push(entry);
          if (typeof renderAssetRow        === 'function') renderAssetRow(entry, 'heightmaps');
          if (typeof injectCustomHeightmap === 'function') injectCustomHeightmap(entry.name);
        }
      }
    }

    // 3. Other
    if (rec.othCount > 0) {
      setMsg(`Restoring assets…`);
      for (const r of allRecs) {
        if (!r.key.startsWith('oth:')) continue;
        if (!assets.other.find(a => a.name === r.name)) {
          const entry = { name: r.name, size: r.size };
          if (r.url)     entry.url     = r.url;
          if (r.content) entry.content = r.content;
          assets.other.push(entry);
          if (typeof renderAssetRow === 'function') renderAssetRow(entry, 'other');
        }
      }
    }

    // 4. dynamicPresetSources
    if (rec.dpsKeys && rec.dpsKeys.length > 0) {
      setMsg('Restoring featured presets…');
      const dpsRec = await _asGet(db, 'dps');
      if (dpsRec && dpsRec.data) {
        for (const [label, src] of Object.entries(dpsRec.data)) {
          dynamicPresetSources[label] = src;
          for (const [pname, pdata] of Object.entries(src.presets || {})) {
            if (!dynamicPresets.vanilla[pname] && !dynamicPresets.custom[pname])
              dynamicPresets.custom[pname] = pdata;
          }
        }
        if (typeof buildAllPresets     === 'function') buildAllPresets();
        if (typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
      }
    }

    // 5. Bodies + settings
    setMsg('Restoring system…');
    bodies = rec.bodies;
    if (rec.settings && typeof systemSettings !== 'undefined')
      Object.assign(systemSettings, rec.settings);

    // Elect center body if none flagged
    if (!Object.values(bodies).some(b => b.isCenter)) {
      const sorted = Object.entries(bodies).sort(
        ([, a], [, b]) =>
          ((b.data && b.data.BASE_DATA ? b.data.BASE_DATA.radius : 0) || 0) -
          ((a.data && a.data.BASE_DATA ? a.data.BASE_DATA.radius : 0) || 0)
      );
      if (sorted.length) sorted[0][1].isCenter = true;
    }

    // Clear stale caches
    if (typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    if (typeof _hmCache !== 'undefined') Object.keys(_hmCache).forEach(k => delete _hmCache[k]);

    // Update UI
    const es = document.getElementById('empty-state');
    if (es && Object.values(bodies).some(b => b.isCenter)) es.classList.add('gone');

    if (typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
    if (typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
    if (typeof updateStatusBar       === 'function') updateStatusBar();
    if (typeof syncAddBodyBtn        === 'function') syncAddBodyBtn();
    if (typeof buildAllPresets       === 'function') buildAllPresets();

    // Navigate to editor
    if (typeof goNew === 'function') goNew();
    setTimeout(() => {
      if (typeof resizeViewport === 'function') resizeViewport();
      if (typeof drawViewport   === 'function') drawViewport();
    }, 300);

  } catch (e) {
    console.error('[SFS|AS] restore error:', e);
    alert('Restore failed — check console for details.');
  } finally {
    prog.remove();
  }
}

// ── Inject RESTORE SESSION button into the start screen ───────────────────
function _asInjectRestoreBtn(rec) {
  if (document.getElementById('as-restore-btn')) return;

  const age      = _asFmtAge(Date.now() - rec.savedAt);
  const bodyWord = rec.bodyCount === 1 ? 'body' : 'bodies';
  const parts    = [`${rec.bodyCount} ${bodyWord}`];
  if (rec.texCount  > 0) parts.push(`${rec.texCount} tex`);
  if (rec.hmCount   > 0) parts.push(`${rec.hmCount} hm`);
  if (rec.dpsKeys && rec.dpsKeys.length > 0) parts.push(`${rec.dpsKeys.length} pack${rec.dpsKeys.length > 1 ? 's' : ''}`);

  const nav = document.getElementById('s-start-main-nav');
  if (!nav) return;

  const wrap = document.createElement('div');
  wrap.id = 'as-restore-btn';
  wrap.style.cssText = 'display:contents';

  // Restore button — amber, at the top of the nav
  const btnRestore = document.createElement('button');
  btnRestore.className = 'menu-btn primary menu-btn-restore';
  btnRestore.innerHTML =
    `<span class="mico"><svg class="icon"><use href="#icon-save"></use></svg></span>` +
    `<span class="as-restore-label">` +
      `<span>RESTORE SESSION</span>` +
      `<span class="as-restore-sub">${parts.join(' · ')} · ${age}</span>` +
    `</span>` +
    `<span class="arr">›</span>`;
  btnRestore.onclick = () => autosaveRestore();

  // Discard link — small, below the restore button
  const lnkDiscard = document.createElement('button');
  lnkDiscard.className = 'as-discard-link';
  lnkDiscard.textContent = '✕ discard autosave';
  lnkDiscard.onclick = () => { wrap.remove(); autosaveClear(); };

  wrap.append(btnRestore, lnkDiscard);
  nav.insertBefore(wrap, nav.firstChild);
}

function _asFmtAge(ms) {
  const s = Math.round(ms / 1000);
  if (s < 90)  return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48)  return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
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

// ── Hook: importFeatured ───────────────────────────────────────────────────
(function _hookImportFeatured() {
  if (typeof importFeatured !== 'function') return;
  const _orig = importFeatured;
  importFeatured = async function () {
    await _orig.apply(this, arguments);
    setTimeout(autosaveFlush, 1500);
  };
})();

// ── Init ───────────────────────────────────────────────────────────────────
async function _asInit() {
  _asStartTimer();

  const rec = await _asReadSession();
  if (!rec || !rec.bodies || Object.keys(rec.bodies).length === 0) return;

  // Wait for start screen to be ready, then inject the button
  const _inject = () => {
    if (document.getElementById('s-start-main-nav')) {
      _asInjectRestoreBtn(rec);
    } else {
      setTimeout(_inject, 100);
    }
  };
  _inject();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _asInit);
} else {
  _asInit();
}
