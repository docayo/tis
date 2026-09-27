// ================================================================
// TIS EMIS — APPLICATION LOGIC
// File: app.js
// ================================================================
// SECTION MAP:
//   [S01] STATE
//   [S02] UTILITIES
//   [S03] PERMISSIONS
//   [S04] AUTH
//   [S05] PASSWORD CHANGE
//   [S06] NAVIGATION
//   [S07] LEARNERS
//   [S08] STAFF
//   [S09] TERMS
//   [S10] LEARNER ATTENDANCE
//   [S11] STAFF ATTENDANCE
//   [S12] CALENDAR
//   [S13] CALENDAR IMPORT
//   [S14] QR
//   [S15] REPORTS
//   [S16] CLASSES
//   [S17] USERS
//   [S18] PLACEHOLDERS
//   [S19] WIRE + BOOT
//   [S20] PUBLIC API
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [S01] STATE
  // ================================================================
  const State = {
    profile: null,
    permissions: {},
    cachedLearners: [],
    cachedStaff: [],
    cachedTerms: [],
    cachedClasses: []
  };

  const ALL_MODULES = [
    'learners', 'staff', 'terms', 'attendance', 'staffatt',
    'broadsheet', 'calendar', 'qr', 'reports',
    'classes', 'users'
  ];

  // ================================================================
  // [S02] UTILITIES
  // ================================================================
  function $(id) { return document.getElementById(id); }
  function setHTML(id, html) { const el = $(id); if (el) el.innerHTML = html; }
  function setText(id, txt) { const el = $(id); if (el) el.textContent = txt; }

  function esc(s) {
    return (s === null || s === undefined ? '' : s).toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escAttr(s) {
    return (s === null || s === undefined ? '' : s).toString()
      .replace(/\\/g, '\\\\').replace(/'/g, "\\'")
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  }
  function fmtDate(v) {
    if (!v) return '—';
    if (v instanceof Date) {
      const dd = String(v.getDate()).padStart(2, '0');
      const mm = String(v.getMonth() + 1).padStart(2, '0');
      return dd + '/' + mm + '/' + v.getFullYear();
    }
    const s = v.toString().trim();
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime()) && s.length > 12) {
      const dd = String(parsed.getDate()).padStart(2, '0');
      const mm = String(parsed.getMonth() + 1).padStart(2, '0');
      return dd + '/' + mm + '/' + parsed.getFullYear();
    }
    return s;
  }

  function showToast(msg, type) {
    const t = $('toast');
    if (!t) { console.log('[toast]', msg); return; }
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4500);
  }

  let loaderCount = 0;
  function startLoader() {
    loaderCount++;
    const cl = $('cornerLoader');
    if (cl) cl.classList.remove('hidden');
  }
  function stopLoader() {
    loaderCount--;
    if (loaderCount < 0) loaderCount = 0;
    if (loaderCount === 0) {
      const cl = $('cornerLoader');
      if (cl) cl.classList.add('hidden');
    }
  }

  function pageLoaderHTML(msg) {
    return '<div class="page-loader"><p>' + esc(msg || 'Loading...') + '</p></div>';
  }
  function emptyHTML(icon, title, sub) {
    return '<div class="empty-state"><i class="fas ' + (icon || 'fa-inbox') + '"></i><h3>' +
           esc(title || 'Nothing here') + '</h3>' +
           (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }
  function errorHTML(title, detail) {
    return '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>' +
           esc(title) + '</h3>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '</div>';
  }

  function closeModal() { setHTML('modalContainer', ''); }
  function toggleExpandable(id) {
    const el = $(id);
    if (el) el.classList.toggle('open');
  }
  function debounce(fn, delay) {
    let t = null;
    return function () {
      const args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ================================================================
  // [S03] PERMISSIONS
  // ================================================================
  function isSuperAdmin() {
    return !!(State.profile && State.profile.role === 'super_admin');
  }
  function hasPermission(key) {
    if (isSuperAdmin()) return true;
    if (!key) return true;
    return State.permissions && State.permissions[key] === true;
  }
  function applyPermissionsToUI() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
      const mod = btn.dataset.tab;
      if (hasPermission('read_' + mod)) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    });
    document.querySelectorAll('[data-perm]').forEach(btn => {
      if (hasPermission(btn.dataset.perm)) btn.classList.remove('hidden');
      else btn.classList.add('hidden');
    });
  }
  function getFirstPermittedTab() {
    for (let i = 0; i < ALL_MODULES.length; i++) {
      if (hasPermission('read_' + ALL_MODULES[i])) return ALL_MODULES[i];
    }
    return 'learners';
  }

  // ================================================================
  // [S04] AUTH
  // ================================================================
  async function doLogin() {
    const idEl = $('loginId');
    const pwEl = $('loginPassword');
    const id = idEl ? idEl.value.trim() : '';
    const pw = pwEl ? pwEl.value : '';

    if (!id || !pw) { setText('loginStatus', 'Enter your User ID and password.'); return; }

    const btn = $('loginBtn');
    if (btn) btn.disabled = true;
    setText('loginStatus', 'Checking your details...');

    const r = await window.TIS.signIn(id, pw);
    if (!r || !r.ok) {
      if (btn) btn.disabled = false;
      setText('loginStatus', (r && r.error) || 'Login failed.');
      if (pwEl) { pwEl.value = ''; pwEl.focus(); }
      return;
    }

    State.profile = r.data.profile;
    State.permissions = r.data.profile.authorities || {};
    if (pwEl) pwEl.value = '';
    setText('loginStatus', '');
    if (btn) btn.disabled = false;
    enterDashboard();
  }

  async function doLogout() {
    closeModal();
    try { await window.TIS.signOut(); } catch (e) { /* silent */ }
    State.profile = null;
    State.permissions = {};
    showLoginScreen();
    showToast('Signed out', 'info');
  }

  function showLoginScreen() {
    const lp = $('loginPage'); if (lp) lp.classList.remove('hidden');
    const dh = $('dashboardHeader'); if (dh) dh.classList.add('hidden');
    const mc = $('mainContainer'); if (mc) mc.classList.add('hidden');
    const df = $('dashboardFooter'); if (df) df.classList.add('hidden');
    const ls = $('loadingScreen'); if (ls) ls.classList.add('hidden');
    const idEl = $('loginId');
    if (idEl) { idEl.value = ''; setTimeout(() => idEl.focus(), 100); }
    const st = $('loginStatus'); if (st) st.textContent = '';
    const btn = $('loginBtn'); if (btn) btn.disabled = false;
  }

  function enterDashboard() {
    const lp = $('loginPage'); if (lp) lp.classList.add('hidden');
    const dh = $('dashboardHeader'); if (dh) dh.classList.remove('hidden');
    const mc = $('mainContainer'); if (mc) mc.classList.remove('hidden');
    const df = $('dashboardFooter'); if (df) df.classList.remove('hidden');
    const ls = $('loadingScreen'); if (ls) ls.classList.add('hidden');

    setText('dashOperatorName', State.profile.name || 'Operator');
    setText('dashOperatorRole', State.profile.role || 'Operator');
    const av = $('dashAvatar');
    if (av && State.profile.avatar_url) av.src = State.profile.avatar_url;

    applyPermissionsToUI();
    showToast('Welcome, ' + (State.profile.name || 'Operator'), 'success');

    switchTab(getFirstPermittedTab());

    if (State.profile.must_change_password) {
      setTimeout(() => {
        showToast('Please change your password when you are ready.', 'warning');
      }, 1500);
    }
  }

  // ================================================================
  // [S05] PASSWORD CHANGE
  // ================================================================
  function openChangePasswordModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Change password</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-group"><label>Current password</label><input type="password" id="cp_old"></div>' +
      '<div class="form-group"><label>New password</label><input type="password" id="cp_new" placeholder="at least 4 characters"></div>' +
      '<div class="form-group"><label>Confirm new password</label><input type="password" id="cp_new2"></div>' +
      '<div style="text-align:right;margin-top:12px;"><button class="btn btn-success" id="cp_submit" type="button">Update password</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    const btn = $('cp_submit');
    if (btn) btn.addEventListener('click', submitChangePassword);
  }

  async function submitChangePassword() {
    const oldPw  = $('cp_old')  ? $('cp_old').value  : '';
    const newPw  = $('cp_new')  ? $('cp_new').value  : '';
    const newPw2 = $('cp_new2') ? $('cp_new2').value : '';
    if (!oldPw || !newPw || !newPw2) { showToast('Fill in all three fields', 'warning'); return; }
    if (newPw.length < 4)            { showToast('Use at least 4 characters', 'warning'); return; }
    if (newPw !== newPw2)            { showToast('The new passwords do not match', 'warning'); return; }

    startLoader();
    const re = await window.TIS.signIn(State.profile.operator_id, oldPw);
    if (!re || !re.ok) {
      stopLoader();
      showToast('Current password is incorrect', 'error');
      return;
    }
    const r = await window.TIS.changePassword(newPw);
    stopLoader();
    if (!r || !r.ok) {
      showToast((r && r.error) || 'Could not change the password', 'error');
      return;
    }
    showToast('Password updated', 'success');
    State.profile.must_change_password = false;
    closeModal();
  }

  // ================================================================
  // [S06] NAVIGATION
  // ================================================================
  function switchTab(name) {
    if (!hasPermission('read_' + name)) {
      showToast('You do not have access to that module.', 'warning');
      return;
    }
    document.querySelectorAll('.nav-tab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.module-view').forEach(m => {
      m.classList.add('hidden');
      m.classList.remove('active');
    });
    const tgt = $('module-' + name);
    if (tgt) { tgt.classList.remove('hidden'); tgt.classList.add('active'); }

    try {
      if (name === 'learners') loadLearners();
      else if (name === 'staff') loadStaff();
      else if (name === 'terms') initTermsTab();
      else if (name === 'attendance') initLearnerAttendanceTab();
      else if (name === 'staffatt') initStaffAttendanceTab();
      else if (name === 'broadsheet') initBroadSheetTab();
      else if (name === 'calendar') loadCalendar();
      else if (name === 'qr') loadActiveQR();
      else if (name === 'classes') loadClasses();
      else if (name === 'users') loadUsers();
    } catch (err) {
      console.error('[switchTab]', name, err);
    }
  }

  // ================================================================
  // [S07] LEARNERS — three-tier permission-gated record
  // ================================================================
  const CONTACT_LABELS = { father: 'Father', mother: 'Mother', guardian: 'Guardian' };
   // Populate Exit Reason dropdown on the Terms tab.
  (function populateExitReasons() {
    const EXIT_REASONS_LIST = [
      'Completion of Studies',
      'Inability to Pay Tuition',
      'Change of Location',
      'Parent Differences',
      'School Vs Parent Ideology',
      'Discipline / Expulsion',
      'Health Grounds',
      'Life'
    ];
    function fill() {
      const sel = document.getElementById('exitReasonSelect');
      if (!sel) return;
      if (sel.options.length > 0 && sel.options[0].value !== '') return;
      sel.innerHTML = '';
      EXIT_REASONS_LIST.forEach(function (r) {
        const o = document.createElement('option');
        o.value = r;
        o.textContent = r;
        sel.appendChild(o);
      });
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fill);
    } else {
      fill();
    }
    // Also refill when the Terms tab is opened (in case it re-renders).
    document.addEventListener('click', function (e) {
      if (e.target && e.target.matches && e.target.matches('.nav-tab[data-tab="terms"]')) {
        setTimeout(fill, 300);
      }
    });
  })();

  function parseNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function moneyOrDash(v) {
    if (v === null || v === undefined || v === '') return '—';
    const s = String(v);
    if (/^[₦$]/.test(s)) return s;
    const n = parseNum(s);
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDateOrDash(v) {
    if (!v) return '—';
    if (typeof v === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return dd + '/' + mm + '/' + d.getFullYear();
  }

  function isAdmin() { return !!(State.profile && (State.profile.role === 'admin' || State.profile.role === 'super_admin')); }
  function isSuperAdmin() { return !!(State.profile && State.profile.role === 'super_admin'); }

  function contactOrderOf(learner) {
    // Returns ['father','mother','guardian'] in the learner's priority order.
    const p1 = (learner.contact_priority_1 || '').toLowerCase();
    const p2 = (learner.contact_priority_2 || '').toLowerCase();
    const p3 = (learner.contact_priority_3 || '').toLowerCase();
    const chosen = [p1, p2, p3].filter(function (x) { return CONTACT_LABELS[x]; });
    const all = ['father', 'mother', 'guardian'];
    const remaining = all.filter(function (x) { return chosen.indexOf(x) === -1; });
    const finalOrder = chosen.concat(remaining).slice(0, 3);
    return finalOrder;
  }
  function phoneFor(learner, slot) {
    const order = contactOrderOf(learner);
    const role = order[slot - 1];
    if (!role) return { role: null, label: '—', value: '—' };
    let value = '—';
    if (role === 'father')   value = learner.father_phone   || '—';
    if (role === 'mother')   value = learner.mother_phone   || '—';
    if (role === 'guardian') value = learner.guardian_phone || '—';
    return { role: role, label: CONTACT_LABELS[role], value: value };
  }

  // ---------------- Load & render ----------------
  async function loadLearners() {
    setHTML('learnersGrid', pageLoaderHTML('Loading learners…'));
    startLoader();
    const r = await window.TIS.listLearners();
    stopLoader();
    if (!r || !r.ok) {
      setHTML('learnersGrid', errorHTML('Could not load learners', r && r.error));
      return;
    }
    State.cachedLearners = r.data || [];
    renderLearners(State.cachedLearners);
    renderLearnerStats(State.cachedLearners);
  }

  function renderLearners(rows) {
    if (!rows || rows.length === 0) {
      setHTML('learnersGrid', emptyHTML('fa-users', 'No learners to show', 'Try clearing the search box.'));
      return;
    }
    let html = '';
    rows.forEach(function (row) {
      const pin    = row.pin || '';
      const name   = row.name || '';
      const cls    = row.class_name || '';
      const gender = (row.gender || '').toLowerCase();
      const photo  = row.photo_url || '';
      const nameColor = gender.indexOf('female') === 0 ? '#ff6b9d'
                       : gender.indexOf('male')   === 0 ? '#6ddb9a' : 'white';
      html += '<div class="student-card" data-pin="' + escAttr(pin) + '">';
      html += '<div class="card-header">';
      html += '<div class="card-avatar">' +
              (photo ? '<img src="' + esc(photo) + '" alt="">' : esc(name.charAt(0) || '?')) + '</div>';
      html += '<div class="card-title">';
      html += '<h3 style="color:' + nameColor + ';">' + esc(name) + '</h3>';
      html += '<div class="pin">' + esc(pin) + ' • ' + esc(cls) + '</div>';
      html += '</div></div>';
      html += '<div class="card-actions" style="display:flex;gap:6px;margin-top:8px;">';
      html += '<button type="button" class="btn btn-sm btn-secondary" data-action="view" data-pin="' + escAttr(pin) + '"><i class="fas fa-eye"></i> View</button>';
      if (hasPermission('write_learners')) {
        html += '<button type="button" class="btn btn-sm btn-primary" data-action="edit" data-pin="' + escAttr(pin) + '"><i class="fas fa-pen"></i> Edit</button>';
      }
      if (hasPermission('print_learners')) {
        html += '<button type="button" class="btn btn-sm btn-gold" data-action="print" data-pin="' + escAttr(pin) + '"><i class="fas fa-print"></i> Print</button>';
      }
      html += '</div></div>';
    });
    setHTML('learnersGrid', html);

    document.querySelectorAll('#learnersGrid [data-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const pin = btn.dataset.pin;
        const action = btn.dataset.action;
        if (action === 'view')  openLearnerViewModal(pin);
        else if (action === 'edit')  openLearnerEditModal(pin);
        else if (action === 'print') openPrintOptionsModal(pin);
      });
    });
  }

  function renderLearnerStats(rows) {
    const total = rows.length;
    let exited = 0;
    rows.forEach(function (r) {
      const w = (r.date_of_withdrawal || '').toString().trim();
      if (w && w !== '' && w !== 'N/A') exited++;
    });
    setHTML('learnerStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + total + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Exited</div><div class="stat-value">' + exited + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Active</div><div class="stat-value">' + (total - exited) + '</div></div>');
  }

  function infoRow(label, value) {
    const v = (value !== undefined && value !== null && value !== '') ? esc(value) : '—';
    return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + v + '</span></div>';
  }

  // ---------------- View modal ----------------
  async function openLearnerViewModal(pin) {
    closeModal();
    startLoader();
    const learnerR = await window.TIS.getLearnerByPin(pin);
    const termsR   = learnerR && learnerR.ok && learnerR.data
      ? await window.TIS.getLearnerTermForActive(learnerR.data.id) : null;
    let prevTermRow = null;
    if (learnerR && learnerR.ok && learnerR.data) {
      const prevR = await window.TIS.getLearnerTermFor(learnerR.data.id, '3rd', 2025);
      if (prevR && prevR.ok) prevTermRow = prevR.data;
    }
    stopLoader();

    if (!learnerR || !learnerR.ok || !learnerR.data) {
      showToast('Could not load learner ' + pin, 'error');
      return;
    }
    const d = learnerR.data;
    const termRow = termsR && termsR.ok ? termsR.data.row : null;
    const term    = termsR && termsR.ok ? termsR.data.term : null;
    const termLabel = term ? term.label : 'No active term';

    const canA = true;
    const canB = isAdmin();
    const canC = isSuperAdmin();

    const ph1 = phoneFor(d, 1);
    const ph2 = phoneFor(d, 2);
    const ph3 = phoneFor(d, 3);

    // Derive Tier B aggregates
    const tuition     = parseNum(termRow && termRow.tuition);
    const scholarship = parseNum(termRow && termRow.scholarship);
    const otherMajor  = parseNum(termRow && termRow.other_bills_major);
    const otherMinor  = parseNum(termRow && termRow.other_bills_minor);
    const books       = parseNum(termRow && termRow.books);
    const netBills    = tuition + otherMajor + otherMinor + books;
    const adjusted    = tuition - scholarship;

    // Build Section B part-payment rows
    let ppRows = '';
    if (termRow) {
      for (let n = 1; n <= 5; n++) {
        const dt = termRow['part_payment_' + n + '_date'];
        const am = termRow['part_payment_' + n + '_amount'];
        if ((!dt || dt === '') && (!am || am === '')) continue;
        ppRows += '<div class="info-row" style="background:#f7fbf7;">' +
                  '<span class="info-label">Part Payment ' + n + '</span>' +
                  '<span class="info-value">' + fmtDateOrDash(dt) + ' — ' + moneyOrDash(am) + '</span>' +
                  '</div>';
      }
    }

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeLearnerModal()">';
    html += '<div class="modal-box wide lbModal" onclick="event.stopPropagation()">';

    // Header
    html += '<div style="background:linear-gradient(135deg,#0d4d26,#1a8a3a);color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;display:flex;justify-content:space-between;align-items:center;gap:14px;">';
    html += '<div style="display:flex;align-items:center;gap:12px;">';
    if (d.photo_url) {
      html += '<img src="' + esc(d.photo_url) + '" style="width:52px;height:52px;border-radius:50%;border:2px solid #fff;object-fit:cover;">';
    } else {
      html += '<div style="width:52px;height:52px;border-radius:50%;background:#fff;color:#0d4d26;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;">' + esc((d.name || '?').charAt(0)) + '</div>';
    }
    html += '<div>';
    html += '<div style="font-weight:800;font-size:15px;letter-spacing:1px;">' + esc(d.name || '') + '</div>';
    html += '<div style="font-size:11px;opacity:.9;">PIN: ' + esc(d.pin || '') + ' · Class: ' + esc(d.class_name || '') + '</div>';
    html += '<div style="font-size:11px;opacity:.9;">Active Term: ' + esc(termLabel) + '</div>';
    html += '</div></div>';
    html += '<div>';
    html += '<button type="button" class="btn btn-sm btn-secondary" onclick="toggleKeysHelp()" id="lbHelpBtn" title="Keyboard shortcuts">?</button>';
    html += '<button type="button" class="close-btn" onclick="closeLearnerModal()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;margin-left:8px;">&times;</button>';
    html += '</div></div>';

    // Keyboard hints (hidden by default)
    html += '<div id="lbKeysHelp" style="display:none;background:#e8f5e9;padding:6px 18px;font-size:11px;color:#0d4d26;border-bottom:1px solid #c8e6c9;">';
    html += '<b>E</b> expand all · <b>C</b> collapse all · <b>P</b> print · <b>Esc</b> close';
    html += '</div>';

    html += '<div style="padding:14px 18px;" id="lbModalBody">';

    // Section A
    if (canA) {
      html += '<div class="expandable open lbSec" data-sec="A">';
      html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section A — Identity</div>';
      html += '<div class="expandable-body">';
      html += infoRow('Class', d.class_name);
      html += infoRow('PIN', d.pin);
      html += infoRow('Learner Name', d.name);
      html += infoRow('Gender', d.gender);
      html += infoRow('1st Phone (' + ph1.label + ')', ph1.value);
      html += infoRow('Account Number', d.account_number);
      html += infoRow('Clearance Status', termRow ? termRow.cleared : '—');
      html += infoRow('Clearance Date', termRow ? fmtDateOrDash(termRow.clearance) : '—');
      html += infoRow('Balance C/F', termRow ? moneyOrDash(termRow.balance_cf) : '—');
      html += '</div></div>';
    }

    // Section B
    if (canB) {
      html += '<div class="expandable open lbSec" data-sec="B">';
      html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section B — Fees (' + esc(termLabel) + ')</div>';
      html += '<div class="expandable-body">';
      html += infoRow('Previous Term Balance B/F', prevTermRow ? moneyOrDash(prevTermRow.balance_cf) : moneyOrDash(termRow && termRow.balance_bf));
      html += infoRow('Current Term Tuition', moneyOrDash(termRow && termRow.tuition));
      html += infoRow('Scholarship Amount', moneyOrDash(termRow && termRow.scholarship));
      html += infoRow('Adjusted Tuition Total', moneyOrDash(adjusted));
      if (ppRows) {
        html += '<div style="margin:8px 0 4px;font-weight:700;font-size:11px;color:#0d4d26;">Part Payments</div>';
        html += ppRows;
      }
      html += infoRow('Other Bills Major', moneyOrDash(termRow && termRow.other_bills_major));
      html += infoRow('Books', moneyOrDash(termRow && termRow.books));
      html += infoRow('Balance B/F', moneyOrDash(termRow && termRow.balance_bf));
      html += infoRow('Net Bills', moneyOrDash(netBills));
      html += infoRow('Other Bills Minor', moneyOrDash(termRow && termRow.other_bills_minor));
      html += infoRow('Blood Group / Genotype', d.blood_group);
      html += infoRow('Allergy', d.allergy);
      html += infoRow('2nd Phone (' + ph2.label + ')', ph2.value);
      html += '</div></div>';
    }

    // Section C
    if (canC) {
      html += '<div class="expandable open lbSec" data-sec="C">';
      html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section C — History & Origin</div>';
      html += '<div class="expandable-body">';
      html += infoRow('Class Before Admission', d.class_before_admission);
      html += infoRow('Date of Admission', d.date_of_admission);
      html += infoRow('Class Admitted Into', d.class_admitted_into);
      html += infoRow('LIN', d.lin);
      html += infoRow('Exit Class', d.class_at_withdrawal);
      html += infoRow('Exit Reason', d.exit_reason);
      html += infoRow('Religion', d.religion);
      html += infoRow('Date of Birth', d.date_of_birth);
      html += infoRow('Parents Name', d.parents_name);
      html += infoRow('Address', d.address);
      html += infoRow('State of Origin', d.state_of_origin);
      html += infoRow('LGA of Origin', d.lga_of_origin);
      html += infoRow('State of Birth', d.state_of_birth);
      html += infoRow('LGA of Birth', d.lga_of_birth);
      html += infoRow('3rd Phone (' + ph3.label + ')', ph3.value);
      html += '</div></div>';
    }

    html += '</div>';

    // Footer
    html += '<div style="padding:12px 18px;border-top:1px solid #e6e9f0;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">';
    html += '<button class="btn btn-secondary" onclick="closeLearnerModal()">Close (Esc)</button>';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
    if (hasPermission('write_learners')) {
      html += '<button class="btn btn-warning" onclick="openPartPaymentModal(' + d.id + ')">Update Payment</button>';
    }
    if (hasPermission('print_learners')) {
      html += '<button class="btn btn-gold" onclick="openPrintOptionsModal(\'' + escAttr(pin) + '\')">Print (P)</button>';
    }
    if (hasPermission('write_learners')) {
      html += '<button class="btn btn-primary" onclick="openLearnerEditModal(\'' + escAttr(pin) + '\')">Edit</button>';
    }
    html += '</div></div>';

    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function closeLearnerModal() {
    document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
    setHTML('modalContainer', '');
  }
  window.toggleKeysHelp = function () {
    const el = document.getElementById('lbKeysHelp');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // ---------------- Edit modal ----------------
  async function openLearnerEditModal(pin) {
    closeModal();
    startLoader();
    const r = await window.TIS.getLearnerByPin(pin);
    stopLoader();
    if (!r || !r.ok || !r.data) { showToast('Could not load learner ' + pin, 'error'); return; }
    const d = r.data;
    const order = contactOrderOf(d);

    const field = function (id, label, value) {
      return '<div class="form-group"><label>' + esc(label) + '</label><input id="' + id + '" value="' + escAttr(value || '') + '"></div>';
    };
    const phoneField = function (id, label, value, slotKey) {
      const current = order[slotKey - 1] || '';
      let opts = '<option value="">—</option>';
      ['father', 'mother', 'guardian'].forEach(function (role) {
        opts += '<option value="' + role + '"' + (current === role ? ' selected' : '') + '>' + CONTACT_LABELS[role] + '</option>';
      });
      return '<div class="form-group"><label>' + esc(label) + ' <span style="font-weight:400;color:#666;">(who is this?)</span></label>' +
             '<div style="display:flex;gap:6px;">' +
             '<input id="' + id + '" value="' + escAttr(value || '') + '" style="flex:2;">' +
             '<select id="' + id + '_who" style="flex:1;">' + opts + '</select>' +
             '</div></div>';
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Edit — ' + esc(d.name) + '</h2><button class="close-btn" onclick="closeModal()">&times;</button></div>';

    html += '<div class="form-row">' + field('ed_name', 'Name', d.name) + field('ed_class_name', 'Class', d.class_name) + '</div>';
    html += '<div class="form-row">' + field('ed_gender', 'Gender', d.gender) + field('ed_date_of_birth', 'Date of Birth', d.date_of_birth) + '</div>';

    // Priority — three slots
    html += '<div style="background:#f7fbf7;padding:10px;border-radius:8px;margin:8px 0;">';
    html += '<div style="font-weight:700;font-size:12px;color:#0d4d26;margin-bottom:6px;">Contact priority — for which number is 1st, 2nd, 3rd</div>';
    html += phoneField('ed_prio_father', "Father's phone", d.father_phone, 1);
    html += phoneField('ed_prio_mother', "Mother's phone", d.mother_phone, 2);
    html += phoneField('ed_prio_guardian', "Guardian's phone", d.guardian_phone, 3);
    html += '</div>';

    html += '<div class="form-row">' + field('ed_account_number', 'Account Number', d.account_number) + field('ed_blood_group', 'Blood Group', d.blood_group) + '</div>';
    html += '<div class="form-row">' + field('ed_religion', 'Religion', d.religion) + field('ed_allergy', 'Allergy', d.allergy) + '</div>';
    html += field('ed_parents_name', 'Parents Name', d.parents_name);
    html += '<div class="form-group"><label>Address</label><textarea id="ed_address" rows="2">' + esc(d.address || '') + '</textarea></div>';

    // Exit reason dropdown (only for admins/super admin per spec, but keep visible for writers)
    let exitOpts = '<option value="">— none —</option>';
    EXIT_REASONS.forEach(function (rs) {
      exitOpts += '<option value="' + escAttr(rs) + '"' + (rs === d.exit_reason ? ' selected' : '') + '>' + esc(rs) + '</option>';
    });
    html += '<div class="form-group"><label>Exit Reason</label><select id="ed_exit_reason">' + exitOpts + '</select></div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="saveLearnerEdits(' + d.id + ')">Save</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function saveLearnerEdits(id) {
    const fields = {
      name: $('ed_name') ? $('ed_name').value.trim() : '',
      class_name: $('ed_class_name') ? $('ed_class_name').value.trim() : '',
      gender: $('ed_gender') ? $('ed_gender').value.trim() : '',
      date_of_birth: $('ed_date_of_birth') ? $('ed_date_of_birth').value.trim() : '',
      father_phone: $('ed_prio_father') ? $('ed_prio_father').value.trim() : '',
      mother_phone: $('ed_prio_mother') ? $('ed_prio_mother').value.trim() : '',
      guardian_phone: $('ed_prio_guardian') ? $('ed_prio_guardian').value.trim() : '',
      account_number: $('ed_account_number') ? $('ed_account_number').value.trim() : '',
      blood_group: $('ed_blood_group') ? $('ed_blood_group').value.trim() : '',
      religion: $('ed_religion') ? $('ed_religion').value.trim() : '',
      allergy: $('ed_allergy') ? $('ed_allergy').value.trim() : '',
      parents_name: $('ed_parents_name') ? $('ed_parents_name').value.trim() : '',
      address: $('ed_address') ? $('ed_address').value.trim() : '',
      exit_reason: $('ed_exit_reason') ? $('ed_exit_reason').value : ''
    };
    // Contact priority choices — one per slot
    const p1 = $('ed_prio_father_who')   ? $('ed_prio_father_who').value   : '';
    const p2 = $('ed_prio_mother_who')   ? $('ed_prio_mother_who').value   : '';
    const p3 = $('ed_prio_guardian_who') ? $('ed_prio_guardian_who').value : '';

    startLoader();
    const r = await window.TIS.updateLearner(id, fields);
    if (r && r.ok) {
      await window.TIS.setLearnerContactPriority(id, { p1: p1, p2: p2, p3: p3 });
    }
    stopLoader();
    if (r && r.ok) { showToast('Learner updated', 'success'); closeModal(); loadLearners(); }
    else showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
  }

  // ---------------- Part payment modal ----------------
  async function openPartPaymentModal(learnerId) {
    closeModal();
    startLoader();
    const r = await window.TIS.getLearnerTermForActive(learnerId);
    stopLoader();
    if (!r || !r.ok || !r.data.term) { showToast('No active term set', 'error'); return; }
    const term = r.data.term;
    const row  = r.data.row;

    let html = '<div class="modal-overlay" id="lbPartPayModal" onclick="if(event.target===this)closeLearnerModal()">';
    html += '<div class="modal-box" style="max-width:440px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Update Payment</h2><button class="close-btn" onclick="closeLearnerModal()">&times;</button></div>';
    html += '<p style="font-size:12px;margin:0 0 10px;">' + esc(term.label) + '</p>';
    if (row) {
      html += '<p style="font-size:12px;margin:0 0 10px;">' +
              'Bill: ' + moneyOrDash(row.bill) +
              ' · Other: ' + moneyOrDash(row.other_bill) +
              ' · Paid: ' + moneyOrDash(row.total_part_payment) +
              ' · Balance: ' + moneyOrDash(row.balance_cf) +
              '</p>';
    }
    html += '<div class="form-group"><label>Amount Paid (₦)</label><input id="pp_amount" type="number" step="0.01" placeholder="0.00"></div>';
    html += '<div class="form-group"><label>Date</label><input id="pp_date" type="date" value="' + (new Date().toISOString().slice(0,10)) + '"></div>';
    html += '<div class="form-group"><label>Mode</label><select id="pp_mode"><option>Cash</option><option>Transfer</option><option>POS</option><option>Cheque</option></select></div>';
    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="closeLearnerModal()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="submitPartPayment(' + learnerId + ', \'' + escAttr(term.term_type) + '\', ' + term.year + ')">Record</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function submitPartPayment(learnerId, termType, year) {
    const amount = $('pp_amount') ? $('pp_amount').value : '';
    const date   = $('pp_date')   ? $('pp_date').value   : '';
    const mode   = $('pp_mode')   ? $('pp_mode').value   : 'Cash';
    if (!amount || Number(amount) <= 0) { showToast('Enter a positive amount', 'warning'); return; }

    startLoader();
    const r = await window.TIS.recordPartPayment(learnerId, termType, year, amount, date, mode);
    stopLoader();

    if (r && r.ok) {
      showToast('Payment recorded (slot ' + r.data.slot + ')', 'success');
      closeLearnerModal();
      const l = State.cachedLearners.find(function (x) { return x.id === learnerId; });
      if (l) openLearnerViewModal(l.pin);
    } else {
      showToast('Could not record: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  // ---------------- Print options chooser ----------------
  async function openPrintOptionsModal(pin) {
    closeModal();
    startLoader();
    const r = await window.TIS.getLearnerByPin(pin);
    stopLoader();
    if (!r || !r.ok || !r.data) { showToast('Could not load learner ' + pin, 'error'); return; }

    const canA = true;
    const canB = isAdmin();
    const canC = isSuperAdmin();

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()">';
    html += '<div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Print Options</h2><button class="close-btn" onclick="closeModal()">&times;</button></div>';
    html += '<p style="font-size:12px;margin:0 0 8px;">Choose sections and paper size.</p>';

    html += '<div style="background:#f7fbf7;padding:10px;border-radius:8px;margin-bottom:10px;">';
    html += '<div style="font-weight:700;font-size:12px;color:#0d4d26;margin-bottom:6px;">Sections</div>';
    if (canA) html += '<label style="display:block;padding:4px 0;"><input type="checkbox" id="pp_secA" checked> Section A — Identity</label>';
    if (canB) html += '<label style="display:block;padding:4px 0;"><input type="checkbox" id="pp_secB" checked> Section B — Fees</label>';
    if (canC) html += '<label style="display:block;padding:4px 0;"><input type="checkbox" id="pp_secC" checked> Section C — History & Origin</label>';
    html += '</div>';

    html += '<div style="background:#f7fbf7;padding:10px;border-radius:8px;margin-bottom:10px;">';
    html += '<div style="font-weight:700;font-size:12px;color:#0d4d26;margin-bottom:6px;">Paper</div>';
    html += '<label style="display:block;padding:4px 0;"><input type="radio" name="pp_paper" value="A4" checked> A4 (full page)</label>';
    html += '<label style="display:block;padding:4px 0;"><input type="radio" name="pp_paper" value="80mm"> POS / Thermal (80mm)</label>';
    html += '</div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button> ';
    html += '<button class="btn btn-gold" onclick="printLearnerCard(\'' + escAttr(pin) + '\')">Print</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function printLearnerCard(pin) {
    const secA = document.getElementById('pp_secA');
    const secB = document.getElementById('pp_secB');
    const secC = document.getElementById('pp_secC');
    // If the chooser is not open (P shortcut from modal), default to all permitted
    const wantA = secA ? secA.checked : true;
    const wantB = secB ? secB.checked : isAdmin();
    const wantC = secC ? secC.checked : isSuperAdmin();
    const paperEl = document.querySelector('input[name="pp_paper"]:checked');
    const paper = paperEl ? paperEl.value : 'A4';

    startLoader();
    const r = await window.TIS.getLearnerByPin(pin);
    const termsR = r && r.ok && r.data ? await window.TIS.getLearnerTermForActive(r.data.id) : null;
    stopLoader();
    if (!r || !r.ok || !r.data) { showToast('Could not load learner', 'error'); return; }
    const d = r.data;
    const termRow = termsR && termsR.ok ? termsR.data.row : null;
    const term    = termsR && termsR.ok ? termsR.data.term : null;
    const termLabel = term ? term.label : 'No active term';

    const ph1 = phoneFor(d, 1);
    const ph2 = phoneFor(d, 2);
    const ph3 = phoneFor(d, 3);

    const tuition     = parseNum(termRow && termRow.tuition);
    const scholarship = parseNum(termRow && termRow.scholarship);
    const otherMajor  = parseNum(termRow && termRow.other_bills_major);
    const otherMinor  = parseNum(termRow && termRow.other_bills_minor);
    const books       = parseNum(termRow && termRow.books);
    const netBills    = tuition + otherMajor + otherMinor + books;
    const adjusted    = tuition - scholarship;

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

    const cssA4 = 'body{font-family:Arial;padding:24px;color:#111;}' +
                  '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0b6623;padding-bottom:10px;}' +
                  '.hdr .mid{text-align:center;flex:1;}h1{color:#0b6623;margin:0 0 4px;font-size:22px;}' +
                  'h2{margin:14px 0 6px;color:#0b6623;font-size:15px;border-bottom:1px solid #c8e6c9;padding-bottom:4px;}' +
                  '.info-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:12px;}' +
                  '.info-label{color:#666;}.info-value{font-weight:600;}';
    const css80  = '@page{size:80mm auto;margin:3mm;}body{font-family:Arial;font-size:11px;color:#000;}' +
                   '.hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:6px;}' +
                   'h1{font-size:14px;margin:0;}h2{font-size:11px;margin:6px 0 2px;border-bottom:1px dotted #000;}' +
                   '.info-row{display:flex;justify-content:space-between;font-size:10px;padding:2px 0;}' +
                   '.info-label{color:#333;}.info-value{font-weight:700;}';

    let html = '<html><head><title>' + esc(d.name) + '</title><style>' + (paper === '80mm' ? css80 : cssA4) + '</style></head><body>';

    html += '<div class="hdr">';
    if (paper === 'A4') {
      html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:60px;">';
    }
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1>' +
            (paper === 'A4' ? '<div style="font-style:italic;color:#666;font-size:12px;">Scientia est potentia</div>' : '') +
            '</div>';
    if (paper === 'A4') {
      html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:60px;">';
    }
    html += '</div>';

    html += '<h2 style="margin-top:14px;">' + esc(d.name) + ' — ' + esc(d.pin) + '</h2>';
    if (paper === 'A4') {
      html += '<div style="font-size:11px;color:#666;margin-bottom:8px;">Class: ' + esc(d.class_name) + ' · Active Term: ' + esc(termLabel) + '</div>';
    } else {
      html += '<div style="font-size:10px;">' + esc(d.class_name) + ' · ' + esc(termLabel) + '</div>';
    }

    function row(label, value) {
      return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value) + '</span></div>';
    }

    if (wantA) {
      html += '<h2>Section A — Identity</h2>';
      html += row('Class', d.class_name || '—');
      html += row('PIN', d.pin || '—');
      html += row('Name', d.name || '—');
      html += row('Gender', d.gender || '—');
      html += row('1st Phone (' + ph1.label + ')', ph1.value);
      html += row('Account', d.account_number || '—');
      html += row('Clearance', (termRow && termRow.cleared) || '—');
      html += row('Clearance Date', (termRow && fmtDateOrDash(termRow.clearance)) || '—');
      html += row('Balance C/F', termRow ? moneyOrDash(termRow.balance_cf) : '—');
    }
    if (wantB) {
      html += '<h2>Section B — Fees (' + termLabel + ')</h2>';
      html += row('Tuition', moneyOrDash(termRow && termRow.tuition));
      html += row('Scholarship', moneyOrDash(termRow && termRow.scholarship));
      html += row('Adjusted Tuition', moneyOrDash(adjusted));
      if (termRow) {
        for (let n = 1; n <= 5; n++) {
          const dt = termRow['part_payment_' + n + '_date'];
          const am = termRow['part_payment_' + n + '_amount'];
          if ((!dt || dt === '') && (!am || am === '')) continue;
          html += row('Part Payment ' + n, (dt ? fmtDateOrDash(dt) : '—') + ' — ' + moneyOrDash(am));
        }
      }
      html += row('Other Bills Major', moneyOrDash(termRow && termRow.other_bills_major));
      html += row('Books', moneyOrDash(termRow && termRow.books));
      html += row('Balance B/F', moneyOrDash(termRow && termRow.balance_bf));
      html += row('Net Bills', moneyOrDash(netBills));
      html += row('Other Bills Minor', moneyOrDash(termRow && termRow.other_bills_minor));
      html += row('Blood Group / Genotype', d.blood_group || '—');
      html += row('Allergy', d.allergy || '—');
      html += row('2nd Phone (' + ph2.label + ')', ph2.value);
    }
    if (wantC) {
      html += '<h2>Section C — History & Origin</h2>';
      html += row('Class Before Admission', d.class_before_admission || '—');
      html += row('Date of Admission', d.date_of_admission || '—');
      html += row('Class Admitted Into', d.class_admitted_into || '—');
      html += row('LIN', d.lin || '—');
      html += row('Exit Class', d.class_at_withdrawal || '—');
      html += row('Exit Reason', d.exit_reason || '—');
      html += row('Religion', d.religion || '—');
      html += row('Date of Birth', d.date_of_birth || '—');
      html += row('Parents Name', d.parents_name || '—');
      html += row('Address', d.address || '—');
      html += row('State of Origin', d.state_of_origin || '—');
      html += row('LGA of Origin', d.lga_of_origin || '—');
      html += row('State of Birth', d.state_of_birth || '—');
      html += row('LGA of Birth', d.lga_of_birth || '—');
      html += row('3rd Phone (' + ph3.label + ')', ph3.value);
    }

    html += '</body></html>';
    w.document.write(html); w.document.close();
    setTimeout(function () { w.print(); }, 250);
    closeModal();
  }

  // ---------------- Live search ----------------
  let learnerSearchTimer = null;
  function learnerLiveSearch() {
    if (learnerSearchTimer) clearTimeout(learnerSearchTimer);
    learnerSearchTimer = setTimeout(async function () {
      const el = document.getElementById('learnerSearchInput');
      const q = el ? el.value.trim() : '';
      if (!q) { renderLearners(State.cachedLearners); return; }
      if (q.length < 1) return;
      // Fast client-side filter first
      const lower = q.toLowerCase();
      const filtered = State.cachedLearners.filter(function (r) {
        return (r.name || '').toLowerCase().indexOf(lower) !== -1 ||
               (r.pin || '').toLowerCase().indexOf(lower) !== -1 ||
               (r.father_phone || '').indexOf(q) !== -1 ||
               (r.mother_phone || '').indexOf(q) !== -1 ||
               (r.guardian_phone || '').indexOf(q) !== -1 ||
               (r.account_number || '').indexOf(q) !== -1;
      });
      renderLearners(filtered);
    }, 200);
  }

  // ---------------- Keyboard shortcuts ----------------
  document.addEventListener('keydown', function (e) {
    const modalBody = document.getElementById('lbModalBody');
    if (!modalBody) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { closeLearnerModal(); e.preventDefault(); return; }
    if (k === 'e') {
      document.querySelectorAll('.lbSec').forEach(function (s) { s.classList.add('open'); });
      e.preventDefault();
    } else if (k === 'c') {
      document.querySelectorAll('.lbSec').forEach(function (s) { s.classList.remove('open'); });
      e.preventDefault();
    } else if (k === 'p') {
      if (hasPermission('print_learners')) {
        const btn = modalBody.parentElement.querySelector('.btn-gold');
        if (btn) btn.click();
      }
      e.preventDefault();
    }
  });

  // ---------------- Wire the search input ----------------
  document.addEventListener('DOMContentLoaded', function () {
    const inp = document.getElementById('learnerSearchInput');
    if (inp) inp.addEventListener('input', learnerLiveSearch);
  });

  // ---------------- Globals ----------------
  window.openLearnerViewModal  = openLearnerViewModal;
  window.openLearnerEditModal  = openLearnerEditModal;
  window.saveLearnerEdits      = saveLearnerEdits;
  window.openPartPaymentModal  = openPartPaymentModal;
  window.submitPartPayment     = submitPartPayment;
  window.openPrintOptionsModal = openPrintOptionsModal;
  window.printLearnerCard      = printLearnerCard;
  window.closeLearnerModal     = closeLearnerModal;
  // ================================================================
  // [S08] STAFF
  // ================================================================
  async function loadStaff() {
    setHTML('staffGrid', pageLoaderHTML('Loading staff...'));
    startLoader();
    const r = await window.TIS.listStaff();
    stopLoader();
    if (!r.ok) { setHTML('staffGrid', errorHTML('Could not load staff', r.error)); return; }
    State.cachedStaff = r.data || [];
    renderStaff(State.cachedStaff);
    renderStaffStats(State.cachedStaff);
  }

  function renderStaff(staff) {
    if (!staff || staff.length === 0) { setHTML('staffGrid', emptyHTML('fa-user-tie', 'No staff to show')); return; }
    let html = '';
    staff.forEach(s => {
      const name = s.full_name || '';
      const photo = s.photo_url || '';
      html += '<div class="student-card" data-staffid="' + escAttr(s.id) + '">' +
        '<div class="card-header">' +
        '<div class="card-avatar">' + (photo ? '<img src="' + esc(photo) + '">' : esc(name.charAt(0) || '?')) + '</div>' +
        '<div class="card-title"><h3>' + esc(name) + '</h3>' +
        '<div class="pin">' + esc(s.staff_id || '') + ' • ' + esc(s.department || '') + '</div></div>' +
        '<span class="card-badge">' + esc(s.status || 'Active') + '</span>' +
        '</div></div>';
    });
    setHTML('staffGrid', html);
    document.querySelectorAll('#staffGrid .student-card').forEach(card => {
      card.addEventListener('click', () => openStaffProfile(card.dataset.staffid));
    });
  }

  function renderStaffStats(staff) {
    let active = 0, inactive = 0;
    staff.forEach(s => { if (s.status === 'Active') active++; else inactive++; });
    setHTML('staffStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + staff.length + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Active</div><div class="stat-value">' + active + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Inactive</div><div class="stat-value">' + inactive + '</div></div>');
  }

  async function openStaffProfile(id) {
    startLoader();
    const r = await window.TIS.getStaff(id);
    stopLoader();
    if (!r.ok || !r.data) { showToast('Staff not found', 'error'); return; }
    const s = r.data;
    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>' + esc(s.full_name) + '</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';
    html += infoRow('ID', s.staff_id) + infoRow('Gender', s.gender) + infoRow('Department', s.department) +
            infoRow('Phone', s.phone) + infoRow('Email', s.email) + infoRow('Employment', fmtDate(s.employment_date)) +
            infoRow('Qualification', s.qualification) + infoRow('Resume', s.resume_time) + infoRow('Close', s.close_time);
    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function openAddStaffModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Add Staff</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Staff ID</label><input id="ns_staffId"></div><div class="form-group"><label>Surname</label><input id="ns_surname"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>First Name</label><input id="ns_firstName"></div><div class="form-group"><label>Middle</label><input id="ns_middleName"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Gender</label><select id="ns_gender"><option>Male</option><option>Female</option></select></div><div class="form-group"><label>Phone</label><input id="ns_phone"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Email</label><input id="ns_email"></div><div class="form-group"><label>Department</label><select id="ns_department"><option>Teaching</option><option>Admin</option><option>Support</option></select></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Qualification</label><input id="ns_qualification"></div><div class="form-group"><label>Employment Date</label><input id="ns_employmentDate" type="date"></div></div>' +
      '<div style="text-align:right;margin-top:16px;"><button class="btn btn-success" id="ns_submit" type="button">Save staff</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    const btn = $('ns_submit');
    if (btn) btn.addEventListener('click', submitNewStaff);
  }

  async function submitNewStaff() {
    const first = $('ns_firstName').value.trim();
    const surname = $('ns_surname').value.trim();
    const middle = $('ns_middleName').value.trim();
    const row = {
      staff_id: $('ns_staffId').value.trim(),
      surname: surname,
      first_name: first,
      middle_name: middle,
      full_name: [surname, first, middle].filter(Boolean).join(' '),
      gender: $('ns_gender').value,
      phone: $('ns_phone').value.trim(),
      email: $('ns_email').value.trim(),
      department: $('ns_department').value,
      qualification: $('ns_qualification').value.trim(),
      employment_date: $('ns_employmentDate').value || null,
      status: 'Active'
    };
    if (!row.staff_id || !row.full_name) { showToast('ID and name required', 'warning'); return; }
    startLoader();
    const r = await window.TIS.createStaff(row);
    stopLoader();
    if (!r.ok) { showToast(r.error || 'Could not add staff', 'error'); return; }
    showToast('Staff added', 'success');
    closeModal();
    loadStaff();
  }

  function initStaffTab() {
    const input = $('staffSearchInput');
    if (input) {
      input.addEventListener('input', debounce(() => {
        const q = input.value.trim().toLowerCase();
        if (!q) { renderStaff(State.cachedStaff); return; }
        renderStaff(State.cachedStaff.filter(s =>
          (s.full_name || '').toLowerCase().indexOf(q) !== -1 ||
          (s.staff_id || '').toLowerCase().indexOf(q) !== -1 ||
          (s.phone || '').indexOf(q) !== -1));
      }, 250));
    }
    const add = $('btnAddStaff');       if (add) add.addEventListener('click', openAddStaffModal);
    const rf  = $('btnRefreshStaff');   if (rf)  rf.addEventListener('click', loadStaff);
    const pr  = $('btnPrintStaff');     if (pr)  pr.addEventListener('click', printStaff);
  }

  function printStaff() {
    if (!State.cachedStaff.length) { showToast('Load the list first', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Staff</title></head><body><h1>The Ideal Schools — Staff List</h1>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%"><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Phone</th></tr></thead><tbody>';
    State.cachedStaff.forEach(s => {
      html += '<tr><td>' + esc(s.staff_id) + '</td><td>' + esc(s.full_name) + '</td><td>' + esc(s.department) + '</td><td>' + esc(s.phone) + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }
  // ================================================================
  // [S09] TERMS  (promotion: term + year, class-based + special)
  // ================================================================
  async function initTermsTab() {
    await loadTerms();
    await loadArchives();
  }

  async function loadTerms() {
    setHTML('termsList', pageLoaderHTML('Loading terms…'));

    const r = await window.TIS.getTerms();
    if (!r || !r.ok) {
      setHTML('termsList', errorHTML('Could not load terms', r && r.error));
      return;
    }
    State.cachedTerms = r.data || [];

    if (!State.cachedTerms.length) {
      setHTML('termsList', emptyHTML('fa-calendar-alt', 'No terms yet',
        'Import a calendar first, or ask an admin to create terms.'));
      return;
    }

    let html = '';
    State.cachedTerms.forEach(function (t) {
      const activeBadge = t.is_active
        ? '<span class="card-badge" style="background:#27ae60;color:#fff;">ACTIVE</span>' : '';
      const fmt = function (d) {
        if (!d) return '—';
        const dt = new Date(d + 'T00:00:00');
        if (isNaN(dt.getTime())) return d;
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
      };
      const weeks = (function () {
        if (!t.start_date || !t.end_date) return '?';
        const s = new Date(t.start_date + 'T00:00:00');
        const e = new Date(t.end_date + 'T00:00:00');
        if (isNaN(s) || isNaN(e)) return '?';
        return Math.round((e - s) / (7 * 24 * 3600 * 1000));
      })();

      html += '<div class="term-card">';
      html += '<div style="flex:1;min-width:220px;">';
      html += '<div><strong>' + esc(t.label) + '</strong> ' + activeBadge + '</div>';
      html += '<div style="font-size:11px;color:#666;margin-top:2px;">' +
              fmt(t.start_date) + ' → ' + fmt(t.end_date) + ' • ' + weeks + ' weeks</div>';
      html += '</div>';
      html += '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      if (t.is_active) {
        html += '<button class="btn btn-sm btn-primary" onclick="openPromotionWizard()">Promote Learners</button>';
        html += '<span style="color:#27ae60;font-weight:700;font-size:12px;align-self:center;">✓ Currently active</span>';
      } else {
        html += '<button class="btn btn-sm btn-success" ' +
                'onclick="activateTerm(' + t.id + ', \'' + escAttr(t.label) + '\')">Set Active</button>';
      }
      html += '</div></div>';
    });

    setHTML('termsList', html);
  }

  async function activateTerm(id, label) {
    if (!confirm('Set "' + label + '" as the active term?\n\nOnly one term can be active at a time.')) return;
    startLoader();
    const r = await window.TIS.setActiveTerm(id);
    stopLoader();
    if (r && r.ok) { showToast('Active term set: ' + label, 'success'); loadTerms(); }
    else showToast('Could not set active: ' + ((r && r.error) || 'unknown'), 'error');
  }

  async function loadArchives() {
    setHTML('archivesList', emptyHTML('fa-box-archive', 'Archives',
      'Archive view will be enabled once learners are migrated.'));
  }

  function initTermsWiring() { /* no-op */ }

  // ================================================================
  // PROMOTION WIZARD — three screens in a single modal
  //   1. Choose mode: Term promotion | Year promotion
  //   2. If Year:  class-based bulk OR special single-learner
  //   3. Confirm and apply
  // ================================================================
  let pw = null;   // promotion wizard state

  async function openPromotionWizard() {
    startLoader();
    const activeR = await window.TIS.getActiveTerm();
    const classesR = await window.TIS.listClasses();
    stopLoader();
    if (!activeR || !activeR.ok || !activeR.data) { showToast('No active term', 'error'); return; }
    if (!classesR || !classesR.ok) { showToast('Could not load classes', 'error'); return; }

    pw = {
      step: 1,
      mode: null,                     // 'term' | 'year'
      activeTerm: activeR.data,
      classes: classesR.data || [],
      // for year promotion
      sourceClasses: [],              // selected source class names
      learners: [],                   // learners in those classes
      choices: {},                    // learnerId → new class name (or 'KEEP')
      specialQuery: '',
      specialLearner: null,
      specialTarget: ''
    };
    renderPromotionWizard();
  }

  function nextTermOf(activeTerm) {
    if (activeTerm.term_type === '1st') return { term_type: '2nd', year: activeTerm.year };
    if (activeTerm.term_type === '2nd') return { term_type: '3rd', year: activeTerm.year };
    return { term_type: '1st', year: Number(activeTerm.year) + 1 };
  }

  function renderPromotionWizard() {
    if (!pw) return;
    let html = '<div class="modal-overlay" onclick="if(event.target===this)closePromotionWizard()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()" style="max-width:960px;">';
    html += '<div class="modal-header"><h2>Promotion</h2>' +
            '<button class="close-btn" onclick="closePromotionWizard()">&times;</button></div>';
    html += '<div style="padding:14px 18px;" id="pwBody">';

    // ---------- STEP 1: choose mode ----------
    if (pw.step === 1) {
      const next = nextTermOf(pw.activeTerm);
      html += '<p style="font-size:13px;margin:0 0 12px;">Active term: <strong>' +
              esc(pw.activeTerm.label) + '</strong></p>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';

      html += '<div class="card-bg" style="cursor:pointer;" onclick="pwSetMode(\'term\')">';
      html += '<h4 style="margin:0 0 6px;color:#0d4d26;">📆 Term promotion</h4>';
      html += '<p style="font-size:12px;margin:0 0 8px;color:#555;">';
      html += 'Move all active learners from <b>' + esc(pw.activeTerm.label) + '</b> to ';
      html += '<b>' + esc(next.term_type.toUpperCase()) + ' TERM ' + esc(next.year) + '</b>. ';
      html += 'No class change — same class, same learners, new fee block.</p>';
      html += '<button class="btn btn-primary" onclick="event.stopPropagation();pwSetMode(\'term\')">Choose Term Promotion</button>';
      html += '</div>';

      html += '<div class="card-bg" style="cursor:pointer;" onclick="pwSetMode(\'year\')">';
      html += '<h4 style="margin:0 0 6px;color:#0d4d26;">🎓 Year promotion</h4>';
      html += '<p style="font-size:12px;margin:0 0 8px;color:#555;">';
      html += 'Change learners\' class to the next (or any) class. End-of-year move.</p>';
      html += '<button class="btn btn-primary" onclick="event.stopPropagation();pwSetMode(\'year\')">Choose Year Promotion</button>';
      html += '</div>';

      html += '</div>';
    }

    // ---------- STEP 2 (term): pick learners ----------
    else if (pw.step === 2 && pw.mode === 'term') {
      const next = nextTermOf(pw.activeTerm);
      html += '<p style="font-size:13px;margin:0 0 8px;">';
      html += 'Promoting from <b>' + esc(pw.activeTerm.label) + '</b> to <b>' +
              esc(next.term_type.toUpperCase()) + ' TERM ' + esc(next.year) + '</b>.</p>';
      html += '<p style="font-size:12px;margin:0 0 12px;color:#666;">';
      html += 'Every active learner will get a new fee row for the next term. ' +
              'Balance C/F carries forward as the next term\'s Balance B/F.</p>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      html += '<button class="btn btn-primary" onclick="pwTermPreview()">Load Learners</button>';
      html += '<button class="btn btn-secondary" onclick="pwBack()">Back</button>';
      html += '</div>';
      html += '<div id="pwTermPreview" style="margin-top:14px;"></div>';
    }

    // ---------- STEP 2 (year): flow chooser ----------
    else if (pw.step === 2 && pw.mode === 'year') {
      html += '<p style="font-size:13px;margin:0 0 12px;">Year promotion — change class assignments.</p>';
      html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
      html += '<div class="card-bg">';
      html += '<h4 style="margin:0 0 6px;color:#0d4d26;">🏫 Class-based (bulk)</h4>';
      html += '<p style="font-size:12px;margin:0 0 8px;color:#555;">Pick source classes. Every learner in them appears with a per-learner destination dropdown. Apply.</p>';
      html += '<button class="btn btn-primary" onclick="pwYearGoClassBased()">Go Class-Based</button>';
      html += '</div>';
      html += '<div class="card-bg">';
      html += '<h4 style="margin:0 0 6px;color:#0d4d26;">🔍 Special (single learner)</h4>';
      html += '<p style="font-size:12px;margin:0 0 8px;color:#555;">Search one learner by PIN or name. Promote to any class — non-standard moves warn but proceed.</p>';
      html += '<button class="btn btn-primary" onclick="pwYearGoSpecial()">Go Special</button>';
      html += '</div>';
      html += '</div>';
      html += '<div style="margin-top:12px;"><button class="btn btn-secondary" onclick="pwBack()">Back</button></div>';
    }

    // ---------- STEP 3 (year/class-based): pick classes ----------
    else if (pw.step === 3 && pw.mode === 'year' && pw.flow === 'classbased') {
      html += '<p style="font-size:13px;margin:0 0 8px;">Pick source classes.</p>';
      html += '<div style="max-height:260px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;padding:8px;margin-bottom:12px;">';
      pw.classes.forEach(function (c) {
        const checked = pw.sourceClasses.indexOf(c.name) !== -1 ? ' checked' : '';
        html += '<label style="display:block;padding:4px 0;font-size:12px;">' +
                '<input type="checkbox" class="pwSrcChk" value="' + escAttr(c.name) + '"' + checked +
                ' onchange="pwToggleSourceClass(this.value, this.checked)"> ' +
                esc(c.name) + ' <span style="color:#888;">→ ' + esc(c.next_class || '—') + '</span>' +
                '</label>';
      });
      html += '</div>';
      html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
      html += '<button class="btn btn-primary" onclick="pwLoadClassBased()">Load Learners</button>';
      html += '<button class="btn btn-secondary" onclick="pwBack()">Back</button>';
      html += '</div>';
    }

    // ---------- STEP 4 (year/class-based): per-learner destination ----------
    else if (pw.step === 4 && pw.mode === 'year' && pw.flow === 'classbased') {
      const nextMap = {};
      pw.classes.forEach(function (c) { nextMap[c.name] = c.next_class || null; });

      html += '<p style="font-size:13px;margin:0 0 8px;">' + pw.learners.length +
              ' learner(s) loaded. Adjust per-row destination or mark Keep.</p>';
      html += '<div style="max-height:55vh;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead style="position:sticky;top:0;background:#0d4d26;color:#fff;">';
      html += '<tr><th style="text-align:left;padding:6px;">PIN</th>' +
              '<th style="text-align:left;padding:6px;">Name</th>' +
              '<th style="text-align:left;padding:6px;">Current</th>' +
              '<th style="text-align:left;padding:6px;">Destination</th></tr></thead><tbody>';

      const classNames = pw.classes.map(function (c) { return c.name; }).concat(['—KEEP—']);
      pw.learners.forEach(function (l) {
        const current = l.class_name || '';
        const auto = nextMap[current] || '';
        const chosen = pw.choices[l.id] || auto || '—KEEP—';
        html += '<tr>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.pin || '') + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.name || '') + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(current) + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">';
        html += '<select onchange="pwSetChoice(' + l.id + ', this.value)" style="width:100%;">';
        classNames.forEach(function (c) {
          const sel = (chosen === c) ? ' selected' : '';
          const label = c === '—KEEP—' ? 'Keep in current class' : c;
          html += '<option value="' + escAttr(c) + '"' + sel + '>' + esc(label) + '</option>';
        });
        html += '</select>';
        html += '</td></tr>';
      });
      html += '</tbody></table></div>';
      html += '<div style="margin-top:12px;text-align:right;">';
      html += '<button class="btn btn-secondary" onclick="pwBack()">Back</button> ';
      html += '<button class="btn btn-success" onclick="pwApplyYear()">Apply Promotion</button>';
      html += '</div>';
    }

    // ---------- STEP 3 (year/special): search ----------
    else if (pw.step === 3 && pw.mode === 'year' && pw.flow === 'special') {
      html += '<p style="font-size:13px;margin:0 0 8px;">Search one learner to promote specially.</p>';
      html += '<div style="display:flex;gap:8px;">';
      html += '<input type="text" id="pwSpecialQuery" placeholder="Enter PIN or name…" ' +
              'value="' + escAttr(pw.specialQuery) + '" oninput="pwSpecialQueryChanged(this.value)" style="flex:1;">';
      html += '<button class="btn btn-primary" onclick="pwSearchSpecial()">Search</button>';
      html += '<button class="btn btn-secondary" onclick="pwBack()">Back</button>';
      html += '</div>';
      html += '<div id="pwSpecialResults" style="margin-top:12px;"></div>';
      if (pw.specialLearner) {
        html += '<div style="margin-top:16px;background:#f7fbf7;padding:12px;border-radius:8px;">';
        html += '<p style="margin:0 0 8px;font-size:13px;">' +
                '<b>' + esc(pw.specialLearner.name) + '</b> — ' + esc(pw.specialLearner.pin) +
                ' (currently: ' + esc(pw.specialLearner.class_name || '—') + ')</p>';
        html += '<div class="form-group"><label>Destination class</label>';
        html += '<select id="pwSpecialTarget" onchange="pw.specialTarget = this.value" style="width:100%;">';
        html += '<option value="">— Select class —</option>';
        pw.classes.forEach(function (c) {
          const sel = (pw.specialTarget === c.name) ? ' selected' : '';
          html += '<option value="' + escAttr(c.name) + '"' + sel + '>' + esc(c.name) + '</option>';
        });
        html += '</select></div>';
        html += '<div id="pwSpecialWarn" style="font-size:12px;color:#b8860b;margin-top:6px;"></div>';
        html += '<div style="text-align:right;margin-top:10px;">';
        html += '<button class="btn btn-success" onclick="pwApplySpecial()">Apply Special Promotion</button>';
        html += '</div>';
        html += '</div>';
      }
    }

    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  // ---------- Wizard handlers ----------
  function pwSetMode(m) { pw.mode = m; pw.step = 2; renderPromotionWizard(); }
  function pwBack() {
    if (pw.step === 3 || pw.step === 4) { pw.step = 2; }
    else if (pw.step === 2) { pw.step = 1; pw.mode = null; }
    renderPromotionWizard();
  }
  function pwYearGoClassBased() { pw.flow = 'classbased'; pw.step = 3; pw.sourceClasses = []; renderPromotionWizard(); }
  function pwYearGoSpecial() { pw.flow = 'special'; pw.step = 3; renderPromotionWizard(); }

  function pwToggleSourceClass(name, on) {
    const idx = pw.sourceClasses.indexOf(name);
    if (on && idx === -1) pw.sourceClasses.push(name);
    if (!on && idx !== -1) pw.sourceClasses.splice(idx, 1);
  }

  async function pwLoadClassBased() {
    if (pw.sourceClasses.length === 0) { showToast('Pick at least one class', 'warning'); return; }
    startLoader();
    const r = await window.TIS.getLearnersForClasses(pw.sourceClasses);
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load learners: ' + ((r && r.error) || ''), 'error'); return; }
    pw.learners = r.data || [];
    pw.choices = {};
    pw.step = 4;
    renderPromotionWizard();
  }

  function pwSetChoice(learnerId, value) {
    pw.choices[learnerId] = value;
  }

  async function pwApplyYear() {
    const nextMap = {};
    pw.classes.forEach(function (c) { nextMap[c.name] = c.next_class || null; });

    const promotions = [];
    pw.learners.forEach(function (l) {
      const chosen = pw.choices[l.id] || nextMap[l.class_name] || '—KEEP—';
      if (chosen === '—KEEP—') return;
      if (chosen === l.class_name) return;
      promotions.push({ learnerId: l.id, newClassName: chosen });
    });

    if (promotions.length === 0) { showToast('Nothing to promote', 'info'); return; }

    // Non-standard move summary
    const nonStandard = promotions.filter(function (p) {
      const l = pw.learners.find(function (x) { return x.id === p.learnerId; });
      const auto = nextMap[l.class_name];
      return auto !== p.newClassName;
    });

    let msg = 'Promote ' + promotions.length + ' learner(s)?';
    if (nonStandard.length > 0) {
      msg += '\n\n⚠ ' + nonStandard.length + ' non-standard move(s) detected.\n' +
             'These do not follow the standard next-class mapping but will proceed.';
    }
    if (!confirm(msg)) return;

    startLoader();
    const r = await window.TIS.yearPromote(promotions);
    stopLoader();
    if (r && r.ok) {
      showToast('Promoted ' + r.data.applied + ' learner(s).', 'success');
      closePromotionWizard();
      loadLearners();
    } else {
      showToast('Promotion failed: ' + ((r && r.error) || ''), 'error');
    }
  }

  async function pwTermPreview() {
    startLoader();
    const r = await window.TIS.getLearnersForClasses(null);
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load learners', 'error'); return; }
    pw.learners = r.data || [];
    const next = nextTermOf(pw.activeTerm);
    let html = '<p style="font-size:12px;color:#555;margin:0 0 8px;">' +
               pw.learners.length + ' active learner(s) will receive a fee row for ' +
               esc(next.term_type.toUpperCase()) + ' TERM ' + esc(next.year) + '.</p>';
    html += '<div style="max-height:280px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    pw.learners.slice(0, 40).forEach(function (l) {
      html += '<tr><td style="padding:4px;">' + esc(l.pin || '') + '</td>' +
              '<td style="padding:4px;">' + esc(l.name || '') + '</td>' +
              '<td style="padding:4px;">' + esc(l.class_name || '') + '</td></tr>';
    });
    if (pw.learners.length > 40) {
      html += '<tr><td colspan="3" style="padding:4px;color:#888;">… and ' +
              (pw.learners.length - 40) + ' more</td></tr>';
    }
    html += '</table></div>';
    html += '<div style="margin-top:12px;text-align:right;">';
    html += '<button class="btn btn-success" onclick="pwApplyTerm()">Apply Term Promotion</button>';
    html += '</div>';
    document.getElementById('pwTermPreview').innerHTML = html;
  }

  async function pwApplyTerm() {
    if (!pw.learners.length) { showToast('Load the learners first', 'warning'); return; }
    const next = nextTermOf(pw.activeTerm);
    const ids = pw.learners.map(function (l) { return l.id; });
    if (!confirm('Term promotion: create ' + ids.length + ' new fee row(s) for ' +
                 next.term_type.toUpperCase() + ' TERM ' + next.year + '?\n\n' +
                 'Balance C/F carries forward as the next term\'s Balance B/F.')) return;

    startLoader();
    const r = await window.TIS.termPromote(
      pw.activeTerm.term_type, pw.activeTerm.year,
      next.term_type, next.year, ids);
    stopLoader();

    if (r && r.ok) {
      showToast('Created ' + r.data.created + ' next-term row(s).', 'success');
      closePromotionWizard();
      loadTerms();
      checkPromotionBanner();
    } else {
      showToast('Term promotion failed: ' + ((r && r.error) || ''), 'error');
    }
  }

  // ---------- Special (single learner) ----------
  function pwSpecialQueryChanged(val) { pw.specialQuery = val || ''; }

  async function pwSearchSpecial() {
    const q = (pw.specialQuery || '').trim();
    if (!q) { showToast('Enter a name or PIN', 'warning'); return; }
    startLoader();
    const r = await window.TIS.searchLearners(q);
    stopLoader();
    if (!r || !r.ok) { showToast('Search failed: ' + ((r && r.error) || ''), 'error'); return; }
    const results = r.data || [];
    const box = document.getElementById('pwSpecialResults');
    if (!box) return;
    if (results.length === 0) {
      box.innerHTML = '<p style="color:#888;font-size:12px;">No matches.</p>';
      return;
    }
    let h = '<div style="max-height:220px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
    results.forEach(function (l) {
      h += '<div style="padding:6px 10px;border-bottom:1px solid #eee;cursor:pointer;" ' +
           'onclick="pwPickSpecial(' + l.id + ')">' +
           '<b>' + esc(l.name) + '</b> — ' + esc(l.pin) +
           ' <span style="color:#888;">(currently ' + esc(l.class_name || '—') + ')</span></div>';
    });
    h += '</div>';
    box.innerHTML = h;
    pw.specialResults = results;
  }

  function pwPickSpecial(learnerId) {
    const l = (pw.specialResults || []).find(function (x) { return x.id === learnerId; });
    if (!l) return;
    pw.specialLearner = l;
    pw.specialTarget = '';
    renderPromotionWizard();
  }

  async function pwApplySpecial() {
    if (!pw.specialLearner) { showToast('Pick a learner first', 'warning'); return; }
    const target = (pw.specialTarget || '').trim();
    if (!target) { showToast('Pick a destination class', 'warning'); return; }

    // Warning check for non-standard moves.
    const nextMap = {};
    pw.classes.forEach(function (c) { nextMap[c.name] = c.next_class || null; });
    const auto = nextMap[pw.specialLearner.class_name] || null;
    if (auto !== target) {
      const w = 'Non-standard promotion:\n\n' +
                pw.specialLearner.name + ' is in ' + (pw.specialLearner.class_name || '—') + '.\n' +
                'Standard next class: ' + (auto || '—') + '.\n' +
                'You are promoting to: ' + target + '.\n\nProceed?';
      if (!confirm(w)) return;
    } else {
      if (!confirm('Promote ' + pw.specialLearner.name + ' to ' + target + '?')) return;
    }

    startLoader();
    const r = await window.TIS.yearPromote([{ learnerId: pw.specialLearner.id, newClassName: target }]);
    stopLoader();
    if (r && r.ok) {
      showToast('Promoted ' + pw.specialLearner.name + ' to ' + target + '.', 'success');
      closePromotionWizard();
      loadLearners();
    } else {
      showToast('Promotion failed: ' + ((r && r.error) || ''), 'error');
    }
  }

  function closePromotionWizard() {
    pw = null;
    setHTML('modalContainer', '');
  }

  // ================================================================
  // PROMOTION BANNER — persistent reminder when a term promotion is due
  // ================================================================
  async function checkPromotionBanner() {
    let bar = document.getElementById('promotionBanner');
    try {
      const r = await window.TIS.getPromotionStatus();
      if (!r || !r.ok || !r.data || !r.data.needsTermPromotion) {
        if (bar) bar.remove();
        return;
      }
      const t = r.data;
      const msg = '⚠ You have not yet promoted some learners into ' +
                  t.nextTerm.term_type.toUpperCase() + ' TERM ' + t.nextTerm.year +
                  ' (' + t.pendingLearners + ' pending).';
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'promotionBanner';
        bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#f39c12;' +
                            'color:#fff;padding:10px 18px;font-size:13px;font-weight:600;' +
                            'text-align:center;z-index:9999;box-shadow:0 -4px 12px rgba(0,0,0,0.15);';
        bar.innerHTML = msg + ' <button onclick="document.getElementById(\'promotionBanner\').remove()" ' +
                        'style="background:transparent;border:1px solid #fff;color:#fff;' +
                        'border-radius:4px;padding:2px 8px;margin-left:12px;cursor:pointer;">Dismiss</button>';
        document.body.appendChild(bar);
      } else {
        bar.innerHTML = msg + ' <button onclick="document.getElementById(\'promotionBanner\').remove()" ' +
                        'style="background:transparent;border:1px solid #fff;color:#fff;' +
                        'border-radius:4px;padding:2px 8px;margin-left:12px;cursor:pointer;">Dismiss</button>';
      }
    } catch (e) { /* silent */ }
  }

  // Check once at boot and every 10 minutes
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(checkPromotionBanner, 3000);
    setInterval(checkPromotionBanner, 10 * 60 * 1000);
  });

  // ---------- Globals ----------
  window.activateTerm = activateTerm;
  window.openPromotionWizard = openPromotionWizard;
  window.closePromotionWizard = closePromotionWizard;
  window.pwSetMode = pwSetMode;
  window.pwBack = pwBack;
  window.pwYearGoClassBased = pwYearGoClassBased;
  window.pwYearGoSpecial = pwYearGoSpecial;
  window.pwToggleSourceClass = pwToggleSourceClass;
  window.pwLoadClassBased = pwLoadClassBased;
  window.pwSetChoice = pwSetChoice;
  window.pwApplyYear = pwApplyYear;
  window.pwTermPreview = pwTermPreview;
  window.pwApplyTerm = pwApplyTerm;
  window.pwSpecialQueryChanged = pwSpecialQueryChanged;
  window.pwSearchSpecial = pwSearchSpecial;
  window.pwPickSpecial = pwPickSpecial;
  window.pwApplySpecial = pwApplySpecial;
  window.checkPromotionBanner = checkPromotionBanner;
  // ================================================================
  // [S10] LEARNER ATTENDANCE
  // Master mark: 'O O' | '\\' | '/' | '\\ /'
  //
  // Lock rules:
  //   - Future date → not markable
  //   - Current week → markable through Friday 23:59
  //   - Previous week → markable for 24 h after its Friday 23:59
  //   - Any older week → locked; admin / super_admin only
  //   - Admin / super_admin can mark any week of the term
  // ================================================================
  const ATT_MARKS = ['O O', '\\', '/', '\\ /'];
  let attSessionMode = 'AM';
  let attState = null;

  function attIsAdmin() {
    return !!(State.profile && (State.profile.role === 'admin' || State.profile.role === 'super_admin'));
  }
  function attTodayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  // Given a week (Mon–Fri date ISO list), return:
  //   'future'   — week hasn't started
  //   'open'     — the week is currently markable
  //   'grace'    — Friday has passed, still inside the 24h grace window
  //   'locked'   — permanently closed
  function attWeekLockState(wk) {
    const today = attTodayISO();
    const monday = wk.days[0].date;
    const friday = wk.days[4].date;

    // Future week: hasn't started yet.
    if (today < monday) return 'future';

    // Current week: markable through Friday.
    if (today >= monday && today <= friday) return 'open';

    // The week has ended. Compute hours since Friday 23:59.
    const fridayEnd = new Date(friday + 'T23:59:59');
    const now = new Date();
    const hoursSince = (now - fridayEnd) / (1000 * 60 * 60);

    if (hoursSince >= 0 && hoursSince <= 24) return 'grace';
    return 'locked';
  }

  function attDayLockState(day) {
    // A single day. Holidays and future dates are handled elsewhere.
    // Future date → not markable.
    const today = attTodayISO();
    if (day.date > today) return 'future';
    return 'open';
  }

  function attMarkableFor(weekLock, dayLock, role) {
    if (dayLock === 'future') return false;
    if (weekLock === 'open' || weekLock === 'grace') return true;
    if (weekLock === 'locked' || weekLock === 'future') {
      // Only admin / super_admin bypass a locked or future week.
      return role === 'admin' || role === 'super_admin';
    }
    return false;
  }

  async function initLearnerAttendanceTab() {
    await populateAttendanceClassList();
    const loadBtn = document.getElementById('btnLoadAttendance');
    if (loadBtn && !loadBtn.__wired) {
      loadBtn.addEventListener('click', loadAttendanceRegister);
      loadBtn.__wired = true;
    }
    const printBtn = document.getElementById('btnPrintAttendance');
    if (printBtn && !printBtn.__wired) {
      printBtn.addEventListener('click', function (e) { e.preventDefault(); attOpenPrintDialog(); });
      printBtn.__wired = true;
    }
  }

  async function populateAttendanceClassList() {
    const sel = document.getElementById('attendanceClass');
    if (!sel) return;
    const r = await window.TIS.listLearners();
    if (!r || !r.ok) return;
    const classes = {};
    (r.data || []).forEach(function (l) { if (l.class_name) classes[l.class_name] = true; });
    const names = Object.keys(classes).sort();
    sel.innerHTML = '<option value="">-- Select Class --</option>' +
      names.map(function (n) { return '<option value="' + escAttr(n) + '">' + esc(n) + '</option>'; }).join('');
  }

  async function loadAttendanceRegister() {
    const clsEl  = document.getElementById('attendanceClass');
    const termEl = document.getElementById('attendanceTerm');
    const yearEl = document.getElementById('attendanceYear');
    const cls  = clsEl  ? clsEl.value  : '';
    const term = termEl ? termEl.value : '';
    const year = yearEl ? yearEl.value.trim() : '';
    if (!cls) { showToast('Pick a class first', 'warning'); return; }
    if (!term || !year) { showToast('Pick a term and year', 'warning'); return; }

    setHTML('attendanceTermView', pageLoaderHTML('Loading register…'));
    startLoader();
    const r = await window.TIS.getAttendanceRegister(cls, term, parseInt(year, 10));
    stopLoader();
    if (!r || !r.ok) {
      setHTML('attendanceTermView', errorHTML('Could not load register', r && r.error));
      return;
    }
    attState = {
      cls: cls, term: term, year: parseInt(year, 10),
      termLabel: r.data.termLabel || (term.toUpperCase() + ' TERM ' + year),
      learners: r.data.learners || [],
      weeks: r.data.weeks || [],
      openWeeks: {},
      editing: {}
    };
    if (attState.weeks.length > 0) attState.openWeeks[attState.weeks[0].weekNumber] = true;
    renderAttendanceRegister();
    renderClassAnalysisPanel();
    renderSignaturePanel();
  }

  function attMA(mark) {
    if (mark === '\\')   return { M: '\\', A: 'O' };
    if (mark === '/')    return { M: 'O',  A: '/' };
    if (mark === '\\ /') return { M: '\\', A: '/' };
    return { M: 'O', A: 'O' };
  }

  function attEffectiveMark(learnerId, dateISO) {
    if (!attState) return 'O O';
    const key = learnerId + '|' + dateISO;
    if (attState.editing[key] !== undefined) return attState.editing[key];
    for (let i = 0; i < attState.weeks.length; i++) {
      const wk = attState.weeks[i];
      for (let j = 0; j < wk.days.length; j++) {
        const d = wk.days[j];
        if (d.date === dateISO) return (d.marksByLearner || {})[learnerId] || 'O O';
      }
    }
    return 'O O';
  }

  function attWeekLockLabel(lock) {
    if (lock === 'open')   return '🔓 Open';
    if (lock === 'grace')  return '⏳ Grace (24h)';
    if (lock === 'locked') return '🔒 Locked';
    return '⏳ Future';
  }

  function renderAttendanceRegister() {
    if (!attState) return;
    const st = attState;
    const role = State.profile ? State.profile.role : 'operator';
    const isAdmin = (role === 'admin' || role === 'super_admin');

    let html = '<div class="card-bg" style="padding:14px;overflow-x:auto;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">';
    html += '<div>';
    html += '<div style="font-weight:800;font-size:16px;color:#0d4d26;">' + esc(st.cls) + ' — ' + esc(st.termLabel) + '</div>';
    html += '<div style="font-size:11px;color:#666;">' + st.learners.length + ' learners · ' + st.weeks.length + ' weeks</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">';
    html += '<select id="attSessionMode2" style="padding:6px 10px;border-radius:6px;border:1px solid #ccc;font-size:12px;">';
    html += '<option value="AM"'   + (attSessionMode === 'AM'   ? ' selected' : '') + '>Mark Morning</option>';
    html += '<option value="PM"'   + (attSessionMode === 'PM'   ? ' selected' : '') + '>Mark Afternoon</option>';
    html += '<option value="FULL"' + (attSessionMode === 'FULL' ? ' selected' : '') + '>Mark Full Day</option>';
    html += '</select>';
    html += '<button class="btn btn-sm btn-success" onclick="attMarkClassPresent()">Apply to Today</button>';
    html += '<button class="btn btn-sm btn-warning" onclick="attSaveAllChanges()">Save Changes</button>';
    html += '<button class="btn btn-sm btn-secondary" onclick="attDiscardChanges()">Discard</button>';
    html += '</div></div>';

    st.weeks.forEach(function (wk) {
      const isOpen = !!st.openWeeks[wk.weekNumber];
      const arrow = isOpen ? '▾' : '▸';
      const a = attWeekSummary(wk);
      const lock = attWeekLockState(wk);

      html += '<div style="border:1px solid #e6e9f0;border-radius:8px;overflow:hidden;margin-bottom:10px;">';
      html += '<div onclick="attToggleWeek(' + wk.weekNumber + ')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:#0d4d26;color:#fff;padding:10px 14px;flex-wrap:wrap;gap:8px;">';
      html += '<div style="font-weight:700;font-size:13px;">' + arrow + ' Week ' + wk.weekNumber + ' · Ending ' + fmtDateShort_(wk.weekEnding) + '</div>';
      html += '<div style="display:flex;gap:14px;font-size:11px;flex-wrap:wrap;">';
      html += '<span>' + attWeekLockLabel(lock) + '</span>';
      html += '<span>Open: <b>' + a.openSlots + '</b></span>';
      html += '<span>🌅 M: <b>' + a.mPresent + '/' + a.mExpected + '</b> (' + a.mPct + '%)</span>';
      html += '<span>🌇 A: <b>' + a.aPresent + '/' + a.aExpected + '</b> (' + a.aPct + '%)</span>';
      html += '<span>♂ ' + (a.boysPresent === null ? '—' : a.boysPresent) + ' · ♀ ' + (a.girlsPresent === null ? '—' : a.girlsPresent) + '</span>';
      html += '</div></div>';

      if (isOpen) html += renderWeekGrid(wk, lock);
      html += '</div>';
    });

    html += '</div>';
    setHTML('attendanceTermView', html);

    const modeSel = document.getElementById('attSessionMode2');
    if (modeSel) modeSel.addEventListener('change', function () { attSessionMode = modeSel.value; });
  }

  function renderWeekGrid(wk, weekLock) {
    const st = attState;
    const days = wk.days;
    const role = State.profile ? State.profile.role : 'operator';
    const isAdmin = (role === 'admin' || role === 'super_admin');

    let h = '<div style="position:relative;overflow-x:auto;background:#fff;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:900px;">';
    h += '<thead><tr style="background:#e8f5e9;">';
    h += '<th style="text-align:left;padding:6px;background:#e8f5e9;position:sticky;left:0;z-index:2;">PIN</th>';
    h += '<th style="text-align:left;padding:6px;background:#e8f5e9;position:sticky;left:70px;z-index:2;">Name</th>';
    h += '<th style="padding:6px;">Sex</th><th style="padding:6px;">Age</th>';
    days.forEach(function (d, i) {
      const isHol = d.isHoliday;
      const shortDay = ['Mon','Tue','Wed','Thu','Fri'][i];
      if (isHol) {
        // A holiday column: no M/A sub-header cells; the description
        // fills the entire column as one vertical write-up.
        h += '<th colspan="2" class="att-holiday-col" ' +
             'style="position:relative;background:#ffcdd2;color:#721c24;padding:4px 6px;vertical-align:top;">' +
             shortDay + '<br><span style="font-size:10px;font-weight:400;">' + fmtDateShort_(d.date) + '</span>' +
             '<div class="att-holiday-veil">' +
             '<div class="att-holiday-lines"></div>' +
             '<div class="att-holiday-text">' + esc(d.holidayName || 'Holiday') + '</div>' +
             '</div>' +
             '</th>';
      } else {
        h += '<th colspan="2" style="padding:4px 6px;">' + shortDay +
             '<br><span style="font-size:10px;font-weight:400;">' + fmtDateShort_(d.date) + '</span></th>';
      }
    });
    h += '<th style="padding:6px;background:#c8e6c9;">Wkly</th>';
    h += '<th style="padding:6px;background:#a5d6a7;">Term</th></tr>';
    h += '<tr style="background:#f1f8e9;">';
    h += '<th colspan="4" style="padding:2px;"></th>';
    days.forEach(function (d) {
      if (d.isHoliday) {
        h += '';   // no M/A headers for holiday columns
      } else {
        h += '<th style="padding:2px 4px;font-size:10px;">M</th><th style="padding:2px 4px;font-size:10px;">A</th>';
      }
    });
    h += '<th style="padding:2px;"></th><th style="padding:2px;"></th></tr></thead><tbody>';

    st.learners.forEach(function (l) {
      h += '<tr id="attRow_' + l.id + '">';
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;position:sticky;left:0;background:#fff;z-index:1;">' + esc(l.pin || '') + '</td>';
      const g = (l.gender || '').toLowerCase();
      const nc = g.indexOf('female') === 0 ? 'color:#c0392b;' : (g.indexOf('male') === 0 ? 'color:#1a5276;' : '');
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-weight:600;' + nc + ';position:sticky;left:70px;background:#fff;z-index:1;">' + esc(l.name || '') + '</td>';
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:10px;text-align:center;">' + esc(l.gender || '—') + '</td>';
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:10px;text-align:center;">' + esc(l.age || '—') + '</td>';

      let weeklyPresent = 0;
      days.forEach(function (d) {
        if (d.isHoliday) {
          // Render two shadow cells so column-count matches. The veil in
          // the header overlays the entire holiday column visually.
          h += '<td colspan="2" style="padding:4px;text-align:center;background:#fff5f5;"></td>';
          return;
        }

        const dayLock = attDayLockState(d);
        const canMark = attMarkableFor(weekLock, dayLock, role);

        const mark = attEffectiveMark(l.id, d.date);
        const ma = attMA(mark);

        if (canMark) {
          if (ma.M === '\\') weeklyPresent++;
          if (ma.A === '/')  weeklyPresent++;
        } else if (dayLock !== 'future') {
          // Past cell, but locked — count actual marks toward totals.
          if (ma.M === '\\') weeklyPresent++;
          if (ma.A === '/')  weeklyPresent++;
        }

        const cellIdM = 'attCell_' + l.id + '_' + d.date + '_M';
        const cellIdA = 'attCell_' + l.id + '_' + d.date + '_A';

        if (dayLock === 'future') {
          h += '<td style="padding:4px;text-align:center;background:#f5f5f5;color:#aaa;">·</td>';
          h += '<td style="padding:4px;text-align:center;background:#f5f5f5;color:#aaa;">·</td>';
        } else if (canMark) {
          const mBg = ma.M === '\\' ? '#d4edda' : '#f8d7da';
          const aBg = ma.A === '/'  ? '#d4edda' : '#f8d7da';
          h += '<td id="' + cellIdM + '" onclick="attCycleCell(' + l.id + ',\'' + d.date + '\',\'M\')" style="padding:4px;text-align:center;cursor:pointer;background:' + mBg + ';font-weight:700;user-select:none;">' + ma.M + '</td>';
          h += '<td id="' + cellIdA + '" onclick="attCycleCell(' + l.id + ',\'' + d.date + '\',\'A\')" style="padding:4px;text-align:center;cursor:pointer;background:' + aBg + ';font-weight:700;user-select:none;">' + ma.A + '</td>';
        } else {
          // Locked — grey, no onclick, still shows the last mark.
          h += '<td style="padding:4px;text-align:center;background:#eceff1;color:#78909c;font-weight:700;">' + ma.M + '</td>';
          h += '<td style="padding:4px;text-align:center;background:#eceff1;color:#78909c;font-weight:700;">' + ma.A + '</td>';
        }
      });

      const termPresent = attLearnerTermTotal(l.id);
      h += '<td id="attWk_' + l.id + '" style="padding:4px;text-align:center;font-weight:700;background:#e8f5e9;">' + weeklyPresent + '</td>';
      h += '<td style="padding:4px;text-align:center;font-weight:700;background:#a5d6a7;">' + termPresent + '</td>';
      h += '</tr>';
    });

    h += '</tbody></table></div>';
    return h;
  }

  function attCycleCell(learnerId, dateISO, session) {
    if (!attState) return;
    const st = attState;
    const role = State.profile ? State.profile.role : 'operator';

    let day = null, week = null;
    for (let i = 0; i < st.weeks.length; i++) {
      for (let j = 0; j < st.weeks[i].days.length; j++) {
        if (st.weeks[i].days[j].date === dateISO) { day = st.weeks[i].days[j]; week = st.weeks[i]; break; }
      }
      if (day) break;
    }
    if (!day || day.isHoliday) return;

    const dayLock = attDayLockState(day);
    const weekLock = attWeekLockState(week);
    if (!attMarkableFor(weekLock, dayLock, role)) {
      if (dayLock === 'future') showToast('That date has not arrived yet', 'warning');
      else if (weekLock === 'locked') showToast('That week is locked. Ask an admin to edit it.', 'warning');
      else showToast('That week is not open for marking', 'warning');
      return;
    }

    const current = attEffectiveMark(learnerId, dateISO);
    const ma = attMA(current);
    let hasM = (ma.M === '\\');
    let hasA = (ma.A === '/');
    if (session === 'M') hasM = !hasM;
    if (session === 'A') hasA = !hasA;

    let next = 'O O';
    if (hasM && hasA) next = '\\ /';
    else if (hasM)    next = '\\';
    else if (hasA)    next = '/';

    st.editing[learnerId + '|' + dateISO] = next;

    const ma2 = attMA(next);
    const cellM = document.getElementById('attCell_' + learnerId + '_' + dateISO + '_M');
    const cellA = document.getElementById('attCell_' + learnerId + '_' + dateISO + '_A');
    if (cellM) { cellM.textContent = ma2.M; cellM.style.background = ma2.M === '\\' ? '#d4edda' : '#f8d7da'; }
    if (cellA) { cellA.textContent = ma2.A; cellA.style.background = ma2.A === '/' ? '#d4edda' : '#f8d7da'; }
    const wkCell = document.getElementById('attWk_' + learnerId);
    if (wkCell) wkCell.textContent = attLearnerWeekTotal(learnerId, week);
  }

  function attLearnerWeekTotal(learnerId, wk) {
    if (!wk) return 0;
    let n = 0;
    wk.days.forEach(function (d) {
      if (d.isHoliday) return;
      const mark = attEffectiveMark(learnerId, d.date);
      const ma = attMA(mark);
      if (ma.M === '\\') n++;
      if (ma.A === '/')  n++;
    });
    return n;
  }

  function attLearnerTermTotal(learnerId) {
    if (!attState) return 0;
    let n = 0;
    attState.weeks.forEach(function (wk) { n += attLearnerWeekTotal(learnerId, wk); });
    return n;
  }

  function attToggleWeek(weekNumber) {
    if (!attState) return;
    attState.openWeeks[weekNumber] = !attState.openWeeks[weekNumber];
    renderAttendanceRegister();
  }

  function attMarkClassPresent() {
    if (!attState) return;
    const st = attState;
    const role = State.profile ? State.profile.role : 'operator';
    const today = attTodayISO();

    let targetDay = null, targetWeek = null;
    for (let i = 0; i < st.weeks.length; i++) {
      for (let j = 0; j < st.weeks[i].days.length; j++) {
        if (st.weeks[i].days[j].date === today) { targetDay = st.weeks[i].days[j]; targetWeek = st.weeks[i]; break; }
      }
      if (targetDay) break;
    }
    if (!targetDay) { showToast('Today is not part of this term', 'warning'); return; }
    if (targetDay.isHoliday) { showToast('Today is a holiday', 'warning'); return; }

    const dayLock = attDayLockState(targetDay);
    const weekLock = attWeekLockState(targetWeek);
    if (!attMarkableFor(weekLock, dayLock, role)) {
      showToast('Today is not markable for your role', 'warning');
      return;
    }

    const mode = attSessionMode;
    const label = mode === 'AM' ? 'Morning' : (mode === 'PM' ? 'Afternoon' : 'Full day');
    if (!confirm('Mark every learner present — ' + label + ' — for today (' + today + ')?')) return;

    st.learners.forEach(function (l) {
      const current = attEffectiveMark(l.id, targetDay.date);
      const ma = attMA(current);
      let hasM = (ma.M === '\\');
      let hasA = (ma.A === '/');
      if (mode === 'AM')   hasM = true;
      if (mode === 'PM')   hasA = true;
      if (mode === 'FULL') { hasM = true; hasA = true; }
      let next = 'O O';
      if (hasM && hasA) next = '\\ /';
      else if (hasM)    next = '\\';
      else if (hasA)    next = '/';
      st.editing[l.id + '|' + targetDay.date] = next;
    });
    renderAttendanceRegister();
  }

  async function attSaveAllChanges() {
    if (!attState) return;
    const st = attState;
    const marks = [];
    Object.keys(st.editing).forEach(function (key) {
      const parts = key.split('|');
      marks.push({ learnerId: parseInt(parts[0], 10), date: parts[1], mark: st.editing[key] });
    });
    if (marks.length === 0) { showToast('Nothing to save', 'info'); return; }

    startLoader();
    const r = await window.TIS.saveAttendanceMarks(
      st.term, st.year, marks,
      (State.profile && State.profile.name) || 'Operator'
    );
    stopLoader();
    if (r && r.ok) {
      showToast('Saved ' + r.data.applied + ' mark(s).', 'success');
      marks.forEach(function (m) {
        st.weeks.forEach(function (wk) {
          wk.days.forEach(function (d) {
            if (d.date === m.date) {
              d.marksByLearner = d.marksByLearner || {};
              d.marksByLearner[m.learnerId] = m.mark;
            }
          });
        });
      });
      st.editing = {};
      renderAttendanceRegister();
      renderClassAnalysisPanel();
    } else {
      showToast('Save failed: ' + ((r && r.error) || ''), 'error');
    }
  }

  function attDiscardChanges() {
    if (!attState) return;
    const n = Object.keys(attState.editing).length;
    if (n === 0) { showToast('No pending changes', 'info'); return; }
    if (!confirm('Discard ' + n + ' pending edit(s)?')) return;
    attState.editing = {};
    renderAttendanceRegister();
  }

  function attWeekSummary(wk) {
    const st = attState;

    let openSlots = 0;
    wk.days.forEach(function (d) { if (!d.isHoliday) openSlots += 2; });

    let mPresent = 0, aPresent = 0, boysPresent = 0, girlsPresent = 0, genderKnown = false;

    st.learners.forEach(function (l) {
      const g = (l.gender || '').toLowerCase();
      const isBoy  = g.indexOf('male') === 0 && g.indexOf('female') === -1;
      const isGirl = g.indexOf('female') === 0;
      wk.days.forEach(function (d) {
        if (d.isHoliday) return;
        if (d.date > attTodayISO()) return;   // future dates contribute nothing yet
        const mark = attEffectiveMark(l.id, d.date);
        const ma = attMA(mark);
        if (ma.M === '\\') { mPresent++; if (isBoy) { boysPresent++; genderKnown = true; } else if (isGirl) { girlsPresent++; genderKnown = true; } }
        if (ma.A === '/')  { aPresent++; if (isBoy) { boysPresent++; genderKnown = true; } else if (isGirl) { girlsPresent++; genderKnown = true; } }
      });
    });

    const mExpected = openSlots * st.learners.length;
    const aExpected = openSlots * st.learners.length;

    return {
      openSlots: openSlots,
      mPresent: mPresent, mExpected: mExpected,
      mPct: mExpected > 0 ? (mPresent / mExpected * 100).toFixed(1) : '0.0',
      aPresent: aPresent, aExpected: aExpected,
      aPct: aExpected > 0 ? (aPresent / aExpected * 100).toFixed(1) : '0.0',
      boysPresent:  genderKnown ? boysPresent  : null,
      girlsPresent: genderKnown ? girlsPresent : null
    };
  }

  function renderClassAnalysisPanel() {
    if (!attState) return;
    const st = attState;

    let html = '<h4 style="color:#0d4d26;margin:0 0 10px;">' + esc(st.cls) + ' — ' + esc(st.termLabel) + '</h4>';
    html += '<div style="overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:900px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">Week</th><th style="padding:6px;">Ending</th>';
    html += '<th style="padding:6px;">Open<br>(M+A)</th>';
    html += '<th style="padding:6px;">🌅 M present</th><th style="padding:6px;">🌇 A present</th>';
    html += '<th style="padding:6px;">♂ present</th><th style="padding:6px;">♀ present</th>';
    html += '<th style="padding:6px;">Expected</th><th style="padding:6px;">Confirmed</th><th style="padding:6px;">%</th>';
    html += '</tr></thead><tbody>';

    let tM = 0, tA = 0, tExpected = 0, tOpen = 0, tBoys = 0, tGirls = 0, tGenderKnown = false;

    st.weeks.forEach(function (wk) {
      const a = attWeekSummary(wk);
      const expected = a.mExpected + a.aExpected;
      const confirmed = a.mPresent + a.aPresent;
      const pct = expected > 0 ? (confirmed / expected * 100).toFixed(1) : '0.0';

      tM += a.mPresent; tA += a.aPresent;
      tExpected += expected; tOpen += a.openSlots;
      if (a.boysPresent !== null)  { tBoys  += a.boysPresent; tGenderKnown = true; }
      if (a.girlsPresent !== null) { tGirls += a.girlsPresent; tGenderKnown = true; }

      html += '<tr>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;">Week ' + wk.weekNumber + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + fmtDateShort_(wk.weekEnding) + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + a.openSlots + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + a.mPresent + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + a.aPresent + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + (a.boysPresent === null ? '—' : a.boysPresent) + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + (a.girlsPresent === null ? '—' : a.girlsPresent) + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + expected + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + confirmed + '</td>' +
              '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + pct + '%</td>' +
              '</tr>';
    });

    const tConfirmed = tM + tA;
    const tPct = tExpected > 0 ? (tConfirmed / tExpected * 100).toFixed(1) : '0.0';

    html += '<tr style="background:#e8f5e9;font-weight:700;">' +
            '<td style="padding:6px;">TERM</td><td></td>' +
            '<td style="padding:6px;text-align:center;">' + tOpen + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tM + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tA + '</td>' +
            '<td style="padding:6px;text-align:center;">' + (tGenderKnown ? tBoys : '—') + '</td>' +
            '<td style="padding:6px;text-align:center;">' + (tGenderKnown ? tGirls : '—') + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tExpected + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tConfirmed + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tPct + '%</td>' +
            '</tr>';
    html += '</tbody></table></div>';

    html += '<div class="stats-grid" style="margin-top:12px;">';
    html += '<div class="stat-card"><div class="stat-label">Sum total school-open (term)</div><div class="stat-value">' + tOpen + '</div></div>';
    html += '<div class="stat-card gold"><div class="stat-label">Sum total attendance (term)</div><div class="stat-value gold">' + tConfirmed + '</div></div>';
    html += '<div class="stat-card red"><div class="stat-label">♂ Boys present (term)</div><div class="stat-value red">' + (tGenderKnown ? tBoys : '—') + '</div></div>';
    html += '<div class="stat-card blue"><div class="stat-label">♀ Girls present (term)</div><div class="stat-value" style="color:#1a5276;">' + (tGenderKnown ? tGirls : '—') + '</div></div>';
    html += '<div class="stat-card"><div class="stat-label">Average attendance</div><div class="stat-value green">' + tPct + '%</div></div>';
    html += '</div>';

    setHTML('analysisBody', html);
  }

  async function renderSignaturePanel() {
    if (!attState) return;
    setHTML('signatureBody', pageLoaderHTML('Loading staff…'));
    let staffNames = [];
    try {
      const r = await window.TIS.listStaff();
      if (r && r.ok && r.data) {
        staffNames = r.data.filter(function (s) { return s.status === 'Active' || !s.status; })
          .map(function (s) { return s.full_name; }).filter(Boolean);
      }
    } catch (e) {}

    let html = '<p style="font-size:11px;color:#666;margin:0 0 10px;">Sign each week as it is completed.</p>';
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:640px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">Week</th><th style="padding:6px;">Ending</th>';
    html += '<th style="padding:6px;">Logged By</th><th style="padding:6px;">Confirmed By</th><th style="padding:6px;">Audited By</th><th style="padding:6px;">Date</th>';
    html += '</tr></thead><tbody>';

    attState.weeks.forEach(function (wk) {
      const opts = function () {
        let o = '<option value="">-- Select --</option>';
        staffNames.forEach(function (n) { o += '<option value="' + escAttr(n) + '">' + esc(n) + '</option>'; });
        return o;
      };
      const today = attTodayISO();
      html += '<tr>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">Week ' + wk.weekNumber + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + fmtDateShort_(wk.weekEnding) + '</td>' +
        '<td style="padding:4px;border-bottom:1px solid #eee;"><select style="width:100%;font-size:11px;">' + opts() + '</select></td>' +
        '<td style="padding:4px;border-bottom:1px solid #eee;"><select style="width:100%;font-size:11px;">' + opts() + '</select></td>' +
        '<td style="padding:4px;border-bottom:1px solid #eee;"><select style="width:100%;font-size:11px;">' + opts() + '</select></td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + today + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('signatureBody', html);
  }

  function attSaveSignatures() {
    const rows = document.querySelectorAll('#signatureBody tbody tr');
    let filled = 0;
    rows.forEach(function (tr) {
      const sels = tr.querySelectorAll('select');
      let rowHas = false;
      sels.forEach(function (s) { if (s.value) rowHas = true; });
      if (rowHas) filled++;
    });
    if (filled === 0) { showToast('Pick at least one week to sign', 'warning'); return; }
    showToast('Signatures captured for ' + filled + ' week(s). (Persistence coming.)', 'info');
  }

  function fmtDateShort_(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ---- Print dialog (unchanged) ----
  function attOpenPrintDialog() {
    window.TIS.listLearners().then(function (r) {
      const classes = {};
      ((r && r.ok && r.data) || []).forEach(function (l) { if (l.class_name) classes[l.class_name] = true; });
      const classNames = Object.keys(classes).sort();

      const termEl = document.getElementById('attendanceTerm');
      const yearEl = document.getElementById('attendanceYear');
      const defTerm = termEl ? termEl.value : '1st';
      const defYear = yearEl ? yearEl.value.trim() : '2026';

      let html = '<div class="modal-overlay" onclick="if(event.target===this)attClosePrintDialog()">';
      html += '<div class="modal-box" style="max-width:460px;" onclick="event.stopPropagation()">';
      html += '<div class="modal-header"><h2>Print Attendance</h2>' +
              '<button class="close-btn" onclick="attClosePrintDialog()">&times;</button></div>';
      html += '<div class="form-group"><label>Class</label><select id="attPrintClass" style="width:100%;">';
      classNames.forEach(function (c) { html += '<option value="' + escAttr(c) + '">' + esc(c) + '</option>'; });
      html += '</select></div>';
      html += '<div class="form-group"><label>Term</label><select id="attPrintTerm" style="width:100%;">';
      ['1st','2nd','3rd'].forEach(function (t) {
        html += '<option value="' + t + '"' + (t === defTerm ? ' selected' : '') + '>' + t.toUpperCase() + ' TERM</option>';
      });
      html += '</select></div>';
      html += '<div class="form-group"><label>Year</label><input id="attPrintYear" type="text" value="' + escAttr(defYear) + '"></div>';
      html += '<div class="form-group"><label>Scope</label><select id="attPrintScope" style="width:100%;">';
      html += '<option value="ALL">All weeks (full term)</option>';
      for (let w = 1; w <= 20; w++) html += '<option value="W' + w + '">Week ' + w + '</option>';
      html += '</select></div>';
      html += '<div style="text-align:right;margin-top:14px;">';
      html += '<button class="btn btn-secondary" onclick="attClosePrintDialog()">Cancel</button> ';
      html += '<button class="btn btn-gold" onclick="attRunPrint()">Print</button>';
      html += '</div></div></div>';
      setHTML('modalContainer', html);
    });
  }

  function attClosePrintDialog() { setHTML('modalContainer', ''); }

  async function attRunPrint() {
    const cls   = document.getElementById('attPrintClass').value;
    const term  = document.getElementById('attPrintTerm').value;
    const year  = document.getElementById('attPrintYear').value.trim();
    const scope = document.getElementById('attPrintScope').value;
    attClosePrintDialog();

    startLoader();
    const r = await window.TIS.getAttendanceRegister(cls, term, parseInt(year, 10));
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load register', 'error'); return; }
    const data = r.data;
    let weeksToShow = data.weeks;
    if (scope !== 'ALL') {
      const wn = parseInt(scope.substring(1), 10);
      weeksToShow = data.weeks.filter(function (w) { return w.weekNumber === wn; });
    }

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

    const css = '<style>' +
      'body{font-family:Arial;padding:16px;color:#111;}' +
      '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0b6623;padding-bottom:8px;}' +
      '.hdr .mid{text-align:center;flex:1;}h1{color:#0b6623;margin:0;font-size:18px;}' +
      'h2{font-size:13px;color:#0b6623;margin:12px 0 4px;border-bottom:1px solid #c8e6c9;padding-bottom:3px;}' +
      'table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;}' +
      'th{background:#0b6623;color:#fff;padding:3px;border:1px solid #333;}' +
      'td{padding:3px;border:1px solid #999;text-align:center;}' +
      'td.name{text-align:left;font-weight:600;}' +
      'td.m-hol{background:#ffcdd2;color:#721c24;}' +
      'td.m-ok{background:#d4edda;}' +
      '</style>';

    let html = '<html><head><title>Attendance — ' + esc(cls) + '</title>' + css + '</head><body>';
    html += '<div class="hdr">';
    html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:52px;">';
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1><div style="font-size:11px;color:#666;">' +
            esc(cls) + ' — ' + esc(data.termLabel) + ' · Printed ' + new Date().toLocaleDateString() +
            '</div></div>';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:52px;">';
    html += '</div>';

    weeksToShow.forEach(function (wk) {
      html += '<h2>Week ' + wk.weekNumber + ' — Ending ' + fmtDateShort_(wk.weekEnding) + '</h2>';
      html += '<table><thead><tr><th>PIN</th><th>Name</th><th>Sex</th><th>Age</th>';
      wk.days.forEach(function (d, i) {
        const span = d.isHoliday ? 2 : 2;
        html += '<th colspan="' + span + '">' + ['Mon','Tue','Wed','Thu','Fri'][i] + '<br>' + fmtDateShort_(d.date) +
                (d.isHoliday ? '<br>' + esc(d.holidayName || 'Holiday') : '') + '</th>';
      });
      html += '<th>Wkly</th></tr><tr><th colspan="4"></th>';
      wk.days.forEach(function (d) {
        if (d.isHoliday) { html += '<th colspan="2" class="m-hol">Holiday</th>'; }
        else { html += '<th>M</th><th>A</th>'; }
      });
      html += '<th></th></tr></thead><tbody>';

      data.learners.forEach(function (l) {
        html += '<tr>';
        html += '<td>' + esc(l.pin || '') + '</td>';
        const g = (l.gender || '').toLowerCase();
        const nc = g.indexOf('female') === 0 ? 'color:#c0392b;' : (g.indexOf('male') === 0 ? 'color:#1a5276;' : '');
        html += '<td class="name" style="' + nc + '">' + esc(l.name || '') + '</td>';
        html += '<td>' + esc(l.gender || '—') + '</td>';
        html += '<td>' + esc(l.age || '—') + '</td>';
        let wkPresent = 0;
        wk.days.forEach(function (d) {
          const mark = (d.marksByLearner || {})[l.id] || 'O O';
          const ma = attMA(mark);
          if (d.isHoliday) {
            html += '<td colspan="2" class="m-hol">—</td>';
          } else {
            html += '<td class="' + (ma.M === '\\' ? 'm-ok' : '') + '">' + ma.M + '</td>';
            html += '<td class="' + (ma.A === '/'  ? 'm-ok' : '') + '">' + ma.A + '</td>';
            if (ma.M === '\\') wkPresent++;
            if (ma.A === '/')  wkPresent++;
          }
        });
        html += '<td><b>' + wkPresent + '</b></td></tr>';
      });
      html += '</tbody></table>';
    });

    html += '</body></html>';
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }

  window.loadAttendanceRegister = loadAttendanceRegister;
  window.attToggleWeek          = attToggleWeek;
  window.attCycleCell           = attCycleCell;
  window.attMarkClassPresent    = attMarkClassPresent;
  window.attSaveAllChanges      = attSaveAllChanges;
  window.attDiscardChanges      = attDiscardChanges;
  window.attOpenPrintDialog     = attOpenPrintDialog;
  window.attClosePrintDialog    = attClosePrintDialog;
  window.attRunPrint            = attRunPrint;
  window.renderClassAnalysisPanel = renderClassAnalysisPanel;
  window.renderSignaturePanel   = renderSignaturePanel;
  window.attSaveSignatures      = attSaveSignatures;
  // ================================================================
  // [S11] STAFF ATTENDANCE
  // ================================================================
  async function initStaffAttendanceTab() {
    const r1 = $('btnRefreshStaffAtt'); if (r1) r1.addEventListener('click', refreshStaffAttendance);
    const r2 = $('btnManualStaffEntry'); if (r2) r2.addEventListener('click', openManualStaffEntryModal);
    const r3 = $('btnViewArchivedMonths'); if (r3) r3.addEventListener('click', loadArchives);
    const r4 = $('btnRunStaffArchive'); if (r4) r4.addEventListener('click', () => showToast('Archive is coming with the API layer', 'info'));
    await refreshStaffAttendance();
  }

  async function refreshStaffAttendance() {
    await loadStaffAttendanceToday();
    await loadMovementLogToday();
    await loadStaffMonthlyCurrent();
    await loadArchiveList();
  }

  async function loadStaffAttendanceToday() {
    setHTML('staffAttList', pageLoaderHTML('Loading staff attendance...'));
    startLoader();
    const r = await window.TIS.listStaffAttendanceToday(todayISO());
    const staffRes = await window.TIS.listStaff();
    stopLoader();
    if (!r.ok || !staffRes.ok) {
      setHTML('staffAttList', emptyHTML('fa-user-clock', 'No records today'));
      return;
    }
    const todayRows = r.data || [];
    const staff = (staffRes.data || []).filter(s => s.status === 'Active');
    const map = {};
    todayRows.forEach(row => { map[row.staff_id] = row; });
    let html = '';
    staff.forEach(s => {
      const row = map[s.id];
      const stateLabel = row ? (row.status || 'Present') : 'Not Marked';
      html += '<div class="staff-card"><div class="sc-info">' +
        '<div class="sc-name">' + esc(s.full_name) + '</div>' +
        '<div class="sc-detail">' + esc(s.department || '') + ' • ID: ' + esc(s.staff_id) + '</div>' +
        '<div class="sc-detail">In: ' + esc(row && row.clock_in ? row.clock_in : '—') +
        ' • Out: ' + esc(row && row.clock_out ? row.clock_out : '—') + '</div>' +
        '</div><div class="sc-badge">' + esc(stateLabel) + '</div></div>';
    });
    setHTML('staffAttList', html || emptyHTML('fa-user-clock', 'No staff records'));
    setHTML('staffAttStats', '');
  }

  async function loadMovementLogToday() {
    setHTML('movementLogList', emptyHTML('fa-route', 'No movements today'));
  }

  async function loadStaffMonthlyCurrent() {
    setHTML('staffMonthlyView', emptyHTML('fa-calendar-day', 'No records this month'));
  }

  function openManualStaffEntryModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Staff Entry</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Staff ID</label><input id="se_staffId" placeholder="e.g. TIS2629"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Action</label><select id="se_action">' +
      '<option value="in">Clock In</option><option value="out">Clock Out</option>' +
      '</select></div></div>' +
      '<div style="text-align:right;margin-top:16px;"><button class="btn btn-success" id="se_submit" type="button">Submit</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    const btn = $('se_submit');
    if (btn) btn.addEventListener('click', submitManualStaffEntry);
  }

  async function submitManualStaffEntry() {
    const staffId = $('se_staffId').value.trim();
    const action = $('se_action').value;
    if (!staffId) { showToast('Enter a staff ID', 'warning'); return; }
    const staffRes = await window.TIS.listStaff();
    if (!staffRes.ok) { showToast('Could not load staff', 'error'); return; }
    const staff = (staffRes.data || []).find(s => s.staff_id === staffId);
    if (!staff) { showToast('Staff not found: ' + staffId, 'error'); return; }
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    startLoader();
    const payload = { staff_id: staff.id, attendance_date: todayISO(), status: 'Present',
                      logged_by: State.profile ? State.profile.name : 'Portal' };
    if (action === 'in')  payload.clock_in  = t;
    if (action === 'out') payload.clock_out = t;
    const r = await window.TIS.upsertStaffAttendance(payload);
    stopLoader();
    if (!r.ok) { showToast(r.error || 'Could not save', 'error'); return; }
    showToast('Recorded at ' + t, 'success');
    closeModal();
  }

  async function loadArchiveList() {
    setHTML('archiveList', emptyHTML('fa-history', 'No archived months yet'));
  }

   // ================================================================
  // [S12] CALENDAR
  // ================================================================
  async function loadCalendar() {
    setHTML('calendarContent', pageLoaderHTML('Loading calendar…'));

    const r = await window.TIS.getCalendar();
    if (!r || !r.ok) {
      setHTML('calendarContent', errorHTML('Could not load calendar', r && r.error));
      return;
    }

    const events = r.data || [];
    if (!events.length) {
      setHTML('calendarContent', emptyHTML('fa-calendar', 'No calendar events yet',
        'Import one from the Calendar Import tab.'));
      return;
    }

    // Group by academic_year, then by term.
    const byYear = {};
    events.forEach(function (e) {
      const y = e.academic_year || 'Unknown';
      if (!byYear[y]) byYear[y] = {};
      const t = e.term_type || 'General';
      if (!byYear[y][t]) byYear[y][t] = [];
      byYear[y][t].push(e);
    });

    const years = Object.keys(byYear).sort().reverse();

    let html = '';
    years.forEach(function (y, yi) {
      const yearEvents = Object.values(byYear[y]).flat();
      const openAttr = yi === 0 ? ' open' : '';
      html += '<details class="cal-year"' + openAttr + ' style="margin-bottom:12px;">';
      html += '<summary style="cursor:pointer;font-weight:700;font-size:15px;' +
              'background:#0d4d26;color:#fff;padding:10px 14px;border-radius:6px;">';
      html += '📅 ' + esc(y) + ' — ' + yearEvents.length + ' events';
      html += '</summary>';

      // Sort term order: 1st, 2nd, 3rd, General
      const termOrder = { '1st': 1, '2nd': 2, '3rd': 3, 'General': 99 };
      const terms = Object.keys(byYear[y]).sort(function (a, b) {
        return (termOrder[a] || 50) - (termOrder[b] || 50);
      });

      terms.forEach(function (t) {
        const list = byYear[y][t].slice().sort(function (a, b) {
          return (a.event_date || '').localeCompare(b.event_date || '');
        });
        html += '<div style="margin:10px 0 4px;font-size:12px;font-weight:700;' +
                'color:#0d4d26;text-transform:uppercase;">' + esc(t) + ' Term</div>';
        html += '<div class="card-bg" style="padding:0;overflow-x:auto;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
        html += '<thead><tr style="background:#f0f0f0;">' +
                '<th style="text-align:left;padding:6px;">Date</th>' +
                '<th style="text-align:left;padding:6px;">Day</th>' +
                '<th style="text-align:left;padding:6px;">Type</th>' +
                '<th style="text-align:left;padding:6px;">Description</th>' +
                '<th style="text-align:center;padding:6px;">Holiday</th>' +
                '</tr></thead><tbody>';
        list.forEach(function (e) {
          const d = new Date((e.event_date || '') + 'T00:00:00');
          const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
          const dateStr = isNaN(d.getTime()) ? e.event_date :
            (d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear());
          const isHoliday = e.is_holiday === true;
          html += '<tr>';
          html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(dateStr) + '</td>';
          html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(e.day_name || '') + '</td>';
          html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(e.event_type || '') + '</td>';
          html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(e.description || '') + '</td>';
          html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' +
                  (isHoliday ? '✅' : '—') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div>';
      });

      html += '</details>';
    });

    setHTML('calendarContent', html);
  }

  function initCalendarTab() {
    const rf = $('btnRefreshCalendar');
    if (rf) rf.addEventListener('click', loadCalendar);
    // Load once on boot if the module is already the active tab.
    if (!$('module-calendar') || !$('module-calendar').classList.contains('hidden')) {
      loadCalendar();
    }
  }
  // ================================================================
  // [S13] CALENDAR IMPORT
  // ================================================================
  async function loadCalendarImportHistory() {
    setHTML('ci_history', emptyHTML('fa-file-import', 'No imports yet'));
  }

  function initCalendarImportTab() {
    const map = {
      btnImportFromDrive: 'Drive import coming with the API layer',
      btnCommitReviewed: 'Commit coming with the API layer',
      btnCommitAll: 'Commit coming with the API layer',
      btnDiscardImport: 'Discard coming with the API layer'
    };
    Object.keys(map).forEach(id => {
      const b = $(id);
      if (b) b.addEventListener('click', () => showToast(map[id], 'info'));
    });
  }

  // ================================================================
  // [S14] QR
  // ================================================================
  async function loadActiveQR() {
    setHTML('qrContent', pageLoaderHTML('Loading QR code...'));
    const r = await window.TIS.getSetting('qr_active_token');
    if (!r.ok || !r.data) {
      setHTML('qrContent', emptyHTML('fa-qrcode', 'No active QR code', 'Generate one to let staff clock in.'));
      return;
    }
    const token = r.data;
    const appUrl = window.location.origin + window.location.pathname;
    const payload = appUrl + '?qrtoken=' + encodeURIComponent(token);
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(payload);
    let html = '<div class="card-bg qr-box"><img src="' + esc(url) + '" alt="QR code">';
    html += '<p style="font-size:11px;margin-top:10px;">Token: <code>' + esc(token) + '</code></p>';
    html += '<div style="margin-top:12px;"><a href="' + esc(url) + '" target="_blank" class="btn btn-primary"><i class="fas fa-download"></i> Download</a></div></div>';
    setHTML('qrContent', html);
  }

  async function generateQR() {
    if (!confirm('Generate a new QR code? The current one stops working.')) return;
    const token = 'QR' + Date.now() + Math.random().toString(36).substring(2, 10);
    startLoader();
    const r1 = await window.TIS.setSetting('qr_active_token', token);
    const r2 = await window.TIS.setSetting('qr_generated_at', new Date().toISOString());
    stopLoader();
    if (!r1.ok || !r2.ok) { showToast('Could not generate QR', 'error'); return; }
    showToast('New QR code generated', 'success');
    loadActiveQR();
  }

  function initQRTab() {
    const r1 = $('btnGenerateQR'); if (r1) r1.addEventListener('click', generateQR);
    const r2 = $('btnShowActiveQR'); if (r2) r2.addEventListener('click', loadActiveQR);
  }

  // ================================================================
  // [S15] REPORTS
  // ================================================================
  function initReportsTab() {
    const btn = $('btnGenerateReport');
    if (btn) btn.addEventListener('click', () => {
      showToast('PDF generation will be handled by the Apps Script bridge.', 'info');
      setText('reportFeedback', 'PDF export will be wired to the Apps Script bridge.');
    });
  }

  // ================================================================
  // [S16] CLASSES
  // ================================================================
  async function loadClasses() {
    setHTML('classesContent', pageLoaderHTML('Loading classes...'));
    const r = await window.TIS.listClasses();
    if (!r.ok) { setHTML('classesContent', errorHTML('Could not load classes', r.error)); return; }
    State.cachedClasses = r.data || [];
    if (!State.cachedClasses.length) {
      setHTML('classesContent', emptyHTML('fa-layer-group', 'No classes yet', 'Click Seed Defaults to create the starting list.'));
      return;
    }
    let html = '<div class="card-bg" style="overflow-x:auto;"><table class="users-table"><thead><tr><th>Class</th><th>Level</th><th>Stream</th><th>Next Class</th><th>Status</th></tr></thead><tbody>';
    State.cachedClasses.forEach(c => {
      html += '<tr><td><strong>' + esc(c.name) + '</strong></td><td>' + esc(c.level || '—') + '</td><td>' +
        esc(c.stream || '—') + '</td><td>' + esc(c.next_class || '—') + '</td><td>' +
        (c.is_active ? '<span style="color:#27ae60;font-weight:600;">Active</span>' : '<span style="color:#c0392b;font-weight:600;">Retired</span>') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    setHTML('classesContent', html);
  }

  function initClassesTab() {
    const r1 = $('btnRefreshClasses');     if (r1) r1.addEventListener('click', loadClasses);
    const r2 = $('btnAddClass');           if (r2) r2.addEventListener('click', openAddClassModal);
    const r3 = $('btnSeedDefaultClasses'); if (r3) r3.addEventListener('click', seedDefaultClasses);
    const r4 = $('btnShowRetiredClasses'); if (r4) r4.addEventListener('click', () => showToast('Retired-class filter coming soon', 'info'));
  }

  function openAddClassModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Add Class</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Class Name</label><input id="ac_name"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Level</label><input id="ac_level"></div>' +
      '<div class="form-group"><label>Stream</label><input id="ac_stream"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Next Class (optional)</label><input id="ac_next"></div></div>' +
      '<div style="text-align:right;"><button class="btn btn-success" id="ac_submit" type="button">Create class</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    const btn = $('ac_submit');
    if (btn) btn.addEventListener('click', async () => {
      const data = {
        name: $('ac_name').value.trim(),
        level: $('ac_level').value.trim(),
        stream: $('ac_stream').value.trim(),
        next_class: $('ac_next').value.trim()
      };
      if (!data.name) { showToast('Enter a class name', 'warning'); return; }
      startLoader();
      const r = await window.TIS.createClass(data);
      stopLoader();
      if (!r.ok) { showToast(r.error || 'Could not create the class', 'error'); return; }
      showToast('Class created', 'success');
      closeModal();
      loadClasses();
    });
  }

  async function seedDefaultClasses() {
    if (!confirm('Seed default classes? Existing classes are not touched.')) return;
    const defaults = [
      { name: 'CRECHE', level: 'CRECHE', next_class: 'STARTERS' },
      { name: 'STARTERS', level: 'STARTERS', next_class: 'BEGINNERS' },
      { name: 'BEGINNERS', level: 'BEGINNERS', next_class: 'NURSERY 1' },
      { name: 'NURSERY 1', level: 'NURSERY 1', next_class: 'NURSERY 2' },
      { name: 'NURSERY 2', level: 'NURSERY 2', next_class: 'NURSERY 3' },
      { name: 'NURSERY 3', level: 'NURSERY 3', next_class: 'PRIMARY 1' },
      { name: 'BASIC 1', level: 'BASIC 1', next_class: 'BASIC 2' },
      { name: 'BASIC 2', level: 'BASIC 2', next_class: 'BASIC 3' },
      { name: 'BASIC 3', level: 'BASIC 3', next_class: 'BASIC 4' },
      { name: 'BASIC 4', level: 'BASIC 4', next_class: 'BASIC 5' },
      { name: 'BASIC 5', level: 'BASIC 5', next_class: 'JSS 1' },
      { name: 'JSS 1', level: 'JSS 1', next_class: 'JSS 2' },
      { name: 'JSS 2', level: 'JSS 2', next_class: 'JSS 3' },
      { name: 'JSS 3', level: 'JSS 3', next_class: 'SS 1 SCIENCE' },
      { name: 'SS 1 SCIENCE', level: 'SS 1', stream: 'SCIENCE', next_class: 'SS 2 SCIENCE' },
      { name: 'SS 1 ART', level: 'SS 1', stream: 'ART', next_class: 'SS 2 ART' },
      { name: 'SS 1 HUMANITIES', level: 'SS 1', stream: 'HUMANITIES', next_class: 'SS 2 HUMANITIES' },
      { name: 'SS 1 BUSINESS', level: 'SS 1', stream: 'BUSINESS', next_class: 'SS 2 BUSINESS' },
      { name: 'SS 2 SCIENCE', level: 'SS 2', stream: 'SCIENCE', next_class: 'SS 3 SCIENCE' },
      { name: 'SS 2 ART', level: 'SS 2', stream: 'ART', next_class: 'SS 3 ART' },
      { name: 'SS 2 HUMANITIES', level: 'SS 2', stream: 'HUMANITIES', next_class: 'SS 3 HUMANITIES' },
      { name: 'SS 2 BUSINESS', level: 'SS 2', stream: 'BUSINESS', next_class: 'SS 3 BUSINESS' },
      { name: 'SS 3 SCIENCE', level: 'SS 3', stream: 'SCIENCE', next_class: 'Graduated' },
      { name: 'SS 3 ART', level: 'SS 3', stream: 'ART', next_class: 'Graduated' },
      { name: 'SS 3 HUMANITIES', level: 'SS 3', stream: 'HUMANITIES', next_class: 'Graduated' },
      { name: 'SS 3 BUSINESS', level: 'SS 3', stream: 'BUSINESS', next_class: 'Graduated' }
    ];
    startLoader();
    let created = 0;
    for (const d of defaults) {
      const r = await window.TIS.createClass(d);
      if (r.ok) created++;
    }
    stopLoader();
    showToast('Seeded ' + created + ' new class(es)', 'success');
    loadClasses();
  }

     // ================================================================
  // [S17] USERS + PERMISSIONS
  // ================================================================
  const PERM_ACTIONS = ['read', 'write', 'print'];
  const __usrExpanded = {};

  async function loadUsers() {
    setHTML('usersContent', pageLoaderHTML('Loading users…'));

    const r = await window.TIS.getPermissionMatrix();
    if (!r || !r.ok) {
      setHTML('usersContent', errorHTML('Could not load users', r && r.error));
      return;
    }
    const data = r.data || {};
    const users = data.users || [];
    const modules = data.modules || [];
    if (!users.length) {
      setHTML('usersContent', emptyHTML('fa-user-cog', 'No users found'));
      return;
    }

    let html = '';
    html += '<div class="card-bg" style="margin-bottom:12px;">';
    html += '<p style="font-size:12px;color:#555;margin:0;">' + users.length +
            ' user(s). Click a row to expand the permission matrix.</p>';
    html += '</div>';
    html += '<div class="card-bg" style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:8px;width:70px;">ID</th>';
    html += '<th style="text-align:left;padding:8px;">Name</th>';
    html += '<th style="text-align:left;padding:8px;width:130px;">Role</th>';
    html += '<th style="text-align:center;padding:8px;width:100px;">Active</th>';
    html += '<th style="text-align:center;padding:8px;width:140px;">Actions</th>';
    html += '</tr></thead><tbody>';

    users.forEach(function (u) {
      const expanded = !!__usrExpanded[u.id];
      const arrow = expanded ? '▾' : '▸';
      html += '<tr class="usr-row" data-uid="' + esc(u.id) + '" style="cursor:pointer;">';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + esc(u.id) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + arrow + ' ' + esc(u.name) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;">' + esc(u.role) + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">' +
              (u.isActive ? '✅' : '—') + '</td>';
      html += '<td style="padding:8px;border-bottom:1px solid #eee;text-align:center;" ' +
              'onclick="event.stopPropagation()">';
      html += '<button type="button" class="btn btn-sm btn-warning" ' +
              'onclick="resetUserPassword(\'' + escAttr(u.id) + '\')">Reset PW</button>';
      html += '</td></tr>';

      if (expanded) {
        html += '<tr><td colspan="5" style="padding:0;border-bottom:2px solid #0d4d26;">';
        html += renderPermEditor(u, modules, PERM_ACTIONS);
        html += '</td></tr>';
      }
    });

    html += '</tbody></table></div>';
    setHTML('usersContent', html);
    wireUsersTable();
  }

  function renderPermEditor(user, modules, actions) {
    const auth = user.authorities || {};
    let h = '';
    h += '<div style="background:#f7fbf7;padding:14px;">';

    h += '<div style="display:flex;justify-content:space-between;align-items:center;' +
         'margin-bottom:8px;flex-wrap:wrap;gap:8px;">';
    h += '<div><b style="color:#0d4d26;">' + esc(user.name) + '</b> ' +
         '<span style="color:#666;font-size:12px;">(' + esc(user.role) + ')</span></div>';
    h += '<div style="display:flex;gap:8px;">';
    h += '<button type="button" class="btn btn-sm btn-secondary" ' +
         'onclick="setAllPerms(\'' + escAttr(user.id) + '\',true)">All On</button>';
    h += '<button type="button" class="btn btn-sm btn-secondary" ' +
         'onclick="setAllPerms(\'' + escAttr(user.id) + '\',false)">All Off</button>';
    h += '<button type="button" class="btn btn-sm btn-success" ' +
         'onclick="saveUserPerms(\'' + escAttr(user.id) + '\')">Save Permissions</button>';
    h += '</div></div>';

    h += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;">';
    h += '<thead><tr style="background:#e8f5e9;">';
    h += '<th style="text-align:left;padding:6px;">Module</th>';
    actions.forEach(function (a) {
      h += '<th style="text-align:center;padding:6px;width:80px;text-transform:capitalize;">' +
           esc(a) + '</th>';
    });
    h += '</tr></thead><tbody>';

    modules.forEach(function (m) {
      h += '<tr>';
      h += '<td style="padding:6px;border-bottom:1px solid #eee;">' + esc(m.label) + '</td>';
      actions.forEach(function (a) {
        const key = a + '_' + m.key;
        const checked = auth[key] ? ' checked' : '';
        h += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">';
        h += '<input type="checkbox" class="usrPermBox" data-uid="' + escAttr(user.id) +
             '" data-key="' + escAttr(key) + '"' + checked + '>';
        h += '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  function wireUsersTable() {
    document.querySelectorAll('.usr-row').forEach(function (row) {
      row.addEventListener('click', function () {
        const uid = row.dataset.uid;
        __usrExpanded[uid] = !__usrExpanded[uid];
        loadUsers();
      });
    });
    document.querySelectorAll('.usrPermBox').forEach(function (box) {
      box.addEventListener('click', function (e) { e.stopPropagation(); });
    });
  }

  window.setAllPerms = function (uid, value) {
    document.querySelectorAll('.usrPermBox[data-uid="' + uid + '"]').forEach(function (b) {
      b.checked = value;
    });
  };

  window.saveUserPerms = async function (uid) {
    const auth = {};
    document.querySelectorAll('.usrPermBox[data-uid="' + uid + '"]').forEach(function (b) {
      auth[b.dataset.key] = !!b.checked;
    });

    startLoader();
    const r = await window.TIS.setUserAuthorities(uid, auth);
    stopLoader();

    if (r && r.ok) {
      showToast('Permissions saved for ' + uid, 'success');
    } else {
      showToast('Could not save: ' + ((r && r.error) || 'unknown'), 'error');
    }
  };

  window.resetUserPassword = function (uid) {
    showToast('Password reset needs an Edge Function. ' +
              'Tell the developer to deploy supabase/functions/reset-password.', 'info');
  };

  function initUsersTab() {
    const rf = $('btnRefreshUsers');
    if (rf) rf.addEventListener('click', loadUsers);
  }
  // ================================================================
  // [S18] PLACEHOLDERS
  // ================================================================
  function initBroadSheetTab() {
    const r1 = $('btnLoadBroadSheet'); if (r1) r1.addEventListener('click', () => showToast('Broad sheet data coming with the API layer', 'info'));
    const r2 = $('btnPopulateBroadSheet'); if (r2) r2.addEventListener('click', () => showToast('Populate coming with the API layer', 'info'));
  }

  // ================================================================
  // [S19] WIRE + BOOT
  // ================================================================
  function wireEventListeners() {
    const loginBtn = $('loginBtn'); if (loginBtn) loginBtn.addEventListener('click', doLogin);
    const pw = $('loginPassword');  if (pw) pw.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    const idIn = $('loginId');      if (idIn) idIn.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

    const eye = $('togglePwBtn');
    if (eye) eye.addEventListener('click', () => {
      const p = $('loginPassword'); if (!p) return;
      p.type = p.type === 'password' ? 'text' : 'password';
    });

    const chp = $('btnChangePassword'); if (chp) chp.addEventListener('click', openChangePasswordModal);
    const lo  = $('btnLogout');         if (lo)  lo.addEventListener('click', doLogout);

    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    initStaffTab();
    initTermsWiring();
    initCalendarTab();
    initCalendarImportTab();
    initQRTab();
    initReportsTab();
    initClassesTab();
    initUsersTab();
  }

  function safetySweep() {
    const ls = $('loadingScreen');
    if (ls) ls.classList.add('hidden');
    const mc = $('modalContainer');
    if (mc && !State.profile) mc.innerHTML = '';
    console.log('[TIS] safety sweep ran at ' + new Date().toISOString());
  }

  function boot() {
    try {
      safetySweep();
      wireEventListeners();
      showLoginScreen();
      console.log('[TIS] app.js booted');
    } catch (err) {
      console.error('[TIS] boot error:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ================================================================
  // [S20] PUBLIC API
  // ================================================================
  window.TIS = window.TIS || {};
  window.TIS.closeModal              = closeModal;
  window.TIS.switchTab               = switchTab;
  window.TIS.login                   = doLogin;
  window.TIS.logout                  = doLogout;
  window.TIS.openChangePasswordModal = openChangePasswordModal;
  window.TIS.toggleExpandable        = toggleExpandable;

})();
  // ================================================================
  // ATTENDANCE — Print dialog (Class / Term / Year / Week)
  // ================================================================
  function attOpenPrintDialog() {
    // Populate class list from learners.
    window.TIS.listLearners().then(function (r) {
      const classes = {};
      ((r && r.ok && r.data) || []).forEach(function (l) {
        if (l.class_name) classes[l.class_name] = true;
      });
      const classNames = Object.keys(classes).sort();

      const termEl = document.getElementById('attendanceTerm');
      const yearEl = document.getElementById('attendanceYear');
      const defTerm = termEl ? termEl.value : '1st';
      const defYear = yearEl ? yearEl.value.trim() : '2026';

      let html = '<div class="modal-overlay" onclick="if(event.target===this)attClosePrintDialog()">';
      html += '<div class="modal-box" style="max-width:460px;" onclick="event.stopPropagation()">';
      html += '<div class="modal-header"><h2>Print Attendance</h2>' +
              '<button class="close-btn" onclick="attClosePrintDialog()">&times;</button></div>';

      html += '<div class="form-group"><label>Class</label><select id="attPrintClass" style="width:100%;">';
      classNames.forEach(function (c) {
        html += '<option value="' + escAttr(c) + '">' + esc(c) + '</option>';
      });
      html += '</select></div>';

      html += '<div class="form-group"><label>Term</label><select id="attPrintTerm" style="width:100%;">';
      ['1st','2nd','3rd'].forEach(function (t) {
        html += '<option value="' + t + '"' + (t === defTerm ? ' selected' : '') + '>' +
                t.toUpperCase() + ' TERM</option>';
      });
      html += '</select></div>';

      html += '<div class="form-group"><label>Year</label><input id="attPrintYear" type="text" value="' + escAttr(defYear) + '"></div>';

      html += '<div class="form-group"><label>Scope</label><select id="attPrintScope" style="width:100%;">';
      html += '<option value="ALL">All weeks (full term)</option>';
      for (let w = 1; w <= 20; w++) {
        html += '<option value="W' + w + '">Week ' + w + '</option>';
      }
      html += '</select></div>';

      html += '<div style="text-align:right;margin-top:14px;">';
      html += '<button class="btn btn-secondary" onclick="attClosePrintDialog()">Cancel</button> ';
      html += '<button class="btn btn-gold" onclick="attRunPrint()">Print</button>';
      html += '</div>';
      html += '</div></div>';
      setHTML('modalContainer', html);
    });
  }

  function attClosePrintDialog() { setHTML('modalContainer', ''); }

  async function attRunPrint() {
    const cls   = document.getElementById('attPrintClass').value;
    const term  = document.getElementById('attPrintTerm').value;
    const year  = document.getElementById('attPrintYear').value.trim();
    const scope = document.getElementById('attPrintScope').value;   // 'ALL' or 'W3' etc.
    attClosePrintDialog();

    startLoader();
    const r = await window.TIS.getAttendanceRegister(cls, term, parseInt(year, 10));
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load register', 'error'); return; }
    const data = r.data;

    let weeksToShow = data.weeks;
    if (scope !== 'ALL') {
      const wn = parseInt(scope.substring(1), 10);
      weeksToShow = data.weeks.filter(function (w) { return w.weekNumber === wn; });
    }

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

    let css = '<style>';
    css += 'body{font-family:Arial;padding:16px;color:#111;}';
    css += '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0b6623;padding-bottom:8px;}';
    css += '.hdr .mid{text-align:center;flex:1;}h1{color:#0b6623;margin:0;font-size:18px;}';
    css += 'h2{font-size:13px;color:#0b6623;margin:12px 0 4px;border-bottom:1px solid #c8e6c9;padding-bottom:3px;}';
    css += 'table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;}';
    css += 'th{background:#0b6623;color:#fff;padding:3px;border:1px solid #333;}';
    css += 'td{padding:3px;border:1px solid #999;text-align:center;}';
    css += 'td.name{text-align:left;font-weight:600;}';
    css += 'td.m-hol{background:#ffcdd2;color:#721c24;}';
    css += 'td.m-m{background:#d4edda;}';
    css += 'td.m-a{background:#d4edda;}';
    css += '</style>';

    let html = '<html><head><title>Attendance — ' + esc(cls) + '</title>' + css + '</head><body>';
    html += '<div class="hdr">';
    html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:52px;">';
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1><div style="font-size:11px;color:#666;">' +
            esc(cls) + ' — ' + esc(data.termLabel) + ' · Printed ' + new Date().toLocaleDateString() +
            '</div></div>';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:52px;">';
    html += '</div>';

    weeksToShow.forEach(function (wk) {
      html += '<h2>Week ' + wk.weekNumber + ' — Ending ' + fmtDateShort_(wk.weekEnding) + '</h2>';
      html += '<table><thead><tr>';
      html += '<th>PIN</th><th>Name</th><th>Sex</th><th>Age</th>';
      wk.days.forEach(function (d, i) {
        html += '<th colspan="2">' + ['Mon','Tue','Wed','Thu','Fri'][i] + '<br>' + fmtDateShort_(d.date) + '</th>';
      });
      html += '<th>Wkly</th></tr><tr><th colspan="4"></th>';
      wk.days.forEach(function () { html += '<th>M</th><th>A</th>'; });
      html += '<th></th></tr></thead><tbody>';

      data.learners.forEach(function (l) {
        html += '<tr>';
        html += '<td>' + esc(l.pin || '') + '</td>';
        const g = (l.gender || '').toLowerCase();
        const nc = g.indexOf('female') === 0 ? 'color:#c0392b;' : (g.indexOf('male') === 0 ? 'color:#1a5276;' : '');
        html += '<td class="name" style="' + nc + '">' + esc(l.name || '') + '</td>';
        html += '<td>' + esc(l.gender || '') + '</td>';
        html += '<td>' + esc(l.age || '') + '</td>';
        let wkPresent = 0;
        wk.days.forEach(function (d) {
          const mark = (d.marksByLearner || {})[l.id] || 'O O';
          const ma = attRenderMasterToMA(mark);
          if (d.isHoliday) {
            html += '<td class="m-hol">—</td><td class="m-hol">—</td>';
          } else {
            html += '<td class="' + (ma.M === '\\' ? 'm-m' : '') + '">' + ma.M + '</td>';
            html += '<td class="' + (ma.A === '/' ? 'm-a' : '') + '">' + ma.A + '</td>';
            if (ma.M === '\\') wkPresent++;
            if (ma.A === '/')  wkPresent++;
          }
        });
        html += '<td><b>' + wkPresent + '</b></td></tr>';
      });
      html += '</tbody></table>';
    });

    html += '</body></html>';
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }

  window.attOpenPrintDialog  = attOpenPrintDialog;
  window.attClosePrintDialog = attClosePrintDialog;
  window.attRunPrint         = attRunPrint;
  window.attSaveSignatures   = attSaveSignatures;

  // Wire the Print button once the DOM is ready.
  document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('btnPrintAttendance');
    if (btn) btn.addEventListener('click', attOpenPrintDialog);
      // ================================================================
  // ATTENDANCE PRINT — wire on tab switch, not on DOMContentLoaded
  // ================================================================
  function ensureAttendancePrintWired() {
    const btn = document.getElementById('btnPrintAttendance');
    if (btn && !btn.__attWired) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        attOpenPrintDialog();
      });
      btn.__attWired = true;
    }
  }

  // Watch nav clicks; every time the user lands on the Attendance tab,
  // make sure the Print button has a listener.
  document.addEventListener('click', function (e) {
    const tab = e.target && e.target.closest ? e.target.closest('.nav-tab') : null;
    if (tab && tab.dataset && tab.dataset.tab === 'attendance') {
      // Tab switch happens synchronously in switchTab; give the DOM a beat.
      setTimeout(ensureAttendancePrintWired, 100);
    }
  });

  // Also try immediately in case the tab is already active on load.
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(ensureAttendancePrintWired, 300);
  });
  });
// ================================================================
// END OF app.js
// ================================================================
