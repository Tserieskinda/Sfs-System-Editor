// ════════════════════════════════ COLLAB (multiplayer) ════════════════════════════════
// Serverless live-collaboration layer built on PeerJS (WebRTC). No app-specific
// server is required — PeerJS's public broker is only used for the initial
// handshake; all planet data flows directly browser-to-browser after that.
//
// Topology: star, host-authoritative.
//   - One user "hosts" a session (becomes the PeerJS peer everyone else connects to).
//   - Every other user "joins" via the host's short code.
//   - The HOST is the arbiter for selection locks (see "Locking" below) and relays
//     edit patches between peers. The host is also a normal editor — no special
//     "server mode" UI, it's the same app with this module active.
//
// This file is intentionally self-contained: it does not touch `bodies`,
// `sidebar.js`, or `viewport.js` directly. It exposes a small public API
// (`Collab.*`) plus a set of event hooks (`Collab.on(...)`) that the rest of
// the app wires up later. This lets the networking layer be tested in
// isolation before it's connected to the editor's UI.
//
// ── Locking model (optimistic, host-arbitrated) ──
//   1. Peer clicks a body -> immediately treats it as locked locally (0 latency)
//      and sends {type:'select'} to the host.
//   2. Host is the source of truth for `locks` (bodyName -> {peerId, ts}).
//      - Free (or already locked by the same peer) -> host grants: broadcasts
//        {type:'lock-ack'} to everyone, including the sender, so all clients
//        converge on the same ground truth.
//      - Already locked by someone else -> host sends {type:'lock-deny'} back
//        to the requester only; that peer rolls back its optimistic lock.
//   3. Race case (two selects arrive close together): host processes messages
//      in arrival order, so the first one simply wins — no CRDT/vector-clock
//      machinery needed, just "first message the host sees, wins."
//   4. Idle safety net: locks older than LOCK_IDLE_MS with no refresh are
//      force-released by the host, in case a peer's tab dies mid-edit.
//
// ── Edit propagation ──
//   Edits are small dot-path patches (e.g. {'ORBIT_DATA.semiMajorAxis': 1.2e9}),
//   not whole-body payloads. The editing peer throttles broadcasts while
//   dragging (~120ms) and always sends one final unthrottled patch on
//   release, so nobody ends up looking at a stale in-between value. The host
//   relays patches verbatim to all other peers -- only the current lock
//   owner is allowed to send patches for a body, so there is no concurrent-
//   writer conflict to resolve; simple apply-in-arrival-order is safe.

