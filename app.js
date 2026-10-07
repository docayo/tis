// ================================================================
// BEFORE YOU TOUCH THIS FILE:
//   Read HANDOVER.md (repo root) or /handover (live URL).
//   It is the master reference for state, rules, and conventions.
//   Section map: [S01] STATE through [S22] RESULTS.
//   Sections [S01]–[S14], [S19], [S20], [S21] are frozen production.
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
//   [S21] ID CARDS
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
    'broadsheet', 'calendar', 'qr', 'reports', 'results',
    'classes', 'users', 'idcards'
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
      else if (name === 'idcards') initIDCardsTab();
      else if (name === 'results') initResultsTab();
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
  let __learnersShowInactive = false;   // toggled by the toolbar button

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
    // Fast path: if we already fetched in the last 10 minutes,
    // just re-render from cache. No network call.
    const now = Date.now();
    if (State.cachedLearners && State.cachedLearners.length > 0 &&
        State.learnersFetchedAt && (now - State.learnersFetchedAt) < 10 * 60 * 1000) {
      applyLearnerFilter();
      return;
    }

    setHTML('learnersGrid', pageLoaderHTML('Loading learners…'));
    startLoader();
    const r = await window.TIS.listLearners();
    stopLoader();
    if (!r || !r.ok) {
      setHTML('learnersGrid', errorHTML('Could not load learners', r && r.error));
      return;
    }
    State.cachedLearners = r.data || [];
    State.learnersFetchedAt = now;
    applyLearnerFilter();
  }

   // ================================================================
  // Single source of truth for "is this learner inactive?"
  // A learner is INACTIVE if ANY of the following is present:
  //   • date_of_withdrawal (the canonical exit date)
  //   • class_at_withdrawal (they were assigned an exit class)
  //   • exit_reason (they were given a reason to leave)
  // This matches how the office actually uses the form: sometimes
  // only the reason is recorded, sometimes only the date.
  // ================================================================
  function learnerIsInactive(l) {
    const date   = (l.date_of_withdrawal   || '').toString().trim();
    const klass  = (l.class_at_withdrawal  || '').toString().trim();
    const reason = (l.exit_reason          || '').toString().trim();
    const hasDate   = date   && date   !== 'N/A';
    const hasClass  = klass  && klass  !== 'N/A';
    const hasReason = reason && reason !== 'N/A';
    return !!(hasDate || hasClass || hasReason);
  }
  window.learnerIsInactive = learnerIsInactive;

  // Filter the cached learners based on the "show inactive" flag and
  // hand off to the renderer.
  function applyLearnerFilter() {
    const all = State.cachedLearners || [];
    const filtered = __learnersShowInactive
      ? all
      : all.filter(function (l) { return !learnerIsInactive(l); });
    renderLearners(filtered);
    renderLearnerStats(all);
  }
  window.applyLearnerFilter = applyLearnerFilter;

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
      if (learnerIsInactive(r)) exited++;
    });
    setHTML('learnerStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + total + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Active</div><div class="stat-value gold">' + (total - exited) + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Inactive</div><div class="stat-value red">' + exited + '</div></div>');
  }
  // ================================================================
  // View modal — three-tier permission gating
  //   A: everyone
  //   B: admin / super_admin
  //   C: super_admin only
  // ================================================================
  // ================================================================
  // Resolve the fee picture for one learner × term × year.
  //
  // Source of truth rule:
  //   • Before any naira hits learner_terms for that term → read
  //     fee_schedule + fee_adjustments LIVE. Office edits to the
  //     class bill or a learner adjustment show up immediately.
  //   • After the first part-payment is recorded → read
  //     learner_terms. The snapshot is now a receipt and is frozen.
  //
  // Returns an object with the same field names the modal and the
  // printed card have always used, so neither has to change its
  // shape — only where the numbers come from.
  // ================================================================
  function previousTermOf(termType, year) {
    const t = String(termType || '').trim().toLowerCase();
    if (t === '3rd') return { term_type: '2nd', year: Number(year) };
    if (t === '2nd') return { term_type: '1st', year: Number(year) };
    if (t === '1st') return { term_type: '3rd', year: Number(year) - 1 };
    return null;
  }
  window.previousTermOf = previousTermOf;

  async function resolveLearnerFeePicture(learner, termRow, term, year) {
    const empty = {
      source: 'none',
      tuition: 0, scholarship: 0, additions: 0,
      other_bills_major: 0, other_bills_minor: 0, books: 0,
      adjusted_tuition: 0,
      balance_bf: 0, net_bills: 0,
      total_part_payment: 0, balance_cf: 0,
      part_payments: [],
      cleared: '', clearance: '',
      schedule_found: false, adjustment_found: false
    };
    if (!learner || !learner.id || !term) return empty;

    // Does the snapshot already carry money?
    function snapshotHasMoney(row) {
      if (!row) return false;
      if (parseNum(row.total_part_payment) > 0) return true;
      for (let n = 1; n <= 5; n++) {
        if (parseNum(row['part_payment_' + n + '_amount']) > 0) return true;
      }
      return false;
    }

    const locked = snapshotHasMoney(termRow);

    // ---- Pull the live sources (used when not locked) ----
    let schedRow = null, adjRow = null;
    if (!locked) {
      const className = learner.class_name || (termRow && termRow.class_name) || '';
      if (className) {
        try {
          const sr = await window.TIS.getFeeScheduleRow(className, term.term_type, year);
          if (sr && sr.ok && sr.data) schedRow = sr.data;
        } catch (e) { /* silent */ }
      }
      try {
        const ar = await window.TIS.getFeeAdjustment(learner.id, term.term_type, year);
        if (ar && ar.ok && ar.data) adjRow = ar.data;
      } catch (e) { /* silent */ }
    }

    // ---- Assemble part-payment list (only exists on the snapshot) ----
    const ppList = [];
    if (termRow) {
      for (let n = 1; n <= 5; n++) {
        const dt = termRow['part_payment_' + n + '_date'];
        const am = termRow['part_payment_' + n + '_amount'];
        if ((!dt || dt === '') && (!am || am === '')) continue;
        ppList.push({ n: n, date: dt, amount: am });
      }
    }

    // ---- LOCKED: learner_terms is the receipt ----
    if (locked) {
      const tuition     = parseNum(termRow.tuition);
      const scholarship = parseNum(termRow.scholarship);
      const otherMajor  = parseNum(termRow.other_bills_major);
      const otherMinor  = parseNum(termRow.other_bills_minor);
      const books       = parseNum(termRow.books);
      const netBills    = tuition + otherMajor + otherMinor + books;
      return {
        source: 'snapshot',
        tuition: tuition,
        scholarship: scholarship,
        additions: parseNum(termRow.additions),
        other_bills_major: otherMajor,
        other_bills_minor: otherMinor,
        books: books,
        adjusted_tuition: tuition - scholarship,
        balance_bf: parseNum(termRow.balance_bf),
        net_bills: netBills,
        total_part_payment: parseNum(termRow.total_part_payment),
        balance_cf: parseNum(termRow.balance_cf),
        part_payments: ppList,
        cleared: termRow.cleared || '',
        clearance: termRow.clearance || '',
        schedule_found: false,
        adjustment_found: false
      };
    }

    // ---- NOT LOCKED: live schedule + live adjustment ----
    const tuition     = schedRow ? parseNum(schedRow.tuition)            : parseNum(termRow && termRow.tuition);
    const otherMajor  = schedRow ? parseNum(schedRow.other_bills_major)  : parseNum(termRow && termRow.other_bills_major);
    const otherMinor  = schedRow ? parseNum(schedRow.other_bills_minor)  : parseNum(termRow && termRow.other_bills_minor);
    const books       = schedRow ? parseNum(schedRow.books)              : parseNum(termRow && termRow.books);

    const additions   = adjRow ? parseNum(adjRow.additions)   : 0;
    const deductions  = adjRow ? parseNum(adjRow.deductions)  : 0;

    // Balance B/F still comes from the snapshot if it exists
    // (previous term carried it forward when the row was created).
    const balanceBf   = parseNum(termRow && termRow.balance_bf);

    // Net = class bill + additions − deductions
    const netBills    = tuition + otherMajor + otherMinor + books + additions - deductions;
    const adjusted    = tuition - deductions;

    // No payments yet by definition of this branch.
    const paid        = 0;
    const balanceCf   = netBills + balanceBf - paid;

    return {
      source: 'live',
      tuition: tuition,
      scholarship: deductions,       // shown as Scholarship on the card
      additions: additions,          // shown as Additions on the card
      other_bills_major: otherMajor,
      other_bills_minor: otherMinor,
      books: books,
      adjusted_tuition: adjusted,
      balance_bf: balanceBf,
      net_bills: netBills,
      total_part_payment: paid,
      balance_cf: balanceCf,
      part_payments: [],
      cleared: (termRow && termRow.cleared) || '',
      clearance: (termRow && termRow.clearance) || '',
      schedule_found: !!schedRow,
      adjustment_found: !!adjRow
    };
  }
  window.resolveLearnerFeePicture = resolveLearnerFeePicture;

  // ================================================================
  // View modal — three-tier permission gating
  //   A: everyone
  //   B: admin / super_admin
  //   C: super_admin only
  //
  // Fee picture (Section A "Balance C/F", Section B entirely):
  //   resolved by resolveLearnerFeePicture() above. Live from
  //   fee_schedule + fee_adjustments until a payment is recorded,
  //   then frozen from learner_terms.
  // ================================================================
  async function openLearnerViewModal(pin) {
    closeModal();
    startLoader();
    const learnerR = await window.TIS.getLearnerByPin(pin);
    const termsR   = learnerR && learnerR.ok && learnerR.data
      ? await window.TIS.getLearnerTermForActive(learnerR.data.id) : null;
    stopLoader();

    if (!learnerR || !learnerR.ok || !learnerR.data) {
      showToast('Could not load learner ' + pin, 'error');
      return;
    }
    const d = learnerR.data;
    const termRow = termsR && termsR.ok ? termsR.data.row : null;
    const term    = termsR && termsR.ok ? termsR.data.term : null;
    const termLabel = term ? term.label : 'No active term';

    // ---- Dynamic previous term, derived from the active term ----
    let prevTermRow = null;
    if (term) {
      const prev = previousTermOf(term.term_type, term.year);
      if (prev) {
        const prevR = await window.TIS.getLearnerTermFor(d.id, prev.term_type, prev.year);
        if (prevR && prevR.ok) prevTermRow = prevR.data;
      }
    }

    // ---- Resolve the fee picture for the active term ----
    const fee = await resolveLearnerFeePicture(d, termRow, term, term ? term.year : null);

    const canA = true;
    const canB = isAdmin();
    const canC = isSuperAdmin();

    const ph1 = phoneFor(d, 1);
    const ph2 = phoneFor(d, 2);
    const ph3 = phoneFor(d, 3);

    // Header card shows the "Balance C/F" number, sourced from
    // whichever side of the rule is in force.
    const headerBalance = fee.balance_cf;

    let ppRows = '';
    if (fee.part_payments.length) {
      fee.part_payments.forEach(function (p) {
        ppRows += '<div class="info-row" style="background:#f7fbf7;">' +
                  '<span class="info-label">Part Payment ' + p.n + '</span>' +
                  '<span class="info-value">' + fmtDateOrDash(p.date) + ' — ' + moneyOrDash(p.amount) + '</span></div>';
      });
    }

    const sourceNote = fee.source === 'snapshot'
      ? '<div style="font-size:10px;color:#666;margin-top:4px;">Fees from learner record (payment recorded).</div>'
      : (fee.source === 'live'
          ? '<div style="font-size:10px;color:#666;margin-top:4px;">Fees live from class bill' +
            (fee.adjustment_found ? ' + adjustment' : '') + '.</div>'
          : '');

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
      html += infoRow('Clearance Status', fee.cleared || '—');
      html += infoRow('Clearance Date', fee.clearance ? fmtDateOrDash(fee.clearance) : '—');
      html += infoRow('Balance C/F', moneyOrDash(headerBalance));
      html += '</div></div>';
    }

    if (canB) {
      html += '<div class="expandable open lbSec"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">Section B — Fees (' + esc(termLabel) + ')</div><div class="expandable-body">';
      html += infoRow('Previous Term Balance B/F', prevTermRow ? moneyOrDash(prevTermRow.balance_cf) : moneyOrDash(fee.balance_bf));
      html += infoRow('Current Term Tuition', moneyOrDash(fee.tuition));
      html += infoRow('Scholarship / Deductions', moneyOrDash(fee.scholarship));
      html += infoRow('Additions', moneyOrDash(fee.additions));
      html += infoRow('Adjusted Tuition Total', moneyOrDash(fee.adjusted_tuition));
      if (ppRows) {
        html += '<div style="margin:8px 0 4px;font-weight:700;font-size:11px;color:#0d4d26;">Part Payments</div>';
        html += ppRows;
      }
      html += infoRow('Total Paid', moneyOrDash(fee.total_part_payment));
      html += infoRow('Other Bills Major', moneyOrDash(fee.other_bills_major));
      html += infoRow('Books', moneyOrDash(fee.books));
      html += infoRow('Other Bills Minor', moneyOrDash(fee.other_bills_minor));
      html += infoRow('Net Bills', moneyOrDash(fee.net_bills));
      html += infoRow('Blood Group / Genotype', d.blood_group);
      html += infoRow('Allergy', d.allergy);
      html += infoRow('2nd Phone (' + ph2.label + ')', ph2.value);
      html += sourceNote;
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
    const order = contactOrderOf(d);              // ['mother','father','guardian'] style
    const classNames = await getClassNamesForDropdown();
    stopLoader();

    // Cache the current learner for the photo modal.
    window.__editingLearner = d;

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
    // Priority dropdown: a single select that says which role this slot belongs to.
    const prioritySelect = function (id, slotIndex, currentRole) {
      const roles = ['father', 'mother', 'guardian'];
      let opts = '';
      roles.forEach(function (role) {
        opts += '<option value="' + role + '"' + (currentRole === role ? ' selected' : '') + '>' +
                CONTACT_LABELS[role] + '</option>';
      });
      return '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">' +
             '<span style="font-weight:700;font-size:12px;color:#0d4d26;width:90px;">Priority ' + slotIndex + '</span>' +
             '<select id="' + id + '" style="flex:1;padding:6px;border-radius:6px;border:1px solid #ccc;">' + opts + '</select>' +
             '</div>';
    };
    // Number input: plain phone number field, one per role.
    const numberField = function (id, label, value) {
      return '<div class="form-group" style="margin:6px 0;">' +
             '<label style="font-size:12px;">' + esc(label) + '</label>' +
             '<input id="' + id + '" type="text" value="' + escAttr(value || '') + '" style="width:100%;">' +
             '</div>';
    };

    // ---- Photo panel ----
    const photoUrl = d.photo_url || '';
    let photoPanel = '<div style="display:flex;gap:14px;align-items:center;background:#f7fbf7;padding:12px;border-radius:8px;margin-bottom:12px;">';
    photoPanel += '<div id="ed_photo_preview" style="width:86px;height:86px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#0d4d26,#d4a017);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:28px;flex-shrink:0;">';
    if (photoUrl) {
      photoPanel += '<img id="ed_photo_img" src="' + esc(photoUrl) + '" style="width:100%;height:100%;object-fit:cover;display:block;">';
    } else {
      photoPanel += '<span id="ed_photo_initial">' + esc((d.name || '?').charAt(0) || '?') + '</span>';
    }
    photoPanel += '</div>';
    photoPanel += '<div style="flex:1;min-width:180px;">';
    photoPanel += '<div style="font-weight:700;font-size:12px;color:#0d4d26;margin-bottom:6px;">Learner Photo</div>';
    photoPanel += '<button type="button" class="btn btn-sm btn-warning" onclick="openLearnerPhotoModal(\'' + escAttr(pin) + '\')">' +
                  '<i class="fas fa-camera"></i> Change Photo</button>';
    photoPanel += '</div></div>';

    // ---- Contact section: priority dropdowns + number inputs ----
    // order[0] is priority 1, order[1] is priority 2, order[2] is priority 3.
    const p1 = order[0] || 'father';
    const p2 = order[1] || 'mother';
    const p3 = order[2] || 'guardian';

    let contactBlock = '<div style="background:#f7fbf7;padding:12px;border-radius:8px;margin:8px 0;">';
    contactBlock += '<div style="font-weight:700;font-size:13px;color:#0d4d26;margin-bottom:8px;">Contact priority — the order to call when we need a parent</div>';

    // Priority section
    contactBlock += '<div style="background:#fff;border:1px solid #e0e8e2;border-radius:6px;padding:8px 10px;margin-bottom:10px;">';
    contactBlock += '<div style="font-size:11px;color:#666;margin-bottom:6px;">Which role do we call first, second, third?</div>';
    contactBlock += prioritySelect('ed_prio_1', 1, p1);
    contactBlock += prioritySelect('ed_prio_2', 2, p2);
    contactBlock += prioritySelect('ed_prio_3', 3, p3);
    contactBlock += '</div>';

    // Number section
    contactBlock += '<div style="background:#fff;border:1px solid #e0e8e2;border-radius:6px;padding:8px 10px;">';
    contactBlock += '<div style="font-size:11px;color:#666;margin-bottom:6px;">Phone numbers — one per role. Leave blank if not available.</div>';
    contactBlock += numberField('ed_num_father',   "Father's number",   d.father_phone);
    contactBlock += numberField('ed_num_mother',   "Mother's number",   d.mother_phone);
    contactBlock += numberField('ed_num_guardian', "Guardian's number", d.guardian_phone);
    contactBlock += '</div>';

    contactBlock += '</div>';

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Edit — ' + esc(d.name) + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += photoPanel;

    html += '<div class="form-row">' + textField('ed_name', 'Name', d.name) + classField('ed_class_name', 'Class', d.class_name) + '</div>';
    html += '<div class="form-row">' + genderField('ed_gender', 'Gender', d.gender) + textField('ed_date_of_birth', 'Date of Birth', isoToDateInput(d.date_of_birth), 'date') + '</div>';

    html += contactBlock;

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
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Exit Reason</label><select id="ed_exit_reason">' + exitOpts + '</select></div>' +
      '<div class="form-group"><label>Date of Withdrawal</label>' +
      '<input id="ed_date_of_withdrawal" type="date" value="' + escAttr(isoToDateInput(d.date_of_withdrawal)) + '"></div>' +
      '</div>';
    html += '<div class="form-row">' +
      '<div class="form-group"><label>Exit Class</label>' +
      '<input id="ed_class_at_withdrawal" type="text" value="' + escAttr(d.class_at_withdrawal || '') + '" placeholder="e.g. JSS 3"></div>' +
      '</div>';

    html += '<div id="ed_feedback" style="margin-top:8px;font-size:12px;color:#c0392b;"></div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" id="ed_submit" type="button" onclick="saveLearnerEdits(' + d.id + ')">Save</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  async function saveLearnerEdits(id) {
    const get = function (fid) { const el = document.getElementById(fid); return el ? String(el.value || '').trim() : ''; };

    // ---- Read the plain text fields ----
      const fields = {
      name:                  get('ed_name'),
      class_name:            get('ed_class_name'),
      gender:                get('ed_gender'),
      date_of_birth:         get('ed_date_of_birth'),
      father_phone:          get('ed_num_father'),
      mother_phone:          get('ed_num_mother'),
      guardian_phone:        get('ed_num_guardian'),
      account_number:        get('ed_account_number'),
      blood_group:           get('ed_blood_group'),
      religion:              get('ed_religion'),
      allergy:               get('ed_allergy'),
      parents_name:          get('ed_parents_name'),
      address:               get('ed_address'),
      state_of_origin:       get('ed_state_of_origin'),
      lga_of_origin:         get('ed_lga_of_origin'),
      state_of_birth:        get('ed_state_of_birth'),
      lga_of_birth:          get('ed_lga_of_birth'),
      lin:                   get('ed_lin'),
      exit_reason:           get('ed_exit_reason'),
      date_of_withdrawal:    get('ed_date_of_withdrawal'),
      class_at_withdrawal:   get('ed_class_at_withdrawal')
    };
    // ---- Read the priority dropdowns ----
    const raw1 = get('ed_prio_1') || 'father';
    const raw2 = get('ed_prio_2') || 'mother';
    const raw3 = get('ed_prio_3') || 'guardian';

    // ---- Sanitise: dedupe so the same role can't appear twice ----
    // First occurrence wins; later duplicates fall through to the next
    // unused role, in the order father, mother, guardian.
    const used = {};
    const sanitised = [];
    [raw1, raw2, raw3].forEach(function (role) {
      if (!used[role]) { used[role] = true; sanitised.push(role); }
    });
    ['father', 'mother', 'guardian'].forEach(function (role) {
      if (sanitised.length < 3 && !used[role]) { used[role] = true; sanitised.push(role); }
    });

    const submitBtn = document.getElementById('ed_submit');
    if (submitBtn) submitBtn.disabled = true;

    startLoader();
    try {
      const r = await window.TIS.updateLearner(id, fields);
      if (r && r.ok) {
        await window.TIS.setLearnerContactPriority(id, {
          p1: sanitised[0],
          p2: sanitised[1],
          p3: sanitised[2]
        });
      }
      stopLoader();
           if (r && r.ok) {
        window.TIS.logAudit({
          actor_name:  (State.profile && State.profile.name) || 'Operator',
          actor_role:  (State.profile && State.profile.role) || '',
          action:      'learner.update',
          entity_type: 'learner',
          entity_id:   (r.data && r.data[0] && r.data[0].pin) || String(id),
          entity_name: fields.name || '',
          before:      window.__editingLearner || null,
          after:       (r.data && r.data[0]) || null
        }).catch(function(){});
        showToast('Learner updated', 'success');
        closeModal();
        loadLearners();
      } else {
        const fb = document.getElementById('ed_feedback');
        if (fb) fb.textContent = 'Save failed: ' + ((r && r.error) || 'unknown');
        else showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    } catch (err) {
      stopLoader();
      const fb = document.getElementById('ed_feedback');
      if (fb) fb.textContent = 'Unexpected error: ' + (err && err.message ? err.message : err);
      else showToast('Unexpected error: ' + (err && err.message ? err.message : err), 'error');
      if (submitBtn) submitBtn.disabled = false;
    }
  }
  // ----------------------------------------------------------------
  // Learner photo modal — picks a file, uploads to
  // TISAssets/learners/<PIN>.png, saves the URL with a cache-bust.
  // ----------------------------------------------------------------
  function openLearnerPhotoModal(pin) {
    const learner = window.__editingLearner || null;
    if (!learner) { showToast('Reopen the learner first.', 'warning'); return; }
    const current = learner.photo_url || '';
    const learnerName = learner.name || pin;

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box" style="max-width:440px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Photo — ' + esc(learnerName) + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div style="text-align:center;">';
    html += '<div id="lp_preview" style="width:140px;height:140px;margin:0 auto 12px;border-radius:50%;border:3px solid #d4a017;overflow:hidden;background:linear-gradient(135deg,#0d4d26,#d4a017);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:42px;">';
    if (current) {
      html += '<img id="lp_preview_img" src="' + esc(current) + '" style="width:100%;height:100%;object-fit:cover;">';
    } else {
      html += '<span id="lp_preview_initial">' + esc((learnerName || '?').charAt(0) || '?') + '</span>';
    }
    html += '</div>';

    html += '<input type="file" id="lp_file" accept="image/*" style="margin-bottom:14px;">';
    html += '<div id="lp_feedback" style="font-size:12px;color:#c0392b;margin-top:6px;min-height:16px;"></div>';
    html += '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;">';
    html += '<button class="btn btn-secondary" type="button" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-primary" id="lp_submit" type="button" onclick="submitLearnerPhoto(\'' + escAttr(pin) + '\')">Upload photo</button>';
    html += '</div></div></div></div>';
    setHTML('modalContainer', html);

    const inp = document.getElementById('lp_file');
    if (inp) {
      inp.addEventListener('change', function (e) {
        const f = e.target.files[0];
        if (!f) return;
        // Local preview
        const reader = new FileReader();
        reader.onload = function (ev) {
          const box = document.getElementById('lp_preview');
          if (box) box.innerHTML = '<img src="' + ev.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
        };
        reader.readAsDataURL(f);
      });
    }
  }

  async function submitLearnerPhoto(pin) {
    const inp = document.getElementById('lp_file');
    const fb  = document.getElementById('lp_feedback');
    const setFb = function (m) { if (fb) fb.textContent = m || ''; };

    if (!inp || !inp.files || !inp.files.length) { setFb('Choose a photo first.'); return; }
    const file = inp.files[0];

    // Sanity check type + size (5 MB ceiling).
    if (!file.type || file.type.indexOf('image/') !== 0) {
      setFb('Only image files are allowed.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFb('File is larger than 5 MB. Please resize before uploading.'); return;
    }

    const submitBtn = document.getElementById('lp_submit');
    if (submitBtn) submitBtn.disabled = true;
    setFb('');
    startLoader();

    try {
      // Filename = <PIN>.png (we keep the extension of the uploaded file).
      const extRaw = (file.name.split('.').pop() || 'png').toLowerCase();
      const ext = /^(png|jpg|jpeg|webp)$/.test(extRaw) ? extRaw : 'png';
      const filename = pin + '.' + ext;

      const r = await window.TIS.uploadAsset('learners', filename, file);
      if (!r || !r.ok) {
        setFb('Upload failed: ' + ((r && r.error) || 'unknown'));
        return;
      }

      // Save URL with cache-bust query so the browser fetches fresh.
      const bust = Date.now();
      const publicUrl = r.data.url + '?t=' + bust;
      const learner = window.__editingLearner;
      if (!learner || !learner.id) { setFb('Lost track of the learner. Reopen and retry.'); return; }

      const upd = await window.TIS.updateLearner(learner.id, { photo_url: publicUrl });
      if (!upd || !upd.ok) {
        setFb('Photo uploaded but could not save the URL: ' + ((upd && upd.error) || 'unknown'));
        return;
      }

      // Update the in-memory learner so the edit modal reflects the new photo.
      window.__editingLearner.photo_url = publicUrl;

          window.TIS.logAudit({
        actor_name:  (State.profile && State.profile.name) || 'Operator',
        actor_role:  (State.profile && State.profile.role) || '',
        action:      'learner.photo_upload',
        entity_type: 'learner',
        entity_id:   pin,
        entity_name: (window.__editingLearner && window.__editingLearner.name) || '',
        before:      { photo_url: (window.__editingLearner && window.__editingLearner.photo_url) || null },
        after:       { photo_url: publicUrl }
      }).catch(function(){});
      showToast('Photo updated for ' + pin, 'success');
      closeModal();
      // Reopen the edit modal to show the new photo immediately.
      openLearnerEditModal(pin);
      // Refresh the grid behind the modal.
      loadLearners();
    } catch (err) {
      setFb('Unexpected error: ' + (err && err.message ? err.message : err));
    } finally {
      stopLoader();
      if (submitBtn) submitBtn.disabled = false;
    }
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

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Add New Learner</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div class="form-row">' +
      '<div class="form-group"><label>PIN <span style="font-weight:400;color:#888;font-size:11px;">(leave blank to auto-assign)</span></label>' +
      '<input id="nl_pin" type="text" placeholder="TIS#### or blank" autocomplete="off"></div>' +
      f('nl_name', 'Learner Name', '') + '</div>';

    html += '<div class="form-row">' +
      '<div class="form-group"><label>Class</label><select id="nl_class_name">' + classOpts + '</select></div>' +
      '<div class="form-group"><label>Gender</label><select id="nl_gender"><option value="">—</option><option>Male</option><option>Female</option></select></div>' +
      '</div>';

    html += '<div class="form-row">' +
      f('nl_date_of_birth', 'Date of Birth', '', 'date') +
      f('nl_blood_group', 'Blood Group / Genotype', '') + '</div>';

    html += '<div class="form-row">' +
      f('nl_father_phone', "Father's Phone", '') +
      f('nl_mother_phone', "Mother's Phone", '') + '</div>';

    html += '<div class="form-row">' +
      f('nl_guardian_phone', "Guardian's Phone", '') +
      f('nl_account_number', 'Account Number', '') + '</div>';

    html += '<div class="form-row">' +
      '<div class="form-group"><label>Religion</label><select id="nl_religion">' + relOpts + '</select></div>' +
      f('nl_allergy', 'Allergy', '') + '</div>';

    html += f('nl_parents_name', 'Parents Name', '');
    html += '<div class="form-group"><label>Address</label><textarea id="nl_address" rows="2"></textarea></div>';
    html += '<div class="form-row">' + f('nl_state_of_origin', 'State of Origin', '') + f('nl_lga_of_origin', 'LGA of Origin', '') + '</div>';
    html += '<div class="form-row">' + f('nl_state_of_birth', 'State of Birth', '') + f('nl_lga_of_birth', 'LGA of Birth', '') + '</div>';
    html += f('nl_lin', 'LIN', '');

    html += '<div id="nl_feedback" style="margin-top:10px;font-size:12px;color:#c0392b;"></div>';

    html += '<div style="text-align:right;margin-top:14px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" id="nl_submit" type="button">Add learner</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);

    const btn = $('nl_submit');
    if (btn) btn.addEventListener('click', submitNewLearner);

    // Esc closes this modal (and only this one).
    if (openAddLearnerModal.__escHandler) {
      document.removeEventListener('keydown', openAddLearnerModal.__escHandler);
    }
    openAddLearnerModal.__escHandler = function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const mc = document.getElementById('modalContainer');
        if (mc && mc.querySelector('#nl_submit')) {
          TIS.closeModal();
        }
      }
    };
    document.addEventListener('keydown', openAddLearnerModal.__escHandler);
  }

  function nlSetFeedback(msg) {
    const el = $('nl_feedback');
    if (el) el.textContent = msg || '';
  }

  async function submitNewLearner() {
    const get = function (id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };

    const pinInput = get('nl_pin');
    const name     = get('nl_name');
    const dob      = get('nl_date_of_birth');

    nlSetFeedback('');

    // Basic validation — name is the only hard requirement besides class.
    if (!name) { nlSetFeedback('Learner Name is required.'); return; }

    // If the operator typed a PIN, validate the format strictly.
    if (pinInput) {
      const pinUp = pinInput.toUpperCase();
      if (!/^TIS[0-9]+$/.test(pinUp)) {
        nlSetFeedback('PIN must be in the format TIS followed by digits (e.g. TIS0241).');
        return;
      }
    }

    const submitBtn = $('nl_submit');
    if (submitBtn) submitBtn.disabled = true;
    startLoader();

    try {
      // -------- Step 1: hard-check a typed PIN for collisions --------
      if (pinInput) {
        const pinUp = pinInput.toUpperCase();
        const existingPin = await window.TIS.getLearnerByPin(pinUp);
        if (existingPin && existingPin.ok && existingPin.data) {
          stopLoader();
          if (submitBtn) submitBtn.disabled = false;
          nlSetFeedback('PIN ' + pinUp + ' is already in use by ' +
                        (existingPin.data.name || 'another learner') +
                        '. Pick a different PIN, or leave the field blank for an automatic one.');
          return;
        }
      }

      // -------- Step 2: soft-check name+DOB for a likely duplicate --------
      const dup = await window.TIS.findLearnerDuplicate(name, dob);
      if (dup && dup.ok && dup.data && dup.data.row) {
        const row = dup.data.row;
        const ok = confirm(
          'A learner with this name' + (dob ? ' and date of birth' : '') + ' already exists:\n\n' +
          'Name:  ' + (row.name || '') + '\n' +
          'PIN:   ' + (row.pin || '') + '\n' +
          'Class: ' + (row.class_name || '') + '\n\n' +
          'Add as a separate learner anyway?'
        );
        if (!ok) {
          stopLoader();
          if (submitBtn) submitBtn.disabled = false;
          nlSetFeedback('Cancelled — no learner was added.');
          return;
        }
      }

      // -------- Step 3: build the row and insert --------
      const row = {
        pin:             pinInput ? pinInput.toUpperCase() : null,
        name:            name,
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

      const r = await window.TIS.createLearner(row);

          if (r && r.ok) {
        const assignedPin = r.data && r.data.pin ? r.data.pin : (row.pin || '(auto)');
        showToast('Learner added: ' + row.name + ' — PIN ' + assignedPin, 'success');
        window.TIS.logAudit({
          actor_name:  (State.profile && State.profile.name) || 'Operator',
          actor_role:  (State.profile && State.profile.role) || '',
          action:      'learner.create',
          entity_type: 'learner',
          entity_id:   assignedPin,
          entity_name: row.name,
          before:      null,
          after:       r.data
        }).catch(function(){});
        closeModal();
        loadLearners();
      } else {
        // If the DB rejected the insert for a duplicate pin (race), report it cleanly.
        const msg = (r && r.error) || 'unknown error';
        if (/duplicate key/i.test(msg) && /pin/i.test(msg)) {
          nlSetFeedback('That PIN was just taken by another operator. ' +
                        'Leave the field blank for an automatic PIN, or pick another.');
        } else {
          nlSetFeedback('Could not add: ' + msg);
        }
      }
    } catch (err) {
      nlSetFeedback('Unexpected error: ' + (err && err.message ? err.message : err));
    } finally {
      stopLoader();
      if (submitBtn) submitBtn.disabled = false;
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

    // ---- Resolve the fee picture the same way the View modal does ----
    // Modal and paper must agree. Same function, same inputs, same rule.
    let prevTermRow = null;
    if (term) {
      const prev = previousTermOf(term.term_type, term.year);
      if (prev) {
        const prevR = await window.TIS.getLearnerTermFor(d.id, prev.term_type, prev.year);
        if (prevR && prevR.ok) prevTermRow = prevR.data;
      }
    }
    const fee = await resolveLearnerFeePicture(d, termRow, term, term ? term.year : null);

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

    const cssA4 = 'body{font-family:Arial;padding:24px;color:#111;}' +
                  '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0b6623;padding-bottom:10px;}' +
                  '.hdr .mid{text-align:center;flex:1;}h1{color:#0b6623;margin:0 0 4px;font-size:22px;}' +
                  'h2{margin:14px 0 6px;color:#0b6623;font-size:15px;border-bottom:1px solid #c8e6c9;padding-bottom:4px;}' +
                  '.info-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;font-size:12px;}' +
                  '.info-label{color:#666;}.info-value{font-weight:600;}';

    // 80mm thermal (RawBT / MPT-11_309F).
    // Printable width on an 80mm head is ~72mm — do NOT use 80mm here
    // or the driver shrinks everything to fit, which is what made the
    // previous output unreadable. Base font is 14px (~3.5mm tall).
    const css80 =
      '@page{size:72mm auto;margin:2mm;}' +
      'html,body{width:72mm;margin:0;padding:0;}' +
      'body{font-family:"Arial","Helvetica",sans-serif;font-size:14px;line-height:1.35;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '*{box-sizing:border-box;}' +
      '.hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:4px;margin:0 0 8px;}' +
      '.hdr h1{font-size:20px;font-weight:900;letter-spacing:.5px;margin:0 0 2px;}' +
      '.hdr .sub{font-size:12px;font-style:italic;}' +
      '.who{font-size:16px;font-weight:900;margin:6px 0 2px;}' +
      '.who-sub{font-size:12px;margin:0 0 6px;}' +
      'h2{font-size:15px;font-weight:900;margin:8px 0 4px;padding:2px 0;border-top:2px solid #000;border-bottom:1px solid #000;text-transform:uppercase;letter-spacing:.5px;}' +
      '.info-row{display:flex;justify-content:space-between;gap:6px;font-size:13px;padding:3px 0;border-bottom:1px dotted #888;}' +
      '.info-row:last-child{border-bottom:0;}' +
      '.info-label{color:#000;flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
      '.info-label::after{content:":";}' +
      '.info-value{font-weight:800;flex:0 0 auto;text-align:right;white-space:nowrap;}' +
      '.footer{margin-top:10px;padding-top:6px;border-top:2px solid #000;font-size:11px;text-align:center;}' +
      '@media print{body{font-size:14px;}h2{page-break-inside:avoid;}}';

    const rowFn = function (label, value) {
      return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + esc(value) + '</span></div>';
    };

    let html = '<!doctype html><html><head><meta charset="utf-8">' +
               '<title>' + esc(d.name) + '</title>' +
               '<style>' + (paper === '80mm' ? css80 : cssA4) + '</style>' +
               '</head><body>';

    // ---------- Header ----------
    html += '<div class="hdr">';
    if (paper === 'A4') {
      html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:60px;">';
      html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1>' +
              '<div class="sub" style="font-style:italic;color:#666;">Scientia est potentia</div></div>';
      html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:60px;">';
    } else {
      // 80mm: text-only, big, centred. No logos — they waste vertical paper.
      html += '<h1>THE IDEAL SCHOOLS</h1>';
      html += '<div class="sub">Scientia est potentia</div>';
    }
    html += '</div>';

    // ---------- Who ----------
    html += '<div class="who">' + esc(d.name || '') + '</div>';
    html += '<div class="who-sub">PIN ' + esc(d.pin || '') +
            ' &middot; ' + esc(d.class_name || '') +
            ' &middot; ' + esc(termLabel) + '</div>';

    // ---------- Section A ----------
    if (wantA) {
      html += '<h2>Section A &mdash; Identity</h2>';
      html += rowFn('Class', d.class_name || '—');
      html += rowFn('PIN', d.pin || '—');
      html += rowFn('Name', d.name || '—');
      html += rowFn('Gender', d.gender || '—');
      html += rowFn('1st Phone (' + ph1.label + ')', ph1.value);
      html += rowFn('Account', d.account_number || '—');
      html += rowFn('Clearance', fee.cleared || '—');
      html += rowFn('Clearance Date', fee.clearance ? fmtDateOrDash(fee.clearance) : '—');
      html += rowFn('Balance C/F', moneyOrDash(fee.balance_cf));
    }

    // ---------- Section B ----------
    if (wantB) {
      html += '<h2>Section B &mdash; Fees</h2>';
      html += rowFn('Previous Term Balance B/F',
        prevTermRow ? moneyOrDash(prevTermRow.balance_cf) : moneyOrDash(fee.balance_bf));
      html += rowFn('Current Term Tuition', moneyOrDash(fee.tuition));
      html += rowFn('Scholarship / Deductions', moneyOrDash(fee.scholarship));
      html += rowFn('Additions', moneyOrDash(fee.additions));
      html += rowFn('Adjusted Tuition Total', moneyOrDash(fee.adjusted_tuition));
      if (fee.part_payments && fee.part_payments.length) {
        fee.part_payments.forEach(function (p) {
          html += rowFn('Part Pay ' + p.n,
            (p.date ? fmtDateOrDash(p.date) : '—') + ' — ' + moneyOrDash(p.amount));
        });
      }
      html += rowFn('Total Paid', moneyOrDash(fee.total_part_payment));
      html += rowFn('Other Bills Major', moneyOrDash(fee.other_bills_major));
      html += rowFn('Balance B/F', moneyOrDash(fee.balance_bf));
      html += rowFn('Other Bills Minor', moneyOrDash(fee.other_bills_minor));
      html += rowFn('Net Bills', moneyOrDash(fee.net_bills));
      html += rowFn('Blood Group', d.blood_group || '—');
      html += rowFn('Allergy', d.allergy || '—');
      html += rowFn('2nd Phone (' + ph2.label + ')', ph2.value);
    }

    // ---------- Section C ----------
    if (wantC) {
      html += '<h2>Section C &mdash; History</h2>';
      html += rowFn('Class Before Adm.', d.class_before_admission || '—');
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

    // ---------- Footer ----------
    html += '<div class="footer">Printed ' + new Date().toLocaleString() + '</div>';

    html += '</body></html>';

    w.document.open();
    w.document.write(html);
    w.document.close();

    // Give RawBT a moment to build the raster image before we ask
    // the user agent to print. 600ms is safe for the MPT-11.
    setTimeout(function () {
      try { w.focus(); w.print(); } catch (e) { /* user can Ctrl+P */ }
    }, 600);

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
        if (refresh && !refresh.__wired) {
      refresh.addEventListener('click', function (e) {
        e.preventDefault();
        State.learnersFetchedAt = 0;    // force refetch
        loadLearners();
      });
      refresh.__wired = true;
    }

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

    const toggle = document.getElementById('btnToggleInactiveLearners');
    if (toggle && !toggle.__wired) {
      toggle.addEventListener('click', function () {
        __learnersShowInactive = !__learnersShowInactive;
        const lbl = document.getElementById('btnToggleInactiveLearnersLabel');
        if (lbl) lbl.textContent = __learnersShowInactive ? 'Hide Inactive' : 'Show Inactive';
        applyLearnerFilter();
      });
      toggle.__wired = true;
    }
  }
    const bulk = document.getElementById('btnBulkLearnerPhotos');
    if (bulk && !bulk.__wired) {
      bulk.addEventListener('click', function (e) { e.preventDefault(); openBulkPhotoUploadDialog('learner'); });
      bulk.__wired = true;
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
  // [S07.x] BULK PHOTO UPLOAD — learners and staff
  //   ZIP of photos, named <code>.jpg / .png / .webp.
  //   For learners: <code> = learner PIN  (e.g. TIS0241.jpg)
  //   For staff:    <code> = staff_id    (e.g. TIS2406.jpg)
  //
  //   Per-file flow:
  //     1. Look up the learner/staff by code.
  //     2. If they already have a photo_url → ask "replace?".
  //     3. Upload via TIS.uploadAsset('<folder>', <code>.<ext>, file).
  //     4. Save the returned URL (with cache-bust) into photo_url.
  //
  //   All work happens client-side; nothing touches the backend
  //   except the per-file uploadAsset call.
  // ================================================================
  function openBulkPhotoUploadDialog(kind) {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip not loaded — reload the page.', 'error');
      return;
    }
    const isStaff = kind === 'staff';
    const label   = isStaff ? 'Staff' : 'Learners';

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Bulk Upload Photos — ' + label + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<p style="font-size:12px;color:#555;margin:0 0 10px;line-height:1.6;">';
    html += 'Select a ZIP file containing one photo per ' + (isStaff ? 'staff member' : 'learner') + '. ';
    html += 'Each photo must be named <code>' + (isStaff ? 'TIS2406.jpg' : 'TIS0241.jpg') + '</code> — ';
    html += 'the file name must exactly match the ' + (isStaff ? 'Staff ID' : 'PIN') + '. ';
    html += 'Accepted formats: JPG, PNG, WEBP. Size limit: 5 MB per photo.';
    html += '</p>';

    html += '<div style="background:#f7fbf7;padding:10px;border-radius:8px;margin-bottom:12px;font-size:11px;color:#555;line-height:1.6;">';
    html += '<b>Compression tip:</b> if your source photos are 3–4 MB each, compress them first. ';
    html += 'Free tool: <b>Caesium Image Compressor</b> (caesium.app). ';
    html += 'For 100+ photos, aim for ~300–500 KB each to keep upload under 10 minutes.';
    html += '</div>';

    html += '<input type="file" id="bulkPhotoZip" accept=".zip,application/zip" style="margin-bottom:14px;">';
    html += '<div id="bulkPhotoFeedback" style="font-size:12px;color:#c0392b;margin-top:6px;min-height:16px;"></div>';

    html += '<div id="bulkPhotoProgressWrap" style="display:none;margin-top:16px;">';
    html += '<div style="background:#e8f5e9;border-radius:6px;height:12px;overflow:hidden;">';
    html += '<div id="bulkPhotoBar" style="background:#0d4d26;height:100%;width:0%;transition:width .2s;"></div>';
    html += '</div>';
    html += '<div id="bulkPhotoProgressText" style="font-size:12px;color:#555;margin-top:6px;text-align:center;">Starting…</div>';
    html += '</div>';

    html += '<div style="text-align:right;margin-top:16px;">';
    html += '<button class="btn btn-secondary" type="button" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-primary" id="bulkPhotoGo" type="button">Start upload</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);

    const go = document.getElementById('bulkPhotoGo');
    if (go) go.addEventListener('click', function () { submitBulkPhotoUpload(kind); });
  }

  async function submitBulkPhotoUpload(kind) {
    const inp = document.getElementById('bulkPhotoZip');
    const fb  = document.getElementById('bulkPhotoFeedback');
    const setFb = function (m) { if (fb) fb.textContent = m || ''; };

    if (!inp || !inp.files || !inp.files.length) { setFb('Choose a ZIP file first.'); return; }
    const zipFile = inp.files[0];
    if (zipFile.size > 200 * 1024 * 1024) {
      setFb('ZIP is larger than 200 MB. Please split it into smaller batches.'); return;
    }

    const isStaff = kind === 'staff';
    const folder  = isStaff ? 'staff' : 'learners';
    const goBtn   = document.getElementById('bulkPhotoGo');
    if (goBtn) goBtn.disabled = true;
    setFb('');

    // Progress UI
    const wrap = document.getElementById('bulkPhotoProgressWrap');
    const bar  = document.getElementById('bulkPhotoBar');
    const txt  = document.getElementById('bulkPhotoProgressText');
    if (wrap) wrap.style.display = 'block';

    function setProgress(done, total, extra) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      if (bar) bar.style.width = pct + '%';
      if (txt) txt.textContent = done + ' of ' + total + ' processed' + (extra ? ' — ' + extra : '');
    }
    setProgress(0, 0, 'unzipping…');

    // ---------- Load and read the ZIP ----------
    let zip;
    try {
      zip = await JSZip.loadAsync(zipFile);
    } catch (err) {
      setFb('Could not read the ZIP: ' + (err && err.message ? err.message : err));
      if (goBtn) goBtn.disabled = false;
      return;
    }

    // Collect files that look like images
    const entries = [];
    zip.forEach(function (relPath, entry) {
      if (entry.dir) return;
      const lower = relPath.toLowerCase();
      if (!/\.(jpg|jpeg|png|webp)$/.test(lower)) return;
      // Strip folder prefixes — we only care about the filename
      const justName = relPath.split('/').pop();
      const extRaw = (justName.split('.').pop() || '').toLowerCase();
      const code = justName.substring(0, justName.lastIndexOf('.')).trim().toUpperCase();
      if (!code) return;
      entries.push({ name: justName, code: code, ext: extRaw, entry: entry });
    });

    if (entries.length === 0) {
      setFb('No image files found in the ZIP.');
      if (goBtn) goBtn.disabled = false;
      return;
    }

    // ---------- Load the lookup list ----------
    let lookup = {};
    try {
      if (isStaff) {
        const r = await window.TIS.listStaff();
        if (!r || !r.ok) { setFb('Could not load staff list.'); if (goBtn) goBtn.disabled = false; return; }
        (r.data || []).forEach(function (s) {
          const key = String(s.staff_id || '').trim().toUpperCase();
          if (key) lookup[key] = { id: s.id, name: s.full_name || '', existingPhoto: s.photo_url || '' };
        });
      } else {
        const r = await window.TIS.listLearners();
        if (!r || !r.ok) { setFb('Could not load learners list.'); if (goBtn) goBtn.disabled = false; return; }
        (r.data || []).forEach(function (l) {
          const key = String(l.pin || '').trim().toUpperCase();
          if (key) lookup[key] = { id: l.id, name: l.name || '', existingPhoto: l.photo_url || '' };
        });
      }
    } catch (err) {
      setFb('Could not load ' + (isStaff ? 'staff' : 'learners') + ' list.');
      if (goBtn) goBtn.disabled = false;
      return;
    }

    // ---------- Ask about overwrites up-front ----------
    const willOverwrite = {};
    const alreadyHasPhoto = entries.filter(function (e) {
      return lookup[e.code] && lookup[e.code].existingPhoto;
    });

    if (alreadyHasPhoto.length > 0) {
      const msg = alreadyHasPhoto.length + ' ' + (isStaff ? 'staff member(s)' : 'learner(s)') +
        ' in your ZIP already have a photo.\n\n' +
        'OK  = replace ALL of them with the new photo.\n' +
        'Cancel = skip them, keep their existing photo.\n\n' +
        'You can choose differently per person later.';
      const replaceAll = confirm(msg);
      alreadyHasPhoto.forEach(function (e) { willOverwrite[e.code] = replaceAll; });
    }

    // ---------- Process each entry ----------
    let okCount = 0, skipCount = 0, failCount = 0;
    const failList = [];

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const lk = lookup[e.code];

      if (!lk) {
        failCount++;
        failList.push(e.code + ' — no matching ' + (isStaff ? 'staff' : 'learner') + ' found');
        setProgress(i + 1, entries.length, 'skipped ' + e.code);
        continue;
      }

      if (lk.existingPhoto && willOverwrite[e.code] === false) {
        skipCount++;
        setProgress(i + 1, entries.length, 'skipped ' + e.code);
        continue;
      }

      // Read the file bytes and build a Blob we can hand to uploadAsset.
      let blob;
      try {
        const buf = await e.entry.async('blob');
        blob = new File([buf], lk ? (e.code + '.' + e.ext) : (e.code + '.' + e.ext), {
          type: e.ext === 'png' ? 'image/png'
              : e.ext === 'webp' ? 'image/webp'
              : 'image/jpeg'
        });
      } catch (err) {
        failCount++;
        failList.push(e.code + ' — could not read from ZIP');
        setProgress(i + 1, entries.length);
        continue;
      }

      const filename = e.code + '.' + e.ext;
      const r = await window.TIS.uploadAsset(folder, filename, blob);
      if (!r || !r.ok) {
        failCount++;
        failList.push(e.code + ' — upload failed: ' + ((r && r.error) || 'unknown'));
        setProgress(i + 1, entries.length);
        continue;
      }

      // Save URL with cache-bust
      const url = r.data.url + '?t=' + Date.now();
      let upd;
      if (isStaff) upd = await window.TIS.updateStaff(lk.id, { photo_url: url });
      else         upd = await window.TIS.updateLearner(lk.id, { photo_url: url });

      if (!upd || !upd.ok) {
        failCount++;
        failList.push(e.code + ' — uploaded but DB update failed');
      } else {
        okCount++;
      }
      setProgress(i + 1, entries.length);
    }

    // ---------- Summary ----------
    bulkPhotoShowSummary(okCount, skipCount, failCount, failList, kind);

    // Bust the cache so the grid shows fresh data on next open.
    if (isStaff) {
      State.staffFetchedAt = 0;
      if (typeof loadStaff === 'function') loadStaff();
    } else {
      State.learnersFetchedAt = 0;
      if (typeof loadLearners === 'function') loadLearners();
    }

    if (goBtn) goBtn.disabled = false;
  }

  function bulkPhotoShowSummary(okCount, skipCount, failCount, failList, kind) {
    const label = kind === 'staff' ? 'staff' : 'learners';
    let html = '<h2 style="margin:0 0 12px;color:#0d4d26;font-size:20px;">Upload complete</h2>';
    html += '<div style="font-size:14px;line-height:1.8;">';
    html += '<div><b>' + okCount + '</b> photo(s) uploaded and saved.</div>';
    if (skipCount) html += '<div>' + skipCount + ' skipped (kept existing photo).</div>';
    if (failCount) html += '<div style="color:#c0392b;"><b>' + failCount + '</b> failed.</div>';
    html += '</div>';

    if (failList.length) {
      html += '<div style="margin-top:14px;background:#fff5f5;border:1px solid #ffcdd2;border-radius:6px;padding:10px;max-height:220px;overflow-y:auto;">';
      html += '<div style="font-weight:700;color:#c0392b;margin-bottom:6px;font-size:13px;">Failures</div>';
      html += '<ul style="margin:0;padding-left:18px;font-size:12px;line-height:1.7;color:#333;">';
      failList.forEach(function (f) { html += '<li>' + esc(f) + '</li>'; });
      html += '</ul></div>';
    }

    html += '<div style="margin-top:16px;text-align:right;">';
    html += '<button class="btn btn-primary" onclick="location.reload()">Reload portal</button> ';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Close</button>';
    html += '</div>';

    setHTML('modalContainer',
      '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">' +
      html + '</div></div>');
  }

  window.openBulkPhotoUploadDialog = openBulkPhotoUploadDialog;
  window.submitBulkPhotoUpload    = submitBulkPhotoUpload;
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
  window.openLearnerPhotoModal   = openLearnerPhotoModal;
  window.submitLearnerPhoto      = submitLearnerPhoto;
  
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
    let __staffShowInactive = false;   // toggled by the toolbar button

  const STAFF_SCHOOLS = [
    'The Ideal Secondary School',
    'Hope and Faith Nur & Pry School'
  ];
  const STAFF_DEPARTMENTS = ['Teaching', 'Admin', 'Support'];
  const STAFF_STATUSES    = ['Active', 'Inactive'];

   async function loadStaff() {
    // Fast path: if we already fetched in the last 10 minutes,
    // just re-render from cache. No network call.
    const now = Date.now();
    if (State.cachedStaff && State.cachedStaff.length > 0 &&
        State.staffFetchedAt && (now - State.staffFetchedAt) < 10 * 60 * 1000) {
      applyStaffFilter();
      return;
    }

    setHTML('staffGrid', pageLoaderHTML('Loading staff…'));
    startLoader();
    const r = await window.TIS.listStaff();
    stopLoader();
    if (!r || !r.ok) {
      setHTML('staffGrid', errorHTML('Could not load staff', r && r.error));
      return;
    }
    State.cachedStaff = r.data || [];
    State.staffFetchedAt = now;
    applyStaffFilter();
  }

  function applyStaffFilter() {
    const all = State.cachedStaff || [];
    const filtered = __staffShowInactive
      ? all
      : all.filter(function (s) { return (s.status || 'Active') === 'Active'; });
    renderStaff(filtered);
    renderStaffStats(all);
  }
  window.applyStaffFilter = applyStaffFilter;

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
    const current = s ? (s.photo_url || '') : '';

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box" style="max-width:440px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Photo — ' + esc(display) + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div style="text-align:center;">';
    html += '<div id="sp_preview" style="width:140px;height:140px;margin:0 auto 12px;border-radius:50%;border:3px solid #d4a017;overflow:hidden;background:linear-gradient(135deg,#0d4d26,#d4a017);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:42px;">';
    if (current) {
      html += '<img id="sp_preview_img" src="' + esc(current) + '" style="width:100%;height:100%;object-fit:cover;">';
    } else {
      html += '<span id="sp_preview_initial">' + esc((staffName(s) || '?').charAt(0) || '?') + '</span>';
    }
    html += '</div>';

    html += '<input type="file" id="sp_file" accept="image/*" style="margin-bottom:14px;">';
    html += '<div id="sp_feedback" style="font-size:12px;color:#c0392b;margin-top:6px;min-height:16px;"></div>';
    html += '<div style="margin-top:14px;display:flex;gap:8px;justify-content:center;">';
    html += '<button class="btn btn-secondary" type="button" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-primary" id="sp_submit" type="button" onclick="submitStaffPhoto(\'' + escAttr(id) + '\')">Upload photo</button>';
    html += '</div></div></div></div>';
    setHTML('modalContainer', html);

    const inp = document.getElementById('sp_file');
    if (inp) {
      inp.addEventListener('change', function (e) {
        const f = e.target.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
          const box = document.getElementById('sp_preview');
          if (box) box.innerHTML = '<img src="' + ev.target.result + '" style="width:100%;height:100%;object-fit:cover;">';
        };
        reader.readAsDataURL(f);
      });
    }
  }

  async function submitStaffPhoto(id) {
    const inp = document.getElementById('sp_file');
    const fb  = document.getElementById('sp_feedback');
    const setFb = function (m) { if (fb) fb.textContent = m || ''; };

    if (!inp || !inp.files || !inp.files.length) { setFb('Choose a photo first.'); return; }
    const file = inp.files[0];

    // Sanity check type + size (5 MB ceiling).
    if (!file.type || file.type.indexOf('image/') !== 0) {
      setFb('Only image files are allowed.'); return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFb('File is larger than 5 MB. Please resize before uploading.'); return;
    }

    // We need the staff row's staff_id (the TISxxxx string) for the filename.
    const s = (State.cachedStaff || []).find(function (x) { return String(x.id) === String(id); });
    if (!s) { setFb('Staff record not found. Refresh the list and try again.'); return; }
    const staffNo = String(s.staff_id || '').trim();
    if (!staffNo) { setFb('This staff record has no Staff ID. Add one before uploading a photo.'); return; }

    const submitBtn = document.getElementById('sp_submit');
    if (submitBtn) submitBtn.disabled = true;
    setFb('');
    startLoader();

    try {
      const extRaw = (file.name.split('.').pop() || 'png').toLowerCase();
      const ext = /^(png|jpg|jpeg|webp)$/.test(extRaw) ? extRaw : 'png';
      const filename = staffNo + '.' + ext;

      const r = await window.TIS.uploadAsset('staff', filename, file);
      if (!r || !r.ok) {
        setFb('Upload failed: ' + ((r && r.error) || 'unknown'));
        return;
      }

      // Save URL with cache-bust query so the browser fetches fresh.
      const bust = Date.now();
      const publicUrl = r.data.url + '?t=' + bust;

      const upd = await window.TIS.updateStaff(id, { photo_url: publicUrl });
      if (!upd || !upd.ok) {
        setFb('Photo uploaded but could not save the URL: ' + ((upd && upd.error) || 'unknown'));
        return;
      }

      showToast('Photo updated for ' + staffNo, 'success');
      closeStaffModal();
      await loadStaff();
      // Reopen the profile modal so the new photo shows immediately.
      openStaffProfile(id);
    } catch (err) {
      setFb('Unexpected error: ' + (err && err.message ? err.message : err));
    } finally {
      stopLoader();
      if (submitBtn) submitBtn.disabled = false;
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
          const bulk = $('btnBulkStaffPhotos');
    if (bulk && !bulk.__wired) {
      bulk.addEventListener('click', function () { openBulkPhotoUploadDialog('staff'); });
      bulk.__wired = true;
    } const rf  = $('btnRefreshStaff');
    if (rf  && !rf.__wired)  {
      rf.addEventListener('click', function () {
        State.staffFetchedAt = 0;       // force refetch
        loadStaff();
      });
      rf.__wired = true;
    }
       const pr  = $('btnPrintStaff');
    if (pr  && !pr.__wired)  {
      pr.addEventListener('click', function () {
        if (State.cachedStaff && State.cachedStaff.length) printStaffList();
        else showToast('Load the list first', 'warning');
      });
      pr.__wired = true;
    }

    const toggle = $('btnToggleInactiveStaff');
    if (toggle && !toggle.__wired) {
      toggle.addEventListener('click', function () {
        __staffShowInactive = !__staffShowInactive;
        const lbl = $('btnToggleInactiveStaffLabel');
        if (lbl) lbl.textContent = __staffShowInactive ? 'Hide Inactive' : 'Show Inactive';
        applyStaffFilter();
      });
      toggle.__wired = true;
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
    initFeesPanel();
  }

  // ================================================================
  // [S09.x] FEES MODULE — lives inside the Terms tab.
  //   Two views:
  //     • Class Bill   — one row per class × term × year
  //     • Adjustments  — one row per learner × term × year
  //   Feeds the FEE NOTICE line on the report card.
  // ================================================================
  let __feesMode = 'schedule';   // 'schedule' | 'adjustments'

  function initFeesPanel() {
    const btnSched  = $('feesSubSchedule');
    const btnAdjust = $('feesSubAdjust');
    const loadBtn   = $('btnFeesLoad');

    if (btnSched && !btnSched.__wired) {
      btnSched.addEventListener('click', function () {
        __feesMode = 'schedule';
        feesRefreshSubButtons();
        feesLoad();
      });
      btnSched.__wired = true;
    }

    if (btnAdjust && !btnAdjust.__wired) {
      btnAdjust.addEventListener('click', function () {
        __feesMode = 'adjustments';
        feesRefreshSubButtons();
        feesLoad();
      });
      btnAdjust.__wired = true;
    }

    if (loadBtn && !loadBtn.__wired) {
      loadBtn.addEventListener('click', feesLoad);
      loadBtn.__wired = true;
    }

    // Default term / year to the active term.
    (async function () {
      try {
        const at = await window.TIS.getActiveTerm();
        if (at && at.ok && at.data) {
          const t = $('feesTerm'); if (t) t.value = at.data.term_type || '1st';
          const y = $('feesYear'); if (y) y.value = String(at.data.year || new Date().getFullYear());
        }
      } catch (e) { /* silent */ }
    })();

    feesRefreshSubButtons();
  }
  window.initFeesPanel = initFeesPanel;

  function feesRefreshSubButtons() {
    const btnSched  = $('feesSubSchedule');
    const btnAdjust = $('feesSubAdjust');
    if (btnSched && btnAdjust) {
      if (__feesMode === 'schedule') {
        btnSched.classList.remove('btn-secondary');  btnSched.classList.add('btn-primary');
        btnAdjust.classList.remove('btn-primary');   btnAdjust.classList.add('btn-secondary');
      } else {
        btnAdjust.classList.remove('btn-secondary'); btnAdjust.classList.add('btn-primary');
        btnSched.classList.remove('btn-primary');    btnSched.classList.add('btn-secondary');
      }
    }
  }

  function feesSetFeedback(msg, kind) {
    const el = $('feesFeedback');
    if (!el) return;
    el.style.color = (kind === 'error') ? '#c0392b' : (kind === 'ok' ? '#0d4d26' : '#666');
    el.textContent = msg || '';
  }

  function feesReadTermYear() {
    const termEl = $('feesTerm');
    const yearEl = $('feesYear');
    const term = termEl ? termEl.value : '1st';
    const year = yearEl ? parseInt(yearEl.value, 10) : 0;
    return { term: term, year: year };
  }

  async function feesLoad() {
    const { term, year } = feesReadTermYear();
    if (!year) { feesSetFeedback('Pick a year.', 'error'); return; }
    feesSetFeedback('Loading…');
    setHTML('feesContent', pageLoaderHTML('Loading fees…'));
    startLoader();
    try {
      if (__feesMode === 'schedule')   await feesLoadSchedule(term, year);
      else                             await feesLoadAdjustments(term, year);
      feesSetFeedback('Loaded.', 'ok');
    } catch (err) {
      feesSetFeedback('Unexpected error: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      stopLoader();
    }
  }
  window.feesLoad = feesLoad;

  // ----------------------------------------------------------------
  // CLASS BILL VIEW
  // ----------------------------------------------------------------
  async function feesLoadSchedule(term, year) {
    const classesR = await window.TIS.listClasses();
    const classes = (classesR && classesR.ok ? classesR.data : [])
      .filter(function (c) { return c.is_active !== false; })
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });

    const rowsR = await window.TIS.listFeeSchedule(year, term);
    const byClass = {};
    (rowsR && rowsR.ok ? rowsR.data : []).forEach(function (r) {
      byClass[r.class_name] = r;
    });

    let html = '<div style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#1a3f8f;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">Class</th>';
    html += '<th style="padding:6px;">Tuition ₦</th>';
    html += '<th style="padding:6px;">Other Major ₦</th>';
    html += '<th style="padding:6px;">Other Minor ₦</th>';
    html += '<th style="padding:6px;">Books ₦</th>';
    html += '<th style="padding:6px;">Total ₦</th>';
    html += '<th style="padding:6px;">Save</th>';
    html += '</tr></thead><tbody>';

    classes.forEach(function (c) {
      const row = byClass[c.name] || {};
      const total =
        Number(row.tuition || 0) +
        Number(row.other_bills_major || 0) +
        Number(row.other_bills_minor || 0) +
        Number(row.books || 0);
      html += '<tr data-fee-class="' + escAttr(c.name) + '">';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;font-weight:600;">' + esc(c.name) + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;"><input type="number" step="0.01" class="fee-inp" data-field="tuition" value="' + (row.tuition || '') + '" style="width:110px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;"><input type="number" step="0.01" class="fee-inp" data-field="other_bills_major" value="' + (row.other_bills_major || '') + '" style="width:110px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;"><input type="number" step="0.01" class="fee-inp" data-field="other_bills_minor" value="' + (row.other_bills_minor || '') + '" style="width:110px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;"><input type="number" step="0.01" class="fee-inp" data-field="books" value="' + (row.books || '') + '" style="width:110px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:right;font-weight:700;" data-total>' + total.toLocaleString() + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><button type="button" class="btn btn-sm btn-success" onclick="feesSaveScheduleRow(\'' + escAttr(c.name) + '\')">Save</button></td>';
      html += '</tr>';
    });

    if (classes.length === 0) {
      html += '<tr><td colspan="7" style="padding:14px;text-align:center;color:#888;">No active classes.</td></tr>';
    }

    html += '</tbody></table></div>';
    html += '<p style="font-size:11px;color:#666;margin-top:8px;">Each row is the class bill for ' + esc(term.toUpperCase()) + ' TERM ' + year + '. A blank field is treated as 0.</p>';
    setHTML('feesContent', html);
  }

  async function feesSaveScheduleRow(className) {
    const { term, year } = feesReadTermYear();
    const rowEl = document.querySelector('[data-fee-class="' + className.replace(/"/g, '\\"') + '"]');
    if (!rowEl) return;
    const get = function (f) {
      const el = rowEl.querySelector('.fee-inp[data-field="' + f + '"]');
      return el ? Number(el.value || 0) : 0;
    };
    const payload = {
      class_name:        className,
      term_type:         term,
      year:              year,
      tuition:           get('tuition'),
      other_bills_major: get('other_bills_major'),
      other_bills_minor: get('other_bills_minor'),
      books:             get('books')
    };
    startLoader();
    const r = await window.TIS.upsertFeeSchedule(payload);
    stopLoader();
    if (!r || !r.ok) { showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error'); return; }
    const totalEl = rowEl.querySelector('[data-total]');
    if (totalEl) {
      const total =
        Number(payload.tuition || 0) +
        Number(payload.other_bills_major || 0) +
        Number(payload.other_bills_minor || 0) +
        Number(payload.books || 0);
      totalEl.textContent = total.toLocaleString();
    }
    showToast('Saved: ' + className, 'success');
  }
  window.feesSaveScheduleRow = feesSaveScheduleRow;

  // ----------------------------------------------------------------
  // ADJUSTMENTS VIEW
  //   List of learners (searchable) with per-learner additions and
  //   deductions for the selected term and year.
  // ----------------------------------------------------------------
   async function feesLoadAdjustments(term, year) {
    feesSetFeedback('Loading learners…');
    const learnerR = await window.TIS.listLearners();
    if (!learnerR || !learnerR.ok) {
      setHTML('feesContent', errorHTML('Could not load learners', learnerR && learnerR.error));
      return;
    }
    const learners = (learnerR.data || [])
      .filter(function (l) {
        const w = (l.date_of_withdrawal || '').toString().trim();
        return !(w && w !== '' && w !== 'N/A');
      });

    if (learners.length === 0) {
      setHTML('feesContent', emptyHTML('fa-users', 'No active learners'));
      return;
    }

    const ids = learners.map(function (l) { return l.id; });
    const adjR = await window.TIS.listFeeAdjustmentsForLearners(ids, term, year);
    const adjMap = {};
    (adjR && adjR.ok ? adjR.data : []).forEach(function (r) {
      adjMap[r.learner_id] = r;
    });

    // Class order comes from classes.sort_order, so classes read in the
    // school's academic order rather than alphabetically.
    const classR = await window.TIS.listClasses();
    const classOrder = {};
    (classR && classR.ok ? classR.data : []).forEach(function (c) {
      classOrder[c.name] = c.sort_order || 9999;
    });

    // Distinct classes present, in academic order.
    const presentClasses = {};
    learners.forEach(function (l) {
      const c = l.class_name || '';
      if (c) presentClasses[c] = true;
    });
    const classList = Object.keys(presentClasses)
      .sort(function (a, b) {
        return (classOrder[a] || 9999) - (classOrder[b] || 9999);
      });

    let html = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">';
    html += '<input type="text" id="feesAdjustSearch" placeholder="Search by name or PIN…" style="flex:1 1 220px;min-width:180px;padding:8px 12px;border:1px solid #ccc;border-radius:8px;">';
    html += '<select id="feesAdjustClass" style="flex:0 0 200px;padding:8px 12px;border:1px solid #ccc;border-radius:8px;">';
    html += '<option value="">All classes</option>';
    classList.forEach(function (c) {
      html += '<option value="' + escAttr(c) + '">' + esc(c) + '</option>';
    });
    html += '</select>';
    html += '</div>';

    html += '<div style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#1a3f8f;color:#fff;">';
    html += '<th style="text-align:left;padding:6px;">PIN</th>';
    html += '<th style="text-align:left;padding:6px;">Name</th>';
    html += '<th style="text-align:left;padding:6px;">Class</th>';
    html += '<th style="padding:6px;">Additions ₦</th>';
    html += '<th style="padding:6px;">Deductions ₦</th>';
    html += '<th style="text-align:left;padding:6px;">Reason</th>';
    html += '<th style="padding:6px;">Save</th>';
    html += '</tr></thead><tbody>';

    // Sort learners by academic class order, then by name within class.
    const sorted = learners.slice().sort(function (a, b) {
      const ao = classOrder[a.class_name] || 9999;
      const bo = classOrder[b.class_name] || 9999;
      if (ao !== bo) return ao - bo;
      return (a.name || '').localeCompare(b.name || '');
    });

    sorted.forEach(function (l) {
      const a = adjMap[l.id] || {};
      html += '<tr data-fee-learner="' + l.id +
              '" data-fee-name="' + escAttr((l.name || '').toLowerCase() + ' ' + (l.pin || '').toLowerCase()) +
              '" data-fee-class="' + escAttr(l.class_name || '') + '">';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.pin || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.name || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(l.class_name || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><input type="number" step="0.01" class="fee-adj" data-field="additions" value="' + (a.additions || '') + '" style="width:100px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><input type="number" step="0.01" class="fee-adj" data-field="deductions" value="' + (a.deductions || '') + '" style="width:100px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;"><input type="text" class="fee-adj" data-field="reason" value="' + escAttr(a.reason || '') + '" style="width:100%;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><button type="button" class="btn btn-sm btn-success" onclick="feesSaveAdjustmentRow(' + l.id + ')">Save</button></td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += '<p style="font-size:11px;color:#666;margin-top:8px;">Additions raise the learner\'s bill. Deductions lower it. A blank field is treated as 0.</p>';
    setHTML('feesContent', html);

    function applyFilters() {
      const searchEl = $('feesAdjustSearch');
      const classEl  = $('feesAdjustClass');
      const q   = searchEl ? searchEl.value.trim().toLowerCase() : '';
      const cls = classEl  ? classEl.value : '';
      document.querySelectorAll('[data-fee-learner]').forEach(function (tr) {
        const hay = tr.getAttribute('data-fee-name') || '';
        const rowClass = tr.getAttribute('data-fee-class') || '';
        const matchQ = !q || hay.indexOf(q) !== -1;
        const matchC = !cls || rowClass === cls;
        tr.style.display = (matchQ && matchC) ? '' : 'none';
      });
    }

    const search = $('feesAdjustSearch');
    if (search) search.addEventListener('input', applyFilters);

    const clsSel = $('feesAdjustClass');
    if (clsSel) clsSel.addEventListener('change', applyFilters);
  }
  async function feesSaveAdjustmentRow(learnerId) {
    const { term, year } = feesReadTermYear();
    const rowEl = document.querySelector('[data-fee-learner="' + learnerId + '"]');
    if (!rowEl) return;
    const get = function (f) {
      const el = rowEl.querySelector('.fee-adj[data-field="' + f + '"]');
      return el ? el.value : '';
    };
    const payload = {
      learner_id: learnerId,
      term_type:  term,
      year:       year,
      additions:  Number(get('additions') || 0),
      deductions: Number(get('deductions') || 0),
      reason:     String(get('reason') || '').trim() || null
    };
    if (payload.additions === 0 && payload.deductions === 0 && !payload.reason) {
      showToast('Nothing to save for this row.', 'info');
      return;
    }
    startLoader();
    const r = await window.TIS.upsertFeeAdjustment(payload);
    stopLoader();
    if (!r || !r.ok) { showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error'); return; }
    showToast('Saved.', 'success');
  }
  window.feesSaveAdjustmentRow = feesSaveAdjustmentRow;
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
    await defaultAttendanceTermYear();
      async function defaultAttendanceTermYear() {
    try {
      const at = await window.TIS.getActiveTerm();
      if (!at || !at.ok || !at.data) return;
      const termEl = document.getElementById('attendanceTerm');
      const yearEl = document.getElementById('attendanceYear');
      if (termEl) termEl.value = at.data.term_type || '1st';
      if (yearEl) yearEl.value = String(at.data.year || new Date().getFullYear());
    } catch (e) { /* silent */ }
  }

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
    const r = await window.TIS.listClasses();
    if (!r || !r.ok) return;
    const names = (r.data || [])
      .filter(function (c) { return c.is_active !== false; })
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); })
      .map(function (c) { return c.name; });
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
  //   • QR link card (image lives in the QR tab)
  //   • Month picker → one Word-grid styled table per day
  //   • Red line after the last on-time clock-in
  //   • Collapsible movement log (same day-per-table shape)
  //   • Archive expandable, auto-archive on new month first load
  //   • Keyboard: M opens movement modal, C clocks out selected row
  // ================================================================
  let staffAttState = {
    year: null,
    month: null,
    days: [],
    movements: [],
    selectedStaffId: null,
    selectedDate: null,
    bfChecked: false
  };

  // Palettes cycled per day so consecutive days look distinctly different
  // while staying in the school's green/gold family.
  const STAFF_DAY_PALETTES = [
    { head: '#0d4d26', headText: '#fff',     row: '#f7fbf7', alt: '#eef7ee', line: '#0d4d26' },
    { head: '#145a32', headText: '#fff',     row: '#f3f9f3', alt: '#e8f5e8', line: '#145a32' },
    { head: '#8b6f1f', headText: '#fff',     row: '#fdfaf0', alt: '#f6f0dd', line: '#8b6f1f' },
    { head: '#0b3d2e', headText: '#fff',     row: '#f5f9f7', alt: '#eaf3ee', line: '#0b3d2e' },
    { head: '#5d4a14', headText: '#fff',     row: '#fcf9f1', alt: '#f4eedb', line: '#5d4a14' }
  ];

  function staffDayPalette(dayIndex) {
    return STAFF_DAY_PALETTES[dayIndex % STAFF_DAY_PALETTES.length];
  }

  // ----------------------------------------------------------------
  // Tab init + wiring
  // ----------------------------------------------------------------
  async function initStaffAttendanceTab() {
    // Default month / year = today.
    const today = new Date();
    const mEl = $('staffAttMonth');
    const yEl = $('staffAttYear');
    if (mEl) mEl.value = String(today.getMonth() + 1);
    if (yEl) yEl.value = String(today.getFullYear());

    const loadBtn = $('btnLoadStaffAttMonth');
    if (loadBtn && !loadBtn.__wired) {
      loadBtn.addEventListener('click', function () {
        loadStaffMonth().catch(function (err) {
          console.error('[loadStaffMonth]', err);
          showToast('Could not load month: ' + (err && err.message || err), 'error');
        });
      });
      loadBtn.__wired = true;
    }

    const printBtn = $('btnPrintStaffAtt');
    if (printBtn && !printBtn.__wired) {
      printBtn.addEventListener('click', function (e) { e.preventDefault(); staffAttOpenPrintDialog(); });
      printBtn.__wired = true;
    }

    const openQRBtn = $('btnOpenStaffQR');
    if (openQRBtn && !openQRBtn.__wired) {
      openQRBtn.addEventListener('click', function () { staffAttOpenQRModal(); });
      openQRBtn.__wired = true;
    }

    const copyQRBtn = $('btnCopyStaffQRLink');
    if (copyQRBtn && !copyQRBtn.__wired) {
      copyQRBtn.addEventListener('click', function () { staffAttCopyQRLink(); });
      copyQRBtn.__wired = true;
    }

    // Expandable headers for the three collapsible frames.
    wireStaffExpandable('staffAttMonthFrame', 'staffAttMonthBody');
    wireStaffExpandable('staffMvMonthFrame',  'staffMvMonthBody');
    wireStaffExpandable('staffArchiveFrame',  'staffArchiveBody');

    // Refresh the QR preview.
    staffAttRenderQRPreview();

    // Keyboard shortcuts (active only while this tab is visible).
    if (!window.__staffAttKeyWired) {
      document.addEventListener('keydown', staffAttKeyHandler);
      window.__staffAttKeyWired = true;
    }
  }

  function wireStaffExpandable(frameId, bodyId) {
    const frame = document.getElementById(frameId);
    if (!frame) return;
    if (frame.__wired) return;
    const header = frame.querySelector('.expandable-header');
    if (!header) return;
    header.addEventListener('click', function () {
      frame.classList.toggle('open');
    });
    frame.__wired = true;
  }

  function staffAttKeyHandler(e) {
    const moduleStaffAtt = document.getElementById('module-staffatt');
    if (!moduleStaffAtt || moduleStaffAtt.classList.contains('hidden')) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;

    const key = e.key ? e.key.toLowerCase() : '';
    if (key === 'm') {
      e.preventDefault();
      staffAttOpenMovementModal(staffAttState.selectedStaffId, staffAttState.selectedDate);
    } else if (key === 'c') {
      e.preventDefault();
      if (!staffAttState.selectedStaffId || !staffAttState.selectedDate) {
        showToast('Select a staff row first (click it), then press C to clock out.', 'warning');
        return;
      }
      staffAttClockOut(staffAttState.selectedStaffId, staffAttState.selectedDate);
    }
  }

  // ----------------------------------------------------------------
  // Month loader (auto-archive + fetch + render)
  // ----------------------------------------------------------------
  async function loadStaffMonth() {
    const mEl = $('staffAttMonth');
    const yEl = $('staffAttYear');
    const month = mEl ? parseInt(mEl.value, 10) : (new Date().getMonth() + 1);
    const year  = yEl ? parseInt(yEl.value, 10) : new Date().getFullYear();

    if (!month || !year) { showToast('Pick a month and year', 'warning'); return; }

    // Auto-archive: if this is the first time the tab is opened in a
    // new month and there is data from a previous month not yet
    // archived, archive the previous month silently.
    await staffAttMaybeAutoArchive(year, month);

    setHTML('staffAttMonthBody', pageLoaderHTML('Loading ' + staffMonthName(month) + ' ' + year + '…'));
    setHTML('staffMvMonthBody',  pageLoaderHTML('Loading movement log…'));
    startLoader();
    try {
      if (typeof window.TIS.listStaffAttendanceForMonth !== 'function') {
        setHTML('staffAttMonthBody', errorHTML('Staff Attendance not ready',
          'Missing TIS.listStaffAttendanceForMonth in supabase-client.js.'));
        return;
      }
      const [attR, mvR] = await Promise.all([
        window.TIS.listStaffAttendanceForMonth(year, month),
        window.TIS.listStaffMovementsForMonth(year, month)
      ]);

      if (!attR || !attR.ok) {
        setHTML('staffAttMonthBody', errorHTML('Could not load attendance', attR && attR.error));
        return;
      }
      if (!mvR || !mvR.ok) {
        setHTML('staffMvMonthBody', errorHTML('Could not load movements', mvR && mvR.error));
        return;
      }

      staffAttState.year      = year;
      staffAttState.month     = month;
      staffAttState.days      = attR.data.days || [];
      staffAttState.movements = mvR.data.days || [];

      const titleEl = $('staffAttMonthTitle');
      if (titleEl) titleEl.innerHTML = '<i class="fas fa-calendar-alt"></i> ' + staffMonthName(month) + ' ' + year + ' Staff Attendance';

      const mvTitleEl = $('staffMvMonthTitle');
      if (mvTitleEl) mvTitleEl.innerHTML = '<i class="fas fa-route"></i> ' + staffMonthName(month) + ' ' + year + ' Movement Log';

      renderStaffMonthTables();
      renderStaffMovementTables();
      renderStaffAttStats();
      await renderStaffArchiveList();

      // Open the collapsibles that have data.
      ['staffAttMonthFrame', 'staffMvMonthFrame'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.classList.add('open');
      });
    } catch (err) {
      console.error('[loadStaffMonth]', err);
      setHTML('staffAttMonthBody', errorHTML('Unexpected error', String(err && err.message || err)));
    } finally {
      stopLoader();
    }
  }

  function staffMonthName(m) {
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return names[m - 1] || ('Month ' + m);
  }

  // ----------------------------------------------------------------
  // Auto-archive helper — silently archives the previous month if
  // its rows are not already archived. Runs once per session.
  // ----------------------------------------------------------------
  async function staffAttMaybeAutoArchive(year, month) {
    if (staffAttState.__autoArchiveDone) return;
    staffAttState.__autoArchiveDone = true;
    if (typeof window.TIS.archiveStaffMonth !== 'function') return;

    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;

    // Only auto-archive if we're looking at the current month or a
    // previous month. Never archive a future month.
    const targetIsPast = (year < curY) || (year === curY && month <= curM);
    if (!targetIsPast) return;

    // Archive the previous month (relative to today).
    let prevY = curY;
    let prevM = curM - 1;
    if (prevM < 1) { prevM = 12; prevY--; }

    try {
      const listR = await window.TIS.listArchivedStaffMonths();
      if (listR && listR.ok && Array.isArray(listR.data)) {
        const already = listR.data.some(function (x) {
          return x.year === prevY && x.month === prevM;
        });
        if (already) return;
      }
      await window.TIS.archiveStaffMonth(prevY, prevM);
      showToast('Previous month (' + staffMonthName(prevM) + ' ' + prevY + ') archived.', 'info');
    } catch (err) {
      // Silent failure — auto-archive is a convenience, not critical.
      console.warn('[staffAttMaybeAutoArchive]', err);
    }
  }

  // ----------------------------------------------------------------
  // Top metrics
  // ----------------------------------------------------------------
  function renderStaffAttStats() {
    const todayISOStr = new Date().toISOString().slice(0, 10);
    const todayRow = (staffAttState.days || []).find(function (d) { return d.date === todayISOStr; });
    const rows = todayRow ? (todayRow.staff || []) : [];

    let totalActive = rows.length;
    let present = 0, onTime = 0, late = 0, absent = 0, unmarked = 0;
    rows.forEach(function (r) {
      if (!r.clock_in) {
        // If the day has not arrived at all, count as unmarked.
        if (todayRow && todayRow.arrived === false) unmarked++;
        else absent++;
        return;
      }
      present++;
      const cutoff = r.late_cutoff || r.resume_time || '';
      if (cutoff && r.clock_in && r.clock_in > cutoff) late++;
      else onTime++;
    });

    setHTML('staffAttStats',
      '<div class="stat-card"><div class="stat-label">Active Staff</div><div class="stat-value">' + totalActive + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Present Today</div><div class="stat-value gold">' + present + '</div></div>' +
      '<div class="stat-card blue"><div class="stat-label">On Time</div><div class="stat-value" style="color:#1a5276;">' + onTime + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Late</div><div class="stat-value red">' + late + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Absent</div><div class="stat-value">' + absent + '</div></div>'
    );
  }

  // ----------------------------------------------------------------
  // Month tables — one Word-grid-styled table per day
  // ----------------------------------------------------------------
  function renderStaffMonthTables() {
    const allDays = staffAttState.days || [];
    if (allDays.length === 0) {
      setHTML('staffAttMonthBody', emptyHTML('fa-calendar', 'No days in this month'));
      return;
    }

    // Show only days that have already arrived (or today).
    // Future days are hidden entirely — no scroll-through placeholders.
    const arrived = allDays.filter(function (d) { return d.arrived; });
    if (arrived.length === 0) {
      setHTML('staffAttMonthBody', emptyHTML(
        'fa-calendar-day',
        'No days have arrived in this month yet',
        'Come back once the month has begun.'
      ));
      return;
    }

    // Newest day at top.
    const ordered = arrived.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    let html = '';
    ordered.forEach(function (day, idx) {
      html += staffRenderDayTable(day, idx);
    });
    setHTML('staffAttMonthBody', html);

    // Wire row clicks for selection.
    document.querySelectorAll('[data-staff-row]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        const staffId = tr.getAttribute('data-staff-id');
        const dateIso = tr.getAttribute('data-staff-date');
        staffAttState.selectedStaffId = staffId ? parseInt(staffId, 10) : null;
        staffAttState.selectedDate    = dateIso || null;
        document.querySelectorAll('[data-staff-row]').forEach(function (r) {
          r.style.outline = '';
        });
        tr.style.outline = '2px solid #d4a017';
        tr.style.outlineOffset = '-2px';
      });
    });
  }
  function staffRenderDayTable(day, paletteIndex) {
    const pal = staffDayPalette(paletteIndex);
    const dateLabel = staffFormatDay(day.date);
    const isFuture = !day.arrived;

    // Placeholder for future days.
    if (isFuture) {
      return '' +
        '<div style="border:2px dashed #c8c8c8;border-radius:10px;padding:14px;margin-bottom:14px;background:#fafafa;text-align:center;color:#888;">' +
        '<div style="font-weight:800;font-size:13px;color:#666;">' + esc(dateLabel) + '</div>' +
        '<div style="font-size:12px;margin-top:6px;">' +
          '<i class="fas fa-hourglass-half"></i> This day has not arrived yet' +
        '</div>' +
        '</div>';
    }

    const rows = day.staff || [];

    // Find index of the last on-time clock-in so we can draw the red line.
    // A staff is "on time" if clock_in <= (their late_cutoff || resume_time),
    // or if no cutoff is set, we treat everyone with a clock_in as on time.
    let lastOnTimeIdx = -1;
    rows.forEach(function (r, i) {
      if (!r.clock_in) return;
      const cutoff = r.late_cutoff || r.resume_time || '';
      const isLate = cutoff && r.clock_in > cutoff;
      if (!isLate) lastOnTimeIdx = i;
    });

    // Red line after the LAST on-time row, but only if at least one
    // row after it exists (otherwise the line is meaningless).
    const redLineAfter = (lastOnTimeIdx >= 0 && lastOnTimeIdx < rows.length - 1) ? lastOnTimeIdx : -1;

    let html = '<div style="border:2px solid ' + pal.head + ';border-radius:10px;overflow:hidden;margin-bottom:16px;background:#fff;">';

    // Header strip
    html += '<div style="background:' + pal.head + ';color:' + pal.headText + ';padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">';
    html += '<div style="font-weight:800;font-size:13px;letter-spacing:.5px;">' + esc(dateLabel) + '</div>';
    html += '<div style="font-size:11px;opacity:.9;">';
    const presentCount = rows.filter(function (r) { return !!r.clock_in; }).length;
    html += presentCount + ' of ' + rows.length + ' clocked in';
    html += '</div>';
    html += '</div>';

    // Table
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:' + pal.alt + ';color:#0d4d26;">';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:80px;">Staff No</th>';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';">Name</th>';
    html += '<th style="text-align:center;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:70px;">Time In</th>';
    html += '<th style="text-align:center;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:70px;">Time Out</th>';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:90px;">Remark</th>';
    html += '</tr></thead><tbody>';

    if (rows.length === 0) {
      html += '<tr><td colspan="5" style="padding:14px;text-align:center;color:#888;">No active staff</td></tr>';
    } else {
      rows.forEach(function (r, i) {
        const cutoff = r.late_cutoff || r.resume_time || '';
        const isLate = r.clock_in && cutoff && r.clock_in > cutoff;
        const remark = !r.clock_in ? 'Absent' : (isLate ? 'Late' : 'Present');
        const remarkColor = !r.clock_in ? '#c0392b' : (isLate ? '#e67e22' : '#0d4d26');
        const rowBg = i % 2 === 0 ? pal.row : pal.alt;

        // Red line rendering: draw a border-bottom on the current row
        // if this is the last on-time row.
        const borderStyle = (i === redLineAfter)
          ? 'border-bottom:3px solid #d32f2f;'
          : 'border-bottom:1px solid #eee;';

        html += '<tr data-staff-row data-staff-id="' + escAttr(r.staff_id) + '" data-staff-date="' + escAttr(day.date) + '" style="background:' + rowBg + ';cursor:pointer;">';
        html += '<td style="padding:6px 8px;' + borderStyle + '">' + esc(r.staff_no || '') + '</td>';
        html += '<td style="padding:6px 8px;font-weight:600;' + borderStyle + '">' + esc(r.name || '') + '</td>';
        html += '<td style="padding:6px 8px;text-align:center;' + borderStyle + '">' + esc(r.clock_in || '—') + '</td>';
        html += '<td style="padding:6px 8px;text-align:center;' + borderStyle + '">' + esc(r.clock_out || '—') + '</td>';
        html += '<td style="padding:6px 8px;color:' + remarkColor + ';font-weight:700;' + borderStyle + '">' + remark + '</td>';
        html += '</tr>';
      });
    }

    html += '</tbody></table>';
    html += '</div>';
    return html;
  }

  function staffFormatDay(iso) {
    if (!iso) return '—';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return days[d.getDay()] + ', ' + d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
  }

  // ----------------------------------------------------------------
  // Movement log tables — same shape as attendance
  // ----------------------------------------------------------------
  function renderStaffMovementTables() {
    const days = staffAttState.movements || [];
    const ordered = days.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    let html = '';
    let shown = 0;
    ordered.forEach(function (day, idx) {
      if (!day.movements || day.movements.length === 0) return;
      shown++;
      html += staffRenderMovementDayTable(day, idx);
    });
    if (shown === 0) {
      setHTML('staffMvMonthBody', emptyHTML('fa-route', 'No movements this month'));
      return;
    }
    setHTML('staffMvMonthBody', html);
  }

  function staffRenderMovementDayTable(day, paletteIndex) {
    const pal = staffDayPalette(paletteIndex);
    const dateLabel = staffFormatDay(day.date);
    const rows = day.movements || [];

    let html = '<div style="border:2px solid ' + pal.head + ';border-radius:10px;overflow:hidden;margin-bottom:16px;background:#fff;">';
    html += '<div style="background:' + pal.head + ';color:' + pal.headText + ';padding:10px 14px;font-weight:800;font-size:13px;letter-spacing:.5px;">' + esc(dateLabel) + '</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:' + pal.alt + ';color:#0d4d26;">';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:80px;">Staff No</th>';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';">Name</th>';
    html += '<th style="text-align:center;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:70px;">Time Out</th>';
    html += '<th style="text-align:center;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:70px;">Time In</th>';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';width:120px;">Destination</th>';
    html += '<th style="text-align:left;padding:7px 8px;border-bottom:2px solid ' + pal.head + ';">Purpose</th>';
    html += '</tr></thead><tbody>';

    rows.forEach(function (m, i) {
      const rowBg = i % 2 === 0 ? pal.row : pal.alt;
      html += '<tr style="background:' + rowBg + ';">';
      html += '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + esc(m.staff_no || '') + '</td>';
      html += '<td style="padding:6px 8px;font-weight:600;border-bottom:1px solid #eee;">' + esc(m.name || '') + '</td>';
      html += '<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eee;">' + esc(m.time_out || '—') + '</td>';
      html += '<td style="padding:6px 8px;text-align:center;border-bottom:1px solid #eee;">' + esc(m.time_in || '—') + '</td>';
      html += '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + esc(m.destination || '') + '</td>';
      html += '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' + esc(m.purpose || m.reason || '') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  // ----------------------------------------------------------------
  // QR preview + link modal
  //   The QR image itself is generated and shown in the QR tab.
  //   This modal just gives the operator a quick way to copy the
  //   /g/<token> link for sharing with staff phones.
  // ----------------------------------------------------------------
  async function staffAttRenderQRPreview() {
    const box = $('staffQRPreview');
    if (!box) return;
    try {
      if (typeof window.TIS.getActiveQRToken !== 'function') return;
      const r = await window.TIS.getActiveQRToken();
      if (!r || !r.ok || !r.data) {
        box.innerHTML = 'No QR<br>generated yet';
        return;
      }
      const token = r.data.token || '';
      const url = staffQRUrl(token);
      const img = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=4&data=' + encodeURIComponent(url);
      box.innerHTML = '<img src="' + esc(img) + '" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">';
      window.__staffQRToken = token;
    } catch (e) { /* silent */ }
  }

  function staffQRUrl(token) {
    if (!token) return '';
    // Never expose the portal URL. Use an opaque short path.
    return window.location.origin + '/g/' + encodeURIComponent(token);
  }

  async function staffAttOpenQRModal() {
    if (!window.__staffQRToken) {
      await staffAttRenderQRPreview();
    }
    const token = window.__staffQRToken;
    if (!token) {
      showToast('No active QR token. Generate one from the QR tab first.', 'warning');
      return;
    }

    const url = staffQRUrl(token);

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box" style="max-width:480px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Staff Clock-in Link</h2>';
    html += '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<p style="font-size:13px;color:#555;line-height:1.6;margin:0 0 12px;">';
    html += 'The QR code itself lives in the <b>QR tab</b> (generate there, print, post at gate). ';
    html += 'This dialog is just for sending the same link to a phone via WhatsApp, email, or SMS.';
    html += '</p>';

    html += '<div class="form-group">';
    html += '<label style="font-weight:600;font-size:12px;">Staff Clock-in Link</label>';
    html += '<input type="text" readonly value="' + escAttr(url) + '" ';
    html += 'style="width:100%;font-family:monospace;font-size:12px;" ';
    html += 'onclick="this.select()">';
    html += '</div>';

    html += '<div style="font-size:11px;color:#666;margin-top:8px;line-height:1.5;">';
    html += 'The link never exposes the portal URL. Every scan asks for Staff ID. ' +
            'One phone can be used by many staff.';
    html += '</div>';

    html += '<div style="margin-top:14px;text-align:right;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Close</button> ';
    html += '<button class="btn btn-primary" onclick="staffAttCopyQRLink()">Copy Link</button>';
    html += '</div>';

    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function staffAttCopyQRLink() {
    const token = window.__staffQRToken;
    if (!token) { showToast('No QR token loaded yet.', 'warning'); return; }
    const url = staffQRUrl(token);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () {
        showToast('QR link copied', 'success');
      }, function () {
        showToast('Copy manually: ' + url, 'info');
      });
    } else {
      showToast('Copy manually: ' + url, 'info');
    }
  }

  // ----------------------------------------------------------------
  // Movement modal (M key)
  // ----------------------------------------------------------------
  function staffAttOpenMovementModal(staffId, dateISO) {
    if (!staffId) { showToast('Click a staff row first, then press M.', 'warning'); return; }
    const date = dateISO || new Date().toISOString().slice(0, 10);
    const row = (staffAttState.days || [])
      .filter(function (d) { return d.date === date; })
      .flatMap(function (d) { return d.staff || []; })
      .find(function (r) { return r.staff_id === staffId; });
    const staffName = row ? row.name : ('#' + staffId);

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box" style="max-width:480px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Log Movement</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';
    html += '<p style="font-size:12px;color:#555;margin:0 0 10px;"><b>' + esc(staffName) + '</b> · ' + esc(staffFormatDay(date)) + '</p>';
    html += '<div class="form-row"><div class="form-group"><label>Time Out</label><input type="time" id="smv_out" value="' + new Date().toTimeString().slice(0,5) + '"></div>';
    html += '<div class="form-group"><label>Time In</label><input type="time" id="smv_in"></div></div>';
    html += '<div class="form-group"><label>Destination</label><input type="text" id="smv_dest" placeholder="e.g. Bank, Ministry"></div>';
    html += '<div class="form-group"><label>Purpose</label><input type="text" id="smv_purpose" placeholder="Reason for the movement"></div>';
    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" id="smv_submit" type="button">Save Movement</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);

    const btn = $('smv_submit');
    if (btn) btn.addEventListener('click', function () { staffAttSaveMovement(staffId, date); });
  }

  async function staffAttSaveMovement(staffId, dateISO) {
    const out = $('smv_out') ? $('smv_out').value : '';
    const inn = $('smv_in') ? $('smv_in').value : '';
    const dest = $('smv_dest') ? $('smv_dest').value.trim() : '';
    const purpose = $('smv_purpose') ? $('smv_purpose').value.trim() : '';
    if (!out) { showToast('Time Out is required', 'warning'); return; }
    if (typeof window.TIS.createStaffMovement !== 'function') {
      showToast('createStaffMovement not available', 'error'); return;
    }
    startLoader();
    try {
      const r = await window.TIS.createStaffMovement({
        staff_id:      staffId,
        movement_date: dateISO,
        time_out:      out,
        time_in:       inn || null,
        destination:   dest || null,
        purpose:       purpose || null,
        logged_by:     (State.profile && State.profile.name) || 'Portal'
      });
      if (!r || !r.ok) { showToast('Could not save: ' + ((r && r.error) || ''), 'error'); return; }
      showToast('Movement logged.', 'success');
      closeModal();
      await loadStaffMonth();
    } finally {
      stopLoader();
    }
  }

  // ----------------------------------------------------------------
  // Clock out (C key)
  // ----------------------------------------------------------------
  async function staffAttClockOut(staffId, dateISO) {
    const time = new Date().toTimeString().slice(0, 5);
    if (!confirm('Clock out now at ' + time + '?')) return;
    if (typeof window.TIS.upsertStaffAttendance !== 'function') {
      showToast('upsertStaffAttendance not available', 'error'); return;
    }
    startLoader();
    try {
      const r = await window.TIS.upsertStaffAttendance({
        staff_id:        staffId,
        attendance_date: dateISO,
        clock_out:       time,
        status:          'Present',
        logged_by:       (State.profile && State.profile.name) || 'Portal',
        source:          'Manual'
      });
      if (!r || !r.ok) { showToast('Could not clock out: ' + ((r && r.error) || ''), 'error'); return; }
      showToast('Clocked out at ' + time, 'success');
      await loadStaffMonth();
    } finally {
      stopLoader();
    }
  }

  // ----------------------------------------------------------------
  // Archive list
  // ----------------------------------------------------------------
  async function renderStaffArchiveList() {
    setHTML('staffArchiveBody', pageLoaderHTML('Loading archives…'));
    try {
      if (typeof window.TIS.listArchivedStaffMonths !== 'function') {
        setHTML('staffArchiveBody', emptyHTML('fa-history', 'Archive not available'));
        return;
      }
      const r = await window.TIS.listArchivedStaffMonths();
      if (!r || !r.ok) {
        setHTML('staffArchiveBody', errorHTML('Could not load archives', r && r.error));
        return;
      }
      const list = r.data || [];
      if (list.length === 0) {
        setHTML('staffArchiveBody', emptyHTML('fa-history', 'No archived months yet'));
        return;
      }
      let html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">';
      list.forEach(function (m) {
        html += '<div style="border:2px solid #0d4d26;border-radius:8px;padding:12px;cursor:pointer;background:#f7fbf7;" ' +
                'onclick="staffAttOpenArchive(' + m.year + ',' + m.month + ')">';
        html += '<div style="font-weight:800;color:#0d4d26;font-size:13px;">' + staffMonthName(m.month) + ' ' + m.year + '</div>';
        html += '<div style="font-size:11px;color:#666;margin-top:4px;">' + m.attendance_count + ' attendance rows</div>';
        html += '</div>';
      });
      html += '</div>';
      setHTML('staffArchiveBody', html);
    } catch (err) {
      console.error('[renderStaffArchiveList]', err);
      setHTML('staffArchiveBody', errorHTML('Unexpected error', String(err && err.message || err)));
    }
  }

  async function staffAttOpenArchive(year, month) {
    setHTML('modalContainer', pageLoaderHTML('Loading archive…'));
    startLoader();
    try {
      if (typeof window.TIS.getArchivedStaffMonth !== 'function') {
        showToast('getArchivedStaffMonth not available', 'error'); return;
      }
      const r = await window.TIS.getArchivedStaffMonth(year, month);
      if (!r || !r.ok) { showToast('Could not load archive', 'error'); return; }
      const att = r.data.attendance || [];
      const mv = r.data.movements || [];

      let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
      html += '<div class="modal-box wide" style="max-width:960px;max-height:88vh;overflow-y:auto;" onclick="event.stopPropagation()">';
      html += '<div class="modal-header"><h2>Archive — ' + staffMonthName(month) + ' ' + year + '</h2>';
      html += '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

      html += '<h4 style="color:#0d4d26;margin:0 0 6px;">Attendance (' + att.length + ' rows)</h4>';
      if (att.length === 0) {
        html += '<p style="color:#888;font-size:12px;">No attendance rows.</p>';
      } else {
        html += '<div style="overflow-x:auto;max-height:260px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:6px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
        html += '<thead style="position:sticky;top:0;background:#0d4d26;color:#fff;"><tr>';
        html += '<th style="padding:5px;text-align:left;">Staff No</th>';
        html += '<th style="padding:5px;text-align:left;">Name</th>';
        html += '<th style="padding:5px;">Date</th>';
        html += '<th style="padding:5px;">In</th>';
        html += '<th style="padding:5px;">Out</th>';
        html += '<th style="padding:5px;">Remark</th>';
        html += '</tr></thead><tbody>';
        att.forEach(function (a) {
          html += '<tr>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(a.staff_no || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(a.staff_name || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(a.attendance_date || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(a.clock_in || '—') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(a.clock_out || '—') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(a.remark || a.status || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div>';
      }

      html += '<h4 style="color:#0d4d26;margin:16px 0 6px;">Movement Log (' + mv.length + ' rows)</h4>';
      if (mv.length === 0) {
        html += '<p style="color:#888;font-size:12px;">No movement rows.</p>';
      } else {
        html += '<div style="overflow-x:auto;max-height:260px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:6px;">';
        html += '<table style="width:100%;border-collapse:collapse;font-size:11px;">';
        html += '<thead style="position:sticky;top:0;background:#0d4d26;color:#fff;"><tr>';
        html += '<th style="padding:5px;text-align:left;">Staff No</th>';
        html += '<th style="padding:5px;text-align:left;">Name</th>';
        html += '<th style="padding:5px;">Date</th>';
        html += '<th style="padding:5px;">Out</th>';
        html += '<th style="padding:5px;">In</th>';
        html += '<th style="padding:5px;text-align:left;">Destination</th>';
        html += '<th style="padding:5px;text-align:left;">Purpose</th>';
        html += '</tr></thead><tbody>';
        mv.forEach(function (m) {
          html += '<tr>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(m.staff_no || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(m.staff_name || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(m.movement_date || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(m.time_out || '—') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center;">' + esc(m.time_in || '—') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(m.destination || '') + '</td>';
          html += '<td style="padding:4px 6px;border-bottom:1px solid #eee;">' + esc(m.purpose || m.reason || '') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table></div>';
      }

      html += '<div style="text-align:right;margin-top:14px;">';
      html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Close</button> ';
      html += '<button class="btn btn-gold" onclick="staffAttPrintArchive(' + year + ',' + month + ')">Print Archive</button>';
      html += '</div></div></div>';
      setHTML('modalContainer', html);
    } finally {
      stopLoader();
    }
  }
  window.staffAttOpenArchive = staffAttOpenArchive;

  // ----------------------------------------------------------------
  // Print
  // ----------------------------------------------------------------
  function staffAttOpenPrintDialog() {
    const mEl = $('staffAttMonth');
    const yEl = $('staffAttYear');
    const defMonth = mEl ? mEl.value : (new Date().getMonth() + 1);
    const defYear  = yEl ? yEl.value : new Date().getFullYear();

    let html = '<div class="modal-overlay" onclick="if(event.target===this)staffAttClosePrintDialog()">';
    html += '<div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Print Staff Attendance</h2><button class="close-btn" onclick="staffAttClosePrintDialog()">&times;</button></div>';
    html += '<div class="form-group"><label>Scope</label><select id="sap_scope" style="width:100%;">';
    html += '<option value="TODAY">Today only</option>';
    html += '<option value="MONTH" selected>Whole month</option>';
    html += '</select></div>';
    html += '<div class="form-group"><label>Month</label><select id="sap_month" style="width:100%;">';
    for (let m = 1; m <= 12; m++) {
      html += '<option value="' + m + '"' + (String(m) === String(defMonth) ? ' selected' : '') + '>' + staffMonthName(m) + '</option>';
    }
    html += '</select></div>';
    html += '<div class="form-group"><label>Year</label><input type="text" id="sap_year" value="' + escAttr(defYear) + '"></div>';
    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="staffAttClosePrintDialog()">Cancel</button> ';
    html += '<button class="btn btn-gold" onclick="staffAttRunPrint()">Print</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }
  function staffAttClosePrintDialog() { setHTML('modalContainer', ''); }

  async function staffAttRunPrint() {
    const scope = ($('sap_scope') ? $('sap_scope').value : 'MONTH');
    const month = parseInt(($('sap_month') ? $('sap_month').value : '1'), 10);
    const year  = parseInt(($('sap_year') ? $('sap_year').value : '2026'), 10);
    staffAttClosePrintDialog();

    startLoader();
    try {
      const [attR, mvR] = await Promise.all([
        window.TIS.listStaffAttendanceForMonth(year, month),
        window.TIS.listStaffMovementsForMonth(year, month)
      ]);
      if (!attR || !attR.ok) { showToast('Could not load attendance', 'error'); return; }
      const days = attR.data.days || [];
      const mvDays = (mvR && mvR.ok ? mvR.data.days : []) || [];

      const todayISOStr = new Date().toISOString().slice(0, 10);
      const daysToPrint = scope === 'TODAY'
        ? days.filter(function (d) { return d.date === todayISOStr; })
        : days;

      const w = window.open('', '_blank');
      if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

      let html = '<html><head><title>Staff Attendance — ' + staffMonthName(month) + ' ' + year + '</title>';
      html += '<style>' +
        'body{font-family:Arial;padding:16px;color:#111;}' +
        '.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0d4d26;padding-bottom:8px;margin-bottom:12px;}' +
        '.hdr .mid{text-align:center;flex:1;}h1{color:#0d4d26;margin:0;font-size:18px;}' +
        'h2{font-size:13px;color:#0d4d26;margin:14px 0 4px;border-bottom:2px solid #0d4d26;padding-bottom:3px;}' +
        'h3{font-size:12px;color:#0d4d26;margin:12px 0 4px;}' +
        'table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px;}' +
        'th{background:#0d4d26;color:#fff;padding:4px;border:1px solid #333;}' +
        'td{padding:3px 5px;border:1px solid #999;text-align:left;}' +
        'td.c{text-align:center;}' +
        'td.absent{color:#c0392b;font-weight:700;}' +
        'td.late{color:#e67e22;font-weight:700;}' +
        'td.present{color:#0d4d26;font-weight:700;}' +
        'tr.redline td{border-bottom:3px solid #d32f2f !important;}' +
        '@media print { h2, h3 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }' +
        '</style></head><body>';

      html += '<div class="hdr">';
      html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w120" style="height:52px;">';
      html += '<div class="mid"><h1>THE IDEAL SCHOOLS</h1>';
      html += '<div style="font-size:11px;color:#666;">Staff Attendance — ' + staffMonthName(month) + ' ' + year +
              ' · Printed ' + new Date().toLocaleDateString() + '</div></div>';
      html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w120" style="height:52px;">';
      html += '</div>';

      daysToPrint.forEach(function (day) {
        if (!day.arrived) return;
        html += '<h3>' + staffFormatDay(day.date) + '</h3>';
        html += '<table><thead><tr>';
        html += '<th style="width:70px;">Staff No</th><th>Name</th>';
        html += '<th style="width:60px;">In</th><th style="width:60px;">Out</th><th style="width:80px;">Remark</th>';
        html += '</tr></thead><tbody>';

        // Red line position
        let lastOnTime = -1;
        (day.staff || []).forEach(function (r, i) {
          if (!r.clock_in) return;
          const cutoff = r.late_cutoff || r.resume_time || '';
          if (!(cutoff && r.clock_in > cutoff)) lastOnTime = i;
        });

        (day.staff || []).forEach(function (r, i) {
          const cutoff = r.late_cutoff || r.resume_time || '';
          const isLate = r.clock_in && cutoff && r.clock_in > cutoff;
          const remark = !r.clock_in ? 'Absent' : (isLate ? 'Late' : 'Present');
          const remarkCls = !r.clock_in ? 'absent' : (isLate ? 'late' : 'present');
          const lineCls = (i === lastOnTime && i < (day.staff.length - 1)) ? ' class="redline"' : '';
          html += '<tr' + lineCls + '>';
          html += '<td>' + esc(r.staff_no || '') + '</td>';
          html += '<td>' + esc(r.name || '') + '</td>';
          html += '<td class="c">' + esc(r.clock_in || '—') + '</td>';
          html += '<td class="c">' + esc(r.clock_out || '—') + '</td>';
          html += '<td class="' + remarkCls + '">' + remark + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
      });

      // Movement log section
      const mvToPrint = scope === 'TODAY'
        ? mvDays.filter(function (d) { return d.date === todayISOStr; })
        : mvDays;
      const mvHasData = mvToPrint.some(function (d) { return (d.movements || []).length > 0; });
      if (mvHasData) {
        html += '<h2>Movement Log</h2>';
        mvToPrint.forEach(function (day) {
          if (!day.movements || day.movements.length === 0) return;
          html += '<h3>' + staffFormatDay(day.date) + '</h3>';
          html += '<table><thead><tr>';
          html += '<th style="width:70px;">Staff No</th><th>Name</th>';
          html += '<th style="width:60px;">Out</th><th style="width:60px;">In</th>';
          html += '<th>Destination</th><th>Purpose</th>';
          html += '</tr></thead><tbody>';
          day.movements.forEach(function (m) {
            html += '<tr>';
            html += '<td>' + esc(m.staff_no || '') + '</td>';
            html += '<td>' + esc(m.name || '') + '</td>';
            html += '<td class="c">' + esc(m.time_out || '—') + '</td>';
            html += '<td class="c">' + esc(m.time_in || '—') + '</td>';
            html += '<td>' + esc(m.destination || '') + '</td>';
            html += '<td>' + esc(m.purpose || m.reason || '') + '</td>';
            html += '</tr>';
          });
          html += '</tbody></table>';
        });
      }

      html += '<div style="margin-top:20px;font-size:10px;color:#666;text-align:center;border-top:1px solid #ccc;padding-top:6px;">';
      html += 'Printed from The Ideal Schools Operational Portal</div>';
      html += '</body></html>';

      w.document.write(html);
      w.document.close();
      setTimeout(function () { w.print(); }, 250);
    } finally {
      stopLoader();
    }
  }
  window.staffAttOpenPrintDialog = staffAttOpenPrintDialog;
  window.staffAttClosePrintDialog = staffAttClosePrintDialog;
  window.staffAttRunPrint = staffAttRunPrint;

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.initStaffAttendanceTab       = initStaffAttendanceTab;
  window.loadStaffMonth               = loadStaffMonth;
  window.renderStaffMonthTables       = renderStaffMonthTables;
  window.renderStaffMovementTables    = renderStaffMovementTables;
  window.staffAttOpenMovementModal    = staffAttOpenMovementModal;
  window.staffAttClockOut             = staffAttClockOut;
  window.staffAttRenderQRPreview      = staffAttRenderQRPreview;
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
  // [S14] QR — staff clock-in token + smart-scan handler
  //   • QR tab: generate / show / copy token (unchanged behaviour)
  //   • QR URL is /g/<token> — never exposes the portal URL
  //   • Scan flow (every scan asks for Staff ID):
  //       1st scan → Clock IN
  //       2nd scan → prompt: "Log a movement" or "Clock OUT"
  //          - Log movement → records movement OUT
  //       3rd scan → smart-detects open movement → records movement IN
  //       4th scan → Clock OUT
  //   • Every outcome fires a toast on the scanning page
  // ================================================================

  // ---------- QR tab (unchanged) ----------
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
    // Use /g/<token> so the portal URL is never in the QR. This works
    // because vercel.json rewrites /g/:token → /index.html.
    const payload = window.location.origin + '/g/' + encodeURIComponent(token);
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
    html += '<div style="margin-top:14px;font-size:11px;color:#666;max-width:520px;margin-left:auto;margin-right:auto;line-height:1.6;">';
    html += 'Print this QR code and post it at the school gate. Staff scan it with their phone camera. ' +
            'The camera opens the clock-in page. Every scan asks for the Staff ID so that when one phone ' +
            'is shared, the right person is recorded. The portal URL is never shown in the QR.';
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
    loadActiveQR();
  }

  // ================================================================
  // QR SCAN HANDLER — runs at boot when the URL is /g/<token>
  // (or ?qrtoken=<token> for backwards compatibility)
  // ================================================================
  async function handleQRScanIfPresent() {
    // Path-style token: /g/<token>
    let token = '';
    const m = window.location.pathname.match(/^\/g\/([^\/?#]+)/);
    if (m && m[1]) token = decodeURIComponent(m[1]);

    // Query-style fallback: ?qrtoken=<token> (kept for old QR codes)
    if (!token) {
      const params = new URLSearchParams(window.location.search);
      token = params.get('qrtoken') || '';
    }
    if (!token) return false;

    // Blank the page — from this moment, the portal UI is gone.
    document.body.innerHTML = qrScanSkeleton();

    // Verify the token.
    qrScanSetStage('Checking the QR code…');
    startLoader();
    const r = await window.TIS.getQRTokenByValue(token);
    stopLoader();
    if (!r || !r.ok || !r.data || r.data.is_active !== true) {
      qrScanShowFatal(
        'QR code not active',
        'The code you scanned is no longer in use. Ask the school office for the current one.'
      );
      return true;
    }

    // Ask for Staff ID.
    qrScanSetStage('Ask for Staff ID');
    const staffNo = await qrScanPromptStaffId();
    if (!staffNo) {
      qrScanShowFatal('Cancelled', 'Reload the page or scan the QR code again.');
      return true;
    }

    // Look up the staff by their Staff No.
    qrScanSetStage('Looking up staff…');
    startLoader();
    const staffR = await window.TIS.listStaff();
    stopLoader();
    const staff = (staffR && staffR.ok ? staffR.data : []).find(function (s) {
      return String(s.staff_id || '').trim().toUpperCase() === staffNo.trim().toUpperCase();
    });
    if (!staff) {
      qrScanShowFatal(
        'Staff ID not found',
        'Check the ID and try again. You entered: ' + staffNo
      );
      return true;
    }

    // Figure out what this scan means for this staff today.
    const today = new Date().toISOString().slice(0, 10);
    startLoader();
    const attR = await window.TIS.listStaffAttendanceToday(today);
    const mvR  = await window.TIS.listStaffMovementsToday(today);
    stopLoader();
    const attRow = (attR && attR.ok ? attR.data : []).find(function (a) { return a.staff_id === staff.id; });
    const movements = (mvR && mvR.ok ? mvR.data : []).filter(function (mm) { return mm.staff_id === staff.id; });
    const openMovement = movements.find(function (mm) { return !mm.time_in; });

    // Decide scan type.
    if (!attRow || !attRow.clock_in) {
      // No clock-in yet today → clock IN.
      await qrScanRecordClockIn(token, staff);
      return true;
    }
    if (attRow.clock_out) {
      // Already clocked out — the day is closed for this staff.
      qrScanShowFatal(
        'Already clocked out',
        staff.full_name + ' has already clocked out today. See an admin if this is wrong.'
      );
      return true;
    }
    if (openMovement) {
      // There's a movement still open → this scan is the movement IN.
      await qrScanRecordMovementIn(token, staff, openMovement);
      return true;
    }
    // Clocked in, not clocked out, no open movement → ask what this scan is.
    await qrScanAskMovementOrClockOut(token, staff);
    return true;
  }

  // ----------------------------------------------------------------
  // Scan page skeleton + helpers
  // ----------------------------------------------------------------
  function qrScanSkeleton() {
    return '' +
      '<div id="qrScanWrap" style="min-height:100vh;background:linear-gradient(135deg,#0d4d26,#1a8a3a);display:flex;align-items:center;justify-content:center;padding:20px;">' +
        '<div style="background:#fff;max-width:520px;width:100%;border-radius:16px;padding:28px 24px;box-shadow:0 10px 40px rgba(0,0,0,0.25);text-align:center;">' +
          '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200" style="height:60px;margin-bottom:12px;" alt="School">' +
          '<div style="font-weight:900;font-size:16px;color:#0d4d26;letter-spacing:1px;">THE IDEAL SCHOOLS</div>' +
          '<div style="font-size:11px;color:#666;font-style:italic;margin-bottom:20px;">Scientia est potentia</div>' +
          '<div id="qrScanStage" style="font-size:12px;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;"></div>' +
          '<div id="qrScanBody"></div>' +
        '</div>' +
      '</div>';
  }

  function qrScanSetStage(text) {
    const el = document.getElementById('qrScanStage');
    if (el) el.textContent = text || '';
  }
  function qrScanSetBody(html) {
    const el = document.getElementById('qrScanBody');
    if (el) el.innerHTML = html;
  }

   function qrScanShowFatal(title, body) {
    qrScanSetStage('');
    qrScanSetBody(
      '<h2 style="color:#c0392b;margin:0 0 10px;font-size:20px;">' + esc(title) + '</h2>' +
      '<p style="font-size:14px;color:#333;line-height:1.6;">' + esc(body) + '</p>' +
      '<div style="margin-top:24px;padding:14px;background:#e8f5e9;border-radius:10px;color:#0d4d26;font-size:13px;font-weight:700;line-height:1.6;">' +
      'Thanks, Dr AYOOLA G O FCIA, NIIA.<br>Appreciate.' +
      '</div>' +
      '<div style="margin-top:14px;font-size:12px;color:#999;">' +
      'This page will close in <span id="qrScanCountdown">7</span> seconds…' +
      '</div>'
    );

    let remaining = 7;
    const cdEl = document.getElementById('qrScanCountdown');
    const timer = setInterval(function () {
      remaining--;
      if (cdEl) cdEl.textContent = String(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        try { window.close(); } catch (e) { /* browser may block */ }
        document.body.innerHTML =
          '<div style="min-height:100vh;background:linear-gradient(135deg,#0d4d26,#1a8a3a);' +
          'display:flex;align-items:center;justify-content:center;padding:20px;color:#fff;' +
          'font-family:Arial,sans-serif;text-align:center;">' +
          '<div>' +
          '<div style="font-size:22px;font-weight:900;letter-spacing:1px;">THE IDEAL SCHOOLS</div>' +
          '<div style="font-size:12px;margin-top:8px;opacity:.9;">You can now close this tab.</div>' +
          '</div></div>';
      }
    }, 1000);
  }
  function qrScanShowSuccess(title, lines) {
    qrScanSetStage('');
    let html = '<h2 style="color:#0d4d26;margin:0 0 10px;font-size:20px;">' + esc(title) + '</h2>';
    if (lines && lines.length) {
      html += '<div style="font-size:14px;color:#333;line-height:1.7;">';
      lines.forEach(function (l) { html += '<div>' + l + '</div>'; });
      html += '</div>';
    }
    html += '<div style="margin-top:24px;padding:14px;background:#e8f5e9;border-radius:10px;color:#0d4d26;font-size:13px;font-weight:700;line-height:1.6;">' +
            'Thanks, Dr AYOOLA G O FCIA, NIIA.<br>Appreciate.' +
            '</div>';
    html += '<div style="margin-top:14px;font-size:12px;color:#999;" id="qrScanAutoClose">' +
            'This page will close in <span id="qrScanCountdown">7</span> seconds…' +
            '</div>';
    qrScanSetBody(html);

    // Countdown and auto-close. No button that leads back to the portal.
    let remaining = 7;
    const cdEl = document.getElementById('qrScanCountdown');
    const timer = setInterval(function () {
      remaining--;
      if (cdEl) cdEl.textContent = String(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        try { window.close(); } catch (e) { /* browser may block */ }
        // Fallback: blank the page so the login can never be reached from here.
        document.body.innerHTML =
          '<div style="min-height:100vh;background:linear-gradient(135deg,#0d4d26,#1a8a3a);' +
          'display:flex;align-items:center;justify-content:center;padding:20px;color:#fff;' +
          'font-family:Arial,sans-serif;text-align:center;">' +
          '<div>' +
          '<div style="font-size:22px;font-weight:900;letter-spacing:1px;">THE IDEAL SCHOOLS</div>' +
          '<div style="font-size:12px;margin-top:8px;opacity:.9;">You can now close this tab.</div>' +
          '</div></div>';
      }
    }, 1000);
  }

  // ----------------------------------------------------------------
  // Stage: ask for Staff ID
  // ----------------------------------------------------------------
  function qrScanPromptStaffId() {
    return new Promise(function (resolve) {
      qrScanSetBody(
        '<p style="font-size:14px;color:#333;margin:0 0 16px;line-height:1.6;">' +
          'Enter your <b>Staff ID</b> (e.g. TIS0001). If one phone is shared, ' +
          'each person enters their own ID.' +
        '</p>' +
        '<input id="qrScanStaffNo" type="text" inputmode="text" autocomplete="off" ' +
          'placeholder="TIS0001" ' +
          'style="width:100%;padding:14px;font-size:18px;text-align:center;letter-spacing:2px;' +
                 'border:2px solid #0d4d26;border-radius:8px;box-sizing:border-box;font-weight:700;">' +
        '<div style="display:flex;gap:10px;margin-top:18px;">' +
          '<button id="qrScanCancel" type="button" ' +
            'style="flex:1;padding:12px;font-size:14px;background:#eee;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Cancel</button>' +
          '<button id="qrScanGo" type="button" ' +
            'style="flex:2;padding:12px;font-size:14px;background:#0d4d26;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Continue</button>' +
        '</div>'
      );
      const inp = document.getElementById('qrScanStaffNo');
      const goBtn = document.getElementById('qrScanGo');
      const cancelBtn = document.getElementById('qrScanCancel');
      if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 80); }
      if (goBtn) goBtn.addEventListener('click', submit);
      if (cancelBtn) cancelBtn.addEventListener('click', function () { resolve(''); });
      if (inp) inp.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') submit();
      });
      function submit() {
        const v = inp ? String(inp.value || '').trim() : '';
        if (!v) { if (inp) { inp.focus(); inp.style.borderColor = '#c0392b'; } return; }
        resolve(v.toUpperCase());
      }
    });
  }

  // ----------------------------------------------------------------
  // Scan actions
  // ----------------------------------------------------------------
  async function qrScanRecordClockIn(token, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    qrScanSetStage('Clocking in…');
    startLoader();
    const r = await window.TIS.upsertStaffAttendance({
      staff_id:        staff.id,
      attendance_date: dateISO,
      clock_in:        t,
      status:          'Present',
      logged_by:       'QR scan',
      source:          'QR'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Clocked IN', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time: <b>' + t + '</b>',
        'Date: ' + dateISO
      ]);
      qrShowToast('Clock-in recorded for ' + (staff.full_name || staff.staff_id));
    } else {
      qrScanShowFatal('Clock-in failed', (r && r.error) || 'Unknown error.');
    }
  }

  async function qrScanRecordMovementOut(token, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    // Prompt for destination and purpose.
    const info = await qrScanPromptMovementInfo();
    if (!info) return;

    qrScanSetStage('Recording movement…');
    startLoader();
    const r = await window.TIS.createStaffMovement({
      staff_id:      staff.id,
      movement_date: dateISO,
      time_out:      t,
      time_in:       null,
      destination:   info.destination,
      purpose:       info.purpose,
      logged_by:     'QR scan'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Movement OUT recorded', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time out: <b>' + t + '</b>',
        'Destination: ' + esc(info.destination || '—'),
        'Purpose: ' + esc(info.purpose || '—'),
        '<div style="margin-top:14px;font-size:13px;color:#666;">' +
          'When you return, scan the same QR again and enter your Staff ID. ' +
          'The system will record your return.' +
        '</div>'
      ]);
      qrShowToast('Movement-out recorded for ' + (staff.full_name || staff.staff_id));
    } else {
      qrScanShowFatal('Movement could not be recorded', (r && r.error) || 'Unknown error.');
    }
  }

  function qrScanPromptMovementInfo() {
    return new Promise(function (resolve) {
      qrScanSetBody(
        '<p style="font-size:14px;color:#333;margin:0 0 12px;">Where are you going and why?</p>' +
        '<input id="qrMvDest" type="text" placeholder="Destination (e.g. Bank, Ministry)" ' +
          'style="width:100%;padding:12px;font-size:14px;border:2px solid #0d4d26;border-radius:8px;margin-bottom:10px;box-sizing:border-box;">' +
        '<input id="qrMvPurpose" type="text" placeholder="Purpose (e.g. Official errand)" ' +
          'style="width:100%;padding:12px;font-size:14px;border:2px solid #0d4d26;border-radius:8px;margin-bottom:16px;box-sizing:border-box;">' +
        '<div style="display:flex;gap:10px;">' +
          '<button id="qrMvCancel" type="button" ' +
            'style="flex:1;padding:12px;font-size:14px;background:#eee;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Cancel</button>' +
          '<button id="qrMvGo" type="button" ' +
            'style="flex:2;padding:12px;font-size:14px;background:#0d4d26;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Save movement</button>' +
        '</div>'
      );
      const destEl = document.getElementById('qrMvDest');
      const purpEl = document.getElementById('qrMvPurpose');
      const go = document.getElementById('qrMvGo');
      const cancel = document.getElementById('qrMvCancel');
      if (destEl) setTimeout(function () { destEl.focus(); }, 80);
      if (go) go.addEventListener('click', function () {
        resolve({
          destination: destEl ? String(destEl.value || '').trim() : '',
          purpose: purpEl ? String(purpEl.value || '').trim() : ''
        });
      });
      if (cancel) cancel.addEventListener('click', function () { resolve(null); });
    });
  }

  async function qrScanRecordMovementIn(token, staff, openMovement) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    qrScanSetStage('Recording return…');
    startLoader();
    const r = await window.TIS.closeStaffMovement(openMovement.id, t);
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Movement IN recorded', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'You went out at: <b>' + esc(openMovement.time_out || '—') + '</b>',
        'You returned at: <b>' + t + '</b>'
      ]);
      qrShowToast('Movement-in recorded for ' + (staff.full_name || staff.staff_id));
    } else {
      qrScanShowFatal('Return could not be recorded', (r && r.error) || 'Unknown error.');
    }
  }

  function qrScanAskMovementOrClockOut(token, staff) {
    return new Promise(function (resolve) {
      qrScanSetBody(
        '<p style="font-size:14px;color:#333;margin:0 0 4px;">' +
          'Welcome back, <b>' + esc(staff.full_name || '') + '</b>.' +
        '</p>' +
        '<p style="font-size:13px;color:#666;margin:0 0 18px;">' +
          'What do you want to do with this scan?' +
        '</p>' +
        '<button id="qrChoiceMove" type="button" ' +
          'style="width:100%;padding:16px;font-size:15px;background:#d4a017;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:10px;">' +
          '<i class="fas fa-route"></i> Log a movement</button>' +
        '<button id="qrChoiceOut" type="button" ' +
          'style="width:100%;padding:16px;font-size:15px;background:#0d4d26;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:10px;">' +
          '<i class="fas fa-sign-out-alt"></i> Clock OUT for the day</button>' +
        '<button id="qrChoiceCancel" type="button" ' +
          'style="width:100%;padding:12px;font-size:13px;background:#eee;color:#333;border:none;border-radius:8px;cursor:pointer;">' +
          'Cancel</button>'
      );
      const mBtn = document.getElementById('qrChoiceMove');
      const oBtn = document.getElementById('qrChoiceOut');
      const cBtn = document.getElementById('qrChoiceCancel');
      if (mBtn) mBtn.addEventListener('click', function () {
        resolve('movement');
        qrScanRecordMovementOut(token, staff);
      });
      if (oBtn) oBtn.addEventListener('click', function () {
        resolve('clockout');
        qrScanRecordClockOut(token, staff);
      });
      if (cBtn) cBtn.addEventListener('click', function () {
        resolve('cancel');
        qrScanShowFatal('Cancelled', 'Reload the page or scan the QR code again.');
      });
    });
  }

  async function qrScanRecordClockOut(token, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    qrScanSetStage('Clocking out…');
    startLoader();
    const r = await window.TIS.upsertStaffAttendance({
      staff_id:        staff.id,
      attendance_date: dateISO,
      clock_out:       t,
      status:          'Present',
      logged_by:       'QR scan',
      source:          'QR'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Clocked OUT', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time: <b>' + t + '</b>',
        'Have a good evening.'
      ]);
      qrShowToast('Clock-out recorded for ' + (staff.full_name || staff.staff_id));
    } else {
      qrScanShowFatal('Clock-out failed', (r && r.error) || 'Unknown error.');
    }
  }

  // A tiny toast that works even after the portal UI is gone.
  function qrShowToast(msg) {
    let t = document.getElementById('qrScanToast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'qrScanToast';
      t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);' +
        'background:#0d4d26;color:#fff;padding:12px 22px;border-radius:8px;font-size:13px;' +
        'font-family:Arial,sans-serif;z-index:9999;box-shadow:0 6px 20px rgba(0,0,0,0.25);' +
        'transition:opacity .3s;opacity:0;';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    setTimeout(function () { t.style.opacity = '0'; }, 3200);
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.loadActiveQR          = loadActiveQR;
  window.generateQR            = generateQR;
  window.copyQRToken           = copyQRToken;
  window.initQRTab             = initQRTab;
  window.handleQRScanIfPresent = handleQRScanIfPresent;

  // ================================================================
  // [S14b] ID-CARD SCAN HANDLER — runs at boot when the URL is /s/<code>
  //
  //   Routes by what <code> matches:
  //     • Learner PIN  (matches learners.pin)          → attendance
  //     • Staff ID     (matches staff.staff_id)        → smart clock flow
  //     • Visitor code (VIS-01 … VIS-05)               → visitor prompt
  //     • anything else                                → fatal message
  //
  //   Reuses the qrScan* helpers defined in [S14].
  //   Returns true when the page was taken over by a scan; false otherwise.
  // ================================================================
  async function handleIDCardScanIfPresent() {
    // ---------- 1. Read the code from the URL ----------
    let code = '';
    const pathMatch = window.location.pathname.match(/^\/s\/([^\/?#]+)/);
    if (pathMatch && pathMatch[1]) code = decodeURIComponent(pathMatch[1]);

    // Query-string fallback: ?scancode=<code> (useful for testing)
    if (!code) {
      const params = new URLSearchParams(window.location.search);
      code = params.get('scancode') || '';
    }
    if (!code) return false;

    code = code.trim().toUpperCase();
    if (!code) return false;

    // ---------- 2. Blank the portal UI ----------
    document.body.innerHTML = qrScanSkeleton();
    qrScanSetStage('Identifying card…');

    // ---------- 3. Route by code pattern ----------
    //    VIS-01 … VIS-05  → visitor
    //    TIS#### (any)    → could be learner OR staff; disambiguate
    const isVisitorCode = /^VIS-\d{2}$/.test(code);
    const isTisCode     = /^TIS[0-9]+$/.test(code);

    if (isVisitorCode) {
      return await idcScanVisitorFlow(code);
    }

    if (isTisCode) {
      // Try learner first (PINs are the TIS#### pattern).
      qrScanSetStage('Looking up card…');
      startLoader();
      const learnerR = await window.TIS.getLearnerByPin(code);
      stopLoader();

      if (learnerR && learnerR.ok && learnerR.data) {
        return await idcScanLearnerFlow(code, learnerR.data);
      }

      // Not a learner — try staff.
      startLoader();
      const staffR = await window.TIS.listStaff();
      stopLoader();
      const staff = (staffR && staffR.ok ? staffR.data : []).find(function (s) {
        return String(s.staff_id || '').trim().toUpperCase() === code;
      });
      if (staff) {
        return await idcScanStaffFlow(code, staff);
      }

      // Neither learner nor staff.
      qrScanShowFatal(
        'Card not recognised',
        'The code "' + code + '" is not in the system. ' +
        'If this is a new card, ask the office to register it first.'
      );
      await window.TIS.logScanEvent({
        code: code, code_type: 'unknown', action: 'lookup', success: false,
        detail: 'No learner or staff match'
      });
      return true;
    }

    // Unknown code pattern.
    qrScanShowFatal(
      'Card not recognised',
      'The code on this card does not match any known format.'
    );
    await window.TIS.logScanEvent({
      code: code, code_type: 'unknown', action: 'lookup', success: false,
      detail: 'Bad pattern'
    });
    return true;
  }

  // ================================================================
  // [S14b.1] LEARNER SCAN
  //   First scan of the day → Morning present (\)
  //   Second scan same day  → Afternoon present (\ /)
  //   No prompts. Just show the result.
  // ================================================================
  async function idcScanLearnerFlow(code, learner) {
    // We need the active term to record attendance against.
    qrScanSetStage('Recording attendance…');
    startLoader();
    const activeTermR = await window.TIS.getActiveTerm();
    stopLoader();

    if (!activeTermR || !activeTermR.ok || !activeTermR.data) {
      qrScanShowFatal(
        'No active term',
        'The school has not set an active term. ' +
        'Ask an operator to set one from the Terms tab.'
      );
      await window.TIS.logScanEvent({
        code: code, code_type: 'learner',
        actor_id: learner.id, actor_name: learner.name || '',
        action: 'attendance', success: false, detail: 'No active term'
      });
      return true;
    }
    const term = activeTermR.data;

    startLoader();
    const r = await window.TIS.recordLearnerScan(
      learner.id, term.term_type, term.year, 'ID-card scan'
    );
    stopLoader();

    if (!r || !r.ok) {
      qrScanShowFatal('Attendance not recorded', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'learner',
        actor_id: learner.id, actor_name: learner.name || '',
        action: 'attendance', success: false, detail: (r && r.error) || 'Unknown'
      });
      return true;
    }

    const action = r.data.action;
    const mark = r.data.mark;

    let title = '✓ Present';
    let subtitleLine = '';

    if (action === 'morning') {
      title = '✓ Present — Morning';
      subtitleLine = 'First scan of the day.';
    } else if (action === 'afternoon') {
      title = '✓ Present — Afternoon';
      subtitleLine = 'Both morning and afternoon now recorded.';
    } else if (action === 'already-both') {
      title = '✓ Already recorded';
      subtitleLine = 'Both morning and afternoon were already marked today.';
    }

    qrScanShowSuccess(title, [
      '<b>' + esc(learner.name || '') + '</b>',
      'PIN: ' + esc(learner.pin || ''),
      'Class: ' + esc(learner.class_name || '—'),
      'Term: ' + esc(term.label || (term.term_type.toUpperCase() + ' TERM ' + term.year)),
      'Mark: <b>' + esc(mark) + '</b>',
      subtitleLine ? '<div style="margin-top:10px;font-size:13px;color:#666;">' + esc(subtitleLine) + '</div>' : ''
    ]);

    await window.TIS.logScanEvent({
      code: code, code_type: 'learner',
      actor_id: learner.id, actor_name: learner.name || '',
      action: 'attendance', success: true,
      detail: 'mark=' + mark + ' action=' + action
    });
    return true;
  }

  // ================================================================
  // [S14b.2] STAFF SCAN
  //   Reuses the exact smart-scan logic used by /g/<token>.
  //   We do NOT prompt for Staff ID — the code on the card already
  //   identifies the staff. Everything else is identical.
  // ================================================================
  async function idcScanStaffFlow(code, staff) {
    const today = new Date().toISOString().slice(0, 10);

    qrScanSetStage('Checking today\'s activity…');
    startLoader();
    const attR = await window.TIS.listStaffAttendanceToday(today);
    const mvR  = await window.TIS.listStaffMovementsToday(today);
    stopLoader();

    const attRow = (attR && attR.ok ? attR.data : []).find(function (a) { return a.staff_id === staff.id; });
    const movements = (mvR && mvR.ok ? mvR.data : []).filter(function (mm) { return mm.staff_id === staff.id; });
    const openMovement = movements.find(function (mm) { return !mm.time_in; });

    // Case 1: no clock-in yet today → Clock IN.
    if (!attRow || !attRow.clock_in) {
      return await idcStaffDoClockIn(code, staff);
    }

    // Case 2: already clocked out → nothing to do.
    if (attRow.clock_out) {
      qrScanShowFatal(
        'Already clocked out',
        (staff.full_name || staff.staff_id) + ' already clocked out today. ' +
        'See an admin if this is wrong.'
      );
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'clock-out', success: false, detail: 'Already clocked out'
      });
      return true;
    }

    // Case 3: there is a movement with no time_in → record return.
    if (openMovement) {
      return await idcStaffDoMovementIn(code, staff, openMovement);
    }

    // Case 4: clocked in, not yet clocked out, no open movement →
    //         ask the operator what this scan means.
    return await idcStaffAskMovementOrClockOut(code, staff);
  }

  async function idcStaffDoClockIn(code, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    qrScanSetStage('Clocking in…');
    startLoader();
    const r = await window.TIS.upsertStaffAttendance({
      staff_id:        staff.id,
      attendance_date: dateISO,
      clock_in:        t,
      status:          'Present',
      logged_by:       'ID-card scan',
      source:          'QR'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Clocked IN', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time: <b>' + t + '</b>',
        'Date: ' + dateISO
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'clock-in', success: true, detail: 'time=' + t
      });
    } else {
      qrScanShowFatal('Clock-in failed', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'clock-in', success: false, detail: (r && r.error) || 'Unknown'
      });
    }
    return true;
  }

  async function idcStaffDoMovementOut(code, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    const info = await qrScanPromptMovementInfo();
    if (!info) return true;

    qrScanSetStage('Recording movement…');
    startLoader();
    const r = await window.TIS.createStaffMovement({
      staff_id:      staff.id,
      movement_date: dateISO,
      time_out:      t,
      time_in:       null,
      destination:   info.destination,
      purpose:       info.purpose,
      logged_by:     'ID-card scan'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Movement OUT recorded', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time out: <b>' + t + '</b>',
        'Destination: ' + esc(info.destination || '—'),
        'Purpose: ' + esc(info.purpose || '—'),
        '<div style="margin-top:14px;font-size:13px;color:#666;">' +
          'Scan the card again when you return.' +
        '</div>'
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'movement-out', success: true,
        detail: 'to=' + (info.destination || '') + ' purpose=' + (info.purpose || '')
      });
    } else {
      qrScanShowFatal('Movement could not be recorded', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'movement-out', success: false, detail: (r && r.error) || 'Unknown'
      });
    }
    return true;
  }

  async function idcStaffDoMovementIn(code, staff, openMovement) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

    qrScanSetStage('Recording return…');
    startLoader();
    const r = await window.TIS.closeStaffMovement(openMovement.id, t);
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Movement IN recorded', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Went out at: <b>' + esc(openMovement.time_out || '—') + '</b>',
        'Returned at: <b>' + t + '</b>'
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'movement-in', success: true, detail: 'time=' + t
      });
    } else {
      qrScanShowFatal('Return could not be recorded', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'movement-in', success: false, detail: (r && r.error) || 'Unknown'
      });
    }
    return true;
  }

  function idcStaffAskMovementOrClockOut(code, staff) {
    return new Promise(function (resolve) {
      qrScanSetBody(
        '<p style="font-size:14px;color:#333;margin:0 0 4px;">' +
          'Welcome back, <b>' + esc(staff.full_name || '') + '</b>.' +
        '</p>' +
        '<p style="font-size:13px;color:#666;margin:0 0 18px;">' +
          'What do you want to do with this scan?' +
        '</p>' +
        '<button id="idcChoiceMove" type="button" ' +
          'style="width:100%;padding:16px;font-size:15px;background:#d4a017;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:10px;">' +
          '<i class="fas fa-route"></i> Log a movement</button>' +
        '<button id="idcChoiceOut" type="button" ' +
          'style="width:100%;padding:16px;font-size:15px;background:#0d4d26;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:10px;">' +
          '<i class="fas fa-sign-out-alt"></i> Clock OUT for the day</button>' +
        '<button id="idcChoiceCancel" type="button" ' +
          'style="width:100%;padding:12px;font-size:13px;background:#eee;color:#333;border:none;border-radius:8px;cursor:pointer;">' +
          'Cancel</button>'
      );
      const mBtn = document.getElementById('idcChoiceMove');
      const oBtn = document.getElementById('idcChoiceOut');
      const cBtn = document.getElementById('idcChoiceCancel');
      if (mBtn) mBtn.addEventListener('click', async function () {
        await idcStaffDoMovementOut(code, staff);
        resolve(true);
      });
      if (oBtn) oBtn.addEventListener('click', async function () {
        await idcStaffDoClockOut(code, staff);
        resolve(true);
      });
      if (cBtn) cBtn.addEventListener('click', function () {
        qrScanShowFatal('Cancelled', 'You can close this page.');
        resolve(true);
      });
    });
  }

  async function idcStaffDoClockOut(code, staff) {
    const now = new Date();
    const t = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    const dateISO = now.toISOString().slice(0, 10);

    qrScanSetStage('Clocking out…');
    startLoader();
    const r = await window.TIS.upsertStaffAttendance({
      staff_id:        staff.id,
      attendance_date: dateISO,
      clock_out:       t,
      status:          'Present',
      logged_by:       'ID-card scan',
      source:          'QR'
    });
    stopLoader();

    if (r && r.ok) {
      qrScanShowSuccess('✓ Clocked OUT', [
        '<b>' + esc(staff.full_name || '') + '</b>',
        'Staff No: ' + esc(staff.staff_id || ''),
        'Time: <b>' + t + '</b>',
        'Have a good evening.'
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'clock-out', success: true, detail: 'time=' + t
      });
    } else {
      qrScanShowFatal('Clock-out failed', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'staff',
        actor_id: staff.id, actor_name: staff.full_name || '',
        action: 'clock-out', success: false, detail: (r && r.error) || 'Unknown'
      });
    }
    return true;
  }

  // ================================================================
  // [S14b.3] VISITOR SCAN
  //   First scan of the day for a card → ask name / purpose / agency
  //   Second scan same day for the same card → clock out
  // ================================================================
  async function idcScanVisitorFlow(code) {
    const today = new Date().toISOString().slice(0, 10);

    // Is there an open visit for this card today?
    qrScanSetStage('Checking card…');
    startLoader();
    let openVisit = null;
    try {
      const sb = window.supabase
        ? window.supabase.createClient
          ? null  // app.js has no direct SDK handle; use TIS instead
          : null
        : null;
      // Fall through to a TIS-level check via recordVisitorScan — but
      // to avoid double insert, we query TIS.listVisitsToday if available.
      if (typeof window.TIS.listVisitsToday === 'function') {
        const r = await window.TIS.listVisitsToday(today);
        if (r && r.ok) {
          openVisit = (r.data || []).find(function (v) {
            return String(v.card_code || '').toUpperCase() === code && !v.time_out;
          });
        }
      }
    } catch (e) { /* silent */ }
    stopLoader();

    if (openVisit) {
      // Second scan → close out.
      return await idcVisitorCheckOut(code, openVisit);
    }
    // First scan → check in.
    return await idcVisitorCheckIn(code);
  }

  async function idcVisitorCheckIn(code) {
    // Prompt: name
    const visitorName = await idcPromptOneLine(
      'Visitor name',
      'Enter the visitor\'s full name.',
      'e.g. Mr Adebayo Johnson'
    );
    if (!visitorName) {
      qrScanShowFatal('Cancelled', 'No visit was recorded.');
      return true;
    }

    // Prompt: purpose (Official / Personal)
    const purpose = await idcPromptChoice(
      'Purpose of visit',
      'Is this visit official or personal?',
      [
        { value: 'Official', label: 'Official' },
        { value: 'Personal', label: 'Personal' }
      ]
    );
    if (!purpose) {
      qrScanShowFatal('Cancelled', 'No visit was recorded.');
      return true;
    }

    let agency = null;
    let agencyOther = null;

    if (purpose === 'Official') {
      const agencyChoice = await idcPromptChoice(
        'Which agency?',
        'Select the agency the visitor is representing.',
        [
          { value: 'Ministry Of Education',  label: 'Ministry Of Education' },
          { value: 'Ministry of Health',     label: 'Ministry of Health' },
          { value: 'Internal Revenue',       label: 'Internal Revenue' },
          { value: 'NAPPS',                  label: 'NAPPS' },
          { value: 'Community',              label: 'Community' },
          { value: 'Police/Security',        label: 'Police / Security' },
          { value: '__OTHER__',              label: 'Other (please specify)' }
        ]
      );
      if (!agencyChoice) {
        qrScanShowFatal('Cancelled', 'No visit was recorded.');
        return true;
      }
      if (agencyChoice === '__OTHER__') {
        const other = await idcPromptOneLine(
          'Please specify',
          'Which agency is the visitor from?',
          'e.g. WAEC, NECO, Ministry of Works'
        );
        if (!other) {
          qrScanShowFatal('Cancelled', 'No visit was recorded.');
          return true;
        }
        agency = 'Other';
        agencyOther = other;
      } else {
        agency = agencyChoice;
      }
    }

    qrScanSetStage('Recording visit…');
    startLoader();
    const r = await window.TIS.recordVisitorScan({
      card_code:    code,
      visitor_name: visitorName,
      purpose:      purpose,
      agency:       agency,
      agency_other: agencyOther,
      recorded_by:  'ID-card scan'
    });
    stopLoader();

    if (r && r.ok) {
      const timeIn = (r.data.row && r.data.row.time_in) || '';
      qrScanShowSuccess('✓ Visitor checked in', [
        '<b>' + esc(visitorName) + '</b>',
        'Purpose: ' + esc(purpose),
        agency ? 'Agency: ' + esc(agency) + (agencyOther ? ' — ' + esc(agencyOther) : '') : '',
        'Time in: <b>' + esc(timeIn) + '</b>',
        '<div style="margin-top:14px;font-size:13px;color:#666;">' +
          'Scan this same card again when the visitor leaves, to record their time out.' +
        '</div>'
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'visitor',
        actor_id: null, actor_name: visitorName,
        action: 'visit-in', success: true,
        detail: 'purpose=' + purpose + (agency ? ' agency=' + agency : '')
      });
    } else {
      qrScanShowFatal('Visit not recorded', (r && r.error) || 'Unknown error.');
      await window.TIS.logScanEvent({
        code: code, code_type: 'visitor',
        actor_id: null, actor_name: visitorName,
        action: 'visit-in', success: false, detail: (r && r.error) || 'Unknown'
      });
    }
    return true;
  }

  async function idcVisitorCheckOut(code, openVisit) {
    qrScanSetStage('Recording departure…');
    startLoader();
    const r = await window.TIS.recordVisitorScan({
      card_code:    code,
      visitor_name: openVisit.visitor_name || '',
      purpose:      openVisit.purpose || '',
      agency:       openVisit.agency || null,
      agency_other: openVisit.agency_other || null,
      recorded_by:  'ID-card scan'
    });
    stopLoader();

    if (r && r.ok) {
      const timeOut = (r.data.row && r.data.row.time_out) || '';
      qrScanShowSuccess('✓ Visitor checked out', [
        '<b>' + esc(openVisit.visitor_name || '') + '</b>',
        'Time in: <b>' + esc(openVisit.time_in || '—') + '</b>',
        'Time out: <b>' + esc(timeOut) + '</b>'
      ]);
      await window.TIS.logScanEvent({
        code: code, code_type: 'visitor',
        actor_id: null, actor_name: openVisit.visitor_name || '',
        action: 'visit-out', success: true, detail: 'time=' + timeOut
      });
    } else {
      qrScanShowFatal('Departure not recorded', (r && r.error) || 'Unknown error.');
    }
    return true;
  }

  // ================================================================
  // [S14b.4] Small prompt helpers used by the visitor flow
  // ================================================================
  function idcPromptOneLine(title, subtitle, placeholder) {
    return new Promise(function (resolve) {
      qrScanSetBody(
        '<p style="font-size:14px;color:#333;margin:0 0 6px;">' +
          '<b>' + esc(title) + '</b>' +
        '</p>' +
        '<p style="font-size:13px;color:#666;margin:0 0 14px;">' + esc(subtitle || '') + '</p>' +
        '<input id="idcPromptInput" type="text" placeholder="' + escAttr(placeholder || '') + '" ' +
          'style="width:100%;padding:14px;font-size:16px;border:2px solid #0d4d26;border-radius:8px;box-sizing:border-box;">' +
        '<div style="display:flex;gap:10px;margin-top:16px;">' +
          '<button id="idcPromptCancel" type="button" ' +
            'style="flex:1;padding:12px;font-size:14px;background:#eee;color:#333;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Cancel</button>' +
          '<button id="idcPromptGo" type="button" ' +
            'style="flex:2;padding:12px;font-size:14px;background:#0d4d26;color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:700;">Continue</button>' +
        '</div>'
      );
      const inp = document.getElementById('idcPromptInput');
      const goBtn = document.getElementById('idcPromptGo');
      const cancelBtn = document.getElementById('idcPromptCancel');
      if (inp) { inp.value = ''; setTimeout(function () { inp.focus(); }, 80); }
      if (goBtn) goBtn.addEventListener('click', submit);
      if (cancelBtn) cancelBtn.addEventListener('click', function () { resolve(''); });
      if (inp) inp.addEventListener('keypress', function (e) { if (e.key === 'Enter') submit(); });
      function submit() {
        const v = inp ? String(inp.value || '').trim() : '';
        if (!v) { if (inp) inp.style.borderColor = '#c0392b'; return; }
        resolve(v);
      }
    });
  }

  function idcPromptChoice(title, subtitle, options) {
    return new Promise(function (resolve) {
      let html = '<p style="font-size:14px;color:#333;margin:0 0 6px;">' +
                 '<b>' + esc(title) + '</b></p>' +
                 '<p style="font-size:13px;color:#666;margin:0 0 14px;">' + esc(subtitle || '') + '</p>';
      options.forEach(function (opt, i) {
        html += '<button id="idcChoice_' + i + '" type="button" ' +
                'style="width:100%;padding:14px;font-size:15px;background:#0d4d26;color:#fff;' +
                'border:none;border-radius:8px;cursor:pointer;font-weight:700;margin-bottom:10px;">' +
                esc(opt.label) + '</button>';
      });
      html += '<button id="idcChoiceCancel" type="button" ' +
              'style="width:100%;padding:12px;font-size:13px;background:#eee;color:#333;' +
              'border:none;border-radius:8px;cursor:pointer;">Cancel</button>';
      qrScanSetBody(html);

      options.forEach(function (opt, i) {
        const b = document.getElementById('idcChoice_' + i);
        if (b) b.addEventListener('click', function () { resolve(opt.value); });
      });
      const c = document.getElementById('idcChoiceCancel');
      if (c) c.addEventListener('click', function () { resolve(''); });
    });
  }
   // ================================================================
  // [S15] REPORTS — Workshop
  //   Edit psychomotor ratings and comments for every learner in a
  //   class. Auto-assign (from Delivery 3) already fills values when
  //   scores are uploaded; this tab lets humans override them.
  // ================================================================
  const WS_RATING_FIELDS = [
    { key: 'leadership',   label: 'Leadership' },
    { key: 'hardwork',     label: 'Hardwork' },
    { key: 'neatness',     label: 'Neatness' },
    { key: 'politeness',   label: 'Politeness' },
    { key: 'punctuality',  label: 'Punctuality' },
    { key: 'interaction',  label: 'Interaction' },
    { key: 'honesty',      label: 'Honesty' },
    { key: 'communication',label: 'Communication' },
    { key: 'reading_club', label: 'Reading Club' },
    { key: 'perseverance', label: 'Perseverance' }
  ];

  const WS_RATING_VALUES = ['EXCELLENT','V.GOOD','GOOD','AVERAGE','FAIR','POOR'];

  let wsState = {
    className: null,
    term: null,
    year: null,
    learners: [],
    ratings: {},          // learnerId → report_ratings row (or null)
    averages: {},         // learnerId → average from scores this term
    dirty: {},            // learnerId → true if row has unsaved changes
    loaded: false
  };

  function initReportsTab() {
    const btn   = $('btnWsLoad');
    const saveA = $('btnWsSaveAll');

    if (btn && !btn.__wired) {
      btn.addEventListener('click', wsLoadClass);
      btn.__wired = true;
    }
    if (saveA && !saveA.__wired) {
      saveA.addEventListener('click', wsSaveAllChanged);
      saveA.__wired = true;
    }

    // Populate class picker and default term/year.
    wsPopulateClassPicker();
  }
  window.initReportsTab = initReportsTab;

  async function wsPopulateClassPicker() {
    const sel = $('wsClass');
    if (!sel) return;
    const r = await window.TIS.listClasses();
    const classes = (r && r.ok ? r.data : [])
      .filter(function (c) { return c.is_active !== false; })
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });
    sel.innerHTML = '<option value="">-- Select --</option>' +
      classes.map(function (c) {
        return '<option value="' + escAttr(c.name) + '">' + esc(c.name) + '</option>';
      }).join('');

    // Default to active term.
    try {
      const at = await window.TIS.getActiveTerm();
      if (at && at.ok && at.data) {
        const t = $('wsTerm'); if (t) t.value = at.data.term_type || '1st';
        const y = $('wsYear'); if (y) y.value = String(at.data.year || new Date().getFullYear());
      }
    } catch (e) { /* silent */ }
  }

  async function wsLoadClass() {
    const clsEl  = $('wsClass');
    const termEl = $('wsTerm');
    const yearEl = $('wsYear');
    const feed   = $('wsFeedback');

    const cls  = clsEl  ? clsEl.value  : '';
    const term = termEl ? termEl.value : '';
    const year = yearEl ? parseInt(yearEl.value, 10) : 0;

    if (!cls)  { if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Pick a class.'; } return; }
    if (!term || !year) { if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Pick a term and year.'; } return; }

    if (feed) { feed.style.color = '#666'; feed.textContent = 'Loading ' + cls + ' …'; }
    setHTML('wsContent', pageLoaderHTML('Loading class…'));
    startLoader();

    try {
      // 1. Learners in this class.
      const learnersR = await window.TIS.listLearners();
      const learners = (learnersR && learnersR.ok ? learnersR.data : [])
        .filter(function (l) {
          const w = (l.date_of_withdrawal || '').toString().trim();
          if (w && w !== '' && w !== 'N/A') return false;
          return l.class_name === cls;
        })
        .sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

      if (learners.length === 0) {
        stopLoader();
        setHTML('wsContent', emptyHTML('fa-users', 'No learners in ' + cls));
        if (feed) feed.textContent = '';
        return;
      }

      // 2. Existing report_ratings rows for these learners.
      const ratingsR = await Promise.all(
        learners.map(function (l) {
          return window.TIS.getReportRatings(l.id, term, year);
        })
      );
      const ratingsMap = {};
      learners.forEach(function (l, i) {
        const r = ratingsR[i];
        ratingsMap[l.id] = (r && r.ok) ? r.data : null;
      });

      // 3. Averages from scores — used to show the "band" per learner.
      const scoresR = await window.TIS.getScoresForLearners(
        learners.map(function (l) { return l.id; }), term, year
      );
      const scoresMap = (scoresR && scoresR.ok && scoresR.data) ? scoresR.data : {};

      const averages = {};
      learners.forEach(function (l) {
        let total = 0, n = 0;
        Object.keys(scoresMap).forEach(function (k) {
          const parts = k.split('|');
          if (Number(parts[0]) !== l.id) return;
          const row = scoresMap[k];
          if (row && row.total != null) { total += Number(row.total); n++; }
        });
        averages[l.id] = n > 0 ? total / n : null;
      });

      stopLoader();

      wsState.className = cls;
      wsState.term = term;
      wsState.year = year;
      wsState.learners = learners;
      wsState.ratings = ratingsMap;
      wsState.averages = averages;
      wsState.dirty = {};
      wsState.loaded = true;

      wsRenderTable();

      if (feed) {
        feed.style.color = '#0d4d26';
        feed.textContent = learners.length + ' learner(s) loaded · ' + term.toUpperCase() + ' TERM ' + year;
      }
    } catch (err) {
      stopLoader();
      const msg = err && err.message ? err.message : String(err);
      if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Could not load class: ' + msg; }
      setHTML('wsContent', errorHTML('Could not load class', msg));
    }
  }
  window.wsLoadClass = wsLoadClass;

  // ================================================================
  // Comment-bank cache.
  //   Loaded once per class-load, per field, per band. Re-used by
  //   the default preload and (Delivery 6) by the Up/Down cycler.
  //   Key shape: "<field>|<band>" → array of { text, category }
  // ================================================================
  let __wsCommentBankCache = {};

  async function wsEnsureCommentBank(field, band) {
    const key = field + '|' + band;
    if (__wsCommentBankCache[key]) return __wsCommentBankCache[key];
    try {
      const r = await window.TIS.getCommentBank(field, band);
      const list = (r && r.ok && r.data ? r.data : [])
        .filter(function (c) { return c.is_active !== false; });
      __wsCommentBankCache[key] = list;
      return list;
    } catch (e) {
      __wsCommentBankCache[key] = [];
      return [];
    }
  }
  window.wsEnsureCommentBank = wsEnsureCommentBank;

  // Fill {first}, {strong1}, {weak1} placeholders. strong1/weak1 are
  // empty here because the Workshop has no scores context — the report
  // card renderer fills them separately.
  function wsFillCommentTemplate(tpl, learner) {
    const full = (learner && learner.name) || '';
    const first = full.split(' ').slice(1).join(' ') || full.split(' ')[0] || '';
    return String(tpl || '')
      .replace(/\{first\}/g,   first)
      .replace(/\{strong1\}/g, '')
      .replace(/\{weak1\}/g,   '');
  }
  window.wsFillCommentTemplate = wsFillCommentTemplate;

  async function wsRenderTable() {
    if (!wsState.loaded) return;
    const learners = wsState.learners;
    const termLabel = wsState.term.toUpperCase() + ' TERM ' + wsState.year;

    // ---- Preload the comment bank for every (field, band) combo we
    //      will need on this render. Two fields × up to six bands,
    //      but only bands actually present. Cache is keyed so repeat
    //      loads of the same class cost nothing.
    const bandsNeeded = {};
    learners.forEach(function (l) {
      const avg = wsState.averages[l.id];
      const band = (avg != null) ? window.TIS.bandForAverage(avg) : 'average';
      bandsNeeded[band] = true;
    });
    const bandKeys = Object.keys(bandsNeeded);
    await Promise.all([
      Promise.all(bandKeys.map(function (b) { return wsEnsureCommentBank('teacher', b); })),
      Promise.all(bandKeys.map(function (b) { return wsEnsureCommentBank('principal', b); }))
    ]);

    let html = '<div class="card-bg" style="padding:0;overflow-x:auto;">';
    html += '<div style="padding:10px 14px;background:#0d4d26;color:#fff;font-weight:700;font-size:13px;">' +
            esc(wsState.className) + ' — ' + esc(termLabel) + '</div>';
    html += '<table class="ws-table" style="width:100%;border-collapse:collapse;font-size:12px;min-width:1600px;">';

    // Header
    html += '<thead>';
    html += '<tr style="background:#e8f5e9;">';
    html += '<th style="text-align:left;padding:8px 6px;position:sticky;left:0;background:#e8f5e9;z-index:2;min-width:70px;">PIN</th>';
    html += '<th style="text-align:left;padding:8px 6px;position:sticky;left:70px;background:#e8f5e9;z-index:2;min-width:200px;">Name</th>';
    html += '<th style="padding:8px 6px;min-width:60px;">Avg</th>';
    html += '<th style="padding:8px 6px;min-width:80px;">Band</th>';
    WS_RATING_FIELDS.forEach(function (f) {
      html += '<th style="padding:8px 4px;min-width:90px;font-size:10px;">' + esc(f.label) + '</th>';
    });
    html += '<th style="text-align:left;padding:8px 6px;min-width:280px;">Teacher Comment</th>';
    html += '<th style="text-align:left;padding:8px 6px;min-width:280px;">Principal Comment</th>';
    html += '<th style="padding:8px 6px;min-width:70px;">State</th>';
    html += '<th style="padding:8px 6px;min-width:80px;">Save</th>';
    html += '</tr></thead><tbody>';

    // Rows
    learners.forEach(function (l) {
      const rating = wsState.ratings[l.id];
      const avg = wsState.averages[l.id];
      const band = (avg != null) ? window.TIS.bandForAverage(avg) : 'average';
      const bandLabel = (avg != null) ? band.replace('_', ' ').toUpperCase() : '—';

      // Pre-fill ratings
      const r = (rating && rating.ratings) ? rating.ratings : {};
      const teacherEdited   = rating && rating.teacher_edited;
      const principalEdited = rating && rating.principal_edited;

      // ---- Comment defaults ----
      // Case A: no rating row at all.
      // Case B: rating row exists but comment is empty.
      // Cases C and D: comment already present → leave untouched.
      const existingTeacher   = (rating && rating.teacher_comment)   || '';
      const existingPrincipal = (rating && rating.principal_comment) || '';

      let teacherValue   = existingTeacher;
      let principalValue = existingPrincipal;
      let teacherIsDefault   = false;
      let principalIsDefault = false;

      if (!existingTeacher) {
        const bank = __wsCommentBankCache['teacher|' + band] || [];
        if (bank.length > 0) {
          teacherValue = wsFillCommentTemplate(bank[0].text, l);
          teacherIsDefault = true;
        }
      }
      if (!existingPrincipal) {
        const bank = __wsCommentBankCache['principal|' + band] || [];
        if (bank.length > 0) {
          principalValue = wsFillCommentTemplate(bank[0].text, l);
          principalIsDefault = true;
        }
      }

      // Row background: green if there's a ratings row, grey if not.
      const rowBg = rating ? '#f7fbf7' : '#fafafa';

      html += '<tr data-learner-row="' + l.id + '" style="background:' + rowBg + ';">';
      html += '<td style="padding:6px;border-bottom:1px solid #eee;position:sticky;left:0;background:' + rowBg + ';z-index:1;">' + esc(l.pin || '') + '</td>';
      html += '<td style="padding:6px;border-bottom:1px solid #eee;position:sticky;left:70px;background:' + rowBg + ';z-index:1;font-weight:600;">' + esc(l.name || '') + '</td>';
      html += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;font-weight:700;">' +
              (avg != null ? avg.toFixed(1) : '—') + '</td>';
      html += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;font-size:10px;">' +
              esc(bandLabel) + '</td>';

      WS_RATING_FIELDS.forEach(function (f) {
        const v = r[f.key] || 'AVERAGE';
        html += '<td style="padding:4px;border-bottom:1px solid #eee;text-align:center;">';
        html += '<select class="ws-rating" data-learner-id="' + l.id + '" data-field="' + f.key +
                '" onchange="wsMarkDirty(' + l.id + ')" style="width:100%;font-size:11px;padding:3px;border:1px solid #ccc;border-radius:4px;">';
        WS_RATING_VALUES.forEach(function (val) {
          html += '<option value="' + val + '"' + (val === v ? ' selected' : '') + '>' + val + '</option>';
        });
        html += '</select>';
        html += '</td>';
      });

      // Teacher comment
      html += '<td style="padding:4px;border-bottom:1px solid #eee;">';
      html += '<textarea class="ws-comment" data-learner-id="' + l.id + '" data-field="teacher_comment" ' +
              'data-default="' + (teacherIsDefault ? '1' : '0') + '" ' +
              'oninput="wsMarkDirty(' + l.id + ')" rows="3" ' +
              'style="width:100%;font-size:11px;padding:4px;border:1px solid ' + (teacherIsDefault ? '#d4a017' : '#ccc') + ';border-radius:4px;box-sizing:border-box;">' +
              esc(teacherValue) + '</textarea>';
      html += '<button type="button" class="btn btn-sm btn-secondary" style="margin-top:2px;font-size:10px;padding:2px 6px;" ' +
              'onclick="wsOpenCommentBank(\'teacher\', \'' + band + '\', ' + l.id + ', \'teacher_comment\')">' +
              'Pick from bank</button>';
      html += '</td>';

      // Principal comment
      html += '<td style="padding:4px;border-bottom:1px solid #eee;">';
      html += '<textarea class="ws-comment" data-learner-id="' + l.id + '" data-field="principal_comment" ' +
              'data-default="' + (principalIsDefault ? '1' : '0') + '" ' +
              'oninput="wsMarkDirty(' + l.id + ')" rows="3" ' +
              'style="width:100%;font-size:11px;padding:4px;border:1px solid ' + (principalIsDefault ? '#d4a017' : '#ccc') + ';border-radius:4px;box-sizing:border-box;">' +
              esc(principalValue) + '</textarea>';
      html += '<button type="button" class="btn btn-sm btn-secondary" style="margin-top:2px;font-size:10px;padding:2px 6px;" ' +
              'onclick="wsOpenCommentBank(\'principal\', \'' + band + '\', ' + l.id + ', \'principal_comment\')">' +
              'Pick from bank</button>';
      html += '</td>';

      // State chip — priority: EDITED > AUTO > DEFAULT > —
      let chip = '<span style="color:#999;font-size:10px;">—</span>';
      if (teacherEdited || principalEdited) {
        chip = '<span style="background:#d4a017;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">EDITED</span>';
      } else if (rating) {
        chip = '<span style="background:#e0e0e0;color:#333;font-size:10px;padding:2px 6px;border-radius:4px;">AUTO</span>';
      } else if (teacherIsDefault || principalIsDefault) {
        chip = '<span style="background:#e8f5e9;color:#0d4d26;border:1px solid #c8e6c9;font-size:10px;padding:2px 6px;border-radius:4px;">DEFAULT</span>';
      }
      html += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;" data-state-chip="' + l.id + '">' + chip + '</td>';

      // Save button
      html += '<td style="padding:6px;border-bottom:1px solid #eee;text-align:center;">';
      html += '<button type="button" class="btn btn-sm btn-success" onclick="wsSaveRow(' + l.id + ')" style="font-size:10px;padding:4px 8px;">Save</button>';
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    setHTML('wsContent', html);
  }

  function wsMarkDirty(learnerId) {
    wsState.dirty[learnerId] = true;
    // Visual cue: highlight the state chip.
    const chip = document.querySelector('[data-state-chip="' + learnerId + '"]');
    if (chip) chip.innerHTML = '<span style="background:#c0392b;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">UNSAVED</span>';
  }
  window.wsMarkDirty = wsMarkDirty;

  function wsCollectRow(learnerId) {
    const ratings = {};
    WS_RATING_FIELDS.forEach(function (f) {
      const sel = document.querySelector('.ws-rating[data-learner-id="' + learnerId + '"][data-field="' + f.key + '"]');
      ratings[f.key] = sel ? sel.value : 'AVERAGE';
    });
    const tEl = document.querySelector('.ws-comment[data-learner-id="' + learnerId + '"][data-field="teacher_comment"]');
    const pEl = document.querySelector('.ws-comment[data-learner-id="' + learnerId + '"][data-field="principal_comment"]');
    return {
      ratings: ratings,
      teacher_comment: tEl ? tEl.value.trim() : '',
      principal_comment: pEl ? pEl.value.trim() : ''
    };
  }

  async function wsSaveRow(learnerId) {
    const learner = wsState.learners.find(function (l) { return l.id === learnerId; });
    if (!learner) return;

    // Detect which fields changed relative to the last saved snapshot.
    const prior = wsState.ratings[learnerId] || {};
    const row = wsCollectRow(learnerId);

    // Consider a field "edited by human" if it differs from the auto-assigned
    // snapshot OR if we already had an edited flag.
    const teacherEdited   = (!!prior.teacher_edited)   || (prior.teacher_comment   !== row.teacher_comment);
    const principalEdited = (!!prior.principal_edited) || (prior.principal_comment !== row.principal_comment);

    startLoader();
    const r = await window.TIS.upsertReportRating({
      learner_id: learnerId,
      term_type:  wsState.term,
      year:       wsState.year,
      ratings:    row.ratings,
      teacher_comment:   row.teacher_comment,
      principal_comment: row.principal_comment,
      teacher_edited:    teacherEdited,
      principal_edited:  principalEdited,
      updated_by: (State.profile && State.profile.name) || 'Workshop'
    });
    stopLoader();

    if (!r || !r.ok) {
      showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
      return;
    }

    wsState.ratings[learnerId] = r.data;
    delete wsState.dirty[learnerId];

    // Update the state chip on-screen without re-rendering the whole table.
    const chip = document.querySelector('[data-state-chip="' + learnerId + '"]');
    if (chip) {
      chip.innerHTML = '<span style="background:#d4a017;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">EDITED</span>';
    }

    showToast('Saved ' + (learner.name || '') + '.', 'success');
  }
  window.wsSaveRow = wsSaveRow;

  async function wsSaveAllChanged() {
    const dirty = Object.keys(wsState.dirty);
    if (dirty.length === 0) { showToast('No changes to save.', 'info'); return; }
    if (!confirm('Save ' + dirty.length + ' changed row(s)?')) return;

    let okCount = 0, failCount = 0;
    for (let i = 0; i < dirty.length; i++) {
      const id = parseInt(dirty[i], 10);
      const learner = wsState.learners.find(function (l) { return l.id === id; });
      if (!learner) continue;

      const prior = wsState.ratings[id] || {};
      const row = wsCollectRow(id);
      const teacherEdited   = (!!prior.teacher_edited)   || (prior.teacher_comment   !== row.teacher_comment);
      const principalEdited = (!!prior.principal_edited) || (prior.principal_comment !== row.principal_comment);

      const r = await window.TIS.upsertReportRating({
        learner_id: id,
        term_type:  wsState.term,
        year:       wsState.year,
        ratings:    row.ratings,
        teacher_comment:   row.teacher_comment,
        principal_comment: row.principal_comment,
        teacher_edited:    teacherEdited,
        principal_edited:  principalEdited,
        updated_by: (State.profile && State.profile.name) || 'Workshop'
      });
      if (r && r.ok) {
        okCount++;
        wsState.ratings[id] = r.data;
        delete wsState.dirty[id];
        const chip = document.querySelector('[data-state-chip="' + id + '"]');
        if (chip) chip.innerHTML = '<span style="background:#d4a017;color:#fff;font-size:10px;padding:2px 6px;border-radius:4px;">EDITED</span>';
      } else {
        failCount++;
      }
    }
    showToast('Saved ' + okCount + ' row(s)' + (failCount ? ', ' + failCount + ' failed' : '') + '.', failCount ? 'warning' : 'success');
  }
  window.wsSaveAllChanged = wsSaveAllChanged;

  // ----------------------------------------------------------------
  // Comment bank picker
  // ----------------------------------------------------------------
  async function wsOpenCommentBank(field, band, learnerId, targetField) {
    startLoader();
    const r = await window.TIS.getCommentBank(field, band);
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load comment bank.', 'error'); return; }

    const comments = (r.data || []).filter(function (c) { return c.is_active !== false; });
    if (comments.length === 0) { showToast('No comments in the bank for that band.', 'info'); return; }

    const learner = wsState.learners.find(function (l) { return l.id === learnerId; });
    const fullName = learner ? (learner.name || '') : '';
    const firstName = firstNameOf(fullName);

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" style="max-width:720px;max-height:80vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Comment bank — ' + esc(field === 'teacher' ? "Teacher" : "Principal") + ' · ' + esc(band.replace('_', ' ')) + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px;">Click a comment to place it in the ' +
            esc(field === 'teacher' ? "Teacher's" : "Principal's") + ' field for <b>' + esc(fullName) + '</b>.</p>';
    html += '<div style="display:grid;grid-template-columns:1fr;gap:6px;">';
    comments.forEach(function (c) {
      const text = fillCommentTemplate(c.text, {
        first: firstName,
        strong1: '',
        weak1: ''
      });
      html += '<div style="border:1px solid #e0e6e2;border-radius:8px;padding:10px;cursor:pointer;background:#f7fbf7;" ' +
              'onclick="wsApplyComment(' + learnerId + ', \'' + escAttr(targetField) + '\', \'' + escAttr(text) + '\')">' +
              '<div style="font-size:12px;color:#333;">' + esc(text) + '</div>' +
              '<div style="font-size:10px;color:#999;margin-top:4px;">' + esc(c.category || 'general') + '</div>' +
              '</div>';
    });
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }
  window.wsOpenCommentBank = wsOpenCommentBank;

  function wsApplyComment(learnerId, targetField, text) {
    const el = document.querySelector('.ws-comment[data-learner-id="' + learnerId + '"][data-field="' + targetField + '"]');
    if (el) {
      el.value = text;
      wsMarkDirty(learnerId);
    }
    closeModal();
  }
  window.wsApplyComment = wsApplyComment;
    // ================================================================
  // [S16] CLASSES
  // ================================================================
  let __classSubjectsCache = null;   // array of {code, display_name}
  let __classSubjectsEditState = null; // { className, slots: [{slot, subject_code}] }

  async function loadClasses() {
    setHTML('classesContent', pageLoaderHTML('Loading classes...'));
    const r = await window.TIS.listClasses();
    if (!r.ok) { setHTML('classesContent', errorHTML('Could not load classes', r.error)); return; }
    State.cachedClasses = r.data || [];
    if (!State.cachedClasses.length) {
      setHTML('classesContent', emptyHTML('fa-layer-group', 'No classes yet', 'Click Seed Defaults to create the starting list.'));
      return;
    }

    let html = '<div class="card-bg" style="overflow-x:auto;"><table class="users-table"><thead><tr><th>Order</th><th>Class</th><th>Level</th><th>Stream</th><th>Next Class</th><th>Status</th><th style="text-align:right;">Actions</th></tr></thead><tbody>';
    State.cachedClasses
      .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); })
      .forEach(function (c) {
        html += '<tr>' +
          '<td style="color:#999;font-size:11px;">' + (c.sort_order || '—') + '</td>' +
          '<td><strong>' + esc(c.name) + '</strong></td>' +
          '<td>' + esc(c.level || '—') + '</td>' +
          '<td>' + esc(c.stream || '—') + '</td>' +
          '<td>' + esc(c.next_class || '—') + '</td>' +
          '<td>' + (c.is_active ? '<span style="color:#27ae60;font-weight:600;">Active</span>' : '<span style="color:#c0392b;font-weight:600;">Retired</span>') + '</td>' +
          '<td style="text-align:right;">' +
            '<button type="button" class="btn btn-sm btn-primary" data-manage-class="' + escAttr(c.name) + '">' +
              '<i class="fas fa-list"></i> Manage Subjects' +
            '</button>' +
          '</td>' +
        '</tr>';
      });
    html += '</tbody></table></div>';
    setHTML('classesContent', html);

    document.querySelectorAll('#classesContent [data-manage-class]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        openClassSubjectsEditor(btn.dataset.manageClass);
      });
    });
  }

  async function ensureClassSubjectsCache() {
    if (__classSubjectsCache) return __classSubjectsCache;
    const r = await window.TIS.listSubjects();
    if (!r || !r.ok) return [];
    __classSubjectsCache = r.data || [];
    return __classSubjectsCache;
  }

  function closeClassSubjects() {
    const panel = document.getElementById('classSubjectsPanel');
    if (panel) panel.style.display = 'none';
    __classSubjectsEditState = null;
  }
  window.closeClassSubjects = closeClassSubjects;

  async function openClassSubjectsEditor(className) {
    startLoader();
    const subjects = await ensureClassSubjectsCache();
    const current = await window.TIS.getClassSubjects(className);
    stopLoader();

    if (!current || !current.ok) { showToast('Could not load subject slots.', 'error'); return; }

    // Build slots 1..18 from the current mapping (missing = empty).
    const slots = [];
    const currentMap = {};
    (current.data || []).forEach(function (s) { currentMap[Number(s.slot)] = s.subject_code; });
    for (let i = 1; i <= 18; i++) {
      slots.push({ slot: i, subject_code: currentMap[i] || '' });
    }

    __classSubjectsEditState = { className: className, slots: slots, subjects: subjects };

    renderClassSubjectsEditor();
  }

  function renderClassSubjectsEditor() {
    const state = __classSubjectsEditState;
    if (!state) return;

    const panel = document.getElementById('classSubjectsPanel');
    const body  = document.getElementById('classSubjectsBody');
    const title = document.getElementById('classSubjectsTitle');
    const subtitle = document.getElementById('classSubjectsSubtitle');
    if (!panel || !body) return;

    title.textContent = 'Manage Subjects — ' + state.className;
    subtitle.textContent = 'Slots 1 through 18. A slot can be empty, or bound to one subject from the master list. Save requires double confirmation.';
    panel.style.display = 'block';

    // Gather the codes already assigned (to prevent duplicates within a class).
    const used = {};
    state.slots.forEach(function (s) {
      if (s.subject_code) used[s.subject_code] = true;
    });

    let html = '<div style="overflow-x:auto;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
    html += '<thead><tr style="background:#e8f5e9;">' +
            '<th style="text-align:left;padding:8px;width:70px;">Slot</th>' +
            '<th style="text-align:left;padding:8px;">Subject</th>' +
            '<th style="text-align:center;padding:8px;width:100px;">Status</th>' +
            '</tr></thead><tbody>';

    state.slots.forEach(function (s) {
      let opts = '<option value="">— (unused) —</option>';
      state.subjects.forEach(function (sub) {
        const isCurrent = (sub.code === s.subject_code);
        const isUsedElsewhere = used[sub.code] && !isCurrent;
        opts += '<option value="' + escAttr(sub.code) + '"' +
                (isCurrent ? ' selected' : '') +
                (isUsedElsewhere ? ' disabled' : '') + '>' +
                esc(sub.display_name) + (isUsedElsewhere ? ' (used)' : '') +
                '</option>';
      });

      const status = s.subject_code
        ? '<span style="color:#27ae60;font-weight:700;">In use</span>'
        : '<span style="color:#999;">empty</span>';

      html += '<tr>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;font-weight:700;">sub' + s.slot + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;">' +
          '<select data-slot-select="' + s.slot + '" style="width:100%;padding:6px;border-radius:6px;border:1px solid #ccc;">' +
          opts +
          '</select>' +
        '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">' + status + '</td>' +
      '</tr>';
    });

    html += '</tbody></table></div>';

    html += '<div style="margin-top:14px;text-align:right;">';
    html += '<button class="btn btn-secondary" type="button" onclick="closeClassSubjects()">Cancel</button> ';
    html += '<button class="btn btn-success" type="button" onclick="saveClassSubjects()">Save Slot Map</button>';
    html += '</div>';

    body.innerHTML = html;
  }

  async function saveClassSubjects() {
    const state = __classSubjectsEditState;
    if (!state) return;

    // Read the current values in the UI.
    const newSlots = [];
    document.querySelectorAll('#classSubjectsBody [data-slot-select]').forEach(function (sel) {
      newSlots.push({
        slot: Number(sel.dataset.slotSelect),
        subject_code: sel.value || ''
      });
    });

    // Compare to the state we came in with (the save point).
    const oldMap = {};
    state.slots.forEach(function (s) { if (s.subject_code) oldMap[s.slot] = s.subject_code; });
    const newMap = {};
    newSlots.forEach(function (s) { if (s.subject_code) newMap[s.slot] = s.subject_code; });

    const changes = [];
    const allSlots = {};
    Object.keys(oldMap).forEach(function (k) { allSlots[k] = true; });
    Object.keys(newMap).forEach(function (k) { allSlots[k] = true; });
    Object.keys(allSlots).forEach(function (k) {
      const before = oldMap[k] || '';
      const after  = newMap[k] || '';
      if (before !== after) {
        changes.push({ slot: Number(k), before: before, after: after });
      }
    });

    if (changes.length === 0) { showToast('No changes to save.', 'info'); return; }

    // First confirmation: describe the changes.
    const lines = changes.map(function (c) {
      const b = c.before ? labelForCode(state.subjects, c.before) : '(unused)';
      const a = c.after  ? labelForCode(state.subjects, c.after)  : '(unused)';
      return '  sub' + c.slot + ':  ' + b + '  →  ' + a;
    }).join('\n');

    const firstMsg = 'You are changing ' + changes.length + ' slot(s) for ' + state.className + ':\n\n' +
                     lines + '\n\n' +
                     'Existing scores already recorded under the OLD subject names are NOT changed. ' +
                     'Only future uploads will use the new mapping.\n\nContinue?';
    if (!confirm(firstMsg)) return;

    // Second confirmation: explicit, serious.
    const secondMsg = 'This is a deliberate change that affects future template downloads for ' + state.className + '.\n\n' +
                      'Confirm again to save.';
    if (!confirm(secondMsg)) { showToast('Slot map change cancelled.', 'info'); return; }

    startLoader();
    const r = await window.TIS.setClassSubjects(state.className, newSlots);
    stopLoader();

    if (!r || !r.ok) {
      showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error');
      return;
    }

    showToast('Slot map saved for ' + state.className + '.', 'success');
    closeClassSubjects();
  }
  window.saveClassSubjects = saveClassSubjects;

  function labelForCode(subjects, code) {
    const s = (subjects || []).find(function (x) { return x.code === code; });
    return s ? s.display_name : code;
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
      { name: 'NURSERY 3', level: 'NURSERY 3', next_class: 'BASIC 1' },
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
  // [S18] BROAD SHEET — Scores console (template + harvest)
  // ================================================================
  const BS_SLOT_LIMIT = 18;

  function bsSetFeedback(msg, type) {
    const el = $('bsFeedback');
    if (!el) return;
    el.style.color = (type === 'error') ? '#c0392b' : (type === 'ok' ? '#0d4d26' : '#666');
    el.textContent = msg || '';
  }

  async function bsPopulatePickers() {
    // Populate the Class dropdown from the canonical class list.
    const classSel = $('bsClass');
    if (classSel) {
      const r = await window.TIS.listClasses();
      const classes = (r && r.ok ? r.data : [])
        .filter(function (c) { return c.is_active !== false; })
        .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); });
      classSel.innerHTML = '<option value="">-- Select --</option>' +
        classes.map(function (c) { return '<option value="' + escAttr(c.name) + '">' + esc(c.name) + '</option>'; }).join('');
    }
    // Populate the Subject dropdown from the master list.
    const subjSel = $('bsSubject');
    if (subjSel) {
      const r2 = await window.TIS.listSubjects();
      const subjects = (r2 && r2.ok ? r2.data : []);
      subjSel.innerHTML = '<option value="">-- Select --</option>' +
        subjects.map(function (s) { return '<option value="' + escAttr(s.code) + '">' + esc(s.display_name) + '</option>'; }).join('');
    }
    // Default term to active.
    const termSel = $('bsTerm');
    const yearEl  = $('bsYear');
    try {
      const at = await window.TIS.getActiveTerm();
      if (at && at.ok && at.data) {
        if (termSel) termSel.value = at.data.term_type || '1st';
        if (yearEl)  yearEl.value  = String(at.data.year || new Date().getFullYear());
      }
    } catch (e) { /* silent */ }
  }

  function bsToggleScopeFields() {
    const scope = ($('bsScope') ? $('bsScope').value : 'class');
    const cg = $('bsClassGroup');
    const sg = $('bsSubjectGroup');
    const stg = $('bsStudentGroup');
    if (cg)  cg.classList.toggle('hidden', !(scope === 'class'));
    if (sg)  sg.classList.toggle('hidden', !(scope === 'subject'));
    if (stg) stg.classList.toggle('hidden', !(scope === 'student'));
  }

  // ---------------- Download template ----------------
  async function bsDownloadTemplate() {
    if (typeof XLSX === 'undefined') { bsSetFeedback('Excel library not loaded.', 'error'); return; }
    const scope = $('bsScope') ? $('bsScope').value : 'class';
    const term  = $('bsTerm') ? $('bsTerm').value : '';
    const year  = $('bsYear') ? parseInt($('bsYear').value, 10) : 0;
    if (!term || !year) { bsSetFeedback('Pick a term and year.', 'error'); return; }

    let classFilter = null;
    let subjectFilter = null;
    let singlePin = null;

    if (scope === 'class') {
      classFilter = $('bsClass') ? $('bsClass').value : '';
      if (!classFilter) { bsSetFeedback('Pick a class.', 'error'); return; }
    } else if (scope === 'subject') {
      subjectFilter = $('bsSubject') ? $('bsSubject').value : '';
      if (!subjectFilter) { bsSetFeedback('Pick a subject.', 'error'); return; }
    } else if (scope === 'student') {
      singlePin = ($('bsStudentQuery') ? $('bsStudentQuery').value : '').trim();
      if (!singlePin) { bsSetFeedback('Enter a PIN or name.', 'error'); return; }
    }

    bsSetFeedback('Building file…');
    startLoader();
    try {
      const payload = await bsBuildTemplatePayload({
        scope: scope, term: term, year: year,
        classFilter: classFilter, subjectFilter: subjectFilter, singlePin: singlePin
      });
      stopLoader();
      if (!payload.ok) { bsSetFeedback(payload.error || 'Could not build template.', 'error'); return; }

         const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(payload.rows);
      // No sheet protection — Excel's cell-locking model is too coarse
      // for "lock A-E, unlock F+". We rely on convention + server-side
      // verification on import instead (see Delivery 2.2c).
      XLSX.utils.book_append_sheet(wb, ws, 'Scores');

      // Second sheet: legend (which subN maps to which subject per class).
      const legendRows = [['Class', 'Slot', 'Subject Code', 'Subject Name']];
      Object.keys(payload.legend).sort().forEach(function (cn) {
        payload.legend[cn].forEach(function (row) {
          legendRows.push([cn, 'sub' + row.slot, row.subject_code, row.display_name]);
        });
      });
      const wsLegend = XLSX.utils.aoa_to_sheet(legendRows);
      XLSX.utils.book_append_sheet(wb, wsLegend, 'Legend');

      const fname = 'TIS_Scores_' + (classFilter || subjectFilter || scope) + '_' +
                    term.toUpperCase() + '_' + year + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      XLSX.writeFile(wb, fname);
      bsSetFeedback('Template downloaded: ' + fname, 'ok');
      showToast('Template downloaded.', 'success');
      } catch (err) {
      stopLoader();
      var msg = (err && err.message) ? err.message : String(err);

      // Turn common errors into operator-friendly language.
      if (/is not defined/i.test(msg)) {
        msg = 'A required function is missing on the server. Please reload the page (Ctrl+Shift+R) and try again. If the problem persists, contact Dr Ayoola. Technical detail: ' + msg;
      } else if (/Failed to fetch|NetworkError/i.test(msg)) {
        msg = 'The network dropped while reading the file. Please try again. Technical detail: ' + msg;
      } else if (/Unexpected token|SyntaxError/i.test(msg)) {
        msg = 'The uploaded file could not be read. Please ensure it is an .xlsx file downloaded from this portal. Technical detail: ' + msg;
      } else if (/duplicate key/i.test(msg)) {
        msg = 'A conflict was detected on a row that was already ticked. Please retry. Technical detail: ' + msg;
      }

      bsSetFeedback(msg, 'error');
      console.error('[bsImportScoresFile]', err);
    }
  }

  async function bsBuildTemplatePayload(opts) {
    try {
      // 1. Get learners in scope.
           const learners = await bsFetchLearnersInScope(opts);
      if (!learners || learners.length === 0) return { ok: false, error: 'No learners matched the scope.' };

      // 2a. Get the canonical class order so we can sort learners
      //     by class structure (CRECHE → STARTERS → ... → SS 3 BUSINESS),
      //     then by name within class.
      const classR = await window.TIS.listClasses();
      const classOrder = {};
      (classR && classR.ok ? classR.data : []).forEach(function (c) {
        classOrder[c.name] = c.sort_order || 9999;
      });
      learners.sort(function (a, b) {
        const ao = classOrder[a.class_name] || 9999;
        const bo = classOrder[b.class_name] || 9999;
        if (ao !== bo) return ao - bo;
        return (a.name || '').localeCompare(b.name || '');
      });

      // 2b. Group by class so we can consult class_subjects.
      const byClass = {};
      learners.forEach(function (l) {
        const c = l.class_name || '';
        if (!c) return;
        if (!byClass[c]) byClass[c] = [];
        byClass[c].push(l);
      });
      // 3. Load class_subjects per class.
      const legend = {};
      for (const className of Object.keys(byClass)) {
        const r = await window.TIS.getClassSubjects(className);
        if (r && r.ok) legend[className] = r.data || [];
      }

      // 4. Load all subjects for name lookup.
      const subjR = await window.TIS.listSubjects();
      const subjLookup = {};
      (subjR && subjR.ok ? subjR.data : []).forEach(function (s) { subjLookup[s.code] = s.display_name; });
      Object.keys(legend).forEach(function (cn) {
        legend[cn].forEach(function (row) { row.display_name = subjLookup[row.subject_code] || row.subject_code; });
      });

      // 5. Load existing scores for the term/year in scope.
      const learnerIds = learners.map(function (l) { return l.id; });
      const scoreMap = await bsFetchExistingScores(learnerIds, opts.term, opts.year);

           // 6. Determine which slot numbers to include.
      //    - scope 'subject': only the slots that match the chosen subject_code,
      //      per class. A row that has no matching slot for its class still
      //      gets the three columns, left blank.
      //    - other scopes: all 18 slots.
      const includeSlotSet = {};   // { slotNumber: true }
      if (opts.scope === 'subject' && opts.subjectFilter) {
        Object.keys(legend).forEach(function (cn) {
          (legend[cn] || []).forEach(function (row) {
            if (row.subject_code === opts.subjectFilter) {
              includeSlotSet[Number(row.slot)] = true;
            }
          });
        });
      } else {
        for (let i = 1; i <= BS_SLOT_LIMIT; i++) includeSlotSet[i] = true;
      }
      const includeSlots = Object.keys(includeSlotSet)
        .map(Number)
        .sort(function (a, b) { return a - b; });

      // 7. Build the header row.
      const header = ['stud_pin','stud_name','stud_gender','stud_class','times_pre'];
      includeSlots.forEach(function (i) {
        header.push('sub' + i + '_test1_score');
        header.push('sub' + i + '_test2_score');
        header.push('sub' + i + '_exam_score');
      });

      // 8. Build one row per learner.
      const rows = [header];
      learners.forEach(function (l) {
        const row = [
          l.pin || '',
          l.name || '',
          l.gender || '',
          l.class_name || '',
          ''   // times_pre — filled from attendance register later
        ];
        const classLegend = legend[l.class_name] || [];
        includeSlots.forEach(function (slotNum) {
          const mapping = classLegend.find(function (x) { return Number(x.slot) === slotNum; });
          if (!mapping) {
            row.push('', '', '');
            return;
          }
          const key = l.id + '|' + mapping.subject_code;
          const existing = scoreMap[key] || {};
          row.push(existing.test1 != null ? existing.test1 : '');
          row.push(existing.test2 != null ? existing.test2 : '');
          row.push(existing.exam  != null ? existing.exam  : '');
        });
        rows.push(row);
      });

      return {
        ok: true,
        rows: rows,
        legend: legend,
        learnerCount: learners.length,
        includeSlots: includeSlots
      };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  async function bsFetchLearnersInScope(opts) {
    const r = await window.TIS.listLearners();
    if (!r || !r.ok) return [];
    let list = (r.data || []).filter(function (l) {
      const w = (l.date_of_withdrawal || '').toString().trim();
      return !(w && w !== '' && w !== 'N/A');
    });
    if (opts.scope === 'class' && opts.classFilter) {
      list = list.filter(function (l) { return l.class_name === opts.classFilter; });
    } else if (opts.scope === 'student' && opts.singlePin) {
      const q = opts.singlePin.toUpperCase();
      list = list.filter(function (l) {
        return (l.pin || '').toUpperCase() === q ||
               (l.name || '').toUpperCase().indexOf(q) !== -1;
      });
    } else if (opts.scope === 'subject' && opts.subjectFilter) {
      // Filter to learners whose class has this subject assigned.
      const kept = [];
      const classCache = {};
      for (const l of list) {
        const c = l.class_name || '';
        if (!c) continue;
        if (!classCache[c]) {
          const cs = await window.TIS.getClassSubjects(c);
          classCache[c] = (cs && cs.ok ? cs.data : []).map(function (x) { return x.subject_code; });
        }
        if (classCache[c].indexOf(opts.subjectFilter) !== -1) kept.push(l);
      }
      list = kept;
    }
    return list;
  }

  async function bsFetchExistingScores(learnerIds, term, year) {
    // We use a filtered select against `scores`. Split into chunks of 100.
    try {
      const sb = window.supabase;
      // We don't have a direct SDK handle in app.js; use TIS method.
      if (typeof window.TIS.getScoresForLearners === 'function') {
        const r = await window.TIS.getScoresForLearners(learnerIds, term, year);
        return (r && r.ok && r.data) ? r.data : {};
      }
      return {};
    } catch (e) { return {}; }
  }

  // ---------------- Harvest ----------------
  async function bsHarvestScores() {
    if (typeof XLSX === 'undefined') { bsSetFeedback('Excel library not loaded.', 'error'); return; }
    const scope = $('bsScope') ? $('bsScope').value : 'class';
    const term  = $('bsTerm') ? $('bsTerm').value : '';
    const year  = $('bsYear') ? parseInt($('bsYear').value, 10) : 0;
    if (!term || !year) { bsSetFeedback('Pick a term and year.', 'error'); return; }

    let classFilter = null, subjectFilter = null, singlePin = null;
    if (scope === 'class')       { classFilter   = $('bsClass') ? $('bsClass').value : '';   if (!classFilter) { bsSetFeedback('Pick a class.', 'error'); return; } }
    if (scope === 'subject')     { subjectFilter = $('bsSubject') ? $('bsSubject').value : ''; if (!subjectFilter) { bsSetFeedback('Pick a subject.', 'error'); return; } }
    if (scope === 'student')     { singlePin     = ($('bsStudentQuery') ? $('bsStudentQuery').value : '').trim(); if (!singlePin) { bsSetFeedback('Enter a PIN or name.', 'error'); return; } }

    bsSetFeedback('Building harvest…');
    startLoader();
    try {
      const payload = await bsBuildTemplatePayload({
        scope: scope, term: term, year: year,
        classFilter: classFilter, subjectFilter: subjectFilter, singlePin: singlePin
      });
      stopLoader();
      if (!payload.ok) { bsSetFeedback(payload.error, 'error'); return; }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(payload.rows);
      XLSX.utils.book_append_sheet(wb, ws, 'Scores');
      const fname = 'TIS_Harvest_' + (classFilter || subjectFilter || scope) + '_' +
                    term.toUpperCase() + '_' + year + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
      XLSX.writeFile(wb, fname);
      bsSetFeedback('Harvest downloaded: ' + fname, 'ok');
      showToast('Harvest downloaded.', 'success');
    } catch (err) {
      stopLoader();
      bsSetFeedback('Unexpected: ' + (err && err.message ? err.message : err), 'error');
    }
  }
  // ================================================================
  // [S18b] SCORES IMPORTER
  //   1. Read XLSX
  //   2. Parse header → identify slot columns
  //   3. Verify PIN + name against learners
  //   4. Look up class_subjects to resolve slot → subject
  //   5. Compare against existing scores (upsert semantics)
  //   6. Conflict modal → commit
  // ================================================================
  let bsImportState = null;

  async function bsImportScoresFile(file) {
    if (typeof XLSX === 'undefined') { bsSetFeedback('Excel library not loaded.', 'error'); return; }

    bsSetFeedback('Reading file…');
    startLoader();

    try {
      // ---------- 1. Parse the file ----------
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      const ws = wb.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows.length) { stopLoader(); bsSetFeedback('Empty sheet.', 'error'); return; }

      // ---------- 2. Locate header row ----------
      // Header must contain stud_pin in column A.
      let headerRowIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const r = rows[i] || [];
        if (String(r[0] || '').trim().toLowerCase() === 'stud_pin') { headerRowIdx = i; break; }
      }
      if (headerRowIdx === -1) {
        stopLoader();
        bsSetFeedback('Header row not found. Expected "stud_pin" in column A.', 'error');
        return;
      }

      const header = rows[headerRowIdx].map(function (c) { return String(c || '').trim(); });

      // ---------- 3. Column-index map for slots ----------
      // Each subject block has three columns: subN_test1_score, subN_test2_score, subN_exam_score.
      const slotColumns = {};   // { slotNumber: { test1: idx, test2: idx, exam: idx } }
      for (let i = 0; i < header.length; i++) {
        const m = header[i].match(/^sub(\d+)_test(1|2)_score$/);
        if (m) {
          const n = Number(m[1]);
          if (!slotColumns[n]) slotColumns[n] = {};
          slotColumns[n]['test' + m[2]] = i;
          continue;
        }
        const mx = header[i].match(/^sub(\d+)_exam_score$/);
        if (mx) {
          const n = Number(mx[1]);
          if (!slotColumns[n]) slotColumns[n] = {};
          slotColumns[n].exam = i;
        }
      }
      const slotNumbers = Object.keys(slotColumns).map(Number).sort(function (a, b) { return a - b; });
      if (slotNumbers.length === 0) {
        stopLoader();
        bsSetFeedback('No subN_*_score columns found in the header.', 'error');
        return;
      }

      const idxPin    = header.indexOf('stud_pin');
      const idxName   = header.indexOf('stud_name');
      const idxGender = header.indexOf('stud_gender');
      const idxClass  = header.indexOf('stud_class');
      const idxTimes  = header.indexOf('times_pre');

      // ---------- 4. Read learners in the file ----------
      const fileRows = [];
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const r = rows[i] || [];
        const pin = String(r[idxPin] || '').trim().toUpperCase();
        if (!pin) continue;
        fileRows.push({
          rowNumber: i + 1,
          pin:       pin,
          name:      String(r[idxName]  || '').trim(),
          gender:    String(r[idxGender]|| '').trim(),
          classCode: String(r[idxClass] || '').trim(),
          timesPre:  String(r[idxTimes] || '').trim(),
          raw:       r
        });
      }
      if (!fileRows.length) { stopLoader(); bsSetFeedback('No data rows found.', 'error'); return; }

      // ---------- 5. Get canonical data ----------
      const learnerR = await window.TIS.listLearners();
      if (!learnerR || !learnerR.ok) { stopLoader(); bsSetFeedback('Could not load learners.', 'error'); return; }
      const learnerByPin = {};
      (learnerR.data || []).forEach(function (l) {
        if (l.pin) learnerByPin[String(l.pin).toUpperCase()] = l;
      });

      const aliasR = await sbLoadClassAliases();
      // aliasMap: upload_code (uppercase) -> canonical_name
      const aliasMap = {};
      (aliasR || []).forEach(function (a) {
        aliasMap[String(a.upload_code).toUpperCase()] = a.canonical_name;
      });

      // ---------- 6. Resolve + validate each row ----------
      const termSel = $('bsTerm');
      const yearEl  = $('bsYear');
      const term = termSel ? termSel.value : '1st';
      const year = yearEl ? parseInt(yearEl.value, 10) : 0;
      if (!term || !year) { stopLoader(); bsSetFeedback('Pick term and year first.', 'error'); return; }

      // Load existing scores for these learners to detect conflicts.
      const learnerIds = fileRows
        .map(function (fr) { const l = learnerByPin[fr.pin]; return l ? l.id : null; })
        .filter(Boolean);
      const existing = await window.TIS.getScoresForLearners(learnerIds, term, year);
      const existingMap = (existing && existing.ok && existing.data) ? existing.data : {};

      // Build the class_subjects lookup per class.
      const classSubjCache = {};
      async function getClassSubj(cn) {
        if (classSubjCache[cn] !== undefined) return classSubjCache[cn];
        const r = await window.TIS.getClassSubjects(cn);
        const arr = (r && r.ok) ? r.data : [];
        const byCode = {};
        arr.forEach(function (x) { byCode[Number(x.slot)] = x.subject_code; });
        classSubjCache[cn] = byCode;
        return byCode;
      }

      const planned = [];
      const errors  = [];
      const skipped = [];

      for (const fr of fileRows) {
        const l = learnerByPin[fr.pin];
        if (!l) { errors.push({ row: fr.rowNumber, pin: fr.pin, reason: 'PIN not found in system' }); continue; }

        // Name verification — reject if it does not match.
        if (fr.name && l.name && fr.name.toUpperCase() !== l.name.toUpperCase()) {
          errors.push({ row: fr.rowNumber, pin: fr.pin, reason: 'Name mismatch (file: "' + fr.name + '", system: "' + l.name + '")' });
          continue;
        }

        // Resolve canonical class from the file's class code OR from the learner record.
        let canonicalClass = l.class_name;
        if (fr.classCode) {
          const mapped = aliasMap[fr.classCode.toUpperCase()];
          if (mapped && mapped !== canonicalClass) {
            errors.push({ row: fr.rowNumber, pin: fr.pin, reason: 'Class in file ("' + fr.classCode + '"→' + mapped + ') does not match learner record (' + canonicalClass + ')' });
            continue;
          }
        }
        if (!canonicalClass) {
          errors.push({ row: fr.rowNumber, pin: fr.pin, reason: 'Learner has no class assigned' });
          continue;
        }

        const slotMap = await getClassSubj(canonicalClass);

        // Walk each slot in the file.
        for (const n of slotNumbers) {
          const cols = slotColumns[n];
          const rawT1 = cols.test1 != null ? fr.raw[cols.test1] : '';
          const rawT2 = cols.test2 != null ? fr.raw[cols.test2] : '';
          const rawEx = cols.exam  != null ? fr.raw[cols.exam]  : '';
          const t1 = parseFloatOrNull(rawT1);
          const t2 = parseFloatOrNull(rawT2);
          const ex = parseFloatOrNull(rawEx);

          // Skip empty subject rows entirely.
          if (t1 === null && t2 === null && ex === null) continue;

          const subjCode = slotMap[n];
          if (!subjCode) {
            skipped.push({ row: fr.rowNumber, pin: fr.pin, slot: n, reason: 'Slot ' + n + ' not assigned for class ' + canonicalClass });
            continue;
          }

          const key = l.id + '|' + subjCode;
          const prev = existingMap[key] || null;

          const conflictT1 = prev && prev.test1 != null && Number(prev.test1) !== 0 && t1 !== null && Number(prev.test1) !== t1;
          const conflictT2 = prev && prev.test2 != null && Number(prev.test2) !== 0 && t2 !== null && Number(prev.test2) !== t2;
          const conflictEx = prev && prev.exam  != null && Number(prev.exam)  !== 0 && ex !== null && Number(prev.exam)  !== ex;
          const hasConflict = conflictT1 || conflictT2 || conflictEx;

          planned.push({
            learner_id: l.id,
            pin: fr.pin,
            learner_name: l.name,
            class_name: canonicalClass,
            subject_code: subjCode,
            term_type: term,
            year: year,
            test1: t1,
            test2: t2,
            exam:  ex,
            existing: prev,
            conflict: hasConflict,
            conflictFields: {
              test1: conflictT1, test2: conflictT2, exam: conflictEx
            },
            rowNumber: fr.rowNumber,
            slot: n
          });
        }
      }

      stopLoader();

      if (planned.length === 0) {
        bsSetFeedback('Nothing to import. Errors: ' + errors.length + ', skipped: ' + skipped.length, 'error');
        bsImportState = { errors: errors, skipped: skipped };
        bsShowImportErrors();
        return;
      }

      bsImportState = {
        file: file.name,
        term: term, year: year,
        planned: planned,
        errors: errors,
        skipped: skipped
      };

      const conflictCount = planned.filter(function (p) { return p.conflict; }).length;

      if (conflictCount === 0 && errors.length === 0 && skipped.length === 0) {
        // Fully clean — commit immediately.
        await bsCommitImport(null);
        return;
      }

      // Otherwise, show the review modal.
      bsShowImportReview();

    } catch (err) {
      stopLoader();
      bsSetFeedback('Unexpected: ' + (err && err.message ? err.message : err), 'error');
      console.error('[bsImportScoresFile]', err);
    }
  }

    function parseFloatOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
    if (isNaN(n)) return null;
    return n;
  }

  function gradeForScore(total) {
    if (total >= 80) return { grade: 'A', remark: 'EXCELLENT' };
    if (total >= 70) return { grade: 'B', remark: 'VERY GOOD' };
    if (total >= 60) return { grade: 'C', remark: 'GOOD' };
    if (total >= 50) return { grade: 'D', remark: 'FAIR' };
    if (total >= 40) return { grade: 'E', remark: 'POOR' };
    return { grade: 'F', remark: 'FAIL' };
  }

  async function sbLoadClassAliases() {
    try {
      const sb = window.supabase ? null : null;
      // Use TIS method — added below.
      if (typeof window.TIS.listClassAliases === 'function') {
        const r = await window.TIS.listClassAliases();
        return (r && r.ok) ? r.data : [];
      }
      return [];
    } catch (e) { return []; }
  }

  function bsShowImportReview() {
    const st = bsImportState;
    if (!st) return;
    const planned = st.planned;
    const conflicts = planned.filter(function (p) { return p.conflict; });
    const clean = planned.filter(function (p) { return !p.conflict; });
    const errs = st.errors || [];
    const skips = st.skipped || [];

    const esc2 = esc;
    let html = '<div class="modal-overlay" onclick="if(event.target===this)return;">';
    html += '<div class="modal-box wide" style="max-width:900px;max-height:88vh;overflow-y:auto;" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Import review — ' + esc2(st.file) + '</h2>' +
            '<button class="close-btn" onclick="bsCancelImport()">&times;</button></div>';

    html += '<div style="padding:14px 18px;">';

    // Summary
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:14px;">';
    html += '<div style="background:#e8f5e9;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Clean rows</div><div style="font-size:20px;font-weight:900;color:#0d4d26;">' + clean.length + '</div></div>';
    html += '<div style="background:#fff8e1;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Conflicts</div><div style="font-size:20px;font-weight:900;color:#b8860b;">' + conflicts.length + '</div></div>';
    html += '<div style="background:#fff5f5;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Errors</div><div style="font-size:20px;font-weight:900;color:#c0392b;">' + errs.length + '</div></div>';
    html += '<div style="background:#f0f0f0;border-radius:8px;padding:10px;"><div style="font-size:11px;color:#666;">Skipped</div><div style="font-size:20px;font-weight:900;color:#666;">' + skips.length + '</div></div>';
    html += '</div>';

    // Term / year
    html += '<div style="font-size:13px;color:#333;margin-bottom:12px;">Importing into: <b>' +
            esc2(st.term.toUpperCase()) + ' TERM ' + esc2(String(st.year)) + '</b></div>';

    // Conflicts section
    if (conflicts.length > 0) {
      html += '<h4 style="color:#b8860b;margin:16px 0 8px;">Conflicts — tick each to allow overwrite</h4>';
      html += '<p style="font-size:12px;color:#666;margin:0 0 8px;">Rows with non-zero existing scores. Unticked rows will be skipped.</p>';
      html += '<div style="max-height:340px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
      html += '<thead style="position:sticky;top:0;background:#fff8e1;">';
      html += '<tr>' +
              '<th style="padding:6px;text-align:center;width:40px;">✓</th>' +
              '<th style="padding:6px;text-align:left;">PIN</th>' +
              '<th style="padding:6px;text-align:left;">Learner</th>' +
              '<th style="padding:6px;text-align:left;">Class</th>' +
              '<th style="padding:6px;text-align:left;">Subject</th>' +
              '<th style="padding:6px;text-align:center;">Existing (T1/T2/Ex)</th>' +
              '<th style="padding:6px;text-align:center;">New (T1/T2/Ex)</th>' +
              '</tr></thead><tbody>';
      conflicts.forEach(function (c, i) {
        html += '<tr>' +
          '<td style="padding:4px;text-align:center;border-bottom:1px solid #eee;">' +
            '<input type="checkbox" class="bsConflictChk" data-idx="' + i + '">' +
          '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;">' + esc2(c.pin) + '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;">' + esc2(c.learner_name) + '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;">' + esc2(c.class_name) + '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;">' + esc2(c.subject_code) + '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;text-align:center;color:#666;">' +
            (c.existing ? (c.existing.test1||0) + ' / ' + (c.existing.test2||0) + ' / ' + (c.existing.exam||0) : '—') +
          '</td>' +
          '<td style="padding:4px;border-bottom:1px solid #eee;text-align:center;font-weight:700;">' +
            (c.test1 != null ? c.test1 : '—') + ' / ' +
            (c.test2 != null ? c.test2 : '—') + ' / ' +
            (c.exam  != null ? c.exam  : '—') +
          '</td>' +
        '</tr>';
      });
      html += '</tbody></table></div>';
    }

    // Errors
    if (errs.length > 0) {
      html += '<h4 style="color:#c0392b;margin:16px 0 8px;">Errors — will be skipped</h4>';
      html += '<div style="max-height:200px;overflow-y:auto;background:#fff5f5;border:1px solid #ffcdd2;border-radius:8px;padding:10px;font-size:12px;">';
      errs.forEach(function (e) {
        html += '<div style="padding:3px 0;">Row ' + e.row + ' — PIN ' + esc2(e.pin) + ' — ' + esc2(e.reason) + '</div>';
      });
      html += '</div>';
    }

    // Skipped (informational)
    if (skips.length > 0) {
      html += '<h4 style="color:#666;margin:16px 0 8px;">Skipped — slot not assigned for the class</h4>';
      html += '<div style="max-height:120px;overflow-y:auto;background:#f0f0f0;border:1px solid #ddd;border-radius:8px;padding:10px;font-size:11px;color:#555;">';
      skips.slice(0, 50).forEach(function (s) {
        html += '<div>Row ' + s.row + ' — ' + esc2(s.pin) + ' — sub' + s.slot + ' — ' + esc2(s.reason) + '</div>';
      });
      if (skips.length > 50) html += '<div>…and ' + (skips.length - 50) + ' more.</div>';
      html += '</div>';
    }

    // Buttons
    html += '<div style="margin-top:18px;text-align:right;">';
    html += '<button class="btn btn-secondary" type="button" onclick="bsCancelImport()">Cancel</button> ';
    html += '<button class="btn btn-primary" type="button" onclick="bsCommitImportFromReview()">Import ' + clean.length + ' clean row(s)';

    if (conflicts.length > 0) {
      html += ' + ticked conflicts';
    }
    html += '</button>';
    html += '</div>';

    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }

  function bsCommitImportFromReview() {
    const ticked = [];
    document.querySelectorAll('.bsConflictChk').forEach(function (chk) {
      if (chk.checked) ticked.push(Number(chk.dataset.idx));
    });
    bsCommitImport(ticked);
  }
  window.bsCommitImportFromReview = bsCommitImportFromReview;

  function bsCancelImport() {
    bsImportState = null;
    closeModal();
    bsSetFeedback('Import cancelled.', 'info');
  }
  window.bsCancelImport = bsCancelImport;

  async function bsCommitImport(allowConflictIndices) {
    const st = bsImportState;
    if (!st) return;
    const allowSet = {};
    if (allowConflictIndices) allowConflictIndices.forEach(function (i) { allowSet[i] = true; });

    const rowsToWrite = [];
    let conflictIdx = 0;
    st.planned.forEach(function (p) {
      if (p.conflict) {
        if (allowSet[conflictIdx]) rowsToWrite.push(p);
        conflictIdx++;
      } else {
        rowsToWrite.push(p);
      }
    });

    if (rowsToWrite.length === 0) {
      bsSetFeedback('Nothing to write.', 'info');
      bsCancelImport();
      return;
    }

    startLoader();
    bsSetFeedback('Writing ' + rowsToWrite.length + ' row(s)…');

    const written = [];
    const failed  = [];

    for (const p of rowsToWrite) {
      const payload = {
        learner_id:   p.learner_id,
        subject_code: p.subject_code,
        term_type:    p.term_type,
        year:         p.year,
        test1:        p.test1,
        test2:        p.test2,
        exam:         p.exam,
        source:       'upload',
        uploaded_by:  (State.profile && State.profile.name) || 'Operator',
        updated_at:   new Date().toISOString()
      };
      const total = (p.test1 || 0) + (p.test2 || 0) + (p.exam || 0);
      payload.total = total;
      const band = gradeForScore(total);
      payload.grade  = band.grade;
      payload.remark = band.remark;

      const r = await window.TIS.upsertScore(payload);
      if (r && r.ok) written.push(p);
      else failed.push({ row: p.rowNumber, pin: p.pin, subject: p.subject_code, error: (r && r.error) || 'unknown' });
    }

        stopLoader();

    const msg = 'Imported ' + written.length + ' row(s)';
    if (failed.length) bsSetFeedback(msg + ' — ' + failed.length + ' failed. See console.', 'error');
    else bsSetFeedback(msg + ' successfully.', 'ok');

    showToast(msg + (failed.length ? ' (' + failed.length + ' failed)' : '.'), failed.length ? 'warning' : 'success');
    if (failed.length) console.warn('[bsCommitImport failed]', failed);

    bsImportState = null;
    closeModal();

    // Auto-assign psychomotor ratings and comments for the learners
    // we just wrote scores for.
    if (written.length > 0) {
      startLoader();
      bsSetFeedback('Auto-assigning ratings and comments…', 'info');
      try {
        await autoAssignRatings(written);
      } catch (e) {
        console.warn('[autoAssign after import]', e);
      }
      stopLoader();
      bsSetFeedback(msg + ' · ratings & comments assigned.', 'ok');
    }
 }
  // ================================================================
  // [S18c] AUTO-ASSIGN — psychomotor ratings and comments
  //   Runs after a scores upload completes. Fills in the non-
  //   academic side of the report card using weighted random
  //   picks based on the learner's average this term.
  // ================================================================
  const AUTO_RATING_FIELDS = [
    'leadership', 'hardwork', 'neatness', 'politeness', 'punctuality',
    'interaction', 'honesty', 'communication', 'reading_club', 'perseverance'
  ];

  const AUTO_RATING_VALUES = ['EXCELLENT', 'V.GOOD', 'GOOD', 'AVERAGE', 'FAIR', 'POOR'];

  // Weighted distribution per band. Highest-probability value first.
  const AUTO_RATING_WEIGHTS = {
    excellent: ['EXCELLENT', 'EXCELLENT', 'EXCELLENT', 'V.GOOD', 'GOOD'],
    very_good: ['V.GOOD',    'V.GOOD',    'V.GOOD',    'GOOD',   'EXCELLENT'],
    good:      ['GOOD',      'GOOD',      'GOOD',      'V.GOOD', 'AVERAGE'],
    average:   ['AVERAGE',   'AVERAGE',   'AVERAGE',   'GOOD',   'FAIR'],
    fair:      ['FAIR',      'FAIR',      'FAIR',      'AVERAGE','POOR'],
    poor:      ['POOR',      'POOR',      'POOR',      'FAIR',   'AVERAGE']
  };

  function pickWeighted(values) {
    return values[Math.floor(Math.random() * values.length)];
  }

  function buildRatingsForBand(band) {
    const weights = AUTO_RATING_WEIGHTS[band] || AUTO_RATING_WEIGHTS.average;
    const out = {};
    AUTO_RATING_FIELDS.forEach(function (f) {
      out[f] = pickWeighted(weights);
    });
    return out;
  }

  // Extract the first name from a full name like "ADEGOKE ADEWUNMI JOY" -> "Adewunmi".
  function firstNameOf(fullName) {
    if (!fullName) return '';
    const parts = String(fullName).trim().split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) {
      // Only one word — use as-is, capitalised.
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
    }
    const second = parts[1];
    return second.charAt(0).toUpperCase() + second.slice(1).toLowerCase();
  }

  // Fill {first}, {strong1}, {weak1} placeholders.
  function fillCommentTemplate(text, ctx) {
    return String(text || '')
      .replace(/\{first\}/g,  ctx.first || '')
      .replace(/\{strong1\}/g, ctx.strong1 || 'your strongest subject')
      .replace(/\{weak1\}/g,   ctx.weak1 || 'your weakest subject');
  }

  // Compute a learner's average and top/bottom subject for the batch.
  function computeScoresSummary(plannedForLearner) {
    const bySubject = {};
    plannedForLearner.forEach(function (p) {
      const t = (p.test1 || 0) + (p.test2 || 0) + (p.exam || 0);
      bySubject[p.subject_code] = (bySubject[p.subject_code] || 0) + t;
    });
    const entries = Object.keys(bySubject).map(function (k) {
      return { code: k, total: bySubject[k] };
    }).filter(function (e) { return e.total > 0; });
    if (entries.length === 0) return null;
    entries.sort(function (a, b) { return b.total - a.total; });
    const sum = entries.reduce(function (s, e) { return s + e.total; }, 0);
    const average = sum / entries.length;
    const strong1 = entries[0].code;
    const weak1 = entries[entries.length - 1].code;
    return { average: average, strong1: strong1, weak1: weak1, subjectCount: entries.length };
  }

  // Choose a comment from the bank that hasn't already been used in this class.
  // Prefers subject_strong_weak. Falls back to general or subject_strong.
  function pickCommentFromBank(bank, field, band, preferCategory, usedIds) {
    const candidates = bank.filter(function (c) {
      return c.field === field && c.band === band && c.is_active !== false;
    });
    if (candidates.length === 0) return null;

    const byCategory = function (cat) {
      return candidates.filter(function (c) { return c.category === cat; });
    };

    const prefOrder = preferCategory
      ? [preferCategory, 'subject_strong_weak', 'subject_strong', 'general']
      : ['general', 'subject_strong_weak', 'subject_strong'];

    for (let i = 0; i < prefOrder.length; i++) {
      const pool = byCategory(prefOrder[i]).filter(function (c) { return !usedIds[c.id]; });
      if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
    }
    // Fallback: any unused comment in the band.
    const anyUnused = candidates.filter(function (c) { return !usedIds[c.id]; });
    if (anyUnused.length > 0) return anyUnused[Math.floor(Math.random() * anyUnused.length)];
    // Fallback: reset the used set and pick any from this band.
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Main auto-assign entry point. Called after bsCommitImport succeeds.
  async function autoAssignRatings(plannedRows) {
    try {
      if (!plannedRows || plannedRows.length === 0) return;

      // Load subject display names for filling {strong1} and {weak1}.
      const subsR = await window.TIS.listSubjects();
      const subjectNames = {};
      (subsR && subsR.ok ? subsR.data : []).forEach(function (s) {
        subjectNames[s.code] = s.display_name;
      });

      // Load the entire active comment bank once.
      const bankR = await window.TIS.listCommentBank();
      const bank = (bankR && bankR.ok ? bankR.data : []).filter(function (c) { return c.is_active !== false; });
      if (bank.length === 0) return;

      // Group planned rows by learner (only rows that were successfully written).
      const byLearner = {};
      plannedRows.forEach(function (p) {
        const key = p.learner_id + '|' + p.term_type + '|' + p.year;
        if (!byLearner[key]) byLearner[key] = [];
        byLearner[key].push(p);
      });

      // Track comment usage per class, so no two learners share a comment in one term.
      const usedByClassTeacher   = {};
      const usedByClassPrincipal = {};

      for (const key of Object.keys(byLearner)) {
        const parts = key.split('|');
        const learnerId = parseInt(parts[0], 10);
        const termType  = parts[1];
        const year      = parseInt(parts[2], 10);
        const rows      = byLearner[key];
        const cls       = rows[0].class_name;
        const learnerName = rows[0].learner_name || '';

        if (!usedByClassTeacher[cls])   usedByClassTeacher[cls]   = {};
        if (!usedByClassPrincipal[cls]) usedByClassPrincipal[cls] = {};

        const summary = computeScoresSummary(rows);
        if (!summary) continue;

        const band = window.TIS.bandForAverage(summary.average);

        // Check for an existing row. If human-edited, do not overwrite.
        const existingR = await window.TIS.getReportRatings(learnerId, termType, year);
        const existing = (existingR && existingR.ok) ? existingR.data : null;
        const teacherEdited   = !!(existing && existing.teacher_edited);
        const principalEdited = !!(existing && existing.principal_edited);

        // Build ratings. If a human has never edited, replace wholesale.
        let ratings = (existing && existing.ratings) ? Object.assign({}, existing.ratings) : {};
        if (!teacherEdited) {
          const fresh = buildRatingsForBand(band);
          AUTO_RATING_FIELDS.forEach(function (f) {
            if (ratings[f] === undefined || ratings[f] === 'AVERAGE') {
              ratings[f] = fresh[f];
            }
          });
        }

        // Build the comment context.
        const ctx = {
          first:   firstNameOf(learnerName),
          strong1: subjectNames[summary.strong1] || summary.strong1,
          weak1:   subjectNames[summary.weak1]   || summary.weak1
        };

        let teacherComment   = (existing && existing.teacher_comment)   || '';
        let principalComment = (existing && existing.principal_comment) || '';

        if (!teacherEdited) {
          const pick = pickCommentFromBank(
            bank, 'teacher', band, 'subject_strong_weak',
            usedByClassTeacher[cls]
          );
          if (pick) {
            teacherComment = fillCommentTemplate(pick.text, ctx);
            usedByClassTeacher[cls][pick.id] = true;
          }
        }
        if (!principalEdited) {
          const pick = pickCommentFromBank(
            bank, 'principal', band, 'subject_strong_weak',
            usedByClassPrincipal[cls]
          );
          if (pick) {
            principalComment = fillCommentTemplate(pick.text, ctx);
            usedByClassPrincipal[cls][pick.id] = true;
          }
        }

        // Persist.
        await window.TIS.upsertReportRating({
          learner_id:        learnerId,
          term_type:         termType,
          year:              year,
          ratings:           ratings,
          teacher_comment:   teacherComment,
          principal_comment: principalComment,
          teacher_edited:    teacherEdited,
          principal_edited:  principalEdited,
          auto_assigned_at:  new Date().toISOString(),
          updated_by:        'auto'
        });
      }
    } catch (err) {
      console.warn('[autoAssignRatings]', err);
    }
  }
  // ---------------- Tab init ----------------
  async function initBroadSheetTab() {
    await bsPopulatePickers();

    const scopeSel = $('bsScope');
    if (scopeSel && !scopeSel.__wired) {
      scopeSel.addEventListener('change', bsToggleScopeFields);
      scopeSel.__wired = true;
    }
    bsToggleScopeFields();

    const d = $('btnDownloadScoresTemplate');
    if (d && !d.__wired) { d.addEventListener('click', bsDownloadTemplate); d.__wired = true; }

    const h = $('btnHarvestScores');
    if (h && !h.__wired) { h.addEventListener('click', bsHarvestScores); h.__wired = true; }

        const u = $('btnUploadScoresFile');
    const fi = $('bsUploadInput');
    if (u && fi && !u.__wired) {
      u.addEventListener('click', function () { fi.click(); });
      fi.addEventListener('change', function () {
        const f = fi.files && fi.files[0];
        if (f) bsImportScoresFile(f);
        fi.value = '';
      });
      u.__wired = true;
    }

    // Legacy buttons from the old Broad Sheet tab (removed from HTML, guard anyway).
    const r1 = $('btnLoadBroadSheet'); if (r1) r1.addEventListener('click', () => showToast('Use the Scores console above.', 'info'));
    const r2 = $('btnPopulateBroadSheet'); if (r2) r2.addEventListener('click', () => showToast('Use the Scores console above.', 'info'));
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
    initResultsTab();
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

  async function boot() {
    try {
      safetySweep();

      // Scan routes fire BEFORE any portal UI is shown.
      // /g/<token> → staff-gate QR (all staff use one code).
      // /s/<code>  → personal ID-card QR (learner / staff / visitor).
      const handledByScan =
        (typeof handleQRScanIfPresent    === 'function' ? await handleQRScanIfPresent()    : false) ||
        (typeof handleIDCardScanIfPresent === 'function' ? await handleIDCardScanIfPresent() : false);

      if (handledByScan) {
        console.log('[TIS] scan handler took over.');
        return;
      }

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

   // ================================================================
  // [S21] ID CARDS
  //   Portrait CR80 cards, 3 × 3 on A4 preview (9 cards per sheet),
  //   or ZIP export of Front + Back PNG per card.
  //
  //   Delivered PNG: 662 × 1036 px (CR80 638 × 1012 + 2 mm bleed)
  //   Trim to:        638 × 1012 px @ 300 DPI (54 × 85.6 mm)
  //
  //   Front: header text block (name + motto + schools) → logo row
  //          (school left, ministry right) → photo → name (blue) →
  //          identity block (full width) → QR → role badge.
  //   Back:  ownership + return text at the top, address + email at
  //          the bottom.
  //
  //   QR destination: https://<origin>/s/<code>
  //   Filenames: <Kind>_<Code>_Front.png / _Back.png
  // ================================================================

  const IDC_VISITOR_CARDS = ['VIS-01', 'VIS-02', 'VIS-03', 'VIS-04', 'VIS-05'];

  const IDC_ADDRESS = {
    line1: 'Rounder Sokoto, Badagry Express Way',
    line2: 'Abeokuta North, Ogun State, Nigeria',
    email: 'theidealschools15@gmail.com'
  };

  const IDC_BACK_TEXT = [
    'This ID Card belongs to',
    'THE IDEAL SCHOOLS LTD.',
    'The Ideal Secondary Sch.',
    'The Ideal Kiddies Sch.',
    '',
    'FOUND? Kindly return to',
    'The Ideal Schools address',
    'overleaf, or to the nearest',
    'Police Station.'
  ];

  // Portrait CR80 at 300 DPI:
  //   content = 54 × 85.6 mm → 638 × 1012 px
  //   with 2 mm bleed on each edge → 58 × 89.6 mm → 662 × 1036 px
  const IDC_PNG = {
    contentW: 638,
    contentH: 1012,
    bleedPx:  24,
    fullW:    662,
    fullH:    1036
  };

  const IDC_LOGO_SCHOOL   = 'https://ndsroviwrfjbgaucajri.supabase.co/storage/v1/object/public/TISAssets/The%20Ideal%20Sch%20Logo.jpg';
  const IDC_LOGO_MINISTRY = 'https://ndsroviwrfjbgaucajri.supabase.co/storage/v1/object/public/TISAssets/ogun%20min%20edu%20logo.jpg';
  const IDC_LOGO_GTB      = 'https://ndsroviwrfjbgaucajri.supabase.co/storage/v1/object/public/TISAssets/gtb.jpg';
  const IDC_LOGO_VISITOR  = 'https://ndsroviwrfjbgaucajri.supabase.co/storage/v1/object/public/TISAssets/The_Ideal_Schools_Logo_Transparent.png';

  const IDC_COLORS = {
    schoolName: '#0d4d26',
    personName: '#1a3f8f',
    label:      '#555555',
    value:      '#222222',
    divider:    '#c8e6c9',
    badge:      '#b8860b',
    bg:         '#ffffff'
  };

  let idcState = {
    sub: 'staff',
    staffAll: [],
    staffSelected: {},
    learnerByClass: {},
    learnerClasses: [],
    learnerSelected: {},
    loaded: false,
    busy: false
  };

  // ----------------------------------------------------------------
  // Tab init
  // ----------------------------------------------------------------
  async function initIDCardsTab() {
    const bStaff   = $('idcSubStaff');
    const bLearner = $('idcSubLearner');
    const bVisitor = $('idcSubVisitor');

    if (bStaff && !bStaff.__wired) {
      bStaff.addEventListener('click', function () {
        idcState.sub = 'staff'; idcRefreshSubButtons(); idcRenderPanel();
      });
      bStaff.__wired = true;
    }
    if (bLearner && !bLearner.__wired) {
      bLearner.addEventListener('click', function () {
        idcState.sub = 'learner'; idcRefreshSubButtons(); idcRenderPanel();
      });
      bLearner.__wired = true;
    }
    if (bVisitor && !bVisitor.__wired) {
      bVisitor.addEventListener('click', function () {
        idcState.sub = 'visitor'; idcRefreshSubButtons(); idcRenderPanel();
      });
      bVisitor.__wired = true;
    }

    if (!idcState.loaded) {
      await idcLoadData();
      idcState.loaded = true;
    }
    idcRefreshSubButtons();
    idcRenderPanel();
  }

  function idcRefreshSubButtons() {
    const map = {
      staff:   $('idcSubStaff'),
      learner: $('idcSubLearner'),
      visitor: $('idcSubVisitor')
    };
    Object.keys(map).forEach(function (k) {
      const b = map[k];
      if (!b) return;
      if (k === idcState.sub) {
        b.classList.remove('btn-secondary'); b.classList.add('btn-primary');
      } else {
        b.classList.remove('btn-primary');   b.classList.add('btn-secondary');
      }
    });
  }

  async function idcLoadData() {
    startLoader();
    try {
      const [staffR, learnerR] = await Promise.all([
        window.TIS.listStaff(),
        window.TIS.listLearners()
      ]);

      idcState.staffAll = (staffR && staffR.ok ? staffR.data : [])
        .filter(function (s) { return (s.status || 'Active') === 'Active'; });

           // Pull the canonical class list first.
      const classR = await window.TIS.listClasses();
      const canonicalClasses = (classR && classR.ok ? classR.data : [])
        .filter(function (c) { return c.is_active !== false; })
        .sort(function (a, b) { return (a.sort_order || 9999) - (b.sort_order || 9999); })
        .map(function (c) { return c.name; });
      const canonicalSet = {};
      canonicalClasses.forEach(function (n) { canonicalSet[n] = true; });

      const learners = (learnerR && learnerR.ok ? learnerR.data : [])
        .filter(function (l) {
          const w = (l.date_of_withdrawal || '').toString().trim();
          if (w && w !== '' && w !== 'N/A') return false;
          // Only include learners whose class is in the canonical list.
          return canonicalSet[l.class_name];
        });

      idcState.learnerByClass = {};
      learners.forEach(function (l) {
        const c = l.class_name;
        if (!idcState.learnerByClass[c]) idcState.learnerByClass[c] = [];
        idcState.learnerByClass[c].push(l);
      });
      // Classes come from the canonical list, not from learner data.
      idcState.learnerClasses = canonicalClasses.filter(function (c) {
        return idcState.learnerByClass[c] && idcState.learnerByClass[c].length > 0;
      });

      idcState.staffSelected = {};
      idcState.staffAll.forEach(function (s) { idcState.staffSelected[s.id] = true; });

      idcState.learnerSelected = {};
      learners.forEach(function (l) { idcState.learnerSelected[l.id] = true; });
    } finally {
      stopLoader();
    }
  }

  // ----------------------------------------------------------------
  // Panel router
  // ----------------------------------------------------------------
  function idcRenderPanel() {
    const panel = $('idcPanel');
    if (!panel) return;
    if (idcState.sub === 'staff')   return idcRenderStaffPanel(panel);
    if (idcState.sub === 'learner') return idcRenderLearnerPanel(panel);
    if (idcState.sub === 'visitor') return idcRenderVisitorPanel(panel);
  }

  function idcRenderStaffPanel(panel) {
    const total    = idcState.staffAll.length;
    const selected = idcState.staffAll.filter(function (s) { return idcState.staffSelected[s.id]; }).length;

    let html = '';
    html += '<h3 style="margin:0 0 8px;color:#0d4d26;">Staff ID Cards</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px;">';
    html += total + ' active staff · <b>' + selected + '</b> selected.</p>';

    html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<button class="btn btn-sm btn-secondary" onclick="idcSelectAllStaff(true)">Select all</button>';
    html += '<button class="btn btn-sm btn-secondary" onclick="idcSelectAllStaff(false)">Deselect all</button>';
    html += '<button class="btn btn-sm btn-primary" onclick="idcGenerateStaffCards(\'a4\')"><i class="fas fa-print"></i> Print A4 Preview</button>';
    html += '<button class="btn btn-sm btn-gold" onclick="idcGenerateStaffCards(\'zip\')"><i class="fas fa-file-zipper"></i> Download ZIP</button>';
    html += '</div>';

    html += '<div style="max-height:420px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead style="position:sticky;top:0;background:#e8f5e9;z-index:1;">';
    html += '<tr>' +
            '<th style="text-align:center;padding:6px;width:40px;">✓</th>' +
            '<th style="text-align:left;padding:6px;width:110px;">Staff ID</th>' +
            '<th style="text-align:left;padding:6px;">Name</th>' +
            '<th style="text-align:left;padding:6px;width:120px;">Department</th>' +
            '<th style="text-align:left;padding:6px;width:150px;">Position</th></tr>';
    html += '</thead><tbody>';

    idcState.staffAll.forEach(function (s) {
      const checked = idcState.staffSelected[s.id] ? ' checked' : '';
      const name = [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ')
                   || s.full_name || '';
      html += '<tr>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;">' +
              '<input type="checkbox"' + checked +
              ' onchange="idcToggleStaff(' + s.id + ', this.checked)"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(s.staff_id || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(name) + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(s.department || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(s.position || '') + '</td>';
      html += '</tr>';
    });
    if (idcState.staffAll.length === 0) {
      html += '<tr><td colspan="5" style="padding:14px;text-align:center;color:#888;">No active staff.</td></tr>';
    }
    html += '</tbody></table></div>';
    panel.innerHTML = html;
  }

  function idcToggleStaff(id, on) { idcState.staffSelected[id] = !!on; }
  function idcSelectAllStaff(on) {
    idcState.staffAll.forEach(function (s) { idcState.staffSelected[s.id] = !!on; });
    idcRenderPanel();
  }
  function idcGenerateStaffCards(mode) {
    const list = idcState.staffAll.filter(function (s) { return idcState.staffSelected[s.id]; });
    if (list.length === 0) { showToast('Select at least one staff member', 'warning'); return; }
    const cards = list.map(function (s) {
      const name = [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ')
                   || s.full_name || '';
      return {
        code:          s.staff_id || ('STAFF' + s.id),
        kind:          'Staff',
        name:          name,
        idLabel:       'Staff ID',
        idValue:       s.staff_id || '',
        classOrDept:   s.department || '',
        position:      s.position || '',
        gender:        s.gender || '',
        qualification: s.qualification || '',
        account:       '',
        blood:         '',
        photo:         s.photo_url || '',
        role:          'STAFF'
      };
    });
    if (mode === 'zip') idcDownloadZip(cards, 'Staff_ID_Cards');
    else idcOpenA4Preview(cards, 'Staff ID Cards');
  }

  function idcRenderLearnerPanel(panel) {
    const classes    = idcState.learnerClasses;
    const allLearners = Object.values(idcState.learnerByClass).flat();
    const selected    = allLearners.filter(function (l) { return idcState.learnerSelected[l.id]; }).length;

    let html = '';
    html += '<h3 style="margin:0 0 8px;color:#0d4d26;">Learner ID Cards</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px;">';
    html += allLearners.length + ' active learners · <b>' + selected + '</b> selected.</p>';

    html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<button class="btn btn-sm btn-secondary" onclick="idcSelectAllLearners(true)">Select all</button>';
    html += '<button class="btn btn-sm btn-secondary" onclick="idcSelectAllLearners(false)">Deselect all</button>';
    html += '<button class="btn btn-sm btn-primary" onclick="idcGenerateLearnerCards(\'a4\')"><i class="fas fa-print"></i> Print A4 Preview</button>';
    html += '<button class="btn btn-sm btn-gold" onclick="idcGenerateLearnerCards(\'zip\')"><i class="fas fa-file-zipper"></i> Download ZIP</button>';
    html += '</div>';

    html += '<p style="font-size:12px;color:#666;margin:0 0 6px;">Check a whole class with the class checkbox, then uncheck individual learners if needed.</p>';

    html += '<div style="max-height:480px;overflow-y:auto;border:1px solid #e6e9f0;border-radius:8px;padding:8px;">';
    classes.forEach(function (c) {
      const learners = idcState.learnerByClass[c] || [];
      const allSel   = learners.length > 0 &&
                       learners.every(function (l) { return idcState.learnerSelected[l.id]; });
      const someSel  = learners.some(function (l) { return idcState.learnerSelected[l.id]; });

      html += '<details style="margin:4px 0;"' + (someSel ? ' open' : '') + '>';
      html += '<summary style="cursor:pointer;font-weight:700;color:#0d4d26;font-size:13px;padding:4px 0;list-style:none;">';
      html += '<input type="checkbox"' + (allSel ? ' checked' : '') +
              ' style="margin-right:6px;"' +
              ' onclick="event.stopPropagation(); idcToggleClass(\'' + escAttr(c) + '\', this.checked)">';
      html += esc(c) + ' <span style="color:#888;font-weight:400;">(' + learners.length + ')</span>';
      html += '</summary>';
      html += '<div style="margin-left:26px;">';
      learners.forEach(function (l) {
        const checked = idcState.learnerSelected[l.id] ? ' checked' : '';
        html += '<label style="display:block;font-size:12px;padding:3px 0;">';
        html += '<input type="checkbox"' + checked +
                ' onchange="idcToggleLearner(' + l.id + ', this.checked)"> ';
        html += esc(l.pin || '') + ' — ' + esc(l.name || '');
        html += '</label>';
      });
      html += '</div></details>';
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  function idcToggleLearner(id, on) { idcState.learnerSelected[id] = !!on; }
  function idcToggleClass(className, on) {
    const learners = idcState.learnerByClass[className] || [];
    learners.forEach(function (l) { idcState.learnerSelected[l.id] = !!on; });
    idcRenderPanel();
  }
  function idcSelectAllLearners(on) {
    Object.values(idcState.learnerByClass).flat().forEach(function (l) {
      idcState.learnerSelected[l.id] = !!on;
    });
    idcRenderPanel();
  }
  function idcGenerateLearnerCards(mode) {
    const all  = Object.values(idcState.learnerByClass).flat();
    const list = all.filter(function (l) { return idcState.learnerSelected[l.id]; });
    if (list.length === 0) { showToast('Select at least one learner', 'warning'); return; }
    const cards = list.map(function (l) {
      return {
        code:          l.pin || ('LEARNER' + l.id),
        kind:          'Learner',
        name:          l.name || '',
        idLabel:       'PIN',
        idValue:       l.pin || '',
        classOrDept:   l.class_name || '',
        position:      '',
        gender:        l.gender || '',
        qualification: '',
        account:       l.account_number || '',
        blood:         l.blood_group || '',
        photo:         l.photo_url || '',
        role:          'LEARNER'
      };
    });
    if (mode === 'zip') idcDownloadZip(cards, 'Learner_ID_Cards');
    else idcOpenA4Preview(cards, 'Learner ID Cards');
  }

  function idcRenderVisitorPanel(panel) {
    let html = '';
    html += '<h3 style="margin:0 0 8px;color:#0d4d26;">Visitor Cards</h3>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px;">';
    html += 'Five permanent visitor cards. The school logo doubles as the visitor image on each card.</p>';

    html += '<div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<button class="btn btn-sm btn-primary" onclick="idcGenerateVisitorCards(\'a4\')"><i class="fas fa-print"></i> Print A4 Preview</button>';
    html += '<button class="btn btn-sm btn-gold" onclick="idcGenerateVisitorCards(\'zip\')"><i class="fas fa-file-zipper"></i> Download ZIP</button>';
    html += '</div>';

    html += '<div style="border:1px solid #e6e9f0;border-radius:8px;padding:8px;">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead style="background:#e8f5e9;"><tr>' +
            '<th style="text-align:left;padding:6px;width:110px;">Card Code</th>' +
            '<th style="text-align:left;padding:6px;">When scanned…</th></tr></thead><tbody>';
    IDC_VISITOR_CARDS.forEach(function (code) {
      html += '<tr>' +
              '<td style="padding:5px;border-bottom:1px solid #eee;"><b>' + esc(code) + '</b></td>' +
              '<td style="padding:5px;border-bottom:1px solid #eee;">' +
              'Asks name, purpose (Official / Personal); if Official, agency ' +
              '(Ministry of Education, Ministry of Health, Internal Revenue, NAPPS, ' +
              'Community, Police/Security, Other → please specify).</td>' +
              '</tr>';
    });
    html += '</tbody></table></div>';
    panel.innerHTML = html;
  }

  function idcGenerateVisitorCards(mode) {
    const cards = IDC_VISITOR_CARDS.map(function (code) {
      return {
        code:          code,
        kind:          'Visitor',
        name:          'VISITOR',
        idLabel:       'Card',
        idValue:       code,
        classOrDept:   '',
        position:      '',
        gender:        '',
        qualification: '',
        account:       '',
        blood:         '',
        photo:         IDC_LOGO_VISITOR,
        role:          'VISITOR'
      };
    });
    if (mode === 'zip') idcDownloadZip(cards, 'Visitor_Cards');
    else idcOpenA4Preview(cards, 'Visitor Cards');
  }

  // ----------------------------------------------------------------
  // Card face drawing
  // ----------------------------------------------------------------
  function idcDrawFront(ctx, card, x, y, w, h) {
    ctx.save();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#0d4d26';
    ctx.lineWidth   = Math.max(2, w * 0.008);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2,
                   w - ctx.lineWidth, h - ctx.lineWidth);

    const padX = w * 0.055;
    const padY = h * 0.030;
    const colW = w - padX * 2;

    let cursorY = y + padY;
    const centreCX = x + w / 2;

    // Header text block
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = IDC_COLORS.schoolName;
    ctx.font      = 'bold ' + Math.round(h * 0.055) + 'px Inter, Arial, sans-serif';
    ctx.fillText('THE IDEAL SCHOOLS', centreCX, cursorY);

    cursorY += h * 0.062;

    ctx.fillStyle = '#666666';
    ctx.font      = 'italic ' + Math.round(h * 0.022) + 'px Inter, Arial, sans-serif';
    ctx.fillText('Scientia est potentia', centreCX, cursorY);

    cursorY += h * 0.028;

    ctx.fillStyle = '#333333';
    ctx.font      = Math.round(h * 0.018) + 'px Inter, Arial, sans-serif';
    ctx.fillText('The Ideal Secondary Sch.  ·  The Ideal Kiddies Sch.', centreCX, cursorY);

    cursorY += h * 0.030;

    // Logo row
    const logoSize = h * 0.085;
    const logoY    = cursorY;
    card.__layout = card.__layout || {};
    card.__layout.logoY    = logoY;
    card.__layout.logoSize = logoSize;

    idcDrawImagePlaceholder(ctx, x + padX,                logoY, logoSize, logoSize, 'S');
    idcDrawImagePlaceholder(ctx, x + w - padX - logoSize, logoY, logoSize, logoSize, 'M');

    cursorY += logoSize + h * 0.018;

    ctx.strokeStyle = IDC_COLORS.divider;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(x + padX, cursorY);
    ctx.lineTo(x + w - padX, cursorY);
    ctx.stroke();

    cursorY += h * 0.018;

    // Photo
    const photoSize = w * 0.46;
    const photoX    = x + (w - photoSize) / 2;
    const photoY    = cursorY;
    card.__layout.photoX    = photoX;
    card.__layout.photoY    = photoY;
    card.__layout.photoSize = photoSize;

    idcDrawPhotoPlaceholder(ctx, card, photoX, photoY, photoSize, photoSize);

    cursorY = photoY + photoSize + h * 0.018;

    // Name
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle    = IDC_COLORS.personName;
    ctx.font         = 'bold ' + Math.round(h * 0.042) + 'px Inter, Arial, sans-serif';
    const nameUp = String(card.name || '').toUpperCase();
    ctx.fillText(idcFitText(ctx, nameUp, colW), centreCX, cursorY);

    cursorY += h * 0.052;

    // Identity block
    const labelX = x + padX;
    const valueX = x + w - padX;
    const lineH  = h * 0.032;
    const fontPx = Math.round(h * 0.024);

    function pair(label, value) {
      if (!value) return;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle    = IDC_COLORS.label;
      ctx.font         = fontPx + 'px Inter, Arial, sans-serif';
      ctx.fillText(label, labelX, cursorY);

      ctx.textAlign    = 'right';
      ctx.fillStyle    = IDC_COLORS.value;
      ctx.font         = 'bold ' + fontPx + 'px Inter, Arial, sans-serif';
      ctx.fillText(idcFitText(ctx, String(value), colW * 0.58), valueX, cursorY);

      if (label === 'Account No.') {
        card.__layout.accountRowY = cursorY;
        card.__layout.accountRowH = lineH;
      }

      cursorY += lineH;
    }

    if (card.kind === 'Learner') {
      pair('PIN',                    card.idValue);
      pair('Class',                  card.classOrDept);
      pair('Gender',                 card.gender);
      pair('Account No.',            card.account);
      pair('Blood Group / Genotype', card.blood);
    } else if (card.kind === 'Staff') {
      pair('Staff ID',        card.idValue);
      pair('Department',      card.classOrDept);
      pair('Position',        card.position);
      pair('Gender',          card.gender);
      pair('Qualification',   card.qualification);
    } else {
      pair('Card', card.idValue);
    }

    cursorY += h * 0.010;

    // QR
    const qrSize = w * 0.34;
    const qrX    = x + (w - qrSize) / 2;
    const qrY    = cursorY;
    card.__layout.qrX    = qrX;
    card.__layout.qrY    = qrY;
    card.__layout.qrSize = qrSize;

    idcDrawQRPlaceholder(ctx, qrX, qrY, qrSize, qrSize);

    // Role badge
    const badgeText = card.role || '';
    const badgeW    = w * 0.30;
    const badgeH    = h * 0.036;
    const badgeX    = x + w - padX - badgeW;
    const badgeY    = y + h - padY - badgeH;

    ctx.fillStyle = IDC_COLORS.badge;
    ctx.fillRect(badgeX, badgeY, badgeW, badgeH);

    ctx.fillStyle    = '#ffffff';
    ctx.font         = 'bold ' + Math.round(badgeH * 0.55) + 'px Inter, Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

    ctx.restore();
  }

  function idcDrawBack(ctx, card, x, y, w, h) {
    ctx.save();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#0d4d26';
    ctx.lineWidth   = Math.max(2, w * 0.008);
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2,
                   w - ctx.lineWidth, h - ctx.lineWidth);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';

    const cx     = x + w / 2;
    const lineH  = h * 0.062;
    const startY = y + h * 0.20;

    IDC_BACK_TEXT.forEach(function (line, i) {
      const isHeader = (i === 1 || i === 2 || i === 3);
      ctx.fillStyle = isHeader ? '#0d4d26' : '#333333';
      ctx.font      = (isHeader ? 'bold ' : '') +
                      Math.round(h * (isHeader ? 0.032 : 0.028)) +
                      'px Inter, Arial, sans-serif';
      ctx.fillText(line, cx, startY + i * lineH);
    });

    const addressTop = y + h * 0.76;
    ctx.fillStyle = '#555555';
    ctx.font      = Math.round(h * 0.020) + 'px Inter, Arial, sans-serif';
    ctx.fillText(IDC_ADDRESS.line1, cx, addressTop);
    ctx.fillText(IDC_ADDRESS.line2, cx, addressTop + h * 0.026);
    ctx.fillText(IDC_ADDRESS.email, cx, addressTop + h * 0.052);

    ctx.restore();
  }

  function idcDrawPhotoPlaceholder(ctx, card, x, y, w, h) {
    ctx.save();
    if (card.photo) {
      ctx.fillStyle = '#e8e8e8';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#0d4d26';
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle    = '#ffffff';
      ctx.font         = 'bold ' + Math.round(w * 0.42) + 'px Inter, Arial, sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      const ch = card.kind === 'Visitor' ? 'V' : ((card.name || '?').charAt(0) || '?');
      ctx.fillText(ch, x + w / 2, y + h / 2 + w * 0.05);
    }
    ctx.restore();
  }

  function idcDrawQRPlaceholder(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle    = '#999999';
    ctx.font         = Math.round(w * 0.10) + 'px Inter, Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR', x + w / 2, y + h / 2);
    ctx.restore();
  }

  function idcDrawImagePlaceholder(ctx, x, y, w, h, letter) {
    ctx.save();
    ctx.fillStyle = '#e8f5e9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#c8e6c9';
    ctx.lineWidth   = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle    = '#0d4d26';
    ctx.font         = 'bold ' + Math.round(h * 0.55) + 'px Inter, Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, x + w / 2, y + h / 2 + 1);
    ctx.restore();
  }

  function idcFitText(ctx, text, maxWidth) {
    let t = String(text || '');
    if (ctx.measureText(t).width <= maxWidth) return t;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  // ----------------------------------------------------------------
  // Identity row counter (used only for reference / debug)
  // ----------------------------------------------------------------
  function idcIdentityRowCount(card) {
    if (card.kind === 'Learner') {
      let n = 0;
      if (card.idValue)     n++;
      if (card.classOrDept) n++;
      if (card.gender)      n++;
      if (card.account)     n++;
      if (card.blood)       n++;
      return n;
    }
    if (card.kind === 'Staff') {
      let n = 0;
      if (card.idValue)       n++;
      if (card.classOrDept)   n++;
      if (card.position)      n++;
      if (card.gender)        n++;
      if (card.qualification) n++;
      return n;
    }
    return 1;
  }

  // ----------------------------------------------------------------
  // Async overlays
  // ----------------------------------------------------------------
  function idcLoadImage(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(null); return; }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload  = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = url;
    });
  }

  async function idcDrawQRImage(ctx, card, cx, cy, cw, ch) {
    const url   = window.location.origin + '/s/' + encodeURIComponent(card.code);
    const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=' +
                  encodeURIComponent(url);
    const img = await idcLoadImage(qrUrl);
    if (!img) return;
    const L = card.__layout || {};
    if (L.qrX === undefined) return;
    ctx.drawImage(img, L.qrX, L.qrY, L.qrSize, L.qrSize);
  }

  async function idcDrawPhotoImage(ctx, card, cx, cy, cw, ch) {
    if (!card.photo) return;
    const img = await idcLoadImage(card.photo);
    if (!img) return;
    const L = card.__layout || {};
    if (L.photoX === undefined) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(L.photoX + L.photoSize / 2, L.photoY + L.photoSize / 2,
            L.photoSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, L.photoX, L.photoY, L.photoSize, L.photoSize);
    ctx.restore();
  }

  async function idcDrawLogos(ctx, card, cx, cy, cw, ch) {
    const L = card.__layout || {};
    if (L.logoY === undefined) return;
    const padX = cw * 0.055;
    const [schoolImg, ministryImg] = await Promise.all([
      idcLoadImage(IDC_LOGO_SCHOOL),
      idcLoadImage(IDC_LOGO_MINISTRY)
    ]);
    if (schoolImg)   ctx.drawImage(schoolImg,   cx + padX,                    L.logoY, L.logoSize, L.logoSize);
    if (ministryImg) ctx.drawImage(ministryImg, cx + cw - padX - L.logoSize,  L.logoY, L.logoSize, L.logoSize);
  }

  async function idcDrawGTBBadge(ctx, card, cx, cy, cw, ch) {
    if (card.kind !== 'Learner' || !card.account) return;
    const img = await idcLoadImage(IDC_LOGO_GTB);
    if (!img) return;
    const L = card.__layout || {};
    if (L.accountRowY === undefined) return;

    const padX   = cw * 0.055;
    const badgeH = L.accountRowH * 1.4;
    const badgeW = badgeH * 1.7;
    const badgeX = cx + cw - padX - badgeW;
    const badgeY = L.accountRowY + L.accountRowH * 0.65;

    try { ctx.drawImage(img, badgeX, badgeY, badgeW, badgeH); } catch (e) {}
  }

  // ----------------------------------------------------------------
  // Render one card face to a PNG data URL
  // ----------------------------------------------------------------
  async function idcRenderCardPng(card, side) {
    const cvs = document.createElement('canvas');
    cvs.width  = IDC_PNG.fullW;
    cvs.height = IDC_PNG.fullH;
    const ctx  = cvs.getContext('2d');

    const contentX = IDC_PNG.bleedPx;
    const contentY = IDC_PNG.bleedPx;
    const contentW = IDC_PNG.contentW;
    const contentH = IDC_PNG.contentH;

    if (side === 'front') {
      idcDrawFront(ctx, card, contentX, contentY, contentW, contentH);
      await idcDrawLogos      (ctx, card, contentX, contentY, contentW, contentH);
      await idcDrawQRImage    (ctx, card, contentX, contentY, contentW, contentH);
      await idcDrawPhotoImage (ctx, card, contentX, contentY, contentW, contentH);
      await idcDrawGTBBadge   (ctx, card, contentX, contentY, contentW, contentH);
    } else {
      idcDrawBack(ctx, card, contentX, contentY, contentW, contentH);
    }

    return cvs.toDataURL('image/png');
  }

  // ----------------------------------------------------------------
  // A4 preview — 3 × 3 portrait grid (9 cards per sheet)
  // ----------------------------------------------------------------
  async function idcOpenA4Preview(cards, title) {
    if (idcState.busy) { showToast('Already generating, please wait…', 'info'); return; }
    idcState.busy = true;
    startLoader();
    try {
      const frontUrls = [];
      const backUrls  = [];
      for (let i = 0; i < cards.length; i++) {
        frontUrls.push(await idcRenderCardPng(cards[i], 'front'));
        backUrls .push(await idcRenderCardPng(cards[i], 'back'));
      }

      const w = window.open('', '_blank');
      if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }

      const css = ''
        + '@page { size: A4 portrait; margin: 8mm; }'
        + 'body { font-family: Inter, Arial, sans-serif; margin: 0; padding: 0; background: #fff; }'
        + '.sheet { page-break-after: always; }'
        + '.sheet:last-child { page-break-after: auto; }'
        + '.caption { font-size: 10pt; color: #0d4d26; font-weight: 700; '
        +            'text-align: center; margin: 0 0 4mm 0; }'
        + '.grid { display: grid; '
        +         'grid-template-columns: 54mm 54mm 54mm; '
        +         'grid-auto-rows: 85.6mm; gap: 3mm; justify-content: center; }'
        + '.cell { width: 54mm; height: 85.6mm; overflow: hidden; '
        +         'border: 0.3mm dashed #bbb; box-sizing: border-box; }'
        + '.cell img { width: 100%; height: 100%; object-fit: cover; display: block; }'
        + '.sidenote { font-size: 8pt; color: #666; text-align: center; margin-top: 4mm; }'
        + '@media print { .sidenote { display: none; } .cell { border: none; } }';

      let html = '<html><head><title>' + esc(title) + '</title><style>' + css + '</style></head><body>';

      html += idcChunkSheetsHtml(frontUrls, title + ' — FRONT', 9,
        'Delivered PNG is 662 × 1036 px @ 300 DPI with 2 mm bleed. ' +
        'Trim on the solid green border to 638 × 1012 px (54 × 85.6 mm).');

      html += idcChunkSheetsHtml(backUrls, title + ' — BACK', 9,
        'Centre-aligned ownership and return text.');

      html += '<script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>';
      html += '</body></html>';

      w.document.write(html);
      w.document.close();
      showToast('Preview opened. ' + cards.length + ' card(s) — ' +
                Math.ceil(cards.length / 9) + ' sheet(s) per side.', 'success');
    } finally {
      idcState.busy = false;
      stopLoader();
    }
  }

  function idcChunkSheetsHtml(urls, captionPrefix, perSheet, sidenote) {
    let html = '';
    for (let i = 0; i < urls.length; i += perSheet) {
      const slice = urls.slice(i, i + perSheet);
      html += '<div class="sheet">';
      html += '<div class="caption">' + esc(captionPrefix) +
              ' — sheet ' + (Math.floor(i / perSheet) + 1) + '</div>';
      html += '<div class="grid">';
      slice.forEach(function (u) {
        html += '<div class="cell"><img src="' + u + '"></div>';
      });
      const pad = (perSheet - (slice.length % perSheet)) % perSheet;
      for (let k = 0; k < pad; k++) html += '<div class="cell"></div>';
      html += '</div>';
      html += '<div class="sidenote">' + esc(sidenote) + '</div>';
      html += '</div>';
    }
    return html;
  }

  // ----------------------------------------------------------------
  // ZIP export
  // ----------------------------------------------------------------
  async function idcDownloadZip(cards, zipBaseName) {
    if (typeof JSZip === 'undefined') {
      showToast('JSZip not loaded. Add the JSZip CDN script to index.html.', 'error');
      return;
    }
    if (idcState.busy) { showToast('Already generating, please wait…', 'info'); return; }
    idcState.busy = true;
    startLoader();
    try {
      const zip   = new JSZip();
      const front = zip.folder('Front');
      const back  = zip.folder('Back');

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const safeCode = String(c.code || ('CARD' + (i + 1)))
          .replace(/[^A-Za-z0-9_-]/g, '_');
        const base = c.kind + '_' + safeCode;

        const frontData = await idcRenderCardPng(c, 'front');
        const backData  = await idcRenderCardPng(c, 'back');

        front.file(base + '_Front.png', idcDataUrlToBlob(frontData));
        back .file(base + '_Back.png',  idcDataUrlToBlob(backData));
      }

      const readme = ''
        + 'THE IDEAL SCHOOLS — ID CARD PRINTING INSTRUCTIONS\r\n'
        + '=================================================\r\n\r\n'
        + 'Files in this ZIP\r\n'
        + '-----------------\r\n'
        + '  Front/  — one PNG per card, printed side A\r\n'
        + '  Back/   — one PNG per card, printed side B\r\n\r\n'
        + 'PNG specifications (for the commercial card printer)\r\n'
        + '---------------------------------------------------\r\n'
        + '  Resolution:  662 × 1036 px (delivered, includes 2 mm bleed on all sides)\r\n'
        + '  Trim to:     638 × 1012 px @ 300 DPI  =  54 × 85.6 mm (CR80 portrait)\r\n'
        + '  Colour:      RGB (printer converts to CMYK)\r\n'
        + '  Cut line:    the solid green border visible on each PNG. ' +
                          'Trim exactly on the inside edge of that border.\r\n\r\n'
        + 'Filename convention\r\n'
        + '-------------------\r\n'
        + '  <Kind>_<Code>_Front.png   (e.g. Learner_TIS0001_Front.png)\r\n'
        + '  <Kind>_<Code>_Back.png    (e.g. Learner_TIS0001_Back.png)\r\n\r\n'
        + 'Keep matching Front/Back pairs together — they are printed as a set.\r\n\r\n'
        + 'Generated by the TIS Operational Portal\r\n';

      zip.file('README.txt', readme);

      const blob = await zip.generateAsync({ type: 'blob' });
      idcTriggerDownload(blob, zipBaseName + '_' + new Date().toISOString().slice(0, 10) + '.zip');
      showToast('ZIP built: ' + cards.length + ' card(s).', 'success');
    } catch (err) {
      console.error('[idcDownloadZip]', err);
      showToast('ZIP failed: ' + (err && err.message || err), 'error');
    } finally {
      idcState.busy = false;
      stopLoader();
    }
  }

  function idcDataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const meta  = parts[0] || '';
    const b64   = parts[1] || '';
    const mime  = (meta.match(/data:([^;]+);/) || [])[1] || 'image/png';
    const bin   = atob(b64);
    const len   = bin.length;
    const u8    = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function idcTriggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }

  // ----------------------------------------------------------------
  // Public API
  // ----------------------------------------------------------------
  window.initIDCardsTab          = initIDCardsTab;
  window.idcToggleStaff          = idcToggleStaff;
  window.idcSelectAllStaff       = idcSelectAllStaff;
  window.idcGenerateStaffCards   = idcGenerateStaffCards;
  window.idcToggleLearner        = idcToggleLearner;
  window.idcToggleClass          = idcToggleClass;
  window.idcSelectAllLearners    = idcSelectAllLearners;
  window.idcGenerateLearnerCards = idcGenerateLearnerCards;
    window.idcGenerateVisitorCards = idcGenerateVisitorCards;

  // ================================================================
  // [S22] RESULTS — internal report card viewer + print
  //   View first, print on demand. Uses the same data as the
  //   public results page will.
  // ================================================================
  let __resultsCurrent = null;   // { learner, term, year, type, payload }

  const RESULTS_SCHOOL_LOGO = 'https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200';

  function resultsWatermarkHtml() {
    return '<div class="rc-watermark"><img src="' + RESULTS_SCHOOL_LOGO + '" alt=""></div>';
  }

  function initResultsTab() {
    const btn    = $('btnResultsLoad');
    const printB = $('btnResultsPrint');
    const pinEl  = $('resultsPin');

    if (btn && !btn.__wired) {
      btn.addEventListener('click', resultsLoadReport);
      btn.__wired = true;
    }
    if (printB && !printB.__wired) {
      printB.addEventListener('click', resultsPrint);
      printB.__wired = true;
    }
    if (pinEl && !pinEl.__wired) {
      pinEl.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') resultsLoadReport();
      });
      pinEl.__wired = true;
    }

    (async function () {
      try {
        const at = await window.TIS.getActiveTerm();
        if (at && at.ok && at.data) {
          const t = $('resultsTerm'); if (t) t.value = at.data.term_type || '1st';
          const y = $('resultsYear'); if (y) y.value = String(at.data.year || new Date().getFullYear());
        }
      } catch (e) { /* silent */ }
    })();

    if (__resultsCurrent) {
      const container = $('resultsContent');
      if (container) container.innerHTML = __resultsCurrent.html || '';
    }
  }
  window.initResultsTab = initResultsTab;

  async function resultsLoadReport() {
    const pinEl  = $('resultsPin');
    const termEl = $('resultsTerm');
    const yearEl = $('resultsYear');
    const typeEl = $('resultsType');
    const feed   = $('resultsFeedback');
    const banner = $('resultsLearnerBanner');

    const pin  = pinEl  ? pinEl.value.trim().toUpperCase()  : '';
    const term = termEl ? termEl.value : '1st';
    const year = yearEl ? parseInt(yearEl.value, 10) : 0;
    const type = typeEl ? typeEl.value : 'termly';

    if (feed) { feed.style.color = '#666'; feed.textContent = ''; }
    if (!pin)  { if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Enter a student PIN.'; } return; }
    if (!year) { if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Enter a year.'; } return; }

    startLoader();
    try {
      const r = await window.TIS.getLearnerByPin(pin);
      if (!r || !r.ok || !r.data) {
        if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'No learner found with PIN ' + pin + '.'; }
        stopLoader();
        return;
      }
      const learner = r.data;

      if (banner) {
        banner.style.display = 'block';
        setText('resultsLearnerName', learner.name || '—');
        setText('resultsLearnerClass', learner.class_name || '—');
        setText('resultsLearnerPin', learner.pin || '—');
      }

      let payload;
      if (type === 'sessional') {
        payload = await resultsBuildSessional(learner, year);
      } else {
        payload = await resultsBuildTermly(learner, term, year);
      }
      stopLoader();

      if (!payload || !payload.ok) {
        if (feed) { feed.style.color = '#c0392b'; feed.textContent = (payload && payload.error) || 'Could not build the report.'; }
        return;
      }

      __resultsCurrent = { learner: learner, term: term, year: year, type: type, html: payload.html };

      const container = $('resultsContent');
      if (container) container.innerHTML = payload.html;

      if (feed) { feed.style.color = '#0d4d26'; feed.textContent = 'Report loaded. Click Print to open the print dialog.'; }
    } catch (err) {
      stopLoader();
      if (feed) { feed.style.color = '#c0392b'; feed.textContent = 'Unexpected: ' + (err && err.message ? err.message : err); }
    }
  }
  window.resultsLoadReport = resultsLoadReport;

  function resultsPrint() {
    if (!__resultsCurrent) { showToast('Load a report first.', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    const html = __resultsCurrent.html
      .replace(/<div class="results-preview">/, '<div>');
    w.document.write('<html><head><title>Report — ' + esc(__resultsCurrent.learner.name || '') + '</title>' +
      window.TISReport.resultsPrintCss() +
      '</head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(function () { w.print(); }, 250);
  }
  window.resultsPrint = resultsPrint;

  // ----------------------------------------------------------------
    // ----------------------------------------------------------------
  // Term promotion label helper.
  //   1st term  → next label is  "2ND TERM <year>"
  //   2nd term  → next label is  "3RD TERM <year>"
  //   3rd term  → next label is the next class (from classes.next_class)
  // ----------------------------------------------------------------
  function nextTermLabel(termType, year) {
    if (termType === '1st') return { term: '2nd', year: year };
    if (termType === '2nd') return { term: '3rd', year: year };
    return null;   // 3rd term → use next class instead
  }

  // ----------------------------------------------------------------
  // Fee breakdown helper.
  //   Reads the class bill from fee_schedule, the learner's adjustment
  //   from fee_adjustments, and the previous term's carry-forward
  //   from learner_terms. Computes the eight figures the report card
  //   needs and returns them as an object for resultsFeeBreakdownBlock.
  //
  //   Formula (gross bill, no subtraction of payments):
  //     adjustedTuition = tuition - scholarship
  //     balanceCd       = adjustedTuition + otherMajor + otherMinor
  //                       + books + additions + prevBf
  // ----------------------------------------------------------------
  async function buildFeeBreakdown(learner, term, year) {
    try {
      const [schedR, adjR] = await Promise.all([
        window.TIS.getFeeScheduleRow(learner.class_name, term, year),
        window.TIS.getFeeAdjustment(learner.id, term, year)
      ]);

      const sched = (schedR && schedR.ok) ? schedR.data : null;
      const adj   = (adjR   && adjR.ok)   ? adjR.data   : null;

      const tuition     = Number(sched && sched.tuition           || 0);
      const otherMajor  = Number(sched && sched.other_bills_major || 0);
      const otherMinor  = Number(sched && sched.other_bills_minor || 0);
      const books       = Number(sched && sched.books             || 0);
      const scholarship = Number(adj   && adj.deductions          || 0);
      const additions   = Number(adj   && adj.additions           || 0);

      // Previous term's carry-forward comes from learner_terms.
      // For a 1st term report there is no prior term, so it is 0.
      let prevBf = 0;
      try {
        let prevTerm = null;
        let prevYear = year;
        if (term === '2nd') { prevTerm = '1st'; prevYear = year; }
        else if (term === '3rd') { prevTerm = '2nd'; prevYear = year; }
        else if (term === '1st') { prevTerm = '3rd'; prevYear = year - 1; }
        if (prevTerm) {
          const pR = await window.TIS.getLearnerTermFor(learner.id, prevTerm, prevYear);
          if (pR && pR.ok && pR.data) {
            prevBf = Number(String(pR.data.balance_cf || 0).replace(/[^0-9.\-]/g, '')) || 0;
          }
        }
      } catch (e) { prevBf = 0; }

      const adjustedTuition = tuition - scholarship;
      const balanceCd = adjustedTuition + otherMajor + otherMinor + books + additions + prevBf;

      return {
        prevBf:          prevBf,
        tuition:         tuition,
        scholarship:     scholarship,
        adjustedTuition: adjustedTuition,
        otherMajor:      otherMajor,
        otherMinor:      otherMinor,
        books:           books,
        additions:       additions,
        balanceCd:       balanceCd
      };
    } catch (err) {
      return {
        prevBf: 0, tuition: 0, scholarship: 0, adjustedTuition: 0,
        otherMajor: 0, otherMinor: 0, books: 0, additions: 0, balanceCd: 0
      };
    }
  }

  // ----------------------------------------------------------------
  // Build a termly report card (single term)
  // ----------------------------------------------------------------
  async function resultsBuildTermly(learner, term, year) {
    try {
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

      const pop    = (popR && popR.ok) ? popR.data : 0;
      const att    = (attR && attR.ok) ? attR.data : { opened: 0, present: 0, absent: 0 };
      const scores = (scoresR && scoresR.ok) ? scoresR.data : [];
      const termRec = (termR && termR.ok) ? termR.data : null;
      const resume = (resumeR && resumeR.ok) ? resumeR.data : null;
      const subjects = (subsR && subsR.ok) ? subsR.data : [];
      const ratings = (ratingsR && ratingsR.ok) ? ratingsR.data : null;
      const nextClass = (nextClassR && nextClassR.ok) ? nextClassR.data : null;

      // PROMOTED TO: 1st/2nd → next term; 3rd → next class
      let promotedTo;
      const nextT = nextTermLabel(term, year);
      if (nextT) {
        promotedTo = { term: nextT.term, year: nextT.year };
      } else {
        promotedTo = nextClass || '—';
      }

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

      const cleared = termRec && String(termRec.cleared || '').toLowerCase() === 'yes';
      const coverScores = !cleared;

      if (coverScores) {
        bodyRows = bodyRows.replace(/<td class="rc-num">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>')
                           .replace(/<td class="rc-num rc-total">[^<]*<\/td>/g, '<td class="rc-num rc-covered">—</td>');
      }

      const feeBreakdown = await buildFeeBreakdown(learner, term, year);

      const html = '' +
        '<div class="results-preview">' +
          resultsWatermarkHtml() +
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
              window.TISReport.resultsFeeBreakdownBlock(feeBreakdown) +
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
            '',
            ratings,
            promotedTo,
            learner.pin
          ) +
          window.TISReport.resultsBottomRow(chartRows, learner.pin) +
        '</div>';

      return { ok: true, html: html };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }

  async function resultsBuildSessional(learner, year) {
    try {
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

      // Sessional reports are end-of-year. PROMOTED TO = next class.
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

      let bodyRows = '';
      let sumTerm = [0, 0, 0];
      let sumCumulative = 0;
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

        sumCumulative += cumulative;

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

       const feeBreakdown = await buildFeeBreakdown(learner, '3rd', year);

      const html = '' +
        '<div class="results-preview">' +
          resultsWatermarkHtml() +
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
              window.TISReport.resultsFeeBreakdownBlock(feeBreakdown) +
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

      return { ok: true, html: html };
    } catch (err) {
      return { ok: false, error: String(err && err.message || err) };
    }
  }
})();
// ================================================================
// END OF app.js
// ================================================================
