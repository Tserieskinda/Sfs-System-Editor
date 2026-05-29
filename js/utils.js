// ════════════════════════════════════════════════════════════
//  utils.js  —  UTILS topbar dropdown + Calculator modal
// ════════════════════════════════════════════════════════════

// ── Dropdown ─────────────────────────────────────────────────
let _utilsDropOpen = false;

function toggleUtilsDropdown() {
  _utilsDropOpen = !_utilsDropOpen;
  const dd = document.getElementById('utils-dropdown');
  if (_utilsDropOpen) {
    const btn = document.getElementById('btn-utils');
    const r = btn.getBoundingClientRect();
    dd.style.top   = (r.bottom + 6) + 'px';
    dd.style.right = (window.innerWidth - r.right) + 'px';
    dd.style.left  = 'auto';
  }
  dd.style.display = _utilsDropOpen ? 'block' : 'none';
}

// Close when clicking outside
document.addEventListener('mousedown', e => {
  try {
    const wrap = document.getElementById('utils-dropdown-wrap');
    const dd   = document.getElementById('utils-dropdown');
    if (dd && !dd.contains(e.target) && (!wrap || !wrap.contains(e.target))) {
      _utilsDropOpen = false;
      dd.style.display = 'none';
    }
  } catch(_){}
}, true);


// ── Calculator modal ─────────────────────────────────────────
// Track which tool panels and sci panel are open
let _calcOpenTool = null;   // 'circ' | 'cloud' | 'hm' | null
let _calcSciOpen  = false;

function openCalculator() {
  _utilsDropOpen = false;
  document.getElementById('utils-dropdown').style.display = 'none';

  _calcPopulateBodies();

  const overlay = document.getElementById('calc-modal-overlay');
  overlay.style.display = 'flex';

  // Open first tool by default if none open
  if (!_calcOpenTool) calcToggleTool('circ', true);
  calcUpdate();
}

function closeCalculator() {
  document.getElementById('calc-modal-overlay').style.display = 'none';
}

// Close on overlay background click
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('calc-modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('calc-modal-overlay')) closeCalculator();
  });
});

// Close on ESC
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('calc-modal-overlay');
    if (overlay && overlay.style.display !== 'none') closeCalculator();
  }
});

function _calcPopulateBodies() {
  const sel = document.getElementById('calc-body-sel');
  if (!sel) return;
  const names = Object.keys(typeof bodies !== 'undefined' ? bodies : {});
  if (!names.length) {
    sel.innerHTML = '<option value="">— no bodies loaded —</option>';
    return;
  }
  names.sort((a, b) => {
    const ac = bodies[a]?.isCenter ? -1 : 1;
    const bc = bodies[b]?.isCenter ? -1 : 1;
    if (ac !== bc) return ac - bc;
    return a.localeCompare(b);
  });
  sel.innerHTML = names.map(n =>
    `<option value="${n}">${n}${bodies[n]?.isCenter ? ' ★' : ''}</option>`
  ).join('');
  if (typeof selectedBody !== 'undefined' && selectedBody && bodies[selectedBody]) {
    sel.value = selectedBody;
  }
  calcBodyChanged();
}

function calcBodyChanged() {
  calcUpdate();
}

function _calcGetBodyData() {
  const sel  = document.getElementById('calc-body-sel');
  const name = sel?.value;
  if (!name || typeof bodies === 'undefined' || !bodies[name]) return null;
  const d = bodies[name].data || {};
  const radius_m           = d.BASE_DATA?.radius || 0;
  const cloudStartHeight_m = d.ATMOSPHERE_VISUALS_DATA?.CLOUDS?.startHeight || 0;
  return { name, radius_m, cloudStartHeight_m };
}

// ── New: toggle tool panel (accordion-style) ──────────────────
function calcToggleTool(tool, forceOpen) {
  const isOpen = _calcOpenTool === tool;
  const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;

  // Close all panels first
  ['circ', 'cloud', 'hm'].forEach(t => {
    const panel = document.getElementById('calc-panel-' + t);
    const arrow = document.getElementById('calc-arrow-' + t);
    const item  = document.getElementById('calc-tool-' + t);
    if (panel) panel.style.display = 'none';
    if (arrow) arrow.style.transform = '';
    if (item)  item.classList.remove('calc-tool-open');
  });

  if (shouldOpen) {
    _calcOpenTool = tool;
    const panel = document.getElementById('calc-panel-' + tool);
    const arrow = document.getElementById('calc-arrow-' + tool);
    const item  = document.getElementById('calc-tool-' + tool);
    if (panel) panel.style.display = 'block';
    if (arrow) arrow.style.transform = 'rotate(90deg)';
    if (item)  item.classList.add('calc-tool-open');
    calcUpdate();
  } else {
    _calcOpenTool = null;
  }
}

// ── Legacy tab API shim (keep compat if anything still calls it) ─
function calcSetTab(tab) {
  calcToggleTool(tab, true);
}

// ── Scientific calculator toggle ──────────────────────────────
function calcToggleSci() {
  _calcSciOpen = !_calcSciOpen;
  const panel   = document.getElementById('calc-sci-panel');
  const chevron = document.getElementById('calc-sci-chevron');
  if (panel)   panel.style.display = _calcSciOpen ? 'block' : 'none';
  if (chevron) chevron.style.transform = _calcSciOpen ? 'rotate(90deg)' : '';
}

// ── Scientific calculator logic ───────────────────────────────
let _sciExpr    = '';
let _sciResult  = null;
let _sciNewNum  = false;  // after = was pressed, fresh input clears

function _sciRender() {
  const disp = document.getElementById('calc-sci-display');
  const expr = document.getElementById('calc-sci-expr');
  if (disp) disp.textContent = _sciExpr || '0';
  if (expr) expr.textContent = '';
}

