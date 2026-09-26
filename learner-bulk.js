// ================================================================
// TIS EMIS — LEARNER BULK OPERATIONS
// File: learner-bulk.js
// ================================================================
// SECTION MAP:
//   [LB01] BACKEND BRIDGE (JSONP)
//   [LB02] HELPERS (toast, escape, modal host)
//   [LB03] BULK DOWNLOAD TEMPLATE
//   [LB04] BULK UPLOAD UPDATES
//   [LB05] EDIT SINGLE LEARNER (A / B / C modal)
//   [LB06] ADD NEW LEARNER
//   [LB07] PHOTO PICKER
//   [LB08] PUBLIC API EXPORT
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [LB01] BACKEND BRIDGE — JSONP
  // ----------------------------------------------------------------
  // Apps Script Web App does not return CORS headers, so we cannot
  // use fetch(). JSONP works: we inject a <script> tag whose src is
  // the Apps Script URL with a callback= parameter, and the server
  // responds with   callbackName({...json...});
  //
  // The Apps Script doGet() must:
  //   1. Read e.parameter.action, e.parameter.args, e.parameter.callback
  //   2. Call the named function with the parsed args
  //   3. Wrap the JSON result in the callback
  //   4. Return ContentService.createTextOutput(...)
  //      with MimeType.JAVASCRIPT
  // ================================================================

  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';
  const BACKEND_TIMEOUT_MS = 20000;

  /**
   * callBackend(fnName, ...args) → Promise<responseObject>
   * Uses JSONP. Never throws. Always resolves to either:
   *   - the parsed response object from the server
   *   - { success: false, message: "..." } on failure
   */
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
  // [LB05] EDIT SINGLE LEARNER — A / B / C MODAL
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
    const fieldMapUsable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Edit — ' +
            escapeHtml(learner['LEARNERS NAME'] || learner['name'] || '') + '</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    sections.forEach(function (sec) {
      const fields = (fieldMapUsable[sec]) || [];
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

    // Contact priority block
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
  // [LB06] ADD NEW LEARNER
  // ================================================================
  async function openAddLearnerModal() {
    showToast('Preparing form...');
    const fieldMap = await callBackend('LB_getLearnerFieldMap');
    const fieldMapUsable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    window.__lbEditingPin = null;
    window.__lbFieldMap = fieldMapUsable;
    window.__lbPriority = { first: 'father', second: 'mother', third: 'guardian' };

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Add New Learner</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    ['A','B','C'].forEach(function (sec) {
      const fields = fieldMapUsable[sec] || [];
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
  // [LB07] PHOTO PICKER
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
  // [LB08] PUBLIC API EXPORT
  // ================================================================
  function closeEditModal() {
    const host = document.getElementById('lbModalHost');
    if (host) host.innerHTML = '';
  }

  window.LB = {
    downloadLearnerTemplate: downloadLearnerTemplate,
    uploadLearnerUpdates: uploadLearnerUpdates,
    openLearnerEditModal: openLearnerEditModal,
    openAddLearnerModal: openAddLearnerModal,
    saveLearnerEdit: saveLearnerEdit,
    saveNewLearner: saveNewLearner,
    addHeaderToSection: addHeaderToSection,
    closeEditModal: closeEditModal,
    pickPhoto: pickPhoto,
    callBackend: callBackend
  };

  console.log('[LB] Learner Bulk module loaded — JSONP bridge ready.');

})();
