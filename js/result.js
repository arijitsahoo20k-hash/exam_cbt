/**
 * result.js — Exam-portal style result screen
 */

const Result = (() => {

  async function show(results) {
    UI.showScreen('result');

    try {
    const {
      score, maxScore, correct, wrong, unattempted,
      attempted, accuracy, timeTaken, sectionResults, percentage
    } = results;

    // ── Candidate info ────────────────────────────────────────
    const user = Auth.getUser();
    const name = user?.name || 'Candidate';
    const initial = name.trim()[0]?.toUpperCase() || 'C';
    const examName = ExamEngine.getExamName();

    const avatarEl = document.getElementById('res-avatar');
    const nameEl   = document.getElementById('res-candidate-name');
    const metaEl   = document.getElementById('res-candidate-meta');
    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl)   nameEl.textContent   = name;
    if (metaEl)   metaEl.textContent   = `ExamCBT · ${examName}`;

    // ── Topbar exam name ──────────────────────────────────────
    const examNameEl = document.getElementById('result-exam-name');
    if (examNameEl) examNameEl.textContent = examName;

    // ── Score panel ───────────────────────────────────────────
    const scoreValEl = document.getElementById('score-val');
    const scoreMaxEl = document.getElementById('score-max');
    if (scoreValEl) scoreValEl.textContent  = score;
    if (scoreMaxEl) scoreMaxEl.textContent  = `/${maxScore}`;

    const pctBadge = document.getElementById('res-pct-badge');
    if (pctBadge) pctBadge.textContent = `${percentage}%`;

    const hints = [
      [90, '🏆 Outstanding! Top percentile.'],
      [70, '🎯 Excellent work! Keep it up.'],
      [50, '👍 Good effort. Room to improve.'],
      [30, '📚 Needs more practice.'],
      [0,  '💪 Keep studying — you got this!'],
    ];
    const hint = hints.find(([t]) => percentage >= t)?.[1] || hints[hints.length-1][1];
    document.getElementById('score-rank-hint').textContent = hint;

    // ── Arc — semicircle ──────────────────────────────────────
    setTimeout(() => {
      const arc = document.getElementById('score-arc');
      if (arc) {
        const totalLength = 220; // approx arc length of the semicircle path
        const pct = Math.max(0, Math.min(percentage, 100));
        const offset = totalLength - (totalLength * pct / 100);
        arc.style.strokeDashoffset = offset;
        arc.style.stroke = pct >= 70 ? '#16a34a' : pct >= 40 ? '#d97706' : '#dc2626';
      }
    }, 200);

    // ── Score panel colour tint ───────────────────────────────
    const scorePanel = document.getElementById('res-score-panel');
    if (scorePanel) {
      const bigScore = scorePanel.querySelector('.res-score-big');
      if (bigScore) {
        bigScore.style.color = percentage >= 70 ? '#16a34a' : percentage >= 40 ? '#d97706' : '#dc2626';
      }
      if (pctBadge) {
        if (percentage >= 70) {
          pctBadge.style.cssText = 'background:#dcfce7;color:#16a34a;border-color:rgba(22,163,74,.3)';
        } else if (percentage >= 40) {
          pctBadge.style.cssText = 'background:#fef3c7;color:#d97706;border-color:rgba(217,119,6,.3)';
        } else {
          pctBadge.style.cssText = 'background:#fee2e2;color:#dc2626;border-color:rgba(220,38,38,.3)';
        }
      }
    }

    // ── Time taken ────────────────────────────────────────────
    const timeTakenEl = document.getElementById('res-time-taken');
    if (timeTakenEl) timeTakenEl.textContent = Timer.formatTime(timeTaken);

    // ── Q summary boxes ───────────────────────────────────────
    const totalQs = correct + wrong + unattempted;
    _setText('rq-total',     totalQs);
    _setText('rq-attempted', attempted ?? (correct + wrong));
    _setText('rq-correct',   correct);
    _setText('rq-wrong',     wrong);
    _setText('rq-skipped',   unattempted);
    _setText('rq-accuracy',  accuracy + '%');

    // ── Section table ─────────────────────────────────────────
    const tbody = document.getElementById('res-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      let totCorrect = 0, totWrong = 0, totSkipped = 0, totScore = 0, totMax = 0, totTotal = 0, totAttempted = 0;

      Object.entries(sectionResults).forEach(([subject, data]) => {
        const maxSec    = data.total * (APP_CONFIG.MARKS_CORRECT || 3);
        const secPct    = maxSec > 0 ? Math.max(0, Math.round((data.score / maxSec) * 100)) : 0;
        const secWrong  = data.wrong   ?? 0;
        const secSkip   = data.unattempted ?? (data.total - (data.correct ?? 0) - secWrong);
        const secAtt    = (data.correct ?? 0) + secWrong;
        const pctClass  = secPct >= 50 ? 'res-cell-good' : secPct >= 25 ? 'res-cell-mid' : 'res-cell-bad';

        totCorrect   += data.correct   ?? 0;
        totWrong     += secWrong;
        totSkipped   += secSkip;
        totScore     += data.score;
        totMax       += maxSec;
        totTotal     += data.total;
        totAttempted += secAtt;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${subject}</td>
          <td>${data.total}</td>
          <td>${secAtt}</td>
          <td class="res-cell-good">${data.correct ?? 0}</td>
          <td class="res-cell-bad">${secWrong}</td>
          <td class="${pctClass}">${data.score}</td>
          <td>${maxSec}</td>
          <td class="${pctClass}">${secPct}%</td>
        `;
        tbody.appendChild(tr);
      });

      // Total row
      const totPct      = totMax > 0 ? Math.round((totScore / totMax) * 100) : 0;
      const totPctClass = totPct >= 50 ? 'res-cell-good' : totPct >= 25 ? 'res-cell-mid' : 'res-cell-bad';
      const totalTr     = document.createElement('tr');
      totalTr.className = 'res-total-row';
      totalTr.innerHTML = `
        <td>TOTAL</td>
        <td>${totTotal}</td>
        <td>${totAttempted}</td>
        <td class="res-cell-good">${totCorrect}</td>
        <td class="res-cell-bad">${totWrong}</td>
        <td class="${totPctClass}">${totScore}</td>
        <td>${totMax}</td>
        <td class="${totPctClass}">${totPct}%</td>
      `;
      tbody.appendChild(totalTr);
    }

    // ── Save results ──────────────────────────────────────────
    const isGuest = !user || user.isGuest === true || user.id?.startsWith('guest_');
    if (!isGuest) {
      try { await _saveResults(user, results); } catch (e) { console.warn('Save error:', e); }
    }

    document.dispatchEvent(new CustomEvent('exam:completed'));
    } catch (err) {
      console.error('[Result] Error rendering result screen:', err);
      // Show a fallback message so the screen isn't blank
      const body = document.querySelector('#screen-result .res-body');
      if (body) {
        body.innerHTML = `
          <div style="padding:40px;text-align:center;color:var(--text-1,#111);width:100%">
            <div style="font-size:48px;margin-bottom:16px">⚠️</div>
            <h2 style="margin-bottom:8px">Could not load results</h2>
            <p style="color:var(--text-2,#666);margin-bottom:24px">
              An error occurred while rendering your score.<br>
              <code style="font-size:12px;color:#dc2626">${err.message}</code>
            </p>
            <button id="result-fallback-home" style="padding:10px 24px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">
              Go to Dashboard
            </button>
          </div>`;
        document.getElementById('result-fallback-home')?.addEventListener('click', () => {
          UI.showScreen('dashboard');
        });
      }
    }
  }

  function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  async function _saveResults(user, results) {
    const { score, maxScore, correct, wrong, unattempted, accuracy, timeTaken } = results;
    const attemptData = {
      user_id:     user.id,
      exam_name:   ExamEngine.getExamName(),
      score, max_score: maxScore, correct, wrong, unattempted, accuracy,
      time_taken:  timeTaken,
      created_at:  new Date().toISOString(),
    };

    const questions = ExamEngine.getAllQuestions();
    const states    = ExamEngine.getStateArray();
    const responses = questions.map((q, idx) => {
      const st         = states[idx];
      const userAns    = st?.answer || null;
      const correctAns = q.correctAnswer || null;
      const isCorrect  = (userAns && correctAns) ? (userAns === correctAns) : null;
      return {
        question_no: idx + 1, subject: q.subject || 'General',
        answer: userAns, correct_ans: correctAns, is_correct: isCorrect,
        status: st?.status || 'not-visited',
        created_at: new Date().toISOString(),
      };
    });

    const localEntry = LocalHistory.saveAttempt(attemptData, responses);
    console.log('[ExamCBT] Saved to localStorage, id:', localEntry.id);

    if (SupabaseClient.isConfigured()) {
      try {
        const savedAttempt = await SupabaseClient.saveAttempt(attemptData);
        if (savedAttempt?.id) {
          await SupabaseClient.saveResponses(responses.map(r => ({ ...r, attempt_id: savedAttempt.id, user_id: user.id })));
          console.log('[ExamCBT] Saved to Supabase, id:', savedAttempt.id);
        }
      } catch (e) {
        console.warn('[ExamCBT] Supabase save failed (local save still succeeded):', e.message);
      }
    }
  }

  function bindEvents() {
    document.getElementById('btn-new-test')?.addEventListener('click', () => {
      Timer.reset(); ExamEngine.clearState(); UI.showScreen('dashboard');
      document.dispatchEvent(new CustomEvent('result:dashboard'));
    });
    document.getElementById('btn-go-home')?.addEventListener('click', () => {
      Timer.reset(); ExamEngine.clearState(); UI.showScreen('dashboard');
      document.dispatchEvent(new CustomEvent('result:dashboard'));
    });
    document.getElementById('btn-review-answers')?.addEventListener('click', () => {
      Review.open();
    });
  }

  return { show, bindEvents };
})();
