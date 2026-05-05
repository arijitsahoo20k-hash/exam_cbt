/**
 * review.js — Answer Review System
 *
 * Two modes:
 *  1. LIVE:    After exam submission (uses ExamEngine data + live images)
 *  2. HISTORY: From saved responses (text-only, no images)
 *
 * FIXES:
 *  - openFromHistory() sections were built with wrong object references —
 *    now correctly maps flat response index to questions array
 *  - _getSectionStart() is now consistent with the rebuilt sections
 *  - Palette correctly highlights active question across sections
 */

const Review = (() => {

  let _mode = 'live';   // 'live' | 'history'
  let _currentIdx = 0;
  let _currentSection = 0;
  let _data = null;
  /*
   * _data shape (both modes):
   * {
   *   examName: string,
   *   sections: [{ name, questions: [{ ...questionObj }] }],
   *   questions: [...flat array of all questions],
   *   states:    [{ answer, status, is_correct? }],
   *   isHistory?: boolean,
   *   attempt?:  object,
   * }
   */

  // ── PUBLIC: Open from live exam ──────────────────────────
  function open() {
    _mode = 'live';
    const questions = ExamEngine.getAllQuestions();
    const states    = ExamEngine.getStateArray();
    const sections  = ExamEngine.getSections();

    const flatQuestions = questions.map((q, idx) => ({
      ...q,
      imageBlob: ExamEngine.getImageForQuestion(idx),
    }));

    const flatStates = states.map((st, idx) => ({
      answer:     st.answer,
      status:     st.status,
      is_correct: st.answer ? (st.answer === questions[idx]?.correctAnswer) : null,
    }));

    // Sections reference flat question objects by global index
    const builtSections = sections.map(sec => ({
      name:      sec.name,
      questions: sec.questions.map(globalIdx => flatQuestions[globalIdx]),
    }));

    _data = {
      examName: ExamEngine.getExamName() || 'Answer Review',
      sections: builtSections,
      questions: flatQuestions,
      states:    flatStates,
    };

    _currentIdx = 0;
    _currentSection = 0;
    _open();
  }

  // ── PUBLIC: Open from history (saved responses) ──────────
  async function openFromHistory(attempt, responses) {
    _mode = 'history';

    // Build flat questions and states from responses (already in question_no order)
    const questions = responses.map(r => ({
      que:           r.question_no,
      subject:       r.subject || 'General',
      correctAnswer: r.correct_ans || null,
      questionText:  null,
      imageBlob:     null,
      optionA: null, optionB: null, optionC: null, optionD: null,
    }));

    const states = responses.map(r => ({
      answer:     r.answer || null,
      status:     r.status || (r.answer ? 'answered' : 'not-answered'),
      is_correct: r.is_correct,
    }));

    // Group into sections by subject, preserving flat index
    const subjectOrder = [];
    const subjectMap   = {};  // subject → [flat index]
    responses.forEach((r, i) => {
      const sub = r.subject || 'General';
      if (!subjectMap[sub]) {
        subjectMap[sub] = [];
        subjectOrder.push(sub);
      }
      subjectMap[sub].push(i);
    });

    const sections = subjectOrder.map(name => ({
      name,
      // store question objects (not raw indices) — consistent with live mode
      questions: subjectMap[name].map(i => questions[i]),
    }));

    _data = {
      examName: attempt.exam_name || 'Past Attempt',
      sections,
      questions,
      states,
      isHistory: true,
      attempt,
    };

    _currentIdx = 0;
    _currentSection = 0;
    _open();
  }

  function _open() {
    document.getElementById('review-exam-title').textContent = _data.examName;
    _buildSectionTabs();
    _renderQuestion(_currentIdx);
    _buildPalette();

    const backBtn = document.getElementById('btn-back-result');
    if (_mode === 'history') {
      backBtn.textContent = '← Back';
      backBtn._historyMode = true;
    } else {
      backBtn.textContent = '← Results';
      backBtn._historyMode = false;
    }

    // Show/hide the Solutions PDF link based on SOLUTION_PDFS map in app.js
    const pdfBtn = document.getElementById('review-pdf-btn');
    if (pdfBtn && typeof _getSolutionPdf === 'function') {
      const pdfFile = _getSolutionPdf(_data.examName);
      if (pdfFile) {
        pdfBtn.href = pdfFile;
        pdfBtn.hidden = false;
      } else {
        pdfBtn.hidden = true;
      }
    }

    UI.showScreen('review');
  }

  // ── Section Tabs ─────────────────────────────────────────
  function _buildSectionTabs() {
    const container = document.getElementById('review-section-tabs');
    container.innerHTML = '';
    _data.sections.forEach((sec, idx) => {
      const btn = document.createElement('button');
      btn.className = 'review-sec-tab' + (idx === 0 ? ' active' : '');
      btn.textContent = sec.name;
      btn.dataset.idx = idx;
      btn.addEventListener('click', () => {
        _currentSection = idx;
        _currentIdx = _getSectionStart(idx);
        document.querySelectorAll('.review-sec-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _renderQuestion(_currentIdx);
        _buildPalette();
      });
      container.appendChild(btn);
    });
  }

  function _getSectionStart(secIdx) {
    let count = 0;
    for (let i = 0; i < secIdx; i++) count += _data.sections[i].questions.length;
    return count;
  }

  function _getSectionForIndex(idx) {
    let count = 0;
    for (let s = 0; s < _data.sections.length; s++) {
      count += _data.sections[s].questions.length;
      if (idx < count) return s;
    }
    return _data.sections.length - 1;
  }

  // ── Palette ───────────────────────────────────────────────
  function _buildPalette() {
    const grid = document.getElementById('review-palette');
    grid.innerHTML = '';

    const sec = _data.sections[_currentSection];
    if (!sec) return;

    const secStart = _getSectionStart(_currentSection);
    const secLen   = sec.questions.length;

    let correct = 0, wrong = 0, skipped = 0;

    for (let i = 0; i < secLen; i++) {
      const globalIdx = secStart + i;
      const st = _data.states[globalIdx];
      const q  = _data.questions[globalIdx];
      const userAns    = st?.answer || null;
      const correctAns = q?.correctAnswer || null;

      let status = 'skipped';
      if (userAns) status = (userAns === correctAns) ? 'correct' : 'wrong';

      if (status === 'correct') correct++;
      else if (status === 'wrong') wrong++;
      else skipped++;

      const btn = document.createElement('button');
      btn.className = `review-pal-btn ${status}${globalIdx === _currentIdx ? ' active' : ''}`;
      btn.textContent = i + 1;
      btn.title = `Q${i + 1}: ${status}`;
      btn.addEventListener('click', () => {
        _currentIdx = globalIdx;
        _renderQuestion(_currentIdx);
        _buildPalette();
      });
      grid.appendChild(btn);
    }

    document.getElementById('review-sidebar-stats').innerHTML = `
      <div class="review-stat-row"><span>✓ Correct</span><strong style="color:var(--green)">${correct}</strong></div>
      <div class="review-stat-row"><span>✗ Wrong</span><strong style="color:var(--red)">${wrong}</strong></div>
      <div class="review-stat-row"><span>— Skipped</span><strong>${skipped}</strong></div>
      <div class="review-stat-row" style="border-top:1px solid var(--border-2);padding-top:8px;margin-top:4px">
        <span>Accuracy</span>
        <strong>${correct + wrong > 0 ? Math.round(correct / (correct + wrong) * 100) : 0}%</strong>
      </div>
    `;
  }

  // ── Render Question ──────────────────────────────────────
  function _renderQuestion(idx) {
    const total   = _data.questions.length;
    const q       = _data.questions[idx];
    const st      = _data.states[idx];
    if (!q) return;

    const userAns    = st?.answer || null;
    const correctAns = q.correctAnswer || null;

    document.getElementById('review-progress-label').textContent = `Q ${idx + 1} of ${total}`;
    document.getElementById('review-q-number').textContent = `Q${idx + 1}`;

    // Badge
    const badge = document.getElementById('review-q-status-badge');
    if (!userAns) {
      badge.textContent = '— Skipped'; badge.className = 'review-badge skipped';
    } else if (userAns === correctAns) {
      badge.textContent = '✓ Correct'; badge.className = 'review-badge correct';
    } else {
      badge.textContent = '✗ Wrong';   badge.className = 'review-badge wrong';
    }

    // Section tab sync
    const secIdx = _getSectionForIndex(idx);
    if (secIdx !== _currentSection) {
      _currentSection = secIdx;
      document.querySelectorAll('.review-sec-tab').forEach((b, i) =>
        b.classList.toggle('active', i === secIdx)
      );
    }

    // Image
    const imgEl    = document.getElementById('review-img');
    const loaderEl = document.getElementById('review-img-loader');
    const wrapEl   = document.getElementById('review-image-wrap');
    const imageBlob = q.imageBlob;

    if (imageBlob?.url) {
      imgEl.src = '';
      loaderEl.style.display = 'flex';
      wrapEl.style.display = '';
      imgEl.onload  = () => { loaderEl.style.display = 'none'; document.getElementById('zoom-img').src = imageBlob.url; };
      imgEl.onerror = () => { loaderEl.style.display = 'none'; };
      imgEl.src = imageBlob.url;
    } else {
      wrapEl.style.display = 'none';
    }

    // Question text
    const textArea = document.getElementById('review-question-text');
    if (textArea) {
      if (q.questionText) {
        textArea.textContent = q.questionText;
        textArea.style.display = '';
      } else {
        textArea.style.display = 'none';
      }
    }

    // Options
    const optContainer = document.getElementById('review-options');
    optContainer.innerHTML = '';
    const labels    = ['A', 'B', 'C', 'D'];
    const optValues = [q.optionA, q.optionB, q.optionC, q.optionD];
    const hasTextOptions = optValues.some(v => v !== null && v !== undefined);

    if (hasTextOptions) {
      labels.forEach((label, i) => {
        if (optValues[i] === null || optValues[i] === undefined) return;
        const isCorrect   = label === correctAns;
        const isUserPick  = label === userAns;
        const isUserWrong = isUserPick && !isCorrect;

        const div = document.createElement('div');
        div.className = 'review-option';
        if (isCorrect)   div.classList.add('correct-answer');
        if (isUserWrong) div.classList.add('user-wrong');

        let tag = '';
        if (isCorrect && isUserPick) tag = '<span class="review-option-tag">✓ Your Answer (Correct)</span>';
        else if (isCorrect)          tag = '<span class="review-option-tag">✓ Correct Answer</span>';
        else if (isUserWrong)        tag = '<span class="review-option-tag">✗ Your Answer</span>';

        div.innerHTML = `
          <span class="opt-label">${label}</span>
          <span class="opt-text" style="flex:1;color:var(--text-${isCorrect||isUserPick?'1':'2'})">${optValues[i]}</span>
          ${tag}
        `;
        optContainer.appendChild(div);
      });
    } else if (_mode === 'history') {
      // Image-based question in history — show answer letters with highlights
      const div = document.createElement('div');
      div.style.cssText = 'padding:16px;font-size:13px;color:var(--text-2);line-height:1.8';
      div.innerHTML = `
        <div style="background:var(--surface-4);border-radius:10px;padding:16px;border:1px solid var(--border-2)">
          <p style="color:var(--text-3);font-size:12px;margin-bottom:12px">
            This question used images that aren't stored in history. Only answer data is available.
          </p>
          ${labels.map(l => {
            const isCorrect   = l === correctAns;
            const isUserPick  = l === userAns;
            const isUserWrong = isUserPick && !isCorrect;
            const style = isCorrect
              ? 'color:var(--green);font-weight:700'
              : isUserWrong ? 'color:var(--red);font-weight:700' : 'color:var(--text-3)';
            const marker = isCorrect && isUserPick ? ' ✓ Your Answer (Correct)'
              : isCorrect ? ' ✓ Correct Answer'
              : isUserWrong ? ' ✗ Your pick' : '';
            return `<div style="${style};margin:6px 0">Option ${l}${marker}</div>`;
          }).join('')}
        </div>
      `;
      optContainer.appendChild(div);
    } else {
      const div = document.createElement('div');
      div.style.cssText = 'padding:8px 0;font-size:13px;color:var(--text-3)';
      div.textContent = 'Options are shown in the question image above.';
      optContainer.appendChild(div);
    }

    // Answer key panel
    const expEl = document.getElementById('review-explanation');
    const conEl = document.getElementById('re-content');
    if (correctAns) {
      expEl.hidden = false;
      const marksVal = userAns
        ? (userAns === correctAns
          ? `<span style="color:var(--green)">+${window.APP_CONFIG?.MARKS_CORRECT || 3} marks</span>`
          : `<span style="color:var(--red)">${window.APP_CONFIG?.MARKS_WRONG || -1} mark</span>`)
        : `<span style="color:var(--text-3)">0 marks (not attempted)</span>`;

      conEl.innerHTML = `
        <div style="display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start">
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3)">Correct Answer</span><br>
            <strong style="font-size:18px;color:var(--green);font-family:var(--font-mono)">${correctAns}</strong>
          </div>
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3)">Your Answer</span><br>
            <strong style="font-size:18px;font-family:var(--font-mono);color:var(--text-1)">${userAns || '—'}</strong>
          </div>
          <div>
            <span style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3)">Marks</span><br>
            <strong style="font-size:14px">${marksVal}</strong>
          </div>
        </div>
      `;
    } else {
      expEl.hidden = true;
    }

    document.querySelector('.review-question-area')?.scrollTo(0, 0);
  }

  // ── Navigation ────────────────────────────────────────────
  function _prev() {
    if (_currentIdx > 0) { _currentIdx--; _renderQuestion(_currentIdx); _buildPalette(); }
  }
  function _next() {
    if (_currentIdx < _data.questions.length - 1) { _currentIdx++; _renderQuestion(_currentIdx); _buildPalette(); }
  }

  // ── Bind Events ───────────────────────────────────────────
  function bindEvents() {
    document.getElementById('review-btn-prev')?.addEventListener('click', _prev);
    document.getElementById('review-btn-next')?.addEventListener('click', _next);

    document.getElementById('btn-back-result')?.addEventListener('click', () => {
      if (document.getElementById('btn-back-result')._historyMode) {
        UI.showScreen('dashboard');
      } else {
        UI.showScreen('result');
      }
    });

    document.getElementById('review-btn-zoom')?.addEventListener('click', () => {
      const src = document.getElementById('review-img').src;
      if (src && !src.endsWith(window.location.href)) {
        document.getElementById('zoom-img').src = src;
        document.getElementById('zoom-modal').hidden = false;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (!document.getElementById('screen-review').classList.contains('active')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') _next();
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   _prev();
    });
  }

  return { open, openFromHistory, bindEvents };
})();
