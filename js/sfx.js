// ════════════════════════════════════════════════════════════════════
//  SFX  —  UI sound effects
//  Auto-loads from assets/ on startup via Web Audio API.
//  Volume: 0.35 global.  Positive plays at most once every 2 seconds.
// ════════════════════════════════════════════════════════════════════

const SFX = (() => {

  const VOLUME       = 0.35;   // master volume for all sounds
  const POS_COOLDOWN = 2000;   // ms min gap between Positive plays

  // ── Audio context ─────────────────────────────────────────────────
  let _ctx = null;
  function _getCtx() {
    if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  // ── Buffer store ─────────────────────────────────────────────────
  const _bufs = {};
  const _FILES = {
    click:    'assets/Click.wav',
    select:   'assets/Select.wav',
    positive: 'assets/Positive.wav',
    warning:  'assets/Warning.mp3',
  };

  async function _loadAll() {
    await Promise.allSettled(
      Object.entries(_FILES).map(async ([key, path]) => {
        try {
          const res = await fetch(path);
          if (!res.ok) return;
          _bufs[key] = await _getCtx().decodeAudioData(await res.arrayBuffer());
        } catch (_) {}
      })
    );
  }

  // ── Volume control ────────────────────────────────────────────────
  let _volume = VOLUME;
  function setVolume(v) { _volume = Math.max(0, Math.min(1, v)); }

  // ── Playback ──────────────────────────────────────────────────────
  function _play(key) {
    const buf = _bufs[key];
    if (!buf) return;
    try {
      const ctx  = _getCtx();
      const src  = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = _volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(0);
    } catch (_) {}
  }

  // Positive: cooldown guard so it only fires on truly meaningful moments
  let _lastPositive = 0;
  function _positive() {
    const now = Date.now();
    if (now - _lastPositive < POS_COOLDOWN) return;
    _lastPositive = now;
    _play('positive');
  }

  const click    = () => _play('click');
  const select   = () => _play('select');
  const positive = _positive;
  const warning  = () => _play('warning');

  // Bypass cooldown for the TEST button
  const testPositive = () => { _lastPositive = 0; _positive(); };

  // ── Non-destructive function patcher ─────────────────────────────
  // _pendingPatch tracks names that already have a queued retry so a second
  // _wire() call (DOMContentLoaded race) never schedules a duplicate setTimeout,
  // which would cause the patched function to fire twice per click.
  const _pendingPatch = new Set();
  function patch(name, sfxFn) {
    function _apply() {
      _pendingPatch.delete(name);
      const fn = window[name];
      if (typeof fn !== 'function' || fn._sfxPatched) return false;
      window[name] = function (...a) { try { sfxFn(); } catch(_){} return fn.apply(this, a); };
      window[name]._sfxPatched = true;
      return true;
    }
    if (!_apply() && !_pendingPatch.has(name)) {
      _pendingPatch.add(name);
      setTimeout(_apply, 600); // retry once for late-loaded scripts
    }
  }

  // ── Wire every button ────────────────────────────────────────────
  function _wire() {

    // ── NAVIGATION / BACK ─────────────────────────────────────────
    patch('goStart',              click);
    patch('goOpen',               click);
    patch('show',                 click);   // show('s-open') etc.
    patch('goFeatured',           click);
    patch('goCreateTextures',     click);
    patch('goCreateTexturesBack', click);

    // ── OPEN PANELS / DROPDOWNS ───────────────────────────────────
    patch('toggleToolsDropdown',      select);
    patch('toggleEnvDropdown',        select);
    patch('toggleTerrainDetailDrop',  select);
    patch('openBodySearch',           select);
    patch('openAppSettings',          select);
    patch('openSysSettings',          select);
    patch('openAssets',               select);
    patch('openPlanetComparison',     select);
    patch('openAsteroidsMenu',        select);
    patch('hmToggleLibrary',          select);
    patch('hmToggleGroup',            select);

    // ── CLOSE / CANCEL ────────────────────────────────────────────
    patch('closeBodySearch',       click);
    patch('closePreset',           click);
    patch('closeSidebar',          click);
    patch('closeAppSettings',      click);
    patch('closeSysSettings',      click);
    patch('closeAssets',           click);
    patch('closePlanetComparison', click);
    patch('closeAsteroidsMenu',    click);
    patch('closeClearAll',         click);
    patch('cancelRemoteAssets',    click);

    // ── TAB SWITCHES ──────────────────────────────────────────────
    patch('switchTab',         select);
    patch('switchAsteroidTab', select);
    patch('switchSettingsTab', select);
    patch('switchAppTab',      select);
    patch('switchAssetTab',    select);
    patch('prsSetTab',         select);
    patch('_pscSetMode',       select);
    patch('hmSetDiff',         select);

    // ── TOGGLES / CYCLES / MISC UI ────────────────────────────────
    patch('cycleDifficulty',       select);
    patch('toggleHighResSurface',  select);
    patch('toggleLockSidebar',     select);
    patch('enterDragOrbitMode',    select);
    patch('exitDragOrbitMode',     select);
    patch('toggleEnvFlag',         select);
    patch('toggleOrbitHas',        select);
    patch('zoomToBody',            select);
    patch('undoAction',            click);
    patch('refreshJsonView',       click);
    patch('resetUiHue',            select);
    patch('setBgTheme',            select);
    patch('clearCustomBg',         click);
    patch('setDefaultScale',       select);
    patch('astTogglePan',          select);
    patch('astApplyRes',           select);
    patch('astClearTrace',         click);
    patch('hmUploadClick',         select);
    patch('hmAddLine',             select);
    patch('hmMoveLine',            click);

    // ── SELECT ────────────────────────────────────────────────────
    patch('openPreset',        select);
    patch('addBodyPrompt',     select);
    patch('replaceBodyPrompt', select);
    patch('hmInsertMap',       select);
    patch('openCalculator',    select);
    patch('openImagePanel',    select);

    patch('toggleUtilsDropdown', select);

    // ── CLICK (neutral actions) ───────────────────────────────────
    patch('closeCalculator',   click);
    patch('closeImagePanel',   click);
    patch('imgBringForward',   click);
    patch('imgSendBackward',   click);
    patch('imgSelectFromList', select);
    patch('prsOnParentChange', click);

    // ── SELECT (toggle-style actions) ─────────────────────────────
    patch('astToggleEffect',   select);
    patch('calcSetTab',        select);
    patch('calcToggleTool',    select);
    patch('calcToggleSci',     select);
    patch('bctxGroupSelect',   select);

    // ── CLICK (context menu neutral) ──────────────────────────────
    patch('bctxCopy',          click);

    // ── POSITIVE (meaningful confirms — 2 s cooldown) ─────────────
    patch('goNew',              positive);
    patch('goNewFromOpen',      positive);
    patch('confirmPreset',      positive);
    patch('exportSystem',       positive);
    patch('loadZipFromUrl',     positive);
    patch('importFeatured',     positive);
    patch('executeReplaceBody', positive);
    patch('addFogKey',          positive);
    patch('addPPKey',           positive);
    patch('addLandmark',        positive);
    patch('addFlatZone',        positive);
    patch('astGenerate',        positive);
    patch('astDownload',        positive);
    patch('astExportTxt',       positive);
    patch('astFxRandomize',     positive);
    patch('astApplyToBody',     positive);
    patch('astRefreshBodyList', select);
    patch('astSetHeightRange',  select);
    patch('prsNext',            positive);
    patch('clearAssetCache',    positive);
    patch('bctxPaste',          positive);
    patch('imgDuplicateSelected', positive);
    patch('imgTriggerFileInput',  select);

    // ── PRECISE OBJECT PLACER ────────────────────────────────────
    patch('openPlacer',          select);
    patch('closePlacer',         click);
    patch('placerToggleActive',  select);
    patch('placerResetCount',    click);
    patch('placerOnParentChange',click);
    patch('placerOnPresetChange',select);
    patch('placerOnDirChange',   select);
    patch('placerOnEccInput',    click);

    // ── LANDMARK FEATURES ────────────────────────────────────────
    patch('openProceduralLandmarks',  select);
    patch('closeProceduralLandmarks', click);
    patch('runProceduralScan',        positive);
    patch('plmReroll',                select);
    patch('applyProceduralLandmarks', positive);
    patch('openSuffixModal',          select);
    patch('closeSuffixModal',         click);
    patch('filterSuffixList',         click);
    patch('selectSuffixTerm',         select);
    patch('updateSuffixPreview',      click);
    patch('applySuffix',              positive);

    // ── HEIGHTMAP / TEXTURE TOOLS (hmt / htx) ────────────────────
    patch('openHeightmapTools',  select);
    patch('closeHeightmapTools', click);
    patch('hmtSetTab',           select);
    patch('hmtAddBreakpoint',    select);
    patch('hmtRemoveBreakpoint', warning);
    patch('hmtResetBreakpoints', warning);
    patch('hmtLoadFile',         select);
    patch('hmtSaveToAssets',     positive);
    patch('hmtDownloadPNG',      positive);
    patch('htxLoadFile',         select);
    patch('htxReload',           click);
    patch('htxSaveToAssets',     positive);
    patch('htxDownloadPNG',      positive);
    patch('htxUpdateHM',         click);
    patch('htxSaveHMToAssets',   positive);
    patch('htxDownloadHM',       positive);

    // ── GROUP SELECT ─────────────────────────────────────────────
    patch('enterGroupSelect',    select);
    patch('exitGroupSelect',     click);
    patch('groupSelToggle',      select);
    patch('groupSelDeleteAll',   warning);
    patch('groupSelInvert',      select);
    patch('groupSelScaleSMA',    positive);
    patch('groupSelScaleRadii',  positive);
    patch('groupSelJitterSMA',   positive);
    patch('groupSelJitterEcc',   positive);

    // ── BODY SEARCH extras ────────────────────────────────────────
    patch('bsearchZoom',       select);
    patch('downloadBodyTxt',   positive);

    // ── UI HUE PICKER ────────────────────────────────────────────
    patch('onUiHuePick',  select);

    // ── PROCGEN ───────────────────────────────────────────────────
    patch('pgGenerate',         positive);
    patch('pgClear',            warning);
    patch('pgApply',            positive);
    patch('pgSwitchTab',        select);
    patch('pgToggleSeedLock',   select);
    patch('openProceduralGen',  select);
    patch('closeProceduralGen', click);
    patch('pgToggleType',       select);
    patch('pgToggleMode',       select);
    patch('pgImportReplace',    positive);
    patch('pgImportOrbit',      positive);
    patch('pgImportMerge',      positive);

    // ── WARNING ───────────────────────────────────────────────────
    patch('confirmClearAll',   warning);
    patch('clearAll',          warning);
    patch('confirmDeleteBody', warning);
    patch('executeDeleteBody', warning);
    patch('delFogKey',         warning);
    patch('delPPKey',          warning);
    patch('delLandmark',       warning);
    patch('delFlatZone',       warning);
    patch('hmRemoveLine',      warning);
    patch('astClearCanvas',    warning);
    patch('bctxCut',           warning);

    // ── Event delegation — elements without named global functions ─
    document.addEventListener('click', e => {
      const t   = e.target;
      const oc  = t.getAttribute ? (t.getAttribute('onclick') || '') : '';

      // fs-btn (Featured Systems — Import / Open in Editor)
      if (t.classList.contains('fs-btn')) {
        if (t.classList.contains('fs-btn-open')) { positive(); return; }
        if (t.classList.contains('fs-btn-dl'))   { select();   return; }
      }

      // .tog toggles (atmos, rings, terrain, water, etc.)
      if (t.classList.contains('tog')) { select(); return; }

      // Env toolbar icon buttons  (#env-btn-*)
      if (t.id && t.id.startsWith('env-btn-')) { select(); return; }

      // Preset modal item cards
      if (t.closest && t.closest('.prs-item')) { select(); return; }

      // NameGen dice  onclick="NameGen.roll()"
      if (t.classList.contains('namegen-dice') || oc.includes('NameGen.roll')) {
        positive(); return;
      }

      // Inline vshift reset button
      if (oc.includes('applyVShift')) { click(); return; }

      // modal-*.classList.remove('open') dismiss buttons
      if (oc.includes("classList.remove('open')")) { click(); return; }

      // TC.open() / PT.open() — texture creator launches
      if (oc.includes('TC.open') || oc.includes('PT.open')) { select(); return; }

      // triggerFileInput — file pickers
      if (oc.startsWith('triggerFileInput') || (oc.startsWith('document.getElementById(') && oc.includes('.click()'))) {
        select(); return;
      }

      // Wt advanced toggle (inline IIFE)
      if (oc.includes('wt-advanced')) { select(); return; }

      // document.getElementById('ast-trace-file').click()
      if (oc.includes('ast-trace-file')) { select(); return; }

      // clearAssetCache inline chain (.then(...))
      if (oc.startsWith('clearAssetCache')) { positive(); return; }

    }, true); // capture so we hear it even if child stops propagation
  }

  // ── Bootstrap ─────────────────────────────────────────────────────
  _loadAll();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _wire);
  } else {
    _wire();
  }

  return { click, select, positive, warning, testPositive, setVolume };
})();

