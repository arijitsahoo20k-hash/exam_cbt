/**
 * anti-cheat.js — Anti-cheating measures for the exam screen
 *
 * Features:
 *  1. Tab-switch / window-blur detection → overlay + countdown
 *  2. Right-click disabled on exam screen
 *  3. Screenshot / PrintScreen key blocked
 *  4. Copy/Paste disabled on exam screen
 *  5. Developer tools detection (size-based heuristic)
 *  6. Fullscreen exit warning & re-prompt
 *  7. Violation log shown to candidate
 *  8. Max violations → forced auto-submit
 */

const AntiCheat = (() => {
  let _active = false;
  let _violations = 0;
  let _overlayTimer = null;
  let _pendingCountdown = null;
  const MAX_VIOLATIONS = 5;
  const REENTRY_DELAY_SECS = 5; // seconds before exam resumes after tab switch

  // ── DOM refs (created lazily) ─────────────────────────────
  function _overlay()   { return document.getElementById('anti-cheat-overlay'); }
  function _banner()    { return document.getElementById('ac-warning-banner'); }
  function _logEl()     { return document.getElementById('ac-violation-log'); }
  function _countdown() { return document.getElementById('ac-countdown'); }

  // ── Activate (call when exam starts) ─────────────────────
  function activate() {
    _active = true;
    _violations = 0;
    _updateLog();
  }

  // ── Deactivate (call when exam ends / submitted) ──────────
  function deactivate() {
    _active = false;
    _hideOverlay();
    _hideBanner();
    if (_overlayTimer) { clearInterval(_overlayTimer); _overlayTimer = null; }
    if (_pendingCountdown) { clearTimeout(_pendingCountdown); _pendingCountdown = null; }
  }

  // ── Tab / Window blur ─────────────────────────────────────
  function _onVisibilityChange() {
    if (!_active) return;
    if (document.hidden) {
      _recordViolation('Tab switch / window hidden');
      _showOverlay('tab-switch');
    } else {
      if (_overlay()?.classList.contains('visible') && _overlayTimer) return;
      // Resumes automatically when overlay countdown finishes
    }
  }

  function _onWindowBlur() {
    if (!_active) return;
    // Only trigger if the exam screen is active
    if (!document.getElementById('screen-exam')?.classList.contains('active')) return;
    _recordViolation('Window lost focus');
    _showOverlay('window-blur');
  }

  // ── Fullscreen change ─────────────────────────────────────
  function _onFullscreenChange() {
    if (!_active) return;
    if (!document.fullscreenElement) {
      _recordViolation('Exited fullscreen');
      _showBanner('⚠ You exited fullscreen! Click here to re-enter fullscreen.', true);
    }
  }

  // ── Overlay logic ─────────────────────────────────────────
  function _showOverlay(reason) {
    const overlay = _overlay();
    if (!overlay) return;
    if (_overlayTimer) { clearInterval(_overlayTimer); _overlayTimer = null; }

    let secs = REENTRY_DELAY_SECS;
    const cdEl = _countdown();
    if (cdEl) cdEl.textContent = secs;

    overlay.classList.add('visible');

    _overlayTimer = setInterval(() => {
      secs--;
      if (cdEl) cdEl.textContent = secs;
      if (secs <= 0) {
        clearInterval(_overlayTimer);
        _overlayTimer = null;
        _hideOverlay();
        // Re-request fullscreen
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    }, 1000);
  }

  function _hideOverlay() {
    _overlay()?.classList.remove('visible');
  }

  // ── Banner logic ──────────────────────────────────────────
  function _showBanner(msg, clickToFullscreen) {
    const banner = _banner();
    if (!banner) return;
    banner.textContent = msg;
    banner.classList.add('visible');
    if (clickToFullscreen) {
      banner.style.cursor = 'pointer';
      banner.onclick = () => {
        document.documentElement.requestFullscreen?.().catch(() => {});
        _hideBanner();
      };
    }
    setTimeout(_hideBanner, 6000);
  }

  function _hideBanner() {
    _banner()?.classList.remove('visible');
  }

  // ── Violation tracking ────────────────────────────────────
  function _recordViolation(reason) {
    _violations++;
    _updateLog();
    console.warn(`[AntiCheat] Violation #${_violations}: ${reason}`);

    if (_violations >= MAX_VIOLATIONS) {
      setTimeout(() => {
        if (typeof _submitExamCallback === 'function') {
          Toast?.show?.('⚠ Max violations reached. Auto-submitting!', 'error', 5000);
          setTimeout(_submitExamCallback, 3000);
        }
      }, 500);
    }
  }

  function _updateLog() {
    const el = _logEl();
    if (!el) return;
    if (_violations === 0) {
      el.classList.remove('visible');
      return;
    }
    el.classList.add('visible');
    el.textContent = `⚠ Violations: ${_violations}/${MAX_VIOLATIONS}`;
    if (_violations >= MAX_VIOLATIONS - 1) {
      el.style.background = 'rgba(239,68,68,0.25)';
      el.style.fontWeight = '700';
    }
  }

  // ── Key blocking ──────────────────────────────────────────
  function _onKeyDown(e) {
    if (!_active) return;
    const examActive = document.getElementById('screen-exam')?.classList.contains('active');
    if (!examActive) return;

    // Block PrintScreen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      _recordViolation('Screenshot attempt (PrintScreen)');
      _showBanner('⚠ Screenshots are not allowed during the exam!');
      return;
    }

    // Block F12 (DevTools)
    if (e.key === 'F12') {
      e.preventDefault();
      _recordViolation('DevTools attempt (F12)');
      return;
    }

    // Block Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+U (DevTools / View Source)
    if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) {
      e.preventDefault();
      _recordViolation('DevTools shortcut');
      return;
    }
    if (e.ctrlKey && e.key.toUpperCase() === 'U') {
      e.preventDefault();
      return;
    }

    // Block Ctrl+C / Ctrl+A (copy / select all)
    if (e.ctrlKey && ['C', 'A', 'S'].includes(e.key.toUpperCase())) {
      e.preventDefault();
      return;
    }
  }

  // ── Context menu ──────────────────────────────────────────
  function _onContextMenu(e) {
    if (!_active) return;
    if (document.getElementById('screen-exam')?.classList.contains('active')) {
      e.preventDefault();
    }
  }

  // ── Submit callback ───────────────────────────────────────
  let _submitExamCallback = null;
  function setSubmitCallback(fn) { _submitExamCallback = fn; }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    document.addEventListener('visibilitychange', _onVisibilityChange);
    window.addEventListener('blur', _onWindowBlur);
    document.addEventListener('fullscreenchange', _onFullscreenChange);
    document.addEventListener('keydown', _onKeyDown);
    document.addEventListener('contextmenu', _onContextMenu);
  }

  function getViolations() { return _violations; }

  return { init, activate, deactivate, setSubmitCallback, getViolations };
})();
