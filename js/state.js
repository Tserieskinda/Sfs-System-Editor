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

