/**
 * namegen.js — Linguistic Planet Name Generator
 */

const NameGen = (() => {

  // ── Phoneme pools ──────────────────────────────────────────────────────

  const ONSET = {
    // Planets & Stars — harsh/majestic consonant clusters, balanced A-Z
    cosmic:   ['Drak','Brak','Kron','Vron','Thal','Ghal','Ghor','Bron',
               'Krad','Vrax','Grax','Drex','Klex','Thrak','Vryn','Blax',
               'Strax','Chron','Brax','Tron','Gryn','Wrath','Stak','Sprak',
               'Aldr','Andr','Athr','Abr','Morn','Sorn','Rhal','Neth'],

    // Moons & Ice — soft, melodic, goddess-like
    feminine: ['Syl','Lyn','Cael','Ner','Pho','Cyr','Lys','Nyv',
               'Ith','Ely','Myv','Orph','Lyv','Nev','Sylv','Celyn',
               'Myra','Lyra','Vera','Gai','Selar','Nyra','Thei',
               'Aria','Aela','Alys','Avra','Caer','Phel','Miren'],

    // Gas Giants — flowing L/R
    liquid:   ['Lun','Lyr','Lax','Lom','Lox','Luv','Laz','Lyv',
               'Ran','Ral','Rim','Rix','Riv','Ron','Rul','Rum','Ryn','Raz',
               'Lan','Ren','Alun','Aran','Aral','Alon','Alyr','Aryn'],
  };

  const MID = {
    // Hard consonant bridge — fits cosmic/liquid onsets
    closed:   ['an','en','in','on','un','ar','er','ir','or','ur',
               'al','el','il','ol','ul','am','em','im','om','um'],
    // Light vowel bridge — fits feminine onsets, avoids double-vowel pile-up
    soft:     ['ra','la','na','ma','sa','va','li','ni','ri','mi',
               'ta','ca','da','fa','ga','ha','ka','pa','wa','xa'],
    // Rich vowel bridge — gas giants
    flowing:  ['ara','era','ira','ora','ura','ala','ela','ila','ola','ula',
               'ana','ena','ina','ona','una','ama','ema','ima','oma','uma'],
  };

  const CODA = {
    // Planet/Star endings — strong, archaic
    archaic:  ['ion','eon','ium','eum','ius','eus','aus','ous','ias','eas',
               'aon','yon','uon','aum','yum','uum','yus','yas','oas','uas'],
    // Moon/Ice endings — goddess-like, all start with consonant
    feminine: ['na','ra','la','nia','lia','ria','una','era','ina','ona',
               'ura','ela','ira','ova','ava','eva','ara','ola','yna','yra',
               'illa','ella','essa','enna','issa','arra','etta','olia','via','mia'],
    // Gas giant endings
    resonant: ['or','ar','ur','on','an','un','ax','ix','ox','ex',
               'orm','arn','urm','onx','anx','unx','arl','orl','url','erl'],
  };

  // ── Suffixes ───────────────────────────────────────────────────────────

  const SUFFIX = {
    scientific: [' Prime',' Major',' Minor',' Proxima',' Secundus',' Tertius',
                 ' Maximus',' Minimus',' Centralis',' Australis',' Borealis',
                 ' Orientalis',' Occidentalis',' Superior',' Inferior',
                 ' Novus',' Vetus',' Magnus',' Altus',' Profundus',
                 ' Caelestis',' Solaris',' Lunaris',' Stellaris',' Medius'],
    greek:      [' Alpha',' Beta',' Gamma',' Delta',' Epsilon',' Zeta',
                 ' Eta',' Theta',' Iota',' Kappa',' Lambda',' Mu',
                 ' Nu',' Xi',' Omicron',' Pi',' Rho',' Sigma',
                 ' Tau',' Upsilon',' Phi',' Chi',' Psi',' Omega'],
    numeral:    [' I',' II',' III',' IV',' V',' VI',' VII',' VIII',' IX',' X',
                 ' XI',' XII',' XIII',' XIV',' XV',' XVI',' XVII',' XVIII',' XIX',' XX'],
    descriptor: [' Deep',' Far',' Dark',' Bright',' Lost',' Void',
                 ' Grey',' Red',' Blue',' Gold',' Black',' White',
                 ' Silent',' Hollow',' Ashen',' Pale',' Dim',' Cold',
                 ' Burning',' Frozen',' Broken',' Drifting',' Wandering',' Forsaken',
                 ' Ancient',' Sunken',' Ruined',' Scarred',' Veiled',' Hidden',
                 ' New',' Old',' Twin',' Dead',' Fading',' Shattered'],
    station:    [' Station',' Outpost',' Relay',' Beacon',' Depot',' Nexus',
                 ' Hub',' Node',' Port',' Gate',' Bastion',' Citadel',
                 ' Watch',' Keep',' Hold',' Reach',' Crossing',' Junction'],
    none:       [''],
  };

  const PREFIX_ROMAN   = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
  const PREFIX_GREEK   = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Pi','Rho','Sigma','Tau','Phi','Chi','Psi','Omega'];
  const PREFIX_NUMERIC = ['2','3','4','5','6','7','8','9','10','11','12','13','14','15','16','17','18','19','20','21','22'];
  const PREFIX_CATALOG = ['AC','BD','CD','CP','GJ','HD','HIP','HR','IC','KIC','LHS','NGC','PSR','SAO','TYC','WD','XO','YZ'];

  const ALL_PREFIXES = [
    ...PREFIX_ROMAN  .map(p => ({ label: p, kind: 'roman' })),
    ...PREFIX_GREEK  .map(p => ({ label: p, kind: 'greek' })),
    ...PREFIX_NUMERIC.map(p => ({ label: p, kind: 'num'   })),
    ...PREFIX_CATALOG.map(p => ({ label: p, kind: 'cat'   })),
  ];
  const ALL_PREFIX_LABELS = ALL_PREFIXES.map(p => p.label);

  // ── Profiles — star and planet now share 'cosmic' onset ───────────────
  // Single unified profile — all bodies use the same pools
  const PROFILE = { onset: 'all', mid: 'all', coda: 'all', sfx: 'all' };

  // Flatten all pools into unified arrays
  const ONSET_ALL = Object.values(ONSET).flat();
  const MID_ALL   = Object.values(MID).flat();
  const CODA_ALL  = Object.values(CODA).flat();
  const SUFFIX_ALL = Object.values(SUFFIX).flat().filter(s => s !== '');

  // ── Per-pool cooldown maps ─────────────────────────────────────────────
  const _cooldowns = new Map();
  let _rollCount = 0;

  function _pf(arr, poolId) {
    const map = _cooldowns.get(poolId) || new Map();
    _cooldowns.set(poolId, map);
    const ttl  = Math.floor(arr.length * 0.6);
    const now  = _rollCount;
    const fresh = arr.filter(x => { const e = map.get(x); return e == null || e <= now; });
    const chosen = fresh.length
      ? fresh[Math.floor(Math.random() * fresh.length)]
      : arr.reduce((a, b) => (map.get(a) || 0) <= (map.get(b) || 0) ? a : b);
    map.set(chosen, now + ttl);
    return chosen;
  }

  // ── Session pair memory ────────────────────────────────────────────────
  const _usedPairs  = new Set();
  let   _sessionBody = null;

  function _clearSession(newBody) {
    if (newBody === _sessionBody) return;
    _usedPairs.clear();
    _sessionBody = newBody;
    // Reset onset maps so reopen doesn't inherit alphabet bias
    for (const key of _cooldowns.keys()) {
      if (key.startsWith('onset:')) _cooldowns.delete(key);
    }
  }

  // ── Phoneme join — drop trailing vowel from left if right starts with one
  const _VOW = new Set(['a','e','i','o','u']);
  function _join(l, r) {
    return (_VOW.has(l.slice(-1).toLowerCase()) && _VOW.has(r[0].toLowerCase()))
      ? l.slice(0, -1) + r
      : l + r;
  }

  function _cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function _chance(p) { return Math.random() < p; }

  // ── Generator ──────────────────────────────────────────────────────────
  function generate() {
    _rollCount++;

    for (let attempt = 0; attempt < 8; attempt++) {

      // Length: 30% short · 70% medium
      let root;
      if (Math.random() < 0.30) {
        const o = _pf(ONSET_ALL, 'onset:all');
        const m = _pf(MID_ALL,   'mid:all');
        root = _cap(_join(o, m));
      } else {
        const o = _pf(ONSET_ALL, 'onset:all');
        const m = _pf(MID_ALL,   'mid:all');
        const c = _pf(CODA_ALL,  'coda:all');
        root = _cap(_join(_join(o, m), c));
      }

      // Suffix (75% chance)
      const sfx = _chance(0.75)
        ? _pf(SUFFIX_ALL, 'sfx:all').trim()
        : '';

      // Prefix (20% chance, no suffix)
      let pre = '';
      if (!sfx && _chance(0.20)) {
        const label = _pf(ALL_PREFIX_LABELS, 'prefix:all');
        const entry = ALL_PREFIXES.find(p => p.label === label);
        pre = (entry && entry.kind === 'cat')
          ? label + '-' + Math.floor(Math.random() * 900 + 100)
          : label;
      }

      const key = (pre ? pre + '·' : '') + root + (sfx ? '·' + sfx : '');
      if (!_usedPairs.has(key) || attempt === 7) {
        _usedPairs.add(key);
        let name = root;
        if (sfx) name += ' ' + sfx;
        if (pre) name  = pre + ' ' + name;
        return name;
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  return {
    generate() {
      return generate();
    },
    clearSession(bodyName) {
      _clearSession(bodyName || null);
    },
    roll() {
      const input = document.getElementById('sbb-name-input');
      if (!input) return;
      _clearSession(typeof selectedBody !== 'undefined' ? selectedBody : null);
      const name = generate();
      input.value = name;
      if (typeof renameBody     === 'function') renameBody(name);
      if (typeof finaliseRename === 'function') finaliseRename(name);
      input.classList.add('namegen-flash');
      setTimeout(() => input.classList.remove('namegen-flash'), 400);
    },
  };
})();
