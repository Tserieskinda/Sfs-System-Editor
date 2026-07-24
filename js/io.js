// ════════════════════════════════ LOAD FILES ════════════════════════════════
// ════════════════════════════════ LOAD FILES ════════════════════════════════

// Lenient fixups applied to every Planet Data / preset .txt before JSON.parse.
// Beyond the usual Unity JsonUtility quirks (trailing commas, bare decimals,
// NaN/Infinity), this also normalises invisible Unicode whitespace: some
// human hand-edited or copy-pasted files end up with non-breaking spaces
// (U+00A0), zero-width spaces, or a BOM in place of plain ASCII whitespace —
// invisible in any text editor, but JSON.parse's whitespace rule is strict
// ASCII-only (space/tab/CR/LF), so those files fail to parse with an opaque
// "Expecting property name" error at the very first indented line.
function _sfsLenientJsonFix(raw){
  return raw
    .replace(/\uFEFF/g, '')                  // BOM
    .replace(/[\u200B-\u200D]/g, '')         // zero-width space / ZWNJ / ZWJ
    .replace(/\p{Zs}/gu, ' ')                // any Unicode space separator (NBSP, thin space, em space, ideographic space, etc.) → regular space
    .replace(/,\s*([}\]])/g, '$1')           // trailing commas
    .replace(/(\d)\.(?=[,\s}\]])/g, '$10')   // bare decimals: 0. → 0.0
    .replace(/:\s*Infinity\b/g,  ': 1e38')   // Unity JsonUtility Infinity
    .replace(/:\s*-Infinity\b/g, ': -1e38')  // Unity JsonUtility -Infinity
    .replace(/:\s*NaN\b/g,       ': 0');     // Unity JsonUtility NaN
}

// Detects the pre-1.5 "●"-delimited legacy planet format (see the game's own
// SFS.World.Legacy.LegacyConverter). These files don't parse as JSON at all —
// they're a flat "BASE_DATA●{...}●ORBIT_DATA●{...}" blob — so they need to be
// run through the separate Legacy Planet Converter tool before they can be
// used here.
function _isLegacyPlanetText(raw){
  return typeof raw === 'string' && raw.indexOf('●') !== -1 && raw.indexOf('BASE_DATA') !== -1;
}

// Cheap peek at a legacy blob — just enough to know whether it has orbit
// data and how big it is, WITHOUT running the full conversion. Used so
// centre-election during an import can take not-yet-converted legacy files
// into account instead of only ever picking from already-parsed files.
function _lcPeekLegacyInfo(raw){
  try{
    const parts = raw.split('●');
    const hasOrbit = parts.includes('ORBIT_DATA');
    const bi = parts.indexOf('BASE_DATA');
    let radius = 0;
    if(bi !== -1 && parts[bi+1]) radius = (JSON.parse(parts[bi+1]).radius) || 0;
    return { hasOrbit, radius };
  } catch(e){
    return { hasOrbit: true, radius: 0 }; // unreadable — assume it has an orbit so it's never wrongly treated as a centre candidate
  }
}

// Holds whatever's needed to actually convert+register the file(s) currently
// shown in the legacy-format notice, set right before showLegacyFormatNotice()
// is called and consumed by runLegacyConversion() when the user hits Convert.
//   { kind: 'addBody'|'zip-system'|'zip-import'|'zip-asset', items: [...], ctx: {...} }
let _legacyPending = null;

// ── Legacy-format notice modal ──────────────────────────────────────────────
// Shown whenever Add Body or a zip upload encounters a pre-1.5 planet file.
// The file is skipped from the normal load, and the user is told, by name,
// which file(s) need converting — with a one-click Convert button that runs
// them through the same conversion the game's own legacy converter does.
function showLegacyFormatNotice(fileNames, context){
  fileNames = (fileNames || []).filter(Boolean);
  if(!fileNames.length) return;
  const dlg = document.getElementById('legacy-notice-modal');
  if(!dlg){
    alert('Legacy (pre-1.5) planet file(s) detected — these need to be converted before they can be used:\n' + fileNames.join('\n'));
    return;
  }
  const listEl = document.getElementById('legacy-notice-list');
  const subEl  = document.getElementById('legacy-notice-sub');
  if(listEl){
    listEl.innerHTML = '';
    fileNames.forEach(n => {
      const row = document.createElement('div');
      row.className = 'pg-dialog-body-item';
      row.style.cursor = 'default';
      row.innerHTML = `<span class="pg-dialog-body-name">${String(n).replace(/</g,'&lt;')}</span><span class="pg-dialog-body-type" style="color:var(--amber)">legacy</span>`;
      listEl.appendChild(row);
    });
  }
  if(subEl){
    subEl.textContent = fileNames.length === 1
      ? 'This file uses the old pre-1.5 format. Click Convert to fix it up and add it — everything else stays untouched.'
      : `${fileNames.length} file${fileNames.length!==1?'s':''} used the old pre-1.5 format. Click Convert to fix them up and add them — everything already loaded stays untouched.`;
  }
  const convertBtn = document.getElementById('legacy-notice-convert-btn');
  if(convertBtn) convertBtn.style.display = (_legacyPending && _legacyPending.items && _legacyPending.items.length) ? '' : 'none';
  dlg.classList.add('open');
}
function closeLegacyFormatNotice(){
  const dlg = document.getElementById('legacy-notice-modal');
  if(dlg) dlg.classList.remove('open');
  _legacyPending = null;
}

// ════════════════════ LEGACY PLANET FORMAT CONVERSION ════════════════════
// Faithful port of the game's own SFS.World.Legacy.LegacyConverter (and of
// the standalone Legacy Planet Converter tool), operating on parsed JS
// objects instead of raw JSON text. Converts the old "●"-delimited pre-1.5
// planet blob into the current BASE_DATA/ATMOSPHERE_.../ORBIT_DATA object
// this app already knows how to read.

