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
    const bundleBtn = $('btnCbtDownloadBundle');
    if (bundleBtn) bundleBtn.addEventListener('click', downloadExamBundle);
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
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(t.duration_minutes) + ' min</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' +
          '<button class="btn btn-sm btn-danger" type="button" ' +
          'onclick="cbtDeleteTimetableRow(' + t.id + ')">X</button></td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML = html;
  }

  async function saveTimetableRow() {
    const cls   = $('cbtTtClass').value;
    const subj  = $('cbtTtSubject').value;
    const paper = $('cbtTtPaper').value;
    const term  = $('cbtTtTerm').value;
    const year  = parseInt($('cbtTtYear').value, 10);
    const opens = $('cbtTtOpens').value;
    const dur   = parseInt($('cbtTtDuration').value, 10);

    const fb = $('cbtTtFeedback');
    const setFb = function (msg, kind) {
      if (!fb) return;
      fb.style.color = (kind === 'error') ? '#c0392b' : (kind === 'ok' ? '#0d4d26' : '#666');
      fb.textContent = msg || '';
    };

    if (!cls)   { setFb('Pick a class.', 'error');   return; }
    if (!subj)  { setFb('Pick a subject.', 'error'); return; }
    if (!paper) { setFb('Pick a paper.', 'error');   return; }
    if (!term)  { setFb('Pick a term.', 'error');    return; }
    if (!year)  { setFb('Enter a year.', 'error');   return; }
    if (!opens) { setFb('Pick the opening date and time.', 'error'); return; }
    if (!dur || dur < 5) { setFb('Duration must be at least 5 minutes.', 'error'); return; }

    setFb('Saving…');
    loader(true);
    const r = await window.TIS.upsertCbtTimetable({
      class_level:      cls,
      subject_code:     subj,
      paper:            paper,
      term_type:        term,
      year:             year,
      opens_at:         new Date(opens).toISOString(),
      duration_minutes: dur,
      created_by:       sessionName()
    });
    loader(false);

    if (!r || !r.ok) {
      setFb('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
      return;
    }
    setFb('Saved.', 'ok');
    toast('Timetable saved.', 'success');
    loadTimetable();
  }

  async function cbtDeleteTimetableRow(id) {
    if (!confirm('Delete this timetable entry? The LAN server will no longer open the paper automatically.')) return;
    loader(true);
    const r = await window.TIS.deleteCbtTimetable(id);
    loader(false);
    if (!r || !r.ok) { toast('Delete failed: ' + ((r && r.error) || 'unknown'), 'error'); return; }
    toast('Deleted.', 'success');
    loadTimetable();
  }
  window.cbtDeleteTimetableRow = cbtDeleteTimetableRow;

  // ================================================================
  // Upload history
  // ================================================================
  async function loadUploadHistory() {
    const host = $('cbtUploadHistory');
    if (!host) return;
    host.innerHTML = pageLoaderHTML('Loading history…');

    const r = await window.TIS.listCbtUploads();
    if (!r || !r.ok) {
      host.innerHTML = emptyHTML('fa-history', 'Could not load history', r && r.error);
      return;
    }
    const rows = r.data || [];
    if (rows.length === 0) {
      host.innerHTML = emptyHTML('fa-history', 'No uploads yet');
      return;
    }

    let html = '<div style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">' +
            '<th style="text-align:left;padding:6px;">When</th>' +
            '<th style="text-align:left;padding:6px;">By</th>' +
            '<th style="text-align:left;padding:6px;">File</th>' +
            '<th style="text-align:left;padding:6px;">Class</th>' +
            '<th style="text-align:left;padding:6px;">Subject</th>' +
            '<th style="padding:6px;">Paper</th>' +
            '<th style="padding:6px;">Term</th>' +
            '<th style="padding:6px;">Year</th>' +
            '<th style="padding:6px;">Created</th>' +
            '<th style="padding:6px;">Replaced</th>' +
            '<th style="padding:6px;">Skipped</th>' +
            '</tr></thead><tbody>';
    rows.forEach(function (u) {
      const when = u.uploaded_at ? new Date(u.uploaded_at).toLocaleString() : '—';
      html += '<tr>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(when) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(u.uploaded_by || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(u.filename || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(u.class_level || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(u.subject_code || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(u.paper || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(u.term_type || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(u.year || '') + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + (u.created_count || 0) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + (u.replaced_count || 0) + '</td>' +
        '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + (u.skipped_count || 0) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table></div>';
    host.innerHTML = html;
  }
  // ================================================================
  // Bundle generator — builds bundle.json and downloads it.
  // One click, no console needed.
  // ================================================================
  // ================================================================
  // Bundle generator — with pre-flight check.
  //   1. Reads the bank and the timetable.
  //   2. Builds a coverage grid: every (class, subject, paper)
  //      combination that either has a timetable entry or has
  //      questions in the bank.
  //   3. Shows a modal so the operator can confirm.
  //   4. On confirm, builds bundle.json and downloads it.
  // ================================================================
  async function downloadExamBundle() {
    const btn = $('btnCbtDownloadBundle');
    const fb  = $('cbtUploadFeedback');

    const setFeedback = function (msg, kind) {
      if (!fb) return;
      fb.style.color = (kind === 'error') ? '#c0392b' : (kind === 'ok' ? '#0d4d26' : '#666');
      fb.textContent = msg || '';
    };

    if (btn) btn.disabled = true;
    setFeedback('Reading question bank and timetable…', 'info');
    loader(true);

    try {
      // ---- 1. Active term ----
      const at = await window.TIS.getActiveTerm();
      if (!at || !at.ok || !at.data) {
        setFeedback('No active term set. Set one in the Terms tab first.', 'error');
        return;
      }
      const activeTerm = at.data;

      // ---- 2. All questions ----
      const qR = await window.TIS.listCbtQuestions({});
      if (!qR || !qR.ok) {
        setFeedback('Could not fetch questions: ' + ((qR && qR.error) || 'unknown'), 'error');
        return;
      }
      const allQuestions = qR.data || [];

      // ---- 3. All timetable for the active term ----
      const tR = await window.TIS.listCbtTimetable();
      if (!tR || !tR.ok) {
        setFeedback('Could not fetch timetable: ' + ((tR && tR.error) || 'unknown'), 'error');
        return;
      }
      const activeTT = (tR.data || []).filter(function (t) {
        return t.term_type === activeTerm.term_type &&
               Number(t.year) === Number(activeTerm.year);
      });

      // ---- 4. Group questions by (class, subject, paper), newest session wins ----
      const byKey = {};
      allQuestions.forEach(function (q) {
        const key = q.class_level + '|' + q.subject_code + '|' + q.paper;
        if (!byKey[key]) byKey[key] = { rows: [], newestYear: 0 };
        byKey[key].rows.push(q);
        if (Number(q.year) > byKey[key].newestYear) {
          byKey[key].newestYear = Number(q.year);
        }
      });

      const pickedQuestions = [];
      Object.keys(byKey).forEach(function (k) {
        byKey[k].rows.forEach(function (q) {
          if (Number(q.year) === byKey[k].newestYear) {
            pickedQuestions.push(q);
          }
        });
      });

      // ---- 5. Build the coverage grid ----
      // Every (class, subject, paper) that appears in either
      // the timetable or the bank gets one row.
      const coverage = {};
      activeTT.forEach(function (t) {
        const k = t.class_level + '|' + t.subject_code + '|' + t.paper;
        if (!coverage[k]) coverage[k] = { cls: t.class_level, sub: t.subject_code, paper: t.paper };
        coverage[k].scheduled = true;
        coverage[k].opens_at = t.opens_at;
      });
      Object.keys(byKey).forEach(function (k) {
        const parts = k.split('|');
        if (!coverage[k]) coverage[k] = { cls: parts[0], sub: parts[1], paper: parts[2] };
        coverage[k].questionCount = byKey[k].rows.filter(function (q) {
          return Number(q.year) === byKey[k].newestYear;
        }).length;
      });

      const coverageRows = Object.keys(coverage).map(function (k) {
        const c = coverage[k];
        c.status = (c.scheduled && c.questionCount > 0) ? 'ready'
                 : (c.scheduled && (!c.questionCount || c.questionCount === 0)) ? 'missing'
                 : 'no_timetable';
        return c;
      });

      // Sort by class, then subject, then paper
      coverageRows.sort(function (a, b) {
        if (a.cls !== b.cls) return a.cls.localeCompare(b.cls);
        if (a.sub !== b.sub) return a.sub.localeCompare(b.sub);
        return a.paper.localeCompare(b.paper);
      });

      // ---- 6. Count learners ----
      const lR = await window.TIS.listLearners();
      if (!lR || !lR.ok) {
        setFeedback('Could not fetch learners: ' + ((lR && lR.error) || 'unknown'), 'error');
        return;
      }
      const activeLearners = (lR.data || []).filter(function (l) {
        return !window.learnerIsInactive || !window.learnerIsInactive(l);
      });

      // ---- 7. Show the pre-flight modal ----
      loader(false);
      showBundlePreflightModal({
        term: activeTerm,
        learners: activeLearners,
        questions: pickedQuestions,
        timetable: activeTT,
        coverage: coverageRows,
        setFeedback: setFeedback
      });
    } catch (err) {
      setFeedback('Unexpected error: ' + ((err && err.message) || err), 'error');
      console.error('[CBT bundle]', err);
    } finally {
      if (btn) btn.disabled = false;
      loader(false);
    }
  }
  window.cbtDownloadExamBundle = downloadExamBundle;

  // ================================================================
  // Pre-flight modal
  // ================================================================
  function showBundlePreflightModal(ctx) {
    const term = ctx.term;
    const coverage = ctx.coverage;
    const readyCount   = coverage.filter(function (c) { return c.status === 'ready'; }).length;
    const missingCount = coverage.filter(function (c) { return c.status === 'missing'; }).length;
    const noTtCount    = coverage.filter(function (c) { return c.status === 'no_timetable'; }).length;

    const statusChip = function (s) {
      if (s === 'ready') return '<span style="background:#d4edda;color:#0d4d26;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;">READY</span>';
      if (s === 'missing') return '<span style="background:#f8d7da;color:#721c24;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;">MISSING QUESTIONS</span>';
      if (s === 'no_timetable') return '<span style="background:#fff3cd;color:#8b6f1f;font-size:10px;font-weight:800;padding:2px 8px;border-radius:4px;">NO TIMETABLE</span>';
      return '';
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" style="max-width:820px;max-height:88vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Exam Bundle — Pre-flight Check</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    // Summary bar
    html += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">';
    html += '<div style="background:#e8f5e9;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Ready</div><div style="font-size:22px;font-weight:900;color:#0d4d26;">' + readyCount + '</div></div>';
    html += '<div style="background:#fff5f5;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Missing questions</div><div style="font-size:22px;font-weight:900;color:#c0392b;">' + missingCount + '</div></div>';
    html += '<div style="background:#fff8e1;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">No timetable</div><div style="font-size:22px;font-weight:900;color:#8b6f1f;">' + noTtCount + '</div></div>';
    html += '<div style="background:#f0f0f0;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Learners</div><div style="font-size:22px;font-weight:900;color:#555;">' + ctx.learners.length + '</div></div>';
    html += '</div>';

    html += '<div style="font-size:13px;color:#333;margin-bottom:12px;">';
    html += 'Term: <b>' + esc(term.label) + '</b> · ';
    html += 'Questions: <b>' + ctx.questions.length + '</b> · ';
    html += 'Timetable entries: <b>' + ctx.timetable.length + '</b>';
    html += '</div>';

    // Coverage table
    if (coverage.length > 0) {
      html += '<div style="max-height:340px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead style="position:sticky;top:0;background:#0d4d26;color:#fff;">';
      html += '<tr>' +
              '<th style="text-align:left;padding:6px;">Class</th>' +
              '<th style="text-align:left;padding:6px;">Subject</th>' +
              '<th style="padding:6px;text-align:center;">Paper</th>' +
              '<th style="padding:6px;text-align:center;">Questions</th>' +
              '<th style="padding:6px;text-align:center;">Scheduled</th>' +
              '<th style="padding:6px;text-align:center;">Status</th>' +
              '</tr></thead><tbody>';
      coverage.forEach(function (c) {
        const q = c.questionCount || 0;
        const sched = c.scheduled ? (c.opens_at ? new Date(c.opens_at).toLocaleDateString() : 'yes') : '—';
        html += '<tr>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(c.cls) + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(c.sub) + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(c.paper) + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + q + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(sched) + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + statusChip(c.status) + '</td>' +
              '</tr>';
      });
      html += '</tbody></table></div>';
    } else {
      html += '<div style="background:#fff5f5;border:1px solid #ffcdd2;border-radius:8px;padding:12px;color:#721c24;font-size:13px;">';
      html += '<b>Nothing to bundle.</b> No questions uploaded and no timetable entries for this term.';
      html += '</div>';
    }

    // Warning
    if (missingCount > 0) {
      html += '<div style="margin-top:12px;background:#fff5f5;border-left:4px solid #c0392b;padding:10px 12px;border-radius:6px;font-size:12px;color:#721c24;">';
      html += '<b>' + missingCount + ' paper(s) are scheduled but have no questions.</b> ';
      html += 'The LAN server will refuse to start those papers. ';
      html += 'Upload the missing questions, or remove the timetable entry.';
      html += '</div>';
    }
    if (noTtCount > 0) {
      html += '<div style="margin-top:12px;background:#fff8e1;border-left:4px solid #d4a017;padding:10px 12px;border-radius:6px;font-size:12px;color:#8b6f1f;">';
      html += '<b>' + noTtCount + ' paper(s) have questions but no timetable entry.</b> ';
      html += 'They will be carried in the bundle but stay locked on the LAN server.';
      html += '</div>';
    }

    // Buttons
    html += '<div style="margin-top:16px;text-align:right;">';
    html += '<button class="btn btn-secondary" type="button" onclick="TIS.closeModal()">Cancel</button> ';
    if (coverage.length > 0) {
      html += '<button class="btn btn-gold" type="button" id="btnBundleConfirm">';
      html += '<i class="fas fa-download"></i> Download Bundle';
      html += '</button>';
    }
    html += '</div>';
    html += '</div></div>';

    setHTML('modalContainer', html);

    const confirmBtn = $('btnBundleConfirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        closeModal();
        executeBundleDownload(ctx);
      });
    }
  }

  // ================================================================
  // Actual download, given a confirmed context
  // ================================================================
  function executeBundleDownload(ctx) {
    const term = ctx.term;

    // Questions — newest session per class+subject+paper
    const byKey = {};
    ctx.questions.forEach(function (q) {
      const key = q.class_level + '|' + q.subject_code + '|' + q.paper;
      if (!byKey[key]) byKey[key] = { rows: [], newestYear: 0 };
      byKey[key].rows.push(q);
      if (Number(q.year) > byKey[key].newestYear) byKey[key].newestYear = Number(q.year);
    });
    const pickedQuestions = [];
    Object.keys(byKey).forEach(function (k) {
      byKey[k].rows.forEach(function (q) {
        if (Number(q.year) === byKey[k].newestYear) pickedQuestions.push(q);
      });
    });

    const questionsOut = pickedQuestions.map(function (q) {
      return {
        id: q.id,
        class_level: q.class_level,
        subject_code: q.subject_code,
        paper: q.paper,
        term_type: q.term_type,
        year: q.year,
        serial_no: q.serial_no,
        question_type: q.question_type,
        question_text: q.question_text,
        option_a: q.option_a || null,
        option_b: q.option_b || null,
        option_c: q.option_c || null,
        option_d: q.option_d || null,
        correct_option: q.correct_option || null,
        correct_answer: q.correct_answer || null,
        question_mark: q.question_mark || 1,
        illustration: q.illustration || null,
        explanation: q.explanation || null
      };
    });

    const learnersOut = ctx.learners.map(function (l) {
      return { pin: l.pin, name: l.name, class_name: l.class_name };
    });

    const timetableOut = ctx.timetable.map(function (t) {
      return {
        class_level: t.class_level,
        subject_code: t.subject_code,
        paper: t.paper,
        term_type: t.term_type,
        year: t.year,
        opens_at: t.opens_at,
        duration_minutes: t.duration_minutes
      };
    });

    const bundle = {
      generated_at: new Date().toISOString(),
      generated_by: sessionName(),
      term: { term_type: term.term_type, year: term.year, label: term.label },
      learners: learnersOut,
      questions: questionsOut,
      timetable: timetableOut
    };

    const jsonStr = JSON.stringify(bundle, null, 2);
    const kb = (jsonStr.length / 1024).toFixed(1);

    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'bundle_' + term.term_type + '_' + term.year + '_' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);

    if (ctx.setFeedback) {
      ctx.setFeedback(
        'Bundle ready (' + kb + ' KB) · ' +
        learnersOut.length + ' learners · ' +
        questionsOut.length + ' questions · ' +
        timetableOut.length + ' timetable entries.',
        'ok'
      );
    }
    toast('Exam bundle downloaded.', 'success');
  }
  window.executeBundleDownload = executeBundleDownload;
  // ================================================================
  // Auto-init on switchTab (app.js will call initCbtTab)
  // ================================================================
  console.log('[CBT] cbt-module.js loaded.');

})();