function sciInsert(ch) {
  if (_sciNewNum && /[\d.]/.test(ch)) { _sciExpr = ''; }
  _sciNewNum = false;
  _sciExpr += ch;
  _sciRender();
}

function sciConst(c) {
  const val = c === 'Math.PI' ? Math.PI : Math.E;
  if (_sciNewNum) { _sciExpr = ''; }
  _sciNewNum = false;
  _sciExpr += val.toString();
  _sciRender();
}

function sciDel() {
  _sciNewNum = false;
  _sciExpr = _sciExpr.slice(0, -1);
  _sciRender();
}

function sciClear() {
  _sciExpr = '';
  _sciResult = null;
  _sciNewNum = false;
  const disp = document.getElementById('calc-sci-display');
  const expr = document.getElementById('calc-sci-expr');
  if (disp) disp.textContent = '0';
  if (expr) expr.textContent = '';
}

function sciFunc(fn) {
  // If there's already an expression, wrap it; otherwise start fresh
  const src = _sciExpr || '0';
  const num = parseFloat(src);

  const wrapFns = {
    sin:   () => `sin(${src})`,
    cos:   () => `cos(${src})`,
    tan:   () => `tan(${src})`,
    log:   () => `log(${src})`,
    ln:    () => `ln(${src})`,
    sqrt:  () => `√(${src})`,
    abs:   () => `|${src}|`,
    floor: () => `⌊${src}⌋`,
    pow2:  () => `(${src})²`,
    pow3:  () => `(${src})³`,
    inv:   () => `1/(${src})`,
  };

  const exprLabel = document.getElementById('calc-sci-expr');
  if (exprLabel) exprLabel.textContent = wrapFns[fn] ? wrapFns[fn]() : src;

  let result;
  try {
    switch(fn) {
      case 'sin':   result = Math.sin(num); break;
      case 'cos':   result = Math.cos(num); break;
      case 'tan':   result = Math.tan(num); break;
      case 'log':   result = Math.log10(num); break;
      case 'ln':    result = Math.log(num); break;
      case 'sqrt':  result = Math.sqrt(num); break;
      case 'abs':   result = Math.abs(num); break;
      case 'floor': result = Math.floor(num); break;
      case 'pow2':  result = Math.pow(num, 2); break;
      case 'pow3':  result = Math.pow(num, 3); break;
      case 'inv':   result = 1 / num; break;
      default:      result = NaN;
    }
    _sciExpr   = isFinite(result) ? _sciPretty(result) : 'Error';
    _sciResult = result;
    _sciNewNum = true;
  } catch(err) {
    _sciExpr = 'Error';
  }
  const disp = document.getElementById('calc-sci-display');
  if (disp) disp.textContent = _sciExpr;
}

function sciEval() {
  try {
    // Replace display operators and power operator before eval
    let expr = _sciExpr
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/\^/g, '**');

    const exprLabel = document.getElementById('calc-sci-expr');
    if (exprLabel) exprLabel.textContent = _sciExpr + ' =';

    // Safe eval via Function constructor
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + expr + ')')();
    _sciResult = result;
    _sciExpr   = isFinite(result) ? _sciPretty(result) : 'Error';
    _sciNewNum = true;
  } catch(e) {
    _sciExpr = 'Error';
    _sciNewNum = true;
  }
  const disp = document.getElementById('calc-sci-display');
  if (disp) disp.textContent = _sciExpr;
}

function _sciPretty(n) {
  if (!isFinite(n)) return 'Error';
  // Show up to 10 sig figs, strip trailing zeros
  const s = parseFloat(n.toPrecision(10)).toString();
  return s;
}

// Format metres
function _fmtMetres(m) {
  if (!isFinite(m) || m <= 0) return '—';
  return `${parseFloat(m.toFixed(7))} m`;
}

function calcUpdate() {
  const bd = _calcGetBodyData();
  const info   = document.getElementById('calc-body-info');
  const infoR  = document.getElementById('calc-info-r');
  const infoC  = document.getElementById('calc-info-cloud');

  if (!bd || bd.radius_m <= 0) {
    if (info) info.style.display = 'none';
    document.getElementById('calc-res-circ').textContent  = '—';
    document.getElementById('calc-res-cloud').textContent = '—';
    document.getElementById('calc-res-hm').textContent    = '—';
    return;
  }

  const { radius_m, cloudStartHeight_m } = bd;

  if (info) {
    info.style.display = '';
    infoR.textContent  = `r = ${_fmtMetres(radius_m)}`;
    infoC.textContent  = cloudStartHeight_m > 0
      ? `cloudStartHeight = ${_fmtMetres(cloudStartHeight_m)}`
      : 'No cloud layer defined';
  }

  // Circumference
  const circ = 2 * Math.PI * radius_m;
  document.getElementById('calc-res-circ').textContent = _fmtMetres(circ);

  // Cloud width
  const cloudN = Math.max(1, parseInt(document.getElementById('calc-cloud-n')?.value) || 8);
  const cloudNote = document.getElementById('calc-cloud-sh-note');
  if (cloudStartHeight_m > 0) {
    const cloudCirc  = 2 * Math.PI * (radius_m + cloudStartHeight_m);
    const cloudWidth = cloudCirc / cloudN;
    document.getElementById('calc-res-cloud').textContent = _fmtMetres(cloudWidth);
    if (cloudNote) cloudNote.textContent = `cloudStartHeight = ${_fmtMetres(cloudStartHeight_m)}`;
  } else {
    const cloudWidth = circ / cloudN;
    document.getElementById('calc-res-cloud').textContent = _fmtMetres(cloudWidth) + '  (no cloud layer — using surface r)';
    if (cloudNote) cloudNote.textContent = 'No CLOUDS.startHeight found for this body';
  }

  // Heightmap width
  const hmN    = Math.max(1, parseInt(document.getElementById('calc-hm-n')?.value) || 1024);
  const hmWidth = circ / hmN;
  document.getElementById('calc-res-hm').textContent = _fmtMetres(hmWidth);
}