// Mirrors LegacyConverter.Convert_TerrainFormula.
// Original regex: AddHeightMap\( *\S*,(?<repeat> *\d*\.*\d*)
function _lcConvertTerrainFormula(radius, formula){
  const re = /AddHeightMap\( *\S*,( *\d*\.*\d*)/;
  return (formula || []).map(line => {
    const m = re.exec(line);
    if(!m) return line;
    const group = m[1];
    const groupStart = m.index + m[0].length - group.length;
    const groupEnd = groupStart + group.length;
    const val = parseFloat(group.trim());
    if(isNaN(val)) return line; // couldn't parse — left untouched, matching the original fallback
    const num = radius * Math.PI * 2 / Math.max(val, 0.01);
    return line.slice(0, groupStart) + _lcNumToStr(num) + line.slice(groupEnd);
  });
}
// Approximates C# double.ToString(CultureInfo.InvariantCulture)
function _lcNumToStr(n){
  if(!isFinite(n)) return "0";
  if(Number.isInteger(n)) return n.toString();
  let s = n.toString();
  if(s.includes('e') || s.includes('E')) s = n.toFixed(10).replace(/0+$/,'').replace(/\.$/,'');
  return s;
}
function _lcVec2(v){ return { x: (v && v.x !== undefined) ? v.x : -1, y: (v && v.y !== undefined) ? v.y : -1 }; }

function _lcConvertBasic(old){
  if(!old) return null;
  return {
    radius: old.radius,
    radiusDifficultyScale: {},
    gravity: old.gravity,
    gravityDifficultyScale: {},
    timewarpHeight: old.timewarpHeight,
    velocityArrowsHeight: null,
    mapColor: { r: old.mapColor?.r ?? 0.5, g: old.mapColor?.g ?? 0.5, b: old.mapColor?.b ?? 0.5, a: 1 },
    significant: true,
    rotateCamera: true
  };
}
function _lcConvertAtmospherePhysics(old){
  if(!old || !old.PHYSICS) return null;
  return {
    height: old.PHYSICS.height,
    density: old.PHYSICS.density,
    curve: old.PHYSICS.curve,
    curveScale: {},
    parachuteMultiplier: 1,
    upperAtmosphere: 0.5,
    heightDifficultyScale: {},
    shockwaveIntensity: 0.5,
    minHeatingVelocityMultiplier: 1
  };
}
function _lcConvertAtmosphereVisuals(old, radius){
  if(!old) return null;
  const g = old.GRADIENT || {};
  const c = old.CLOUDS || {};
  const fogKeys = (old.FOG && old.FOG.keys) ? old.FOG.keys.map(k => ({
    color: { r: k.r, g: k.g, b: k.b, a: k.a }, distance: k.distance
  })) : [];
  const repeatX = c.repeatX || 1;
  const width = (radius + (c.startHeight || 0)) * (Math.PI * 2) / repeatX / 256;
  return {
    GRADIENT: {
      positionZ: g.positionZ ?? -1, height: g.gradientHeight ?? -1,
      heightDifficultyScale: {}, texture: g.gradientTexture ?? "None"
    },
    CLOUDS: {
      texture: c.cloudTexture ?? "None", startHeight: c.startHeight ?? -1,
      width, height: c.height ?? -1, alpha: c.alpha ?? 1, velocity: c.cloudVelocity ?? 0
    },
    FOG: { keys: fogKeys }
  };
}
function _lcConvertOrbit(old){
  if(!old) return null;
  return {
    parent: old.parent,
    semiMajorAxis: old.orbitHeight,
    smaDifficultyScale: {},
    eccentricity: old.eccentricity,
    argumentOfPeriapsis: old.argumentOfPeriapsis,
    direction: 1,
    multiplierSOI: old.multiplierSOI ?? 1,
    soiDifficultyScale: {}
  };
}
function _lcConvertPostProcessing(old){
  if(!old || !old.keys) return null;
  return {
    keys: old.keys.map(k => ({
      height: k.height, shadowIntensity: k.shadowIntensity ?? 1.65, starIntensity: 1,
      hueShift: k.hueShift ?? 0, saturation: k.saturation ?? 1, contrast: k.contrast ?? 1.1,
      red: k.red ?? 1, green: k.green ?? 1, blue: k.blue ?? 1
    }))
  };
}
function _lcConvertTerrain(old, radius){
  if(!old) return null;
  const t = old.TERRAIN_TEXTURE_DATA || {};
  const formula = _lcConvertTerrainFormula(radius, old.terrainFromula);
  const textureFormula = _lcConvertTerrainFormula(radius, old.textureFormula);
  const detailLevels = old.DETAIL_LEVELS || [];
  const verticeSize = detailLevels.length ? detailLevels[detailLevels.length - 1].verticeSize : 0;
  return {
    TERRAIN_TEXTURE_DATA: {
      planetTexture: t.planetTexture ?? "None",
      planetTextureCutout: t.planetTextureCutout ?? -1,
      planetTextureRotation: 0,
      planetTextureDontDistort: false,
      surfaceTexture_A: t.surfaceTextureA ?? "None",
      surfaceTextureSize_A: _lcVec2(t.surfaceTextureSizeA),
      surfaceTexture_B: t.surfaceTextureB ?? "None",
      surfaceTextureSize_B: _lcVec2(t.surfaceTextureSizeB),
      terrainTexture_C: t.terrainTexture ?? "None",
      terrainTextureSize_C: _lcVec2(t.terrainTextureSize),
      surfaceLayerSize: t.surfaceLayerSize ?? -1,
      minFade: t.minFade ?? -1,
      maxFade: t.maxFade ?? -1,
      shadowIntensity: t.shadowIntensity ?? -1,
      shadowHeight: t.shadowHeight ?? -1
    },
    terrainFormulaDifficulties: { "Normal": formula },
    textureFormula,
    verticeSize,
    collider: true,
    flatZones: [],
    flatZonesDifficulties: {},
    rocks: null
  };
}
// Mirrors LegacyConverter.FromJson_Old — splits the "●"-delimited blob into
// named JSON sections and parses each one.
function _lcParseOldBlob(text){
  const parts = text.split('●');
  const grab = (marker) => {
    const i = parts.indexOf(marker);
    if(i === -1 || i + 1 >= parts.length) return null;
    return JSON.parse(parts[i + 1]);
  };
  const old = {};
  old.BASE_DATA = grab('BASE_DATA');
  old.hasAtmosphere = parts.includes('ATMOSPHERE_DATA');
  old.ATMOSPHERE_DATA = old.hasAtmosphere ? grab('ATMOSPHERE_DATA') : null;
  old.hasPostProcessing = parts.includes('POST_PROCESSING');
  old.POST_PROCESSING = old.hasPostProcessing ? grab('POST_PROCESSING') : null;
  old.hasTerrain = parts.includes('TERRAIN_DATA');
  old.TERRAIN_DATA = old.hasTerrain ? grab('TERRAIN_DATA') : null;
  old.hasOrbitData = parts.includes('ORBIT_DATA');
  old.ORBIT_DATA = old.hasOrbitData ? grab('ORBIT_DATA') : null;
  if(!old.BASE_DATA) throw new Error('No BASE_DATA section found — not a recognized legacy planet file.');
  return old;
}
// Mirrors LegacyConverter.Convert_Planet — top-level: raw legacy text in, a
// current-format bodyData-shaped object out.
function _lcConvertLegacyText(raw){
  const old = _lcParseOldBlob(raw);
  const radius = old.BASE_DATA.radius;
  const hasAtmospherePhysics = old.hasAtmosphere && old.ATMOSPHERE_DATA?.PHYSICS?.height > 1.0;
  const out = { version: "1.5", BASE_DATA: _lcConvertBasic(old.BASE_DATA) };
  if(hasAtmospherePhysics) out.ATMOSPHERE_PHYSICS_DATA = _lcConvertAtmospherePhysics(old.ATMOSPHERE_DATA);
  if(old.hasAtmosphere) out.ATMOSPHERE_VISUALS_DATA = _lcConvertAtmosphereVisuals(old.ATMOSPHERE_DATA, radius);
  if(old.hasTerrain) out.TERRAIN_DATA = _lcConvertTerrain(old.TERRAIN_DATA, radius);
  if(old.hasPostProcessing) out.POST_PROCESSING = _lcConvertPostProcessing(old.POST_PROCESSING);
  if(old.hasOrbitData) out.ORBIT_DATA = _lcConvertOrbit(old.ORBIT_DATA);
  out.ACHIEVEMENT_DATA = { Landed: true, Takeoff: true, Atmosphere: true, Orbit: true, Crash: true };
  out.LANDMARKS = [];
  return out;
}

// Converts a batch of {fileName, raw} items, resolving name collisions
// against the currently-loaded bodies AND against each other (so two legacy
// files that reference one another as parent, both being converted in the
// same click, still point at the right final names).
function _lcConvertBatch(items){
  const results = [];
  const failed = [];
  const nameMap = {}; // original base name → final registered name
  const claimed = new Set(Object.keys(bodies));
  (items || []).forEach(item => {
    try{
      const bodyData = normalizeDiffScaleKeys(_lcConvertLegacyText(item.raw));
      const baseName = (item.fileName || 'Body').replace(/\.txt$/i, '').trim() || 'Body';
      let finalName = baseName;
      if(claimed.has(finalName)){
        let n = 2;
        while(claimed.has(baseName + '_' + n)) n++;
        finalName = baseName + '_' + n;
      }
      claimed.add(finalName);
      nameMap[baseName] = finalName;
      results.push({ fileName: item.fileName, baseName, name: finalName, bodyData, item });
    } catch(e){
      console.error('[SFS|LEGACY] failed to convert', item.fileName, e);
      failed.push(item.fileName);
    }
  });
  // Rewrite parent references among the converted batch itself
  results.forEach(r => {
    const p = r.bodyData.ORBIT_DATA?.parent;
    if(p && nameMap[p] && nameMap[p] !== p) r.bodyData.ORBIT_DATA.parent = nameMap[p];
  });
  return { results, failed, nameMap };
}

// Re-elects the system centre (largest body with no orbit data) after adding
// recovered bodies — mirrors the election loadZipFile already does once.
function _lcReElectCenter(){
  const noOrbitEntries = Object.entries(bodies).filter(([,b]) => !b.data.ORBIT_DATA);
  Object.values(bodies).forEach(b => { if(!b.data.ORBIT_DATA) b.isCenter = false; });
  if(noOrbitEntries.length > 0){
    noOrbitEntries.sort(([,a],[,b]) => ((b.data.BASE_DATA||{}).radius||0) - ((a.data.BASE_DATA||{}).radius||0));
    noOrbitEntries[0][1].isCenter = true;
  }
  const emptyState = document.getElementById('empty-state');
  if(emptyState){
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    emptyState.classList.toggle('gone', hasCenter);
  }
}
function _lcRefreshUiAfterBodyChange(){
  if(typeof fillSidebar === 'function') fillSidebar();
  if(typeof updateStatusBar === 'function') updateStatusBar();
  if(typeof syncAddBodyBtn === 'function') syncAddBodyBtn();
  if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
  if(typeof prsRefreshSystemTab === 'function') prsRefreshSystemTab();
  if(typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
  if(typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
  if(typeof drawViewport === 'function') drawViewport();
}

// ── kind: 'addBody' — single file added through the sidebar Add Body flow ──
function _lcApplyAddBodyConversion(pending){
  const item = pending.items[0];
  const bodyData = normalizeDiffScaleKeys(_lcConvertLegacyText(item.raw));
  if(typeof _lcFinishAddBody === 'function') _lcFinishAddBody(bodyData, item.fileName);
  return { added: [item.fileName], failed: [] };
}

// ── kind: 'zip-system' — main "Load System" zip ──
function _lcApplyZipSystemConversion(pending){
  const { results, failed } = _lcConvertBatch(pending.items);
  results.forEach(r => {
    const _meta = inferPresetMeta(r.name, r.bodyData);
    bodies[r.name] = { data: r.bodyData, preset: _meta.id, isCenter: false, color: _meta.color, glow: _meta.glow, icon: _meta.icon };
  });
  if(results.length){
    _lcReElectCenter();
    if(typeof systemPresets !== 'undefined'){
      Object.keys(systemPresets).forEach(k => delete systemPresets[k]);
      Object.entries(bodies).forEach(([n,b]) => { systemPresets[n] = JSON.parse(JSON.stringify(b.data)); });
    }
    _lcRefreshUiAfterBodyChange();
  }
  return { added: results.map(r => r.name), failed };
}

// ── kind: 'zip-import' — "Import System" merge zip ──
// Replays the same parent-rewrite + merge-mode (barycentre / orbit-existing /
// orbit-chosen) logic importSystemZip already applied to the files that
// parsed fine the first time, so recovered legacy bodies slot in identically.
//
// If the import's centre resolution was ambiguous (ctx.deferredCentreName
// set — see importSystemZip), this also resolves which body is really the
// centre: the withheld non-legacy body, or a newly-converted legacy one —
// by the same "largest no-orbit body wins" rule used everywhere else.
function _lcApplyZipImportConversion(pending){
  const ctx = pending.ctx || {};
  const AU_m = 1.496e11;
  const { results, failed } = _lcConvertBatch(pending.items);

  // Repoint parents at whichever names the ORIGINAL (already-committed) import
  // resolved to, for bodies that parsed fine the first time around.
  results.forEach(r => {
    const p = r.bodyData.ORBIT_DATA?.parent;
    if(p && ctx.renamed && ctx.renamed[p]) r.bodyData.ORBIT_DATA.parent = ctx.renamed[p];
  });

  // ── Resolve the true import centre among every remaining candidate ──
  const candidates = [];
  if(ctx.deferredCentreName && bodies[ctx.deferredCentreName] && !bodies[ctx.deferredCentreName].data.ORBIT_DATA){
    candidates.push({
      existing: true, name: ctx.deferredCentreName, ref: bodies[ctx.deferredCentreName].data,
      radius: (bodies[ctx.deferredCentreName].data.BASE_DATA||{}).radius || 0
    });
  }
  results.forEach(r => {
    if(!r.bodyData.ORBIT_DATA){
      candidates.push({ existing: false, name: r.name, ref: r.bodyData, radius: (r.bodyData.BASE_DATA||{}).radius || 0 });
    }
  });
  candidates.sort((a,b) => b.radius - a.radius);
  const winner = candidates[0] || null;

  function applyMergeMode(targetRef){
    if(ctx.opt === 'a'){
      const baryName = _uniqueName('Barycentre', bodies);
      const barySMA = (ctx.baryAU || 10) * AU_m;
      if(ctx.exCentreName && bodies[ctx.exCentreName]){
        bodies[ctx.exCentreName].isCenter = false;
        bodies[ctx.exCentreName].data.ORBIT_DATA = {
          parent: baryName, semiMajorAxis: barySMA * 0.5,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }
      targetRef.ORBIT_DATA = {
        parent: baryName, semiMajorAxis: barySMA * 0.5,
        eccentricity: 0, argumentOfPeriapsis: 180, direction: 1,
        multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
      };
      bodies[baryName] = {
        data: { BASE_DATA: { radius: 1000, gravity: 0, gravityDifficultyScale: {}, radiusDifficultyScale: {}, bodyType: 0 } },
        preset: 'asteroid', isCenter: true, color: '#aaaaaa', glow: false, icon: '⚫'
      };
    } else if(ctx.opt === 'b'){
      targetRef.ORBIT_DATA = {
        parent: ctx.exCentreName || Object.keys(bodies)[0] || winner.name,
        semiMajorAxis: (ctx.bAU || 20) * AU_m,
        eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
        multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
      };
    } else if(ctx.opt === 'c'){
      const parentName = ctx.cParent && bodies[ctx.cParent] ? ctx.cParent : (ctx.exCentreName || Object.keys(bodies)[0] || winner.name);
      targetRef.ORBIT_DATA = {
        parent: parentName, semiMajorAxis: (ctx.cAU || 5) * AU_m,
        eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
        multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
      };
    }
    // opt not set (nothing to merge against, e.g. the whole zip was legacy) —
    // leave it centre-less; it becomes the outright new system centre below.
  }

  if(winner) applyMergeMode(winner.ref);

  // Any OTHER centre-less candidates beyond the winner (rare — a malformed
  // zip with more than one star-like body) fall back to orbiting the winner
  // rather than being left stranded with no orbit at all.
  candidates.forEach(c => {
    if(c === winner || c.ref.ORBIT_DATA) return;
    c.ref.ORBIT_DATA = {
      parent: winner ? winner.name : (Object.keys(bodies)[0] || c.name),
      semiMajorAxis: (ctx.bAU || 20) * AU_m,
      eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
      multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
    };
  });

  // Non-ambiguous case: the import already had a resolved (non-legacy) centre
  // from the start, so any recovered legacy body lacking orbit data just
  // needs a sane default orbit around it (no centre contest to run here).
  if(!candidates.length && ctx.importedCentreName){
    results.forEach(r => {
      if(!r.bodyData.ORBIT_DATA){
        r.bodyData.ORBIT_DATA = {
          parent: ctx.importedCentreName, semiMajorAxis: (ctx.bAU || 20) * AU_m,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }
    });
  }

  // ── Register newly-converted bodies ──
  results.forEach(r => {
    const _meta = inferPresetMeta(r.name, r.bodyData);
    const isWinner = !!(winner && !winner.existing && winner.name === r.name);
    bodies[r.name] = {
      data: r.bodyData, preset: _meta.id,
      // Winner only stays "centre" if merge mode left it without an orbit
      // (e.g. nothing to merge against); modes a/b/c give it an orbit and
      // hand centre duty to the barycentre / existing centre instead.
      isCenter: isWinner && !r.bodyData.ORBIT_DATA,
      color: _meta.color, glow: _meta.glow, icon: _meta.icon
    };
  });

  // If the withheld non-legacy body turned out to be the real centre, mark it
  // accordingly (same rule: only centre if it ended up without an orbit).
  if(winner && winner.existing) bodies[winner.name].isCenter = !winner.ref.ORBIT_DATA;

  if(results.length || winner){
    _lcRefreshUiAfterBodyChange();
    const emptyState = document.getElementById('empty-state');
    if(emptyState && Object.values(bodies).some(b => b.isCenter)) emptyState.classList.add('gone');
  }
  return { added: results.map(r => r.name), failed };
}

// ── kind: 'zip-asset' — Preset Library / texture-pack asset zips ──
function _lcApplyZipAssetConversion(pending){
  const added = [];
  const failed = [];
  (pending.items || []).forEach(item => {
    try{
      const bodyData = normalizeDiffScaleKeys(_lcConvertLegacyText(item.raw));
      const pname = (item.fileName || 'Body').replace(/\.txt$/i, '').trim();
      if(item.namedCategory){
        if(!dynamicPresetSources[item.namedCategory]) dynamicPresetSources[item.namedCategory] = { presets: {}, zipName: item.zipName };
        dynamicPresetSources[item.namedCategory].presets[pname] = bodyData;
      } else {
        const cat = (typeof _presetCategory === 'function' ? _presetCategory(item.pathLower || '', (item.zipName || '').toLowerCase()) : null) || 'custom';
        dynamicPresets[cat][pname] = bodyData;
      }
      added.push(pname);
    } catch(e){
      console.error('[SFS|LEGACY] failed to convert preset', item.fileName, e);
      failed.push(item.fileName);
    }
  });
  if(added.length){
    if(typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
    if(typeof updateAssetEmptyState === 'function') updateAssetEmptyState();
    if(typeof prsRebuild === 'function') prsRebuild();
    if(typeof drawViewport === 'function') drawViewport();
  }
  return { added, failed };
}

// Entry point wired to the notice modal's Convert button.
function runLegacyConversion(){
  const pending = _legacyPending;
  if(!pending || !pending.items || !pending.items.length){ closeLegacyFormatNotice(); return; }

  let outcome;
  try{
    if(pending.kind === 'addBody') outcome = _lcApplyAddBodyConversion(pending);
    else if(pending.kind === 'zip-system') outcome = _lcApplyZipSystemConversion(pending);
    else if(pending.kind === 'zip-import') outcome = _lcApplyZipImportConversion(pending);
    else if(pending.kind === 'zip-asset') outcome = _lcApplyZipAssetConversion(pending);
    else outcome = { added: [], failed: pending.items.map(i => i.fileName) };
  } catch(e){
    console.error('[SFS|LEGACY] conversion failed:', e);
    alert('Conversion failed: ' + e.message);
    _legacyPending = null;
    closeLegacyFormatNotice();
    return;
  }

  _legacyPending = null;
  closeLegacyFormatNotice();

  const addedN = outcome.added.length;
  const failedN = outcome.failed.length;
  if(addedN) console.log(`[SFS|LEGACY] converted and added ${addedN} file(s):`, outcome.added);
  if(failedN) alert(`${failedN} file${failedN!==1?'s':''} could not be converted:\n` + outcome.failed.join('\n'));
}

// ════════════════════════════════ ZIP READER ════════════════════════════════
// Parses a ZIP file (stored or deflated entries) and returns
// { "path/in/zip": Uint8Array } for every file entry.
function parseZip(buffer){
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const files = {};

  // Find End of Central Directory record by scanning backwards
  let eocdOff = -1;
  for(let i = buffer.byteLength - 22; i >= 0; i--){
    if(view.getUint32(i, true) === 0x06054b50){ eocdOff = i; break; }
  }
  if(eocdOff < 0) throw new Error('Not a valid ZIP file');

  const cdCount  = view.getUint16(eocdOff + 8,  true);
  const cdSize   = view.getUint32(eocdOff + 12, true);
  const cdOffset = view.getUint32(eocdOff + 16, true);

  let off = cdOffset;
  for(let i = 0; i < cdCount; i++){
    if(view.getUint32(off, true) !== 0x02014b50) break; // central dir signature
    const compression   = view.getUint16(off + 10, true);
    const compSize      = view.getUint32(off + 20, true);
    const uncompSize    = view.getUint32(off + 24, true);
    const nameLen       = view.getUint16(off + 28, true);
    const extraLen      = view.getUint16(off + 30, true);
    const commentLen    = view.getUint16(off + 32, true);
    const localOffset   = view.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.slice(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;

    // Skip directory entries
    if(name.endsWith('/') || uncompSize === 0 && compSize === 0) continue;

    // Read from local file header
    const lhNameLen  = view.getUint16(localOffset + 26, true);
    const lhExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart  = localOffset + 30 + lhNameLen + lhExtraLen;

    if(compression === 0){
      // Stored — raw bytes
      files[name] = bytes.slice(dataStart, dataStart + uncompSize);
    } else if(compression === 8){
      // Deflate — use DecompressionStream
      // We'll handle this asynchronously; for now store compressed + metadata
      files[name] = { compressed: bytes.slice(dataStart, dataStart + compSize), uncompSize };
    } else {
      console.warn('Unsupported compression for', name, 'method', compression);
    }
  }
  return files;
}

function setLoadingMsg(msg){ document.getElementById('loading-msg').textContent = msg; }
function setLoadingTitle(t){ document.getElementById('loading-title').textContent = t; }
function showLoading(){ document.getElementById('loading-overlay').classList.add('show'); }
function hideLoading(){ document.getElementById('loading-overlay').classList.remove('show'); }

function showLoadingBars(){ document.getElementById('loading-bars').style.display = ''; }
function hideLoadingBars(){ document.getElementById('loading-bars').style.display = 'none'; }

function setBar1(pct, label){
  const fill = document.getElementById('bar1-fill');
  const pctEl = document.getElementById('bar1-pct');
  const labelEl = document.getElementById('bar1-label');
  if(fill){ fill.style.width = pct + '%'; if(pct>=100) fill.classList.add('complete'); else fill.classList.remove('complete'); }
  if(pctEl) pctEl.textContent = Math.round(pct) + '%';
  if(label && labelEl) labelEl.textContent = label;
}
function setBar2(pct, label){
  const fill = document.getElementById('bar2-fill');
  const pctEl = document.getElementById('bar2-pct');
  const labelEl = document.getElementById('bar2-label');
  if(fill){ fill.style.width = pct + '%'; if(pct>=100) fill.classList.add('complete'); else fill.classList.remove('complete'); }
  if(pctEl) pctEl.textContent = pct === null ? '—' : Math.round(pct) + '%';
  if(label && labelEl) labelEl.textContent = label;
}

// Yield to the browser so it can repaint and stay responsive
function _yield(){ return new Promise(r => setTimeout(r, 0)); }

// Memory-safe Uint8Array → base64 string.
// btoa(Array.from(data).map(…).join('')) builds a single giant string that OOMs
// on weak mobile devices for large textures.  This version processes 32 KB at a
// time and is safe even for multi-MB images.
function bytesToBase64(bytes){
  const CHUNK = 32768;
  let s = '';
  for(let i = 0; i < bytes.length; i += CHUNK){
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

async function decompressEntries(raw, onProgress){
  const out = {};
  const keys = Object.keys(raw);
  const total = keys.length;
  for(let i = 0; i < total; i++){
    const name = keys[i];
    const val = raw[name];
    if(val instanceof Uint8Array){
      out[name] = val;
    } else {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const writer = ds.writable.getWriter();
        writer.write(val.compressed);
        writer.close();
        const chunks = [];
        const reader = ds.readable.getReader();
        while(true){
          const {done, value} = await reader.read();
          if(done) break;
          chunks.push(value);
        }
        const full = new Uint8Array(val.uncompSize);
        let off2 = 0;
        for(const c of chunks){ full.set(c, off2); off2 += c.length; }
        out[name] = full;
      } catch(e){ console.warn('Decompress failed:', name, e); }
    }
    // Yield every 8 entries to let the browser repaint
    if(i % 8 === 0){
      if(onProgress) onProgress((i + 1) / total * 100);
      await _yield();
    }
  }
  if(onProgress) onProgress(100);
  return out;
}

function handleZipDrop(e){
  e.preventDefault();
  document.getElementById('zip-drop-zone').classList.remove('drag-over');
  const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.zip'));
  if(!file){ alert('Please drop a .zip file.'); return; }
  loadZipFile(file);
}

async function loadZipFile(file){
  if(!file) return;
  // Reset the file input immediately so the same file can be picked again on mobile
  const _fiZip = document.getElementById('fi-zip');
  if(_fiZip) _fiZip.value = '';
  showLoading(); setLoadingMsg('Reading zip…');

  try{
    const buffer = await file.arrayBuffer();
    setLoadingMsg('Parsing entries…');

    // Warn before clearing an active session
    if(Object.keys(bodies).length > 0){
      hideLoading(); hideLoadingBars();
      if(!confirm('Clear current system and load "' + file.name + '"?')){
        return; // user cancelled
      }
      showLoading(); setLoadingMsg('Parsing entries…');
    }

    showLoadingBars();
    setBar1(0, 'DECOMPRESSING');
    setBar2(0, 'LOADING BODIES');
    const rawEntries = parseZip(buffer);
    setLoadingMsg('Decompressing…');
    const entries = await decompressEntries(rawEntries, pct => setBar1(pct));

    const dec = bytes => new TextDecoder().decode(bytes);

    // Reset state — but preserve any asset-zip textures (vanilla/custom) that were
    // loaded before this system zip.  We snapshot them, wipe per-body state, then
    // restore so vanilla textures survive a system reload.
    const _savedTexCache    = Object.assign({}, textureCache);
    const _savedTexAssets   = assets.textures.slice();
    const _savedTexPixCache = Object.assign({}, texPixelCache);

    bodies = {};
    assets.textures = [];
    assets.heightmaps = []; assets.other = [];
    undoStack = [];
    _sfsDbgLogged = {}; // reset per-body draw warnings
    // Clear heightmap + terrain caches so entries from this system are re-parsed fresh.
    if(typeof _hmCache !== 'undefined') Object.keys(_hmCache).forEach(k => delete _hmCache[k]);
    if(typeof invalidateTerrainCache === 'function') invalidateTerrainCache('*');
    // Clear textureCache so stale textures from a previous load don't linger,
    // then immediately restore the asset-zip textures.
    Object.keys(textureCache).forEach(k => delete textureCache[k]);
    Object.keys(texPixelCache).forEach(k => delete texPixelCache[k]);
    Object.assign(textureCache,    _savedTexCache);
    Object.assign(texPixelCache,   _savedTexPixCache);
    // Restore asset-zip entries into assets.textures (system-zip textures will be added below)
    _savedTexAssets.forEach(e => assets.textures.push(e));
    console.log(`[SFS|LOAD] state reset — preserved ${Object.keys(_savedTexCache).length} asset-zip texture(s), textureCache: [${Object.keys(textureCache).join(',')}]`);
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('undo-btn').classList.remove('undo-active');
    const _agridTex = document.getElementById('agrid-textures'); if(_agridTex) _agridTex.innerHTML='';
    document.getElementById('alist-heightmaps').innerHTML = '';
    document.getElementById('alist-other').innerHTML = '';
    // Re-render thumbs for any asset-zip textures that survived the reset
    _savedTexAssets.forEach(e => renderAssetThumb(e));
    refreshTexPickerLists();

    // Bulk mode: suppress per-texture redraws inside the decode queue.
    // loadZipFile can contain dozens of Texture Data images; without this flag
    // every cacheTexture() fires drawViewport+refreshTexPickerLists immediately
    // after each decode — cascading reflows that exhaust memory on low-end devices.
    _bulkLoadActive = true;

    let planetCount = 0;
    const legacyFiles = []; // pre-1.5 format files found — skipped, reported at the end
    const entryKeys = Object.keys(entries);
    const entryTotal = entryKeys.length || 1;
    let entryIdx = 0;
    // Textures whose thumbs need rendering after the main loop (deferred to avoid
    // hammering the DOM and GC with 70+ image decodes in one synchronous burst).
    const _deferredThumbs = [];
    // Count of textures processed this batch, used to yield periodically.
    let _texBatchCount = 0;

    for(const [path, data] of Object.entries(entries)){
      entryIdx++;
      setBar2(entryIdx / entryTotal * 100);
      const parts = path.split('/');
      // Normalise: strip leading system folder if present
      // path could be: "Sun/Planet Data/Earth.txt" or "Planet Data/Earth.txt"
      const folder = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      const filename = parts[parts.length - 1];

      setLoadingMsg(`Loading ${filename}…`);

      if(folder === 'Planet Data' && filename.endsWith('.txt')){
        try{
          const raw = dec(data);
          const name = filename.replace('.txt','');
          if(name === 'Import_Settings'){ systemSettings.importSettings = JSON.parse(_sfsLenientJsonFix(raw)); continue; }
          if(name === 'Space_Center_Data'){ systemSettings.spaceCenterData = JSON.parse(_sfsLenientJsonFix(raw)); continue; }
          if(name === 'Version') continue;
          if(_isLegacyPlanetText(raw)){ legacyFiles.push({ fileName: filename, raw }); continue; }
          // Lenient parse: normalise invisible whitespace, strip trailing commas,
          // fix bare decimals, Unity Infinity/NaN
          const _fixedRaw = _sfsLenientJsonFix(raw);
          const bodyData = normalizeDiffScaleKeys(JSON.parse(_fixedRaw));
          // isCenter determined later — first pass just stores data
          const lacksOrbit = !bodyData.ORBIT_DATA;
          const r   = bodyData.BASE_DATA?.radius || 0;
          const hasAtmo = !!bodyData.ATMOSPHERE_PHYSICS_DATA;
          let pid = 'planet';
          if(lacksOrbit)                             pid = 'star';
          else if(bodyData.RINGS_DATA)               pid = 'ringedgiant';
          else if(r < 500)                           pid = 'asteroid';
          else if(r < 200000)                        pid = 'moon';
          else if(hasAtmo && r > 1000000)            pid = 'gasgiant';
          else if(hasAtmo && bodyData.ATMOSPHERE_PHYSICS_DATA.density <= 0.001) pid = 'marslike';
          else if(!hasAtmo && r < 200000)            pid = 'mercurylike';
          const _meta = inferPresetMeta(name, bodyData);
          bodies[name] = { data: bodyData, preset: _meta.id, isCenter: false, _lacksOrbit: lacksOrbit, color: _meta.color, glow: _meta.glow, icon: _meta.icon };
          planetCount++;
        } catch(e){ console.warn('Failed to parse planet', filename, e); }

      } else if(folder === 'Heightmap Data' && filename.endsWith('.txt')){
        const content = dec(data);
        const entry = { name: filename, content, size: data.length };
        assets.heightmaps.push(entry);
        renderAssetRow(entry, 'heightmaps');
        injectCustomHeightmap(filename);

      } else if(folder === 'Heightmap Data' && /\.(png|jpe?g)$/i.test(filename)){
        const ext = filename.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        const entry = { name: filename, url, size: data.length };
        assets.heightmaps.push(entry);
        renderAssetRow(entry, 'heightmaps');
        injectCustomHeightmap(filename);

      } else if(folder === 'Texture Data'){
        const ext = filename.split('.').pop().toLowerCase();
        if(!['png','jpg','jpeg','webp'].includes(ext)) continue;
        console.log(`[SFS|LOAD] found texture in system zip: "${filename}"`);
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
                   : ext === 'webp' ? 'image/webp' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        if(!assets.textures.find(a=>a.name===filename)){
          const entry = { name: filename, url, size: data.length };
          assets.textures.push(entry);
          _deferredThumbs.push(entry);
          const texName = filename.replace(/\.[^.]+$/, '');
          cacheTexture(texName, url);
        }
        // Yield every 4 textures so the browser can breathe and GC can run
        // between base64 allocations — critical on memory-limited mobile devices.
        _texBatchCount++;
        if(_texBatchCount % 4 === 0) await _yield();

      } else if(filename === 'Import_Settings.txt'){
        try{ systemSettings.importSettings = JSON.parse(_sfsLenientJsonFix(dec(data))); } catch(e){}
      } else if(filename === 'Space_Center_Data.txt'){
        try{ systemSettings.spaceCenterData = JSON.parse(_sfsLenientJsonFix(dec(data))); } catch(e){}
      }
    }

    // Wait for decode queue to fully drain before touching the DOM further.
    // cacheTexture() calls above enqueue async Image decodes; rendering thumbs
    // or firing redraws before they finish causes OOM on low-end devices.
    setLoadingMsg('Rendering textures…');
    while(_decodeRunning || _decodeQueue.length > 0){
      await new Promise(r => setTimeout(r, 32));
    }
    _bulkLoadActive = false;

    // Now safe to render texture thumbs in batches of 8 (decode pressure gone).
    for(let _ti = 0; _ti < _deferredThumbs.length; _ti++){
      renderAssetThumb(_deferredThumbs[_ti]);
      if((_ti + 1) % 8 === 0) await _yield();
    }

    if(planetCount === 0){
      hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
      if(legacyFiles.length > 0){
        _legacyPending = { kind: 'zip-system', items: legacyFiles, ctx: { zipFileName: file.name } };
        showLegacyFormatNotice(legacyFiles.map(f => f.fileName), 'zip');
      }
      else { alert('No planet files found in zip. Make sure it contains a Planet Data/ folder.'); }
      return;
    }

    // Elect exactly one center: the no-orbit body with the largest radius.
    // All other no-orbit bodies are left as non-center (they'll sit at world origin).
    const noOrbitBodies = Object.entries(bodies).filter(([,b]) => b._lacksOrbit);
    if(noOrbitBodies.length > 0){
      // Sort descending by radius — largest becomes the true center
      noOrbitBodies.sort(([,a],[,b]) => ((b.data.BASE_DATA||{}).radius||0) - ((a.data.BASE_DATA||{}).radius||0));
      noOrbitBodies[0][1].isCenter = true;
    }
    // Clean up temp flag
    Object.values(bodies).forEach(b => delete b._lacksOrbit);

    // Fix up empty-state visibility
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    if(hasCenter) document.getElementById('empty-state').classList.add('gone');
    else document.getElementById('empty-state').classList.remove('gone');

    updateStatusBar();
    syncAddBodyBtn();
    if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
    setLoadingMsg('Done!');
    refreshTexPickerLists();
    updateAssetEmptyState();
    console.log(`[SFS|LOAD] done — ${planetCount} bodies, textureCache keys: [${Object.keys(textureCache).join(',')}]`);

    // ── Populate system presets from loaded bodies ─────────────────────
    // Clear previous system presets and repopulate from the newly loaded bodies.
    Object.keys(systemPresets).forEach(k => delete systemPresets[k]);
    const systemName = file.name.replace(/\.zip$/i, '');
    systemPresetsName = systemName;
    Object.entries(bodies).forEach(([name, b]) => {
      systemPresets[name] = JSON.parse(JSON.stringify(b.data));
    });
    // If this system was previously imported as a named bucket (via IMPORT),
    // remove that bucket so the same bodies don't appear under two separate tabs.
    const _derivedLabel = systemName.replace(/-?\d+(\.\d+)*$/, '').trim();
    if(typeof dynamicPresetSources !== 'undefined' && dynamicPresetSources[_derivedLabel]){
      delete dynamicPresetSources[_derivedLabel];
      if(typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
    }
    // Show/hide the SYSTEM tab in the preset modal based on whether bodies loaded
    prsRefreshSystemTab();

    setTimeout(() => { hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM'); if(legacyFiles.length > 0){ _legacyPending = { kind: 'zip-system', items: legacyFiles, ctx: { zipFileName: file.name } }; showLegacyFormatNotice(legacyFiles.map(f => f.fileName), 'zip'); } goNew(); setTimeout(() => { console.log('[SFS|LOAD] delayed redraw, textureCache:', Object.keys(textureCache)); drawViewport(); }, 500); }, 350);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('Load error:', err);
    alert('Failed to load zip: ' + err.message);
  }
}


// ── Import a featured zip — loads assets only, does NOT open/switch the system ──
async function importFeatured(url, displayName){
  // Wait for startup autoload to finish so we don't clobber dynamicPresets mid-flight
  if(_autoLoadPromise){ try{ await _autoLoadPromise; } catch(_){} }

  showLoading(); showLoadingBars();
  setLoadingTitle('IMPORTING ASSETS');
  setLoadingMsg('Downloading ' + displayName + '…');
  try {
    setBar1(0, 'DOWNLOADING');
    const resp = await fetch(url);
    if(!resp.ok) throw new Error(`HTTP ${resp.status} — could not fetch ${displayName}`);

    const contentLength = resp.headers.get('Content-Length');
    let buffer;
    if(contentLength){
      const total = parseInt(contentLength, 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        received += value.length;
        setBar1(received / total * 100);
      }
      const full = new Uint8Array(received);
      let off = 0;
      for(const c of chunks){ full.set(c, off); off += c.length; }
      buffer = full.buffer;
    } else {
      setBar1(50, 'DOWNLOADING…');
      buffer = await resp.arrayBuffer();
      setBar1(100);
    }

    setBar1(100, 'DECOMPRESSING');
    // Derive a short label from the zip name (e.g. "BGH Full Release-1.2.1.zip" → "BGH Full Release")
    const _namedCat = displayName.replace(/\.zip$/i,'').replace(/-?\d+(\.\d+)*$/, '').trim();
    const res = await _loadSFSAssetBuffer(
      buffer, displayName,
      pct => setBar1(pct, 'DECOMPRESSING'),
      pct => setBar2(pct),
      _namedCat
    );

    // Show completion state on the overlay, then auto-dismiss
    hideLoadingBars();
    const spinner = document.querySelector('#loading-overlay .loading-spinner');
    if(spinner){ spinner.style.display = 'none'; }
    setLoadingTitle('IMPORT COMPLETE');
    const errNote = res.errors ? `  ·  ${res.errors} error(s)` : '';
    setLoadingMsg(`${res.totalTextures} texture(s)  ·  ${res.totalPresets} preset(s)${errNote}`);
    await new Promise(r => setTimeout(r, 2000));
    hideLoading();
    if(spinner){ spinner.style.display = ''; }
    setLoadingTitle('LOADING SYSTEM');
    setLoadingMsg('Reading zip…');
    // Refresh preset modal tabs and grid if open
    if(typeof prsRefreshNamedTabs === 'function') prsRefreshNamedTabs();
    if(typeof prsRebuild === 'function') prsRebuild();
  } catch(err){
    hideLoading(); hideLoadingBars();
    console.error('Featured import error:', err);
    alert('Failed to import "' + displayName + '":\n' + err.message);
  }
}

// ── Load a system zip directly from a URL (used by Featured Systems cards) ──
// GitHub raw URLs are CORS-blocked, so we mirror through jsDelivr CDN.
// Pass a jsDelivr URL: https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
async function loadZipFromUrl(cdnUrl, displayName){
  showLoading(); setLoadingMsg('Downloading ' + displayName + '…');
  try {
    // Warn before clearing an active session
    if(Object.keys(bodies).length > 0){
      hideLoading(); hideLoadingBars();
      if(!confirm('Clear current system and load "' + displayName + '"?')){
        return;
      }
      showLoading(); setLoadingMsg('Downloading ' + displayName + '…');
    }

    showLoadingBars();
    setBar1(0, 'DOWNLOADING');

    const resp = await fetch(cdnUrl);
    if(!resp.ok) throw new Error(`HTTP ${resp.status} — could not fetch ${displayName}`);

    const contentLength = resp.headers.get('Content-Length');
    let buffer;
    if(contentLength){
      const total = parseInt(contentLength, 10);
      const reader = resp.body.getReader();
      const chunks = [];
      let received = 0;
      while(true){
        const {done, value} = await reader.read();
        if(done) break;
        chunks.push(value);
        received += value.length;
        setBar1(received / total * 100);
      }
      const full = new Uint8Array(received);
      let off = 0;
      for(const c of chunks){ full.set(c, off); off += c.length; }
      buffer = full.buffer;
    } else {
      setBar1(50, 'DOWNLOADING…');
      buffer = await resp.arrayBuffer();
      setBar1(100);
    }

    // Feed through the same pipeline as a manually-uploaded zip
    const fakeFile = new File([buffer], displayName, { type: 'application/zip' });
    hideLoading(); hideLoadingBars();
    await loadZipFile(fakeFile);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('Featured system load error:', err);
    alert('Failed to download "' + displayName + '":\n' + err.message);
  }
}

// ── Default texture zip loader ──
// Maps folder names from the default texture ZIP to asset categories.

// ── Remote assets URLs ────────────────────────────────────────────────────────
// raw.githubusercontent.com blocks cross-origin binary fetches, so we proxy
// through corsproxy.io which adds the required CORS headers.
// ─────────────────────────────────────────────────────────────────────────────
// ── Remote assets URLs ────────────────────────────────────────────────────────
// jsdelivr CDN mirrors GitHub repo files with proper CORS + Content-Length headers.
// Format: https://cdn.jsdelivr.net/gh/{user}/{repo}@{branch}/{path}
// ─────────────────────────────────────────────────────────────────────────────
const REMOTE_ASSETS_URLS = [
  { url: 'assets/Vanilla Planet Data.zip', name: 'Vanilla Planet Data.zip' },
  { url: 'assets/Vanilla Tex1.zip',        name: 'Vanilla Tex1.zip' },
  { url: 'assets/Vanilla Tex2.zip',        name: 'Vanilla Tex2.zip' },
  { url: 'assets/Vanilla Tex3.zip',        name: 'Vanilla Tex3.zip' },
  { url: 'assets/Custom Planet Data.zip',  name: 'Custom Planet Data.zip' },
  { url: 'assets/Custom Tex1.zip',         name: 'Custom Tex1.zip' },
  { url: 'assets/Custom Tex2.zip',         name: 'Custom Tex2.zip' },
  { url: 'assets/Terrain 1.zip',           name: 'Terrain 1.zip' },
  { url: 'assets/Terrain 2.zip',           name: 'Terrain 2.zip' },
  { url: 'assets/Terrain 3.zip',           name: 'Terrain 3.zip' },
];

// Auto-fetch remote asset zip on startup (online users only).
// Falls back gracefully if offline or URL is null.
let _remoteAbortCtrl = null;
let _autoLoadPromise = null;   // resolves when startup autoload finishes (or fails)
function cancelRemoteAssets(){ if(_remoteAbortCtrl) _remoteAbortCtrl.abort(); }

// ── IDB cache replay helpers ──────────────────────────────────────────────────

// Yield to the browser for one frame so the loading screen can paint.
function _yieldFrame(){ return new Promise(r => requestAnimationFrame(r)); }

// Replay a cached asset payload directly into the live stores (no network, no
// decompression).  Shows a loading screen with progress.
// Returns { totalTextures, totalPresets }.
async function _replayFromCache(record, { showUI = false, progressLabel = '' } = {}){
  let totalTextures = 0, totalPresets = 0;

  const textures = record.textures || [];
  const total    = textures.length;

  if(showUI && total > 0){
    showLoading();
    showLoadingBars();
    setLoadingTitle('LOADING ASSETS');
    setLoadingMsg(progressLabel || 'Reading cache…');
    setBar1(0, 'CACHE REPLAY');
    setBar2(null, 'LOADING TEXTURES');
    await _yieldFrame(); // let the overlay paint before we start work
  }

  // ── Bulk mode: tell the decode queue to suppress per-texture redraws ────────
  // On low-end phones, firing drawViewport + refreshTexPickerLists for every
  // decoded image causes cascading reflows that exhaust memory.  We collect
  // all cacheTexture() calls first (just enqueuing them), then let the queue
  // drain with only a single final notify at the end.
  _bulkLoadActive = true;

  // Collect entries that need adding (deduplicate against already-loaded)
  const toAdd = [];
  for(let i = 0; i < textures.length; i++){
    const t = textures[i];
    if(!assets.textures.find(a => a.name === t.name)){
      cacheTexture(t.name.replace(/\.[^.]+$/,''), t.url); // enqueue decode
      assets.textures.push(t);                             // register immediately
      toAdd.push(t);
      totalTextures++;
    }
    // Update progress bar periodically so the loading screen stays alive
    if(showUI && (i + 1) % 16 === 0){
      setBar1((i + 1) / total * 100, 'CACHE REPLAY');
      await _yieldFrame();
    }
  }
  if(showUI && total > 0) setBar1(100, 'CACHE REPLAY');

  // Wait for the decode queue to fully drain before touching the DOM.
  // Poll with short yields — avoids holding a microtask chain open.
  while(_decodeRunning || _decodeQueue.length > 0){
    await new Promise(r => setTimeout(r, 32));
    if(showUI) setBar1(100, 'CACHE REPLAY');
  }

  // Now it's safe to build DOM thumbnails (decode queue is idle, memory pressure gone)
  _bulkLoadActive = false;
  for(const t of toAdd) renderAssetThumb(t);

  // Presets (vanilla / custom)
  const dp = record.presets || {};
  for(const cat of ['vanilla','custom']){
    if(dp[cat]){
      for(const [k,v] of Object.entries(dp[cat])){
        dynamicPresets[cat][k] = v;
        totalPresets++;
      }
    }
  }

  // Named preset sources
  for(const [label, src] of Object.entries(record.namedSources || {})){
    dynamicPresetSources[label] = src;
    totalPresets += Object.keys(src.presets||{}).length;
  }

  // Heightmaps
  for(const h of (record.heightmaps || [])){
    if(!assets.heightmaps.find(a => a.name === h.name)){
      assets.heightmaps.push(h);
      renderAssetRow(h, 'heightmaps');
      injectCustomHeightmap(h.name);
    }
  }

  if(totalTextures > 0){
    refreshTexPickerLists();
    updateAssetEmptyState();
    if(typeof drawViewport === 'function') drawViewport();
  }
  return { totalTextures, totalPresets };
}

// Returns true if a cached/fresh payload actually contains something usable.
// Used both to decide whether a freshly-downloaded zip is worth caching, and
// to decide whether an existing cache record should count as a "hit" — a
// zip that parsed to 0 textures/0 presets/0 heightmaps almost certainly means
// something went wrong (wrong folder layout, corrupt download, parser
// mismatch) rather than the zip genuinely being empty, so it's treated as
// not-yet-loaded and retried instead of being trusted forever.
function _payloadHasContent(p){
  if(!p) return false;
  return (p.textures    && p.textures.length    > 0) ||
         (p.heightmaps  && p.heightmaps.length  > 0) ||
         (p.namedSources && Object.keys(p.namedSources).length > 0) ||
         (p.presets && (
           Object.keys(p.presets.vanilla || {}).length > 0 ||
           Object.keys(p.presets.custom  || {}).length > 0
         ));
}

// Snapshot assets that were added during a fresh load so we can persist them.
function _snapshotNewAssets(texBefore, presetsBefore, hmBefore){
  const textures = assets.textures.slice(texBefore);
  const heightmaps = assets.heightmaps.slice(hmBefore);

  // Preset delta (vanilla + custom)
  const presets = { vanilla:{}, custom:{} };
  const dpv = Object.keys(dynamicPresets.vanilla);
  const dpc = Object.keys(dynamicPresets.custom);
  dpv.slice(presetsBefore.vanilla).forEach(k => { presets.vanilla[k] = dynamicPresets.vanilla[k]; });
  dpc.slice(presetsBefore.custom ).forEach(k => { presets.custom[k]  = dynamicPresets.custom[k];  });

  // Snapshot named preset sources added during this load
  const namedSources = {};
  for(const [label, src] of Object.entries(dynamicPresetSources)){
    namedSources[label] = src;
  }

  return { textures, presets, heightmaps, namedSources };
}

// ── Main autoload (with IDB cache) ───────────────────────────────────────────
// Strategy: CACHE-FIRST (stale-while-revalidate)
//   1. Read IDB immediately — if cached, replay assets NOW with zero network I/O.
//   2. After serving from cache, do a background HEAD check per URL.
//      If ETag changed, re-download silently and update IDB for the next load.
//   3. If no cache entry exists, do a normal download (first-time user).
//
// Result: returning users see assets instantly; fresh assets arrive next visit.

async function autoLoadRemoteAssets(){
  if(!REMOTE_ASSETS_URLS || !REMOTE_ASSETS_URLS.length) return;
  const statusEl  = document.getElementById('default-tex-status');
  const btn       = document.getElementById('btn-load-assets');
  const cancelBtn = document.getElementById('btn-cancel-remote');

  _remoteAbortCtrl = new AbortController();
  const signal = _remoteAbortCtrl.signal;

  let totalTextures = 0, totalPresets = 0, errors = 0;
  let anyMissing = false;

  if(statusEl){ statusEl.textContent = '\u23f3 Loading assets\u2026'; statusEl.style.color = 'var(--sky2)'; }

  // ── PASS 1: serve everything already in IDB — no network ──────────────────
  // We show the loading screen even for cache hits so the user sees progress
  // instead of a frozen / unresponsive page while textures are being decoded.
  const cacheRecords = [];
  let   anyCacheHit  = false;
  for(let i = 0; i < REMOTE_ASSETS_URLS.length; i++){
    const { url, name: fname } = REMOTE_ASSETS_URLS[i];
    let cached = await idbCacheRead(url);
    // A cache record that parsed to nothing usable (0 tex/presets/heightmaps)
    // is treated as no cache at all, so it gets silently redownloaded below
    // instead of being trusted forever as "fresh but empty".
    if(cached && !_payloadHasContent(cached)){
      console.log(`[SFS|IDB] Cached "${fname}" has no usable content — discarding and re-downloading`);
      idbCacheDelete(url).catch(()=>{});
      cached = null;
    }
    cacheRecords.push(cached);
    const isCacheHit = _payloadHasContent(cached);
    if(isCacheHit){
      anyCacheHit = true;
      const label = `(${i+1}/${REMOTE_ASSETS_URLS.length}) ${fname}`;
      const r = await _replayFromCache(cached, { showUI: true, progressLabel: label });
      totalTextures += r.totalTextures;
      totalPresets  += r.totalPresets;
      console.log(`[SFS|IDB] Cache hit: "${fname}" (${r.totalTextures} tex, ${r.totalPresets} presets)`);
    } else {
      anyMissing = true;
    }
  }
  // Dismiss loading screen after the cache pass (before any download pass).
  if(anyCacheHit){
    hideLoading();
    hideLoadingBars();
    setLoadingTitle('LOADING SYSTEM');
  }

  // All served from cache — finalise and kick off background revalidation.
  if(!anyMissing){
    _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors);
    _revalidateCacheInBackground(REMOTE_ASSETS_URLS, cacheRecords).catch(() => {});
    return;
  }

  // ── PASS 2: download any URLs with no cache entry (first-time / cleared) ──
  showLoading();
  showLoadingBars();
  setLoadingTitle('LOADING ASSETS');
  if(cancelBtn) cancelBtn.style.display = '';
  let cancelled = false;

  for(let i = 0; i < REMOTE_ASSETS_URLS.length; i++){
    if(signal.aborted){ cancelled = true; break; }
    const cr = cacheRecords[i];
    if(_payloadHasContent(cr)) continue; // already served from cache in Pass 1

    const { url, name: fname } = REMOTE_ASSETS_URLS[i];
    setLoadingMsg(`(${i+1}/${REMOTE_ASSETS_URLS.length}) ${fname}`);
    setBar1(0, 'DOWNLOADING');
    setBar2(null, 'LOADING TEXTURES');

    try{
      const resp = await fetch(url, { signal });
      if(!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const freshEtag = resp.headers.get('ETag') || resp.headers.get('Last-Modified') || null;
      const freshSize = parseInt(resp.headers.get('Content-Length')||'0', 10);

      const contentLength = resp.headers.get('Content-Length');
      let buffer;
      if(contentLength){
        const total  = parseInt(contentLength, 10);
        const reader = resp.body.getReader();
        const chunks = []; let received = 0;
        while(true){
          if(signal.aborted){ reader.cancel(); cancelled = true; break; }
          const { done, value } = await reader.read();
          if(done) break;
          chunks.push(value); received += value.length;
          setBar1(received / total * 100);
        }
        if(cancelled) break;
        const full = new Uint8Array(received);
        let off = 0;
        for(const c of chunks){ full.set(c, off); off += c.length; }
        buffer = full.buffer;
      } else {
        setBar1(50, 'DOWNLOADING\u2026');
        buffer = await resp.arrayBuffer();
        setBar1(100);
      }

      const texBefore     = assets.textures.length;
      const hmBefore      = assets.heightmaps.length;
      const presetsBefore = {
        vanilla: Object.keys(dynamicPresets.vanilla).length,
        custom:  Object.keys(dynamicPresets.custom).length,
      };

      setBar1(100, 'DECOMPRESSING');
      const res = await _loadSFSAssetBuffer(
        buffer, fname,
        pct => setBar1(pct, 'DECOMPRESSING'),
        pct => setBar2(pct)
      );
      totalTextures += res.totalTextures;
      totalPresets  += res.totalPresets;
      errors        += res.errors;

      const payload = _snapshotNewAssets(texBefore, presetsBefore, hmBefore);
      if(res.recognizedEntries === 0){
        console.warn(`[SFS|IO] "${fname}" downloaded but the zip has no recognizable texture/preset/heightmap entries. Check the zip's internal folder structure (expects "Texture Data/", "Planet Data/", "Heightmap Data/" style paths).`);
      } else if(_payloadHasContent(payload)){
        idbCacheWrite(url, freshEtag, freshSize, payload).then(ok => {
          if(ok) console.log(`[SFS|IDB] Cached "${fname}" (${payload.textures.length} tex, etag=${freshEtag})`);
        });
      } else {
        // Zip has real content, but everything in it already matched names
        // already present in assets.* (e.g. loaded moments earlier by another
        // zip in this same run). Nothing new to persist, but this is not a
        // failure — don't warn, don't write an empty record.
        console.log(`[SFS|IO] "${fname}" downloaded — ${res.recognizedEntries} entries found, all already loaded (no new content to cache).`);
      }

    } catch(err){
      if(err.name === 'AbortError'){ cancelled = true; break; }
      console.warn(`[SFS] Failed to load ${fname}:`, err);
      errors++;
    }
  }

  _remoteAbortCtrl = null;
  if(cancelBtn) cancelBtn.style.display = 'none';
  hideLoading();
  hideLoadingBars();
  setLoadingTitle('LOADING SYSTEM');

  if(cancelled){
    if(statusEl){ statusEl.textContent = '\u26a0 Download cancelled \u2014 upload zips manually'; statusEl.style.color = 'var(--amber)'; }
    return;
  }

  _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors);
  _revalidateCacheInBackground(REMOTE_ASSETS_URLS, cacheRecords).catch(() => {});
}

// ── Shared UI finalise ────────────────────────────────────────────────────────
function _finaliseAutoload(statusEl, btn, cancelBtn, totalTextures, totalPresets, errors){
  if(cancelBtn) cancelBtn.style.display = 'none';
  const parts = [];
  if(totalTextures > 0) parts.push(`${totalTextures} texture${totalTextures!==1?'s':''}`);
  if(totalPresets  > 0) parts.push(`${totalPresets} preset${totalPresets!==1?'s':''}`);
  if(statusEl){
    if(errors > 0 && totalTextures === 0){
      statusEl.textContent = '\u26a0 Remote assets unavailable \u2014 upload zip manually';
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = parts.length
        ? `\u2713 Assets loaded: ${parts.join(', ')}`
        : '\u2713 Assets loaded';
      statusEl.style.color = 'var(--jade)';
    }
  }
  if(btn && totalTextures > 0) btn.style.display = 'none';
}

// ── Background revalidation ────────────────────────────────────────────────────
// Runs silently after assets are already displayed. Checks ETags via HEAD;
// if a zip changed, re-downloads it and updates IDB so the next startup is fresh.
async function _revalidateCacheInBackground(urls, cacheRecords){
  await new Promise(r => setTimeout(r, 3000)); // yield to let the page settle
  for(let i = 0; i < urls.length; i++){
    const { url, name: fname } = urls[i];
    const cached = cacheRecords[i];
    try{
      const head = await fetch(url, { method: 'HEAD' });
      if(!head.ok) continue;
      const freshEtag = head.headers.get('ETag') || head.headers.get('Last-Modified') || null;
      if(!freshEtag) continue; // server gives no ETag — cannot detect staleness
      if(cached && cached.etag === freshEtag){
        console.log(`[SFS|IDB] BG revalidate: "${fname}" still fresh`);
        continue;
      }
      // Stale — silently re-download for next startup
      console.log(`[SFS|IDB] BG revalidate: "${fname}" changed (${cached?.etag} \u2192 ${freshEtag}), refreshing cache\u2026`);
      const resp = await fetch(url);
      if(!resp.ok) continue;
      const freshSize = parseInt(resp.headers.get('Content-Length')||'0', 10);
      const buffer    = await resp.arrayBuffer();

      const texBefore     = assets.textures.length;
      const hmBefore      = assets.heightmaps.length;
      const presetsBefore = {
        vanilla: Object.keys(dynamicPresets.vanilla).length,
        custom:  Object.keys(dynamicPresets.custom).length,
      };
      const res = await _loadSFSAssetBuffer(buffer, fname, ()=>{}, ()=>{});
      const payload = _snapshotNewAssets(texBefore, presetsBefore, hmBefore);
      // Gate on the zip's own recognized-entry count, not on whether this
      // parse happened to add anything NEW — by the time revalidation runs,
      // Pass 1 has usually already loaded these assets from cache, so a
      // healthy zip legitimately re-parses to 0 new items every time. Only
      // treat it as broken/empty if the zip itself has no loadable content.
      if(res.recognizedEntries === 0){
        console.warn(`[SFS|IDB] BG revalidate: "${fname}" re-downloaded but the zip has no recognizable texture/preset/heightmap entries — not caching, will retry next load.`);
      } else if(_payloadHasContent(payload)){
        // Genuinely new/changed content this time — replace the cache entry.
        await idbCacheWrite(url, freshEtag, freshSize, payload);
        console.log(`[SFS|IDB] BG revalidate: "${fname}" cache updated (${payload.textures.length} new texture(s))`);
      } else if(cached){
        // Content unchanged from what's already loaded (the normal case —
        // everything in this zip was already in assets.textures/dynamicPresets
        // from Pass 1). Keep the existing good payload; just refresh the
        // etag/size stamp so we don't re-fetch again until it truly changes.
        await idbCacheWrite(url, freshEtag, freshSize, {
          textures: cached.textures || [], presets: cached.presets || { vanilla:{}, custom:{} },
          heightmaps: cached.heightmaps || [], namedSources: cached.namedSources || {}
        });
        console.log(`[SFS|IDB] BG revalidate: "${fname}" etag refreshed (content unchanged)`);
      } else {
        // No prior cache to fall back on and nothing new was added — leave
        // uncached rather than writing an empty record.
        console.warn(`[SFS|IDB] BG revalidate: "${fname}" produced no new content and no prior cache exists — not caching, will retry next load.`);
      }
    } catch(e){
      // Offline or CORS — silently skip, try again next load
    }
  }
}

// Expose cache-clear for the settings panel
async function clearAssetCache(){
  await idbCacheClear();
  console.log('[SFS|IDB] Asset cache cleared');
}

// ── Dynamic preset store — populated when asset zips are loaded ──────────────
// vanilla/custom are the two built-in categories from the autoload zips.
// namedSources holds presets from named imports (e.g. BGH), keyed by a short
// display label derived from the zip filename.
const dynamicPresets = { vanilla: {}, custom: {} };
const dynamicPresetSources = {}; // { label: { presets:{}, zipName:'' } }

// Returns true if a zip path belongs to a heightmap folder (skip everything there)
function _isHeightmapPath(pathLower){
  return pathLower.includes('heightmap') || pathLower.includes('height map') || pathLower.includes('height_map')
      || pathLower.includes('/terrain/') || pathLower.includes('/terrain custom/')
      || pathLower.endsWith('/terrain') || pathLower.endsWith('/terrain custom');
}

// Detect category from folder name in the zip path, falling back to the
// zip's own file name (new asset zips like "Vanilla Tex1.zip" / "Custom
// Planet Data.zip" are flat — no internal "Vanilla/"/"Custom/" folders —
// so the category has to come from the zip name itself).
function _presetCategory(pathLower, zipNameLower){
  if(pathLower.includes('vanilla')) return 'vanilla';
  if(pathLower.includes('custom'))  return 'custom';
  if(zipNameLower){
    if(zipNameLower.includes('vanilla')) return 'vanilla';
    if(zipNameLower.includes('custom'))  return 'custom';
  }
  return null; // unknown — will be filed as custom
}

// Parse a preset .txt file leniently (same approach as the zip importer)
function _parsePresetTxt(raw, filename){
  try{
    let fixed = _sfsLenientJsonFix(raw);
    return normalizeDiffScaleKeys(JSON.parse(fixed));
  } catch(e){
    console.warn('[SFS|IO] Preset parse error' + (filename ? ` in "${filename}"` : '') + ':', e.message);
    return null;
  }
}

// ── Unified SFS asset zip loader ──────────────────────────────────────────────
// Accepts one or more zips containing any combination of:\n//   */Planet Data/*.txt       → preset files (vanilla or custom)\n//   */Texture Data/*.(img)    → textures\n//   */Heightmap Data/*.txt    → heightmaps (JSON points)\n//   */Heightmap Data/*.(img)  → heightmaps (PNG/JPG alpha-encoded)\n//   (legacy) flat image files  → textures (backwards compat with old texture-only zips)

// Core single-zip processor — used by both manual upload and remote auto-load.
async function _loadSFSAssetBuffer(buffer, zipName, onDecompProgress, onTexProgress, namedCategory){
  const rawEntries = parseZip(buffer);
  const entries = await decompressEntries(rawEntries, onDecompProgress);
  let totalTextures = 0, totalPresets = 0, errors = 0;
  const legacyFiles = []; // pre-1.5 format preset files found — skipped, reported by the caller
  // Treat every file in any Terrain zip (Terrain 1.zip, Terrain 2.zip, Terrain
  // 3.zip, legacy Terrain.zip / Terrain Custom.zip, etc.) as heightmap assets
  const _zipNameLower = (zipName || '').toLowerCase();
  const _forceHeightmap = _zipNameLower.startsWith('terrain');

  // Bulk mode: suppress per-texture redraws inside the decode queue.
  _bulkLoadActive = true;
  const _thumbsDeferred = []; // renderAssetThumb calls deferred until queue drains

  // If this is a named import (e.g. BGH, HTSS), reset the bucket up-front so
  // re-importing the same system replaces it instead of accumulating duplicates.
  if(namedCategory) dynamicPresetSources[namedCategory] = { presets:{}, zipName };

  // Pre-count texture entries for progress reporting
  const allEntries = Object.entries(entries);
  const texTotal = allEntries.filter(([path]) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    const ext = p.split('.').pop();
    return ['png','jpg','jpeg','webp'].includes(ext) && !_forceHeightmap && !_isHeightmapPath(p) && !p.includes('planet data');
  }).length || 1;
  let texDone = 0;

  // Independent count of entries this zip actually contains that we recognize
  // as loadable content (texture image / preset .txt / heightmap file) —
  // computed from the zip's raw contents, NOT from whether those items are
  // "new" versus already present in assets.textures/dynamicPresets. Re-parsing
  // a zip whose assets are already loaded will correctly add 0 *new* items,
  // but that's not the same as the zip being empty/broken — this counter lets
  // callers (background revalidation) tell the two cases apart.
  const _forcePresets = _zipNameLower.includes('planet data');
  const recognizedEntries = allEntries.filter(([path]) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    const filename = p.split('/').pop();
    if(!filename) return false;
    const ext = filename.split('.').pop();
    if(_forceHeightmap || _isHeightmapPath(p)) return ext === 'txt' || ['png','jpg','jpeg'].includes(ext);
    if(_forcePresets || p.includes('planet data')) return ext === 'txt';
    return ['png','jpg','jpeg','webp'].includes(ext);
  }).length;

  for(let i = 0; i < allEntries.length; i++){
    const [path, data] = allEntries[i];
    const normPath = path.replace(/\\/g, '/');
    const pathLower = normPath.toLowerCase();
    const parts = normPath.split('/');
    const filename = parts[parts.length - 1];
    if(!filename) continue;

    if(_forceHeightmap || _isHeightmapPath(pathLower)){
      // ── Heightmap Data files — load into assets.heightmaps ──
      const ext = filename.split('.').pop().toLowerCase();
      if(ext === 'txt'){
        const content = new TextDecoder().decode(data);
        const entry = { name: filename, content, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      } else if(['png','jpg','jpeg'].includes(ext)){
        const mime = (ext==='jpg'||ext==='jpeg') ? 'image/jpeg' : 'image/png';
        const b64 = bytesToBase64(data);
        const url = `data:${mime};base64,${b64}`;
        const entry = { name: filename, url, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      }
      continue;
    }

    const ext = filename.split('.').pop().toLowerCase();

    if(ext === 'txt' && (_forcePresets || pathLower.includes('planet data'))){
      const dec = new TextDecoder().decode(data);
      if(_isLegacyPlanetText(dec)){
        legacyFiles.push({ fileName: filename, raw: dec, pathLower, namedCategory, zipName });
        continue;
      }
      const parsed = _parsePresetTxt(dec);
      if(parsed){
        const pname = filename.replace(/\.txt$/i, '').trim();
        if(namedCategory){
          // Named import (e.g. BGH) — store in its own bucket, never touch vanilla/custom
          if(!dynamicPresetSources[namedCategory]) dynamicPresetSources[namedCategory] = { presets:{}, zipName };
          dynamicPresetSources[namedCategory].presets[pname] = parsed;
        } else {
          const cat = _presetCategory(pathLower, _zipNameLower) || 'custom';
          dynamicPresets[cat][pname] = parsed;
        }
        totalPresets++;
      } else { errors++; }
      continue;
    }

    if(['png','jpg','jpeg','webp'].includes(ext)){
      const inOtherDataFolder = pathLower.includes('planet data') || pathLower.includes('heightmap');
      if(inOtherDataFolder) continue;

      const mime = (ext==='jpg'||ext==='jpeg') ? 'image/jpeg'
                 : ext==='webp' ? 'image/webp' : 'image/png';
      const b64 = bytesToBase64(data);
      const url = `data:${mime};base64,${b64}`;
      const texName = filename.replace(/\.[^.]+$/, '');
      cacheTexture(texName, url);

      if(!assets.textures.find(a=>a.name===filename)){
        const isVanillaTex = _presetCategory(pathLower, _zipNameLower) === 'vanilla';
        const entry = { name:filename, url, size:data.length, vanilla:isVanillaTex };
        assets.textures.push(entry);
        _thumbsDeferred.push(entry); // render thumb after queue drains
        totalTextures++;
      }

      texDone++;
      if(onTexProgress) onTexProgress(texDone / texTotal * 100);
      // Yield every 4 textures — btoa on large images is expensive on weak devices
      if(texDone % 4 === 0) await _yield();
    }
  }

  // Wait for decode queue to fully drain, then render thumbnails and notify.
  while(_decodeRunning || _decodeQueue.length > 0){
    await new Promise(r => setTimeout(r, 32));
  }
  _bulkLoadActive = false;
  for(const entry of _thumbsDeferred) renderAssetThumb(entry);

  if(totalTextures > 0){
    refreshTexPickerLists();
    updateAssetEmptyState();
    if(typeof drawViewport === 'function') drawViewport();
  }
  return { totalTextures, totalPresets, errors, legacyFiles, recognizedEntries };
}

async function loadSFSAssetZips(files){
  if(!files || !files.length) return;
  const statusEl = document.getElementById('default-tex-status');
  let totalTextures = 0, totalPresets = 0, errors = 0;
  const legacyFiles = []; // pre-1.5 format preset files found across all zips — reported once at the end

  showLoading();
  showLoadingBars();
  setLoadingTitle('LOADING ASSETS');
  setBar1(0, 'DECOMPRESSING');
  setBar2(null, 'LOADING TEXTURES');

  for(const file of Array.from(files)){
    setLoadingMsg(file.name);
    setBar1(0); setBar2(null);
    try{
      const buffer = await file.arrayBuffer();
      const res = await _loadSFSAssetBuffer(
        buffer, file.name,
        pct => setBar1(pct),
        pct => setBar2(pct)
      );
      totalTextures += res.totalTextures;
      totalPresets  += res.totalPresets;
      errors        += res.errors;
      if(res.legacyFiles && res.legacyFiles.length) legacyFiles.push(...res.legacyFiles);
    } catch(err){
      console.error('Asset zip error:', file.name, err);
      errors++;
    }
  }

  hideLoading();
  hideLoadingBars();
  setLoadingTitle('LOADING SYSTEM');

  // Build status message
  const parts = [];
  if(totalTextures > 0) parts.push(`${totalTextures} texture${totalTextures!==1?'s':''}`);
  if(totalPresets  > 0) parts.push(`${totalPresets} preset${totalPresets!==1?'s':''}`);
  if(legacyFiles.length > 0) parts.push(`${legacyFiles.length} legacy (needs conversion)`);
  if(errors > 0)        parts.push(`${errors} error${errors!==1?'s':''}`);

  if(statusEl){
    if(parts.length === 0){
      statusEl.textContent = '⚠ No assets found — check zip contains Planet Data/ or Texture Data/ folders';
      statusEl.style.color = 'var(--amber)';
    } else if(errors > 0 || legacyFiles.length > 0){
      statusEl.textContent = `⚠ Loaded: ${parts.join(', ')}`;
      statusEl.style.color = 'var(--amber)';
    } else {
      statusEl.textContent = `✓ Loaded: ${parts.join(', ')}`;
      statusEl.style.color = 'var(--jade)';
    }
  }

  if(totalTextures > 0){ refreshTexPickerLists(); updateAssetEmptyState(); drawViewport();
    const btn = document.getElementById('btn-load-assets');
    if(btn) btn.style.display = 'none';
  }

  if(legacyFiles.length > 0){
    _legacyPending = { kind: 'zip-asset', items: legacyFiles, ctx: {} };
    showLegacyFormatNotice(legacyFiles.map(f => f.fileName), 'zip');
  }
}

// Init — deferred so all scripts have loaded regardless of order
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function(){ if(typeof resizeViewport==='function') resizeViewport(); }, 50);
  setTimeout(function(){ if(typeof initUnitInputs==='function') initUnitInputs(); }, 100);
});
// Auto-fetch remote assets if URL is configured (no-op when REMOTE_ASSETS_URL is null)
_autoLoadPromise = autoLoadRemoteAssets();


// ════════════════════════════════════════════════════════════════════════════
// ── IMPORT SYSTEM — merge a second system zip into the current session ──
// ════════════════════════════════════════════════════════════════════════════

let _importOpt = 'a'; // 'a' = barycentre, 'b' = new orbits existing centre, 'c' = new orbits chosen body

function openImportSystemModal(){
  // Must have an active session to import into
  if(Object.keys(bodies).length === 0){
    alert('Load or create a system first before importing into it.');
    return;
  }
  // Populate parent-body dropdown for option C
  const sel = document.getElementById('imp-c-parent');
  sel.innerHTML = '';
  Object.keys(bodies).forEach(n => {
    const opt = document.createElement('option');
    opt.value = n; opt.textContent = n;
    sel.appendChild(opt);
  });
  // Default selection to centre if present
  const centreName = Object.keys(bodies).find(n => bodies[n].isCenter);
  if(centreName) sel.value = centreName;

  _importOpt = 'a';
  selectImportOpt('a', /*silent*/true);
  document.getElementById('modal-import-system').classList.add('open');
}

function closeImportSystemModal(){
  document.getElementById('modal-import-system').classList.remove('open');
}

function selectImportOpt(opt, silent){
  _importOpt = opt;
  ['a','b','c'].forEach(o => {
    const card = document.getElementById('imp-opt-' + o);
    if(card) card.classList.toggle('imp-opt-sel', o === opt);
  });
}

async function importSystemZip(file){
  if(!file) return;
  closeImportSystemModal();

  const AU_m = 1.496e11;
  const opt  = _importOpt;
  const baryAU  = parseFloat(document.getElementById('imp-bary-au')?.value) || 10;
  const bAU     = parseFloat(document.getElementById('imp-b-au')?.value)    || 20;
  const cParent = document.getElementById('imp-c-parent')?.value            || '';
  const cAU     = parseFloat(document.getElementById('imp-c-au')?.value)    || 5;

  showLoading(); showLoadingBars();
  setLoadingTitle('IMPORTING SYSTEM');
  setLoadingMsg('Reading zip…');

  try {
    const buffer = await file.arrayBuffer();
    setLoadingMsg('Parsing entries…');
    setBar1(0, 'DECOMPRESSING');
    const rawEntries = parseZip(buffer);
    const entries    = await decompressEntries(rawEntries, pct => setBar1(pct));
    const dec = bytes => new TextDecoder().decode(bytes);

    // ── Parse the incoming system into a temporary bodies map ──
    const inBodies = {}; // name → { data, isCenter, _lacksOrbit, preset, color, glow, icon }
    let   planetCount = 0;
    const legacyFiles = []; // pre-1.5 format files found — skipped, reported at the end
    setBar2(0, 'LOADING BODIES');
    const entryKeys  = Object.keys(entries);
    const entryTotal = entryKeys.length || 1;
    let   entryIdx   = 0;

    for(const [path, data] of Object.entries(entries)){
      entryIdx++;
      setBar2(entryIdx / entryTotal * 100);
      const parts    = path.split('/');
      const folder   = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
      const filename = parts[parts.length - 1];
      setLoadingMsg(`Loading ${filename}…`);

      if(folder === 'Planet Data' && filename.endsWith('.txt')){
        try{
          const raw = dec(data);
          const name = filename.replace('.txt','');
          if(['Import_Settings','Space_Center_Data','Version'].includes(name)) continue;
          if(_isLegacyPlanetText(raw)){
            const peek = _lcPeekLegacyInfo(raw);
            legacyFiles.push({ fileName: filename, raw, _lacksOrbit: !peek.hasOrbit, _radius: peek.radius });
            continue;
          }
          const fixedRaw = _sfsLenientJsonFix(raw);
          const bodyData = normalizeDiffScaleKeys(JSON.parse(fixedRaw));
          const lacksOrbit = !bodyData.ORBIT_DATA;
          const _meta = inferPresetMeta(name, bodyData);
          inBodies[name] = { data: bodyData, preset: _meta.id, isCenter: false,
                             _lacksOrbit: lacksOrbit, color: _meta.color, glow: _meta.glow, icon: _meta.icon };
          planetCount++;
        } catch(e){ console.warn('[IMPORT] failed to parse', filename, e); }

      } else if(folder === 'Texture Data'){
        const ext = filename.split('.').pop().toLowerCase();
        if(!['png','jpg','jpeg','webp'].includes(ext)) continue;
        const mime  = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
        const b64   = bytesToBase64(data);
        const url   = `data:${mime};base64,${b64}`;
        if(!assets.textures.find(a => a.name === filename)){
          const entry = { name: filename, url, size: data.length };
          assets.textures.push(entry);
          renderAssetThumb(entry);
          cacheTexture(filename.replace(/\.[^.]+$/, ''), url);
        }

      } else if(folder === 'Heightmap Data' && filename.endsWith('.txt')){
        const content = dec(data);
        const entry = { name: filename, content, size: data.length };
        if(!assets.heightmaps.find(a => a.name === filename)){
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }

      } else if(folder === 'Heightmap Data' && /\.(png|jpe?g)$/i.test(filename)){
        const ext  = filename.split('.').pop().toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
        const url  = `data:${mime};base64,${bytesToBase64(data)}`;
        if(!assets.heightmaps.find(a => a.name === filename)){
          const entry = { name: filename, url, size: data.length };
          assets.heightmaps.push(entry);
          renderAssetRow(entry, 'heightmaps');
          injectCustomHeightmap(filename);
        }
      }
    }

    if(planetCount === 0){
      hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
      if(legacyFiles.length > 0){
        const stemEarly = file.name.replace(/\.zip$/i,'').replace(/[^A-Za-z0-9_\- ]/g,'').trim() || 'Imported';
        _legacyPending = {
          kind: 'zip-import',
          items: legacyFiles,
          ctx: {
            zipFileName: file.name, stem: stemEarly, renamed: {},
            importedCentreName: null,
            exCentreName: Object.keys(bodies).find(n => bodies[n].isCenter) || null,
            opt, baryAU, bAU, cAU, cParent
          }
        };
        showLegacyFormatNotice(legacyFiles.map(f => f.fileName), 'zip');
      } else {
        alert('No planet files found in the import zip.');
      }
      return;
    }

    // Elect incoming centre (no-orbit body with largest radius)
    const noOrbit = Object.entries(inBodies).filter(([,b]) => b._lacksOrbit);
    let inCentreName = null;
    if(noOrbit.length > 0){
      noOrbit.sort(([,a],[,b]) => ((b.data.BASE_DATA||{}).radius||0) - ((a.data.BASE_DATA||{}).radius||0));
      noOrbit[0][1].isCenter = true;
      inCentreName = noOrbit[0][0];
    }
    Object.values(inBodies).forEach(b => delete b._lacksOrbit);

    // If an unconverted legacy file also looks like a centre candidate (no
    // orbit data) — and either no non-legacy centre was found, or the legacy
    // candidate is bigger — hold off on deciding who the real centre is until
    // the user resolves the legacy file(s), rather than possibly locking in
    // the wrong body as centre right now.
    const legacyCentreCandidates = legacyFiles.filter(f => f._lacksOrbit);
    let deferredCentre = false;
    if(legacyCentreCandidates.length > 0){
      const bestLegacyRadius = Math.max(...legacyCentreCandidates.map(f => f._radius || 0));
      const currentCentreRadius = inCentreName ? ((inBodies[inCentreName].data.BASE_DATA||{}).radius || 0) : -1;
      if(!inCentreName || bestLegacyRadius > currentCentreRadius) deferredCentre = true;
    }
    if(deferredCentre && inCentreName){
      // Don't lock this body in as the winner yet — it stays parentless and
      // non-centre for now (same as any other "extra" no-orbit body already
      // does elsewhere in this app), to be re-evaluated once the legacy
      // candidate(s) are converted.
      inBodies[inCentreName].isCenter = false;
    }

    // ── Resolve name collisions: prefix all imported names with the zip stem ──
    const stem    = file.name.replace(/\.zip$/i,'').replace(/[^A-Za-z0-9_\- ]/g,'').trim() || 'Imported';
    const renamed = {}; // oldName → newName

    Object.keys(inBodies).forEach(oldName => {
      let newName = oldName;
      if(bodies[newName]){
        newName = stem + '_' + oldName;
        let counter = 2;
        while(bodies[newName] || renamed[newName]) newName = stem + '_' + oldName + '_' + (counter++);
      }
      renamed[oldName] = newName;
    });

    // Rewrite parent references inside imported system
    Object.entries(inBodies).forEach(([, b]) => {
      if(b.data.ORBIT_DATA?.parent){
        const oldParent = b.data.ORBIT_DATA.parent;
        if(renamed[oldParent]) b.data.ORBIT_DATA.parent = renamed[oldParent];
      }
    });

    // ── Determine existing centre ──
    const exCentreName = Object.keys(bodies).find(n => bodies[n].isCenter) || null;

    // ── Apply merge mode (skipped entirely if centre resolution is deferred —
    //     see runLegacyConversion / _lcApplyZipImportConversion, which replays
    //     this same logic once the true centre is known) ──
    const importedCentreBody = (!deferredCentre && inCentreName) ? inBodies[inCentreName] : null;

    if(!deferredCentre){
    if(opt === 'a'){
      // ── Mode A: Shared barycentre ──
      // 1. Create a barycentre body (no mass, no atmosphere, just a marker)
      const baryName = _uniqueName('Barycentre', bodies);
      const barySMA  = baryAU * AU_m;

      // Give existing centre an orbit around barycentre
      if(exCentreName){
        bodies[exCentreName].isCenter = false;
        bodies[exCentreName].data.ORBIT_DATA = {
          parent: baryName, semiMajorAxis: barySMA * 0.5,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

      // Give imported centre an orbit around barycentre
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: baryName, semiMajorAxis: barySMA * 0.5,
          eccentricity: 0, argumentOfPeriapsis: 180, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

      // Insert barycentre as new system centre (tiny invisible body)
      bodies[baryName] = {
        data: {
          BASE_DATA: { radius: 1000, gravity: 0, gravityDifficultyScale: {},
                       radiusDifficultyScale: {}, bodyType: 0 }
        },
        preset: 'asteroid', isCenter: true,
        color: '#aaaaaa', glow: false, icon: '⚫'
      };

    } else if(opt === 'b'){
      // ── Mode B: Imported centre orbits existing centre ──
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: exCentreName || Object.keys(bodies)[0],
          semiMajorAxis: bAU * AU_m,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }

    } else if(opt === 'c'){
      // ── Mode C: Imported centre orbits chosen body ──
      const parentBody = cParent && bodies[cParent] ? cParent : (exCentreName || Object.keys(bodies)[0]);
      if(importedCentreBody){
        importedCentreBody.isCenter = false;
        importedCentreBody.data.ORBIT_DATA = {
          parent: parentBody,
          semiMajorAxis: cAU * AU_m,
          eccentricity: 0, argumentOfPeriapsis: 0, direction: 1,
          multiplierSOI: 2.5, smaDifficultyScale: {}, soiDifficultyScale: {}
        };
      }
    }
    } // end if(!deferredCentre)

    // ── Commit renamed imported bodies into global bodies map ──
    Object.entries(inBodies).forEach(([oldName, b]) => {
      const newName = renamed[oldName];
      bodies[newName] = b;
    });

    // ── Wrap up ──
    if(typeof fillSidebar === 'function') fillSidebar();
    updateStatusBar();
    syncAddBodyBtn();
    if(typeof tagDdSyncBtn === 'function') tagDdSyncBtn();
    refreshTexPickerLists();
    updateAssetEmptyState();
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    if(hasCenter) document.getElementById('empty-state').classList.add('gone');

    setLoadingMsg('Done!');
    setTimeout(() => {
      hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
      if(legacyFiles.length > 0){
        _legacyPending = {
          kind: 'zip-import',
          items: legacyFiles,
          ctx: {
            zipFileName: file.name, stem, renamed,
            importedCentreName: deferredCentre ? null : inCentreName,
            deferredCentreName: deferredCentre ? renamed[inCentreName] : null,
            exCentreName, opt, baryAU, bAU, cAU, cParent
          }
        };
        showLegacyFormatNotice(legacyFiles.map(f => f.fileName), 'zip');
      }
      goNew();
      setTimeout(() => drawViewport(), 400);
    }, 350);

    console.log(`[SFS|IMPORT] merged ${planetCount} bodies using mode "${opt}"; renamed:`, renamed);

  } catch(err){
    hideLoading(); hideLoadingBars(); setLoadingTitle('LOADING SYSTEM');
    console.error('[SFS|IMPORT] error:', err);
    alert('Failed to import zip: ' + err.message);
  }
}

/** Return a name not already in bodies, appending _2, _3, … as needed. */
function _uniqueName(base, bodyMap){
  if(!bodyMap[base]) return base;
  let i = 2;
  while(bodyMap[base + '_' + i]) i++;
  return base + '_' + i;
}

