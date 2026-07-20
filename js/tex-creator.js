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
  let _flareLayer  = null; // offscreen canvas: generated flares, composited below gradients

  // Offscreen draw canvas (the actual texture data)
  let _drawCanvas = null;
  let _drawCtx    = null;

  // Preview pan/zoom state
  let _pvZoom      = 1;
  let _pvPanX      = 0;
  let _pvPanY      = 0;
  // Preview atmosphere: physics-based sizing matching viewport
  // atmoR = planetR * (1 + _pvGradH_km / _pvPlanetR_km)
  let _pvPlanetR_km = 6371;   // planet radius in km (Earth default)
  let _pvGradH_km   = 600;    // gradient height in km  → atmoScale ~1.094×
  // Derived: atmoScale = 1 + gradH/planetR
  function _pvAtmoScale(){ return 1 + _pvGradH_km / _pvPlanetR_km; }

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
    // 1. Base loaded texture (bottom-most)
    if(_baseTexture){
      _drawCtx.globalCompositeOperation = 'source-over';
      _drawCtx.globalAlpha = 1;
      _drawCtx.drawImage(_baseTexture, 0, 0, TEX_W, TEX_H);
    }
    // 2. Flare layer (generated flares sit above loaded texture, below gradients)
    if(_flareLayer){
      _drawCtx.globalCompositeOperation = 'source-over';
      _drawCtx.globalAlpha = 1;
      _drawCtx.drawImage(_flareLayer, 0, 0, TEX_W, TEX_H);
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
  // Matches viewport.js rendering exactly:
  //   1. Starfield
  //   2. Planet disc (solid colour behind atmo)
  //   3. Atmosphere polar-warp disc — 'source-over' for planets-with-terrain,
  //      'lighter' for stars/no-terrain (the default for a raw texture preview)
  //      The polar canvas inner zone (inside innerFracClamped) is filled with
  //      the texture's bottom-row colour so there is no black gap ring.
  //   4. Planet disc clipped ON TOP to mask the atmosphere inner edge — this is
  //      what creates the clean limb; the atmosphere does NOT overdraw the planet.
  function _renderPreview(){
    const cv = _el.previewCanvas;
    if(!cv || !_drawCanvas) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    ctx.clearRect(0, 0, W, H);

    // ── 1. Starfield background ──────────────────────────────────────
    ctx.fillStyle = '#090912';
    ctx.fillRect(0, 0, W, H);
    for(let i = 0; i < 120; i++){
      const sx = (Math.sin(i*137.5)*0.5+0.5)*W;
      const sy = (Math.cos(i*97.1 )*0.5+0.5)*H;
      ctx.globalAlpha = Math.sin(i*73.1)*0.3+0.4;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sx, sy, Math.sin(i*53.7)*0.4+0.5, 0, Math.PI*2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Geometry ─────────────────────────────────────────────────────
    const basePlanetR = Math.min(W, H) * 0.22;
    const planetR  = basePlanetR * _pvZoom;
    const atmoR    = planetR * _pvAtmoScale(); // outer atmosphere radius
    const cx = W/2 + _pvPanX;
    const cy = H/2 + _pvPanY;

    // innerFrac: fraction of the polar disc that is "inside the planet"
    // matches viewport: innerFrac = physR_px / drawR  =  planetR / atmoR
    const innerFrac        = planetR / atmoR;
    const innerFracClamped = Math.min(0.999, innerFrac);

    // ── 2. Build polar-warp canvas (matches viewport._atmoPolarCache logic) ──
    // Resolution: use 512 for quality (viewport uses up to 512 for thin atmos)
    const SZ   = 512;
    const half = SZ / 2;
    const SW = TEX_W, SH = TEX_H;
    const srcD = _drawCtx.getImageData(0, 0, SW, SH).data;

    // Sample bottom row average — fills the inner zone to avoid black gap ring
    // (viewport does exactly the same: inner_r/g/b/a from innerRow = SH-1)
    let inner_r=255, inner_g=255, inner_b=255, inner_a=255;
    {
      let rS=0, gS=0, bS=0, aS=0;
      const row = SH - 1;
      for(let ix = 0; ix < SW; ix++){
        const ii = (row*SW + ix)*4;
        rS += srcD[ii]; gS += srcD[ii+1]; bS += srcD[ii+2]; aS += srcD[ii+3];
      }
      inner_r = rS/SW+.5|0; inner_g = gS/SW+.5|0;
      inner_b = bS/SW+.5|0; inner_a = aS/SW+.5|0;
    }

    // Derive planet surface colour from inner_r/g/b (same data, not a separate sample)
    const toMid   = c => c * 0.55 + 0.5 | 0;
    const toShade = c => c * 0.18 + 0.5 | 0;
    const midCol   = `rgb(${toMid(inner_r)},${toMid(inner_g)},${toMid(inner_b)})`;
    const shadeCol = `rgb(${toShade(inner_r)},${toShade(inner_g)},${toShade(inner_b)})`;

    const polarC = document.createElement('canvas');
    polarC.width = SZ; polarC.height = SZ;
    const pCtx = polarC.getContext('2d');
    const outD = pCtx.createImageData(SZ, SZ);
    const od   = outD.data;

    for(let py = 0; py < SZ; py++){
      for(let ppx = 0; ppx < SZ; ppx++){
        const dx = ppx - half, dy = py - half;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const radFrac = dist / half;
        const oi = (py*SZ + ppx)*4;

        if(radFrac > 1.0){ od[oi+3] = 0; continue; }

        // Inner zone: fill with bottom-row colour so no black gap ring
        if(radFrac <= innerFracClamped){
          od[oi]=inner_r; od[oi+1]=inner_g; od[oi+2]=inner_b; od[oi+3]=inner_a;
          continue;
        }

        // Atmosphere band: polar → rectangular UV mapping (matches viewport)
        let cwAngle = Math.atan2(dy, dx) / (Math.PI*2);
        if(cwAngle < 0) cwAngle += 1;
        const u = (1 - cwAngle) % 1;

        // t=0 → innerFrac (surface), t=1 → outer edge
        // texRowF=SH-1 at surface (t=0), texRowF=0 at outer edge (t=1)
        const t = (radFrac - innerFracClamped) / (1 - innerFracClamped);
        const texRowF = (1 - t) * (SH - 1);

        const sx  = Math.min(SW-1, Math.max(0, Math.round(u * (SW-1))));
        const sy0 = Math.min(SH-1, Math.max(0, Math.floor(texRowF)));
        const sy1 = Math.min(SH-1, sy0 + 1);
        const fy  = texRowF - sy0;
        const si0 = (sy0*SW + sx)*4;
        const si1 = (sy1*SW + sx)*4;
        od[oi]   = srcD[si0]   + (srcD[si1]   - srcD[si0])   * fy + 0.5 | 0;
        od[oi+1] = srcD[si0+1] + (srcD[si1+1] - srcD[si0+1]) * fy + 0.5 | 0;
        od[oi+2] = srcD[si0+2] + (srcD[si1+2] - srcD[si0+2]) * fy + 0.5 | 0;
        od[oi+3] = srcD[si0+3] + (srcD[si1+3] - srcD[si0+3]) * fy + 0.5 | 0;
      }
    }
    pCtx.putImageData(outD, 0, 0);

    // ── 3. Draw: planet disc → atmosphere disc → planet disc mask ────
    // This matches viewport draw order exactly.

    // 3a. Planet surface disc (drawn first, behind atmosphere)
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    const surfGrd = ctx.createRadialGradient(cx - planetR*0.2, cy - planetR*0.2, 0, cx, cy, planetR);
    surfGrd.addColorStop(0, midCol);
    surfGrd.addColorStop(1, shadeCol);
    ctx.fillStyle = surfGrd;
    ctx.fill();
    ctx.restore();

    // 3b. Atmosphere polar disc — clipped to atmoR circle.
    //     Compositing: 'source-over' (normal blend).
    //     The texture's alpha channel controls transparency so a gradient
    //     that goes 0→opaque reads correctly without any extra multiply.
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(cx, cy, atmoR, 0, Math.PI*2);
    ctx.clip();
    ctx.drawImage(polarC, cx - atmoR, cy - atmoR, atmoR*2, atmoR*2);
    ctx.restore();

    // 3c. Planet disc clipped ON TOP — masks the atmosphere inner fill so only
    //     the real atmosphere band shows, exactly as viewport does.
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    ctx.clip();
    const surf2 = ctx.createRadialGradient(cx - planetR*0.2, cy - planetR*0.2, 0, cx, cy, planetR);
    surf2.addColorStop(0, midCol);
    surf2.addColorStop(1, shadeCol);
    ctx.fillStyle = surf2;
    ctx.fill();
    ctx.restore();

    // 3d. Subtle limb ring
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, planetR, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // 3e. Atmosphere outer-edge drag handle — dashed ring at atmoR
    // Shows the draggable edge users can grab to change gradient height
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, atmoR, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(120,180,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
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
    // lenEq: 0=fully random heights, 1=all flares same height (equalised)
    const lenEq      = opts.lenEq      ?? 0;
    // distEq: 0=fully random positions, 1=perfectly evenly spaced around circumference
    const distEq     = opts.distEq     ?? 0;

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
    const fd = new ImageData(TEX_W, TEX_H);
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
      // Height is fully independent of baseH — baseH only controls the glow band thickness.
      // Flares always root at the very bottom (y=0) regardless of band size.
      const height = rng() * flareReach;
      flares.push({
        cx:     rng(),          // 0..1 horizontal center (wrapping)
        baseHW: baseW * 0.5,
        tipHW:  baseW * 0.03,
        height,
        peak:   0.5 + rng() * (bright - 0.5),
      });
    }

    // ── Length equalisation ──────────────────────────────────────────
    // Blend each flare's random height toward the mean height by lenEq factor
    if(lenEq > 0){
      const meanH = flares.reduce((s,f) => s + f.height, 0) / flares.length;
      for(const f of flares) f.height = f.height + (meanH - f.height) * lenEq;
    }

    // ── Distance equalisation ────────────────────────────────────────
    // Blend each flare's random cx toward its evenly-spaced slot by distEq factor
    if(distEq > 0){
      // Sort flares by current cx so slots are assigned in order
      const sorted = flares.slice().sort((a,b) => a.cx - b.cx);
      sorted.forEach((f, i) => {
        const evenCx = i / flares.length; // evenly spaced 0..1
        f.cx = f.cx + (evenCx - f.cx) * distEq;
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

    // Store into _flareLayer so _composeGradients can composite it persistently
    _flareLayer = document.createElement('canvas');
    _flareLayer.width  = TEX_W;
    _flareLayer.height = TEX_H;
    _flareLayer.getContext('2d').putImageData(fd, 0, 0);
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
    bar.style.height = '52px';
    bar.width = 400; bar.height = 52;
    barWrap.appendChild(bar);
    panel.appendChild(barWrap);
    requestAnimationFrame(() => {
      const bw = bar.offsetWidth;
      if(bw > 0){ bar.width = bw; bar.height = 52; _drawGradBar(bar, g); }
    });
    _drawGradBar(bar, g);

    // Drag state for stop handles
    // Bar layout: top 20px = color swatch zone, bottom 32px = gradient zone
    const BAR_SWATCH_H = 20;
    let _dragStop = null;
    const _getStopAtX = (clientX) => {
      const rect = bar.getBoundingClientRect();
      const x = (clientX - rect.left) * (bar.width / rect.width);
      const HIT = 14;
      let best = -1, bestDist = HIT;
      for(let si = 0; si < g.stops.length; si++){
        const sx = g.stops[si].pos * bar.width;
        const d = Math.abs(x - sx);
        if(d < bestDist){ bestDist = d; best = si; }
      }
      return best;
    };
    // Hidden color pickers for each stop, created once and reused
    const _stopPickers = [];
    const _getOrCreatePicker = (si) => {
      if(!_stopPickers[si]){
        const inp = document.createElement('input');
        inp.type = 'color';
        inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none;width:0;height:0';
        document.body.appendChild(inp);
        inp.oninput = () => {
          g.stops[si].color = inp.value;
          _drawGradBar(bar, g);
          _renderGradientList();
          // Sync the stop-row swatch too
          const rows = panel.querySelectorAll('.tc-stop-row');
          if(rows[si]){ const sw = rows[si].querySelector('input[type=color]'); if(sw) sw.value = inp.value; }
          _refresh();
        };
        _stopPickers[si] = inp;
      }
      _stopPickers[si].value = g.stops[si].color;
      return _stopPickers[si];
    };
    const _onBarDown = (clientX, clientY) => {
      const rect = bar.getBoundingClientRect();
      const yRel = (clientY - rect.top) * (bar.height / rect.height);
      const si = _getStopAtX(clientX);
      if(si < 0) return;
      if(yRel < BAR_SWATCH_H){
        // Click on color swatch zone → open color picker
        const picker = _getOrCreatePicker(si);
        picker.click();
      } else {
        _dragStop = si; bar.style.cursor = 'grabbing';
      }
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
    bar.addEventListener('mousedown',  e => { e.preventDefault(); _onBarDown(e.clientX, e.clientY); });
    bar.addEventListener('touchstart', e => { _onBarDown(e.touches[0].clientX, e.touches[0].clientY); }, {passive:true});
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
    const SWATCH_H = 20;   // top zone for color squares
    const GRAD_Y = SWATCH_H; // gradient starts here
    const GRAD_H = H - SWATCH_H;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Checker background for gradient zone
    for(let x=0;x<W;x+=8) for(let y=GRAD_Y;y<H;y+=8){
      ctx.fillStyle=((x/8+Math.floor((y-GRAD_Y)/8))%2===0)?'#2a2a30':'#202025';
      ctx.fillRect(x,y,8,8);
    }

    // Swatch zone background
    ctx.fillStyle = '#1a1a20';
    ctx.fillRect(0, 0, W, SWATCH_H);

    // Draw gradient fill
    const grd = ctx.createLinearGradient(0,0,W,0);
    for(const s of g.stops){
      const hex=s.color;
      const r=parseInt(hex.slice(1,3),16),gv=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
      grd.addColorStop(s.pos,`rgba(${r},${gv},${b},${s.alpha})`);
    }
    ctx.fillStyle=grd;
    ctx.fillRect(0,GRAD_Y,W,GRAD_H);

    // Stop markers
    const KNOB_R = 9;
    const KNOB_CY = GRAD_Y + GRAD_H / 2;
    const SW = 14, SH = 14; // color swatch size
    for(const s of g.stops){
      const x = s.pos * W;

      // Vertical guide line through full bar
      ctx.strokeStyle='rgba(255,255,255,0.25)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();

      // Color swatch square in top zone
      const sx = Math.max(SW/2+1, Math.min(W - SW/2 - 1, x));
      const syTop = (SWATCH_H - SH) / 2;
      // Drop shadow
      ctx.shadowColor='rgba(0,0,0,0.6)'; ctx.shadowBlur=3;
      ctx.fillStyle = s.color;
      ctx.fillRect(sx - SW/2, syTop, SW, SH);
      ctx.shadowBlur=0;
      // Border
      ctx.strokeStyle='rgba(255,255,255,0.75)'; ctx.lineWidth=1.5;
      ctx.strokeRect(sx - SW/2 + 0.75, syTop + 0.75, SW - 1.5, SH - 1.5);

      // Knob in gradient zone
      // Outer shadow ring
      ctx.shadowColor='rgba(0,0,0,0.7)'; ctx.shadowBlur=4;
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath(); ctx.arc(x, KNOB_CY, KNOB_R+1, 0, Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
      // Colored fill
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(x, KNOB_CY, KNOB_R, 0, Math.PI*2); ctx.fill();
      // White border
      ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.arc(x, KNOB_CY, KNOB_R, 0, Math.PI*2); ctx.stroke();
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
        <button class="tc-tab" id="tc-tab-flare" data-tab="flare">FLARES</button>
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
          <div class="tc-flare-row">
            <label title="Pulls all flare heights toward the same length — 0% = fully random lengths, 100% = all flares the same height">LENGTH EQUALISATION</label>
            <input type="range" class="tc-range" id="tc-fl-leneq" min="0" max="1" step="0.01" value="0">
            <span class="tc-range-val" id="tc-fl-leneq-val">0%</span>
          </div>
          <div class="tc-flare-row">
            <label title="Pulls flares toward even spacing — 0% = random positions, 100% = perfectly evenly distributed around the planet">DISTANCE EQUALISATION</label>
            <input type="range" class="tc-range" id="tc-fl-disteq" min="0" max="1" step="0.01" value="0">
            <span class="tc-range-val" id="tc-fl-disteq-val">0%</span>
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
        <span class="tc-pvc-label" title="Planet radius in km — sets the base size ratio">PLANET R</span>
        <input type="range" class="tc-range tc-pvc-range" id="tc-pv-planet-r" min="100" max="150000" step="50" value="6371">
        <span class="tc-range-val" id="tc-pv-planet-r-val">6371 km</span>
        <span class="tc-pvc-sep"></span>
        <span class="tc-pvc-label" title="Gradient height in km — matches GRADIENT.height in planet JSON. Drag the top edge of the atmosphere ring in the preview to adjust.">GRAD H</span>
        <input type="range" class="tc-range tc-pvc-range" id="tc-pv-grad-h" min="10" max="80000" step="10" value="600">
        <span class="tc-range-val" id="tc-pv-grad-h-val">600 km</span>
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
        _gradients = []; _activeGrad = -1; _baseTexture = null; _flareLayer = null;
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
      _gradients = []; _activeGrad = -1; _baseTexture = null; _flareLayer = null;
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
    _flV('tc-fl-leneq',   'tc-fl-leneq-val',   v => Math.round(v*100) + '%');
    _flV('tc-fl-disteq',  'tc-fl-disteq-val',  v => Math.round(v*100) + '%');
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
        lenEq:    parseFloat(_flR('tc-fl-leneq').value),
        distEq:   parseFloat(_flR('tc-fl-disteq').value),
      });
      _renderGradientList();
      _refresh(); // composes _flareLayer into _drawCanvas so export always works
    };

    _flR('tc-fl-gen').onclick  = _doGenerateFlares;
    _flR('tc-fl-rand').onclick = () => {
      _flR('tc-fl-seed').value = Math.floor(Math.random() * 9999);
      _flR('tc-fl-seed-val').textContent = _flR('tc-fl-seed').value;
      _doGenerateFlares();
    };

    // ── Preview pan/zoom/atmo controls ──
    const pvPlanetRSlider = ov.querySelector('#tc-pv-planet-r');
    const pvPlanetRVal    = ov.querySelector('#tc-pv-planet-r-val');
    const pvGradHSlider   = ov.querySelector('#tc-pv-grad-h');
    const pvGradHVal      = ov.querySelector('#tc-pv-grad-h-val');
    const _syncPvLabels = () => {
      pvPlanetRVal.textContent = Math.round(_pvPlanetR_km) + ' km';
      pvGradHVal.textContent   = Math.round(_pvGradH_km)   + ' km';
      pvPlanetRSlider.value = _pvPlanetR_km;
      pvGradHSlider.value   = _pvGradH_km;
    };
    pvPlanetRSlider.oninput = () => {
      _pvPlanetR_km = parseFloat(pvPlanetRSlider.value);
      pvPlanetRVal.textContent = Math.round(_pvPlanetR_km) + ' km';
      if(_mode==='preview') _renderPreview();
    };
    pvGradHSlider.oninput = () => {
      _pvGradH_km = parseFloat(pvGradHSlider.value);
      pvGradHVal.textContent = Math.round(_pvGradH_km) + ' km';
      if(_mode==='preview') _renderPreview();
    };
    ov.querySelector('#tc-pv-reset').onclick = () => {
      _pvZoom = 1; _pvPanX = 0; _pvPanY = 0;
      if(_mode==='preview') _renderPreview();
    };

    // ── Preview canvas interactions ───────────────────────────────────
    // Three interaction modes:
    //   1. Drag on the atmosphere outer-edge ring → adjust gradient height (km)
    //   2. Drag elsewhere → pan
    //   3. Scroll / pinch → zoom
    //
    // "Outer edge ring" = within ±12px of atmoR from the planet centre.
    let _pvDragging    = false;  // panning
    let _pvEdgeDrag    = false;  // dragging the atmosphere outer edge
    let _pvDragX = 0, _pvDragY = 0;
    let _pvEdgeDragStartY = 0, _pvEdgeStartGradH = 0;
    let _pvPinchDist   = 0;
    const _pvCanvas = _el.previewCanvas;

    // Returns the current atmoR in canvas pixels for hit-testing
    const _pvGetAtmoR = () => {
      const basePlanetR = Math.min(_pvCanvas.width, _pvCanvas.height) * 0.22;
      return basePlanetR * _pvZoom * _pvAtmoScale();
    };
    // Returns true if (clientX, clientY) is within the atmosphere ring hit zone
    const _pvIsNearEdge = (clientX, clientY) => {
      const rect = _pvCanvas.getBoundingClientRect();
      const cssScale = rect.width / _pvCanvas.width;
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      // Planet centre in CSS pixels (canvas centre + pan offset converted to CSS px)
      const pcx = rect.width  / 2 + _pvPanX * cssScale;
      const pcy = rect.height / 2 + _pvPanY * cssScale;
      const dx = localX - pcx, dy = localY - pcy;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const atmoR = _pvGetAtmoR() * cssScale; // atmoR in CSS px
      return Math.abs(dist - atmoR) < 16;
    };

    _pvCanvas.addEventListener('mousemove', e => {
      if(_mode !== 'preview') return;
      if(!_pvEdgeDrag && !_pvDragging){
        _pvCanvas.style.cursor = _pvIsNearEdge(e.clientX, e.clientY) ? 'ns-resize' : '';
      }
    });

    _pvCanvas.addEventListener('mousedown', e => {
      if(_mode !== 'preview') return;
      if(_pvIsNearEdge(e.clientX, e.clientY)){
        _pvEdgeDrag = true;
        _pvEdgeDragStartY = e.clientY;
        _pvEdgeStartGradH = _pvGradH_km;
        _pvCanvas.style.cursor = 'ns-resize';
      } else {
        _pvDragging = true; _pvDragX = e.clientX; _pvDragY = e.clientY;
        _pvCanvas.style.cursor = 'grabbing';
      }
    });

    window.addEventListener('mousemove', e => {
      if(_pvEdgeDrag){
        // Dragging upward (negative dy) → increase gradient height
        // Scale: 1px drag ≈ planetR_km * 0.015  km change (feels natural)
        const dy = e.clientY - _pvEdgeDragStartY;
        const kmPerPx = _pvPlanetR_km * 0.015;
        _pvGradH_km = Math.max(10, Math.min(80000, _pvEdgeStartGradH - dy * kmPerPx));
        _syncPvLabels();
        _renderPreview();
        return;
      }
      if(!_pvDragging) return;
      _pvPanX += e.clientX - _pvDragX; _pvPanY += e.clientY - _pvDragY;
      _pvDragX = e.clientX; _pvDragY = e.clientY;
      _renderPreview();
    });
    window.addEventListener('mouseup', () => {
      _pvDragging = false; _pvEdgeDrag = false;
      _pvCanvas.style.cursor = '';
    });

    // Scroll to zoom toward cursor
    _pvCanvas.addEventListener('wheel', e => {
      if(_mode !== 'preview') return;
      e.preventDefault();
      const rect = _pvCanvas.getBoundingClientRect();
      // Cursor in canvas logical pixels
      const mx = (e.clientX - rect.left) * (_pvCanvas.width  / rect.width);
      const my = (e.clientY - rect.top)  * (_pvCanvas.height / rect.height);
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const oldZoom = _pvZoom;
      _pvZoom = Math.max(0.3, Math.min(6, _pvZoom * delta));
      // Adjust pan so the point under the cursor stays fixed.
      // cx = W/2 + _pvPanX, so point-under-cursor in pan-space = mx - W/2 - _pvPanX.
      // After zoom, the same world point maps to a different pan offset.
      const factor = _pvZoom / oldZoom;
      _pvPanX = mx - _pvCanvas.width  / 2 - (mx - _pvCanvas.width  / 2 - _pvPanX) * factor;
      _pvPanY = my - _pvCanvas.height / 2 - (my - _pvCanvas.height / 2 - _pvPanY) * factor;
      _renderPreview();
    }, {passive:false});

    // Touch: drag to pan / edge-drag / pinch to zoom
    let _pvTouchEdge = false;
    _pvCanvas.addEventListener('touchstart', e => {
      if(_mode !== 'preview') return;
      if(e.touches.length === 1){
        const t = e.touches[0];
        if(_pvIsNearEdge(t.clientX, t.clientY)){
          _pvTouchEdge = true;
          _pvEdgeDragStartY = t.clientY;
          _pvEdgeStartGradH = _pvGradH_km;
        } else {
          _pvDragging = true; _pvDragX = t.clientX; _pvDragY = t.clientY;
        }
      } else if(e.touches.length === 2){
        _pvDragging = false; _pvTouchEdge = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        _pvPinchDist = Math.sqrt(dx*dx+dy*dy);
      }
    }, {passive:true});
    _pvCanvas.addEventListener('touchmove', e => {
      if(_mode !== 'preview') return;
      e.preventDefault();
      if(e.touches.length === 1){
        const t = e.touches[0];
        if(_pvTouchEdge){
          const dy = t.clientY - _pvEdgeDragStartY;
          const kmPerPx = _pvPlanetR_km * 0.015;
          _pvGradH_km = Math.max(10, Math.min(80000, _pvEdgeStartGradH - dy * kmPerPx));
          _syncPvLabels();
          _renderPreview();
        } else if(_pvDragging){
          _pvPanX += t.clientX - _pvDragX; _pvPanY += t.clientY - _pvDragY;
          _pvDragX = t.clientX; _pvDragY = t.clientY;
          _renderPreview();
        }
      } else if(e.touches.length === 2){
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx*dx+dy*dy);
        if(_pvPinchDist > 0){
          const ratio = dist / _pvPinchDist;
          const oldZoom = _pvZoom;
          _pvZoom = Math.max(0.3, Math.min(6, _pvZoom * ratio));
          // Zoom toward the midpoint between the two fingers
          const rect = _pvCanvas.getBoundingClientRect();
          const midClientX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const midClientY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const mx = (midClientX - rect.left) * (_pvCanvas.width  / rect.width);
          const my = (midClientY - rect.top)  * (_pvCanvas.height / rect.height);
          const factor = _pvZoom / oldZoom;
          _pvPanX = mx - _pvCanvas.width  / 2 - (mx - _pvCanvas.width  / 2 - _pvPanX) * factor;
          _pvPanY = my - _pvCanvas.height / 2 - (my - _pvCanvas.height / 2 - _pvPanY) * factor;
          _renderPreview();
        }
        _pvPinchDist = dist;
      }
    }, {passive:false});
    _pvCanvas.addEventListener('touchend', () => {
      _pvDragging = false; _pvTouchEdge = false; _pvPinchDist = 0;
    });

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
