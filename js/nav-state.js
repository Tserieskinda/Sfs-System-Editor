// ════════════════════════════════ NAV ════════════════════════════════
// Reliable cross-platform file input trigger (Android blocks programmatic .click()
// unless called synchronously from a user gesture with no ancestor overflow:hidden)
function triggerFileInput(id){
  const el = document.getElementById(id);
  if(el) el.click();
}

function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.add('hide')); document.getElementById(id).classList.remove('hide'); }
function _syncThemeBtns(){ document.querySelectorAll('.theme-btn').forEach(b=>{ b.style.borderColor=b.dataset.theme===bgTheme?'var(--ac65)':'var(--ac20)'; b.style.background=b.dataset.theme===bgTheme?'var(--hp1)':'var(--dp3)'; }); }
function goStart(){
  show('s-start');
  document.getElementById('viewport').classList.remove('active');
  _syncThemeBtns();
  closeSidebar();
  // Swap label based on whether a session exists
  const hasSession = Object.keys(bodies).length > 0;
  const lbl  = document.getElementById('btn-new-label');
  const mico = document.getElementById('btn-new-mico');
  const btn  = document.getElementById('btn-new-system');
  if(lbl)  lbl.textContent  = hasSession ? 'RESUME SESSION' : 'CREATE NEW SYSTEM';
  if(mico) mico.textContent = hasSession ? '▶' : '✦';
  if(btn)  btn.style.borderColor = hasSession ? 'rgba(48,224,144,.45)' : '';
  if(btn)  btn.style.color       = hasSession ? 'var(--jade)' : '';
}
function goNew(){
  show('s-new');
  document.getElementById('viewport').classList.add('active');
  vpOffX = 0; vpOffY = 0; vpZ = 1;
  document.getElementById('sb-zoom').textContent = '100%';
  setTimeout(resizeViewport, 100);
  syncAddBodyBtn();
}
function goOpen(){
  show('s-open');
  // Show/hide the warning banner based on whether bodies are loaded
  const hasSession = Object.keys(bodies).length > 0;
  const warn = document.getElementById('open-session-warn');
  if(warn) warn.style.display = hasSession ? '' : 'none';
}

// "START WITH EMPTY SYSTEM" from the open screen — confirm if session exists
function goNewFromOpen(){
  if(Object.keys(bodies).length > 0){
    if(!confirm('Clear current system and start empty?')) return;
    bodies = {};
    assets.textures = []; assets.heightmaps = []; assets.other = [];
    undoStack = [];
    Object.keys(textureCache).forEach(k => delete textureCache[k]);
    Object.keys(texPixelCache).forEach(k => delete texPixelCache[k]);
    document.getElementById('undo-btn').disabled = true;
    document.getElementById('undo-btn').classList.remove('undo-active');
    updateStatusBar(); syncAddBodyBtn();
    document.getElementById('empty-state').classList.remove('gone');
  }
  goNew();
}

