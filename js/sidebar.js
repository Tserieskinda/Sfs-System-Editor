// ════════════════════════════════ SIDEBAR ════════════════════════════════

// ── Tag system ────────────────────────────────────────────────────────────
// Tags are stored as body.data.editor = "tag1, tag2, tag3" (plain string).
// The game ignores unknown top-level keys so this is safe to leave in exports.

const SB_TAG_PRESETS = [
  // Stars
  { label:'Star',        group:'star',   color:'#ffd060' },
  { label:'O-type',      group:'star',   color:'#b0c8ff' },
  { label:'B-type',      group:'star',   color:'#c8d8ff' },
  { label:'A-type',      group:'star',   color:'#e8eeff' },
  { label:'F-type',      group:'star',   color:'#ffffcc' },
  { label:'G-type',      group:'star',   color:'#ffee88' },
  { label:'K-type',      group:'star',   color:'#ffb840' },
  { label:'M-type',      group:'star',   color:'#ff7040' },
  { label:'Red Giant',   group:'star',   color:'#ff5020' },
  { label:'White Dwarf', group:'star',   color:'#d0e8ff' },
  { label:'Neutron Star',group:'star',   color:'#a0e0ff' },
  { label:'Brown Dwarf', group:'star',   color:'#8b4010' },
  // Black holes
  { label:'Black Hole',      group:'bh', color:'#9060ff' },
  { label:'Primordial BH',   group:'bh', color:'#7040e0' },
  { label:'Stellar BH',      group:'bh', color:'#8050f0' },
  { label:'Supermassive BH', group:'bh', color:'#b080ff' },
  // Planets — general
  { label:'Planet',      group:'planet', color:'#60c8ff' },
  { label:'Earth-like',  group:'planet', color:'#40d090' },
  { label:'Desert',      group:'planet', color:'#e0a050' },
  { label:'Ocean',       group:'planet', color:'#2080ff' },
  { label:'Icy',         group:'planet', color:'#a0d8f0' },
  { label:'Lava',        group:'planet', color:'#ff4020' },
  { label:'Hot',         group:'planet', color:'#ff8030' },
  { label:'Cold',        group:'planet', color:'#80c0e8' },
  { label:'Gas Giant',   group:'planet', color:'#c0a060' },
  { label:'Ice Giant',   group:'planet', color:'#60a0e0' },
  { label:'Super-Earth', group:'planet', color:'#50d080' },
  { label:'Mini-Neptune',group:'planet', color:'#6080c0' },
  { label:'Ringed',      group:'planet', color:'#d0b070' },
  // Moons & small bodies
  { label:'Moon',        group:'small',  color:'#a0a8b8' },
  { label:'Asteroid',    group:'small',  color:'#907060' },
  { label:'Comet',       group:'small',  color:'#80c8d8' },
  { label:'Dwarf Planet',group:'small',  color:'#b0a090' },
  // Meta
  { label:'Real',        group:'meta',   color:'#60e0a0' },
  { label:'Fictional',   group:'meta',   color:'#e060a0' },
  { label:'Habitable',   group:'meta',   color:'#40e060' },
  { label:'Tidally Locked', group:'meta',color:'#c0a0ff' },
  { label:'Barycentre',  group:'meta',   color:'#80c8ff' },
];

const SB_TAG_GROUP_COLORS = {
  star:   '#ffd060',
  bh:     '#9060ff',
  planet: '#60c8ff',
  small:  '#a0a8b8',
  meta:   '#60e0a0',
};

function _sbGetTags(name) {
  const raw = bodies[name]?.data?.editor || '';
  return raw ? raw.split(',').map(t => t.trim()).filter(Boolean) : [];
}

function _sbSetTags(name, tags) {
  if(!bodies[name]) return;
  const unique = [...new Set(tags.map(t => t.trim()).filter(Boolean))];
  if(unique.length === 0) {
    delete bodies[name].data.editor;
  } else {
    bodies[name].data.editor = unique.join(', ');
  }
}

// Render chips in the tag row above the action buttons
function fillTagRow(name) {
  const row = document.getElementById('sbb-tag-row');
  const addBtn = document.getElementById('sbb-tag-add-btn');
  if(!row) return;

  // Close picker whenever the active body changes — prevents stale chip state
  sbTagClosePicker();

  // Remove existing chips (keep the + TAG button)
  Array.from(row.querySelectorAll('.sb-tag-chip')).forEach(c => c.remove());

  const tags = _sbGetTags(name);
  tags.forEach(tag => {
    const preset = SB_TAG_PRESETS.find(p => p.label.toLowerCase() === tag.toLowerCase());
    const col = preset ? preset.color : 'rgba(160,180,220,.8)';
    const chip = document.createElement('span');
    chip.className = 'sb-tag-chip';
    chip.style.cssText = [
      'display:inline-flex','align-items:center','gap:3px',
      `background:${col}18`,
      `border:1px solid ${col}55`,
      `color:${col}`,
      'border-radius:10px','padding:2px 8px 2px 7px',
      'font-family:"JetBrains Mono",monospace','font-size:.62rem',
      'letter-spacing:.06em','white-space:nowrap','cursor:default',
    ].join(';');
    // Use selectedBody at click-time rather than capturing name at render-time
    const safeTag = tag.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
    chip.innerHTML = `<span>${tag}</span><button onclick="sbTagRemove(selectedBody,'${safeTag}')"
      style="background:none;border:none;color:inherit;opacity:.6;cursor:pointer;
        padding:0 0 0 2px;font-size:.6rem;line-height:1;margin-left:1px">✕</button>`;
    row.insertBefore(chip, addBtn);
  });
  if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
}

// Open/close picker
function sbTagOpenPicker() {
  if(!selectedBody) return;
  const picker = document.getElementById('sbb-tag-picker');
  picker.style.display = picker.style.display === 'none' ? '' : 'none';
  if(picker.style.display !== 'none') {
    _sbRenderPresetChips(selectedBody);
    document.getElementById('sbb-tag-custom-input').value = '';
    setTimeout(() => document.getElementById('sbb-tag-custom-input').focus(), 50);
  }
}
function sbTagClosePicker() {
  document.getElementById('sbb-tag-picker').style.display = 'none';
}

// Render preset chips inside the picker, highlighting active ones
function _sbRenderPresetChips(name) {
  const container = document.getElementById('sbb-tag-preset-chips');
  if(!container) return;
  container.innerHTML = '';
  const activeTags = _sbGetTags(name).map(t => t.toLowerCase());

  // Group headers + chips
  const groups = [...new Set(SB_TAG_PRESETS.map(p => p.group))];
  groups.forEach(g => {
    const groupLabel = document.createElement('div');
    groupLabel.style.cssText = 'width:100%;font-family:"JetBrains Mono",monospace;font-size:.62rem;' +
      `letter-spacing:.08em;color:${SB_TAG_GROUP_COLORS[g]}99;margin:6px 0 3px;`;
    groupLabel.textContent = g.toUpperCase();
    container.appendChild(groupLabel);

    SB_TAG_PRESETS.filter(p => p.group === g).forEach(p => {
      const active = activeTags.includes(p.label.toLowerCase());
      const chip = document.createElement('button');
      chip.className = 'sb-tag-picker-chip';
      chip.style.cssText = [
        'font-family:"JetBrains Mono",monospace','font-size:.68rem','letter-spacing:.04em',
        'padding:5px 13px','border-radius:10px','cursor:pointer','white-space:nowrap',
        'transition:background .12s,border-color .12s',
        active
          ? `background:${p.color}28;border:1px solid ${p.color}90;color:${p.color}`
          : `background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:rgba(160,180,220,.6)`,
      ].join(';');
      chip.textContent = p.label;
      chip.onclick = () => {
        sbTagToggle(name, p.label);
        _sbRenderPresetChips(name); // re-render to reflect new state
      };
      container.appendChild(chip);
    });
  });
}

// Toggle a tag on/off
function sbTagToggle(name, tag) {
  // Always operate on selectedBody — name may be stale if body was switched
  const target = (name && bodies[name]) ? name : selectedBody;
  if(!target || !bodies[target]) return;
  const tags = _sbGetTags(target);
  const idx  = tags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
  if(idx >= 0) tags.splice(idx, 1);
  else tags.push(tag);
  _sbSetTags(target, tags);
  fillTagRow(target);
  pushUndo();
}

// Remove a tag (called from chip ✕ button)
function sbTagRemove(name, tag) {
  const target = (name && bodies[name]) ? name : selectedBody;
  if(!target || !bodies[target]) return;
  const tags = _sbGetTags(target).filter(t => t.toLowerCase() !== tag.toLowerCase());
  _sbSetTags(target, tags);
  fillTagRow(target);
  if(document.getElementById('sbb-tag-picker').style.display !== 'none')
    _sbRenderPresetChips(target);
  pushUndo();
}

// Add custom tag from text input
function sbTagAddCustom() {
  if(!selectedBody) return;
  const input = document.getElementById('sbb-tag-custom-input');
  const tag   = input.value.trim();
  if(!tag) return;
  sbTagToggle(selectedBody, tag);
  input.value = '';
  input.focus();
}

// ── Tag dropdown (topbar) ──────────────────────────────────────────────────
let _tagDropOpen = false;

function _tagDdCountStatus() {
  const total    = Object.keys(bodies).length;
  if(total === 0) return { total, untagged: 0, allTagged: true };
  const untagged = Object.values(bodies).filter(b => !b.data.editor || !b.data.editor.trim()).length;
  return { total, untagged, allTagged: untagged === 0 };
}

function toggleTagDropdown() {
  _tagDropOpen = !_tagDropOpen;
  const dd  = document.getElementById('tag-dropdown');
  const btn = document.getElementById('btn-tag');
  if(_tagDropOpen) {
    dd.style.display = 'block';
    positionToolbarDropdown(dd, btn);
    _tagDdRefreshStatus();
    // Clear custom input / hint
    const inp = document.getElementById('tag-dd-custom-input');
    if(inp) inp.value = '';
    const hint = document.getElementById('tag-dd-add-hint');
    if(hint) hint.style.display = 'none';
  }
  dd.style.display = _tagDropOpen ? 'block' : 'none';
}

function _tagDdRefreshStatus() {
  const { total, untagged, allTagged } = _tagDdCountStatus();
  const status  = document.getElementById('tag-dd-status');
  const summary = document.getElementById('tag-dd-summary');
  const tbbtn   = document.getElementById('btn-tag');

  if(total === 0) {
    if(status)  { status.textContent = '—'; status.style.color = 'rgba(160,170,190,.5)'; }
    if(summary) summary.textContent = 'No bodies in system yet';
    if(tbbtn)   { tbbtn.style.borderColor = 'rgba(255,220,80,.35)'; tbbtn.style.color = '#ffd050'; }
    return;
  }

  if(allTagged) {
    if(status)  { status.textContent = '✓ All tagged'; status.style.color = 'rgba(48,224,144,.85)'; }
    if(summary) { summary.textContent = `All ${total} ${total===1?'body':'bodies'} tagged`; summary.style.color = 'rgba(48,224,144,.8)'; }
    if(tbbtn)   { tbbtn.style.borderColor = 'rgba(48,224,144,.4)'; tbbtn.style.color = '#30e090'; }
  } else {
    if(status)  { status.textContent = `⚠ ${untagged} untagged`; status.style.color = 'rgba(255,180,60,.9)'; }
    if(summary) { summary.textContent = `${untagged} of ${total} ${total===1?'body':'bodies'} untagged!`; summary.style.color = 'rgba(255,180,60,.85)'; }
    if(tbbtn)   { tbbtn.style.borderColor = 'rgba(255,180,60,.5)'; tbbtn.style.color = '#ffb43c'; }
  }
}

// Called whenever bodies or tags change — updates topbar button indicator
function tagDdSyncBtn() {
  if(Object.keys(bodies).length === 0) return;
  _tagDdRefreshStatus();
}

// Add custom tag to selected body from the topbar dropdown
function tagDdAddCustom() {
  const inp  = document.getElementById('tag-dd-custom-input');
  const hint = document.getElementById('tag-dd-add-hint');
  const tag  = inp?.value.trim();
  if(!tag) return;
  if(!selectedBody || !bodies[selectedBody]) {
    // No body selected — show a brief note
    if(hint) { hint.textContent = '⚠ Select a body first'; hint.style.color = 'rgba(255,120,80,.8)'; hint.style.display = ''; }
    setTimeout(() => { if(hint) hint.style.display = 'none'; }, 2000);
    return;
  }
  sbTagToggle(selectedBody, tag);
  inp.value = '';
  if(hint) {
    hint.textContent  = `✓ "${tag}" applied to ${selectedBody}`;
    hint.style.color  = 'rgba(48,224,144,.75)';
    hint.style.display = '';
    setTimeout(() => { hint.style.display = 'none'; }, 2000);
  }
  _tagDdRefreshStatus();
}

// Quick-add a preset tag (one click, no typing) — same underlying toggle as custom tags
function tagDdQuickAdd(tag) {
  const hint = document.getElementById('tag-dd-add-hint');
  if(!selectedBody || !bodies[selectedBody]) {
    if(hint) { hint.textContent = '⚠ Select a body first'; hint.style.color = 'rgba(255,120,80,.8)'; hint.style.display = ''; }
    setTimeout(() => { if(hint) hint.style.display = 'none'; }, 2000);
    return;
  }
  sbTagToggle(selectedBody, tag);
  const nowOn = _sbGetTags(selectedBody).some(t => t.toLowerCase() === tag.toLowerCase());
  if(hint) {
    hint.textContent  = nowOn ? `✓ "${tag}" applied to ${selectedBody}` : `— "${tag}" removed from ${selectedBody}`;
    hint.style.color  = nowOn ? 'rgba(48,224,144,.75)' : 'rgba(200,200,220,.6)';
    hint.style.display = '';
    setTimeout(() => { hint.style.display = 'none'; }, 2000);
  }
  _tagDdRefreshStatus();
}

// Open search modal pre-filtered to untagged
function tagDdOpenUntagged() {
  _tagDropOpen = false;
  document.getElementById('tag-dropdown').style.display = 'none';
  // Open body search with untagged filter pre-activated
  openBodySearch();
  _bsearchActiveTags.add('__untagged__');
  _bsearchBuildTagFilters();
  _bsearchRebuildNow();
}

// Remove all tags with confirmation
function tagDdRemoveAll() {
  const { total, untagged } = _tagDdCountStatus();
  const tagged = total - untagged;
  if(tagged === 0) {
    alert('No tags to remove — all bodies are already untagged.');
    return;
  }
  const confirmed = confirm(
    `Remove all tags from ${tagged} ${tagged===1?'body':'bodies'}?\n\n` +
    `⚠ Warning: some features (like tag filtering in body search) won't work without tags, ` +
    `and you'll have to tag all your bodies again manually if you remove them now.`
  );
  if(!confirmed) return;
  Object.values(bodies).forEach(b => { delete b.data.editor; });
  // Refresh sidebar tag row if a body is open
  if(selectedBody && bodies[selectedBody]) fillTagRow(selectedBody);
  _tagDdRefreshStatus();
  pushUndo();
}

// Close tag dropdown on outside click
document.addEventListener('mousedown', e => {
  try {
    const wrap = document.getElementById('tag-dropdown-wrap');
    const dd   = document.getElementById('tag-dropdown');
    if(dd && !dd.contains(e.target) && (!wrap || !wrap.contains(e.target))) {
      _tagDropOpen = false;
      dd.style.display = 'none';
    }
  } catch(_){}
}, true);





// Render a shaded sphere SVG using the body's map color into #sbb-icon
function updateBodyIcon(r, g, b, a){
  const cr = Math.min(1, r||0), cg = Math.min(1, g||0), cb = Math.min(1, b||0);
  const alpha = (a === undefined || a === null) ? 1 : Math.min(1, Math.max(0, a));
  const toHex = v => Math.round(v * 255).toString(16).padStart(2,'0');
  const baseHex = `#${toHex(cr)}${toHex(cg)}${toHex(cb)}`;
  const hiR = Math.min(1, cr + 0.42), hiG = Math.min(1, cg + 0.42), hiB = Math.min(1, cb + 0.42);
  const hiHex = `#${toHex(hiR)}${toHex(hiG)}${toHex(hiB)}`;
  const shR = cr * 0.28, shG = cg * 0.28, shB = cb * 0.28;
  const shHex = `#${toHex(shR)}${toHex(shG)}${toHex(shB)}`;
  const id = `bg_${Math.random().toString(36).slice(2,7)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <defs>
      <radialGradient id="${id}" cx="35%" cy="30%" r="65%">
        <stop offset="0%"   stop-color="${hiHex}" stop-opacity="${alpha}"/>
        <stop offset="45%"  stop-color="${baseHex}" stop-opacity="${alpha}"/>
        <stop offset="100%" stop-color="${shHex}" stop-opacity="${alpha}"/>
      </radialGradient>
    </defs>
    <circle cx="20" cy="20" r="18" fill="url(#${id})" />
  </svg>`;
  const el = document.getElementById('sbb-icon');
  if(el) el.innerHTML = svg;
}

function selectBody(name){
  // Blur any focused input before switching bodies to prevent data transfer
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  selectedBody = name;
  if (typeof NameGen !== 'undefined') NameGen.clearSession(name);
  document.getElementById('sb-sel').textContent = name;
  fillSidebar(name);
  // Respect sidebar lock — select the body but don't open the panel
  if(!window._disablePlanetSelection) openSidebar();
  drawViewport();
}

function openSidebar(){
  if(typeof groupSelectMode !== 'undefined' && groupSelectMode) return; // group mode owns the right panel
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('statusbar').style.right='340px';
  setTimeout(resizeViewport, 360);
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('statusbar').style.right='0';
  selectedBody=null;
  if (typeof NameGen !== 'undefined') NameGen.clearSession(null);
  document.getElementById('sb-sel').textContent='—';
  setTimeout(resizeViewport, 360);
  drawViewport();
}

// ── Delete body + all satellites recursively ──
function getSatelliteNames(parentName){
  const result = [];
  Object.keys(bodies).forEach(n => {
    if(bodies[n].data.ORBIT_DATA?.parent === parentName){
      result.push(n);
      result.push(...getSatelliteNames(n));
    }
  });
  return result;
}

