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

  function closeModal() {
    // Aggressively remove every overlay that might be stacked.
    document.querySelectorAll('.modal-overlay').forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    const mc = document.getElementById('modalContainer');
    if (mc) mc.innerHTML = '';
  }
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
  // Single canonical implementation. Contains:
  //   • module-scope constants (CONTACT_LABELS, RELIGION_OPTIONS, EXIT_REASONS)
  //   • three-tier view modal (A: all, B: admin+, C: super_admin only)
  //   • edit modal with class / religion / gender dropdowns + date picker
  //   • part-payment recording
  //   • print (A4 + 80mm) with section chooser
  //   • add learner, bulk upload, template download
  //   • live search + keyboard shortcuts
  // ================================================================

  // ---------- Module-scope constants ----------
  const CONTACT_LABELS  = { father: 'Father', mother: 'Mother', guardian: 'Guardian' };
  const RELIGION_OPTIONS = ['Christianity', 'Islam', 'Traditionalist'];
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

  // ---------- Populate the Terms-tab exit-reason dropdown ----------
  (function populateExitReasons() {
    function fill() {
      const sel = document.getElementById('exitReasonSelect');
      if (!sel) return;
      if (sel.options.length > 0 && sel.options[0].value !== '') return;
      sel.innerHTML = '';
      EXIT_REASONS.forEach(function (r) {
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
    document.addEventListener('click', function (e) {
      if (e.target && e.target.matches && e.target.matches('.nav-tab[data-tab="terms"]')) {
        setTimeout(fill, 300);
      }
    });
  })();

  // ---------- Small helpers (module-scope, used across learners) ----------
  function parseNum(v) {
    if (v === null || v === undefined || v === '') return 0;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function moneyOrDash(v) {
    if (v === null || v === undefined || v === '') return '—';
    const s = String(v);
    if (/^[₦$]/.test(s)) return s;
    return '₦' + parseNum(s).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  function isoToDateInput(v) {
    if (!v) return '';
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
    const d = new Date(s);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function isAdmin()      { return !!(State.profile && (State.profile.role === 'admin' || State.profile.role === 'super_admin')); }
  function isSuperAdmin() { return !!(State.profile && State.profile.role === 'super_admin'); }

  function contactOrderOf(learner) {
    const p1 = (learner.contact_priority_1 || '').toLowerCase();
    const p2 = (learner.contact_priority_2 || '').toLowerCase();
    const p3 = (learner.contact_priority_3 || '').toLowerCase();
    const chosen = [p1, p2, p3].filter(function (x) { return CONTACT_LABELS[x]; });
    const remaining = ['father', 'mother', 'guardian'].filter(function (x) { return chosen.indexOf(x) === -1; });
    return chosen.concat(remaining).slice(0, 3);
  }
  function phoneFor(learner, slot) {
    const role = contactOrderOf(learner)[slot - 1];
    if (!role) return { role: null, label: '—', value: '—' };
    let value = '—';
    if (role === 'father')   value = learner.father_phone   || '—';
    if (role === 'mother')   value = learner.mother_phone   || '—';
    if (role === 'guardian') value = learner.guardian_phone || '—';
    return { role: role, label: CONTACT_LABELS[role], value: value };
  }
  function infoRow(label, value) {
    const v = (value !== undefined && value !== null && value !== '') ? esc(value) : '—';
    return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + v + '</span></div>';
  }

  // ---------- Class list cache (for dropdowns) ----------
  let __learnerClassesCache = null;
  async function getClassNamesForDropdown() {
    if (__learnerClassesCache) return __learnerClassesCache;
    const r = await window.TIS.listClasses();
    if (r && r.ok && r.data) {
      __learnerClassesCache = r.data
        .filter(function (c) { return c.is_active !== false; })
        .map(function (c) { return c.name; })
        .sort();
    } else {
      __learnerClassesCache = [];
    }
    return __learnerClassesCache;
  }

  // ================================================================
  // Load & render the grid
  // ================================================================
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

  // ================================================================
  // View modal — three-tier permission gating
  //   A: everyone
  //   B: admin / super_admin
  //   C: super_admin only
  // ================================================================
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

    const tuition     = parseNum(termRow && termRow.tuition);
    const scholarship = parseNum(termRow && termRow.scholarship);
    const otherMajor  = parseNum(termRow && termRow.other_bills_major);
    const otherMinor  = parseNum(termRow && termRow.other_bills_minor);
    const books       = parseNum(termRow && termRow.books);
    const netBills    = tuition + otherMajor + otherMinor + books;
    const adjusted    = tuition - scholarship;

    let ppRows = '';
    if (termRow) {
      for (let n = 1; n <= 5; n++) {
        const dt = termRow['part_payment_' + n + '_date'];
        const am = termRow['part_payment_' + n + '_amount'];
        if ((!dt || dt === '') && (!am || am === '')) continue;
        ppRows += '<div class="info-row" style="background:#f7fbf7;">' +
                  '<span class="info-label">Part Payment ' + n + '</span>' +
                  '<span class="info-value">' + fmtDateOrDash(dt) + ' — ' + moneyOrDash(am) + '</span></div>';
      }
    }

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeLearnerModal()">';
    html += '<div class="modal-box wide lbModal" onclick="event.stopPropagation()">';

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
    html += '<button type="button" class="btn btn-sm btn-secondary" onclick="toggleKeysHelp()" title="Keyboard shortcuts">?</button>';
    html += '<button type="button" class="close-btn" onclick="closeLearnerModal()" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;margin-left:8px;">&times;</button>';
    html += '</div></div>';

    html += '<div id="lbKeysHelp" style="display:none;background:#e8f5e9;padding:6px 18px;font-size:11px;color:#0d4d26;border-bottom:1px solid #c8e6c9;">';
    html += '<b>E</b> expand all · <b>C</b> collapse all · <b>P</b> print · <b>Esc</b> close';
    html += '</div>';

    html += '<div style="padding:14px 18px;" id="lbModalBody">';

    if (canA) {
      html += '<div class="expandable open lbSec"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section A — Identity</div><div class="expandable-body">';
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

    if (canB) {
      html += '<div class="expandable open lbSec"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section B — Fees (' + esc(termLabel) + ')</div><div class="expandable-body">';
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

    if (canC) {
      html += '<div class="expandable open lbSec"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section C — History & Origin</div><div class="expandable-body">';
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

  function closeLearnerModal() { closeModal(); }
  window.toggleKeysHelp = function () {
    const el = document.getElementById('lbKeysHelp');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  // ================================================================
  // Edit modal — dropdowns for class / gender / religion,
  //              native date picker for DOB
  // ================================================================
  async function openLearnerEditModal(pin) {
    closeModal();
    startLoader();
    const r = await window.TIS.getLearnerByPin(pin);
    if (!r || !r.ok || !r.data) {
      stopLoader();
      showToast('Could not load learner ' + pin, 'error');
      return;
    }
    const d = r.data;
    const order = contactOrderOf(d);
    const classNames = await getClassNamesForDropdown();
    stopLoader();

    const textField = function (id, label, value, type) {
      const t = type || 'text';
      return '<div class="form-group"><label>' + esc(label) + '</label>' +
             '<input id="' + id + '" type="' + t + '" value="' + escAttr(value || '') + '"></div>';
    };
    const classField = function (id, label, value) {
      let opts = '<option value="">— Select class —</option>';
      classNames.forEach(function (c) {
        opts += '<option value="' + escAttr(c) + '"' + (c === value ? ' selected' : '') + '>' + esc(c) + '</option>';
      });
      if (value && classNames.indexOf(value) === -1) {
        opts += '<option value="' + escAttr(value) + '" selected>' + esc(value) + '</option>';
      }
      return '<div class="form-group"><label>' + esc(label) + '</label><select id="' + id + '">' + opts + '</select></div>';
    };
    const religionField = function (id, label, value) {
      let opts = '<option value="">— Select —</option>';
      RELIGION_OPTIONS.forEach(function (rel) {
        opts += '<option value="' + escAttr(rel) + '"' + (rel === value ? ' selected' : '') + '>' + esc(rel) + '</option>';
      });
      if (value && RELIGION_OPTIONS.indexOf(value) === -1) {
        opts += '<option value="' + escAttr(value) + '" selected>' + esc(value) + '</option>';
      }
      return '<div class="form-group"><label>' + esc(label) + '</label><select id="' + id + '">' + opts + '</select></div>';
    };
    const genderField = function (id, label, value) {
      const opts = ['', 'Male', 'Female'].map(function (g) {
        return '<option value="' + g + '"' + (g === value ? ' selected' : '') + '>' + (g || '—') + '</option>';
      }).join('');
      return '<div class="form-group"><label>' + esc(label) + '</label><select id="' + id + '">' + opts + '</select></div>';
    };
    const phoneField = function (id, label, value, slotIndex) {
      const current = order[slotIndex - 1] || '';
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

    html += '<div class="form-row">' + textField('ed_name', 'Name', d.name) + classField('ed_class_name', 'Class', d.class_name) + '</div>';
    html += '<div class="form-row">' + genderField('ed_gender', 'Gender', d.gender) + textField('ed_date_of_birth', 'Date of Birth', isoToDateInput(d.date_of_birth), 'date') + '</div>';

    html += '<div style="background:#f7fbf7;padding:10px;border-radius:8px;margin:8px 0;">';
    html += '<div style="font-weight:700;font-size:12px;color:#0d4d26;margin-bottom:6px;">Contact priority — which number is 1st, 2nd, 3rd</div>';
    html += phoneField('ed_prio_father',   "Father's phone",   d.father_phone,   1);
    html += phoneField('ed_prio_mother',   "Mother's phone",   d.mother_phone,   2);
    html += phoneField('ed_prio_guardian', "Guardian's phone", d.guardian_phone, 3);
    html += '</div>';

    html += '<div class="form-row">' + textField('ed_account_number', 'Account Number', d.account_number) + textField('ed_blood_group', 'Blood Group / Genotype', d.blood_group) + '</div>';
    html += '<div class="form-row">' + religionField('ed_religion', 'Religion', d.religion) + textField('ed_allergy', 'Allergy', d.allergy) + '</div>';
    html += textField('ed_parents_name', 'Parents Name', d.parents_name);
    html += '<div class="form-group"><label>Address</label><textarea id="ed_address" rows="2">' + esc(d.address || '') + '</textarea></div>';
    html += '<div class="form-row">' +
      textField('ed_state_of_origin', 'State of Origin', d.state_of_origin) +
      textField('ed_lga_of_origin',   'LGA of Origin',   d.lga_of_origin) + '</div>';
    html += '<div class="form-row">' +
      textField('ed_state_of_birth', 'State of Birth', d.state_of_birth) +
      textField('ed_lga_of_birth',   'LGA of Birth',   d.lga_of_birth) + '</div>';
    html += textField('ed_lin', 'LIN', d.lin);

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
    const get = function (fid) { const el = document.getElementById(fid); return el ? String(el.value || '').trim() : ''; };
    const fields = {
      name:             get('ed_name'),
      class_name:       get('ed_class_name'),
      gender:           get('ed_gender'),
      date_of_birth:    get('ed_date_of_birth'),
      father_phone:     get('ed_prio_father'),
      mother_phone:     get('ed_prio_mother'),
      guardian_phone:   get('ed_prio_guardian'),
      account_number:   get('ed_account_number'),
      blood_group:      get('ed_blood_group'),
      religion:         get('ed_religion'),
      allergy:          get('ed_allergy'),
      parents_name:     get('ed_parents_name'),
      address:          get('ed_address'),
      state_of_origin:  get('ed_state_of_origin'),
      lga_of_origin:    get('ed_lga_of_origin'),
      state_of_birth:   get('ed_state_of_birth'),
      lga_of_birth:     get('ed_lga_of_birth'),
      lin:              get('ed_lin'),
      exit_reason:      get('ed_exit_reason')
    };
    const p1 = get('ed_prio_father_who');
    const p2 = get('ed_prio_mother_who');
    const p3 = get('ed_prio_guardian_who');

    startLoader();
    const r = await window.TIS.updateLearner(id, fields);
    if (r && r.ok) {
      await window.TIS.setLearnerContactPriority(id, { p1: p1, p2: p2, p3: p3 });
    }
    stopLoader();
    if (r && r.ok) { showToast('Learner updated', 'success'); closeModal(); loadLearners(); }
    else showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
  }

  // ================================================================
  // Add learner
  // ================================================================
  async function openAddLearnerModal() {
    const classNames = await getClassNamesForDropdown();
    let classOpts = '<option value="">— Select class —</option>';
    classNames.forEach(function (c) { classOpts += '<option value="' + escAttr(c) + '">' + esc(c) + '</option>'; });

    let relOpts = '<option value="">— Select —</option>';
    RELIGION_OPTIONS.forEach(function (rel) { relOpts += '<option value="' + escAttr(rel) + '">' + esc(rel) + '</option>'; });

    const f = function (id, label, value, type) {
      const t = type || 'text';
      return '<div class="form-group"><label>' + esc(label) + '</label>' +
             '<input id="' + id + '" type="' + t + '" value="' + escAttr(value || '') + '"></div>';
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Add New Learner</h2><button class="close-btn" onclick="closeModal()">&times;</button></div>';

    html += '<div class="form-row">' + f('nl_pin', 'PIN', '') + f('nl_name', 'Learner Name', '') + '</div>';
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Class</label><select id="nl_class_name">' + classOpts + '</select></div>' +
      '<div class="form-group"><label>Gender</label><select id="nl_gender"><option value="">—</option><option>Male</option><option>Female</option></select></div>' +
      '</div>';
    html += '<div class="form-row">' + f('nl_date_of_birth', 'Date of Birth', '', 'date') + f('nl_blood_group', 'Blood Group / Genotype', '') + '</div>';
    html += '<div class="form-row">' + f('nl_father_phone', "Father's Phone", '') + f('nl_mother_phone', "Mother's Phone", '') + '</div>';
    html += '<div class="form-row">' + f('nl_guardian_phone', "Guardian's Phone", '') + f('nl_account_number', 'Account Number', '') + '</div>';
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Religion</label><select id="nl_religion">' + relOpts + '</select></div>' +
      f('nl_allergy', 'Allergy', '') + '</div>';
    html += f('nl_parents_name', 'Parents Name', '');
    html += '<div class="form-group"><label>Address</label><textarea id="nl_address" rows="2"></textarea></div>';
    html += '<div class="form-row">' + f('nl_state_of_origin', 'State of Origin', '') + f('nl_lga_of_origin', 'LGA of Origin', '') + '</div>';
    html += '<div class="form-row">' + f('nl_state_of_birth', 'State of Birth', '') + f('nl_lga_of_birth', 'LGA of Birth', '') + '</div>';
    html += f('nl_lin', 'LIN', '');

    html += '<div style="text-align:right;margin-top:14px;">';
    html += '<button class="btn btn-secondary" onclick="closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="submitNewLearner()">Add learner</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function submitNewLearner() {
    const get = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };
    const row = {
      pin:             get('nl_pin'),
      name:            get('nl_name'),
      class_name:      get('nl_class_name'),
      gender:          get('nl_gender'),
      date_of_birth:   get('nl_date_of_birth'),
      blood_group:     get('nl_blood_group'),
      father_phone:    get('nl_father_phone'),
      mother_phone:    get('nl_mother_phone'),
      guardian_phone:  get('nl_guardian_phone'),
      account_number:  get('nl_account_number'),
      religion:        get('nl_religion'),
      allergy:         get('nl_allergy'),
      parents_name:    get('nl_parents_name'),
      address:         get('nl_address'),
      state_of_origin: get('nl_state_of_origin'),
      lga_of_origin:   get('nl_lga_of_origin'),
      state_of_birth:  get('nl_state_of_birth'),
      lga_of_birth:    get('nl_lga_of_birth'),
      lin:             get('nl_lin')
    };
    if (!row.pin || !row.name) { showToast('PIN and Name are required', 'warning'); return; }

    startLoader();
    const existing = await window.TIS.getLearnerByPin(row.pin);
    if (existing && existing.ok && existing.data) {
      stopLoader();
      showToast('PIN ' + row.pin + ' already exists', 'error');
      return;
    }
    const r = await window.TIS.createLearner(row);
    stopLoader();
    if (r && r.ok) {
      showToast('Learner added: ' + row.name, 'success');
      closeModal();
      loadLearners();
    } else {
      showToast('Could not add: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // Part payment
  // ================================================================
  async function openPartPaymentModal(learnerId) {
    closeModal();
    startLoader();
    const r = await window.TIS.getLearnerTermForActive(learnerId);
    stopLoader();
    if (!r || !r.ok || !r.data.term) { showToast('No active term set', 'error'); return; }
    const term = r.data.term;
    const row  = r.data.row;

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeLearnerModal()">';
    html += '<div class="modal-box" style="max-width:440px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Update Payment</h2><button class="close-btn" onclick="closeLearnerModal()">&times;</button></div>';
    html += '<p style="font-size:12px;margin:0 0 10px;">' + esc(term.label) + '</p>';
    if (row) {
      html += '<p style="font-size:12px;margin:0 0 10px;">' +
              'Bill: ' + moneyOrDash(row.bill) +
              ' · Other: ' + moneyOrDash(row.other_bill) +
              ' · Paid: ' + moneyOrDash(row.total_part_payment) +
              ' · Balance: ' + moneyOrDash(row.balance_cf) + '</p>';
    }
    html += '<div class="form-group"><label>Amount Paid (₦)</label><input id="pp_amount" type="number" step="0.01" placeholder="0.00"></div>';
    html += '<div class="form-group"><label>Date</label><input id="pp_date" type="date" value="' + new Date().toISOString().slice(0,10) + '"></div>';
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
      closeModal();
      const l = State.cachedLearners.find(function (x) { return x.id === learnerId; });
      if (l) openLearnerViewModal(l.pin);
    } else {
      showToast('Could not record: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  // ================================================================
  // Print — A4 or 80mm, section chooser
  // ================================================================
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
    if (paper === 'A4') html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:60px;">';
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1>' +
            (paper === 'A4' ? '<div style="font-style:italic;color:#666;font-size:12px;">Scientia est potentia</div>' : '') +
            '</div>';
    if (paper === 'A4') html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:60px;">';
    html += '</div>';
    html += '<h2 style="margin-top:14px;">' + esc(d.name) + ' — ' + esc(d.pin) + '</h2>';
    html += '<div style="font-size:11px;color:#666;margin-bottom:8px;">Class: ' + esc(d.class_name) + ' · Active Term: ' + esc(termLabel) + '</div>';

    const rowFn = function (label, value) {
      return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value) + '</span></div>';
    };

    if (wantA) {
      html += '<h2>Section A — Identity</h2>';
      html += rowFn('Class', d.class_name || '—');
      html += rowFn('PIN', d.pin || '—');
      html += rowFn('Name', d.name || '—');
      html += rowFn('Gender', d.gender || '—');
      html += rowFn('1st Phone (' + ph1.label + ')', ph1.value);
      html += rowFn('Account', d.account_number || '—');
      html += rowFn('Clearance', (termRow && termRow.cleared) || '—');
      html += rowFn('Clearance Date', (termRow && fmtDateOrDash(termRow.clearance)) || '—');
      html += rowFn('Balance C/F', termRow ? moneyOrDash(termRow.balance_cf) : '—');
    }
    if (wantB) {
      html += '<h2>Section B — Fees (' + termLabel + ')</h2>';
      html += rowFn('Tuition', moneyOrDash(termRow && termRow.tuition));
      html += rowFn('Scholarship', moneyOrDash(termRow && termRow.scholarship));
      html += rowFn('Adjusted Tuition', moneyOrDash(adjusted));
      if (termRow) {
        for (let n = 1; n <= 5; n++) {
          const dt = termRow['part_payment_' + n + '_date'];
          const am = termRow['part_payment_' + n + '_amount'];
          if ((!dt || dt === '') && (!am || am === '')) continue;
          html += rowFn('Part Payment ' + n, (dt ? fmtDateOrDash(dt) : '—') + ' — ' + moneyOrDash(am));
        }
      }
      html += rowFn('Other Bills Major', moneyOrDash(termRow && termRow.other_bills_major));
      html += rowFn('Books', moneyOrDash(termRow && termRow.books));
      html += rowFn('Balance B/F', moneyOrDash(termRow && termRow.balance_bf));
      html += rowFn('Net Bills', moneyOrDash(netBills));
      html += rowFn('Other Bills Minor', moneyOrDash(termRow && termRow.other_bills_minor));
      html += rowFn('Blood Group / Genotype', d.blood_group || '—');
      html += rowFn('Allergy', d.allergy || '—');
      html += rowFn('2nd Phone (' + ph2.label + ')', ph2.value);
    }
    if (wantC) {
      html += '<h2>Section C — History & Origin</h2>';
      html += rowFn('Class Before Admission', d.class_before_admission || '—');
      html += rowFn('Date of Admission', d.date_of_admission || '—');
      html += rowFn('Class Admitted Into', d.class_admitted_into || '—');
      html += rowFn('LIN', d.lin || '—');
      html += rowFn('Exit Class', d.class_at_withdrawal || '—');
      html += rowFn('Exit Reason', d.exit_reason || '—');
      html += rowFn('Religion', d.religion || '—');
      html += rowFn('Date of Birth', d.date_of_birth || '—');
      html += rowFn('Parents Name', d.parents_name || '—');
      html += rowFn('Address', d.address || '—');
      html += rowFn('State of Origin', d.state_of_origin || '—');
      html += rowFn('LGA of Origin', d.lga_of_origin || '—');
      html += rowFn('State of Birth', d.state_of_birth || '—');
      html += rowFn('LGA of Birth', d.lga_of_birth || '—');
      html += rowFn('3rd Phone (' + ph3.label + ')', ph3.value);
    }

    html += '</body></html>';
    w.document.write(html); w.document.close();
    setTimeout(function () { w.print(); }, 250);
    closeModal();
  }

  // ================================================================
  // Live search
  // ================================================================
  let learnerSearchTimer = null;
  function learnerLiveSearch() {
    if (learnerSearchTimer) clearTimeout(learnerSearchTimer);
    learnerSearchTimer = setTimeout(function () {
      const el = document.getElementById('learnerSearchInput');
      const q = el ? el.value.trim() : '';
      if (!q) { renderLearners(State.cachedLearners); return; }
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

  document.addEventListener('DOMContentLoaded', function () {
    const inp = document.getElementById('learnerSearchInput');
    if (inp && !inp.__wired) { inp.addEventListener('input', learnerLiveSearch); inp.__wired = true; }
  });

  // Keyboard shortcuts inside the view modal
  document.addEventListener('keydown', function (e) {
    const modalBody = document.getElementById('lbModalBody');
    if (!modalBody) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { closeLearnerModal(); e.preventDefault(); return; }
    if (k === 'e') { document.querySelectorAll('.lbSec').forEach(function (s) { s.classList.add('open'); }); e.preventDefault(); }
    else if (k === 'c') { document.querySelectorAll('.lbSec').forEach(function (s) { s.classList.remove('open'); }); e.preventDefault(); }
    else if (k === 'p') {
      if (hasPermission('print_learners')) {
        const btn = modalBody.parentElement.querySelector('.btn-gold');
        if (btn) btn.click();
      }
      e.preventDefault();
    }
  });

  // ================================================================
  // Toolbar wiring
  // ================================================================
  function initLearnersTab() {
    const refresh = document.getElementById('btnRefreshLearners');
    if (refresh && !refresh.__wired) { refresh.addEventListener('click', function (e) { e.preventDefault(); loadLearners(); }); refresh.__wired = true; }

    const printBtn = document.getElementById('btnPrintLearners');
    if (printBtn && !printBtn.__wired) { printBtn.addEventListener('click', function (e) { e.preventDefault(); printLearnerList(); }); printBtn.__wired = true; }

    const dl = document.getElementById('btnDownloadTemplate');
    if (dl && !dl.__wired) { dl.addEventListener('click', function (e) { e.preventDefault(); downloadLearnerTemplate(); }); dl.__wired = true; }

    const upBtn = document.getElementById('btnUploadUpdates');
    const upFile = document.getElementById('learnerUploadFile');
    if (upBtn && upFile && !upBtn.__wired) {
      upBtn.addEventListener('click', function (e) { e.preventDefault(); upFile.click(); });
      upFile.addEventListener('change', function (ev) { const f = ev.target.files[0]; if (f) uploadLearnerUpdates(f); upFile.value = ''; });
      upBtn.__wired = true;
    }

    const add = document.getElementById('btnAddLearner');
    if (add && !add.__wired) { add.addEventListener('click', function (e) { e.preventDefault(); openAddLearnerModal(); }); add.__wired = true; }
  }

  // ================================================================
  // Excel template download + upload
  // ================================================================
  function downloadLearnerTemplate() {
    if (typeof XLSX === 'undefined') { showToast('Excel library not loaded — reload the page', 'error'); return; }
    const columns = [
      'PIN','LEARNERS NAME','CLASS','GENDER','DATE OF BIRTH',
      'FATHERS PHONE NUMBER','MOTHERS PHONE NUMBER','GUARDIAN PHONE NUMBER',
      'ACCOUNT NUMBER','BLOOD GROUP','RELIGION','ALLERGY',
      'PARENTS NAME','ADDRESS','STATE OF ORIGIN','LGA OF ORIGIN',
      'STATE OF BIRTH','LGA OF BIRTH','LIN'
    ];
    const sample = [{
      'PIN': 'TIS0001', 'LEARNERS NAME': 'SAMPLE LEARNER', 'CLASS': 'JSS 1', 'GENDER': 'Male',
      'DATE OF BIRTH': '2015-01-01', 'FATHERS PHONE NUMBER': '08000000000',
      'RELIGION': 'Islam'
    }];
    const ws = XLSX.utils.json_to_sheet(sample, { header: columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Learners');
    XLSX.writeFile(wb, 'TIS_Learners_Template_' + new Date().toISOString().slice(0, 10) + '.xlsx');
    showToast('Template downloaded', 'success');
  }

  async function uploadLearnerUpdates(file) {
    if (typeof XLSX === 'undefined') { showToast('Excel library not loaded — reload the page', 'error'); return; }
    if (!confirm('Upload "' + file.name + '"?\n\nRows matching an existing PIN will be updated. New PINs will be created.')) return;
    startLoader();
    let wb;
    try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array' }); }
    catch (e) { stopLoader(); showToast('Could not read the file', 'error'); return; }
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) { stopLoader(); showToast('No rows in that sheet', 'warning'); return; }

    const FIELD_MAP = {
      'PIN': 'pin', 'LEARNERS NAME': 'name', 'CLASS': 'class_name', 'GENDER': 'gender',
      'DATE OF BIRTH': 'date_of_birth',
      'FATHERS PHONE NUMBER': 'father_phone', 'MOTHERS PHONE NUMBER': 'mother_phone',
      'GUARDIAN PHONE NUMBER': 'guardian_phone', 'ACCOUNT NUMBER': 'account_number',
      'BLOOD GROUP': 'blood_group', 'RELIGION': 'religion', 'ALLERGY': 'allergy',
      'PARENTS NAME': 'parents_name', 'ADDRESS': 'address',
      'STATE OF ORIGIN': 'state_of_origin', 'LGA OF ORIGIN': 'lga_of_origin',
      'STATE OF BIRTH': 'state_of_birth', 'LGA OF BIRTH': 'lga_of_birth',
      'LIN': 'lin'
    };

    let updated = 0, created = 0, failed = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const pin = String(row['PIN'] || '').trim();
      if (!pin) { failed++; errors.push('Row ' + (i + 2) + ': no PIN'); continue; }
      const patch = {};
      Object.keys(FIELD_MAP).forEach(function (col) {
        if (row[col] !== undefined && row[col] !== '') patch[FIELD_MAP[col]] = String(row[col]).trim();
      });
      if (!Object.keys(patch).length) { failed++; continue; }

      const existing = await window.TIS.getLearnerByPin(pin);
      if (existing && existing.ok && existing.data) {
        const r = await window.TIS.updateLearner(existing.data.id, patch);
        if (r && r.ok) updated++; else { failed++; errors.push(pin); }
      } else {
        const r = await window.TIS.createLearner(patch);
        if (r && r.ok) created++; else { failed++; errors.push(pin); }
      }
    }
    stopLoader();
    const msg = 'Updated ' + updated + ' · Created ' + created + ' · Failed ' + failed;
    if (failed === 0) showToast(msg, 'success');
    else { showToast(msg + ' — see console for details', 'warning'); console.warn('[Upload errors]', errors); }
    loadLearners();
  }

  function printLearnerList() {
    const rows = State.cachedLearners || [];
    if (!rows.length) { showToast('Load the list first', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Learners</title><style>' +
      'body{font-family:Arial;padding:20px;}h1{color:#0b6623;text-align:center;margin:0 0 12px;}' +
      'table{width:100%;border-collapse:collapse;}th{background:#0b6623;color:#fff;padding:8px;font-size:11px;text-align:left;}' +
      'td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;}' +
      '.m{color:#1a5276;font-weight:600;}.f{color:#c0392b;font-weight:600;}</style></head><body>';
    html += '<h1>THE IDEAL SCHOOLS — Learners List</h1>';
    html += '<div style="text-align:center;font-size:11px;color:#666;margin-bottom:10px;">Printed ' + new Date().toLocaleString() + ' · ' + rows.length + ' learners</div>';
    html += '<table><thead><tr><th>Class</th><th>PIN</th><th>Name</th><th>Gender</th><th>Father Phone</th><th>Mother Phone</th></tr></thead><tbody>';
    rows.forEach(function (r) {
      const g = (r.gender || '').toLowerCase();
      const cls = g.indexOf('female') === 0 ? 'f' : (g.indexOf('male') === 0 ? 'm' : '');
      html += '<tr><td>' + esc(r.class_name || '') + '</td><td>' + esc(r.pin || '') + '</td>' +
              '<td class="' + cls + '">' + esc(r.name || '') + '</td>' +
              '<td>' + esc(r.gender || '') + '</td>' +
              '<td>' + esc(r.father_phone || '') + '</td><td>' + esc(r.mother_phone || '') + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); setTimeout(function () { w.print(); }, 250);
  }

  // ================================================================
  // Expose to window (inline handlers)
  // ================================================================
  window.loadLearners            = loadLearners;
  window.initLearnersTab         = initLearnersTab;
  window.openLearnerViewModal    = openLearnerViewModal;
  window.openLearnerEditModal    = openLearnerEditModal;
  window.saveLearnerEdits        = saveLearnerEdits;
  window.openAddLearnerModal     = openAddLearnerModal;
  window.submitNewLearner        = submitNewLearner;
  window.openPartPaymentModal    = openPartPaymentModal;
  window.submitPartPayment       = submitPartPayment;
  window.openPrintOptionsModal   = openPrintOptionsModal;
  window.printLearnerCard        = printLearnerCard;
  window.printLearnerList        = printLearnerList;
  window.closeLearnerModal       = closeLearnerModal;
  window.downloadLearnerTemplate = downloadLearnerTemplate;
  window.uploadLearnerUpdates    = uploadLearnerUpdates;
  
  // ================================================================
  // [S08] STAFF
  // Single canonical implementation.
  //   • grid with live search + stats
  //   • profile modal
  //   • edit modal (all real columns, incl. position / school / bvn / DOB)
  //   • add staff modal
  //   • photo upload (base64 today; move to Storage later)
  //   • print single card + whole list
  // ================================================================
  const STAFF_SCHOOLS = [
    'The Ideal Secondary School',
    'Hope and Faith Nur & Pry School'
  ];
  const STAFF_DEPARTMENTS = ['Teaching', 'Admin', 'Support'];
  const STAFF_STATUSES    = ['Active', 'Inactive'];

  async function loadStaff() {
    setHTML('staffGrid', pageLoaderHTML('Loading staff…'));
    startLoader();
    const r = await window.TIS.listStaff();
    stopLoader();
    if (!r || !r.ok) {
      setHTML('staffGrid', errorHTML('Could not load staff', r && r.error));
      return;
    }
    State.cachedStaff = r.data || [];
    renderStaff(State.cachedStaff);
    renderStaffStats(State.cachedStaff);
  }

  function staffName(s) {
    if (!s) return '';
    if (s.full_name) return s.full_name;
    return [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ');
  }

  function renderStaff(staff) {
    if (!staff || staff.length === 0) {
      setHTML('staffGrid', emptyHTML('fa-user-tie', 'No staff to show'));
      return;
    }
    let html = '';
    staff.forEach(function (s) {
      const name = staffName(s);
      const photo = s.photo_url || '';
      const badgeColor = (s.status === 'Inactive')
        ? 'background:#c0392b;color:#fff;'
        : 'background:rgba(255,255,255,0.08);';
      html += '<div class="student-card" data-staffid="' + escAttr(s.id) + '">';
      html += '<div class="card-header">';
      html += '<div class="card-avatar">' + (photo ? '<img src="' + esc(photo) + '" alt="">' : esc(name.charAt(0) || '?')) + '</div>';
      html += '<div class="card-title"><h3>' + esc(name) + '</h3>';
      html += '<div class="pin">' + esc(s.staff_id || s.id || '') + ' • ' + esc(s.department || '') + '</div>';
      if (s.position) {
        html += '<div class="pin" style="font-size:10px;opacity:.75;">' + esc(s.position) + '</div>';
      }
      html += '</div>';
      html += '<span class="card-badge" style="' + badgeColor + '">' + esc(s.status || 'Active') + '</span>';
      html += '</div>';
      html += '<div class="card-actions" style="display:flex;gap:6px;margin-top:8px;">';
      html += '<button type="button" class="btn btn-sm btn-secondary" data-staff-action="view" data-staffid="' + escAttr(s.id) + '"><i class="fas fa-eye"></i> View</button>';
      if (hasPermission('write_staff')) {
        html += '<button type="button" class="btn btn-sm btn-primary" data-staff-action="edit" data-staffid="' + escAttr(s.id) + '"><i class="fas fa-pen"></i> Edit</button>';
      }
      if (hasPermission('print_staff')) {
        html += '<button type="button" class="btn btn-sm btn-gold" data-staff-action="print" data-staffid="' + escAttr(s.id) + '"><i class="fas fa-print"></i> Print</button>';
      }
      html += '</div></div>';
    });
    setHTML('staffGrid', html);

    document.querySelectorAll('#staffGrid [data-staff-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        const id = btn.dataset.staffid;
        const action = btn.dataset.staffAction;
        if (action === 'view')  openStaffProfile(id);
        else if (action === 'edit') openStaffEditModal(id);
        else if (action === 'print') printStaffCard(id);
      });
    });
  }

  function renderStaffStats(staff) {
    let active = 0, inactive = 0, teaching = 0, nonTeaching = 0;
    staff.forEach(function (s) {
      if ((s.status || 'Active') === 'Active') active++; else inactive++;
      if ((s.department || '').toLowerCase() === 'teaching') teaching++;
      else nonTeaching++;
    });
    setHTML('staffStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + staff.length + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Active</div><div class="stat-value gold">' + active + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Inactive</div><div class="stat-value red">' + inactive + '</div></div>' +
      '<div class="stat-card blue"><div class="stat-label">Teaching</div><div class="stat-value" style="color:#1a5276;">' + teaching + '</div></div>');
  }

  // ----------------------------------------------------------------
  // Profile modal
  // ----------------------------------------------------------------
  async function openStaffProfile(id) {
    closeModal();
    startLoader();
    const r = await window.TIS.getStaff(id);
    stopLoader();
    if (!r || !r.ok || !r.data) { showToast('Staff not found', 'error'); return; }
    const s = r.data;
    const name = staffName(s);
    const photo = s.photo_url || '';

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeStaffModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>' + esc(name) + '</h2><button class="close-btn" onclick="closeStaffModal()">&times;</button></div>';

    html += '<div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:12px;flex-wrap:wrap;">';
    html += '<div style="width:96px;height:96px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#0d4d26,#d4a017);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:32px;flex-shrink:0;">';
    html += photo ? '<img src="' + esc(photo) + '" style="width:100%;height:100%;object-fit:cover;">' : esc(name.charAt(0) || '?');
    html += '</div>';
    html += '<div style="flex:1;min-width:220px;">';
    html += '<div style="font-weight:800;font-size:15px;color:#0d4d26;">' + esc(name) + '</div>';
    html += '<div style="font-size:12px;color:#666;">' + esc(s.staff_id || '') + ' · ' + esc(s.department || '') + '</div>';
    if (s.position) html += '<div style="font-size:12px;color:#666;">' + esc(s.position) + '</div>';
    if (s.school)   html += '<div style="font-size:11px;color:#888;">' + esc(s.school) + '</div>';
    html += '</div>';
    if (hasPermission('write_staff')) {
      html += '<div><button class="btn btn-sm btn-warning" onclick="openStaffPhotoModal(\'' + escAttr(id) + '\')"><i class="fas fa-camera"></i> Change photo</button></div>';
    }
    html += '</div>';

    html += '<div class="expandable open lbStaffSec">';
    html += '<div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Profile</div>';
    html += '<div class="expandable-body">';
    html += infoRow('Staff ID', s.staff_id);
    html += infoRow('Full Name', name);
    html += infoRow('Gender', s.gender);
    html += infoRow('Date of Birth', fmtDateOrDash(s.date_of_birth));
    html += infoRow('School', s.school);
    html += infoRow('Department', s.department);
    html += infoRow('Position', s.position);
    html += infoRow('Phone', s.phone);
    html += infoRow('Email', s.email);
    html += infoRow('Employment Date', fmtDateOrDash(s.employment_date));
    html += infoRow('Qualification', s.qualification);
    html += infoRow('Graduation Year', s.graduation_year);
    html += infoRow('Course of Study', s.course_of_study);
    html += infoRow('Subjects Taught', s.subjects_taught);
    html += infoRow('Bank', s.bank);
    html += infoRow('Account Number', s.account_number);
    html += infoRow('BVN', s.bvn);
    html += infoRow('Salary', moneyOrDash(s.salary));
    html += infoRow('Status', s.status);
    html += infoRow('Resume Time', s.resume_time);
    html += infoRow('Close Time', s.close_time);
    html += infoRow('Late Cutoff', s.late_cutoff);
    html += infoRow('Early Cutoff', s.early_cutoff);
    html += '</div></div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="closeStaffModal()">Close</button> ';
    if (hasPermission('print_staff')) {
      html += '<button class="btn btn-gold" onclick="printStaffCard(' + s.id + ')">Print</button> ';
    }
    if (hasPermission('write_staff')) {
      html += '<button class="btn btn-primary" onclick="openStaffEditModal(\'' + escAttr(id) + '\')">Edit</button>';
    }
    html += '</div>';
    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function closeStaffModal() {
    document.querySelectorAll('.modal-overlay').forEach(function (el) { el.remove(); });
    setHTML('modalContainer', '');
  }

  // ----------------------------------------------------------------
  // Edit modal
  // ----------------------------------------------------------------
  async function openStaffEditModal(id) {
    closeModal();
    startLoader();
    const r = await window.TIS.getStaff(id);
    stopLoader();
    if (!r || !r.ok || !r.data) { showToast('Staff not found', 'error'); return; }
    const s = r.data;

    const f = function (fid, label, value, type) {
      const t = type || 'text';
      return '<div class="form-group"><label>' + esc(label) + '</label><input id="' + fid + '" type="' + t + '" value="' + escAttr(value || '') + '"></div>';
    };
    const sel = function (fid, label, value, options, allowBlank) {
      let o = allowBlank ? '<option value="">—</option>' : '';
      options.forEach(function (opt) {
        o += '<option value="' + escAttr(opt) + '"' + (opt === value ? ' selected' : '') + '>' + esc(opt) + '</option>';
      });
      if (value && options.indexOf(value) === -1) {
        o += '<option value="' + escAttr(value) + '" selected>' + esc(value) + '</option>';
      }
      return '<div class="form-group"><label>' + esc(label) + '</label><select id="' + fid + '">' + o + '</select></div>';
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeStaffModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Edit — ' + esc(staffName(s)) + '</h2><button class="close-btn" onclick="closeStaffModal()">&times;</button></div>';

    html += '<div class="form-row">' + f('es_staff_id', 'Staff ID', s.staff_id) + f('es_surname', 'Surname', s.surname) + '</div>';
    html += '<div class="form-row">' + f('es_first_name', 'First Name', s.first_name) + f('es_middle_name', 'Middle Name', s.middle_name) + '</div>';
    html += '<div class="form-row">' + sel('es_gender', 'Gender', s.gender, ['Male', 'Female'], true) + f('es_date_of_birth', 'Date of Birth', s.date_of_birth, 'date') + '</div>';
    html += '<div class="form-row">' + sel('es_school', 'School', s.school, STAFF_SCHOOLS, true) + sel('es_department', 'Department', s.department, STAFF_DEPARTMENTS, true) + '</div>';
    html += '<div class="form-row">' + f('es_position', 'Position', s.position) + f('es_phone', 'Phone', s.phone) + '</div>';
    html += '<div class="form-row">' + f('es_email', 'Email', s.email) + f('es_qualification', 'Qualification', s.qualification) + '</div>';
    html += '<div class="form-row">' + f('es_employment_date', 'Employment Date', s.employment_date, 'date') + f('es_graduation_year', 'Graduation Year', s.graduation_year) + '</div>';
    html += '<div class="form-row">' + f('es_course_of_study', 'Course of Study', s.course_of_study) + f('es_subjects_taught', 'Subjects Taught', s.subjects_taught) + '</div>';
    html += '<div class="form-row">' + f('es_bank', 'Bank', s.bank) + f('es_account_number', 'Account Number', s.account_number) + '</div>';
    html += '<div class="form-row">' + f('es_bvn', 'BVN', s.bvn) + f('es_salary', 'Salary (₦)', s.salary) + '</div>';
    html += '<div class="form-row">' + f('es_resume_time', 'Resume Time', s.resume_time) + f('es_close_time', 'Close Time', s.close_time) + '</div>';
    html += '<div class="form-row">' + f('es_late_cutoff', 'Late Cutoff', s.late_cutoff) + f('es_early_cutoff', 'Early Cutoff', s.early_cutoff) + '</div>';
    html += '<div class="form-row">' + sel('es_status', 'Status', s.status || 'Active', STAFF_STATUSES, false) + '</div>';

    html += '<div style="text-align:right;margin-top:14px;">';
    html += '<button class="btn btn-secondary" onclick="closeStaffModal()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="saveStaffEdits(\'' + escAttr(id) + '\')">Save</button>';
    html += '</div>';
    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  async function saveStaffEdits(id) {
    const get = function (fid) { const el = $(fid); return el ? String(el.value || '').trim() : ''; };
    const salaryRaw = get('es_salary');
    const salaryNum = salaryRaw
      ? Number(String(salaryRaw).replace(/[^0-9.\-]/g, ''))
      : null;

    const patch = {
      staff_id:        get('es_staff_id'),
      surname:         get('es_surname'),
      first_name:      get('es_first_name'),
      middle_name:     get('es_middle_name'),
      gender:          get('es_gender'),
      date_of_birth:   get('es_date_of_birth'),
      school:          get('es_school'),
      department:      get('es_department'),
      position:        get('es_position'),
      phone:           get('es_phone'),
      email:           get('es_email'),
      qualification:   get('es_qualification'),
      employment_date: get('es_employment_date'),
      graduation_year: get('es_graduation_year'),
      course_of_study: get('es_course_of_study'),
      subjects_taught: get('es_subjects_taught'),
      bank:            get('es_bank'),
      account_number:  get('es_account_number'),
      bvn:             get('es_bvn'),
      salary:          (salaryNum !== null && !isNaN(salaryNum)) ? salaryNum : null,
      resume_time:     get('es_resume_time'),
      close_time:      get('es_close_time'),
      late_cutoff:     get('es_late_cutoff'),
      early_cutoff:    get('es_early_cutoff'),
      status:          get('es_status') || 'Active'
    };
    patch.full_name = [patch.surname, patch.first_name, patch.middle_name].filter(Boolean).join(' ');
    if (!patch.staff_id || !patch.full_name) {
      showToast('Staff ID and name are required', 'warning');
      return;
    }

    startLoader();
    const r = await window.TIS.updateStaff(id, patch);
    stopLoader();
    if (r && r.ok) {
      showToast('Staff updated', 'success');
      closeStaffModal();
      loadStaff();
    } else {
      showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
      console.error('[saveStaffEdits]', r && r.error, patch);
    }
  }

  // ----------------------------------------------------------------
  // Add staff modal
  // ----------------------------------------------------------------
  function openAddStaffModal() {
    const f = function (fid, label, value, type) {
      const t = type || 'text';
      return '<div class="form-group"><label>' + esc(label) + '</label><input id="' + fid + '" type="' + t + '" value="' + escAttr(value || '') + '"></div>';
    };
    const sel = function (fid, label, options, blank) {
      let o = blank ? '<option value="">—</option>' : '';
      options.forEach(function (opt) { o += '<option value="' + escAttr(opt) + '">' + esc(opt) + '</option>'; });
      return '<div class="form-group"><label>' + esc(label) + '</label><select id="' + fid + '">' + o + '</select></div>';
    };

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeStaffModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Add Staff</h2><button class="close-btn" onclick="closeStaffModal()">&times;</button></div>';

    html += '<div class="form-row">' + f('ns_staff_id', 'Staff ID', '') + f('ns_surname', 'Surname', '') + '</div>';
    html += '<div class="form-row">' + f('ns_first_name', 'First Name', '') + f('ns_middle_name', 'Middle Name', '') + '</div>';
    html += '<div class="form-row">' + sel('ns_gender', 'Gender', ['Male', 'Female'], true) + f('ns_date_of_birth', 'Date of Birth', '', 'date') + '</div>';
    html += '<div class="form-row">' + sel('ns_school', 'School', STAFF_SCHOOLS, true) + sel('ns_department', 'Department', STAFF_DEPARTMENTS, true) + '</div>';
    html += '<div class="form-row">' + f('ns_position', 'Position', '') + f('ns_phone', 'Phone', '') + '</div>';
    html += '<div class="form-row">' + f('ns_email', 'Email', '') + f('ns_qualification', 'Qualification', '') + '</div>';
    html += '<div class="form-row">' + f('ns_employment_date', 'Employment Date', '', 'date') + f('ns_graduation_year', 'Graduation Year', '') + '</div>';
    html += '<div class="form-row">' + f('ns_course_of_study', 'Course of Study', '') + f('ns_subjects_taught', 'Subjects Taught', '') + '</div>';
    html += '<div class="form-row">' + f('ns_bank', 'Bank', '') + f('ns_account_number', 'Account Number', '') + '</div>';
    html += '<div class="form-row">' + f('ns_bvn', 'BVN', '') + f('ns_salary', 'Salary (₦)', '') + '</div>';
    html += '<div class="form-row">' + f('ns_resume_time', 'Resume Time', '07:00') + f('ns_close_time', 'Close Time', '16:30') + '</div>';
    html += '<div class="form-row">' + f('ns_late_cutoff', 'Late Cutoff', '') + f('ns_early_cutoff', 'Early Cutoff', '') + '</div>';

    html += '<div style="text-align:right;margin-top:14px;">';
    html += '<button class="btn btn-secondary" onclick="closeStaffModal()">Cancel</button> ';
    html += '<button class="btn btn-success" onclick="submitNewStaff()">Add staff</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function submitNewStaff() {
    const get = function (id) { const el = $(id); return el ? String(el.value || '').trim() : ''; };
    const surname = get('ns_surname');
    const firstName = get('ns_first_name');
    const middleName = get('ns_middle_name');
    const salaryRaw = get('ns_salary');
    const salaryNum = salaryRaw ? Number(String(salaryRaw).replace(/[^0-9.\-]/g, '')) : null;

    const row = {
      staff_id:        get('ns_staff_id'),
      surname:         surname,
      first_name:      firstName,
      middle_name:     middleName,
      full_name:       [surname, firstName, middleName].filter(Boolean).join(' '),
      gender:          get('ns_gender'),
      date_of_birth:   get('ns_date_of_birth'),
      school:          get('ns_school'),
      department:      get('ns_department'),
      position:        get('ns_position'),
      phone:           get('ns_phone'),
      email:           get('ns_email'),
      qualification:   get('ns_qualification'),
      employment_date: get('ns_employment_date'),
      graduation_year: get('ns_graduation_year'),
      course_of_study: get('ns_course_of_study'),
      subjects_taught: get('ns_subjects_taught'),
      bank:            get('ns_bank'),
      account_number:  get('ns_account_number'),
      bvn:             get('ns_bvn'),
      salary:          (salaryNum !== null && !isNaN(salaryNum)) ? salaryNum : null,
      resume_time:     get('ns_resume_time') || '07:00',
      close_time:      get('ns_close_time') || '16:30',
      late_cutoff:     get('ns_late_cutoff'),
      early_cutoff:    get('ns_early_cutoff'),
      status:          'Active'
    };
    if (!row.staff_id || !row.full_name) { showToast('Staff ID and name are required', 'warning'); return; }

    startLoader();
    const r = await window.TIS.createStaff(row);
    stopLoader();
    if (r && r.ok) { showToast('Staff added', 'success'); closeStaffModal(); loadStaff(); }
    else { showToast('Could not add: ' + ((r && r.error) || 'unknown'), 'error'); console.error('[submitNewStaff]', r && r.error, row); }
  }

  // ----------------------------------------------------------------
  // Photo modal — shows staff_id in the title, not UUID
  // ----------------------------------------------------------------
  function openStaffPhotoModal(id) {
    const s = (State.cachedStaff || []).find(function (x) { return String(x.id) === String(id); });
    const display = s ? (s.staff_id || staffName(s) || id) : id;

    let html = '<div class="modal-overlay" onclick="if(event.target===this)closeStaffModal()">';
    html += '<div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Photo — ' + esc(display) + '</h2><button class="close-btn" onclick="closeStaffModal()">&times;</button></div>';
    html += '<div style="text-align:center;">';
    html += '<input type="file" id="staffPhotoInput" accept="image/*" style="margin-bottom:14px;">';
    html += '<div id="staffPhotoPreview" style="width:120px;height:120px;margin:10px auto;border-radius:50%;border:3px solid #d4a017;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#f5f5f5;color:#666;font-size:12px;">preview</div>';
    html += '<button class="btn btn-primary" onclick="submitStaffPhoto(\'' + escAttr(id) + '\')">Upload photo</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);

    const inp = $('staffPhotoInput');
    if (inp) {
      inp.addEventListener('change', function (e) {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          $('staffPhotoPreview').innerHTML = '<img src="' + ev.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
          window.__staffPhotoDataUrl = ev.target.result;
        };
        reader.readAsDataURL(f);
      });
    }
  }

  async function submitStaffPhoto(id) {
    const dataUrl = window.__staffPhotoDataUrl;
    if (!dataUrl) { showToast('Choose a photo first', 'warning'); return; }
    startLoader();
    const r = await window.TIS.updateStaff(id, { photo_url: dataUrl });
    stopLoader();
    if (r && r.ok) {
      showToast('Photo saved', 'success');
      window.__staffPhotoDataUrl = null;
      closeStaffModal();
      loadStaff();
    } else {
      showToast('Upload failed: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  // ----------------------------------------------------------------
  // Print
  // ----------------------------------------------------------------
  function printStaffCard(id) {
    const s = (State.cachedStaff || []).find(function (x) { return String(x.id) === String(id); });
    if (!s) { showToast('Staff not found', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    const name = staffName(s);
    let html = '<html><head><title>' + esc(name) + '</title>' +
      '<style>body{font-family:Arial;padding:24px;}' +
      '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0b6623;padding-bottom:8px;}' +
      '.hdr .mid{text-align:center;flex:1;}h1{color:#0b6623;margin:0;font-size:20px;}' +
      'table{width:100%;border-collapse:collapse;margin-top:12px;}' +
      'td{padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;}td.k{color:#666;width:35%;}' +
      '</style></head><body>';
    html += '<div class="hdr">';
    html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:60px;">';
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1><div style="font-style:italic;color:#666;font-size:12px;">Scientia est potentia</div></div>';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:60px;">';
    html += '</div>';
    html += '<h2 style="margin-top:16px;color:#0b6623;">' + esc(name) + ' — ' + esc(s.staff_id || '') + '</h2>';
    html += '<table>';
    const rows = [
      ['School', s.school],
      ['Department', s.department],
      ['Position', s.position],
      ['Gender', s.gender],
      ['Date of Birth', s.date_of_birth],
      ['Phone', s.phone],
      ['Email', s.email],
      ['Employment Date', s.employment_date],
      ['Qualification', s.qualification],
      ['Graduation Year', s.graduation_year],
      ['Course of Study', s.course_of_study],
      ['Subjects Taught', s.subjects_taught],
      ['Bank', s.bank],
      ['Account Number', s.account_number],
      ['BVN', s.bvn],
      ['Salary', s.salary],
      ['Status', s.status]
    ];
    rows.forEach(function (r) {
      if (r[1] === undefined || r[1] === null || r[1] === '') return;
      html += '<tr><td class="k">' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td></tr>';
    });
    html += '</table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }

  function printStaffList() {
    if (!State.cachedStaff.length) { showToast('Load the list first', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Staff</title><style>' +
      'body{font-family:Arial;padding:20px;}h1{color:#0b6623;text-align:center;}' +
      'table{width:100%;border-collapse:collapse;}th{background:#0b6623;color:white;padding:8px;font-size:11px;}' +
      'td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;}</style></head><body>';
    html += '<h1>THE IDEAL SCHOOLS — Staff List</h1>';
    html += '<table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Position</th><th>Phone</th><th>Status</th></tr></thead><tbody>';
    State.cachedStaff.forEach(function (s) {
      html += '<tr><td>' + esc(s.staff_id || '') + '</td><td>' + esc(staffName(s)) + '</td>' +
              '<td>' + esc(s.department || '') + '</td><td>' + esc(s.position || '') + '</td>' +
              '<td>' + esc(s.phone || '') + '</td>' +
              '<td>' + esc(s.status || 'Active') + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }

  // ----------------------------------------------------------------
  // Toolbar wiring
  // ----------------------------------------------------------------
  function initStaffTab() {
    const input = $('staffSearchInput');
    if (input && !input.__wired) {
      input.addEventListener('input', debounce(function () {
        const q = input.value.trim().toLowerCase();
        if (!q) { renderStaff(State.cachedStaff); return; }
        const filtered = (State.cachedStaff || []).filter(function (s) {
          return (staffName(s) || '').toLowerCase().indexOf(q) !== -1 ||
                 (s.staff_id || '').toLowerCase().indexOf(q) !== -1 ||
                 (s.position || '').toLowerCase().indexOf(q) !== -1 ||
                 (s.phone || '').indexOf(q) !== -1 ||
                 (s.email || '').toLowerCase().indexOf(q) !== -1;
        });
        renderStaff(filtered);
      }, 250));
      input.__wired = true;
    }
    const add = $('btnAddStaff');
    if (add && !add.__wired) { add.addEventListener('click', openAddStaffModal); add.__wired = true; }
    const rf  = $('btnRefreshStaff');
    if (rf  && !rf.__wired)  { rf.addEventListener('click', loadStaff); rf.__wired = true; }
    const pr  = $('btnPrintStaff');
    if (pr  && !pr.__wired)  {
      pr.addEventListener('click', function () {
        if (State.cachedStaff && State.cachedStaff.length) printStaffList();
        else showToast('Load the list first', 'warning');
      });
      pr.__wired = true;
    }
  }

  // ----------------------------------------------------------------
  // Globals
  // ----------------------------------------------------------------
  window.loadStaff            = loadStaff;
  window.openStaffProfile     = openStaffProfile;
  window.openStaffEditModal   = openStaffEditModal;
  window.saveStaffEdits       = saveStaffEdits;
  window.openAddStaffModal    = openAddStaffModal;
  window.submitNewStaff       = submitNewStaff;
  window.openStaffPhotoModal  = openStaffPhotoModal;
  window.submitStaffPhoto     = submitStaffPhoto;
  window.printStaffCard       = printStaffCard;
  window.printStaffList       = printStaffList;
  window.closeStaffModal      = closeStaffModal;
  
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
  //   Master mark: 'O O' | '\' | '/' | '\ /'
  //   Holiday columns: one shared vertical write-up via rowspan.
  //   Columns (PIN, Sex, Age) hideable via checkbox bar.
  //   Holiday Adjuster moves a holiday; grid + analysis refresh.
  //   Class Analysis / Per-Day Breakdown / Week Signatures on click.
  //   B/F column = sum of prior terms in same academic year.
  //   AY Total   = B/F + current-term total.
  // ================================================================
  const ATT_MARKS = ['O O', '\\', '/', '\\ /'];
  let attSessionMode = 'AM';
  let attState = null;

  // Column visibility for the register (persists across re-renders).
  if (!window.__attColVisibility) {
    window.__attColVisibility = { pin: true, sex: false, age: false };
  }

  function attToggleCol(col) {
    if (!window.__attColVisibility) return;
    window.__attColVisibility[col] = !window.__attColVisibility[col];
    if (typeof renderAttendanceRegister === 'function') renderAttendanceRegister();
  }
  window.attToggleCol = attToggleCol;

  function attIsAdmin() {
    return !!(State.profile && (State.profile.role === 'admin' || State.profile.role === 'super_admin'));
  }
  function attTodayISO() { return new Date().toISOString().slice(0, 10); }

  function attWeekLockState(wk) {
    const today = attTodayISO();
    const monday = wk.days[0].date;
    const friday = wk.days[4].date;
    if (today < monday) return 'future';
    if (today >= monday && today <= friday) return 'open';
    const fridayEnd = new Date(friday + 'T23:59:59');
    const hoursSince = (new Date() - fridayEnd) / (1000 * 60 * 60);
    if (hoursSince >= 0 && hoursSince <= 24) return 'grace';
    return 'locked';
  }
  function attDayLockState(day) {
    return (day.date > attTodayISO()) ? 'future' : 'open';
  }
  function attMarkableFor(weekLock, dayLock, role) {
    if (dayLock === 'future') return false;
    if (weekLock === 'open' || weekLock === 'grace') return true;
    return role === 'admin' || role === 'super_admin';
  }
  function attWeekLockLabel(lock) {
    if (lock === 'open')   return '🔓 Open';
    if (lock === 'grace')  return '⏳ Grace (24h)';
    if (lock === 'locked') return '🔒 Locked';
    return '⏳ Future';
  }

  // ----------------------------------------------------------------
  // Tab init + expandable wiring
  // ----------------------------------------------------------------
  async function initLearnerAttendanceTab() {
    await populateAttendanceClassList();

    const loadBtn = document.getElementById('btnLoadAttendance');
    if (loadBtn && !loadBtn.__wired) {
      loadBtn.addEventListener('click', function () {
        loadAttendanceRegister().then(function () {
          if (attState) {
            renderClassAnalysisPanel();
            renderSignaturePanel();
            renderDayBreakdownPanel();
            openAttendanceExpandables();
          }
        });
      });
      loadBtn.__wired = true;
    }

    const printBtn = document.getElementById('btnPrintAttendance');
    if (printBtn && !printBtn.__wired) {
      printBtn.addEventListener('click', function (e) { e.preventDefault(); attOpenPrintDialog(); });
      printBtn.__wired = true;
    }

    // Holiday Adjuster wiring
    const applyBtn = document.getElementById('btnApplyHolidayMove');
    if (applyBtn && !applyBtn.__wired) {
      applyBtn.addEventListener('click', attApplyHolidayMove);
      applyBtn.__wired = true;
    }

    // Wire all three expandables so their headers toggle open/close.
    wireAttendanceExpandable('analysisFrame',    'analysisBody',    'renderClassAnalysisPanel');
    wireAttendanceExpandable('dayBreakdownFrame','dayBreakdownBody','renderDayBreakdownPanel');
    wireAttendanceExpandable('signatureFrame',   'signatureBody',   'renderSignaturePanel');

    // If a register is already in state, refresh panels and open the frames.
    if (attState) {
      renderClassAnalysisPanel();
      renderSignaturePanel();
      renderDayBreakdownPanel();
      openAttendanceExpandables();
    }
  }

  function wireAttendanceExpandable(frameId, bodyId, renderFnName) {
    const frame = document.getElementById(frameId);
    if (!frame) return;
    if (frame.__wired) return;
    const header = frame.querySelector('.expandable-header');
    if (!header) return;
    header.addEventListener('click', function () {
      frame.classList.toggle('open');
      if (frame.classList.contains('open')) {
        if (!attState) {
          setHTML(bodyId, emptyHTML(
            'fa-chart-bar',
            'Load a class first',
            'Pick a class, term and year, then click Load Term View.'
          ));
          return;
        }
        const body = document.getElementById(bodyId);
        if (body && (body.innerHTML.trim() === '' || body.querySelector('.page-loader'))) {
          if (renderFnName === 'renderClassAnalysisPanel') renderClassAnalysisPanel();
          if (renderFnName === 'renderDayBreakdownPanel')  renderDayBreakdownPanel();
          if (renderFnName === 'renderSignaturePanel')     renderSignaturePanel();
        }
      }
    });
    frame.__wired = true;
  }

  function openAttendanceExpandables() {
    ['analysisFrame', 'dayBreakdownFrame', 'signatureFrame'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.classList.add('open');
    });
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
    if (!r || !r.ok) {
      stopLoader();
      setHTML('attendanceTermView', errorHTML('Could not load register', r && r.error));
      return;
    }

    // Compute the B/F map (sum of prior terms in the same academic year).
    let bfMap = {};
    const learnerIds = (r.data.learners || []).map(function (l) { return l.id; });
    if (learnerIds.length > 0 && typeof window.TIS.getAttendanceTotalsInAcademicYear === 'function') {
      const bfR = await window.TIS.getAttendanceTotalsInAcademicYear(
        learnerIds, parseInt(year, 10), term
      );
      if (bfR && bfR.ok && bfR.data) bfMap = bfR.data;
    }

    stopLoader();

    attState = {
      cls: cls, term: term, year: parseInt(year, 10),
      termLabel: r.data.termLabel || (term.toUpperCase() + ' TERM ' + year),
      learners: r.data.learners || [],
      weeks: r.data.weeks || [],
      bfMap: bfMap,
      openWeeks: {},
      editing: {}
    };
    if (attState.weeks.length > 0) attState.openWeeks[attState.weeks[0].weekNumber] = true;
    renderAttendanceRegister();
    renderClassAnalysisPanel();
    renderSignaturePanel();
    renderDayBreakdownPanel();
    attRenderHolidayList();
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
      for (let j = 0; j < attState.weeks[i].days.length; j++) {
        const d = attState.weeks[i].days[j];
        if (d.date === dateISO) return (d.marksByLearner || {})[learnerId] || 'O O';
      }
    }
    return 'O O';
  }

  // ----------------------------------------------------------------
  // Holiday Adjuster
  // ----------------------------------------------------------------
  async function attApplyHolidayMove() {
    const fromEl = document.getElementById('holidayFromDate');
    const toEl   = document.getElementById('holidayToDate');
    const nameEl = document.getElementById('holidayName');
    const fb     = document.getElementById('holidayFeedback');

    const fromDate = fromEl ? fromEl.value : '';
    const toDate   = toEl   ? toEl.value   : '';
    const name     = nameEl ? nameEl.value.trim() : '';

    if (fb) fb.textContent = '';
    if (!fromDate) { showToast('Pick the date the holiday is currently on', 'warning'); return; }
    if (!toDate)   { showToast('Pick the date you want to move it to', 'warning'); return; }
    if (fromDate === toDate) { showToast('The two dates are the same', 'warning'); return; }

    if (!confirm('Move holiday from ' + fromDate + ' to ' + toDate + '?')) return;

    startLoader();
    try {
      if (typeof window.TIS.moveHoliday !== 'function') {
        showToast('moveHoliday not available. Add it to supabase-client.js.', 'error');
        return;
      }
      const r = await window.TIS.moveHoliday(fromDate, toDate, name);
      if (!r || !r.ok) {
        showToast('Could not move holiday: ' + ((r && r.error) || 'unknown'), 'error');
        if (fb) fb.textContent = (r && r.error) || 'Move failed.';
        return;
      }
      showToast('Holiday moved to ' + toDate, 'success');
      if (fb) fb.textContent = '✓ Holiday moved to ' + toDate + '. Reloading register…';
      await loadAttendanceRegister();
      if (fb) fb.textContent = '✓ Holiday moved to ' + toDate + '.';
    } finally {
      stopLoader();
    }
  }

  function attRenderHolidayList() {
    const listEl = document.getElementById('holidayList');
    if (!listEl) return;
    if (!attState) {
      listEl.innerHTML = '<div style="color:#666;">Load a class to see holidays.</div>';
      return;
    }
    const holidays = [];
    attState.weeks.forEach(function (wk) {
      wk.days.forEach(function (d) {
        if (d.isHoliday) {
          holidays.push({
            weekNumber: wk.weekNumber,
            date: d.date,
            dayName: d.dayName,
            name: d.holidayName || 'Holiday'
          });
        }
      });
    });

    if (holidays.length === 0) {
      listEl.innerHTML = '<div style="color:#666;">No holidays in this term.</div>';
      return;
    }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#f1f8e9;">';
    html += '<th style="text-align:left;padding:4px 6px;">Week</th>';
    html += '<th style="text-align:left;padding:4px 6px;">Date</th>';
    html += '<th style="text-align:left;padding:4px 6px;">Day</th>';
    html += '<th style="text-align:left;padding:4px 6px;">Name</th>';
    html += '<th style="text-align:center;padding:4px 6px;">Action</th>';
    html += '</tr></thead><tbody>';
    holidays.forEach(function (h) {
      html += '<tr>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">Wk ' + h.weekNumber + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + fmtDateShort_(h.date) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(h.dayName || '') + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(h.name) + '</td>' +
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' +
          '<button type="button" class="btn btn-sm btn-secondary" onclick="attPrefillHolidayMove(\'' + h.date + '\',\'' + escAttr(h.name) + '\')">Prefill</button>' +
        '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;
  }

  function attPrefillHolidayMove(dateISO, holidayName) {
    const fromEl = document.getElementById('holidayFromDate');
    const nameEl = document.getElementById('holidayName');
    if (fromEl) fromEl.value = dateISO;
    if (nameEl) nameEl.value = holidayName || '';
    showToast('Holiday date and name prefilled. Pick the new date and click Move Holiday.', 'info');
  }
  window.attPrefillHolidayMove = attPrefillHolidayMove;

  // ----------------------------------------------------------------
  // Register grid
  // ----------------------------------------------------------------
  function renderAttendanceRegister() {
    if (!attState) return;
    const st = attState;

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
      html += '<span>Σ: <b>' + a.combinedPct + '%</b></span>';
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
    const numLearners = st.learners.length;
    const vis = window.__attColVisibility;

    const NAME_W = 90;
    const nameLeft = vis.pin ? 70 : 0;

    // Column-visibility toggle bar
    let bar = '<div style="display:flex;gap:12px;align-items:center;padding:6px 10px;background:#f1f8e9;border-bottom:1px solid #c8e6c9;font-size:11px;">';
    bar += '<span style="font-weight:700;color:#0d4d26;">Columns:</span>';
    bar += '<label style="cursor:pointer;"><input type="checkbox" ' + (vis.pin ? 'checked' : '') +
           ' onchange="attToggleCol(\'pin\')"> PIN</label>';
    bar += '<label style="cursor:pointer;"><input type="checkbox" ' + (vis.sex ? 'checked' : '') +
           ' onchange="attToggleCol(\'sex\')"> Sex</label>';
    bar += '<label style="cursor:pointer;"><input type="checkbox" ' + (vis.age ? 'checked' : '') +
           ' onchange="attToggleCol(\'age\')"> Age</label>';
    bar += '<span style="color:#666;">(Name always shown)</span>';
    bar += '</div>';

    let h = bar;
    h += '<div style="overflow-x:auto;background:#fff;">';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:700px;table-layout:fixed;">';

    h += '<thead><tr style="background:#e8f5e9;">';
    if (vis.pin) {
      h += '<th style="text-align:left;padding:6px;background:#e8f5e9;position:sticky;left:0;z-index:2;width:70px;min-width:70px;">PIN</th>';
    }
    h += '<th style="text-align:left;padding:6px;background:#e8f5e9;position:sticky;left:' +
         nameLeft + 'px;z-index:2;width:' + NAME_W + 'px;min-width:' + NAME_W + 'px;max-width:' + NAME_W + 'px;">Name</th>';
    if (vis.sex) h += '<th style="padding:6px;width:50px;min-width:50px;">Sex</th>';
    if (vis.age) h += '<th style="padding:6px;width:40px;min-width:40px;">Age</th>';
    days.forEach(function (d, i) {
      const isHol = d.isHoliday;
      const shortDay = ['Mon','Tue','Wed','Thu','Fri'][i];
      if (isHol) {
        h += '<th colspan="2" style="background:#ffcdd2;color:#721c24;padding:4px 6px;">' +
             shortDay + '<br><span style="font-size:10px;font-weight:400;">' + fmtDateShort_(d.date) + '</span>' +
             '</th>';
      } else {
        h += '<th colspan="2" style="padding:4px 6px;">' + shortDay +
             '<br><span style="font-size:10px;font-weight:400;">' + fmtDateShort_(d.date) + '</span></th>';
      }
    });
    h += '<th style="padding:6px;background:#c8e6c9;width:40px;min-width:40px;">Wkly</th>';
    h += '<th style="padding:6px;background:#a5d6a7;width:44px;min-width:44px;">Term</th>';
    h += '<th style="padding:6px;background:#cfe8ff;width:44px;min-width:44px;" title="Brought Forward: total from earlier terms in this academic year">B/F</th>';
    h += '<th style="padding:6px;background:#b3d9ff;width:52px;min-width:52px;" title="Academic Year total: B/F + this term">AY Total</th>';
    h += '</tr>';

    h += '<tr style="background:#f1f8e9;">';
    const subColspan = 1 + (vis.pin ? 1 : 0) + (vis.sex ? 1 : 0) + (vis.age ? 1 : 0);
    h += '<th colspan="' + subColspan + '" style="padding:2px;"></th>';
    days.forEach(function (d) {
      if (d.isHoliday) {
        h += '<th colspan="2" style="background:#ffcdd2;color:#721c24;font-size:10px;padding:2px;">HOLIDAY</th>';
      } else {
        h += '<th style="padding:2px 4px;font-size:10px;">M</th><th style="padding:2px 4px;font-size:10px;">A</th>';
      }
    });
    h += '<th style="padding:2px;"></th><th style="padding:2px;"></th><th style="padding:2px;"></th><th style="padding:2px;"></th></tr></thead><tbody>';

    st.learners.forEach(function (l, rowIndex) {
      h += '<tr id="attRow_' + l.id + '">';
      if (vis.pin) {
        h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;position:sticky;left:0;background:#fff;z-index:1;width:70px;min-width:70px;">' + esc(l.pin || '') + '</td>';
      }
      const g = (l.gender || '').toLowerCase();
      const nc = g.indexOf('female') === 0 ? 'color:#c0392b;' : (g.indexOf('male') === 0 ? 'color:#1a5276;' : '');
      h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-weight:600;' + nc + ';position:sticky;left:' + nameLeft + 'px;background:#fff;z-index:1;' +
           'width:' + NAME_W + 'px;min-width:' + NAME_W + 'px;max-width:' + NAME_W + 'px;' +
           'overflow-x:auto;white-space:nowrap;">' + esc(l.name || '') + '</td>';
      if (vis.sex) h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:10px;text-align:center;width:50px;min-width:50px;">' + esc(l.gender || '—') + '</td>';
      if (vis.age) h += '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:10px;text-align:center;width:40px;min-width:40px;">' + esc(l.age || '—') + '</td>';

      let weeklyPresent = 0;
      days.forEach(function (d) {
        if (d.isHoliday) {
          if (rowIndex === 0) {
            const holidayText = d.holidayName || 'Holiday';
            h += '<td colspan="2" rowspan="' + numLearners + '" ' +
                 'style="background:#fff5f5;padding:0;text-align:center;vertical-align:top;position:relative;">' +
                 '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;">' +
                 '<div style="writing-mode:vertical-rl;transform:rotate(180deg);' +
                 'font-weight:900;color:#0d47a1;font-size:14px;letter-spacing:2px;' +
                 'text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff,0 0 3px #fff;' +
                 'padding:8px 0;">' + esc(holidayText) + '</div>' +
                 '</div>' +
                 '<div style="position:absolute;inset:0;' +
                 'background-image:repeating-linear-gradient(to bottom,' +
                 'transparent 0,transparent 22px,#d32f2f 22px,#d32f2f 24px);' +
                 'opacity:0.45;pointer-events:none;">' +
                 '</div></td>';
          }
          return;
        }

        const dayLock = attDayLockState(d);
        const canMark = attMarkableFor(weekLock, dayLock, role);
        const mark = attEffectiveMark(l.id, d.date);
        const ma = attMA(mark);

        if (ma.M === '\\') weeklyPresent++;
        if (ma.A === '/')  weeklyPresent++;

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
          h += '<td style="padding:4px;text-align:center;background:#eceff1;color:#78909c;font-weight:700;">' + ma.M + '</td>';
          h += '<td style="padding:4px;text-align:center;background:#eceff1;color:#78909c;font-weight:700;">' + ma.A + '</td>';
        }
      });

      const termPresent = attLearnerTermTotal(l.id);
      const bf          = (st.bfMap && st.bfMap[l.id]) ? st.bfMap[l.id] : 0;
      const ayTotal     = bf + termPresent;

      h += '<td id="attWk_' + l.id + '" style="padding:4px;text-align:center;font-weight:700;background:#e8f5e9;width:40px;min-width:40px;">' + weeklyPresent + '</td>';
      h += '<td style="padding:4px;text-align:center;font-weight:700;background:#a5d6a7;width:44px;min-width:44px;">' + termPresent + '</td>';
      h += '<td style="padding:4px;text-align:center;font-weight:700;background:#cfe8ff;width:44px;min-width:44px;">' + bf + '</td>';
      h += '<td style="padding:4px;text-align:center;font-weight:700;background:#b3d9ff;width:52px;min-width:52px;">' + ayTotal + '</td>';
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
      renderDayBreakdownPanel();
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

  // ----------------------------------------------------------------
  // Weekly summary — correct "Open" count, combined %
  // ----------------------------------------------------------------
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
        if (d.date > attTodayISO()) return;
        const mark = attEffectiveMark(l.id, d.date);
        const ma = attMA(mark);
        if (ma.M === '\\') { mPresent++; if (isBoy) { boysPresent++; genderKnown = true; } else if (isGirl) { girlsPresent++; genderKnown = true; } }
        if (ma.A === '/')  { aPresent++; if (isBoy) { boysPresent++; genderKnown = true; } else if (isGirl) { girlsPresent++; genderKnown = true; } }
      });
    });
    const mExpected = openSlots * st.learners.length;
    const aExpected = openSlots * st.learners.length;
    const combinedPresent = mPresent + aPresent;
    const combinedExpected = mExpected + aExpected;
    return {
      openSlots: openSlots,
      mPresent: mPresent, mExpected: mExpected,
      mPct: mExpected > 0 ? (mPresent / mExpected * 100).toFixed(1) : '0.0',
      aPresent: aPresent, aExpected: aExpected,
      aPct: aExpected > 0 ? (aPresent / aExpected * 100).toFixed(1) : '0.0',
      combinedPct: combinedExpected > 0 ? (combinedPresent / combinedExpected * 100).toFixed(1) : '0.0',
      boysPresent:  genderKnown ? boysPresent  : null,
      girlsPresent: genderKnown ? girlsPresent : null
    };
  }

  // ----------------------------------------------------------------
  // Class Analysis panel (weekly + term) + B/F + AY Total row
  // ----------------------------------------------------------------
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
    let tBf = 0, tAy = 0;

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

    // Compute class-level B/F and AY totals.
    st.learners.forEach(function (l) {
      const bf       = (st.bfMap && st.bfMap[l.id]) ? st.bfMap[l.id] : 0;
      const termTot  = attLearnerTermTotal(l.id);
      tBf += bf;
      tAy += bf + termTot;
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
    html += '<div class="stat-card"><div class="stat-label">Class B/F (prior terms this year)</div><div class="stat-value">' + tBf + '</div></div>';
    html += '<div class="stat-card gold"><div class="stat-label">Class AY Total (B/F + this term)</div><div class="stat-value gold">' + tAy + '</div></div>';
    html += '</div>';

    setHTML('analysisBody', html);
  }

  // ----------------------------------------------------------------
  // Per-Day Breakdown panel
  // ----------------------------------------------------------------
  function renderDayBreakdownPanel() {
    if (!attState) return;
    const st = attState;

    let html = '<h4 style="color:#0d4d26;margin:0 0 10px;">' + esc(st.cls) + ' — ' + esc(st.termLabel) + '</h4>';
    html += '<p style="font-size:11px;color:#666;margin:0 0 8px;">One row per school day. Holidays marked in red.</p>';
    html += '<div style="overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:820px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">Week</th>';
    html += '<th style="text-align:left;padding:6px;">Date</th>';
    html += '<th style="text-align:left;padding:6px;">Day</th>';
    html += '<th style="padding:6px;">🌅 M</th>';
    html += '<th style="padding:6px;">🌇 A</th>';
    html += '<th style="padding:6px;">♂</th>';
    html += '<th style="padding:6px;">♀</th>';
    html += '<th style="padding:6px;">Expected</th>';
    html += '<th style="padding:6px;">Confirmed</th>';
    html += '<th style="padding:6px;">%</th>';
    html += '</tr></thead><tbody>';

    let tM = 0, tA = 0, tBoys = 0, tGirls = 0, tExpected = 0, tConfirmed = 0, tGenderKnown = false;

    st.weeks.forEach(function (wk) {
      wk.days.forEach(function (d) {
        if (d.isHoliday) {
          html += '<tr style="background:#ffe6e6;">' +
                  '<td style="padding:4px 6px;border-bottom:1px solid #eee;">Wk ' + wk.weekNumber + '</td>' +
                  '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + fmtDateShort_(d.date) + '</td>' +
                  '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(d.dayName || '') + '</td>' +
                  '<td colspan="7" style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;color:#721c24;font-weight:700;">HOLIDAY — ' + esc(d.holidayName || 'Holiday') + '</td>' +
                  '</tr>';
          return;
        }
        let mP = 0, aP = 0, boys = 0, girls = 0, genderKnown = false;
        st.learners.forEach(function (l) {
          const g = (l.gender || '').toLowerCase();
          const isBoy  = g.indexOf('male') === 0 && g.indexOf('female') === -1;
          const isGirl = g.indexOf('female') === 0;
          const mark = attEffectiveMark(l.id, d.date);
          const ma = attMA(mark);
          if (ma.M === '\\') { mP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
          if (ma.A === '/')  { aP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
        });
        const expected = st.learners.length * 2;
        const confirmed = mP + aP;
        const pct = expected > 0 ? (confirmed / expected * 100).toFixed(1) : '0.0';

        tM += mP; tA += aP; tExpected += expected; tConfirmed += confirmed;
        if (genderKnown) { tBoys += boys; tGirls += girls; tGenderKnown = true; }

        html += '<tr>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;">Wk ' + wk.weekNumber + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + fmtDateShort_(d.date) + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(d.dayName || '') + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + mP + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + aP + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + (genderKnown ? boys : '—') + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + (genderKnown ? girls : '—') + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + expected + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + confirmed + '</td>' +
                '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + pct + '%</td>' +
                '</tr>';
      });
    });

    const tPct = tExpected > 0 ? (tConfirmed / tExpected * 100).toFixed(1) : '0.0';
    html += '<tr style="background:#e8f5e9;font-weight:700;">' +
            '<td colspan="3" style="padding:6px;">TERM</td>' +
            '<td style="padding:6px;text-align:center;">' + tM + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tA + '</td>' +
            '<td style="padding:6px;text-align:center;">' + (tGenderKnown ? tBoys : '—') + '</td>' +
            '<td style="padding:6px;text-align:center;">' + (tGenderKnown ? tGirls : '—') + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tExpected + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tConfirmed + '</td>' +
            '<td style="padding:6px;text-align:center;">' + tPct + '%</td>' +
            '</tr>';
    html += '</tbody></table></div>';

    setHTML('dayBreakdownBody', html);
  }

  // ----------------------------------------------------------------
  // Week Signatures panel
  // ----------------------------------------------------------------
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

    let html = '<p style="font-size:11px;color:#666;margin:0 0 10px;">Sign each week as it is completed. Week column shows the week-ending date.</p>';
    html += '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:640px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">Week (Ending)</th>';
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
        '<td style="padding:4px 6px;border-bottom:1px solid #eee;font-weight:600;">Week ' + wk.weekNumber + ' — ' + fmtDateShort_(wk.weekEnding) + '</td>' +
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

  // ----------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------
  function fmtDateShort_(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ----------------------------------------------------------------
  // Print dialog + print output
  // ----------------------------------------------------------------
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

    // Also fetch the B/F map so we can print it in the analysis block.
    let bfMap = {};
    try {
      if (r && r.ok && r.data && (r.data.learners || []).length > 0 &&
          typeof window.TIS.getAttendanceTotalsInAcademicYear === 'function') {
        const ids = r.data.learners.map(function (l) { return l.id; });
        const bfR = await window.TIS.getAttendanceTotalsInAcademicYear(ids, parseInt(year, 10), term);
        if (bfR && bfR.ok && bfR.data) bfMap = bfR.data;
      }
    } catch (e) { /* non-fatal */ }

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
      'h3{font-size:14px;color:#0b6623;margin:18px 0 4px;border-top:2px solid #0b6623;padding-top:8px;}' +
      'table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px;}' +
      'th{background:#0b6623;color:#fff;padding:3px;border:1px solid #333;}' +
      'td{padding:3px;border:1px solid #999;text-align:center;}' +
      'td.name{text-align:left;font-weight:600;}' +
      'td.m-hol{background:#ffcdd2;color:#721c24;}' +
      'td.m-ok{background:#d4edda;}' +
      'tr.term-row td{background:#e8f5e9;font-weight:700;}' +
      'tr.hol-row td{background:#ffe6e6;color:#721c24;font-weight:700;}' +
      '.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:8px;}' +
      '.summary-card{border:1px solid #c8e6c9;border-radius:4px;padding:6px 8px;background:#f1f8e9;}' +
      '.summary-card .lbl{font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;}' +
      '.summary-card .val{font-size:14px;font-weight:900;color:#0b6623;}' +
      '.sig-block{margin-top:16px;border-top:1px dashed #999;padding-top:10px;}' +
      '.sig-row{display:flex;justify-content:space-between;font-size:10px;margin-top:14px;}' +
      '.sig-line{flex:1;border-bottom:1px solid #000;margin:0 10px;}' +
      '@media print { h2, h3 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }' +
      '</style>';

    // ----------------------------------------------------------------
    // Local helpers (do not depend on DOM state)
    // ----------------------------------------------------------------
    function summariseWeek(wk) {
      let openSlots = 0;
      wk.days.forEach(function (d) { if (!d.isHoliday) openSlots += 2; });
      let mP = 0, aP = 0, boys = 0, girls = 0, genderKnown = false;
      data.learners.forEach(function (l) {
        const g = (l.gender || '').toLowerCase();
        const isBoy  = g.indexOf('male') === 0 && g.indexOf('female') === -1;
        const isGirl = g.indexOf('female') === 0;
        wk.days.forEach(function (d) {
          if (d.isHoliday) return;
          const ma = attMA((d.marksByLearner || {})[l.id] || 'O O');
          if (ma.M === '\\') { mP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
          if (ma.A === '/')  { aP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
        });
      });
      const mExpected = openSlots * data.learners.length;
      const aExpected = openSlots * data.learners.length;
      const combExpected = mExpected + aExpected;
      const combPresent  = mP + aP;
      return {
        openSlots: openSlots,
        mPresent: mP, mExpected: mExpected,
        aPresent: aP, aExpected: aExpected,
        boys: genderKnown ? boys : null,
        girls: genderKnown ? girls : null,
        pct: combExpected > 0 ? (combPresent / combExpected * 100).toFixed(1) : '0.0'
      };
    }

    function learnerWeekTotal(l, wk) {
      let n = 0;
      wk.days.forEach(function (d) {
        if (d.isHoliday) return;
        const ma = attMA((d.marksByLearner || {})[l.id] || 'O O');
        if (ma.M === '\\') n++;
        if (ma.A === '/')  n++;
      });
      return n;
    }

    function learnerTermTotal(l) {
      let n = 0;
      data.weeks.forEach(function (wk) { n += learnerWeekTotal(l, wk); });
      return n;
    }

    // ----------------------------------------------------------------
    // HTML build
    // ----------------------------------------------------------------
    let html = '<html><head><title>Attendance — ' + esc(cls) + '</title>' + css + '</head><body>';
    html += '<div class="hdr">';
    html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:52px;">';
    html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1><div style="font-size:11px;color:#666;">' +
            esc(cls) + ' — ' + esc(data.termLabel) + ' · Printed ' + new Date().toLocaleDateString() +
            '</div></div>';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:52px;">';
    html += '</div>';

    // ----------------------------------------------------------------
    // Part 1 — weekly grids (unchanged behavior)
    // ----------------------------------------------------------------
    weeksToShow.forEach(function (wk) {
      html += '<h2>Week ' + wk.weekNumber + ' — Ending ' + fmtDateShort_(wk.weekEnding) + '</h2>';
      html += '<table><thead><tr><th>PIN</th><th>Name</th><th>Sex</th><th>Age</th>';
      wk.days.forEach(function (d, i) {
        html += '<th colspan="2">' + ['Mon','Tue','Wed','Thu','Fri'][i] + '<br>' + fmtDateShort_(d.date) +
                (d.isHoliday ? '<br>' + esc(d.holidayName || 'Holiday') : '') + '</th>';
      });
      html += '<th>Wkly</th><th>Term</th><th>B/F</th><th>AY</th></tr><tr><th colspan="4"></th>';
      wk.days.forEach(function (d) {
        if (d.isHoliday) html += '<th colspan="2" class="m-hol">Holiday</th>';
        else html += '<th>M</th><th>A</th>';
      });
      html += '<th></th><th></th><th></th><th></th></tr></thead><tbody>';

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
          if (d.isHoliday) { html += '<td colspan="2" class="m-hol">—</td>'; return; }
          const mark = (d.marksByLearner || {})[l.id] || 'O O';
          const ma = attMA(mark);
          html += '<td class="' + (ma.M === '\\' ? 'm-ok' : '') + '">' + ma.M + '</td>';
          html += '<td class="' + (ma.A === '/'  ? 'm-ok' : '') + '">' + ma.A + '</td>';
          if (ma.M === '\\') wkPresent++;
          if (ma.A === '/')  wkPresent++;
        });
        const termTot = learnerTermTotal(l);
        const bf      = bfMap[l.id] || 0;
        const ay      = bf + termTot;
        html += '<td><b>' + wkPresent + '</b></td>';
        html += '<td>' + termTot + '</td>';
        html += '<td>' + bf + '</td>';
        html += '<td>' + ay + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
    });

    // ----------------------------------------------------------------
    // Part 2 — Class Analysis (weekly + term)
    // ----------------------------------------------------------------
    html += '<h3>Class Analysis — ' + esc(cls) + ' (' + esc(data.termLabel) + ')</h3>';
    html += '<table><thead><tr>';
    html += '<th>Week</th><th>Ending</th><th>Open (M+A)</th>';
    html += '<th>M present</th><th>A present</th>';
    html += '<th>Boys</th><th>Girls</th>';
    html += '<th>Expected</th><th>Confirmed</th><th>%</th>';
    html += '</tr></thead><tbody>';

    let tOpen = 0, tM = 0, tA = 0, tBoys = 0, tGirls = 0, tExpected = 0, tConfirmed = 0, tGenderKnown = false;
    data.weeks.forEach(function (wk) {
      const s = summariseWeek(wk);
      const expected  = s.mExpected + s.aExpected;
      const confirmed = s.mPresent + s.aPresent;
      tOpen += s.openSlots; tM += s.mPresent; tA += s.aPresent;
      tExpected += expected; tConfirmed += confirmed;
      if (s.boys !== null)  { tBoys  += s.boys;  tGenderKnown = true; }
      if (s.girls !== null) { tGirls += s.girls; tGenderKnown = true; }
      html += '<tr>' +
              '<td>Week ' + wk.weekNumber + '</td>' +
              '<td>' + fmtDateShort_(wk.weekEnding) + '</td>' +
              '<td>' + s.openSlots + '</td>' +
              '<td>' + s.mPresent + '</td>' +
              '<td>' + s.aPresent + '</td>' +
              '<td>' + (s.boys === null ? '—' : s.boys) + '</td>' +
              '<td>' + (s.girls === null ? '—' : s.girls) + '</td>' +
              '<td>' + expected + '</td>' +
              '<td>' + confirmed + '</td>' +
              '<td>' + s.pct + '%</td>' +
              '</tr>';
    });
    const tPct = tExpected > 0 ? (tConfirmed / tExpected * 100).toFixed(1) : '0.0';
    html += '<tr class="term-row">' +
            '<td>TERM</td><td></td>' +
            '<td>' + tOpen + '</td>' +
            '<td>' + tM + '</td>' +
            '<td>' + tA + '</td>' +
            '<td>' + (tGenderKnown ? tBoys : '—') + '</td>' +
            '<td>' + (tGenderKnown ? tGirls : '—') + '</td>' +
            '<td>' + tExpected + '</td>' +
            '<td>' + tConfirmed + '</td>' +
            '<td>' + tPct + '%</td>' +
            '</tr>';
    html += '</tbody></table>';

    // ----------------------------------------------------------------
    // Part 3 — Per-Day Breakdown
    // ----------------------------------------------------------------
    html += '<h3>Per-Day Breakdown — ' + esc(cls) + '</h3>';
    html += '<table><thead><tr>';
    html += '<th>Week</th><th>Date</th><th>Day</th>';
    html += '<th>M</th><th>A</th><th>Boys</th><th>Girls</th>';
    html += '<th>Expected</th><th>Confirmed</th><th>%</th>';
    html += '</tr></thead><tbody>';

    let dM = 0, dA = 0, dBoys = 0, dGirls = 0, dExpected = 0, dConfirmed = 0, dGenderKnown = false;
    data.weeks.forEach(function (wk) {
      wk.days.forEach(function (d) {
        if (d.isHoliday) {
          html += '<tr class="hol-row">' +
                  '<td>Wk ' + wk.weekNumber + '</td>' +
                  '<td>' + fmtDateShort_(d.date) + '</td>' +
                  '<td>' + esc(d.dayName || '') + '</td>' +
                  '<td colspan="7">HOLIDAY — ' + esc(d.holidayName || 'Holiday') + '</td>' +
                  '</tr>';
          return;
        }
        let mP = 0, aP = 0, boys = 0, girls = 0, genderKnown = false;
        data.learners.forEach(function (l) {
          const g = (l.gender || '').toLowerCase();
          const isBoy  = g.indexOf('male') === 0 && g.indexOf('female') === -1;
          const isGirl = g.indexOf('female') === 0;
          const ma = attMA((d.marksByLearner || {})[l.id] || 'O O');
          if (ma.M === '\\') { mP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
          if (ma.A === '/')  { aP++; if (isBoy) { boys++; genderKnown = true; } else if (isGirl) { girls++; genderKnown = true; } }
        });
        const expected  = data.learners.length * 2;
        const confirmed = mP + aP;
        const pct = expected > 0 ? (confirmed / expected * 100).toFixed(1) : '0.0';
        dM += mP; dA += aP; dExpected += expected; dConfirmed += confirmed;
        if (genderKnown) { dBoys += boys; dGirls += girls; dGenderKnown = true; }
        html += '<tr>' +
                '<td>Wk ' + wk.weekNumber + '</td>' +
                '<td>' + fmtDateShort_(d.date) + '</td>' +
                '<td>' + esc(d.dayName || '') + '</td>' +
                '<td>' + mP + '</td>' +
                '<td>' + aP + '</td>' +
                '<td>' + (genderKnown ? boys : '—') + '</td>' +
                '<td>' + (genderKnown ? girls : '—') + '</td>' +
                '<td>' + expected + '</td>' +
                '<td>' + confirmed + '</td>' +
                '<td>' + pct + '%</td>' +
                '</tr>';
      });
    });
    const dPct = dExpected > 0 ? (dConfirmed / dExpected * 100).toFixed(1) : '0.0';
    html += '<tr class="term-row">' +
            '<td colspan="3">TERM</td>' +
            '<td>' + dM + '</td>' +
            '<td>' + dA + '</td>' +
            '<td>' + (dGenderKnown ? dBoys : '—') + '</td>' +
            '<td>' + (dGenderKnown ? dGirls : '—') + '</td>' +
            '<td>' + dExpected + '</td>' +
            '<td>' + dConfirmed + '</td>' +
            '<td>' + dPct + '%</td>' +
            '</tr>';
    html += '</tbody></table>';

    // ----------------------------------------------------------------
    // Part 4 — Class totals summary block
    // ----------------------------------------------------------------
    let classBf = 0, classAy = 0;
    data.learners.forEach(function (l) {
      const bf = bfMap[l.id] || 0;
      classBf += bf;
      classAy += bf + learnerTermTotal(l);
    });

    html += '<h3>Class Totals</h3>';
    html += '<div class="summary-grid">';
    html += '<div class="summary-card"><div class="lbl">Sum total school-open (term)</div><div class="val">' + tOpen + '</div></div>';
    html += '<div class="summary-card"><div class="lbl">Sum total attendance (term)</div><div class="val">' + tConfirmed + '</div></div>';
    html += '<div class="summary-card"><div class="lbl">Boys present (term)</div><div class="val">' + (tGenderKnown ? tBoys : '—') + '</div></div>';
    html += '<div class="summary-card"><div class="lbl">Girls present (term)</div><div class="val">' + (tGenderKnown ? tGirls : '—') + '</div></div>';
    html += '<div class="summary-card"><div class="lbl">Average attendance</div><div class="val">' + tPct + '%</div></div>';
    html += '<div class="summary-card"><div class="lbl">Class B/F (prior terms this year)</div><div class="val">' + classBf + '</div></div>';
    html += '<div class="summary-card"><div class="lbl">Class AY Total (B/F + this term)</div><div class="val">' + classAy + '</div></div>';
    html += '</div>';

    // ----------------------------------------------------------------
    // Part 5 — Signature block
    // ----------------------------------------------------------------
    html += '<div class="sig-block">';
    html += '<div style="font-size:11px;color:#555;">Prepared and confirmed by:</div>';
    html += '<div class="sig-row">';
    html += '<span>Logged By</span><span class="sig-line"></span><span style="min-width:100px;">Date</span><span class="sig-line" style="max-width:140px;"></span>';
    html += '</div>';
    html += '<div class="sig-row">';
    html += '<span>Confirmed By</span><span class="sig-line"></span><span style="min-width:100px;">Date</span><span class="sig-line" style="max-width:140px;"></span>';
    html += '</div>';
    html += '<div class="sig-row">';
    html += '<span>Audited By</span><span class="sig-line"></span><span style="min-width:100px;">Date</span><span class="sig-line" style="max-width:140px;"></span>';
    html += '</div>';
    html += '</div>';

    html += '</body></html>';
    w.document.write(html);
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }
  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.initLearnerAttendanceTab    = initLearnerAttendanceTab;
  window.loadAttendanceRegister      = loadAttendanceRegister;
  window.attToggleWeek               = attToggleWeek;
  window.attCycleCell                = attCycleCell;
  window.attMarkClassPresent         = attMarkClassPresent;
  window.attSaveAllChanges           = attSaveAllChanges;
  window.attDiscardChanges           = attDiscardChanges;
  window.attOpenPrintDialog          = attOpenPrintDialog;
  window.attClosePrintDialog         = attClosePrintDialog;
  window.attRunPrint                 = attRunPrint;
  window.renderClassAnalysisPanel    = renderClassAnalysisPanel;
  window.renderDayBreakdownPanel     = renderDayBreakdownPanel;
  window.renderSignaturePanel        = renderSignaturePanel;
  window.attSaveSignatures           = attSaveSignatures;
  window.attApplyHolidayMove         = attApplyHolidayMove;
  window.attRenderHolidayList        = attRenderHolidayList;
  
    // ================================================================
  // [S11] STAFF ATTENDANCE
  //   • Today's list — every active staff member, marked or not
  //   • Manual clock in / clock out via modal
  //   • Movement log (in/out during the day)
  //   • Monthly view (per staff, aggregated)
  //   • Archive list (read-only, one row per month)
  // All calls are guarded by try/finally so the spinner always stops.
  // ================================================================
  const STAFF_ATT_TODAY = function () { return todayISO(); };

  async function initStaffAttendanceTab() {
    const r1 = $('btnRefreshStaffAtt');
    if (r1 && !r1.__wired) { r1.addEventListener('click', refreshStaffAttendance); r1.__wired = true; }

    const r2 = $('btnManualStaffEntry');
    if (r2 && !r2.__wired) { r2.addEventListener('click', openManualStaffEntryModal); r2.__wired = true; }

    const r3 = $('btnViewArchivedMonths');
    if (r3 && !r3.__wired) { r3.addEventListener('click', loadArchiveList); r3.__wired = true; }

    const r4 = $('btnRunStaffArchive');
    if (r4 && !r4.__wired) {
      r4.addEventListener('click', function () {
        showToast('Archive is coming with the API layer', 'info');
      });
      r4.__wired = true;
    }

    await refreshStaffAttendance();
  }

  async function refreshStaffAttendance() {
    try {
      await loadStaffAttendanceToday();
      await loadMovementLogToday();
      await loadStaffMonthlyCurrent();
      await loadArchiveList();
    } catch (err) {
      console.error('[refreshStaffAttendance]', err);
      showToast('Could not refresh staff attendance: ' + (err && err.message || err), 'error');
    }
  }

  // ---------------- Today's list ----------------
  async function loadStaffAttendanceToday() {
    setHTML('staffAttList', pageLoaderHTML('Loading staff attendance…'));
    startLoader();
    try {
      if (typeof window.TIS.listStaffAttendanceToday !== 'function') {
        setHTML('staffAttList', errorHTML(
          'Staff Attendance not ready',
          'The Supabase client is missing listStaffAttendanceToday(). Add it to supabase-client.js.'
        ));
        return;
      }
      if (typeof window.TIS.listStaff !== 'function') {
        setHTML('staffAttList', errorHTML('Staff list not available', 'window.TIS.listStaff is missing.'));
        return;
      }

      const [r, staffRes] = await Promise.all([
        window.TIS.listStaffAttendanceToday(STAFF_ATT_TODAY()),
        window.TIS.listStaff()
      ]);

      if (!r || !r.ok) {
        setHTML('staffAttList', errorHTML(
          'Could not load attendance',
          (r && r.error) || 'Unknown error from attendance_staff.'
        ));
        return;
      }
      if (!staffRes || !staffRes.ok) {
        setHTML('staffAttList', errorHTML(
          'Could not load staff',
          (staffRes && staffRes.error) || 'Unknown error from staff.'
        ));
        return;
      }

      const todayRows = r.data || [];
      const staff = (staffRes.data || []).filter(function (s) {
        return (s.status || 'Active') === 'Active';
      });

      if (staff.length === 0) {
        setHTML('staffAttList', emptyHTML('fa-user-clock', 'No active staff', 'Add staff first.'));
        return;
      }

      const map = {};
      todayRows.forEach(function (row) { map[row.staff_id] = row; });

      let html = '';
      staff.forEach(function (s) {
        const row = map[s.id];
        const stateLabel = row ? (row.status || 'Present') : 'Not Marked';
        const clockIn  = row && row.clock_in  ? row.clock_in  : '—';
        const clockOut = row && row.clock_out ? row.clock_out : '—';
        html += '<div class="staff-card">';
        html +=   '<div class="sc-info">';
        html +=     '<div class="sc-name">' + esc(s.full_name || '') + '</div>';
        html +=     '<div class="sc-detail">' + esc(s.department || '') + ' • ID: ' + esc(s.staff_id || '') + '</div>';
        html +=     '<div class="sc-detail">In: ' + esc(clockIn) + ' • Out: ' + esc(clockOut) + '</div>';
        html +=   '</div>';
        html +=   '<div class="sc-badge">' + esc(stateLabel) + '</div>';
        html += '</div>';
      });
      setHTML('staffAttList', html);
      renderStaffAttendanceStats(staff, todayRows);
    } catch (err) {
      console.error('[loadStaffAttendanceToday]', err);
      setHTML('staffAttList', errorHTML('Unexpected error', String((err && err.message) || err)));
    } finally {
      stopLoader();
    }
  }

  function renderStaffAttendanceStats(staff, todayRows) {
    let present = 0, late = 0, absent = 0, unmarked = 0;
    const byId = {};
    todayRows.forEach(function (row) { byId[row.staff_id] = row; });
    staff.forEach(function (s) {
      const row = byId[s.id];
      if (!row) { unmarked++; return; }
      const st = (row.status || 'Present').toLowerCase();
      if (st === 'present') present++;
      else if (st === 'late') late++;
      else if (st === 'absent') absent++;
      else unmarked++;
    });
    setHTML('staffAttStats',
      '<div class="stat-card"><div class="stat-label">Total Active</div><div class="stat-value">' + staff.length + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Present</div><div class="stat-value gold">' + present + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Late</div><div class="stat-value red">' + late + '</div></div>' +
      '<div class="stat-card blue"><div class="stat-label">Unmarked</div><div class="stat-value" style="color:#1a5276;">' + unmarked + '</div></div>');
  }

  // ---------------- Movement log ----------------
  async function loadMovementLogToday() {
    setHTML('movementLogList', pageLoaderHTML('Loading movements…'));
    try {
      if (typeof window.TIS.listStaffMovementsToday !== 'function') {
        setHTML('movementLogList', emptyHTML('fa-route', 'Movement log not available'));
        return;
      }
      const r = await window.TIS.listStaffMovementsToday(STAFF_ATT_TODAY());
      if (!r || !r.ok) {
        setHTML('movementLogList', errorHTML('Could not load movements', (r && r.error) || 'Unknown error'));
        return;
      }
      const rows = r.data || [];
      if (rows.length === 0) {
        setHTML('movementLogList', emptyHTML('fa-route', 'No movements today'));
        return;
      }
      const staffRes = await window.TIS.listStaff();
      const staffMap = {};
      ((staffRes && staffRes.ok && staffRes.data) || []).forEach(function (s) { staffMap[s.id] = s; });

      let html = '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#0d4d26;color:#fff;">';
      html += '<th style="padding:6px;text-align:left;">Staff</th>';
      html += '<th style="padding:6px;">Out</th>';
      html += '<th style="padding:6px;">In</th>';
      html += '<th style="padding:6px;text-align:left;">Reason</th>';
      html += '<th style="padding:6px;text-align:left;">Destination</th>';
      html += '</tr></thead><tbody>';
      rows.forEach(function (m) {
        const s = staffMap[m.staff_id] || {};
        html += '<tr>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(s.full_name || m.staff_id) + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(m.time_out || '—') + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + esc(m.time_in || '—') + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(m.reason || '') + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(m.destination || '') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      setHTML('movementLogList', html);
    } catch (err) {
      console.error('[loadMovementLogToday]', err);
      setHTML('movementLogList', errorHTML('Unexpected error', String((err && err.message) || err)));
    }
  }

  // ---------------- Monthly view ----------------
  async function loadStaffMonthlyCurrent() {
    setHTML('staffMonthlyView', pageLoaderHTML('Loading month…'));
    try {
      if (typeof window.TIS.listStaffAttendanceRange !== 'function') {
        setHTML('staffMonthlyView', emptyHTML('fa-calendar-day', 'Monthly view not available'));
        return;
      }
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const first = new Date(y, m, 1);
      const last  = new Date(y, m + 1, 0);
      const iso = function (d) {
        return d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
      };
      const r = await window.TIS.listStaffAttendanceRange(iso(first), iso(last));
      if (!r || !r.ok) {
        setHTML('staffMonthlyView', errorHTML('Could not load month', (r && r.error) || 'Unknown error'));
        return;
      }
      const rows = r.data || [];
      if (rows.length === 0) {
        setHTML('staffMonthlyView', emptyHTML('fa-calendar-day', 'No records this month'));
        return;
      }

      const staffRes = await window.TIS.listStaff();
      const staffMap = {};
      ((staffRes && staffRes.ok && staffRes.data) || []).forEach(function (s) { staffMap[s.id] = s; });

      const agg = {};
      rows.forEach(function (row) {
        const key = row.staff_id;
        if (!agg[key]) agg[key] = { present: 0, late: 0, absent: 0, days: 0 };
        agg[key].days++;
        const st = (row.status || 'Present').toLowerCase();
        if (st === 'present') agg[key].present++;
        else if (st === 'late') agg[key].late++;
        else if (st === 'absent') agg[key].absent++;
      });

      let html = '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead><tr style="background:#0d4d26;color:#fff;">';
      html += '<th style="padding:6px;text-align:left;">Staff</th>';
      html += '<th style="padding:6px;">Days Logged</th>';
      html += '<th style="padding:6px;">Present</th>';
      html += '<th style="padding:6px;">Late</th>';
      html += '<th style="padding:6px;">Absent</th>';
      html += '</tr></thead><tbody>';
      Object.keys(agg).forEach(function (id) {
        const s = staffMap[id] || {};
        const a = agg[id];
        html += '<tr>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(s.full_name || id) + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + a.days + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + a.present + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + a.late + '</td>';
        html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' + a.absent + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table>';
      setHTML('staffMonthlyView', html);
    } catch (err) {
      console.error('[loadStaffMonthlyCurrent]', err);
      setHTML('staffMonthlyView', errorHTML('Unexpected error', String((err && err.message) || err)));
    }
  }

  // ---------------- Archive list ----------------
  async function loadArchiveList() {
    setHTML('archiveList', emptyHTML('fa-history', 'No archived months yet'));
  }

  // ---------------- Manual entry modal ----------------
  function openManualStaffEntryModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Staff Entry</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Staff ID</label><input id="se_staffId" placeholder="e.g. TIS2629"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Action</label><select id="se_action">' +
      '<option value="in">Clock In</option><option value="out">Clock Out</option>' +
      '</select></div></div>' +
      '<div style="text-align:right;margin-top:16px;">' +
      '<button class="btn btn-secondary" onclick="TIS.closeModal()">Cancel</button> ' +
      '<button class="btn btn-success" id="se_submit" type="button">Submit</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    const btn = $('se_submit');
    if (btn) btn.addEventListener('click', submitManualStaffEntry);
  }

  async function submitManualStaffEntry() {
    const staffIdEl = $('se_staffId');
    const actionEl  = $('se_action');
    const staffId = staffIdEl ? staffIdEl.value.trim() : '';
    const action  = actionEl  ? actionEl.value : 'in';
    if (!staffId) { showToast('Enter a staff ID', 'warning'); return; }

    startLoader();
    try {
      const staffRes = await window.TIS.listStaff();
      if (!staffRes || !staffRes.ok) {
        showToast('Could not load staff: ' + ((staffRes && staffRes.error) || 'unknown'), 'error');
        return;
      }
      const staff = (staffRes.data || []).find(function (s) {
        return String(s.staff_id || '').toUpperCase() === String(staffId).toUpperCase();
      });
      if (!staff) { showToast('Staff not found: ' + staffId, 'error'); return; }

      const now = new Date();
      const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const payload = {
        staff_id: staff.id,
        attendance_date: STAFF_ATT_TODAY(),
        status: 'Present',
        logged_by: (State.profile && State.profile.name) || 'Portal',
        source: 'Manual'
      };
      if (action === 'in')  payload.clock_in  = t;
      if (action === 'out') payload.clock_out = t;

      if (typeof window.TIS.upsertStaffAttendance !== 'function') {
        showToast('upsertStaffAttendance not available', 'error');
        return;
      }
      const r = await window.TIS.upsertStaffAttendance(payload);
      if (!r || !r.ok) {
        showToast((r && r.error) || 'Could not save', 'error');
        return;
      }
      showToast('Recorded at ' + t, 'success');
      closeModal();
      refreshStaffAttendance();
    } finally {
      stopLoader();
    }
  }

  // ---------------- Public API ----------------
  window.initStaffAttendanceTab = initStaffAttendanceTab;
  window.refreshStaffAttendance = refreshStaffAttendance;
  window.loadStaffAttendanceToday = loadStaffAttendanceToday;
  window.loadMovementLogToday = loadMovementLogToday;
  window.loadStaffMonthlyCurrent = loadStaffMonthlyCurrent;
  window.loadArchiveList = loadArchiveList;
  window.openManualStaffEntryModal = openManualStaffEntryModal;
  window.submitManualStaffEntry = submitManualStaffEntry;
  
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
  // [S14] QR — staff clock-in token
  // ================================================================
  async function loadActiveQR() {
    setHTML('qrContent', pageLoaderHTML('Loading QR code…'));
    const r = await window.TIS.getActiveQRToken();
    if (!r || !r.ok) {
      setHTML('qrContent', errorHTML('Could not load QR code', r && r.error));
      return;
    }
    if (!r.data) {
      setHTML('qrContent', emptyHTML('fa-qrcode', 'No active QR code',
        'Click Generate New QR to create one.'));
      return;
    }
    renderQR(r.data);
  }

  function renderQR(row) {
    const token = row.token || '';
    const base = window.location.origin + window.location.pathname;
    const payload = base + '?qrtoken=' + encodeURIComponent(token);
    const imgUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=' +
                   encodeURIComponent(payload);
        const generated = row.generated_at ? new Date(row.generated_at).toLocaleString() : '—';
    const expires   = row.expires_at   ? new Date(row.expires_at).toLocaleDateString()  : '—';

    let html = '<div class="card-bg qr-box" style="text-align:center;padding:24px;">';
    html += '<img src="' + esc(imgUrl) + '" alt="QR code" style="max-width:340px;width:100%;border:6px solid #d4a017;border-radius:14px;background:#fff;padding:8px;">';
    html += '<div style="margin-top:14px;font-size:12px;color:#666;">';
    html += '<div>Token: <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;">' + esc(token) + '</code></div>';
    html += '<div>Generated: ' + esc(generated) + '</div>';
    html += '<div>Expires: ' + esc(expires) + '</div>';
    html += '</div>';
    html += '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">';
    html += '<a href="' + esc(imgUrl) + '" target="_blank" class="btn btn-primary"><i class="fas fa-download"></i> Open Full Size</a> ';
    html += '<button class="btn btn-secondary" onclick="copyQRToken(\'' + escAttr(token) + '\')"><i class="fas fa-copy"></i> Copy Token</button>';
    html += '</div>';
    html += '<div style="margin-top:14px;font-size:11px;color:#666;max-width:480px;margin-left:auto;margin-right:auto;line-height:1.5;">';
    html += 'Print this QR code and post it at the school gate. Staff scan it with their phone camera to clock in. ';
    html += 'The camera opens the URL encoded in the code, which records their clock-in automatically.';
    html += '</div></div>';
    setHTML('qrContent', html);
  }

  async function generateQR() {
    if (!confirm('Generate a new QR code?\n\nThe current one stops working immediately. Staff must use the new code from now on.')) return;

    startLoader();
    const r = await window.TIS.generateQRToken(
      (State.profile && State.profile.name) || 'Portal'
    );
    stopLoader();

    if (r && r.ok) {
      showToast('New QR code generated', 'success');
      renderQR(r.data);
    } else {
      showToast('Could not generate QR: ' + ((r && r.error) || 'unknown'), 'error');
    }
  }

  function copyQRToken(token) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(token).then(function () {
        showToast('Token copied', 'success');
      }, function () {
        showToast('Copy manually: ' + token, 'info');
      });
    } else {
      showToast('Copy manually: ' + token, 'info');
    }
  }

  function initQRTab() {
    const g = document.getElementById('btnGenerateQR');
    if (g && !g.__wired) {
      g.addEventListener('click', function (e) { e.preventDefault(); generateQR(); });
      g.__wired = true;
    }
    const s = document.getElementById('btnShowActiveQR');
    if (s && !s.__wired) {
      s.addEventListener('click', function (e) { e.preventDefault(); loadActiveQR(); });
      s.__wired = true;
    }
    // Load once on tab entry.
    loadActiveQR();
  }

  // ---------- QR SCAN HANDLER (runs at boot if the URL contains ?qrtoken=) ----------
  async function handleQRScanIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('qrtoken');
    if (!token) return false;

    // Confirm the token is still active.
    startLoader();
    const r = await window.TIS.getQRTokenByValue(token);
    stopLoader();

if (!r || !r.ok || !r.data || r.data.is_active !== true) {
      document.body.innerHTML =
        '<div style="font-family:Arial;padding:40px;text-align:center;color:#c0392b;">' +
        '<h1>Invalid or expired QR code</h1>' +
        '<p>The code you scanned is no longer active. Ask the school office for the current one.</p>' +
        '</div>';
      return true;
    }

    // Ask the user for their staff ID, then record a clock-in.
    const staffId = prompt('Enter your Staff ID to clock in:');
    if (!staffId) {
      document.body.innerHTML =
        '<div style="font-family:Arial;padding:40px;text-align:center;">' +
        '<h1>Clock-in cancelled</h1><p>Reload the page or scan the QR code again to try.</p></div>';
      return true;
    }

    // Look up the staff.
    startLoader();
    const staffR = await window.TIS.listStaff();
    stopLoader();

    const staff = (staffR && staffR.ok ? staffR.data : []).find(function (s) {
      return String(s.staff_id || '').toUpperCase() === String(staffId).trim().toUpperCase();
    });

    if (!staff) {
      document.body.innerHTML =
        '<div style="font-family:Arial;padding:40px;text-align:center;color:#c0392b;">' +
        '<h1>Staff ID not found</h1><p>Check the ID and try again, or contact the office.</p>' +
        '<p style="font-size:13px;color:#666;">You entered: ' + esc(staffId) + '</p></div>';
      return true;
    }

    // Record clock-in for today.
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    startLoader();
    const upR = await window.TIS.upsertStaffAttendance({
      staff_id:        staff.id,
      attendance_date: dateISO,
      clock_in:        t,
      status:          'Present',
      logged_by:       'QR scan'
    });
    stopLoader();

    if (upR && upR.ok) {
      document.body.innerHTML =
        '<div style="font-family:Arial;padding:40px;text-align:center;">' +
        '<h1 style="color:#0d4d26;">✓ Clocked in</h1>' +
        '<p style="font-size:16px;">' + esc(staff.full_name || staffId) + '</p>' +
        '<p style="font-size:14px;color:#666;">at <strong>' + t + '</strong> on ' + dateISO + '</p>' +
        '<p style="margin-top:20px;"><a href="' + window.location.pathname + '" style="color:#0d4d26;">Back to portal</a></p>' +
        '</div>';
    } else {
      document.body.innerHTML =
        '<div style="font-family:Arial;padding:40px;text-align:center;color:#c0392b;">' +
        '<h1>Clock-in failed</h1>' +
        '<p>' + esc((upR && upR.error) || 'unknown error') + '</p></div>';
    }
    return true;
  }

  window.loadActiveQR    = loadActiveQR;
  window.generateQR      = generateQR;
  window.copyQRToken     = copyQRToken;
  window.handleQRScanIfPresent = handleQRScanIfPresent;
  window.initQRTab       = initQRTab;
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
    initLearnersTab();
    initStaffTab();
    initTermsWiring();
    initCalendarTab();
    initCalendarImportTab();
    initQRTab();
    initReportsTab();
    initClassesTab();
    initUsersTab();
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
