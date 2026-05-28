/**
 * landmark-features.js
 * ─────────────────────────────────────────────────────────────────
 * Two features:
 *   1. Procedural Landmark Generator  (openProceduralLandmarks / runProceduralScan / applyProceduralLandmarks)
 *   2. Add Suffix modal               (openSuffixModal / closeSuffixModal / applySuffix)
 *
 * Depends on: sidebar.js (makeLandmark, addLandmark, liveSync, collectLandmarks),
 *             namegen.js (NameGen), state.js (selectedBody, bodies)
 * ─────────────────────────────────────────────────────────────────
 */

// ════════════════════════════════════════════════════════════════════
// USGS PLANETARY DESCRIPTOR TERMS
// Source: https://planetarynames.wr.usgs.gov/DescriptorTerms
// ════════════════════════════════════════════════════════════════════
const USGS_TERMS = [
  // ── Depressions ──────────────────────────────────────────────────
  { term:'Catena',      plural:'Catenae',    cat:'depression',
    short:'Chain of craters',
    full:'A chain of craters, aligned along a fault or tectonic fracture.' },
  { term:'Cavus',       plural:'Cavi',       cat:'depression',
    short:'Steep irregular depression',
    full:'Hollows; steep and irregular depressions, usually in arrays or clusters.' },
  { term:'Chaos',       plural:'Chaoses',    cat:'depression',
    short:'Broken / jumbled terrain',
    full:'An area of distinctively broken or jumbled terrain; characteristic of Europa\'s chaotic regions.' },
  { term:'Chasma',      plural:'Chasmata',   cat:'depression',
    short:'Deep elongated canyon',
    full:'A deep, elongated, steep-sided depression — a canyon or trench.' },
  { term:'Fossa',       plural:'Fossae',     cat:'depression',
    short:'Long narrow trench',
    full:'A long, narrow and shallow depression — a trench or groove.' },
  { term:'Fretum',      plural:'Freta',      cat:'depression',
    short:'Strait between water bodies',
    full:'A strait between two bodies of water.' },
  { term:'Lacuna',      plural:'Lacunae',    cat:'depression',
    short:'Irregular former lakebed',
    full:'An irregularly shaped depression; likely a former lakebed.' },
  { term:'Lacus',       plural:'Lacus',      cat:'depression',
    short:'Liquid lake / small plain',
    full:'Either a liquid lake, a small flat plain or a glacier.' },
  { term:'Patera',      plural:'Paterae',    cat:'depression',
    short:'Shallow irregular crater',
    full:'An irregularly shaped crater with shallow edges, sometimes caused by volcanism.' },
  { term:'Sinus',       plural:'Sinus',      cat:'depression',
    short:'Bay / inlet',
    full:'A bay; a recess in the boundary of a plain, lowland, or body of water.' },

  // ── Impact features ───────────────────────────────────────────────
  { term:'Caldera',     plural:'Calderas',   cat:'crater',
    short:'Summit volcanic depression',
    full:'Large volcanic depression formed by collapse or explosive eruption.' },
  { term:'Crater',      plural:'Craters',    cat:'crater',
    short:'Impact bowl',
    full:'A circular depression caused by asteroid impacts.' },

  // ── Elevations ────────────────────────────────────────────────────
  { term:'Collis',      plural:'Colles',     cat:'elevation',
    short:'Small hill',
    full:'A small hill; a minor isolated elevation on the surface.' },
  { term:'Corona',      plural:'Coronae',    cat:'elevation',
    short:'Oval-shaped terrain feature',
    full:'An oval-shaped terrain feature, often of volcanic or tectonic origin.' },
  { term:'Mensa',       plural:'Mensae',     cat:'elevation',
    short:'Flat-topped mesa with cliffs',
    full:'A flat-topped structure with cliff edges, like a mesa.' },
  { term:'Mons',        plural:'Montes',     cat:'elevation',
    short:'Single mountain',
    full:'A single mountain; an isolated peak or volcanic construct.' },
  { term:'Montes',      plural:'Montes',     cat:'elevation',
    short:'Mountain range',
    full:'A mountain range; a group of mountains forming a connected chain.' },
  { term:'Promontorium',plural:'Promontoria',cat:'elevation',
    short:'Cape / headland',
    full:'A cape, either on a body of water or projecting over lower land.' },
  { term:'Tholus',      plural:'Tholi',      cat:'elevation',
    short:'Small dome / hill',
    full:'A small dome or rounded hill, often of volcanic origin.' },

  // ── Plains / Plateaus ─────────────────────────────────────────────
  { term:'Mare',        plural:'Maria',      cat:'plain',
    short:'Liquid sea / large flat plain',
    full:'Either a liquid sea or a large flat plain, like the lunar maria.' },
  { term:'Oceanus',     plural:'Oceani',     cat:'plain',
    short:'Liquid ocean / vast plain',
    full:'Either a liquid ocean or a large collection of flat plains, like on the Moon.' },
  { term:'Palus',       plural:'Paludes',    cat:'plain',
    short:'Swamp / small plain',
    full:'A swampy area; could also mean a small plain.' },
  { term:'Planitia',    plural:'Planitiae',  cat:'plain',
    short:'Low lying plain',
    full:'A low lying plain; often large and relatively flat lowland terrain.' },
  { term:'Planum',      plural:'Plana',      cat:'plain',
    short:'Plateau / high plain',
    full:'A plateau; a high lying plain elevated above surrounding terrain.' },
  { term:'Plume',       plural:'Plumes',     cat:'plain',
    short:'Cryovolcanic feature',
    full:'A cryovolcanic feature; an eruption of volatiles from the subsurface.' },
  { term:'Regio',       plural:'Regiones',   cat:'plain',
    short:'Region of distinct color/albedo',
    full:'A large area that differs in color from surrounding areas; can also be a broad geographic region.' },
  { term:'Terra',       plural:'Terrae',     cat:'plain',
    short:'Extensive continent / landmass',
    full:'An extensive landmass or continent; a large-scale terrain unit.' },
  { term:'Tessera',     plural:'Tesserae',   cat:'plain',
    short:'Tile-like polygonal terrain',
    full:'An area of tile-like, polygonal terrain (characteristic of Venus).' },
  { term:'Vastitas',    plural:'Vastitates', cat:'plain',
    short:'Planet-wide lowland plain',
    full:'A planet-wide plain with a huge area; larger scale than Planitia.' },

  // ── Ridges / Scarps ───────────────────────────────────────────────
  { term:'Arcus',       plural:'Arcus',      cat:'ridge',
    short:'Curved terrain feature',
    full:'A curved terrain feature; an arc-shaped structure on the surface.' },
  { term:'Dorsum',      plural:'Dorsa',      cat:'ridge',
    short:'Wrinkly ridge',
    full:'A wrinkly ridge; an elongated raised feature, often curved.' },
  { term:'Lingula',     plural:'Lingulae',   cat:'ridge',
    short:'Tongue-like plateau edge',
    full:'Rounded out, tongue-like edges of a plateau.' },
  { term:'Lobus',       plural:'Lobi',       cat:'ridge',
    short:'Lobe of contact binary',
    full:'A lobe of a contact binary object.' },
  { term:'Rima',        plural:'Rimae',      cat:'ridge',
    short:'Fissure / crack',
    full:'A fissure; a narrow crack or groove on the surface.' },
  { term:'Rupes',       plural:'Rupes',      cat:'ridge',
    short:'Scarp / cliff',
    full:'A scarp or cliff; a long, steep escarpment.' },
  { term:'Saxum',       plural:'Saxa',       cat:'ridge',
    short:'Boulder / rock',
    full:'A boulder or rock; a large isolated rocky feature.' },
  { term:'Scopulus',    plural:'Scopuli',    cat:'ridge',
    short:'Irregular scarp / cliff',
    full:'An irregular scarp or cliff, often at terrain-type boundaries.' },
  { term:'Serpens',     plural:'Serpentes',  cat:'ridge',
    short:'Long undulating terrain',
    full:'A long terrain feature that changes from lying lower to higher (or vice versa) relative to surrounding terrain along its length.' },
  { term:'Sulcus',      plural:'Sulci',      cat:'ridge',
    short:'Parallel ridges / grooves',
    full:'Long ridges that are mostly parallel to each other, but spread out into different directions.' },

  // ── Flows / Channels ─────────────────────────────────────────────
  { term:'Flumen',      plural:'Flumina',    cat:'flow',
    short:'Channel / river',
    full:'A channel of water; used on Titan for hydrocarbon rivers.' },
  { term:'Fluctus',     plural:'Fluctus',    cat:'flow',
    short:'Flow / lava field',
    full:'An area that is or was covered by a flow of liquid.' },
  { term:'Labyrinthus', plural:'Labyrinthi', cat:'flow',
    short:'Complex valley network',
    full:'An area of complex intersecting valleys and ridges.' },
  { term:'Valles',      plural:'Valles',     cat:'flow',
    short:'Valley',
    full:'A valley; often formed by erosion from flowing liquid (water or lava).' },

  // ── Other / Albedo ────────────────────────────────────────────────
  { term:'Albedo',      plural:'Albedos',    cat:'other',
    short:'Brightness contrast area',
    full:'An area of different brightness from surrounding terrain.' },
  { term:'Astrum',      plural:'Astra',      cat:'other',
    short:'Radial-patterned feature',
    full:'A radial-patterned terrain feature; star-like formations on the surface.' },
  { term:'Collum',      plural:'Colla',      cat:'other',
    short:'Neck of contact binary',
    full:'A thin section connecting two lobes of a contact binary object.' },
  { term:'Facula',      plural:'Faculae',    cat:'other',
    short:'Bright spot',
    full:'A bright spot on the planet\'s surface, often of high reflectivity.' },
  { term:'Insula',      plural:'Insulae',    cat:'other',
    short:'Island',
    full:'An island; an isolated landmass surrounded by lower terrain or liquid.' },
  { term:'Labes',       plural:'Labes',      cat:'other',
    short:'Landslide debris field',
    full:'An area filled with landslide debris.' },
  { term:'Lenticula',   plural:'Lenticulae', cat:'other',
    short:'Small dark spots',
    full:'Small, usually dark spots on the surface.' },
  { term:'Linea',       plural:'Lineae',     cat:'other',
    short:'Elongated dark/bright marking',
    full:'A dark or bright elongated marking, curved or straight.' },
  { term:'Macula',      plural:'Maculae',    cat:'other',
    short:'Dark spot',
    full:'A dark spot on the planet\'s surface; irregular in shape.' },
  { term:'Reticulum',   plural:'Reticula',   cat:'other',
    short:'Net-like patterned terrain',
    full:'Reticular, net-like patterned terrain on the surface.' },
  { term:'Undae',       plural:'Undae',      cat:'other',
    short:'Dune field',
    full:'A field of dunes; wind-formed undulating sand or sediment deposits.' },
  { term:'Virga',       plural:'Virgae',     cat:'other',
    short:'Color stripe on surface',
    full:'A stripe of different color on a planet\'s surface.' },
];

