// ════════════════════════════════ BODY SEARCH ════════════════════════════════

let _bsearchActiveTags = new Set(); // currently active tag filters

function openBodySearch(){
  const modal = document.getElementById('modal-body-search');
  if(!modal) return;
  modal.classList.add('open');
  const inp = document.getElementById('bsearch-input');
  if(inp){ inp.value = ''; inp.focus(); }
  _bsearchActiveTags.clear();
  _bsearchBuildTagFilters();
  _bsearchRebuildNow();
}

function closeBodySearch(){
  const modal = document.getElementById('modal-body-search');
  if(modal) modal.classList.remove('open');
}

// ── Tag filter bar ────────────────────────────────────────────────────────────
// Collect all unique tags across all bodies, plus an "Untagged" synthetic filter.
function _bsearchBuildTagFilters(){
  const bar = document.getElementById('bsearch-tag-filters');
  if(!bar) return;
  bar.innerHTML = '';

  // Gather all unique tags present in the system
  const allTags = new Set();
  let hasUntagged = false;
  Object.values(bodies).forEach(b => {
    const raw = b.data.editor || '';
    const tags = raw ? raw.split(',').map(t => t.trim()).filter(Boolean) : [];
    if(tags.length === 0) hasUntagged = true;
    tags.forEach(t => allTags.add(t));
  });

  // Nothing to filter on
  if(allTags.size === 0 && !hasUntagged) return;

  // "Untagged" chip first
  if(hasUntagged){
    bar.appendChild(_bsearchTagChip('__untagged__', 'Untagged',
      'rgba(160,170,190,.7)', 'rgba(140,150,170,.18)', 'rgba(140,150,170,.35)'));
  }

  // One chip per tag, colour-matched to SB_TAG_PRESETS if available
  [...allTags].sort().forEach(tag => {
    const preset = (typeof SB_TAG_PRESETS !== 'undefined')
      ? SB_TAG_PRESETS.find(p => p.label.toLowerCase() === tag.toLowerCase())
      : null;
    const col = preset ? preset.color : 'rgba(120,160,255,.8)';
    bar.appendChild(_bsearchTagChip(tag, tag, col,
      `${col.replace(')',',').replace('rgba(','rgba(').replace(/,[^,]+\)$/,',')}0.12)`,
      `${col.replace(')',',').replace('rgba(','rgba(').replace(/,[^,]+\)$/,',')}0.4)`));
  });
}

function _bsearchTagChip(key, label, color, bgOff, bdOff){
  const chip = document.createElement('button');
  const active = _bsearchActiveTags.has(key);

  chip.dataset.tagKey = key;
  chip.style.cssText = [
    'font-family:"JetBrains Mono",monospace','font-size:.44rem','letter-spacing:.06em',
    'padding:2px 9px','border-radius:10px','cursor:pointer','white-space:nowrap',
    'transition:background .12s,border-color .12s,color .12s',
    active
      ? `background:${color}28;border:1px solid ${color};color:${color}`
      : `background:${bgOff};border:1px solid ${bdOff};color:${color}`,
  ].join(';');
  chip.textContent = label;
  chip.onclick = () => {
    if(_bsearchActiveTags.has(key)) _bsearchActiveTags.delete(key);
    else _bsearchActiveTags.add(key);
    _bsearchBuildTagFilters();
    _bsearchRebuildNow();
  };
  return chip;
}

// ── List rebuild ──────────────────────────────────────────────────────────────
let _bsearchTimer = null;
function bsearchRebuild(){
  clearTimeout(_bsearchTimer);
  _bsearchTimer = setTimeout(_bsearchRebuildNow, 120);
}

