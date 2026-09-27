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
  const EXIT_REASONS = [
    'Completion of Studies',
    'Inability to Pay Tuition',
    'Change of Location',
    'Parent Differences',
    'School Vs Parent Ideology',
    'Discipline / Expulsion',
    'Health Grounds',
    'Life'
  ];

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
  // [S09] TERMS
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
        ? '<span class="card-badge" style="background:#27ae60;color:#fff;">ACTIVE</span>'
        : '';
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
        html += '<button class="btn btn-sm btn-primary" onclick="openPromotionChooser(' + t.id + ')">' +
                'Promote Learners</button>';
        html += '<span style="color:#27ae60;font-weight:700;font-size:12px;align-self:center;">✓ Currently active</span>';
      } else {
        html += '<button class="btn btn-sm btn-success" ' +
                'onclick="activateTerm(' + t.id + ', \'' + escAttr(t.label) + '\')">' +
                'Set Active</button>';
      }
      html += '</div>';
      html += '</div>';
    });

    setHTML('termsList', html);
  }

  async function activateTerm(id, label) {
    if (!confirm('Set "' + label + '" as the active term?\n\nOnly one term can be active at a time.')) return;
    startLoader();
    const r = await window.TIS.setActiveTerm(id);
    stopLoader();
    if (r && r.ok) {
      showToast('Active term set: ' + label, 'success');
      loadTerms();
    } else {
      showToast('Could not set active: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  async function loadArchives() {
    setHTML('archivesList', emptyHTML('fa-box-archive', 'Archives',
      'Archive view will be enabled once learners are migrated.'));
  }

  function initTermsWiring() { /* no-op */ }

  // ================================================================
  // PROMOTION CHOOSER
  // ================================================================
  let promotionState = null;

  async function openPromotionChooser(activeTermId) {
    startLoader();
    const activeR = await window.TIS.getActiveTerm();
    const learnersR = await window.TIS.listLearners();
    const classesR = await window.TIS.listClasses();
    stopLoader();

    if (!activeR || !activeR.ok || !activeR.data) { showToast('No active term', 'error'); return; }
    if (!learnersR || !learnersR.ok) { showToast('Could not load learners', 'error'); return; }
    if (!classesR || !classesR.ok) { showToast('Could not load classes', 'error'); return; }

    const activeTerm = activeR.data;
    const learners = learnersR.data || [];
    const classes = classesR.data || [];

    const nextMap = {};
    classes.forEach(function (c) { nextMap[c.name] = c.next_class || null; });

    const eligible = learners.filter(function (l) {
      if (!l.class_name) return false;
      const w = (l.date_of_withdrawal || '').toString().trim();
      if (w && w !== '' && w !== 'N/A') return false;
      return true;
    });

    promotionState = {
      activeTerm: activeTerm,
      learners: eligible,
      nextMap: nextMap,
      choices: {},
      filter: ''
    };
    eligible.forEach(function (l) { promotionState.choices[l.id] = 'next'; });

    renderPromotionChooser();
  }

  function renderPromotionChooser() {
    if (!promotionState) return;
    const st = promotionState;
    const filter = (st.filter || '').toLowerCase();
    const shown = st.learners.filter(function (l) {
      if (!filter) return true;
      return (l.name || '').toLowerCase().indexOf(filter) !== -1 ||
             (l.pin || '').toLowerCase().indexOf(filter) !== -1 ||
             (l.class_name || '').toLowerCase().indexOf(filter) !== -1;
    });

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closePromotionChooser()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()" style="max-width:900px;">';
    html += '<div class="modal-header">';
    html += '<h2>Promote Learners — ' + esc(st.activeTerm.label) + '</h2>';
    html += '<button class="close-btn" onclick="closePromotionChooser()">&times;</button>';
    html += '</div>';

    html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<input type="text" id="promoFilter" placeholder="Filter by name, PIN, or class…" ' +
            'value="' + escAttr(st.filter) + '" oninput="applyPromotionFilter(this.value)" style="flex:1;min-width:200px;">';
    html += '<button class="btn btn-sm btn-secondary" onclick="setAllPromotionChoices(\'next\')">All Next</button>';
    html += '<button class="btn btn-sm btn-secondary" onclick="setAllPromotionChoices(\'keep\')">All Keep</button>';
    html += '</div>';

    html += '<div style="max-height:55vh;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead style="position:sticky;top:0;background:#0d4d26;color:#fff;z-index:1;">';
    html += '<tr>';
    html += '<th style="text-align:left;padding:6px;">PIN</th>';
    html += '<th style="text-align:left;padding:6px;">Name</th>';
    html += '<th style="text-align:left;padding:6px;">Current</th>';
    html += '<th style="text-align:center;padding:6px;">Action</th>';
    html += '</tr></thead><tbody>';

    shown.forEach(function (l) {
      const current = l.class_name || '';
      const next = st.nextMap[current] || null;
      const choice = st.choices[l.id] || 'next';
      const nextDisabled = !next || next.toLowerCase() === 'graduated';
      const nextLabel = next || '—';

      html += '<tr>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.pin || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.name || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(current) + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">';
      if (nextDisabled) {
        html += '<span style="color:#888;font-size:11px;">Graduated / no next class — will keep</span>';
      } else {
        const nextChecked = choice === 'next' ? ' checked' : '';
        const keepChecked = choice === 'keep' ? ' checked' : '';
        html += '<label style="margin-right:8px;font-size:11px;">';
        html += '<input type="radio" name="promo_' + l.id + '" value="next" ' + nextChecked +
                ' onchange="setPromotionChoice(' + l.id + ',\'next\')"> Next (' + esc(nextLabel) + ')';
        html += '</label>';
        html += '<label style="font-size:11px;">';
        html += '<input type="radio" name="promo_' + l.id + '" value="keep" ' + keepChecked +
                ' onchange="setPromotionChoice(' + l.id + ',\'keep\')"> Keep';
        html += '</label>';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table></div>';

    html += '<div style="margin-top:12px;text-align:right;">';
    html += '<span style="margin-right:12px;font-size:12px;color:#666;">' +
            shown.length + ' learner(s) shown</span>';
    html += '<button class="btn btn-secondary" onclick="closePromotionChooser()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="applyPromotion()">Apply Promotion</button>';
    html += '</div>';

    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function applyPromotionFilter(val) {
    if (!promotionState) return;
    promotionState.filter = val || '';
    renderPromotionChooser();
    setTimeout(function () {
      const inp = document.getElementById('promoFilter');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 0);
  }

  function setPromotionChoice(learnerId, choice) {
    if (!promotionState) return;
    promotionState.choices[learnerId] = choice;
  }

  function setAllPromotionChoices(choice) {
    if (!promotionState) return;
    promotionState.learners.forEach(function (l) { promotionState.choices[l.id] = choice; });
    renderPromotionChooser();
  }

  async function applyPromotion() {
    if (!promotionState) return;
    const st = promotionState;
    const promotions = [];

    st.learners.forEach(function (l) {
      if (st.choices[l.id] === 'keep') return;
      const next = st.nextMap[l.class_name] || null;
      if (!next || next.toLowerCase() === 'graduated') return;
      promotions.push({ learnerId: l.id, newClassName: next });
    });

    if (promotions.length === 0) {
      showToast('Nothing to promote — every learner is marked Keep.', 'info');
      return;
    }

    if (!confirm('Promote ' + promotions.length + ' learner(s) to their next class?\n\n' +
                 'This updates learners.class_name in Supabase.')) return;

    startLoader();
    const r = await window.TIS.promoteLearners(promotions);
    stopLoader();

    if (r && r.ok) {
      showToast('Promoted ' + r.data.applied + ' learner(s).', 'success');
      closePromotionChooser();
      loadLearners();
    } else {
      showToast('Promotion failed: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  function closePromotionChooser() {
    promotionState = null;
    setHTML('modalContainer', '');
  }

  window.activateTerm = activateTerm;
  window.openPromotionChooser = openPromotionChooser;
  window.applyPromotionFilter = applyPromotionFilter;
  window.setPromotionChoice = setPromotionChoice;
  window.setAllPromotionChoices = setAllPromotionChoices;
  window.applyPromotion = applyPromotion;
  window.closePromotionChooser = closePromotionChooser;
  // ================================================================
  // [S10] LEARNER ATTENDANCE
  // ================================================================
  async function initLearnerAttendanceTab() {
    await populateAttendanceClasses();
    const btn = $('btnLoadAttendance'); if (btn) btn.addEventListener('click', loadAttendanceTerm);
    const gen = $('btnGenerateAttendance'); if (gen) gen.addEventListener('click', () => showToast('Generate is coming with the API layer', 'info'));
    const pr  = $('btnPrintAttendance');  if (pr)  pr.addEventListener('click', () => showToast('Print is coming with the API layer', 'info'));
  }

  async function populateAttendanceClasses() {
    const sel = $('attendanceClass');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select --</option>';
    const r = await window.TIS.listClasses();
    if (!r.ok) return;
    State.cachedClasses = r.data || [];
    State.cachedClasses.forEach(c => {
      sel.innerHTML += '<option value="' + escAttr(c.id) + '" data-name="' + escAttr(c.name) + '">' + esc(c.name) + '</option>';
    });
  }

  async function loadAttendanceTerm() {
    const sel = $('attendanceClass');
    const clsId = sel ? sel.value : '';
    const clsName = sel && sel.selectedIndex >= 0 ? (sel.options[sel.selectedIndex].dataset.name || '') : '';
    const term = $('attendanceTerm').value;
    const year = $('attendanceYear').value.trim();
    if (!clsId) { showToast('Select a class first', 'warning'); return; }

    setHTML('attendanceTermView', pageLoaderHTML('Loading register...'));
    startLoader();
    const termRes = await window.TIS.listTerms();
    const termRow = (termRes.ok ? termRes.data : []).find(t => t.term_type === term && String(t.year) === year);
    if (!termRow) {
      stopLoader();
      setHTML('attendanceTermView', errorHTML('Term not found', term + ' TERM ' + year));
      return;
    }
    const r = await window.TIS.listAttendanceForClassTerm(clsId, termRow.id);
    stopLoader();
    if (!r.ok) { setHTML('attendanceTermView', errorHTML('Could not load register', r.error)); return; }
    const rows = r.data || [];
    const learnersRes = await window.TIS.searchLearners('');
    const learnersInClass = (learnersRes.ok ? learnersRes.data : []).filter(l => l.class_id === clsId);
    if (!learnersInClass.length) {
      setHTML('attendanceTermView', emptyHTML('fa-user-slash', 'No learners in ' + clsName));
      return;
    }
    const byDate = {};
    rows.forEach(m => {
      if (!byDate[m.attendance_date]) byDate[m.attendance_date] = {};
      byDate[m.attendance_date][m.learner_id] = m.mark;
    });
    const dates = Object.keys(byDate).sort();
    let html = '<div class="card-bg" style="overflow-x:auto;"><table class="attendance-table"><thead><tr><th>PIN</th><th>Name</th>';
    dates.forEach(d => { html += '<th class="day-header">' + esc(d) + '</th>'; });
    html += '</tr></thead><tbody>';
    learnersInClass.forEach(l => {
      const g = (l.gender || '').toLowerCase();
      const cls = g.indexOf('female') === 0 ? 'name-cell female' : (g.indexOf('male') === 0 ? 'name-cell male' : 'name-cell');
      html += '<tr><td>' + esc(l.pin) + '</td><td class="' + cls + '">' + esc(l.name) + '</td>';
      dates.forEach(d => {
        const mark = (byDate[d] && byDate[d][l.id]) || 'O O';
        html += '<td class="locked-cell">' + esc(mark) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('attendanceTermView', html);
  }

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
// END OF app.js
// ================================================================