// ── SFX Settings (wired to the SOUND tab in App Settings) ────────────────────
// Per-sound muted flags
const _sfxMuted = { click: false, select: false, positive: false, warning: false };
let   _sfxEnabled = true;

// Patch _play to respect enabled + muted flags
// We wrap via the public API so the IIFE's closure stays intact.
(function _patchSfxForSettings() {
  const orig = {
    click:    SFX.click,
    select:   SFX.select,
    positive: SFX.positive,
    warning:  SFX.warning,
  };
  ['click','select','positive','warning'].forEach(k => {
    SFX[k] = function() {
      if (!_sfxEnabled || _sfxMuted[k]) return;
      orig[k]();
    };
  });
  // testPositive also needs the gate
  const origTP = SFX.testPositive;
  SFX.testPositive = function() {
    if (!_sfxEnabled || _sfxMuted.positive) return;
    origTP();
  };
})();

function sfxSettingToggleMaster() {
  _sfxEnabled = !_sfxEnabled;
  const tog = document.getElementById('sfx-master-tog');
  if (tog) tog.classList.toggle('on', _sfxEnabled);
}

function sfxSettingVolume(val) {
  const v = parseInt(val, 10);
  const lbl = document.getElementById('sfx-vol-val');
  if (lbl) lbl.textContent = v + '%';
  SFX.setVolume(v / 100);
}

function sfxSettingToggle(key) {
  _sfxMuted[key] = !_sfxMuted[key];
  const tog = document.getElementById('sfx-tog-' + key);
  if (tog) tog.classList.toggle('on', !_sfxMuted[key]);
}