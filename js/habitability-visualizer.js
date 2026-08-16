// ════════════════════════════════ HABITABILITY VISUALIZER ════════════════════════════════
// Shows the habitable/goldilocks zone for a selected star based on its spectral type.
// Accounts for SFS difficulty scaling of stellar luminosity.
//
// Usage:
//   • Click "Habitability" button in sidebar
//   • Select a body (star)
//   • Select its spectral type (O, B, A, F, G, K, M)
//   • View calculated habitable zone with difficulty adjustments
// ─────────────────────────────────────────────────────────────────────────────────────────

// ── Star Type Data (HR Diagram parameters) ──────────────────────────────────────────────
// Habitable zone calculated using: d_AU = sqrt(L_star / L_sun)
// where L is luminosity relative to the Sun
//
// References: https://en.wikipedia.org/wiki/Habitable_zone
const STAR_TYPES = {
  'O': {
    name: 'O Type (Blue)',
    color: '#3366ff',
    tempK: 30000,
    luminosity: 30000,    // 30,000x Sun's luminosity
    description: 'Extremely hot and bright. Short-lived. Habitable zone very far.'
  },
  'B': {
    name: 'B Type (Blue-White)',
    color: '#4488ff',
    tempK: 10000,
    luminosity: 400,      // ~400x Sun's luminosity
    description: 'Very bright, hot blue stars. Habitable zone distant.'
  },
  'A': {
    name: 'A Type (White)',
    color: '#6699ff',
    tempK: 7500,
    luminosity: 15,       // ~15x Sun's luminosity
    description: 'Bright white stars. Habitable zone moderate distance.'
  },
  'F': {
    name: 'F Type (Yellow-White)',
    color: '#ffdd00',
    tempK: 6000,
    luminosity: 5,        // ~5x Sun's luminosity
    description: 'Warm, yellow-white stars similar to early Sun.'
  },
  'G': {
    name: 'G Type (Yellow) ☉ Sun-like',
    color: '#ffff00',
    tempK: 5500,
    luminosity: 1,        // Sun = 1.0
    description: 'Like our Sun. Habitable zone closest of all types.'
  },
  'K': {
    name: 'K Type (Orange)',
    color: '#ff9900',
    tempK: 4000,
    luminosity: 0.4,      // ~0.4x Sun's luminosity
    description: 'Cool orange dwarfs. Habitable zone close to star.'
  },
  'M': {
    name: 'M Type (Red)',
    color: '#ff5555',
    tempK: 3000,
    luminosity: 0.06,     // ~0.06x Sun's luminosity (red dwarf)
    description: 'Cool red dwarfs. Habitable zone very close, long-lived.'
  }
};

// Habitable zone inner/outer edges (AU) for reference star temperatures
// Based on Kopparapu et al. 2013 model
const HZ_COEFFICIENTS = {
  // Venus limit (hot edge), Earth, Mars limit (cold edge)
  // These are calibrated for different star temperatures
  // Format: {temp: [S_eff_inner, S_eff_outer]}
  3000:  {inner: 0.53, outer: 1.59},  // Red dwarf
  3500:  {inner: 0.55, outer: 1.58},
  4000:  {inner: 0.58, outer: 1.59},  // K type
  5000:  {inner: 0.62, outer: 1.70},
  5500:  {inner: 0.63, outer: 1.77},  // Sun
  6000:  {inner: 0.64, outer: 1.88},  // F type
  7000:  {inner: 0.65, outer: 2.04},
  7500:  {inner: 0.65, outer: 2.20},  // A type
  10000: {inner: 0.65, outer: 2.60},  // B type
};

// ── UI State ──────────────────────────────────────────────────────────────────────────────
let _habSelectedBody = null;
let _habSelectedStarType = null;

// ── Main Modal ────────────────────────────────────────────────────────────────────────────
function openHabitabilityVisualizer() {
  const modal = document.getElementById('modal-habitability');
  if (!modal) {
    console.error('[SFS|HAB] Habitability modal not found');
    return;
  }

  _habSelectedBody = null;
  _habSelectedStarType = null;

  // Reset UI to body selection step
  document.getElementById('hab-step-body').style.display = 'block';
  document.getElementById('hab-step-type').style.display = 'none';
  document.getElementById('hab-step-results').style.display = 'none';

  // Populate body list
  const bodyList = document.getElementById('hab-body-list');
  bodyList.innerHTML = '';
  for (const [bodyName, bodyData] of Object.entries(bodies || {})) {
    const btn = document.createElement('button');
    btn.className = 'hab-body-btn';
    btn.textContent = bodyName;
    btn.onclick = () => selectHabitabilityBody(bodyName, bodyData);
    bodyList.appendChild(btn);
  }

  modal.classList.add('open');
}