function _bsearchRebuildNow(){
  const q    = (document.getElementById('bsearch-input')?.value || '').toLowerCase().trim();
  const list = document.getElementById('bsearch-list');
  if(!list) return;
  list.innerHTML = '';

  const wantUntagged = _bsearchActiveTags.has('__untagged__');
  const tagFilters   = [..._bsearchActiveTags].filter(t => t !== '__untagged__');

  const entries = Object.entries(bodies)
    .filter(([name, b]) => {
      // Text search
      if(q && !name.toLowerCase().includes(q)) return false;
      // Tag filters
      const raw  = b.data.editor || '';
      const tags = raw ? raw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [];
      if(wantUntagged && tagFilters.length === 0) return tags.length === 0;
      if(wantUntagged && tagFilters.length > 0)   return tags.length === 0 && tagFilters.every(f => tags.includes(f.toLowerCase()));
      if(tagFilters.length > 0) return tagFilters.every(f => tags.includes(f.toLowerCase()));
      return true;
    })
    .sort(([a],[b]) => a.localeCompare(b));

  if(entries.length === 0){
    list.innerHTML = '<div style="text-align:center;font-size:.65rem;color:var(--ink4);padding:16px;font-family:\'JetBrains Mono\',monospace">No bodies found</div>';
    return;
  }

  entries.forEach(([name, b]) => {
    const row = document.createElement('div');
    row.className = 'bsearch-row' + (name === selectedBody ? ' active' : '');

    const r   = b.data.BASE_DATA?.radius || 0;
    const sub = r >= 1e6 ? (r/1e6).toFixed(2)+'M km'
              : r >= 1e3 ? (r/1e3).toFixed(1)+'k km'
              : r + ' km';

    // Map-color sphere icon
    const _mc  = b.data.BASE_DATA?.mapColor || {r:0.6,g:0.6,b:0.8,a:1};
    const _hdr = Math.max(1,_mc.r,_mc.g,_mc.b);
    const _r   = Math.min(1,_mc.r/_hdr), _g = Math.min(1,_mc.g/_hdr), _bb = Math.min(1,_mc.b/_hdr), _a = Math.min(1,_mc.a??1);
    const _hex = v => Math.round(v*255).toString(16).padStart(2,'0');
    const _base = `#${_hex(_r)}${_hex(_g)}${_hex(_bb)}`;
    const _hi   = `#${_hex(Math.min(1,_r+.42))}${_hex(Math.min(1,_g+.42))}${_hex(Math.min(1,_bb+.42))}`;
    const _sh   = `#${_hex(_r*.28)}${_hex(_g*.28)}${_hex(_bb*.28)}`;
    const _gid  = `sg_${Math.random().toString(36).slice(2,6)}`;
    const _iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="display:block"><defs><radialGradient id="${_gid}" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="${_hi}" stop-opacity="${_a}"/><stop offset="45%" stop-color="${_base}" stop-opacity="${_a}"/><stop offset="100%" stop-color="${_sh}" stop-opacity="${_a}"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#${_gid})"/></svg>`;

    // Tags
    const rawTags  = b.data.editor || '';
    const bodyTags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const tagsHtml = bodyTags.length > 0
      ? bodyTags.map(tag => {
          const preset = (typeof SB_TAG_PRESETS !== 'undefined')
            ? SB_TAG_PRESETS.find(p => p.label.toLowerCase() === tag.toLowerCase()) : null;
          const col = preset ? preset.color : 'rgba(120,160,255,.8)';
          return `<span style="font-size:.4rem;padding:1px 6px;border-radius:8px;
            background:${col}18;border:1px solid ${col}55;color:${col};
            white-space:nowrap;letter-spacing:.05em">${tag}</span>`;
        }).join('')
      : `<span style="font-size:.4rem;padding:1px 6px;border-radius:8px;
          background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
          color:rgba(140,150,170,.5);white-space:nowrap;letter-spacing:.06em;font-style:italic">
          untagged</span>`;

    row.innerHTML =
      `<span class="bsearch-icon">${_iconSvg}</span>` +
      `<span class="bsearch-body-info">` +
        `<span class="bsearch-name">${name}</span>` +
        `<span class="bsearch-tags">${tagsHtml}</span>` +
      `</span>` +
      `<span class="bsearch-sub">${sub}</span>` +
      `<button class="bsearch-dl"   onclick="event.stopPropagation();downloadBodyTxt('${name}')">⬇ TXT</button>` +
      `<button class="bsearch-zoom" onclick="event.stopPropagation();bsearchZoom('${name}')">⊕ ZOOM</button>`;

    row.addEventListener('click', () => { selectBody(name); closeBodySearch(); });
    list.appendChild(row);
  });
}

function bsearchZoom(name){
  closeBodySearch();
  selectBody(name);
  zoomToBody(name);
}

function downloadBodyTxt(name){
  const b = bodies[name];
  if(!b) return;
  const _dd = JSON.parse(JSON.stringify(b.data));
  const { version: _dv, editor: _etags, ..._dr } = _dd;
  const out = { version: _dv || '1.5', ..._dr, ...(_etags !== undefined ? { editor: _etags } : {}) };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'text/plain'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// Close on backdrop click
document.addEventListener('mousedown', e => {
  const modal = document.getElementById('modal-body-search');
  const panel = document.getElementById('mpanel-body-search');
  if(modal && modal.classList.contains('open') && panel && !panel.contains(e.target))
    closeBodySearch();
});
document.addEventListener('touchstart', e => {
  const modal = document.getElementById('modal-body-search');
  const panel = document.getElementById('mpanel-body-search');
  if(modal && modal.classList.contains('open') && panel && !panel.contains(e.target))
    closeBodySearch();
}, { passive: true });

initTexPickers();
document.querySelectorAll('input[type="number"].finput').forEach(el => el.step = 'any');
_syncThemeBtns();
setTimeout(_syncEnvButtons, 0);
document.getElementById('modal-appsettings').addEventListener('mousedown', function(e){ if(e.target===this) closeAppSettings(); });
document.getElementById('modal-appsettings').addEventListener('touchend', function(e){ if(e.target===this){ e.preventDefault(); closeAppSettings(); } });
(function(){
  const sl = document.getElementById('icon-scale-slider');
  if(sl) sl.value = iconScale;
  const lbl = document.getElementById('icon-scale-val');
  if(lbl) lbl.textContent = Math.round(iconScale * 100) + '%';
})();
show('s-start');
