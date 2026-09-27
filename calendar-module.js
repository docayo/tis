// ================================================================
// TIS EMIS — ACADEMIC CALENDAR MODULE (frontend)
// File: calendar-module.js
// ================================================================
// SECTION MAP:
//   [CAL-FE-01] CONFIG
//   [CAL-FE-02] JSONP HELPER
//   [CAL-FE-03] DRIVE IMPORT
//   [CAL-FE-04] CALENDAR TAB RENDER
//   [CAL-FE-05] UPLOAD MODAL
//   [CAL-FE-06] REVIEW + DUPLICATE CHECK + COMMIT
//   [CAL-FE-07] PASTE FALLBACK
//   [CAL-FE-08] HOLIDAY ADJUSTER
//   [CAL-FE-09] PUBLIC API
// ================================================================

(function () {
  'use strict';

  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';
  let uploadedParsed = null;
  let uploadedSource = null;
  window.__lastUploadResponse = null;

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

  // [CAL-FE-02] JSONP HELPER
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
        resolve({ success: false, message: 'Timeout (60s).' });
      }, 60000);
      document.head.appendChild(scriptEl);
    });
  }

  // [CAL-FE-03] DRIVE IMPORT
  async function importFromDrive(driveInput) {
    if (!driveInput || !driveInput.trim()) { showToast('Paste a Drive link or file ID first.'); return; }

    const status = document.getElementById('cal_uploadStatus');
    if (status) status.textContent = 'Fetching from Drive and parsing...';

    const r = await calCall('CAL_handleUploadFromDrive_', {
      driveUrl: driveInput.trim(),
      session: getSession()
    });
    window.__lastUploadResponse = r;

    if (!r || !r.success) {
      if (status) status.textContent = 'Import failed: ' + ((r && (r.message || r.error)) || 'unknown');
      return;
    }

    if (!r.academicYear || !r.terms || !r.terms.length) {
      if (status) status.textContent = 'Imported but not parsed. Try the paste fallback below.';
      showPasteFallback(true);
      return;
    }

    uploadedParsed = r;
    uploadedSource = r.fileName || driveInput;
    if (status) status.textContent = 'Parsed OK (' + (r.extractMethod || 'unknown') + '). Review below.';
    await checkAndRenderReview(r);
  }

  // [CAL-FE-04] CALENDAR TAB RENDER
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
      container.innerHTML = '<div class="card-bg"><h3 style="color:#0d4d26;">No calendar uploaded yet</h3>' +
        '<p>Click <b>Import Calendar</b> above to import this academic year\'s calendar from Google Drive.</p></div>';
      return;
    }
    let html = '';
    years.forEach(function (y, idx) {
      const yearEvents = events.filter(function (e) { return e.academicYear === y; });
      const openAttr = idx === 0 ? ' open' : '';
      html += '<details class="cal-year"' + openAttr + ' style="margin-bottom:12px;">';
      html += '<summary style="cursor:pointer;font-weight:700;font-size:16px;background:#0d4d26;color:#fff;padding:10px 14px;border-radius:6px;">';
      html += '📅 Academic Year ' + escapeHtml(y) + ' (' + yearEvents.length + ' events)';
      html += '</summary><div class="card-bg" style="margin-top:8px;">';
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
        html += '<tr><td style="padding:5px;">' + escapeHtml(e.date) + '</td>' +
                '<td style="padding:5px;">' + escapeHtml(dayName) + '</td>' +
                '<td style="padding:5px;">' + escapeHtml(e.eventType) + '</td>' +
                '<td style="padding:5px;">' + escapeHtml(e.description) + '</td>' +
                '<td style="padding:5px;text-align:center;">' + (e.isHoliday ? '✅' : '—') + '</td>' +
                '<td style="padding:5px;text-align:center;">';
        if (e.isHoliday) {
          html += '<button type="button" class="btn btn-sm btn-warning" onclick="CAL.openHolidayAdjuster(\'' +
                  escapeHtml(e.date) + '\',\'' + escapeHtml(e.holidayName || e.description || '') + '\')">Adjust</button>';
        }
        html += '</td></tr>';
      });
      html += '</tbody></table></div></details>';
    });
    container.innerHTML = html;
  }

  // [CAL-FE-05] UPLOAD MODAL (Drive-first)
  function openUploadModal() {
    uploadedParsed = null;
    uploadedSource = null;

    const html =
      '<div class="modal-overlay" onclick="if(event.target===this)CAL.closeModal()">' +
      '<div class="modal-box" style="max-width:600px;" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><h2>Import Academic Calendar</h2>' +
        '<button class="close-btn" onclick="CAL.closeModal()">&times;</button></div>' +
        '<p style="font-size:12px;color:#555;">Paste a Google Drive link to a PDF, DOC, DOCX, or TXT calendar. ' +
        'The file must be shared as "Anyone with the link can view".</p>' +

        '<div class="form-group" style="margin-bottom:12px;">' +
          '<label style="font-weight:700;font-size:12px;">Google Drive Link or File ID</label>' +
          '<input type="text" id="cal_driveUrl" placeholder="https://drive.google.com/file/d/.../view" style="width:100%;">' +
        '</div>' +

        '<div style="text-align:right;margin-bottom:12px;">' +
          '<button class="btn btn-success" onclick="CAL.importFromDriveClick()">Import from Drive</button>' +
        '</div>' +

        '<div id="cal_uploadStatus" style="margin-top:10px;font-size:12px;color:#0d4d26;font-weight:600;"></div>' +
        '<div id="cal_reviewPanel" style="margin-top:12px;"></div>' +

        '<details id="cal_pasteFallback" style="margin-top:16px;">' +
          '<summary style="cursor:pointer;font-weight:700;font-size:12px;color:#0d4d26;">Fallback: Paste calendar text</summary>' +
          '<textarea id="cal_pasteBox" rows="6" style="width:100%;font-family:monospace;font-size:11px;margin-top:6px;" placeholder="Paste the calendar text here..."></textarea>' +
          '<button type="button" class="btn btn-warning" style="margin-top:6px;" onclick="CAL.parsePasted()">Parse Pasted Text</button>' +
        '</details>' +

        '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">' +
          '<button class="btn btn-secondary" onclick="CAL.closeModal()">Close</button>' +
          '<button class="btn btn-success" id="cal_commitBtn" disabled onclick="CAL.commitUpload()">Commit to Calendar</button>' +
        '</div>' +
      '</div></div>';

    let host = document.getElementById('calModalHost');
    if (!host) { host = document.createElement('div'); host.id = 'calModalHost'; document.body.appendChild(host); }
    host.innerHTML = html;
  }

  function importFromDriveClick() {
    const el = document.getElementById('cal_driveUrl');
    if (el) importFromDrive(el.value);
  }

  // [CAL-FE-06] REVIEW + DUPLICATE CHECK + COMMIT
  async function checkAndRenderReview(data) {
    const year = data.academicYear;
    window.__dupCheckResult = null;
    if (year) {
      const chk = await calCall('CAL_checkYearExists', year);
      if (chk && chk.success && chk.exists) window.__dupCheckResult = chk;
    }
    renderReviewPanel(data);
  }

  function renderReviewPanel(data) {
    const panel = document.getElementById('cal_reviewPanel');
    if (!panel) return;
    const dup = window.__dupCheckResult;
    let html = '';
    if (dup && dup.exists) {
      html += '<div style="background:#fef3c7;border:2px solid #f59e0b;border-radius:8px;padding:10px;margin-bottom:10px;">' +
              '<div style="font-weight:700;color:#92400e;">⚠️ This academic year already exists</div>' +
              '<div style="font-size:12px;color:#78350f;margin-top:4px;">' +
              'Academic year <b>' + escapeHtml(data.academicYear) + '</b> already has <b>' + dup.rowCount + '</b> events.<br>' +
              'What do you want to do?</div>' +
              '<div style="display:flex;gap:8px;margin-top:8px;">' +
              '<button type="button" class="btn btn-danger btn-sm" onclick="CAL.setCommitMode(\'replace\')">Replace All</button>' +
              '<button type="button" class="btn btn-warning btn-sm" onclick="CAL.setCommitMode(\'append\')">Add to Existing</button>' +
              '<button type="button" class="btn btn-secondary btn-sm" onclick="CAL.cancelUpload()">Cancel</button>' +
              '</div>' +
              '<div id="cal_commitModeNotice" style="font-size:11px;color:#78350f;margin-top:6px;"></div></div>';
    }
    html += '<div style="background:#f3f9ff;border-radius:8px;padding:10px;">' +
            '<div style="font-weight:700;color:#0d4d26;">Detected Academic Year: <b>' +
            escapeHtml(data.academicYear || '—') + '</b></div>' +
            '<div style="margin-top:6px;font-weight:700;">Terms found: ' + ((data.terms || []).length) + '</div>';
    (data.terms || []).forEach(function (t) {
      html += '<div style="font-size:12px;margin-left:12px;">• ' + escapeHtml(t.label) + ': ' +
              escapeHtml(t.startDate) + ' to ' + escapeHtml(t.endDate) + ' (' + (t.weeks || []).length + ' weeks)</div>';
    });
    const holidays = (data.events || []).filter(function (e) { return e.isHoliday; });
    html += '<div style="margin-top:6px;font-weight:700;">Holidays detected: ' + holidays.length + '</div>';
    holidays.slice(0, 10).forEach(function (h) {
      html += '<div style="font-size:12px;margin-left:12px;">• ' + escapeHtml(h.date) + ' — ' +
              escapeHtml(h.holidayName || h.description) + '</div>';
    });
    html += '<div style="margin-top:6px;font-weight:700;">Total events: ' + ((data.events || []).length) + '</div>';
    if (data.extractMethod) html += '<div style="font-size:11px;color:#666;margin-top:4px;">Extraction: ' + escapeHtml(data.extractMethod) + '</div>';
    html += '</div>';
    panel.innerHTML = html;
    const commitBtn = document.getElementById('cal_commitBtn');
    if (commitBtn) commitBtn.disabled = (dup && dup.exists);
  }

  function setCommitMode(mode) {
    window.__commitMode = mode;
    const notice = document.getElementById('cal_commitModeNotice');
    if (notice) notice.textContent = mode === 'replace'
      ? '✓ Replace mode — existing events for this year will be deleted.'
      : '✓ Append mode — new events will be added.';
    const commitBtn = document.getElementById('cal_commitBtn');
    if (commitBtn) commitBtn.disabled = false;
  }

  function cancelUpload() {
    uploadedParsed = null; uploadedSource = null;
    window.__dupCheckResult = null; window.__commitMode = null;
    closeModal();
  }

  async function commitUpload() {
    if (!uploadedParsed) { showToast('No parsed calendar to commit.'); return; }
    const dup = window.__dupCheckResult;
    if (dup && dup.exists && !window.__commitMode) {
      showToast('Choose Replace All or Add to Existing first.', 'warning');
      return;
    }
    const commitBtn = document.getElementById('cal_commitBtn');
    if (commitBtn) { commitBtn.disabled = true; commitBtn.textContent = 'Committing...'; }
    const r = await calCall('CAL_commitParsedCalendar', {
      parsed: uploadedParsed,
      sourceFileName: uploadedSource,
      mode: window.__commitMode || 'replace',
      session: getSession()
    });
    if (r && r.success) {
      showToast('Calendar committed.', 'success');
      uploadedParsed = null; uploadedSource = null;
      window.__dupCheckResult = null; window.__commitMode = null;
      closeModal();
      renderCalendarTab();
    } else {
      showToast('Commit failed: ' + ((r && r.message) || 'unknown'), 'error');
      if (commitBtn) { commitBtn.disabled = false; commitBtn.textContent = 'Commit to Calendar'; }
    }
  }

  // [CAL-FE-07] PASTE FALLBACK
  function showPasteFallback() {
    const el = document.getElementById('cal_pasteFallback');
    if (el) el.open = true;
  }
  async function parsePasted() {
    const box = document.getElementById('cal_pasteBox');
    if (!box || !box.value.trim()) { showToast('Paste some text first.'); return; }

    const status = document.getElementById('cal_uploadStatus');
    if (status) status.textContent = 'Parsing pasted text...';

    const r = await calCall('CAL_handlePastedText_', {
      text: box.value,
      session: getSession()
    });
    window.__lastUploadResponse = r;

    if (!r || !r.success) {
      if (status) status.textContent = 'Parse failed: ' + ((r && (r.message || r.error)) || 'unknown');
      return;
    }
    uploadedParsed = r;
    uploadedSource = 'pasted_text';
    if (status) status.textContent = 'Parsed OK. Review below.';
    await checkAndRenderReview(r);
  }

  // [CAL-FE-08] HOLIDAY ADJUSTER
  function openHolidayAdjuster(date, name) {
    const html =
      '<div class="modal-overlay" onclick="if(event.target===this)CAL.closeModal()">' +
      '<div class="modal-box" style="max-width:460px;" onclick="event.stopPropagation()">' +
        '<div class="modal-header"><h2>Holiday Adjuster</h2>' +
        '<button class="close-btn" onclick="CAL.closeModal()">&times;</button></div>' +
        '<div style="font-size:13px;margin-bottom:10px;">Current holiday: <b>' +
        escapeHtml(name || 'Public Holiday') + '</b><br>Date: <b>' + escapeHtml(date) + '</b></div>' +
        '<div class="form-group"><label style="font-weight:600;font-size:12px;">Action</label>' +
          '<select id="cal_adjAction" style="width:100%;">' +
            '<option value="move">Move to a different date</option>' +
            '<option value="remove">Cancel this holiday</option>' +
          '</select></div>' +
        '<div class="form-group" id="cal_adjNewDateWrap">' +
          '<label style="font-weight:600;font-size:12px;">New Date</label>' +
          '<input type="date" id="cal_adjNewDate" style="width:100%;"></div>' +
        '<div class="form-group"><label style="font-weight:600;font-size:12px;">Note</label>' +
          '<input type="text" id="cal_adjNote" style="width:100%;"></div>' +
        '<div style="text-align:right;display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">' +
          '<button class="btn btn-secondary" onclick="CAL.closeModal()">Cancel</button>' +
          '<button class="btn btn-success" onclick="CAL.submitHolidayAdjustment(\'' +
            escapeHtml(date) + '\')">Apply</button></div>' +
      '</div></div>';
    let host = document.getElementById('calModalHost');
    if (!host) { host = document.createElement('div'); host.id = 'calModalHost'; document.body.appendChild(host); }
    host.innerHTML = html;
    const action = document.getElementById('cal_adjAction');
    const newWrap = document.getElementById('cal_adjNewDateWrap');
    action.addEventListener('change', function () {
      newWrap.style.display = action.value === 'remove' ? 'none' : 'block';
    });
  }
  async function submitHolidayAdjustment(oldDate) {
    const action = document.getElementById('cal_adjAction').value || 'move';
    const newDate = (document.getElementById('cal_adjNewDate') || {}).value || '';
    const note = (document.getElementById('cal_adjNote') || {}).value || '';
    if (action === 'move' && !newDate) { showToast('Pick a new date.'); return; }
    if (action === 'move' && !confirm('Move holiday to ' + newDate + '?')) return;
    if (action === 'remove' && !confirm('Cancel this holiday?')) return;
    const r = await calCall('CAL_adjustHoliday', {
      oldDate: oldDate, newDate: newDate, action: action, note: note, session: getSession()
    });
    if (r && r.success) { showToast(r.message, 'success'); closeModal(); renderCalendarTab(); }
    else { showToast('Failed: ' + ((r && r.message) || 'unknown'), 'error'); }
  }

  // [CAL-FE-09] PUBLIC API
  function closeModal() {
    const host = document.getElementById('calModalHost');
    if (host) host.innerHTML = '';
  }
  window.CAL = {
    openUploadModal: openUploadModal,
    importFromDriveClick: importFromDriveClick,
    renderCalendarTab: renderCalendarTab,
    closeModal: closeModal,
    commitUpload: commitUpload,
    parsePasted: parsePasted,
    setCommitMode: setCommitMode,
    cancelUpload: cancelUpload,
    openHolidayAdjuster: openHolidayAdjuster,
    submitHolidayAdjustment: submitHolidayAdjustment
  };
  console.log('[CAL] Academic Calendar module loaded — Drive import path.');

})();
