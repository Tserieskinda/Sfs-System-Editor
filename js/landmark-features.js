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
    short:'Hollow / irregular depression',
    full:'Hollows, irregular steep-sided depressions usually in arrays or clusters.' },
  { term:'Chaos',       plural:'Chaoses',    cat:'depression',
    short:'Disrupted / chaotic terrain',
    full:'Distinctively disrupted terrain; characteristic of Europa\'s chaotic regions.' },
  { term:'Chasma',      plural:'Chasmata',   cat:'depression',
    short:'Deep canyon or trench',
    full:'A deep, elongated, steep-sided depression — canyon or trench.' },
  { term:'Fossa',       plural:'Fossae',     cat:'depression',
    short:'Long narrow trench / groove',
    full:'Long, narrow, shallow linear depression — a trench or groove.' },
  { term:'Lacuna',      plural:'Lacunae',    cat:'depression',
    short:'Irregular depression',
    full:'An irregular depression or hole, often with scalloped edges.' },
  { term:'Lacus',       plural:'Lacus',      cat:'depression',
    short:'Small plain / lake',
    full:'A small plain; on Titan, denotes dark hydrocarbon lakes.' },
  { term:'Patera',      plural:'Paterae',    cat:'depression',
    short:'Shallow volcanic crater',
    full:'An irregular crater or complex caldera with scalloped, lobate edges.' },
  { term:'Sinus',       plural:'Sinus',      cat:'depression',
    short:'Bay / inlet',
    full:'A bay; a recess in the boundary of a plain or lowland.' },

  // ── Impact features ───────────────────────────────────────────────
  { term:'Caldera',     plural:'Calderas',   cat:'crater',
    short:'Summit volcanic depression',
    full:'Large volcanic depression formed by collapse or explosive eruption.' },
  { term:'Crater',      plural:'Craters',    cat:'crater',
    short:'Impact bowl',
    full:'A circular depression formed by meteorite impact or volcanic activity.' },

  // ── Elevations ────────────────────────────────────────────────────
  { term:'Colles',      plural:'Colles',     cat:'elevation',
    short:'Small hills / knobs',
    full:'Small hills or knobs; a diminutive cluster of terrain bumps.' },
  { term:'Corona',      plural:'Coronae',    cat:'elevation',
    short:'Oval / ovoid feature',
    full:'Oval or circular features, often elevated, possibly of volcanic origin.' },
  { term:'Mensa',       plural:'Mensae',     cat:'elevation',
    short:'Flat-topped mesa',
    full:'A flat-topped prominence with cliff-like edges; a mesa.' },
  { term:'Mons',        plural:'Montes',     cat:'elevation',
    short:'Mountain or volcano',
    full:'A mountain or volcano; isolated peak or part of a range.' },
  { term:'Promontorium',plural:'Promontoria',cat:'elevation',
    short:'Headland / cape',
    full:'A cape or headland projecting into a lowland or sea.' },
  { term:'Tholus',      plural:'Tholi',      cat:'elevation',
    short:'Small dome / rounded hill',
    full:'A small dome or rounded hill, often of volcanic origin.' },

  // ── Plains / Plateaus ─────────────────────────────────────────────
  { term:'Planitia',    plural:'Planitiae',  cat:'plain',
    short:'Low flat plain',
    full:'A low plain; often large and relatively flat lowland terrain.' },
  { term:'Planum',      plural:'Plana',      cat:'plain',
    short:'Elevated plateau',
    full:'A plateau or high plain; elevated flat terrain.' },
  { term:'Regio',       plural:'Regiones',   cat:'plain',
    short:'Region of distinct albedo',
    full:'A large area distinguished by reflectivity or color from adjacent terrain.' },
  { term:'Terra',       plural:'Terrae',     cat:'plain',
    short:'Extensive land mass',
    full:'An extensive land mass; a continent-scale terrain unit.' },
  { term:'Tessera',     plural:'Tesserae',   cat:'plain',
    short:'Complex ridged terrain',
    full:'Tile-like, complex ridged terrain (characteristic of Venus).' },
  { term:'Vastitas',    plural:'Vastitates', cat:'plain',
    short:'Widespread lowland',
    full:'A widespread lowland plain, larger scale than Planitia.' },

  // ── Ridges / Scarps ───────────────────────────────────────────────
  { term:'Dorsum',      plural:'Dorsa',      cat:'ridge',
    short:'Ridge',
    full:'A ridge; an elongated raised feature, often curved.' },
  { term:'Rupes',       plural:'Rupes',      cat:'ridge',
    short:'Escarpment / cliff',
    full:'A scarp; a long, steep cliff or escarpment.' },
  { term:'Scopulus',    plural:'Scopuli',    cat:'ridge',
    short:'Lobate or irregular scarp',
    full:'A lobate or irregular scarp, often at terrain-type boundaries.' },
  { term:'Sulcus',      plural:'Sulci',      cat:'ridge',
    short:'Groove / furrow',
    full:'A groove or furrow; linear ridge-and-trough terrain.' },

  // ── Flows / Channels ─────────────────────────────────────────────
  { term:'Flumen',      plural:'Flumina',    cat:'flow',
    short:'Channel / river',
    full:'A channel where liquid flows; used on Titan for hydrocarbon rivers.' },
  { term:'Fluctus',     plural:'Fluctus',    cat:'flow',
    short:'Flow terrain',
    full:'Flow terrain associated with volcanic lava or cryovolcanic outflows.' },
  { term:'Vallis',      plural:'Valles',     cat:'flow',
    short:'Valley / erosional channel',
    full:'A valley, often formed by erosion from flowing liquid (water or lava).' },

  // ── Other / Albedo ────────────────────────────────────────────────
  { term:'Facula',      plural:'Faculae',    cat:'other',
    short:'Bright spot',
    full:'A bright spot on the surface, often of high reflectivity.' },
  { term:'Insula',      plural:'Insulae',    cat:'other',
    short:'Island',
    full:'An island; isolated landmass surrounded by lower terrain.' },
  { term:'Linea',       plural:'Lineae',     cat:'other',
    short:'Linear marking / streak',
    full:'A dark or bright elongated marking — lines or streaks on the surface.' },
  { term:'Macula',      plural:'Maculae',    cat:'other',
    short:'Dark spot',
    full:'A dark spot, irregular in shape.' },
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
      name:       c.name,
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