function closeHabitabilityVisualizer() {
  const modal = document.getElementById('modal-habitability');
  if (modal) modal.classList.remove('open');
}

// ── Step 1: Select Body ────────────────────────────────────────────────────────────────────
function selectHabitabilityBody(bodyName, bodyData) {
  _habSelectedBody = { name: bodyName, data: bodyData };
  document.getElementById('hab-selected-body').textContent = bodyName;

  // Move to star type selection
  document.getElementById('hab-step-body').style.display = 'none';
  document.getElementById('hab-step-type').style.display = 'block';

  // Populate star type buttons
  const typeList = document.getElementById('hab-type-list');
  typeList.innerHTML = '';
  for (const [code, typeData] of Object.entries(STAR_TYPES)) {
    const btn = document.createElement('button');
    btn.className = 'hab-type-btn';
    btn.style.borderColor = typeData.color;
    btn.innerHTML = `<span style="color:${typeData.color};font-weight:bold">${code}</span> ${typeData.name}`;
    btn.onclick = () => selectHabitabilityStarType(code, typeData);
    typeList.appendChild(btn);
  }
}

// ── Step 2: Select Star Type ──────────────────────────────────────────────────────────────
function selectHabitabilityStarType(code, typeData) {
  _habSelectedStarType = { code, ...typeData };

  // Calculate and display results
  calculateHabitabilityZone();

  // Move to results
  document.getElementById('hab-step-body').style.display = 'none';
  document.getElementById('hab-step-type').style.display = 'none';
  document.getElementById('hab-step-results').style.display = 'block';
}

// ── Step 3: Calculate & Display ───────────────────────────────────────────────────────────
function calculateHabitabilityZone() {
  if (!_habSelectedBody || !_habSelectedStarType) return;

  // Get difficulty multiplier
  const difficultyKey = document.getElementById('difficulty-select')?.value || 'Normal';
  const diffMult = DIFFICULTY_MULTIPLIERS[difficultyKey]?.smaMultiplier || 1;

  const star = _habSelectedStarType;
  const body = _habSelectedBody.data;
  const bodyName = _habSelectedBody.name;

  // Effective luminosity = star's base luminosity × difficulty multiplier
  // (On harder difficulties, stars appear brighter due to SMA scaling)
  const effectiveLuminosity = star.luminosity * diffMult;

  // Calculate habitable zone using inverse square law
  // d = sqrt(L_star / L_sun) in AU
  const hz_center_au = Math.sqrt(effectiveLuminosity);

  // Estimate inner/outer edges (±30% is a simplified model)
  // More accurate model uses Kopparapu coefficients
  const hz_inner_au = hz_center_au * 0.85;
  const hz_outer_au = hz_center_au * 1.15;

  // Convert to display units
  const bodyRadius = (body?.BASE_DATA?.radius || 1) / 1e6; // to Mm
  const sma = (body?.ORBIT?.semiMajorAxis || 0) / 1e9; // to Gm

  // Display results
  document.getElementById('hab-star-type').innerHTML = `
    <span style="color:${star.color};font-weight:bold">${star.code}-Type</span> ${star.name}
  `;
  document.getElementById('hab-star-temp').textContent = `${star.tempK.toLocaleString()} K`;
  document.getElementById('hab-star-lum').textContent = `${effectiveLuminosity.toFixed(1)}x Sun`;
  document.getElementById('hab-star-desc').textContent = star.description;

  document.getElementById('hab-body-name').textContent = bodyName;
  document.getElementById('hab-body-sma').textContent = sma > 0 ? `${sma.toFixed(3)} Gm` : '(orbiting)';

  // Habitable zone
  const hz_inner_gm = hz_inner_au * 149.597870700; // AU to Gm
  const hz_outer_gm = hz_outer_au * 149.597870700;

  document.getElementById('hab-hz-inner').textContent = `${hz_inner_gm.toFixed(2)} Gm`;
  document.getElementById('hab-hz-center').textContent = `${(hz_center_au * 149.597870700).toFixed(2)} Gm`;
  document.getElementById('hab-hz-outer').textContent = `${hz_outer_gm.toFixed(2)} Gm`;

  // Habitability assessment
  let habitabilityStatus = 'Not in habitable zone';
  let habitabilityColor = '#ff6666';

  if (sma > 0) {
    if (sma >= hz_inner_gm && sma <= hz_outer_gm) {
      habitabilityStatus = '✓ In habitable zone!';
      habitabilityColor = '#66ff66';
    } else if (sma < hz_inner_gm) {
      const percent = ((hz_inner_gm - sma) / hz_inner_gm * 100).toFixed(0);
      habitabilityStatus = `Too close (${percent}% closer than inner edge)`;
      habitabilityColor = '#ff9966';
    } else {
      const percent = ((sma - hz_outer_gm) / hz_outer_gm * 100).toFixed(0);
      habitabilityStatus = `Too far (${percent}% farther than outer edge)`;
      habitabilityColor = '#6699ff';
    }
  }

  document.getElementById('hab-assessment').textContent = habitabilityStatus;
  document.getElementById('hab-assessment').style.color = habitabilityColor;

  // Difficulty note
  if (diffMult !== 1) {
    const diffNote = `(Difficulty: ${difficultyKey} — ${diffMult}× luminosity)`;
    document.getElementById('hab-difficulty-note').textContent = diffNote;
    document.getElementById('hab-difficulty-note').style.display = 'block';
  } else {
    document.getElementById('hab-difficulty-note').style.display = 'none';
  }

  // Draw visualization
  drawHabitabilityVisualization(hz_inner_gm, hz_center_gm = hz_center_au * 149.597870700, hz_outer_gm, sma);
}

