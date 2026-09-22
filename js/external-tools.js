// ════════════════════════════════════════════════════════════════════
//  EXTERNAL TOOLS  —  generic modal wrapper for standalone texture
//  tools (Cloud / Ring / Gas Giant / Polar Transformer generators).
//  Each tool ships as its own self-contained HTML file under tools/
//  and is loaded untouched in an <iframe>, so its internal logic is
//  never modified — only wrapped in the app's standard header chrome.
// ════════════════════════════════════════════════════════════════════

const ET = (() => {

  let _el = {}; // populated in _build()

  function _build(){
    const ov = document.createElement('div');
    ov.id = 'et-overlay';
    ov.className = 'tc-overlay';
    ov.innerHTML = `
<div class="tc-window">
  <div class="tc-header">
    <div class="tc-header-left">
      <button class="tc-back-btn" id="et-back">‹ BACK</button>
      <span class="tc-title"><span class="tc-title-accent">✦</span><span id="et-title"></span></span>
    </div>
  </div>
  <div class="et-body">
    <iframe class="et-iframe" id="et-iframe" title="External texture tool"></iframe>
  </div>
</div>`;
    document.body.appendChild(ov);
    _el.overlay = ov;
    _el.iframe  = ov.querySelector('#et-iframe');
    _el.titleEl = ov.querySelector('#et-title');
    ov.querySelector('#et-back').addEventListener('click', close);
  }

  function open(url, title){
    if(!_el.overlay) _build();
    _el.titleEl.textContent = title || 'TOOL';
    // Reset src each time so the tool reloads fresh (clears its state)
    _el.iframe.src = url;
    _el.overlay.classList.add('open');
  }

  function close(){
    if(!_el.overlay) return;
    _el.overlay.classList.remove('open');
    // Drop the iframe content once closed so a running generator
    // (animation loops, timers) doesn't keep working in the background.
    _el.iframe.src = 'about:blank';
  }

  return { open, close };
})();
