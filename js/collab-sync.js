// ═══════════════════════════ COLLAB SYNC ═══════════════════════════
// Bridges the Collab networking layer (collab.js) to the actual editor
// state — `bodies`, `selectedBody`, the sidebar, and the viewport. Until
// this file, Collab could request/release locks and relay edit patches
// over the wire, but nothing in the app ever called any of that: selecting
// a body didn't request a lock, editing a body didn't broadcast anything,
// and joining a session never actually loaded the host's system.
//
// Loaded LAST (after state.js, sidebar.js, viewport.js, preset-modal.js,
// collab.js, collab-ui.js) — it wraps a handful of existing global
// functions rather than editing those files directly, the same pattern
// fillSidebar() already uses internally for window.setVal.
//
// Scope: full-system sync on join (with a loading screen masking the
// handshake), live property-edit sync + per-body lock indicators for
// whichever body is selected, structural sync (bodies added/deleted/
// renamed/imported/restored/regenerated/etc.) via a polling-based change
// detector rather than hooking each mutation site individually,
// systemSettings sync (importSettings/spaceCenterData from settings.js)
// riding along with that same mechanism, live asset/preset sync (upload/
// delete, including bulk imports/restores that add many at once) via a
// parallel poll that sends only the delta — newly added entries + removed
// names — rather than the whole library each time, and a role-based
// permission system (manager/member/visitor, see collab.js for the
// authoritative host-side enforcement — the client-side guards here are a
// UX layer only, not the real security boundary). NOT covered: real
// conflict resolution for two people making structural changes at the same
// instant (last-write-wins, same as most casual P2P collab tools).
(function(){
  if(typeof Collab === 'undefined') return;

  let lockOwners = {};        // body name -> peerId currently editing it
  let peerInfo   = {};        // peerId -> {name, color}
  let applyingRemote = false; // true while we're applying an incoming state-sync/edit, so our own hooks don't re-broadcast it

  // ── Join-time loading screen ──
  // Without this, a joining peer briefly sees their own empty/default
  // system (still showing "+ ADD SYSTEM CENTER") for however long the
  // handshake + state-sync takes, before it's abruptly replaced by the
  // host's actual system. This masks that transition instead.
  let _joinLoadingTimeout = null;
  let _joinOverlayVisible = false;
  let _joinCatchupCount = 0;
  function _showJoinLoadingScreen(){
    let el = document.getElementById('cs-join-overlay');
    if(!el){
      el = document.createElement('div');
      el.id = 'cs-join-overlay';
      el.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(8,8,10,.94);'
        + 'display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px;'
        + 'font-family:inherit; color:var(--ink2, #ddd); backdrop-filter:blur(2px);';
      el.innerHTML = `
        <div style="width:34px;height:34px;border-radius:50%;border:3px solid var(--ac28);border-top-color:var(--sky2);animation:cs-spin 0.8s linear infinite"></div>
        <div style="font-size:.8rem;letter-spacing:.04em;color:var(--ink2, #ddd)">Syncing system from host…</div>
        <div id="cs-join-overlay-sub" style="font-size:.68rem;color:var(--ink4, #888)"></div>
      `;
      const style = document.createElement('style');
      style.textContent = '@keyframes cs-spin { to { transform: rotate(360deg); } }';
      document.head.appendChild(style);
      document.body.appendChild(el);
    }
    el.style.display = 'flex';
    _joinOverlayVisible = true;
    _joinCatchupCount = 0;
    _armJoinStallWatchdog();
  }
  function _armJoinStallWatchdog(){
    // Safety net: if nothing arrives for a while (state-sync never showed
    // up, or the catch-up sequence stalls partway through), don't trap the
    // person behind this overlay forever with no explanation. Re-armed on
    // every chunk received (see _bumpJoinCatchupProgress) rather than set
    // once — a large library sending many chunks 200ms apart can
    // legitimately take longer than 12s in total while still actively
    // making progress the whole time.
    clearTimeout(_joinLoadingTimeout);
    _joinLoadingTimeout = setTimeout(() => {
      const sub = document.getElementById('cs-join-overlay-sub');
      if(sub) sub.textContent = 'Taking longer than expected — check your connection, or leave and try again.';
    }, 12000);
  }
  function _hideJoinLoadingScreen(){
    clearTimeout(_joinLoadingTimeout);
    _joinOverlayVisible = false;
    const el = document.getElementById('cs-join-overlay');
    if(el) el.style.display = 'none';
  }
  function _bumpJoinCatchupProgress(n){
    if(!_joinOverlayVisible) return;
    _joinCatchupCount += n;
    _armJoinStallWatchdog(); // progress is happening — push the stall warning back out
    const sub = document.getElementById('cs-join-overlay-sub');
    if(sub) sub.textContent = `Receiving assets & presets… (${_joinCatchupCount} so far)`;
  }

  // Wraps the public API method directly — every caller (the Multiplayer
  // modal's Join flow in collab-ui.js) gets the overlay for free without
  // needing to change anything there.
  const _origJoinSession = Collab.joinSession;
  Collab.joinSession = function(...args){
    _showJoinLoadingScreen();
    return _origJoinSession.apply(Collab, args).catch(err => {
      _hideJoinLoadingScreen();
      throw err;
    });
  };

  // ── Multiplayer-scoped undo ──
  // Solo undo is a whole-`bodies` snapshot rollback — fine with one editor,
  // but in a shared session it would revert EVERYONE's changes back to that
  // point in time, not just the local user's own last action (if peer B
  // edited Mars after peer A's last push, peer A hitting undo would wipe out
  // B's edit too, even though A never touched Mars). Instead of a snapshot
  // rollback, multiplayer mode computes a per-body DIFF (which specific
  // bodies your own action added/removed/changed) and undo reverts only
  // those exact keys on top of whatever the CURRENT shared state is —
  // leaving anything anyone else has since changed untouched.
  //
  // Solo mode (Collab inactive) always falls through to the original
  // pushUndo/undoAction unchanged.
  let _mpUndoStack = []; // [{ bodyName: {before, after}, ... }, ...]

  function _computeBodiesDiff(before, after){
    const diff = {};
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for(const key of allKeys){
      const b = before[key], a = after[key];
      if(JSON.stringify(b) !== JSON.stringify(a)) diff[key] = { before: b, after: a };
    }
    return diff;
  }

  function _setUndoBtnState(active){
    const undoBtn = document.getElementById('undo-btn');
    if(!undoBtn) return;
    undoBtn.disabled = !active;
    undoBtn.classList.toggle('undo-active', active);
  }

  const _origPushUndo = pushUndo;
  pushUndo = function(){
    if(!Collab.isActive()){ _origPushUndo(); return; }
    // Every pushUndo() call site is a synchronous `pushUndo(); <mutate bodies>;`
    // pair (confirmed across tools.js/sidebar.js/placer.js/preset-modal.js/
    // procgen.js — none of them are async), so capturing "after" on the next
    // tick reliably lands once that mutation has completed.
    const before = JSON.parse(JSON.stringify(bodies));
    setTimeout(() => {
      const after = JSON.parse(JSON.stringify(bodies));
      const diff = _computeBodiesDiff(before, after);
      if(Object.keys(diff).length){
        _mpUndoStack.push(diff);
        if(_mpUndoStack.length > MAX_UNDO) _mpUndoStack.shift();
        _setUndoBtnState(true);
      }
    }, 0);
  };

  const _origUndoAction = undoAction;
  undoAction = function(){
    if(!Collab.isActive()){ _origUndoAction(); return; }
    if(!_mpUndoStack.length) return;
    const diff = _mpUndoStack.pop();

    for(const [name, { before }] of Object.entries(diff)){
      if(before === undefined) delete bodies[name]; // this key didn't exist before my action
      else bodies[name] = before;                   // restore to what it was before my action
    }

    if(selectedBody && !bodies[selectedBody]){
      selectedBody = null;
      if(typeof closeSidebar === 'function') closeSidebar();
    } else if(selectedBody && typeof fillSidebar === 'function'){
      fillSidebar(selectedBody);
    }
    const hasCenter = Object.values(bodies).some(b => b.isCenter);
    const empty = document.getElementById('empty-state');
    if(empty) empty.classList.toggle('gone', hasCenter);
    if(typeof updateStatusBar === 'function') updateStatusBar();
    if(typeof syncAddBodyBtn === 'function') syncAddBodyBtn();
    if(typeof resizeViewport === 'function') resizeViewport();
    if(typeof drawViewport === 'function') drawViewport();
    _setUndoBtnState(_mpUndoStack.length > 0);

    // This is a genuine local change (not a remote one), so it should
    // propagate to everyone else like any other structural change — do it
    // immediately rather than waiting up to 1.2s for the next poll tick.
    _checkStructuralChange();
  };

  // Fresh session, fresh undo history — a stale diff from a previous
  // session (or from before joining) shouldn't be replayable in a new one.
  Collab.on('hosted', () => { _mpUndoStack = []; _setUndoBtnState(false); });
  Collab.on('state-sync', () => { _mpUndoStack = []; _setUndoBtnState(false); });
  Collab.on('left', () => {
    _mpUndoStack = [];
    // Control reverts to the original solo undoStack, which was untouched
    // the whole time we were bypassing it above — reflect ITS actual state
    // rather than blindly disabling (it may still hold pre-session history).
    _setUndoBtnState(typeof undoStack !== 'undefined' && undoStack.length > 0);
  });

  function _me(){ return Collab.getMyInfo(); }

  // ── Small "syncing" status pill ──
  // Distinct from the full-screen join loading overlay above — this is a
  // brief, unobtrusive heads-up for ongoing mid-session transfers (a
  // structural change, an asset batch, a preset) so people aren't left
  // wondering why something just appeared/changed with no explanation,
  // especially during a bulk restore/import that trickles in over several
  // seconds.
  let _syncPillEl = null, _syncPillHideTimer = null;
  function _showSyncPill(text){
    if(!_syncPillEl){
      _syncPillEl = document.createElement('div');
      _syncPillEl.id = 'cs-sync-pill';
      _syncPillEl.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:99997;'
        + 'background:rgba(20,20,24,.95); border:1px solid var(--ac28); border-radius:20px; padding:6px 14px;'
        + 'font-size:.7rem; color:var(--ink2, #ddd); display:flex; align-items:center; gap:7px;'
        + 'box-shadow:0 2px 10px rgba(0,0,0,.4); opacity:0; transition:opacity .2s; pointer-events:none;'
        + 'font-family:inherit;';
      _syncPillEl.innerHTML = `<span style="width:9px;height:9px;border-radius:50%;border:2px solid var(--ac28);border-top-color:var(--sky2);animation:cs-spin .8s linear infinite;display:inline-block;flex-shrink:0"></span><span id="cs-sync-pill-text"></span>`;
      document.body.appendChild(_syncPillEl);
    }
    const t = document.getElementById('cs-sync-pill-text');
    if(t) t.textContent = text;
    _syncPillEl.style.opacity = '1';
    clearTimeout(_syncPillHideTimer);
    _syncPillHideTimer = setTimeout(() => { if(_syncPillEl) _syncPillEl.style.opacity = '0'; }, 1800);
  }

  // ── Persistent session status indicator ──
  // Unlike the sync pill above, this doesn't auto-hide — it's meant to
  // answer "which session am I even in right now?" at a glance, from
  // anywhere in the app, without needing to reopen the Multiplayer modal.
  // Solo mode: hidden entirely. The main risk this addresses isn't a
  // technical double-session bug (Collab.hostSession/joinSession already
  // refuse to run if a session is already active) — it's a person losing
  // track of their own role after the modal's closed, or two people each
  // assuming the other one is hosting.
  let _statusPillEl = null;
  function _ensureStatusPill(){
    if(_statusPillEl) return;
    _statusPillEl = document.createElement('div');
    _statusPillEl.id = 'cs-status-pill';
    _statusPillEl.style.cssText = 'position:fixed; top:56px; right:10px; z-index:99996;'
      + 'background:rgba(20,20,24,.95); border:1px solid var(--ac28); border-radius:16px; padding:6px 12px;'
      + 'font-size:.66rem; color:var(--ink2, #ddd); display:none; align-items:center; gap:7px;'
      + 'box-shadow:0 2px 10px rgba(0,0,0,.4); font-family:\'JetBrains Mono\', monospace; letter-spacing:.03em;'
      + 'cursor:pointer; max-width:min(220px, calc(100vw - 20px));';
    _statusPillEl.title = 'Click to open the Multiplayer panel';
    _statusPillEl.onclick = () => { if(typeof MP !== 'undefined' && MP.openModal) MP.openModal(); };
    document.body.appendChild(_statusPillEl);
  }
  function _refreshStatusPill(){
    _ensureStatusPill();
    if(!Collab.isActive()){
      _statusPillEl.style.display = 'none';
      return;
    }
    const me = Collab.getMyInfo();
    const peerCount = Object.keys(peerInfo).length;
    const dotColor = 'var(--jade, #30e090)';
    let text;
    if(me.isHost){
      text = `HOSTING${peerCount ? ' · ' + peerCount + ' peer' + (peerCount > 1 ? 's' : '') : ' · alone'}`;
    } else {
      const hostInfo = me.hostPeerId ? peerInfo[me.hostPeerId] : null;
      const hostName = hostInfo?.name || 'host';
      const roleLabel = { manager: 'Manager', member: 'Member', visitor: 'Visitor' }[me.role] || me.role;
      text = `CONNECTED to ${hostName} · ${roleLabel}`;
    }
    _statusPillEl.innerHTML = `<span style="width:7px;height:7px;border-radius:50%;background:${dotColor};flex-shrink:0"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${text}</span>`;
    _statusPillEl.style.display = 'flex';
  }
  Collab.on('hosted',            _refreshStatusPill);
  Collab.on('state-sync',        _refreshStatusPill);
  Collab.on('peer-joined',       _refreshStatusPill);
  Collab.on('peer-left',         _refreshStatusPill);
  Collab.on('reconnected',       _refreshStatusPill);
  Collab.on('left',              _refreshStatusPill);
  Collab.on('host-disconnected', _refreshStatusPill);
  Collab.on('role-changed',      _refreshStatusPill);


  // Unlike the sync pill, this STAYS visible until explicitly cleared — an
  // in-progress reconnect isn't something to flash-and-forget, someone
  // might be watching it to know whether to just wait or give up and
  // rejoin manually. Covers both the peer-side auto-rejoin and the host-
  // side broker reconnect (different mechanisms in collab.js, same UI).
  let _reconnectBannerEl = null;
  function _showReconnectBanner(text, tone){
    if(!_reconnectBannerEl){
      _reconnectBannerEl = document.createElement('div');
      _reconnectBannerEl.id = 'cs-reconnect-banner';
      _reconnectBannerEl.style.cssText = 'position:fixed; top:12px; left:50%; transform:translateX(-50%); z-index:99999;'
        + 'padding:8px 16px; border-radius:20px; font-size:.72rem; font-family:inherit;'
        + 'display:flex; align-items:center; gap:8px; box-shadow:0 2px 12px rgba(0,0,0,.45);';
      document.body.appendChild(_reconnectBannerEl);
    }
    const isWarn = tone === 'warn';
    _reconnectBannerEl.style.background = isWarn ? 'rgba(90,30,30,.95)' : 'rgba(20,20,24,.95)';
    _reconnectBannerEl.style.border = '1px solid ' + (isWarn ? 'var(--rose)' : 'var(--ac28)');
    _reconnectBannerEl.style.color = isWarn ? '#ffb3b3' : 'var(--ink2, #ddd)';
    const spinner = isWarn ? '' : `<span style="width:10px;height:10px;border-radius:50%;border:2px solid var(--ac28);border-top-color:var(--sky2);animation:cs-spin .8s linear infinite;display:inline-block;flex-shrink:0"></span>`;
    _reconnectBannerEl.innerHTML = spinner + `<span>${text}</span>`;
    _reconnectBannerEl.style.display = 'flex';
  }
  function _hideReconnectBanner(){
    if(_reconnectBannerEl) _reconnectBannerEl.style.display = 'none';
  }

  // Peer-side: auto-rejoin in progress after an unexpected drop.
  Collab.on('reconnecting', d => {
    _showReconnectBanner(`⚠ Lost connection to host — reconnecting… (attempt ${d.attempt}/${d.max})`);
  });
  Collab.on('reconnected', () => {
    _hideReconnectBanner();
    _showSyncPill('Reconnected!');
  });

  // Host-side: PeerJS's own broker reconnect in progress. Existing
  // connections to already-joined peers keep working through this — only
  // NEW peers trying to join would be affected — so the wording stays calm
  // rather than alarming.
  Collab.on('host-reconnecting', d => {
    _showReconnectBanner(`⚠ Reconnecting to signaling service… (attempt ${d.attempt}/${d.max})`);
  });
  Collab.on('host-reconnected', () => {
    _hideReconnectBanner();
    _showSyncPill('Reconnected!');
  });
  Collab.on('host-broker-lost', () => {
    _showReconnectBanner('⚠ Lost connection to the signaling service — new players can\'t join until you restart hosting. Already-connected players should be unaffected.', 'warn');
  });

  // ── Lock bookkeeping ──
  function _setLockOwnersFromSnapshot(snapshot){
    lockOwners = {};
    for(const [body, lock] of Object.entries(snapshot || {})) lockOwners[body] = lock.peerId;
    _refreshLockUI();
  }

  // ── Lock UI: read-only overlay + banner on the sidebar when the open
  // body is locked by someone else. Targets the sidebar's scrollable
  // content area (.sb-body) rather than every individual field — far
  // simpler than threading a disabled state through hundreds of inputs. ──
  function _ensureLockBanner(){
    let el = document.getElementById('cs-lock-banner');
    if(!el){
      el = document.createElement('div');
      el.id = 'cs-lock-banner';
      el.style.cssText = 'padding:7px 14px; background:var(--rose); color:#fff;'
        + 'font-size:.72rem; font-weight:600; text-align:center; letter-spacing:.02em;';
      const sidebar = document.getElementById('sidebar');
      if(sidebar) sidebar.insertBefore(el, sidebar.firstChild);
    }
    return el;
  }

  function _refreshLockUI(){
    const sbBody = document.querySelector('#sidebar .sb-body');
    const banner = document.getElementById('cs-lock-banner');

    if(!Collab.isActive() || !selectedBody){
      if(sbBody){ sbBody.style.pointerEvents = ''; sbBody.style.opacity = ''; }
      if(banner) banner.remove();
      return;
    }

    const isVisitor = _me().role === 'visitor';
    const ownerId = lockOwners[selectedBody];
    const lockedByOther = isVisitor || !!(ownerId && ownerId !== _me().peerId);

    if(sbBody){
      sbBody.style.pointerEvents = lockedByOther ? 'none' : '';
      sbBody.style.opacity = lockedByOther ? '.55' : '';
    }
    if(isVisitor){
      _ensureLockBanner().innerHTML = `<svg class="icon"><use href="#icon-eye"></use></svg> Visitor role — view only`;
    } else if(lockedByOther){
      const name = peerInfo[ownerId]?.name || 'Someone';
      _ensureLockBanner().innerHTML = `<svg class="icon"><use href="#icon-lock"></use></svg> Locked by ${name} — view only`;
    } else if(banner){
      banner.remove();
    }
  }

  // Host hands this to a newly-joining peer as part of state-sync, so they
  // start with the same textures/heightmaps the host's system actually
  // uses instead of missing assets and rendering blank/default bodies.
  // (Ongoing mid-session asset changes are handled separately below by
  // _checkAssetChange/_applyIncomingAssetSync, which send only the delta —
  // this provider here is just for the one-time join snapshot.)
  // Registered unconditionally — the typeof check happens lazily INSIDE the
  // callback (matching how setStateProvider is registered in collab-ui.js),
  // not eagerly here at script-parse time. An eager check here would
  // silently and permanently skip registration if `assets` weren't defined
  // yet at the exact moment this line ran (e.g. subtle script-order
  // sensitivity) — this is a strictly safer pattern.
  Collab.setAssetsProvider(() => (typeof assets !== 'undefined' ? assets : null));

  // Same lazy-check pattern — importSettings/spaceCenterData from settings.js.
  // Small plain object, no binaries, so (unlike assets) this rides along
  // with every full-sync too, not just the initial join.
  Collab.setSettingsProvider(() => (typeof systemSettings !== 'undefined' ? systemSettings : null));

  // Custom procgen presets (_pgUserPresets) — small JSON (body-data
  // templates, no embedded binaries), additive-merge like assets rather
  // than a destructive replace like bodies, since a peer's own unrelated
  // saved presets from before joining shouldn't get wiped out.
  Collab.setPresetsProvider(() => (typeof _pgUserPresets !== 'undefined' ? _pgUserPresets : null));

  function _mergeIncomingAssets(remoteAssets){
    if(!remoteAssets || typeof assets === 'undefined') return;
    let added = 0;

    const merge = (list, type) => {
      for(const entry of (list || [])){
        const existingIdx = assets[type].findIndex(a => a.name === entry.name);
        if(existingIdx !== -1){
          // Same name already present — replace rather than skip. Matters
          // for the delta-sync path below: an entry only appears there
          // because its content/size differs from what we last knew, not
          // because it's a duplicate to ignore.
          assets[type][existingIdx] = entry;
        } else {
          assets[type].push(entry);
        }
        added++;
        if(type === 'textures'){
          const texName = entry.name.replace(/\.[^.]+$/, '');
          if(entry.url && typeof cacheTexture === 'function') cacheTexture(texName, entry.url);
          document.getElementById('asset-tex-' + (typeof sanitize === 'function' ? sanitize(entry.name) : entry.name))?.remove();
          if(typeof renderAssetThumb === 'function') renderAssetThumb(entry);
        } else {
          document.getElementById('asset-' + type + '-' + (typeof sanitize === 'function' ? sanitize(entry.name) : entry.name))?.remove();
          if(typeof renderAssetRow === 'function') renderAssetRow(entry, type);
          if(type === 'heightmaps' && typeof injectCustomHeightmap === 'function') injectCustomHeightmap(entry.name);
        }
      }
    };

    merge(remoteAssets.textures, 'textures');
    merge(remoteAssets.heightmaps, 'heightmaps');
    merge(remoteAssets.other, 'other');

    console.log('[CollabSync] merged', added, 'incoming asset(s) from host —',
      'textures:', assets.textures.length, 'heightmaps:', assets.heightmaps.length, 'other:', assets.other.length);
    if(typeof refreshTexPickerLists === 'function') refreshTexPickerLists();
    if(typeof drawViewport === 'function') drawViewport();
  }

  // ── Live asset sync (upload/delete, mid-session) ──
  // Import/restore/preset flows add assets via many direct
  // `assets[type].push(...)` call sites across io.js/autosave.js — same
  // "too many mutation sites to chase individually" situation as `bodies`,
  // so this uses the same polling strategy. Unlike bodies, though, only the
  // DELTA (newly added entries + removed names) is sent, not the whole
  // library each time — asset entries carry real image data.
  function _assetSigMap(type){
    const m = new Map();
    for(const a of (assets?.[type] || [])) m.set(a.name, a.size || 0);
    return m;
  }
  let _lastAssetSig = null; // { textures: Map(name->size), heightmaps: Map, other: Map }

  // Caps how many newly-added entries go into a single asset-sync message.
  // A single upload is small and fine in one shot; a bulk restore/import
  // can add dozens of textures at once, and stuffing all of them into one
  // message means many MB of base64 image data in a single WebRTC send —
  // much riskier than the single-file case, especially over a TURN-relayed
  // connection with real bandwidth limits. Capping this turns a bulk load
  // into a steady trickle (a few entries every ~1.2s) instead of one large
  // burst that's more likely to stall or get dropped. Removed entries
  // (just names, not data) aren't capped — those are cheap regardless of count.
  const ASSET_SYNC_MAX_PER_TICK = 3;

  function _checkAssetChange(){
    if(!Collab.isActive() || applyingRemote || typeof assets === 'undefined') return;
    const cur = { textures: _assetSigMap('textures'), heightmaps: _assetSigMap('heightmaps'), other: _assetSigMap('other') };
    if(!_lastAssetSig){ _lastAssetSig = cur; return; } // first tick after session start — just establishes the baseline

    const added = { textures: [], heightmaps: [], other: [] };
    const removed = { textures: [], heightmaps: [], other: [] };
    let hasChange = false;
    let totalNew = 0, sentThisTick = 0;

    for(const type of ['textures', 'heightmaps', 'other']){
      const prev = _lastAssetSig[type], now = cur[type];
      for(const [name, size] of now){
        if(!prev.has(name) || prev.get(name) !== size){
          totalNew++;
          if(sentThisTick >= ASSET_SYNC_MAX_PER_TICK) continue; // leave it queued for a later tick — see baseline note below
          const entry = assets[type].find(a => a.name === name);
          if(entry){ added[type].push(entry); hasChange = true; sentThisTick++; }
        }
      }
      for(const name of prev.keys()){
        if(!now.has(name)){ removed[type].push(name); hasChange = true; }
      }
    }

    if(hasChange){
      console.log('[CollabSync] asset change detected — sending', sentThisTick, 'of', totalNew, 'new entries',
        totalNew > sentThisTick ? `(${totalNew - sentThisTick} more queued for next tick(s))` : '', '— removed:', removed);
      const sent = Collab.broadcastAssetSync(added, removed);
      if(sent){
        _showSyncPill(totalNew > sentThisTick ? `Syncing assets… (${totalNew - sentThisTick} more queued)` : 'Syncing assets…');
        // Only advance the baseline for what we actually sent this tick —
        // build the next baseline from the previous one, plus what went
        // out, minus what got removed. Anything still queued (beyond the
        // per-tick cap) stays "not yet known", so the next tick's diff
        // picks it up naturally rather than needing separate bookkeeping.
        const nextSig = {
          textures: new Map(_lastAssetSig.textures),
          heightmaps: new Map(_lastAssetSig.heightmaps),
          other: new Map(_lastAssetSig.other)
        };
        for(const type of ['textures', 'heightmaps', 'other']){
          for(const entry of added[type]) nextSig[type].set(entry.name, entry.size || 0);
          for(const name of removed[type]) nextSig[type].delete(name);
        }
        _lastAssetSig = nextSig;
      } else {
        console.warn('[CollabSync] asset-sync send failed — will retry next poll tick');
      }
    }
  }

  function _applyIncomingAssetSync(added, removed){
    if(typeof assets === 'undefined') return;
    applyingRemote = true;
    try {
      _showSyncPill('Receiving assets…');
      _bumpJoinCatchupProgress(Object.values(added || {}).reduce((n, l) => n + (l?.length || 0), 0));
      _mergeIncomingAssets(added);
      for(const type of ['textures', 'heightmaps', 'other']){
        for(const name of (removed?.[type] || [])){
          const safe = typeof sanitize === 'function' ? sanitize(name) : name;
          // Reuse the real removeAsset() rather than reimplementing its
          // cleanup (DOM removal, texture/heightmap cache busting, terrain
          // cache invalidation, empty-state refresh) — it already handles
          // all of that correctly for a local delete.
          if(typeof removeAsset === 'function') removeAsset(safe, type === 'textures' ? undefined : type);
        }
      }
      _lastAssetSig = { textures: _assetSigMap('textures'), heightmaps: _assetSigMap('heightmaps'), other: _assetSigMap('other') };
    } catch(err){
      console.error('[CollabSync] error applying incoming asset-sync:', err);
    } finally {
      applyingRemote = false;
    }
  }

  Collab.on('asset-sync', d => _applyIncomingAssetSync(d.added, d.removed));

  // ── Live preset sync (save/delete a custom procgen preset, mid-session) ──
  // Structurally the same problem as assets: additive-merge, not a
  // destructive replace, and multiple mutation paths (save-from-editor,
  // JSON import in the procgen panel) rather than one. Small JSON though —
  // no per-tick batching cap needed like assets' base64 image data.
  function _mergeIncomingPresets(remotePresets){
    if(!remotePresets || typeof _pgUserPresets === 'undefined') return;
    let added = 0;
    for(const [name, entry] of Object.entries(remotePresets)){
      if(typeof _pgRegisterUserPreset === 'function'){
        _pgRegisterUserPreset(name, entry.data, entry.category, entry.typeOverride);
        added++;
      }
    }
    console.log('[CollabSync] merged', added, 'incoming preset(s) from host —', Object.keys(_pgUserPresets).length, 'total');
    if(typeof pgPresetsRender === 'function') pgPresetsRender();
  }

  function _presetSigMap(){
    const m = new Map();
    if(typeof _pgUserPresets === 'undefined') return m;
    for(const [name, entry] of Object.entries(_pgUserPresets)) m.set(name, JSON.stringify(entry).length);
    return m;
  }
  let _lastPresetSig = null; // Map(name -> serialized length)
  function _checkPresetChange(){
    if(!Collab.isActive() || applyingRemote || typeof _pgUserPresets === 'undefined') return;
    const cur = _presetSigMap();
    if(!_lastPresetSig){ _lastPresetSig = cur; return; }

    const added = {};
    const removed = [];
    let hasChange = false;
    for(const [name, len] of cur){
      if(!_lastPresetSig.has(name) || _lastPresetSig.get(name) !== len){
        added[name] = _pgUserPresets[name];
        hasChange = true;
      }
    }
    for(const name of _lastPresetSig.keys()){
      if(!cur.has(name)){ removed.push(name); hasChange = true; }
    }

    if(hasChange){
      console.log('[CollabSync] preset change detected — added:', Object.keys(added), 'removed:', removed);
      const sent = Collab.broadcastPresetSync(added, removed);
      if(sent){ _lastPresetSig = cur; _showSyncPill('Syncing presets…'); }
      else console.warn('[CollabSync] preset-sync send failed — will retry next poll tick');
    }
  }

  function _applyIncomingPresetSync(added, removed){
    if(typeof _pgUserPresets === 'undefined') return;
    applyingRemote = true;
    try {
      _showSyncPill('Receiving presets…');
      _bumpJoinCatchupProgress(Object.keys(added || {}).length);
      _mergeIncomingPresets(added);
      for(const name of (removed || [])){
        if(typeof pgPresetsRemove === 'function') pgPresetsRemove(name);
      }
      _lastPresetSig = _presetSigMap();
    } catch(err){
      console.error('[CollabSync] error applying incoming preset-sync:', err);
    } finally {
      applyingRemote = false;
    }
  }

  Collab.on('preset-sync', d => _applyIncomingPresetSync(d.added, d.removed));

  // ── Apply an incoming full `bodies` (+ optional `settings`) snapshot —
  // shared by 'state-sync' (on join) and 'full-sync' (any later structural
  // change: add/delete/rename/import/restore/preset/procgen/settings edit/
  // etc., whatever the source). ──
  function _applyIncomingState(newBodies, newSettings){
    console.log('[CollabSync] applying incoming state —', Object.keys(newBodies || {}).length, 'bodies:', Object.keys(newBodies || {}), newSettings ? '+ settings' : '');
    applyingRemote = true;
    try {
      _showSyncPill('Receiving system update…');
      const prevCenter = Object.keys(bodies).find(n => bodies[n]?.isCenter) || null;

      bodies = JSON.parse(JSON.stringify(newBodies || {}));
      if(newSettings && typeof systemSettings !== 'undefined'){
        systemSettings = JSON.parse(JSON.stringify(newSettings));
      }
      _lastStateFp = _stateFp(); // baseline so our own poll doesn't immediately re-broadcast this right back

      if(selectedBody && !bodies[selectedBody]){
        selectedBody = null;
        if(typeof closeSidebar === 'function') closeSidebar();
      } else if(selectedBody && typeof fillSidebar === 'function'){
        fillSidebar(selectedBody); // keep an open sidebar in sync if that body still exists
      }

      // Locks are keyed by body name — if a body got deleted/renamed out
      // from under a lock (whether it's the center or not), that name is
      // now orphaned in our local lockOwners mirror. Left alone it'd only
      // clear on the next actual lock/unlock event, or linger and
      // incorrectly appear to lock a same-named body someone creates later.
      for(const name of Object.keys(lockOwners)){
        if(!bodies[name]) delete lockOwners[name];
      }

      // Center changed (added/removed/replaced) — the rendering itself
      // already handles this fine (viewport/status bar re-derive the
      // center fresh on every draw, never cache it), but a structural
      // change like this is disorienting enough to call out explicitly
      // rather than leaving people to notice the system just looks
      // different now.
      const newCenter = Object.keys(bodies).find(n => bodies[n]?.isCenter) || null;
      if(newCenter !== prevCenter && chatBubbleEl){
        if(!prevCenter && newCenter) _pushChatMsg({ system: true, text: `System center set to ${newCenter}` });
        else if(prevCenter && !newCenter) _pushChatMsg({ system: true, text: `System center (${prevCenter}) was removed` });
        else if(prevCenter && newCenter) _pushChatMsg({ system: true, text: `System center changed from ${prevCenter} to ${newCenter}` });
      }

      const hasCenter = !!newCenter;
      const empty = document.getElementById('empty-state');
      if(empty) empty.classList.toggle('gone', hasCenter);
      if(typeof updateStatusBar === 'function') updateStatusBar();
      if(typeof syncAddBodyBtn === 'function') syncAddBodyBtn();
      if(typeof resizeViewport === 'function') resizeViewport();
      if(typeof drawViewport === 'function') drawViewport();
    } catch(err){
      // Explicit catch (not just relying on Collab.emit()'s own try/catch)
      // so this shows up clearly, AND so `finally` below still runs even if
      // something in here throws — otherwise applyingRemote could get stuck
      // `true` forever, silently blocking all further outgoing sync.
      console.error('[CollabSync] error applying incoming state:', err);
    } finally {
      applyingRemote = false;
    }
  }

  Collab.on('state-sync', d => {
    // Note: assets/presets no longer travel in this message — they arrive
    // separately via chunked asset-sync/preset-sync messages (see
    // _hostSendAssetPresetCatchup in collab.js), applied by the handlers
    // for those events elsewhere in this file. The join loading screen
    // stays up until 'catchup-complete' confirms that sequence finished —
    // hiding it here instead would drop the peer into a system that's
    // still visibly missing textures for however long the catch-up takes.
    _applyIncomingState(d.bodies, d.settings);
    peerInfo = {};
    for(const [pid, info] of Object.entries(d.roster || {})) peerInfo[pid] = info;
    _setLockOwnersFromSnapshot(d.locks);
  });

  Collab.on('catchup-complete', () => _hideJoinLoadingScreen());

  Collab.on('full-sync', d => _applyIncomingState(d.bodies, d.settings));

  // ── Structural-change detection ──
  // Rather than hooking every individual mutation site (add body, delete
  // body, rename, import zip, load featured system, restore autosave,
  // apply preset, procgen regeneration — and anything added later that
  // touches `bodies`), poll for a change in `bodies`' shape and broadcast a
  // full snapshot when one is found. Less instant than a per-site hook, but
  // it can't miss a mutation path we don't know about. ~1.2s latency on
  // structural changes is fine — unlike live-dragging edits (which use the
  // fast, lock-gated broadcastEdit path above), adding/deleting a body
  // isn't latency-sensitive.
  //
  // The currently-selected body is deliberately excluded from the
  // fingerprint: its live edits already propagate instantly via
  // broadcastEdit/remote-edit, so including it here would trigger a
  // redundant full-bodies broadcast on every drag tick — exactly the kind
  // of per-message overhead the DEBUG-flag cleanup in collab.js was meant
  // to get rid of.
  let _lastStateFp = null;
  function _stateFp(){
    // The full set of body NAMES always participates in the fingerprint —
    // that's what changes on add/delete/rename, including the common
    // "add a body, immediately select it for editing" flow, where the new
    // body IS selectedBody from the very first poll tick. Excluding it
    // entirely (as an earlier version of this did) made a brand-new body's
    // fingerprint identical to "nothing changed" and silently missed it.
    // Only the selected body's own DATA CONTENTS are excluded from the deep
    // comparison, since those already propagate via the fast per-edit
    // broadcastEdit/remote-edit channel.
    const names = Object.keys(bodies).sort();
    const bodiesPart = names.map(name => name === selectedBody ? name : name + ':' + JSON.stringify(bodies[name])).join('|');
    // systemSettings is a small plain object (no binaries) — always
    // included in full, unlike bodies' selected-body exclusion above.
    const settingsPart = typeof systemSettings !== 'undefined' ? JSON.stringify(systemSettings) : '';
    return bodiesPart + '::' + settingsPart;
  }
  function _checkStructuralChange(){
    if(!Collab.isActive() || applyingRemote) return;
    const fp = _stateFp();
    if(fp !== _lastStateFp){
      console.log('[CollabSync] structural change detected — broadcasting full-sync. bodies:', Object.keys(bodies));
      const sent = Collab.broadcastFullSync(bodies, typeof systemSettings !== 'undefined' ? systemSettings : null);
      // Only advance the baseline if the send actually went out. If it
      // didn't (e.g. hostConn not open for a moment), leave the baseline
      // stale so the NEXT poll tick sees the same diff and retries —
      // otherwise a single dropped send would permanently lose that change,
      // since a future tick would compare against a baseline we'd already
      // (wrongly) advanced past it.
      if(sent){ _lastStateFp = fp; _showSyncPill('Syncing system…'); }
      else console.warn('[CollabSync] full-sync send failed — will retry next poll tick');
    }
  }
  // 350ms rather than the original 1200ms — this is the safety-net fallback
  // for anything NOT covered by an immediate-trigger hook below (bulk
  // procgen regeneration, system import, autosave restore, and anything
  // else that touches `bodies`/`assets`/presets without going through one
  // of the specific commit points we hook). The immediate hooks make the
  // common interactive cases (add, delete, rename, re-root, asset/preset
  // save-or-delete) propagate right away instead of waiting on this at all.
  setInterval(() => { _checkStructuralChange(); _checkAssetChange(); _checkPresetChange(); }, 350);
  Collab.on('hosted', () => { _lastAssetSig = { textures: _assetSigMap('textures'), heightmaps: _assetSigMap('heightmaps'), other: _assetSigMap('other') }; });
  Collab.on('hosted', () => { _lastStateFp = _stateFp(); });
  Collab.on('hosted', () => { _lastPresetSig = _presetSigMap(); });

  // Settings are edited via the Settings modal's save button rather than
  // live-dragged like a body's fields — trigger an immediate check on save
  // instead of waiting up to 1.2s for the next poll tick.
  if(typeof closeSysSettings === 'function'){
    const _origCloseSysSettings = closeSysSettings;
    closeSysSettings = function(){
      _origCloseSysSettings();
      _checkStructuralChange();
    };
  }

  // Host: 'locks-changed' always carries the full current snapshot, so it's
  // the single source of truth on that side.
  Collab.on('locks-changed', snapshot => _setLockOwnersFromSnapshot(snapshot));

  // Peer: only incremental updates arrive after the initial snapshot in
  // 'state-sync' above — track them ourselves.
  Collab.on('lock-ack', d => { lockOwners[d.body] = d.peerId; _refreshLockUI(); });
  Collab.on('unlock',   d => { delete lockOwners[d.body]; _refreshLockUI(); });
  Collab.on('lock-deny', d => {
    // Someone else already had it (race on simultaneous select) — reflect
    // reality instead of pretending we got the lock.
    lockOwners[d.body] = d.lockedBy;
    _refreshLockUI();
  });

  Collab.on('peer-joined', d => { peerInfo[d.peerId] = d.info || {}; });
  Collab.on('peer-left',   d => { delete peerInfo[d.peerId]; }); // any locks they held are released host-side via individual 'unlock' broadcasts already
  Collab.on('left',              () => { lockOwners = {}; peerInfo = {}; _refreshLockUI(); _hideJoinLoadingScreen(); _hideReconnectBanner(); });
  Collab.on('host-disconnected', () => { lockOwners = {}; peerInfo = {}; _refreshLockUI(); _hideJoinLoadingScreen(); });

  // ── Remote edits: apply the incoming patch. broadcastEdit() below always
  // sends the WHOLE rebuilt `data` object for a body (matching how
  // _liveSyncNow already rebuilds it wholesale each tick), so applying one
  // is a straight replace, not a deep merge. ──
  Collab.on('remote-edit', ({ body, patch }) => {
    if(!bodies[body]) return;
    applyingRemote = true;
    try {
      bodies[body].data = JSON.parse(JSON.stringify(patch));
      if(selectedBody === body && typeof fillSidebar === 'function') fillSidebar(body);
      if(typeof drawViewport === 'function') drawViewport();
    } catch(err){
      console.error('[CollabSync] error applying remote edit:', err);
    } finally {
      applyingRemote = false;
    }
  });

  // ── Hook selectBody: request the lock whenever a session is active ──
  const _origSelectBody = selectBody;
  selectBody = function(name){
    const myRole = Collab.isActive() ? Collab.getMyInfo().role : 'manager';
    if(Collab.isActive() && selectedBody && selectedBody !== name && myRole !== 'visitor' && !Collab.isLockedByOther(selectedBody)){
      Collab.releaseLock(selectedBody);
    }
    _origSelectBody(name);
    if(Collab.isActive()){
      if(myRole !== 'visitor') Collab.requestLock(name); // visitors never hold a lock — no point asking, host would reject it anyway
      _refreshLockUI();
      // Covers "add a body, immediately select it" — without this, a
      // brand-new body wouldn't reach the other side until the next 1.2s
      // poll tick, and any edits made in the meantime would be silently
      // dropped on their end since they don't have the body yet at all.
      _checkStructuralChange();
    }
  };

  // ── Hook closeSidebar: release whatever lock we're holding ──
  const _origCloseSidebar = closeSidebar;
  closeSidebar = function(){
    const myRole = Collab.isActive() ? Collab.getMyInfo().role : 'manager';
    if(Collab.isActive() && selectedBody && myRole !== 'visitor' && !Collab.isLockedByOther(selectedBody)){
      Collab.releaseLock(selectedBody);
    }
    _origCloseSidebar();
    // Covers delete specifically — confirmDeleteBody() always closes the
    // sidebar right after removing the body (and its satellites), so this
    // makes deletion propagate immediately instead of waiting on the poll.
    if(Collab.isActive()) _checkStructuralChange();
  };

  // ── Hook _liveSyncNow: broadcast the freshly-rebuilt body data ──
  const _origLiveSyncNow = _liveSyncNow;
  _liveSyncNow = function(){
    _origLiveSyncNow();
    if(applyingRemote) return; // we're the one applying an incoming edit right now — don't echo it back
    if(!Collab.isActive() || !selectedBody) return;
    if(Collab.isLockedByOther(selectedBody)) return; // UI already blocks input here, but never trust that alone
    const b = bodies[selectedBody];
    if(!b) return;
    Collab.broadcastEdit(selectedBody, JSON.parse(JSON.stringify(b.data)));
  };

  // ── Client-side permission guards ──
  // Host-side enforcement in collab.js is the REAL security boundary (a
  // modified/malicious client could ignore anything client-side) — this is
  // purely a UX layer so a blocked action gives an immediate, clear reason
  // instead of silently vanishing after a round-trip to the host and back.
  function _denyIfBelow(minRole, what){
    if(!Collab.isActive()) return false; // solo mode — no restrictions
    const rank = { visitor: 0, member: 1, manager: 2 };
    const myRole = Collab.getMyInfo().role;
    if(rank[myRole] < rank[minRole]){
      alert(`Your role (${myRole}) doesn't allow ${what}.${myRole === 'member' ? ' Ask a manager.' : ''}`);
      return true;
    }
    return false;
  }

  // Delete/clear-all/import-a-system are exactly the "very destructive"
  // actions a 'member' shouldn't be able to do (per the role spec) — a
  // 'visitor' is already blocked from everything via the read-only lock UI
  // above, so this specifically targets the member-but-not-manager gap.
  if(typeof confirmDeleteBody === 'function'){
    const _origConfirmDeleteBody = confirmDeleteBody;
    confirmDeleteBody = function(){
      if(_denyIfBelow('manager', 'deleting bodies')) return;
      _origConfirmDeleteBody();
    };
  }
  if(typeof confirmClearAll === 'function'){
    const _origConfirmClearAll = confirmClearAll;
    confirmClearAll = function(){
      if(_denyIfBelow('manager', 'clearing the system')) return;
      _origConfirmClearAll();
    };
  }
  if(typeof openImportSystemModal === 'function'){
    const _origOpenImportSystemModal = openImportSystemModal;
    openImportSystemModal = function(){
      if(_denyIfBelow('manager', 'loading a different system')) return;
      _origOpenImportSystemModal();
    };
  }

  // ── Hook finaliseRename: rename doesn't close the sidebar (you keep
  // editing the same body under its new name), so closeSidebar's hook
  // above never fires for this — needs its own immediate trigger. ──
  if(typeof finaliseRename === 'function'){
    const _origFinaliseRename = finaliseRename;
    finaliseRename = function(newName){
      _origFinaliseRename(newName);
      if(Collab.isActive()) _checkStructuralChange();
    };
  }

  // ── Hook removeAsset: synchronous (unlike upload, which is async via
  // FileReader and harder to hook at exactly the right completion moment —
  // left to the tightened poll interval instead). Also gated: removal
  // counts as destructive for a 'member', same as body deletion. ──
  if(typeof removeAsset === 'function'){
    const _origRemoveAsset = removeAsset;
    removeAsset = function(safeName, type){
      if(_denyIfBelow('manager', 'deleting assets')) return;
      _origRemoveAsset(safeName, type);
      if(Collab.isActive()) _checkAssetChange();
    };
  }

  // ── Hook preset save/delete for the same reason (save is fine for
  // members — additive, not destructive — only removal is gated) ──
  if(typeof _pgRegisterUserPreset === 'function'){
    const _origRegisterUserPreset = _pgRegisterUserPreset;
    _pgRegisterUserPreset = function(name, data, category, typeOverride){
      _origRegisterUserPreset(name, data, category, typeOverride);
      if(Collab.isActive()) _checkPresetChange();
    };
  }
  if(typeof pgPresetsRemove === 'function'){
    const _origPgPresetsRemove = pgPresetsRemove;
    pgPresetsRemove = function(name){
      if(_denyIfBelow('manager', 'deleting presets')) return;
      _origPgPresetsRemove(name);
      if(Collab.isActive()) _checkPresetChange();
    };
  }

  // Re-apply the lock UI whenever the sidebar visibly opens/closes, in case
  // something outside our hooks changed selectedBody (undo, delete, etc.)
  Collab.on('hosted', _refreshLockUI);
  Collab.on('role-changed', _refreshLockUI);

  // ── Main-menu button label ──
  // goStart() already swaps "CREATE NEW SYSTEM" -> "RESUME SESSION" when
  // `bodies` isn't empty, but that's solo-session language and only gets
  // (re-)evaluated when goStart() itself runs (navigating TO the start
  // screen). A peer who joins WHILE ALREADY on that screen never
  // re-triggers it — bodies populate via state-sync, but the button stays
  // stuck on stale text ("CREATE NEW SYSTEM") with nothing indicating the
  // connection/sync actually succeeded. Fixed two ways: a distinct label
  // for the multiplayer case, and re-applying it right after a successful
  // join/host rather than only when goStart() happens to run.
  function _refreshStartLabelForMultiplayer(){
    if(!Collab.isActive()) return;
    const lbl  = document.getElementById('btn-new-label');
    const mico = document.getElementById('btn-new-mico');
    const btn  = document.getElementById('btn-new-system');
    if(lbl)  lbl.textContent  = 'ENTER SYNCED SESSION';
    if(mico) mico.innerHTML = '<svg class="icon"><use href="#icon-repeat"></use></svg>';
    if(btn){ btn.style.borderColor = 'rgba(48,224,144,.45)'; btn.style.color = 'var(--jade)'; }
  }

  if(typeof goStart === 'function'){
    const _origGoStart = goStart;
    goStart = function(){
      _origGoStart();
      _refreshStartLabelForMultiplayer(); // no-op if not in a session
    };
  }

  Collab.on('state-sync', () => _refreshStartLabelForMultiplayer()); // peer just joined + synced
  Collab.on('hosted',     () => _refreshStartLabelForMultiplayer()); // host just started hosting
  Collab.on('left', () => {
    // Back to solo semantics — re-run goStart()'s own logic if the start
    // screen happens to be the one currently visible, so the label reflects
    // the (untouched-during-the-session) solo undoStack/bodies state again.
    const startScreen = document.getElementById('s-start');
    if(typeof goStart === 'function' && startScreen && !startScreen.classList.contains('hide')) goStart();
  });
})();