function confirmDeleteBody(){
  if(!selectedBody || !bodies[selectedBody]) return;
  const sats = getSatelliteNames(selectedBody);
  const total = sats.length;
  const msg = total > 0
    ? `Delete "${selectedBody}" and its ${total} satellite${total>1?'s':''} (${sats.join(', ')})?`
    : `Delete "${selectedBody}"?`;
  if(!confirm(msg)) return;
  pushUndo();
  const toDelete = [selectedBody, ...sats];
  toDelete.forEach(n => delete bodies[n]);
  closeSidebar();
  drawViewport();
  syncAddBodyBtn();
  if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
}

// ── Change system center to an existing body (re-root the orbit tree) ────
// Shows a modal listing all non-center bodies. Selecting one re-roots
// the tree at that body: edges along the path are reversed, all other
// orbits are untouched.

function replaceCenterBody() {
  const names      = Object.keys(bodies);
  const centerName = names.find(n => bodies[n].isCenter);
  if (!centerName) { alert('No system center found.'); return; }

  const nonCenter = names.filter(n => !bodies[n].isCenter);
  if (!nonCenter.length) { alert('No other bodies in the system to promote.'); return; }

  // Build / show modal
  let modal = document.getElementById('change-center-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'change-center-modal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:300000;
      display:flex;align-items:center;justify-content:center;
      background:rgba(0,0,0,.72);backdrop-filter:blur(4px)`;
    modal.innerHTML = `
      <div style="background:rgba(6,10,22,.98);border:1px solid rgba(255,180,80,.3);
        border-radius:8px;padding:0;width:min(92vw,380px);
        font-family:'JetBrains Mono',monospace;overflow:hidden">

        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:12px 16px;border-bottom:1px solid rgba(255,180,80,.15)">
          <span style="font-family:'Orbitron',sans-serif;font-size:.6rem;
            color:rgba(255,180,80,.9);letter-spacing:.14em">⭐ CHANGE CENTER BODY</span>
          <button onclick="document.getElementById('change-center-modal').style.display='none'"
            style="background:none;border:none;cursor:pointer;color:rgba(180,180,210,.4);
            font-size:1.1rem;padding:0 4px;line-height:1">✕</button>
        </div>

        <div style="padding:12px 16px">
          <div style="font-size:.5rem;color:rgba(150,160,200,.55);margin-bottom:10px;line-height:1.6">
            Select a body to become the new system center.<br>
            Orbit edges along the path will be reversed. Bodies at the same level are re-parented to the new center.
          </div>
          <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;padding:8px 10px;background:rgba(255,180,80,.04);border:1px solid rgba(255,180,80,.12);border-radius:4px">
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.5rem;color:rgba(200,210,255,.7)">
              <input type="checkbox" id="ccm-recompute-dist" checked
                style="accent-color:#ffb450;width:13px;height:13px;cursor:pointer">
              Recompute distances relative to new center
            </label>
            <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:.5rem;color:rgba(200,210,255,.7)">
              <input type="checkbox" id="ccm-preserve-ecc"
                style="accent-color:#ffb450;width:13px;height:13px;cursor:pointer">
              Preserve eccentricity
            </label>
          </div>
          <div style="font-size:.48rem;color:rgba(255,180,80,.45);margin-bottom:6px;letter-spacing:.08em">
            CURRENT CENTER: <span id="ccm-current" style="color:rgba(255,200,100,.7)"></span>
          </div>
          <div id="ccm-list" style="display:flex;flex-direction:column;gap:4px;
            max-height:min(50vh,320px);overflow-y:auto;padding-right:2px"></div>
        </div>

      </div>`;
    document.body.appendChild(modal);
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }

  // Populate
  document.getElementById('ccm-current').textContent = centerName;
  const list = document.getElementById('ccm-list');
  list.innerHTML = '';

  // Sort by depth then name for readability
  nonCenter
    .slice()
    .sort((a, b) => {
      const da = _ccmDepth(a), db = _ccmDepth(b);
      return da !== db ? da - db : a.localeCompare(b);
    })
    .forEach(name => {
      const btn = document.createElement('button');
      const depth = _ccmDepth(name);
      const parent = bodies[name].data?.ORBIT_DATA?.parent || '?';
      btn.style.cssText = `
        display:flex;align-items:center;justify-content:space-between;
        width:100%;padding:9px 12px;background:rgba(255,180,80,.05);
        border:1px solid rgba(255,180,80,.15);border-radius:4px;
        cursor:pointer;text-align:left;transition:background .12s;
        font-family:'JetBrains Mono',monospace`;
      btn.innerHTML = `
        <span>
          <span style="display:block;font-size:.6rem;color:rgba(220,230,255,.9)">${name}</span>
          <span style="display:block;font-size:.46rem;color:rgba(150,160,200,.5);margin-top:2px">
            orbits ${parent} · depth ${depth}
          </span>
        </span>
        <span style="font-size:.52rem;color:rgba(255,180,80,.5);letter-spacing:.06em">PROMOTE →</span>`;
      btn.onmouseenter = () => { btn.style.background = 'rgba(255,180,80,.12)'; };
      btn.onmouseleave = () => { btn.style.background = 'rgba(255,180,80,.05)'; };
      btn.onclick = () => {
        const recomputeDist = document.getElementById('ccm-recompute-dist').checked;
        const preserveEcc   = document.getElementById('ccm-preserve-ecc').checked;
        modal.style.display = 'none';
        _ccmApply(centerName, name, recomputeDist, preserveEcc);
      };
      list.appendChild(btn);
    });

  modal.style.display = 'flex';
}

// Depth of a body in the tree (center = 0)
function _ccmDepth(name, visited) {
  visited = visited || new Set();
  if (visited.has(name)) return 99; // cycle guard
  visited.add(name);
  const b = bodies[name];
  if (!b) return 99;
  if (b.isCenter) return 0;
  const parent = b.data?.ORBIT_DATA?.parent;
  if (!parent || !bodies[parent]) return 1;
  return 1 + _ccmDepth(parent, visited);
}

// Find path from `from` up to `to` (inclusive on both ends).
// Returns array like [from, ..., to] or null if no path.
function _ccmPath(from, to, visited) {
  visited = visited || new Set();
  if (from === to) return [from];
  if (visited.has(from)) return null;
  visited.add(from);
  const b = bodies[from];
  if (!b) return null;
  const parent = b.data?.ORBIT_DATA?.parent;
  if (!parent) return null;
  const rest = _ccmPath(parent, to, visited);
  if (!rest) return null;
  return [from, ...rest];
}

// Apply the re-root: promote `newCenterName` to center,
// reversing every edge along the path to the old center.
// Compute absolute SMA from root by summing up the chain (uses raw semiMajorAxis, no difficulty scale)
function _ccmAbsSMA(name, visited) {
  visited = visited || new Set();
  if (visited.has(name)) return 0; // cycle guard
  visited.add(name);
  const b = bodies[name];
  if (!b) return 0;
  if (b.isCenter) return 0;
  const od = b.data?.ORBIT_DATA;
  if (!od) return 0;
  return od.semiMajorAxis + _ccmAbsSMA(od.parent, visited);
}

// Compute absolute world position (in metres, Y-up like SFS) by walking the orbit chain.
// Uses orbitGeometry conventions: body sits at periapsis point defined by AOP.
function _ccmAbsPos(name, visited) {
  visited = visited || new Set();
  if (visited.has(name)) return { x: 0, y: 0 };
  visited.add(name);
  const b = bodies[name];
  if (!b || b.isCenter) return { x: 0, y: 0 };
  const od = b.data?.ORBIT_DATA;
  if (!od || !od.parent) return { x: 0, y: 0 };
  const parentPos = _ccmAbsPos(od.parent, visited);
  const sma = od.semiMajorAxis;
  const ecc = od.eccentricity || 0;
  const aopRad = (od.argumentOfPeriapsis || 0) * Math.PI / 180;
  const c = sma * ecc; // focus offset
  // Body sits at periapsis: distance from focus = sma*(1-ecc)
  // bodyX = parentX + (sma - c)*cos(aop),  bodyY = parentY + (sma - c)*sin(aop)  [Y-up]
  return {
    x: parentPos.x + (sma - c) * Math.cos(aopRad),
    y: parentPos.y + (sma - c) * Math.sin(aopRad)
  };
}

function _ccmApply(oldCenterName, newCenterName, recomputeDist, preserveEcc) {
  // Find path: newCenter → ... → oldCenter
  const path = _ccmPath(newCenterName, oldCenterName);
  if (!path) {
    alert(`Cannot find path from "${newCenterName}" to "${oldCenterName}". Cannot re-root.`);
    return;
  }

  pushUndo();

  // Walk path pairs [newCenter, A], [A, B], ..., [N, oldCenter]
  // For each pair [child, parent], we need to reverse: parent gets child's old orbit (with AOP flipped)
  // We snapshot ORBIT_DATA before modifying anything
  const snapshots = {};
  path.forEach(n => {
    const od = bodies[n].data?.ORBIT_DATA;
    snapshots[n] = od ? JSON.parse(JSON.stringify(od)) : null;
  });

  // Compute absolute SMAs and positions before any modifications (needed for distance/AOP recompute)
  const absSMA = {};
  const absPos = {};
  if (recomputeDist) {
    Object.keys(bodies).forEach(name => {
      absSMA[name] = _ccmAbsSMA(name);
      absPos[name] = _ccmAbsPos(name);
    });
  }
  const newCenterAbsSMA = recomputeDist ? (absSMA[newCenterName] || 0) : 0;
  const newCenterPos    = recomputeDist ? (absPos[newCenterName] || { x: 0, y: 0 }) : { x: 0, y: 0 };

  const pathSet = new Set(path);

  for (let i = 0; i < path.length - 1; i++) {
    const childName  = path[i];     // was child
    const parentName = path[i + 1]; // was parent — now becomes child of childName

    const childOD = snapshots[childName]; // the orbit that child had around parent

    if (childOD) {
      // Reverse the edge: parentName now orbits childName
      // SMA and eccentricity stay the same (same ellipse)
      // AOP flips by 180° (periapsis on the other side)
      bodies[parentName].data.ORBIT_DATA = {
        parent:              childName,
        semiMajorAxis:       childOD.semiMajorAxis,
        smaDifficultyScale:  childOD.smaDifficultyScale  || {},
        eccentricity:        childOD.eccentricity        || 0,
        argumentOfPeriapsis: ((childOD.argumentOfPeriapsis || 0) + 180) % 360,
        direction:           childOD.direction           ?? 1,
        multiplierSOI:       childOD.multiplierSOI       ?? 2.5,
        soiDifficultyScale:  childOD.soiDifficultyScale  || {}
      };
      bodies[parentName].isCenter = false;
    }

    // Re-parent all non-path bodies that orbited parentName to now orbit childName.
    // parentName's position in the hierarchy is being taken over by childName.
    Object.keys(bodies).forEach(name => {
      if (pathSet.has(name)) return;
      const od = bodies[name].data?.ORBIT_DATA;
      if (od && od.parent === parentName) {
        od.parent = childName;
        if (recomputeDist) {
          // Recompute SMA as Euclidean distance from new center
          const bp = absPos[name] || { x: 0, y: 0 };
          const dx = bp.x - newCenterPos.x;
          const dy = bp.y - newCenterPos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const newSMA = Math.max(1000, dist);
          od.semiMajorAxis = newSMA;
          if (!preserveEcc) od.eccentricity = 0;
          // AOP = angle from new center to body (Y-up → atan2(dy, dx), converted to degrees)
          od.argumentOfPeriapsis = Math.atan2(dy, dx) * 180 / Math.PI;
        }
      }
    });
  }

  // Promote new center
  delete bodies[newCenterName].data.ORBIT_DATA;
  bodies[newCenterName].isCenter = true;

  // Update center name label in sidebar header if present
  const sbCenter = document.getElementById('sb-center');
  if (sbCenter) sbCenter.textContent = newCenterName;

  // _cachedSMAScale is invalidated automatically at the top of each drawViewport frame

  if (typeof resizeViewport  === 'function') resizeViewport();
  if (typeof updateStatusBar === 'function') updateStatusBar();
  if (typeof drawViewport    === 'function') drawViewport();

  // If selected body was affected, refresh sidebar
  if (typeof fillSidebar === 'function' && selectedBody && bodies[selectedBody]) {
    fillSidebar(selectedBody);
  }
}

// ── Replace body preset (keep orbit, satellites unaffected) ──
function replaceBodyPrompt(){
  if(!selectedBody || !bodies[selectedBody]) return;
  const existing = bodies[selectedBody];
  const isCenterBody = existing.isCenter;

  // Reuse the main preset modal in replace mode
  let _replaceKey = selectedPresetKey;
  isForCenter = isCenterBody;

  // Temporarily patch openPreset to replace instead of add
  const modal = document.getElementById('modal-preset');
  const confirmBtn = document.getElementById('prs-confirm-btn');
  const descEl = document.getElementById('mp-desc');

  descEl.innerHTML = `Replace <strong style="color:var(--sky2)">${selectedBody}</strong> — orbit and satellites are preserved`;
  confirmBtn.textContent = '⇄ REPLACE BODY';

  // Override confirm action
  const originalOnClick = confirmBtn.onclick;
  confirmBtn.onclick = () => {
    const all = buildAllPresets();
    const preset = all.find(p => p.key === selectedPresetKey);
    if(!preset) return;
    pushUndo();
    const old = bodies[selectedBody];
    const newData = normalizeDiffScaleKeys(JSON.parse(JSON.stringify(preset.data)));
    if(old.data.ORBIT_DATA) newData.ORBIT_DATA = JSON.parse(JSON.stringify(old.data.ORBIT_DATA));
    else delete newData.ORBIT_DATA;
    bodies[selectedBody] = { data:newData, preset:preset.id, isCenter:old.isCenter, color:preset.color, glow:preset.glow, icon:preset.icon };
    closePreset();
    confirmBtn.onclick = originalOnClick; // restore
    fillSidebar(selectedBody);
    drawViewport();
  };

  // Reset tabs and search
  _prsTab = 'all';
  _prsSearch = '';
  try { prsRefreshNamedTabs(); } catch(_){}
  document.querySelectorAll('.prs-tab').forEach((t,i)=>t.classList.toggle('on', i===0));
  const searchEl = document.getElementById('prs-search');
  if(searchEl) searchEl.value = '';

  prsRebuild();
  modal.classList.add('open');

  // Make sure cancel restores the confirm button
  const origClose = window._prsCloseHook;
  window._prsCloseHook = () => { confirmBtn.onclick = originalOnClick; };
}

// ── Import a body directly from a .txt file (Upload TXT in preset modal) ──
function importBodyFromTxt(input){
  const file = input.files[0];
  input.value = ''; // reset so same file can be re-selected
  if(!file) return;

  const reader = new FileReader();
  reader.onload = e => {
    let raw = e.target.result;

    if(typeof _isLegacyPlanetText === 'function' && _isLegacyPlanetText(raw)){
      if(typeof showLegacyFormatNotice === 'function'){
        _legacyPending = { kind: 'addBody', items: [{ fileName: file.name, raw }] };
        showLegacyFormatNotice([file.name], 'single');
      } else {
        alert('"' + file.name + '" uses the old pre-1.5 planet format and needs to be converted first.');
      }
      return;
    }

    // Lenient parse: same fixes as zip importer
    try {
      raw = raw
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/(\d)\.(?=[,\s}\]])/g, '$10');
    } catch(_){}

    let bodyData;
    try { bodyData = normalizeDiffScaleKeys(JSON.parse(raw)); }
    catch(err) { alert('Could not parse .txt file:\n' + err.message); return; }

    _lcFinishAddBody(bodyData, file.name);
  };
  reader.readAsText(file);
}

// Everything that happens once we have a valid (already-current-format) bodyData
// object to add via the Add Body flow — split out of importBodyFromTxt so the
// legacy-conversion path (see _legacyConvertPending in io.js) can reuse it
// after converting a pre-1.5 file, instead of duplicating this logic.
function _lcFinishAddBody(bodyData, fileName){
  // Derive name from filename (strip .txt)
  let name = (fileName || 'Body').replace(/\.txt$/i, '').trim() || 'Body';

  // Deduplicate name if it already exists
  if(bodies[name]){
    let n = 2;
    while(bodies[name + '_' + n]) n++;
    name = name + '_' + n;
  }

  pushUndo();

  // Determine if this should be the center
  const lacksOrbit = !bodyData.ORBIT_DATA;
  const existingCenter = Object.values(bodies).find(b => b.isCenter);

  if(isForCenter){
    // Called from openPreset(true) — replace center slot
    if(existingCenter){
      alert('A system center already exists. Remove it first.');
      return;
    }
    delete bodyData.ORBIT_DATA;
  } else if(lacksOrbit && !existingCenter){
    // No center yet and file has no orbit — treat as center
    // (fine — user dropped a star txt as first body)
  } else if(lacksOrbit && existingCenter){
      // File has no orbit data but a center exists — inject a smart default orbit
      const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || 'Sun';
      const parentName = (selectedBody && bodies[selectedBody]) ? selectedBody : centerName;
      const parentBody = bodies[parentName];
      const parentRadius = (parentBody?.data?.BASE_DATA?.radius) || (existingCenter.data.BASE_DATA?.radius || 1e6);
      const AU_m = 1.496e11;
      // Compute parent SOI (null = infinite, i.e. system center)
      let parentSOI_m = null;
      if(parentBody && !parentBody.isCenter) parentSOI_m = computeSOI_m(parentName);
      const siblings = Object.values(bodies).filter(b =>
        b.data.ORBIT_DATA && b.data.ORBIT_DATA.parent === parentName
      );
      let smartSMA;
      if(parentSOI_m === null){
        // System center (infinite SOI) — start at 0.01 AU minimum, push out past siblings
        const minC = Math.max(parentRadius * 80, 0.01 * AU_m);
        smartSMA = siblings.length > 0
          ? Math.max(Math.max(...siblings.map(b => effectiveSMA(b.data.ORBIT_DATA))) * 1.5, minC)
          : minC;
      } else if(parentSOI_m <= parentRadius){
        // Degenerate SOI (inside body radius) — classic fallback
        smartSMA = parentRadius * 80;
      } else {
        const soiSafe = parentSOI_m * 0.80;
        if(siblings.length > 0){
          const maxSibSMA = Math.max(...siblings.map(b => effectiveSMA(b.data.ORBIT_DATA)));
          const candidate = maxSibSMA * 1.5;
          smartSMA = candidate <= soiSafe ? candidate
            : maxSibSMA < soiSafe ? maxSibSMA + (soiSafe - maxSibSMA) * 0.5
            : soiSafe * 0.5;
        } else {
          smartSMA = soiSafe * 0.33;
        }
        smartSMA = Math.min(smartSMA, soiSafe);
        smartSMA = Math.max(smartSMA, parentRadius * 5);
        if(parentRadius * 5 >= soiSafe) smartSMA = (parentRadius + soiSafe) * 0.5;
      }
      smartSMA = Math.max(smartSMA, parentRadius * 5);
      bodyData.ORBIT_DATA = {
        parent: parentName,
        semiMajorAxis: smartSMA,
        eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
        multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
      };
    }

    // Replace-mode: the confirm button was patched — honour the same orbit-preserve logic
    const replaceMode = document.getElementById('prs-confirm-btn').textContent.includes('REPLACE');
    if(replaceMode && selectedBody && bodies[selectedBody]){
      const old = bodies[selectedBody];
      if(old.data.ORBIT_DATA) bodyData.ORBIT_DATA = JSON.parse(JSON.stringify(old.data.ORBIT_DATA));
      else delete bodyData.ORBIT_DATA;
      name = selectedBody; // keep the same name slot
    } else if(bodyData.ORBIT_DATA){
      // File already has orbit data but its parent may be from a different system.
      // Repoint parent to wherever the user is adding this body (selected body or center).
      const centerName = Object.keys(bodies).find(n => bodies[n].isCenter);
      const targetParent = (selectedBody && bodies[selectedBody] && !bodies[selectedBody].isCenter)
        ? selectedBody
        : (centerName || bodyData.ORBIT_DATA.parent);
      bodyData.ORBIT_DATA.parent = targetParent;
    }

    const _meta = inferPresetMeta(name, bodyData);
    const isCenter = !bodyData.ORBIT_DATA && !existingCenter;
    bodies[name] = {
      data: bodyData,
      preset: _meta.id,
      isCenter,
      color: _meta.color,
      glow: _meta.glow,
      icon: _meta.icon
    };

    if(isCenter){
      document.getElementById('empty-state').classList.add('gone');
    }

    closePreset();
    syncAddBodyBtn();
    if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
    updateStatusBar();
    selectBody(name);
    drawViewport();
}

// ── Smooth animated zoom to a body ──
function zoomToBody(name){
  const b = bodies[name];
  if(!b) return;
  const wp = bodyWorldPos[name];
  if(!wp) return;
  const vp = document.getElementById('viewport');
  const W = vp.width, H = vp.height;
  const bodyR   = (b.data.BASE_DATA||{}).radius || 1;
  const rMult   = getRadiusDifficultyMult(b.data.BASE_DATA);
  const sc      = getSMAScale();
  const physR   = bodyR * rMult * sc;
  const targetZ = physR > 0 ? (Math.min(W,H) * 0.18) / physR : 4;
  const endZ = Math.max(0.0001, targetZ);

  // On mobile the sidebar slides up from the bottom covering ~45vh + 44px statusbar.
  // Shift the pan target upward so the body appears centred in the visible area.
  const sb = document.getElementById('sidebar');
  const sbOpen = sb && sb.classList.contains('open');
  const isMobile = window.innerWidth <= 600;
  const sidebarCoverPx = (sbOpen && isMobile) ? (window.innerHeight * 0.45 + 44) : 0;
  // Convert pixel offset to world-space offset at the new zoom level
  const yShift = sidebarCoverPx / 2 / endZ;

  const startZ = vpZ, startX = vpOffX, startY = vpOffY;
  const endX = -wp.x, endY = -wp.y - yShift;
  const panDur = 380, zoomDur = 320;
  const t0 = performance.now();

  function _ease(t){ return t<0.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }

  // Phase 1: pan to body at current zoom
  function panStep(now){
    const t = Math.min(1, (now-t0)/panDur);
    const e = _ease(t);
    vpOffX = startX + (endX-startX)*e;
    vpOffY = startY + (endY-startY)*e;
    const zb = document.getElementById('sb-zoom');
    if(zb) zb.textContent = Math.round(vpZ*100)+'%';
    drawViewport();
    if(t<1) requestAnimationFrame(panStep);
    else{ const t1 = performance.now(); requestAnimationFrame(now2 => zoomStep(t1, now2)); }
  }

  // Phase 2: zoom in once pan is done
  function zoomStep(t1, now){
    const t = Math.min(1, (now-t1)/zoomDur);
    const e = _ease(t);
    vpZ = startZ + (endZ-startZ)*e;
    const zb = document.getElementById('sb-zoom');
    if(zb) zb.textContent = Math.round(vpZ*100)+'%';
    drawViewport();
    if(t<1){ const _t1=t1; requestAnimationFrame(now2 => zoomStep(_t1, now2)); }
  }

  requestAnimationFrame(panStep);
}


function switchTab(id,btn){
  document.querySelectorAll('.sbt').forEach(b=>b.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
  btn.classList.add('on');
  document.getElementById('tab-'+id).classList.add('on');
  // Scroll the clicked tab into view within the scrollable bar
  btn.scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'});
  // When switching to JSON tab, populate with current body data
  if(id === 'json') refreshJsonView();
}

// ── Tab bar: drag-to-scroll + wheel-to-scroll + fade-edge indicators ──
(function(){
  const tabs  = document.getElementById('sb-tabs');
  const wrap  = document.getElementById('sb-tabs-wrap');
  if(!tabs || !wrap) return;

  // Update fade-edge classes
  function syncEdges(){
    const atStart = tabs.scrollLeft <= 2;
    const atEnd   = tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth - 2;
    wrap.classList.toggle('at-start', atStart);
    wrap.classList.toggle('at-end',   atEnd);
  }
  tabs.addEventListener('scroll', syncEdges, {passive:true});
  syncEdges();
  // Re-check after fonts load (tab widths may shift)
  window.addEventListener('load', syncEdges);

  // Mouse-wheel horizontal scroll
  tabs.addEventListener('wheel', e => {
    if(Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already horizontal
    e.preventDefault();
    tabs.scrollLeft += e.deltaY * 0.8;
  }, {passive: false});

  // Drag-to-scroll
  let dragging = false, startX = 0, startScroll = 0, moved = false;
  tabs.addEventListener('mousedown', e => {
    if(e.button !== 0) return;
    dragging = true; moved = false;
    startX = e.clientX;
    startScroll = tabs.scrollLeft;
    tabs.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if(!dragging) return;
    const dx = e.clientX - startX;
    if(Math.abs(dx) > 4) moved = true;
    tabs.scrollLeft = startScroll - dx;
  });
  window.addEventListener('mouseup', e => {
    if(!dragging) return;
    dragging = false;
    tabs.style.cursor = '';
    // If we dragged, swallow the next click so the button isn't fired
    if(moved){
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); tabs.removeEventListener('click', swallow, true); };
      tabs.addEventListener('click', swallow, {capture:true, once:true});
    }
  });

  // Touch drag (mobile passthrough already works via overflow-x, but keep cursor tidy)
})();

// ── JSON tab ──
function refreshJsonView(){
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;
  const _jd = JSON.parse(JSON.stringify(b.data));
  const { version: _jv, ..._jr } = _jd;
  const out = { version: _jv || '1.5', ..._jr };
  const el = document.getElementById('json-editor');
  el.value = JSON.stringify(out, null, 2);
  el.style.borderColor = 'var(--ac15)';
  el.style.color = '#90d8a0';
  document.getElementById('json-error').style.display = 'none';
}

function validateJsonEdit(text){
  const el = document.getElementById('json-editor');
  const err = document.getElementById('json-error');
  try {
    JSON.parse(text);
    el.style.borderColor = 'rgba(48,200,100,.3)';
    el.style.color = '#90d8a0';
    err.style.display = 'none';
  } catch(e){
    el.style.borderColor = 'rgba(255,64,96,.4)';
    el.style.color = '#f08080';
    err.textContent = '⚠ ' + e.message;
    err.style.display = 'block';
  }
}

function applyJsonEdit(){
  if(!selectedBody) return;
  const text = document.getElementById('json-editor').value;
  try {
    const parsed = normalizeDiffScaleKeys(JSON.parse(text));
    // Remove version from data (it's added on export)
    delete parsed.version;
    pushUndo();
    bodies[selectedBody].data = parsed;
    // Refresh all other sidebar tabs from new data
    fillSidebar(selectedBody);
    // Stay on JSON tab
    document.querySelectorAll('.sbt').forEach(b=>b.classList.remove('on'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('on'));
    document.querySelector('.sbt[onclick*="json"]').classList.add('on');
    document.getElementById('tab-json').classList.add('on');
    refreshJsonView();
    drawViewport();
    const el = document.getElementById('json-editor');
    el.style.borderColor = 'rgba(48,200,100,.5)';
    setTimeout(()=>{ el.style.borderColor='var(--ac15)'; }, 1000);
  } catch(e){
    document.getElementById('json-error').textContent = '⚠ Cannot apply — invalid JSON: ' + e.message;
    document.getElementById('json-error').style.display = 'block';
  }
}

let _jsonAutoApplyTimer = null;
function _jsonAutoApply(text){
  clearTimeout(_jsonAutoApplyTimer);
  _jsonAutoApplyTimer = setTimeout(() => {
    try {
      JSON.parse(text); // validate first — throws if invalid
      applyJsonEdit();
    } catch(e){ /* invalid JSON — wait for more input */ }
  }, 800);
}

// Float value helper — like parseFloat but returns `fallback` only when the string is empty/NaN,
// NOT when the parsed value is 0 or negative (unlike the `|| fallback` pattern).
function _fv(str, fallback){ const n = parseFloat(str); return isNaN(n) ? fallback : n; }

function tog(id){ return document.getElementById(id).classList.contains('on'); }

// ── Gravity unit helpers (m/s², cm/s², km/s²) ────────────────────────────────
const _GRAV_TO_MS2 = { ms2: 1, cms2: 0.01, kms2: 1000 };

function _gravToMs2(val, unit) { return val * (_GRAV_TO_MS2[unit] ?? 1); }
function _ms2ToGrav(ms2, unit) { return ms2 / (_GRAV_TO_MS2[unit] ?? 1); }

function onGravUnitChange() {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  if (!input || !unitSel) return;
  // Called only from the unit SELECT's onchange — convert displayed value to new unit
  const raw = parseFloat(input.value);
  if (!isNaN(raw) && raw !== 0) {
    const prevUnit = input.dataset.gravUnit || 'ms2';
    const ms2 = _gravToMs2(raw, prevUnit);
    input.value = parseFloat(_ms2ToGrav(ms2, unitSel.value).toPrecision(6)).toString();
  }
  input.dataset.gravUnit = unitSel.value;
  if (typeof liveSync === 'function') liveSync();
}

function getGravMs2() {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  const raw = parseFloat(input?.value) || 0;
  const unit = unitSel?.value || 'ms2';
  return _gravToMs2(raw, unit);
}

function setGravDisplay(ms2) {
  const input = document.getElementById('b-gravity');
  const unitSel = document.getElementById('b-gravity-unit');
  if (!input) return;
  // Don't overwrite a field the user is actively editing
  if (document.activeElement === input) return;
  const unit = unitSel?.value || 'ms2';
  const v = _ms2ToGrav(ms2, unit);
  input.value = ms2 !== 0 ? parseFloat(v.toPrecision(6)).toString() : '';
  input.dataset.gravUnit = unit;
}

// ── Default difficulty scale button ───────────────────────────────────────────
// Sets Normal=1, Hard=2, Realistic=20 — matching SFS 1:20 / 1:10 / 1:1 ratio
function setDefaultScale(nId, hId, rId) {
  const n = document.getElementById(nId);
  const h = document.getElementById(hId);
  const r = document.getElementById(rId);
  if (n) n.value = '1';
  if (h) h.value = '2';
  if (r) r.value = '20';
  if (typeof liveSync === 'function') liveSync();
}

// ── Simple km/m toggle for atmosphere, clouds, water fields ──────────────────
// These fields store raw metres; we just scale display on unit change.
function onSimpleKmChange(inputId) {
  const input  = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  if (!input || !unitSel) return;
  if (document.activeElement === input) return;  // don't clobber mid-edit
  const raw = parseFloat(input.value);
  if (isNaN(raw) || raw === 0) return;
  const newUnit = unitSel.value; // 'm' or 'km'
  const prevUnit = newUnit === 'km' ? 'm' : 'km';
  const metres = prevUnit === 'km' ? raw * 1000 : raw;
  input.value = (newUnit === 'km' ? parseFloat((metres / 1000).toPrecision(6)) : metres).toString();
  if (typeof liveSync === 'function') liveSync();
}

// Read a simple km/m field back to metres for liveSync
function getSimpleKmMetres(inputId) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  const raw = parseFloat(input?.value) || 0;
  const unit = unitSel?.value || 'm';
  return unit === 'km' ? raw * 1000 : raw;
}

// Set a simple km/m field from metres, respecting current unit selection
function setSimpleKm(inputId, metres) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(inputId + '-unit');
  if (!input) return;
  const unit = unitSel?.value || 'm';
  input.value = unit === 'km'
    ? (metres !== 0 ? parseFloat((metres / 1000).toPrecision(6)) : '')
    : (metres !== 0 ? metres : '');
}

function setTog(id, v){ document.getElementById(id).classList.toggle('on', !!v); }
function val(id){ return document.getElementById(id).value; }
function setVal(id, v){ if(document.getElementById(id)) document.getElementById(id).value = (v==null||v===undefined)?'':v; }

// Slider sync helpers
function _sliderPct(v, min, max){ return ((v - min) / (max - min) * 100).toFixed(2) + '%'; }
function syncSlider(id, min, max){
  // number input → slider; liveSync() fires via delegated sidebar 'input' listener
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = Math.max(min, Math.min(max, parseFloat(inp.value) || 0));
  sl.value = v;
  sl.style.setProperty('--pct', _sliderPct(v, min, max));
  if(val) val.textContent = inp.value;
  // Do NOT call liveSync() here — the number-input's own 'input' event
  // already bubbles to the sidebar delegated listener which calls liveSync().
  // Calling it again here was causing a double liveSync()+drawViewport() per tick.
}
function syncFromSlider(id, min, max, decimals){
  // slider → number input; liveSync() fires via delegated sidebar 'input' listener
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = parseFloat(sl.value);
  inp.value = v.toFixed(decimals);
  sl.style.setProperty('--pct', _sliderPct(v, min, max));
  if(val) val.textContent = inp.value;
  // Do NOT call liveSync() here — the slider's own 'input' event already
  // bubbles to the sidebar delegated listener which calls liveSync().
  // Calling it again here was causing a double liveSync()+drawViewport() per tick.
}
function setSlider(id, v, min, max){
  // Called from renderBody to initialise both input and slider
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp) return;
  const clamped = (v == null || v === undefined) ? min : Math.max(min, Math.min(max, v));
  inp.value = clamped;
  if(sl){ sl.value = clamped; sl.style.setProperty('--pct', _sliderPct(clamped, min, max)); }
  if(val) val.textContent = clamped;
}

// Call after populating a slider-augmented input to sync the thumb position
function initSlider(id, min, max){
  const inp = document.getElementById(id);
  const sl  = document.getElementById(id + '-sl');
  const val = document.getElementById(id + '-val');
  if(!inp || !sl) return;
  const v = parseFloat(inp.value);
  if(!isNaN(v)){
    const clamped = Math.max(min, Math.min(max, v));
    sl.value = clamped;
    sl.style.setProperty('--pct', _sliderPct(clamped, min, max));
    if(val) val.textContent = v;
  }
}

// ── Toggle helpers ──
function toggleAtmos(){
  const on = tog('ap-has');
  document.getElementById('atmos-fields').style.opacity = on ? '1' : '0.3';
  document.getElementById('atmos-fields').style.pointerEvents = on ? 'all' : 'none';
  if(on && !val('ap-height')){
    const r = getDistMetres('b-radius');
    if(r) setVal('ap-height', Math.round(r / 10));
  }
}
function toggleRings(){
  const on = tog('rng-has');
  document.getElementById('rings-fields').style.opacity = on ? '1' : '0.35';
  document.getElementById('rings-fields').style.pointerEvents = on ? 'all' : 'none';
  if(on && !val('rng-sr') && !val('rng-er')){
    const r = getDistMetres('b-radius');
    if(r){
      setDistInput('rng-sr','rng-sr-unit','rng-sr-hint', Math.round(r * 1.2), 'radius');
      setDistInput('rng-er','rng-er-unit','rng-er-hint', Math.round(r * 3),   'radius');
    }
  }
}
function toggleAtmoSection(fieldId,togId){ const on=tog(togId); const el=document.getElementById(fieldId); if(el){el.style.opacity=on?'1':'0.3';el.style.pointerEvents=on?'all':'none';} }
function toggleOrbit(){ const on=tog('or-has'); document.getElementById('orbit-fields').style.opacity=on?'1':'0.35'; document.getElementById('orbit-fields').style.pointerEvents=on?'all':'none'; }
function toggleOrbitHas(){
  // If the body is NOT the center, orbit is mandatory — don't allow toggling off
  const b = selectedBody && bodies[selectedBody];
  if(b && !b.isCenter){
    // Force it back on
    setTog('or-has', true);
    toggleOrbit();
    return;
  }
  // Center body has no orbit — toggle is meaningless but allow for completeness
  document.getElementById('or-has').classList.toggle('on');
  toggleOrbit();
}
function toggleRings(){ const on=tog('rng-has'); document.getElementById('rings-fields').style.opacity=on?'1':'0.35'; document.getElementById('rings-fields').style.pointerEvents=on?'all':'none'; }
function toggleWater(){ const on=tog('wt-has'); document.getElementById('water-fields').style.opacity=on?'1':'0.35'; document.getElementById('water-fields').style.pointerEvents=on?'all':'none'; }
function toggleTerrain(){
  const on = tog('ter-has');
  document.getElementById('terrain-fields').style.opacity = on ? '1' : '0.35';
  document.getElementById('terrain-fields').style.pointerEvents = on ? 'all' : 'none';
  // Sync heightmap tab gating
  const hmNoTerrain = document.getElementById('heightmap-no-terrain');
  const hmFields    = document.getElementById('heightmap-fields');
  if(hmNoTerrain) hmNoTerrain.style.display = on ? 'none' : 'block';
  if(hmFields)    hmFields.style.display    = on ? ''     : 'none';
  liveSync();
}

function fillSidebar(name){
  liveSync._filling = true;
  const b = bodies[name];
  if(!b){ liveSync._filling = false; return; }
  const d = b.data;

  // If the user is mid-edit in a sidebar input, don't clobber it.
  // We still run fillSidebar so all OTHER fields stay in sync; setVal/setDistInput
  // will skip the actively-focused element via this guard.
  const _fillFocusId = document.activeElement?.closest('#sidebar') ? document.activeElement.id : null;
  // Temporarily patch setVal to skip the focused field
  const _origSetVal = window.setVal;
  window.setVal = function(id, v){
    if(id && id === _fillFocusId) return;  // user is typing here, leave it alone
    _origSetVal(id, v);
  };

  // Header
  const nameInput = document.getElementById('sbb-name-input');
  nameInput.value = name;
  nameInput.classList.remove('conflict');
  document.getElementById('sbb-type').textContent = b.isCenter ? 'System Center' : '';
  fillTagRow(name);

  // BASE
  const BD = d.BASE_DATA||{};
  { const _rm = (typeof getRadiusDifficultyMult === 'function') ? getRadiusDifficultyMult(BD) : 1;
    setDistInput('b-radius','b-radius-unit','b-radius-hint', (BD.radius ?? 0) * _rm, 'radius'); }
  const rds = BD.radiusDifficultyScale||{};
  // Empty string when not set — prevents baking defaults into the file on every liveSync.
  setVal('b-radius-n', rds.Normal    ?? '');
  setVal('b-radius-h', rds.Hard      ?? '');
  setVal('b-radius-r', rds.Realistic ?? '');
  setGravDisplay(BD.gravity);
  const gds = BD.gravityDifficultyScale||{};
  setVal('b-grav-n', gds.Normal    ?? '');
  setVal('b-grav-h', gds.Hard      ?? '');
  setVal('b-grav-r', gds.Realistic ?? '');
  setVal('b-twh', BD.timewarpHeight);
  setVal('b-vah', BD.velocityArrowsHeight);
  const mc = BD.mapColor||{r:1,g:1,b:1,a:1};
  // HDR: Sun uses r=2,g=2,b=2. Store brightness multiplier separately, normalise to 0-1 for picker.
  const hdrMult = Math.max(1, mc.r, mc.g, mc.b);
  const hdrScale = hdrMult > 1 ? hdrMult : 1;
  setCpick('b-cpick','b-chex','b-cr','b-cg','b-cb',
    mc.r/hdrScale, mc.g/hdrScale, mc.b/hdrScale,
    'b-ca-slider','b-ca-val','b-ca', mc.a||1);
  setVal('b-hdr', hdrScale.toFixed(1));
  // Draw map-color sphere icon (uses clamped 0-1 values for the picker)
  updateBodyIcon(mc.r/hdrScale, mc.g/hdrScale, mc.b/hdrScale, mc.a||1);
  setTog('b-sig', BD.significant); setTog('b-rc', BD.rotateCamera);

  // Achievements
  const AC = d.ACHIEVEMENT_DATA||{};
  setTog('a-landed',AC.Landed); setTog('a-takeoff',AC.Takeoff); setTog('a-atmosphere',AC.Atmosphere);
  setTog('a-orbit',AC.Orbit); setTog('a-crash',AC.Crash);

  // ATMOSPHERE PHYSICS
  const hasAtmos = !!d.ATMOSPHERE_PHYSICS_DATA;
  setTog('ap-has', hasAtmos);
  const APD = d.ATMOSPHERE_PHYSICS_DATA||{};
  setSimpleKm('ap-height',APD.height); setVal('ap-density',APD.density); setVal('ap-curve',APD.curve);
  setVal('ap-chute',APD.parachuteMultiplier); setVal('ap-upper',APD.upperAtmosphere);
  setVal('ap-shock',APD.shockwaveIntensity); setVal('ap-mhvm',APD.minHeatingVelocityMultiplier);
  toggleAtmos();

  // ATMO VISUALS
  const hasAtmoVisuals = !!d.ATMOSPHERE_VISUALS_DATA;
  setTog('av-has', hasAtmoVisuals);
  const AVD = d.ATMOSPHERE_VISUALS_DATA||{};
  const GR = AVD.GRADIENT||{}; setVal('av-pz',GR.positionZ); setSimpleKm('av-height',GR.height);
  setSelectVal('av-tex', GR.texture);
  toggleAtmoSection('av-fields','av-has');

  // CLOUDS (sub-section of ATMO_VISUALS)
  const hasClouds = !!(AVD.CLOUDS && AVD.CLOUDS.texture && AVD.CLOUDS.texture !== 'None');
  setTog('cl-has', hasClouds);
  const CL = AVD.CLOUDS||{}; setSelectVal('cl-tex',CL.texture); setSimpleKm('cl-sh',CL.startHeight);
  setSimpleKm('cl-w',CL.width); setSimpleKm('cl-h',CL.height); setSlider('cl-a', CL.alpha, 0, 1); setCloudVelDisplay(CL.velocity || 0);
  initSlider('cl-a',0,1);
  toggleAtmoSection('cl-fields','cl-has');

  // FRONT CLOUDS
  const FC = d.FRONT_CLOUDS_DATA||{};
  const hasFrontClouds = !!d.FRONT_CLOUDS_DATA;
  setTog('fc-has', hasFrontClouds);
  setSelectVal('fc-tex',FC.cloudsTexture); setSlider('fc-cut', FC.cloudTextureCutout, -1, 1);
  initSlider('fc-cut',-1,1);
  setSimpleKm('fc-fzh',FC.fadeZoneHeight); setSimpleKm('fc-h',FC.height); setVal('fc-pz',FC.positionZ);
  setTog('fc-sa',FC.sharpenAlpha);
  toggleAtmoSection('fc-fields','fc-has');

  // FOG
  const fogKeys = (AVD.FOG||{}).keys||[];
  const hasFog = fogKeys.length > 0;
  setTog('fog-has', hasFog);
  buildFogKeys(fogKeys);
  toggleAtmoSection('fog-fields','fog-has');

  // TERRAIN
  const hasTerrain = !!d.TERRAIN_DATA;
  setTog('ter-has', hasTerrain);
  const TD = d.TERRAIN_DATA||{};
  const TTD = TD.TERRAIN_TEXTURE_DATA||{};
  setSelectVal('tt-pt',TTD.planetTexture); setSlider('tt-cut', TTD.planetTextureCutout, -1, 1);
  initSlider('tt-cut',-1,1);
  setSlider('tt-rot', TTD.planetTextureRotation, -360, 360); setTog('tt-nd', !TTD.planetTextureDontDistort);
  initSlider('tt-rot',-360,360);
  setSelectVal('tt-sa',TTD.surfaceTexture_A);
  const sa=TTD.surfaceTextureSize_A||{}; setVal('tt-sax',sa.x); setVal('tt-say',sa.y);
  setVal('tt-lod-a', TTD.surfaceLOD_A != null && TTD.surfaceLOD_A >= 0 ? TTD.surfaceLOD_A : '');
  setSelectVal('tt-sb',TTD.surfaceTexture_B);
  const sb=TTD.surfaceTextureSize_B||{}; setVal('tt-sbx',sb.x); setVal('tt-sby',sb.y);
  setVal('tt-lod-b', TTD.surfaceLOD_B != null && TTD.surfaceLOD_B >= 0 ? TTD.surfaceLOD_B : '');
  setSelectVal('tt-tc',TTD.terrainTexture_C);
  const tc=TTD.terrainTextureSize_C||{}; setVal('tt-tcx',tc.x); setVal('tt-tcy',tc.y);
  setVal('tt-lod-c', TTD.surfaceLOD_C != null && TTD.surfaceLOD_C >= 0 ? TTD.surfaceLOD_C : '');
  setVal('tt-sls',TTD.surfaceLayerSize); setSlider('tt-mif', TTD.minFade, 0, 1); setSlider('tt-maf', TTD.maxFade, 0, 1);
  initSlider('tt-mif',0,1);
  initSlider('tt-maf',0,1);
  setVal('tt-si',TTD.shadowIntensity); setVal('tt-sh',TTD.shadowHeight);

  const tfd = TD.terrainFormulaDifficulties||{};
  document.getElementById('tf-normal').value = (tfd.Normal||[]).join('\n');
  document.getElementById('tf-hard').value = (tfd.Hard||[]).join('\n');
  document.getElementById('tf-realistic').value = (tfd.Realistic||[]).join('\n');
  // textureFormula in MISC tab
  document.getElementById('tf-texture').value = (TD.textureFormula||[]).join('\n');
  setVal('ter-vs',TD.verticeSize); setTog('ter-col',TD.collider!==false);
  // Flat zones in MISC tab
  buildFlatZones(TD.flatZones||[]);

  const RK = TD.rocks||{};
  setSelectVal('rk-type',RK.rockType||'None'); setVal('rk-den',RK.rockDensity);
  setSlider('rk-min', RK.minSize, 0, 10); setSlider('rk-max', RK.maxSize, 0, 10);
  initSlider('rk-min',0,10);
  initSlider('rk-max',0,10);
  setVal('rk-pc',RK.powerCurve); setSlider('rk-ma', RK.maxAngle, 0, 90);
  initSlider('rk-ma',0,90);
  // Apply terrain toggle state (locks/unlocks terrain-fields + heightmap tab)
  toggleTerrain();
  // Sync the visual heightmap UI from the just-filled textareas
  setTimeout(hmSyncFromTextareas, 0);

  // RINGS
  const hasRings = !!d.RINGS_DATA;
  setTog('rng-has',hasRings);
  const RNG = d.RINGS_DATA||{};
  setSelectVal('rng-tex',RNG.ringsTexture);
  setDistInput('rng-sr','rng-sr-unit','rng-sr-hint', RNG.startRadius ?? 0, 'radius');
  setDistInput('rng-er','rng-er-unit','rng-er-hint', RNG.endRadius   ?? 0, 'radius');
  setVal('rng-pz',RNG.positionZ);
  const rmc = RNG.mapColor||{r:0.85,g:0.75,b:0.65,a:0.2};
  setCpick('rng-map-pick','rng-map-hex','rng-map-r','rng-map-g','rng-map-b',rmc.r,rmc.g,rmc.b,'rng-map-a-s','rng-map-a-v','rng-map-a',rmc.a);
  toggleRings();

  // WATER
  const hasWater = !!d.WATER_DATA;
  setTog('wt-has',hasWater);
  const WT = d.WATER_DATA||{};
  setSelectVal('wt-tex',WT.oceanMaskTexture); setTog('wt-lt',WT.lowerTerrain);
  setSimpleKm('wt-dep',WT.oceanDepth); setSlider('wt-so', WT.opacity_Surface, 0, 1); setSlider('wt-fo', WT.opacity_Far, 0, 1);
  initSlider('wt-so',0,1);
  initSlider('wt-fo',0,1);
  // Water colours
  const ws=WT.sand||{r:.9,g:.86,b:.81,a:1};
  setCpick('wt-sand-pick','wt-sand-hex','wt-sand-r','wt-sand-g','wt-sand-b',ws.r,ws.g,ws.b,'wt-sand-a-s','wt-sand-a-v','wt-sand-a',ws.a);
  const wsh=WT.shallow||{r:.1,g:.68,b:1,a:.4};
  setCpick('wt-shal-pick','wt-shal-hex','wt-shal-r','wt-shal-g','wt-shal-b',wsh.r,wsh.g,wsh.b,'wt-shal-a-s','wt-shal-a-v','wt-shal-a',wsh.a);
  const wd2=WT.deep||{r:.1,g:.15,b:.55,a:1};
  setCpick('wt-deep-pick','wt-deep-hex','wt-deep-r','wt-deep-g','wt-deep-b',wd2.r,wd2.g,wd2.b,'wt-deep-a-s','wt-deep-a-v','wt-deep-a',wd2.a);
  const wfl=WT.floor||{r:.25,g:.25,b:.25,a:1};
  setCpick('wt-floor-pick','wt-floor-hex','wt-floor-r','wt-floor-g','wt-floor-b',wfl.r,wfl.g,wfl.b,'wt-floor-a-s','wt-floor-a-v','wt-floor-a',wfl.a);
  // Map color
  const wmc=WT.mapColor||{r:wsh.r,g:wsh.g,b:wsh.b,a:.4};
  setCpick('wt-map-pick','wt-map-hex','wt-map-r','wt-map-g','wt-map-b',wmc.r,wmc.g,wmc.b,'wt-map-a-s','wt-map-a-v','wt-map-a',wmc.a);
  // Opacity / visibility
  setSlider('wt-fd', WT.opacity_FullDarkness??0.95, 0, 1); initSlider('wt-fd',0,1);
  setSimpleKm('wt-svd', WT.surfaceVisibilityDistance??1200);
  setSimpleKm('wt-fdd', WT.fullDarknessDepth??500);
  setSimpleKm('wt-fdvd', WT.fullDarknessVisibilityDistance??300);
  // Mask gradient — Water
  const mgw=WT.maskGradient_Water||{must:1000,cannot:700,global:2000};
  setVal('wt-mgw-must', mgw.must); setVal('wt-mgw-can', mgw.cannot); setVal('wt-mgw-glob', mgw.global);
  setVal('wt-wgwm', WT.waterGradientWidthMultiplier??0.5);
  // Mask gradient — Terrain
  const mgt=WT.maskGradient_Terrain||{must:25,cannot:25,global:50};
  setVal('wt-mgt-must', mgt.must); setVal('wt-mgt-can', mgt.cannot); setVal('wt-mgt-glob', mgt.global);
  setVal('wt-sgwm', WT.sandGradientWidthMultiplier??2.0);
  setVal('wt-fgwm', WT.floorGradientWidthMultiplier??10.0);
  // Noise & Waves
  const snz=WT.shoreNoiseSize||{x:3000,y:1000};
  setVal('wt-snx', snz.x); setVal('wt-sny', snz.y);
  const sndz=WT.sandNoiseSize||{x:500,y:100};
  setVal('wt-dnx', sndz.x); setVal('wt-dny', sndz.y);
  const wvz=WT.wavesSize||{x:16,y:0.3};
  setVal('wt-wvx', wvz.x); setVal('wt-wvy', wvz.y);
  toggleWater();

  // ORBIT
  const hasOrbit = !!d.ORBIT_DATA;
  const isCenter = b.isCenter;

  // Hide entire orbit tab button for center body; show for others
  const orbitTabBtn = document.querySelector('.sbt[onclick*="orbit"]');
  if(orbitTabBtn) orbitTabBtn.style.display = isCenter ? 'none' : '';

  // For non-center bodies, orbit is mandatory — show the lock hint, disable the toggle
  const orHasEl   = document.getElementById('or-has');
  const orLockedHint = document.getElementById('or-locked-hint');
  if(!isCenter){
    setTog('or-has', true);          // always on
    if(orHasEl){ orHasEl.style.opacity='0.4'; orHasEl.style.cursor='not-allowed'; }
    if(orLockedHint) orLockedHint.style.display = 'block';
  } else {
    setTog('or-has', hasOrbit);
    if(orHasEl){ orHasEl.style.opacity=''; orHasEl.style.cursor=''; }
    if(orLockedHint) orLockedHint.style.display = 'none';
  }

  const OR = d.ORBIT_DATA||{};
  setVal('or-par',OR.parent);
  { // Use effective scale: per-body override if present, else global default.
    // Mirrors the game's SmaScale() — per-body replaces global entirely.
    const _sds = OR.smaDifficultyScale || {};
    const _vdk = (typeof viewDiffKey !== 'undefined') ? viewDiffKey : 'Normal';
    const _defS = (typeof _DEF_SMA_SCALE !== 'undefined') ? _DEF_SMA_SCALE : {Normal:1,Hard:2,Realistic:20};
    const _gm = (_sds[_vdk] != null) ? _sds[_vdk] : (_defS[_vdk] ?? 1);
    setDistInput('or-sma','or-sma-unit','or-sma-hint', (OR.semiMajorAxis ?? 0) * _gm, 'sma'); }
  const _rawSds=OR.smaDifficultyScale||{};
  const sds={ Normal: _rawSds.Normal ?? _rawSds.normal, Hard: _rawSds.Hard ?? _rawSds.hard, Realistic: _rawSds.Realistic ?? _rawSds.realistic };
  // Use empty string (not 1) when no per-body scale is set.
  // This way liveSync's buildDiffScale() sees NaN for empty fields and skips them,
  // preserving an empty smaDifficultyScale instead of baking in {1,1,1} which would
  // override the game's global defaults (1,2,20) every time any field is touched.
  setVal('or-sn', sds.Normal    ?? '');
  setVal('or-sh', sds.Hard      ?? '');
  setVal('or-sr', sds.Realistic ?? '');
  setSlider('or-ecc', OR.eccentricity, 0, 0.999); setSlider('or-aop', OR.argumentOfPeriapsis, -360, 360);
  initSlider('or-ecc',0,0.999);
  initSlider('or-aop',-360,360);
  setSelectVal('or-dir', String(OR.direction ?? 1));  // ?? not || so 0 is preserved
  setVal('or-soi',OR.multiplierSOI);
  const ssds=OR.soiDifficultyScale||{};
  // Same empty-string treatment as smaDifficultyScale above.
  setVal('or-soin', ssds.Normal    ?? '');
  setVal('or-soih', ssds.Hard      ?? '');
  setVal('or-soir', ssds.Realistic ?? '');
  updateSOIDisplay();
  if (typeof updatePeriodFromSMA === 'function') setTimeout(updatePeriodFromSMA, 0);
  toggleOrbit();

  // POST PROCESSING
  buildPPKeys(((d.POST_PROCESSING||{}).keys)||[]);

  // LANDMARKS
  buildLandmarks(d.LANDMARKS||[]);

  // Restore the original setVal now that fill is complete
  window.setVal = _origSetVal;
  liveSync._filling = false;
}

// ── FOG KEYS ──
function buildFogKeys(keys){
  const el = document.getElementById('fog-keys-list'); el.innerHTML='';
  keys.forEach((k,i)=>{
    el.appendChild(makeFogKey(k,i));
  });
}
function makeFogKey(k,i){
  const col = k.color||{r:0,g:0,b:0,a:0};
  const hex = rgbToHex(col.r, col.g, col.b);
  const alpha = (col.a||0).toFixed(2);
  const d=document.createElement('div'); d.className='pp-key'; d.id='fk-'+i;
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">FOG KEY ${i+1}</span><button class="pp-key-del" onclick="delFogKey(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Distance</span><input class="finput" id="fk-${i}-d" type="text" inputmode="decimal" step="100" value="${k.distance||0}" oninput="liveSync()"></div>
  <div class="cpick-wrap"><span class="flabel">Color</span>
    <input type="color" class="cpick-swatch" id="fk-${i}-pick" value="${hex}" oninput="onCpick('fk-${i}-pick','fk-${i}-hex','fk-${i}-r','fk-${i}-g','fk-${i}-b');liveSync()">
    <input type="text" class="cpick-hex" id="fk-${i}-hex" value="${hex}" maxlength="7" oninput="onChex('fk-${i}-hex','fk-${i}-pick','fk-${i}-r','fk-${i}-g','fk-${i}-b');liveSync()">
  </div>
  <div class="cpick-alpha-row"><span class="cpick-alpha-label">A</span>
    <input type="range" class="cpick-alpha" id="fk-${i}-a-s" min="0" max="1" step="0.01" value="${alpha}" oninput="document.getElementById('fk-${i}-a-v').textContent=parseFloat(this.value).toFixed(2);document.getElementById('fk-${i}-a').value=this.value;liveSync()">
    <span class="cpick-alpha-val" id="fk-${i}-a-v">${alpha}</span>
  </div>
  <input type="hidden" id="fk-${i}-r" value="${col.r||0}">
  <input type="hidden" id="fk-${i}-g" value="${col.g||0}">
  <input type="hidden" id="fk-${i}-b" value="${col.b||0}">
  <input type="hidden" id="fk-${i}-a" value="${col.a||0}">`;
  return d;
}
function addFogKey(){
  const keys = collectFogKeys();
  keys.push({distance:0,color:{r:0,g:0,b:0,a:0}});
  buildFogKeys(keys);
  liveSync();
}
function delFogKey(i){
  const keys = collectFogKeys();
  keys.splice(i, 1);
  buildFogKeys(keys);
  liveSync();
}

// ── PP KEYS ──
function buildPPKeys(keys){
  const el=document.getElementById('pp-keys-list'); el.innerHTML='';
  keys.forEach((k,i)=>el.appendChild(makePPKey(k,i)));
}
function makePPKey(k,i){
  const hex = rgbToHex(k.red||1, k.green||1, k.blue||1);
  const d=document.createElement('div'); d.className='pp-key'; d.id='ppk-'+i;
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">KEY ${i+1}</span><button class="pp-key-del" onclick="delPPKey(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Height</span><input class="finput" id="ppk-${i}-h" type="text" inputmode="decimal" step="100" value="${k.height||0}"></div>
  <div class="frow"><span class="flabel">Shadow Intens.</span><input class="finput" id="ppk-${i}-si" type="text" inputmode="decimal" step="0.05" value="${k.shadowIntensity||1}"></div>
  <div class="frow"><span class="flabel">Star Intens.</span><input class="finput" id="ppk-${i}-sti" type="text" inputmode="decimal" step="0.1" value="${k.starIntensity||0}"></div>
  <div class="frow"><span class="flabel">Hue Shift</span><input class="finput" id="ppk-${i}-hs" type="text" inputmode="decimal" step="0.1" value="${k.hueShift||0}"></div>
  <div class="frow"><span class="flabel">Saturation</span><input class="finput" id="ppk-${i}-sat" type="text" inputmode="decimal" step="0.01" value="${k.saturation||1}"></div>
  <div class="frow"><span class="flabel">Contrast</span><input class="finput" id="ppk-${i}-con" type="text" inputmode="decimal" step="0.01" value="${k.contrast||1}"></div>
  <div class="cpick-wrap"><span class="flabel">RGB Tint</span>
    <input type="color" class="cpick-swatch" id="ppk-${i}-pick" value="${hex}"
      oninput="onCpick('ppk-${i}-pick','ppk-${i}-hex','ppk-${i}-r','ppk-${i}-g','ppk-${i}-b');liveSync()">
    <input type="text" class="cpick-hex" id="ppk-${i}-hex" value="${hex}" maxlength="7"
      oninput="onChex('ppk-${i}-hex','ppk-${i}-pick','ppk-${i}-r','ppk-${i}-g','ppk-${i}-b');liveSync()">
  </div>
  <input type="hidden" id="ppk-${i}-r" value="${(k.red||1).toFixed(4)}">
  <input type="hidden" id="ppk-${i}-g" value="${(k.green||1).toFixed(4)}">
  <input type="hidden" id="ppk-${i}-b" value="${(k.blue||1).toFixed(4)}">`;
  return d;
}
function addPPKey(){
  const keys = collectPPKeys();
  keys.push({height:0,shadowIntensity:1.75,starIntensity:0,hueShift:0,saturation:0.95,contrast:1.2,red:1,green:1,blue:1});
  buildPPKeys(keys);
  liveSync();
}
function delPPKey(i){
  const keys = collectPPKeys();
  keys.splice(i, 1);
  buildPPKeys(keys);
  liveSync();
}

// ── LANDMARKS ──
function buildLandmarks(lms){
  const el=document.getElementById('lm-list'); el.innerHTML='';
  lms.forEach((l,i)=>{
    let name = l.name || '';
    let prefix = l.prefix || '';
    if(!prefix && name){
      const words = name.split(' ');
      const lastWord = words[words.length - 1];
      if(words.length > 1 && USGS_TERMS.some(t => t.term === lastWord)){
        prefix = lastWord;
        name = words.slice(0, -1).join(' ');
      }
    }
    el.appendChild(makeLandmark({...l, name, prefix}, i));
  });
}

// Draws a mini arc SVG showing where on a 360° circle the landmark sits.
// centre and width are in degrees.
function _lmArcSVG(centre, width){
  const R=34, cx=44, cy=44, size=88;
  // Convert SFS angle convention to SVG arc: SFS 0° = top (like a compass).
  // SVG 0° = right, so offset by -90°.
  const startDeg = centre - width/2;
  const endDeg   = centre + width/2;
  const toRad = d => (d - 90) * Math.PI / 180;
  const sx = cx + R * Math.cos(toRad(startDeg));
  const sy = cy + R * Math.sin(toRad(startDeg));
  const ex = cx + R * Math.cos(toRad(endDeg));
  const ey = cy + R * Math.sin(toRad(endDeg));
  const largeArc = (width % 360) > 180 ? 1 : 0;
  // Centre tick
  const tickAngle = toRad(centre);
  const tx1 = cx + (R-7) * Math.cos(tickAngle);
  const ty1 = cy + (R-7) * Math.sin(tickAngle);
  const tx2 = cx + (R+7) * Math.cos(tickAngle);
  const ty2 = cy + (R+7) * Math.sin(tickAngle);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="rgba(100,150,220,.18)" stroke-width="6"/>
    <path d="M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 ${largeArc},1 ${ex.toFixed(1)},${ey.toFixed(1)}"
      fill="none" stroke="rgba(100,220,180,.75)" stroke-width="7" stroke-linecap="round"/>
    <line x1="${tx1.toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${tx2.toFixed(1)}" y2="${ty2.toFixed(1)}"
      stroke="rgba(255,210,80,.9)" stroke-width="2" stroke-linecap="round"/>
    <text x="${cx}" y="${cy+4}" text-anchor="middle" font-family="'JetBrains Mono',monospace"
      font-size="8" fill="rgba(180,200,255,.6)">${Math.round(centre)}°</text>
  </svg>`;
}

function _lmSyncArc(i){
  const cEl = document.getElementById(`lm-${i}-c`);
  const wEl = document.getElementById(`lm-${i}-w`);
  if(!cEl || !wEl) return;
  const centre = parseFloat(cEl.value) || 0;
  const width  = parseFloat(wEl.value) || 10;
  const arc = document.getElementById(`lm-${i}-arc`);
  if(arc) arc.innerHTML = _lmArcSVG(centre, width);
  // Update read-only startAngle / endAngle display
  const sa = document.getElementById(`lm-${i}-sa`);
  const ea = document.getElementById(`lm-${i}-ea`);
  if(sa) sa.textContent = (centre - width/2).toFixed(1) + '°';
  if(ea) ea.textContent = (centre + width/2).toFixed(1) + '°';
}

function makeLandmark(l, i){
  const d = document.createElement('div');
  d.className = 'lm-item'; d.id = 'lm-' + i;

  const sa = typeof l.startAngle === 'number' ? l.startAngle : 0;
  const ea = typeof l.endAngle   === 'number' ? l.endAngle   : 10;
  // Match game's Math_Utility formulas exactly:
  // AngularWidth = NormalizeAngleDegrees(endAngle - startAngle)  -> (-180, 180]
  // Center       = NormalizePositiveAngleDegrees(startAngle + AngularWidth/2) -> [0, 360)
  function normalizeAngleDeg(a){ while(a>180) a-=360; while(a<=-180) a+=360; return a; }
  function normalizePosAngleDeg(a){ while(a>360) a-=360; while(a<0) a+=360; return a; }
  const width  = normalizeAngleDeg(ea - sa) || 10;
  const centre = normalizePosAngleDeg(sa + width / 2);

  const prefixVal = (l.prefix || '').trim();

  // Build sorted prefix options list
  const _pfxOpts = USGS_TERMS.slice().sort((a,b)=>a.term.localeCompare(b.term))
    .map(t=>`<option value="${t.term}" ${prefixVal===t.term?'selected':''}>${t.term}</option>`).join('');

  d.innerHTML = `
    <div class="pp-key-header">
      <span class="pp-key-title">LANDMARK ${i+1}</span>
      <button class="lm-del" onclick="delLandmark(${i})">✕</button>
    </div>

    <div class="frow" style="gap:5px;align-items:center">
      <span class="flabel" style="flex-shrink:0">Name</span>
      <input class="finput" id="lm-${i}-n" type="text" value="${(l.name||'').replace(/"/g,'&quot;')}"
        oninput="liveSync()" style="flex:1;min-width:0">
      <div style="position:relative;flex-shrink:0">
        <select id="lm-${i}-pfx" onchange="liveSync()"
          title="Planetary descriptor (USGS)"
          style="appearance:none;-webkit-appearance:none;padding:4px 22px 4px 7px;
            font-family:'JetBrains Mono',monospace;font-size:.6rem;font-weight:700;
            color:var(--amber);background:rgba(204,153,68,.1);
            border:1px solid rgba(204,153,68,.3);border-radius:4px;cursor:pointer;
            max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
            transition:all .18s;outline:none">
          <option value="">— none —</option>
          ${_pfxOpts}
        </select>
        <span style="pointer-events:none;position:absolute;right:5px;top:50%;transform:translateY(-50%);
          font-size:.55rem;color:var(--amber);opacity:.7">▾</span>
      </div>
    </div>

    <!-- Arc visualiser + computed start/end readout -->
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;padding:6px 8px;
      background:rgba(10,16,36,.6);border-radius:6px;border:1px solid rgba(100,220,180,.1)">
      <div id="lm-${i}-arc">${_lmArcSVG(centre, width)}</div>
      <div style="flex:1;font-family:'JetBrains Mono',monospace;font-size:.58rem">
        <div style="color:var(--ink4);margin-bottom:3px">START → <span id="lm-${i}-sa" style="color:var(--sky2)">${sa.toFixed(1)}°</span></div>
        <div style="color:var(--ink4)">END &nbsp; → <span id="lm-${i}-ea" style="color:var(--sky2)">${ea.toFixed(1)}°</span></div>
        <div style="color:rgba(100,220,180,.35);margin-top:6px;font-size:.52rem">Width: <span id="lm-${i}-wd" style="color:rgba(100,220,180,.7)">${width.toFixed(1)}°</span></div>
      </div>
    </div>

    <!-- Centre slider -->
    <div class="frow" style="flex-direction:column;gap:3px;margin-bottom:6px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="flabel" style="font-size:.62rem">POSITION (centre)</span>
        <input type="number" inputmode="decimal" id="lm-${i}-c-num"
          value="${centre.toFixed(1)}" min="0" max="360" step="0.5"
          style="width:62px;font-family:'JetBrains Mono',monospace;font-size:.66rem;
            color:var(--sky2);background:rgba(10,16,36,.8);border:1px solid rgba(100,150,220,.3);
            border-radius:3px;padding:2px 5px;text-align:right;outline:none"
          oninput="const sl=document.getElementById('lm-${i}-c');if(sl)sl.value=this.value;_lmSyncArc(${i});liveSync()">
      </div>
      <input type="range" id="lm-${i}-c" min="0" max="360" step="0.5" value="${centre.toFixed(1)}"
        class="lm-slider lm-slider-pos"
        oninput="const n=document.getElementById('lm-${i}-c-num');if(n)n.value=parseFloat(this.value).toFixed(1);_lmSyncArc(${i});liveSync()">
    </div>

    <!-- Width slider -->
    <div class="frow" style="flex-direction:column;gap:3px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span class="flabel" style="font-size:.62rem">WIDTH (angular span)</span>
        <input type="number" inputmode="decimal" id="lm-${i}-w-num"
          value="${width.toFixed(1)}" min="0.5" max="180" step="0.5"
          style="width:62px;font-family:'JetBrains Mono',monospace;font-size:.66rem;
            color:rgba(100,220,180,.9);background:rgba(10,16,36,.8);border:1px solid rgba(100,220,180,.25);
            border-radius:3px;padding:2px 5px;text-align:right;outline:none"
          oninput="const sl=document.getElementById('lm-${i}-w');if(sl)sl.value=this.value;const wd=document.getElementById('lm-${i}-wd');if(wd)wd.textContent=parseFloat(this.value).toFixed(1)+'°';_lmSyncArc(${i});liveSync()">
      </div>
      <input type="range" id="lm-${i}-w" min="0.5" max="180" step="0.5" value="${width.toFixed(1)}"
        class="lm-slider lm-slider-wid"
        oninput="const n=document.getElementById('lm-${i}-w-num');if(n)n.value=parseFloat(this.value).toFixed(1);const wd=document.getElementById('lm-${i}-wd');if(wd)wd.textContent=parseFloat(this.value).toFixed(1)+'°';_lmSyncArc(${i});liveSync()">
    </div>`;
  return d;
}

function addLandmark(){
  const l = document.getElementById('lm-list');
  const i = l.children.length;
  l.appendChild(makeLandmark({name:'', startAngle:175, endAngle:185}, i));
}
function delLandmark(i){ document.getElementById('lm-'+i)?.remove(); liveSync(); }

// Auto-save: any text/number input in the sidebar triggers liveSync on blur
// ── Colour picker helpers ──
// All SFS colours are stored as 0–1 floats. The picker works in hex (#rrggbb)
// and writes back to hidden float inputs (0–1).

function rgbToHex(r, g, b){
  const clamp = v => Math.max(0, Math.min(1, v));
  const toH = v => Math.round(clamp(v) * 255).toString(16).padStart(2,'0');
  return '#' + toH(r) + toH(g) + toH(b);
}
function hexToRgb01(hex){
  hex = hex.replace('#','');
  if(hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
  if(hex.length !== 6) return null;
  const n = parseInt(hex, 16);
  if(isNaN(n)) return null;
  return { r: ((n>>16)&0xff)/255, g: ((n>>8)&0xff)/255, b: (n&0xff)/255 };
}
// Called when the native colour swatch changes → update hex text + hidden floats
function onCpick(pickId, hexId, rId, gId, bId){
  const hex = document.getElementById(pickId).value;
  document.getElementById(hexId).value = hex;
  const rgb = hexToRgb01(hex);
  if(rgb){
    document.getElementById(rId).value = rgb.r.toFixed(4);
    document.getElementById(gId).value = rgb.g.toFixed(4);
    document.getElementById(bId).value = rgb.b.toFixed(4);
  }
  // Update alpha slider gradient
  const slider = document.getElementById(hexId.replace('-hex','-a-s')) ||
                 document.getElementById(pickId.replace('-pick','-a-s'));
  if(slider) slider.style.setProperty('--swatch-color', hex);
  liveSync();
}
// Called when hex text changes → update swatch + hidden floats
function onChex(hexId, pickId, rId, gId, bId){
  let hex = document.getElementById(hexId).value.trim();
  if(!hex.startsWith('#')) hex = '#'+hex;
  const rgb = hexToRgb01(hex);
  if(rgb){
    document.getElementById(pickId).value = hex;
    document.getElementById(rId).value = rgb.r.toFixed(4);
    document.getElementById(gId).value = rgb.g.toFixed(4);
    document.getElementById(bId).value = rgb.b.toFixed(4);
  }
  liveSync();
}
// Set a colour picker group from 0–1 float values
function setCpick(pickId, hexId, rId, gId, bId, r, g, b, aSlider, aVal, aHid, a){
  const hex = rgbToHex(r||0, g||0, b||0);
  const el = id => document.getElementById(id);
  const aVal2 = (a == null) ? 1 : a;  // null/undefined → 1, but preserve 0
  if(el(pickId)) el(pickId).value = hex;
  if(el(hexId))  el(hexId).value  = hex;
  if(el(rId))    el(rId).value    = (r||0).toFixed(4);
  if(el(gId))    el(gId).value    = (g||0).toFixed(4);
  if(el(bId))    el(bId).value    = (b||0).toFixed(4);
  if(aSlider && el(aSlider)){ el(aSlider).value = aVal2; el(aSlider).style.setProperty('--swatch-color', hex); }
  if(aVal    && el(aVal))    el(aVal).textContent  = aVal2.toFixed(2);
  if(aHid    && el(aHid))    el(aHid).value        = aVal2.toFixed(4);
}
// Read a colour picker group → returns {r,g,b,a} in 0–1 floats, with HDR multiplier applied
function getCpick(rId, gId, bId, aHid, hdrId){
  const fv = id => { const el=document.getElementById(id); if(!el) return 0; const v=parseFloat(el.value); return isNaN(v)?0:v; };
  const fa = id => { const el=document.getElementById(id); if(!el||el.value==='') return 1; const v=parseFloat(el.value); return isNaN(v)?1:v; };
  const hdr = hdrId ? (parseFloat(document.getElementById(hdrId)?.value)||1) : 1;
  return { r: fv(rId)*hdr, g: fv(gId)*hdr, b: fv(bId)*hdr, a: fa(aHid||'_none') };
}

// ── Universal live-sync ──
// Every input/change in the sidebar instantly writes back to bodies[selectedBody].data
// and redraws. "Apply Changes" is now just a save-confirmation, not the only sync point.

function liveSync(){
  if(liveSync._filling) return;
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;

  // Debounced undo: snapshot pre-edit state once, push after 800ms quiet
  if(!liveSync._undoPending){
    liveSync._undoPending = true;
    liveSync._preEditSnapshot = JSON.stringify(bodies);
    setTimeout(()=>{
      const after = JSON.stringify(bodies);
      if(liveSync._preEditSnapshot !== after){
        undoStack.push(liveSync._preEditSnapshot);
        if(undoStack.length > MAX_UNDO) undoStack.shift();
        document.getElementById('undo-btn').disabled = false;
        document.getElementById('undo-btn').classList.add('undo-active');
      }
      liveSync._undoPending = false;
      liveSync._preEditSnapshot = null;
    }, 800);
  }

  // Throttle: run the full sync + redraw at most once per animation frame.
  // On weak mobile, oninput fires faster than the canvas can redraw —
  // without this every keystroke queues a synchronous full render.
  if(liveSync._rafPending) return;
  liveSync._rafPending = true;
  requestAnimationFrame(() => {
    liveSync._rafPending = false;
    _liveSyncNow();
  });
}

function _liveSyncNow(){
  if(liveSync._filling) return;
  if(!selectedBody) return;
  const b = bodies[selectedBody];
  if(!b) return;
  const d = b.data;

  // When the user is actively typing in a text/number field, that field's current
  // raw string may be incomplete (e.g. "-", "1.", ""). We must not parse it yet —
  // instead keep the last committed value for that field.
  const _focusId = document.activeElement?.id || '';

  // Safe numeric read: if the focused element is this field and its raw value is
  // unparseable/empty, return the fallback instead of clobbering with 0 or NaN.
  // For all other fields parse normally with the standard fallback.
  function _sf(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    if (el.id === _focusId) {
      const n = parseFloat(el.value);
      return isNaN(n) ? fallback : n;   // if mid-edit and value invalid, keep last good value
    }
    const n = parseFloat(el.value);
    return isNaN(n) ? fallback : n;
  }

  // Only invalidate terrain cache when a terrain-relevant field triggered the sync.
  // Orbit fields (SMA, eccentricity, AoP, direction) never affect terrain geometry —
  // skipping the invalidation prevents a full terrain re-sample every slider tick on mobile.
  const _orbitOnlyIds = new Set(['or-ecc','or-ecc-sl','or-aop','or-aop-sl','or-sma','or-sma-unit','or-dir','or-period','or-period-unit']);
  if(typeof invalidateTerrainCache === 'function' && !_orbitOnlyIds.has(_focusId)){
    invalidateTerrainCache(selectedBody);
  }

  // BASE DATA
  d.BASE_DATA = d.BASE_DATA || {};
  { const _rm = (typeof getRadiusDifficultyMult === 'function') ? getRadiusDifficultyMult(d.BASE_DATA) : 1;
    const _rv = getDistMetres('b-radius'); if(_rv) d.BASE_DATA.radius = _rm > 0 ? _rv / _rm : _rv; }
  d.BASE_DATA.radiusDifficultyScale = buildDiffScale('b-radius-n','b-radius-h','b-radius-r');
  d.BASE_DATA.gravity             = getGravMs2() || d.BASE_DATA.gravity;
  d.BASE_DATA.gravityDifficultyScale = buildDiffScale('b-grav-n','b-grav-h','b-grav-r');
  d.BASE_DATA.timewarpHeight      = _sf('b-twh', d.BASE_DATA.timewarpHeight);
  d.BASE_DATA.velocityArrowsHeight= _sf('b-vah', d.BASE_DATA.velocityArrowsHeight ?? 0);
  d.BASE_DATA.mapColor = getCpick('b-cr','b-cg','b-cb','b-ca','b-hdr');
  // Keep sphere icon in sync with map color (picker values are already 0-1 clamped)
  { const _mc = d.BASE_DATA.mapColor;
    updateBodyIcon(_mc.r, _mc.g, _mc.b, _mc.a); }
  d.BASE_DATA.significant         = tog('b-sig');
  d.BASE_DATA.rotateCamera        = tog('b-rc');

  // ACHIEVEMENTS
  d.ACHIEVEMENT_DATA = { Landed:tog('a-landed'), Takeoff:tog('a-takeoff'), Atmosphere:tog('a-atmosphere'), Orbit:tog('a-orbit'), Crash:tog('a-crash') };

  // ATMOSPHERE PHYSICS
  if(tog('ap-has')){
    // Preserve fields with no UI controls so edits don't wipe per-body difficulty scales
    const _apPrev = d.ATMOSPHERE_PHYSICS_DATA || {};
    d.ATMOSPHERE_PHYSICS_DATA = {
      height: getSimpleKmMetres('ap-height'), density: _sf('ap-density', 0),
      curve: _sf('ap-curve', 0), curveScale: _apPrev.curveScale || {},
      parachuteMultiplier: _sf('ap-chute', 1),
      upperAtmosphere: _sf('ap-upper', 0),
      heightDifficultyScale: _apPrev.heightDifficultyScale || {},
      shockwaveIntensity: _sf('ap-shock', 0),
      minHeatingVelocityMultiplier: _sf('ap-mhvm', 1)
    };
  } else delete d.ATMOSPHERE_PHYSICS_DATA;

  // ATMO VISUALS
  if(tog('av-has')){
    const cloudsObj = tog('cl-has')
      ? { texture:val('cl-tex'), startHeight:getSimpleKmMetres('cl-sh'), width:getSimpleKmMetres('cl-w'), height:getSimpleKmMetres('cl-h'), alpha:_sf('cl-a', 0), velocity:_sf('cl-v', 0) }
      : { texture:'None', startHeight:0, width:0, height:0, alpha:0, velocity:0 };
    const fogObj = tog('fog-has')
      ? { keys: collectFogKeys() }
      : { keys: [] };
    // Preserve heightDifficultyScale on GRADIENT — it has no UI control
    const _gradPrev = d.ATMOSPHERE_VISUALS_DATA?.GRADIENT || {};
    d.ATMOSPHERE_VISUALS_DATA = {
      GRADIENT: { positionZ:_sf('av-pz', 0), height:getSimpleKmMetres('av-height'), heightDifficultyScale: _gradPrev.heightDifficultyScale || {}, texture:val('av-tex') },
      CLOUDS: cloudsObj,
      FOG: fogObj
    };
  } else delete d.ATMOSPHERE_VISUALS_DATA;

  // FRONT CLOUDS
  if(tog('fc-has')){
    const fctex = val('fc-tex');
    d.FRONT_CLOUDS_DATA = { cloudsTexture:fctex||'None', cloudTextureCutout:_sf('fc-cut', 1), fadeZoneHeight:getSimpleKmMetres('fc-fzh'), height:getSimpleKmMetres('fc-h'), positionZ:_sf('fc-pz', 0), sharpenAlpha:tog('fc-sa') };
  } else delete d.FRONT_CLOUDS_DATA;

  // TERRAIN — respect the "Has Terrain Data" toggle
  if(tog('ter-has'))
  {
    const ptex = val('tt-pt');
    const tfd = {};
    const tn = document.getElementById('tf-normal').value.trim();
    const th = document.getElementById('tf-hard').value.trim();
    const tr = document.getElementById('tf-realistic').value.trim();
    if(tn) tfd.Normal   = tn.split('\n').map(s=>s.trim()).filter(Boolean);
    if(th) tfd.Hard     = th.split('\n').map(s=>s.trim()).filter(Boolean);
    if(tr) tfd.Realistic= tr.split('\n').map(s=>s.trim()).filter(Boolean);
    d.TERRAIN_DATA = {
      TERRAIN_TEXTURE_DATA: {
        planetTexture: ptex || 'None',
        planetTextureCutout:_fv(val('tt-cut'),-1),
        planetTextureRotation:_sf('tt-rot', 0), planetTextureDontDistort:!tog('tt-nd'),
        surfaceTexture_A:val('tt-sa'), surfaceTextureSize_A:{x:_fv(val('tt-sax'),-1), y:_fv(val('tt-say'),-1)},
        surfaceLOD_A: _fv(val('tt-lod-a'), -1),
        surfaceTexture_B:val('tt-sb'), surfaceTextureSize_B:{x:_fv(val('tt-sbx'),-1), y:_fv(val('tt-sby'),-1)},
        surfaceLOD_B: _fv(val('tt-lod-b'), -1),
        terrainTexture_C:val('tt-tc'), terrainTextureSize_C:{x:_fv(val('tt-tcx'),-1), y:_fv(val('tt-tcy'),-1)},
        surfaceLOD_C: _fv(val('tt-lod-c'), -1),
        surfaceLayerSize:_fv(val('tt-sls'),-1), minFade:_fv(val('tt-mif'),-1),
        maxFade:_fv(val('tt-maf'),-1), shadowIntensity:_fv(val('tt-si'),-1), shadowHeight:_fv(val('tt-sh'),-1)
      },
      terrainFormulaDifficulties: tfd,
      textureFormula: document.getElementById('tf-texture').value.trim()
        ? document.getElementById('tf-texture').value.trim().split('\n').map(s=>s.trim()).filter(Boolean)
        : [],
      verticeSize:_sf('ter-vs', 2),
      collider:tog('ter-col'),
      flatZones: collectFlatZones(),
      flatZonesDifficulties: (bodies[selectedBody]?.data?.TERRAIN_DATA?.flatZonesDifficulties) || {}
    };
    const rktype = val('rk-type');
    if(rktype && rktype !== 'None'){
      d.TERRAIN_DATA.rocks = { rockType:rktype, rockDensity:_sf('rk-den', 0.5), minSize:_sf('rk-min', 0.2), maxSize:_sf('rk-max', 0.8), powerCurve:_sf('rk-pc', 2), maxAngle:_sf('rk-ma', 25) };
    }
    // Invalidate cloud/water/atmo caches when texture changes
    if(drawViewport._cloudCache) drawViewport._cloudCache = {};
    if(drawViewport._waterCache) drawViewport._waterCache = {};
    if(drawViewport._atmoStopCache) drawViewport._atmoStopCache = {};
    if(drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
    if(drawViewport._atmoSrcCache) drawViewport._atmoSrcCache = {};
    if(drawViewport._fcCache) drawViewport._fcCache = {};
    if(drawViewport._fogCache) drawViewport._fogCache = {};
  } else {
    delete d.TERRAIN_DATA;
    // Flush surface caches when terrain is removed
    if(drawViewport._cloudCache) drawViewport._cloudCache = {};
    if(drawViewport._waterCache) drawViewport._waterCache = {};
    if(drawViewport._atmoPolarCache) drawViewport._atmoPolarCache = {};
  }

  // RINGS
  if(tog('rng-has')){
    const rngMap = getCpick('rng-map-r','rng-map-g','rng-map-b','rng-map-a');
    d.RINGS_DATA = { ringsTexture:val('rng-tex'), startRadius:getDistMetres('rng-sr'), endRadius:getDistMetres('rng-er'), positionZ:_sf('rng-pz', 0), mapColor:{r:rngMap.r,g:rngMap.g,b:rngMap.b,a:rngMap.a} };
    // Rings visually affect body size on canvas
    b.hasRings = true;
    b.ringsInner = getDistMetres('rng-sr');
    b.ringsOuter = getDistMetres('rng-er');
  } else {
    delete d.RINGS_DATA;
    b.hasRings = false;
  }

  // WATER
  if(tog('wt-has')){
    const wSand  = getCpick('wt-sand-r','wt-sand-g','wt-sand-b','wt-sand-a');
    const wShal  = getCpick('wt-shal-r','wt-shal-g','wt-shal-b','wt-shal-a');
    const wDeep  = getCpick('wt-deep-r','wt-deep-g','wt-deep-b','wt-deep-a');
    const wFloor = getCpick('wt-floor-r','wt-floor-g','wt-floor-b','wt-floor-a');
    const wMap   = getCpick('wt-map-r','wt-map-g','wt-map-b','wt-map-a');
    d.WATER_DATA = {
      oceanMaskTexture: val('wt-tex'),
      lowerTerrain: tog('wt-lt'),
      oceanDepth: getSimpleKmMetres('wt-dep') || 5000,
      sand:    { r:wSand.r,  g:wSand.g,  b:wSand.b,  a:wSand.a  },
      floor:   { r:wFloor.r, g:wFloor.g, b:wFloor.b, a:wFloor.a },
      shallow: { r:wShal.r,  g:wShal.g,  b:wShal.b,  a:wShal.a  },
      deep:    { r:wDeep.r,  g:wDeep.g,  b:wDeep.b,  a:wDeep.a  },
      maskGradient_Water:  { must:_sf('wt-mgw-must', 1000), cannot:_sf('wt-mgw-can', 700),  global:_sf('wt-mgw-glob', 2000) },
      waterGradientWidthMultiplier: _sf('wt-wgwm', 0.5),
      maskGradient_Terrain: { must:_sf('wt-mgt-must', 25), cannot:_sf('wt-mgt-can', 25), global:_sf('wt-mgt-glob', 50) },
      sandGradientWidthMultiplier:  _sf('wt-sgwm', 2.0),
      floorGradientWidthMultiplier: _sf('wt-fgwm', 10.0),
      shoreNoiseSize: { x:_sf('wt-snx', 3000), y:_sf('wt-sny', 1000) },
      sandNoiseSize:  { x:_sf('wt-dnx', 500),  y:_sf('wt-dny', 100)  },
      wavesSize:      { x:_sf('wt-wvx', 16),   y:_sf('wt-wvy', 0.3)  },
      opacity_Surface: _sf('wt-so', 0.8),
      opacity_Far: _sf('wt-fo', 1),
      opacity_FullDarkness: _sf('wt-fd', 0.95),
      surfaceVisibilityDistance: getSimpleKmMetres('wt-svd') || 1200,
      fullDarknessDepth: getSimpleKmMetres('wt-fdd') || 500,
      fullDarknessVisibilityDistance: getSimpleKmMetres('wt-fdvd') || 300,
      mapColor: { r:wMap.r, g:wMap.g, b:wMap.b, a:wMap.a }
    };
  } else delete d.WATER_DATA;
  // Invalidate the water colour canvas cache so changes render immediately
  if(drawViewport._waterCache) drawViewport._waterCache = {};
  if(drawViewport._cloudCache) drawViewport._cloudCache = {};
  if(drawViewport._fcCache) drawViewport._fcCache = {};
  if(drawViewport._fogCache) drawViewport._fogCache = {};

  // ORBIT — the most critical for visual update
  // Non-center bodies always have orbit (it's mandatory)
  const _orbitAllowed = tog('or-has') || !b.isCenter;
  if(_orbitAllowed){
    const dirRaw = document.getElementById('or-dir').value;
    d.ORBIT_DATA = {
      parent:             val('or-par') || 'Sun',
      semiMajorAxis:      (() => {
        // Recover stored SMA by dividing out the same effective scale used in fillSidebar.
        // Per-body smaDifficultyScale replaces global default entirely (mirrors game SmaScale()).
        const _sds  = buildDiffScale('or-sn','or-sh','or-sr');
        const _vdk  = (typeof viewDiffKey !== 'undefined') ? viewDiffKey : 'Normal';
        const _defS = (typeof _DEF_SMA_SCALE !== 'undefined') ? _DEF_SMA_SCALE : {Normal:1,Hard:2,Realistic:20};
        const gm    = (_sds[_vdk] != null) ? _sds[_vdk] : (_defS[_vdk] ?? 1);
        const raw   = getDistMetres('or-sma');
        return gm > 0 ? raw / gm : raw;
      })(),
      smaDifficultyScale: buildDiffScale('or-sn','or-sh','or-sr'),
      eccentricity:       Math.min(_sf('or-ecc', 0), 0.999),
      argumentOfPeriapsis:_sf('or-aop', 0),
      direction:          parseInt(dirRaw),   // parseInt('0') = 0 correctly
      multiplierSOI:      _sf('or-soi', 2.5),
      soiDifficultyScale: buildDiffScale('or-soin','or-soih','or-soir')
    };
  } else delete d.ORBIT_DATA;

  // POST PROCESSING — only write if keys exist (off by default)
  const _ppKeys = collectPPKeys();
  if(_ppKeys.length) d.POST_PROCESSING = { keys: _ppKeys };
  else delete d.POST_PROCESSING;

  // LANDMARKS
  d.LANDMARKS = collectLandmarks();

  // Update sidebar header to reflect current body state
  document.getElementById('sbb-type').textContent = b.isCenter ? 'System Center' : (d.ORBIT_DATA ? `orbiting ${d.ORBIT_DATA.parent}` : '');

  // Refresh orbital period display whenever SMA / parent / diff scale may have changed
  if (typeof updatePeriodFromSMA === 'function') updatePeriodFromSMA();

  // Invalidate cloud canvas cache so any atmosphere/texture change renders immediately
  if(drawViewport._cloudCache) drawViewport._cloudCache = {};

  drawViewport();
}

// Wire liveSync to every input element inside the sidebar body
// Delegated real-time sync: catches all current AND dynamically-added sidebar inputs/selects.
// This fires liveSync on any input or change event bubbling up from the sidebar.
document.getElementById('sidebar').addEventListener('input',  e => {
  // bsearch-input is a search filter, not a body-data field — don't trigger liveSync
  if(e.target.id === 'bsearch-input') return;
  // or-period / or-period-unit: handled by updateSMAFromPeriod / attachPeriodParser — skip here
  if(e.target.id === 'or-period' || e.target.id === 'or-period-unit') return;
  // hm-raw-view: live sync — push raw text into the hidden textarea then refresh
  if(e.target.id === 'hm-raw-view'){
    const lines = e.target.value.split('\n').filter(l => l.trim());
    const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
    const el = document.getElementById(id);
    if(el) el.value = lines.join('\n');
    _hmRenderFormulaList();
    if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    if(typeof drawViewport !== 'undefined'){
      if(drawViewport._surfCache) drawViewport._surfCache = {};
      if(drawViewport._terrCache) drawViewport._terrCache = {};
    }
    if(!liveSync._filling) liveSync();
    return;
  }
  // Defer liveSync on text inputs to blur event — prevents lag while typing
  if(e.target.type === 'text') return;
  if(!liveSync._filling) liveSync();
});
document.getElementById('sidebar').addEventListener('change', e => {
  if(e.target.id === 'bsearch-input') return;
  if(e.target.id === 'hm-raw-view') return;
  if(e.target.id === 'or-period-unit') return;  // handled by attachPeriodParser
  if(!liveSync._filling) liveSync();
});
// Catch blur on text inputs to trigger liveSync after typing is done
document.getElementById('sidebar').addEventListener('blur', e => {
  if(e.target.type === 'text' && e.target.id !== 'bsearch-input' && e.target.id !== 'hm-raw-view'){
    if(!liveSync._filling) liveSync();
  }
}, true);  // use capture to catch blur events
// Delegated click on all toggles — fires after their own onclick toggles the class
document.getElementById('sidebar').addEventListener('click', e => {
  if(e.target.classList.contains('tog')) setTimeout(liveSync, 0);
});

// ── Body renaming ──
// In SFS the body name IS the filename (Earth → Earth.txt), so renaming is first-class.


// ── Cloud Width auto-generator ────────────────────────────────────────────────
// Formula: 2π × (StartHeight + Radius) / N
function _clWidthCalc(){
  const b      = selectedBody && bodies[selectedBody];
  const radius = getDistMetres('b-radius') || b?.data?.BASE_DATA?.radius || 314970;
  const startH = getSimpleKmMetres('cl-sh') || 0;
  const N      = parseFloat(document.getElementById('cl-w-n')?.value) || 100;
  if(N <= 0) return null;
  return (2 * Math.PI * (startH + radius)) / N;
}

function clWidthAutoSync(){
  const w = _clWidthCalc();
  const preview = document.getElementById('cl-w-preview');
  if(w === null || !isFinite(w)){
    if(preview) preview.textContent = '';
    return;
  }
  const rounded = Math.round(w);
  const input = document.getElementById('cl-w');
  if(input) input.value = rounded;
  if(preview) preview.textContent = `≈ ${rounded.toLocaleString()} m`;
  liveSync();
}

function syncCloudVel(){
  const mode   = document.getElementById('cl-v-mode')?.value || 'raw';
  const raw    = parseFloat(document.getElementById('cl-v-input')?.value) || 0;
  const hint   = document.getElementById('cl-v-hint');
  const hidden = document.getElementById('cl-v');
  const b      = selectedBody && bodies[selectedBody];
  const radius = (b?.data?.BASE_DATA?.radius) || 314970;
  const TWO_PI = Math.PI * 2;

  // Convert input → game velocity (formula: vel = rph * R / 18000)
  let vel = 0;
  if(mode === 'raw'){
    vel = raw;
  } else if(mode === 'rph'){
    vel = (raw * radius) / 18000;
  } else if(mode === 'rps'){
    vel = (raw * radius * 3600) / 18000;
  } else if(mode === 'rpm'){
    vel = (raw * radius * 60) / 18000;
  } else if(mode === 'period_s'){
    // period_s → rph = 3600/period_s → vel
    if(raw !== 0) vel = (3600 / raw) * radius / 18000;
  } else if(mode === 'period_m'){
    if(raw !== 0) vel = (60 / raw) * radius / 18000;
  } else if(mode === 'period_h'){
    if(raw !== 0) vel = (1 / raw) * radius / 18000;
  } else if(mode === 'ms'){
    // wind_ms = 2π·R / period_s  →  period_s = 2π·R / wind_ms  →  rph = 3600/period_s
    if(raw !== 0) vel = (raw * 18000) / (radius * TWO_PI);
  } else if(mode === 'kms'){
    if(raw !== 0) vel = (raw * 1000 * 18000) / (radius * TWO_PI);
  }

  if(hidden) hidden.value = vel;

  // Build hint line: show key equivalent values
  if(hint && radius > 0 && vel !== 0){
    const rph      = (vel * 18000) / radius;          // rotations per hour
    const period_s = Math.abs(3600 / rph);            // seconds per rotation
    const period_m = period_s / 60;
    const period_h = period_s / 3600;
    const wind_ms  = (TWO_PI * radius) / period_s;   // surface tangential speed m/s
    const wind_kms = wind_ms / 1000;

    const fmtPeriod = period_s < 120
      ? period_s.toFixed(1) + ' s'
      : period_m < 120
        ? period_m.toFixed(2) + ' min'
        : period_h.toFixed(3) + ' h';

    const fmtWind = wind_ms < 1000
      ? wind_ms.toFixed(2) + ' m/s'
      : wind_kms.toFixed(3) + ' km/s';

    if(mode === 'raw'){
      hint.textContent = `${rph.toExponential(3)} rot/hr  ·  ${fmtPeriod}  ·  ${fmtWind}`;
    } else if(mode === 'rph' || mode === 'rps' || mode === 'rpm'){
      hint.textContent = `vel=${vel.toExponential(3)}  ·  ${fmtPeriod}  ·  ${fmtWind}`;
    } else if(mode === 'period_s' || mode === 'period_m' || mode === 'period_h'){
      hint.textContent = `vel=${vel.toExponential(3)}  ·  ${rph.toExponential(3)} rot/hr  ·  ${fmtWind}`;
    } else {
      // m/s or km/s
      hint.textContent = `vel=${vel.toExponential(3)}  ·  ${fmtPeriod}  ·  ${rph.toExponential(3)} rot/hr`;
    }
  } else if(hint){
    hint.textContent = '';
  }
  liveSync();
}

// Populate cl-v-input from a raw game velocity value (called when loading body)
function setCloudVelDisplay(vel){
  const mode   = document.getElementById('cl-v-mode')?.value || 'raw';
  const b      = selectedBody && bodies[selectedBody];
  const radius = (b?.data?.BASE_DATA?.radius) || 314970;
  const TWO_PI = Math.PI * 2;
  let display  = vel;

  if(radius > 0 && vel !== 0){
    const rph     = (vel * 18000) / radius;
    const period_s = Math.abs(3600 / rph);
    if     (mode === 'rph')      display = rph;
    else if(mode === 'rps')      display = rph / 3600;
    else if(mode === 'rpm')      display = rph / 60;
    else if(mode === 'period_s') display = period_s;
    else if(mode === 'period_m') display = period_s / 60;
    else if(mode === 'period_h') display = period_s / 3600;
    else if(mode === 'ms')       display = (TWO_PI * radius) / period_s;
    else if(mode === 'kms')      display = (TWO_PI * radius) / period_s / 1000;
    else                          display = vel; // raw
  }

  const inp = document.getElementById('cl-v-input');
  if(inp) inp.value = (display && display !== 0) ? (+display.toFixed(8)).toString() : '';
  const hidden = document.getElementById('cl-v');
  if(hidden) hidden.value = vel;
  syncCloudVel();
}
let _finaliseRenameTimer = null;
function _schedFinaliseRename(newName){
  clearTimeout(_finaliseRenameTimer);
  _finaliseRenameTimer = setTimeout(() => finaliseRename(newName), 600);
}

function renameBody(newName){
  if(!selectedBody || !newName) return;
  const input = document.getElementById('sbb-name-input');
  // Check for conflict (another body already has this name)
  const conflict = newName !== selectedBody && bodies[newName] !== undefined;
  input.classList.toggle('conflict', conflict);
  // Live-update the canvas label even while typing (don't commit yet)
  drawViewport._pendingName = newName;
  drawViewport();
}

function finaliseRename(newName){
  clearTimeout(_finaliseRenameTimer);
  if(!selectedBody || !newName || newName === selectedBody) return;
  const input = document.getElementById('sbb-name-input');

  // Sanitise: no path chars, no spaces (SFS uses filenames)
  newName = newName.trim().replace(/[\/\\:*?"<>|]/g, '');
  if(!newName){ input.value = selectedBody; return; } // revert if blank after sanitise

  // Block if name already taken
  if(bodies[newName]){
    input.classList.add('conflict');
    input.value = newName;
    return;
  }

  // Commit: rename the key in bodies{}
  pushUndo();
  const oldName = selectedBody;
  bodies[newName] = bodies[oldName];
  delete bodies[oldName];

  // Update any other bodies that orbit this one
  Object.values(bodies).forEach(b => {
    if(b.data.ORBIT_DATA && b.data.ORBIT_DATA.parent === oldName){
      b.data.ORBIT_DATA.parent = newName;
    }
  });

  // Update statusbar center reference
  if(bodies[newName].isCenter){
    document.getElementById('sb-center').textContent = newName;
  }

  selectedBody = newName;
  input.value = newName;
  input.classList.remove('conflict');
  drawViewport._pendingName = null;
  document.getElementById('sb-sel').textContent = newName;
  document.getElementById('sbb-type').textContent = bodies[newName].isCenter ? 'System Center' : (bodies[newName].data.ORBIT_DATA ? `orbiting ${bodies[newName].data.ORBIT_DATA.parent}` : '');
  updateStatusBar();
  drawViewport();
}

// Normalises difficulty-scale sub-objects so lowercase keys from SFS game files
// ('normal','hard','realistic') become Title Case ('Normal','Hard','Realistic').
// Must be called on every bodyData object right after JSON.parse.
function normalizeDiffScaleKeys(bodyData){
  if(!bodyData || typeof bodyData !== 'object') return bodyData;
  const DIFF_FIELDS = [
    'radiusDifficultyScale','gravityDifficultyScale',
    'smaDifficultyScale','soiDifficultyScale',
    'heightDifficultyScale','terrainFormulaDifficulties',
    'flatZonesDifficulties'
  ];
  const LC = ['normal','hard','realistic'];
  function fixScaleObj(o){
    if(!o || typeof o !== 'object') return;
    for(const lk of LC){
      if(o[lk] !== undefined){
        const tk = lk.charAt(0).toUpperCase() + lk.slice(1);
        if(o[tk] === undefined) o[tk] = o[lk];
        delete o[lk];
      }
    }
  }
  function walk(node){
    if(!node || typeof node !== 'object') return;
    for(const field of DIFF_FIELDS){
      if(node[field]) fixScaleObj(node[field]);
    }
    // Recurse one level into nested sections (ATMOSPHERE_PHYSICS_DATA, etc.)
    for(const k of Object.keys(node)){
      if(node[k] && typeof node[k] === 'object' && !Array.isArray(node[k])) walk(node[k]);
    }
  }
  walk(bodyData);
  return bodyData;
}

function buildDiffScale(nId,hId,rId){
  const n=parseFloat(val(nId)), h=parseFloat(val(hId)), r=parseFloat(val(rId));
  const obj={};
  if(!isNaN(n)) obj.Normal=n;
  if(!isNaN(h)) obj.Hard=h;
  if(!isNaN(r)) obj.Realistic=r;
  return obj;
}

function collectFogKeys(){
  const keys=[]; let i=0;
  while(document.getElementById('fk-'+i)){
    const fv = id => { const el=document.getElementById(id); return el ? parseFloat(el.value) : 0; };
    const fa = id => { const el=document.getElementById(id); if(!el) return 0; const v=parseFloat(el.value); return isNaN(v)?0:v; };
    keys.push({
      color:{ r:fa('fk-'+i+'-r'), g:fa('fk-'+i+'-g'), b:fa('fk-'+i+'-b'), a:fa('fk-'+i+'-a') },
      distance: fv('fk-'+i+'-d')||0
    });
    i++;
  }
  return keys;
}
function collectPPKeys(){
  const keys=[]; let i=0;
  while(document.getElementById('ppk-'+i)){
    const f = id => parseFloat(document.getElementById(id)?.value) || 0;
    const fnn = id => { const v = parseFloat(document.getElementById(id)?.value); return isNaN(v) ? 1 : v; };
    keys.push({
      height:          f('ppk-'+i+'-h'),
      shadowIntensity: fnn('ppk-'+i+'-si'),
      starIntensity:   f('ppk-'+i+'-sti'),
      hueShift:        f('ppk-'+i+'-hs'),
      saturation:      fnn('ppk-'+i+'-sat'),
      contrast:        fnn('ppk-'+i+'-con'),
      red:             fnn('ppk-'+i+'-r'),
      green:           fnn('ppk-'+i+'-g'),
      blue:            fnn('ppk-'+i+'-b'),
    });
    i++;
  }
  return keys;
}
function collectLandmarks(){
  const lms=[]; let i=0;
  while(document.getElementById('lm-'+i)){
    const name = document.getElementById(`lm-${i}-n`)?.value?.trim() || '';
    const prefix = document.getElementById(`lm-${i}-pfx`)?.value?.trim() || '';
    // Read centre and width from number inputs (precise), fall back to range slider
    const centre = parseFloat(document.getElementById(`lm-${i}-c-num`)?.value
                ?? document.getElementById(`lm-${i}-c`)?.value) || 0;
    const width  = parseFloat(document.getElementById(`lm-${i}-w-num`)?.value
                ?? document.getElementById(`lm-${i}-w`)?.value) || 10;
    const startAngle = parseFloat((centre - width/2).toFixed(4));
    const endAngle   = parseFloat((centre + width/2).toFixed(4));
    const fullName = name && prefix ? `${name} ${prefix}` : (name || prefix);
    if(fullName) lms.push({ name: fullName, startAngle, endAngle });
    i++;
  }
  return lms;
}


// ── Heightmap visual UI ───────────────────────────────────────────────────────
let _hmActiveDiff = 'Normal';

function hmUploadClick(){
  document.getElementById('hm-file-input').click();
}

function hmFileAdded(files){
  if(!files || !files.length) return;
  // Route through existing asset upload system
  handleFiles(files, 'heightmaps');
  // Refresh the loaded list after a short delay so the asset registers
  setTimeout(hmRefreshLoadedList, 300);
}

function hmToggleLibrary(){
  const wrap = document.getElementById('hm-library-wrap');
  const btn  = document.getElementById('hm-collapse-btn');
  if(!wrap || !btn) return;
  const collapsed = wrap.style.display === 'none';
  wrap.style.display = collapsed ? '' : 'none';
  btn.textContent = collapsed ? '▾ HIDE' : '▸ SHOW';
}

// Build the list of loaded heightmap cards
function hmRefreshLoadedList(){
  const list = document.getElementById('hm-loaded-list');
  const hint = document.getElementById('hm-empty-hint');
  const insertRow = document.getElementById('hm-insert-row');
  const mapSel = document.getElementById('hm-map');
  if(!list) return;

  const hms = (typeof assets !== 'undefined') ? (assets.heightmaps || []) : [];

  // Populate the map picker with loaded names + builtins
  const builtins = ['Perlin'];
  const customNames = hms.map(e => e.name.replace(/\.[^.]+$/, ''));
  const allMaps = [...new Set([...builtins, ...customNames])];
  const curMap = mapSel.value;
  mapSel.innerHTML = allMaps.map(n =>
    `<option value="${n}"${n===curMap?' selected':''}>${n}${builtins.includes(n)?' (built-in)':' (custom)'}</option>`
  ).join('');

  // Check if any active formula lines reference heightmap names not currently loaded
  // (happens when a preset references a custom heightmap that hasn't been uploaded yet)
  (function _checkMissingHmRefs(){
    const warn = document.getElementById('hm-missing-warn');
    if(!warn) return;
    const allFormulas = ['tf-normal','tf-hard','tf-realistic'].map(id=>{
      const el = document.getElementById(id);
      return el ? el.value : '';
    }).join('\n');
    // Extract map names used in formula calls e.g. SET(EarthHM, ...) or OUTPUT = SET(EarthHM, ...)
    const used = new Set();
    allFormulas.replace(/\b[A-Za-z_][A-Za-z0-9_]*\s*\(/g,''); // skip function names
    for(const m of allFormulas.matchAll(/(?:SET|ADD|SUB|MUL|MAX|MIN)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/g)){
      used.add(m[1]);
    }
    const missing = [...used].filter(n => !builtins.includes(n) && !customNames.includes(n));
    if(missing.length){
      warn.style.display = '';
      warn.textContent = `⚠ Heightmap${missing.length>1?'s':''} not loaded: ${missing.join(', ')} — upload the file(s) in the Assets panel.`;
    } else {
      warn.style.display = 'none';
    }
  })();

  if(hms.length === 0){
    list.innerHTML = '';
    hint.style.display = '';
    insertRow.style.display = 'none';
    insertRow.innerHTML = '';
    return;
  }

  hint.style.display = 'none';
  insertRow.style.display = 'none'; // handled inside list now

  // Separate into image and text groups
  const imgHMs = hms.filter(e => /\.(png|jpe?g)/i.test(e.name));
  const txtHMs = hms.filter(e => /\.txt$/i.test(e.name));

  // Track collapse state per group (persisted in memory only)
  if(!hmRefreshLoadedList._collapsed) hmRefreshLoadedList._collapsed = {};
  const _col = hmRefreshLoadedList._collapsed;

  function buildGroup(items, groupLabel, groupKey){
    if(!items.length) return '';
    const isCollapsed = !!_col[groupKey];
    const cards = items.map(e => {
      const base = e.name.replace(/\.[^.]+$/, '');
      const isImg = /\.(png|jpe?g)/i.test(e.name);
      const preview = isImg && e.url
        ? `<img src="${e.url}" style="width:100%;height:52px;object-fit:cover;border-radius:3px 3px 0 0;image-rendering:pixelated;display:block">`
        : `<div style="width:100%;height:52px;border-radius:3px 3px 0 0;background:var(--bg1);display:flex;align-items:center;justify-content:center;font-size:.72rem;color:var(--sky2);font-family:'JetBrains Mono',monospace;font-weight:700;letter-spacing:.04em">TXT</div>`;
      return `<div style="background:var(--bg2);border-radius:4px;overflow:hidden;border:1px solid var(--ink6,#2a2a2a);cursor:pointer;transition:border-color .15s" onclick="hmInsertMap('${base}')" title="Click to use: ${base}">
        ${preview}
        <div style="padding:4px 5px;font-size:.72rem;font-family:'JetBrains Mono',monospace;color:var(--ink2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${base}">${base}</div>
      </div>`;
    }).join('');
    return `<div style="margin-bottom:6px">
      <div onclick="hmToggleGroup('${groupKey}')" style="font-size:.68rem;color:var(--ink3);font-family:'JetBrains Mono',monospace;letter-spacing:.06em;margin-bottom:4px;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:5px;user-select:none">
        <span style="color:var(--sky2);font-size:.7rem">${isCollapsed ? '▸' : '▾'}</span>
        <span>${groupLabel} (${items.length})</span>
      </div>
      <div id="hm-group-${groupKey}" style="display:${isCollapsed ? 'none' : 'grid'};grid-template-columns:repeat(3,1fr);gap:4px">${cards}</div>
    </div>`;
  }

  list.innerHTML =
    `<div style="font-size:.65rem;color:var(--ink4);font-family:'JetBrains Mono',monospace;margin-bottom:6px;line-height:1.5">
      <span style="color:var(--sky2)">Tap a card</span> to set it as the active map in the formula builder below.
    </div>` +
    buildGroup(imgHMs, 'Image maps', 'img') +
    buildGroup(txtHMs, 'Text maps', 'txt');
}

function hmApplyFilter(){ /* filter removed — grid is compact enough */ }
function hmToggleCollapse(){ /* no-op */ }
function hmToggleGroup(key){
  if(!hmRefreshLoadedList._collapsed) hmRefreshLoadedList._collapsed = {};
  const _col = hmRefreshLoadedList._collapsed;
  _col[key] = !_col[key];
  hmRefreshLoadedList();
}

// Insert a heightmap name into the map picker and focus add-line
function hmInsertMap(name){
  const mapSel = document.getElementById('hm-map');
  // Select this map in the picker
  for(let i = 0; i < mapSel.options.length; i++){
    if(mapSel.options[i].value === name){ mapSel.selectedIndex = i; break; }
  }
  // Scroll to add-line area
  document.getElementById('hm-scale').focus();
}

function hmSetDiff(diff){
  // Save current textarea to hidden field first
  _hmFlushRawToHidden();
  _hmActiveDiff = diff;
  // Update button styles
  ['Normal','Hard','Realistic'].forEach(d => {
    const btn = document.getElementById('hm-btn-' + d[0].toLowerCase() + d.slice(1).toLowerCase().replace('istic','').replace('ard','')[0]);
    // simpler: by id pattern
  });
  document.getElementById('hm-btn-n').style.background = diff==='Normal' ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-n').style.color      = diff==='Normal' ? '#000' : 'var(--ink3)';
  document.getElementById('hm-btn-h').style.background = diff==='Hard'   ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-h').style.color      = diff==='Hard'   ? '#000' : 'var(--ink3)';
  document.getElementById('hm-btn-r').style.background = diff==='Realistic' ? 'var(--sky2)' : 'transparent';
  document.getElementById('hm-btn-r').style.color      = diff==='Realistic' ? '#000' : 'var(--ink3)';
  document.getElementById('hm-diff-badge').textContent = diff;
  _hmRenderFormulaList();
  _hmSyncRawView();
}

// Get lines for active difficulty from the hidden textareas
function _hmGetLines(){
  const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
  const txt = document.getElementById(id)?.value.trim() || '';
  return txt ? txt.split('\n').filter(l => l.trim()) : [];
}
function _hmSetLines(lines){
  const id = _hmActiveDiff === 'Normal' ? 'tf-normal' : _hmActiveDiff === 'Hard' ? 'tf-hard' : 'tf-realistic';
  const el = document.getElementById(id);
  if(el) el.value = lines.join('\n');
  _hmRenderFormulaList();
  _hmSyncRawView();
  // Bust all terrain-related caches so the viewport re-evaluates the formula immediately.
  // _surfCache is keyed with only a 0/1 terrRes flag (not the formula content), so it must
  // be explicitly cleared here to prevent stale surface strips after a formula edit.
  if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
  if(typeof drawViewport !== 'undefined'){
    if(drawViewport._surfCache) drawViewport._surfCache = {};
    if(drawViewport._terrCache) drawViewport._terrCache = {};
  }
  if(typeof liveSync === 'function') liveSync();
}

function _hmRenderFormulaList(){
  const container = document.getElementById('hm-formula-list');
  if(!container) return;
  const lines = _hmGetLines();
  if(lines.length === 0){
    container.innerHTML = `<div style="font-size:.6rem;color:var(--ink4);font-family:'JetBrains Mono',monospace;padding:4px 2px;font-style:italic">No lines yet — add one below.</div>`;
    return;
  }
  container.innerHTML = lines.map((line, i) => {
    // Parse for display: "OUTPUT = Op(map, scale, height)"
    const m = line.match(/OUTPUT\s*=\s*(\w+)\(([^)]*)\)/);
    let label = line;
    let tag = '';
    if(m){
      const op   = m[1].replace('HeightMap','').replace('Output','');
      const args = m[2].split(',').map(s=>s.trim());
      const map  = args[0] || '?';
      const sc   = args[1] ? (parseFloat(args[1])/1000).toFixed(0)+'k' : '';
      const ht   = args[2] || '';
      label = `<strong style="color:var(--sky2)">${op}</strong> <span style="color:var(--ink2)">${map}</span>${sc?' <span style="color:var(--ink4)">'+sc+'</span>':''}${ht?' <span style="color:var(--ink4)">h:'+ht+'m</span>':''}`;
      tag = op;
    }
    return `<div style="display:flex;align-items:center;gap:5px;padding:4px 6px;background:var(--bg2);border-radius:4px;margin-bottom:2px">
      <span style="flex:1;font-size:.6rem;font-family:'JetBrains Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span>
      <button onclick="hmMoveLine(${i},-1)" title="Move up"   style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--ink2);border:1px solid var(--ink5);cursor:pointer" ${i===0?'disabled':''}>▲</button>
      <button onclick="hmMoveLine(${i}, 1)" title="Move down" style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:var(--bg3);color:var(--ink2);border:1px solid var(--ink5);cursor:pointer" ${i===lines.length-1?'disabled':''}>▼</button>
      <button onclick="hmRemoveLine(${i})" title="Delete"     style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:transparent;color:#f66;border:1px solid #f66;cursor:pointer">✕</button>
    </div>`;
  }).join('');
}

function hmAddLine(){
  const op     = document.getElementById('hm-op').value;
  const map    = document.getElementById('hm-map').value;
  const scale  = parseFloat(document.getElementById('hm-scale').value) || 100000;
  const height = parseFloat(document.getElementById('hm-height').value) || 35;
  const line   = `OUTPUT = ${op.split(' = ')[1]}(${map}, ${scale}, ${height})`;
  const lines  = _hmGetLines();
  lines.push(line);
  _hmSetLines(lines);
}

function hmRemoveLine(i){
  const lines = _hmGetLines();
  lines.splice(i, 1);
  _hmSetLines(lines);
}

function hmMoveLine(i, dir){
  const lines = _hmGetLines();
  const j = i + dir;
  if(j < 0 || j >= lines.length) return;
  [lines[i], lines[j]] = [lines[j], lines[i]];
  _hmSetLines(lines);
}

function _hmSyncRawView(){
  const rv = document.getElementById('hm-raw-view');
  if(!rv) return;
  // Only update if not focused — don't clobber user typing
  if(document.activeElement !== rv){
    rv.value = _hmGetLines().join('\n');
  }
}

// Legacy stubs — raw view is always live now
function hmEditRaw(){ document.getElementById('hm-raw-view')?.focus(); }
function hmSaveRaw(){ /* no-op — live */ }

function _hmFlushRawToHidden(){
  // no-op: hidden textareas are kept in sync by _hmSetLines
}

// Call after fillSidebar to populate the visual UI from the textareas
function hmSyncFromTextareas(){
  _hmActiveDiff = 'Normal';
  hmSetDiff('Normal');
  hmRefreshLoadedList();
}

// ══════════════════════════ DAY/NIGHT CYCLE GENERATOR ══════════════════════════
// Fakes a day/night terminator the way SFS players commonly do it: an invisible
// body (zero-alpha surface, no terrain) orbits the target planet carrying a
// solid/semi-transparent black FRONT_CLOUDS texture. Because front clouds render
// in front of the main body and use positionZ to control layering, a large,
// dark, nearly-flat disc orbiting close to the planet reads as a moving night
// side with a soft terminator line.
//
// The "texture" is generated on the fly as a 1×1 black pixel PNG at adjustable
// alpha — SFS/the editor stretches a 1×1 texture into a filled circle, so no
// gradient or shape work is needed, just the right alpha value.

const _DNC_DEFAULTS = {
  darkness: 0.85,       // alpha of the generated black pixel (0 = invisible, 1 = fully opaque)
  fadeZoneKm: 300,       // FRONT_CLOUDS_DATA.fadeZoneHeight — controls terminator softness
  invisRadiusMult: 6,    // invisible body's radius, as a multiple of the target planet's radius
  cloudHeightKm: 80,     // FRONT_CLOUDS_DATA.height — standard SFS convention
  positionZ: -5000       // layers the night-side disc over the main body's own front clouds
};

// Generate (or reuse) a solid black texture at the given alpha and register it
// in the shared asset/texture cache, exactly like tex-creator.js's exporter does.
function _dncGenerateTexture(alpha){
  const a = Math.max(0, Math.min(1, alpha));
  const c = document.createElement('canvas');
  c.width = 1; c.height = 1;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(0, 0, 1, 1);
  const dataUrl = c.toDataURL('image/png');

  const name = `DayNightCycle_${Math.round(a * 100)}.png`;
  const texName = name.replace(/\.[^.]+$/, '');

  if(typeof assets !== 'undefined'){
    // Reuse an existing entry with the same name instead of duplicating it
    if(!assets.textures.find(t => t.name === name)){
      const entry = { name, url: dataUrl, size: dataUrl.length };
      assets.textures.push(entry);
      if(typeof renderAssetThumb === 'function') renderAssetThumb(entry);
      if(typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
    }
  }
  if(typeof cacheTexture === 'function') cacheTexture(texName, dataUrl);
  if(typeof refreshTexPickerLists === 'function') refreshTexPickerLists();

  return texName;
}

// Shared SMA formula so addDayNightCycle and updateDayNightCycle can never
// drift apart again. See addDayNightCycle for why only 1/4 of cloudHeight_m
// counts toward the offset. cloudHeight_m may be negative (see slider).
function _dncComputeSMA(invisRadius_m, cloudHeight_m){
  const offset = cloudHeight_m * 0.25;
  return Math.max(invisRadius_m * 0.01, invisRadius_m + offset);
}

// Create the invisible night-side body orbiting whichever body is currently
// selected (falling back to the system center). Returns the new body's name.
function addDayNightCycle(opts){
  const o = Object.assign({}, _DNC_DEFAULTS, opts || {});

  const centerName = Object.keys(bodies).find(n => bodies[n].isCenter);
  const targetName = (selectedBody && bodies[selectedBody]) ? selectedBody : centerName;
  if(!targetName){
    alert('Add a planet first, then select it before generating a day/night cycle.');
    return null;
  }
  const target = bodies[targetName];
  const targetRadius = target.data?.BASE_DATA?.radius || 6.371e6;

  pushUndo();

  const texName = _dncGenerateTexture(o.darkness);

  const invisRadius = targetRadius * o.invisRadiusMult;
  const cloudHeight = o.cloudHeightKm * 1000;
  const sma = _dncComputeSMA(invisRadius, cloudHeight);

  let name = `${targetName}_DayNight`;
  if(bodies[name]){
    let n = 2;
    while(bodies[name + '_' + n]) n++;
    name = name + '_' + n;
  }

  const bodyData = {
    BASE_DATA: {
      radius: invisRadius,
      gravity: 0,
      mapColor: { r: 0, g: 0, b: 0, a: 0 },   // fully transparent — the body itself is invisible
      significant: false,
      rotateCamera: false
    },
    ORBIT_DATA: {
      parent: targetName,
      semiMajorAxis: sma,
      eccentricity: 0,
      argumentOfPeriapsis: 0,
      direction: 1,
      multiplierSOI: 2.5,
      smaDifficultyScale: {},
      soiDifficultyScale: {}
    },
    FRONT_CLOUDS_DATA: {
      cloudsTexture: texName,
      cloudTextureCutout: 1,
      fadeZoneHeight: o.fadeZoneKm * 1000,
      height: cloudHeight,
      positionZ: o.positionZ,
      sharpenAlpha: false
    }
  };

  bodies[name] = {
    data: bodyData,
    preset: 'dayNightCycle',
    isCenter: false,
    color: '#000000',
    glow: false,
    icon: 'moon'
  };

  syncAddBodyBtn();
  if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
  updateStatusBar();
  selectBody(name);
  drawViewport();
  return name;
}


// Regenerate the texture + reapply slider values for an *existing* day/night
// body — called live as the user drags the dedicated sliders, so they don't
// have to delete/recreate the body to retune it.
function updateDayNightCycle(name, opts){
  const b = bodies[name];
  if(!b || !b.data?.FRONT_CLOUDS_DATA) return;
  const o = opts || {};
  const d = b.data;

  if(o.darkness != null){
    d.FRONT_CLOUDS_DATA.cloudsTexture = _dncGenerateTexture(o.darkness);
  }
  if(o.fadeZoneKm != null) d.FRONT_CLOUDS_DATA.fadeZoneHeight = o.fadeZoneKm * 1000;
  if(o.positionZ != null) d.FRONT_CLOUDS_DATA.positionZ = o.positionZ;
  if(o.cloudHeightKm != null){
    d.FRONT_CLOUDS_DATA.height = o.cloudHeightKm * 1000;
    if(d.ORBIT_DATA){
      d.ORBIT_DATA.semiMajorAxis = _dncComputeSMA(d.BASE_DATA.radius || 0, d.FRONT_CLOUDS_DATA.height);
    }
  }
  if(o.invisRadiusMult != null){
    const parentName = d.ORBIT_DATA?.parent;
    const parentRadius = (parentName && bodies[parentName]?.data?.BASE_DATA?.radius) || 6.371e6;
    d.BASE_DATA.radius = parentRadius * o.invisRadiusMult;
    if(d.ORBIT_DATA){
      d.ORBIT_DATA.semiMajorAxis = _dncComputeSMA(d.BASE_DATA.radius, d.FRONT_CLOUDS_DATA.height || 0);
    }
  }

  if(selectedBody === name) fillSidebar(name);
  drawViewport();
}

// ── Day/Night Cycle panel wiring ──
// Tracks which body's day/night sliders are currently being shown/edited,
// since the invisible body created by this tool isn't the same body the
// rest of the Atmosphere tab is showing (that's still the target planet's
// front clouds, if any — this is a *separate* body layered on top).
let _dncActiveBody = null;

function _dncSetSliderDefaults(){
  setSlider('dnc-dark', _DNC_DEFAULTS.darkness, 0, 1);
  initSlider('dnc-dark', 0, 1);
  setSlider('dnc-soft', _DNC_DEFAULTS.fadeZoneKm, 0, 5000);
  initSlider('dnc-soft', 0, 5000);
  setSlider('dnc-radmult', _DNC_DEFAULTS.invisRadiusMult, 1, 20);
  initSlider('dnc-radmult', 1, 20);
  setSlider('dnc-cloudh', _DNC_DEFAULTS.cloudHeightKm, -500, 500);
  initSlider('dnc-cloudh', -500, 500);
}

function _dncOnGenerateClick(){
  const name = addDayNightCycle();
  if(!name) return;
  _dncActiveBody = name;
  document.getElementById('dnc-fields').style.display = '';
  _dncSetSliderDefaults();
  _dncSyncPeriodDisplay();
}

// Debounce slider drags onto a single animation frame, same pattern liveSync uses.
function _dncOnSliderInput(){
  if(!_dncActiveBody || !bodies[_dncActiveBody]) return;
  if(_dncOnSliderInput._pending) return;
  _dncOnSliderInput._pending = true;
  requestAnimationFrame(() => {
    _dncOnSliderInput._pending = false;
    updateDayNightCycle(_dncActiveBody, {
      darkness: parseFloat(document.getElementById('dnc-dark').value),
      fadeZoneKm: parseFloat(document.getElementById('dnc-soft').value),
      invisRadiusMult: parseFloat(document.getElementById('dnc-radmult').value),
      cloudHeightKm: parseFloat(document.getElementById('dnc-cloudh').value)
    });
    _dncSyncPeriodDisplay();
  });
}

// Read the day/night body's current SMA and show its orbital period (i.e. how
// long a full day/night cycle takes). Reuses the same SMA→period math as the
// main Orbit tab (_periodFromSMA in units.js) so the two always agree — it
// relies on selectedBody being the day/night body, which holds whenever this
// panel is visible (_dncActiveBody is only ever set to the selected body).
function _dncSyncPeriodDisplay(){
  const input = document.getElementById('dnc-period');
  if(!input) return;
  if(!_dncActiveBody || !bodies[_dncActiveBody]){ input.value = ''; return; }
  const sma = bodies[_dncActiveBody].data?.ORBIT_DATA?.semiMajorAxis;
  if(sma == null || typeof _periodFromSMA !== 'function'){ input.value = ''; return; }
  const T = _periodFromSMA(sma);
  const unitSel = document.getElementById('dnc-period-unit');
  if(T == null || !isFinite(T) || T <= 0){
    input.value = '';
    return;
  }
  if(unitSel && unitSel.dataset.userPicked !== '1' && typeof _bestTimeUnit === 'function'){
    unitSel.value = _bestTimeUnit(T);
  }
  const unit = unitSel?.value || 'h';
  input.value = (typeof _fmtTime === 'function') ? _fmtTime(T, unit) : T.toFixed(0);
}

// If the user selects a day/night body directly from the body list (e.g. to
// delete it, or coming back to it later), show and repopulate its sliders
// from its actual stored data instead of leaving stale values in the panel.
function _dncSyncPanelForSelection(name){
  const b = bodies[name];
  const isDayNight = !!(b && b.preset === 'dayNightCycle' && b.data?.FRONT_CLOUDS_DATA);
  const panel = document.getElementById('dnc-fields');
  if(!panel) return;
  if(!isDayNight){
    panel.style.display = 'none';
    if(_dncActiveBody === name) _dncActiveBody = null;
    const periodInput = document.getElementById('dnc-period');
    if(periodInput) periodInput.value = '';
    return;
  }
  _dncActiveBody = name;
  panel.style.display = '';
  const fc = b.data.FRONT_CLOUDS_DATA;
  const parentName = b.data.ORBIT_DATA?.parent;
  const parentRadius = (parentName && bodies[parentName]?.data?.BASE_DATA?.radius) || 6.371e6;
  const radMult = parentRadius > 0 ? (b.data.BASE_DATA.radius || 0) / parentRadius : _DNC_DEFAULTS.invisRadiusMult;

  // Recover darkness from the generated texture's name (DayNightCycle_<pct>.png)
  // rather than re-deriving from pixels — cheap and exact for our own textures.
  let darkness = _DNC_DEFAULTS.darkness;
  const m = /^DayNightCycle_(\d+)$/.exec(fc.cloudsTexture || '');
  if(m) darkness = parseInt(m[1], 10) / 100;

  setSlider('dnc-dark', darkness, 0, 1);
  initSlider('dnc-dark', 0, 1);
  setSlider('dnc-soft', (fc.fadeZoneHeight || 0) / 1000, 0, 5000);
  initSlider('dnc-soft', 0, 5000);
  setSlider('dnc-radmult', radMult, 1, 20);
  initSlider('dnc-radmult', 1, 20);
  setSlider('dnc-cloudh', (fc.height || 0) / 1000, -500, 500);
  initSlider('dnc-cloudh', -500, 500);
  _dncSyncPeriodDisplay();
}

// Hook into selectBody without editing its definition directly — wrap it once
// the page has loaded so every selection keeps the day/night panel in sync.
if(typeof selectBody === 'function'){
  const _origSelectBody = selectBody;
  selectBody = function(name){
    _origSelectBody(name);
    _dncSyncPanelForSelection(name);
  };
}
