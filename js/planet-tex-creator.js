// ════════════════════════════════════════════════════════════════════
//  PLANET TEXTURE CREATOR  —  Procedural Planet Surface Texture Editor
//  (Terrain / crust texture generation — companion to TC's atmosphere editor)
// ════════════════════════════════════════════════════════════════════

const PT = (() => {

  // ── State ──────────────────────────────────────────────────────────
  let _open = false;
  let _el = {}; // populated in _build()

  let canvas = null, ctx = null;
  const CANVAS_SIZE = 512;

  let renderScale   = 1;      // 1 = full res, 0.5 = half res preview while dragging
  let debounceTimer = null;
  let isDragging    = false;

  // ── Perlin noise engine (256-entry shuffled permutation table) ──────
  const srcArr = [
    234,9,103,60,5,79,232,229,45,51,131,3,168,29,170,216,99,161,111,204,220,209,78,89,72,191,157,119,226,184,
    244,134,21,61,175,15,223,100,230,28,128,185,84,208,164,44,113,105,27,85,203,146,153,130,66,42,250,140,174,133,
    115,4,52,73,65,10,104,238,30,211,46,121,2,190,159,172,112,156,95,47,124,177,77,202,81,38,123,13,182,242,
    64,33,225,0,241,122,210,37,106,163,82,98,34,218,187,214,125,132,120,219,252,32,135,215,245,48,198,222,76,231,
    213,192,227,144,19,152,110,12,217,126,196,201,248,148,109,138,63,249,200,36,197,101,127,145,149,54,16,167,102,80,
    239,181,14,83,224,142,69,176,118,171,251,136,43,246,155,18,165,68,53,90,94,41,93,162,116,212,205,25,235,193,
    74,58,169,199,17,180,49,147,92,158,160,75,141,20,96,31,137,117,186,11,67,233,88,91,24,97,237,247,86,195,
    236,39,221,87,240,178,40,206,194,1,207,71,150,114,56,107,243,179,166,183,50,143,254,154,129,59,55,23,7,8,
    108,151,22,139,228,253,173,26,188,35,255,62,70,189,6,57
  ];
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = p[i + 256] = srcArr[i];

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(t, a, b) { return a + t * (b - a); }

  function grad3D(hash, x, y, z) {
    const h = hash & 15;
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }

  function noise3D(x, y, z) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(w, lerp(v, lerp(u, grad3D(p[AA], x, y, z), grad3D(p[BA], x - 1, y, z)),
                            lerp(u, grad3D(p[AB], x, y - 1, z), grad3D(p[BB], x - 1, y - 1, z))),
                    lerp(v, lerp(u, grad3D(p[AA + 1], x, y, z - 1), grad3D(p[BA + 1], x - 1, y, z - 1)),
                            lerp(u, grad3D(p[AB + 1], x, y - 1, z - 1), grad3D(p[BB + 1], x - 1, y - 1, z - 1))));
  }

  function filteredNoise3D(x, y, z, blurStrength) {
    if (blurStrength === 0) return noise3D(x, y, z);
    const warpX = noise3D(x + 0.0, y + 1.7, z + 2.3) * 0.08 * blurStrength;
    const warpY = noise3D(x + 3.1, y + 0.0, z + 4.5) * 0.08 * blurStrength;
    const warpZ = noise3D(x + 5.2, y + 9.1, z + 0.0) * 0.08 * blurStrength;
    const wx = x + warpX, wy = y + warpY, wz = z + warpZ;
    const step = 0.015 * blurStrength;
    return lerp(0.5, lerp(0.5, noise3D(wx, wy, wz), noise3D(wx + step, wy, wz)),
                     lerp(0.5, noise3D(wx, wy + step, wz), noise3D(wx + step, wy + step, wz)));
  }

  function getCraterValue(x, y, z, density) {
    if (density === 0) return 0;
    let totalCraterMod = 0;
    const scale = density * 2.5;
    const cx = Math.floor(x * scale), cy = Math.floor(y * scale), cz = Math.floor(z * scale);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (let k = -1; k <= 1; k++) {
          const cellX = cx + i, cellY = cy + j, cellZ = cz + k;
          const h1 = p[(cellX & 255) + p[(cellY & 255) + (cellZ & 255)]];
          const pX = (cellX + h1 / 256.0) / scale;
          const pY = (cellY + p[(cellZ & 255) + h1] / 256.0) / scale;
          const pZ = (cellZ + p[(cellX & 255) + h1] / 256.0) / scale;
          const dx = x - pX, dy = y - pY, dz = z - pZ;
          const distSq = dx * dx + dy * dy + dz * dz;
          const craterRadius = (h1 % 4 + 2) * 0.05;
          const radiusSq = craterRadius * craterRadius;
          if (distSq < radiusSq) {
            const dist = Math.sqrt(distSq);
            const rNormalized = dist / craterRadius;
            if (rNormalized < 0.75) {
              totalCraterMod -= (1.0 - Math.pow(rNormalized / 0.75, 2.0)) * 0.45;
            } else {
              const rimT = (rNormalized - 0.75) / 0.25;
              totalCraterMod += (1.0 - Math.abs(rimT - 0.5) / 0.5) * 0.18;
            }
          }
        }
      }
    }
    return totalCraterMod;
  }

  function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }

  // ── Global tone adjustment (hue shift / saturation / brightness) ────
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = 60 * (((g - b) / d) % 6); break;
        case g: h = 60 * ((b - r) / d + 2); break;
        case b: h = 60 * ((r - g) / d + 4); break;
      }
    }
    if (h < 0) h += 360;
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let rp = 0, gp = 0, bp = 0;
    if (h < 60)       { rp = c; gp = x; bp = 0; }
    else if (h < 120) { rp = x; gp = c; bp = 0; }
    else if (h < 180) { rp = 0; gp = c; bp = x; }
    else if (h < 240) { rp = 0; gp = x; bp = c; }
    else if (h < 300) { rp = x; gp = 0; bp = c; }
    else              { rp = c; gp = 0; bp = x; }
    return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
  }

  // ── Quick color palettes ──────────────────────────────────────────
  const PRESETS = {
    earth:   { cWater:'#1c5fae', cWaterDeep:'#0a1e3d', cLand:'#2d4a1e', cMountain:'#6b5d4f', cPeak:'#e6e6eb', cSplat:'#2e2a35', cDesert:'#c2924f', cShore:'#d8c98a', cIce:'#f5faff', cGlow:'#ff5522', landTexture:'rocky',   seaTexture:'water' },
    mars:    { cWater:'#8a4a2a', cWaterDeep:'#3a1e10', cLand:'#a85832', cMountain:'#6b3a1e', cPeak:'#c98a5a', cSplat:'#5c3a24', cDesert:'#d9975a', cShore:'#e0b585', cIce:'#f0e4d8', cGlow:'#ff6a33', landTexture:'barren',  seaTexture:'barren' },
    ice:     { cWater:'#4fa8d8', cWaterDeep:'#103a54', cLand:'#cfd8e0', cMountain:'#8fa4b8', cPeak:'#ffffff', cSplat:'#7d93a8', cDesert:'#b8d0e0', cShore:'#eef7ff', cIce:'#ffffff', cGlow:'#66ccff', landTexture:'rocky',   seaTexture:'icy'    },
    volcanic:{ cWater:'#ff5a1e', cWaterDeep:'#7a1c00', cLand:'#241b1b', cMountain:'#4a2e22', cPeak:'#806050', cSplat:'#1a1414', cDesert:'#a8522a', cShore:'#ffae42', cIce:'#f5faff', cGlow:'#ffae00', landTexture:'brittle', seaTexture:'lava'   },
    toxic:   { cWater:'#4caf50', cWaterDeep:'#143d16', cLand:'#6a4c8c', cMountain:'#8f6bb0', cPeak:'#d8b8ff', cSplat:'#2e1a3d', cDesert:'#9c7ac2', cShore:'#b8ffb0', cIce:'#d0ffe0', cGlow:'#aaff00', landTexture:'rocky',   seaTexture:'brittle'},
    ocean:   { cWater:'#1c7fae', cWaterDeep:'#04182e', cLand:'#2e6b3e', cMountain:'#5a4a3a', cPeak:'#e6e6eb', cSplat:'#1e4a2e', cDesert:'#c2b24f', cShore:'#d8e8a8', cIce:'#f5faff', cGlow:'#ff5522', landTexture:'rocky',   seaTexture:'water'  },
    barren:  { cWater:'#3a3a3c', cWaterDeep:'#1c1c1e', cLand:'#6e6e73', cMountain:'#8e8e93', cPeak:'#d1d1d6', cSplat:'#48484a', cDesert:'#7a7a80', cShore:'#9a9aa0', cIce:'#e5e5ea', cGlow:'#ff9955', landTexture:'asteroid',seaTexture:'brittle'},
    comet:   { cWater:'#2c3e50', cWaterDeep:'#0d1720', cLand:'#3a3a42', cMountain:'#5a5a68', cPeak:'#eaeaf5', cSplat:'#22222a', cDesert:'#6a6a78', cShore:'#c8c8d8', cIce:'#eef4ff', cGlow:'#66aaff', landTexture:'comet',   seaTexture:'icy'    }
  };

  function applyPreset(key) {
    const pr = PRESETS[key];
    if (!pr) return;
    Object.keys(pr).forEach(k => {
      const el = _el[k];
      if (el) el.value = pr[k];
    });
    scheduleGenerate(false);
    _showToast('Palette applied: ' + key);
  }

  // ── View angle shortcuts ─────────────────────────────────────────
  function setView(lat, lon) {
    _el.latTilt.value = lat;
    _el.lonRot.value  = lon;
    _updateRangeFill(_el.latTilt);
    _updateRangeFill(_el.lonRot);
    scheduleGenerate(false);
  }

  // ── Core render ───────────────────────────────────────────────────
  function generatePlanet() {
    if (!ctx) return;
    const fullSize = CANVAS_SIZE;
    const size = Math.max(32, Math.round(fullSize * renderScale));
    const radius = size / 2;
    const imgData = ctx.createImageData(size, size);

    const depthScale = parseFloat(_el.depthScale.value);
    const landTex = _el.landTexture.value;
    const seaTex  = _el.seaTexture.value;

    const seaLevel   = parseFloat(_el.seaLevel.value);
    const scaleBase  = parseFloat(_el.scaleBase.value);
    const islandCount= parseInt(_el.islandCount.value);
    const ridgeSharp = parseFloat(_el.ridgeSharp.value);

    const iceCapSize = parseFloat(_el.iceCapSize.value);
    const iceOpacity = parseFloat(_el.iceOpacity.value);
    const iceSharpness = parseFloat(_el.iceSharpness.value);

    const lavaIncandescence = parseFloat(_el.lavaIncandescence.value);
    const lavaGlow = parseFloat(_el.lavaGlow.value);

    const blurStrength = parseFloat(_el.antialiasBlur.value);
    const cDensity = parseFloat(_el.craterDensity.value);
    const cDepth   = parseFloat(_el.craterDepth.value);
    const tilt = parseFloat(_el.latTilt.value) * Math.PI / 180;
    const rot  = parseFloat(_el.lonRot.value) * Math.PI / 180;

    const coastIrregularity = parseFloat(_el.coastIrregularity.value);
    const splatDensity = parseFloat(_el.splatDensity.value);
    const splatScale   = parseFloat(_el.splatScale.value);
    const splatDepth   = parseFloat(_el.splatDepth.value);
    const desertSize   = parseFloat(_el.desertSize.value);
    const desertSoftness = parseFloat(_el.desertSoftness.value);
    const shoreThickness = parseFloat(_el.shoreThickness.value);

    const sunAzimuth = parseFloat(_el.sunAzimuth.value) * Math.PI / 180;
    const sunElevation = parseFloat(_el.sunElevation.value) * Math.PI / 180;
    const terminatorSoftness = parseFloat(_el.terminatorSoftness.value);
    const nightDarkness = parseFloat(_el.nightDarkness.value);
    const oceanSpecular = parseFloat(_el.oceanSpecular.value);

    // Global tone
    const hueShift  = parseFloat(_el.hueShift.value);
    const saturationMul = parseFloat(_el.saturation.value);
    const brightnessMul = parseFloat(_el.brightness.value);
    const toneActive = (hueShift !== 0 || saturationMul !== 1 || brightnessMul !== 1);

    const sunX = Math.cos(sunElevation) * Math.sin(sunAzimuth);
    const sunY = Math.sin(sunElevation);
    const sunZ = Math.cos(sunElevation) * Math.cos(sunAzimuth);

    const rgbWater     = hexToRgb(_el.cWater.value);
    const rgbWaterDeep = hexToRgb(_el.cWaterDeep.value);
    const rgbLand      = hexToRgb(_el.cLand.value);
    const rgbMountain  = hexToRgb(_el.cMountain.value);
    const rgbPeak      = hexToRgb(_el.cPeak.value);
    const rgbSplat     = hexToRgb(_el.cSplat.value);
    const rgbDesert    = hexToRgb(_el.cDesert.value);
    const rgbShore     = hexToRgb(_el.cShore.value);
    const rgbIce       = hexToRgb(_el.cIce.value);
    const rgbGlow      = hexToRgb(_el.cGlow.value);

    _syncLabels({ depthScale, seaLevel, scaleBase, islandCount, ridgeSharp, iceCapSize, iceOpacity,
      iceSharpness, lavaIncandescence, lavaGlow, blurStrength, cDensity, cDepth, coastIrregularity,
      splatDensity, splatScale, splatDepth, desertSize, desertSoftness, shoreThickness,
      terminatorSoftness, nightDarkness, oceanSpecular, hueShift, saturationMul, brightnessMul });

    const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
    const cosR = Math.cos(rot), sinR = Math.sin(rot);

    for (let y = 0; y < size; y++) {
      const dy = (y - radius) / radius;
      for (let x = 0; x < size; x++) {
        const dx = (x - radius) / radius;
        const dSq = dx * dx + dy * dy;
        const pIdx = (y * size + x) * 4;

        if (dSq > 1.0) {
          imgData.data[pIdx] = 0; imgData.data[pIdx + 1] = 0; imgData.data[pIdx + 2] = 0; imgData.data[pIdx + 3] = 0;
          continue;
        }

        const sphereZ = Math.sqrt(1.0 - dSq);
        const dz = lerp(depthScale, 1.0, sphereZ);

        const nz = lerp(depthScale, 1.0, sphereZ);
        const normLen = Math.sqrt(dx * dx + dy * dy + nz * nz) || 1.0;
        const nrmX = dx / normLen, nrmY = dy / normLen, nrmZ = nz / normLen;
        const sunDot = nrmX * sunX + nrmY * sunY + nrmZ * sunZ;

        let xR = dx * cosR - (sphereZ * depthScale) * sinR;
        let zR = dx * sinR + (sphereZ * depthScale) * cosR;
        let yF = dy * cosT - zR * sinT;
        let zF = dy * sinT + zR * cosT;
        let xF = xR;

        // 1. Terrain map
        const sx = xF * scaleBase, sy = yF * scaleBase, sz = zF * scaleBase;
        let elevation = filteredNoise3D(sx, sy, sz, blurStrength) * 0.5
                       + filteredNoise3D(sx * 2.0, sy * 2.0, sz * 2.0, blurStrength) * 0.25
                       + filteredNoise3D(sx * 4.0 * (1 + islandCount * 0.15), sy * 4.0 * (1 + islandCount * 0.15), sz * 4.0 * (1 + islandCount * 0.15), blurStrength) * 0.15;
        const craterImpact = getCraterValue(sx, sy, sz, cDensity) * cDepth;
        const detailNoise = noise3D(sx * 18.0, sy * 18.0, sz * 18.0);
        const crackleNoise = Math.abs(noise3D(sx * 12.0, sy * 12.0, sz * 12.0));
        elevation = elevation * 0.5 + 0.5;
        elevation += craterImpact;
        elevation = lerp(ridgeSharp, elevation, Math.pow(elevation, 1.6));
        let finalElevation = Math.max(0.0, Math.min(1.0, elevation));

        if (coastIrregularity > 0) {
          const raggedNoise = noise3D(xF * 9.0, yF * 9.0, zF * 9.0) * 0.5
                             + noise3D(xF * 22.0, yF * 22.0, zF * 22.0) * 0.5;
          finalElevation = Math.max(0.0, Math.min(1.0, finalElevation + raggedNoise * 0.12 * coastIrregularity));
        }

        // Splats
        let splatMask = 0;
        if (splatDensity > 0) {
          const scx = Math.floor(xF * splatScale), scy = Math.floor(yF * splatScale), scz = Math.floor(zF * splatScale);
          let minCellDist = 999;
          for (let si = -1; si <= 1; si++) {
            for (let sj = -1; sj <= 1; sj++) {
              for (let sk = -1; sk <= 1; sk++) {
                const ccx = scx + si, ccy = scy + sj, ccz = scz + sk;
                const sh = p[(ccx & 255) + p[(ccy & 255) + (ccz & 255)]];
                if ((sh / 255.0) > (1.0 - splatDensity)) {
                  const jx = ccx + (p[(ccz & 255) + sh] / 256.0);
                  const jy = ccy + (p[(ccx & 255) + sh] / 256.0);
                  const jz = ccz + (p[(ccy & 255) + sh] / 256.0);
                  const sdx = xF * splatScale - jx, sdy = yF * splatScale - jy, sdz = zF * splatScale - jz;
                  const cellDist = Math.sqrt(sdx * sdx + sdy * sdy + sdz * sdz);
                  if (cellDist < minCellDist) minCellDist = cellDist;
                }
              }
            }
          }
          if (minCellDist < 0.65) {
            splatMask = 1.0 - (minCellDist / 0.65);
            splatMask = splatMask * splatMask;
            finalElevation = Math.max(0.0, finalElevation - splatMask * splatDepth);
          }
        }

        // Equatorial desert
        let desertMask = 0;
        if (desertSize > 0) {
          let desertNoise = noise3D(xF * 4.0, yF * 4.0, zF * 4.0) * 0.06;
          let eqDist = Math.abs(yF) + desertNoise;
          let eqBound = desertSize * 0.9;
          desertMask = 1.0 - Math.min(1.0, eqDist / Math.max(eqBound, 0.001));
          desertMask = Math.max(0.0, desertMask);
          desertMask = Math.pow(desertMask, 1.0 / Math.max(desertSoftness * 4.0, 0.1));
        }

        // Cryosphere
        let polarDistance = Math.abs(yF);
        let glacierFactor = 0;
        if (iceCapSize > 0) {
          let iceCapNoise = filteredNoise3D(xF * 5.0, yF * 5.0, zF * 5.0, blurStrength) * 0.07;
          let iceBound = 1.0 - (iceCapSize * 0.60);
          if (polarDistance + iceCapNoise > iceBound) {
            let delta = (polarDistance + iceCapNoise - iceBound);
            glacierFactor = Math.min(1.0, Math.pow(delta * iceSharpness, 1.5));
            finalElevation += glacierFactor * 0.25;
          }
        }

        // 3. Color mapping
        let r, g, b;
        let isLiquid = finalElevation < seaLevel;

        if (isLiquid) {
          let t = finalElevation / Math.max(seaLevel, 0.001);
          let fluidNoise = filteredNoise3D(xF * 8.0, yF * 8.0, zF * 8.0, 0.5) * 0.15;
          t = Math.max(0.0, Math.min(1.0, t + fluidNoise));

          r = lerp(t, rgbWaterDeep[0], rgbWater[0]);
          g = lerp(t, rgbWaterDeep[1], rgbWater[1]);
          b = lerp(t, rgbWaterDeep[2], rgbWater[2]);

          if (seaTex === 'icy') {
            let slush = noise3D(xF * 30.0, yF * 30.0, zF * 30.0) * 0.4;
            r = lerp(0.6, r, 200 + slush * 50);
            g = lerp(0.6, g, 220 + slush * 35);
            b = lerp(0.6, b, 240);
          } else if (seaTex === 'brittle') {
            if (crackleNoise > 0.82) {
              r *= 0.3; g *= 0.3; b *= 0.3;
            } else {
              r = Math.min(255, r * 1.3); g = Math.min(255, g * 1.2);
            }
          } else if (seaTex === 'barren') {
            r *= 0.25; g *= 0.22; b *= 0.2;
          }
        } else {
          let landRange = 1.0 - seaLevel;
          let t = (finalElevation - seaLevel) / Math.max(landRange, 0.001);

          if (t < 0.45) {
            let lint = t / 0.45;
            r = lerp(lint, rgbLand[0], rgbMountain[0]);
            g = lerp(lint, rgbLand[1], rgbMountain[1]);
            b = lerp(lint, rgbLand[2], rgbMountain[2]);
          } else {
            let mint = (t - 0.45) / 0.55;
            r = lerp(mint, rgbMountain[0], rgbPeak[0]);
            g = lerp(mint, rgbMountain[1], rgbPeak[1]);
            b = lerp(mint, rgbMountain[2], rgbPeak[2]);
          }

          if (landTex === 'brittle') {
            if (crackleNoise > 0.78) {
              r = lerp(0.7, r, 10); g = lerp(0.7, g, 8); b = lerp(0.7, b, 8);
            }
          } else if (landTex === 'barren') {
            r = lerp(0.3, r, 180 + detailNoise * 40);
            g = lerp(0.3, g, 150 + detailNoise * 30);
            b = lerp(0.3, b, 120);
          } else if (landTex === 'asteroid') {
            r = lerp(0.5, r, 105 + detailNoise * 30);
            g = lerp(0.5, g, 75 + detailNoise * 15);
            b = lerp(0.5, b, 65);
          } else if (landTex === 'comet') {
            let volatileSprinkle = noise3D(xF * 60.0, yF * 60.0, zF * 60.0);
            if (volatileSprinkle > 0.45) {
              r = 210; g = 225; b = 235;
            } else {
              r *= 0.35; g *= 0.35; b *= 0.38;
            }
          } else if (landTex === 'rocky') {
            r += detailNoise * 25; g += detailNoise * 25; b += detailNoise * 25;
          }

          if (splatMask > 0) {
            r = lerp(splatMask * 0.85, r, rgbSplat[0]);
            g = lerp(splatMask * 0.85, g, rgbSplat[1]);
            b = lerp(splatMask * 0.85, b, rgbSplat[2]);
          }

          if (desertMask > 0 && glacierFactor <= 0) {
            let desertBlend = desertMask * (0.65 + detailNoise * 0.5);
            desertBlend = Math.max(0.0, Math.min(1.0, desertBlend));
            r = lerp(desertBlend, r, rgbDesert[0]);
            g = lerp(desertBlend, g, rgbDesert[1]);
            b = lerp(desertBlend, b, rgbDesert[2]);
          }
        }

        // Shoreline
        if (shoreThickness > 0) {
          let shoreDist = Math.abs(finalElevation - seaLevel);
          if (shoreDist < shoreThickness) {
            let shoreBlend = 1.0 - (shoreDist / shoreThickness);
            shoreBlend = shoreBlend * shoreBlend;
            r = lerp(shoreBlend, r, rgbShore[0]);
            g = lerp(shoreBlend, g, rgbShore[1]);
            b = lerp(shoreBlend, b, rgbShore[2]);
          }
        }

        // Ice overlay
        if (glacierFactor > 0) {
          let iceR = lerp(glacierFactor, r, rgbIce[0]);
          let iceG = lerp(glacierFactor, g, rgbIce[1]);
          let iceB = lerp(glacierFactor, b, rgbIce[2]);
          let effectiveIceStrength = glacierFactor * iceOpacity;
          r = lerp(effectiveIceStrength, r, iceR);
          g = lerp(effectiveIceStrength, g, iceG);
          b = lerp(effectiveIceStrength, b, iceB);
        }

        // Crater shadows
        if (craterImpact < -0.06 && !isLiquid) {
          let cT = Math.min(1.0, Math.abs(craterImpact) * 3.0);
          r = lerp(cT, r, r * 0.4);
          g = lerp(cT, g, g * 0.4);
          b = lerp(cT, b, b * 0.45);
        }

        // Lighting
        let dayAmount = (sunDot + terminatorSoftness) / (terminatorSoftness * 2.0);
        dayAmount = Math.max(0.0, Math.min(1.0, dayAmount));
        dayAmount = dayAmount * dayAmount * (3.0 - 2.0 * dayAmount);

        const nightFloor = 1.0 - nightDarkness;
        const lightAmount = nightFloor + dayAmount * (1.0 - nightFloor);
        const limbFalloff = lerp(Math.pow(dz, 0.2), 1.0, 0.35);
        const standardShading = limbFalloff * lightAmount;

        if (isLiquid) {
          if (seaTex === 'lava') {
            r = lerp(lavaIncandescence, r * standardShading, r);
            g = lerp(lavaIncandescence, g * standardShading, g);
            b = lerp(lavaIncandescence, b * standardShading, b);
          } else {
            r *= standardShading; g *= standardShading; b *= standardShading;
            if (oceanSpecular > 0 && dayAmount > 0.05) {
              let hx = sunX, hy = sunY, hz = sunZ + 1.0;
              let hLen = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1.0;
              hx /= hLen; hy /= hLen; hz /= hLen;
              let specDot = Math.max(0.0, nrmX * hx + nrmY * hy + nrmZ * hz);
              let specNoiseBreakup = 1.0 - Math.abs(noise3D(xF * 45.0, yF * 45.0, zF * 45.0)) * 0.5;
              let spec = Math.pow(specDot, 60.0) * oceanSpecular * dayAmount * specNoiseBreakup;
              r += spec * 255; g += spec * 255; b += spec * 255;
            }
          }
        } else {
          r = r * standardShading;
          g = g * standardShading;
          b = b * standardShading;

          if (lavaGlow > 0 && lavaIncandescence > 0 && seaTex === 'lava') {
            let distanceToLiquid = (finalElevation - seaLevel);
            if (distanceToLiquid < 0.12) {
              let heatInfluence = (1.0 - (distanceToLiquid / 0.12)) * lavaGlow * lavaIncandescence;
              r += rgbGlow[0] * heatInfluence;
              g += rgbGlow[1] * heatInfluence;
              b += rgbGlow[2] * heatInfluence;
            }
          }
        }

        // Global tone adjustment (hue / saturation / brightness)
        if (toneActive) {
          const hsl = rgbToHsl(Math.max(0, Math.min(255, r)), Math.max(0, Math.min(255, g)), Math.max(0, Math.min(255, b)));
          hsl[0] = (hsl[0] + hueShift + 360) % 360;
          hsl[1] = Math.max(0, Math.min(1, hsl[1] * saturationMul));
          hsl[2] = Math.max(0, Math.min(1, hsl[2] * brightnessMul));
          const rgbOut = hslToRgb(hsl[0], hsl[1], hsl[2]);
          r = rgbOut[0]; g = rgbOut[1]; b = rgbOut[2];
        }

        imgData.data[pIdx]     = Math.max(0, Math.min(255, r));
        imgData.data[pIdx + 1] = Math.max(0, Math.min(255, g));
        imgData.data[pIdx + 2] = Math.max(0, Math.min(255, b));
        imgData.data[pIdx + 3] = 255;
      }
    }

    ctx.clearRect(0, 0, fullSize, fullSize);
    if (size === fullSize) {
      ctx.putImageData(imgData, 0, 0);
    } else {
      const off = document.createElement('canvas');
      off.width = size; off.height = size;
      off.getContext('2d').putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, size, size, 0, 0, fullSize, fullSize);
    }
  }

  function scheduleGenerate(previewMode) {
    renderScale = previewMode ? 0.5 : 1;
    generatePlanet();
  }

  // ── Export ────────────────────────────────────────────────────────
  function exportPlanetPNG() {
    renderScale = 1;
    generatePlanet();
    const raw = prompt('Texture name:', 'PlanetTex_' + Date.now());
    if (raw === null) return;
    const safeName = raw.trim().replace(/[^a-zA-Z0-9_\-]/g, '_') || ('PlanetTex_' + Date.now());
    const name = safeName.endsWith('.png') ? safeName : safeName + '.png';
    const dataUrl = canvas.toDataURL('image/png');

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
    _showToast('Planet texture exported & added to assets: ' + name);
  }

  function _showToast(msg) {
    const t = document.createElement('div');
    t.className = 'tc-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('visible'), 10);
    setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 400); }, 3000);
  }

  // ── Label / slider-fill sync ─────────────────────────────────────
  function _updateRangeFill(el) {
    if (!el || el.type !== 'range') return;
    const min = parseFloat(el.min) || 0, max = parseFloat(el.max) || 100;
    const v = parseFloat(el.value);
    el.style.setProperty('--pct', (((v - min) / (max - min)) * 100).toFixed(2) + '%');
  }

  function _syncLabels(v) {
    _el.depthScaleVal.innerText = v.depthScale === 0 ? 'Flat Disk (0.0)' : v.depthScale === 1 ? 'Sphere (1.0)' : v.depthScale;
    _el.seaLevelVal.innerText = v.seaLevel;
    _el.scaleBaseVal.innerText = v.scaleBase;
    _el.islandCountVal.innerText = v.islandCount;
    _el.ridgeSharpVal.innerText = v.ridgeSharp;
    _el.iceCapSizeVal.innerText = document.getElementById('pt-iceCapSize').value;
    _el.iceOpacityVal.innerText = v.iceOpacity;
    _el.iceSharpnessVal.innerText = v.iceSharpness;
    _el.lavaIncandescenceVal.innerText = v.lavaIncandescence;
    _el.lavaGlowVal.innerText = v.lavaGlow;
    _el.antialiasBlurVal.innerText = v.blurStrength;
    _el.craterDensityVal.innerText = v.cDensity;
    _el.craterDepthVal.innerText = v.cDepth;
    _el.latTiltVal.innerText = _el.latTilt.value + '°';
    _el.lonRotVal.innerText = _el.lonRot.value + '°';
    _el.coastIrregularityVal.innerText = v.coastIrregularity;
    _el.splatDensityVal.innerText = v.splatDensity;
    _el.splatScaleVal.innerText = v.splatScale;
    _el.splatDepthVal.innerText = v.splatDepth;
    _el.desertSizeVal.innerText = v.desertSize;
    _el.desertSoftnessVal.innerText = v.desertSoftness;
    _el.shoreThicknessVal.innerText = v.shoreThickness;
    _el.sunAzimuthVal.innerText = _el.sunAzimuth.value + '°';
    _el.sunElevationVal.innerText = _el.sunElevation.value + '°';
    _el.terminatorSoftnessVal.innerText = v.terminatorSoftness;
    _el.nightDarknessVal.innerText = v.nightDarkness;
    _el.oceanSpecularVal.innerText = v.oceanSpecular;
    _el.hueShiftVal.innerText = v.hueShift + '°';
    _el.saturationVal.innerText = v.saturationMul;
    _el.brightnessVal.innerText = v.brightnessMul;
  }

  // ── DOM builder ──────────────────────────────────────────────────
  function _range(id, label, min, max, step, value, unit) {
    return `
      <div class="pt-row">
        <div class="pt-row-label"><span>${label}</span><span class="pt-val" id="${id}-val">${value}${unit || ''}</span></div>
        <input class="tc-range" type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      </div>`;
  }

  function _select(id, label, options, selected) {
    const opts = options.map(o => `<option value="${o[0]}"${o[0] === selected ? ' selected' : ''}>${o[1]}</option>`).join('');
    return `
      <div class="pt-row">
        <div class="pt-row-label"><span>${label}</span></div>
        <select class="pt-select" id="${id}">${opts}</select>
      </div>`;
  }

  function _colorBox(id, label, value) {
    return `
      <div class="pt-color-box">
        <label>${label}</label>
        <input type="color" id="${id}" value="${value}">
      </div>`;
  }

  function _build() {
    const html = `
      <div class="tc-window pt-window">
        <div class="tc-header">
          <div class="tc-header-left">
            <button class="tc-back-btn" id="pt-close">‹ BACK</button>
            <span class="tc-title"><span class="tc-title-accent">◆</span>PLANET TEXTURE CREATOR</span>
          </div>
          <div class="tc-header-right">
            <button class="tc-export-btn" id="pt-export">⬇ EXPORT & ADD TO ASSETS</button>
          </div>
        </div>
        <div class="tc-body">
          <div class="tc-sidebar pt-sidebar">
            <div class="pt-panel">

              <div class="pt-section">Quick Palettes</div>
              <div class="pt-preset-grid" id="pt-presets">
                <button class="pt-preset-btn" data-preset="earth"><svg class="icon"><use href="#icon-globe"></use></svg> Earth</button>
                <button class="pt-preset-btn" data-preset="mars"><svg class="icon"><use href="#icon-circle"></use></svg> Mars</button>
                <button class="pt-preset-btn" data-preset="ice"><svg class="icon"><use href="#icon-snowflake"></use></svg> Ice World</button>
                <button class="pt-preset-btn" data-preset="volcanic"><svg class="icon"><use href="#icon-mountain-snow"></use></svg> Volcanic</button>
                <button class="pt-preset-btn" data-preset="toxic"><svg class="icon"><use href="#icon-biohazard"></use></svg> Toxic</button>
                <button class="pt-preset-btn" data-preset="ocean"><svg class="icon"><use href="#icon-waves"></use></svg> Ocean World</button>
                <button class="pt-preset-btn" data-preset="barren"><svg class="icon"><use href="#icon-mountain"></use></svg> Barren Rock</button>
                <button class="pt-preset-btn" data-preset="comet"><svg class="icon"><use href="#icon-flame"></use></svg> Comet</button>
              </div>

              <div class="pt-section">Projection & Geometry</div>
              ${_range('pt-depthScale', 'Planetary Curvature', 0.0, 1.0, 0.05, 1.0)}
              <div class="pt-view-grid">
                <button class="pt-view-btn" data-lat="0" data-lon="0">Equator</button>
                <button class="pt-view-btn" data-lat="90" data-lon="0">N Pole</button>
                <button class="pt-view-btn" data-lat="-90" data-lon="0">S Pole</button>
                <button class="pt-view-btn" data-lat="35" data-lon="-45">Oblique</button>
              </div>

              <div class="pt-section">Surface Textures & Materials</div>
              ${_select('pt-landTexture', 'Crust / Land Material', [['rocky','Rocky / Basalt'],['brittle','Brittle / Fractured'],['barren','Barren / Sandy Dust'],['asteroid','High-Iron Asteroid'],['comet','Volatile Comet Crust']], 'rocky')}
              ${_select('pt-seaTexture', 'Basin / Liquid Material', [['water','Water / Ocean'],['lava','Incandescent Lava'],['icy','Chilled Slush Ice'],['brittle','Brittle Crackled Glass'],['barren','Smooth Tar Mud']], 'water')}

              <div class="pt-section">Base Colors & Tones</div>
              <div class="pt-color-grid">
                ${_colorBox('pt-cWater', 'Water (Shallow)', '#1c5fae')}
                ${_colorBox('pt-cWaterDeep', 'Water (Deep)', '#0a1e3d')}
                ${_colorBox('pt-cLand', 'Land / Crust', '#1c1c1e')}
                ${_colorBox('pt-cMountain', 'Mountain Accent', '#48484a')}
                ${_colorBox('pt-cPeak', 'Peak / Snowcap', '#e6e6eb')}
                ${_colorBox('pt-cSplat', 'Splat Patches', '#2e2a35')}
                ${_colorBox('pt-cDesert', 'Equatorial Desert', '#c2924f')}
                ${_colorBox('pt-cShore', 'Shoreline', '#d8c98a')}
                ${_colorBox('pt-cIce', 'Polar Ice', '#f5faff')}
                ${_colorBox('pt-cGlow', 'Thermal Glow Tint', '#ff5522')}
              </div>

              <div class="pt-section">Global Tone Shift</div>
              ${_range('pt-hueShift', 'Hue Shift', -180, 180, 1, 0, '°')}
              ${_range('pt-saturation', 'Saturation', 0.0, 2.0, 0.05, 1.0)}
              ${_range('pt-brightness', 'Brightness', 0.5, 1.5, 0.05, 1.0)}

              <div class="pt-section">Thermal Energy Dynamics</div>
              ${_range('pt-lavaIncandescence', 'Basin Self-Incandescence', 0.0, 1.0, 0.05, 0.85)}
              ${_range('pt-lavaGlow', 'Thermal Crust Bleed', 0.0, 1.0, 0.05, 0.70)}

              <div class="pt-section">Geography</div>
              ${_range('pt-seaLevel', 'Basin Water Level', 0.0, 1.0, 0.01, 0.40)}
              ${_range('pt-scaleBase', 'Continent Size', 0.5, 3.0, 0.1, 1.4)}
              ${_range('pt-islandCount', 'Island & Feature Count', 1, 5, 1, 4)}
              ${_range('pt-ridgeSharp', 'Mountain Sharpness', 0.0, 1.0, 0.05, 0.50)}
              ${_range('pt-coastIrregularity', 'Coastline Irregularity', 0.0, 1.0, 0.05, 0.0)}

              <div class="pt-section">Surface Detail</div>
              ${_range('pt-splatDensity', 'Splat Coverage', 0.0, 1.0, 0.05, 0.0)}
              ${_range('pt-splatScale', 'Splat Size', 1.0, 10.0, 0.5, 4.0)}
              ${_range('pt-splatDepth', 'Splat Depth', 0.0, 0.3, 0.01, 0.08)}
              ${_range('pt-desertSize', 'Equatorial Desert Size', 0.0, 1.0, 0.05, 0.0)}
              ${_range('pt-desertSoftness', 'Equatorial Desert Softness', 0.02, 0.5, 0.02, 0.15)}
              ${_range('pt-shoreThickness', 'Shore Thickness', 0.0, 0.15, 0.005, 0.0)}

              <div class="pt-section">Cryosphere & Glaciology</div>
              ${_range('pt-iceCapSize', 'Polar Ice Cap Size', 0.0, 1.0, 0.05, 0.0)}
              ${_range('pt-iceOpacity', 'Ice Core Density', 0.1, 1.0, 0.05, 0.95)}
              ${_range('pt-iceSharpness', 'Ice Edge Sharpness', 1.0, 25.0, 1.0, 12.0)}

              <div class="pt-section">Post Processing</div>
              ${_range('pt-antialiasBlur', 'Anti-Line Blur Filter', 0.0, 1.0, 0.05, 0.30)}

              <div class="pt-section">Craters</div>
              ${_range('pt-craterDensity', 'Crater Frequency', 0.0, 4.0, 0.1, 0.8)}
              ${_range('pt-craterDepth', 'Crater Depth', 0.0, 1.0, 0.05, 0.40)}

              <div class="pt-section">Manual View Angle</div>
              ${_range('pt-latTilt', 'Tilt Angle (Latitude)', -90, 90, 1, 20, '°')}
              ${_range('pt-lonRot', 'Rotation (Longitude)', -180, 180, 1, -25, '°')}

              <div class="pt-section">Lighting</div>
              ${_range('pt-sunAzimuth', 'Sun Direction (Azimuth)', -180, 180, 1, -35, '°')}
              ${_range('pt-sunElevation', 'Sun Elevation', -40, 90, 1, 35, '°')}
              ${_range('pt-terminatorSoftness', 'Terminator Softness', 0.02, 0.6, 0.02, 0.18)}
              ${_range('pt-nightDarkness', 'Night Side Darkness', 0.0, 1.0, 0.05, 0.92)}
              ${_range('pt-oceanSpecular', 'Ocean Glint', 0.0, 1.0, 0.05, 0.35)}

            </div>
          </div>
          <div class="tc-canvas-area">
            <div class="pt-canvas-wrap">
              <canvas id="pt-canvas" class="pt-canvas" width="${CANVAS_SIZE}" height="${CANVAS_SIZE}"></canvas>
            </div>
          </div>
        </div>
      </div>`;

    _el.overlay = document.createElement('div');
    _el.overlay.className = 'tc-overlay';
    _el.overlay.id = 'pt-overlay';
    _el.overlay.innerHTML = html;
    document.body.appendChild(_el.overlay);

    // Grab element refs
    const ids = [
      'depthScale','landTexture','seaTexture',
      'cWater','cWaterDeep','cLand','cMountain','cPeak','cSplat','cDesert','cShore','cIce','cGlow',
      'hueShift','saturation','brightness',
      'lavaIncandescence','lavaGlow',
      'seaLevel','scaleBase','islandCount','ridgeSharp','coastIrregularity',
      'splatDensity','splatScale','splatDepth','desertSize','desertSoftness','shoreThickness',
      'iceCapSize','iceOpacity','iceSharpness',
      'antialiasBlur','craterDensity','craterDepth',
      'latTilt','lonRot',
      'sunAzimuth','sunElevation','terminatorSoftness','nightDarkness','oceanSpecular'
    ];
    ids.forEach(id => { _el[id] = document.getElementById('pt-' + id); });
    const valIds = [
      'depthScale','seaLevel','scaleBase','islandCount','ridgeSharp','iceCapSize','iceOpacity','iceSharpness',
      'lavaIncandescence','lavaGlow','antialiasBlur','craterDensity','craterDepth','latTilt','lonRot',
      'coastIrregularity','splatDensity','splatScale','splatDepth','desertSize','desertSoftness','shoreThickness',
      'sunAzimuth','sunElevation','terminatorSoftness','nightDarkness','oceanSpecular','hueShift','saturation','brightness'
    ];
    valIds.forEach(id => { _el[id + 'Val'] = document.getElementById('pt-' + id + '-val'); });

    canvas = document.getElementById('pt-canvas');
    ctx = canvas.getContext('2d');

    // Wire up controls
    ids.forEach(id => {
      const el = _el[id];
      if (!el) return;
      el.addEventListener('input', () => {
        if (el.type === 'range') _updateRangeFill(el);
        isDragging = true;
        clearTimeout(debounceTimer);
        scheduleGenerate(true);
        debounceTimer = setTimeout(() => { isDragging = false; scheduleGenerate(false); }, 120);
      });
      el.addEventListener('change', () => {
        isDragging = false;
        clearTimeout(debounceTimer);
        scheduleGenerate(false);
      });
      if (el.type === 'range') _updateRangeFill(el);
    });

    _el.overlay.querySelectorAll('.pt-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    _el.overlay.querySelectorAll('.pt-view-btn').forEach(btn => {
      btn.addEventListener('click', () => setView(parseFloat(btn.dataset.lat), parseFloat(btn.dataset.lon)));
    });

    document.getElementById('pt-close').addEventListener('click', close);
    document.getElementById('pt-export').addEventListener('click', exportPlanetPNG);
  }

  // ── Public API ─────────────────────────────────────────────────────
  function open() {
    if (!_el.overlay) _build();
    _open = true;
    _el.overlay.classList.add('open');
    requestAnimationFrame(() => scheduleGenerate(false));
  }

  function close() {
    _open = false;
    if (_el.overlay) _el.overlay.classList.remove('open');
  }

  return { open, close };
})();
