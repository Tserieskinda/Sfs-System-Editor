// ════════════════════════════════ PRESET DATA ════════════════════════════════
// ════════════ FILE-BASED PRESETS (loaded from Presets zip) ════════════
// Vanilla: 37 bodies from the base SFS solar system
// Custom:  17 special bodies (star types, black holes, exotic asteroids)
const FILE_PRESETS = {"vanilla":{},"custom":{
  "Blank Body": {
    "version": "1.5",
    "BASE_DATA": {
      "radius": 600000.0,
      "radiusDifficultyScale": {},
      "gravity": 9.8,
      "gravityDifficultyScale": {},
      "timewarpHeight": 25000.0,
      "velocityArrowsHeight": 5000.0,
      "mapColor": { "r": 0.6, "g": 0.6, "b": 0.6, "a": 1.0 },
      "significant": true,
      "rotateCamera": true
    },
    "TERRAIN_DATA": {
      "terrainFormulaDifficulties": {},
      "textureFormula": [],
      "verticeSize": 2.0,
      "collider": true,
      "flatZones": [],
      "flatZonesDifficulties": {}
    },
    "ACHIEVEMENT_DATA": {
      "Landed": true,
      "Takeoff": true,
      "Atmosphere": false,
      "Orbit": true,
      "Crash": true
    }
  }
}};

// ── Derive a type-id, icon, color and glow from the body data ──────────
function inferPresetMeta(name, data){
  const r    = data.BASE_DATA?.radius || 0;
  const g    = data.BASE_DATA?.gravity || 0;
  const hasAtmo  = !!data.ATMOSPHERE_PHYSICS_DATA;
  const hasRings = !!data.RINGS_DATA;
  const hasTerrain = !!data.TERRAIN_DATA;
  const hasOrbit = !!data.ORBIT_DATA;
  const collider = data.TERRAIN_DATA?.collider !== false;
  const n = name.toLowerCase();

  // Barycentre check FIRST — barycentres have no orbit so must be caught before the star block
  if(n.includes('barycentre') || n.includes('barycenter'))
    return {id:'barycentre', icon:'⊕', color:'#8888aa,#444466', glow:'#8888aa'};

  // Star / stellar types
  if(!hasOrbit || g > 5000) {
    if(n.includes('black') || n.includes(' bh') || n.endsWith('bh') || n.includes('solar mass bh'))
      return {id:'blackhole', icon:'🕳️', color:'#220044,#000000', glow:'#8800ff'};
    if(n.includes('brown') || n.includes('dwarf'))
      return {id:'star', icon:'🌑', color:'#884422,#442200', glow:'#cc6622'};
    if(n.includes('neutron'))
      return {id:'star', icon:'💫', color:'#aabbff,#6688ff', glow:'#aaccff'};
    if(n==='o'||n.includes('o type')||n.includes('_o'))
      return {id:'star', icon:'🔵', color:'#88aaff,#4466dd', glow:'#aaccff'};
    if(n==='b'||n.includes('b type')||n.includes('_b'))
      return {id:'star', icon:'🔵', color:'#aabbff,#6688ff', glow:'#ccddff'};
    if(n==='a'||n.includes('a type')||n.includes('_a'))
      return {id:'star', icon:'⚪', color:'#ffffff,#ddddff', glow:'#eeeeff'};
    if(n==='f'||n.includes('f type')||n.includes('_f'))
      return {id:'star', icon:'🌟', color:'#ffffcc,#ffff88', glow:'#ffffaa'};
    if(n==='g'||n.includes('g type')||n.includes('_g') || n==='sun')
      return {id:'star', icon:'☀️', color:'#ffd060,#ff8800', glow:'#ff9900'};
    if(n==='k'||n.includes('k type')||n.includes('_k'))
      return {id:'star', icon:'🟠', color:'#ffaa44,#cc6622', glow:'#ffbb44'};
    if(n==='m'||n.includes('m type')||n.includes('_m'))
      return {id:'star', icon:'🔴', color:'#ff6633,#cc2200', glow:'#ff6644'};
    // Generic star / no-orbit body
    return {id:'star', icon:'☀️', color:'#ffd060,#ff8800', glow:'#ff9900'};
  }
  // Barycentre: tiny radius + no terrain (catches unlabelled barycentres)
  if(r < 200 && !hasTerrain)
    return {id:'barycentre', icon:'⊕', color:'#8888aa,#444466', glow:'#8888aa'};
  if(hasRings)
    return {id:'ringedgiant', icon:'🪐', color:'#bb9944,#886622', glow:'#ccaa55'};
  if(hasAtmo && r > 500000)
    return {id:'gasgiant', icon:'🪐', color:'#cc8833,#886633', glow:'#ffaa44'};
  if(!hasTerrain || !collider){
    if(r > 200000) return {id:'gasgiant', icon:'🪐', color:'#cc8833,#886633', glow:'#ffaa44'};
    return {id:'asteroid', icon:'☄️', color:'#554433,#332211', glow:'#776655'};
  }
  if(r < 500)
    return {id:'asteroid', icon:'☄️', color:'#554433,#332211', glow:'#776655'};
  if(r < 50000)
    return {id:'moon', icon:'🌑', color:'#888888,#444444', glow:'#999999'};
  if(!hasAtmo && r < 200000)
    return {id:'mercurylike', icon:'🪨', color:'#776655,#443322', glow:'#998866'};
  if(hasAtmo && data.ATMOSPHERE_PHYSICS_DATA?.density <= 0.001)
    return {id:'marslike', icon:'🔴', color:'#884422,#552211', glow:'#aa5533'};
  if(r > 200000)
    return {id:'planet', icon:'🌍', color:'#4488ff,#226622', glow:'#4488ff'};
  return {id:'moon', icon:'🌑', color:'#888888,#444444', glow:'#999999'};
}

// Build a flat list of all presets for use throughout the system.
// If dynamicPresets have been loaded from a zip, those take priority over
// the baked-in FILE_PRESETS (dynamic entries can add new ones or override existing).
function buildAllPresets(){
  const list = [];

  // Merge: start with baked-in, then overlay dynamic (dynamic wins on name collision)
  const vanillaSrc = Object.keys(dynamicPresets.vanilla).length > 0
    ? { ...FILE_PRESETS.vanilla, ...dynamicPresets.vanilla }
    : FILE_PRESETS.vanilla;
  const customSrc  = Object.keys(dynamicPresets.custom).length > 0
    ? { ...FILE_PRESETS.custom,  ...dynamicPresets.custom  }
    : FILE_PRESETS.custom;

  Object.entries(vanillaSrc).forEach(([name, data]) => {
    const meta = inferPresetMeta(name, data);
    list.push({ key:name, name, category:'vanilla', data:JSON.parse(JSON.stringify(data)), ...meta });
  });
  Object.entries(customSrc).forEach(([name, data]) => {
    const meta = inferPresetMeta(name, data);
    list.push({ key:name, name, category:'custom', data:JSON.parse(JSON.stringify(data)), ...meta });
  });

  return list;
}

