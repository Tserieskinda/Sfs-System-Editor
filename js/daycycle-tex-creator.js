// ════════════════════════════════════════════════════════════════════
//  DAY/NIGHT CYCLE TEXTURE CREATOR  —  Atmosphere day-band + cloud
//  compositor (companion to TC's atmosphere gradient editor and PT's
//  planet surface editor)
// ════════════════════════════════════════════════════════════════════

const DC = (() => {

  // ── State ──────────────────────────────────────────────────────────
  let _open = false;
  let _el   = {}; // populated in _build()

  let TEX_W = 1024;
  let TEX_H = 256;

  let _drawCanvas = null; // offscreen full-res buffer
  let _drawCtx    = null;

  let cloudImg   = null;  // current cloud source <img>
  let cloudLayers = [
    { id: 1, offsetX: 0, offsetY: 0, hScale: 100, vScale: 100, opacity: 1.0 }
  ];
  let nextLayerId = 2;

  const CLOUD_BUILTIN = "data:image/jpeg;base64,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";

  // ── Utility ────────────────────────────────────────────────────────
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }
  function lerpRgb(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function hexToRgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function _v(id) { const el = document.getElementById(id); return el ? el.value : null; }
  function _f(id) { return parseFloat(_v(id)); }
  function _i(id) { return parseInt(_v(id)); }

  function sampleCloud(cloudPixels, cw, ch, u, v) {
    if (!cloudPixels) return 0;
    u = ((u % 1) + 1) % 1;
    v = clamp(v, 0, 1);
    const px = Math.floor(u * (cw - 1));
    const py = Math.floor(v * (ch - 1));
    const idx = (py * cw + px) * 4;
    return Math.max(cloudPixels[idx], cloudPixels[idx + 1], cloudPixels[idx + 2]);
  }

  // ── Slider fill sync (matches PT's --pct treatment) ─────────────────
  function _updateRangeFill(el) {
    if (!el || el.type !== 'range') return;
    const min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100;
    const v = parseFloat(el.value);
    el.style.setProperty('--pct', (((v - min) / (max - min)) * 100).toFixed(2) + '%');
  }

  // ── Offscreen buffer management ──────────────────────────────────────
  function _initDrawCanvas() {
    _drawCanvas = document.createElement('canvas');
    _drawCanvas.width  = TEX_W;
    _drawCanvas.height = TEX_H;
    _drawCtx = _drawCanvas.getContext('2d');
    _drawCtx.clearRect(0, 0, TEX_W, TEX_H);
  }

  // ── Main texture composer (atmosphere day/dusk bands + cloud layers) ──
  function _drawTexture() {
    const W = TEX_W, H = TEX_H;
    const ctx = _drawCtx;
    ctx.clearRect(0, 0, W, H);

    const dayHalfPct    = _f('dc-dayWidth') / 100;
    const duskPct       = _f('dc-duskWidth') / 100;
    const duskOpacity   = _f('dc-duskOpacity');
    const bendAmt       = _f('dc-bend');
    const topFade       = _f('dc-topFade');
    const botBoost      = _f('dc-botBoost');
    const masterOpacity = _f('dc-opacity');

    const dayTop  = hexToRgb(_v('dc-dayColor'));
    const dayBot  = hexToRgb(_v('dc-dayColorBot'));
    const duskTop = hexToRgb(_v('dc-duskColor'));
    const duskBot = hexToRgb(_v('dc-duskColorBot'));

    const cloudGlobalOpacity = _f('dc-cloudGlobalOpacity');
    const cloudY       = _f('dc-cloudY') / 100;
    const cloudVScale  = _f('dc-cloudVScale') / 100;
    const cloudOffsetX = _f('dc-cloudOffsetX') / 100;
    const cloudHScale  = _f('dc-cloudHScale') / 100;
    const cloudThresh  = _f('dc-cloudThresh');
    const cloudSoft    = _f('dc-cloudSoft');
    const cloudNightDim= _f('dc-cloudNightDim');
    const cloudBlur    = _f('dc-cloudBlur');
    const cloudRepeat  = Math.max(1, _i('dc-cloudRepeat') || 1);
    const cloudTint    = hexToRgb(_v('dc-cloudTint'));

    let cloudPixels = null, cloudW = 0, cloudH = 0;
    if (cloudImg) {
      const tmp = document.createElement('canvas');
      tmp.width  = cloudImg.naturalWidth;
      tmp.height = cloudImg.naturalHeight;
      const tc = tmp.getContext('2d');
      if (cloudBlur > 0) tc.filter = `blur(${cloudBlur}px)`;
      tc.drawImage(cloudImg, 0, 0);
      cloudPixels = tc.getImageData(0, 0, tmp.width, tmp.height).data;
      cloudW = tmp.width; cloudH = tmp.height;
    }

    const imgData = ctx.createImageData(W, H);
    const data = imgData.data;

    for (let py = 0; py < H; py++) {
      const vy = py / (H - 1);
      const vertAlpha = clamp(Math.pow(vy, topFade * 1.5), 0, 1);
      const bbFactor = vy * botBoost;
      const vt = vy;

      for (let px = 0; px < W; px++) {
        const vx = px / (W - 1);
        const cx = vx * 2 - 1;

        const bendFactor = 1 - bendAmt * (1 - vy) * 0.6;
        const adjCx = cx / Math.max(0.01, bendFactor);
        const absX = Math.abs(adjCx);

        let col = [0, 0, 0];
        let alpha = 0;
        let dayFrac = 0;

        if (absX <= dayHalfPct) {
          col = lerpRgb(dayTop, dayBot, vt);
          alpha = 1;
          dayFrac = 1;
        } else if (absX <= dayHalfPct + duskPct) {
          const t = (absX - dayHalfPct) / duskPct;
          const tSmooth = t * t * (3 - 2 * t);
          const dCol = lerpRgb(dayTop, dayBot, vt);
          const nCol = lerpRgb(duskTop, duskBot, vt);
          col = lerpRgb(dCol, nCol, tSmooth);
          alpha = (1 - tSmooth) * duskOpacity;
          dayFrac = 1 - tSmooth;
        } else {
          col = [0, 0, 0];
          alpha = 0;
          dayFrac = 0;
        }

        alpha *= vertAlpha;
        if (alpha > 0) {
          const bb = bbFactor * 0.6;
          col = [
            clamp(col[0] + (255 - col[0]) * bb, 0, 255),
            clamp(col[1] + (255 - col[1]) * bb, 0, 255),
            clamp(col[2] + (255 - col[2]) * bb, 0, 255),
          ];
        }
        alpha = clamp(alpha * masterOpacity, 0, 1);

        if (cloudPixels && cloudGlobalOpacity > 0) {
          let totalCloudBright = 0;
          let totalCloudAlpha = 0;

          for (const layer of cloudLayers) {
            const uShift = cloudOffsetX + (layer.offsetX / 100);
            const u = ((vx * cloudRepeat / cloudHScale / (layer.hScale / 100)) + uShift) % 1;

            const vRaw = (vy - cloudY) / (cloudVScale * (layer.vScale / 100));
            const vOff = layer.offsetY / 100;
            const v = vRaw + 0.5 + vOff;

            if (v < 0 || v > 1) continue;

            let bright = sampleCloud(cloudPixels, cloudW, cloudH, u, v);

            const t0 = cloudThresh;
            const t1 = cloudThresh + Math.max(1, cloudSoft);
            bright = clamp((bright - t0) / (t1 - t0), 0, 1) * 255;

            const stripV = clamp(vRaw, 0, 1);
            const edgeFade = Math.sin(stripV * Math.PI);

            const layerAlpha = (bright / 255) * layer.opacity * edgeFade;
            totalCloudBright += bright * layerAlpha;
            totalCloudAlpha += layerAlpha;
          }

          if (totalCloudAlpha > 0) {
            const avgBright = totalCloudBright / totalCloudAlpha;
            const combinedAlpha = clamp(totalCloudAlpha, 0, 1) * cloudGlobalOpacity;

            const nightFactor = lerp(cloudNightDim, 1.0, dayFrac);
            const cr = clamp(cloudTint[0] * (avgBright / 255) * nightFactor, 0, 255);
            const cg = clamp(cloudTint[1] * (avgBright / 255) * nightFactor, 0, 255);
            const cb = clamp(cloudTint[2] * (avgBright / 255) * nightFactor, 0, 255);

            const ca = combinedAlpha;
            const aa = alpha;
            const outA = ca + aa * (1 - ca);
            if (outA > 0) {
              col = [
                Math.round((cr * ca + col[0] * aa * (1 - ca)) / outA),
                Math.round((cg * ca + col[1] * aa * (1 - ca)) / outA),
                Math.round((cb * ca + col[2] * aa * (1 - ca)) / outA),
              ];
              alpha = outA;
            } else {
              col = [Math.round(cr), Math.round(cg), Math.round(cb)];
              alpha = ca;
            }
          }
        }

        const idx = (py * W + px) * 4;
        data[idx]     = Math.round(col[0]);
        data[idx + 1] = Math.round(col[1]);
        data[idx + 2] = Math.round(col[2]);
        data[idx + 3] = Math.round(alpha * 255);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  // ── Display canvas: checkerboard + scaled texture (matches TC editor) ──
  function _renderDisplay() {
    const cv = _el.editorCanvas;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    const sz = 10;
    for (let y = 0; y < cv.height; y += sz) {
      for (let x = 0; x < cv.width; x += sz) {
        ctx.fillStyle = ((x / sz + y / sz) % 2 === 0) ? '#222228' : '#1a1a1e';
        ctx.fillRect(x, y, sz, sz);
      }
    }

    ctx.imageSmoothingEnabled = false;
    if (_drawCanvas) ctx.drawImage(_drawCanvas, 0, 0, cv.width, cv.height);
  }

  function _refresh() {
    if (!_drawCtx) return;
    _drawTexture();
    _renderDisplay();
    if (_el.status) _el.status.textContent = `${TEX_W} × ${TEX_H} px`;
  }

  function _sizeCanvases() {
    const wrap = _el.editorCanvas && _el.editorCanvas.parentElement;
    if (!wrap) return;
    const availW = Math.min(wrap.clientWidth - 24, 900);
    const eW = Math.max(availW, 220);
    const eH = Math.round(eW * (TEX_H / TEX_W));
    _el.editorCanvas.width  = eW;
    _el.editorCanvas.height = eH;
  }

  // ── Cloud source loading ─────────────────────────────────────────────
  function _loadCloudImage(src, label) {
    const img = new Image();
    img.onload = () => {
      cloudImg = img;
      if (_el.cloudSourceLabel) _el.cloudSourceLabel.textContent = 'Using: ' + label;
      _refresh();
    };
    img.src = src;
  }

  // ── Cloud layer list UI ──────────────────────────────────────────────
  function _layerRow(layer, prop, label, min, max, step, fmt) {
    const val = layer[prop];
    return `
      <div class="pt-row">
        <div class="pt-row-label"><span>${label}</span><span class="pt-val" id="dc-lv-${layer.id}-${prop}">${fmt(val)}</span></div>
        <input class="tc-range" type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-lid="${layer.id}" data-prop="${prop}">
      </div>`;
  }

  function _buildLayerUI() {
    const container = _el.cloudLayers;
    if (!container) return;
    container.innerHTML = '';
    cloudLayers.forEach((layer, i) => {
      const card = document.createElement('div');
      card.className = 'dc-layer-card';
      card.innerHTML = `
        <div class="dc-layer-head">
          <span>LAYER ${i + 1}</span>
          <button class="dc-layer-remove" data-id="${layer.id}" title="Remove layer">✕</button>
        </div>
        ${_layerRow(layer, 'offsetX', 'H offset', 0, 100, 1, v => Math.round(v) + '%')}
        ${_layerRow(layer, 'offsetY', 'V offset', -100, 100, 1, v => Math.round(v) + '%')}
        ${_layerRow(layer, 'hScale',  'H scale',  20, 400, 1, v => Math.round(v) + '%')}
        ${_layerRow(layer, 'vScale',  'V scale',  10, 300, 1, v => Math.round(v) + '%')}
        ${_layerRow(layer, 'opacity', 'Opacity',  0, 1, 0.01, v => parseFloat(v).toFixed(2))}
      `;
      container.appendChild(card);
    });

    container.querySelectorAll('.dc-layer-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        cloudLayers = cloudLayers.filter(l => l.id !== id);
        _buildLayerUI();
        _refresh();
      });
    });

    container.querySelectorAll('input[type=range][data-lid]').forEach(inp => {
      _updateRangeFill(inp);
      inp.addEventListener('input', () => {
        const lid = parseInt(inp.dataset.lid);
        const prop = inp.dataset.prop;
        const layer = cloudLayers.find(l => l.id === lid);
        if (!layer) return;
        layer[prop] = parseFloat(inp.value);
        _updateRangeFill(inp);
        const lbl = document.getElementById(`dc-lv-${lid}-${prop}`);
        if (lbl) lbl.textContent = (prop === 'opacity') ? layer[prop].toFixed(2) : Math.round(layer[prop]) + '%';
        _refresh();
      });
    });
  }

  // ── Export ────────────────────────────────────────────────────────────
  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'tc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  function _exportTexture() {
    const raw = prompt('Texture name:', 'DayCycleTex_' + Date.now());
    if (raw === null) return;
    const safeName = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '_') || ('DayCycleTex_' + Date.now());
    _drawTexture();
    const dataUrl = _drawCanvas.toDataURL('image/png');
    const name = safeName.endsWith('.png') ? safeName : safeName + '.png';

    if (typeof assets !== 'undefined' && typeof cacheTexture !== 'undefined') {
      const entry = { name, url: dataUrl, size: dataUrl.length };
      assets.textures.push(entry);
      if (typeof renderAssetThumb === 'function') renderAssetThumb(entry);
      if (typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
      if (typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
      cacheTexture(name.replace(/\.[^.]+$/, ''), dataUrl);
    }

    const a = document.createElement('a');
    a.href = dataUrl; a.download = name; a.click();
    _showToast('Texture exported & added to assets: ' + name);
  }

  function _copyToClipboard() {
    _drawTexture();
    _drawCanvas.toBlob(async blob => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        _showToast('Copied to clipboard!');
      } catch (e) {
        _showToast('Copy failed — use Export instead');
      }
    });
  }

  // ── Row / field builders ─────────────────────────────────────────────
  function _row(id, label, min, max, step, value, fmt) {
    return `
      <div class="pt-row">
        <div class="pt-row-label"><span>${label}</span><span class="pt-val" id="${id}-val">${fmt ? fmt(value) : value}</span></div>
        <input class="tc-range" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      </div>`;
  }

  function _colorPairRow(label, idTop, idBot, top, bot) {
    return `
      <div class="pt-row">
        <div class="pt-row-label"><span>${label}</span><span class="dc-color-hint">top → bottom</span></div>
        <div class="dc-color-pair">
          <input type="color" class="tc-color-swatch" id="${idTop}" value="${top}">
          <span class="dc-color-arrow">→</span>
          <input type="color" class="tc-color-swatch" id="${idBot}" value="${bot}">
        </div>
      </div>`;
  }

  // ── DOM Builder ────────────────────────────────────────────────────
  function _build() {
    _initDrawCanvas();

    const html = `
<div class="tc-window dc-window">
  <div class="tc-header">
    <div class="tc-header-left">
      <button class="tc-back-btn" id="dc-close">‹ BACK</button>
      <span class="tc-title"><span class="tc-title-accent"><svg class="icon"><use href="#icon-sun"></use></svg></span>DAY / NIGHT CYCLE TEXTURE CREATOR</span>
    </div>
    <div class="tc-header-right">
      <button class="tc-load-btn" id="dc-copy"><svg class="icon"><use href="#icon-copy"></use></svg> COPY TO CLIPBOARD</button>
      <button class="tc-export-btn" id="dc-export">⬇ EXPORT & ADD TO ASSETS</button>
    </div>
  </div>

  <div class="tc-body">
    <div class="tc-sidebar dc-sidebar">
      <div class="tc-tab-bar">
        <button class="tc-tab active" id="dc-tab-atmo" data-tab="atmo">ATMOSPHERE</button>
        <button class="tc-tab" id="dc-tab-clouds" data-tab="clouds">CLOUDS</button>
      </div>

      <!-- ── ATMOSPHERE TAB ── -->
      <div class="tc-tab-pane" id="dc-tabpane-atmo">
        <div class="pt-panel">

          <div class="pt-section">Output Size</div>
          ${_row('dc-outW', 'Width', 128, 4096, 128, 1024, v => v + ' px')}
          ${_row('dc-outH', 'Height', 64, 1024, 32, 256, v => v + ' px')}

          <div class="pt-section">Dayside</div>
          ${_colorPairRow('Color', 'dc-dayColor', 'dc-dayColorBot', '#4da6ff', '#ffe0b0')}
          ${_row('dc-dayWidth', 'Half-width (% of texture)', 5, 48, 1, 25, v => v + '%')}

          <div class="pt-section">Dawn / Dusk</div>
          ${_colorPairRow('Color', 'dc-duskColor', 'dc-duskColorBot', '#ff7030', '#ff9a50')}
          ${_row('dc-duskWidth', 'Transition width', 2, 40, 1, 14, v => v + '%')}
          ${_row('dc-duskOpacity', 'Intermediate opacity', 0, 1, 0.01, 1.0, v => parseFloat(v).toFixed(2))}

          <div class="pt-section">Atmosphere Shape</div>
          ${_row('dc-bend', 'Vertical curve (bend)', 0, 1, 0.01, 0.35, v => parseFloat(v).toFixed(2))}
          ${_row('dc-topFade', 'Top fade (transparency)', 0, 1, 0.01, 0.55, v => parseFloat(v).toFixed(2))}
          ${_row('dc-botBoost', 'Bottom brightness boost', 0, 1, 0.01, 0.4, v => parseFloat(v).toFixed(2))}
          ${_row('dc-opacity', 'Overall opacity', 0.1, 1, 0.01, 0.9, v => parseFloat(v).toFixed(2))}

        </div>
      </div>

      <!-- ── CLOUDS TAB ── -->
      <div class="tc-tab-pane" id="dc-tabpane-clouds" style="display:none">
        <div class="pt-panel">

          <div class="pt-section">Cloud Texture Source</div>
          <div class="dc-cloud-source-row">
            <button class="tc-load-btn" id="dc-cloud-upload-btn">⬆ Upload texture</button>
            <button class="tc-load-btn" id="dc-cloud-builtin-btn">Use built-in</button>
            <input type="file" id="dc-cloud-file-input" accept="image/*" style="display:none">
          </div>
          <div class="dc-cloud-source-label" id="dc-cloud-source-label">Using: built-in Earth clouds</div>

          <div class="pt-section">Global Cloud Settings</div>
          <div class="pt-row">
            <div class="pt-row-label"><span>Tint color</span></div>
            <input type="color" class="tc-color-swatch" id="dc-cloudTint" value="#ffffff">
          </div>
          ${_row('dc-cloudBlur', 'Blur radius (px)', 0, 20, 0.5, 0, v => parseFloat(v).toFixed(1))}
          <div class="pt-row">
            <div class="pt-row-label"><span>H repeats</span></div>
            <input type="number" class="dc-num-input" id="dc-cloudRepeat" min="1" max="32" step="1" value="1">
          </div>
          ${_row('dc-cloudGlobalOpacity', 'Global opacity', 0, 1, 0.01, 0.85, v => parseFloat(v).toFixed(2))}
          ${_row('dc-cloudY', 'Vertical position (% from top)', 0, 100, 1, 35, v => v + '%')}
          ${_row('dc-cloudVScale', 'Vertical scale', 10, 200, 1, 60, v => v + '%')}
          ${_row('dc-cloudOffsetX', 'Horizontal offset (wraps)', 0, 100, 1, 0, v => v + '%')}
          ${_row('dc-cloudHScale', 'Horizontal scale', 20, 300, 1, 100, v => v + '%')}
          ${_row('dc-cloudThresh', 'Brightness threshold', 0, 200, 1, 30, v => v)}
          ${_row('dc-cloudSoft', 'Edge softness', 0, 150, 1, 60, v => v)}
          ${_row('dc-cloudNightDim', 'Night side dimming', 0, 1, 0.01, 0.08, v => parseFloat(v).toFixed(2))}

          <div class="pt-section">Cloud Layers</div>
          <div id="dc-cloud-layers"></div>
          <button class="dc-add-layer-btn" id="dc-add-layer">+ Add layer</button>
          <p class="dc-hint">Each layer samples the same texture at a different offset / scale / opacity.</p>

        </div>
      </div>
    </div>

    <div class="tc-canvas-area">
      <div class="tc-canvas-label"><span id="dc-status">1024 × 256 px</span></div>
      <div class="tc-canvas-wrap">
        <canvas id="dc-editor-canvas" class="tc-editor-canvas"></canvas>
      </div>
      <div class="tc-info-bar">Transparent = night · Center = dayside · curve corrects on sphere · clouds composited on top of atmosphere</div>
    </div>
  </div>
</div>`;

    const ov = document.createElement('div');
    ov.id = 'dc-overlay';
    ov.className = 'tc-overlay';
    ov.innerHTML = html;
    document.body.appendChild(ov);

    _el.overlay        = ov;
    _el.editorCanvas    = ov.querySelector('#dc-editor-canvas');
    _el.status          = ov.querySelector('#dc-status');
    _el.cloudLayers      = ov.querySelector('#dc-cloud-layers');
    _el.cloudSourceLabel = ov.querySelector('#dc-cloud-source-label');

    _sizeCanvases();

    // ── Slider / color / number bindings — regenerate + relabel on input ──
    ov.querySelectorAll('input[type=range]').forEach(el => {
      if (el.dataset.lid) return; // layer sliders bound separately in _buildLayerUI
      _updateRangeFill(el);
      el.addEventListener('input', () => {
        _updateRangeFill(el);
        const lbl = ov.querySelector('#' + el.id + '-val');
        if (lbl) lbl.textContent = _fmtFor(el.id, el.value);

        // Output size sliders resize the offscreen buffer + display canvas
        if (el.id === 'dc-outW' || el.id === 'dc-outH') {
          TEX_W = parseInt(_v('dc-outW'));
          TEX_H = parseInt(_v('dc-outH'));
          _initDrawCanvas();
          _sizeCanvases();
        }

        _refresh();
      });
    });
    ov.querySelectorAll('input[type=color]').forEach(el => {
      el.addEventListener('input', () => _refresh());
    });
    const repeatInput = ov.querySelector('#dc-cloudRepeat');
    if (repeatInput) repeatInput.addEventListener('input', () => _refresh());

    // ── Tab switching ──
    const _tabs = { atmo: ov.querySelector('#dc-tabpane-atmo'), clouds: ov.querySelector('#dc-tabpane-clouds') };
    ov.querySelectorAll('.tc-tab').forEach(btn => {
      btn.onclick = () => {
        ov.querySelectorAll('.tc-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const which = btn.dataset.tab;
        Object.entries(_tabs).forEach(([k, el]) => { el.style.display = k === which ? '' : 'none'; });
      };
    });

    // ── Cloud source events ──
    ov.querySelector('#dc-cloud-builtin-btn').onclick = () => _loadCloudImage(CLOUD_BUILTIN, 'built-in Earth clouds');
    ov.querySelector('#dc-cloud-upload-btn').onclick = () => ov.querySelector('#dc-cloud-file-input').click();
    ov.querySelector('#dc-cloud-file-input').onchange = e => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => _loadCloudImage(ev.target.result, f.name);
      reader.readAsDataURL(f);
    };

    // ── Cloud layers ──
    ov.querySelector('#dc-add-layer').onclick = () => {
      cloudLayers.push({ id: nextLayerId++, offsetX: Math.round(Math.random() * 80), offsetY: 0, hScale: 100, vScale: 100, opacity: 0.7 });
      _buildLayerUI();
      _refresh();
    };
    _buildLayerUI();

    // ── Header actions ──
    ov.querySelector('#dc-close').onclick  = () => close();
    ov.querySelector('#dc-export').onclick = () => _exportTexture();
    ov.querySelector('#dc-copy').onclick   = () => _copyToClipboard();

    // ── Resize handling ──
    window._dcResizeHandler = () => { _sizeCanvases(); _refresh(); };
    window.addEventListener('resize', window._dcResizeHandler);

    // Load built-in cloud texture by default
    _loadCloudImage(CLOUD_BUILTIN, 'built-in Earth clouds');
  }

  // Per-id label formatters (mirrors the fmt fn baked into each _row() call)
  const _fmtMap = {
    'dc-outW': v => v + ' px', 'dc-outH': v => v + ' px',
    'dc-dayWidth': v => v + '%', 'dc-duskWidth': v => v + '%',
    'dc-duskOpacity': v => parseFloat(v).toFixed(2),
    'dc-bend': v => parseFloat(v).toFixed(2), 'dc-topFade': v => parseFloat(v).toFixed(2),
    'dc-botBoost': v => parseFloat(v).toFixed(2), 'dc-opacity': v => parseFloat(v).toFixed(2),
    'dc-cloudBlur': v => parseFloat(v).toFixed(1),
    'dc-cloudGlobalOpacity': v => parseFloat(v).toFixed(2),
    'dc-cloudY': v => v + '%', 'dc-cloudVScale': v => v + '%',
    'dc-cloudOffsetX': v => v + '%', 'dc-cloudHScale': v => v + '%',
    'dc-cloudThresh': v => v, 'dc-cloudSoft': v => v,
    'dc-cloudNightDim': v => parseFloat(v).toFixed(2),
  };
  function _fmtFor(id, v) { return _fmtMap[id] ? _fmtMap[id](v) : v; }

  // ── Public API ─────────────────────────────────────────────────────
  function open() {
    if (!_el.overlay) _build();
    _open = true;
    _el.overlay.classList.add('open');
    requestAnimationFrame(() => { _sizeCanvases(); _refresh(); });
  }

  function close() {
    _open = false;
    if (_el.overlay) _el.overlay.classList.remove('open');
  }

  return { open, close };
})();
