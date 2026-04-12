// ════════════════════════════════ EXPORT ════════════════════════════════
// ════════════ MINIMAL ZIP BUILDER (no external deps) ════════════
// Implements ZIP "stored" (no compression) — spec §4.3, universally compatible.
function buildZip(files){
  // files: { "path/file.txt": Uint8Array, ... }
  const enc = s => new TextEncoder().encode(s);
  const u32le = n => new Uint8Array([n&0xff,(n>>8)&0xff,(n>>16)&0xff,(n>>24)&0xff]);
  const u16le = n => new Uint8Array([n&0xff,(n>>8)&0xff]);

  function crc32(buf){
    let c = 0xFFFFFFFF;
    const t = new Uint32Array(256);
    for(let i=0;i<256;i++){let n=i;for(let j=0;j<8;j++)n=n&1?0xEDB88320^(n>>>1):n>>>1;t[i]=n;}
    for(let i=0;i<buf.length;i++) c=t[(c^buf[i])&0xff]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
  }

  function concat(...arrays){
    const total = arrays.reduce((s,a)=>s+a.length,0);
    const out = new Uint8Array(total); let off=0;
    arrays.forEach(a=>{out.set(a,off);off+=a.length;}); return out;
  }

  const parts = [], centralDir = [];
  let offset = 0;

  for(const [path, data] of Object.entries(files)){
    const name = enc(path);
    const crc  = crc32(data);
    const size = data.length;

    // Local file header
    const isDir = path.endsWith('/');
    const extAttr = isDir ? u32le(0x10) : u32le(0x20); // MS-DOS: dir bit or archive bit
    const local = concat(
      new Uint8Array([0x50,0x4B,0x03,0x04]), // signature
      u16le(20),           // version needed
      u16le(0),            // flags: 0 — no UTF-8 flag (all names are ASCII; flag trips Windows AV)
      u16le(0),            // compression: stored
      u16le(0), u16le(0x0021),  // mod time=0, mod date=Jan 1 1980 (MS-DOS epoch, not zero)
      u32le(crc),
      u32le(size), u32le(size),
      u16le(name.length), u16le(0), // filename len, extra len
      name, data
    );
    parts.push(local);

    // Central directory entry
    centralDir.push(concat(
      new Uint8Array([0x50,0x4B,0x01,0x02]), // signature
      u16le(20), u16le(20),  // version made by, version needed
      u16le(0), u16le(0),    // flags: 0, compression: stored
      u16le(0), u16le(0x0021),  // mod time=0, mod date=Jan 1 1980
      u32le(crc),
      u32le(size), u32le(size),
      u16le(name.length),
      u16le(0), u16le(0), u16le(0), // extra, comment, disk start
      u16le(0),   // internal attr
      extAttr,    // external attr: proper dir/file MS-DOS attribute
      u32le(offset),        // local header offset
      name
    ));
    offset += local.length;
  }

  const cd     = concat(...centralDir);
  const cdSize = cd.length;
  const eocd   = concat(
    new Uint8Array([0x50,0x4B,0x05,0x06]), // signature
    u16le(0), u16le(0),                    // disk numbers
    u16le(centralDir.length), u16le(centralDir.length),
    u32le(cdSize), u32le(offset),
    u16le(0)                               // comment length
  );
  return concat(...parts, cd, eocd);
}

