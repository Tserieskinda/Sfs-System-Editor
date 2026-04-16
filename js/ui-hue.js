// ════════════════════════════════ UI HUE TINT ════════════════════════════════
(function(){
  const STORAGE_KEY = 'sfs_ui_hue';
  let _hue = parseInt(localStorage.getItem(STORAGE_KEY) || '220', 10);

  function hsl(h, s, l, a) {
    return a !== undefined
      ? `hsla(${h},${s}%,${l}%,${a})`
      : `hsl(${h},${s}%,${l}%)`;
  }

  function applyUiHue(h) {
    _hue = h;
    const r = document.documentElement;
    // Named accent colours
    r.style.setProperty('--sky',  hsl(h, 55, 55));
    r.style.setProperty('--sky2', hsl(h, 58, 63));
    r.style.setProperty('--sky3', hsl(h, 62, 74));
    // Accent rgba aliases (ac*)
    const rgb = hslToRgb(h/360, .65, .63);
    const [R,G,B] = rgb;
    const ac = (a) => `rgba(${R},${G},${B},${a})`;
    r.style.setProperty('--ac1',  ac(1));
    r.style.setProperty('--ac08', ac(.08));
    r.style.setProperty('--ac10', ac(.10));
    r.style.setProperty('--ac12', ac(.12));
    r.style.setProperty('--ac13', ac(.13));
    r.style.setProperty('--ac14', ac(.14));
    r.style.setProperty('--ac15', ac(.15));
    r.style.setProperty('--ac18', ac(.18));
    r.style.setProperty('--ac20', ac(.20));
    r.style.setProperty('--ac22', ac(.22));
    r.style.setProperty('--ac25', ac(.25));
    r.style.setProperty('--ac28', ac(.28));
    r.style.setProperty('--ac30', ac(.30));
    r.style.setProperty('--ac35', ac(.35));
    r.style.setProperty('--ac40', ac(.40));
    r.style.setProperty('--ac45', ac(.45));
    r.style.setProperty('--ac50', ac(.50));
    r.style.setProperty('--ac55', ac(.55));
    r.style.setProperty('--ac62', ac(.62));
    r.style.setProperty('--ac65', ac(.65));
    // Dark panel tints (shift hue slightly into panel)
    const dp = hslToRgb(h/360, .55, .08);
    const [dR,dG,dB] = dp;
    const dpv = (a) => `rgba(${dR},${dG},${dB},${a})`;
    r.style.setProperty('--dp1', dpv(.60));
    r.style.setProperty('--dp2', dpv(.70));
    r.style.setProperty('--dp3', dpv(.80));
    r.style.setProperty('--dp4', dpv(.88));
    r.style.setProperty('--dp5', dpv(.92));
    r.style.setProperty('--dp6', dpv(.95));
    // Overlay base (nearly black with hue tint)
    const ov = hslToRgb(h/360, .30, .025);
    const [oR,oG,oB] = ov;
    const ovv = (a) => `rgba(${oR},${oG},${oB},${a})`;
    r.style.setProperty('--ov1', ovv(.82));
    r.style.setProperty('--ov2', ovv(.85));
    r.style.setProperty('--ov3', ovv(.88));
    r.style.setProperty('--ov4', ovv(.92));
    r.style.setProperty('--ov5', ovv(.96));
    // Highlight panels
    const hp = hslToRgb(h/360, .50, .22);
    const [hR,hG,hB] = hp;
    r.style.setProperty('--hp1', `rgba(${hR},${hG},${hB},.60)`);
    const hp2 = hslToRgb(h/360, .45, .055);
    const [h2R,h2G,h2B] = hp2;
    r.style.setProperty('--hp2', `rgba(${h2R},${h2G},${h2B},.98)`);
    r.style.setProperty('--hp3', `rgba(${h2R},${h2G},${h2B},.95)`);
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if(s === 0){ r = g = b = l; }
    else {
      const q = l < .5 ? l*(1+s) : l+s-l*s;
      const p = 2*l-q;
      r = hue2rgb(p,q,h+1/3);
      g = hue2rgb(p,q,h);
      b = hue2rgb(p,q,h-1/3);
    }
    return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
  }
  function hue2rgb(p,q,t){ if(t<0)t+=1; if(t>1)t-=1; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }

  // Convert hue pick (#rrggbb) → hue angle
  function hexToHue(hex){
    const r=parseInt(hex.slice(1,3),16)/255, g=parseInt(hex.slice(3,5),16)/255, b=parseInt(hex.slice(5,7),16)/255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
    if(d===0) return 220;
    let h;
    if(max===r) h=((g-b)/d)%6;
    else if(max===g) h=(b-r)/d+2;
    else h=(r-g)/d+4;
    return Math.round(h*60+360)%360;
  }

  // Apply saved hue on load
  applyUiHue(_hue);

  // Expose globally
  window.applyUiHue = applyUiHue;
  window._getUiHue  = () => _hue;
  window._saveUiHue = (h) => { localStorage.setItem(STORAGE_KEY, h); };
  window._hexToHue  = hexToHue;
  window._hslToRgb  = hslToRgb;

  // Sync color picker swatch to current hue on open
  window._syncUiColorPicker = function(){
    const inp = document.getElementById('ui-hue-picker');
    if(!inp) return;
    // Convert current hue to a saturated hex for the picker
    const [r,g,b] = hslToRgb(_hue/360, .75, .55);
    inp.value = '#' + [r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
  };
})();


