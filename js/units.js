// ════════════════════════════════ UNIT CONVERSION ════════════════════════════════
// All distance fields store raw metres internally.
// The unit selector controls display/entry scale.
// Typing "1.5 AU" or "300 km" is parsed on blur and converted to metres.
// Changing the unit selector re-expresses the current metres in the new unit.

const UNIT_TO_M = {
  m:       1,
  km:      1e3,
  Mm:      1e6,
  Gm:      1e9,
  AU:      1.495978707e11,
  ly:      9.4607304725808e15,
  R_earth: 6.371e6,   // Earth radius (~6,371 km)
  R_sun:   6.957e8,   // Sun radius (~695,700 km)
  R_jupiter: 7.1492e7, // Jupiter radius (~71,492 km)
};

// Maximum allowed planet/body radius in metres (750 km)
const MAX_RADIUS_M = 750000;

// SMA difficulty: raw stored value × mult = in-game distance at that difficulty
// Normal=1:20, Hard=1:10, Realistic=1:1
const SMA_DIFF_MULT = { Normal: 1/20, Hard: 1/10, Realistic: 1 };

// ── Formatting helpers ─────────────────────────────────────────────────────────
function _fmt(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e9)  return v.toExponential(3);
  if (abs >= 1000) return parseFloat(v.toPrecision(6)).toString();
  if (abs >= 1)    return parseFloat(v.toPrecision(5)).toString();
  return parseFloat(v.toPrecision(4)).toString();
}

function _fmtHint(metres, unit) {
  const f = UNIT_TO_M[unit] ?? 1;
  return _fmt(metres / f) + '\u202f' + unit;
}

// Express metres in a given unit for display in the input box
function _metresToDisplay(metres, unit) {
  const f = UNIT_TO_M[unit] ?? 1;
  const v = metres / f;
  // Enough precision to roundtrip losslessly
  if (Math.abs(v) >= 1e9) return parseFloat(v.toPrecision(7)).toString();
  if (Math.abs(v) >= 100) return parseFloat(v.toPrecision(6)).toString();
  return parseFloat(v.toPrecision(7)).toString();
}

// ── Parse "1.5 AU" or "300 km" or "1.5e11" ────────────────────────────────────
function _parseUnitString(str) {
  if (!str) return null;
  const m = str.trim().match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-zA-Z_⊕☉°]*)$/);
  if (!m) return null;
  return { value: parseFloat(m[1]), unit: m[2] || null };
}

const _ALIAS = {
  'm': 'm', 'meter': 'm', 'meters': 'm', 'metre': 'm', 'metres': 'm',
  'km': 'km', 'kilometer': 'km', 'kilometre': 'km', 'kilometers': 'km',
  'mm': 'Mm', 'megameter': 'Mm', 'megametre': 'Mm', 'megameters': 'Mm',
  'gm': 'Gm', 'gigameter': 'Gm', 'gigametre': 'Gm', 'gigameters': 'Gm',
  'au': 'AU',
  'ly': 'ly', 'lightyear': 'ly', 'light-year': 'ly', 'lightyears': 'ly',
  'rearth': 'R_earth', 're': 'R_earth', 'r_earth': 'R_earth',
  'rsun': 'R_sun', 'rs': 'R_sun', 'r_sun': 'R_sun',
  'rjupiter': 'R_jupiter', 'rj': 'R_jupiter', 'r_jupiter': 'R_jupiter',
};

function _resolveUnit(raw) {
  if (!raw) return null;
  const lc = raw.toLowerCase().replace(/[⊕☉°]/g, '');
  return _ALIAS[lc] ?? null;
}

// ── Internal state: store metres per input id ──────────────────────────────────
// ── Radius cap ───────────────────────────────────────────────────────────────
function _capRadius(metres, inputId) {
  if (inputId !== 'b-radius') return metres;
  return Math.min(metres, MAX_RADIUS_M);
}

const _distMetres = {};  // { inputId: rawMetres }