// Name pools by style (supplementing NameGen for short bare roots)
const _LM_NAME_POOLS = {
  latin:  ['Aethon','Caelus','Ferrum','Glacies','Magnus','Petra','Rubrum','Silica',
            'Umbra','Vortex','Calor','Ventus','Saxa','Flamma','Alvus','Rima'],
  greek:  ['Aion','Boreas','Chronos','Eos','Helios','Notus','Phobos','Selene',
            'Styx','Tartaros','Zephyros','Chaos','Arete','Kairos','Ouranos','Antron'],
  arabic: ['Altair','Badr','Fajr','Hamal','Izar','Layl','Majd','Najm',
            'Raqib','Saif','Wasm','Zubr','Daur','Kafr','Qaws','Ghayb'],
  nordic: ['Asgard','Bifrost','Draupnir','Fjord','Grimr','Idavoll','Kaldur',
            'Ljosalf','Midgardr','Nidhog','Ragnar','Skjald','Hverl','Jormun','Eira','Odin'],
  phoneme: null, // use NameGen.generate()
};

// Preferred descriptor categories per planet type
const _TYPE_CATS = {
  star:         ['elevation','other','plain'],
  planet:       ['crater','elevation','ridge','depression','plain'],
  mercurylike:  ['crater','depression','ridge','elevation'],
  gasgiant:     ['plain','other','flow','ridge'],
  ringedgiant:  ['plain','other','flow','ridge'],
  moon:         ['crater','depression','elevation','ridge'],
  marslike:     ['depression','plain','ridge','flow'],
  asteroid:     ['crater','depression','ridge'],
  blackhole:    ['other','plain'],
  barycentre:   ['plain','other'],
};