// ════════════════════════════════════════════════════════════
//  HEIGHTMAP TOOLS
// ════════════════════════════════════════════════════════════

let _hmtBmpImg   = null;   // loaded Image element
let _hmtBmpPx    = null;   // Uint8ClampedArray pixels of the bump map
let _hmtBmpW     = 0;
let _hmtBmpH     = 0;
let _hmtProfile  = null;   // Float32Array of height values [0..1], output-width samples
let _hmtDragging = false;

// Multi-breakpoint system
// Each breakpoint: { x: 0..1 fraction along width, lat: 0..1 fraction top→bottom }
// Sorted by x. First always at x=0, last always at x=1.
let _hmtBreakpoints = [
  { x: 0,   lat: 0.5 },
  { x: 1,   lat: 0.5 }
];
let _hmtDragBpIdx = -1;   // index of currently dragged breakpoint

function openHeightmapTools() {
  _utilsDropOpen = false;
  document.getElementById('utils-dropdown').style.display = 'none';
  const modal = document.getElementById('hmt-modal');
  modal.style.display = 'flex';
  hmtSetTab('bumpmap');
}

function closeHeightmapTools() {
  document.getElementById('hmt-modal').style.display = 'none';
}

// Close on backdrop click — deferred so #hmt-modal exists (it's declared after this script tag)
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('hmt-modal').addEventListener('mousedown', function(e){
    if(e.target === this) closeHeightmapTools();
  });
});

function hmtSetTab(tab) {
  // Bumpmap tab
  const bmpPanel = document.getElementById('hmt-bumpmap');
  const texPanel = document.getElementById('hmt-texmap');
  const bmpBtn   = document.getElementById('hmt-tab-bmp');
  const texBtn   = document.getElementById('hmt-tab-texmap');

  if(tab === 'bumpmap') {
    bmpPanel.style.display = 'flex';
    if(texPanel) texPanel.style.display = 'none';
    if(bmpBtn) { bmpBtn.style.background='rgba(100,220,180,.12)'; bmpBtn.style.color='rgba(100,220,180,.9)'; }
    if(texBtn) { texBtn.style.background='none'; texBtn.style.color='rgba(180,200,255,.6)'; }
  } else if(tab === 'texmap') {
    bmpPanel.style.display = 'none';
    if(texPanel) texPanel.style.display = 'flex';
    if(bmpBtn) { bmpBtn.style.background='none'; bmpBtn.style.color='rgba(180,200,255,.6)'; }
    if(texBtn) { texBtn.style.background='rgba(120,160,255,.12)'; texBtn.style.color='rgba(180,210,255,.9)'; }
  }
}

// ── Breakpoint management ─────────────────────────────────────
function hmtAddBreakpoint() {
  // Insert a new breakpoint in the middle of the longest gap
  const bps = _hmtBreakpoints;
  let bestGap = -1, bestIdx = 0;
  for(let i = 0; i < bps.length - 1; i++) {
    const gap = bps[i+1].x - bps[i].x;
    if(gap > bestGap) { bestGap = gap; bestIdx = i; }
  }
  const newX   = (bps[bestIdx].x + bps[bestIdx+1].x) / 2;
  const newLat = (bps[bestIdx].lat + bps[bestIdx+1].lat) / 2;
  bps.splice(bestIdx + 1, 0, { x: newX, lat: newLat });
  hmtUpdate();
}

function hmtRemoveBreakpoint() {
  // Remove last interior breakpoint (keep endpoints)
  if(_hmtBreakpoints.length <= 2) return;
  _hmtBreakpoints.splice(_hmtBreakpoints.length - 2, 1);
  hmtUpdate();
}

function hmtResetBreakpoints() {
  _hmtBreakpoints = [{ x: 0, lat: 0.5 }, { x: 1, lat: 0.5 }];
  hmtUpdate();
}

