// ================================================================
// TIS EMIS — ACADEMIC CALENDAR MODULE (frontend)
// File: calendar-module.js
// ================================================================
// SECTION MAP:
//   [CAL-FE-01] CONFIG + BACKEND URL
//   [CAL-FE-02] JSONP HELPER (queries)
//   [CAL-FE-03] FILE UPLOAD (doPost)
//   [CAL-FE-04] CALENDAR TAB RENDER
//   [CAL-FE-05] UPLOAD MODAL
//   [CAL-FE-06] REVIEW + COMMIT
//   [CAL-FE-07] PASTE FALLBACK
//   [CAL-FE-08] HOLIDAY ADJUSTER
//   [CAL-FE-09] PUBLIC API
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [CAL-FE-01] CONFIG
  // ================================================================
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';
  let uploadedParsed = null;
  let uploadedSource = null;

  function getSession() {
    const p = (window.State && window.State.profile) || {};
    return { userId: p.operator_id || '', userName: p.name || '' };
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    console.log('[CAL]', msg);
  }
  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  // ================================================================
  // [CAL-FE-02] JSONP HELPER
  // ================================================================
  function calCall(fnName) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve) {
      const cbName = 'cal_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      let settled = false;
      let scriptEl = null;
      function cleanup() {
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      }
      window[cbName] = function (data) {
        if (settled) return;
        settled = true; cleanup();
        resolve(data || { success: false, message: 'Empty response' });
      };
      const url = BACKEND_URL +
                  '?action=' + encodeURIComponent(fnName) +
                  '&args=' + encodeURIComponent(JSON.stringify(args)) +
                  '&callback=' + encodeURIComponent(cbName);
      scriptEl = document.createElement('script');
      scriptEl.src = url;
      scriptEl.onerror = function () {
        if (settled) return;
        settled = true; cleanup();
        resolve({ success: false, message: 'Network error.' });
      };
      setTimeout(function () {
        if (settled) return;
        settled = true; cleanup();
        resolve({ success: false, message: 'Timeout.' });
      }, 25000);
      document.head.appendChild(scriptEl);
    });
  }

  // ================================================================
  // [CAL-FE-03] FILE UPLOAD (doPost)
  // ================================================================
  async function uploadCalendarFile(file) {
    if (!file) return;

    const status = document.getElementById('cal_uploadStatus');
    if (status) status.textContent = 'Reading file...';

    const base64 = await new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = function () { resolve(String(r.result).split(',')[1]); };
      r.onerror = function () { reject(new Error('File read failed.')); };
      r.readAsDataURL(file);
    });

    if (status) status.textContent = 'Uploading to Drive and parsing...';

    try {
      const resp = await fetch(BACKEND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'CAL_upload',
          fn: 'CAL_uploadViaPost',
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          base64: base64,
          session: getSession()
        })
      });
      const data = await resp.json();

      if (!data || !data.success) {
        if (status) status.textContent = 'Parse failed: ' + (data && (data.message || data.error) || 'unknown');
        showToast('Calendar parse failed. Use the paste fallback.', 'warning');
        showPasteFallback(true);
        return;
      }

      uploadedParsed = data;
      uploadedSource = file.name;
      if (status) status.textContent = 'Parsed OK. Review the details below.';
      renderReviewPanel(data);
    } catch (err) {
      if (status) status.textContent = 'Upload error: ' + err.message;
      showPasteFallback(true);
    }
  }

  // ================================================================
  // [CAL-FE-04] CALENDAR TAB RENDER
  // ================================================================
  async function renderCalendarTab() {
    const container = document.getElementById('calendarContent');
    if (!container) return;
    container.innerHTML = '<div class="page-loader"><p>Loading calendar...</p></div>';

    const r = await calCall('CAL_getFullCalendar');
    if (!r || !r.success) {
      container.innerHTML = '<div class="empty-state"><h3>Could not load calendar</h3><p>' +
                            escapeHtml((r && r.message) || 'unknown') + '</p></div>';
      return;
    }

    const years = r.years || [];
    const events = r.events || [];

    if (!events.length) {
      container.innerHTML =
        '<div class="card-bg">' +
        '<h3 style="color:#0d4d26;">No calendar uploaded yet</h3>' +
        '<p>Click <b>Upload Calendar</b> above to add this academic year\'s calendar. ' +
        'Once uploaded, all terms, weeks, and holidays will be populated automatically.</p>' +
        '</div>';
      return;
    }

    let html = '';
    years.forEach(function (y, idx) {
      const yearEvents = events.filter(function (e) { return e.academicYear === y; });
      const openAttr = idx === 0 ? ' open' : '';
      html += '<details class="cal-year"' + openAttr + ' style="margin-bottom:12px;">';
      html += '<summary style="cursor:pointer;font-weight:700;font-size:16px;background:#0d4d26;color:#fff;padding:10px 14px;border-radius:6px;">';
      html += '📅 Academic Year ' + escapeHtml(y) + ' (' + yearEvents.length + ' events)';
      html += '</summary>';
      html += '<div class="card-bg" style="margin-top:8px;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Date</th>' +
              '<th style="text-align:left;padding:6px;">Day</th>' +
              '<th style="text-align:left;padding:6px;">Type</th>' +
              '<th style="text-align:left;padding:6px;">Description</th>' +
              '<th style="text-align:center;padding:6px;">Holiday</th>' +
              '<th style="text-align:center;padding:6px;">Action</th></tr></thead><tbody>';
      yearEvents.forEach(function (e) {
        const d = new Date(e.date + 'T00:00:00');
        const dayName = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
        html += '<tr>';
        html += '<td style="padding:5px;">' + escapeHtml(e.date) + '</td>';
        html += '<td style="padding:5px;">' + escapeHtml(dayName) + '</td>';
        html += '<td style="padding:5px;">' + escapeHtml(e.eventType) + '</td>';
        html += '<td style="padding:5px;">' + escapeHtml(e.description) + '</td>';
        html += '<td style="padding:5px;text-align:center;">' + (e.isHoliday ? '✅' : '—') + '</td>';
        html += '<td style="padding:5px;text-align:center;">';
        if (e.isHoliday) {
          html += '<button type="button" class="btn btn-sm btn-warning" onclick="CAL.openHolidayAdjuster(\'' +
                  escapeHtml(e.date) + '\',\'' + escapeHtml(e.holidayName || e.description || '') + '\')">Adjust</button>';
        }
        html += '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div></details>';
    });

    container.innerHTML = html;
  }

  // ================================================================
  // [CAL-FE-05] UPLOAD MODAL
  // ================================================================
  function openUploadModal() {
    const html =
      '<div class="modal-overlay" onclick="if(event.target===this)CAL.closeModal()">' +
      '<div class="modal-box" style="max-width:600px;" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><h2>Upload Academic Calendar</h2>' +
        '<button class="close-btn" onclick="CAL.closeModal()">&times;</button></div>' +
        '<p style="font-size:12px;color:#555;">Upload a PDF, DOC, DOCX, or TXT calendar. ' +
        'The app will detect the academic year, term dates, weeks and holidays automatically.</p>' +
        '<div id="cal_uploadZone" style="border:2px dashed #0d4d26;border-radius:8px;padding:30px;text-align:center;cursor:pointer;background:#f3f9ff;">' +
          '<i class="fas fa-cloud-upload-alt" style="font-size:36px;color:#0d4d26;"></i>' +
          '<p style="margin-top:10px;font-weight:700;">Click to select file</p>' +
          '<p style="font-size:11px;color:#666;">PDF, DOC, DOCX, TXT — up to 5MB</p>' +
          '<input type="file" id="cal_fileInput" accept=".pdf,.doc,.docx,.txt" style="display:none;">' +
        '</div>' +
        '<div id="cal_uploadStatus" style="margin-top:10px;font-size:12px;color:#0d4d26;font-weight:600;"></div>' +
        '<div id="cal_reviewPanel" style="margin-top:12px;"></div>' +
        '<div id="cal_pasteFallback" style="display:none;margin-top:16px;">' +
          '<label style="font-weight:700;font-size:12px;">Fallback: Paste calendar text</label>' +
          '<textarea id="cal_pasteBox" rows="6" style="width:100%;font-family:monospace;font-size:11px;" placeholder="Paste the calendar text here..."></textarea>' +
          '<button type="button" class="btn btn-warning" style="margin-top:6px;" onclick="CAL.parsePasted()">Parse Pasted Text</button>' +
        '</div>' +
        '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-secondary" onclick="CAL.closeModal()">Close</button>' +
          '<button class="btn btn-success" id="cal_commitBtn" disabled onclick="CAL.commitUpload()">Commit to Calendar</button>' +
        '</div>' +
      '</div></div>';

    let host = document.getElementById('calModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'calModalHost';
      document.body.appendChild(host);
    }
    host.innerHTML = html;

    const zone = document.getElementById('cal_uploadZone');
    const fileInput = document.getElementById('cal_fileInput');
    zone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) {
      const f = e.target.files[0];
      if (f) uploadCalendarFile(f);
    });
  }

  // ================================================================
  // [CAL-FE-06] REVIEW + COMMIT
  // ================================================================
  function renderReviewPanel(data) {
    const panel = document.getElementById('cal_reviewPanel');
    if (!panel) return;

    let html = '<div style="background:#f3f9ff;border-radius:8px;padding:10px;">';
    html += '<div style="font-weight:700;color:#0d4d26;">Detected Academic Year: <b>' +
            escapeHtml(data.academicYear || '—') + '</b></div>';
    html += '<div style="margin-top:6px;font-weight:700;">Terms found: ' + ((data.terms || []).length) + '</div>';

    (data.terms || []).forEach(function (t) {
      html += '<div style="font-size:12px;margin-left:12px;">• ' +
              escapeHtml(t.label) + ': ' + escapeHtml(t.startDate) + ' to ' + escapeHtml(t.endDate) +
              ' (' + (t.weeks || []).length + ' weeks)</div>';
    });

    const holidays = (data.events || []).filter(function (e) { return e.isHoliday; });
    html += '<div style="margin-top:6px;font-weight:700;">Holidays detected: ' + holidays.length + '</div>';
    holidays.slice(0, 10).forEach(function (h) {
      html += '<div style="font-size:12px;margin-left:12px;">• ' + escapeHtml(h.date) + ' — ' +
              escapeHtml(h.holidayName || h.description) + '</div>';
    });

    html += '</div>';
    panel.innerHTML = html;

    const commitBtn = document.getElementById('cal_commitBtn');
    if (commitBtn) commitBtn.disabled = false;
  }

  async function commitUpload() {
    if (!uploadedParsed) { showToast('No parsed calendar to commit.'); return; }
    const commitBtn = document.getElementById('cal_commitBtn');
    if (commitBtn) { commitBtn.disabled = true; commitBtn.textContent = 'Committing...'; }

    const r = await calCall('CAL_commitParsedCalendar', {
      parsed: uploadedParsed,
      sourceFileName: uploadedSource,
      session: getSession()
    });

    if (r && r.success) {
      showToast('Calendar committed. Terms and weeks updated.', 'success');
      closeModal();
      renderCalendarTab();
    } else {
      showToast('Commit failed: ' + ((r && r.message) || 'unknown'), 'error');
      if (commitBtn) { commitBtn.disabled = false; commitBtn.textContent = 'Commit to Calendar'; }
    }
  }

  // ================================================================
  // [CAL-FE-07] PASTE FALLBACK
  // ================================================================
  function showPasteFallback(show) {
    const el = document.getElementById('cal_pasteFallback');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  async function parsePasted() {
    const box = document.getElementById('cal_pasteBox');
    if (!box || !box.value.trim()) { showToast('Paste some text first.'); return; }

    // Create a text file from the paste and send through the same path
    const blob = new Blob([box.value], { type: 'text/plain' });
    const f = new File([blob], 'pasted_calendar_' + Date.now() + '.txt', { type: 'text/plain' });
    await uploadCalendarFile(f);
  }

  // ================================================================
  // [CAL-FE-08] HOLIDAY ADJUSTER
  // ================================================================
  function openHolidayAdjuster(date, name) {
    const html =
      '<div class="modal-overlay" onclick="if(event.target===this)CAL.closeModal()">' +
      '<div class="modal-box" style="max-width:460px;" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><h2>Holiday Adjuster</h2>' +
        '<button class="close-btn" onclick="CAL.closeModal()">&times;</button></div>' +
        '<div style="font-size:13px;margin-bottom:10px;">' +
          'Current holiday: <b>' + escapeHtml(name || 'Public Holiday') + '</b><br>' +
          'Date: <b>' + escapeHtml(date) + '</b>' +
        '</div>' +
        '<div class="form-group"><label style="font-weight:600;font-size:12px;">Action</label>' +
          '<select id="cal_adjAction" style="width:100%;">' +
            '<option value="move">Move to a different date</option>' +
            '<option value="remove">Cancel this holiday (make it a normal school day)</option>' +
          '</select>' +
        '</div>' +
        '<div class="form-group" id="cal_adjNewDateWrap">' +
          '<label style="font-weight:600;font-size:12px;">New Date</label>' +
          '<input type="date" id="cal_adjNewDate" style="width:100%;">' +
        '</div>' +
        '<div class="form-group">' +
          '<label style="font-weight:600;font-size:12px;">Note (optional)</label>' +
          '<input type="text" id="cal_adjNote" style="width:100%;" placeholder="Reason for adjustment">' +
        '</div>' +
        '<div style="text-align:right;display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
          '<button class="btn btn-secondary" onclick="CAL.closeModal()">Cancel</button>' +
          '<button class="btn btn-success" onclick="CAL.submitHolidayAdjustment(\'' +
            escapeHtml(date) + '\')">Apply</button>' +
        '</div>' +
      '</div></div>';

    let host = document.getElementById('calModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'calModalHost';
      document.body.appendChild(host);
    }
    host.innerHTML = html;

    const action = document.getElementById('cal_adjAction');
    const newWrap = document.getElementById('cal_adjNewDateWrap');
    action.addEventListener('change', function () {
      newWrap.style.display = action.value === 'remove' ? 'none' : 'block';
    });
  }

  async function submitHolidayAdjustment(oldDate) {
    const action = (document.getElementById('cal_adjAction') || {}).value || 'move';
    const newDate = (document.getElementById('cal_adjNewDate') || {}).value || '';
    const note = (document.getElementById('cal_adjNote') || {}).value || '';

    if (action === 'move' && !newDate) { showToast('Pick a new date.'); return; }
    if (action === 'move' && !confirm('Move holiday from ' + oldDate + ' to ' + newDate + '?')) return;
    if (action === 'remove' && !confirm('Cancel this holiday? ' + oldDate + ' becomes a normal school day.')) return;

    const r = await calCall('CAL_adjustHoliday', {
      oldDate: oldDate,
      newDate: newDate,
      action: action,
      note: note,
      session: getSession()
    });

    if (r && r.success) {
      showToast(r.message, 'success');
      closeModal();
      renderCalendarTab();
    } else {
      showToast('Failed: ' + ((r && r.message) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // [CAL-FE-09] PUBLIC API
  // ================================================================
  function closeModal() {
    const host = document.getElementById('calModalHost');
    if (host) host.innerHTML = '';
  }

  window.CAL = {
    openUploadModal: openUploadModal,
    renderCalendarTab: renderCalendarTab,
    closeModal: closeModal,
    commitUpload: commitUpload,
    parsePasted: parsePasted,
    openHolidayAdjuster: openHolidayAdjuster,
    submitHolidayAdjustment: submitHolidayAdjustment
  };

  console.log('[CAL] Academic Calendar module loaded.');

})();