function exportSystem(){
  const bodyEntries = Object.entries(bodies);
  if(bodyEntries.length === 0){ alert('No bodies to export!'); return; }

  // ── Space Centre validation ──
  const scAddr = systemSettings.spaceCenterData?.address;
  const scBodyExists = scAddr && bodies[scAddr];
  const scBodyHasSurface = scBodyExists && bodies[scAddr].data.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA?.collider !== false;
  if(!scBodyExists){
    const go = confirm(
      `⚠️ Space Centre Warning\n\n` +
      `Launch body "${scAddr||'(none)'}" is not in this system.\n` +
      `Players won't be able to launch from a planet.\n\n` +
      `Set a valid launch body in ⚙ SYSTEM settings, or tap OK to export anyway.`
    );
    if(!go) return;
  } else if(bodies[scAddr].data.BASE_DATA?.collider === false || bodies[scAddr].preset === 'star' || bodies[scAddr].preset === 'blackhole'){
    const go = confirm(
      `⚠️ Space Centre Warning\n\n` +
      `"${scAddr}" may not be a valid launch pad (star, black hole, or no collider).\n` +
      `Players may be unable to launch.\n\n` +
      `Tap OK to export anyway.`
    );
    if(!go) return;
  }

  const centerName = Object.keys(bodies).find(n => bodies[n].isCenter) || 'System';
  const customFolder = (document.getElementById('sys-foldername')?.value || '').trim().replace(/[\\/:*?"<>|]/g,'');
  const sysName = customFolder || centerName;
  const enc = str => new TextEncoder().encode(str);

  function dataUrlToBytes(dataUrl){
    const b64 = dataUrl.split(',')[1];
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for(let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i);
    return out;
  }

  const zipFiles = {};

  // Always include all three folders even if empty (ZIP spec: zero-byte entry ending in /)
  zipFiles[`${sysName}/Planet Data/`]   = new Uint8Array(0);
  zipFiles[`${sysName}/Heightmap Data/`]= new Uint8Array(0);
  zipFiles[`${sysName}/Texture Data/`]  = new Uint8Array(0);

  // Planet Data/
  bodyEntries.forEach(([name, b]) => {
    const _ed = JSON.parse(JSON.stringify(b.data));
    const { version: _ev, ..._er } = _ed;
    const out = { version: _ev || '1.5', ..._er };
    zipFiles[`${sysName}/Planet Data/${name}.txt`] = enc(JSON.stringify(out, null, 2));
  });

  // ── Collect only textures / heightmaps actually referenced by the exported bodies ──
  const usedTexNames = new Set();
  const usedHmNames  = new Set();

  bodyEntries.forEach(([, b]) => {
    const d = b.data;

    // Atmosphere gradient + cloud strip
    const grdTex = d.ATMOSPHERE_VISUALS_DATA?.GRADIENT?.texture;
    if(grdTex && grdTex !== 'None') usedTexNames.add(grdTex);
    const cldTex = d.ATMOSPHERE_VISUALS_DATA?.CLOUDS?.texture;
    if(cldTex && cldTex !== 'None') usedTexNames.add(cldTex);

    // Front clouds
    const fcTex = d.FRONT_CLOUDS_DATA?.cloudsTexture;
    if(fcTex && fcTex !== 'None') usedTexNames.add(fcTex);

    // Terrain textures
    const TTD = d.TERRAIN_DATA?.TERRAIN_TEXTURE_DATA || {};
    ['planetTexture','surfaceTexture_A','surfaceTexture_B','terrainTexture_C'].forEach(k => {
      if(TTD[k] && TTD[k] !== 'None') usedTexNames.add(TTD[k]);
    });

    // Rings
    const rngTex = d.RINGS_DATA?.ringsTexture;
    if(rngTex && rngTex !== 'None') usedTexNames.add(rngTex);

    // Ocean mask
    const maskTex = d.WATER_DATA?.oceanMaskTexture;
    if(maskTex && maskTex !== 'None') usedTexNames.add(maskTex);

    // Heightmaps referenced in textureFormula / terrainFormulaDifficulties
    const formulaLines = [
      ...(d.TERRAIN_DATA?.textureFormula || []),
      ...Object.values(d.TERRAIN_DATA?.terrainFormulaDifficulties || {}).flat()
    ];
    formulaLines.forEach(line => {
      // First argument of any function call is typically the heightmap name
      const m = line.match(/\(\s*([^,)\s]+)/);
      if(m) usedHmNames.add(m[1]);
    });
  });

  // Heightmap Data/ — only used heightmaps, skipping vanilla (game provides them)
  assets.heightmaps.forEach(e => {
    if(e.vanilla) return; // bundled with SFS — no need to ship
    const stem = e.name.replace(/\.[^.]+$/, '');
    if(usedHmNames.has(e.name) || usedHmNames.has(stem)){
      zipFiles[`${sysName}/Heightmap Data/${e.name}`] = e.url ? dataUrlToBytes(e.url) : enc(e.content);
    }
  });

  // Texture Data/ — only used textures, skipping vanilla (game provides them)
  // VANILLA_EXPORT_SKIP: exhaustive list of every texture name the base game ships internally.
  // These are referenced by vanilla presets but the game already has them — never bundle them.
  const VANILLA_TEX_SKIP = new Set([
    'Ariel','Asteroid','Atmo_Earth','Atmo_Enceladus','Atmo_Europa','Atmo_Jupiter',
    'Atmo_Mars','Atmo_Neptune','Atmo_Pluto','Atmo_Saturn','Atmo_Sun','Atmo_Titan',
    'Atmo_Triton','Atmo_Uranus','Blured02','Callisto','Ceres','Charon','Circles02',
    'DarkDust02','Dark_Dust','Deimos','Dione','Dots02','DryGround',
    'Earth_Clouds','Earth_Clouds_Front','Earth_OceanMask_V2','Earth_WithOceans',
    'Enceladus','Europa','Ganymede','HardRocks02','Hydra','Iapetus','Ice02',
    'Io','Jupiter','Mars','Mercury','Mimas','Miranda','Moon','Naiad','Neptune',
    'Neutral','Nix','Oberon','Pan','Phobos','Pluto','Proteus','Puck','Rhea',
    'Sand','Saturn','Saturn_Rings','Snow','Tethys','Thebe','Titan','Titan_LakeMask',
    'Titania','Triton','Umbriel','Uranus',
  ]);
  assets.textures.forEach(e => {
    if(e.vanilla) return; // flagged vanilla at load time
    const stem = e.name.replace(/\.[^.]+$/, '');
    if(VANILLA_TEX_SKIP.has(stem) || VANILLA_TEX_SKIP.has(e.name)) return; // game-bundled texture
    if(usedTexNames.has(stem) || usedTexNames.has(e.name)){
      zipFiles[`${sysName}/Texture Data/${e.name}`] = dataUrlToBytes(e.url);
    }
  });

  console.log(`[SFS|EXPORT] used textures (${usedTexNames.size}): [${[...usedTexNames].join(',')}]`);
  console.log(`[SFS|EXPORT] used heightmaps (${usedHmNames.size}): [${[...usedHmNames].join(',')}]`);

  // Other uploaded files
  assets.other.forEach(e => {
    zipFiles[`${sysName}/${e.name}`] = enc(e.content);
  });

  // System meta
  zipFiles[`${sysName}/Import_Settings.txt`]   = enc(JSON.stringify(systemSettings.importSettings, null, 2));
  zipFiles[`${sysName}/Space_Center_Data.txt`] = enc(JSON.stringify(systemSettings.spaceCenterData, null, 2));
  zipFiles[`${sysName}/Version.txt`]           = enc('1.6.00.14');

  // Build and download
  try{
    const zipped = buildZip(zipFiles);
    const blob = new Blob([zipped], {type:'application/zip'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = sysName + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch(err){
    console.error('Export error:', err);
    alert('Export failed: ' + err.message);
  }
}



