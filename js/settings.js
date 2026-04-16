// ════════════════════════════════ SYSTEM SETTINGS ════════════════════════════════
let systemSettings = {
  importSettings: { includeDefaultPlanets:false, includeDefaultHeightmaps:true, includeDefaultTextures:true, hideStarsInAtmosphere:true, authorName:'n/a', version:'n/a', description:'n/a' },
  spaceCenterData: { address:'Earth', angle:90, position_LaunchPad:{ horizontalPosition:365, height:56.2 } }
};
function openSysSettings(){
  const is = systemSettings.importSettings;
  const sc = systemSettings.spaceCenterData;
  const tog2 = (id,v) => { const e=document.getElementById(id); if(e) e.classList.toggle('on',!!v); };
  tog2('is-defplanets', is.includeDefaultPlanets);
  tog2('is-defheight',  is.includeDefaultHeightmaps);
  tog2('is-deftex',     is.includeDefaultTextures);
  tog2('is-hidestars',  is.hideStarsInAtmosphere);
  setVal('is-author',  is.authorName);
  setVal('is-version', is.version);
  document.getElementById('is-desc').value = is.description||'n/a';
  setVal('sc-address', sc.address);
  setVal('sc-angle',   sc.angle);
  setVal('sc-hpos',    sc.position_LaunchPad.horizontalPosition);
  setVal('sc-height',  sc.position_LaunchPad.height);
  document.getElementById('modal-syssettings').classList.add('open');
}
function switchSettingsTab(tab){
  ['general','credits'].forEach(t=>{
    const active = t===tab;
    const btn = document.getElementById('stab-'+t);
    const content = document.getElementById('stab-'+t+'-content');
    if(btn){
      btn.style.background = active ? 'var(--ac13)' : 'transparent';
      btn.style.border = active ? '1px solid var(--ac28)' : '1px solid transparent';
      btn.style.borderBottom = 'none';
      btn.style.color = active ? 'var(--sky2)' : 'var(--ink4)';
    }
    if(content) content.style.display = active ? '' : 'none';
  });
}

function switchAppTab(tab){
  ['theme','appcredits'].forEach(t=>{
    const active = t===tab;
    const btn = document.getElementById('apptab-'+t);
    const content = document.getElementById('apptab-'+t+'-content');
    if(btn){
      btn.style.background = active ? 'var(--ac13)' : 'transparent';
      btn.style.border = active ? '1px solid var(--ac28)' : '1px solid transparent';
      btn.style.borderBottom = 'none';
      btn.style.color = active ? 'var(--sky2)' : 'var(--ink4)';
    }
    if(content) content.style.display = active ? '' : 'none';
  });
  if(tab === 'theme'){
    if(window._syncUiColorPicker) window._syncUiColorPicker();
    if(window._getUiHue) _updateUiSwatches(window._getUiHue());
    _syncThemeBtns();
    _updateCustomBgUI(!!_customBgImg);
  }
}

function openAppSettings(){
  document.getElementById('modal-appsettings').classList.add('open');
  switchAppTab('theme');
}
function closeAppSettings(){
  document.getElementById('modal-appsettings').classList.remove('open');
}

function closeSysSettings(){
  const tog2 = id => document.getElementById(id).classList.contains('on');
  systemSettings.importSettings = {
    includeDefaultPlanets:  tog2('is-defplanets'),
    includeDefaultHeightmaps: tog2('is-defheight'),
    includeDefaultTextures: tog2('is-deftex'),
    hideStarsInAtmosphere:  tog2('is-hidestars'),
    authorName:  val('is-author'),
    version:     val('is-version'),
    description: document.getElementById('is-desc').value
  };
  systemSettings.spaceCenterData = {
    address: val('sc-address'),
    angle:   parseFloat(val('sc-angle'))||90,
    position_LaunchPad: {
      horizontalPosition: parseFloat(val('sc-hpos'))||365,
      height:             parseFloat(val('sc-height'))||56.2
    }
  };
  document.getElementById('modal-syssettings').classList.remove('open');
}

