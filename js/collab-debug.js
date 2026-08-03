// ══════════════════════════ COLLAB DEBUG PANEL ══════════════════════════
// A throwaway testing HUD for the multiplayer base (js/collab.js) — lets you
// host/join a session and watch connection state, roster, and live locks
// without doing it all through devtools. Not part of the real product UI;
// safe to delete this file (and its <script> tag) once the real
// host/join modal + peer HUD are built.
//
// Toggle with the floating "🌐" tab in the bottom-left corner, or via
// console: CollabDebug.show() / CollabDebug.hide()

const CollabDebug = (() => {
  let panelEl = null;
  let tabEl = null;
  let visible = false;

  function _fmtLock(body, lock, roster){
    const who = roster[lock.peerId]?.name || lock.peerId.slice(-6);
    const mine = lock.peerId === Collab.getMyInfo().peerId;
    return `<div class="cd-row"><span class="cd-body">${_esc(body)}</span> <span class="cd-lockwho" style="color:${mine ? '#4fc3f7' : '#ff8a65'}">${_esc(who)}${mine ? ' (me)' : ''}</span></div>`;
  }

  function _esc(s){
    return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  // Local mirrors purely for display purposes — collab.js keeps its own
  // authoritative copies internally; this panel just listens passively.
  let lastRoster = {};
  let lastLocks = {};
  let lastLog = [];

  function _log(line){
    const ts = new Date().toLocaleTimeString();
    lastLog.unshift(`[${ts}] ${line}`);
    if(lastLog.length > 30) lastLog.length = 30;
    _render();
  }

  function _render(){
    if(!panelEl || !visible) return;
    const info = Collab.getMyInfo();
    const active = Collab.isActive();

    const statusHtml = active
      ? `<span style="color:#aed581">● connected</span> — ${info.isHost ? 'HOSTING' : 'JOINED'} as <b>${_esc(info.name || '')}</b> <span style="opacity:.6">(${_esc(info.peerId || '')})</span>`
      : `<span style="color:#ff8a65">● not connected</span>`;

    const rosterHtml = Object.keys(lastRoster).length
      ? Object.entries(lastRoster).map(([pid, r]) =>
          `<div class="cd-row"><span style="color:${r.color||'#fff'}">●</span> ${_esc(r.name)} <span style="opacity:.5">${pid.slice(-6)}</span></div>`
        ).join('')
      : `<div class="cd-row" style="opacity:.5">— no peers —</div>`;

    const lockHtml = Object.keys(lastLocks).length
      ? Object.entries(lastLocks).map(([body, lock]) => _fmtLock(body, lock, lastRoster)).join('')
      : `<div class="cd-row" style="opacity:.5">— no locks —</div>`;

    panelEl.innerHTML = `
      <div class="cd-head">
        <span><svg class="icon"><use href="#icon-globe"></use></svg> Collab Debug</span>
        <button class="cd-x" onclick="CollabDebug.hide()">✕</button>
      </div>
      <div class="cd-status">${statusHtml}</div>
      ${!active ? `
        <div class="cd-section">
          <input class="cd-input" id="cd-name" placeholder="Your name" value="${_esc(info.name || 'Player')}">
          <div class="cd-btnrow">
            <button class="cd-btn" onclick="CollabDebug.host()">Host</button>
            <input class="cd-input cd-code" id="cd-code" placeholder="CODE" maxlength="5">
            <button class="cd-btn" onclick="CollabDebug.join()">Join</button>
          </div>
        </div>
      ` : `
        <div class="cd-section">
          <button class="cd-btn cd-btn-danger" onclick="CollabDebug.leave()">Leave Session</button>
        </div>
      `}
      <div class="cd-section">
        <div class="cd-label">Peers</div>
        ${rosterHtml}
      </div>
      <div class="cd-section">
        <div class="cd-label">Locks</div>
        ${lockHtml}
      </div>
      <div class="cd-section">
        <div class="cd-label">Try a lock (type an existing body name)</div>
        <div class="cd-btnrow">
          <input class="cd-input" id="cd-lockbody" placeholder="Body name">
          <button class="cd-btn" onclick="CollabDebug.tryLock()">Lock</button>
          <button class="cd-btn" onclick="CollabDebug.tryUnlock()">Unlock</button>
        </div>
      </div>
      <div class="cd-section">
        <div class="cd-label">Log</div>
        <div class="cd-log">${lastLog.map(l => `<div>${_esc(l)}</div>`).join('')}</div>
      </div>
    `;
  }

  function host(){
    const name = document.getElementById('cd-name')?.value || 'Host';
    Collab.setStateProvider(() => (typeof bodies !== 'undefined' ? bodies : {}));
    Collab.hostSession(name).then(r => {
      _log(`Hosting — code: ${r.code}`);
      _render();
    }).catch(err => _log(`Host error: ${err.message || err}`));
  }

  function join(){
    const name = document.getElementById('cd-name')?.value || 'Peer';
    const code = document.getElementById('cd-code')?.value || '';
    if(!code.trim()){ _log('Enter a code first.'); return; }
    Collab.joinSession(code, name).then(r => {
      _log(`Joined as ${r.peerId}`);
      _render();
    }).catch(err => _log(`Join error: ${err.message || err}`));
  }

  function leave(){
    Collab.leaveSession();
    lastRoster = {};
    lastLocks = {};
    _log('Left session.');
  }

  function tryLock(){
    const body = document.getElementById('cd-lockbody')?.value;
    if(!body) return;
    Collab.requestLock(body);
    _log(`requestLock("${body}")`);
  }

  function tryUnlock(){
    const body = document.getElementById('cd-lockbody')?.value;
    if(!body) return;
    Collab.releaseLock(body);
    _log(`releaseLock("${body}")`);
  }

  function _wireEvents(){
    Collab.on('hosted', d => { _log(`hosted() → code ${d.code}`); _render(); });
    Collab.on('state-sync', d => {
      lastRoster = d.roster || {};
      lastLocks = d.locks || {};
      _log(`state-sync received (${Object.keys(lastLocks).length} lock(s), ${Object.keys(lastRoster).length} peer(s))`);
    });
    Collab.on('locks-changed', l => { lastLocks = l; _log('locks-changed'); });
    Collab.on('lock-ack', d => _log(`lock-ack: ${d.body} → ${d.peerId}${d.mine ? ' (me)' : ''}`));
    Collab.on('lock-deny', d => _log(`lock-deny: ${d.body} (held by ${d.lockedBy})`));
    Collab.on('unlock', d => {
      delete lastLocks[d.body];
      _log(`unlock: ${d.body}`);
    });
    Collab.on('remote-edit', d => _log(`remote-edit: ${d.body} ← ${JSON.stringify(d.patch)} (from ${d.peerId})`));
    Collab.on('peer-joined', d => {
      lastRoster[d.peerId] = d.info || { name: 'Peer' };
      _log(`peer-joined: ${d.info?.name || d.peerId}`);
    });
    Collab.on('peer-left', d => {
      delete lastRoster[d.peerId];
      _log(`peer-left: ${d.peerId}`);
    });
    Collab.on('chat', d => _log(`chat from ${d.peerId}: ${d.text}`));
    Collab.on('error', d => _log(`ERROR (${d.phase}): ${d.err?.message || d.err}`));
    Collab.on('left', () => _log('left session'));
    Collab.on('host-disconnected', () => _log('host-disconnected'));
  }

  function _ensureDom(){
    if(panelEl) return;

    const style = document.createElement('style');
    style.textContent = `
      #cd-tab {
        position: fixed; bottom: 12px; left: 12px; z-index: 99999;
        width: 40px; height: 40px; border-radius: 8px;
        background: var(--panel, #1a1f2b); border: 1.5px solid var(--rim2, #333);
        color: #4fc3f7; font-size: 1.2rem; display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.4);
      }
      #cd-panel {
        position: fixed; bottom: 60px; left: 12px; z-index: 99999;
        width: 300px; max-height: 70vh; overflow-y: auto;
        background: rgba(15,18,26,.97); border: 1.5px solid var(--rim2, #333);
        border-radius: 10px; padding: 10px; font-family: 'JetBrains Mono', monospace;
        font-size: .68rem; color: #dde; box-shadow: 0 4px 20px rgba(0,0,0,.5);
      }
      #cd-panel.hidden { display: none; }
      .cd-head { display: flex; justify-content: space-between; align-items: center; font-size: .75rem; font-weight: bold; margin-bottom: 6px; color: #4fc3f7; }
      .cd-x { background: none; border: none; color: #888; cursor: pointer; font-size: .8rem; }
      .cd-status { margin-bottom: 8px; padding: 4px 6px; background: rgba(255,255,255,.04); border-radius: 4px; }
      .cd-section { margin-bottom: 8px; }
      .cd-label { opacity: .55; margin-bottom: 3px; text-transform: uppercase; font-size: .6rem; letter-spacing: .04em; }
      .cd-row { padding: 2px 0; display: flex; justify-content: space-between; gap: 6px; }
      .cd-body { opacity: .9; }
      .cd-lockwho { font-size: .62rem; }
      .cd-input {
        background: rgba(255,255,255,.06); border: 1px solid var(--rim2, #333); color: #eee;
        border-radius: 4px; padding: 4px 6px; font-family: inherit; font-size: .68rem; flex: 1; min-width: 0;
      }
      .cd-code { text-transform: uppercase; max-width: 70px; flex: none; }
      .cd-btnrow { display: flex; gap: 4px; margin-top: 4px; }
      .cd-btn {
        background: rgba(79,195,247,.15); border: 1px solid rgba(79,195,247,.4); color: #4fc3f7;
        border-radius: 4px; padding: 4px 8px; font-family: inherit; font-size: .65rem; cursor: pointer; white-space: nowrap;
      }
      .cd-btn:hover { background: rgba(79,195,247,.28); }
      .cd-btn-danger { background: rgba(255,138,101,.15); border-color: rgba(255,138,101,.4); color: #ff8a65; width: 100%; }
      .cd-btn-danger:hover { background: rgba(255,138,101,.28); }
      .cd-log { max-height: 120px; overflow-y: auto; background: rgba(0,0,0,.3); border-radius: 4px; padding: 4px 6px; opacity: .75; font-size: .6rem; }
      .cd-log div { padding: 1px 0; border-bottom: 1px solid rgba(255,255,255,.04); }
    `;
    document.head.appendChild(style);

    tabEl = document.createElement('div');
    tabEl.id = 'cd-tab';
    tabEl.innerHTML = '<svg class="icon"><use href="#icon-globe"></use></svg>';
    tabEl.title = 'Multiplayer debug panel';
    tabEl.onclick = toggle;
    document.body.appendChild(tabEl);

    panelEl = document.createElement('div');
    panelEl.id = 'cd-panel';
    panelEl.classList.add('hidden');
    document.body.appendChild(panelEl);
  }

  function show(){
    _ensureDom();
    visible = true;
    panelEl.classList.remove('hidden');
    _render();
  }

  function hide(){
    if(panelEl) panelEl.classList.add('hidden');
    visible = false;
  }

  function toggle(){
    visible ? hide() : show();
  }

  // Wired immediately (not lazily inside _ensureDom) so the passive
  // roster/lock/log mirrors stay accurate for the whole session even while
  // the visible tab/panel remain hidden — otherwise calling show() mid-
  // session would display stale/empty data until the next event happened
  // to fire. _log()'s _render() call is a safe no-op while panelEl/visible
  // aren't set yet.
  _wireEvents();

  // No longer auto-created on page load — call CollabDebug.show() from the
  // console when you actually want the debug HUD. show()/_ensureDom()
  // create the tab + panel together on first use.

  return { show, hide, toggle, host, join, leave, tryLock, tryUnlock };
})();