// ════════════════════════════════════════════════════════════════════
// MODULE STATE
// ════════════════════════════════════════════════════════════════════
let _plmCandidates = [];   // generated but not yet applied
let _suffixTargetIdx = -1; // which lm-index the suffix modal is editing
let _selectedSuffixTerm = USGS_TERMS.find(t => t.term === 'Mons');

// ════════════════════════════════════════════════════════════════════
// ── 1. PROCEDURAL LANDMARKS ──────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

function openProceduralLandmarks() {
  const overlay = document.getElementById('proc-lm-overlay');
  if (!overlay) return;

  // Label with current planet
  const lbl = document.getElementById('plm-planet-label');
  if (lbl) {
    lbl.textContent = selectedBody ? `PLANET: ${selectedBody.toUpperCase()}` : 'NO PLANET SELECTED';
  }

  // Reset UI
  document.getElementById('plm-results').style.display = 'none';
  document.getElementById('plm-add-btn').style.display = 'none';
  document.getElementById('plm-progress-wrap').style.display = 'none';
  _plmCandidates = [];

  overlay.style.display = 'block';
}

function closeProceduralLandmarks() {
  const overlay = document.getElementById('proc-lm-overlay');
  if (overlay) overlay.style.display = 'none';
}

function runProceduralScan() {
  const count    = Math.min(4, Math.max(1, parseInt(document.getElementById('plm-count').value)  || 2));
  const style    = document.getElementById('plm-style').value;
  const minSep   = parseFloat(document.getElementById('plm-sep').value) || 40;
  const useSfx   = document.getElementById('plm-use-suffix').checked;
  const avoidEx  = document.getElementById('plm-avoid-existing').checked;

  // Get existing landmark angles to avoid
  const existing = avoidEx ? _getExistingAngles() : [];

  // Show progress
  const pWrap = document.getElementById('plm-progress-wrap');
  const pBar  = document.getElementById('plm-progress-bar');
  const pLbl  = document.getElementById('plm-progress-label');
  pWrap.style.display = 'block';
  pBar.style.width = '0%';
  pLbl.textContent = 'Analysing heightmap…';

  // Get body data
  const bodyData = (selectedBody && bodies[selectedBody]) ? bodies[selectedBody].data : null;
  const preset   = (selectedBody && bodies[selectedBody]) ? (bodies[selectedBody].preset || '') : '';

  // Infer planet type
  const meta    = (selectedBody && bodies[selectedBody])
    ? inferPresetMeta(preset, bodyData || {})
    : { id: 'planet' };
  const typeId  = meta.id;

  // Animate progress bar
  let prog = 0;
  const steps = [
    [20,  'Scanning heightmap topology…'],
    [45,  'Identifying surface features…'],
    [70,  'Applying separation constraints…'],
    [88,  'Generating descriptor names…'],
    [100, 'Done.'],
  ];
  let stepIdx = 0;
  const iv = setInterval(() => {
    if (stepIdx < steps.length) {
      const [target, label] = steps[stepIdx];
      prog = target;
      pBar.style.width = prog + '%';
      pLbl.textContent = label;
      stepIdx++;
    } else {
      clearInterval(iv);
      pBar.style.width = '100%';
      setTimeout(() => {
        pWrap.style.display = 'none';
        _doGenerate(count, style, minSep, useSfx, typeId, existing);
      }, 200);
    }
  }, 160);
}

