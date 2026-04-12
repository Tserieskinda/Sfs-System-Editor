// ════════════════════════════════ STATE ════════════════════════════════
let bodies = {};        // { name: { data, preset, isCenter } }
let selectedBody = null;
let isForCenter = false;
let selectedPresetKey = 'Sun'; // now uses name-key instead of type-id


// ════════════════════════════════ UNDO STACK ════════════════════════════════
const MAX_UNDO = 40;
let undoStack = [];

function pushUndo(){
  // Deep-clone current bodies state and push onto stack
  undoStack.push(JSON.stringify(bodies));
  if(undoStack.length > MAX_UNDO) undoStack.shift();
  const undoBtn = document.getElementById('undo-btn');
  undoBtn.disabled = false;
  undoBtn.classList.add('undo-active');
}

function undoAction(){
  if(!undoStack.length) return;
  const snapshot = undoStack.pop();
  bodies = JSON.parse(snapshot);
  // Clear sidebar if selected body no longer exists
  if(selectedBody && !bodies[selectedBody]){
    closeSidebar();
  }
  // Restore empty-state if no bodies left
  const hasCenter = Object.values(bodies).some(b => b.isCenter);
  if(!hasCenter){
    document.getElementById('empty-state').classList.remove('gone');
  }
  updateStatusBar();
  resizeViewport();
  document.getElementById('undo-btn').disabled = undoStack.length === 0;
  document.getElementById('undo-btn').classList.toggle('undo-active', undoStack.length > 0);
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
// Returns true if focus is inside any text/number input — shortcuts must be
// suppressed in that case to avoid interfering with typing.
function isTypingTarget(){
  const t = document.activeElement;
  if(!t) return false;
  const tag = t.tagName;
  if(tag === 'TEXTAREA') return true;
  if(tag === 'INPUT'){
    const ty = (t.type||'').toLowerCase();
    // range sliders are NOT typing targets
    if(ty === 'range') return false;
    return true; // text, number, email, search, password, etc.
  }
  if(t.isContentEditable) return true;
  return false;
}

// WASD camera pan — held-key state & RAF loop
const _wasd = { w:false, a:false, s:false, d:false };
let _wasdRaf = null;
function _wasdStep(){
  const anyDown = _wasd.w || _wasd.a || _wasd.s || _wasd.d;
  if(!anyDown){ _wasdRaf = null; return; }
  // Base speed in world-units/frame; divide by vpZ so screen pixels/frame
  // stays constant regardless of zoom level.
  const spd = (parseFloat(document.getElementById('wasd-sensitivity').value) || 6) / vpZ;
  if(_wasd.w) vpOffY += spd;   // W = pan up
  if(_wasd.s) vpOffY -= spd;   // S = pan down
  if(_wasd.a) vpOffX += spd;   // A = pan left
  if(_wasd.d) vpOffX -= spd;   // D = pan right
  drawViewport();
  _wasdRaf = requestAnimationFrame(_wasdStep);
}

document.addEventListener('keydown', e => {
  // ── Ctrl+Z / Cmd+Z undo (always active) ──
  if((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey){
    e.preventDefault();
    undoAction();
    return;
  }
  // ── All other shortcuts: suppress inside text/number inputs ──
  if(isTypingTarget()) return;
  if(e.ctrlKey || e.metaKey || e.altKey) return;

  switch(e.key){
    // Body actions
    case 'z': case 'Z':
      e.preventDefault();
      if(selectedBody) zoomToBody(selectedBody);
      break;
    case 'b': case 'B':
      e.preventDefault();
      addBodyPrompt();
      return;
    case 'r': case 'R':
      e.preventDefault();
      if(selectedBody) replaceBodyPrompt();
      return;
    case 'Delete':
      e.preventDefault();
      if(selectedBody) confirmDeleteBody();
      return;
    // WASD camera movement
    case 'w': case 'W': e.preventDefault(); _wasd.w = true; break;
    case 'a': case 'A': e.preventDefault(); _wasd.a = true; break;
    case 's': case 'S': e.preventDefault(); _wasd.s = true; break;
    case 'd': case 'D': e.preventDefault(); _wasd.d = true; break;
  }
  // Start RAF loop if any movement key is now held
  if((_wasd.w||_wasd.a||_wasd.s||_wasd.d) && !_wasdRaf)
    _wasdRaf = requestAnimationFrame(_wasdStep);
});

document.addEventListener('keyup', e => {
  switch(e.key){
    case 'w': case 'W': _wasd.w = false; break;
    case 'a': case 'A': _wasd.a = false; break;
    case 's': case 'S': _wasd.s = false; break;
    case 'd': case 'D': _wasd.d = false; break;
  }
});

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

