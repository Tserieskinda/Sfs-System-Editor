// ════════════════════════════════ BACKGROUND THEMES ════════════════════════════════
const BG_THEMES = ['gamelike','nebula','matrix','custom'];
// Migrate anyone who had the old "Twinkling Stars" theme selected — it's been
// removed in favour of 'gamelike' (pure black + in-game-style stars).
if(localStorage.getItem('sfs_bg_theme') === 'stars'){
  localStorage.setItem('sfs_bg_theme', 'gamelike');
}
let bgTheme = localStorage.getItem('sfs_bg_theme') || 'gamelike';
let _customBgImg = null; // loaded Image object for custom theme

// Attempt to reload a saved custom image from localStorage on startup
(function(){
  const saved = localStorage.getItem('sfs_custom_bg_dataurl');
  if(saved){
    const img = new Image();
    img.onload = () => { _customBgImg = img; _updateCustomBgUI(true); if(bgTheme==='custom') window._bgInit(); };
    img.src = saved;
  }
})();

function _updateCustomBgUI(hasImage){
  const lbl = document.getElementById('custom-bg-label');
  const clr = document.getElementById('clear-custom-bg-btn');
  if(lbl) lbl.textContent = hasImage ? 'Custom image loaded ✓' : 'Upload any image as background';
  if(clr) clr.style.display = hasImage ? 'flex' : 'none';
}

