/**
 * exam-engine.js — Core exam state machine
 *
 * States per question:
 *   not-visited | not-answered | answered | marked | marked-answered
 */

const ExamEngine = (() => {

  // ── State ─────────────────────────────────────────────────
  let _exam = null;         // { sections, allQuestions, imageBlobs, answerKey, duration }
  let _currentSection = 0;
  let _currentQuestion = 0; // global index into allQuestions
  let _state = [];          // per-question state objects
  let _startTime = null;
  let _attemptId = null;
  let _submitted = false;

  // ── Per-question state factory ────────────────────────────
  function makeQState() {
    return {
      status: 'not-visited', // not-visited | not-answered | answered | marked | marked-answered
      answer: null,          // 'A' | 'B' | 'C' | 'D' | null
      visitedAt: null,
    };
  }

  // ── Init ──────────────────────────────────────────────────
  function load(examData) {
    _exam = examData;
    _currentSection  = 0;
    _currentQuestion = 0;
    _submitted = false;
    _startTime = Date.now();
    _attemptId = 'attempt_' + Date.now();

    // Build flat state array
    _state = examData.allQuestions.map(() => makeQState());

    // Restore from localStorage
    const saved = _restoreState();
    if (saved) {
      _state = saved.state;
      _currentQuestion = saved.currentQuestion;
      _currentSection  = saved.currentSection;
    }

    // Mark first question as visited
    if (_state[_currentQuestion].status === 'not-visited') {
      _state[_currentQuestion].status = 'not-answered';
      _state[_currentQuestion].visitedAt = Date.now();
    }
  }

  // ── Persistence ───────────────────────────────────────────
  const STORAGE_KEY = 'examcbt_state';

  function _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        state: _state,
        currentQuestion: _currentQuestion,
        currentSection:  _currentSection,
        startTime: _startTime,
        attemptId: _attemptId,
      }));
    } catch (_) {}
  }

  function _restoreState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data.state || data.state.length !== _exam.allQuestions.length) return null;
      _startTime  = data.startTime  || Date.now();
      _attemptId  = data.attemptId  || _attemptId;
      return data;
    } catch (_) { return null; }
  }

  function clearState() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // ── Section helpers ───────────────────────────────────────
  function getSectionForGlobalIndex(globalIdx) {
    let count = 0;
    for (let s = 0; s < _exam.sections.length; s++) {
      count += _exam.sections[s].questions.length;
      if (globalIdx < count) return s;
    }
    return _exam.sections.length - 1;
  }

  function getSectionStart(sectionIdx) {
    let count = 0;
    for (let i = 0; i < sectionIdx; i++) count += _exam.sections[i].questions.length;
    return count;
  }

  // ── Navigation ────────────────────────────────────────────
  function _visitQuestion(idx) {
    if (idx < 0 || idx >= _exam.allQuestions.length) return;
    _currentQuestion = idx;
    _currentSection  = getSectionForGlobalIndex(idx);
    if (_state[idx].status === 'not-visited') {
      _state[idx].status = 'not-answered';
      _state[idx].visitedAt = Date.now();
    }
    _saveState();
  }

  function goToQuestion(idx) { _visitQuestion(idx); }

  function next() {
    if (_currentQuestion < _exam.allQuestions.length - 1) {
      _visitQuestion(_currentQuestion + 1);
    }
  }

  function prev() {
    if (_currentQuestion > 0) {
      _visitQuestion(_currentQuestion - 1);
    }
  }

  function goToSection(sIdx) {
    const start = getSectionStart(sIdx);
    _visitQuestion(start);
  }

  // ── Answer & Marking ──────────────────────────────────────
  function setAnswer(option) {
    const q = _state[_currentQuestion];
    q.answer = option;
    if (q.status === 'marked' || q.status === 'marked-answered') {
      q.status = 'marked-answered';
    } else {
      q.status = 'answered';
    }
    _saveState();
  }

  function clearAnswer() {
    const q = _state[_currentQuestion];
    q.answer = null;
    if (q.status === 'marked-answered') {
      q.status = 'marked';
    } else {
      q.status = 'not-answered';
    }
    _saveState();
  }

  function toggleMark() {
    const q = _state[_currentQuestion];
    if (q.status === 'answered') {
      q.status = 'marked-answered';
    } else if (q.status === 'marked-answered') {
      q.status = 'answered';
    } else if (q.status === 'marked') {
      q.status = 'not-answered';
    } else {
      q.status = 'marked';
    }
    _saveState();
  }

  // ── Image Access ──────────────────────────────────────────
  function getImageForQuestion(globalIdx) {
    if (!_exam) return null;
    return _exam.imageBlobs[globalIdx] || null;
  }

  // ── Stats ─────────────────────────────────────────────────
  function getStats() {
    const stats = { answered: 0, notAnswered: 0, marked: 0, notVisited: 0, markedAnswered: 0 };
    _state.forEach(q => {
      if (q.status === 'answered')         stats.answered++;
      else if (q.status === 'not-answered') stats.notAnswered++;
      else if (q.status === 'marked')       stats.marked++;
      else if (q.status === 'not-visited')  stats.notVisited++;
      else if (q.status === 'marked-answered') stats.markedAnswered++;
    });
    return stats;
  }

  // ── Score ─────────────────────────────────────────────────
  function calculate() {
    let total = 0, correct = 0, wrong = 0, unattempted = 0;
    const cfg = window.APP_CONFIG;
    const sectionResults = {};

    _exam.sections.forEach(s => { sectionResults[s.name] = { total: 0, correct: 0, wrong: 0, score: 0 }; });

    _exam.allQuestions.forEach((q, idx) => {
      const ans = _state[idx].answer;
      const sec = q.subject;
      if (!sectionResults[sec]) sectionResults[sec] = { total: 0, correct: 0, wrong: 0, score: 0 };
      sectionResults[sec].total++;

      if (!ans) {
        unattempted++;
      } else if (ans === q.correctAnswer) {
        correct++;
        total += cfg.MARKS_CORRECT;
        sectionResults[sec].correct++;
        sectionResults[sec].score += cfg.MARKS_CORRECT;
      } else {
        wrong++;
        total += cfg.MARKS_WRONG;
        sectionResults[sec].wrong++;
        sectionResults[sec].score += cfg.MARKS_WRONG;
      }
    });

    const maxScore = _exam.allQuestions.length * cfg.MARKS_CORRECT;
    const attempted = correct + wrong;
    const accuracy  = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const timeTaken = Math.round((Date.now() - _startTime) / 1000);

    return {
      score: total,
      maxScore,
      correct,
      wrong,
      unattempted,
      attempted,
      accuracy,
      timeTaken,
      totalQuestions: _exam.allQuestions.length,
      sectionResults,
      percentage: Math.max(0, Math.round((total / maxScore) * 100)),
    };
  }

  // ── Getters ───────────────────────────────────────────────
  function getCurrentIdx()     { return _currentQuestion; }
  function getCurrentSection() { return _currentSection; }
  function getQuestion(idx)    { return _exam?.allQuestions[idx] ?? null; }
  function getCurrentQuestion(){ return getQuestion(_currentQuestion); }
  function getQuestionState(idx) { return _state[idx] ?? null; }
  function getCurrentState()   { return _state[_currentQuestion]; }
  function getSections()       { return _exam?.sections ?? []; }
  function getAllQuestions()    { return _exam?.allQuestions ?? []; }
  function getExamName()       { return _exam?.examName ?? 'Exam'; }
  function getDuration()       { return _exam?.duration ?? APP_CONFIG.EXAM_DURATION_SECONDS; }
  function getStartTime()      { return _startTime; }
  function getAttemptId()      { return _attemptId; }
  function isSubmitted()       { return _submitted; }
  function markSubmitted()     { _submitted = true; clearState(); }
  function getStateArray()     { return _state; }

  return {
    load, next, prev, goToQuestion, goToSection,
    setAnswer, clearAnswer, toggleMark,
    getImageForQuestion, getStats, calculate,
    getCurrentIdx, getCurrentSection, getQuestion,
    getCurrentQuestion, getQuestionState, getCurrentState,
    getSections, getAllQuestions, getExamName, getDuration,
    getStartTime, getAttemptId, isSubmitted, markSubmitted,
    getStateArray, getSectionStart, getSectionForGlobalIndex,
    clearState,
  };
})();
