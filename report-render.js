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

  const SCHOOL_LOGO_URL = 'https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200';

  // ----------------------------------------------------------------
  // Header band
  // ----------------------------------------------------------------
  function resultsHeaderHtml(title, learner) {
    const photo = learner && learner.photo_url ? learner.photo_url : '';
    const initial = learner && learner.name ? learner.name.charAt(0) : '?';
    const photoHtml = photo
      ? '<div class="rc-photo"><img src="' + esc(photo) + '" alt=""></div>'
      : '<div class="rc-photo rc-photo-empty"><span>' + esc(initial) + '</span></div>';

    return '' +
      '<div class="rc-header">' +
        '<img class="rc-logo" src="' + SCHOOL_LOGO_URL + '" alt="">' +
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
  // Stats block
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
            '<td class="rc-k rc-k-gold">SESSIONAL</td><td class="rc-v rc-v-gold">' + (a.aggregate || 0) + '/' + (a.maxAggregate || 0) + ' (' + (a.pct || '0.00') + '%)</td>' +
          '</tr>' +
          '<tr>' +
            '<td class="rc-k rc-k-gold">AGGREGATE SCORE</td><td class="rc-v rc-v-gold">' + (a.aggregate || 0) + '</td>' +
            '<td class="rc-k rc-k-gold">PERCENTAGE %</td><td class="rc-v rc-v-gold">' + (a.pct || '0.00') + '%</td>' +
            '<td class="rc-k rc-k-blue">HIGHEST PEC %</td><td class="rc-v rc-v-blue">' + (a.highestPct || '—') + '</td>' +
            '<td class="rc-k rc-k-blue">LOWEST PEC %</td><td class="rc-v rc-v-blue">' + (a.lowestPct || '—') + '</td>' +
          '</tr>' +
        '</table>';
    }

    return '' +
      '<table class="rc-stats">' +
        '<tr>' +
          '<td class="rc-k">TOTAL C.A</td><td class="rc-v">' + (a.totalCA || 0) + '</td>' +
          '<td class="rc-k">TOTAL EXAM</td><td class="rc-v">' + (a.totalExam || 0) + '</td>' +
          '<td class="rc-k rc-k-gold">AGGREGATE SCORE</td><td class="rc-v rc-v-gold">' + (a.aggregate || 0) + '/' + (a.maxAggregate || 0) + '</td>' +
          '<td class="rc-k rc-k-gold">PERCENTAGE %</td><td class="rc-v rc-v-gold">' + (a.pct || '0.00') + '%</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k rc-k-blue">HIGHEST PEC %</td><td class="rc-v rc-v-blue">' + (a.highestPct || '—') + '</td>' +
          '<td class="rc-k rc-k-blue">LOWEST PEC %</td><td class="rc-v rc-v-blue">' + (a.lowestPct || '—') + '</td>' +
          '<td colspan="4"></td>' +
        '</tr>' +
      '</table>';
  }

  function resultsSessionalStats(sumTerm, sessionalTotal, maxSessional, pct) {
    return '' +
      '<table class="rc-stats">' +
        '<tr>' +
          '<td class="rc-k">1ST TERM</td><td class="rc-v">' + sumTerm[0] + '</td>' +
          '<td class="rc-k">2ND TERM</td><td class="rc-v">' + sumTerm[1] + '</td>' +
          '<td class="rc-k">3RD TERM</td><td class="rc-v">' + sumTerm[2] + '</td>' +
          '<td class="rc-k rc-k-gold">SESSIONAL</td><td class="rc-v rc-v-gold">' + sessionalTotal + '/' + maxSessional + ' (' + pct + '%)</td>' +
        '</tr>' +
      '</table>';
  }

  // ----------------------------------------------------------------
  // Psychomotor ratings block
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
  //   promotedTo may be either a string (next class) or an object
  //   of shape { term: '2nd', year: 2026 } — both handled here.
  // ----------------------------------------------------------------
  function resultsCommentsBlock(learner, resume, feeText, ratings, promotedTo, lin) {
    const teacherComment   = (ratings && ratings.teacher_comment)   || '—';
    const principalComment = (ratings && ratings.principal_comment) || '—';
    const linValue         = lin || (learner && learner.pin) || '—';

    let promotedLabel = '—';
    if (promotedTo && typeof promotedTo === 'object' && promotedTo.term) {
      promotedLabel = promotedTo.term.toUpperCase() + ' TERM ' + promotedTo.year;
    } else if (typeof promotedTo === 'string' && promotedTo) {
      promotedLabel = promotedTo;
    }

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
          '<td class="rc-v">' + esc(promotedLabel) + '</td>' +
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
        grade === 'A' ? 'linear-gradient(90deg,#1a8a3a,#2e9c4e)' :
        grade === 'B' ? 'linear-gradient(90deg,#2e9c4e,#7bb661)' :
        grade === 'C' ? 'linear-gradient(90deg,#7bb661,#b7d27a)' :
        grade === 'D' ? 'linear-gradient(90deg,#d4a017,#e0b23a)' :
        grade === 'E' ? 'linear-gradient(90deg,#e08e2a,#e0a03a)' :
                        'linear-gradient(90deg,#c0392b,#e05252)';
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
        '<div class="rc-bottom-title rc-bottom-title-blue">QR CODE</div>' +
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
    const other   = num(termRec.bills);
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
  // Print CSS
  // ----------------------------------------------------------------
  function resultsPrintCss() {
    return '<style>' +
      '@page { size: A4 portrait; margin: 12mm; }' +
      'body { font-family: Arial, sans-serif; color: #111; padding: 16px; }' +
      '.results-preview { border: 1px solid #ccc; padding: 16px; border-radius: 8px; background: #fff; position: relative; overflow: hidden; }' +

      // ---- Watermark: rendered as a real <img> inside the preview.
      // Placed at 6% opacity, greyscale, centred behind all content.
      '.rc-watermark { position: absolute; top: 50%; left: 50%; ' +
        'width: 480px; height: 480px; transform: translate(-50%, -50%); ' +
        'opacity: 0.06; filter: grayscale(100%); pointer-events: none; z-index: 0; }' +
      '.rc-watermark img { width: 100%; height: 100%; object-fit: contain; display: block; }' +
      '.results-preview > * { position: relative; z-index: 1; }' +
      '.rc-watermark { z-index: 0; }' +

      // ---- Header band ----
      '.rc-header { display: flex; align-items: center; gap: 12px; ' +
        'border-bottom: 3px solid transparent; ' +
        'border-image: linear-gradient(90deg, #0b6623 0%, #0b6623 45%, #d4a017 70%, #c0392b 85%, #1a3f8f 100%) 1; ' +
        'padding-bottom: 10px; margin-bottom: 12px; }' +
      '.rc-header-mid { flex: 1 1 auto; text-align: center; min-width: 0; }' +
      '.rc-title-1 { font-size: 34px; font-weight: 900; letter-spacing: 2px; line-height: 1.05; ' +
        'background: linear-gradient(90deg, #0b6623 0%, #1a8a3a 30%, #d4a017 65%, #c0392b 90%, #1a3f8f 100%); ' +
        '-webkit-background-clip: text; background-clip: text; color: transparent; ' +
        '-webkit-text-fill-color: transparent; ' +
        'text-shadow: 0 0 0 transparent; }' +
      '.rc-title-2 { font-size: 15px; font-weight: 800; margin-top: 5px; letter-spacing: .3px; ' +
        'background: linear-gradient(90deg, #1a3f8f 0%, #0b6623 40%, #d4a017 80%, #c0392b 100%); ' +
        '-webkit-background-clip: text; background-clip: text; color: transparent; ' +
        '-webkit-text-fill-color: transparent; }' +
      '.rc-addr { font-size: 11px; color: #555; margin-top: 3px; }' +
      '.rc-motto { font-size: 12px; font-style: italic; margin-top: 5px; letter-spacing: 3px; ' +
        'font-weight: 700; color: #1a3f8f; }' +
      '.rc-subtitle { font-size: 14px; font-weight: 800; margin-top: 8px; ' +
        'background: linear-gradient(90deg, #0b6623 0%, #1a8a3a 40%, #d4a017 100%); color: #fff; ' +
        'display: inline-block; padding: 5px 18px; border-radius: 4px; letter-spacing: 1px; ' +
        'box-shadow: 0 2px 4px rgba(11,102,35,0.15); }' +
      '.rc-logo { height: 76px; width: 76px; object-fit: contain; flex: 0 0 auto; }' +
      '.rc-photo { width: 92px; height: 92px; border-radius: 50%; overflow: hidden; ' +
        'border: 3px solid #0b6623; flex: 0 0 auto; background: #e8f5e9; ' +
        'display: flex; align-items: center; justify-content: center; ' +
        'box-shadow: 0 0 0 2px #d4a017 inset; }' +
      '.rc-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }' +
      '.rc-photo-empty span { font-size: 36px; font-weight: 900; color: #0b6623; }' +

      // ---- Details / stats / comments ----
      '.rc-details, .rc-stats, .rc-comments { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }' +
      '.rc-details td, .rc-stats td, .rc-comments td { border: 1px solid #b8c4bb; padding: 6px 8px; vertical-align: middle; }' +
      '.rc-details tr:nth-child(odd) td, .rc-comments tr:nth-child(odd) td { background: #fbfdfb; }' +
      '.rc-details tr:nth-child(even) td, .rc-comments tr:nth-child(even) td { background: #f1f8f2; }' +
      '.rc-stats tr:nth-child(odd) td { background: #fbfdfb; }' +
      '.rc-stats tr:nth-child(even) td { background: #f7f4e8; }' +
      '.rc-k { background: linear-gradient(90deg, #d7ead9, #e6f2e7) !important; font-weight: 700; color: #0b6623; width: 110px; letter-spacing: .3px; }' +
      '.rc-k-gold { background: linear-gradient(90deg, #f7ecd0, #fbf5e3) !important; color: #8a6a10 !important; }' +
      '.rc-k-blue { background: linear-gradient(90deg, #d6e3f5, #e6eefb) !important; color: #1a3f8f !important; }' +
      '.rc-v { font-weight: 600; }' +
      '.rc-v-gold { background: #fbf5e3 !important; color: #6f5409; font-weight: 700; }' +
      '.rc-v-blue { background: #eaf1fc !important; color: #1a3f8f; font-weight: 700; }' +

      // ---- Subject table ----
      '.rc-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 0; }' +
      '.rc-table th, .rc-table td { border: 1px solid #b8c4bb; padding: 5px 6px; text-align: center; }' +
      '.rc-table thead th { background: linear-gradient(90deg, #0b6623, #1a8a3a); color: #fff; font-size: 10px; letter-spacing: .3px; font-weight: 700; }' +
      '.rc-table thead tr:nth-child(2) th { background: linear-gradient(90deg, #1a8a3a, #2e9c4e); }' +
      '.rc-table thead tr.rc-obtainable th { background: linear-gradient(90deg, #f7ecd0, #fbf5e3); color: #8a6a10; font-size: 10px; font-weight: 700; }' +
      '.rc-table tbody tr:nth-child(odd) td { background: #fbfdfb; }' +
      '.rc-table tbody tr:nth-child(even) td { background: #f1f8f2; }' +
      '.rc-obtainable-lbl { text-align: right; }' +
      '.rc-subj { text-align: left; font-weight: 700; padding-left: 4px !important; }' +
      '.rc-num { width: 42px; font-weight: 700; }' +
      '.rc-total { background: linear-gradient(90deg, #eaf6ec, #f7ecd0) !important; font-weight: 800; color: #0b6623; }' +
      '.rc-remark { text-align: left; font-weight: 700; }' +
      '.rc-covered { background: #f0f0f0 !important; color: #999; font-style: italic; }' +
      '.rc-tfoot td { background: linear-gradient(90deg, #d7ead9, #f7ecd0) !important; font-weight: 700; }' +
      '.rc-tfoot-label { text-align: right; }' +

      // ---- Psychomotor table ----
      '.rc-psy { width: 100%; border-collapse: collapse; font-size: 9px; }' +
      '.rc-psy-head { background: linear-gradient(90deg, #0b6623, #1a8a3a); color: #fff; font-weight: 700; padding: 6px 6px; text-align: center; letter-spacing: .3px; border: 1px solid #0b6623; font-size: 9.5px; }' +
      '.rc-psy-lbl { background: linear-gradient(90deg, #d7ead9, #e6f2e7); font-weight: 700; color: #0b6623; padding: 4px 6px; border: 1px solid #b8c4bb; text-align: left; font-size: 9px; letter-spacing: .2px; white-space: nowrap; }' +
      '.rc-psy-val { padding: 4px 6px; border: 1px solid #b8c4bb; text-align: center; font-weight: 700; font-size: 9px; color: #1a3f8f; }' +
      '.rc-psy-row-a .rc-psy-val { background: #fbfdfb; }' +
      '.rc-psy-row-b .rc-psy-val { background: #eaf1fc; }' +

      // ---- Body layout ----
      '.rc-body-grid { display: flex; gap: 8px; align-items: flex-start; }' +
      '.rc-body-main { flex: 1 1 auto; min-width: 0; overflow-x: auto; }' +
      '.rc-body-side { flex: 0 0 215px; max-width: 215px; }' +
      '.rc-scroll { overflow-x: auto; }' +

      // ---- Bottom row ----
      '.rc-bottom-grid { display: flex; gap: 10px; margin-top: 12px; align-items: stretch; }' +
      '.rc-bottom-cell { border: 1px solid #b8c4bb; border-radius: 6px; overflow: hidden; flex: 1 1 0; min-width: 0; background: #fff; display: flex; flex-direction: column; }' +
      '.rc-bottom-title { background: linear-gradient(90deg, #0b6623, #1a8a3a); color: #fff; font-weight: 700; font-size: 10px; padding: 5px 8px; text-align: center; letter-spacing: .5px; }' +
      '.rc-bottom-title-blue { background: linear-gradient(90deg, #1a3f8f, #2f5fb0); }' +
      '.rc-bottom-body { padding: 8px; flex: 1 1 auto; }' +
      '.rc-bottom-stamp { display: flex; align-items: center; justify-content: center; }' +
      '.rc-stamp-img { display: block; max-height: 92px; max-width: 100%; height: auto; width: auto; margin: 0 auto; }' +
      '.rc-bottom-chart { display: flex; flex-direction: column; gap: 4px; }' +
      '.rc-chart-row { display: flex; align-items: center; gap: 6px; font-size: 9px; }' +
      '.rc-chart-lbl { flex: 0 0 66px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #333; font-weight: 600; }' +
      '.rc-chart-track { flex: 1 1 auto; height: 10px; background: #eef4ef; border: 1px solid #d7ead9; border-radius: 3px; overflow: hidden; }' +
      '.rc-chart-bar { height: 100%; }' +
      '.rc-chart-val { flex: 0 0 22px; text-align: right; font-weight: 700; color: #0b6623; }' +
      '.rc-chart-empty { text-align: center; color: #888; font-size: 11px; padding: 20px 0; }' +
      '.rc-bottom-qr { display: flex; flex-direction: column; align-items: center; justify-content: center; }' +
      '.rc-qr-img { width: 96px; height: 96px; display: block; }' +
      '.rc-qr-caption { font-size: 10px; font-weight: 700; color: #1a3f8f; margin-top: 6px; letter-spacing: .5px; }' +

      '@media print { .results-preview { border: none; padding: 0; } body { padding: 0; } ' +
        '.rc-watermark { opacity: 0.04; } }' +
    '</style>';
  }

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