function _getExistingAngles() {
  const angles = [];
  let i = 0;
  while (document.getElementById('lm-' + i)) {
    const c = parseFloat(document.getElementById(`lm-${i}-c-num`)?.value
           ?? document.getElementById(`lm-${i}-c`)?.value) || 0;
    angles.push(c);
    i++;
  }
  return angles;
}

function _doGenerate(count, style, minSepDeg, useSfx, typeId, existingAngles) {
  // Infer heightmap-like distribution by sampling terrain data or using pseudo-random seeded distribution
  const bodyData = (selectedBody && bodies[selectedBody]) ? bodies[selectedBody].data : null;

  // Generate candidate positions with minimum angular separation
  const positions = _generatePositions(count, minSepDeg, existingAngles);

  // Pick preferred descriptor categories for this planet type
  const catPref = _TYPE_CATS[typeId] || _TYPE_CATS.planet;

  // Build candidates
  const usedNames = new Set();
  _plmCandidates = positions.map((pos, idx) => {
    // Pick terrain category based on normalised elevation (simulated)
    const elev = pos.elev; // 0..1
    let catOptions;
    if (elev > 0.72)       catOptions = ['elevation', 'ridge'];
    else if (elev < 0.25)  catOptions = ['depression', 'plain', 'flow'];
    else                   catOptions = catPref;

    const availTerms = USGS_TERMS.filter(t => catOptions.includes(t.cat));
    const term       = availTerms[Math.floor(Math.random() * availTerms.length)] || USGS_TERMS[0];

    // Generate name
    let baseName;
    const pool = _LM_NAME_POOLS[style];
    if (!pool) {
      // Phoneme: use NameGen, strip any suffix it adds
      baseName = (NameGen.generate() || 'Unnamed').split(' ')[0];
    } else {
      let tries = 0;
      do {
        baseName = pool[Math.floor(Math.random() * pool.length)];
        tries++;
      } while (usedNames.has(baseName) && tries < 30);
    }
    usedNames.add(baseName);

    const fullName = useSfx ? `${baseName} ${term.term}` : baseName;

    return {
      name:     fullName,
      baseName,
      term:     useSfx ? term : null,
      prefix:   useSfx ? term.term : '',
      centre:   pos.centre,
      width:    pos.width,
      elev:     pos.elev,
    };
  });

  _renderPlmResults(_plmCandidates);
}

