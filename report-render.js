// ================================================================
// TIS EMIS — SHARED REPORT RENDERER
// File: report-render.js
// Loaded by index.html (internal Results tab) and check.html
// (public results page). Exposes window.TISReport.
// ================================================================
(function () {
  'use strict';

  function esc(s) {
    return (s === null || s === undefined ? '' : s).toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ----------------------------------------------------------------
  // Header band (school name, address, motto, subtitle)
  //   Left  : school logo
  //   Centre: school identity, widened to fill the page width
  //   Right : learner photo (circle), replacing the ministry logo
  // ----------------------------------------------------------------
  function resultsHeaderHtml(title, learner) {
    const photo = learner && learner.photo_url ? learner.photo_url : '';
    const initial = learner && learner.name ? learner.name.charAt(0) : '?';
    const photoHtml = photo
      ? '<div class="rc-photo"><img src="' + esc(photo) + '" alt=""></div>'
      : '<div class="rc-photo rc-photo-empty"><span>' + esc(initial) + '</span></div>';

    return '' +
      '<div class="rc-header">' +
        '<img class="rc-logo" src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200" alt="">' +
        '<div class="rc-header-mid">' +
          '<div class="rc-title-1">THE IDEAL SCHOOLS</div>' +
          '<div class="rc-title-2">The Ideal Secondary School &mdash; The Ideal Kiddies School</div>' +
          '<div class="rc-addr">ROAD ONE ALUBARIKA ESTATE SOKOTO / BADAGRY EXPRESS WAY</div>' +
          '<div class="rc-addr">08067071557 &middot; 08027270404</div>' +
          '<div class="rc-motto">SCIENTIA EST POTENTIA</div>' +
          '<div class="rc-subtitle">' + esc(title) + '</div>' +
        '</div>' +
        photoHtml +
      '</div>';
  }

  // ----------------------------------------------------------------
  // Student detail bar
  // ----------------------------------------------------------------
  function resultsStudentBar(learner, pop, term, year, att) {
    return '' +
      '<table class="rc-details">' +
        '<tr>' +
          '<td class="rc-k">NAME</td><td class="rc-v" colspan="3">' + esc(learner.name || '') + '</td>' +
          '<td class="rc-k">CLASS</td><td class="rc-v">' + esc(learner.class_name || '') + '</td>' +
          '<td class="rc-k">CLASS POP.</td><td class="rc-v">' + esc(String(pop || 0)) + '</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">GENDER</td><td class="rc-v">' + esc(learner.gender || '') + '</td>' +
          '<td class="rc-k">TERM</td><td class="rc-v">' + esc(term.toUpperCase()) + '</td>' +
          '<td class="rc-k">SESSION</td><td class="rc-v">' + year + '/' + (year + 1) + '</td>' +
          '<td class="rc-k">TIMES OPENED</td><td class="rc-v">' + att.opened + '</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">PIN</td><td class="rc-v">' + esc(learner.pin || '') + '</td>' +
          '<td class="rc-k">TIMES PRESENT</td><td class="rc-v">' + att.present + '</td>' +
          '<td class="rc-k">TIMES ABSENT</td><td class="rc-v">' + att.absent + '</td>' +
          '<td colspan="2"></td>' +
        '</tr>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Stats block — accepts an object from app.js.
  // ----------------------------------------------------------------
  function resultsStatsBlock(args) {
    const a = args || {};
    const sessional = !!a.sessional;

    if (sessional) {
      const sumTerm = a.sumTerm || [0, 0, 0];
      return '' +
        '<table class="rc-stats">' +
          '<tr>' +
            '<td class="rc-k">1ST TERM</td><td class="rc-v">' + sumTerm[0] + '</td>' +
            '<td class="rc-k">2ND TERM</td><td class="rc-v">' + sumTerm[1] + '</td>' +
            '<td class="rc-k">3RD TERM</td><td class="rc-v">' + sumTerm[2] + '</td>' +
            '<td class="rc-k">SESSIONAL</td><td class="rc-v">' + (a.aggregate || 0) + '/' + (a.maxAggregate || 0) + ' (' + (a.pct || '0.00') + '%)</td>' +
          '</tr>' +
          '<tr>' +
            '<td class="rc-k">AGGREGATE SCORE</td><td class="rc-v">' + (a.aggregate || 0) + '</td>' +
            '<td class="rc-k">PERCENTAGE %</td><td class="rc-v">' + (a.pct || '0.00') + '%</td>' +
            '<td class="rc-k">HIGHEST PEC %</td><td class="rc-v">' + (a.highestPct || '—') + '</td>' +
            '<td class="rc-k">LOWEST PEC %</td><td class="rc-v">' + (a.lowestPct || '—') + '</td>' +
          '</tr>' +
        '</table>';
    }

    return '' +
      '<table class="rc-stats">' +
        '<tr>' +
          '<td class="rc-k">TOTAL C.A</td><td class="rc-v">' + (a.totalCA || 0) + '</td>' +
          '<td class="rc-k">TOTAL EXAM</td><td class="rc-v">' + (a.totalExam || 0) + '</td>' +
          '<td class="rc-k">AGGREGATE SCORE</td><td class="rc-v">' + (a.aggregate || 0) + '/' + (a.maxAggregate || 0) + '</td>' +
          '<td class="rc-k">PERCENTAGE %</td><td class="rc-v">' + (a.pct || '0.00') + '%</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">HIGHEST PEC %</td><td class="rc-v">' + (a.highestPct || '—') + '</td>' +
          '<td class="rc-k">LOWEST PEC %</td><td class="rc-v">' + (a.lowestPct || '—') + '</td>' +
          '<td colspan="4"></td>' +
        '</tr>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Legacy sessional stats — kept for compatibility.
  // ----------------------------------------------------------------
  function resultsSessionalStats(sumTerm, sessionalTotal, maxSessional, pct) {
    return '' +
      '<table class="rc-stats">' +
        '<tr>' +
          '<td class="rc-k">1ST TERM</td><td class="rc-v">' + sumTerm[0] + '</td>' +
          '<td class="rc-k">2ND TERM</td><td class="rc-v">' + sumTerm[1] + '</td>' +
          '<td class="rc-k">3RD TERM</td><td class="rc-v">' + sumTerm[2] + '</td>' +
          '<td class="rc-k">SESSIONAL</td><td class="rc-v">' + sessionalTotal + '/' + maxSessional + ' (' + pct + '%)</td>' +
        '</tr>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Psychomotor ratings block — its own table, styled in the same
  // Word-grid aesthetic as the subject table.
  // ----------------------------------------------------------------
  const PSYCHOMOTOR_FIELDS = [
    { key: 'leadership',    label: 'LEADERSHIP' },
    { key: 'hardwork',      label: 'HARDWORK' },
    { key: 'neatness',      label: 'NEATNESS' },
    { key: 'politeness',    label: 'POLITENESS' },
    { key: 'punctuality',   label: 'PUNCTUALITY' },
    { key: 'interaction',   label: 'INTERACTION' },
    { key: 'honesty',       label: 'HONESTY' },
    { key: 'communication', label: 'COMMUNICATION' },
    { key: 'reading_club',  label: 'READING CLUB' },
    { key: 'perseverance',  label: 'PERSEVERANCE' }
  ];

  function resultsPsychomotorBlock(ratings) {
    const r = (ratings && ratings.ratings) ? ratings.ratings : {};
    let rows = '';
    PSYCHOMOTOR_FIELDS.forEach(function (f, i) {
      const val = r[f.key] || '—';
      const band = (i % 2 === 0) ? 'rc-psy-row-a' : 'rc-psy-row-b';
      rows += '<tr class="' + band + '">' +
        '<td class="rc-psy-lbl">' + esc(f.label) + '</td>' +
        '<td class="rc-psy-val">' + esc(val) + '</td>' +
      '</tr>';
    });
    return '' +
      '<table class="rc-psy">' +
        '<thead>' +
          '<tr><th colspan="2" class="rc-psy-head">PSYCHOMOTOR RATINGS</th></tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Comments, fee notice, PROMOTED TO, LIN, RESUMPTION DATE.
  // School stamp has moved out — it now lives in the bottom row.
  // ----------------------------------------------------------------
  function resultsCommentsBlock(learner, resume, feeText, ratings, promotedTo, lin) {
    const teacherComment   = (ratings && ratings.teacher_comment)   || '—';
    const principalComment = (ratings && ratings.principal_comment) || '—';
    const linValue         = lin || (learner && learner.pin) || '—';

    return '' +
      '<table class="rc-comments">' +
        '<tr>' +
          '<td class="rc-k">TEACHER\'S COMMENT</td>' +
          '<td class="rc-v" colspan="3">' + esc(teacherComment) + '</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">PRINCIPAL COMMENT</td>' +
          '<td class="rc-v" colspan="3">' + esc(principalComment) + '</td>' +
        '</tr>' +
        (feeText
          ? '<tr><td class="rc-k">FEE NOTICE</td><td class="rc-v" colspan="3">' + esc(feeText) + '</td></tr>'
          : '') +
        '<tr>' +
          '<td class="rc-k">PROMOTED TO</td>' +
          '<td class="rc-v">' + esc(promotedTo || '—') + '</td>' +
          '<td class="rc-k">LIN</td>' +
          '<td class="rc-v">' + esc(linValue) + '</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">RESUMPTION DATE</td>' +
          '<td class="rc-v" colspan="3">' + esc(resume || '—') + '</td>' +
        '</tr>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Bottom row: SCHOOL STAMP | PERFORMANCE CHART | QR CODE
  // ----------------------------------------------------------------
  function resultsStampBlock() {
    return '' +
      '<div class="rc-bottom-cell">' +
        '<div class="rc-bottom-title">SCHOOL STAMP</div>' +
        '<div class="rc-bottom-body rc-bottom-stamp">' +
          '<img class="rc-stamp-img" ' +
            'src="https://ndsroviwrfjbgaucajri.supabase.co/storage/v1/object/public/TISAssets/stamp%20and%20signed.gif" ' +
            'alt="School stamp">' +
        '</div>' +
      '</div>';
  }

  function resultsPerformanceChart(subjects) {
    const rows = Array.isArray(subjects) ? subjects : [];
    if (rows.length === 0) {
      return '' +
        '<div class="rc-bottom-cell">' +
          '<div class="rc-bottom-title">PERFORMANCE CHART</div>' +
          '<div class="rc-bottom-body rc-bottom-chart"><div class="rc-chart-empty">No scores yet</div></div>' +
        '</div>';
    }

    const maxTotal = 100;
    let bars = '';
    rows.forEach(function (row) {
      const name  = row.name || '';
      const total = Number(row.total || 0);
      const pct   = Math.max(0, Math.min(100, (total / maxTotal) * 100));
      const grade = row.grade || '';
      const colour =
        grade === 'A' ? '#1a8a3a' :
        grade === 'B' ? '#2e9c4e' :
        grade === 'C' ? '#7bb661' :
        grade === 'D' ? '#d4a017' :
        grade === 'E' ? '#e08e2a' : '#c0392b';
      bars += '<div class="rc-chart-row">' +
        '<div class="rc-chart-lbl" title="' + esc(name) + '">' + esc(name) + '</div>' +
        '<div class="rc-chart-track">' +
          '<div class="rc-chart-bar" style="width:' + pct.toFixed(1) + '%;background:' + colour + ';"></div>' +
        '</div>' +
        '<div class="rc-chart-val">' + (total || 0) + '</div>' +
      '</div>';
    });

    return '' +
      '<div class="rc-bottom-cell">' +
        '<div class="rc-bottom-title">PERFORMANCE CHART</div>' +
        '<div class="rc-bottom-body rc-bottom-chart">' + bars + '</div>' +
      '</div>';
  }

  function resultsQRCode(pin) {
    const pinUp = String(pin || '').toUpperCase();
    const url   = window.location.origin + '/check/' + encodeURIComponent(pinUp);
    const img   = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=' +
                  encodeURIComponent(url);
    return '' +
      '<div class="rc-bottom-cell">' +
        '<div class="rc-bottom-title">QR CODE</div>' +
        '<div class="rc-bottom-body rc-bottom-qr">' +
          '<img src="' + esc(img) + '" alt="QR" class="rc-qr-img">' +
          '<div class="rc-qr-caption">' + esc(pinUp) + '</div>' +
        '</div>' +
      '</div>';
  }

  function resultsBottomRow(subjects, pin) {
    return '' +
      '<div class="rc-bottom-grid">' +
        resultsStampBlock() +
        resultsPerformanceChart(subjects) +
        resultsQRCode(pin) +
      '</div>';
  }

  // ----------------------------------------------------------------
  // Fee notice line
  // ----------------------------------------------------------------
  function buildFeeText(termRec) {
    if (!termRec) return '';
    const parts = [];
    const num = function (v) { return Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0; };
    const tuition = num(termRec.tuition);
    const other   = num(termRec.other_bills_major);
    const books   = num(termRec.books);
    const minor   = num(termRec.other_bills_minor);
    if (tuition) parts.push('Tuition ₦' + tuition.toLocaleString());
    if (other)   parts.push('Other ₦' + other.toLocaleString());
    if (books)   parts.push('Books ₦' + books.toLocaleString());
    if (minor)   parts.push('Minor ₦' + minor.toLocaleString());
    if (termRec.balance_cf) parts.push('Balance B/F ₦' + num(termRec.balance_cf).toLocaleString());
    return parts.length ? parts.join(' · ') : '';
  }

  // ----------------------------------------------------------------
  // Print CSS — Word-grid table aesthetic throughout.
  // ----------------------------------------------------------------
  function resultsPrintCss() {
    return '<style>' +
      '@page { size: A4 portrait; margin: 12mm; }' +
      'body { font-family: Arial, sans-serif; color: #111; padding: 16px; }' +
      '.results-preview { border: 1px solid #ccc; padding: 16px; border-radius: 8px; background: #fff; }' +

      // ---- Header band: logo | wide centre text | learner photo ----
      '.rc-header { display: flex; align-items: center; gap: 12px; border-bottom: 3px solid #0b6623; padding-bottom: 10px; margin-bottom: 12px; }' +
      '.rc-header-mid { flex: 1 1 auto; text-align: center; min-width: 0; }' +
      '.rc-title-1 { font-size: 26px; font-weight: 900; color: #0b6623; letter-spacing: 1.5px; }' +
      '.rc-title-2 { font-size: 13px; font-weight: 700; margin-top: 3px; color: #0b6623; }' +
      '.rc-addr { font-size: 11px; color: #555; margin-top: 2px; }' +
      '.rc-motto { font-size: 11px; font-style: italic; margin-top: 4px; letter-spacing: 2px; }' +
      '.rc-subtitle { font-size: 13px; font-weight: 700; margin-top: 8px; background: #0b6623; color: #fff; display: inline-block; padding: 4px 14px; border-radius: 4px; }' +
      '.rc-logo { height: 72px; width: 72px; object-fit: contain; flex: 0 0 auto; }' +
      '.rc-photo { width: 90px; height: 90px; border-radius: 50%; overflow: hidden; border: 3px solid #0b6623; flex: 0 0 auto; background: #e8f5e9; display: flex; align-items: center; justify-content: center; }' +
      '.rc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '.rc-photo-empty span { font-size: 34px; font-weight: 900; color: #0b6623; }' +

      // ---- Details / stats / comments: Word-grid style ----
      '.rc-details, .rc-stats, .rc-comments { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }' +
      '.rc-details td, .rc-stats td, .rc-comments td { border: 1px solid #b8c4bb; padding: 6px 8px; vertical-align: middle; }' +
      '.rc-details tr:nth-child(odd) td, .rc-comments tr:nth-child(odd) td { background: #fbfdfb; }' +
      '.rc-details tr:nth-child(even) td, .rc-comments tr:nth-child(even) td { background: #f1f8f2; }' +
      '.rc-k { background: #d7ead9 !important; font-weight: 700; color: #0b6623; width: 110px; letter-spacing: .3px; }' +
      '.rc-v { font-weight: 600; }' +

      // ---- Subject table: Word-grid style ----
      '.rc-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 0; }' +
      '.rc-table th, .rc-table td { border: 1px solid #b8c4bb; padding: 5px 6px; text-align: center; }' +
      '.rc-table thead th { background: #0b6623; color: #fff; font-size: 10px; letter-spacing: .3px; font-weight: 700; }' +
      '.rc-table thead tr:nth-child(2) th { background: #1a8a3a; }' +
      '.rc-table thead tr.rc-obtainable th { background: #eaf6ec; color: #0b6623; font-size: 10px; font-weight: 700; }' +
      '.rc-table tbody tr:nth-child(odd) td { background: #fbfdfb; }' +
      '.rc-table tbody tr:nth-child(even) td { background: #f1f8f2; }' +
      '.rc-obtainable-lbl { text-align: right; }' +
      '.rc-subj { text-align: left; font-weight: 700; }' +
      '.rc-num { width: 42px; font-weight: 700; }' +
      '.rc-total { background: #eaf6ec !important; font-weight: 800; }' +
      '.rc-remark { text-align: left; font-weight: 700; }' +
      '.rc-covered { background: #f0f0f0 !important; color: #999; font-style: italic; }' +
      '.rc-tfoot td { background: #d7ead9 !important; font-weight: 700; }' +
      '.rc-tfoot-label { text-align: right; }' +

      // ---- Psychomotor table: Word-grid style, its own frame ----
      '.rc-psy { width: 100%; border-collapse: collapse; font-size: 10px; }' +
      '.rc-psy-head { background: #0b6623; color: #fff; font-weight: 700; padding: 6px 8px; text-align: center; letter-spacing: .3px; border: 1px solid #0b6623; }' +
      '.rc-psy-lbl { background: #d7ead9; font-weight: 700; color: #0b6623; padding: 5px 8px; border: 1px solid #b8c4bb; text-align: left; }' +
      '.rc-psy-val { padding: 5px 8px; border: 1px solid #b8c4bb; text-align: center; font-weight: 600; }' +
      '.rc-psy-row-a .rc-psy-val { background: #fbfdfb; }' +
      '.rc-psy-row-b .rc-psy-val { background: #f1f8f2; }' +

      // ---- Body layout: subject table + psychomotor side by side ----
      '.rc-body-grid { display: flex; gap: 8px; align-items: flex-start; }' +
      '.rc-body-main { flex: 1 1 auto; min-width: 0; overflow-x: auto; }' +
      '.rc-body-side { flex: 0 0 175px; max-width: 175px; }' +
      '.rc-scroll { overflow-x: auto; }' +

      // ---- Bottom row: stamp | performance chart | QR ----
      '.rc-bottom-grid { display: flex; gap: 10px; margin-top: 12px; align-items: stretch; }' +
      '.rc-bottom-cell { border: 1px solid #b8c4bb; border-radius: 6px; overflow: hidden; flex: 1 1 0; min-width: 0; background: #fff; display: flex; flex-direction: column; }' +
      '.rc-bottom-title { background: #0b6623; color: #fff; font-weight: 700; font-size: 10px; padding: 5px 8px; text-align: center; letter-spacing: .5px; }' +
      '.rc-bottom-body { padding: 8px; flex: 1 1 auto; }' +
      '.rc-bottom-stamp { display: flex; align-items: center; justify-content: center; }' +
      '.rc-stamp-img { display: block; max-height: 90px; max-width: 100%; height: auto; width: auto; margin: 0 auto; }' +
      '.rc-bottom-chart { display: flex; flex-direction: column; gap: 4px; }' +
      '.rc-chart-row { display: flex; align-items: center; gap: 6px; font-size: 9px; }' +
      '.rc-chart-lbl { flex: 0 0 66px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; font-weight: 600; }' +
      '.rc-chart-track { flex: 1 1 auto; height: 10px; background: #eef4ef; border: 1px solid #d7ead9; border-radius: 3px; overflow: hidden; }' +
      '.rc-chart-bar { height: 100%; }' +
      '.rc-chart-val { flex: 0 0 22px; text-align: right; font-weight: 700; color: #0b6623; }' +
      '.rc-chart-empty { text-align: center; color: #888; font-size: 11px; padding: 20px 0; }' +
      '.rc-bottom-qr { display: flex; flex-direction: column; align-items: center; justify-content: center; }' +
      '.rc-qr-img { width: 96px; height: 96px; display: block; }' +
      '.rc-qr-caption { font-size: 10px; font-weight: 700; color: #0b6623; margin-top: 6px; letter-spacing: .5px; }' +

      '@media print { .results-preview { border: none; padding: 0; } body { padding: 0; } }' +
    '</style>';
  }

  // ----------------------------------------------------------------
  // Score band helper
  // ----------------------------------------------------------------
  function bandForTotal(total) {
    if (total >= 80) return { grade: 'A', remark: 'EXCELLENT' };
    if (total >= 70) return { grade: 'B', remark: 'VERY GOOD' };
    if (total >= 60) return { grade: 'C', remark: 'GOOD' };
    if (total >= 50) return { grade: 'D', remark: 'FAIR' };
    if (total >= 40) return { grade: 'E', remark: 'POOR' };
    return { grade: 'F', remark: 'FAIL' };
  }

  window.TISReport = {
    resultsHeaderHtml:       resultsHeaderHtml,
    resultsStudentBar:       resultsStudentBar,
    resultsStatsBlock:       resultsStatsBlock,
    resultsSessionalStats:   resultsSessionalStats,
    resultsPsychomotorBlock: resultsPsychomotorBlock,
    resultsCommentsBlock:    resultsCommentsBlock,
    resultsStampBlock:       resultsStampBlock,
    resultsPerformanceChart: resultsPerformanceChart,
    resultsQRCode:           resultsQRCode,
    resultsBottomRow:        resultsBottomRow,
    buildFeeText:            buildFeeText,
    resultsPrintCss:         resultsPrintCss,
    bandForTotal:            bandForTotal
  };
})();
// ================================================================
// END OF report-render.js
// ================================================================
