// ══════════════════════════ MULTIPLAYER MODAL (MP) ══════════════════════════
// Thin UI layer over Collab (js/collab.js) — the real host/join modal reached
// from the main menu's "🌐 MULTIPLAYER" button. Keeps all Collab wiring in
// one place so future sidebar.js/viewport.js integration (lock badges, live
// edits) can hook into Collab directly without needing to know about this
// modal's DOM.

const MP = (() => {
  let activeTab = 'host';
  let wired = false;

  function openModal(){
    _wireEventsOnce();
    document.getElementById('modal-multiplayer').classList.add('open');
    _syncModalToState();
  }

  function closeModal(){
    document.getElementById('modal-multiplayer').classList.remove('open');
  }

  function switchTab(tab){
    activeTab = tab;
    const hostBtn = document.getElementById('mp-tab-host');
    const joinBtn = document.getElementById('mp-tab-join');
    const hostContent = document.getElementById('mp-host-content');
    const joinContent = document.getElementById('mp-join-content');

    const activeStyle = { background: 'var(--ac13)', border: '1px solid var(--ac28)', borderBottom: 'none', color: 'var(--sky2)' };
    const inactiveStyle = { background: 'transparent', border: '1px solid transparent', borderBottom: 'none', color: 'var(--ink4)' };

    Object.assign(hostBtn.style, tab === 'host' ? activeStyle : inactiveStyle);
    Object.assign(joinBtn.style, tab === 'join' ? activeStyle : inactiveStyle);
    hostContent.style.display = tab === 'host' ? '' : 'none';
    joinContent.style.display = tab === 'join' ? '' : 'none';
  }

  function _getName(){
    const v = (document.getElementById('mp-name')?.value || '').trim();
    return v || 'Player';
  }

  // ── Hosting ──
  function startHost(){
    if(Collab.isActive()){
      alert('Already in a session — leave it first.');
      return;
    }
    // Hosting isn't destructive (it never clears your system), so the real
    // risk isn't data loss — it's mis-clicking HOST when you meant to JOIN
    // someone else's session, and not noticing until you're confused about
    // why nothing matches what your friend is looking at. Joining already
    // has a natural confirmation step (typing a code); hosting doesn't, so
    // give it one specifically when there's existing content that would
    // otherwise make the mistake easy to miss.
    const bodyCount = typeof bodies !== 'undefined' ? Object.keys(bodies).length : 0;
    if(bodyCount > 0){
      const ok = confirm(`Start hosting with your current system (${bodyCount} bod${bodyCount === 1 ? 'y' : 'ies'})?\n\nIf you meant to join someone else's session instead, switch to the JOIN tab.`);
      if(!ok) return;
    }
    Collab.setStateProvider(() => (typeof bodies !== 'undefined' ? bodies : {}));
    const btn = event?.target?.closest?.('button');
    if(btn){ btn.disabled = true; btn.textContent = 'Starting…'; }

    Collab.hostSession(_getName()).then(({ code }) => {
      document.getElementById('mp-host-idle').style.display = 'none';
      document.getElementById('mp-host-active').style.display = '';
      document.getElementById('mp-code-display').textContent = code;
      _renderPeerList();
      _showChatWidget();
    }).catch(err => {
      alert('Could not start hosting: ' + (err?.message || err));
      if(btn){ btn.disabled = false; btn.innerHTML = '<span class="mico">▶</span>START HOSTING'; }
    });
  }

  function copyCode(){
    const code = document.getElementById('mp-code-display')?.textContent?.trim();
    if(!code || code.startsWith('—')) return;
    const btn = document.getElementById('mp-copy-btn');
    const done = ok => { if(btn){ const prev = btn.textContent; btn.textContent = ok ? '✓ COPIED' : '⚠ COPY FAILED'; setTimeout(() => btn.textContent = prev, 1400); } };
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(code).then(() => done(true)).catch(() => done(false));
    } else {
      // Fallback for older/locked-down mobile browsers without Clipboard API
      try {
        const ta = document.createElement('textarea');
        ta.value = code; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done(true);
      } catch(e){ done(false); }
    }
  }

  // ── Joining ──
  function startJoin(){
    if(Collab.isActive()){
      alert('Already in a session — leave it first.');
      return;
    }
    const codeInput = document.getElementById('mp-code-input');
    const code = (codeInput.value || '').trim().toUpperCase();
    const errEl = document.getElementById('mp-join-error');
    errEl.style.display = 'none';

    if(code.length < 5){
      errEl.textContent = 'Enter the 5-character code.';
      errEl.style.display = '';
      return;
    }

    const btn = event?.target?.closest?.('button');
    if(btn){ btn.disabled = true; btn.textContent = 'Connecting…'; }

    Collab.joinSession(code, _getName()).then(() => {
      document.getElementById('mp-join-idle').style.display = 'none';
      document.getElementById('mp-join-active').style.display = '';
      _renderPeerList();
      _showChatWidget();
    }).catch(err => {
      errEl.textContent = 'Could not connect — check the code and try again.';
      errEl.style.display = '';
      if(btn){ btn.disabled = false; btn.innerHTML = '<span class="mico">▶</span>JOIN SESSION'; }
    });
  }

  function leave(){
    Collab.leaveSession();
    _resetModalToIdle();
    _hideChatWidget();
  }

  function _resetModalToIdle(){
    document.getElementById('mp-host-idle').style.display = '';
    document.getElementById('mp-host-active').style.display = 'none';
    document.getElementById('mp-join-idle').style.display = '';
    document.getElementById('mp-join-active').style.display = 'none';
    document.getElementById('mp-code-display').textContent = '— — — — —';
    document.getElementById('mp-code-input').value = '';
    document.getElementById('mp-join-error').style.display = 'none';
    const hostStartBtn = document.querySelector('#mp-host-idle button');
    if(hostStartBtn){ hostStartBtn.disabled = false; hostStartBtn.innerHTML = '<span class="mico">▶</span>START HOSTING'; }
    const joinBtn = document.querySelector('#mp-join-idle button');
    if(joinBtn){ joinBtn.disabled = false; joinBtn.innerHTML = '<span class="mico">▶</span>JOIN SESSION'; }
  }

  // If the modal is (re)opened while already in a session (e.g. user closed
  // and reopened it), reflect the current state instead of showing "idle".
  function _syncModalToState(){
    if(!Collab.isActive()){
      _resetModalToIdle();
      switchTab('host');
      return;
    }
    const info = Collab.getMyInfo();
    if(info.isHost){
      switchTab('host');
      document.getElementById('mp-host-idle').style.display = 'none';
      document.getElementById('mp-host-active').style.display = '';
    } else {
      switchTab('join');
      document.getElementById('mp-join-idle').style.display = 'none';
      document.getElementById('mp-join-active').style.display = '';
    }
    _renderPeerList();
  }

  // ── Peer list rendering (shared roster mirror, fed by Collab events) ──
  let roster = {}; // peerId -> {name, color}

  function _peerChipHtml(pid, info){
    const me = Collab.getMyInfo();
    const isMe = pid === me.peerId;
    const role = info.role || 'member';
    const roleLabel = { manager: 'MANAGER', member: 'MEMBER', visitor: 'VISITOR' }[role] || role.toUpperCase();
    const roleColor = { manager: 'var(--jade, #30e090)', member: 'var(--sky2)', visitor: 'var(--ink4)' }[role] || 'var(--ink4)';

    let rightSide;
    if(me.isHost && !isMe){
      rightSide = `
        <select onchange="MP.setPeerRole('${pid}', this.value)" title="Change role"
          style="margin-left:auto;background:var(--dp2,#151515);color:var(--ink2);border:1px solid var(--ac22);border-radius:4px;font-family:inherit;font-size:.6rem;padding:2px 4px">
          <option value="manager" ${role === 'manager' ? 'selected' : ''}>Manager</option>
          <option value="member" ${role === 'member' ? 'selected' : ''}>Member</option>
          <option value="visitor" ${role === 'visitor' ? 'selected' : ''}>Visitor</option>
        </select>
        <button onclick="MP.kickPeerUI('${pid}', ${JSON.stringify(info.name || 'Peer')})" title="Kick from session"
          style="background:none;border:1px solid var(--ac22);border-radius:4px;color:var(--ink4);font-size:.62rem;padding:2px 6px;cursor:pointer"><svg class="icon"><use href="#icon-user-x"></use></svg></button>
        <button onclick="MP.banPeerUI('${pid}', ${JSON.stringify(info.name || 'Peer')})" title="Ban from this session"
          style="background:none;border:1px solid rgba(220,80,80,.35);border-radius:4px;color:var(--rose);font-size:.62rem;padding:2px 6px;cursor:pointer"><svg class="icon"><use href="#icon-ban"></use></svg></button>`;
    } else {
      rightSide = `<span style="margin-left:auto;font-size:.56rem;letter-spacing:.05em;color:${roleColor}">${roleLabel}</span>`;
    }

    return `<div class="mp-peer-chip">
      <span class="mp-peer-dot" style="background:${info.color || '#888'}"></span>
      <span>${_esc(info.name || 'Peer')}${isMe ? '<span class="mp-peer-you">(you)</span>' : ''}</span>
      ${rightSide}
    </div>`;
  }
  function _esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

  function setPeerRole(peerId, role){
    Collab.setRole(peerId, role);
  }
  function kickPeerUI(peerId, name){
    if(!confirm(`Kick ${name || 'this peer'} from the session? They can rejoin unless you also ban them.`)) return;
    Collab.kickPeer(peerId, 'Removed by host');
  }
  function banPeerUI(peerId, name){
    if(!confirm(`Ban ${name || 'this peer'}? They won't be able to rejoin this session (this doesn't survive them reconnecting under a fresh connection in a new tab — it's not persistent identity tracking, just blocks the current one).`)) return;
    Collab.banPeer(peerId, 'Banned by host');
  }

  function _renderPeerList(){
    const html = Object.keys(roster).length
      ? Object.entries(roster).map(([pid, info]) => _peerChipHtml(pid, info)).join('')
      : `<div style="font-size:.62rem;color:var(--ink4);text-align:center;padding:8px 0">Waiting for others to join…</div>`;
    const hostEl = document.getElementById('mp-peer-list');
    const joinEl = document.getElementById('mp-peer-list-join');
    if(hostEl) hostEl.innerHTML = html;
    if(joinEl) joinEl.innerHTML = html;
  }

  // ── Floating chat widget ──
  // Lives outside the modal (top-left by default, draggable) since chat
  // needs to stay usable while the person is actually editing the system,
  // not just while the Multiplayer modal is open.
  let chatBubbleEl = null, chatPanelEl = null, chatListEl = null, chatInputEl = null;
  let chatOpen = false;
  let chatMessages = []; // {peerId?, name, color, text, system?}
  let unread = 0;

  const CHAT_POS_KEY = 'sfs-chat-bubble-pos';
  function _loadChatPos(){
    try {
      const raw = localStorage.getItem(CHAT_POS_KEY);
      if(raw) return JSON.parse(raw);
    } catch(e){ /* localStorage unavailable/blocked — fall back to default */ }
    return { top: 56, left: 10 }; // below the top toolbar, clear of it on mobile too
  }
  function _saveChatPos(top, left){
    try { localStorage.setItem(CHAT_POS_KEY, JSON.stringify({ top, left })); } catch(e){ /* best effort only */ }
  }

  // Unified drag handling via Pointer Events — one code path covers mouse,
  // touch, and pen instead of separately wiring mousedown/touchstart. A
  // small movement threshold distinguishes an actual drag from a tap/click
  // so the bubble can still be tapped to open chat, not just dragged.
  function _makeDraggable(el, onDragEnd){
    let dragging = false, moved = false, startX = 0, startY = 0, startTop = 0, startLeft = 0;
    el.style.touchAction = 'none'; // prevent the page from scrolling while dragging on mobile

    el.addEventListener('pointerdown', e => {
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY;
      const rect = el.getBoundingClientRect();
      startTop = rect.top; startLeft = rect.left;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', e => {
      if(!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if(Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if(!moved) return;
      const pad = 4;
      const maxLeft = window.innerWidth - el.offsetWidth - pad;
      const maxTop = window.innerHeight - el.offsetHeight - pad;
      const newLeft = Math.min(Math.max(startLeft + dx, pad), Math.max(maxLeft, pad));
      const newTop  = Math.min(Math.max(startTop + dy, pad), Math.max(maxTop, pad));
      el.style.left = newLeft + 'px';
      el.style.top  = newTop + 'px';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    });
    el.addEventListener('pointerup', e => {
      dragging = false;
      el.releasePointerCapture(e.pointerId);
      if(moved){ onDragEnd(el.offsetTop, el.offsetLeft); }
      else { el._wasTap = true; } // let the click handler know this was a tap, not a drag
    });
  }

  function _ensureChatDom(){
    if(chatBubbleEl) return;

    const style = document.createElement('style');
    style.textContent = `
      #mpc-bubble {
        position: fixed; z-index: 99998;
        width: 44px; height: 44px; border-radius: 50%;
        background: var(--dp3); border: 1.5px solid var(--ac30);
        color: var(--sky2); font-size: 1.15rem; display: flex; align-items: center; justify-content: center;
        cursor: grab; box-shadow: 0 2px 12px rgba(0,0,0,.45); user-select: none;
      }
      #mpc-bubble.hidden { display: none; }
      #mpc-badge {
        position: absolute; top: -4px; right: -4px; min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 8px; background: var(--rose); color: #fff; font-size: .58rem; font-weight: bold;
        display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace;
        pointer-events: none;
      }
      #mpc-badge.hidden { display: none; }
      #mpc-panel {
        position: fixed; z-index: 99998;
        width: min(280px, calc(100vw - 20px)); max-height: min(360px, 60vh);
        display: flex; flex-direction: column;
        background: rgba(20,20,24,.97); border: 1.5px solid var(--ac28); border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0,0,0,.5); overflow: hidden;
      }
      #mpc-panel.hidden { display: none; }
      #mpc-head {
        display: flex; justify-content: space-between; align-items: center;
        padding: 9px 10px; border-bottom: 1px solid var(--ac18);
        font-family: 'JetBrains Mono', monospace; font-size: .66rem; letter-spacing: .06em; color: var(--sky2);
      }
      #mpc-head button { background: none; border: none; color: var(--ink4); cursor: pointer; font-size: 1rem; padding: 4px 6px; }
      #mpc-list { flex: 1; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; min-height: 100px; -webkit-overflow-scrolling: touch; }
      .mpc-msg { font-size: .72rem; line-height: 1.4; }
      .mpc-msg .mpc-name { font-weight: bold; margin-right: 5px; }
      .mpc-msg.mpc-system { color: var(--ink4); font-style: italic; }
      .mpc-msg .mpc-text { color: var(--ink2); word-break: break-word; }
      #mpc-inputrow { display: flex; gap: 6px; padding: 8px; border-top: 1px solid var(--ac18); }
      #mpc-input {
        flex: 1; min-width: 0; background: var(--dp3); border: 1px solid var(--ac22); border-radius: 4px;
        padding: 9px 8px; color: var(--ink2); font-family: 'JetBrains Mono', monospace; font-size: .8rem;
      }
      #mpc-send {
        background: var(--ac13); border: 1px solid var(--ac28); color: var(--sky2); border-radius: 4px;
        padding: 0 14px; font-family: 'JetBrains Mono', monospace; font-size: .68rem; cursor: pointer;
        min-height: 38px; /* touch-friendly target */
      }
      #mpc-send:hover { background: var(--ac20); }
      #mpc-empty { color: var(--ink4); font-size: .64rem; text-align: center; padding: 10px 0; }
    `;
    document.head.appendChild(style);

    const pos = _loadChatPos();

    chatBubbleEl = document.createElement('div');
    chatBubbleEl.id = 'mpc-bubble';
    chatBubbleEl.classList.add('hidden');
    chatBubbleEl.style.top = pos.top + 'px';
    chatBubbleEl.style.left = pos.left + 'px';
    chatBubbleEl.title = 'Session chat — tap to open, drag to move';
    chatBubbleEl.innerHTML = `<svg class="icon"><use href="#icon-message-circle"></use></svg><span id="mpc-badge" class="hidden">0</span>`;
    _makeDraggable(chatBubbleEl, (top, left) => _saveChatPos(top, left));
    chatBubbleEl.addEventListener('click', () => {
      // Pointer up after an actual drag shouldn't also toggle the panel —
      // _makeDraggable marks _wasTap only when the pointer never moved past
      // the threshold.
      if(chatBubbleEl._wasTap){ chatBubbleEl._wasTap = false; toggleChat(); }
    });
    document.body.appendChild(chatBubbleEl);

    chatPanelEl = document.createElement('div');
    chatPanelEl.id = 'mpc-panel';
    chatPanelEl.classList.add('hidden');
    chatPanelEl.innerHTML = `
      <div id="mpc-head"><span><svg class="icon"><use href="#icon-message-circle"></use></svg> SESSION CHAT</span><button id="mpc-close-btn" title="Close">✕</button></div>
      <div id="mpc-list"></div>
      <div id="mpc-inputrow">
        <input id="mpc-input" maxlength="240" placeholder="Message…" autocomplete="off">
        <button id="mpc-send">SEND</button>
      </div>
    `;
    document.body.appendChild(chatPanelEl);

    chatListEl = chatPanelEl.querySelector('#mpc-list');
    chatInputEl = chatPanelEl.querySelector('#mpc-input');
    chatPanelEl.querySelector('#mpc-close-btn').onclick = () => setChatOpen(false);
    chatPanelEl.querySelector('#mpc-send').onclick = _sendChatMsg;
    chatInputEl.addEventListener('keydown', e => {
      if(e.key === 'Enter'){ e.preventDefault(); _sendChatMsg(); }
    });
  }

  // Positions the panel near the bubble's CURRENT (possibly dragged)
  // location, flipping to whichever side keeps it fully on-screen rather
  // than assuming a fixed corner.
  function _positionChatPanel(){
    if(!chatBubbleEl || !chatPanelEl) return;
    const b = chatBubbleEl.getBoundingClientRect();
    const panelW = chatPanelEl.offsetWidth || 280;
    const panelH = chatPanelEl.offsetHeight || 360;
    const pad = 8;

    let left = b.left;
    if(left + panelW + pad > window.innerWidth) left = window.innerWidth - panelW - pad;
    left = Math.max(pad, left);

    let top = b.bottom + pad;
    if(top + panelH + pad > window.innerHeight){
      top = b.top - panelH - pad; // flip above the bubble if there's no room below
      if(top < pad) top = pad;    // still doesn't fit — just clamp to the top edge
    }

    chatPanelEl.style.left = left + 'px';
    chatPanelEl.style.top = top + 'px';
  }

  function _peerNameFor(peerId){
    if(peerId === Collab.getMyInfo().peerId) return 'You';
    return roster[peerId]?.name || 'Peer';
  }
  function _peerColorFor(peerId){
    return roster[peerId]?.color || '#888';
  }

  function _chatMsgHtml(m){
    if(m.system) return `<div class="mpc-msg mpc-system">${_esc(m.text)}</div>`;
    return `<div class="mpc-msg"><span class="mpc-name" style="color:${m.color || '#888'}">${_esc(m.name)}:</span><span class="mpc-text">${_esc(m.text)}</span></div>`;
  }

  function _renderChat(){
    if(!chatListEl) return;
    chatListEl.innerHTML = chatMessages.length
      ? chatMessages.map(_chatMsgHtml).join('')
      : `<div id="mpc-empty">No messages yet — say hi.</div>`;
    chatListEl.scrollTop = chatListEl.scrollHeight;
    const badge = document.getElementById('mpc-badge');
    if(badge){
      badge.textContent = unread > 9 ? '9+' : String(unread);
      badge.classList.toggle('hidden', unread === 0);
    }
  }

  function _pushChatMsg(m){
    chatMessages.push(m);
    if(chatMessages.length > 200) chatMessages.shift(); // cap in-memory history
    if(!chatOpen && !m.system) unread++;
    _renderChat();
  }

  function _sendChatMsg(){
    const text = (chatInputEl?.value || '').trim();
    if(!text) return;
    const me = Collab.getMyInfo();
    // Shown locally right away — Collab.sendChat() only echoes a peer's own
    // message back to *other* participants, not the sender (see collab.js).
    _pushChatMsg({ peerId: me.peerId, name: 'You', color: me.color, text });
    Collab.sendChat(text);
    chatInputEl.value = '';
    chatInputEl.focus();
  }

  function setChatOpen(open){
    chatOpen = open;
    if(!chatPanelEl) return;
    if(open) _positionChatPanel();
    chatPanelEl.classList.toggle('hidden', !open);
    if(open){ unread = 0; _renderChat(); chatInputEl?.focus(); }
  }
  function toggleChat(){ setChatOpen(!chatOpen); }

  function _showChatWidget(){
    _ensureChatDom();
    chatMessages = [];
    unread = 0;
    chatBubbleEl.classList.remove('hidden');
    _renderChat();
  }
  function _hideChatWidget(){
    if(chatBubbleEl) chatBubbleEl.classList.add('hidden');
    setChatOpen(false);
    chatMessages = [];
  }

  function _wireEventsOnce(){
    if(wired) return;
    wired = true;

    Collab.on('state-sync', d => {
      roster = d.roster || {};
      // Make sure "you" appear in the list even before any peer-join echo.
      const me = Collab.getMyInfo();
      if(me.peerId && !roster[me.peerId]) roster[me.peerId] = { name: me.name, color: me.color };
      _renderPeerList();
    });
    Collab.on('hosted', () => {
      const me = Collab.getMyInfo();
      roster = { [me.peerId]: { name: me.name, color: me.color, role: me.role } };
      _renderPeerList();
    });
    Collab.on('peer-joined', d => {
      roster[d.peerId] = d.info || { name: 'Peer' };
      _renderPeerList();
      if(chatBubbleEl) _pushChatMsg({ system: true, text: `${d.info?.name || 'A peer'} joined the session` });
    });
    Collab.on('peer-left', d => {
      const name = roster[d.peerId]?.name || 'A peer';
      delete roster[d.peerId];
      _renderPeerList();
      if(chatBubbleEl) _pushChatMsg({ system: true, text: `${name} left the session` });
    });
    Collab.on('role-changed', d => {
      const isMe = d.peerId === Collab.getMyInfo().peerId;
      if(roster[d.peerId]) roster[d.peerId].role = d.role;
      _renderPeerList();
      const name = isMe ? 'Your' : (roster[d.peerId]?.name || 'A peer') + "'s";
      if(chatBubbleEl) _pushChatMsg({ system: true, text: `${name} role changed to ${d.role}` });
    });
    Collab.on('permission-denied', d => {
      if(chatBubbleEl) _pushChatMsg({ system: true, text: `⚠ ${d.reason || "That action isn't allowed."}` });
    });
    Collab.on('kicked', d => {
      alert(d.banned ? `You were banned from this session.\n\n${d.reason || ''}` : `You were removed from this session.\n\n${d.reason || ''}`);
      _resetModalToIdle();
      _hideChatWidget();
    });
    Collab.on('chat', d => {
      // Sender already sees their own message locally on send (see
      // _sendChatMsg) — collab.js only echoes it back to *other* peers.
      if(d.peerId === Collab.getMyInfo().peerId) return;
      _pushChatMsg({ peerId: d.peerId, name: _peerNameFor(d.peerId), color: _peerColorFor(d.peerId), text: d.text });
    });
    Collab.on('host-disconnected', () => {
      alert('Lost connection to the host.');
      roster = {};
      _resetModalToIdle();
      _hideChatWidget();
    });
    Collab.on('left', () => {
      roster = {};
    });
  }

  return { openModal, closeModal, switchTab, startHost, startJoin, leave, copyCode, setPeerRole, kickPeerUI, banPeerUI };
})();
