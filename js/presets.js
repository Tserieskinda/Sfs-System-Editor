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

// ── Definitive name → id table ────────────────────────────────────────────────
// Checked first by inferPresetMeta so known preset names are never misclassified
// by heuristics. Unknown names still fall through to the heuristic block below.
// Keys are exact preset filenames (without .txt), case-sensitive.
const _PRESET_ID_TABLE = {
  // ── Stars ──
  'Sun':            'star',
  'G':              'star',
  'K':              'star',
  'M':              'star',
  'F':              'star',
  'A':              'star',
  'B':              'star',
  'O':              'star',
  'Blue Giant':     'star',
  'White Dwarf':    'star',
  'Brown_Dwarf':    'star',
  // ── Black holes ──
  '1 Solar Mass BH':   'blackhole',
  '100 Solar Mass BH': 'blackhole',
  '10k Solar Mass BH': 'blackhole',
  // ── Barycentres ──
  'Barycentre': 'barycentre',
  // ── Planets ──
  'Earth':         'planet',
  'Venus':         'planet',
  'Mars':          'planet',
  'Super Earth':   'planet',
  'Water World':   'planet',
  'Desert World':  'planet',
  'Lava World':    'planet',
  'Frozen Planet': 'planet',
  // ── Mercury-like (airless rocky planets / dwarf planets) ──
  'Mercury':  'mercurylike',
  'Callisto': 'mercurylike',
  'Pluto':    'mercurylike',
  'Triton':   'mercurylike',
  'Makemake': 'mercurylike',
  'Sedna':    'mercurylike',
  'Europa':   'mercurylike',
  'Io':       'mercurylike',
  'Ganymede': 'mercurylike',
  // ── Gas giants ──
  'Jupiter': 'gasgiant',
  'Uranus':  'gasgiant',
  'Neptune': 'gasgiant',
  // ── Ringed giants ──
  'Saturn':        'ringedgiant',
  'Ringed Giant':  'ringedgiant',
  'Ringed Planet': 'ringedgiant',
  // ── Moons ──
  'Moon':           'moon',
  'Titan':          'moon',
  'Small Moon':     'moon',
  'Big Moon':       'moon',
  'Atmosphere Moon':'moon',
  'Ariel':          'moon',
  'Charon':         'moon',
  'Dione':          'moon',
  'Enceladus':      'moon',
  'Hydra':          'moon',
  'Iapetus':        'moon',
  'Mimas':          'moon',
  'Miranda':        'moon',
  'Naiad':          'moon',
  'Nix':            'moon',
  'Oberon':         'moon',
  'Pan':            'moon',
  'Phobos':         'moon',
  'Deimos':         'moon',
  'Proteus':        'moon',
  'Puck':           'moon',
  'Rhea':           'moon',
  'Tethys':         'moon',
  'Thebe':          'moon',
  'Titania':        'moon',
  'Umbriel':        'moon',
  // ── Asteroids ──
  'Near_Earth_Asteroid':   'asteroid',
  'Asteroid Preset':       'asteroid',
  'Icy Asteroid Preset ':  'asteroid',  // note trailing space matches filename
  'Long Asteroid Preset':  'asteroid',
  'Round Asteroid Preset': 'asteroid',
  'Ceres':                 'asteroid',
};

