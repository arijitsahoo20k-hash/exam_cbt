/**
 * debug.js — Hidden debug panel (Ctrl+Shift+D)
 */

const Debug = (() => {
  let _info = null;

  function setInfo(info) {
    _info = info;
  }

  function render() {
    if (!_info) return 'No exam loaded yet.';

    const { totalQuestions, totalImages, sections, warnings, mappingTable } = _info;

    let out = '';
    out += `── Exam Debug ──────────────────────\n`;
    out += `Total Questions : ${totalQuestions}\n`;
    out += `Total Images    : ${totalImages}\n\n`;

    out += `── Sections ────────────────────────\n`;
    sections.forEach(s => {
      out += `  ${s.name.padEnd(16)} ${s.count} questions\n`;
    });

    if (warnings.length > 0) {
      out += `\n── Warnings ────────────────────────\n`;
      warnings.forEach(w => { out += `  ⚠ ${w}\n`; });
    }

    out += `\n── Image Mapping (first 30) ────────\n`;
    out += `  Q#   Image File              Blob\n`;
    mappingTable.forEach(m => {
      const qn = String(m.questionIndex).padStart(3);
      const fn = (m.imageFile || '—').substring(0, 22).padEnd(22);
      const bl = m.hasBlob ? '✓' : '✗';
      out += `  ${qn}  ${fn}  ${bl}\n`;
    });

    return out;
  }

  function init() {
    const trigger  = document.getElementById('debug-trigger');
    const panel    = document.getElementById('debug-panel');
    const closeBtn = document.getElementById('debug-close');
    const body     = document.getElementById('debug-body');

    trigger.addEventListener('click', () => {
      body.textContent = render();
      panel.hidden = !panel.hidden;
    });

    closeBtn.addEventListener('click', () => { panel.hidden = true; });

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        body.textContent = render();
        panel.hidden = !panel.hidden;
      }
    });
  }

  return { init, setInfo };
})();
