// ================================================================
// TIS EMIS — LEARNER BULK OPERATIONS
// File: learner-bulk.js
// ================================================================
// SECTION MAP:
//   [LB01] BACKEND BRIDGE (JSONP)
//   [LB02] HELPERS
//   [LB03] BULK DOWNLOAD TEMPLATE
//   [LB04] BULK UPLOAD UPDATES
//   [LB05] EDIT LEARNER MODAL (editable A/B/C)
//   [LB06] VIEW LEARNER MODAL (read-only A/B/C)
//   [LB07] PRINT LEARNER (printable A/B/C)
//   [LB08] ADD NEW LEARNER
//   [LB09] PHOTO PICKER
//   [LB10] PUBLIC API EXPORT
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [LB01] BACKEND BRIDGE — JSONP
  // ----------------------------------------------------------------
  // Apps Script Web App does not send CORS headers, so fetch() is
  // blocked. JSONP works: we inject a <script> tag whose src is the
  // Apps Script URL with callback=NAME. The server responds with
  //   NAME({...json...});
  // and the browser executes it, calling window[NAME].
  //
  // Server side (doGet in Apps Script) must:
  //   1. Read action, args, callback from e.parameter
  //   2. Call the named function with parsed args
  //   3. Wrap JSON in callback(...)
  //   4. Return ContentService.createTextOutput with MimeType.JAVASCRIPT
  // ================================================================

  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';
  const BACKEND_TIMEOUT_MS = 20000;

  function callBackend(fnName) {
    const args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve) {
      const cbName = 'tis_cb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      let settled = false;
      let scriptEl = null;

      function cleanup() {
        try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
        if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
      }

      window[cbName] = function (data) {
        if (settled) return;
        settled = true;
        cleanup();
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
        settled = true;
        cleanup();
        resolve({ success: false, message: 'Network error contacting backend.' });
      };

      setTimeout(function () {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ success: false, message: 'Backend timeout after ' + (BACKEND_TIMEOUT_MS / 1000) + 's.' });
      }, BACKEND_TIMEOUT_MS);

      document.head.appendChild(scriptEl);
    });
  }

  // ================================================================
  // [LB02] HELPERS
  // ================================================================
  function showToast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    console.log('[LB]', msg);
  }

  function escapeHtml(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function getModalHost() {
    let host = document.getElementById('lbModalHost');
    if (!host) {
      host = document.createElement('div');
      host.id = 'lbModalHost';
      document.body.appendChild(host);
    }
    return host;
  }

  // ================================================================
  // [LB03] BULK DOWNLOAD TEMPLATE
  // ================================================================
  async function downloadLearnerTemplate() {
    showToast('Preparing template...');

    const all = await callBackend('LB_getAllLearnersFull');
    if (!all || !all.success) {
      showToast('Could not load learners: ' + ((all && all.message) || 'unknown'));
      return;
    }

    if (typeof XLSX === 'undefined') {
      showToast('Excel library not loaded. Refresh and try again.', 'error');
      return;
    }

    const headers = all.headers || [];
    const rows = [headers];
    (all.learners || []).forEach(function (l) {
      rows.push(headers.map(function (h) { return l[h] !== undefined ? l[h] : ''; }));
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'LEARNERS');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'TIS_LEARNERS_' + today + '.xlsx');
    showToast('Template downloaded.', 'success');
  }

  // ================================================================
  // [LB04] BULK UPLOAD UPDATES
  // ================================================================
  async function uploadLearnerUpdates(file) {
    if (!file) return;
    if (typeof XLSX === 'undefined') { showToast('Excel library not loaded.', 'error'); return; }

    showToast('Reading file...');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows.length) { showToast('File contains no rows.'); return; }

    const all = await callBackend('LB_getAllLearnersFull');
    if (!all || !all.success) { showToast('Could not fetch current data.'); return; }

    const currentByPin = {};
    (all.learners || []).forEach(function (l) { currentByPin[String(l.PIN)] = l; });

    const updates = [];
    rows.forEach(function (r) {
      const pin = String(r['PIN'] || '').trim();
      if (!pin) return;
      const current = currentByPin[pin];
      if (!current) return;
      const patch = {};
      Object.keys(r).forEach(function (k) {
        const oldVal = current[k] !== undefined ? String(current[k]) : '';
        const newVal = r[k] !== undefined ? String(r[k]) : '';
        if (oldVal !== newVal) patch[k] = newVal;
      });
      if (Object.keys(patch).length > 0) updates.push({ pin: pin, patch: patch });
    });

    if (!updates.length) { showToast('No changes detected.'); return; }
    if (!confirm('Found ' + updates.length + ' learner(s) with changes. Apply now?')) return;

    showToast('Applying ' + updates.length + ' update(s)...');
    const result = await callBackend('LB_bulkUpdateLearners', updates);
    if (result && result.success) {
      showToast('Updated ' + result.updated + ' learner(s).' +
                (result.failed ? ' ' + result.failed + ' failed.' : ''), 'success');
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Upload failed: ' + ((result && result.message) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // [LB05] EDIT LEARNER — EDITABLE A/B/C MODAL
  // ================================================================
  async function openLearnerEditModal(pin) {
    showToast('Loading learner...');

    const [data, fieldMap, priority] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner: ' + ((data && data.message) || 'unknown'), 'error');
      return;
    }

    window.__lbEditingPin = pin;
    window.__lbFieldMap = fieldMap;
    window.__lbLearner = data.learner;
    window.__lbPriority = priority;

    renderEditModal(data.learner, fieldMap, priority);
  }

  function renderEditModal(learner, fieldMap, priority) {
    const sections = ['A', 'B', 'C'];
    const titles = { A: 'A — Identity', B: 'B — Fees & Health', C: 'C — History & Origin' };
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Edit — ' +
            escapeHtml(learner['LEARNERS NAME'] || learner['name'] || '') + '</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    sections.forEach(function (sec) {
      const fields = usable[sec] || [];
      if (!fields.length) return;

      html += '<div class="expandable open">';
      html += '<div class="expandable-header">';
      html += '<span>' + escapeHtml(titles[sec]) + '</span>';
      html += '<button type="button" class="btn btn-warning" style="margin-left:auto;font-size:11px;padding:3px 8px;" ' +
              'onclick="event.stopPropagation();LB.addHeaderToSection(\'' + sec + '\')">+ Add Header</button>';
      html += '</div><div class="expandable-body">';

      fields.forEach(function (f) {
        const val = learner[f.header] !== undefined ? learner[f.header] : '';
        const inputId = 'lb_field_' + f.col;
        html += '<div class="form-group" style="margin-bottom:10px;">';
        html += '<label style="font-weight:600;font-size:12px;">' + escapeHtml(f.header) + '</label>';
        if (/^PHOTO/i.test(f.header)) {
          html += '<div style="display:flex;gap:10px;align-items:center;">';
          html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(val) + '" style="flex:1;">';
          html += '<button type="button" class="btn btn-gold" onclick="LB.pickPhoto(\'' + inputId + '\')">Upload</button>';
          html += '</div>';
        } else {
          html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(val) +
                  '" data-field="' + escapeAttr(f.header) + '" data-col="' + f.col + '" style="width:100%;">';
        }
        html += '</div>';
      });

      html += '</div></div>';
    });

    html += '<div class="expandable open"><div class="expandable-header">Contact Priority</div><div class="expandable-body">';
    ['first', 'second', 'third'].forEach(function (rank, i) {
      const id = 'lb_prio_' + rank;
      const val = priority && priority[rank] ? priority[rank] : ['father','mother','guardian'][i];
      html += '<div class="form-group" style="margin-bottom:10px;">';
      html += '<label style="font-weight:600;font-size:12px;">' +
              (i === 0 ? '1st' : i === 1 ? '2nd' : '3rd') + ' Contact</label>';
      html += '<select id="' + id + '" style="width:100%;">';
      ['father', 'mother', 'guardian'].forEach(function (opt) {
        html += '<option value="' + opt + '"' + (opt === val ? ' selected' : '') + '>' + opt.toUpperCase() + '</option>';
      });
      html += '</select></div>';
    });
    html += '</div></div>';

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.saveLearnerEdit()">Save Changes</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  async function saveLearnerEdit() {
    const pin = window.__lbEditingPin;
    if (!pin) return;

    const inputs = document.querySelectorAll('#lbModalHost [data-field]');
    const patch = {};
    inputs.forEach(function (inp) { patch[inp.dataset.field] = inp.value; });

    const prioFirst  = (document.getElementById('lb_prio_first')  || {}).value || 'father';
    const prioSecond = (document.getElementById('lb_prio_second') || {}).value || 'mother';
    const prioThird  = (document.getElementById('lb_prio_third')  || {}).value || 'guardian';

    showToast('Saving...');
    const updateRes = await callBackend('LB_updateLearner', pin, patch);
    await callBackend('LB_setContactPriority', pin, prioFirst, prioSecond, prioThird);

    if (updateRes && updateRes.success) {
      showToast('Learner updated.', 'success');
      closeEditModal();
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Save failed: ' + ((updateRes && updateRes.message) || 'unknown'), 'error');
    }
  }

  async function addHeaderToSection(section) {
    const name = prompt('New header name for Section ' + section + ':');
    if (!name) return;
    const cleaned = String(name).trim();
    if (!cleaned) return;
    if (!confirm('Add column "' + cleaned + '" to the LEARNERS sheet?')) return;

    showToast('Adding header...');
    const res = await callBackend('LB_addHeader', cleaned);
    if (res && res.success) {
      showToast('Header added: ' + cleaned, 'success');
      if (window.__lbEditingPin) openLearnerEditModal(window.__lbEditingPin);
    } else {
      showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // [LB06] VIEW LEARNER — READ-ONLY A/B/C MODAL
  // ================================================================
  async function openLearnerViewModal(pin) {
    showToast('Loading learner...');

    const [data, fieldMap, priority] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner: ' + ((data && data.message) || 'unknown'), 'error');
      return;
    }
    renderViewModal(data.learner, fieldMap, priority);
  }

  function renderViewModal(learner, fieldMap, priority) {
    const sections = ['A', 'B', 'C'];
    const titles = { A: 'A — Identity', B: 'B — Fees & Health', C: 'C — History & Origin' };
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    const learnerName = learner['LEARNERS NAME'] || learner['name'] || '';
    const photoUrl = learner['PHOTO'] || learner['PHOTO '] || learner['photo_url'] || '';
    const pin = learner['PIN'] || '';
    const cls = learner['3RD TERM 2026 CLASS'] || '';

    let html = '<div class="modal-overlay" id="lbViewOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header">';
    html += '<h2>' + escapeHtml(learnerName) + '</h2>';
    html += '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button>';
    html += '</div>';

    // Header card with photo + key ID
    html += '<div style="display:flex;gap:16px;align-items:center;padding:12px;background:#f3f9ff;border-radius:8px;margin-bottom:16px;">';
    if (photoUrl) {
      html += '<img src="' + escapeAttr(photoUrl) + '" style="width:80px;height:80px;object-fit:cover;border-radius:50%;border:3px solid #0d4d26;" onerror="this.style.display=\'none\'">';
    } else {
      html += '<div style="width:80px;height:80px;border-radius:50%;background:#0d4d26;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;">' +
              escapeHtml((learnerName || '?').charAt(0)) + '</div>';
    }
    html += '<div>';
    html += '<div style="font-size:20px;font-weight:800;color:#0d4d26;">' + escapeHtml(learnerName) + '</div>';
    html += '<div style="font-size:13px;color:#555;margin-top:4px;">PIN: <b>' + escapeHtml(pin) + '</b></div>';
    html += '<div style="font-size:13px;color:#555;">Class: <b>' + escapeHtml(cls) + '</b></div>';
    html += '</div></div>';

    // Sections A, B, C — read-only
    sections.forEach(function (sec) {
      const fields = usable[sec] || [];
      if (!fields.length) return;

      html += '<div class="expandable open"><div class="expandable-header">' + escapeHtml(titles[sec]) + '</div><div class="expandable-body">';
      fields.forEach(function (f) {
        const val = learner[f.header] !== undefined ? learner[f.header] : '';
        const shown = (val === '' || val === null || val === undefined) ? '—' : val;
        html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;">';
        html += '<span style="font-size:12px;color:#666;font-weight:600;">' + escapeHtml(f.header) + '</span>';
        html += '<span style="font-size:13px;color:#000;font-weight:500;text-align:right;max-width:60%;">' + escapeHtml(String(shown)) + '</span>';
        html += '</div>';
      });
      html += '</div></div>';
    });

    // Contact priority — read-only
    html += '<div class="expandable open"><div class="expandable-header">Contact Priority</div><div class="expandable-body">';
    ['first', 'second', 'third'].forEach(function (rank, i) {
      const val = priority && priority[rank] ? priority[rank] : ['father','mother','guardian'][i];
      html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;">';
      html += '<span style="font-size:12px;color:#666;font-weight:600;">' +
              (i === 0 ? '1st' : i === 1 ? '2nd' : '3rd') + ' Contact</span>';
      html += '<span style="font-size:13px;color:#000;font-weight:600;">' + escapeHtml(String(val).toUpperCase()) + '</span>';
      html += '</div>';
    });
    html += '</div></div>';

    // Actions
    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Close</button>';
    html += '<button class="btn btn-gold" onclick="LB.printLearner(\'' + escapeAttr(pin) + '\')">Print</button>';
    html += '<button class="btn btn-primary" onclick="LB.openLearnerEditModal(\'' + escapeAttr(pin) + '\')">Edit</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  // ================================================================
  // [LB07] PRINT LEARNER
  // ================================================================
  async function printLearner(pin) {
    showToast('Preparing print...');

    const [data, fieldMap, priority] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner for printing.', 'error');
      return;
    }

    const learner = data.learner;
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };
    const titles = { A: 'A — Identity', B: 'B — Fees & Health', C: 'C — History & Origin' };
    const learnerName = learner['LEARNERS NAME'] || learner['name'] || '';
    const photoUrl = learner['PHOTO'] || learner['PHOTO '] || learner['photo_url'] || '';

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<title>Learner — ' + escapeHtml(learnerName) + '</title>';
    html += '<style>';
    html += 'body{font-family:Arial,sans-serif;padding:20px;color:#000;}';
    html += '.header{display:flex;gap:16px;align-items:center;border-bottom:3px solid #0d4d26;padding-bottom:12px;margin-bottom:16px;}';
    html += '.header img{width:100px;height:100px;object-fit:cover;border-radius:50%;border:3px solid #0d4d26;}';
    html += '.avatar-fallback{width:100px;height:100px;border-radius:50%;background:#0d4d26;color:#fff;display:flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;}';
    html += '.title{font-size:22px;font-weight:900;color:#0d4d26;margin-bottom:4px;}';
    html += '.subtitle{font-size:13px;color:#333;}';
    html += 'h3{background:#0d4d26;color:#fff;padding:6px 10px;font-size:13px;text-transform:uppercase;margin:16px 0 8px;letter-spacing:1px;}';
    html += 'table{width:100%;border-collapse:collapse;}';
    html += 'td{padding:5px 8px;border-bottom:1px solid #ccc;font-size:12px;vertical-align:top;}';
    html += 'td:first-child{font-weight:700;color:#333;width:35%;}';
    html += '.footer{margin-top:24px;font-size:11px;color:#555;text-align:center;border-top:1px solid #ccc;padding-top:8px;}';
    html += '@media print {.no-print{display:none;}}';
    html += '</style></head><body>';

    html += '<div class="header">';
    if (photoUrl) {
      html += '<img src="' + escapeAttr(photoUrl) + '" onerror="this.style.display=\'none\'">';
    } else {
      html += '<div class="avatar-fallback">' + escapeHtml((learnerName || '?').charAt(0)) + '</div>';
    }
    html += '<div>';
    html += '<div class="title">' + escapeHtml(learnerName) + '</div>';
    html += '<div class="subtitle">PIN: <b>' + escapeHtml(learner['PIN'] || '') + '</b> &nbsp;|&nbsp; Class: <b>' + escapeHtml(learner['3RD TERM 2026 CLASS'] || '') + '</b></div>';
    html += '<div class="subtitle" style="margin-top:4px;">THE IDEAL SCHOOLS — Learner Record</div>';
    html += '</div></div>';

    ['A', 'B', 'C'].forEach(function (sec) {
      const fields = usable[sec] || [];
      if (!fields.length) return;
      html += '<h3>' + escapeHtml(titles[sec]) + '</h3><table>';
      fields.forEach(function (f) {
        const val = learner[f.header] !== undefined ? learner[f.header] : '';
        html += '<tr><td>' + escapeHtml(f.header) + '</td><td>' + escapeHtml(String(val || '—')) + '</td></tr>';
      });
      html += '</table>';
    });

    html += '<h3>Contact Priority</h3><table>';
    ['first', 'second', 'third'].forEach(function (rank, i) {
      const val = priority && priority[rank] ? priority[rank] : ['father','mother','guardian'][i];
      html += '<tr><td>' + (i === 0 ? '1st' : i === 1 ? '2nd' : '3rd') + ' Contact</td><td>' + escapeHtml(String(val).toUpperCase()) + '</td></tr>';
    });
    html += '</table>';

    html += '<div class="footer">Printed: ' + new Date().toLocaleString() + ' &nbsp;·&nbsp; The Ideal Schools Operational Portal</div>';
    html += '<div class="no-print" style="text-align:center;margin-top:20px;">';
    html += '<button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#0d4d26;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Print Now</button>';
    html += '<button onclick="window.close()" style="margin-left:8px;padding:10px 24px;font-size:14px;background:#666;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Close</button>';
    html += '</div>';
    html += '<script>setTimeout(function(){window.print();},600);<\/script>';
    html += '</body></html>';

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ================================================================
  // [LB08] ADD NEW LEARNER
  // ================================================================
  async function openAddLearnerModal() {
    showToast('Preparing form...');
    const fieldMap = await callBackend('LB_getLearnerFieldMap');
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    window.__lbEditingPin = null;
    window.__lbFieldMap = usable;
    window.__lbPriority = { first: 'father', second: 'mother', third: 'guardian' };

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Add New Learner</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    ['A','B','C'].forEach(function (sec) {
      const fields = usable[sec] || [];
      if (!fields.length) return;
      html += '<div class="expandable open"><div class="expandable-header">Section ' + sec +
              '</div><div class="expandable-body">';
      fields.forEach(function (f) {
        html += '<div class="form-group" style="margin-bottom:10px;">';
        html += '<label style="font-weight:600;font-size:12px;">' + escapeHtml(f.header) + '</label>';
        html += '<input type="text" data-field="' + escapeAttr(f.header) + '" value="" style="width:100%;">';
        html += '</div>';
      });
      html += '</div></div>';
    });

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.saveNewLearner()">Create Learner</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  async function saveNewLearner() {
    const inputs = document.querySelectorAll('#lbModalHost [data-field]');
    const row = {};
    inputs.forEach(function (inp) { row[inp.dataset.field] = inp.value; });
    if (!row['PIN']) { showToast('PIN is required.'); return; }

    showToast('Creating...');
    const res = await callBackend('LB_addNewLearner', row);
    if (res && res.success) {
      showToast('Learner created.', 'success');
      closeEditModal();
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // [LB09] PHOTO PICKER
  // ================================================================
  function pickPhoto(targetInputId) {
    const pin = window.__lbEditingPin;
    if (!pin) { showToast('Save the learner first, then add a photo.'); return; }

    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function (e) {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async function () {
        const base64 = String(reader.result).split(',')[1];
        showToast('Uploading photo...');
        const res = await callBackend('uploadLearnerPhoto', pin, base64, f.type);
        const url = (res && (res.url || res.success)) ? (res.url || res) : '';
        if (url) {
          document.getElementById(targetInputId).value = url;
          showToast('Photo uploaded.', 'success');
        } else {
          showToast('Upload failed.', 'error');
        }
      };
      reader.readAsDataURL(f);
    };
    inp.click();
  }

  // ================================================================
  // [LB10] PUBLIC API EXPORT
  // ================================================================
  function closeEditModal() {
    const host = document.getElementById('lbModalHost');
    if (host) host.innerHTML = '';
  }

  window.LB = {
    downloadLearnerTemplate: downloadLearnerTemplate,
    uploadLearnerUpdates: uploadLearnerUpdates,
    openLearnerEditModal: openLearnerEditModal,
    openLearnerViewModal: openLearnerViewModal,
    openAddLearnerModal: openAddLearnerModal,
    saveLearnerEdit: saveLearnerEdit,
    saveNewLearner: saveNewLearner,
    addHeaderToSection: addHeaderToSection,
    closeEditModal: closeEditModal,
    pickPhoto: pickPhoto,
    printLearner: printLearner,
    callBackend: callBackend
  };

  console.log('[LB] Learner Bulk module loaded — JSONP bridge ready.');

})();
