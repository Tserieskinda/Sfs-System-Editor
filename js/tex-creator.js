// ════════════════════════════════════════════════════════════════════
//  TEXTURE CREATOR  —  Atmosphere Texture Editor
// ════════════════════════════════════════════════════════════════════

const TC = (() => {

  // ── State ──────────────────────────────────────────────────────────
  let _open       = false;
  let _mode       = 'canvas';   // 'canvas' | 'preview'
  let _activeTool = 'gradient'; // 'gradient' | 'brush' | 'eraser' (future)

  // Canvas size: atmosphere textures are typically wide × tall
  // These are mutable — updated when user changes resolution
  let TEX_W = 256;
  let TEX_H = 64;

  // Gradient editor state
  let _gradients   = [];   // array of gradient objects
  let _activeGrad  = -1;  // index into _gradients
  let _baseTexture = null; // offscreen canvas: loaded texture used as base layer under gradients

  // Offscreen draw canvas (the actual texture data)
  let _drawCanvas = null;
  let _drawCtx    = null;

  // Preview pan/zoom state
  let _pvZoom      = 1;
  let _pvPanX      = 0;
  let _pvPanY      = 0;
  let _pvAtmoScale = 1.45; // atmoR = planetR * _pvAtmoScale

  // DOM refs
  let _el = {}; // populated in init()

  // ── Gradient object factory ────────────────────────────────────────
  function _newGradient(opts = {}){
    return {
      id:        Date.now() + Math.random(),
      name:      opts.name || 'Gradient',
      type:      opts.type  || 'linear-v',   // 'linear-v'|'linear-h'|'radial'
      blendMode: opts.blend || 'normal',       // 'normal'|'add'|'multiply'
      opacity:   opts.opacity ?? 1,
      stops: opts.stops || [
        { pos: 0,   color: '#00aaff', alpha: 0 },
        { pos: 0.5, color: '#33bbff', alpha: 0.6 },
        { pos: 1,   color: '#66ddff', alpha: 1 }
      ]
    };
  }

  // ── Build offscreen canvas ─────────────────────────────────────────
  function _initDrawCanvas(){
    _drawCanvas = document.createElement('canvas');
    _drawCanvas.width  = TEX_W;
    _drawCanvas.height = TEX_H;
    _drawCtx = _drawCanvas.getContext('2d');
    // Start transparent
    _drawCtx.clearRect(0, 0, TEX_W, TEX_H);
  }

  // ── Compose all gradients onto the draw canvas ─────────────────────
  function _composeGradients(){
    _drawCtx.clearRect(0, 0, TEX_W, TEX_H);
    // Draw base texture first (loaded image sits under all gradient layers)
    if(_baseTexture){
      _drawCtx.globalCompositeOperation = 'source-over';
      _drawCtx.globalAlpha = 1;
      _drawCtx.drawImage(_baseTexture, 0, 0, TEX_W, TEX_H);
    }
    if(_gradients.length === 0){ _drawCtx.globalCompositeOperation = 'source-over'; return; }

    for(const g of _gradients){
      const tmpC = document.createElement('canvas');
      tmpC.width = TEX_W; tmpC.height = TEX_H;
      const tmpX = tmpC.getContext('2d');

      let grd;
      if(g.type === 'linear-v'){
        grd = tmpX.createLinearGradient(0, 0, 0, TEX_H);
      } else if(g.type === 'linear-h'){
        grd = tmpX.createLinearGradient(0, 0, TEX_W, 0);
      } else {
        grd = tmpX.createRadialGradient(TEX_W/2, TEX_H/2, 0, TEX_W/2, TEX_H/2, TEX_W/2);
      }

      for(const s of g.stops){
        const hex = s.color;
        const r   = parseInt(hex.slice(1,3),16);
        const gv  = parseInt(hex.slice(3,5),16);
        const b   = parseInt(hex.slice(5,7),16);
        grd.addColorStop(s.pos, `rgba(${r},${gv},${b},${s.alpha})`);
      }

      tmpX.globalAlpha = g.opacity;
      tmpX.fillStyle = grd;
      tmpX.fillRect(0, 0, TEX_W, TEX_H);

      const op = g.blendMode === 'add' ? 'lighter'
                : g.blendMode === 'multiply' ? 'multiply'
                : 'source-over';
      _drawCtx.globalCompositeOperation = op;
      _drawCtx.globalAlpha = 1;
      _drawCtx.drawImage(tmpC, 0, 0);
    }
    _drawCtx.globalCompositeOperation = 'source-over';
  }

  // ── Render the editor canvas (scaled view) ─────────────────────────
  function _renderEditorCanvas(){
    const cv = _el.editorCanvas;
    if(!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);

    // Checkerboard bg
    const sz = 10;
    for(let y = 0; y < cv.height; y += sz){
      for(let x = 0; x < cv.width; x += sz){
        ctx.fillStyle = ((x/sz + y/sz) % 2 === 0) ? '#222228' : '#1a1a1e';
        ctx.fillRect(x, y, sz, sz);
      }
    }

    // Draw the texture scaled to fit
    ctx.imageSmoothingEnabled = false;
    if(_drawCanvas) ctx.drawImage(_drawCanvas, 0, 0, cv.width, cv.height);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const colW = cv.width / 8;
    for(let i = 1; i < 8; i++){
      ctx.beginPath(); ctx.moveTo(i*colW, 0); ctx.lineTo(i*colW, cv.height); ctx.stroke();
    }
    const rowH = cv.height / 4;
    for(let i = 1; i < 4; i++){
      ctx.beginPath(); ctx.moveTo(0, i*rowH); ctx.lineTo(cv.width, i*rowH); ctx.stroke();
    }
  }

  // ── Render the preview (atmosphere disc) with pan/zoom ────────────
  function _renderPreview(){
    const cv = _el.previewCanvas;
    if(!cv || !_drawCanvas) return;
    const ctx  = cv.getContext('2d');
    const W    = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    // Starfield bg (fixed, not affected by pan/zoom)
    ctx.fillStyle = '#090912';
    ctx.fillRect(0, 0, W, H);
    for(let i=0;i<120;i++){
      const sx = (Math.sin(i*137.5)*0.5+0.5)*W;
      const sy = (Math.cos(i*97.1)*0.5+0.5)*H;
      ctx.globalAlpha = (Math.sin(i*73.1)*0.3+0.4);
      ctx.fillStyle='#ffffff';
      ctx.beginPath(); ctx.arc(sx,sy,Math.sin(i*53.7)*0.4+0.5,0,Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha=1;

    // Planet center with pan/zoom applied
    const basePlanetR = Math.min(W, H) * 0.22;
    const planetR = basePlanetR * _pvZoom;
    const atmoR   = planetR * _pvAtmoScale;
    const cx = W/2 + _pvPanX;
    const cy = H/2 + _pvPanY;

    // Build polar warp from texture
    const srcX  = _drawCanvas.getContext('2d');
    const srcD  = srcX.getImageData(0, 0, TEX_W, TEX_H).data;
    const SW = TEX_W, SH = TEX_H;

    const SZ = 256;
    const pC  = document.createElement('canvas');
    pC.width = SZ; pC.height = SZ;
    const pX  = pC.getContext('2d');
    const outD = pX.createImageData(SZ, SZ);
    const od   = outD.data;
    const half = SZ / 2;
    const innerFracC = Math.min(0.999, 1 / _pvAtmoScale);

    // Pre-sample innermost row (surface colour)
    let ir=0,ig=0,ib=0,ia=255;
    {
      const row = SH - 1;
      let rs=0,gs=0,bs=0,as_=0,cnt=0;
      for(let ix=0;ix<SW;ix++){
        const ii=(row*SW+ix)*4;
        rs+=srcD[ii];gs+=srcD[ii+1];bs+=srcD[ii+2];as_+=srcD[ii+3];cnt++;
      }
      ir=rs/cnt+.5|0;ig=gs/cnt+.5|0;ib=bs/cnt+.5|0;ia=as_/cnt+.5|0;
    }

    for(let py=0;py<SZ;py++){
      for(let ppx=0;ppx<SZ;ppx++){
        const dx=ppx-half, dy=py-half;
        const dist=Math.sqrt(dx*dx+dy*dy);
        const radFrac=dist/half;
        const oi=(py*SZ+ppx)*4;
        if(radFrac>1.0){od[oi+3]=0;continue;}
        if(radFrac<=innerFracC){
          od[oi]=ir;od[oi+1]=ig;od[oi+2]=ib;od[oi+3]=ia;continue;
        }
        let cwAngle=Math.atan2(dy,dx)/(Math.PI*2);
        if(cwAngle<0) cwAngle+=1;
        const u=(1-cwAngle)%1;
        const t=(radFrac-innerFracC)/(1-innerFracC);
        const texRowF=(1-t)*(SH-1);
        const sx=Math.min(SW-1,Math.max(0,Math.round(u*(SW-1))));
        const sy0=Math.min(SH-1,Math.max(0,Math.floor(texRowF)));
        const sy1=Math.min(SH-1,sy0+1);
        const fy=texRowF-sy0;
        const si0=(sy0*SW+sx)*4;
        const si1=(sy1*SW+sx)*4;
        od[oi]  =srcD[si0]  +(srcD[si1]  -srcD[si0]  )*fy+.5|0;
        od[oi+1]=srcD[si0+1]+(srcD[si1+1]-srcD[si0+1])*fy+.5|0;
        od[oi+2]=srcD[si0+2]+(srcD[si1+2]-srcD[si0+2])*fy+.5|0;
        od[oi+3]=srcD[si0+3]+(srcD[si1+3]-srcD[si0+3])*fy+.5|0;
      }
    }
    pX.putImageData(outD, 0, 0);

    // Planet surface (behind atmo)
    // Sample the bottom-center pixel of the texture to get the surface color
    // (bottom row = planet surface level in the atmosphere texture)
    const surfSample = _drawCtx.getImageData(Math.floor(TEX_W / 2), TEX_H - 1, 1, 1).data;
    const sR = surfSample[0], sG = surfSample[1], sB = surfSample[2];
    // Derive a darker midtone and a deeper shadow from the sampled color
    // midtone: 55% brightness, shadow: 18% brightness, both desaturated slightly toward grey
    const toMid   = (c) => Math.round(c * 0.55);
    const toShade = (c) => Math.round(c * 0.18);
    const midCol   = `rgb(${toMid(sR)},${toMid(sG)},${toMid(sB)})`;
    const shadeCol = `rgb(${toShade(sR)},${toShade(sG)},${toShade(sB)})`;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    const surfGrd = ctx.createRadialGradient(cx-planetR*.2, cy-planetR*.2, 0, cx, cy, planetR);
    surfGrd.addColorStop(0, midCol);
    surfGrd.addColorStop(1, shadeCol);
    ctx.fillStyle = surfGrd;
    ctx.fill();
    ctx.restore();

    // Atmosphere disc
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, atmoR, 0, Math.PI*2);
    ctx.clip();
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(pC, cx-atmoR, cy-atmoR, atmoR*2, atmoR*2);
    ctx.restore();

    // Planet surface on top
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    ctx.clip();
    const surf2 = ctx.createRadialGradient(cx-planetR*.2, cy-planetR*.2, 0, cx, cy, planetR);
    surf2.addColorStop(0, midCol);
    surf2.addColorStop(1, shadeCol);
    ctx.fillStyle = surf2;
    ctx.fill();
    ctx.restore();

    // Limb highlight
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1; ctx.stroke();
    ctx.restore();
  }

  // ── Seamless solar flare generator (standalone texture) ──────────
  function _generateFlares(opts = {}){
    const count      = opts.count      ?? 16;
    const color      = opts.color      ?? '#ffffff';
    const bgColor    = opts.bgColor    ?? '#000000';
    const bgAlpha    = opts.bgAlpha    ?? 0;
    const minW       = opts.minW       ?? 0.02;
    const maxW       = opts.maxW       ?? 0.07;
    const softness   = opts.softness   ?? 2.5;  // horizontal edge sharpness
    const bright     = opts.bright     ?? 0.85;
    const seed       = opts.seed       ?? 42;
    // baseH: fraction of texture height occupied by the solid base glow band
    const baseH      = opts.baseH      ?? 0.18;
    // flareReach: max height a flare can reach (fraction from bottom, <=1)
    const flareReach = opts.flareReach ?? 0.88;

    // Seedable RNG (mulberry32)
    let _s = (seed * 0x9e3779b9) >>> 0;
    const rng = () => {
      _s += 0x6D2B79F5; let t=_s;
      t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61);
      return ((t^t>>>14)>>>0)/0xffffffff;
    };

    const hr = parseInt(color.slice(1,3),16);
    const hg = parseInt(color.slice(3,5),16);
    const hb = parseInt(color.slice(5,7),16);
    const br = parseInt(bgColor.slice(1,3),16);
    const bg = parseInt(bgColor.slice(3,5),16);
    const bb = parseInt(bgColor.slice(5,7),16);

    // Fresh pixel buffer for the entire texture
    _drawCtx.clearRect(0, 0, TEX_W, TEX_H);
    const fd = _drawCtx.createImageData(TEX_W, TEX_H);
    const fpx = fd.data;

    // Fill background
    for(let i = 0; i < TEX_W * TEX_H; i++){
      fpx[i*4]   = br; fpx[i*4+1] = bg; fpx[i*4+2] = bb;
      fpx[i*4+3] = Math.round(bgAlpha * 255);
    }

    // Build flares — all root at the bottom, taper to a point as they rise
    const flares = [];
    for(let fi = 0; fi < count; fi++){
      const baseW = minW + rng() * (maxW - minW);
      // Each flare reaches a random height: at least baseH, up to flareReach
      const height = baseH + rng() * (flareReach - baseH);
      flares.push({
        cx:     rng(),          // 0..1 horizontal center (wrapping)
        baseHW: baseW * 0.5,    // half-width at the base (bottom)
        tipHW:  baseW * 0.03,   // half-width at the tip — very narrow
        height,                 // how far up (yFromBottom fraction) this flare goes
        peak:   0.5 + rng() * (bright - 0.5),
      });
    }

    for(let py = 0; py < TEX_H; py++){
      // y=0=top (outer edge), y=TEX_H-1=bottom (surface)
      const yFrac       = py / (TEX_H - 1); // 0=top, 1=bottom
      const yFromBottom = 1 - yFrac;         // 0=bottom, 1=top

      // Base band: the solid corona ring that all flares emerge from.
      // Bright at the surface, fades to nothing at baseH height.
      const baseT    = Math.min(1, yFromBottom / baseH);
      const baseBand = yFromBottom < baseH
        ? Math.pow(1 - baseT, 1.0) * bright
        : 0;

      for(let px = 0; px < TEX_W; px++){
        const xFrac = px / TEX_W;
        // Start with base band contribution (fills full width)
        let colR = hr * baseBand;
        let colG = hg * baseBand;
        let colB = hb * baseBand;
        let colA = baseBand * 255;

        for(const f of flares){
          // Flare only exists between bottom and its tip height
          if(yFromBottom > f.height) continue;

          // t: 0=base(bottom), 1=tip(top of flare)
          const t = yFromBottom / f.height;

          // Width: wide spreading root at t=0 (merges into base band),
          // tapers to a sharp point at the tip via a quadratic curve.
          // rootFoot makes the flare base wide enough to blend with the band.
          const rootFoot = f.baseHW * 3.5;
          const hw = rootFoot * Math.pow(1 - t, 2.2) + f.tipHW * t;

          // Edge softness: very soft/diffuse near the base (blends into band),
          // sharper near the tip (defined spike appearance).
          const edgePow = softness * (0.25 + 0.75 * t);

          // Vertical brightness: full at base, fades toward tip
          const yEnv = Math.pow(1 - t, 1.4);

          // Wrapped horizontal distance
          let dx = Math.abs(xFrac - f.cx);
          if(dx > 0.5) dx = 1 - dx;
          if(dx >= hw) continue;

          const xEnv = Math.max(0, 1 - dx / hw);
          const xVal = Math.pow(xEnv, edgePow);

          const val = f.peak * xVal * yEnv;
          if(val <= 0) continue;

          // Additive blend across flares
          colR = Math.min(255, colR + hr * val);
          colG = Math.min(255, colG + hg * val);
          colB = Math.min(255, colB + hb * val);
          colA = Math.min(255, colA + val * 255);
        }

        if(colA > 0){
          const oi = (py * TEX_W + px) * 4;
          // Blend over bg using "over" compositing
          const fa = colA / 255;
          const ba = fpx[oi+3] / 255;
          const outA = fa + ba * (1 - fa);
          if(outA > 0){
            fpx[oi]   = Math.round((colR * fa + fpx[oi]   * ba * (1-fa)) / outA);
            fpx[oi+1] = Math.round((colG * fa + fpx[oi+1] * ba * (1-fa)) / outA);
            fpx[oi+2] = Math.round((colB * fa + fpx[oi+2] * ba * (1-fa)) / outA);
            fpx[oi+3] = Math.round(outA * 255);
          }
        }
      }
    }

    _drawCtx.putImageData(fd, 0, 0);
  }

  // ── Refresh both views ─────────────────────────────────────────────
  function _refresh(){
    _composeGradients();
    if(_mode === 'canvas') _renderEditorCanvas();
    else _renderPreview();
  }

  // ── Gradient list UI ───────────────────────────────────────────────
  function _renderGradientList(){
    const list = _el.gradList;
    if(!list) return;
    list.innerHTML = '';

    _gradients.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'tc-grad-row' + (i === _activeGrad ? ' active' : '');
      row.dataset.idx = i;

      // Mini preview
      const thumb = document.createElement('canvas');
      thumb.className = 'tc-grad-thumb';
      thumb.width = 80; thumb.height = 16;
      _drawGradThumb(thumb, g);

      const label = document.createElement('span');
      label.className = 'tc-grad-label';
      label.textContent = g.name;
      label.contentEditable = true;
      label.spellcheck = false;
      label.oninput = () => { g.name = label.textContent; };

      const del = document.createElement('button');
      del.className = 'tc-grad-del';
      del.innerHTML = '✕';
      del.title = 'Remove gradient';
      del.onclick = e => { e.stopPropagation(); _gradients.splice(i,1); if(_activeGrad>=_gradients.length) _activeGrad=_gradients.length-1; _renderGradientList(); _renderStopEditor(); _refresh(); };

      row.appendChild(thumb);
      row.appendChild(label);
      row.appendChild(del);
      row.onclick = () => { _activeGrad = i; _renderGradientList(); _renderStopEditor(); };
      list.appendChild(row);
    });

    if(_gradients.length === 0){
      list.innerHTML = '<p class="tc-empty-hint">No gradients yet.<br>Click + to add one.</p>';
    }
  }

  function _drawGradThumb(canvas, g){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // Checkerboard
    for(let x=0;x<W;x+=8) for(let y=0;y<H;y+=8){
      ctx.fillStyle=((x/8+y/8)%2===0)?'#333':'#222';
      ctx.fillRect(x,y,8,8);
    }
    let grd;
    if(g.type==='linear-v') grd=ctx.createLinearGradient(0,0,0,H);
    else if(g.type==='linear-h') grd=ctx.createLinearGradient(0,0,W,0);
    else grd=ctx.createRadialGradient(W/2,H/2,0,W/2,H/2,W/2);
    for(const s of g.stops){
      const hex=s.color;
      const r=parseInt(hex.slice(1,3),16),gv=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      grd.addColorStop(s.pos,`rgba(${r},${gv},${b},${s.alpha})`);
    }
    ctx.globalAlpha=g.opacity;
    ctx.fillStyle=grd;
    ctx.fillRect(0,0,W,H);
  }

  // ── Stop editor ───────────────────────────────────────────────────
  function _renderStopEditor(){
    const panel = _el.stopPanel;
    if(!panel) return;
    panel.innerHTML = '';

    if(_activeGrad < 0 || _activeGrad >= _gradients.length){
      panel.innerHTML = '<p class="tc-empty-hint" style="padding:12px">Select a gradient to edit its stops.</p>';
      return;
    }
    const g = _gradients[_activeGrad];

    // ── Gradient type & blend ──
    const headRow = document.createElement('div');
    headRow.className = 'tc-stop-head';
    headRow.innerHTML = `
      <div class="tc-field-row">
        <label>TYPE</label>
        <select class="tc-sel" id="tc-type-sel">
          <option value="linear-v" ${g.type==='linear-v'?'selected':''}>Linear Vertical</option>
          <option value="linear-h" ${g.type==='linear-h'?'selected':''}>Linear Horizontal</option>
          <option value="radial"   ${g.type==='radial'  ?'selected':''}>Radial</option>
        </select>
      </div>
      <div class="tc-field-row">
        <label>BLEND</label>
        <select class="tc-sel" id="tc-blend-sel">
          <option value="normal"   ${g.blendMode==='normal'  ?'selected':''}>Normal</option>
          <option value="add"      ${g.blendMode==='add'     ?'selected':''}>Add</option>
          <option value="multiply" ${g.blendMode==='multiply'?'selected':''}>Multiply</option>
        </select>
      </div>
      <div class="tc-field-row">
        <label>OPACITY</label>
        <input type="range" class="tc-range" id="tc-op-range" min="0" max="1" step="0.01" value="${g.opacity}">
        <span class="tc-range-val" id="tc-op-val">${Math.round(g.opacity*100)}%</span>
      </div>`;
    panel.appendChild(headRow);

    headRow.querySelector('#tc-type-sel').onchange = e => { g.type=e.target.value; _renderGradientList(); _refresh(); };
    headRow.querySelector('#tc-blend-sel').onchange = e => { g.blendMode=e.target.value; _refresh(); };
    const opR = headRow.querySelector('#tc-op-range');
    const opV = headRow.querySelector('#tc-op-val');
    opR.oninput = () => { g.opacity=parseFloat(opR.value); opV.textContent=Math.round(g.opacity*100)+'%'; _refresh(); };

    // ── Visual gradient bar (draggable stops) ──
    const barWrap = document.createElement('div');
    barWrap.className = 'tc-grad-bar-wrap';
    const bar = document.createElement('canvas');
    bar.className = 'tc-grad-bar';
    bar.style.width = '100%';
    bar.style.height = '28px';
    bar.width = 400; bar.height = 28;
    barWrap.appendChild(bar);
    panel.appendChild(barWrap);
    requestAnimationFrame(() => {
      const bw = bar.offsetWidth;
      if(bw > 0){ bar.width = bw; _drawGradBar(bar, g); }
    });
    _drawGradBar(bar, g);

    // Drag state for stop handles
    let _dragStop = null;
    const _getStopAtX = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const x = (clientX - rect.left) * (bar.width / rect.width);
      const HIT = 10;
      for(let si = 0; si < g.stops.length; si++){
        const sx = g.stops[si].pos * bar.width;
        if(Math.abs(x - sx) < HIT) return si;
      }
      return -1;
    };
    const _onBarDown = (clientX) => {
      const si = _getStopAtX(clientX);
      if(si >= 0){ _dragStop = si; bar.style.cursor = 'grabbing'; }
    };
    const _onBarMove = (clientX) => {
      if(_dragStop === null) return;
      const rect = bar.getBoundingClientRect();
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos));
      g.stops[_dragStop].pos = pos;
      g.stops.sort((a,b)=>a.pos-b.pos);
      _drawGradBar(bar, g);
      // Update pos sliders in stop rows
      panel.querySelectorAll('.tc-stop-row').forEach((row, ri) => {
        const pr = row.querySelector('input[type=range]:first-of-type');
        const pv = row.querySelectorAll('.tc-range-val')[0];
        if(pr){ pr.value = g.stops[ri].pos; }
        if(pv){ pv.textContent = Math.round(g.stops[ri].pos*100)+'%'; }
      });
      _refresh();
    };
    const _onBarUp = () => { _dragStop = null; bar.style.cursor = ''; };

    bar.style.cursor = 'default';
    bar.addEventListener('mousedown',  e => { e.preventDefault(); _onBarDown(e.clientX); });
    bar.addEventListener('touchstart', e => { _onBarDown(e.touches[0].clientX); }, {passive:true});
    window.addEventListener('mousemove',  e => { if(_dragStop !== null) _onBarMove(e.clientX); });
    window.addEventListener('touchmove',  e => { if(_dragStop !== null){ e.preventDefault(); _onBarMove(e.touches[0].clientX); } }, {passive:false});
    window.addEventListener('mouseup',  _onBarUp);
    window.addEventListener('touchend', _onBarUp);

    // ── Stop list ──
    const stopsWrap = document.createElement('div');
    stopsWrap.className = 'tc-stops-wrap';

    const stopsTitle = document.createElement('div');
    stopsTitle.className = 'tc-stops-title';
    stopsTitle.innerHTML = `<span>COLOR STOPS</span><button class="tc-add-stop" title="Add stop">＋</button>`;
    stopsTitle.querySelector('.tc-add-stop').onclick = () => {
      g.stops.push({ pos: 0.5, color: '#ffffff', alpha: 0.5 });
      g.stops.sort((a,b)=>a.pos-b.pos);
      _renderStopEditor(); _refresh();
    };
    stopsWrap.appendChild(stopsTitle);

    g.stops.forEach((stop, si) => {
      const row = document.createElement('div');
      row.className = 'tc-stop-row';

      // Color swatch + picker
      const swatch = document.createElement('input');
      swatch.type = 'color';
      swatch.className = 'tc-color-swatch';
      swatch.value = stop.color;
      swatch.oninput = () => { stop.color=swatch.value; _drawGradBar(bar,g); _renderGradientList(); _refresh(); };

      // Position slider
      const posLbl = document.createElement('span');
      posLbl.className = 'tc-stop-lbl';
      posLbl.textContent = 'POS';
      const posR = document.createElement('input');
      posR.type='range'; posR.className='tc-range tc-range-sm';
      posR.min=0; posR.max=1; posR.step=0.01; posR.value=stop.pos;
      const posV = document.createElement('span');
      posV.className='tc-range-val';
      posV.textContent=Math.round(stop.pos*100)+'%';
      posR.oninput = () => { stop.pos=parseFloat(posR.value); posV.textContent=Math.round(stop.pos*100)+'%'; g.stops.sort((a,b)=>a.pos-b.pos); _drawGradBar(bar,g); _refresh(); };

      // Alpha slider
      const aLbl = document.createElement('span');
      aLbl.className = 'tc-stop-lbl';
      aLbl.textContent = 'ALPHA';
      const alphaR = document.createElement('input');
      alphaR.type='range'; alphaR.className='tc-range tc-range-sm';
      alphaR.min=0; alphaR.max=1; alphaR.step=0.01; alphaR.value=stop.alpha;
      const alphaV = document.createElement('span');
      alphaV.className='tc-range-val';
      alphaV.textContent=Math.round(stop.alpha*100)+'%';
      alphaR.oninput = () => { stop.alpha=parseFloat(alphaR.value); alphaV.textContent=Math.round(stop.alpha*100)+'%'; _drawGradBar(bar,g); _refresh(); };

      const del = document.createElement('button');
      del.className='tc-stop-del'; del.innerHTML='✕'; del.title='Remove stop';
      del.onclick=()=>{ if(g.stops.length<=2) return; g.stops.splice(si,1); _renderStopEditor(); _refresh(); };

      row.appendChild(swatch);
      row.appendChild(posLbl); row.appendChild(posR); row.appendChild(posV);
      row.appendChild(aLbl);   row.appendChild(alphaR); row.appendChild(alphaV);
      row.appendChild(del);
      stopsWrap.appendChild(row);
    });

    panel.appendChild(stopsWrap);
  }

  function _drawGradBar(canvas, g){
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // Checker
    for(let x=0;x<W;x+=8) for(let y=0;y<H;y+=8){
      ctx.fillStyle=((x/8+y/8)%2===0)?'#2a2a30':'#202025';
      ctx.fillRect(x,y,8,8);
    }
    const grd = ctx.createLinearGradient(0,0,W,0);
    for(const s of g.stops){
      const hex=s.color;
      const r=parseInt(hex.slice(1,3),16),gv=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      grd.addColorStop(s.pos,`rgba(${r},${gv},${b},${s.alpha})`);
    }
    ctx.fillStyle=grd;
    ctx.fillRect(0,0,W,H);
    // Stop markers — larger handles for easy dragging
    for(const s of g.stops){
      const x = s.pos * W;
      ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
      // Outer ring
      ctx.fillStyle='rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(x,H/2,7,0,Math.PI*2); ctx.fill();
      // Inner fill with stop color
      ctx.fillStyle=s.color;
      ctx.beginPath(); ctx.arc(x,H/2,5,0,Math.PI*2); ctx.fill();
      // White border
      ctx.strokeStyle='rgba(255,255,255,0.85)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(x,H/2,5,0,Math.PI*2); ctx.stroke();
    }
  }

  // ── Load texture card ──────────────────────────────────────────────
  function _populateLoadList(filter){
    const card = _el.loadCard;
    if(!card) return;
    const list = card.querySelector('#tc-load-list');
    list.innerHTML = '';
    const allTextures = (typeof assets !== 'undefined') ? assets.textures : [];

    // Sort: Atmo-named first, then alphabetical
    const sorted = [...allTextures].sort((a, b) => {
      const aA = /atmo/i.test(a.name), bA = /atmo/i.test(b.name);
      if(aA !== bA) return aA ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // Apply filter
    const q = (filter || '').trim().toLowerCase();
    const filtered = q ? sorted.filter(t => t.name.toLowerCase().includes(q)) : sorted;

    if(filtered.length === 0){
      list.innerHTML = '<p class="tc-empty-hint">' + (allTextures.length === 0 ? 'No textures loaded.<br>Upload one below.' : 'No matches.') + '</p>';
    } else {
      filtered.forEach(t => {
        const row = document.createElement('div');
        row.className = 'tc-load-row';
        const thumb = document.createElement('img');
        thumb.src = t.url; thumb.className = 'tc-load-thumb';
        const name = document.createElement('span');
        name.textContent = t.name;
        const pick = document.createElement('button');
        pick.className = 'tc-load-pick'; pick.textContent = 'USE';
        pick.onclick = () => { _loadTextureIntoCanvas(t); _closeLoadCard(); };
        row.appendChild(thumb); row.appendChild(name); row.appendChild(pick);
        list.appendChild(row);
      });
    }
  }

  function _openLoadCard(){
    const card = _el.loadCard;
    if(!card) return;
    const searchInput = card.querySelector('#tc-load-search');
    if(searchInput){ searchInput.value = ''; searchInput.oninput = () => _populateLoadList(searchInput.value); }
    _populateLoadList('');
    card.classList.add('open');
    // Focus search after open transition
    if(searchInput) setTimeout(() => searchInput.focus(), 150);
  }

  function _closeLoadCard(){
    if(_el.loadCard) _el.loadCard.classList.remove('open');
  }

  function _loadTextureIntoCanvas(texEntry){
    const img = new Image();
    img.onload = () => {
      // Store loaded image as the base layer — gradients are composited on top of it
      _baseTexture = document.createElement('canvas');
      _baseTexture.width = TEX_W; _baseTexture.height = TEX_H;
      _baseTexture.getContext('2d').drawImage(img, 0, 0, TEX_W, TEX_H);
      // Do NOT clear gradients — user can keep adding gradients on top
      _composeGradients();
      _renderGradientList();
      _renderStopEditor();
      _renderEditorCanvas();
      _refresh();
    };
    img.src = texEntry.url;
  }

  // ── Export texture ─────────────────────────────────────────────────
  function _exportTexture(){
    // Ask for a name
    const raw = prompt('Texture name:', 'AtmoTex_' + Date.now());
    if(raw === null) return; // cancelled
    const safeName = raw.trim().replace(/[^a-zA-Z0-9_\-]/g,'_') || ('AtmoTex_' + Date.now());
    _composeGradients();
    const dataUrl = _drawCanvas.toDataURL('image/png');
    // Register it in the assets system
    const name = safeName.endsWith('.png') ? safeName : safeName + '.png';
    if(typeof assets !== 'undefined' && typeof cacheTexture !== 'undefined'){
      const entry = { name, url: dataUrl, size: dataUrl.length };
      assets.textures.push(entry);
      if(typeof renderAssetThumb === 'function') renderAssetThumb(entry);
      if(typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
      if(typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
      const texName = name.replace(/\.[^.]+$/,'');
      cacheTexture(texName, dataUrl);
    }
    // Also trigger a download
    const a = document.createElement('a');
    a.href = dataUrl; a.download = name; a.click();
    // Show confirmation
    _showToast('Texture exported & added to assets: ' + name);
  }

  function _showToast(msg){
    const t = document.createElement('div');
    t.className = 'tc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>t.classList.add('visible'),10);
    setTimeout(()=>{ t.classList.remove('visible'); setTimeout(()=>t.remove(),400); },3000);
  }

  // ── Mode toggle ────────────────────────────────────────────────────
  function _setMode(m){
    _mode = m;
    _el.modeCanvas.classList.toggle('active', m==='canvas');
    _el.modePreview.classList.toggle('active', m==='preview');
    _el.editorCanvas.style.display  = m==='canvas'  ? '' : 'none';
    _el.previewCanvas.style.display = m==='preview' ? '' : 'none';
    if(_el.previewControls) _el.previewControls.style.display = m==='preview' ? '' : 'none';
    if(m==='preview') _renderPreview();
    else _renderEditorCanvas();
  }

  // ── Public API ─────────────────────────────────────────────────────
  function open(){
    if(!_el.overlay){
      _build();
    }
    _open = true;
    _el.overlay.classList.add('open');
    // Re-size canvases after overlay is visible (layout is now measurable)
    requestAnimationFrame(() => {
      if(window._tcResizeHandler) window._tcResizeHandler();
    });
    _refresh();
  }

  function close(){
    _open = false;
    if(_el.overlay) _el.overlay.classList.remove('open');
  }

  // ── DOM Builder ────────────────────────────────────────────────────
  function _build(){
    _initDrawCanvas();

    // Start with a nice default gradient
    _gradients.push(_newGradient({
      name: 'Sky Blue',
      type: 'linear-v',
      stops: [
        { pos:0,   color:'#003366', alpha:0 },
        { pos:0.3, color:'#0066cc', alpha:0.5 },
        { pos:0.7, color:'#44aaff', alpha:0.9 },
        { pos:1,   color:'#aaddff', alpha:1 }
      ]
    }));
    _activeGrad = 0;

    const ov = document.createElement('div');
    ov.id = 'tc-overlay';
    ov.className = 'tc-overlay';
    ov.innerHTML = `
<div class="tc-window">
  <!-- ── Header ── -->
  <div class="tc-header">
    <div class="tc-header-left">
      <button class="tc-back-btn" id="tc-back">‹ BACK</button>
      <span class="tc-title"><span class="tc-title-accent">✦</span> ATMOSPHERE TEXTURE CREATOR</span>
    </div>
    <div class="tc-header-right">
      <button class="tc-mode-btn" id="tc-mode-preview">PREVIEW</button>
      <button class="tc-mode-btn" id="tc-mode-canvas">CANVAS</button>
      <button class="tc-load-btn" id="tc-load-tex-btn">⤴ LOAD TEXTURE</button>
      <button class="tc-export-btn" id="tc-export-btn">⬇ EXPORT PNG</button>
    </div>
  </div>

  <!-- ── Body ── -->
  <div class="tc-body">
    <!-- Left: tabbed sidebar -->
    <div class="tc-sidebar">
      <div class="tc-tab-bar">
        <button class="tc-tab active" id="tc-tab-grad" data-tab="grad">GRADIENTS</button>
        <button class="tc-tab tc-tab-soon" id="tc-tab-flare" data-tab="flare" disabled title="Coming soon">FLARES <span class="tc-soon-badge">SOON</span></button>
      </div>

      <!-- ── GRADIENTS TAB ── -->
      <div class="tc-tab-pane" id="tc-tabpane-grad">
        <div class="tc-panel-title">GRADIENT LAYERS
          <span style="display:flex;gap:5px;align-items:center"><button class="tc-add-grad" id="tc-add-grad" title="Add gradient layer">＋</button><button class="tc-clear-all" id="tc-clear-all" title="Clear all gradients and loaded texture">✕ CLEAR ALL</button></span>
        </div>
        <div class="tc-grad-list" id="tc-grad-list"></div>
        <div class="tc-panel-title" style="margin-top:10px">STOP EDITOR</div>
        <div class="tc-stop-panel" id="tc-stop-panel"></div>
      </div>

      <!-- ── FLARES TAB ── -->
      <div class="tc-tab-pane" id="tc-tabpane-flare" style="display:none">
        <div class="tc-panel-title">FLARE GENERATOR</div>
        <div class="tc-flare-panel" id="tc-flare-panel">
          <p class="tc-empty-hint" style="text-align:left;padding:8px 2px 10px;line-height:1.6">
            Generates seamless solar flares as a standalone texture. Flares rise from a glowing base band. Adjust settings below, then hit <b>GENERATE</b>. Use <b>RANDOMISE</b> to try a new random arrangement.
          </p>
          <div class="tc-field-row">
            <label title="The main color of the flares and glow band">FLARE COLOR</label>
            <input type="color" class="tc-color-swatch" id="tc-fl-color" value="#ffcc66">
            <span style="font-family:monospace;font-size:.68rem;color:var(--ink2);flex:1;padding-left:4px" id="tc-fl-color-hex">#ffcc66</span>
          </div>
          <div class="tc-field-row">
            <label title="Color of the empty space behind the flares">SPACE COLOR</label>
            <input type="color" class="tc-color-swatch" id="tc-fl-bg" value="#000000">
            <span style="font-family:monospace;font-size:.68rem;color:var(--ink2);flex:1;padding-left:4px" id="tc-fl-bg-hex">#000000</span>
          </div>
          <div class="tc-field-row">
            <label title="0% = fully transparent space (recommended for atmosphere use); 100% = fully opaque background">SPACE OPACITY</label>
            <input type="range" class="tc-range" id="tc-fl-bgalpha" min="0" max="1" step="0.01" value="0">
            <span class="tc-range-val" id="tc-fl-bgalpha-val">0%</span>
          </div>
          <div class="tc-field-row">
            <label title="How many flare streaks appear around the planet">NUMBER OF FLARES</label>
            <input type="range" class="tc-range" id="tc-fl-count" min="1" max="60" step="1" value="16">
            <span class="tc-range-val" id="tc-fl-count-val">16</span>
          </div>
          <div class="tc-field-row">
            <label title="How wide each flare is at its base">FLARE WIDTH</label>
            <input type="range" class="tc-range" id="tc-fl-width" min="1" max="25" step="1" value="6">
            <span class="tc-range-val" id="tc-fl-width-val">6%</span>
          </div>
          <div class="tc-field-row">
            <label title="How sharp the flare edges are — higher = crisper spikes, lower = softer glowing streaks">EDGE SHARPNESS</label>
            <input type="range" class="tc-range" id="tc-fl-soft" min="1" max="5" step="0.1" value="2.5">
            <span class="tc-range-val" id="tc-fl-soft-val">2.5</span>
          </div>
          <div class="tc-field-row">
            <label title="How tall the bright glowing base band is at the bottom of the texture">BASE GLOW HEIGHT</label>
            <input type="range" class="tc-range" id="tc-fl-base" min="0.05" max="0.4" step="0.01" value="0.18">
            <span class="tc-range-val" id="tc-fl-base-val">18%</span>
          </div>
          <div class="tc-field-row">
            <label title="How high the tallest flares can reach into the texture (100% = full height)">MAX FLARE HEIGHT</label>
            <input type="range" class="tc-range" id="tc-fl-reach" min="0.2" max="1.0" step="0.01" value="0.88">
            <span class="tc-range-val" id="tc-fl-reach-val">88%</span>
          </div>
          <div class="tc-field-row">
            <label title="Overall brightness of the flares and base glow">BRIGHTNESS</label>
            <input type="range" class="tc-range" id="tc-fl-bright" min="0.1" max="1" step="0.01" value="0.85">
            <span class="tc-range-val" id="tc-fl-bright-val">85%</span>
          </div>
          <div class="tc-field-row">
            <label title="Changes the random arrangement of flares — each number gives a different pattern">RANDOM PATTERN</label>
            <input type="range" class="tc-range" id="tc-fl-seed" min="0" max="9999" step="1" value="42">
            <span class="tc-range-val" id="tc-fl-seed-val">42</span>
          </div>
          <div class="tc-flare-btns">
            <button class="tc-flare-gen-btn" id="tc-fl-gen">✦ GENERATE</button>
            <button class="tc-flare-rand-btn" id="tc-fl-rand">⟳ RANDOMISE</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: canvas/preview -->
    <div class="tc-canvas-area">
      <!-- Preview controls bar (shown only in preview mode) -->
      <div class="tc-preview-controls" id="tc-preview-controls" style="display:none">
        <span class="tc-pvc-label">ATMO SIZE</span>
        <input type="range" class="tc-range tc-pvc-range" id="tc-pv-atmo" min="1.1" max="4.0" step="0.05" value="1.45">
        <span class="tc-range-val" id="tc-pv-atmo-val">1.45×</span>
        <span class="tc-pvc-sep"></span>
        <button class="tc-pvc-btn" id="tc-pv-reset" title="Reset pan/zoom">⊙ RESET</button>
      </div>
      <div class="tc-canvas-label" id="tc-canvas-label">
        TEXTURE
        <select id="tc-res-select" class="tc-res-select" title="Texture resolution">
          <option value="128x32">128×32 — Small / Fast</option>
          <option value="256x64" selected>256×64 — Standard</option>
          <option value="512x128">512×128 — High Detail</option>
          <option value="1024x256">1024×256 — Ultra</option>
        </select>
        <span style="opacity:.4;font-size:.6rem">(top row = outer atmosphere edge)</span>
      </div>
      <div class="tc-canvas-wrap">
        <canvas id="tc-editor-canvas" class="tc-editor-canvas"></canvas>
        <canvas id="tc-preview-canvas" class="tc-preview-canvas" style="display:none"></canvas>
      </div>
      <!-- Texture info bar -->
      <div class="tc-info-bar">
        <span style="opacity:.5">Bottom row = planet surface  ·  Top row = atmosphere edge  ·  Horizontal = 360° wrap</span>
      </div>
    </div>
  </div>
</div>

<!-- Load texture card -->
<div class="tc-load-card" id="tc-load-card">
  <div class="tc-load-card-inner">
    <div class="tc-load-card-header">
      <span>LOAD TEXTURE</span>
      <button class="tc-load-card-close" id="tc-load-card-close">✕</button>
    </div>
    <div class="tc-load-search-row">
      <input type="text" id="tc-load-search" class="tc-load-search" placeholder="Filter textures…" autocomplete="off">
    </div>
    <div id="tc-load-list" class="tc-load-list"></div>
    <div class="tc-load-upload-row">
      <label class="tc-upload-lbl">
        ⤴ Upload image file
        <input type="file" id="tc-upload-file" accept=".png,.jpg,.jpeg,.webp" style="display:none">
      </label>
    </div>
  </div>
</div>`;

    document.body.appendChild(ov);
    _el.overlay     = ov;
    _el.window      = ov.querySelector('.tc-window');
    _el.modeCanvas  = ov.querySelector('#tc-mode-canvas');
    _el.modePreview = ov.querySelector('#tc-mode-preview');
    _el.editorCanvas  = ov.querySelector('#tc-editor-canvas');
    _el.previewCanvas = ov.querySelector('#tc-preview-canvas');
    _el.gradList    = ov.querySelector('#tc-grad-list');
    _el.stopPanel   = ov.querySelector('#tc-stop-panel');
    _el.loadCard    = ov.querySelector('#tc-load-card');
    _el.previewControls = ov.querySelector('#tc-preview-controls');

    // Size canvases — responsive, fit the container
    function _sizeCanvases(){
      const wrap = _el.editorCanvas.parentElement;
      if(!wrap) return;
      // Use the wrap width, cap at 768 for editor and 768 for preview
      const availW = Math.min(wrap.clientWidth - 24, 768);
      // Editor canvas: aspect matches texture ratio
      const eW = Math.max(availW, 240);
      const eH = Math.round(eW * (TEX_H/TEX_W));
      _el.editorCanvas.width  = eW;
      _el.editorCanvas.height = eH;
      // Preview canvas: square-ish, portrait-friendly
      const pW = eW;
      const pH = Math.min(Math.round(pW * 0.65), 480);
      _el.previewCanvas.width  = pW;
      _el.previewCanvas.height = pH;
    }
    _sizeCanvases();

    // Resolution selector
    const _resSelect = ov.querySelector('#tc-res-select');
    if(_resSelect){
      _resSelect.onchange = () => {
        const [w, h] = _resSelect.value.split('x').map(Number);
        TEX_W = w; TEX_H = h;
        _initDrawCanvas();   // resize offscreen buffer
        _sizeCanvases();     // resize display canvas to match new aspect
        _gradients = []; _activeGrad = -1;
        _renderGradientList(); _renderStopEditor(); _refresh();
      };
    }

    // Resize on window resize
    window._tcResizeHandler = () => {
      _sizeCanvases();
      _refresh();
    };
    window.addEventListener('resize', window._tcResizeHandler);

    // Events
    ov.querySelector('#tc-back').onclick = () => close();
    _el.modeCanvas.onclick  = () => _setMode('canvas');
    _el.modePreview.onclick = () => _setMode('preview');
    ov.querySelector('#tc-load-tex-btn').onclick = () => _openLoadCard();
    ov.querySelector('#tc-export-btn').onclick   = () => _exportTexture();
    ov.querySelector('#tc-add-grad').onclick = () => {
      _gradients.push(_newGradient({ name: 'Gradient ' + (_gradients.length+1) }));
      _activeGrad = _gradients.length - 1;
      _renderGradientList(); _renderStopEditor(); _refresh();
    };
    ov.querySelector('#tc-clear-all').onclick = () => {
      _gradients = []; _activeGrad = -1; _baseTexture = null;
      _drawCtx.clearRect(0, 0, TEX_W, TEX_H);
      _renderGradientList(); _renderStopEditor(); _renderEditorCanvas();
      if(_mode === 'preview') _renderPreview();
    };
    ov.querySelector('#tc-load-card-close').onclick = () => _closeLoadCard();
    ov.querySelector('#tc-upload-file').onchange = e => {
      const f = e.target.files[0]; if(!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        _loadTextureIntoCanvas({ url: ev.target.result, name: f.name });
        _closeLoadCard();
      };
      reader.readAsDataURL(f);
    };

    // ── Tab switching ──
    const _tabs = { grad: ov.querySelector('#tc-tabpane-grad'), flare: ov.querySelector('#tc-tabpane-flare') };
    ov.querySelectorAll('.tc-tab').forEach(btn => {
      btn.onclick = () => {
        ov.querySelectorAll('.tc-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const which = btn.dataset.tab;
        Object.entries(_tabs).forEach(([k, el]) => { el.style.display = k === which ? '' : 'none'; });
        // Switching to flares tab: if gradients are active, clear canvas for standalone flare preview
      };
    });

    // ── Flare panel events ──
    const _flR = id => ov.querySelector('#' + id);
    const _flV = (rangeId, valId, fmt) => {
      const r = _flR(rangeId), v = _flR(valId);
      r.oninput = () => { v.textContent = fmt(r.value); };
    };
    _flV('tc-fl-count',   'tc-fl-count-val',   v => v);
    _flV('tc-fl-width',   'tc-fl-width-val',   v => v + '%');
    _flV('tc-fl-soft',    'tc-fl-soft-val',    v => parseFloat(v).toFixed(1));
    _flV('tc-fl-base',    'tc-fl-base-val',    v => Math.round(v*100) + '%');
    _flV('tc-fl-reach',   'tc-fl-reach-val',   v => Math.round(v*100) + '%');
    _flV('tc-fl-bright',  'tc-fl-bright-val',  v => Math.round(v*100) + '%');
    _flV('tc-fl-bgalpha', 'tc-fl-bgalpha-val', v => Math.round(v*100) + '%');
    _flV('tc-fl-seed',    'tc-fl-seed-val',    v => v);
    _flR('tc-fl-color').oninput = () => { _flR('tc-fl-color-hex').textContent = _flR('tc-fl-color').value; };
    _flR('tc-fl-bg').oninput    = () => { _flR('tc-fl-bg-hex').textContent    = _flR('tc-fl-bg').value; };

    const _doGenerateFlares = () => {
      const w = parseFloat(_flR('tc-fl-width').value) / 100;
      _gradients = []; _activeGrad = -1; // flares mode: no gradients
      _generateFlares({
        count:    parseInt(_flR('tc-fl-count').value),
        color:    _flR('tc-fl-color').value,
        bgColor:  _flR('tc-fl-bg').value,
        bgAlpha:  parseFloat(_flR('tc-fl-bgalpha').value),
        minW:     w * 0.4,
        maxW:     w * 1.8,
        softness: parseFloat(_flR('tc-fl-soft').value),
        baseH:    parseFloat(_flR('tc-fl-base').value),
        flareReach: parseFloat(_flR('tc-fl-reach').value),
        bright:   parseFloat(_flR('tc-fl-bright').value),
        seed:     parseInt(_flR('tc-fl-seed').value),
      });
      _renderGradientList();
      _renderEditorCanvas();
      if(_mode === 'preview') _renderPreview();
    };

    _flR('tc-fl-gen').onclick  = _doGenerateFlares;
    _flR('tc-fl-rand').onclick = () => {
      _flR('tc-fl-seed').value = Math.floor(Math.random() * 9999);
      _flR('tc-fl-seed-val').textContent = _flR('tc-fl-seed').value;
      _doGenerateFlares();
    };

    // ── Preview pan/zoom/atmo controls ──
    const pvAtmoR = ov.querySelector('#tc-pv-atmo');
    const pvAtmoV = ov.querySelector('#tc-pv-atmo-val');
    pvAtmoR.oninput = () => {
      _pvAtmoScale = parseFloat(pvAtmoR.value);
      pvAtmoV.textContent = _pvAtmoScale.toFixed(2) + '×';
      if(_mode==='preview') _renderPreview();
    };
    ov.querySelector('#tc-pv-reset').onclick = () => {
      _pvZoom = 1; _pvPanX = 0; _pvPanY = 0;
      if(_mode==='preview') _renderPreview();
    };

    // Preview canvas drag to pan
    let _pvDragging = false, _pvDragX = 0, _pvDragY = 0;
    let _pvPinchDist = 0;
    const _pvCanvas = _el.previewCanvas;
    _pvCanvas.addEventListener('mousedown', e => {
      if(_mode !== 'preview') return;
      _pvDragging = true; _pvDragX = e.clientX; _pvDragY = e.clientY;
      _pvCanvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if(!_pvDragging) return;
      _pvPanX += e.clientX - _pvDragX; _pvPanY += e.clientY - _pvDragY;
      _pvDragX = e.clientX; _pvDragY = e.clientY;
      _renderPreview();
    });
    window.addEventListener('mouseup', () => { _pvDragging = false; _pvCanvas.style.cursor = ''; });

    // Scroll to zoom
    _pvCanvas.addEventListener('wheel', e => {
      if(_mode !== 'preview') return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      _pvZoom = Math.max(0.3, Math.min(6, _pvZoom * delta));
      _renderPreview();
    }, {passive:false});

    // Touch: drag to pan, pinch to zoom
    _pvCanvas.addEventListener('touchstart', e => {
      if(_mode !== 'preview') return;
      if(e.touches.length === 1){
        _pvDragging = true; _pvDragX = e.touches[0].clientX; _pvDragY = e.touches[0].clientY;
      } else if(e.touches.length === 2){
        _pvDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _pvPinchDist = Math.sqrt(dx*dx+dy*dy);
      }
    }, {passive:true});
    _pvCanvas.addEventListener('touchmove', e => {
      if(_mode !== 'preview') return;
      e.preventDefault();
      if(e.touches.length === 1 && _pvDragging){
        _pvPanX += e.touches[0].clientX - _pvDragX; _pvPanY += e.touches[0].clientY - _pvDragY;
        _pvDragX = e.touches[0].clientX; _pvDragY = e.touches[0].clientY;
        _renderPreview();
      } else if(e.touches.length === 2){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(_pvPinchDist > 0){
          const ratio = dist / _pvPinchDist;
          _pvZoom = Math.max(0.3, Math.min(6, _pvZoom * ratio));
          _renderPreview();
        }
        _pvPinchDist = dist;
      }
    }, {passive:false});
    _pvCanvas.addEventListener('touchend', () => { _pvDragging = false; _pvPinchDist = 0; });

    _setMode('canvas');
    _renderGradientList();
    _renderStopEditor();
    _refresh();
  }

  return { open, close };
})();

// ── Main menu "Create Textures" navigation ────────────────────────
function goCreateTextures(){
  document.getElementById('s-start-main-nav').style.display  = 'none';
  document.getElementById('s-start-create-nav').style.display = '';
}

function goCreateTexturesBack(){
  document.getElementById('s-start-create-nav').style.display = 'none';
  document.getElementById('s-start-main-nav').style.display   = '';
}