const Collab = (() => {

  const LOCK_IDLE_MS = 60000;       // auto-release a lock after this long w/ no refresh
  const EDIT_THROTTLE_MS = 120;     // min gap between broadcast patches for the same body

  // ── ICE server config ──
  // PeerJS's default free broker only supplies STUN servers. STUN is enough
  // when both peers can find a direct path (simple NATs, same network), but
  // it does nothing when a direct path isn't possible (symmetric NAT,
  // restrictive firewalls, some corporate/mobile networks) — the exact
  // failure mode confirmed by the stall watchdog: iceGatheringState reaches
  // "complete" but iceConnectionState never leaves "new". A TURN relay
  // fallback fixes that by routing traffic through a relay server when a
  // direct path can't be found. These are OpenRelay's public test TURN
  // credentials (metered.ca) — fine for development; swap in your own
  // TURN provider for production use.
  const ICE_SERVERS = [
    // Free, unlimited, no auth needed:
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.l.google.com:19302' },
    // OpenRelay's public test TURN credentials — free but shared/rate-limited
    // and has been reported flaky for some users. Kept as our TURN fallback
    // for now since it needs no signup; the candidate-summary logging below
    // will tell us definitively if it's the culprit (relay: 0 in the
    // summary = this server gave us nothing usable).
    { urls: 'stun:openrelay.metered.ca:80' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];

  // ── Debug tracing ──
  // Flip to true (or call Collab.setDebug(true) from the console) to get the
  // full connection-lifecycle trace used to diagnose ICE/NAT issues —
  // candidate types, signaling state transitions, per-message logs, etc.
  // Left off by default: logging on every single message (locks, edits
  // while dragging, etc.) adds real overhead and was making sync feel
  // sluggish once connections were actually working.
  let DEBUG = false;
  function dlog(...args){ if(DEBUG) console.log(...args); }
  function dwarn(...args){ if(DEBUG) console.warn(...args); }
  function setDebug(v){ DEBUG = !!v; }

  // ── Internal state ──
  let peer = null;                  // PeerJS Peer instance
  let isHost = false;
  let myPeerId = null;
  let myName = null;
  let myColor = null;
  let myRole = 'manager'; // host is always effectively 'manager'; peers get their assigned role via state-sync/role-changed

  // Host-only:
  const hostConns = new Map();      // peerId -> DataConnection (host's view of all peers)
  const locks = new Map();          // bodyName -> { peerId, ts }
  const roster = new Map();         // peerId -> { name, color }
  const peerRoles = new Map();      // peerId -> 'manager' | 'member' | 'visitor' — default assigned on join is 'member'
  const bannedPeerIds = new Set();  // peerId -> banned for the remainder of THIS hosting session (see setRole/kickPeer/banPeer for the honest caveat: peer IDs aren't a persistent identity, so this doesn't survive the banned person just reconnecting under a fresh ID)

  const ROLE_RANK = { visitor: 0, member: 1, manager: 2 };
  // The host's own self-relayed messages (requestLock/broadcastEdit calling
  // _hostOnMessage({peer: myPeerId}, ...) directly) always resolve to
  // 'manager' here, regardless of what's in peerRoles — the host can't lock
  // themselves out of their own session.
  function _roleOf(peerId){
    if(peerId === myPeerId) return 'manager';
    return peerRoles.get(peerId) || 'member';
  }
  function _roleAtLeast(peerId, min){
    return ROLE_RANK[_roleOf(peerId)] >= ROLE_RANK[min];
  }
  function _rosterEntry(pid){
    const base = roster.get(pid) || { name: 'Peer', color: '#888' };
    return { ...base, role: _roleOf(pid) };
  }

  // Peer(non-host)-only:
  let hostConn = null;              // DataConnection to the host
  const peerLockMirror = new Map(); // bodyName -> peerId — peers' local view of host's `locks`

  // Reconnection (peer-side): retry joining the same session automatically
  // if the connection to the host drops unexpectedly, rather than
  // immediately giving up. Not used for a plain first-attempt join
  // failure (wrong code, host not there) — only for a connection that WAS
  // open and then died.
  let _explicitLeave = false;   // true while leaveSession() itself is tearing things down — skips auto-reconnect
  let _wasKicked = false;       // true once a 'kicked' message arrives — being removed shouldn't trigger an auto-reconnect retry loop back into the same host
  let _lastJoinCode = null;
  let _lastJoinName = null;
  let _reconnectAttempt = 0;
  let _reconnectTimer = null;
  const RECONNECT_MAX_ATTEMPTS = 5;
  const RECONNECT_BASE_DELAY_MS = 1000; // exponential backoff: 1s, 2s, 4s, 8s, 16s

  // Reconnection (host-side): if the host's connection to PeerJS's
  // signaling broker drops (the peer-to-peer DataConnections to already-
  // connected peers can survive this — only new connections/discovery need
  // the broker), retry via PeerJS's own built-in reconnect() rather than
  // giving up immediately. This preserves the same peer ID (so the session
  // code keeps working) and doesn't touch existing DataConnections at all —
  // a fundamentally different mechanism than the peer-side rejoin above.
  let _hostReconnectAttempt = 0;
  const HOST_RECONNECT_MAX_ATTEMPTS = 5;

  // Shared:
  const listeners = {};             // eventName -> [fn, ...]
  const editThrottles = new Map();  // bodyName -> { timer, pending }
  let stateProvider = null;         // () => bodies, set by the wiring layer (host only)
  let assetsProvider = null;        // () => assets (textures/heightmaps/other), set by the wiring layer (host only)
  let settingsProvider = null;      // () => systemSettings (importSettings/spaceCenterData), set by the wiring layer (host only)
  let presetsProvider = null;       // () => _pgUserPresets (custom procgen presets), set by the wiring layer (host only)

  function emit(evt, payload){
    const subs = listeners[evt] || [];
    dlog(`[Collab] emit("${evt}") ->`, subs.length, 'listener(s)', payload);
    subs.forEach(fn => {
      try { fn(payload); } catch(err){ console.error(`[Collab] listener error for "${evt}":`, err); }
    });
  }

  // The wiring layer calls these once so the host can hand out full-state
  // snapshots to newly-joined peers without collab.js needing to import or
  // know about `bodies`/`assets` directly.
  function setStateProvider(fn){
    stateProvider = fn;
  }
  function setAssetsProvider(fn){
    assetsProvider = fn;
  }
  function setSettingsProvider(fn){
    settingsProvider = fn;
  }
  function setPresetsProvider(fn){
    presetsProvider = fn;
  }

  function on(evt, fn){
    (listeners[evt] = listeners[evt] || []).push(fn);
    dlog(`[Collab] on("${evt}") registered — now ${listeners[evt].length} listener(s)`);
  }

  function off(evt, fn){
    if(!listeners[evt]) return;
    listeners[evt] = listeners[evt].filter(f => f !== fn);
  }

  // ── Small deterministic peer color palette (avoids everyone being the same hue) ──
  const PALETTE = ['#4fc3f7', '#ff8a65', '#aed581', '#ba68c8', '#ffd54f', '#4db6ac', '#f06292', '#90a4ae'];
  let _paletteIdx = 0;
  function nextColor(){
    const c = PALETTE[_paletteIdx % PALETTE.length];
    _paletteIdx++;
    return c;
  }

  // Short human-friendly session codes instead of raw PeerJS UUIDs.
  // PeerJS ids must be alphanumeric-safe; we prefix so collisions with other
  // apps sharing the public broker are astronomically unlikely.
  function makeSessionCode(){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
    let s = '';
    for(let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function peerIdFromCode(code){
    return `sfs-editor-${code.trim().toUpperCase()}`;
  }

  // ═══════════════════════════ HOST ═══════════════════════════

  function hostSession(name){
    return new Promise((resolve, reject) => {
      if(peer){ reject(new Error('Already in a session — leave first.')); return; }
      myName = name || 'Host';
      myColor = nextColor();
      isHost = true;

      const code = makeSessionCode();
      const id = peerIdFromCode(code);
      dlog('[Collab:HOST] creating Peer with id', id);
      peer = new Peer(id, { debug: 2, config: { iceServers: ICE_SERVERS } });

      peer.on('open', pid => {
        dlog('[Collab:HOST] peer.open — broker connection established, id =', pid);
        myPeerId = pid;
        roster.set(pid, { name: myName, color: myColor });
        if(_hostReconnectAttempt > 0){
          // This is PeerJS re-firing 'open' after a successful reconnect(),
          // not the initial hosting flow — don't re-resolve the (already
          // resolved) hostSession promise or re-emit 'hosted' (which would
          // confusingly re-trigger the "you're now hosting" UI).
          console.log('[Collab:HOST] broker reconnect succeeded after', _hostReconnectAttempt, 'attempt(s)');
          _hostReconnectAttempt = 0;
          emit('host-reconnected');
          return;
        }
        emit('hosted', { code, peerId: pid });
        resolve({ code, peerId: pid });
      });

      peer.on('connection', conn => {
        dlog('[Collab:HOST] peer.connection fired — incoming DataConnection from', conn.peer, 'metadata:', conn.metadata, 'connectionId:', conn.connectionId);
        _hostHandleIncomingConn(conn);
      });

      peer.on('error', err => {
        console.error('[Collab:HOST] peer.error —', err.type, err.message || err);
        emit('error', { err, phase: 'host' });
        if(!myPeerId) reject(err); // failed before we ever got an id
      });

      peer.on('disconnected', () => {
        dwarn('[Collab:HOST] peer.disconnected from signaling broker');
        if(_hostReconnectAttempt >= HOST_RECONNECT_MAX_ATTEMPTS){
          console.warn('[Collab:HOST] broker reconnect — giving up after', _hostReconnectAttempt, 'attempt(s)');
          emit('host-broker-lost');
          return;
        }
        _hostReconnectAttempt++;
        console.warn('[Collab:HOST] broker reconnect attempt', _hostReconnectAttempt, '/', HOST_RECONNECT_MAX_ATTEMPTS);
        emit('host-reconnecting', { attempt: _hostReconnectAttempt, max: HOST_RECONNECT_MAX_ATTEMPTS });
        try { peer.reconnect(); } catch(e){ console.error('[Collab:HOST] peer.reconnect() threw:', e); }
      });

      peer.on('close', () => dwarn('[Collab:HOST] peer.close — peer object destroyed'));
    });
  }

  // Attaches low-level WebRTC diagnostics to a DataConnection as early as
  // possible — NOT gated on conn.open, since that's exactly the event that's
  // failing to fire. Also arms a watchdog that reports the stuck state if
  // the connection hasn't opened within a few seconds (classic symptom of
  // ICE candidates failing to find a path — no TURN relay configured, so a
  // restrictive NAT/firewall on either side can strand the connection here
  // forever with no error ever thrown).
  function _wireIceDiagnostics(conn, label){
    if(!DEBUG) return; // skip entirely in normal use — see DEBUG flag above
    let opened = false;
    conn.on('open', () => { opened = true; });

    const candidateTypes = { host: 0, srflx: 0, relay: 0, prflx: 0 };

    const attach = () => {
      const pc = conn.peerConnection;
      if(!pc){
        // Not created yet — PeerJS sets this up asynchronously in some
        // versions. Retry shortly rather than giving up.
        setTimeout(attach, 100);
        return;
      }
      dlog(`[Collab:${label}] peerConnection acquired for`, conn.peer, '- iceGatheringState:', pc.iceGatheringState, 'iceConnectionState:', pc.iceConnectionState, 'signalingState:', pc.signalingState);

      pc.addEventListener('icegatheringstatechange', () => {
        dlog(`[Collab:${label}] iceGatheringState ->`, pc.iceGatheringState, 'for', conn.peer);
        if(pc.iceGatheringState === 'complete'){
          // This is the definitive answer to "did TURN actually give us a
          // usable relay candidate": if candidateTypes.relay is 0 here, the
          // TURN server never handed out a relay candidate at all (auth
          // failure, server down, blocked port, etc.) — distinct from
          // "we got a relay candidate but it still didn't connect".
          dlog(`[Collab:${label}] ── candidate summary for`, conn.peer, ':', {...candidateTypes},
            candidateTypes.relay === 0 ? '⚠ NO RELAY CANDIDATES — TURN server gave us nothing usable' : '✓ relay candidate(s) obtained');
        }
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        dlog(`[Collab:${label}] iceConnectionState ->`, pc.iceConnectionState, 'for', conn.peer);
      });
      pc.addEventListener('connectionstatechange', () => {
        dlog(`[Collab:${label}] connectionState ->`, pc.connectionState, 'for', conn.peer);
      });
      pc.addEventListener('signalingstatechange', () => {
        dlog(`[Collab:${label}] signalingState ->`, pc.signalingState, 'for', conn.peer);
      });
      pc.addEventListener('icecandidateerror', (e) => {
        console.error(`[Collab:${label}] icecandidateerror for`, conn.peer, '- code:', e.errorCode, 'text:', e.errorText, 'url:', e.url);
      });
      pc.addEventListener('icecandidate', (e) => {
        if(e.candidate){
          const type = e.candidate.type;
          if(type in candidateTypes) candidateTypes[type]++;
          dlog(`[Collab:${label}] local ICE candidate:`, type, e.candidate.protocol, e.candidate.address || e.candidate.candidate);
        } else {
          dlog(`[Collab:${label}] ICE candidate gathering complete for`, conn.peer);
        }
      });
    };
    attach();

    // Staged watchdog: an early check is often premature (gathering can
    // still be in flight), so we re-check at 8s and again at 20s before
    // treating it as truly dead. This also stops nagging once opened.
    [8000, 20000].forEach(delay => {
      setTimeout(() => {
        if(opened) return;
        const pc = conn.peerConnection;
        console.error(`[Collab:${label}] ⚠ STALL WATCHDOG (${delay/1000}s) — connection to`, conn.peer, 'still not open.',
          pc ? `iceConnectionState=${pc.iceConnectionState} connectionState=${pc.connectionState} signalingState=${pc.signalingState} iceGatheringState=${pc.iceGatheringState} candidates=${JSON.stringify(candidateTypes)}` : '(no peerConnection object)',
          candidateTypes.relay === 0
            ? '\nNo relay candidates were ever gathered — the TURN server itself is unreachable/rejecting auth, not just failing to connect. Check the icecandidateerror logs above for the specific server/port that failed.'
            : '\nA relay candidate WAS obtained but the connection still hasn\'t completed — this points at something other than TURN availability (e.g. the other peer never got a matching relay candidate, or the offer/answer never reached them).');
      }, delay);
    });
  }

  function _hostHandleIncomingConn(conn){
    dlog('[Collab:HOST] _hostHandleIncomingConn — wiring listeners for', conn.peer, 'already open?', conn.open);
    _wireIceDiagnostics(conn, 'HOST');

    conn.on('open', () => {
      dlog('[Collab:HOST] conn.open — DataConnection ready for', conn.peer, '(reliable:', conn.reliable, ', serialization:', conn.serialization, ')');
      hostConns.set(conn.peer, conn);
      dlog('[Collab:HOST] hostConns now:', [...hostConns.keys()]);
    });

    conn.on('data', msg => {
      if(DEBUG) dlog('[Collab:HOST] conn.data <- raw message from', conn.peer, ':', JSON.stringify(msg));
      _hostOnMessage(conn, msg);
    });

    conn.on('close', () => {
      dwarn('[Collab:HOST] conn.close for', conn.peer);
      _hostDropPeer(conn.peer);
    });
    conn.on('error', (err) => {
      console.error('[Collab:HOST] conn.error for', conn.peer, ':', err);
      _hostDropPeer(conn.peer);
    });
  }

  function _hostDropPeer(peerId){
    if(!roster.has(peerId) && !hostConns.has(peerId)) return; // already dropped (e.g. 'bye' beat the transport close event)
    dwarn('[Collab:HOST] _hostDropPeer —', peerId, '(was in hostConns?', hostConns.has(peerId), ')');
    hostConns.delete(peerId);
    roster.delete(peerId);
    // peerRoles/bannedPeerIds are deliberately NOT cleared here — a peer
    // whose connection drops and later reconnects (see reconnection logic
    // below) keeps whatever role they had rather than resetting to the
    // 'member' default, and a ban needs to survive the connection actually
    // closing (that's the whole point of kicking someone as part of a ban).
    // Release any locks that peer held
    let releasedAny = false;
    for(const [body, lock] of locks){
      if(lock.peerId === peerId){
        locks.delete(body);
        releasedAny = true;
        _hostBroadcast({ type: 'unlock', body });
      }
    }
    _hostBroadcast({ type: 'peer-leave', peerId });
    emit('peer-left', { peerId });
    if(releasedAny) emit('locks-changed', _locksSnapshot());
  }

  // ── Host-only: peer management (kick/ban/roles) ──
  function kickPeer(peerId, reason){
    if(!isHost) return;
    const conn = hostConns.get(peerId);
    console.warn('[Collab:HOST] kicking', peerId, '—', reason || '(no reason given)');
    if(conn && conn.open) conn.send({ type: 'kicked', reason: reason || 'Removed by host' });
    // Give the message a moment to actually go out over the wire before we
    // tear the connection down — same reasoning as the graceful-leave 'bye'
    // flow: closing immediately risks cutting the send off entirely.
    setTimeout(() => {
      _hostDropPeer(peerId);
      if(conn){ try { conn.close(); } catch(e){} }
    }, 150);
  }

  // Honest limitation: PeerJS peer IDs aren't a persistent identity — they're
  // regenerated on a fresh page load/new tab, so this only blocks the
  // specific connection/ID being banned from reconnecting for the rest of
  // THIS hosting session. It does not, and can't by itself, stop the same
  // person from coming back under a new ID in a new tab. Good enough to
  // stop a disruptive peer from immediately rejoining; not real identity
  // moderation.
  function banPeer(peerId, reason){
    if(!isHost) return;
    bannedPeerIds.add(peerId);
    kickPeer(peerId, reason || 'Banned from this session');
  }
  function unbanPeer(peerId){
    if(!isHost) return;
    bannedPeerIds.delete(peerId);
  }
  function isBanned(peerId){
    return bannedPeerIds.has(peerId);
  }

  function setRole(peerId, role){
    if(!isHost || !ROLE_RANK.hasOwnProperty(role)) return;
    if(peerId === myPeerId) return; // the host is always 'manager' — not a settable/demotable role
    peerRoles.set(peerId, role);
    console.log('[Collab:HOST] role changed —', peerId, '->', role);

    // Demoted to visitor while holding a lock: they can no longer act on it
    // (further edit messages already get rejected by the real-time role
    // check in the 'edit' handler), but the lock itself would otherwise sit
    // there inert until the idle sweep eventually clears it — release it now.
    if(role === 'visitor'){
      let releasedAny = false;
      for(const [body, lock] of locks){
        if(lock.peerId === peerId){
          locks.delete(body);
          releasedAny = true;
          _hostBroadcast({ type: 'unlock', body });
        }
      }
      if(releasedAny) emit('locks-changed', _locksSnapshot());
    }

    _hostBroadcast({ type: 'role-changed', peerId, role }); // tell everyone, not just the affected peer, so all clients' peer lists stay in sync
    emit('role-changed', { peerId, role });
  }
  function getPeerRole(peerId){
    return _roleOf(peerId);
  }

  function _hostBroadcast(msg, excludePeerId){
    if(DEBUG) dlog('[Collab:HOST] _hostBroadcast', msg.type, 'excluding:', excludePeerId, 'to conns:', [...hostConns.keys()]);
    for(const [pid, conn] of hostConns){
      if(pid === excludePeerId) continue;
      if(conn.open){
        conn.send(msg);
      } else {
        dwarn('[Collab:HOST] skipped broadcast to', pid, '— conn.open is false');
      }
    }
    // Host applies to its own local state too, since the host is also a
    // participant — callers listening for these events don't need to know
    // whether they're the host or a peer.
    if(excludePeerId !== myPeerId) emit('message', msg);
  }

  function _hostSendTo(peerId, msg){
    const conn = hostConns.get(peerId);
    if(!conn){
      console.error('[Collab:HOST] _hostSendTo(', peerId, ') — NO CONNECTION FOUND in hostConns. Current keys:', [...hostConns.keys()]);
      return;
    }
    if(!conn.open){
      console.error('[Collab:HOST] _hostSendTo(', peerId, ') — connection exists but conn.open is FALSE. Message dropped:', msg.type);
      return;
    }
    dlog('[Collab:HOST] _hostSendTo(', peerId, ') sending', msg.type);
    conn.send(msg);
  }

  // Delivers the host's current assets + presets to ONE newly-joined peer
  // as a series of small chunked messages (reusing the exact same
  // 'asset-sync'/'preset-sync' shape and receive-side merge logic as the
  // ongoing live-sync — the receiving end can't tell the difference and
  // needs no special-casing) rather than stuffing everything into the
  // one-shot state-sync. A host with a large library could otherwise mean
  // one message carrying many MB of base64 image data — much riskier over
  // a TURN-relayed connection than a handful of small ones sent in
  // sequence. Targeted directly at the joining peer (_hostSendTo), not
  // broadcast — other already-synced peers don't need any of this.
  function _hostSendAssetPresetCatchup(peerId){
    const CHUNK_SIZE = 5;
    const CHUNK_DELAY_MS = 200;
    const chunks = []; // list of { type, added, removed }

    const assetsSnap = assetsProvider ? assetsProvider() : null;
    if(assetsSnap){
      for(const type of ['textures', 'heightmaps', 'other']){
        const list = assetsSnap[type] || [];
        for(let i = 0; i < list.length; i += CHUNK_SIZE){
          const slice = list.slice(i, i + CHUNK_SIZE);
          chunks.push({ type: 'asset-sync', added: { [type]: slice }, removed: {} });
        }
      }
    }

    const presetsSnap = presetsProvider ? presetsProvider() : null;
    if(presetsSnap){
      const names = Object.keys(presetsSnap);
      for(let i = 0; i < names.length; i += CHUNK_SIZE){
        const added = {};
        for(const name of names.slice(i, i + CHUNK_SIZE)) added[name] = presetsSnap[name];
        chunks.push({ type: 'preset-sync', added, removed: [] });
      }
    }

    console.log('[Collab:HOST] asset/preset catch-up for', peerId, '—', chunks.length, 'chunk(s) queued');

    let i = 0;
    const sendNext = () => {
      if(i >= chunks.length){
        // Explicit completion signal — without this, a peer joining a host
        // with an empty/small library (zero chunks) would have nothing to
        // ever tell it the catch-up finished, leaving the join loading
        // screen stuck until only the 12s safety-timeout message (which
        // doesn't even hide it, just adds a note) ever fired.
        _hostSendTo(peerId, { type: 'catchup-complete', peerId: myPeerId });
        return;
      }
      const chunk = chunks[i++];
      const payload = JSON.parse(JSON.stringify(chunk));
      payload.peerId = myPeerId;
      _hostSendTo(peerId, payload);
      setTimeout(sendNext, CHUNK_DELAY_MS);
    };
    sendNext();
  }

  function _locksSnapshot(){
    const out = {};
    for(const [body, lock] of locks) out[body] = { peerId: lock.peerId, ts: lock.ts };
    return out;
  }

  function _rosterSnapshot(){
    const out = {};
    for(const pid of roster.keys()) out[pid] = _rosterEntry(pid);
    return out;
  }

  function _hostOnMessage(conn, msg){
    const fromId = conn.peer;
    dlog('[Collab:HOST] _hostOnMessage — type:', msg.type, 'from:', fromId);
    switch(msg.type){
      case 'hello': {
        if(bannedPeerIds.has(fromId)){
          console.warn('[Collab:HOST] rejecting hello from banned peer', fromId);
          _hostSendTo(fromId, { type: 'kicked', reason: 'You are banned from this session.', banned: true });
          setTimeout(() => { const c = hostConns.get(fromId); if(c){ try { c.close(); } catch(e){} } }, 150);
          break;
        }
        dlog('[Collab:HOST] hello from', fromId, '- name:', msg.name, 'color:', msg.color);
        // New peer introducing itself with a display name/color choice.
        roster.set(fromId, { name: msg.name || 'Peer', color: msg.color || nextColor() });
        if(!peerRoles.has(fromId)) peerRoles.set(fromId, 'member'); // default role — not full trust (manager), not read-only (visitor)
        dlog('[Collab:HOST] roster updated:', _rosterSnapshot());
        // Send the newcomer the core system snapshot first — small and
        // fast, so they're not stuck on a loading screen waiting for
        // potentially many MB of texture/heightmap data. Assets/presets
        // follow separately as a chunked catch-up (see below) so a large
        // library doesn't go out as one risky giant message, same reasoning
        // as the ongoing live asset-sync/preset-sync batching.
        const syncMsg = {
          type: 'state-sync',
          bodies: stateProvider ? stateProvider() : {},
          settings: settingsProvider ? settingsProvider() : null,
          locks: _locksSnapshot(),
          roster: _rosterSnapshot(),
          you: fromId
        };
        console.log('[Collab:HOST] sending state-sync to', fromId, '—',
          Object.keys(syncMsg.bodies || {}).length, 'bodies,',
          syncMsg.settings ? 'settings included' : 'no settings provider set');
        _hostSendTo(fromId, syncMsg);
        _hostSendAssetPresetCatchup(fromId);
        _hostBroadcast({ type: 'peer-join', peerId: fromId, info: _rosterEntry(fromId) }, fromId);
        emit('peer-joined', { peerId: fromId, info: _rosterEntry(fromId) });
        break;
      }

      case 'select': {
        if(!_roleAtLeast(fromId, 'member')){
          _hostSendTo(fromId, { type: 'permission-denied', action: 'select', reason: 'Visitors cannot edit bodies.' });
          break;
        }
        const existing = locks.get(msg.body);
        if(!existing || existing.peerId === fromId){
          locks.set(msg.body, { peerId: fromId, ts: Date.now() });
          _hostBroadcast({ type: 'lock-ack', body: msg.body, peerId: fromId });
          emit('locks-changed', _locksSnapshot());
        } else {
          _hostSendTo(fromId, { type: 'lock-deny', body: msg.body, lockedBy: existing.peerId });
        }
        break;
      }

      case 'deselect': {
        const existing = locks.get(msg.body);
        if(existing && existing.peerId === fromId){
          locks.delete(msg.body);
          _hostBroadcast({ type: 'unlock', body: msg.body });
          emit('locks-changed', _locksSnapshot());
        }
        break;
      }

      case 'edit': {
        if(!_roleAtLeast(fromId, 'member')) break; // shouldn't have a lock to begin with if visitor — defense in depth
        const existing = locks.get(msg.body);
        // Only the current lock owner's edits are relayed — silently drop
        // anything else (e.g. a stale in-flight patch after a lock changed
        // hands) rather than letting it corrupt shared state.
        if(existing && existing.peerId === fromId){
          existing.ts = Date.now(); // edits refresh the idle timer
          _hostBroadcast({ type: 'edit', body: msg.body, patch: msg.patch, peerId: fromId }, fromId);
          emit('remote-edit', { body: msg.body, patch: msg.patch, peerId: fromId });
        }
        break;
      }

      case 'chat': {
        _hostBroadcast({ type: 'chat', peerId: fromId, text: msg.text, ts: Date.now() }, fromId);
        emit('chat', { peerId: fromId, text: msg.text });
        break;
      }

      case 'bye': {
        // Explicit graceful-leave notice — handle immediately rather than
        // waiting on the (slow/unreliable) transport-level conn.close event.
        _hostDropPeer(fromId);
        break;
      }

      case 'full-sync': {
        if(!_roleAtLeast(fromId, 'member')){
          _hostSendTo(fromId, { type: 'permission-denied', action: 'full-sync', reason: 'Visitors cannot modify the system.' });
          break;
        }
        if(_roleOf(fromId) === 'member'){
          // Members get "basic editing" but not destructive structural
          // changes. There's no separate message type for "this is a
          // delete" vs "this is an add" — full-sync just carries the
          // resulting `bodies` shape — so this is verified host-side by
          // diffing the incoming set against what the host currently has:
          // if any key that existed disappears, something got deleted,
          // cleared, or replaced by a different loaded system. All three
          // are the same shape of change from the host's perspective, so
          // one check covers all of them. (Known nuance: a rename also
          // removes the old key, so this incidentally blocks members from
          // renaming too — not just delete/clear/load specifically.)
          const currentBodies = stateProvider ? stateProvider() : {};
          const deletedKeys = Object.keys(currentBodies).filter(k => !msg.bodies || !msg.bodies[k]);
          if(deletedKeys.length > 0){
            console.warn('[Collab:HOST] blocked full-sync from member', fromId, '— would remove:', deletedKeys);
            _hostSendTo(fromId, { type: 'permission-denied', action: 'full-sync', reason: `Members can't delete, clear, or replace bodies (blocked: ${deletedKeys.slice(0, 5).join(', ')}${deletedKeys.length > 5 ? '…' : ''}). Ask a manager.` });
            break;
          }
        }
        // A peer's whole `bodies` shape changed (add/delete/rename/import/
        // etc.) — relay to everyone else, and emit locally too so the
        // host's own app-level state gets updated the same way a peer's
        // would (collab.js has no idea what `bodies` even is; the actual
        // apply happens in the app-level listener for this event).
        // Unconditional (not DEBUG-gated) — full-sync only fires on actual
        // structural changes, not per-keystroke, so it won't spam the
        // console, and it's the key trace point for diagnosing sync gaps.
        console.log('[Collab:HOST] full-sync received from peer', fromId, '—', Object.keys(msg.bodies || {}).length, 'bodies:', Object.keys(msg.bodies || {}), msg.settings ? '+ settings' : '');
        _hostBroadcast({ type: 'full-sync', bodies: msg.bodies, settings: msg.settings, peerId: fromId }, fromId);
        emit('full-sync', { bodies: msg.bodies, settings: msg.settings, peerId: fromId });
        break;
      }

      case 'asset-sync': {
        if(!_roleAtLeast(fromId, 'member')){
          _hostSendTo(fromId, { type: 'permission-denied', action: 'asset-sync', reason: 'Visitors cannot modify assets.' });
          break;
        }
        const removedCount = Object.values(msg.removed || {}).reduce((n, l) => n + (l?.length || 0), 0);
        if(_roleOf(fromId) === 'member' && removedCount > 0){
          console.warn('[Collab:HOST] blocked asset removal from member', fromId);
          _hostSendTo(fromId, { type: 'permission-denied', action: 'asset-sync', reason: "Members can't delete assets. Ask a manager." });
          break;
        }
        // Delta only (added entries + removed names), not the whole asset
        // library — asset payloads carry real image data, unlike bodies'
        // small JSON, so re-sending everything on every change would be
        // wasteful. Same relay-then-emit-locally pattern as full-sync.
        const addedCount = Object.values(msg.added || {}).reduce((n, l) => n + (l?.length || 0), 0);
        console.log('[Collab:HOST] asset-sync received from peer', fromId, '—', addedCount, 'added,', removedCount, 'removed');
        _hostBroadcast({ type: 'asset-sync', added: msg.added, removed: msg.removed, peerId: fromId }, fromId);
        emit('asset-sync', { added: msg.added, removed: msg.removed, peerId: fromId });
        break;
      }

      case 'preset-sync': {
        if(!_roleAtLeast(fromId, 'member')){
          _hostSendTo(fromId, { type: 'permission-denied', action: 'preset-sync', reason: 'Visitors cannot modify presets.' });
          break;
        }
        const removedCount = (msg.removed || []).length;
        if(_roleOf(fromId) === 'member' && removedCount > 0){
          console.warn('[Collab:HOST] blocked preset removal from member', fromId);
          _hostSendTo(fromId, { type: 'permission-denied', action: 'preset-sync', reason: "Members can't delete presets. Ask a manager." });
          break;
        }
        // Same delta pattern as asset-sync, for custom procgen presets
        // (_pgUserPresets) — small JSON, no binary payload concerns, but
        // still additive-merge rather than a destructive full replace since
        // a peer's own unrelated saved presets shouldn't get wiped out.
        const addedCount = Object.keys(msg.added || {}).length;
        console.log('[Collab:HOST] preset-sync received from peer', fromId, '—', addedCount, 'added,', removedCount, 'removed');
        _hostBroadcast({ type: 'preset-sync', added: msg.added, removed: msg.removed, peerId: fromId }, fromId);
        emit('preset-sync', { added: msg.added, removed: msg.removed, peerId: fromId });
        break;
      }

      default:
        dwarn('[Collab:HOST] unrecognized message type from', fromId, ':', msg.type, msg);
    }
  }

  // Periodic idle-lock sweep (host only)
  let _idleSweepTimer = null;
  function _startIdleSweep(){
    if(_idleSweepTimer) return;
    _idleSweepTimer = setInterval(() => {
      if(!isHost) return;
      const now = Date.now();
      let changed = false;
      for(const [body, lock] of locks){
        if(now - lock.ts > LOCK_IDLE_MS){
          locks.delete(body);
          _hostBroadcast({ type: 'unlock', body });
          changed = true;
        }
      }
      if(changed) emit('locks-changed', _locksSnapshot());
    }, 10000);
  }

  // ═══════════════════════════ PEER (joining) ═══════════════════════════

  function joinSession(code, name){
    return new Promise((resolve, reject) => {
      if(peer){ reject(new Error('Already in a session — leave first.')); return; }
      _explicitLeave = false;
      _wasKicked = false;
      _lastJoinCode = code;
      _lastJoinName = name;
      myName = name || 'Peer';
      myColor = nextColor();
      isHost = false;
      // Fresh for THIS attempt specifically (including each reconnect
      // retry) — distinguishes "never successfully connected this attempt"
      // (a real join failure: bad code, host not there — reject normally)
      // from "was connected, then it broke" (worth retrying). Can't use
      // myPeerId for this: it's set as soon as the broker connection opens,
      // before hostConn even exists, so it's always truthy by the time any
      // of hostConn's handlers could fire.
      let hostConnEverOpened = false;

      const hostId = peerIdFromCode(code);
      dlog('[Collab:PEER] joinSession — code:', code, '-> resolved hostId:', hostId);
      peer = new Peer({ debug: 2, config: { iceServers: ICE_SERVERS } });

      peer.on('open', pid => {
        dlog('[Collab:PEER] peer.open — my broker id is', pid, '- now connecting to host', hostId);
        myPeerId = pid;
        hostConn = peer.connect(hostId, { reliable: true });
        dlog('[Collab:PEER] peer.connect() called, connectionId:', hostConn.connectionId, 'initial open?', hostConn.open);
        _wireIceDiagnostics(hostConn, 'PEER');

        hostConn.on('open', () => {
          dlog('[Collab:PEER] hostConn.open — DataConnection to host is ready. Sending hello.');
          hostConnEverOpened = true;
          hostConn.send({ type: 'hello', name: myName, color: myColor });
          dlog('[Collab:PEER] hello sent:', { type: 'hello', name: myName, color: myColor });
          // A prior reconnect attempt (if any) just succeeded.
          if(_reconnectAttempt > 0){ _reconnectAttempt = 0; emit('reconnected'); }
        });

        hostConn.on('data', msg => {
          if(DEBUG) dlog('[Collab:PEER] hostConn.data <- raw message from host:', JSON.stringify(msg));
          _peerOnMessage(msg, resolve);
        });

        hostConn.on('close', () => {
          dwarn('[Collab:PEER] hostConn.close — connection to host closed');
          if(_explicitLeave) return; // leaveSession() is already tearing things down normally
          if(hostConnEverOpened) _attemptReconnect();
          else { const e = new Error('Connection closed before it opened'); emit('error', { err: e, phase: 'join' }); reject(e); }
        });
        hostConn.on('error', err => {
          console.error('[Collab:PEER] hostConn.error —', err);
          if(_explicitLeave) return;
          if(hostConnEverOpened) _attemptReconnect();
          else { emit('error', { err, phase: 'join' }); reject(err); }
        });
      });

      peer.on('error', err => {
        console.error('[Collab:PEER] peer.error —', err.type, err.message || err);
        if(_explicitLeave) return;
        if(hostConnEverOpened) _attemptReconnect(); // rare, but possible: a broker-level error after we were already properly connected
        else { emit('error', { err, phase: 'join' }); reject(err); }
      });

      peer.on('disconnected', () => dwarn('[Collab:PEER] peer.disconnected from signaling broker'));
      peer.on('close', () => dwarn('[Collab:PEER] peer.close — peer object destroyed'));
    });
  }

  // Retries joining the same session (same code/name) with exponential
  // backoff after an unexpected disconnection. Gives up and falls back to
  // the existing 'host-disconnected' handling (alert + reset UI) after
  // RECONNECT_MAX_ATTEMPTS — this is a bounded recovery attempt, not an
  // infinite retry loop.
  function _attemptReconnect(){
    if(_explicitLeave || !_lastJoinCode) return;
    if(_wasKicked){
      // Being kicked already means the connection is going/gone — clean up
      // local state properly here (mirroring the retry path's own cleanup
      // below) rather than leaving stale peer/hostConn references around,
      // which would otherwise make Collab.isActive() incorrectly keep
      // reporting true after being kicked. Reuses the existing 'left'
      // event's cleanup listeners (lockOwners, peerInfo, status pill, undo
      // stack, reconnect banner) instead of duplicating that logic — 'left'
      // has no alert anywhere, so this doesn't double up with the
      // kick-specific alert already shown from the 'kicked' event itself.
      try { if(peer) peer.destroy(); } catch(e){ /* already dead — fine */ }
      peer = null; hostConn = null; myPeerId = null;
      emit('left');
      return;
    }
    if(_reconnectAttempt >= RECONNECT_MAX_ATTEMPTS){
      console.warn('[Collab:PEER] reconnect — giving up after', _reconnectAttempt, 'attempt(s)');
      emit('host-disconnected');
      return;
    }
    _reconnectAttempt++;
    const delay = RECONNECT_BASE_DELAY_MS * Math.pow(2, _reconnectAttempt - 1);
    console.warn('[Collab:PEER] reconnect attempt', _reconnectAttempt, '/', RECONNECT_MAX_ATTEMPTS, '— retrying in', delay, 'ms');
    emit('reconnecting', { attempt: _reconnectAttempt, max: RECONNECT_MAX_ATTEMPTS, delayMs: delay });

    try { if(peer) peer.destroy(); } catch(e){ /* already dead — fine */ }
    peer = null; hostConn = null; myPeerId = null;

    clearTimeout(_reconnectTimer);
    _reconnectTimer = setTimeout(() => {
      joinSession(_lastJoinCode, _lastJoinName).catch(() => {
        // joinSession's own peer.on('error')/hostConn.on('error') already
        // route back through _attemptReconnect for anything that isn't a
        // first-attempt failure; this catch just prevents an unhandled
        // rejection if it happens to reject directly instead.
        if(!_explicitLeave) _attemptReconnect();
      });
    }, delay);
  }

  function _peerOnMessage(msg, joinResolve){
    dlog('[Collab:PEER] _peerOnMessage — type:', msg.type);
    switch(msg.type){
      case 'state-sync':
        dlog('[Collab:PEER] state-sync received — resolving joinSession promise. bodies keys:', Object.keys(msg.bodies || {}).length, 'roster:', msg.roster);
        peerLockMirror.clear();
        for(const [body, lock] of Object.entries(msg.locks || {})) peerLockMirror.set(body, lock.peerId);
        if(msg.roster && msg.roster[myPeerId] && msg.roster[myPeerId].role) myRole = msg.roster[myPeerId].role;
        emit('state-sync', { bodies: msg.bodies, assets: msg.assets, settings: msg.settings, presets: msg.presets, locks: msg.locks, roster: msg.roster });
        if(joinResolve){ joinResolve({ peerId: myPeerId }); joinResolve = null; }
        break;
      case 'lock-ack':
        peerLockMirror.set(msg.body, msg.peerId);
        emit('lock-ack', { body: msg.body, peerId: msg.peerId, mine: msg.peerId === myPeerId });
        break;
      case 'lock-deny':
        emit('lock-deny', { body: msg.body, lockedBy: msg.lockedBy });
        break;
      case 'unlock':
        peerLockMirror.delete(msg.body);
        emit('unlock', { body: msg.body });
        break;
      case 'edit':
        emit('remote-edit', { body: msg.body, patch: msg.patch, peerId: msg.peerId });
        break;
      case 'peer-join':
        emit('peer-joined', { peerId: msg.peerId, info: msg.info });
        break;
      case 'peer-leave':
        emit('peer-left', { peerId: msg.peerId });
        break;
      case 'chat':
        emit('chat', { peerId: msg.peerId, text: msg.text });
        break;
      case 'full-sync':
        console.log('[Collab:PEER] full-sync received from host —', Object.keys(msg.bodies || {}).length, 'bodies:', Object.keys(msg.bodies || {}), msg.settings ? '+ settings' : '');
        emit('full-sync', { bodies: msg.bodies, settings: msg.settings, peerId: msg.peerId });
        break;
      case 'asset-sync': {
        const addedCount = Object.values(msg.added || {}).reduce((n, l) => n + (l?.length || 0), 0);
        const removedCount = Object.values(msg.removed || {}).reduce((n, l) => n + (l?.length || 0), 0);
        console.log('[Collab:PEER] asset-sync received from host —', addedCount, 'added,', removedCount, 'removed');
        emit('asset-sync', { added: msg.added, removed: msg.removed, peerId: msg.peerId });
        break;
      }
      case 'preset-sync': {
        const addedCount = Object.keys(msg.added || {}).length;
        const removedCount = (msg.removed || []).length;
        console.log('[Collab:PEER] preset-sync received from host —', addedCount, 'added,', removedCount, 'removed');
        emit('preset-sync', { added: msg.added, removed: msg.removed, peerId: msg.peerId });
        break;
      }
      case 'catchup-complete':
        console.log('[Collab:PEER] catchup-complete received — join sequence fully done');
        emit('catchup-complete');
        break;
      case 'role-changed':
        console.log('[Collab:PEER] role-changed —', msg.peerId, '->', msg.role, msg.peerId === myPeerId ? '(me)' : '');
        if(msg.peerId === myPeerId) myRole = msg.role;
        emit('role-changed', { peerId: msg.peerId, role: msg.role });
        break;
      case 'permission-denied':
        console.warn('[Collab:PEER] permission-denied —', msg.action, ':', msg.reason);
        emit('permission-denied', { action: msg.action, reason: msg.reason });
        break;
      case 'kicked':
        console.warn('[Collab:PEER] kicked —', msg.reason, msg.banned ? '(banned)' : '');
        _wasKicked = true; // suppress auto-reconnect — being removed shouldn't trigger an immediate retry loop
        emit('kicked', { reason: msg.reason, banned: !!msg.banned });
        break;
      default:
        dwarn('[Collab:PEER] unrecognized message type from host:', msg.type, msg);
    }
  }

  // ═══════════════════════════ SHARED PUBLIC API ═══════════════════════════

  // Ask to select/lock a body. Fires 'lock-ack' or 'lock-deny' asynchronously
  // (locally on the host, over the wire for peers). Caller should apply the
  // optimistic local lock itself *before* calling this, per the design.
  function requestLock(body){
    if(!peer) return;
    if(isHost){
      _hostOnMessage({ peer: myPeerId }, { type: 'select', body });
    } else if(hostConn && hostConn.open){
      hostConn.send({ type: 'select', body, peerId: myPeerId, ts: Date.now() });
    }
  }

  function releaseLock(body){
    if(!peer) return;
    if(isHost){
      _hostOnMessage({ peer: myPeerId }, { type: 'deselect', body });
    } else if(hostConn && hostConn.open){
      hostConn.send({ type: 'deselect', body, peerId: myPeerId });
    }
  }

  function isLockedByOther(body){
    if(isHost){
      const l = locks.get(body);
      return !!(l && l.peerId !== myPeerId);
    }
    const heldBy = peerLockMirror.get(body);
    return !!(heldBy && heldBy !== myPeerId);
  }

  // Broadcast an edit patch for a body the caller currently holds the lock
  // on. Throttled per-body; pass immediate:true for the final send on
  // mouseup/blur so the last value is never dropped by the throttle window.
  function broadcastEdit(body, patch, immediate){
    if(!peer) return;

    const send = p => {
      if(isHost){
        _hostOnMessage({ peer: myPeerId }, { type: 'edit', body, patch: p });
      } else if(hostConn && hostConn.open){
        hostConn.send({ type: 'edit', body, patch: p, peerId: myPeerId, ts: Date.now() });
      }
    };

    const existing = editThrottles.get(body);

    if(immediate){
      // Final send on release: cancel any pending trailing send and fire now
      // with the freshest patch we have, so the last value always lands.
      if(existing) { clearTimeout(existing.timer); editThrottles.delete(body); }
      send(patch);
      return;
    }

    if(existing){
      // Already mid-throttle-window for this body — just remember the
      // latest patch; the trailing timer will send it when it fires.
      existing.pending = patch;
      return;
    }

    // Leading edge: send immediately, then hold the window open so any
    // further calls during it get coalesced into a single trailing send.
    send(patch);
    editThrottles.set(body, {
      pending: null,
      timer: setTimeout(() => {
        const t = editThrottles.get(body);
        editThrottles.delete(body);
        if(t && t.pending) send(t.pending);
      }, EDIT_THROTTLE_MS)
    });
  }

  // Broadcast a whole-`bodies` snapshot — used for structural changes (a
  // body added/deleted/renamed, a system imported/restored/preset applied,
  // etc.) rather than a single body's data, which broadcastEdit already
  // handles at much lower overhead. Not lock-gated: unlike per-body edits,
  // structural changes aren't tied to holding a specific body's lock.
  // Broadcast a whole-`bodies` (+ optional `settings`) snapshot — used for
  // structural changes (a body added/deleted/renamed, a system imported/
  // restored/preset applied, importSettings/spaceCenterData edited, etc.)
  // rather than a single body's data, which broadcastEdit already handles
  // at much lower overhead. Not lock-gated: unlike per-body edits,
  // structural changes aren't tied to holding a specific body's lock.
  function broadcastFullSync(bodiesSnapshot, settingsSnapshot){
    if(!peer){
      console.warn('[Collab] broadcastFullSync called with no active peer — ignored');
      return false;
    }
    const payload = JSON.parse(JSON.stringify(bodiesSnapshot));
    const settingsPayload = settingsSnapshot ? JSON.parse(JSON.stringify(settingsSnapshot)) : null;
    if(isHost){
      console.log('[Collab:HOST] broadcastFullSync — sending', Object.keys(payload).length, 'bodies to', hostConns.size, 'peer(s):', Object.keys(payload), settingsPayload ? '+ settings' : '');
      _hostBroadcast({ type: 'full-sync', bodies: payload, settings: settingsPayload, peerId: myPeerId });
      return true;
    } else if(hostConn && hostConn.open){
      console.log('[Collab:PEER] broadcastFullSync — sending', Object.keys(payload).length, 'bodies to host:', Object.keys(payload), settingsPayload ? '+ settings' : '');
      hostConn.send({ type: 'full-sync', bodies: payload, settings: settingsPayload, peerId: myPeerId });
      return true;
    } else {
      console.warn('[Collab:PEER] broadcastFullSync — hostConn not open, message DROPPED. hostConn exists?', !!hostConn, 'open?', hostConn?.open);
      return false;
    }
  }

  // Broadcast a DELTA of asset changes (newly added entries with full data,
  // plus names of removed entries) — unlike broadcastFullSync, deliberately
  // NOT the whole asset library every time, since asset entries carry real
  // image data. Used for live sync when someone uploads/deletes a texture
  // or heightmap, or when a system import/restore brings in new assets.
  function broadcastAssetSync(added, removed){
    if(!peer){
      console.warn('[Collab] broadcastAssetSync called with no active peer — ignored');
      return false;
    }
    const addedPayload = JSON.parse(JSON.stringify(added || {}));
    const removedPayload = JSON.parse(JSON.stringify(removed || {}));
    const addedCount = Object.values(addedPayload).reduce((n, l) => n + (l?.length || 0), 0);
    const removedCount = Object.values(removedPayload).reduce((n, l) => n + (l?.length || 0), 0);
    if(isHost){
      console.log('[Collab:HOST] broadcastAssetSync — sending', addedCount, 'added,', removedCount, 'removed to', hostConns.size, 'peer(s)');
      _hostBroadcast({ type: 'asset-sync', added: addedPayload, removed: removedPayload, peerId: myPeerId });
      return true;
    } else if(hostConn && hostConn.open){
      console.log('[Collab:PEER] broadcastAssetSync — sending', addedCount, 'added,', removedCount, 'removed to host');
      hostConn.send({ type: 'asset-sync', added: addedPayload, removed: removedPayload, peerId: myPeerId });
      return true;
    } else {
      console.warn('[Collab:PEER] broadcastAssetSync — hostConn not open, message DROPPED.');
      return false;
    }
  }

  // Same delta pattern as broadcastAssetSync, for custom procgen presets
  // (added: {name: {data,category,typeOverride}, ...}, removed: [names]).
  function broadcastPresetSync(added, removed){
    if(!peer){
      console.warn('[Collab] broadcastPresetSync called with no active peer — ignored');
      return false;
    }
    const addedPayload = JSON.parse(JSON.stringify(added || {}));
    const removedPayload = JSON.parse(JSON.stringify(removed || []));
    if(isHost){
      console.log('[Collab:HOST] broadcastPresetSync — sending', Object.keys(addedPayload).length, 'added,', removedPayload.length, 'removed to', hostConns.size, 'peer(s)');
      _hostBroadcast({ type: 'preset-sync', added: addedPayload, removed: removedPayload, peerId: myPeerId });
      return true;
    } else if(hostConn && hostConn.open){
      console.log('[Collab:PEER] broadcastPresetSync — sending', Object.keys(addedPayload).length, 'added,', removedPayload.length, 'removed to host');
      hostConn.send({ type: 'preset-sync', added: addedPayload, removed: removedPayload, peerId: myPeerId });
      return true;
    } else {
      console.warn('[Collab:PEER] broadcastPresetSync — hostConn not open, message DROPPED.');
      return false;
    }
  }

  function sendChat(text){
    if(!peer) return;
    if(isHost){
      _hostBroadcast({ type: 'chat', peerId: myPeerId, text, ts: Date.now() });
      emit('chat', { peerId: myPeerId, text });
    } else if(hostConn && hostConn.open){
      hostConn.send({ type: 'chat', text });
    }
  }

  function leaveSession(){
    if(!peer) return;
    _explicitLeave = true; // so hostConn's own close/error handlers don't treat this as a drop worth reconnecting from
    clearTimeout(_reconnectTimer);
    _reconnectAttempt = 0;
    const peerRef = peer; // capture before we null out the outer `peer` below
    try {
      if(isHost){
        _hostBroadcast({ type: 'peer-leave', peerId: myPeerId });
        for(const conn of hostConns.values()) conn.close();
        hostConns.clear();
        locks.clear();
        roster.clear();
        peerRef.destroy();
      } else if(hostConn){
        // Tell the host explicitly rather than relying on the transport-level
        // 'close' event alone — that event is slow/unreliable (especially
        // relayed through TURN) and can get cut off entirely if we destroy()
        // the peer before the close frame finishes sending. A small delay
        // gives the reliable data channel a chance to actually flush 'bye'
        // before we tear the connection down.
        if(hostConn.open) hostConn.send({ type: 'bye', peerId: myPeerId });
        hostConn.close();
        setTimeout(() => { try { peerRef.destroy(); } catch(e){} }, 150);
      } else {
        peerRef.destroy();
      }
    } catch(err){ dwarn('[Collab] error during leave:', err); }
    peer = null;
    isHost = false;
    hostConn = null;
    myPeerId = null;
    peerLockMirror.clear();
    if(_idleSweepTimer){ clearInterval(_idleSweepTimer); _idleSweepTimer = null; }
    emit('left');
  }

  function getMyInfo(){
    return { peerId: myPeerId, name: myName, color: myColor, isHost, hostPeerId: isHost ? myPeerId : (hostConn?.peer || null), role: isHost ? 'manager' : myRole };
  }

  function isActive(){
    return !!peer;
  }

  _startIdleSweep();

  // Best-effort notice on abrupt tab close (browser back button, closing
  // the tab, navigating away) — the person never clicked "Leave Session" so
  // leaveSession()'s explicit messages never ran. 'pagehide' fires more
  // reliably than 'beforeunload' for this (including on mobile Safari).
  // Not guaranteed to arrive — the page may already be torn down before the
  // send completes — but costs nothing to try, and the transport-level
  // close/error handlers remain as the fallback either way.
  window.addEventListener('pagehide', () => {
    if(!peer) return;
    try {
      if(isHost){
        _hostBroadcast({ type: 'peer-leave', peerId: myPeerId });
      } else if(hostConn && hostConn.open){
        hostConn.send({ type: 'bye', peerId: myPeerId });
      }
    } catch(e){ /* page is already unloading — nothing more we can do */ }
  });

  return {
    on, off,
    hostSession, joinSession, leaveSession,
    requestLock, releaseLock, isLockedByOther,
    broadcastEdit, broadcastFullSync, broadcastAssetSync, broadcastPresetSync, sendChat,
    setStateProvider, setAssetsProvider, setSettingsProvider, setPresetsProvider,
    getMyInfo, isActive,
    kickPeer, banPeer, unbanPeer, isBanned, setRole, getPeerRole,
    setDebug
  };
})();