// ── Load bump map image ───────────────────────────────────────
function hmtLoadFile(file) {
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      _hmtBmpImg = img;
      _hmtBmpW = img.width; _hmtBmpH = img.height;
      // Rasterise to offscreen canvas
      const oc = document.createElement('canvas');
      oc.width = _hmtBmpW; oc.height = _hmtBmpH;
      oc.getContext('2d').drawImage(img, 0, 0);
      _hmtBmpPx = oc.getContext('2d').getImageData(0, 0, _hmtBmpW, _hmtBmpH).data;

      // Draw preview
      const pv = document.getElementById('hmt-preview');
      pv.width  = _hmtBmpW;
      pv.height = _hmtBmpH;
      pv.getContext('2d').drawImage(img, 0, 0);

      // Size overlay canvas to match
      const ov = document.getElementById('hmt-overlay');
      ov.width  = _hmtBmpW;
      ov.height = _hmtBmpH;

      document.getElementById('hmt-dropzone').style.display = 'none';
      document.getElementById('hmt-loaded').style.display   = 'flex';

      hmtResetBreakpoints();
      hmtInitOverlayEvents();
      hmtUpdate();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── Overlay drag events (multi-breakpoint, touch + mouse) ────
function hmtInitOverlayEvents() {
  const ov = document.getElementById('hmt-overlay');
  // Remove old listeners by cloning
  const fresh = ov.cloneNode(false);
  ov.parentNode.replaceChild(fresh, ov);
  const el = fresh;

  function clientToFrac(clientX, clientY) {
    const rect = el.getBoundingClientRect();
    return {
      xf: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      yf: Math.max(0, Math.min(1, (clientY - rect.top)  / rect.height))
    };
  }

  function findHandle(xf, yf) {
    // Hit-test against each breakpoint handle in canvas-space
    const W = el.getBoundingClientRect().width;
    const H = el.getBoundingClientRect().height;
    const R = Math.max(14, H * 0.04); // hit radius in px
    const bps = _hmtBreakpoints;
    for(let i = 0; i < bps.length; i++) {
      const hx = bps[i].x * W;
      const hy = bps[i].lat * H;
      const rect = el.getBoundingClientRect();
      const cx = bps[i].x * rect.width;
      const cy = bps[i].lat * rect.height;
      const dx = xf * rect.width  - cx;
      const dy = yf * rect.height - cy;
      if(Math.sqrt(dx*dx + dy*dy) <= R) return i;
    }
    return -1;
  }

  function onStart(clientX, clientY) {
    const { xf, yf } = clientToFrac(clientX, clientY);
    _hmtDragBpIdx = findHandle(xf, yf);
    if(_hmtDragBpIdx >= 0) {
      _hmtDragging = true;
    }
  }

  function onMove(clientX, clientY) {
    if(!_hmtDragging || _hmtDragBpIdx < 0) return;
    const { xf, yf } = clientToFrac(clientX, clientY);
    const bp = _hmtBreakpoints[_hmtDragBpIdx];
    // Endpoints can only move vertically; interior points move both axes
    bp.lat = Math.max(0, Math.min(1, yf));
    if(_hmtDragBpIdx > 0 && _hmtDragBpIdx < _hmtBreakpoints.length - 1) {
      // Constrain x between neighbours
      const xMin = _hmtBreakpoints[_hmtDragBpIdx - 1].x + 0.01;
      const xMax = _hmtBreakpoints[_hmtDragBpIdx + 1].x - 0.01;
      bp.x = Math.max(xMin, Math.min(xMax, xf));
    }
    hmtUpdate();
  }

  function onEnd() { _hmtDragging = false; _hmtDragBpIdx = -1; }

  el.addEventListener('mousedown',  e => { e.preventDefault(); onStart(e.clientX, e.clientY); });
  window.addEventListener('mousemove', e => { onMove(e.clientX, e.clientY); });
  window.addEventListener('mouseup',   onEnd);

  el.addEventListener('touchstart', e => { e.preventDefault(); onStart(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  el.addEventListener('touchmove',  e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
  el.addEventListener('touchend',   onEnd);
}

// ── Interpolate lat fraction at output column i (0..outW-1) ──
function _hmtLatAtCol(i, outW) {
  const xf  = i / (outW - 1);
  const bps = _hmtBreakpoints;
  // Find enclosing segment
  for(let s = 0; s < bps.length - 1; s++) {
    if(xf <= bps[s+1].x) {
      const span = bps[s+1].x - bps[s].x;
      const t    = span < 1e-9 ? 0 : (xf - bps[s].x) / span;
      // Smooth step interpolation so breakpoint seams are soft
      const ts   = t * t * (3 - 2 * t);
      return bps[s].lat * (1 - ts) + bps[s+1].lat * ts;
    }
  }
  return bps[bps.length-1].lat;
}

// ── Main update ───────────────────────────────────────────────
function hmtOnWidthInput() {
  const warn = document.getElementById('hmt-width-warn');
  const w = parseInt(document.getElementById('hmt-width').value) || 0;
  if(warn) warn.style.display = (w > 4096) ? 'block' : 'none';
  hmtUpdate();
}

function hmtUpdate() {
  if(!_hmtBmpPx) return;

  const lonOff    = parseFloat(document.getElementById('hmt-lon').value) / 100;
  const scale     = parseFloat(document.getElementById('hmt-scale').value);
  const smooth    = parseInt(document.getElementById('hmt-smooth').value);
  const invert    = document.getElementById('hmt-invert').checked;
  const outW      = Math.max(1, parseInt(document.getElementById('hmt-width').value) || 1024);
  const vshift    = parseInt(document.getElementById('hmt-vshift').value) || 0;

  // Update labels
  document.getElementById('hmt-lon-val').textContent    = Math.round(lonOff * 360) + '°';
  document.getElementById('hmt-scale-val').textContent  = scale.toFixed(2) + '×';
  document.getElementById('hmt-smooth-val').textContent = smooth;
  document.getElementById('hmt-vshift-val').textContent = vshift;
  // Keep lag warning in sync when hmtUpdate is called from other paths
  const warn = document.getElementById('hmt-width-warn');
  if(warn) warn.style.display = (outW > 4096) ? 'block' : 'none';

  const raw = new Float32Array(outW);
  for(let i = 0; i < outW; i++) {
    // Per-column latitude from breakpoint path, offset by V shift (clamped to image bounds)
    const latFrac = _hmtLatAtCol(i, outW);
    const rowFBase = latFrac * (_hmtBmpH - 1) + vshift;
    const rowF  = Math.max(0, Math.min(_hmtBmpH - 1, rowFBase));
    const row0  = Math.floor(rowF);
    const row1  = Math.min(row0 + 1, _hmtBmpH - 1);
    const rowT  = rowF - row0;

    // Map output column → source column with longitude offset
    const srcFrac = ((i / outW) + lonOff) % 1;
    const srcX    = srcFrac * (_hmtBmpW - 1);
    const x0 = Math.floor(srcX), x1 = Math.min(x0 + 1, _hmtBmpW - 1);
    const xT = srcX - x0;

    function luma(row, col) {
      const idx = (row * _hmtBmpW + col) * 4;
      return _hmtBmpPx[idx] / 255;
    }
    const v = (luma(row0, x0) * (1-xT) + luma(row0, x1) * xT) * (1-rowT)
            + (luma(row1, x0) * (1-xT) + luma(row1, x1) * xT) * rowT;
    raw[i] = invert ? (1 - v) : v;
  }

  // Gaussian smoothing (handles spike smoothing at breakpoint seams)
  const prof = smooth > 0 ? _hmtGaussian(raw, smooth) : raw;

  // Apply scale — clamp to [0..1]
  _hmtProfile = new Float32Array(outW);
  for(let i = 0; i < outW; i++) {
    _hmtProfile[i] = Math.max(0, Math.min(1, prof[i] * scale));
  }

  hmtDrawOverlay(lonOff);
  hmtDrawProfile();
}

function _hmtGaussian(data, radius) {
  const out = new Float32Array(data.length);
  const N   = data.length;
  const sigma = radius / 2;
  const ks = Math.ceil(radius * 2);
  const kern = new Float32Array(ks * 2 + 1);
  let ksum = 0;
  for(let i = -ks; i <= ks; i++) {
    kern[i + ks] = Math.exp(-(i*i) / (2 * sigma * sigma));
    ksum += kern[i + ks];
  }
  for(let i = 0; i < kern.length; i++) kern[i] /= ksum;
  for(let x = 0; x < N; x++) {
    let acc = 0;
    for(let k = -ks; k <= ks; k++) {
      acc += data[(x + k + N) % N] * kern[k + ks];
    }
    out[x] = acc;
  }
  return out;
}

// ── Draw overlay: multi-breakpoint path + handles ─────────────
function hmtDrawOverlay(lonOff) {
  const el  = document.getElementById('hmt-overlay');
  const ctx = el.getContext('2d');
  const W = el.width, H = el.height;
  const bps = _hmtBreakpoints;
  const lw  = Math.max(1.5, H / 180);
  const handleR = Math.max(8, H / 50);

  ctx.clearRect(0, 0, W, H);

  // ── Sample path (solid teal line through breakpoints) ──
  ctx.strokeStyle = 'rgba(100,220,180,.9)';
  ctx.lineWidth   = lw;
  ctx.setLineDash([]);
  ctx.beginPath();
  for(let i = 0; i < bps.length; i++) {
    const px = bps[i].x * W;
    const py = bps[i].lat * H;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.stroke();

  // ── Longitude offset marker (vertical dashed amber line) ──
  const lonX = Math.round(lonOff * W);
  ctx.strokeStyle = 'rgba(255,200,80,.65)';
  ctx.lineWidth   = lw;
  ctx.setLineDash([Math.max(3, H/80), Math.max(3, H/80)]);
  ctx.beginPath(); ctx.moveTo(lonX, 0); ctx.lineTo(lonX, H); ctx.stroke();
  ctx.setLineDash([]);

  // ── Breakpoint handles ──
  for(let i = 0; i < bps.length; i++) {
    const px = bps[i].x * W;
    const py = bps[i].lat * H;
    const isEnd = (i === 0 || i === bps.length - 1);
    const isHot = (i === _hmtDragBpIdx);

    // Shadow
    ctx.shadowColor   = 'rgba(0,0,0,.5)';
    ctx.shadowBlur    = 6;

    // Outer ring
    ctx.strokeStyle = isHot ? 'rgba(255,255,100,.95)' : 'rgba(100,220,180,.95)';
    ctx.lineWidth   = lw * 1.2;
    ctx.beginPath(); ctx.arc(px, py, handleR, 0, Math.PI*2); ctx.stroke();

    // Fill
    ctx.fillStyle = isEnd
      ? 'rgba(100,220,180,.35)'
      : (isHot ? 'rgba(255,255,100,.45)' : 'rgba(100,220,180,.55)');
    ctx.beginPath(); ctx.arc(px, py, handleR - lw, 0, Math.PI*2); ctx.fill();

    ctx.shadowBlur = 0;

    // Label: lat degrees
    const latDeg = Math.round((bps[i].lat - 0.5) * 180);
    const label  = (latDeg >= 0 ? '+' : '') + latDeg + '°';
    ctx.font      = `bold ${Math.max(9, H/55)}px 'JetBrains Mono', monospace`;
    ctx.fillStyle = isHot ? 'rgba(255,255,140,.95)' : 'rgba(100,220,180,.9)';
    ctx.textAlign = 'center';
    ctx.fillText(label, px, py - handleR - 4);
  }
}

// ── Draw height profile canvas ────────────────────────────────
function hmtDrawProfile() {
  if(!_hmtProfile) return;
  const cv  = document.getElementById('hmt-profile');
  const ctx = cv.getContext('2d');
  const W   = cv.offsetWidth || 800;
  const H   = cv.offsetHeight || 64;
  cv.width  = W; cv.height = H;

  ctx.fillStyle = 'rgba(4,8,20,.95)';
  ctx.fillRect(0, 0, W, H);

  const N = _hmtProfile.length;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(100,220,180,.6)');
  grad.addColorStop(1, 'rgba(100,220,180,.08)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  for(let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W;
    const y = H - _hmtProfile[i] * (H - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();

  ctx.strokeStyle = 'rgba(100,220,180,.9)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  for(let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * W;
    const y = H - _hmtProfile[i] * (H - 2) - 1;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Draw vertical tick marks where breakpoints are
  ctx.strokeStyle = 'rgba(100,220,180,.35)';
  ctx.lineWidth   = 1;
  ctx.setLineDash([2, 3]);
  for(let i = 1; i < _hmtBreakpoints.length - 1; i++) {
    const px = _hmtBreakpoints[i].x * W;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  ctx.setLineDash([]);
}

const _HMT_CHUNK = 512;    // columns per ImageData chunk — keeps memory bounded for 8K outputs

// ── Build the SFS heightmap canvas ───────────────────────────
function _hmtBuildCanvas() {
  if(!_hmtProfile) return null;
  const outW = _hmtProfile.length;
  const outH = Math.max(1, parseInt(document.getElementById('hmt-height')?.value) || 512);
  const outC = document.createElement('canvas');
  outC.width = outW; outC.height = outH;
  const ctx  = outC.getContext('2d');

  // Process in column chunks so 8K outputs don't exceed ImageData memory limits
  for(let chunkStart = 0; chunkStart < outW; chunkStart += _HMT_CHUNK) {
    const chunkW = Math.min(_HMT_CHUNK, outW - chunkStart);
    const imgd   = ctx.createImageData(chunkW, outH);
    const d      = imgd.data;
    for(let ci = 0; ci < chunkW; ci++) {
      const x    = chunkStart + ci;
      const frac = _hmtProfile[outW - x - 1];
      const cutY = Math.round(outH * (1 - frac));
      for(let y = 0; y < outH; y++) {
        const idx = (y * chunkW + ci) * 4;
        d[idx] = d[idx+1] = d[idx+2] = 0;
        d[idx+3] = y >= cutY ? 255 : 0;
      }
    }
    ctx.putImageData(imgd, chunkStart, 0);
  }
  return outC;
}

// ── Resolve a unique asset name (auto-increment if taken) ─────
function _hmtUniqueName(base) {
  const existing = (typeof assets !== 'undefined' && assets.heightmaps) ? assets.heightmaps : [];
  if(!existing.some(e => e.name === base + '.png')) return base;
  let serial = 2;
  while(existing.some(e => e.name === base + '_' + serial + '.png')) serial++;
  return base + '_' + serial;
}

// ── Save to heightmap assets (auto-numbered, injects into HMAP) ─
function hmtSaveToAssets() {
  if(!_hmtProfile) { alert('Load a bump map first.'); return; }
  const rawName = (document.getElementById('hmt-out-name').value || 'bumpmap_hm').trim().replace(/\.png$/i, '');
  const uniqueName = _hmtUniqueName(rawName);
  const pngName    = uniqueName + '.png';

  const outC = _hmtBuildCanvas();
  if(!outC) { alert('Failed to build heightmap.'); return; }
  const dataUrl = outC.toDataURL('image/png');

  // Convert to bytes for ZIP export
  const b64     = dataUrl.split(',')[1];
  const byteStr = atob(b64);
  const bytes   = new Uint8Array(byteStr.length);
  for(let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);

  const entry = { name: pngName, url: dataUrl, type: 'image/png', bytes, size: bytes.length };

  if(typeof assets !== 'undefined' && assets.heightmaps) assets.heightmaps.push(entry);
  if(typeof injectCustomHeightmap === 'function') injectCustomHeightmap(pngName);
  if(typeof renderAssetRow        === 'function') renderAssetRow(entry, 'heightmaps');

  // Update name field to the unique name that was used
  document.getElementById('hmt-out-name').value = uniqueName;

  // Flash status
  const status = document.getElementById('hmt-save-status');
  status.textContent = '✓ Saved as ' + pngName;
  status.style.display = 'block';
  clearTimeout(status._t);
  status._t = setTimeout(() => { status.style.display = 'none'; }, 3000);
}

// ── Download PNG directly ─────────────────────────────────────
function hmtDownloadPNG() {
  if(!_hmtProfile) { alert('Load a bump map first.'); return; }
  const rawName    = (document.getElementById('hmt-out-name').value || 'bumpmap_hm').trim().replace(/\.png$/i, '');
  const uniqueName = _hmtUniqueName(rawName);
  const outC = _hmtBuildCanvas();
  if(!outC) return;
  const link = document.createElement('a');
  link.href     = outC.toDataURL('image/png');
  link.download = uniqueName + '.png';
  link.click();
}

// ════════════════════════════════════════════════════════════
//  TEXTURE MAP → SFS TEXTURE CONVERTER
// ════════════════════════════════════════════════════════════

let _htxSrcImg  = null;   // source Image
let _htxSrcPx   = null;   // Uint8ClampedArray pixels
let _htxSrcW    = 0;
let _htxSrcH    = 0;
let _htxOutC    = null;   // output canvas

// ── Load file ────────────────────────────────────────────────
function htxLoadFile(file) {
  if(!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      _htxSrcImg = img;
      _htxSrcW = img.width;
      _htxSrcH = img.height;
      // Rasterise to pixel buffer
      const oc = document.createElement('canvas');
      oc.width = _htxSrcW; oc.height = _htxSrcH;
      oc.getContext('2d').drawImage(img, 0, 0);
      _htxSrcPx = oc.getContext('2d').getImageData(0, 0, _htxSrcW, _htxSrcH).data;
      // Draw source preview
      const pv = document.getElementById('htx-src-preview');
      pv.width = _htxSrcW; pv.height = _htxSrcH;
      pv.getContext('2d').drawImage(img, 0, 0);
      // Show loaded state
      document.getElementById('htx-dropzone').style.display = 'none';
      document.getElementById('htx-loaded').style.display   = 'flex';
      htxUpdate();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function htxReload() {
  _htxSrcImg = null; _htxSrcPx = null;
  document.getElementById('htx-dropzone').style.display = '';
  document.getElementById('htx-loaded').style.display   = 'none';
  document.getElementById('htx-file-input').value = '';
}

// ── Bilinear sample from equirectangular source ──────────────
// u,v in [0,1) — wraps horizontally, clamps vertically
function _htxSample(u, v) {
  // Wrap u
  u = u - Math.floor(u);
  // Clamp v
  v = Math.max(0, Math.min(0.9999, v));
  const fx = u * _htxSrcW;
  const fy = v * _htxSrcH;
  const x0 = Math.floor(fx) % _htxSrcW;
  const y0 = Math.floor(fy);
  const x1 = (x0 + 1) % _htxSrcW;
  const y1 = Math.min(y0 + 1, _htxSrcH - 1);
  const dx = fx - Math.floor(fx);
  const dy = fy - Math.floor(fy);
  const i00 = (y0 * _htxSrcW + x0) * 4;
  const i10 = (y0 * _htxSrcW + x1) * 4;
  const i01 = (y1 * _htxSrcW + x0) * 4;
  const i11 = (y1 * _htxSrcW + x1) * 4;
  const p = _htxSrcPx;
  const r = (p[i00]*(1-dx)*(1-dy) + p[i10]*dx*(1-dy) + p[i01]*(1-dx)*dy + p[i11]*dx*dy);
  const g = (p[i00+1]*(1-dx)*(1-dy) + p[i10+1]*dx*(1-dy) + p[i01+1]*(1-dx)*dy + p[i11+1]*dx*dy);
  const b = (p[i00+2]*(1-dx)*(1-dy) + p[i10+2]*dx*(1-dy) + p[i01+2]*(1-dx)*dy + p[i11+2]*dx*dy);
  const a = (p[i00+3]*(1-dx)*(1-dy) + p[i10+3]*dx*(1-dy) + p[i01+3]*(1-dx)*dy + p[i11+3]*dx*dy);
  return [r, g, b, a];
}

// ── Build output canvas ──────────────────────────────────────
function _htxBuildCanvas() {
  if(!_htxSrcPx) return null;

  const size    = Math.max(64, Math.min(4096, parseInt(document.getElementById('htx-size').value) || 512));
  const hemi    = document.querySelector('input[name="htx-hemi"]:checked')?.value || 'bottom';
  const mode    = document.querySelector('input[name="htx-mode"]:checked')?.value || 'polar';
  const latCut  = (parseInt(document.getElementById('htx-lat').value) || 50) / 100;  // 0..1
  const lonRot  = (parseInt(document.getElementById('htx-lon').value) || 0) / 360;   // 0..1
  const fishStr = parseFloat(document.getElementById('htx-fish').value) || 1.0;

  const out = document.createElement('canvas');
  out.width = size; out.height = size;
  const ctx = out.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const px = imgData.data;

  // Determine source vertical range in [0..1] (top=0, bottom=1 in equirect)
  // Top hemisphere: 0..0.5, Bottom hemisphere: 0.5..1.0
  // latCut shrinks/expands how much we include
  let vMin, vMax;
  if(hemi === 'top') {
    vMin = 0;
    vMax = 0.5 * latCut;
  } else if(hemi === 'bottom') {
    vMax = 1.0;
    vMin = 1.0 - 0.5 * latCut;
  } else {
    // full — use latCut as fraction of full height centred at equator
    const halfH = 0.5 * latCut;
    vMin = 0.5 - halfH;
    vMax = 0.5 + halfH;
  }

  const cx = size / 2;
  const cy = size / 2;
  const R  = size / 2;

  if(mode === 'polar') {
    // Polar fisheye: for each output pixel (px,py):
    //   r = distance from centre / R  → 0 at centre (pole), 1 at edge (equator cut)
    //   angle = atan2(dy,dx)          → longitude
    //   map r through fisheye curve   → v in vMin..vMax
    //   map angle                     → u in 0..1
    //
    // Pole is always at centre (r=0):
    //   top hemisphere    → pole is at vMin (top of image),  so r=0 → vMin, r=1 → vMax
    //   bottom hemisphere → pole is at vMax (bottom of image), so r=0 → vMax, r=1 → vMin
    const poleV  = (hemi === 'bottom') ? vMax : vMin;
    const edgeV  = (hemi === 'bottom') ? vMin : vMax;
    for(let py = 0; py < size; py++) {
      for(let px2 = 0; px2 < size; px2++) {
        const dx = (px2 - cx) / R;
        const dy = (py - cy) / R;
        const r  = Math.sqrt(dx*dx + dy*dy);
        if(r > 1.0) {
          // Outside circle — transparent
          const idx = (py * size + px2) * 4;
          px[idx+3] = 0;
          continue;
        }
        // Apply fisheye: remap r with power
        const rWarp = Math.pow(r, 1.0 / fishStr);
        // Map rWarp [0..1]: centre (r=0) → pole, edge (r=1) → equator cut
        const v = poleV + rWarp * (edgeV - poleV);
        // Angle → u [0..1], shifted by lonRot
        const angle = Math.atan2(dy, dx); // -π..π
        let u = angle / (2 * Math.PI) + 0.5 + lonRot; // 0..1 + offset
        // Flip horizontal to match SFS orientation
        u = 1.0 - u;
        const [sr, sg, sb, sa] = _htxSample(u, v);
        const idx = (py * size + px2) * 4;
        px[idx]   = sr;
        px[idx+1] = sg;
        px[idx+2] = sb;
        px[idx+3] = 255;
      }
    }
  } else {
    // Front-face: equatorial projection — just remap the strip onto a square
    // This gives the Mercury/Io/Triton look: equator band projected flat
    for(let py = 0; py < size; py++) {
      const v = vMin + (py / size) * (vMax - vMin);
      for(let px2 = 0; px2 < size; px2++) {
        let u = (px2 / size) + lonRot;
        const [sr, sg, sb] = _htxSample(u, v);
        const idx = (py * size + px2) * 4;
        px[idx]   = sr;
        px[idx+1] = sg;
        px[idx+2] = sb;
        px[idx+3] = 255;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  // For polar mode — clip to circle so transparent corners match SFS polar textures
  if(mode === 'polar') {
    const tmp = document.createElement('canvas');
    tmp.width = size; tmp.height = size;
    const tc = tmp.getContext('2d');
    tc.beginPath();
    tc.arc(cx, cy, R, 0, Math.PI*2);
    tc.clip();
    tc.drawImage(out, 0, 0);
    return tmp;
  }

  return out;
}

// ── Update preview ───────────────────────────────────────────
function htxUpdate() {
  if(!_htxSrcPx) return;

  // Toggle fisheye row visibility
  const mode = document.querySelector('input[name="htx-mode"]:checked')?.value || 'polar';
  const fishRow = document.getElementById('htx-fisheye-row');
  if(fishRow) fishRow.style.opacity = mode === 'polar' ? '1' : '0.35';

  // Build at preview size (256px for speed)
  const sizeSaved = document.getElementById('htx-size').value;
  document.getElementById('htx-size').value = '256';
  const previewC = _htxBuildCanvas();
  document.getElementById('htx-size').value = sizeSaved;
  if(!previewC) return;

  // Draw to output preview canvas
  const outEl = document.getElementById('htx-out-canvas');
  outEl.width = 256; outEl.height = 256;
  outEl.getContext('2d').drawImage(previewC, 0, 0);

  // Update the source cut-line overlay
  _htxDrawCutLine();
}

// Draw the hemisphere cut line on source preview
function _htxDrawCutLine() {
  const ov  = document.getElementById('htx-cut-overlay');
  const pv  = document.getElementById('htx-src-preview');
  if(!ov || !pv) return;
  ov.width  = _htxSrcW;
  ov.height = _htxSrcH;
  const ctx = ov.getContext('2d');
  ctx.clearRect(0, 0, _htxSrcW, _htxSrcH);

  const hemi   = document.querySelector('input[name="htx-hemi"]:checked')?.value || 'bottom';
  const latCut = (parseInt(document.getElementById('htx-lat').value) || 50) / 100;

  let vMin, vMax;
  if(hemi === 'top') {
    vMin = 0; vMax = 0.5 * latCut;
  } else if(hemi === 'bottom') {
    vMax = 1.0; vMin = 1.0 - 0.5 * latCut;
  } else {
    const halfH = 0.5 * latCut;
    vMin = 0.5 - halfH; vMax = 0.5 + halfH;
  }

  const yMin = vMin * _htxSrcH;
  const yMax = vMax * _htxSrcH;

  // Shade excluded areas
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  if(yMin > 0)           ctx.fillRect(0, 0, _htxSrcW, yMin);
  if(yMax < _htxSrcH)    ctx.fillRect(0, yMax, _htxSrcW, _htxSrcH - yMax);

  // Draw cut lines
  ctx.strokeStyle = 'rgba(120,180,255,0.9)';
  ctx.lineWidth   = Math.max(1, _htxSrcH / 120);
  ctx.setLineDash([8, 6]);
  if(yMin > 0) {
    ctx.beginPath(); ctx.moveTo(0, yMin); ctx.lineTo(_htxSrcW, yMin); ctx.stroke();
  }
  if(yMax < _htxSrcH) {
    ctx.beginPath(); ctx.moveTo(0, yMax); ctx.lineTo(_htxSrcW, yMax); ctx.stroke();
  }
}

// ── Unique name helper ───────────────────────────────────────
function _htxUniqueName(base) {
  const existing = (typeof assets !== 'undefined' && assets.textures) ? assets.textures : [];
  if(!existing.some(e => e.name === base + '.png')) return base;
  let serial = 2;
  while(existing.some(e => e.name === base + '_' + serial + '.png')) serial++;
  return base + '_' + serial;
}

// ── Save to texture assets ───────────────────────────────────
function htxSaveToAssets() {
  if(!_htxSrcPx) { alert('Load a texture map first.'); return; }
  const rawName    = (document.getElementById('htx-out-name').value || 'planet_texture').trim().replace(/\.png$/i, '');
  const uniqueName = _htxUniqueName(rawName);
  const pngName    = uniqueName + '.png';

  const outC = _htxBuildCanvas();
  if(!outC) { alert('Failed to build texture.'); return; }
  const dataUrl = outC.toDataURL('image/png');

  const b64     = dataUrl.split(',')[1];
  const byteStr = atob(b64);
  const bytes   = new Uint8Array(byteStr.length);
  for(let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);

  const entry = { name: pngName, url: dataUrl, type: 'image/png', bytes, size: bytes.length };

  if(typeof assets !== 'undefined' && assets.textures) assets.textures.push(entry);
  if(typeof renderAssetRow === 'function') renderAssetRow(entry, 'textures');

  document.getElementById('htx-out-name').value = uniqueName;

  const status = document.getElementById('htx-save-status');
  status.textContent = '✓ Saved as ' + pngName + ' → ASSETS › TEXTURES';
  status.style.display = 'block';
  clearTimeout(status._t);
  status._t = setTimeout(() => { status.style.display = 'none'; }, 4000);
}

// ── Download PNG directly ────────────────────────────────────
function htxDownloadPNG() {
  if(!_htxSrcPx) { alert('Load a texture map first.'); return; }
  const rawName    = (document.getElementById('htx-out-name').value || 'planet_texture').trim().replace(/\.png$/i, '');
  const uniqueName = _htxUniqueName(rawName);
  const outC = _htxBuildCanvas();
  if(!outC) return;
  const link = document.createElement('a');
  link.href     = outC.toDataURL('image/png');
  link.download = uniqueName + '.png';
  link.click();
}
