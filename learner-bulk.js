// ================================================================
// TIS EMIS — LEARNER BULK OPERATIONS
// File: learner-bulk.js
// ================================================================
// SECTION MAP:
//   [LB-01] BACKEND BRIDGE (JSONP)
//   [LB-02] HELPERS
//   [LB-02b] FIELD WHITELISTS
//   [LB-03] BULK DOWNLOAD TEMPLATE
//   [LB-04] BULK UPLOAD UPDATES
//   [LB-05] EDIT LEARNER MODAL
//   [LB-06] VIEW LEARNER MODAL
//   [LB-06b] KEYBOARD SHORTCUTS
//   [LB-07] FEE BLOCK
//   [LB-08] OTHER BILLS BLOCK
//   [LB-09] UPDATE PAYMENT MODAL
//   [LB-10] PRINT LEARNER
//   [LB-11] ADD NEW LEARNER
//   [LB-12] PHOTO PICKER
//   [LB-13] HELP MODAL
//   [LB-14] PUBLIC API EXPORT
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [LB-01] BACKEND BRIDGE — JSONP
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
  // [LB-02] HELPERS
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

  let ACTIVE_TERM = '1ST TERM 2026/2027';
  let PREV_TERM   = '3RD TERM 2025/2026';

  function derivePrevTerm(activeLabel) {
    const m = String(activeLabel).match(/^(\d)(?:ST|ND|RD|TH)\s+TERM\s+(\d{4})\/(\d{4})/i);
    if (!m) return '';
    const n = parseInt(m[1], 10);
    const y1 = m[2], y2 = m[3];
    if (n === 1) {
      const prevY2 = String(parseInt(y1, 10) - 1);
      const prevY1 = String(parseInt(prevY2, 10) - 1);
      return '3RD TERM ' + prevY1 + '/' + prevY2;
    }
    if (n === 2) return '1ST TERM ' + y1 + '/' + y2;
    if (n === 3) return '2ND TERM ' + y1 + '/' + y2;
    return '';
  }

  async function resolveActiveTerm() {
    const r = await callBackend('getActiveTerm');
    if (r && r.success && r.data) {
      if (typeof r.data === 'string') ACTIVE_TERM = r.data;
      else if (r.data.label) ACTIVE_TERM = r.data.label;
      else if (r.data.term_type && r.data.year) {
        ACTIVE_TERM = r.data.term_type.toUpperCase() + ' TERM ' + r.data.year;
      }
    }
    PREV_TERM = derivePrevTerm(ACTIVE_TERM);
    return ACTIVE_TERM;
  }

  function fmtNaira(v) {
    if (v === '' || v === null || v === undefined) return '—';
    const n = Number(String(v).replace(/[^\d.\-]/g, ''));
    if (isNaN(n) || n === 0) return '₦0.00';
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(v) {
    if (!v) return '—';
    return String(v).trim();
  }
  function isBlank(v) {
    return v === '' || v === null || v === undefined || String(v).trim() === '';
  }

  function resolvePhones(learner, priority) {
    const map = {
      father:   { label: 'Fathers Phone',   value: learner['FATHERS PHONE NUMBER'] || '' },
      mother:   { label: 'Mothers Phone',   value: learner['MOTHERS PHONE NUMBER'] || learner['MOTHERS PHONE NUMBER '] || '' },
      guardian: { label: 'Guardians Phone', value: learner['GUARDIAN PHONE NUMBER'] || '' }
    };
    const order = [
      (priority && priority.first)  || 'father',
      (priority && priority.second) || 'mother',
      (priority && priority.third)  || 'guardian'
    ];
    return {
      first:  map[order[0]] || map.father,
      second: map[order[1]] || map.mother,
      third:  map[order[2]] || map.guardian
    };
  }

  // ================================================================
  // [LB-02b] FIELD WHITELISTS
  // ================================================================
  const TERM_REGEX = /\b(1ST|2ND|3RD|FIRST|SECOND|THIRD)\s+TERM\s+\d{4}\/\d{4}\b/i;

  function isTermSpecific(header) {
    return TERM_REGEX.test(String(header || ''));
  }

  function isFeeField(header) {
    return /BALANCE B F|BILL|OTHER BILL|PART PAYMENT|BALANCE C F|CLEARANCE|CLEARED|TUITION|SCHOLARSHIP|ADJUSTED/i
      .test(String(header || ''));
  }

  function isIdentityOrHistoryField(header) {
    return !isTermSpecific(header) && !isFeeField(header);
  }

  // ================================================================
  // [LB-03] BULK DOWNLOAD TEMPLATE
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
  // [LB-04] BULK UPLOAD UPDATES
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
  // [LB-05] EDIT LEARNER MODAL
  // ================================================================
  async function openLearnerEditModal(pin) {
    showToast('Loading learner...');
    await resolveActiveTerm();

    const [data, fieldMap, priority, otherBills] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin),
      callBackend('LB_getOtherBills', pin, ACTIVE_TERM)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner: ' + ((data && data.message) || 'unknown'), 'error');
      return;
    }
    window.__lbEditingPin = pin;
    window.__lbFieldMap = fieldMap;
    window.__lbLearner = data.learner;
    window.__lbPriority = priority;
    window.__lbOtherBills = otherBills && otherBills.success ? (otherBills.bills || []) : [];

    renderEditModal(data.learner, fieldMap, priority, window.__lbOtherBills);
  }

  function renderEditModal(learner, fieldMap, priority, otherBills) {
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };
    const phones = resolvePhones(learner, priority);

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:1000px;max-height:92vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Edit Learner</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    html += buildPrintBannerHTML();
    html += buildHeaderStrip(learner, phones, 'edit');

    // Section A
    html += '<div class="expandable open"><div class="expandable-header">Section A — Identity</div><div class="expandable-body">';
    (usable.A || []).filter(function (f) {
      const h = String(f.header || '');
      if (/S\/N|PHOTO|CLASS$|PIN|LEARNERS NAME$/i.test(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      if (!isIdentityOrHistoryField(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildEditableField(f, learner[f.header]);
    });
    html += buildPhoneField('PHONE NUMBER — Priority 1', phones.first.label, phones.first.value);
    html += '</div></div>';

    // Section B
    html += '<div class="expandable open"><div class="expandable-header">Section B — Fees (' + escapeHtml(ACTIVE_TERM) + ')</div><div class="expandable-body">';
    html += buildFeeBlock(learner, otherBills, true);
    (usable.B || []).filter(function (f) {
      const h = String(f.header || '');
      if (isTermSpecific(h) || isFeeField(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildEditableField(f, learner[f.header]);
    });
    html += buildPhoneField('PHONE NUMBER — Priority 2', phones.second.label, phones.second.value);
    html += '</div></div>';

    // Section C
    html += '<div class="expandable open"><div class="expandable-header">Section C — History &amp; Origin</div><div class="expandable-body">';
    (usable.C || []).filter(function (f) {
      const h = String(f.header || '');
      if (isTermSpecific(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildEditableField(f, learner[f.header]);
    });
    html += buildPhoneField('PHONE NUMBER — Priority 3', phones.third.label, phones.third.value);
    html += '</div></div>';

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.saveLearnerEdit()">Save Changes</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  function buildPrintBannerHTML() {
    let html = '<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;' +
               'border-bottom:3px solid #0d4d26;padding-bottom:10px;margin-bottom:14px;">';
    html += '<img src="https://lh3.googleusercontent.com/d/1UioBKTzadLkcC5pPCt8_WKFhoOWAzwFv=w200" ' +
            'style="width:70px;height:70px;object-fit:contain;" alt="School">';
    html += '<div style="text-align:center;flex:1;">';
    html += '<div style="font-size:20px;font-weight:900;color:#0d4d26;letter-spacing:1px;">THE IDEAL SCHOOLS</div>';
    html += '<div style="font-size:12px;font-style:italic;color:#555;margin-top:2px;">Scientia est potentia</div>';
    html += '<div style="font-size:11px;color:#333;margin-top:2px;">The Ideal Secondary School &mdash; The Ideal Kiddies School</div>';
    html += '</div>';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w200" ' +
            'style="width:70px;height:70px;object-fit:contain;" alt="Ministry">';
    html += '</div>';
    return html;
  }

  // Clickable header strip — clickable only in EDIT mode, switches to VIEW.
  function buildHeaderStrip(learner, phones, mode) {
    const name = learner['LEARNERS NAME'] || '';
    const pin  = learner['PIN'] || '';
    const cls  = getCurrentTermClass(learner);
    const photo = learner['PHOTO'] || learner['PHOTO '] || learner['photo_url'] || '';

    const clickable = (mode === 'edit');
    const clickAttr = clickable
      ? ' onclick="LB.switchToView(\'' + escapeAttr(pin) + '\')" title="Tap to view read-only profile"'
      : '';

    let html = '<div' + clickAttr +
               ' style="cursor:' + (clickable ? 'pointer' : 'default') + ';display:flex;gap:16px;align-items:center;padding:12px;background:#f3f9ff;border-radius:8px;margin-bottom:16px;">';
    if (photo) {
      html += '<img src="' + escapeAttr(photo) + '" style="width:80px;height:80px;object-fit:cover;border-radius:50%;border:3px solid #0d4d26;" onerror="this.outerHTML=\'<div style=&quot;width:80px;height:80px;border-radius:50%;background:#0d4d26;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;&quot;>' + escapeHtml((name || '?').charAt(0)) + '</div>\'">';
    } else {
      html += '<div style="width:80px;height:80px;border-radius:50%;background:#0d4d26;color:#fff;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:900;">' +
              escapeHtml((name || '?').charAt(0)) + '</div>';
    }
    html += '<div>';
    html += '<div style="font-size:20px;font-weight:800;color:#0d4d26;">' + escapeHtml(name) + '</div>';
    html += '<div style="font-size:13px;color:#555;margin-top:4px;">PIN: <b>' + escapeHtml(pin) + '</b></div>';
    html += '<div style="font-size:13px;color:#555;">Class: <b>' + escapeHtml(cls) + '</b></div>';
    html += '<div style="font-size:12px;color:#777;">Active Term: <b>' + escapeHtml(ACTIVE_TERM) + '</b></div>';
    if (clickable) {
      html += '<div style="font-size:11px;color:#0d4d26;font-weight:700;margin-top:4px;">👆 Tap to view profile</div>';
    }
    html += '</div></div>';
    return html;
  }

  function getCurrentTermClass(learner) {
    const activeClsKey = ACTIVE_TERM + ' CLASS';
    if (learner[activeClsKey]) return learner[activeClsKey];
    const prevClsKey = PREV_TERM + ' CLASS';
    if (learner[prevClsKey]) return learner[prevClsKey];
    const keys = Object.keys(learner);
    const clsKey = keys.find(function (k) { return /CLASS$/i.test(k) && !/ADMITTED|BEFORE/i.test(k); });
    return clsKey ? learner[clsKey] : '';
  }

  function buildEditableField(f, val) {
    const v = val === undefined || val === null ? '' : val;
    const inputId = 'lb_field_' + f.col;
    let html = '<div class="form-group" style="margin-bottom:10px;">';
    html += '<label style="font-weight:600;font-size:12px;">' + escapeHtml(f.header) + '</label>';
    if (/^PHOTO/i.test(f.header)) {
      html += '<div style="display:flex;gap:10px;align-items:center;">';
      html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(v) + '" style="flex:1;">';
      html += '<button type="button" class="btn btn-gold" onclick="LB.pickPhoto(\'' + inputId + '\')">Upload</button>';
      html += '</div>';
    } else {
      html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(v) +
              '" data-field="' + escapeAttr(f.header) + '" data-col="' + f.col + '" style="width:100%;">';
    }
    html += '</div>';
    return html;
  }

  function buildPhoneField(label, sourceHeader, value) {
    const inputId = 'lb_phone_' + sourceHeader.replace(/[^A-Za-z]/g, '_');
    let html = '<div class="form-group" style="margin-bottom:10px;">';
    html += '<label style="font-weight:600;font-size:12px;">' + escapeHtml(label) + '</label>';
    html += '<div style="font-size:11px;color:#666;margin-bottom:3px;">(Sheet column: ' + escapeHtml(sourceHeader) + ')</div>';
    html += '<input type="text" id="' + inputId + '" value="' + escapeAttr(value) +
            '" data-field="' + escapeAttr(sourceHeader) + '" style="width:100%;">';
    html += '</div>';
    return html;
  }

  // ================================================================
  // [LB-06] VIEW LEARNER MODAL
  // ================================================================
  async function openLearnerViewModal(pin) {
    showToast('Loading learner...');
    await resolveActiveTerm();

    const [data, fieldMap, priority, otherBills] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin),
      callBackend('LB_getOtherBills', pin, ACTIVE_TERM)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner: ' + ((data && data.message) || 'unknown'), 'error');
      return;
    }
    window.__lbViewingPin = pin;
    window.__lbLearner = data.learner;
    window.__lbPriority = priority;
    window.__lbOtherBills = otherBills && otherBills.success ? (otherBills.bills || []) : [];

    renderViewModal(data.learner, fieldMap, priority, window.__lbOtherBills);
    bindViewShortcuts(pin);
  }

  function renderViewModal(learner, fieldMap, priority, otherBills) {
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };
    const pin = learner['PIN'] || '';
    const phones = resolvePhones(learner, priority);

    let html = '<div class="modal-overlay" id="lbViewOverlay">';
    html += '<div class="modal-box" style="max-width:1000px;max-height:92vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Learner Profile</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    html += buildPrintBannerHTML();
    html += buildHeaderStrip(learner, phones, 'view');

    html += '<div style="font-size:11px;color:#666;text-align:right;margin-bottom:8px;">' +
            'Keys: <b>E</b> expand all · <b>C</b> collapse all · <b>P</b> print · <b>Esc</b> close</div>';

    // Section A
    html += '<details class="lb-section" open><summary style="cursor:pointer;font-weight:700;color:#fff;background:#0d4d26;padding:8px 12px;border-radius:4px;">Section A — Identity</summary><div style="padding:10px 4px;">';
    (usable.A || []).filter(function (f) {
      const h = String(f.header || '');
      if (/S\/N|PHOTO|CLASS$|PIN|LEARNERS NAME$/i.test(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      if (!isIdentityOrHistoryField(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildViewField(f.header, learner[f.header]);
    });
    html += buildViewField(phones.first.label, phones.first.value);
    html += '</div></details>';

    // Section B
    html += '<details class="lb-section" open><summary style="cursor:pointer;font-weight:700;color:#fff;background:#0d4d26;padding:8px 12px;border-radius:4px;margin-top:8px;">Section B — Fees (' + escapeHtml(ACTIVE_TERM) + ')</summary><div style="padding:10px 4px;">';
    html += buildFeeBlock(learner, otherBills, false);
    (usable.B || []).filter(function (f) {
      const h = String(f.header || '');
      if (isTermSpecific(h) || isFeeField(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildViewField(f.header, learner[f.header]);
    });
    html += buildViewField(phones.second.label, phones.second.value);
    html += '</div></details>';

    // Section C
    html += '<details class="lb-section" open><summary style="cursor:pointer;font-weight:700;color:#fff;background:#0d4d26;padding:8px 12px;border-radius:4px;margin-top:8px;">Section C — History &amp; Origin</summary><div style="padding:10px 4px;">';
    (usable.C || []).filter(function (f) {
      const h = String(f.header || '');
      if (isTermSpecific(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildViewField(f.header, learner[f.header]);
    });
    html += buildViewField(phones.third.label, phones.third.value);
    html += '</div></details>';

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Close (Esc)</button>';
    html += '<button class="btn btn-warning" onclick="LB.openUpdatePaymentModal(\'' + escapeAttr(pin) + '\')">Update Payment</button>';
    html += '<button class="btn btn-gold" onclick="LB.printLearner(\'' + escapeAttr(pin) + '\')">Print (P)</button>';
    html += '<button class="btn btn-primary" onclick="LB.openLearnerEditModal(\'' + escapeAttr(pin) + '\')">Edit</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  function buildViewField(label, val) {
    const shown = (val === '' || val === null || val === undefined) ? '—' : val;
    let html = '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;">';
    html += '<span style="font-size:12px;color:#666;font-weight:600;">' + escapeHtml(label) + '</span>';
    html += '<span style="font-size:13px;color:#000;font-weight:500;text-align:right;max-width:60%;">' + escapeHtml(String(shown)) + '</span>';
    html += '</div>';
    return html;
  }

  // ================================================================
  // [LB-06b] KEYBOARD SHORTCUTS
  // ================================================================
  function bindViewShortcuts(pin) {
    if (window.__lbViewHandler) {
      document.removeEventListener('keydown', window.__lbViewHandler);
    }
    window.__lbViewHandler = function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/i.test(e.target.tagName)) return;
      const key = (e.key || '').toLowerCase();

      if (key === 'escape') {
        closeEditModal();
        document.removeEventListener('keydown', window.__lbViewHandler);
        window.__lbViewHandler = null;
        return;
      }
      if (key === 'e') {
        document.querySelectorAll('#lbModalHost details.lb-section').forEach(function (d) { d.open = true; });
        return;
      }
      if (key === 'c') {
        document.querySelectorAll('#lbModalHost details.lb-section').forEach(function (d) { d.open = false; });
        return;
      }
      if (key === 'p' || (e.ctrlKey && key === 'p')) {
        e.preventDefault();
        printLearner(pin);
        return;
      }
    };
    document.addEventListener('keydown', window.__lbViewHandler);
  }

  function bindLearnerTabShortcuts() {
    if (window.__lbTabHandler) return;
    window.__lbTabHandler = function (e) {
      if (e.target && /INPUT|TEXTAREA|SELECT/i.test(e.target.tagName)) return;
      const host = document.getElementById('lbModalHost');
      if (host && host.innerHTML.trim() !== '') return;
      const learnersVisible = document.getElementById('module-learners') &&
                              !document.getElementById('module-learners').classList.contains('hidden');
      if (!learnersVisible) return;

      const key = (e.key || '').toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        openAddLearnerModal();
      } else if (key === '?' || key === '/') {
        e.preventDefault();
        showHelpModal();
      } else if (key === 'escape') {
        closeEditModal();
      }
    };
    document.addEventListener('keydown', window.__lbTabHandler);
  }

  // ================================================================
  // [LB-07] FEE BLOCK
  // ================================================================
  function collectPartPayments(learner) {
    const rows = [];
    const suffixes = ['1st', '2nd', '3rd', '4th', '5th'];
    suffixes.forEach(function (suffix, i) {
      const dKey = ACTIVE_TERM + ' ' + suffix + ' PART PAYMENT DATE';
      const aKey = ACTIVE_TERM + ' ' + suffix + ' PART PAYMENT AMOUNT';
      const d = learner[dKey];
      const a = learner[aKey];
      if (!isBlank(d) || !isBlank(a)) {
        rows.push({ index: i + 1, suffix: suffix, date: d || '', amount: a || '' });
      }
    });
    return rows;
  }

  function buildFeeBlock(learner, otherBills, editable) {
    const balanceBFKey  = PREV_TERM + ' BALANCE C F';
    const billKey       = ACTIVE_TERM + ' BILL';
    const balanceCFKey  = ACTIVE_TERM + ' BALANCE C F';
    const clearanceKey  = ACTIVE_TERM + ' CLEARANCE';
    const clearedKey    = ACTIVE_TERM + ' Cleared';

    const rows = collectPartPayments(learner);
    const totalPartPayment = rows.reduce(function (sum, r) {
      const n = Number(String(r.amount || '').replace(/[^\d.\-]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    const bill = Number(String(learner[billKey] || '').replace(/[^\d.\-]/g, '')) || 0;
    const otherBillTotal = (otherBills || []).reduce(function (sum, b) {
      const n = Number(String(b.Amount || b.amount || '').replace(/[^\d.\-]/g, ''));
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
    const netBill = bill + otherBillTotal;
    const balanceCF = netBill - totalPartPayment;

    let html = '';

    html += buildViewField('Previous Term Balance B/F — ' + PREV_TERM, fmtNaira(learner[balanceBFKey]));
    html += buildViewField('Current Term Tuition (Bill) — ' + ACTIVE_TERM, fmtNaira(learner[billKey]));

    html += '<div style="margin-top:10px;margin-bottom:6px;font-weight:700;font-size:12px;color:#0d4d26;">Other Bills (' + escapeHtml(ACTIVE_TERM) + ')</div>';
    if (otherBills && otherBills.length) {
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#f0f0f0;">' +
              '<th style="text-align:left;padding:5px;">#</th>' +
              '<th style="text-align:left;padding:5px;">Description</th>' +
              '<th style="text-align:right;padding:5px;">Amount</th>' +
              (editable ? '<th style="text-align:right;padding:5px;">Action</th>' : '') +
              '</tr></thead><tbody>';
      otherBills.forEach(function (b, i) {
        html += '<tr>' +
                '<td style="padding:5px;">' + (i + 1) + '</td>' +
                '<td style="padding:5px;">' + escapeHtml(b.Description || b.description || '') + '</td>' +
                '<td style="padding:5px;text-align:right;">' + fmtNaira(b.Amount || b.amount) + '</td>' +
                (editable ? '<td style="padding:5px;text-align:right;"><button type="button" class="btn btn-sm btn-danger" onclick="LB.removeOtherBill(\'' + escapeAttr(b.id || '') + '\')">Remove</button></td>' : '') +
                '</tr>';
      });
      html += '</tbody></table>';
    } else {
      html += '<div style="padding:6px 0;font-size:12px;color:#888;">No other bills yet.</div>';
    }
    html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ccc;font-weight:700;">' +
            '<span style="font-size:12px;">Other Bills Total</span>' +
            '<span style="font-size:13px;">' + fmtNaira(otherBillTotal) + '</span>' +
            '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ccc;font-weight:700;">' +
            '<span style="font-size:12px;">Net Bills (Tuition + Other Bills)</span>' +
            '<span style="font-size:13px;">' + fmtNaira(netBill) + '</span>' +
            '</div>';
    if (editable) {
      html += '<div style="margin:6px 0;"><button type="button" class="btn btn-sm btn-primary" onclick="LB.addOtherBillPrompt()">+ Add Bill</button></div>';
    }

    html += '<div style="margin-top:16px;margin-bottom:6px;font-weight:700;font-size:12px;color:#0d4d26;">Part Payments (' + escapeHtml(ACTIVE_TERM) + ')</div>';
    if (rows.length === 0) {
      html += '<div style="padding:6px 0;font-size:12px;color:#888;">No payments recorded for this term yet.</div>';
    } else {
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#f0f0f0;">' +
              '<th style="text-align:left;padding:5px;">#</th>' +
              '<th style="text-align:left;padding:5px;">Date</th>' +
              '<th style="text-align:right;padding:5px;">Amount</th>' +
              '</tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr>' +
                '<td style="padding:5px;">' + r.index + '</td>' +
                '<td style="padding:5px;">' + escapeHtml(fmtDate(r.date)) + '</td>' +
                '<td style="padding:5px;text-align:right;">' + fmtNaira(r.amount) + '</td>' +
                '</tr>';
      });
      html += '</tbody></table>';
    }
    html += '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #ccc;font-weight:700;">' +
            '<span style="font-size:12px;">Total Part Payment</span>' +
            '<span style="font-size:13px;">' + fmtNaira(totalPartPayment) + '</span>' +
            '</div>';

    html += buildViewField('Balance C/F — ' + ACTIVE_TERM, fmtNaira(balanceCF));
    html += buildViewField('Clearance Date — ' + ACTIVE_TERM, fmtDate(learner[clearanceKey]));
    html += buildViewField('Cleared — ' + ACTIVE_TERM, learner[clearedKey] || 'No');

    return html;
  }

  // ================================================================
  // [LB-08] OTHER BILLS BLOCK
  // ================================================================
  function addOtherBillPrompt() {
    const pin = window.__lbEditingPin || window.__lbViewingPin;
    if (!pin) return;
    const desc = prompt('Description of the other bill (e.g. Sports Fee):');
    if (!desc) return;
    const amtStr = prompt('Amount in Naira (digits only):');
    if (!amtStr) return;
    const amt = Number(String(amtStr).replace(/[^\d.\-]/g, ''));
    if (isNaN(amt) || amt <= 0) { showToast('Invalid amount.', 'error'); return; }

    if ((window.__lbOtherBills || []).length >= 7) {
      showToast('Maximum of 7 other bills per term.', 'warning');
      return;
    }

    showToast('Adding bill...');
    callBackend('LB_addOtherBill', pin, ACTIVE_TERM, desc, amt).then(function (res) {
      if (res && res.success) {
        showToast('Bill added.', 'success');
        openLearnerEditModal(pin);
      } else {
        showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
      }
    });
  }

  function removeOtherBill(billId) {
    if (!billId) return;
    if (!confirm('Remove this bill?')) return;
    const pin = window.__lbEditingPin || window.__lbViewingPin;
    showToast('Removing...');
    callBackend('LB_removeOtherBill', billId).then(function (res) {
      if (res && res.success) {
        showToast('Bill removed.', 'success');
        openLearnerEditModal(pin);
      } else {
        showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
      }
    });
  }

  // ================================================================
  // [LB-09] UPDATE PAYMENT MODAL
  // ================================================================
  function openUpdatePaymentModal(pin) {
    const learner = window.__lbLearner || {};
    const rows = collectPartPayments(learner);
    if (rows.length >= 5) {
      showToast('All 5 part payments for this term are already recorded.', 'warning');
      return;
    }
    const nextIdx = rows.length + 1;
    const suffixes = ['1st', '2nd', '3rd', '4th', '5th'];
    const nextSuffix = suffixes[nextIdx - 1];

    let html = '<div class="modal-overlay" onclick="if(event.target===this)LB.closeEditModal()">';
    html += '<div class="modal-box" style="max-width:480px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Add ' + nextSuffix + ' Part Payment</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';
    html += '<div style="font-size:12px;color:#666;margin-bottom:12px;">' + escapeHtml(ACTIVE_TERM) + ' — ' +
            escapeHtml(learner['LEARNERS NAME'] || '') + ' (' + escapeHtml(pin) + ')</div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">Payment Date</label>';
    html += '<input type="date" id="lb_pp_date" value="' + new Date().toISOString().slice(0, 10) + '" style="width:100%;"></div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">Amount (₦)</label>';
    html += '<input type="number" id="lb_pp_amount" placeholder="e.g. 20000" style="width:100%;"></div>';
    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.savePayment(\'' + escapeAttr(pin) + '\', ' + nextIdx + ')">Save Payment</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  function savePayment(pin, installmentIndex) {
    const dateEl = document.getElementById('lb_pp_date');
    const amtEl  = document.getElementById('lb_pp_amount');
    if (!dateEl || !amtEl) return;
    const date = dateEl.value;
    const amount = Number(amtEl.value);
    if (!date) { showToast('Pick a date.', 'warning'); return; }
    if (!amount || amount <= 0) { showToast('Enter a valid amount.', 'warning'); return; }

    showToast('Saving payment...');
    callBackend('LB_addPartPayment', pin, ACTIVE_TERM, installmentIndex, date, amount).then(function (res) {
      if (res && res.success) {
        showToast('Payment recorded.', 'success');
        openLearnerEditModal(pin);
      } else {
        showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
      }
    });
  }

  // ================================================================
  // [LB-10] PRINT LEARNER
  // ================================================================
  async function printLearner(pin) {
    showToast('Preparing print...');
    await resolveActiveTerm();

    const [data, fieldMap, priority, otherBills] = await Promise.all([
      callBackend('LB_getLearnerFull', pin),
      callBackend('LB_getLearnerFieldMap'),
      callBackend('LB_getContactPriority', pin),
      callBackend('LB_getOtherBills', pin, ACTIVE_TERM)
    ]);

    if (!data || !data.success) {
      showToast('Could not load learner for printing.', 'error');
      return;
    }
    window.__lbPrintPayload = {
      learner: data.learner,
      fieldMap: fieldMap,
      priority: priority,
      otherBills: otherBills && otherBills.success ? (otherBills.bills || []) : [],
      term: ACTIVE_TERM,
      prevTerm: PREV_TERM
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)LB.closeEditModal()">';
    html += '<div class="modal-box" style="max-width:460px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Print Learner</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    html += '<div style="margin-bottom:12px;font-size:13px;font-weight:600;color:#333;">Sections to print:</div>';
    html += '<label style="display:block;margin-bottom:6px;"><input type="checkbox" id="lb_psec_a" checked> Section A — Identity</label>';
    html += '<label style="display:block;margin-bottom:6px;"><input type="checkbox" id="lb_psec_b" checked> Section B — Fees</label>';
    html += '<label style="display:block;margin-bottom:12px;"><input type="checkbox" id="lb_psec_c" checked> Section C — History &amp; Origin</label>';

    html += '<div style="margin-bottom:12px;font-size:13px;font-weight:600;color:#333;">Paper format:</div>';
    html += '<label style="display:block;margin-bottom:6px;"><input type="radio" name="lb_paper" value="A4" checked> A4 (banner header)</label>';
    html += '<label style="display:block;margin-bottom:12px;"><input type="radio" name="lb_paper" value="80mm"> 80mm Thermal receipt</label>';

    html += '<div style="text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.performPrint()">Print Now</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  function performPrint() {
    const a = (document.getElementById('lb_psec_a') || {}).checked !== false;
    const b = (document.getElementById('lb_psec_b') || {}).checked !== false;
    const c = (document.getElementById('lb_psec_c') || {}).checked !== false;
    const paperEls = document.querySelectorAll('input[name="lb_paper"]');
    let paper = 'A4';
    paperEls.forEach(function (el) { if (el.checked) paper = el.value; });

    if (!a && !b && !c) { showToast('Select at least one section to print.', 'warning'); return; }

    const p = window.__lbPrintPayload;
    if (!p) return;
    const html = buildPrintHTML(p, paper, { A: a, B: b, C: c });
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  function buildPrintHTML(payload, format, sectionsToPrint) {
    const learner = payload.learner;
    const usable  = (payload.fieldMap && payload.fieldMap.success) ? payload.fieldMap : { A: [], B: [], C: [] };
    const priority = payload.priority || {};
    const otherBills = payload.otherBills || [];
    const term = payload.term;
    const prevTerm = payload.prevTerm || '';
    const phones = resolvePhones(learner, priority);
    const name  = learner['LEARNERS NAME'] || '';
    const pin   = learner['PIN'] || '';
    const cls   = getCurrentTermClass(learner);
    const photo = learner['PHOTO'] || learner['PHOTO '] || learner['photo_url'] || '';

    const isReceipt = format === '80mm';

    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<title>' + escapeHtml(name || pin) + '</title>';
    html += '<style>';
    if (isReceipt) {
      html += '@page { size: 80mm auto; margin: 3mm; }';
      html += 'body{font-family:Arial,sans-serif;width:74mm;font-size:11px;color:#000;margin:0;padding:0;}';
    } else {
      html += '@page { size: A4; margin: 12mm; }';
      html += 'body{font-family:Arial,sans-serif;padding:20px;color:#000;font-size:12px;}';
    }
    html += '.banner{display:flex;gap:10px;align-items:center;justify-content:space-between;' +
            'border-bottom:3px solid #0d4d26;padding-bottom:10px;margin-bottom:14px;}';
    html += '.banner .logo{width:' + (isReceipt ? '50px' : '70px') + ';height:' + (isReceipt ? '50px' : '70px') + ';object-fit:contain;}';
    html += '.banner .center{text-align:center;flex:1;}';
    html += '.banner .school{font-size:' + (isReceipt ? '13px' : '20px') + ';font-weight:900;color:#0d4d26;letter-spacing:1px;}';
    html += '.banner .motto{font-size:' + (isReceipt ? '9px' : '12px') + ';font-style:italic;color:#555;margin-top:2px;}';
    html += '.banner .schools{font-size:' + (isReceipt ? '8px' : '11px') + ';color:#333;margin-top:2px;}';
    html += '.header-photo{width:' + (isReceipt ? '60px' : '90px') + ';height:' + (isReceipt ? '60px' : '90px') + ';object-fit:cover;border-radius:50%;border:3px solid #0d4d26;}';
    html += '.avatar-fallback{width:' + (isReceipt ? '60px' : '90px') + ';height:' + (isReceipt ? '60px' : '90px') + ';border-radius:50%;background:#0d4d26;color:#fff;display:flex;align-items:center;justify-content:center;font-size:' + (isReceipt ? '26px' : '38px') + ';font-weight:900;}';
    html += '.learner-name{font-size:' + (isReceipt ? '14px' : '22px') + ';font-weight:900;color:#0d4d26;}';
    html += '.learner-meta{font-size:' + (isReceipt ? '10px' : '13px') + ';color:#333;margin-top:3px;}';
    html += 'h3{background:#0d4d26;color:#fff;padding:' + (isReceipt ? '3px 6px' : '6px 10px') + ';font-size:' + (isReceipt ? '10px' : '12px') + ';text-transform:uppercase;margin:14px 0 6px;letter-spacing:1px;}';
    html += 'table{width:100%;border-collapse:collapse;font-size:' + (isReceipt ? '10px' : '12px') + ';}';
    html += 'td{padding:' + (isReceipt ? '2px 3px' : '4px 6px') + ';border-bottom:1px solid #ccc;vertical-align:top;}';
    html += 'td:first-child{font-weight:700;color:#333;width:38%;}';
    html += '.total-row td{font-weight:900;background:#f0f0f0;}';
    html += '.footer{margin-top:16px;font-size:' + (isReceipt ? '9px' : '11px') + ';color:#555;text-align:center;border-top:1px solid #ccc;padding-top:6px;}';
    html += '@media print {.no-print{display:none;}}';
    html += '</style></head><body>';

    html += '<div class="banner">';
    html += '<img class="logo" src="https://lh3.googleusercontent.com/d/1UioBKTzadLkcC5pPCt8_WKFhoOWAzwFv=w200" alt="School">';
    html += '<div class="center">';
    html += '<div class="school">THE IDEAL SCHOOLS</div>';
    html += '<div class="motto">Scientia est potentia</div>';
    html += '<div class="schools">The Ideal Secondary School &mdash; The Ideal Kiddies School</div>';
    html += '</div>';
    html += '<img class="logo" src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w200" alt="Ministry">';
    html += '</div>';

    html += '<div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">';
    if (photo) {
      html += '<img class="header-photo" src="' + escapeAttr(photo) + '" onerror="this.outerHTML=\'<div class=&quot;avatar-fallback&quot;>' + escapeHtml((name || '?').charAt(0)) + '</div>\'">';
    } else {
      html += '<div class="avatar-fallback">' + escapeHtml((name || '?').charAt(0)) + '</div>';
    }
    html += '<div>';
    html += '<div class="learner-name">' + escapeHtml(name) + '</div>';
    html += '<div class="learner-meta">PIN: <b>' + escapeHtml(pin) + '</b></div>';
    html += '<div class="learner-meta">Class: <b>' + escapeHtml(cls) + '</b></div>';
    html += '<div class="learner-meta">Active Term: <b>' + escapeHtml(term) + '</b></div>';
    html += '</div></div>';

    if (sectionsToPrint.A) {
      html += '<h3>Section A — Identity</h3><table>';
      (usable.A || []).filter(function (f) {
        const h = String(f.header || '');
        if (/S\/N|PHOTO|CLASS$|PIN|LEARNERS NAME$/i.test(h)) return false;
        if (/PHONE NUMBER/i.test(h)) return false;
        if (!isIdentityOrHistoryField(h)) return false;
        return true;
      }).forEach(function (f) {
        html += '<tr><td>' + escapeHtml(f.header) + '</td><td>' + escapeHtml(String(learner[f.header] || '—')) + '</td></tr>';
      });
      html += '<tr><td>' + escapeHtml(phones.first.label) + '</td><td>' + escapeHtml(phones.first.value || '—') + '</td></tr>';
      html += '</table>';
    }

    if (sectionsToPrint.B) {
      html += '<h3>Section B — Fees (' + escapeHtml(term) + ')</h3><table>';
      html += '<tr><td>Previous Term Balance B/F (' + escapeHtml(prevTerm) + ')</td><td>' + fmtNaira(learner[prevTerm + ' BALANCE C F']) + '</td></tr>';
      html += '<tr><td>Current Term Tuition (' + escapeHtml(term) + ')</td><td>' + fmtNaira(learner[term + ' BILL']) + '</td></tr>';
      let otherTotal = 0;
      otherBills.forEach(function (bl) {
        const amt = Number(String(bl.Amount || bl.amount || '').replace(/[^\d.\-]/g, '')) || 0;
        otherTotal += amt;
        html += '<tr><td>Other Bill — ' + escapeHtml(bl.Description || bl.description || '') + '</td><td>' + fmtNaira(amt) + '</td></tr>';
      });
      html += '<tr class="total-row"><td>Other Bills Total</td><td>' + fmtNaira(otherTotal) + '</td></tr>';

      const partRows = collectPartPayments(learner);
      if (partRows.length) {
        html += '<tr><td colspan="2" style="font-weight:700;background:#f0f0f0;">Part Payments</td></tr>';
        let paidTotal = 0;
        partRows.forEach(function (r) {
          const amt = Number(String(r.amount || '').replace(/[^\d.\-]/g, '')) || 0;
          paidTotal += amt;
          html += '<tr><td>' + escapeHtml(r.suffix) + ' — ' + escapeHtml(r.date || '—') + '</td><td>' + fmtNaira(amt) + '</td></tr>';
        });
        html += '<tr class="total-row"><td>Total Part Payment</td><td>' + fmtNaira(paidTotal) + '</td></tr>';
      }

      html += '<tr><td>Balance C/F</td><td>' + fmtNaira(learner[term + ' BALANCE C F']) + '</td></tr>';
      html += '<tr><td>Clearance Date</td><td>' + escapeHtml(learner[term + ' CLEARANCE'] || '—') + '</td></tr>';
      html += '<tr><td>Cleared</td><td>' + escapeHtml(learner[term + ' Cleared'] || 'No') + '</td></tr>';
      html += '<tr><td>' + escapeHtml(phones.second.label) + '</td><td>' + escapeHtml(phones.second.value || '—') + '</td></tr>';
      html += '</table>';
    }

    if (sectionsToPrint.C) {
      html += '<h3>Section C — History &amp; Origin</h3><table>';
      (usable.C || []).filter(function (f) {
        const h = String(f.header || '');
        if (isTermSpecific(h)) return false;
        if (/PHONE NUMBER/i.test(h)) return false;
        return true;
      }).forEach(function (f) {
        html += '<tr><td>' + escapeHtml(f.header) + '</td><td>' + escapeHtml(String(learner[f.header] || '—')) + '</td></tr>';
      });
      html += '<tr><td>' + escapeHtml(phones.third.label) + '</td><td>' + escapeHtml(phones.third.value || '—') + '</td></tr>';
      html += '</table>';
    }

    html += '<div class="footer">Printed: ' + new Date().toLocaleString() + ' &nbsp;·&nbsp; The Ideal Schools Operational Portal</div>';
    html += '<div class="no-print" style="text-align:center;margin-top:20px;">';
    html += '<button onclick="window.print()" style="padding:10px 24px;font-size:14px;background:#0d4d26;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Print Now</button>';
    html += '<button onclick="window.close()" style="margin-left:8px;padding:10px 24px;font-size:14px;background:#666;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:700;">Close</button>';
    html += '</div>';
    html += '<script>setTimeout(function(){window.print();},700);<\/script>';
    html += '</body></html>';
    return html;
  }

  // ================================================================
  // [LB-11] ADD NEW LEARNER
  // ================================================================
  async function openAddLearnerModal() {
    showToast('Preparing form...');
    const fieldMap = await callBackend('LB_getLearnerFieldMap');
    const usable = (fieldMap && fieldMap.success) ? fieldMap : { A: [], B: [], C: [] };

    window.__lbEditingPin = null;
    window.__lbFieldMap = usable;
    window.__lbPriority = { first: 'father', second: 'mother', third: 'guardian' };

    let html = '<div class="modal-overlay" id="lbEditOverlay">';
    html += '<div class="modal-box" style="max-width:1000px;max-height:92vh;overflow-y:auto;">';
    html += '<div class="modal-header"><h2>Add New Learner</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    html += buildPrintBannerHTML();

    html += '<div class="expandable open"><div class="expandable-header">Section A — Identity</div><div class="expandable-body">';
    (usable.A || []).filter(function (f) {
      const h = String(f.header || '');
      if (/S\/N/i.test(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      if (!isIdentityOrHistoryField(h) && !/PHOTO|PIN|LEARNERS NAME|CLASS$/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildEditableField(f, '');
    });
    html += '</div></div>';

    html += '<div class="expandable open"><div class="expandable-header">Section B — Initial Bill (' + escapeHtml(ACTIVE_TERM) + ')</div><div class="expandable-body">';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">Opening Balance (previous B/F)</label>';
    html += '<input type="number" data-field="__opening_balance" value="0" style="width:100%;"></div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">' + escapeHtml(ACTIVE_TERM) + ' Tuition (Bill)</label>';
    html += '<input type="number" data-field="__initial_bill" value="0" style="width:100%;"></div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">First Payment Amount (optional)</label>';
    html += '<input type="number" data-field="__first_payment_amount" value="" style="width:100%;"></div>';
    html += '<div class="form-group" style="margin-bottom:10px;"><label style="font-weight:600;font-size:12px;">First Payment Date (optional)</label>';
    html += '<input type="date" data-field="__first_payment_date" value="" style="width:100%;"></div>';
    html += '</div></div>';

    html += '<div class="expandable open"><div class="expandable-header">Section C — History &amp; Origin</div><div class="expandable-body">';
    (usable.C || []).filter(function (f) {
      const h = String(f.header || '');
      if (isTermSpecific(h)) return false;
      if (/PHONE NUMBER/i.test(h)) return false;
      return true;
    }).forEach(function (f) {
      html += buildEditableField(f, '');
    });
    html += '</div></div>';

    html += '<div style="margin-top:16px;text-align:right;display:flex;gap:8px;justify-content:flex-end;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Cancel</button>';
    html += '<button class="btn btn-success" onclick="LB.saveNewLearner()">Create Learner &amp; Generate Bill</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  async function saveNewLearner() {
    const inputs = document.querySelectorAll('#lbModalHost [data-field]');
    const row = {};
    const extras = {};
    inputs.forEach(function (inp) {
      if (inp.dataset.field.indexOf('__') === 0) {
        extras[inp.dataset.field] = inp.value;
      } else {
        row[inp.dataset.field] = inp.value;
      }
    });
    if (!row['PIN']) { showToast('PIN is required.'); return; }

    showToast('Creating learner...');
    const res = await callBackend('LB_addNewLearner', row);
    if (!res || !res.success) {
      showToast('Failed: ' + ((res && res.message) || 'unknown'), 'error');
      return;
    }

    const billData = {
      pin: row['PIN'],
      term: ACTIVE_TERM,
      opening_balance: Number(extras['__opening_balance'] || 0),
      tuition: Number(extras['__initial_bill'] || 0),
      first_payment_amount: Number(extras['__first_payment_amount'] || 0),
      first_payment_date: extras['__first_payment_date'] || ''
    };

    showToast('Generating bill...');
    const billRes = await callBackend('LB_generateBillForNewLearner', billData);
    if (billRes && billRes.success) {
      showToast('Learner created and bill generated.', 'success');
    } else {
      showToast('Learner created, but bill generation failed: ' +
                ((billRes && billRes.message) || 'unknown'), 'warning');
    }

    closeEditModal();
    if (typeof window.loadLearners === 'function') window.loadLearners();
  }

  // ================================================================
  // [LB-12] PHOTO PICKER
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
  // [LB-13] HELP MODAL
  // ================================================================
  function showHelpModal() {
    let html = '<div class="modal-overlay" onclick="if(event.target===this)LB.closeEditModal()">';
    html += '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Keyboard Shortcuts</h2>' +
            '<button class="close-btn" onclick="LB.closeEditModal()">&times;</button></div>';

    html += '<div style="font-size:13px;line-height:1.8;">';
    html += '<div style="font-weight:700;color:#0d4d26;margin-bottom:6px;">On Learners tab (no modal open):</div>';
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
    html += '<tr><td style="padding:4px;font-weight:700;width:100px;"><kbd>A</kbd></td><td>Add New Learner</td></tr>';
    html += '<tr><td style="padding:4px;font-weight:700;"><kbd>?</kbd> or <kbd>/</kbd></td><td>Show this help</td></tr>';
    html += '</table>';

    html += '<div style="font-weight:700;color:#0d4d26;margin-top:12px;margin-bottom:6px;">In View / Edit modal:</div>';
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
    html += '<tr><td style="padding:4px;font-weight:700;width:100px;"><kbd>E</kbd></td><td>Expand all sections</td></tr>';
    html += '<tr><td style="padding:4px;font-weight:700;"><kbd>C</kbd></td><td>Collapse all sections</td></tr>';
    html += '<tr><td style="padding:4px;font-weight:700;"><kbd>P</kbd> or <kbd>Ctrl+P</kbd></td><td>Print learner</td></tr>';
    html += '<tr><td style="padding:4px;font-weight:700;"><kbd>Esc</kbd></td><td>Close modal</td></tr>';
    html += '</table>';

    html += '<div style="font-weight:700;color:#0d4d26;margin-top:12px;margin-bottom:6px;">Mobile tips:</div>';
    html += '<div style="font-size:12px;color:#555;">';
    html += '• Tap the learner name ribbon in the Edit modal to switch to View mode.<br>';
    html += '• Tap any section title to expand or collapse it.<br>';
    html += '• Hold the phone horizontally for wider table view.';
    html += '</div></div>';

    html += '<div style="margin-top:16px;text-align:right;">';
    html += '<button class="btn btn-secondary" onclick="LB.closeEditModal()">Close</button>';
    html += '</div></div></div>';

    getModalHost().innerHTML = html;
  }

  // ================================================================
  // [LB-14] PUBLIC API EXPORT
  // ================================================================
  function closeEditModal() {
    const host = document.getElementById('lbModalHost');
    if (host) host.innerHTML = '';
    if (window.__lbViewHandler) {
      document.removeEventListener('keydown', window.__lbViewHandler);
      window.__lbViewHandler = null;
    }
  }

  async function saveLearnerEdit() {
    const pin = window.__lbEditingPin;
    if (!pin) return;
    const inputs = document.querySelectorAll('#lbModalHost [data-field]');
    const patch = {};
    inputs.forEach(function (inp) { patch[inp.dataset.field] = inp.value; });

    showToast('Saving...');
    const updateRes = await callBackend('LB_updateLearner', pin, patch);

    if (updateRes && updateRes.success) {
      showToast('Learner updated.', 'success');
      closeEditModal();
      if (typeof window.loadLearners === 'function') window.loadLearners();
    } else {
      showToast('Save failed: ' + ((updateRes && updateRes.message) || 'unknown'), 'error');
    }
  }

  async function switchToView(pin) {
    if (!pin) return;
    closeEditModal();
    await openLearnerViewModal(pin);
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

  window.LB = {
    downloadLearnerTemplate: downloadLearnerTemplate,
    uploadLearnerUpdates: uploadLearnerUpdates,
    openLearnerEditModal: openLearnerEditModal,
    openLearnerViewModal: openLearnerViewModal,
    openAddLearnerModal: openAddLearnerModal,
    switchToView: switchToView,
    saveLearnerEdit: saveLearnerEdit,
    saveNewLearner: saveNewLearner,
    addHeaderToSection: addHeaderToSection,
    addOtherBillPrompt: addOtherBillPrompt,
    removeOtherBill: removeOtherBill,
    openUpdatePaymentModal: openUpdatePaymentModal,
    savePayment: savePayment,
    printLearner: printLearner,
    performPrint: performPrint,
    closeEditModal: closeEditModal,
    pickPhoto: pickPhoto,
    showHelpModal: showHelpModal,
    callBackend: callBackend
  };

  bindLearnerTabShortcuts();

  console.log('[LB] Learner Bulk module loaded — active term aware, keyboard shortcuts active.');

})();
