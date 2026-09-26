// ================================================================
// TIS EMIS — LEARNER BULK OPERATIONS
// File: learner-bulk.js
// ================================================================
// Handles: bulk download template, bulk upload, edit modal,
// add learner modal, contact priority, and photo capture.
//
// Loads after app.js. Uses only the window.TIS pattern for
// backend calls (via Google Apps Script Web App).
//
// Requires: XLSX library loaded in index.html (added separately).
// ================================================================

(function () {
  'use strict';

  // ----------------------------------------------------------------
  // Backend URL — the deployed Apps Script Web App
  // ----------------------------------------------------------------
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwp8WB7ZCYOiolA70SQAPi7--1cmclVwRQEMBaur6CwymD_8sDo9uL7dNNh9LFUkIZd/exec';

  // ----------------------------------------------------------------
  // Low-level fetch helper — talks to the Apps Script Web App
  // ----------------------------------------------------------------
  async function callBackend(fnName, ...args) {
    const url = BACKEND_URL + '?action=' + encodeURIComponent(fnName) +
                '&args=' + encodeURIComponent(JSON.stringify(args));
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      return data;
    } catch (err) {
      return { success: false, message: String(err) };
    }
  }

  // ----------------------------------------------------------------
  // Download the bulk template as an Excel file
  // ----------------------------------------------------------------
  async function downloadLearnerTemplate() {
    showToast('Preparing template...');

    const [all, fieldMap] = await Promise.all([
      callBackend('LB_getAllLearnersFull'),
      callBackend('LB_getLearnerFieldMap')
    ]);

    if (!all || !all.success) {
      showToast('Could not load learners: ' + (all && all.message));
      return;
    }

    // Build workbook from headers + all learner rows.
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

    showToast('Template downloaded.');
  }

  // ----------------------------------------------------------------
  // Upload a filled template — parses and sends updates
  // ----------------------------------------------------------------
  async function uploadLearnerUpdates(file) {
    if (!file) return;

    showToast('Reading file...');
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    if (!rows.length) { showToast('File contains no rows.'); return; }

    // Compare with current backend data to compute a diff.
    const all = await callBackend('LB_getAllLearnersFull');
    if (!all || !all.success) { showToast('Could not fetch current data.'); return; }

    const currentByPin = {};
    (all.learners || []).forEach(function (l) { currentByPin[String(l.PIN)] = l; });

    const updates = [];
    rows.forEach(function (r) {
      const pin = String(r['PIN'] || '').trim();
      if (!pin) return;
      const current = currentByPin[pin];
      if (!current) return; // new learners are added via "Add New", not bulk upload

      const patch = {};
      Object.keys(r).forEach(function (k) {
        const oldVal = current[k] !== undefined ? String(current[k]) : '';
        const newVal = r[k] !== undefined ? String(r[k]) : '';
        if (oldVal !== newVal) patch[k] = newVal;
      });
      if (Object.keys(patch).length > 0) updates.push({ pin: pin, patch: patch });
    });

    if (!updates.length) { showToast('No changes detected.'); return; }

    const confirmMsg = 'Found ' + updates.length + ' learner(s) with changes. ' +
                       'Apply updates now?';
    if (!confirm(confirmMsg)) return;

    showToast('Applying ' + updates.length + ' update(s)...');
    const result = await callBackend('LB_bulkUpdateLearners', updates);

    if (result && result.success) {
      showToast('Updated ' + result.updated + ' learner(s). ' +
                (result.failed ? result.failed + ' failed.' : ''), 'success');
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Upload failed: ' + (result && result.message), 'error');
    }
  }

  // ----------------------------------------------------------------
  // Edit one learner — opens the A/B/C modal
  // ----------------------------------------------------------------
  async function openLearnerEditModal(pin) {
    const [data, fieldMap, priority] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner: ' + (data && data.message));
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
    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header">';
    html += '<h2>Edit Learner — ' + escapeHtml(learner['LEARNERS NAME'] || '') + '</h2>';
    html += '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button>';
    html += '</div>';

    sections.forEach(function (sec) {
      const fields = (fieldMap && fieldMap[sec]) ? fieldMap[sec] : [];
      if (!fields.length) return;

      html += '<div class="expandable open">';
      html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">';
      html += 'Section ' + sec + ' — ' + (sec === 'A' ? 'Identity' : sec === 'B' ? 'Fees & Health' : 'History & Origin');
      html += '</div>';
      html += '<div class="expandable-body">';

      fields.forEach(function (f) {
        const val = learner[f.header] !== undefined ? learner[f.header] : '';
        const inputId = 'lb_field_' + f.col;
        html += '<div class="form-group" style="margin-bottom:10px;">';
        html += '<label style="font-weight:600;font-size:12px;">' + escapeHtml(f.header) + '</label>';

        if (f.header === 'PHOTO') {
          html += '<div style="display:flex;gap:10px;align-items:center;">';
          html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(val) + '" placeholder="Drive URL or upload below" style="flex:1;">';
          html += '<button type="button" class="btn btn-gold" onclick="LB.pickPhoto(\'' + inputId + '\')">Upload</button>';
          html += '</div>';
        } else {
          html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(val) + '" data-field="' + escapeAttr(f.header) + '" data-col="' + f.col + '">';
        }
        html += '</div>';
      });

      html += '</div></div>';
    });

    // Contact priority block (part of C section conceptually)
    html += '<div class="expandable open">';
    html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Contact Priority</div>';
    html += '<div class="expandable-body">';
    ['first', 'second', 'third'].forEach(function (rank, i) {
      const id = 'lb_prio_' + rank;
      const val = priority && priority[rank] ? priority[rank] : ['father','mother','guardian'][i];
      html += '<div class="form-group" style="margin-bottom:10px;">';
      html += '<label style="font-weight:600;font-size:12px;">' + (i === 0 ? '1st' : i === 1 ? '2nd' : '3rd') + ' Contact</label>';
      html += '<select id="' + id + '">';
      ['father', 'mother', 'guardian'].forEach(function (opt) {
        html += '<option value="' + opt + '"' + (opt === val ? ' selected' : '') + '>' + opt.toUpperCase() + '</option>';
      });
      html += '</select></div>';
    });
    html += '</div></div>';

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.saveLearnerEdit()">Save Changes</button>';
    html += '</div>';

    html += '</div></div>';

    let container = document.getElementById('lbModalHost');
    if (!container) {
      container = document.createElement('div');
      container.id = 'lbModalHost';
      document.body.appendChild(container);
    }
    container.innerHTML = html;
  }

  async function saveLearnerEdit() {
    const pin = window.__lbEditingPin;
    if (!pin) return;

    const inputs = document.querySelectorAll('[data-field]');
    const patch = {};
    inputs.forEach(function (inp) {
      patch[inp.dataset.field] = inp.value;
    });

    const prioFirst = (document.getElementById('lb_prio_first') || {}).value || 'father';
    const prioSecond = (document.getElementById('lb_prio_second') || {}).value || 'mother';
    const prioThird = (document.getElementById('lb_prio_third') || {}).value || 'guardian';

    showToast('Saving...');

    const [updateRes, prioRes] = await Promise.all([
      callBackend('LB_updateLearner', pin, patch),
      callBackend('LB_setContactPriority', pin, prioFirst, prioSecond, prioThird)
    ]);

    if (updateRes && updateRes.success) {
      showToast('Learner updated.', 'success');
      closeEditModal();
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Save failed: ' + (updateRes && updateRes.message), 'error');
    }
  }

  // ----------------------------------------------------------------
  // Add a new learner — opens an empty A/B/C modal
  // ----------------------------------------------------------------
  function openAddLearnerModal() {
    callBackend('LB_getLearnerFieldMap').then(function (fieldMap) {
      const blank = { PIN: '', 'LEARNERS NAME': '' };
      window.__lbEditingPin = null;
      window.__lbFieldMap = fieldMap;
      window.__lbPriority = { first: 'father', second: 'mother', third: 'guardian' };

      // Reuse the same render, but mark it as "add new"
      const html = buildAddModal(fieldMap);
      let host = document.getElementById('lbModalHost');
      if (!host) {
        host = document.createElement('div');
        host.id = 'lbModalHost';
        document.body.appendChild(host);
      }
      host.innerHTML = html;
    });
  }

  function buildAddModal(fieldMap) {
    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:900px;max-height:90vh;overflow-y:auto;">';
    html += '<div class="modal-header">';
    html += '<h2>Add New Learner</h2>';
    html += '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button>';
    html += '</div>';

    ['A','B','C'].forEach(function (sec) {
      const fields = (fieldMap && fieldMap[sec]) ? fieldMap[sec] : [];
      if (!fields.length) return;
      html += '<div class="expandable open"><div class="expandable-header">Section ' + sec + '</div><div class="expandable-body">';
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
    html += '</div>';
    html += '</div></div>';
    return html;
  }

  async function saveNewLearner() {
    const inputs = document.querySelectorAll('[data-field]');
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
      showToast('Failed: ' + (res && res.message), 'error');
    }
  }

  // ----------------------------------------------------------------
  // Photo picker (file → base64 → backend)
  // ----------------------------------------------------------------
  function pickPhoto(targetInputId) {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async function (e) {
      const f = e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = async function () {
        const base64 = String(reader.result).split(',')[1];
        const pin = window.__lbEditingPin;
        if (!pin) { showToast('Save the learner first, then add a photo.'); return; }
        showToast('Uploading photo...');
        const res = await callBackend('uploadLearnerPhoto', pin, base64, f.type);
        if (res && (res.url || res.success)) {
          const url = res.url || res;
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

  // ----------------------------------------------------------------
  // UI hooks
  // ----------------------------------------------------------------
  function closeEditModal() {
    const host = document.getElementById('lbModalHost');
    if (host) host.innerHTML = '';
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') { window.showToast(msg, type); return; }
    console.log('[LB]', msg);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ----------------------------------------------------------------
  // Expose public API
  // ----------------------------------------------------------------
  window.LB = {
    downloadLearnerTemplate: downloadLearnerTemplate,
    uploadLearnerUpdates: uploadLearnerUpdates,
    openLearnerEditModal: openLearnerEditModal,
    openAddLearnerModal: openAddLearnerModal,
    saveLearnerEdit: saveLearnerEdit,
    saveNewLearner: saveNewLearner,
    closeEditModal: closeEditModal,
    pickPhoto: pickPhoto,
    callBackend: callBackend
  };

  console.log('[LB] Learner Bulk module loaded.');
})();