function loadCustomBgImage(input){
  const file = input.files && input.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    const img = new Image();
    img.onload = () => {
      _customBgImg = img;
      // Store in localStorage — warn if too large (>6 MB encoded)
      try {
        localStorage.setItem('sfs_custom_bg_dataurl', dataUrl);
      } catch(err) {
        console.warn('Custom bg too large for localStorage, stored in memory only.');
      }
      _updateCustomBgUI(true);
      setBgTheme('custom');
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  // Reset so same file can be re-selected
  input.value = '';
}

function clearCustomBg(){
  _customBgImg = null;
  localStorage.removeItem('sfs_custom_bg_dataurl');
  _updateCustomBgUI(false);
  setBgTheme('gamelike');
}

function onUiHuePick(hex){
  const h = window._hexToHue(hex);
  window.applyUiHue(h);
  window._saveUiHue(h);
  _updateUiSwatches(h);
}

function resetUiHue(){
  const h = 220;
  window.applyUiHue(h);
  window._saveUiHue(h);
  _updateUiSwatches(h);
  if(window._syncUiColorPicker) window._syncUiColorPicker();
}

function _updateUiSwatches(h){
  const el = document.getElementById('ui-hue-swatches');
  if(!el) return;
  el.style.background = `linear-gradient(to right,`+
    `hsl(${h},60%,15%),hsl(${h},65%,35%),hsl(${h},70%,55%),hsl(${h},75%,70%),hsl(${h},65%,85%))`;
}

// ── Small standalone 2D Perlin noise (classic Ken Perlin permutation-table
// gradient noise) — used by the 'gamelike' background theme to mirror the
// actual game's star placement/twinkle algorithm (SFS's StarGenerator.cs
// clusters stars via a Perlin-noise rejection-sample, and Stars.cs twinkles
// each star's SIZE via PerlinNoise(time*0.3, starIndex), not a sine wave).
// This is a standard from-scratch implementation, not a port of Unity's
// internal noise — it won't be bit-identical, but produces the same kind of
// smooth, natural clustering/pulsing the game actually uses, which is what
// "resembles how the game does stars" calls for.
const _PERLIN_PERM = (() => {
  const p = new Uint8Array(256);
  for(let i=0;i<256;i++) p[i] = i;
  // Fixed shuffle (seeded, deterministic) — fine for a decorative background
  let seed = 1337;
  const rnd = () => { seed = (seed*1103515245+12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for(let i=255;i>0;i--){
    const j = Math.floor(rnd()*(i+1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  const perm = new Uint8Array(512);
  for(let i=0;i<512;i++) perm[i] = p[i & 255];
  return perm;
})();
function _perlinFade(t){ return t*t*t*(t*(t*6-15)+10); }
function _perlinGrad(hash, x, y){
  const h = hash & 3;
  const u = (h < 2) ? x : y;
  const v = (h < 2) ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2*v : 2*v);
}
function perlin2D(x, y){
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = _perlinFade(x), v = _perlinFade(y);
  const P = _PERLIN_PERM;
  const aa = P[X + P[Y]], ab = P[X + P[Y+1]], ba = P[X+1 + P[Y]], bb = P[X+1 + P[Y+1]];
  const x1 = _perlinGrad(aa,x,y)     + u*(_perlinGrad(ba,x-1,y)   - _perlinGrad(aa,x,y));
  const x2 = _perlinGrad(ab,x,y-1)   + u*(_perlinGrad(bb,x-1,y-1) - _perlinGrad(ab,x,y-1));
  // Result roughly in [-1,1]; normalise to [0,1] for convenience at call sites.
  return (x1 + v*(x2-x1)) * 0.5 + 0.5;
}


(function(){
  const c = document.getElementById('bg');
  const x = c.getContext('2d');
  let particles, animId;

  function init(){
    c.width = innerWidth; c.height = innerHeight;
    if(animId) cancelAnimationFrame(animId);
    particles = null;

    if(bgTheme === 'gamelike'){
      // Pure black backdrop + a Perlin-clustered starfield, matching SFS's own
      // StarGenerator.cs (Perlin-noise rejection-sample placement, so stars
      // naturally clump rather than scatter uniformly) and Stars.cs (each
      // star's visual size pulses via Perlin noise over time, not a sine wave).
      const PERLIN_SIZE = Math.max(c.width, c.height) / 5.5;
      const STAR_COUNT = 260;
      particles = [];
      for(let i=0; i<STAR_COUNT; i++){
        let x, y, tries = 0;
        do {
          x = Math.random()*c.width;
          y = Math.random()*c.height;
          tries++;
        } while(
          perlin2D(x/PERLIN_SIZE + 100, y/PERLIN_SIZE + 100) > (Math.random()*0.6 + 0.2) &&
          tries < 12
        );
        const sizeRoll = Math.random();
        // Bias toward small stars with a few standouts — approximates the
        // game's AnimationCurve (exact curve isn't recoverable from decompiled
        // code, since it's serialized Editor data, not in the .cs source).
        const baseR = 0.3 + Math.pow(sizeRoll, 3) * 2.0;
        const colRoll = Math.random();
        const col = colRoll > 0.85 ? 'rgba(255,235,205,'
                  : colRoll > 0.70 ? 'rgba(200,220,255,'
                  :                  'rgba(255,255,255,';
        particles.push({ x, y, baseR, col, noiseI: i });
      }
      function draw(t){
        x.clearRect(0,0,c.width,c.height);
        x.fillStyle = '#000';
        x.fillRect(0,0,c.width,c.height);
        // Global star-intensity multiplier — mirrors the game's own mechanism
        // of fading background stars based on a body's authored PostProcessing
        // curve (e.g. hideStarsInAtmosphere), computed live in viewport.js from
        // the same POST_PROCESSING_DATA the game itself reads. Defaults to 1
        // (fully visible) when no relevant body/data is present.
        const starIntensity = (typeof window._sfsBgStarIntensity === 'number')
          ? Math.max(0, Math.min(1, window._sfsBgStarIntensity)) : 1;
        if(starIntensity > 0.002){
          particles.forEach(s=>{
            // Mirrors Stars.cs: Mathf.LerpUnclamped(0.6, 1.8, PerlinNoise(t*0.3, i))
            const pulse = 0.6 + 1.2 * perlin2D(t*0.0003, s.noiseI*0.7);
            const r = s.baseR * pulse;
            // Reduced star intensity: base 0.35 (was 0.55) + reduced pulse 0.20 (was 0.35)
            // This dims stars to approximately 60% of original brightness
            const a = Math.max(0, Math.min(1, 0.35 + 0.20*(pulse-1))) * starIntensity;
            x.beginPath(); x.arc(s.x, s.y, r, 0, Math.PI*2);
            x.fillStyle = s.col + a + ')'; x.fill();
          });
        }
        animId = requestAnimationFrame(draw);
      }
      animId = requestAnimationFrame(draw);

    } else if(bgTheme === 'nebula'){
      // Drifting nebula clouds + sparse stars
      particles = Array.from({length:6}, (_,i) => ({
        x: Math.random()*c.width, y: Math.random()*c.height,
        r: 180+Math.random()*220,
        hue: [260,200,300,180,240,220][i],
        a: Math.random()*.18+.06,
        dx: (Math.random()-.5)*.15, dy: (Math.random()-.5)*.08,
        ph: Math.random()*Math.PI*2
      }));
      const stars2 = Array.from({length:220}, () => ({
        x: Math.random()*c.width, y: Math.random()*c.height,
        r: Math.random()*.9+.1, a: Math.random()*.5+.1,
        ph: Math.random()*Math.PI*2, sp: Math.random()*.003+.0005
      }));
      function draw(t){
        x.clearRect(0,0,c.width,c.height);
        // nebula blobs
        particles.forEach(n=>{
          n.x += n.dx; n.y += n.dy;
          if(n.x < -n.r) n.x = c.width+n.r;
          if(n.x > c.width+n.r) n.x = -n.r;
          if(n.y < -n.r) n.y = c.height+n.r;
          if(n.y > c.height+n.r) n.y = -n.r;
          const pulse = n.a*(0.7+0.3*Math.sin(t*.0004+n.ph));
          const g = x.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
          g.addColorStop(0,`hsla(${n.hue},80%,55%,${pulse})`);
          g.addColorStop(1,`hsla(${n.hue},80%,30%,0)`);
          x.fillStyle = g; x.beginPath(); x.arc(n.x,n.y,n.r,0,Math.PI*2); x.fill();
        });
        // stars on top
        stars2.forEach(s=>{
          const a = s.a*(0.5+0.5*Math.sin(t*.001*s.sp*800+s.ph));
          x.beginPath(); x.arc(s.x,s.y,s.r,0,Math.PI*2);
          x.fillStyle=`rgba(220,235,255,${a})`; x.fill();
        });
        animId = requestAnimationFrame(draw);
      }
      animId = requestAnimationFrame(draw);

    } else if(bgTheme === 'matrix'){
      // Aurora Borealis — horizontal light curtains: tall vertical linear gradients, gently swaying
      const W = c.width, H = c.height;
      const curtains = Array.from({length:7}, (_,i) => {
        const roll = Math.random();
        const hue = roll < .60 ? 125+Math.random()*45   // green->teal
                  : roll < .82 ? 185+Math.random()*30   // cyan-blue
                  :              270+Math.random()*30;   // violet
        return {
          xAnchor: (i/6)*W*1.1 - W*0.05 + (Math.random()-.5)*W*0.12,
          halfW:   W*(0.09+Math.random()*0.12),
          topY:    H*(0.04+Math.random()*0.22),
          bandH:   H*(0.28+Math.random()*0.38),
          hue,
          peakA:   0.10+Math.random()*0.13,
          ph1: Math.random()*Math.PI*2, ph2: Math.random()*Math.PI*2, ph3: Math.random()*Math.PI*2,
          swayA:   W*(0.012+Math.random()*0.02),  swayF:  0.00018+Math.random()*0.00022,
          breathA: H*(0.015+Math.random()*0.025), breathF:0.00014+Math.random()*0.00018,
          wPulseA: 0.15+Math.random()*0.20,       wPulseF:0.00020+Math.random()*0.00015,
          aPulseF: 0.00022+Math.random()*0.00020,
        };
      });
      const aStars = Array.from({length:180}, () => ({
        x: Math.random()*c.width, y: Math.random()*c.height,
        r: Math.random()*.8+.1, a: Math.random()*.38+.07,
        ph: Math.random()*Math.PI*2, sp: Math.random()*.002+.0003
      }));
      function draw(t){
        x.clearRect(0,0,W,H);
        x.globalCompositeOperation = 'source-over';
        x.fillStyle = 'rgb(1,4,3)';
        x.fillRect(0,0,W,H);
        x.globalCompositeOperation = 'screen';
        curtains.forEach(b=>{
          const cx    = b.xAnchor + b.swayA  * Math.sin(t*b.swayF   + b.ph1);
          const topY  = b.topY   + b.breathA * Math.sin(t*b.breathF + b.ph2);
          const hw    = b.halfW  * (1 + b.wPulseA * Math.sin(t*b.wPulseF + b.ph3));
          const pulse = b.peakA  * (0.55 + 0.45 * Math.sin(t*b.aPulseF + b.ph1 + 1.2));
          const x0 = cx - hw, x1 = cx + hw;
          // Horizontal envelope (curtain width)
          const hg = x.createLinearGradient(x0,0,x1,0);
          hg.addColorStop(0,    `hsla(${b.hue},90%,60%,0)`);
          hg.addColorStop(0.35, `hsla(${b.hue},90%,62%,${pulse*0.55})`);
          hg.addColorStop(0.5,  `hsla(${b.hue+8},88%,65%,${pulse})`);
          hg.addColorStop(0.65, `hsla(${b.hue},90%,62%,${pulse*0.55})`);
          hg.addColorStop(1,    `hsla(${b.hue},90%,60%,0)`);
          x.fillStyle = hg;
          x.fillRect(x0, topY, x1-x0, b.bandH);
          // Vertical fade: dark overlay tapering bottom
          x.globalCompositeOperation = 'source-over';
          const darken = x.createLinearGradient(0,topY,0,topY+b.bandH);
          darken.addColorStop(0,   'rgba(1,4,3,0)');
          darken.addColorStop(0.35,'rgba(1,4,3,0)');
          darken.addColorStop(1,   'rgba(1,4,3,0.80)');
          x.fillStyle = darken;
          x.fillRect(x0, topY, x1-x0, b.bandH);
          // Fade above topY (curtain doesn't float to very top uncontrolled)
          if(topY > 4){
            const fadeUp = x.createLinearGradient(0,0,0,topY);
            fadeUp.addColorStop(0,   'rgba(1,4,3,1)');
            fadeUp.addColorStop(0.65,'rgba(1,4,3,0)');
            x.fillStyle = fadeUp;
            x.fillRect(x0, 0, x1-x0, topY);
          }
          x.globalCompositeOperation = 'screen';
        });
        x.globalCompositeOperation = 'source-over';
        aStars.forEach(s=>{
          const a = s.a*(0.45+0.55*Math.sin(t*.001*s.sp*700+s.ph));
          x.beginPath(); x.arc(s.x,s.y,s.r,0,Math.PI*2);
          x.fillStyle=`rgba(200,255,220,${a})`; x.fill();
        });
        animId = requestAnimationFrame(draw);
      }
      animId = requestAnimationFrame(draw);
    } else if(bgTheme === 'custom'){
      // Static cover-fit custom image — no animation loop needed
      x.clearRect(0,0,c.width,c.height);
      x.fillStyle = '#000';
      x.fillRect(0,0,c.width,c.height);
      if(_customBgImg){
        const iw = _customBgImg.naturalWidth  || _customBgImg.width;
        const ih = _customBgImg.naturalHeight || _customBgImg.height;
        const scale = Math.max(c.width/iw, c.height/ih);
        const dw = iw*scale, dh = ih*scale;
        const dx = (c.width-dw)/2, dy = (c.height-dh)/2;
        x.drawImage(_customBgImg, dx, dy, dw, dh);
      }
    }
  }

  window._bgInit = init;
  init();
  addEventListener('resize', init);
})();

function setBgTheme(t){
  bgTheme = t;
  localStorage.setItem('sfs_bg_theme', t);
  if(typeof _syncThemeBtns === 'function') _syncThemeBtns();
  if(typeof _updateCustomBgUI === 'function') _updateCustomBgUI(!!_customBgImg);
  window._bgInit();
}