// ── Visualization ────────────────────────────────────────────────────────────────────────
function drawHabitabilityVisualization(innerAU, centerAU, outerAU, bodyAU) {
  const canvas = document.getElementById('hab-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const centerX = W / 2;
  const centerY = H / 2;

  ctx.clearRect(0, 0, W, H);

  // Scale: fit outer zone on screen
  const maxDist = outerAU * 1.2;
  const scale = (W / 2 - 60) / maxDist;

  // Draw star at center
  ctx.fillStyle = _habSelectedStarType.color;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
  ctx.fill();

  // Draw habitable zone (green band)
  ctx.fillStyle = 'rgba(100, 255, 100, 0.15)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerAU * scale, 0, Math.PI * 2);
  ctx.arc(centerX, centerY, outerAU * scale, 0, Math.PI * 2, true);
  ctx.fill();

  // Draw inner edge line
  ctx.strokeStyle = 'rgba(100, 200, 100, 0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerAU * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Draw outer edge line
  ctx.beginPath();
  ctx.arc(centerX, centerY, outerAU * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Draw body orbit if applicable
  if (bodyAU > 0) {
    const r = bodyAU * scale;
    if (r < W && r < H) {
      ctx.strokeStyle = 'rgba(150, 150, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw body position marker
      ctx.fillStyle = '#88ccff';
      ctx.beginPath();
      ctx.arc(centerX + r, centerY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw grid/labels
  ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';

  const gridLines = [1, 2, 3, 4, 5];
  for (const d of gridLines) {
    if (d <= maxDist) {
      const r = d * scale;
      ctx.strokeStyle = 'rgba(200, 200, 200, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillText(`${d} AU`, centerX + r + 10, centerY - 5);
    }
  }

  // Labels
  ctx.fillStyle = 'rgba(150, 200, 150, 0.7)';
  ctx.textAlign = 'center';
  ctx.font = 'bold 12px monospace';
  ctx.fillText('★ ' + _habSelectedStarType.code + '-Type', centerX, 20);

  ctx.fillStyle = 'rgba(150, 200, 150, 0.5)';
  ctx.font = '10px monospace';
  const infoLines = [
    'Green band = Habitable Zone',
    'Blue circle = Body orbit (if applicable)'
  ];
  infoLines.forEach((line, i) => {
    ctx.fillText(line, centerX, H - 15 - i * 15);
  });
}

// ── Initialization (call once on page load) ────────────────────────────────────────────────
function initHabitabilityVisualizer() {
  // Modal HTML is added by sidebar.js or index.html
  // This just sets up event handlers
  const habBtn = document.getElementById('btn-habitability');
  if (habBtn) {
    habBtn.onclick = openHabitabilityVisualizer;
  }

  // Close button
  const closeBtn = document.getElementById('hab-close-btn');
  if (closeBtn) {
    closeBtn.onclick = closeHabitabilityVisualizer;
  }

  // Back buttons
  const backBtns = document.querySelectorAll('.hab-back-btn');
  backBtns.forEach(btn => {
    btn.onclick = () => {
      document.getElementById('hab-step-results').style.display = 'none';
      document.getElementById('hab-step-type').style.display = 'block';
    };
  });

  console.log('[SFS|HAB] Habitability Visualizer initialized');
}

// Auto-init when DOM ready
if (document.readyState !== 'loading') {
  initHabitabilityVisualizer();
} else {
  document.addEventListener('DOMContentLoaded', initHabitabilityVisualizer);
}
