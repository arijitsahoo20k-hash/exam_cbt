/**
 * zip-processor.js — Universal ZIP exam extractor
 *
 * Supports multiple formats automatically detected:
 *
 *  FORMAT A — BITSAT/NTA official (pdfCropperData + testAnswerKey)
 *    data.json: { pdfCropperData: { Subject: { Subject: { "1": {que,type}, ... } } },
 *                 testAnswerKey:  { Subject: { Subject: { "1": 2 (1-4) } } } }
 *    Images:    Subject__--__QNum__--__PartIdx.png  (multi-part stitched)
 *
 *  FORMAT B — Generic CBT (NexusExam universal format)
 *    data.json: { questions: [ { id, text?, image?, options:[...], answer:"A"|"B"|"C"|"D",
 *                                section?, marks?:{correct,wrong} }, ... ],
 *                 meta?: { name, duration, sections } }
 *    Images:    optional, named by question id or index (q1.png, 1.png, etc.)
 *
 *  FORMAT C — NTA-style flat
 *    data.json: { questions: [ { questionNumber, subject, options:{A,B,C,D},
 *                                correctOption, imageFile? } ] }
 *
 *  FORMAT D — Simple text-only (no images needed)
 *    data.json: { title?, sections: [ { name, questions: [
 *                   { question, options:[A,B,C,D strings], answer:"A" } ] } ] }
 */

