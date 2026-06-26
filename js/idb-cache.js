// ── SFS Asset IndexedDB Cache ─────────────────────────────────────────────────
// Caches fully-processed asset payloads (base64 data-URLs + preset JSON) so
// that autoLoadRemoteAssets() can serve from disk on subsequent page loads
// instead of re-downloading and re-decompressing the zips.
//
// STRUCTURE
//   DB name : 'sfs-asset-cache'   version: 1
//   Store   : 'assets'
//     key   : url (string, e.g. 'assets/Vanilla Presets + textures.zip')
//     value : { url, etag, size, cachedAt, textures, presets, heightmaps, namedSources }
//
//   textures    : [ { name, url (data-URI), size, vanilla } ]
//   presets     : { vanilla: {…}, custom: {…} }
//   heightmaps  : [ { name, url|content, size } ]
//   namedSources: { label: { presets:{…}, zipName } }   (for named imports – usually empty for autoload)
// ─────────────────────────────────────────────────────────────────────────────

const _IDB_NAME      = 'sfs-asset-cache';
const _IDB_VERSION   = 2; // bumped to match autosave.js (adds 'autosave' store)
const _IDB_STORE     = 'assets';
// Bump this when the cached payload schema changes so old entries are
// automatically ignored and re-fetched on next startup.
const _PAYLOAD_VER   = 2;

let _db = null;

function _openDB(){
  if(_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(_IDB_NAME, _IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(_IDB_STORE)){
        db.createObjectStore(_IDB_STORE, { keyPath: 'url' });
      }
      // autosave.js shares this DB — ensure its store exists regardless of open order
      if(!db.objectStoreNames.contains('autosave')){
        db.createObjectStore('autosave', { keyPath: 'key' });
      }
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a cached payload for `url`.
 * Returns the stored record or null if not found.
 */
async function idbCacheRead(url){
  try {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(_IDB_STORE, 'readonly');
      const req = tx.objectStore(_IDB_STORE).get(url);
      req.onsuccess = e => {
        const rec = e.target.result || null;
        // Reject records from a different schema version — they will be
        // re-fetched and re-written with the current version stamp.
        if(rec && rec._payloadVer !== _PAYLOAD_VER){
          console.log(`[SFS|IDB] Stale payload version for "${url}" — discarding`);
          resolve(null);
        } else {
          resolve(rec);
        }
      };
      req.onerror = e => reject(e.target.error);
    });
  } catch(e){
    console.warn('[SFS|IDB] read error:', e);
    return null;
  }
}

/**
 * Write a processed payload to the cache.
 * @param {string} url         - The zip URL key
 * @param {string|null} etag   - ETag or Last-Modified header value (for revalidation)
 * @param {number} size        - Content-Length of the original zip (0 if unknown)
 * @param {object} payload     - { textures, presets, heightmaps, namedSources }
 */
async function idbCacheWrite(url, etag, size, payload){
  try {
    const db = await _openDB();
    const record = { url, etag, size, cachedAt: Date.now(), _payloadVer: _PAYLOAD_VER, ...payload };
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(_IDB_STORE, 'readwrite');
      const req = tx.objectStore(_IDB_STORE).put(record);
      req.onsuccess = () => resolve(true);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e){
    console.warn('[SFS|IDB] write error:', e);
    return false;
  }
}

/**
 * Delete a cached entry (e.g. when the user force-refreshes assets).
 */
async function idbCacheDelete(url){
  try {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(_IDB_STORE, 'readwrite');
      const req = tx.objectStore(_IDB_STORE).delete(url);
      req.onsuccess = () => resolve(true);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e){
    console.warn('[SFS|IDB] delete error:', e);
    return false;
  }
}

/**
 * Clear the entire asset cache (used by "clear cache" button).
 */
async function idbCacheClear(){
  try {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(_IDB_STORE, 'readwrite');
      const req = tx.objectStore(_IDB_STORE).clear();
      req.onsuccess = () => resolve(true);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e){
    console.warn('[SFS|IDB] clear error:', e);
    return false;
  }
}

/**
 * Returns total estimated byte size of all cached entries (sums payload sizes).
 */
async function idbCacheStats(){
  try {
    const db = await _openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(_IDB_STORE, 'readonly');
      const req = tx.objectStore(_IDB_STORE).getAll();
      req.onsuccess = e => {
        const records = e.target.result || [];
        let totalBytes = 0;
        const entries = records.map(r => {
          // Estimate size from all data-URI lengths in textures + heightmaps
          let bytes = 0;
          (r.textures  || []).forEach(t => { bytes += (t.url||'').length; });
          (r.heightmaps|| []).forEach(h => { bytes += (h.url||h.content||'').length; });
          // Add preset JSON rough size
          bytes += JSON.stringify(r.presets || {}).length;
          totalBytes += bytes;
          return { url: r.url, etag: r.etag, cachedAt: r.cachedAt,
                   texCount: (r.textures||[]).length,
                   presetCount: Object.keys((r.presets||{}).vanilla||{}).length + Object.keys((r.presets||{}).custom||{}).length,
                   approxBytes: bytes };
        });
        resolve({ entries, totalBytes });
      };
      req.onerror = e => reject(e.target.error);
    });
  } catch(e){
    return { entries: [], totalBytes: 0 };
  }
}