// ── Flat Zones ──
function buildFlatZones(zones){
  const el = document.getElementById('flatzone-list'); el.innerHTML='';
  (zones||[]).forEach((z,i) => el.appendChild(makeFlatZone(z,i)));
}
function makeFlatZone(z, i){
  const d = document.createElement('div'); d.className='pp-key'; d.id='fz-'+i;
  const angDeg = Math.round(((z.angle||1.5707) * 180 / Math.PI) * 100) / 100;
  d.innerHTML=`<div class="pp-key-header"><span class="pp-key-title">FLAT ZONE ${i+1}</span><button class="pp-key-del" onclick="delFlatZone(${i})">✕</button></div>
  <div class="frow"><span class="flabel">Height</span><input class="finput" id="fz-${i}-h" type="number" step="1" value="${z.height||0}" oninput="drawViewport()"></div>
  <div class="frow"><span class="flabel">Angle (rad)</span><input class="finput" id="fz-${i}-a" type="number" step="0.01" value="${z.angle||1.5707}" oninput="syncFzDeg(${i});drawViewport()"></div>
  <div class="frow"><span class="flabel">Angle (°)</span><input class="finput" id="fz-${i}-adeg" type="number" step="1" value="${angDeg}" oninput="syncFzRad(${i});drawViewport()"></div>
  <div class="frow" style="gap:4px"><span class="flabel">Angle slider</span><input type="range" id="fz-${i}-aslider" min="0" max="360" step="1" value="${angDeg}" style="flex:1;accent-color:var(--sky)" oninput="syncFzFromSlider(${i});drawViewport()"><span id="fz-${i}-aslider-val" style="font-size:.62rem;color:var(--sky2);min-width:32px;text-align:right">${angDeg}°</span></div>
  <div class="frow"><span class="flabel">Width</span><input class="finput" id="fz-${i}-w" type="number" step="10" value="${z.width||900}" oninput="drawViewport()"></div>
  <div class="frow"><span class="flabel">Transition</span><input class="finput" id="fz-${i}-t" type="number" step="10" value="${z.transition||700}" oninput="drawViewport()"></div>`;
  return d;
}
function syncFzDeg(i){
  const rad = parseFloat(document.getElementById('fz-'+i+'-a')?.value) || 0;
  const deg = Math.round(rad * 180 / Math.PI * 100) / 100;
  const degEl = document.getElementById('fz-'+i+'-adeg');
  const slEl  = document.getElementById('fz-'+i+'-aslider');
  const slVal = document.getElementById('fz-'+i+'-aslider-val');
  if(degEl) degEl.value = deg;
  if(slEl)  slEl.value  = ((deg % 360) + 360) % 360;
  if(slVal) slVal.textContent = Math.round(((deg % 360) + 360) % 360) + '°';
}
function syncFzRad(i){
  const deg = parseFloat(document.getElementById('fz-'+i+'-adeg')?.value) || 0;
  const rad = Math.round(deg * Math.PI / 180 * 10000) / 10000;
  const radEl = document.getElementById('fz-'+i+'-a');
  const slEl  = document.getElementById('fz-'+i+'-aslider');
  const slVal = document.getElementById('fz-'+i+'-aslider-val');
  if(radEl) radEl.value = rad;
  if(slEl)  slEl.value  = ((deg % 360) + 360) % 360;
  if(slVal) slVal.textContent = Math.round(((deg % 360) + 360) % 360) + '°';
}
function syncFzFromSlider(i){
  const deg = parseFloat(document.getElementById('fz-'+i+'-aslider')?.value) || 0;
  const rad = Math.round(deg * Math.PI / 180 * 10000) / 10000;
  const radEl = document.getElementById('fz-'+i+'-a');
  const degEl = document.getElementById('fz-'+i+'-adeg');
  const slVal = document.getElementById('fz-'+i+'-aslider-val');
  if(radEl) radEl.value = rad;
  if(degEl) degEl.value = deg;
  if(slVal) slVal.textContent = Math.round(deg) + '°';
}
function addFlatZone(){ const l=document.getElementById('flatzone-list'); const i=l.children.length; l.appendChild(makeFlatZone({height:0,angle:1.5707,width:900,transition:700},i)); }
function delFlatZone(i){ document.getElementById('fz-'+i)?.remove(); }
function collectFlatZones(){
  const zones=[]; let i=0;
  while(document.getElementById('fz-'+i)){
    const f=id=>parseFloat(document.getElementById(id)?.value)||0;
    zones.push({height:f('fz-'+i+'-h'),angle:f('fz-'+i+'-a'),width:f('fz-'+i+'-w'),transition:f('fz-'+i+'-t')});
    i++;
  }
  return zones;
}
function confirmClearAll(){
  document.getElementById('modal-clear').classList.add('open');
}
function closeClearAll(){
  document.getElementById('modal-clear').classList.remove('open');
}
function clearAll(){
  closeClearAll();
  // No undo for clear all (warned the user)
  bodies = {};
  selectedBody = null;
  undoStack = [];
  document.getElementById('undo-btn').disabled = true;
  document.getElementById('undo-btn').classList.remove('undo-active');
  document.getElementById('empty-state').classList.remove('gone');
  closeSidebar();
  updateStatusBar();
  drawViewport();
}

