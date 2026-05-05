/**
 * timer.js — Countdown timer
 */

const Timer = (() => {
  let _remaining = 0;
  let _interval  = null;
  let _onTick    = null;
  let _onExpire  = null;
  let _startedAt = null;
  let _initialDuration = 0;

  const WARN_THRESHOLD   = 30 * 60; // 30 min
  const DANGER_THRESHOLD = 5  * 60; // 5 min

  function formatTime(secs) {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function start(durationSecs, onTick, onExpire) {
    stop();
    _onTick    = onTick;
    _onExpire  = onExpire;
    _initialDuration = durationSecs;
    _startedAt = Date.now();

    // Restore remaining from localStorage if exam was paused
    const saved = localStorage.getItem('examcbt_timer');
    if (saved) {
      const s = JSON.parse(saved);
      // Calculate elapsed since saved
      const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
      _remaining = Math.max(0, s.remaining - elapsed);
    } else {
      _remaining = durationSecs;
    }

    _tick();
    _interval = setInterval(_tick, 1000);
  }

  function _tick() {
    _remaining = Math.max(0, _remaining);
    const display = document.getElementById('timer-display');
    const block   = document.getElementById('timer-block');

    if (display) display.textContent = formatTime(_remaining);

    if (block) {
      block.classList.remove('warning', 'danger');
      if (_remaining <= DANGER_THRESHOLD)       block.classList.add('danger');
      else if (_remaining <= WARN_THRESHOLD)    block.classList.add('warning');
    }

    _onTick?.(_remaining);

    // Save to localStorage
    try {
      localStorage.setItem('examcbt_timer', JSON.stringify({
        remaining: _remaining,
        savedAt: Date.now(),
      }));
    } catch (_) {}

    if (_remaining <= 0) {
      stop();
      _onExpire?.();
    } else {
      _remaining--;
    }
  }

  function stop() {
    if (_interval) { clearInterval(_interval); _interval = null; }
  }

  function reset() {
    stop();
    _remaining = 0;
    localStorage.removeItem('examcbt_timer');
  }

  function getRemaining() { return _remaining; }
  function getElapsed()   { return _startedAt ? Math.floor((Date.now() - _startedAt) / 1000) : 0; }

  return { start, stop, reset, formatTime, getRemaining, getElapsed };
})();