// ── Map an id → display meta (icon / color / glow) ───────────────────────────
// Single source of truth — used by the table fast-path AND the heuristic fallback.
function _metaForId(id, name){
  const n = (name || '').toLowerCase();
  switch(id){
    case 'blackhole':
      return {id:'blackhole',   icon:'🕳️', color:'#220044,#000000', glow:'#8800ff'};
    case 'barycentre':
      return {id:'barycentre',  icon:'⊕',  color:'#8888aa,#444466', glow:'#8888aa'};
    case 'star':
      if(n.includes('brown') || n.includes('dwarf'))
        return {id:'star', icon:'🌑', color:'#884422,#442200', glow:'#cc6622'};
      if(n.includes('neutron'))
        return {id:'star', icon:'💫', color:'#aabbff,#6688ff', glow:'#aaccff'};
      if(n==='o' || n.includes('o type') || n==='blue giant' || n.includes('blue'))
        return {id:'star', icon:'🔵', color:'#88aaff,#4466dd', glow:'#aaccff'};
      if(n==='b' || n.includes('b type'))
        return {id:'star', icon:'🔵', color:'#aabbff,#6688ff', glow:'#ccddff'};
      if(n==='a' || n.includes('a type'))
        return {id:'star', icon:'⚪', color:'#ffffff,#ddddff', glow:'#eeeeff'};
      if(n==='f' || n.includes('f type'))
        return {id:'star', icon:'🌟', color:'#ffffcc,#ffff88', glow:'#ffffaa'};
      if(n==='k' || n.includes('k type'))
        return {id:'star', icon:'🟠', color:'#ffaa44,#cc6622', glow:'#ffbb44'};
      if(n==='m' || n.includes('m type'))
        return {id:'star', icon:'🔴', color:'#ff6633,#cc2200', glow:'#ff6644'};
      // G-type / Sun / generic
      return {id:'star',        icon:'☀️', color:'#ffd060,#ff8800', glow:'#ff9900'};
    case 'ringedgiant':
      return {id:'ringedgiant', icon:'🪐', color:'#bb9944,#886622', glow:'#ccaa55'};
    case 'gasgiant':
      return {id:'gasgiant',    icon:'🪐', color:'#cc8833,#886633', glow:'#ffaa44'};
    case 'planet':
      return {id:'planet',      icon:'🌍', color:'#4488ff,#226622', glow:'#4488ff'};
    case 'marslike':
      return {id:'marslike',    icon:'🔴', color:'#884422,#552211', glow:'#aa5533'};
    case 'mercurylike':
      return {id:'mercurylike', icon:'🪨', color:'#776655,#443322', glow:'#998866'};
    case 'moon':
      return {id:'moon',        icon:'🌑', color:'#888888,#444444', glow:'#999999'};
    case 'asteroid':
      return {id:'asteroid',    icon:'☄️', color:'#554433,#332211', glow:'#776655'};
    default:
      return {id:'moon',        icon:'🌑', color:'#888888,#444444', glow:'#999999'};
  }
}

// ── Derive a type-id, icon, color and glow from the body data ──────────────────
// Fast path: known preset names hit _PRESET_ID_TABLE directly, no heuristics.
// Fallback: structural heuristics for user-created or unknown-named presets.
function inferPresetMeta(name, data){
  // Respect explicit type hint injected by the preset manager
  if(data && data._pgTypeHint) return _metaForId(data._pgTypeHint, name);
  const tableId = _PRESET_ID_TABLE[name];
  if(tableId) return _metaForId(tableId, name);

  const r          = data.BASE_DATA?.radius   || 0;
  const g          = data.BASE_DATA?.gravity  || 0;
  const hasAtmo    = !!data.ATMOSPHERE_PHYSICS_DATA;
  const hasRings   = !!data.RINGS_DATA;
  const hasTerrain = !!data.TERRAIN_DATA;
  const hasOrbit   = !!data.ORBIT_DATA;
  const collider   = data.TERRAIN_DATA?.collider !== false;
  const n = name.toLowerCase();

  if(n.includes('barycentre') || n.includes('barycenter'))
    return _metaForId('barycentre', name);
  if(r < 200 && !hasTerrain)
    return _metaForId('barycentre', name);
  if(n.includes('black hole') || n.includes('blackhole') || n.includes(' bh') || n.endsWith('bh') || n.includes('solar mass bh'))
    return _metaForId('blackhole', name);
  if(!hasOrbit || g > 5000)
    return _metaForId('star', name);
  if(hasRings)
    return _metaForId('ringedgiant', name);
  if(hasAtmo && r > 500000)
    return _metaForId('gasgiant', name);
  if(!hasTerrain || !collider)
    return r > 200000 ? _metaForId('gasgiant', name) : _metaForId('asteroid', name);
  if(r < 500)   return _metaForId('asteroid', name);
  if(r < 50000) return _metaForId('moon', name);
  if(!hasAtmo && r < 200000) return _metaForId('mercurylike', name);
  if(hasAtmo && (data.ATMOSPHERE_PHYSICS_DATA?.density || 1) <= 0.001) return _metaForId('marslike', name);
  if(r > 200000) return _metaForId('planet', name);
  return _metaForId('moon', name);
}

// ── System presets — populated from the most recently loaded system zip ──────
// Key = body name, value = body data object. Cleared on each new system load.
const systemPresets = {};
let   systemPresetsName = ''; // display name of the loaded system

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

  // Named import buckets (e.g. BGH) — each gets its own category key
  if(typeof dynamicPresetSources !== 'undefined'){
    Object.entries(dynamicPresetSources).forEach(([label, src]) => {
      Object.entries(src.presets).forEach(([name, data]) => {
        try {
          const meta = inferPresetMeta(name, data);
          list.push({ key:name, name, category:label, data:JSON.parse(JSON.stringify(data)), ...meta });
        } catch(e) {
          console.warn('[SFS] Skipping preset "' + name + '" from "' + label + '":', e.message);
        }
      });
    });
  }

  Object.entries(systemPresets).forEach(([name, data]) => {
    const meta = inferPresetMeta(name, data);
    list.push({ key:name, name, category:'system', data:JSON.parse(JSON.stringify(data)), ...meta });
  });

  return list;
}

