/**
 * ui.js — Screen management + question rendering + palette
 */

const UI = (() => {

  // ── Screen Management ─────────────────────────────────────
  function showScreen(name) {
    const target = document.getElementById(`screen-${name}`);
    document.querySelectorAll('.screen').forEach(s => {
      if (s === target) return;          // leave target alone until active is set
      s.classList.remove('active');
      s.style.display = 'none';          // explicitly hide non-target screens
    });
    if (target) {
      target.style.display = '';         // clear any inline override first
      target.classList.add('active');    // then let CSS .screen.active take over
    }
  }

  // ── Loading Screen ────────────────────────────────────────
  function setLoading(pct, msg) {
    const fill   = document.getElementById('loader-fill') || document.querySelector('.upload-fill');
    const status = document.getElementById('loader-status');
    if (fill)   { fill.style.width = pct + '%'; }
    if (status) { status.textContent = msg; }
  }

  // ── Upload Progress ───────────────────────────────────────
  function showUploadProgress(visible) {
    document.getElementById('upload-progress').hidden = !visible;
  }

  function setUploadProgress(pct, msg) {
    const fill = document.getElementById('upload-fill');
    const stat = document.getElementById('upload-status');
    if (fill) fill.style.width = pct + '%';
    if (stat) stat.textContent = msg;
  }

  // ── Setup Screen ──────────────────────────────────────────
  function populateSetup(examData) {
    const total = examData.allQuestions.length;
    const sections = examData.sections;

    document.getElementById('setup-title').textContent = examData.examName || 'Exam';

    const statsEl = document.getElementById('setup-stats');
    statsEl.innerHTML = `
      <div class="stat-item"><div class="sval">${total}</div><div class="slabel">Questions</div></div>
      <div class="stat-item"><div class="sval">${sections.length}</div><div class="slabel">Sections</div></div>
      <div class="stat-item"><div class="sval">${Timer.formatTime(examData.duration || APP_CONFIG.EXAM_DURATION_SECONDS)}</div><div class="slabel">Duration</div></div>
    `;
  }

  // ── Section Tabs ──────────────────────────────────────────
  function buildSectionTabs() {
    const container = document.getElementById('section-tabs');
    container.innerHTML = '';
    ExamEngine.getSections().forEach((sec, idx) => {
      const btn = document.createElement('button');
      btn.className = 'section-tab' + (idx === 0 ? ' active' : '');
      btn.textContent = sec.name;
      btn.dataset.idx = idx;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.section-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ExamEngine.goToSection(idx);
        renderCurrentQuestion();
        buildPalette();
      });
      container.appendChild(btn);
    });
  }

  function syncSectionTab(sectionIdx) {
    document.querySelectorAll('.section-tab').forEach((b, i) => {
      b.classList.toggle('active', i === sectionIdx);
    });
    document.getElementById('palette-section-label').textContent =
      ExamEngine.getSections()[sectionIdx]?.name || 'Section';
  }

  // ── Palette ───────────────────────────────────────────────
  function buildPalette() {
    const grid = document.getElementById('palette-grid');
    grid.innerHTML = '';

    const currentSec = ExamEngine.getCurrentSection();
    const sections = ExamEngine.getSections();
    const secStart = ExamEngine.getSectionStart(currentSec);
    const secLen = sections[currentSec]?.questions.length || 0;
    const currentIdx = ExamEngine.getCurrentIdx();

    for (let i = 0; i < secLen; i++) {
      const globalIdx = secStart + i;
      const st = ExamEngine.getQuestionState(globalIdx);
      const btn = document.createElement('button');
      btn.className = `palette-btn ${st?.status || 'not-visited'}${globalIdx === currentIdx ? ' current' : ''}`;
      btn.textContent = i + 1;
      btn.title = `Question ${i + 1}`;
      btn.addEventListener('click', () => {
        ExamEngine.goToQuestion(globalIdx);
        renderCurrentQuestion();
        buildPalette();
        syncSectionTab(ExamEngine.getCurrentSection());
      });
      grid.appendChild(btn);
    }

    // Update stats
    const stats = ExamEngine.getStats();
    document.getElementById('stat-answered').textContent     = stats.answered + stats.markedAnswered;
    document.getElementById('stat-not-answered').textContent = stats.notAnswered;
    document.getElementById('stat-marked').textContent       = stats.marked + stats.markedAnswered;
    document.getElementById('stat-not-visited').textContent  = stats.notVisited;
  }

  // ── Question Render ───────────────────────────────────────
  let _lastImageUrl = null;

  function renderCurrentQuestion() {
    const globalIdx = ExamEngine.getCurrentIdx();
    const q = ExamEngine.getCurrentQuestion();
    const st = ExamEngine.getCurrentState();

    if (!q) return;

    // Q number
    const secIdx = ExamEngine.getCurrentSection();
    const secStart = ExamEngine.getSectionStart(secIdx);
    const localIdx = globalIdx - secStart + 1;
    document.getElementById('q-number').textContent =
      `Question ${localIdx} of ${ExamEngine.getSections()[secIdx]?.questions.length || 0}`;

    // Image
    const imgEl = document.getElementById('question-img');
    const loaderEl = document.getElementById('img-loader');
    const imageData = ExamEngine.getImageForQuestion(globalIdx);

    if (imageData?.url) {
      if (_lastImageUrl !== imageData.url) {
        _lastImageUrl = imageData.url;
        loaderEl.style.display = 'flex';
        imgEl.style.opacity = '0';
        imgEl.src = imageData.url;
        imgEl.onload = () => {
          loaderEl.style.display = 'none';
          imgEl.style.opacity = '1';
          imgEl.style.transition = 'opacity 0.2s';
        };
        imgEl.onerror = () => {
          loaderEl.style.display = 'none';
          imgEl.alt = 'Image not available';
          imgEl.style.opacity = '0.3';
        };
        // Zoom
        document.getElementById('zoom-img').src = imageData.url;
      }
    } else {
      loaderEl.style.display = 'none';
      imgEl.src = '';
      imgEl.alt = `Question ${localIdx} (image not available)`;
    }

    // Options — highlight selected; in review mode also show correct answer
    const optionsArea = document.getElementById('options-area');
    const reviewMode = ExamEngine.isSubmitted();
    optionsArea.querySelectorAll('.option-row').forEach(row => {
      const val = row.dataset.val;
      row.classList.toggle('selected', st?.answer === val);
      row.classList.remove('correct-answer', 'wrong-answer');
      if (reviewMode) {
        if (val === q.correctAnswer) {
          row.classList.add('correct-answer');
        } else if (st?.answer === val && val !== q.correctAnswer) {
          row.classList.add('wrong-answer');
        }
      }
    });

    // Mark button state
    const markBtn = document.getElementById('btn-mark');
    const isMarked = st?.status === 'marked' || st?.status === 'marked-answered';
    markBtn.classList.toggle('active', isMarked);
  }

  // ── Mark / Review button ──────────────────────────────────
  function bindExamEvents() {
    // Options
    document.querySelectorAll('.option-row').forEach(row => {
      row.addEventListener('click', () => {
        if (ExamEngine.isSubmitted()) return;
        const val = row.dataset.val;
        const currentAnswer = ExamEngine.getCurrentState()?.answer;
        if (currentAnswer === val) {
          ExamEngine.clearAnswer();
        } else {
          ExamEngine.setAnswer(val);
        }
        renderCurrentQuestion();
        buildPalette();
      });
    });

    // Clear
    document.getElementById('btn-clear')?.addEventListener('click', () => {
      if (ExamEngine.isSubmitted()) return;
      ExamEngine.clearAnswer();
      renderCurrentQuestion();
      buildPalette();
    });

    // Prev
    document.getElementById('btn-prev')?.addEventListener('click', () => {
      ExamEngine.prev();
      renderCurrentQuestion();
      buildPalette();
      syncSectionTab(ExamEngine.getCurrentSection());
    });

    // Next
    document.getElementById('btn-next')?.addEventListener('click', () => {
      ExamEngine.next();
      renderCurrentQuestion();
      buildPalette();
      syncSectionTab(ExamEngine.getCurrentSection());
    });

    // Mark
    document.getElementById('btn-mark')?.addEventListener('click', () => {
      if (ExamEngine.isSubmitted()) return;
      ExamEngine.toggleMark();
      renderCurrentQuestion();
      buildPalette();
    });

    // Zoom
    document.getElementById('btn-zoom')?.addEventListener('click', () => {
      document.getElementById('zoom-modal').hidden = false;
    });
    document.getElementById('zoom-close')?.addEventListener('click', () => {
      document.getElementById('zoom-modal').hidden = true;
    });
    document.getElementById('zoom-modal')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('zoom-modal')) {
        document.getElementById('zoom-modal').hidden = true;
      }
    });

    // Fullscreen
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    // Keyboard nav
    document.addEventListener('keydown', (e) => {
      if (document.getElementById('screen-exam').classList.contains('active')) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          ExamEngine.next();
          renderCurrentQuestion(); buildPalette(); syncSectionTab(ExamEngine.getCurrentSection());
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          ExamEngine.prev();
          renderCurrentQuestion(); buildPalette(); syncSectionTab(ExamEngine.getCurrentSection());
        } else if (['1','2','3','4','a','b','c','d','A','B','C','D'].includes(e.key)) {
          const map = {'1':'A','2':'B','3':'C','4':'D','a':'A','b':'B','c':'C','d':'D','A':'A','B':'B','C':'C','D':'D'};
          ExamEngine.setAnswer(map[e.key]);
          renderCurrentQuestion(); buildPalette();
        }
      }
    });
  }

  // ── History ───────────────────────────────────────────────
  async function loadHistory() {
    const user = Auth.getUser();
    if (!user || user.id?.startsWith('guest')) return;
    const attempts = await SupabaseClient.getUserAttempts(user.id);
    if (!attempts || attempts.length === 0) return;

    document.getElementById('dash-history').hidden = false;
    const grid = document.getElementById('attempts-grid');
    grid.innerHTML = '';
    attempts.forEach(a => {
      const div = document.createElement('div');
      div.className = 'attempt-card';
      const date = new Date(a.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      div.innerHTML = `
        <div class="attempt-info">
          <div class="attempt-name">${a.exam_name || 'Exam'}</div>
          <div class="attempt-date">${date}</div>
        </div>
        <div class="attempt-score">${a.score}/${a.max_score}</div>
      `;
      grid.appendChild(div);
    });
  }

  return {
    showScreen, setLoading, showUploadProgress, setUploadProgress,
    populateSetup, buildSectionTabs, syncSectionTab,
    buildPalette, renderCurrentQuestion, bindExamEvents, loadHistory,
  };
})();

// Toast system
const Toast = (() => {
  function show(msg, type = '', duration = 3000) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, duration);
  }
  return { show };
})();