// ── Core: set input to display a metres value in the current unit ──────────────
function _applyMetres(inputId, unitSelId, hintId, mode, metres) {
  metres = _capRadius(metres, inputId);
  _distMetres[inputId] = metres;
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(unitSelId);
  if (!input) return;
  const unit = unitSel?.value || 'm';
  input.value = metres !== 0 ? _metresToDisplay(metres, unit) : '';
  _updateHint(metres, unitSelId, hintId, mode);
}

// ── Public: called from fillSidebar to populate a field ───────────────────────
function setDistInput(inputId, unitSelId, hintId, metres, mode) {
  // Auto-select a sensible default unit if none has been chosen yet
  const unitSel = document.getElementById(unitSelId);
  if (unitSel && unitSel.dataset.userPicked !== '1') {
    unitSel.value = _bestUnit(metres, mode);
  }
  _applyMetres(inputId, unitSelId, hintId, mode, metres ?? 0);
}

// Pick a sensible unit for a given metres value
function _bestUnit(m, mode) {
  const abs = Math.abs(m);
  if (mode === 'sma') {
    if (abs === 0)        return 'AU';
    if (abs < 1e6)        return 'km';
    if (abs < 1e9)        return 'Mm';
    if (abs < 5e12)       return 'AU';
    return 'ly';
  } else {
    // radius
    if (abs < 1e5)        return 'km';
    if (abs < 5e7)        return 'km';
    if (abs < 1e9)        return 'Mm';
    return 'Gm';
  }
}

// ── Public: read metres back out (used by liveSync / buildOrbitData) ──────────
function getDistMetres(inputId) {
  // Prefer stored value; fall back to parsing whatever is in the box as metres
  if (_distMetres[inputId] !== undefined) return _distMetres[inputId];
  return parseFloat(document.getElementById(inputId)?.value) || 0;
}

// ── Event: user typed something in the input box ───────────────────────────────
// oninput — live preview of converted value in hint
function onDistInput(inputId, unitSelId, hintId, mode) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(unitSelId);
  const raw = input?.value?.trim() || '';

  const parsed = _parseUnitString(raw);
  if (!parsed) return;

  let metres;
  if (parsed.unit) {
    const resolved = _resolveUnit(parsed.unit);
    const factor   = (resolved && UNIT_TO_M[resolved]) ? UNIT_TO_M[resolved]
                   : (UNIT_TO_M[unitSel?.value] ?? 1);
    metres = parsed.value * factor;
  } else {
    const factor = UNIT_TO_M[unitSel?.value] ?? 1;
    metres = parsed.value * factor;
  }
  metres = _capRadius(metres, inputId);
  _distMetres[inputId] = metres;
  _updateHint(metres, unitSelId, hintId, mode);
  if (typeof liveSync === 'function') liveSync();
}

// ── Event: user changed the unit dropdown ─────────────────────────────────────
// Re-express current metres in the new unit
function onUnitChange(inputId, unitSelId, hintId, mode) {
  const unitSel = document.getElementById(unitSelId);
  if (unitSel) unitSel.dataset.userPicked = '1';
  const metres = _distMetres[inputId] ?? (parseFloat(document.getElementById(inputId)?.value) || 0);
  _applyMetres(inputId, unitSelId, hintId, mode, metres);
  if (typeof liveSync === 'function') liveSync();
}

