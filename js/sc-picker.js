// ════════════════════════════════ SPACE CENTRE PICKER ════════════════════════════════
// Forced, non-dismissible body picker shown when systemSettings.spaceCenterData.address
// doesn't match any body currently in the system (most commonly: still defaulted to
// "Earth" in a system that has no Earth). Any body in the system is an acceptable
// launch site — the only requirement is that the address actually resolves to one.

let _scPickerOnConfirm = null;

function scPickerOpen(missingAddr, onConfirm){
  const modal = document.getElementById('modal-sc-picker');
  if(!modal) return;
  _scPickerOnConfirm = onConfirm || null;

  const addrEl = document.getElementById('sc-picker-missing-addr');
  if(addrEl) addrEl.textContent = missingAddr || '(none set)';

  const inp = document.getElementById('sc-picker-input');
  if(inp){ inp.value = ''; }

  modal.classList.add('open');
  scPickerRebuild();

  // Focus after the open transition starts so mobile keyboards behave
  setTimeout(() => { if(inp) inp.focus(); }, 50);
}

function _scPickerClose(){
  const modal = document.getElementById('modal-sc-picker');
  if(modal) modal.classList.remove('open');
  _scPickerOnConfirm = null;
}

function scPickerRebuild(){
  const q    = (document.getElementById('sc-picker-input')?.value || '').toLowerCase().trim();
  const list = document.getElementById('sc-picker-list');
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
    row.className = 'bsearch-row';

    const r   = b.data.BASE_DATA?.radius || 0;
    const sub = r >= 1e6 ? (r/1e6).toFixed(2)+'M km'
              : r >= 1e3 ? (r/1e3).toFixed(1)+'k km'
              : r + ' km';

    const _mc  = b.data.BASE_DATA?.mapColor || {r:0.6,g:0.6,b:0.8,a:1};
    const _hdr = Math.max(1,_mc.r,_mc.g,_mc.b);
    const _r   = Math.min(1,_mc.r/_hdr), _g = Math.min(1,_mc.g/_hdr), _bb = Math.min(1,_mc.b/_hdr), _a = Math.min(1,_mc.a??1);
    const _hex = v => Math.round(v*255).toString(16).padStart(2,'0');
    const _base = `#${_hex(_r)}${_hex(_g)}${_hex(_bb)}`;
    const _hi   = `#${_hex(Math.min(1,_r+.42))}${_hex(Math.min(1,_g+.42))}${_hex(Math.min(1,_bb+.42))}`;
    const _sh   = `#${_hex(_r*.28)}${_hex(_g*.28)}${_hex(_bb*.28)}`;
    const _gid  = `scg_${Math.random().toString(36).slice(2,6)}`;
    const _iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" style="display:block"><defs><radialGradient id="${_gid}" cx="35%" cy="30%" r="65%"><stop offset="0%" stop-color="${_hi}" stop-opacity="${_a}"/><stop offset="45%" stop-color="${_base}" stop-opacity="${_a}"/><stop offset="100%" stop-color="${_sh}" stop-opacity="${_a}"/></radialGradient></defs><circle cx="12" cy="12" r="10" fill="url(#${_gid})"/></svg>`;

    row.innerHTML =
      `<span class="bsearch-icon">${_iconSvg}</span>` +
      `<span class="bsearch-name">${name}</span>` +
      `<span class="bsearch-sub">${sub}</span>`;

    row.addEventListener('click', () => scPickerSelect(name));
    list.appendChild(row);
  });
}

function scPickerSelect(name){
  if(!bodies[name]) return;
  if(!systemSettings.spaceCenterData) systemSettings.spaceCenterData = {};
  systemSettings.spaceCenterData.address = name;

  const cb = _scPickerOnConfirm;
  _scPickerClose();
  if(typeof cb === 'function') cb();
}