const ZipProcessor = (() => {

  // ── JSZip loader ───────────────────────────────────────────
  function loadJSZip() {
    return new Promise((resolve, reject) => {
      if (window.JSZip) { resolve(window.JSZip); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      s.onload = () => resolve(window.JSZip);
      s.onerror = () => reject(new Error('Failed to load JSZip library'));
      document.head.appendChild(s);
    });
  }

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);
  function isImage(name) {
    return IMAGE_EXTS.has(name.substring(name.lastIndexOf('.')).toLowerCase());
  }

  // ── BITSAT filename parser ─────────────────────────────────
  function parseBitsatFilename(filename) {
    const base = filename.replace(/\.[^.]+$/, '').replace(/^.*[\/\\]/, '');
    const parts = base.split('__--__');
    if (parts.length >= 3) {
      const qNum = parseInt(parts[1], 10);
      const partIdx = parseInt(parts[2], 10);
      if (!isNaN(qNum) && !isNaN(partIdx)) {
        return { subject: parts[0].trim(), qNum, partIdx };
      }
    }
    const match = base.match(/(\d+)/g);
    return match ? { subject: null, qNum: parseInt(match[0], 10), partIdx: 1 } : null;
  }

  // ── Format detector ───────────────────────────────────────
  function detectFormat(data) {
    if (data.pdfCropperData) return 'BITSAT';
    if (Array.isArray(data.questions) && data.questions.length > 0) {
      const q = data.questions[0];
      if (q.questionNumber !== undefined || q.correctOption !== undefined) return 'NTA';
      return 'GENERIC';
    }
    if (Array.isArray(data.sections) && data.sections.length > 0) {
      const sec = data.sections[0];
      if (Array.isArray(sec.questions) && sec.questions.length > 0 && sec.questions[0].question !== undefined) {
        return 'SIMPLE';
      }
    }
    return 'UNKNOWN';
  }

  // ─────────────────────────────────────────────────────────
  // FORMAT PARSERS
  // ─────────────────────────────────────────────────────────

  // FORMAT A: BITSAT/NTA official
  function parseBITSAT(data) {
    const sections = [];
    const allQuestions = [];
    const cropData = data.pdfCropperData;
    const answerKey = data.testAnswerKey || {};
    const numToLetter = { 1: 'A', 2: 'B', 3: 'C', 4: 'D' };

    for (const [subjectKey, subjectVal] of Object.entries(cropData)) {
      let questionMap = {};

      if (Array.isArray(subjectVal)) {
        subjectVal.forEach(q => { questionMap[String(q.que)] = q; });
      } else if (typeof subjectVal === 'object') {
        for (const innerVal of Object.values(subjectVal)) {
          if (Array.isArray(innerVal)) {
            innerVal.forEach(q => { questionMap[String(q.que)] = q; });
          } else if (typeof innerVal === 'object') {
            const firstEntry = Object.values(innerVal)[0];
            if (firstEntry && (firstEntry.que !== undefined || firstEntry.type !== undefined)) {
              Object.assign(questionMap, innerVal);
            }
          }
        }
      }

      let subjectAnswerMap = {};
      const akSubject = answerKey[subjectKey];
      if (akSubject && typeof akSubject === 'object') {
        for (const innerVal of Object.values(akSubject)) {
          if (typeof innerVal === 'object' && !Array.isArray(innerVal)) {
            const firstInner = Object.values(innerVal)[0];
            if (typeof firstInner === 'number' || typeof firstInner === 'string') {
              Object.assign(subjectAnswerMap, innerVal);
            }
          } else {
            Object.assign(subjectAnswerMap, akSubject);
            break;
          }
        }
        if (Object.keys(subjectAnswerMap).length === 0) Object.assign(subjectAnswerMap, akSubject);
      }

      const sortedQNums = Object.keys(questionMap).sort((a, b) => parseInt(a) - parseInt(b));
      const sectionQuestions = sortedQNums.map(qNumStr => {
        const q = questionMap[qNumStr];
        const rawAnswer = subjectAnswerMap[qNumStr];
        const correctAnswer = numToLetter[rawAnswer] || (typeof rawAnswer === 'string' ? rawAnswer.toUpperCase() : null);
        return {
          que: q.que ?? parseInt(qNumStr),
          type: q.type || 'mcq',
          marks: q.marks || { cm: 3, im: -1 },
          answerOptions: parseInt(q.answerOptions) || 4,
          subject: subjectKey,
          correctAnswer,
          // Text options (may not exist in BITSAT — image-based)
          optionA: q.optionA || q.a || null,
          optionB: q.optionB || q.b || null,
          optionC: q.optionC || q.c || null,
          optionD: q.optionD || q.d || null,
        };
      });

      if (sectionQuestions.length > 0) {
        sections.push({ name: subjectKey, questions: sectionQuestions });
        allQuestions.push(...sectionQuestions);
      }
    }

    if (allQuestions.length === 0) throw new Error('No questions found in pdfCropperData.');
    return { sections, allQuestions, format: 'BITSAT' };
  }

  // FORMAT B: Generic CBT
  function parseGENERIC(data) {
    const raw = data.questions;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('No questions array found.');

    // Group by section if section field present
    const sectionMap = {};
    raw.forEach((q, idx) => {
      const sec = q.section || q.subject || q.category || 'General';
      if (!sectionMap[sec]) sectionMap[sec] = [];

      const opts = q.options || q.choices || [];
      const optA = Array.isArray(opts) ? (opts[0] || null) : (q.optionA || q.A || null);
      const optB = Array.isArray(opts) ? (opts[1] || null) : (q.optionB || q.B || null);
      const optC = Array.isArray(opts) ? (opts[2] || null) : (q.optionC || q.C || null);
      const optD = Array.isArray(opts) ? (opts[3] || null) : (q.optionD || q.D || null);

      let correctAnswer = q.answer || q.correct || q.correctAnswer || null;
      if (typeof correctAnswer === 'number') correctAnswer = ['A','B','C','D'][correctAnswer] || null;
      if (correctAnswer) correctAnswer = correctAnswer.toString().toUpperCase().trim();

      sectionMap[sec].push({
        que: q.id || q.questionNumber || idx + 1,
        type: 'mcq',
        subject: sec,
        correctAnswer,
        questionText: q.text || q.question || q.questionText || null,
        imageFile: q.image || q.imageFile || q.img || null,
        optionA: optA,
        optionB: optB,
        optionC: optC,
        optionD: optD,
        _originalIndex: idx,
      });
    });

    const sections = Object.entries(sectionMap).map(([name, questions]) => ({ name, questions }));
    const allQuestions = sections.flatMap(s => s.questions);
    return { sections, allQuestions, format: 'GENERIC' };
  }

  // FORMAT C: NTA flat
  function parseNTA(data) {
    const raw = data.questions;
    const sectionMap = {};

    raw.forEach((q, idx) => {
      const sec = q.subject || q.section || 'General';
      if (!sectionMap[sec]) sectionMap[sec] = [];

      const opts = q.options || {};
      let correctAnswer = q.correctOption || q.answer || null;
      if (correctAnswer) correctAnswer = correctAnswer.toString().toUpperCase().trim();

      sectionMap[sec].push({
        que: q.questionNumber || idx + 1,
        type: 'mcq',
        subject: sec,
        correctAnswer,
        questionText: q.questionText || q.text || null,
        imageFile: q.imageFile || q.image || null,
        optionA: opts.A || opts[0] || q.optionA || null,
        optionB: opts.B || opts[1] || q.optionB || null,
        optionC: opts.C || opts[2] || q.optionC || null,
        optionD: opts.D || opts[3] || q.optionD || null,
        _originalIndex: idx,
      });
    });

    const sections = Object.entries(sectionMap).map(([name, questions]) => ({ name, questions }));
    const allQuestions = sections.flatMap(s => s.questions);
    if (allQuestions.length === 0) throw new Error('No questions found in NTA format.');
    return { sections, allQuestions, format: 'NTA' };
  }

  // FORMAT D: Simple text-only with nested sections
  function parseSIMPLE(data) {
    const rawSections = data.sections || [];
    const sections = [];
    const allQuestions = [];
    let globalIdx = 0;

    rawSections.forEach(sec => {
      const sectionQuestions = (sec.questions || []).map((q, idx) => {
        const opts = q.options || q.choices || [];
        let correctAnswer = q.answer || q.correct || null;
        if (correctAnswer) correctAnswer = correctAnswer.toString().toUpperCase().trim();

        globalIdx++;
        return {
          que: q.id || globalIdx,
          type: 'mcq',
          subject: sec.name || 'General',
          correctAnswer,
          questionText: q.question || q.text || null,
          imageFile: q.image || null,
          optionA: Array.isArray(opts) ? opts[0] : (q.optionA || null),
          optionB: Array.isArray(opts) ? opts[1] : (q.optionB || null),
          optionC: Array.isArray(opts) ? opts[2] : (q.optionC || null),
          optionD: Array.isArray(opts) ? opts[3] : (q.optionD || null),
        };
      });
      if (sectionQuestions.length > 0) {
        sections.push({ name: sec.name || 'Section', questions: sectionQuestions });
        allQuestions.push(...sectionQuestions);
      }
    });

    if (allQuestions.length === 0) throw new Error('No questions found in Simple format.');
    return { sections, allQuestions, format: 'SIMPLE' };
  }

  // ─────────────────────────────────────────────────────────
  // IMAGE MAPPING — works for all formats
  // ─────────────────────────────────────────────────────────

  async function mapImages(imageEntries, allQuestions, format, onProgress) {
    const warnings = [];
    const qNumToImages = {}; // qNum -> [{partIdx, entry, name}]

    if (format === 'BITSAT') {
      // BITSAT: Subject__--__QNum__--__PartIdx.png
      let parsedCount = 0;
      imageEntries.forEach(({ path, entry }) => {
        const filename = path.split('/').pop();
        const parsed = parseBitsatFilename(filename);
        if (parsed && !isNaN(parsed.qNum)) {
          parsedCount++;
          if (!qNumToImages[parsed.qNum]) qNumToImages[parsed.qNum] = [];
          qNumToImages[parsed.qNum].push({ partIdx: parsed.partIdx, entry, name: filename });
        }
      });

      if (parsedCount === 0) {
        warnings.push('BITSAT filename pattern not found — falling back to alphabetical order.');
        const sorted = [...imageEntries].sort((a, b) => a.path.localeCompare(b.path));
        allQuestions.forEach((q, idx) => {
          if (sorted[idx]) qNumToImages[q.que] = [{ partIdx: 1, entry: sorted[idx].entry, name: sorted[idx].path.split('/').pop() }];
        });
      }

      // Sort parts
      Object.values(qNumToImages).forEach(parts => parts.sort((a, b) => a.partIdx - b.partIdx));

    } else {
      // Generic/NTA/Simple — try imageFile field first, then index-based fallback
      const imageByName = {};
      imageEntries.forEach(({ path, entry }) => {
        const base = path.split('/').pop();
        imageByName[base.toLowerCase()] = { entry, name: base };
        imageByName[base.replace(/\.[^.]+$/, '').toLowerCase()] = { entry, name: base };
      });

      let unmatched = 0;
      allQuestions.forEach((q, idx) => {
        // Try imageFile field
        if (q.imageFile) {
          const key = q.imageFile.toLowerCase().replace(/\.[^.]+$/, '');
          const found = imageByName[key] || imageByName[q.imageFile.toLowerCase()];
          if (found) {
            qNumToImages[q.que] = [{ partIdx: 1, entry: found.entry, name: found.name }];
            return;
          }
        }
        // Try by question number: q1.png, question_1.png, 1.png, 001.png
        const numStr = String(idx + 1);
        const candidates = [
          `q${numStr}`, `question${numStr}`, `question_${numStr}`,
          numStr, numStr.padStart(2, '0'), numStr.padStart(3, '0'),
          `q${q.que}`, String(q.que),
        ];
        for (const c of candidates) {
          if (imageByName[c]) {
            qNumToImages[q.que] = [{ partIdx: 1, entry: imageByName[c].entry, name: imageByName[c].name }];
            break;
          }
        }
        // Text-only question — no image needed (has questionText)
        if (!qNumToImages[q.que] && !q.questionText) unmatched++;
      });

      // If very few matched but many images, do index-based fallback
      const matched = Object.keys(qNumToImages).length;
      if (matched < allQuestions.length * 0.5 && imageEntries.length > 0 && !allQuestions[0].questionText) {
        warnings.push(`Only ${matched}/${allQuestions.length} images matched by name — using index order fallback.`);
        const sorted = [...imageEntries].sort((a, b) => a.path.localeCompare(b.path));
        allQuestions.forEach((q, idx) => {
          if (!qNumToImages[q.que] && sorted[idx]) {
            qNumToImages[q.que] = [{ partIdx: 1, entry: sorted[idx].entry, name: sorted[idx].path.split('/').pop() }];
          }
        });
      }
    }

    const unmapped = allQuestions.filter(q => !qNumToImages[q.que] && !q.questionText).length;
    if (unmapped > 0) warnings.push(`${unmapped} question(s) have no image — they may be text-only.`);

    return { qNumToImages, warnings };
  }

  // ─────────────────────────────────────────────────────────
  // IMAGE LOADING & STITCHING
  // ─────────────────────────────────────────────────────────

  async function loadImageBlobs(allQuestions, qNumToImages, onProgress) {
    const imageBlobs = {};
    const batchSize = 8;

    for (let i = 0; i < allQuestions.length; i += batchSize) {
      const batch = allQuestions.slice(i, i + batchSize);
      await Promise.all(batch.map(async (q, batchIdx) => {
        const globalIdx = i + batchIdx;
        const parts = qNumToImages[q.que];
        if (!parts || parts.length === 0) return;
        try {
          if (parts.length === 1) {
            const blob = await parts[0].entry.async('blob');
            imageBlobs[globalIdx] = { url: URL.createObjectURL(blob), name: parts[0].name, parts: 1 };
          } else {
            const urls = await Promise.all(parts.map(async p => {
              const blob = await p.entry.async('blob');
              return URL.createObjectURL(blob);
            }));
            const stitched = await stitchImagesVertically(urls);
            urls.forEach(u => URL.revokeObjectURL(u));
            imageBlobs[globalIdx] = { url: stitched, name: parts[0].name, parts: parts.length };
          }
        } catch (e) {
          console.warn(`Image load failed Q${q.que}:`, e);
        }
      }));
      onProgress?.(
        82 + Math.round(((i + batchSize) / allQuestions.length) * 14),
        `Loading images… (${Math.min(i + batchSize, allQuestions.length)}/${allQuestions.length})`
      );
    }

    return imageBlobs;
  }

  function stitchImagesVertically(urls) {
    return new Promise((resolve, reject) => {
      const imgs = urls.map(url => Object.assign(new Image(), { src: url }));
      let loaded = 0;
      const onLoad = () => {
        if (++loaded < imgs.length) return;
        try {
          const w = Math.max(...imgs.map(i => i.naturalWidth || 600));
          const h = imgs.reduce((s, i) => s + (i.naturalHeight || 400), 0);
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          let y = 0;
          imgs.forEach(img => { ctx.drawImage(img, 0, y, w, img.naturalHeight); y += img.naturalHeight; });
          canvas.toBlob(blob => blob
            ? resolve(URL.createObjectURL(blob))
            : reject(new Error('Canvas toBlob failed')), 'image/png');
        } catch (e) { reject(e); }
      };
      imgs.forEach(img => {
        img.onload = onLoad;
        img.onerror = () => reject(new Error(`Image failed: ${img.src}`));
      });
    });
  }

  // ─────────────────────────────────────────────────────────
  // MAIN ENTRY POINT
  // ─────────────────────────────────────────────────────────

  async function processZip(file, onProgress) {
    onProgress?.(5, 'Loading ZIP library…');
    const JSZip = await loadJSZip();
    onProgress?.(15, 'Reading ZIP file…');

    let zip;
    try { zip = await JSZip.loadAsync(file); }
    catch (e) { throw new Error('Could not read ZIP file — is it corrupted?'); }

    onProgress?.(25, 'Scanning contents…');
    const files = [];
    zip.forEach((path, entry) => { if (!entry.dir) files.push({ path, entry }); });

    // Find data.json
    const jsonEntry = files.find(f =>
      f.path.toLowerCase().endsWith('data.json') &&
      !f.path.includes('__MACOSX')
    );
    if (!jsonEntry) throw new Error(
      'No data.json found inside the ZIP.\n\n' +
      'Your ZIP must contain a data.json file.\n' +
      'Supported formats: BITSAT (pdfCropperData), Generic (questions[]), NTA-flat, or Simple (sections[]).\n\n' +
      'Check the README for the exact format specification.'
    );

    onProgress?.(35, 'Parsing exam data…');
    const jsonText = await jsonEntry.entry.async('text');
    let examData;
    try { examData = JSON.parse(jsonText); }
    catch (e) { throw new Error('data.json is not valid JSON — check for syntax errors.'); }

    // Detect format
    const format = detectFormat(examData);
    onProgress?.(42, `Detected format: ${format}…`);

    if (format === 'UNKNOWN') {
      throw new Error(
        'Unrecognised data.json format.\n\n' +
        'NexusExam supports:\n' +
        '• BITSAT: { pdfCropperData, testAnswerKey }\n' +
        '• Generic: { questions: [{text, options, answer, section?}] }\n' +
        '• NTA-flat: { questions: [{questionNumber, subject, options:{A,B,C,D}, correctOption}] }\n' +
        '• Simple: { sections: [{name, questions:[{question, options:[], answer}]}] }'
      );
    }

    // Parse by format
    let parsed;
    if (format === 'BITSAT')  parsed = parseBITSAT(examData);
    else if (format === 'GENERIC') parsed = parseGENERIC(examData);
    else if (format === 'NTA')    parsed = parseNTA(examData);
    else if (format === 'SIMPLE') parsed = parseSIMPLE(examData);

    const { sections, allQuestions } = parsed;
    if (allQuestions.length === 0) throw new Error('No questions could be parsed from data.json.');

    onProgress?.(55, `Found ${allQuestions.length} questions in ${sections.length} section(s)…`);

    // Collect images
    const imageEntries = files.filter(f =>
      isImage(f.path) &&
      !f.path.includes('__MACOSX') &&
      !f.path.split('/').some(seg => seg.startsWith('.'))
    );

    onProgress?.(65, `Mapping ${imageEntries.length} image(s) to questions…`);
    const { qNumToImages, warnings } = await mapImages(imageEntries, allQuestions, format, onProgress);

    onProgress?.(82, 'Loading images into memory…');
    const imageBlobs = await loadImageBlobs(allQuestions, qNumToImages, onProgress);

    onProgress?.(98, 'Finalising…');

    const debugInfo = {
      format,
      totalQuestions: allQuestions.length,
      totalImages: imageEntries.length,
      sections: sections.map(s => ({ name: s.name, count: s.questions.length })),
      warnings,
      mappingTable: allQuestions.slice(0, 30).map((q, idx) => ({
        questionIndex: idx + 1,
        questionNum: q.que,
        imageFile: qNumToImages[q.que]?.[0]?.name || '—',
        parts: qNumToImages[q.que]?.length || 0,
        hasBlob: !!imageBlobs[idx],
        hasText: !!q.questionText,
      })),
    };

    onProgress?.(100, 'Ready!');

    return {
      sections,
      allQuestions,
      imageBlobs,
      debugInfo,
      format,
      examName: examData.testName || examData.name || examData.title ||
                (format === 'BITSAT' ? 'BITSAT Mock Test' : 'Custom Exam'),
      duration: examData.duration || examData.timeLimitSeconds || APP_CONFIG.EXAM_DURATION_SECONDS,
    };
  }

  return { processZip };
})();
