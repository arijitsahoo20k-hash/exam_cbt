/**
 * app.js — ExamCBT Main Orchestrator
 */

(async function init() {

  // ── Theme ──────────────────────────────────────────────────
  (function initTheme() {
    const saved = localStorage.getItem('examcbt_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const btn = document.getElementById('btn-theme-toggle');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  })();
  document.getElementById('btn-theme-toggle')?.addEventListener('click', () => {
    const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('examcbt_theme', next);
    document.getElementById('btn-theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // ── Anti-Cheat + Submit callback ───────────────────────────
  AntiCheat.init();
  AntiCheat.setSubmitCallback(() => _submitExam());

  // ── Loading sequence ───────────────────────────────────────
  const loaderFill   = document.querySelector('.loader-fill');
  const loaderStatus = document.getElementById('loader-status');
  function setLoad(pct, msg) {
    if (loaderFill)   loaderFill.style.width = pct + '%';
    if (loaderStatus) loaderStatus.textContent = msg;
  }

  setLoad(10, 'Starting up…');
  await delay(120);

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('/sw.js'); setLoad(25, 'Service worker ready…'); }
    catch (e) { console.warn('SW:', e); }
  }
  await delay(80);

  setLoad(50, 'Restoring session…');
  const user = Auth.init();
  await delay(100);

  setLoad(75, 'Binding events…');
  try {
    Auth.bindEvents();
    UI.bindExamEvents();
    Result.bindEvents();
    Review.bindEvents();
    Debug.init();
    _bindDashboardEvents();
    _bindSetupEvents();
    _bindSubmitModal();
    _bindFullscreenLock();
    _bindZoomModal();
  } catch (e) {
    console.error('[ExamCBT] Binding error:', e);
    if (loaderStatus) loaderStatus.textContent = 'Error: ' + e.message;
  }

  // Reload history after exam submission
  document.addEventListener('exam:completed', () => {
    const u = Auth.getUser();
    if (u && !_isGuest(u)) {
      const ft = document.getElementById('history-filter-tabs');
      if (ft) ft.innerHTML = '';
      _loadHistory();
    }
  });

  // Reload history when going back to dashboard
  document.addEventListener('result:dashboard', () => {
    const ft = document.getElementById('history-filter-tabs');
    if (ft) ft.innerHTML = '';
    _loadHistory();
  });

  // Reload history after login
  document.addEventListener('auth:login', () => {
    const ft = document.getElementById('history-filter-tabs');
    if (ft) ft.innerHTML = '';
    _loadHistory();
    _populateMocksGrid();
  });

  await delay(100);
  setLoad(100, 'Ready!');
  await delay(300);

  window.addEventListener('beforeunload', (e) => {
    if (document.getElementById('screen-exam').classList.contains('active') && !ExamEngine.isSubmitted()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // ── Initial screen ─────────────────────────────────────────
  if (user) {
    UI.showScreen('dashboard');
    _loadHistory();
  } else {
    UI.showScreen('auth');
  }
  _populateMocksGrid();

})();

// ════════════════════════════════════════════════════════════
// LOCAL HISTORY — localStorage
// ════════════════════════════════════════════════════════════

const LocalHistory = (() => {
  const KEY = 'examcbt_history';

  function _getAll() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
  }

  function saveAttempt(attempt, responses) {
    const all = _getAll();
    const entry = {
      ...attempt,
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      responses: responses || [],
      created_at: attempt.created_at || new Date().toISOString(),
    };
    all.unshift(entry);
    if (all.length > 50) all.length = 50;
    localStorage.setItem(KEY, JSON.stringify(all));
    return entry;
  }

  function getUserAttempts(userId) {
    return _getAll().filter(a => a.user_id === userId);
  }

  function getAttemptResponses(attemptId) {
    const all = _getAll();
    const entry = all.find(a => a.id === attemptId);
    return entry?.responses || [];
  }

  return { saveAttempt, getUserAttempts, getAttemptResponses };
})();

// ════════════════════════════════════════════════════════════
// BITSAT MOCKS
// ════════════════════════════════════════════════════════════

const BITSAT_MOCKS = [
  { id: 1,  name: 'BITSAT Mock 1',  file: 'BITSAT-1.zip'  },
  { id: 3,  name: 'BITSAT Mock 3',  file: 'BITSAT-3.zip'  },
  { id: 4,  name: 'BITSAT Mock 4',  file: 'BITSAT-4.zip'  },
  { id: 5,  name: 'BITSAT Mock 5',  file: 'BITSAT-5.zip'  },
  { id: 6,  name: 'BITSAT Mock 6',  file: 'BITSAT-6.zip'  },
  { id: 7,  name: 'BITSAT Mock 7',  file: 'BITSAT-7.zip'  },
  { id: 8,  name: 'BITSAT Mock 8',  file: 'BITSAT-8.zip'  },
  { id: 9,  name: 'BITSAT Mock 9',  file: 'BITSAT-9.zip'  },
  { id: 10, name: 'BITSAT Mock 10', file: 'BITSAT-10.zip' },
  { id: 11, name: 'BITSAT Mock 11', file: 'BITSAT-11.zip' },
  { id: 12, name: 'BITSAT Mock 12', file: 'BITSAT-12.zip' },
  { id: 13, name: 'BITSAT Mock 13', file: 'BITSAT-13.zip' },
  { id: 14, name: 'BITSAT Mock 14', file: 'BITSAT-14.zip' },
  { id: 15, name: 'BITSAT Mock 15', file: 'BITSAT-15.zip' },
];

function _populateMocksGrid() {
  const grid = document.getElementById('mocks-grid');
  if (!grid) return;
  grid.innerHTML = '';
  BITSAT_MOCKS.forEach((mock, index) => {
    const card = document.createElement('div');
    card.className = 'mock-card';
    card.style.animationDelay = `${index * 50}ms`;
    card.innerHTML = `
      <div class="mock-card-num">Mock #${mock.id}</div>
      <div class="mock-card-name">${mock.name}</div>
      <div class="mock-card-meta">
        <span class="mock-pill">130 Qs</span>
        <span class="mock-pill">3 hrs</span>
        <span class="mock-pill">+3/−1</span>
      </div>
      <svg class="mock-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    `;
    card.addEventListener('click', () => _loadBitsatMock(mock));
    grid.appendChild(card);
  });
}

async function _loadBitsatMock(mock) {
  const grid  = document.getElementById('mocks-grid');
  const cards = grid.querySelectorAll('.mock-card');
  cards.forEach(c => c.style.pointerEvents = 'none');

  const toast = _showLoadingToast(`Loading ${mock.name}…`);

  try {
    const response = await fetch(mock.file);
    if (!response.ok) throw new Error(
      `Could not fetch ${mock.file} (HTTP ${response.status}).\n` +
      'Make sure all BITSAT-*.zip files are in the same folder as index.html.'
    );
    const buf  = await response.arrayBuffer();
    const file = new File([buf], mock.file, { type: 'application/zip' });

    toast.update('Processing questions…');

    const examData = await ZipProcessor.processZip(file, (pct, msg) => toast.update(msg));
    examData.examName = mock.name;
    window._currentExamData = examData;
    Debug.setInfo(examData.debugInfo);

    if (examData.debugInfo.warnings.length > 0) {
      Toast.show(`⚠ ${examData.debugInfo.warnings[0]}`, 'warning', 5000);
    }

    toast.remove();
    cards.forEach(c => c.style.pointerEvents = '');
    UI.populateSetup(examData);
    UI.showScreen('setup');

  } catch (e) {
    toast.remove();
    cards.forEach(c => c.style.pointerEvents = '');
    _showError(e.message);
    console.error(e);
  }
}

// ════════════════════════════════════════════════════════════
// FULLSCREEN LOCK
// ════════════════════════════════════════════════════════════

function _bindFullscreenLock() {
  const overlay    = document.getElementById('fs-lock-overlay');
  const reenterBtn = document.getElementById('fs-reenter-btn');

  document.addEventListener('fullscreenchange', () => {
    if (!document.getElementById('screen-exam').classList.contains('active')) return;
    if (!document.fullscreenElement) {
      overlay.hidden = false;
      overlay.style.zIndex = '99999';
    } else {
      overlay.hidden = true;
    }
  });

  reenterBtn?.addEventListener('click', () => {
    document.documentElement.requestFullscreen().then(() => {
      overlay.hidden = true;
    }).catch(() => {
      Toast.show('Please allow fullscreen access to continue the exam.', 'error');
    });
  });

  document.addEventListener('keydown', (e) => {
    if (document.getElementById('screen-exam').classList.contains('active') && e.key === 'Escape') {
      e.stopPropagation();
    }
  }, true);
}

// ════════════════════════════════════════════════════════════
// ZOOM MODAL
// ════════════════════════════════════════════════════════════

function _bindZoomModal() {
  document.getElementById('zoom-close')?.addEventListener('click', () => {
    document.getElementById('zoom-modal').hidden = true;
  });
  document.getElementById('zoom-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('zoom-modal')) {
      document.getElementById('zoom-modal').hidden = true;
    }
  });
}

// ════════════════════════════════════════════════════════════
// DASHBOARD EVENTS
// ════════════════════════════════════════════════════════════

function _bindDashboardEvents() {
  const zone   = document.getElementById('upload-zone');
  const input  = document.getElementById('zip-input');
  const browse = document.getElementById('upload-browse');

  browse?.addEventListener('click', (e) => { e.stopPropagation(); input?.click(); });
  zone?.addEventListener('click', () => input?.click());
  zone?.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone?.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone?.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) _handleZipFile(e.dataTransfer.files[0]);
  });
  input?.addEventListener('change', () => {
    if (input.files[0]) _handleZipFile(input.files[0]);
    input.value = '';
  });
}

async function _handleZipFile(file) {
  if (!file.name.endsWith('.zip')) {
    Toast.show('Please upload a .zip file', 'error'); return;
  }

  UI.showUploadProgress(true);
  UI.setUploadProgress(0, 'Starting…');

  try {
    const examData = await ZipProcessor.processZip(file, (pct, msg) => {
      UI.setUploadProgress(pct, msg);
    });

    window._currentExamData = examData;
    Debug.setInfo(examData.debugInfo);

    if (examData.debugInfo.warnings.length > 0) {
      Toast.show(`⚠ ${examData.debugInfo.warnings[0]}`, 'warning', 5000);
    }

    const fmt = examData.format;
    if (fmt && fmt !== 'BITSAT') {
      Toast.show(`✓ Detected format: ${fmt} — ${examData.allQuestions.length} questions loaded`, 'success', 4000);
    }

    UI.showUploadProgress(false);
    UI.populateSetup(examData);
    UI.showScreen('setup');

  } catch (e) {
    UI.showUploadProgress(false);
    _showError(e.message);
    console.error(e);
  }
}

// ════════════════════════════════════════════════════════════
// HISTORY
// ════════════════════════════════════════════════════════════

function _isGuest(user) {
  return !user || user.isGuest === true || user.id?.startsWith('guest_');
}

// Whether to use local storage for this user (local accounts + no-Supabase setups)
function _isLocalUser(user) {
  return user.id?.startsWith('local_') || !SupabaseClient.isConfigured();
}

function _getSolutionPdf(examName) {
  if (!examName) return null;
  const m = examName.match(/bitsat[\s\-]+mock[\s\-]+(\d+)/i)
         || examName.match(/bitsat[\s\-]+(\d+)/i);
  if (m) return 'BITSAT-' + m[1] + '-SOL.pdf';
  return null;
}

async function _loadHistory(filterFn) {
  const user = Auth.getUser();

  // Show sign-in prompt for guests
  if (_isGuest(user)) {
    const grid = document.getElementById('attempts-grid');
    if (grid) grid.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">🔒</div>
        <div class="history-empty-title">Sign in to view history</div>
        <div class="history-empty-sub">Create an account or sign in to track your attempts.</div>
      </div>`;
    return;
  }

  const noticeEl    = document.getElementById('supabase-notice');
  const attemptsGrid = document.getElementById('attempts-grid');
  if (noticeEl) noticeEl.hidden = true;

  // ── Fetch attempts ────────────────────────────────────────
  let attempts = [];
  if (_isLocalUser(user)) {
    // Local/offline user — always read from localStorage
    attempts = LocalHistory.getUserAttempts(user.id);
  } else {
    // Supabase user — fetch from cloud, then merge any local fallback entries
    attempts = await SupabaseClient.getUserAttempts(user.id);
    const localAttempts = LocalHistory.getUserAttempts(user.id);
    const cloudIds = new Set(attempts.map(a => a.id));
    localAttempts.forEach(a => { if (!cloudIds.has(a.id)) attempts.push(a); });
    attempts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  if (!attempts || attempts.length === 0) {
    document.getElementById('history-summary').innerHTML = '';
    document.getElementById('history-filter-tabs').innerHTML = '';
    attemptsGrid.innerHTML = `
      <div class="history-empty">
        <div class="history-empty-icon">📋</div>
        <div class="history-empty-title">No attempts yet</div>
        <div class="history-empty-sub">Complete an exam to see your history here.</div>
      </div>`;
    return;
  }

  // ── Summary stats ─────────────────────────────────────────
  const summaryEl = document.getElementById('history-summary');
  if (summaryEl && !filterFn) {
    const best      = Math.max(...attempts.map(a => a.max_score > 0 ? Math.round(a.score / a.max_score * 100) : 0));
    const avgPct    = Math.round(attempts.reduce((s, a) => s + (a.max_score > 0 ? a.score / a.max_score * 100 : 0), 0) / attempts.length);
    const totalTime = attempts.reduce((s, a) => s + (a.time_taken || 0), 0);
    summaryEl.innerHTML = `
      <div class="hist-summary-item"><span class="hist-sum-val">${attempts.length}</span><span class="hist-sum-label">Attempts</span></div>
      <div class="hist-summary-item"><span class="hist-sum-val" style="color:var(--green)">${best}%</span><span class="hist-sum-label">Best Score</span></div>
      <div class="hist-summary-item"><span class="hist-sum-val" style="color:var(--blue)">${avgPct}%</span><span class="hist-sum-label">Average</span></div>
      <div class="hist-summary-item"><span class="hist-sum-val">${_formatSeconds(totalTime)}</span><span class="hist-sum-label">Total Time</span></div>
    `;

    // ── Filter tabs ───────────────────────────────────────
    const filterEl = document.getElementById('history-filter-tabs');
    if (filterEl && filterEl.children.length === 0) {
      const filters = [
        ['All', null],
        ['≥ 70%', a => (a.score / a.max_score * 100) >= 70],
        ['40–70%', a => { const p = a.score / a.max_score * 100; return p >= 40 && p < 70; }],
        ['< 40%', a => (a.score / a.max_score * 100) < 40],
      ];
      filters.forEach(([label, fn], i) => {
        const btn = document.createElement('button');
        btn.className = 'history-filter-btn' + (i === 0 ? ' active' : '');
        btn.textContent = i === 0 ? `All (${attempts.length})` : label;
        btn.addEventListener('click', () => {
          filterEl.querySelectorAll('.history-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          _loadHistory(fn || undefined);
        });
        filterEl.appendChild(btn);
      });
    }
  }

  // ── Attempt cards ─────────────────────────────────────────
  const displayAttempts = filterFn ? attempts.filter(filterFn) : attempts;
  attemptsGrid.innerHTML = '';

  if (displayAttempts.length === 0) {
    attemptsGrid.innerHTML = `<div class="history-empty" style="grid-column:1/-1">
      <div class="history-empty-icon">🔍</div>
      <div class="history-empty-title">No matches</div>
      <div class="history-empty-sub">Try a different filter.</div>
    </div>`;
    return;
  }

  displayAttempts.forEach((attempt, cardIndex) => {
    const date = new Date(attempt.created_at).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
    const time = new Date(attempt.created_at).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit',
    });

    const pct          = attempt.max_score > 0 ? Math.max(0, Math.round((attempt.score / attempt.max_score) * 100)) : 0;
    const barColor     = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--blue)' : 'var(--red)';
    const timeTakenStr = attempt.time_taken ? _formatSeconds(attempt.time_taken) : '—';
    const rank         = pct >= 70 ? '🏆' : pct >= 50 ? '🥈' : pct >= 35 ? '🥉' : '📝';
    const solutionPdf  = _getSolutionPdf(attempt.exam_name || '');

    const card = document.createElement('div');
    card.className = 'attempt-card-v2';
    card.style.animationDelay = `${cardIndex * 40}ms`;
    card.innerHTML = `
      <div class="acv2-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:20px;line-height:1">${rank}</span>
          <div>
            <div class="acv2-name">${attempt.exam_name || 'Exam'}</div>
            <div class="acv2-date">${date} · ${time}</div>
          </div>
        </div>
        <div class="acv2-score-pct" style="color:${barColor}">${pct}%</div>
      </div>
      <div class="acv2-bar-wrap" style="margin:8px 0 2px"><div class="acv2-bar" style="width:0%;background:${barColor}"></div></div>
      <div class="acv2-score-row" style="margin-bottom:10px">
        <div><span class="acv2-score-val">${attempt.score}</span><span class="acv2-score-max"> / ${attempt.max_score} marks</span></div>
        <span class="acv2-stat">⏱ ${timeTakenStr}</span>
      </div>
      <div class="acv2-stats">
        <span class="acv2-stat correct">✓ ${attempt.correct} correct</span>
        <span class="acv2-stat wrong">✗ ${attempt.wrong} wrong</span>
        <span class="acv2-stat skipped">— ${attempt.unattempted} skipped</span>
        <span class="acv2-stat" style="margin-left:auto">Accuracy: <strong>${attempt.accuracy || 0}%</strong></span>
      </div>
      <div class="acv2-footer">
        <button class="acv2-review-btn" data-id="${attempt.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Review Answers
        </button>
        ${solutionPdf ? `<a class="acv2-pdf-btn" href="${solutionPdf}" target="_blank" rel="noopener">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          Solutions PDF
        </a>` : ''}
      </div>
    `;
    attemptsGrid.appendChild(card);

    setTimeout(() => {
      const bar = card.querySelector('.acv2-bar');
      if (bar) { bar.style.transition = 'width 0.8s ease'; bar.style.width = pct + '%'; }
    }, 100 + cardIndex * 40);

    card.querySelector('.acv2-review-btn').addEventListener('click', async () => {
      const btn      = card.querySelector('.acv2-review-btn');
      const origHTML = btn.innerHTML;
      btn.innerHTML  = `<span style="display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle"></span> Loading…`;
      btn.disabled   = true;
      try {
        let responses;
        // Always use localStorage for local users, even if Supabase is configured
        if (_isLocalUser(user) || attempt.id?.startsWith('local_')) {
          responses = LocalHistory.getAttemptResponses(attempt.id);
        } else {
          responses = await SupabaseClient.getAttemptResponses(attempt.id);
        }
        if (!responses || responses.length === 0) {
          Toast.show('No per-question data found for this attempt.', 'warning', 5000);
          btn.disabled = false; btn.innerHTML = origHTML; return;
        }
        await Review.openFromHistory(attempt, responses);
      } catch (e) {
        Toast.show(`Error loading responses: ${e.message}`, 'error');
        btn.disabled = false; btn.innerHTML = origHTML;
      }
    });
  });
}

// ════════════════════════════════════════════════════════════
// SETUP EVENTS
// ════════════════════════════════════════════════════════════

function _bindSetupEvents() {
  document.getElementById('btn-back-dashboard')?.addEventListener('click', () => {
    UI.showScreen('dashboard');
  });

  document.getElementById('btn-start-exam')?.addEventListener('click', async () => {
    const examData = window._currentExamData;
    if (!examData) { Toast.show('No exam loaded', 'error'); return; }

    ExamEngine.load(examData);
    document.getElementById('exam-title-bar').textContent  = examData.examName || 'Exam';
    document.getElementById('exam-candidate').textContent  = Auth.getUser()?.name || 'Candidate';

    UI.buildSectionTabs();
    UI.buildPalette();
    UI.renderCurrentQuestion();
    UI.syncSectionTab(0);
    UI.showScreen('exam');

    Timer.start(ExamEngine.getDuration(), null, () => {
      Toast.show('Time is up! Submitting…', 'warning', 4000);
      setTimeout(() => _submitExam(), 2000);
    });

    try {
      await document.documentElement.requestFullscreen();
    } catch (e) {
      Toast.show('⚠ Please allow fullscreen for exam integrity.', 'warning', 5000);
    }

    AntiCheat.activate();
    Toast.show('Exam started. Good luck! 🎯', 'success');
  });
}

// ════════════════════════════════════════════════════════════
// SUBMIT MODAL
// ════════════════════════════════════════════════════════════

function _bindSubmitModal() {
  document.getElementById('btn-submit-exam')?.addEventListener('click', _openSubmitModal);
  document.getElementById('btn-cancel-submit')?.addEventListener('click', () => {
    document.getElementById('submit-modal').hidden = true;
  });
  document.getElementById('btn-confirm-submit')?.addEventListener('click', () => {
    document.getElementById('submit-modal').hidden = true;
    _submitExam();
  });
  document.getElementById('submit-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('submit-modal'))
      document.getElementById('submit-modal').hidden = true;
  });
}

function _openSubmitModal() {
  const stats    = ExamEngine.getStats();
  const total    = ExamEngine.getAllQuestions().length;
  const answered = stats.answered + stats.markedAnswered;
  document.getElementById('modal-stats').innerHTML = `
    <div class="modal-stat"><span>✅</span> Answered: <strong>${answered}</strong></div>
    <div class="modal-stat"><span>❌</span> Not Answered: <strong>${stats.notAnswered + stats.notVisited}</strong></div>
    <div class="modal-stat"><span>🔖</span> Marked: <strong>${stats.marked}</strong></div>
    <div class="modal-stat"><span>📋</span> Total: <strong>${total}</strong></div>
  `;
  document.getElementById('submit-modal').hidden = false;
}

// ════════════════════════════════════════════════════════════
// SUBMIT EXAM
// ════════════════════════════════════════════════════════════

function _submitExam() {
  Timer.stop();
  AntiCheat.deactivate();
  ExamEngine.markSubmitted();
  const results = ExamEngine.calculate();

  document.getElementById('fs-lock-overlay').hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  Result.show(results).catch((err) => {
    console.error('[ExamCBT] Result.show failed:', err);
  });
}

// ════════════════════════════════════════════════════════════
// UTILITY
// ════════════════════════════════════════════════════════════

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function _formatSeconds(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function _showError(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast error';
  el.style.cssText = 'white-space:pre-wrap;max-width:420px;font-size:13px;line-height:1.5';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0'; el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 300);
  }, 8000);
}

function _showLoadingToast(msg) {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.cssText = 'display:flex;align-items:center;gap:10px;min-width:260px';
  el.innerHTML = `
    <div style="width:14px;height:14px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite;flex-shrink:0"></div>
    <span>${msg}</span>
  `;
  container.appendChild(el);
  return {
    update(newMsg) { el.querySelector('span').textContent = newMsg; },
    remove() { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); },
  };
}
