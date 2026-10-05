// ================================================================
// TIS EMIS — PUBLIC RESULTS PAGE LOGIC
// File: check.js
// Loaded by check.html on /check and /check/<PIN>.
// Uses window.TIS for reads and window.TISReport for rendering.
// ================================================================
(function () {
  'use strict';

  let __current = null;   // { learner, term, year, type, html }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return (s === null || s === undefined ? '' : s).toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setFeedback(msg, kind) {
    const el = $('pubFeedback');
    if (!el) return;
    el.className = 'pub-feedback' + (kind ? ' ' + kind : '');
    el.textContent = msg || '';
  }

  // ----------------------------------------------------------------
  // Read PIN from URL if the page was opened via /check/<PIN>
  // ----------------------------------------------------------------
  function pinFromUrl() {
    const m = window.location.pathname.match(/^\/check\/([^\/?#]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]).toUpperCase();
    return '';
  }

  // ----------------------------------------------------------------
  // The whole report builder, mirroring [S22] in app.js but self-
  // contained so check.html never needs to load app.js.
  // ----------------------------------------------------------------
  function nextTermLabel(termType, year) {
    if (termType === '1st') return { term: '2nd', year: year };
    if (termType === '2nd') return { term: '3rd', year: year };
    return null;
  }

  function watermarkHtml() {
    return '<div class="rc-watermark"><img ' +
      'src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200" alt=""></div>';
  }

  async function buildTermly(learner, term, year) {
    const [popR, attR, scoresR, termR, resumeR, subsR, ratingsR, nextClassR] = await Promise.all([
      window.TIS.getClassPopulation(learner.class_name),
      window.TIS.getAttendanceSummaryForTerm(learner.id, term, year),
      window.TIS.getScoresForTerm(learner.id, term, year),
      window.TIS.getLearnerTermRecord(learner.id, term, year),
      window.TIS.getResumptionDate(term, year),
      window.TIS.listSubjects(),
      window.TIS.getReportRatings(learner.id, term, year),
      window.TIS.getNextClass(learner.class_name)
    ]);

    const pop        = (popR && popR.ok) ? popR.data : 0;
    const att        = (attR && attR.ok) ? attR.data : { opened: 0, present: 0, absent: 0 };
    const scores     = (scoresR && scoresR.ok) ? scoresR.data : [];
    const termRec    = (termR && termR.ok) ? termR.data : null;
    const resume     = (resumeR && resumeR.ok) ? resumeR.data : null;
    const subjects   = (subsR && subsR.ok) ? subsR.data : [];
    const ratings    = (ratingsR && ratingsR.ok) ? ratingsR.data : null;
    const nextClass  = (nextClassR && nextClassR.ok) ? nextClassR.data : null;

    let promotedTo;
    const nextT = nextTermLabel(term, year);
    if (nextT) promotedTo = { term: nextT.term, year: nextT.year };
    else       promotedTo = nextClass || '—';

    const subjectMap = {};
    subjects.forEach(function (s) { subjectMap[s.code] = s.display_name; });

    const scoreMap = {};
    scores.forEach(function (s) { scoreMap[s.subject_code] = s; });

    const csR = await window.TIS.getClassSubjects(learner.class_name);
    const slotOrder = (csR && csR.ok ? csR.data : []).sort(function (a, b) { return a.slot - b.slot; });

    const classLearnersR = await window.TIS.getLearnersForClasses([learner.class_name]);
    const classLearnerIds = (classLearnersR && classLearnersR.ok ? classLearnersR.data : [])
      .map(function (l) { return l.id; });
    const classScoresR = await window.TIS.getScoresForLearners(classLearnerIds, term, year);
    const classScoresMap = (classScoresR && classScoresR.ok && classScoresR.data) ? classScoresR.data : {};

    const perLearner = {};
    Object.keys(classScoresMap).forEach(function (key) {
      const parts = key.split('|');
      const lid = parts[0];
      const row = classScoresMap[key];
      if (!row || row.total == null) return;
      if (!perLearner[lid]) perLearner[lid] = { sum: 0, count: 0 };
      perLearner[lid].sum   += Number(row.total);
      perLearner[lid].count += 1;
    });
    let highestPct = null, lowestPct = null;
    Object.keys(perLearner).forEach(function (lid) {
      const e = perLearner[lid];
      if (e.count === 0) return;
      const p = e.sum / e.count;
      if (highestPct === null || p > highestPct) highestPct = p;
      if (lowestPct  === null || p < lowestPct)  lowestPct  = p;
    });
    const highestPctStr = (highestPct === null) ? '—' : highestPct.toFixed(2);
    const lowestPctStr  = (lowestPct  === null) ? '—' : lowestPct.toFixed(2);

    const cleared = termRec && String(termRec.cleared || '').toLowerCase() === 'yes';
    const coverScores = !cleared;

    let totalCA = 0, totalExam = 0, rowCount = 0;
    let bodyRows = '';
    const chartRows = [];

    slotOrder.forEach(function (slot) {
      const code = slot.subject_code;
      const row = scoreMap[code];
      const t1 = row && row.test1 != null ? Number(row.test1) : null;
      const t2 = row && row.test2 != null ? Number(row.test2) : null;
      const ex = row && row.exam  != null ? Number(row.exam)  : null;
      const total = (t1 || 0) + (t2 || 0) + (ex || 0);
      const grade = row && row.grade ? row.grade : (row ? window.TISReport.bandForTotal(total).grade : '');
      const remark = row && row.remark ? row.remark : (row ? window.TISReport.bandForTotal(total).remark : '');

      if (t1 != null || t2 != null || ex != null) {
        totalCA   += (t1 || 0) + (t2 || 0);
        totalExam += (ex || 0);
        rowCount++;
        chartRows.push({ name: subjectMap[code] || code, total: total, grade: grade });
      }

      bodyRows += '<tr>' +
        '<td class="rc-subj">' + esc(subjectMap[code] || code) + '</td>' +
        '<td class="rc-num">' + (t1 != null ? t1 : '-') + '</td>' +
        '<td class="rc-num">' + (t2 != null ? t2 : '-') + '</td>' +
        '<td class="rc-num">' + (ex != null ? ex : '-') + '</td>' +
        '<td class="rc-num rc-total">' + (rowCount && (t1!=null||t2!=null||ex!=null) ? total : '-') + '</td>' +
        '<td class="rc-num">' + esc(grade) + '</td>' +
        '<td class="rc-remark">' + esc(remark) + '</td>' +
      '</tr>';
    });

    const aggregate = totalCA + totalExam;
    const maxAggregate = rowCount * 100;
    const pct = maxAggregate > 0 ? (aggregate / maxAggregate * 100).toFixed(2) : '0.00';

    const feeText = window.TISReport.buildFeeText(termRec);

    if (coverScores) {
      bodyRows = bodyRows.replace(/<td class="rc-num">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>')
                         .replace(/<td class="rc-num rc-total">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>');
    }

    const html = '' +
      '<div class="results-preview">' +
        watermarkHtml() +
        window.TISReport.resultsHeaderHtml('Statement of Result', learner) +
        window.TISReport.resultsStudentBar(learner, pop, term, year, att) +
        '<div class="rc-body-grid">' +
          '<div class="rc-body-main rc-scroll">' +
            '<table class="rc-table">' +
              '<thead>' +
                '<tr>' +
                  '<th rowspan="2" class="rc-subj">SUBJECTS</th>' +
                  '<th colspan="2">CONTINUOUS ASSESSMENT</th>' +
                  '<th>EXAM</th>' +
                  '<th>TOTAL</th>' +
                  '<th rowspan="2">GRADE</th>' +
                  '<th rowspan="2">REMARKS</th>' +
                '</tr>' +
                '<tr>' +
                  '<th>TEST 1</th>' +
                  '<th>TEST 2</th>' +
                  '<th>(50)</th>' +
                  '<th>(100)</th>' +
                '</tr>' +
                '<tr class="rc-obtainable">' +
                  '<th class="rc-obtainable-lbl">MARKS OBTAINABLE</th>' +
                  '<th>20</th>' +
                  '<th>30</th>' +
                  '<th>50</th>' +
                  '<th>100</th>' +
                  '<th></th>' +
                  '<th></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' + bodyRows + '</tbody>' +
              '<tfoot>' +
                '<tr class="rc-tfoot">' +
                  '<td colspan="3" class="rc-tfoot-label">TOTAL C.A</td>' +
                  '<td class="rc-num">' + (totalExam || '-') + '</td>' +
                  '<td class="rc-num rc-total">' + aggregate + '</td>' +
                  '<td colspan="2"></td>' +
                '</tr>' +
              '</tfoot>' +
            '</table>' +
          '</div>' +
          '<div class="rc-body-side">' +
            window.TISReport.resultsPsychomotorBlock(ratings) +
          '</div>' +
        '</div>' +
        window.TISReport.resultsStatsBlock({
          totalCA:      totalCA,
          totalExam:    totalExam,
          aggregate:    aggregate,
          maxAggregate: maxAggregate,
          pct:          pct,
          highestPct:   highestPctStr,
          lowestPct:    lowestPctStr
        }) +
        window.TISReport.resultsCommentsBlock(
          learner,
          resume,
          feeText,
          ratings,
          promotedTo,
          learner.pin
        ) +
        window.TISReport.resultsBottomRow(chartRows, learner.pin) +
      '</div>';

    return { ok: true, html: html, cleared: cleared, termRec: termRec };
  }

  async function buildSessional(learner, year) {
    const terms = ['1st', '2nd', '3rd'];
    const [popR, subsR, csR, resumeR, nextClassR] = await Promise.all([
      window.TIS.getClassPopulation(learner.class_name),
      window.TIS.listSubjects(),
      window.TIS.getClassSubjects(learner.class_name),
      window.TIS.getResumptionDate('3rd', year),
      window.TIS.getNextClass(learner.class_name)
    ]);
    const pop = (popR && popR.ok) ? popR.data : 0;
    const subjects = (subsR && subsR.ok) ? subsR.data : [];
    const slotOrder = (csR && csR.ok ? csR.data : []).sort(function (a, b) { return a.slot - b.slot; });
    const resume = (resumeR && resumeR.ok) ? resumeR.data : null;
    const nextClass = (nextClassR && nextClassR.ok) ? nextClassR.data : null;
    const promotedTo = nextClass || '—';

    const subjectMap = {};
    subjects.forEach(function (s) { subjectMap[s.code] = s.display_name; });

    const termScores = {};
    const termAtt    = {};
    const termRec    = {};
    const termRating = {};
    for (const t of terms) {
      const [sR, aR, rR, rtR] = await Promise.all([
        window.TIS.getScoresForTerm(learner.id, t, year),
        window.TIS.getAttendanceSummaryForTerm(learner.id, t, year),
        window.TIS.getLearnerTermRecord(learner.id, t, year),
        window.TIS.getReportRatings(learner.id, t, year)
      ]);
      termScores[t] = (sR && sR.ok) ? sR.data : [];
      termAtt[t]    = (aR && aR.ok) ? aR.data : { opened: 0, present: 0, absent: 0 };
      termRec[t]    = (rR && rR.ok) ? rR.data : null;
      termRating[t] = (rtR && rtR.ok) ? rtR.data : null;
    }

    const totalAtt = {
      opened:  terms.reduce(function (s, t) { return s + termAtt[t].opened;  }, 0),
      present: terms.reduce(function (s, t) { return s + termAtt[t].present; }, 0),
      absent:  terms.reduce(function (s, t) { return s + termAtt[t].absent;  }, 0)
    };

    let ratings = null;
    for (let i = terms.length - 1; i >= 0; i--) {
      if (termRating[terms[i]]) { ratings = termRating[terms[i]]; break; }
    }

    // Clearance gate for sessional: covered if ANY term is not cleared.
    let allCleared = true;
    terms.forEach(function (t) {
      const r = termRec[t];
      const c = r && String(r.cleared || '').toLowerCase() === 'yes';
      if (!c) allCleared = false;
    });
    const coverScores = !allCleared;

    let bodyRows = '';
    let sumTerm = [0, 0, 0];
    const chartRows = [];

    slotOrder.forEach(function (slot) {
      const code = slot.subject_code;
      const cells = [];
      let cumulative = 0;

      for (let i = 0; i < terms.length; i++) {
        const arr = termScores[terms[i]] || [];
        const row = arr.find(function (x) { return x.subject_code === code; });
        const total = row && row.total != null ? Number(row.total) : 0;
        cumulative += total;
        cells.push(row && row.total != null ? total : '-');
        sumTerm[i] += total;
      }

      let grade = '', remark = '';
      for (let i = terms.length - 1; i >= 0; i--) {
        const arr = termScores[terms[i]] || [];
        const row = arr.find(function (x) { return x.subject_code === code; });
        if (row && row.grade) { grade = row.grade; remark = row.remark || ''; break; }
      }

      if (cumulative > 0) {
        chartRows.push({
          name: subjectMap[code] || code,
          total: cumulative,
          grade: window.TISReport.bandForTotal(Math.round(cumulative / 3)).grade
        });
      }

      bodyRows += '<tr>' +
        '<td class="rc-subj">' + esc(subjectMap[code] || code) + '</td>' +
        '<td class="rc-num">' + cells[0] + '</td>' +
        '<td class="rc-num">' + cells[1] + '</td>' +
        '<td class="rc-num">' + cells[2] + '</td>' +
        '<td class="rc-num rc-total">' + (cumulative > 0 ? cumulative : '-') + '</td>' +
        '<td class="rc-num">' + esc(grade) + '</td>' +
        '<td class="rc-remark">' + esc(remark) + '</td>' +
      '</tr>';
    });

    if (coverScores) {
      bodyRows = bodyRows.replace(/<td class="rc-num">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>')
                         .replace(/<td class="rc-num rc-total">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>');
    }

    const sessionalTotal = sumTerm[0] + sumTerm[1] + sumTerm[2];
    const maxSessional = slotOrder.length * 300;
    const sessionalPct = maxSessional > 0 ? (sessionalTotal / maxSessional * 100).toFixed(2) : '0.00';

    const classLearnersR = await window.TIS.getLearnersForClasses([learner.class_name]);
    const classLearnerIds = (classLearnersR && classLearnersR.ok ? classLearnersR.data : [])
      .map(function (l) { return l.id; });

    const cumulatives = [];
    for (const lid of classLearnerIds) {
      let sum = 0, count = 0;
      for (const t of terms) {
        const sR = await window.TIS.getScoresForTerm(lid, t, year);
        const arr = (sR && sR.ok) ? sR.data : [];
        arr.forEach(function (r) { if (r.total != null) { sum += Number(r.total); count++; } });
      }
      if (count > 0) cumulatives.push(sum);
    }
    let highestPct = null, lowestPct = null;
    if (cumulatives.length > 0) {
      highestPct = Math.max.apply(null, cumulatives);
      lowestPct  = Math.min.apply(null, cumulatives);
    }
    const highestPctStr = (highestPct === null) ? '—' : String(highestPct);
    const lowestPctStr  = (lowestPct  === null) ? '—' : String(lowestPct);

    const html = '' +
      '<div class="results-preview">' +
        watermarkHtml() +
        window.TISReport.resultsHeaderHtml('Sessional Cumulative Statement of Result', learner) +
        window.TISReport.resultsStudentBar(learner, pop, '3rd', year, totalAtt) +
        '<div class="rc-body-grid">' +
          '<div class="rc-body-main rc-scroll">' +
            '<table class="rc-table">' +
              '<thead>' +
                '<tr>' +
                  '<th rowspan="2" class="rc-subj">SUBJECTS</th>' +
                  '<th>1ST TERM</th>' +
                  '<th>2ND TERM</th>' +
                  '<th>3RD TERM</th>' +
                  '<th>CUMULATIVE</th>' +
                  '<th rowspan="2">GRADE</th>' +
                  '<th rowspan="2">REMARKS</th>' +
                '</tr>' +
                '<tr>' +
                  '<th>(100)</th><th>(100)</th><th>(100)</th><th>(300)</th>' +
                '</tr>' +
                '<tr class="rc-obtainable">' +
                  '<th class="rc-obtainable-lbl">MARKS OBTAINABLE</th>' +
                  '<th>100</th>' +
                  '<th>100</th>' +
                  '<th>100</th>' +
                  '<th>300</th>' +
                  '<th></th>' +
                  '<th></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' + bodyRows + '</tbody>' +
              '<tfoot>' +
                '<tr class="rc-tfoot">' +
                  '<td class="rc-tfoot-label">TOTAL</td>' +
                  '<td class="rc-num">' + sumTerm[0] + '</td>' +
                  '<td class="rc-num">' + sumTerm[1] + '</td>' +
                  '<td class="rc-num">' + sumTerm[2] + '</td>' +
                  '<td class="rc-num rc-total">' + sessionalTotal + '</td>' +
                  '<td colspan="2"></td>' +
                '</tr>' +
              '</tfoot>' +
            '</table>' +
          '</div>' +
          '<div class="rc-body-side">' +
            window.TISReport.resultsPsychomotorBlock(ratings) +
          '</div>' +
        '</div>' +
        window.TISReport.resultsStatsBlock({
          totalCA:      sumTerm[0] + sumTerm[1] + sumTerm[2],
          totalExam:    '—',
          aggregate:    sessionalTotal,
          maxAggregate: maxSessional,
          pct:          sessionalPct,
          highestPct:   highestPctStr,
          lowestPct:    lowestPctStr,
          sessional:    true,
          sumTerm:      sumTerm
        }) +
        window.TISReport.resultsCommentsBlock(
          learner,
          resume,
          '',
          ratings,
          promotedTo,
          learner.pin
        ) +
        window.TISReport.resultsBottomRow(chartRows, learner.pin) +
      '</div>';

    return { ok: true, html: html, cleared: allCleared, termRec: termRec['3rd'] };
  }

  // ----------------------------------------------------------------
  // Load and render
  // ----------------------------------------------------------------
  async function loadReport() {
    const pinEl  = $('pubPin');
    const termEl = $('pubTerm');
    const yearEl = $('pubYear');
    const typeEl = $('pubType');
    const welcome = $('pubWelcome');
    const clearance = $('pubClearance');
    const container = $('pubReportContainer');
    const printRow = $('pubPrintRow');

    const pin  = pinEl  ? pinEl.value.trim().toUpperCase() : '';
    const term = termEl ? termEl.value : '1st';
    const year = yearEl ? parseInt(yearEl.value, 10) : 0;
    const type = typeEl ? typeEl.value : 'termly';

    if (welcome)   welcome.classList.remove('show');
    if (clearance) clearance.classList.remove('show');
    if (printRow)  printRow.style.display = 'none';
    if (container) container.innerHTML = '';

    setFeedback('');
    if (!pin)  { setFeedback('Enter a student PIN.', 'error'); return; }
    if (!year) { setFeedback('Enter a year.', 'error'); return; }

    setFeedback('Loading…');
    try {
      const lr = await window.TIS.getLearnerByPin(pin);
      if (!lr || !lr.ok || !lr.data) {
        setFeedback('No learner found with PIN ' + pin + '.', 'error');
        return;
      }
      const learner = lr.data;

      if (welcome) {
        welcome.classList.add('show');
        const n = $('pubWelcomeName'); if (n) n.textContent = learner.name || '—';
        const c = $('pubWelcomeClass'); if (c) c.textContent = learner.class_name || '—';
        const p = $('pubWelcomePin');  if (p) p.textContent = learner.pin || '—';
      }

      let payload;
      if (type === 'sessional') payload = await buildSessional(learner, year);
      else                      payload = await buildTermly(learner, term, year);

      if (!payload || !payload.ok) {
        setFeedback((payload && payload.error) || 'Could not build the report.', 'error');
        return;
      }

      __current = {
        learner: learner,
        term: term,
        year: year,
        type: type,
        html: payload.html
      };

      if (container) container.innerHTML = payload.html;
      if (printRow)  printRow.style.display = 'block';

      if (!payload.cleared && clearance) clearance.classList.add('show');

      setFeedback('Report loaded.', 'ok');
    } catch (err) {
      setFeedback('Unexpected error: ' + (err && err.message ? err.message : err), 'error');
    }
  }

  function printReport() {
    if (!__current) { setFeedback('Load a report first.', 'error'); return; }
    const w = window.open('', '_blank');
    if (!w) { setFeedback('Allow pop-ups to print.', 'error'); return; }
    const html = __current.html.replace(/<div class="results-preview">/, '<div>');
    w.document.write(
      '<html><head><title>Report — ' + esc(__current.learner.name || '') + '</title>' +
      window.TISReport.resultsPrintCss() +
      '</head><body>' + html + '</body></html>'
    );
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }

  // ----------------------------------------------------------------
  // Boot
  // ----------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    // Default term/year to the active term.
    (async function () {
      try {
        const at = await window.TIS.getActiveTerm();
        if (at && at.ok && at.data) {
          const t = $('pubTerm'); if (t) t.value = at.data.term_type || '1st';
          const y = $('pubYear'); if (y) y.value = String(at.data.year || new Date().getFullYear());
        }
      } catch (e) { /* silent */ }
    })();

    const urlPin = pinFromUrl();
    if (urlPin) {
      const pinEl = $('pubPin');
      if (pinEl) pinEl.value = urlPin;
      // Small delay so the active-term default has settled.
      setTimeout(loadReport, 400);
    }

    const loadBtn = $('pubLoadBtn');
    if (loadBtn) loadBtn.addEventListener('click', loadReport);

    const pinIn = $('pubPin');
    if (pinIn) pinIn.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') loadReport();
    });

    const printBtn = $('pubPrintBtn');
    if (printBtn) printBtn.addEventListener('click', printReport);
  });
})();
