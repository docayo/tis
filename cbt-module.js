// ================================================================
// TIS EMIS — CBT MODULE (portal side)
// File: cbt-module.js
// ================================================================
// Admin features only:
//   • Upload question files (Paper A and Paper B) as .xlsx
//   • Validate each row against the class's subject slots
//   • Upsert by (subject_code, class_level, serial_no, paper)
//   • Timetable editor — class × subject × paper × opens_at × duration
//   • Upload history
//
// The exam itself runs on the LAN server. This file never runs
// during an exam. It only prepares the question bank and the
// timetable before exam day.
// ================================================================

(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) { return esc(s); }
  function toast(msg, kind) {
    if (typeof window.showToast === 'function') { window.showToast(msg, kind); return; }
    console.log('[CBT]', msg);
  }
  function loader(show) {
    if (show && typeof window.startLoader === 'function') window.startLoader();
    if (!show && typeof window.stopLoader === 'function') window.stopLoader();
  }
  function pageLoaderHTML(msg) {
    return '<div class="page-loader"><p>' + esc(msg || 'Loading…') + '</p></div>';
  }
  function emptyHTML(icon, title, sub) {
    return '<div class="empty-state"><i class="fas ' + (icon || 'fa-inbox') + '"></i><h3>' +
           esc(title || 'Nothing here') + '</h3>' +
           (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function sessionName() {
    const p = (window.State && window.State.profile) || {};
    return p.name || 'Operator';
  }

  // ================================================================
  // Boot — wire everything when the CBT tab is first opened
  // ================================================================
  let __cbtWired = false;

  async function initCbtTab() {
    if (!__cbtWired) {
      wireCbtHandlers();
      __cbtWired = true;
    }
    await populateClassPickers();
    await loadBankSummary();
    await loadTimetable();
    await loadUploadHistory();
  }
  window.initCbtTab = initCbtTab;

  function wireCbtHandlers() {
    const dlBtn = $('btnCbtDownloadTemplate');
    if (dlBtn) dlBtn.addEventListener('click', downloadCbtTemplate);

    const upBtn = $('btnCbtUpload');
    const upFile = $('cbtUploadFile');
    if (upBtn && upFile) {
      upBtn.addEventListener('click', function () {
        if (!validateUploadHeader()) return;
        upFile.click();
      });
      upFile.addEventListener('change', function () {
        const f = upFile.files && upFile.files[0];
        if (f) handleCbtUpload(f);
        upFile.value = '';
      });
    }

    const refBtn = $('btnCbtRefreshBank');
    if (refBtn) refBtn.addEventListener('click', function () {
      loadBankSummary();
      loadUploadHistory();
    });

    // Class → Subject cascades for both panels
    const clsBank = $('cbtClass');
    const clsTt   = $('cbtTtClass');
    if (clsBank) clsBank.addEventListener('change', function () { cascadeSubjects('cbtClass', 'cbtSubject'); });
    if (clsTt)   clsTt.addEventListener('change',   function () { cascadeSubjects('cbtTtClass', 'cbtTtSubject'); });

    // Timetable save
    const ttSave = $('btnCbtTtSave');
    if (ttSave) ttSave.addEventListener('click', saveTimetableRow);
  }

  // ================================================================
  // Class / Subject pickers
  // ================================================================
  async function populateClassPickers() {
    const r = await window.TIS.listClasses();
    const classes = (r && r.ok ? r.data : [])
      .filter(function (c) { return c.is_active !== false; })
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });

    ['cbtClass', 'cbtTtClass'].forEach(function (id) {
      const sel = $(id);
      if (!sel) return;
      sel.innerHTML = '<option value="">-- Select --</option>' +
        classes.map(function (c) {
          return '<option value="' + escAttr(c.name) + '">' + esc(c.name) + '</option>';
        }).join('');
    });
  }

  async function cascadeSubjects(classSelId, subjectSelId) {
    const classSel = $(classSelId);
    const subjSel  = $(subjectSelId);
    if (!classSel || !subjSel) return;

    const cls = classSel.value;
    if (!cls) {
      subjSel.innerHTML = '<option value="">-- Select class first --</option>';
      return;
    }

    subjSel.innerHTML = '<option value="">Loading…</option>';

    // Which subjects are assigned to this class? From class_subjects,
    // then resolved against the master subjects list for display names.
    const [csR, subjR] = await Promise.all([
      window.TIS.getClassSubjects(cls),
      window.TIS.listSubjects()
    ]);

    const slots = (csR && csR.ok ? csR.data : []) || [];
    const nameByCode = {};
    ((subjR && subjR.ok ? subjR.data : []) || []).forEach(function (s) {
      nameByCode[s.code] = s.display_name;
    });

    const codes = slots.map(function (s) { return s.subject_code; });
    if (codes.length === 0) {
      subjSel.innerHTML = '<option value="">-- No subjects assigned to this class --</option>';
      return;
    }

    subjSel.innerHTML = '<option value="">-- Select --</option>' +
      codes.map(function (code) {
        const label = (nameByCode[code] || code) + '  (' + code + ')';
        return '<option value="' + escAttr(code) + '">' + esc(label) + '</option>';
      }).join('');
  }
  window.cbtCascadeSubjects = cascadeSubjects;

  // ================================================================
  // Template download
  // ================================================================
  function downloadCbtTemplate() {
    if (typeof XLSX === 'undefined') {
      toast('Excel library not loaded — reload the page.', 'error');
      return;
    }
    const columns = [
      'S/N', 'QUESTION',
      'Option A', 'Option B', 'Option C', 'Option D',
      'Correct Answer', 'Question Mark',
      'Illustration', 'Explanation'
    ];

    const isPaperA = ($('cbtPaper') ? $('cbtPaper').value : 'A') === 'A';

    const sampleA = [
      [1, 'Which of the following is an example of a noun naming a person?',
       'Dog', 'Janet', 'Table', 'Wisdom',
       'B', 1, '', 'A proper noun names a specific person.'],
      [2, 'What is the plural of "child"?',
       'Childs', 'Children', 'Childes', 'Childen',
       'B', 1, '', 'Irregular plural.']
    ];
    const sampleB = [
      [1, '________ is an animal that barks.',
       '', '', '', '',
       'Dog', 1, '', 'Common household animal.'],
      [2, '________ is an animal that climbs trees and eats bananas.',
       '', '', '', '',
       'Monkey', 1, '', 'Primate, often found in the forest.']
    ];

    const ws = XLSX.utils.aoa_to_sheet([
      columns,
      ...(isPaperA ? sampleA : sampleB)
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPaperA ? 'Paper A' : 'Paper B');
    const fname = 'TIS_CBT_' + (isPaperA ? 'PaperA_MCQ' : 'PaperB_OneWord') + '_Template.xlsx';
    XLSX.writeFile(wb, fname);
    toast('Template downloaded.', 'success');
  }

  function validateUploadHeader() {
    const cls = $('cbtClass') ? $('cbtClass').value : '';
    const subj = $('cbtSubject') ? $('cbtSubject').value : '';
    const paper = $('cbtPaper') ? $('cbtPaper').value : '';
    const term = $('cbtTerm') ? $('cbtTerm').value : '';
    const year = $('cbtYear') ? parseInt($('cbtYear').value, 10) : 0;

    const fb = $('cbtUploadFeedback');
    const setFb = function (msg, kind) {
      if (!fb) return;
      fb.style.color = (kind === 'error') ? '#c0392b' : (kind === 'ok' ? '#0d4d26' : '#666');
      fb.textContent = msg || '';
    };

    if (!cls)   { setFb('Pick a class first.', 'error');   return false; }
    if (!subj)  { setFb('Pick a subject.', 'error');        return false; }
    if (!paper) { setFb('Pick a paper (A or B).', 'error'); return false; }
    if (!term)  { setFb('Pick a term.', 'error');           return false; }
    if (!year)  { setFb('Enter a year.', 'error');          return false; }

    setFb('');
    return true;
  }

  // ================================================================
  // Upload handler
  // ================================================================
  async function handleCbtUpload(file) {
    const cls   = $('cbtClass').value;
    const subj  = $('cbtSubject').value;
    const paper = $('cbtPaper').value;
    const term  = $('cbtTerm').value;
    const year  = parseInt($('cbtYear').value, 10);

    const fb = $('cbtUploadFeedback');
    const setFb = function (msg, kind) {
      if (!fb) return;
      fb.style.color = (kind === 'error') ? '#c0392b' : (kind === 'ok' ? '#0d4d26' : '#666');
      fb.textContent = msg || '';
    };

    setFb('Reading ' + file.name + ' …');
    loader(true);
    let wb;
    try {
      wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    } catch (e) {
      loader(false);
      setFb('Could not read the file. Make sure it is a valid .xlsx.', 'error');
      return;
    }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    loader(false);

    if (!rows || rows.length === 0) {
      setFb('The sheet is empty.', 'error');
      return;
    }

    // ---- Validate each row ----
    const errors = [];
    const cleaned = [];
    rows.forEach(function (row, idx) {
      const rowNum = idx + 2;   // header is row 1
      const sn   = Number(row['S/N']);
      const qt   = String(row['QUESTION'] || '').trim();
      const optA = String(row['Option A'] || '').trim();
      const optB = String(row['Option B'] || '').trim();
      const optC = String(row['Option C'] || '').trim();
      const optD = String(row['Option D'] || '').trim();
      const ans  = String(row['Correct Answer'] || '').trim();
      const mrk  = Number(row['Question Mark'] || 1);
      const ill  = String(row['Illustration'] || '').trim();
      const exp  = String(row['Explanation'] || '').trim();

      if (!sn || sn <= 0) { errors.push('Row ' + rowNum + ': S/N must be a positive number.'); return; }
      if (!qt)            { errors.push('Row ' + rowNum + ': QUESTION is empty.'); return; }

      if (paper === 'A') {
        if (!optA || !optB || !optC || !optD) {
          errors.push('Row ' + rowNum + ': Paper A needs Options A–D.'); return;
        }
        const letter = ans.toUpperCase();
        if (!/^[A-D]$/.test(letter)) {
          errors.push('Row ' + rowNum + ': Correct Answer must be A, B, C, or D.'); return;
        }
        cleaned.push({
          subject_code:  subj,
          class_level:   cls,
          serial_no:     sn,
          paper:         'A',
          term_type:     term,
          year:          year,
          question_type: 'OBJECTIVE',
          question_text: qt,
          option_a:      optA,
          option_b:      optB,
          option_c:      optC,
          option_d:      optD,
          correct_option: letter,
          correct_answer: null,
          question_mark: mrk || 1,
          illustration:  ill || null,
          explanation:   exp || null
        });
      } else {
        if (!ans) {
          errors.push('Row ' + rowNum + ': Paper B needs a Correct Answer word.'); return;
        }
        cleaned.push({
          subject_code:  subj,
          class_level:   cls,
          serial_no:     sn,
          paper:         'B',
          term_type:     term,
          year:          year,
          question_type: 'ONE_WORD',
          question_text: qt,
          option_a:      null,
          option_b:      null,
          option_c:      null,
          option_d:      null,
          correct_option: null,
          correct_answer: ans,
          question_mark: mrk || 1,
          illustration:  ill || null,
          explanation:   exp || null
        });
      }
    });

    if (cleaned.length === 0) {
      setFb('No valid rows. ' + errors.length + ' error(s). ' + errors.slice(0, 3).join(' | '), 'error');
      return;
    }

    // ---- Write ----
    setFb('Writing ' + cleaned.length + ' question(s) …');
    loader(true);
    const up = await window.TIS.upsertCbtQuestions(cleaned);
    if (!up || !up.ok) {
      loader(false);
      setFb('Save failed: ' + ((up && up.error) || 'unknown'), 'error');
      return;
    }
    const res = up.data || {};

    // ---- Log the upload ----
    await window.TIS.logCbtUpload({
      filename:       file.name,
      subject_code:   subj,
      class_level:    cls,
      paper:          paper,
      term_type:      term,
      year:           year,
      row_count:      rows.length,
      created_count:  res.created || 0,
      replaced_count: res.updated || 0,
      skipped_count:  errors.length,
      uploaded_by:    sessionName()
    });

    loader(false);

    const summary =
      'Uploaded. ' +
      (res.created || 0) + ' created · ' +
      (res.updated || 0) + ' replaced · ' +
      errors.length + ' skipped.';
    setFb(summary, 'ok');
    toast(summary, 'success');

    if (errors.length) {
      console.warn('[CBT upload errors]', errors);
    }

    loadBankSummary();
    loadUploadHistory();
  }
  window.handleCbtUpload = handleCbtUpload;

  // ================================================================
  // Bank summary — what's in the question bank right now
  // ================================================================
  async function loadBankSummary() {
    const host = $('cbtBankPanel');
    if (!host) return;
    host.innerHTML = pageLoaderHTML('Loading question bank…');

    const r = await window.TIS.listCbtQuestions({});
    if (!r || !r.ok) {
      host.innerHTML = emptyHTML('fa-triangle-exclamation', 'Could not load bank', r && r.error);
      return;
    }
    const questions = r.data || [];
    if (questions.length === 0) {
      host.innerHTML = emptyHTML('fa-database', 'Question bank is empty',
        'Upload a Paper A or Paper B file to start.');
      return;
    }

    // Group: class → subject → paper → count
    const tree = {};
    questions.forEach(function (q) {
      const cls = q.class_level || '—';
      const sub = q.subject_code || '—';
      const pp = q.paper || '—';
      if (!tree[cls]) tree[cls] = {};
      if (!tree[cls][sub]) tree[cls][sub] = {};
      if (!tree[cls][sub][pp]) tree[cls][sub][pp] = 0;
      tree[cls][sub][pp] += 1;
    });

    let html = '<div style="font-weight:800;color:#0d4d26;font-size:15px;margin-bottom:8px;">' +
               '<i class="fas fa-database"></i> Question Bank (' + questions.length + ' questions)</div>';

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:8px;">';
    Object.keys(tree).sort().forEach(function (cls) {
      Object.keys(tree[cls]).sort().forEach(function (sub) {
        Object.keys(tree[cls][sub]).sort().forEach(function (pp) {
          const count = tree[cls][sub][pp];
          html += '<div style="border:1px solid #e0e8e2;border-radius:8px;padding:8px 10px;background:#f7fbf7;">' +
                  '<div style="font-weight:700;color:#0d4d26;font-size:13px;">' + esc(cls) + '</div>' +
                  '<div style="font-size:12px;color:#333;">' + esc(sub) + ' — Paper ' + esc(pp) + '</div>' +
                  '<div style="font-size:11px;color:#666;margin-top:2px;">' + count + ' question(s)</div>' +
                  '</div>';
        });
      });
    });
    html += '</div>';

    host.innerHTML = html;
  }

  // ================================================================
  // Timetable
  // ================================================================
  async function loadTimetable() {
    const host = $('cbtTtList');
    if (!host) return;
    host.innerHTML = pageLoaderHTML('Loading timetable…');

    const r = await window.TIS.listCbtTimetable();
    if (!r || !r.ok) {
      host.innerHTML = emptyHTML('fa-triangle-exclamation', 'Could not load timetable', r && r.error);
      return;
    }
    const rows = r.data || [];
    if (rows.length === 0) {
      host.innerHTML = emptyHTML('fa-clock', 'No sittings scheduled',
        'Add the first one using the form above.');
      return;
    }

    let html = '<div style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#8b6f1f;color:#fff;">' +
            '<th style="text-align:left;padding:6px;">Class</th>' +
            '<th style="text-align:left;padding:6px;">Subject</th>' +
            '<th style="padding:6px;">Paper</th>' +
            '<th style="padding:6px;">Term</th>' +
            '<th style="padding:6px;">Year</th>' +
            '<th style="padding:6px;">Opens at</th>' +
            '<th style="padding:6px;">Duration</th>' +
            '<th style="padding:6px;">Delete</th></tr></thead><tbody>';

    rows.forEach(function (t) {
      const opens = t.opens_at ? new Date(t.opens_at).toLocaleString() : '—';
      html += '<tr>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(t.class_level) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(t.subject_code) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(t.paper) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(t.term_type) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(t.year) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(opens) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:
