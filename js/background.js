// ════════════════════════════════ BACKGROUND THEMES ════════════════════════════════
const BG_THEMES = ['stars','nebula','matrix','custom'];
let bgTheme = localStorage.getItem('sfs_bg_theme') || 'stars';
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
  setBgTheme('stars');
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


(function(){
  const c = document.getElementById('bg');
  const x = c.getContext('2d');
  let particles, animId;

  function init(){
    c.width = innerWidth; c.height = innerHeight;
    if(animId) cancelAnimationFrame(animId);
    particles = null;

    if(bgTheme === 'stars'){
      particles = Array.from({length:380}, () => ({
        x: Math.random()*c.width, y: Math.random()*c.height,
        r: Math.random()*1.6+.15, a: Math.random()*.6+.15,
        sp: Math.random()*.004+.001, ph: Math.random()*Math.PI*2,
        col: Math.random()>.85 ? `rgba(255,240,200,` : `rgba(180,210,255,`
      }));
      function draw(t){
        x.clearRect(0,0,c.width,c.height);
        particles.forEach(s=>{
          const a = s.a*(0.55+0.45*Math.sin(t*.001*s.sp*1000+s.ph));
          x.beginPath(); x.arc(s.x,s.y,s.r,0,Math.PI*2);
          x.fillStyle = s.col+a+')'; x.fill();
        });
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

