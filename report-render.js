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

  function resultsHeaderHtml(title) {
    return '' +
      '<div class="rc-header">' +
        '<img class="rc-logo" src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200" alt="">' +
        '<div class="rc-header-mid">' +
          '<div class="rc-title-1">THE IDEAL SCHOOLS</div>' +
          '<div class="rc-title-2">PRE-PRIMARY · PRIMARY · SECONDARY</div>' +
          '<div class="rc-addr">ROAD ONE ALUBARIKA ESTATE SOKOTO / BADAGRY EXPRESS WAY</div>' +
          '<div class="rc-addr">08067071557 · 08027270404</div>' +
          '<div class="rc-motto">SCIENTIA EST POTENTIA</div>' +
          '<div class="rc-subtitle">' + esc(title) + '</div>' +
        '</div>' +
        '<img class="rc-logo" src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w200" alt="">' +
      '</div>';
  }

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

  function resultsStatsBlock(totalCA, totalExam, aggregate, maxAgg, pct) {
    return '' +
      '<table class="rc-stats">' +
        '<tr>' +
          '<td class="rc-k">TOTAL C.A</td><td class="rc-v">' + totalCA + '</td>' +
          '<td class="rc-k">TOTAL EXAM</td><td class="rc-v">' + totalExam + '</td>' +
          '<td class="rc-k">AGGREGATE SCORE</td><td class="rc-v">' + aggregate + '/' + maxAgg + '</td>' +
          '<td class="rc-k">PERCENTAGE %</td><td class="rc-v">' + pct + '%</td>' +
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
          '<td class="rc-k">SESSIONAL</td><td class="rc-v">' + sessionalTotal + '/' + maxSessional + ' (' + pct + '%)</td>' +
        '</tr>' +
      '</table>';
  }

  function resultsCommentsBlock(learner, resume, feeText) {
    return '' +
      '<table class="rc-comments">' +
        '<tr>' +
          '<td class="rc-k">TEACHER\'S COMMENT</td>' +
          '<td class="rc-v" colspan="3">Keep it up.</td>' +
        '</tr>' +
        '<tr>' +
          '<td class="rc-k">PRINCIPAL COMMENT</td>' +
          '<td class="rc-v" colspan="3">Well done.</td>' +
        '</tr>' +
        (feeText
          ? '<tr><td class="rc-k">FEE NOTICE</td><td class="rc-v" colspan="3">' + esc(feeText) + '</td></tr>'
          : '') +
        '<tr>' +
          '<td class="rc-k">RESUMPTION DATE</td>' +
          '<td class="rc-v">' + esc(resume || '—') + '</td>' +
          '<td class="rc-k">SCHOOL STAMP</td>' +
          '<td class="rc-v rc-stamp-cell">[seal]</td>' +
        '</tr>' +
      '</table>';
  }

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

  function resultsPrintCss() {
    return '<style>' +
      '@page { size: A4 portrait; margin: 12mm; }' +
      'body { font-family: Arial, sans-serif; color: #111; padding: 16px; }' +
      '.results-preview { border: 1px solid #ccc; padding: 16px; border-radius: 8px; background: #fff; }' +
      '.rc-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid #0b6623; padding-bottom: 8px; margin-bottom: 10px; }' +
      '.rc-header-mid { flex: 1; text-align: center; }' +
      '.rc-title-1 { font-size: 20px; font-weight: 900; color: #0b6623; letter-spacing: 1px; }' +
      '.rc-title-2 { font-size: 11px; letter-spacing: 2px; margin-top: 2px; }' +
      '.rc-addr { font-size: 10px; color: #555; margin-top: 2px; }' +
      '.rc-motto { font-size: 11px; font-style: italic; margin-top: 3px; }' +
      '.rc-subtitle { font-size: 13px; font-weight: 700; margin-top: 6px; background: #0b6623; color: #fff; display: inline-block; padding: 3px 12px; border-radius: 4px; }' +
      '.rc-logo { height: 62px; width: auto; }' +
      '.rc-details, .rc-stats, .rc-comments { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }' +
      '.rc-details td, .rc-stats td, .rc-comments td { border: 1px solid #333; padding: 5px 7px; }' +
      '.rc-k { background: #e8f5e9; font-weight: 700; color: #0b6623; width: 110px; }' +
      '.rc-v { font-weight: 600; }' +
      '.rc-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 6px; }' +
      '.rc-table th, .rc-table td { border: 1px solid #333; padding: 4px 6px; text-align: center; }' +
      '.rc-table thead th { background: #0b6623; color: #fff; font-size: 10px; }' +
      '.rc-table thead tr:nth-child(2) th { background: #1a8a3a; }' +
      '.rc-subj { text-align: left; font-weight: 700; }' +
      '.rc-num { width: 42px; font-weight: 700; }' +
      '.rc-total { background: #e8f5e9; }' +
      '.rc-remark { text-align: left; font-weight: 700; }' +
      '.rc-covered { background: #f0f0f0; color: #999; font-style: italic; }' +
      '.rc-tfoot td { background: #e8f5e9; font-weight: 700; }' +
      '.rc-tfoot-label { text-align: right; }' +
      '.rc-stamp-cell { color: #aaa; font-style: italic; }' +
      '.rc-scroll { overflow-x: auto; }' +
      '@media print { .results-preview { border: none; padding: 0; } body { padding: 0; } }' +
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
    resultsHeaderHtml:     resultsHeaderHtml,
    resultsStudentBar:     resultsStudentBar,
    resultsStatsBlock:     resultsStatsBlock,
    resultsSessionalStats: resultsSessionalStats,
    resultsCommentsBlock:  resultsCommentsBlock,
    buildFeeText:          buildFeeText,
    resultsPrintCss:       resultsPrintCss,
    bandForTotal:          bandForTotal
  };
})();
// ================================================================
// END OF report-render.js
// ================================================================