function _generatePositions(count, minSepDeg, existingAngles) {
  const positions = [];
  let attempts = 0;
  const maxAttempts = 500;

  while (positions.length < count && attempts < maxAttempts) {
    attempts++;
    const centre = Math.random() * 360;
    const width  = 5 + Math.random() * 25;           // 5–30°
    const elev   = Math.random();                     // simulated elevation

    // Check separation from other generated positions
    const tooCloseGen = positions.some(p => {
      const diff = Math.abs(p.centre - centre);
      return Math.min(diff, 360 - diff) < minSepDeg;
    });
    if (tooCloseGen) continue;

    // Check separation from existing landmarks
    const tooCloseEx = existingAngles.some(a => {
      const diff = Math.abs(a - centre);
      return Math.min(diff, 360 - diff) < minSepDeg * 0.75;
    });
    if (tooCloseEx) continue;

    positions.push({ centre: +centre.toFixed(1), width: +width.toFixed(1), elev });
  }

  return positions;
}

function _renderPlmResults(candidates) {
  const cont = document.getElementById('plm-results');
  const addBtn = document.getElementById('plm-add-btn');
  if (!candidates.length) {
    cont.innerHTML = '<div style="text-align:center;color:var(--ink4);font-family:\'JetBrains Mono\',monospace;font-size:.62rem;padding:12px 0">No valid positions found — try reducing Min. Sep or existing landmark count.</div>';
    cont.style.display = 'flex';
    addBtn.style.display = 'none';
    return;
  }

  cont.innerHTML = candidates.map((c, i) => {
    const elevPct = (c.elev * 100).toFixed(0);
    const catColor = c.term
      ? ({depression:'var(--sky2)', elevation:'var(--jade)', plain:'var(--ink3)',
          flow:'#6bb5ff',  crater:'var(--amber)', ridge:'var(--lilac)',
          other:'var(--ink4)'}[c.term.cat] || 'var(--ink3)')
      : 'var(--ink3)';
    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;
        background:rgba(10,14,30,.5);border:1px solid var(--rim);border-radius:6px">
        <div style="flex:1;min-width:0">
          <div style="font-family:'JetBrains Mono',monospace;font-size:.72rem;
            color:var(--ink3);margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
            id="plm-name-${i}">${c.name}</div>
          ${c.term ? `<div style="font-size:.57rem;color:${catColor};margin-bottom:1px">${c.term.term} — ${c.term.short}</div>` : ''}
          <div style="font-size:.55rem;color:var(--ink4);font-family:'JetBrains Mono',monospace">
            POS ${c.centre}° · WIDTH ${c.width}° · ELEV ~${elevPct}%
          </div>
        </div>
        <button onclick="plmReroll(${i})"
          style="flex-shrink:0;padding:4px 8px;background:none;border:1px solid var(--rim);
          border-radius:4px;color:var(--ink4);font-family:'JetBrains Mono',monospace;
          font-size:.55rem;cursor:pointer;transition:all .15s"
          onmouseover="this.style.borderColor='var(--sky)';this.style.color='var(--sky2)'"
          onmouseout="this.style.borderColor='var(--rim)';this.style.color='var(--ink4)'">↻</button>
      </div>`;
  }).join('');

  cont.style.display = 'flex';
  addBtn.style.display = 'block';
}

// Re-roll a single landmark name while keeping the position
function plmReroll(idx) {
  if (!_plmCandidates[idx]) return;
  const c = _plmCandidates[idx];
  const style = document.getElementById('plm-style').value;
  const useSfx = document.getElementById('plm-use-suffix').checked;

  const pool = _LM_NAME_POOLS[style];
  let newBase;
  if (!pool) {
    newBase = (NameGen.generate() || 'Unnamed').split(' ')[0];
  } else {
    newBase = pool[Math.floor(Math.random() * pool.length)];
  }

  if (useSfx && c.term) {
    c.name = `${newBase} ${c.term.term}`;
    c.baseName = newBase;
  } else {
    c.baseName = newBase;
    c.name = newBase;
  }

  const el = document.getElementById(`plm-name-${idx}`);
  if (el) el.textContent = c.name;
}

function applyProceduralLandmarks() {
  if (!_plmCandidates.length) return;

  const lmList = document.getElementById('lm-list');
  if (!lmList) return;

  _plmCandidates.forEach(c => {
    const i = lmList.children.length;
    const el = makeLandmark({
      name:       c.baseName,
      prefix:     c.prefix || '',
      startAngle: c.centre - c.width / 2,
      endAngle:   c.centre + c.width / 2,
    }, i);
    lmList.appendChild(el);
  });

  liveSync();
  closeProceduralLandmarks();
}


// ════════════════════════════════════════════════════════════════════
// ── 2. ADD SUFFIX MODAL ───────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

function openSuffixModal(lmIdx) {
  _suffixTargetIdx = lmIdx;
  _selectedSuffixTerm = USGS_TERMS.find(t => t.term === 'Mons') || USGS_TERMS[0];

  // Show current name
  const nameEl = document.getElementById(`lm-${lmIdx}-n`);
  const baseName = nameEl ? nameEl.value.trim() : '';
  const disp = document.getElementById('suffix-base-display');
  if (disp) disp.textContent = baseName || '(empty)';

  // Build list
  _buildSuffixList('', '');
  updateSuffixPreview();

  document.getElementById('suffix-overlay').style.display = 'block';
}

function closeSuffixModal() {
  document.getElementById('suffix-overlay').style.display = 'none';
  _suffixTargetIdx = -1;
}

function _buildSuffixList(filter, cat) {
  const list = document.getElementById('suffix-list');
  if (!list) return;

  const items = USGS_TERMS.filter(t =>
    (!filter || t.term.toLowerCase().includes(filter) || t.short.toLowerCase().includes(filter) || t.full.toLowerCase().includes(filter)) &&
    (!cat || t.cat === cat)
  );

  if (!items.length) {
    list.innerHTML = '<div style="padding:12px;text-align:center;font-family:\'JetBrains Mono\',monospace;font-size:.6rem;color:var(--ink4)">No descriptors match.</div>';
    return;
  }

  const CAT_COLORS = {
    depression:'var(--sky2)', elevation:'var(--jade)', plain:'var(--ink3)',
    flow:'#6bb5ff', crater:'var(--amber)', ridge:'var(--lilac)', other:'var(--ink4)',
  };

  list.innerHTML = items.map(t => {
    const isSelected = _selectedSuffixTerm && _selectedSuffixTerm.term === t.term;
    const cc = CAT_COLORS[t.cat] || 'var(--ink3)';
    return `
      <div onclick="selectSuffixTerm('${t.term}')"
        style="display:flex;align-items:stretch;border:1px solid ${isSelected ? 'rgba(204,153,68,.5)' : 'var(--rim)'};
        border-radius:6px;overflow:hidden;cursor:pointer;transition:border-color .15s;
        background:${isSelected ? 'rgba(204,153,68,.07)' : 'transparent'}"
        onmouseover="this.style.borderColor='${isSelected ? 'rgba(204,153,68,.6)' : 'var(--rim2)'}'"
        onmouseout="this.style.borderColor='${isSelected ? 'rgba(204,153,68,.5)' : 'var(--rim)'}'">
        <div style="padding:7px 11px;background:var(--panel3);border-right:1px solid var(--rim);
          font-family:'JetBrains Mono',monospace;font-size:.65rem;font-weight:700;
          color:${cc};min-width:88px;display:flex;align-items:center;flex-shrink:0">${t.term}</div>
        <div style="padding:6px 10px;display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">
          <div style="font-size:.62rem;color:var(--ink2);font-weight:600">${t.plural}
            <span style="color:var(--ink4);font-weight:400;font-size:.55rem"> · ${t.cat}</span></div>
          <div style="font-size:.57rem;color:var(--ink4);line-height:1.4;
            overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${t.full}</div>
        </div>
      </div>`;
  }).join('');
}

function filterSuffixList() {
  const f = (document.getElementById('suffix-search')?.value || '').toLowerCase().trim();
  const c = document.getElementById('suffix-cat')?.value || '';
  _buildSuffixList(f, c);
}

function selectSuffixTerm(termStr) {
  _selectedSuffixTerm = USGS_TERMS.find(t => t.term === termStr) || null;
  // Rebuild to update selected highlight
  filterSuffixList();
  updateSuffixPreview();
}

function updateSuffixPreview() {
  const nameEl = document.getElementById(`lm-${_suffixTargetIdx}-n`);
  const base   = (nameEl ? nameEl.value.trim() : '') ||
                 (document.getElementById('suffix-base-display')?.textContent || 'Name');
  const pos    = document.querySelector('input[name="suffix-pos"]:checked')?.value || 'after';
  const t      = _selectedSuffixTerm;

  const prevName = document.getElementById('suffix-preview-name');
  const prevDesc = document.getElementById('suffix-preview-desc');
  if (!prevName || !prevDesc) return;

  if (t) {
    const termHtml = `<span style="color:var(--amber)">${t.term}</span>`;
    prevName.innerHTML = pos === 'after'
      ? `${base} ${termHtml}`
      : `${termHtml} ${base}`;
    prevDesc.textContent = t.full;
  } else {
    prevName.textContent = base;
    prevDesc.textContent = 'Select a descriptor below.';
  }
}

function applySuffix() {
  if (_suffixTargetIdx < 0) return;
  const nameEl = document.getElementById(`lm-${_suffixTargetIdx}-n`);
  if (!nameEl) return;

  const base = nameEl.value.trim();
  const pos  = document.querySelector('input[name="suffix-pos"]:checked')?.value || 'after';
  const t    = _selectedSuffixTerm;

  if (!t) { closeSuffixModal(); return; }

  nameEl.value = pos === 'after' ? `${base} ${t.term}` : `${t.term} ${base}`;
  nameEl.dispatchEvent(new Event('input'));
  liveSync();
  closeSuffixModal();
}

// Close modals on overlay click
document.addEventListener('click', e => {
  const procOv = document.getElementById('proc-lm-overlay');
  const sufOv  = document.getElementById('suffix-overlay');
  if (e.target === procOv) closeProceduralLandmarks();
  if (e.target === sufOv)  closeSuffixModal();
});
