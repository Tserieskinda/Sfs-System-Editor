// ════════════════════════════════ BODY SEARCH ════════════════════════════════
function openBodySearch(){
  const modal = document.getElementById('modal-body-search');
  if(!modal) return;
  modal.classList.add('open');
  const inp = document.getElementById('bsearch-input');
  if(inp){ inp.value = ''; inp.focus(); }
  _bsearchRebuildNow();
}

function closeBodySearch(){
  const modal = document.getElementById('modal-body-search');
  if(modal) modal.classList.remove('open');
}

let _bsearchTimer = null;
function bsearchRebuild(){
  // Debounce: wait 120ms after last keystroke before rebuilding the list DOM.
  // On mobile, rapid input events would otherwise rebuild the entire list on every character.
  clearTimeout(_bsearchTimer);
  _bsearchTimer = setTimeout(_bsearchRebuildNow, 120);
}

function _bsearchRebuildNow(){
  const q = (document.getElementById('bsearch-input')?.value || '').toLowerCase().trim();
  const list = document.getElementById('bsearch-list');
  if(!list) return;
  list.innerHTML = '';

  const entries = Object.entries(bodies)
    .filter(([name]) => !q || name.toLowerCase().includes(q))
    .sort(([a],[b]) => a.localeCompare(b));

  if(entries.length === 0){
    list.innerHTML = '<div style="text-align:center;font-size:.65rem;color:var(--ink4);padding:16px;font-family:\'JetBrains Mono\',monospace">No bodies found</div>';
    return;
  }

  entries.forEach(([name, b]) => {
    const row = document.createElement('div');
    row.className = 'bsearch-row' + (name === selectedBody ? ' active' : '');

    const r = b.data.BASE_DATA?.radius || 0;
    const sub = r >= 1e6 ? (r/1e6).toFixed(2)+'M km'
               : r >= 1e3 ? (r/1e3).toFixed(1)+'k km'
               : r + ' km';
    const typeLabel = b.preset ? b.preset.replace('like','') : '';

    // Build a small map-color sphere SVG for the row icon
    const _mc = b.data.BASE_DATA?.mapColor || {r:0.6,g:0.6,b:0.8,a:1};
    const _hdr = Math.max(1, _mc.r, _mc.g, _mc.b);
    const _r = Math.min(1,_mc.r/_hdr), _g = Math.min(1,_mc.g/_hdr), _b = Math.min(1,_mc.b/_hdr), _a = Math.min(1,_mc.a??1);
    const _hex = v => Math.round(v*255).toString(16).padStart(2,'0');
    const _base = `#${_hex(_r)}${_hex(_g)}${_hex(_b)}`;
    const _hi   = `#${_hex(Math.min(1,_r+.42))}${_hex(Math.min(1,_g+.42))}${_hex(Math.min(1,_b+.42))}`;
    const _sh   = `#${_hex(_r*.28)}${_hex(_g*.28)}${_hex(_b*.28)}`;
    const _gid  = `sg_${Math.random().toString(36).slice(2,6)}`;
    const _iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="display:block"><defs><radialGradient id="${_gid}" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="${_hi}" stop-opacity="${_a}"/><stop offset="45%" stop-color="${_base}" stop-opacity="${_a}"/><stop offset="100%" stop-color="${_sh}" stop-opacity="${_a}"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#${_gid})"/></svg>`;

    row.innerHTML =
      `<span class="bsearch-icon">${_iconSvg}</span>` +
      `<span class="bsearch-name">${name}</span>` +
      `<span class="bsearch-sub">${sub}</span>` +
      `<button class="bsearch-dl"   onclick="event.stopPropagation();downloadBodyTxt('${name}')">⬇ TXT</button>` +
      `<button class="bsearch-zoom" onclick="event.stopPropagation();bsearchZoom('${name}')">⊕ ZOOM</button>`;

    row.addEventListener('click', () => {
      // Select the body in the sidebar
      selectBody(name);
      closeBodySearch();
    });
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
  const { version: _dv, ..._dr } = _dd;
  const out = { version: _dv || '1.5', ..._dr };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type: 'text/plain'});
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
// Prevent browser "please enter a valid value" tooltip on number inputs with decimal values
document.querySelectorAll('input[type="number"].finput').forEach(el => el.step = 'any');
_syncThemeBtns();
setTimeout(_syncEnvButtons, 0);
// Close app settings on backdrop click
document.getElementById('modal-appsettings').addEventListener('mousedown', function(e){ if(e.target===this) closeAppSettings(); });
document.getElementById('modal-appsettings').addEventListener('touchend', function(e){ if(e.target===this){ e.preventDefault(); closeAppSettings(); } });
// Init icon scale slider
(function(){
  const sl = document.getElementById('icon-scale-slider');
  if(sl) sl.value = iconScale;
  const lbl = document.getElementById('icon-scale-val');
  if(lbl) lbl.textContent = Math.round(iconScale * 100) + '%';
})();
show('s-start');