// ── Attach blur parser so "1.5 AU" typed in the box is converted ──────────────
function attachUnitParser(inputId, unitSelId, hintId, mode) {
  const input   = document.getElementById(inputId);
  const unitSel = document.getElementById(unitSelId);
  if (!input) return;

  // Use text input so user can type units inline
  input.type       = 'text';
  input.inputMode  = 'decimal';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocorrect',  'off');
  input.setAttribute('spellcheck',   'false');

  input.addEventListener('blur', () => {
    const raw    = input.value.trim();
    const parsed = _parseUnitString(raw);
    if (!parsed) return;

    let metres;
    if (parsed.unit) {
      const resolved = _resolveUnit(parsed.unit);
      if (resolved && UNIT_TO_M[resolved]) {
        metres = parsed.value * UNIT_TO_M[resolved];
        // Switch the selector to match the typed unit
        if (unitSel) {
          const opt = Array.from(unitSel.options).find(o => o.value === resolved);
          if (opt) { unitSel.value = resolved; unitSel.dataset.userPicked = '1'; }
        }
      } else {
        // Unrecognised unit — treat as current unit
        metres = parsed.value * (UNIT_TO_M[unitSel?.value] ?? 1);
      }
    } else {
      metres = parsed.value * (UNIT_TO_M[unitSel?.value] ?? 1);
    }

    metres = _capRadius(metres, inputId);
    _distMetres[inputId] = metres;
    // Re-display in current unit (strips the typed unit text cleanly)
    const unit = unitSel?.value || 'm';
    input.value = metres !== 0 ? _metresToDisplay(metres, unit) : '';
    _updateHint(metres, unitSelId, hintId, mode);
    if (typeof liveSync === 'function') liveSync();
  });

  // Live hint as user types
  input.addEventListener('input', () => {
    const raw    = input.value.trim();
    const parsed = _parseUnitString(raw);
    if (!parsed) return;
    let metres;
    if (parsed.unit) {
      const resolved = _resolveUnit(parsed.unit);
      const factor   = (resolved && UNIT_TO_M[resolved]) ? UNIT_TO_M[resolved]
                     : (UNIT_TO_M[unitSel?.value] ?? 1);
      metres = parsed.value * factor;
    } else {
      metres = parsed.value * (UNIT_TO_M[unitSel?.value] ?? 1);
    }
    _distMetres[inputId] = metres;
    _updateHint(metres, unitSelId, hintId, mode);
    if (typeof liveSync === 'function') liveSync();
  });
}

// ── Hint builder ───────────────────────────────────────────────────────────────
function _updateHint(metres, unitSelId, hintId, mode) {
  const hintEl  = document.getElementById(hintId);
  if (!hintEl) return;
  if (!metres) { hintEl.classList.remove('show'); hintEl.textContent = ''; return; }

  const unit  = document.getElementById(unitSelId)?.value || 'm';
  const lines = [];

  if (mode === 'sma') {
    // Show per-difficulty actual in-game distances
    const n = metres * SMA_DIFF_MULT.Normal;
    const h = metres * SMA_DIFF_MULT.Hard;
    const r = metres * SMA_DIFF_MULT.Realistic;
    lines.push(
      'N\u202f' + _fmtHint(n, unit) +
      '  H\u202f' + _fmtHint(h, unit) +
      '  R\u202f' + _fmtHint(r, unit)
    );
    // Also show in AU if different unit selected
    if (unit !== 'AU') {
      lines.push(
        'N\u202f' + _fmtHint(n, 'AU') +
        '  H\u202f' + _fmtHint(h, 'AU') +
        '  R\u202f' + _fmtHint(r, 'AU')
      );
    }
  } else {
    // Radius: show conversions in useful units
    const alts = [];
    if (unit !== 'km')      alts.push(_fmtHint(metres, 'km'));
    if (unit !== 'R_earth') alts.push(_fmtHint(metres, 'R_earth') + ' R⊕');
    if (unit !== 'R_sun' && metres > 5e7) alts.push(_fmtHint(metres, 'R_sun') + ' R☉');
    if (unit !== 'R_jupiter' && metres > 1e7) alts.push(_fmtHint(metres, 'R_jupiter') + ' R♃');
    if (alts.length) lines.push(alts.join('  ·  '));
    // Show cap warning if at limit
    if (metres >= MAX_RADIUS_M) lines.push('⚠ capped at 750 km max radius');
  }

  if (lines.length) {
    hintEl.textContent = lines.join('\n');
    hintEl.classList.add('show');
  } else {
    hintEl.classList.remove('show');
    hintEl.textContent = '';
  }
}

// ── Wire up all distance fields after DOM is ready ────────────────────────────
function initUnitInputs() {
  [
    ['or-sma',   'or-sma-unit',   'or-sma-hint',   'sma'],
    ['b-radius', 'b-radius-unit', 'b-radius-hint',  'radius'],
    ['rng-sr',   'rng-sr-unit',   'rng-sr-hint',    'radius'],
    ['rng-er',   'rng-er-unit',   'rng-er-hint',    'radius'],
  ].forEach(([a, b, c, d]) => attachUnitParser(a, b, c, d));
}
