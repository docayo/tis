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
  'learners', 'prospects', 'staff', 'terms', 'attendance', 'staffatt',
  'broadsheet', 'calendar', 'qr', 'reports', 'results',
  'classes', 'users', 'idcards', 'collectibles'
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
  if (mod === 'prospects' || mod === 'collectibles') {
    btn.classList.remove('hidden');
    return;
  }
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
  if (!hasPermission('read_' + name) && name !== 'prospects' && name !== 'collectibles') {
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
      else if (name === 'prospects') initProspectsTab();
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
      html += infoRow('Balance B/F', moneyOrDash(fee.balance_bf));
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
  // [S07b] PROSPECTS — prospective learners, pre-admission.
  //   Separate from [S07] Learners: no PIN, no learner_terms.
  //   On Admit, a real learner row is created and the learner edit
  //   modal opens so the office can fill remaining fields.
  //   Print: 80mm thermal, full school banner.
  // ================================================================
  let __prospectsCache = [];
  let __prospectsFetchedAt = 0;

  async function loadProspects() {
    const now = Date.now();
    if (__prospectsCache.length > 0 && (now - __prospectsFetchedAt) < 60 * 1000) {
      renderProspects(__prospectsCache);
      return;
    }
    setHTML('prospectsGrid', pageLoaderHTML('Loading prospects…'));
    startLoader();
    const r = await window.TIS.listProspectiveLearners();
    stopLoader();
    if (!r || !r.ok) {
      setHTML('prospectsGrid', errorHTML('Could not load prospects', r && r.error));
      return;
    }
    __prospectsCache = r.data || [];
    __prospectsFetchedAt = now;
    renderProspects(__prospectsCache);
  }
  window.loadProspects = loadProspects;

  function renderProspects(rows) {
    const filterEl = document.getElementById('prospectStatusFilter');
    const filter = filterEl ? filterEl.value : '';
    const searchEl = document.getElementById('prospectSearchInput');
    const q = searchEl ? searchEl.value.trim().toLowerCase() : '';

    let list = rows.slice();
    if (filter) list = list.filter(function (p) { return p.status === filter; });
    if (q) list = list.filter(function (p) {
      return (p.full_name || '').toLowerCase().indexOf(q) !== -1 ||
             (p.father_phone || '').indexOf(q) !== -1 ||
             (p.mother_phone || '').indexOf(q) !== -1 ||
             (p.parents_name || '').toLowerCase().indexOf(q) !== -1;
    });

    // Stats always computed from the full cached set, not the filtered view.
    const total = rows.length;
    const byStatus = { new: 0, enrolled: 0, admitted: 0, declined: 0 };
    rows.forEach(function (p) { if (byStatus[p.status] !== undefined) byStatus[p.status]++; });
    setHTML('prospectStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + total + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">New</div><div class="stat-value gold">' + byStatus.new + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Enrolled</div><div class="stat-value">' + byStatus.enrolled + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Declined</div><div class="stat-value red">' + byStatus.declined + '</div></div>');

    if (list.length === 0) {
      setHTML('prospectsGrid', emptyHTML('fa-user-plus', 'No prospects to show', 'Add one to get started.'));
      return;
    }

    let html = '<div class="card-bg" style="overflow-x:auto;">';
    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">' +
            '<th style="text-align:left;padding:6px;">Name</th>' +
            '<th style="text-align:left;padding:6px;">Class</th>' +
            '<th style="text-align:left;padding:6px;">Parents</th>' +
            '<th style="text-align:left;padding:6px;">Phone</th>' +
            '<th style="padding:6px;">Status</th>' +
            '<th style="padding:6px;">Actions</th></tr></thead><tbody>';

    list.forEach(function (p) {
      const st = p.status || 'new';
      const chip = st === 'admitted' ? 'background:#0d4d26;color:#fff;' :
                   st === 'enrolled' ? 'background:#d4a017;color:#fff;' :
                   st === 'declined' ? 'background:#c0392b;color:#fff;' :
                                       'background:#e0e0e0;color:#333;';
      html += '<tr>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;font-weight:600;">' + esc(p.full_name || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(p.proposed_class || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(p.parents_name || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;">' + esc(p.mother_phone || p.father_phone || '') + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><span style="font-size:10px;padding:2px 8px;border-radius:4px;' + chip + '">' + esc(st.toUpperCase()) + '</span></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;white-space:nowrap;">';
      html += '<button class="btn btn-sm btn-secondary" type="button" onclick="openProspectPreview(' + p.id + ')"><i class="fas fa-eye"></i></button> ';
      html += '<button class="btn btn-sm btn-primary" type="button" onclick="openProspectEditModal(' + p.id + ')"><i class="fas fa-pen"></i></button> ';
      if (st === 'new') {
        html += '<button class="btn btn-sm btn-warning" type="button" onclick="prospectEnroll(' + p.id + ')"><i class="fas fa-user-check"></i> Enroll</button> ';
      }
      if (st === 'new' || st === 'enrolled') {
        html += '<button class="btn btn-sm btn-success" type="button" onclick="prospectAdmit(' + p.id + ')"><i class="fas fa-check"></i> Admit</button> ';
      }
      if (st !== 'declined' && st !== 'admitted') {
        html += '<button class="btn btn-sm btn-danger" type="button" onclick="prospectDecline(' + p.id + ')"><i class="fas fa-times"></i></button> ';
      }
      html += '</td></tr>';
    });

    html += '</tbody></table></div>';
    setHTML('prospectsGrid', html);
  }
  window.renderProspects = renderProspects;

  function prospectSearch() {
    renderProspects(__prospectsCache);
  }
  window.prospectSearch = prospectSearch;

  // ---------- Add / Edit modal ----------
  async function openProspectEditModal(id) {
    closeModal();
    let p = null;
    if (id) {
      startLoader();
      const r = await window.TIS.getProspectiveLearner(id);
      stopLoader();
      if (!r || !r.ok || !r.data) { showToast('Could not load prospect.', 'error'); return; }
      p = r.data;
    } else {
      p = { status: 'new', proposed_class: '' };
    }

    const classesR = await window.TIS.listClasses();
    const classes = (classesR && classesR.ok ? classesR.data : [])
      .filter(function (c) { return c.is_active !== false; });

    const f = function (fieldId, label, value, type) {
      const t = type || 'text';
      return '<div class="form-group"><label>' + esc(label) + '</label>' +
             '<input id="' + fieldId + '" type="' + t + '" value="' + escAttr(value || '') + '"></div>';
    };

    let classOpts = '<option value="">— Select class —</option>';
    classes.forEach(function (c) {
      classOpts += '<option value="' + escAttr(c.name) + '"' + (c.name === p.proposed_class ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    });

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>' + (id ? 'Edit Prospect' : 'Add Prospect') + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div class="form-row">' + f('pr_name', 'Full Name', p.full_name) +
            '<div class="form-group"><label>Proposed Class</label><select id="pr_class">' + classOpts + '</select></div></div>';
    html += '<div class="form-row">' +
            '<div class="form-group"><label>Gender</label><select id="pr_gender"><option value="">—</option>' +
            '<option value="Male"' + (p.gender === 'Male' ? ' selected' : '') + '>Male</option>' +
            '<option value="Female"' + (p.gender === 'Female' ? ' selected' : '') + '>Female</option></select></div>' +
            f('pr_dob', 'Date of Birth', p.date_of_birth, 'date') + '</div>';
    html += f('pr_parents', 'Parents Name', p.parents_name);
    html += '<div class="form-row">' + f('pr_father_phone', "Father's Phone", p.father_phone) +
            f('pr_mother_phone', "Mother's Phone", p.mother_phone) + '</div>';
    html += '<div class="form-row">' + f('pr_guardian_phone', "Guardian's Phone", p.guardian_phone) +
            f('pr_previous_school', 'Previous School', p.previous_school) + '</div>';
    html += '<div class="form-group"><label>Address</label><textarea id="pr_address" rows="2">' + esc(p.address || '') + '</textarea></div>';
    html += '<div class="form-group"><label>Notes</label><textarea id="pr_notes" rows="2">' + esc(p.notes || '') + '</textarea></div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Cancel</button> ';
    html += '<button class="btn btn-success" id="pr_submit" type="button">' + (id ? 'Save' : 'Add Prospect') + '</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);

    const btn = document.getElementById('pr_submit');
    if (btn) btn.addEventListener('click', function () { submitProspect(id); });
  }
  window.openProspectEditModal = openProspectEditModal;

  async function submitProspect(id) {
    const get = function (fid) { const el = document.getElementById(fid); return el ? String(el.value || '').trim() : ''; };
    const row = {
      full_name:       get('pr_name'),
      proposed_class:  get('pr_class'),
      gender:          get('pr_gender'),
      date_of_birth:   get('pr_dob'),
      parents_name:    get('pr_parents'),
      father_phone:    get('pr_father'),
      mother_phone:    get('pr_mother'),
      guardian_phone:  get('pr_guardian'),
      previous_school: get('pr_previous_school'),
      address:         get('pr_address'),
      notes:           get('pr_notes'),
      created_by:      (State.profile && State.profile.name) || 'Operator'
    };
    if (!row.full_name) { showToast('Full name is required.', 'warning'); return; }

    startLoader();
    const r = id ? await window.TIS.updateProspectiveLearner(id, row)
                 : await window.TIS.createProspectiveLearner(row);
    stopLoader();
    if (!r || !r.ok) { showToast('Save failed: ' + ((r && r.error) || 'unknown'), 'error'); return; }
    showToast(id ? 'Prospect updated.' : 'Prospect added.', 'success');
    closeModal();
    __prospectsFetchedAt = 0;
    loadProspects();
  }
  window.submitProspect = submitProspect;

  // ---------- Preview modal (the CSS sheet with X toggles) ----------
  async function openProspectPreview(id) {
    closeModal();
    startLoader();
    const pr = await window.TIS.getProspectiveLearner(id);
    const at = await window.TIS.getActiveTerm();
    stopLoader();
    if (!pr || !pr.ok || !pr.data) { showToast('Prospect not found.', 'error'); return; }
    const p = pr.data;
    const term = (at && at.ok && at.data) ? at.data : null;
    if (!term) { showToast('No active term set.', 'error'); return; }

    const feeR = await window.TIS.getProspectiveFeePreview(p.proposed_class, term.term_type, term.year);
    if (!feeR || !feeR.ok) { showToast('Could not load fee preview.', 'error'); return; }
    const fee = feeR.data;

    window.__prospectForPrint = { prospect: p, fee: fee, term: term };
    renderProspectPreview();
  }
  window.openProspectPreview = openProspectPreview;

  function renderProspectPreview() {
    const ctx = window.__prospectForPrint;
    if (!ctx) return;
    const p = ctx.prospect, fee = ctx.fee, term = ctx.term;

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()" style="max-width:520px;">';
    html += '<div class="modal-header"><h2>Fee Preview — ' + esc(p.full_name) + '</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div style="background:#f7fbf7;padding:12px;border-radius:8px;font-family:Arial;color:#000;font-size:13px;line-height:1.5;">';
    html += '<div style="text-align:center;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px;">';
    html += '<div style="font-size:16px;font-weight:900;">THE IDEAL SCHOOLS</div>';
    html += '<div style="font-size:11px;font-style:italic;">Scientia est potentia</div>';
    html += '<div style="font-size:11px;margin-top:4px;">' + esc(term.label) + '</div>';
    html += '</div>';

    html += '<div style="font-size:14px;font-weight:800;">' + esc(p.full_name) + '</div>';
    html += '<div style="font-size:11px;margin-bottom:8px;">Proposed: ' + esc(p.proposed_class) + '</div>';

    html += '<div style="font-weight:900;border-top:2px solid #000;border-bottom:1px solid #000;padding:3px 0;text-transform:uppercase;font-size:12px;">Class Bill</div>';
    html += '<div>Tuition ....... ₦' + Number(fee.class_bill.tuition).toLocaleString() + '</div>';
    html += '<div>Other Major ... ₦' + Number(fee.class_bill.other_bills_major).toLocaleString() + '</div>';
    html += '<div>Other Minor ... ₦' + Number(fee.class_bill.other_bills_minor).toLocaleString() + '</div>';
    html += '<div>Books ......... ₦' + Number(fee.class_bill.books).toLocaleString() + '</div>';

    html += '<div style="font-weight:900;border-top:2px solid #000;border-bottom:1px solid #000;padding:3px 0;text-transform:uppercase;font-size:12px;margin-top:8px;">Extras</div>';
    fee.extras.forEach(function (e, i) {
      const on = e.default_on !== false;
      html += '<div data-extra-index="' + i + '" style="display:flex;justify-content:space-between;padding:2px 0;' + (on ? '' : 'text-decoration:line-through;color:#999;') + '">';
      html += '<span>' + esc(e.item_label) + '</span>';
      html += '<span>₦' + Number(e.default_amount).toLocaleString();
      html += ' <button type="button" class="btn btn-sm btn-danger" style="font-size:9px;padding:1px 5px;margin-left:6px;" onclick="toggleExtra(' + i + ')">X</button></span>';
      html += '</div>';
    });

    const extrasOn = fee.extras.filter(function (e) { return e.default_on !== false; });
    const extrasTotal = extrasOn.reduce(function (s, e) { return s + Number(e.default_amount); }, 0);
    const grand = fee.class_bill.total + extrasTotal;

    html += '<div style="font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:6px;font-size:14px;display:flex;justify-content:space-between;">';
    html += '<span>TOTAL</span><span>₦' + grand.toLocaleString() + '</span></div>';

    html += '</div>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Close</button> ';
    html += '<button class="btn btn-gold" onclick="printProspectSheet()"><i class="fas fa-print"></i> Print 80mm</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }
  window.renderProspectPreview = renderProspectPreview;

  function toggleExtra(idx) {
    const ctx = window.__prospectForPrint;
    if (!ctx) return;
    ctx.fee.extras[idx].default_on = !ctx.fee.extras[idx].default_on;
    renderProspectPreview();
  }
  window.toggleExtra = toggleExtra;

  // ---------- 80mm print ----------
  function printProspectSheet() {
    const ctx = window.__prospectForPrint;
    if (!ctx) return;
    const p = ctx.prospect, fee = ctx.fee, term = ctx.term;

    const css80 =
      '@page{size:72mm auto;margin:2mm;}' +
      'html,body{width:72mm;margin:0;padding:0;}' +
      'body{font-family:"Arial",sans-serif;font-size:14px;line-height:1.35;color:#000;}' +
      '*{box-sizing:border-box;}' +
      '.hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:4px;margin:0 0 8px;}' +
      '.hdr img{height:36px;}' +
      '.hdr h1{font-size:18px;font-weight:900;margin:4px 0 2px;}' +
      '.hdr .sub{font-size:11px;font-style:italic;}' +
      '.who{font-size:15px;font-weight:900;margin:6px 0 2px;}' +
      '.who-sub{font-size:11px;margin:0 0 6px;}' +
      'h2{font-size:13px;font-weight:900;margin:8px 0 4px;padding:2px 0;border-top:2px solid #000;border-bottom:1px solid #000;text-transform:uppercase;}' +
      '.r{display:flex;justify-content:space-between;gap:6px;font-size:12px;padding:2px 0;border-bottom:1px dotted #888;}' +
      '.r:last-child{border-bottom:0;}' +
      '.r .v{font-weight:800;text-align:right;white-space:nowrap;}' +
      '.total{border-top:2px solid #000;margin-top:6px;padding-top:6px;font-weight:900;font-size:15px;display:flex;justify-content:space-between;}' +
      '.ft{margin-top:8px;padding-top:4px;border-top:1px solid #000;font-size:10px;text-align:center;}';

    const rowFn = function (label, value) {
      return '<div class="r"><span>' + esc(label) + '</span><span class="v">' + esc(value) + '</span></div>';
    };

    let html = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(p.full_name) + '</title>';
    html += '<style>' + css80 + '</style></head><body>';

    html += '<div class="hdr">';
    html += '<img src="https://lh3.googleusercontent.com/d/1bVenQy0y4TYzOBrd-ocwR5x3wJZTPgBs=w200" alt="">';
    html += '<img src="https://lh3.googleusercontent.com/d/1fHJRlqlsoJe23D79LcG1cOxcla0bAPYR=w200" alt="">';
    html += '<h1>THE IDEAL SCHOOLS</h1>';
    html += '<div class="sub">Scientia est potentia</div>';
    html += '</div>';

    html += '<div class="who">' + esc(p.full_name) + '</div>';
    html += '<div class="who-sub">Proposed: ' + esc(p.proposed_class) + ' &middot; ' + esc(term.label) + '</div>';

    html += '<h2>Class Bill</h2>';
    html += rowFn('Tuition', '₦' + Number(fee.class_bill.tuition).toLocaleString());
    html += rowFn('Other Bills Major', '₦' + Number(fee.class_bill.other_bills_major).toLocaleString());
    html += rowFn('Other Bills Minor', '₦' + Number(fee.class_bill.other_bills_minor).toLocaleString());
    html += rowFn('Books', '₦' + Number(fee.class_bill.books).toLocaleString());
    html += rowFn('Subtotal', '₦' + Number(fee.class_bill.total).toLocaleString());

    html += '<h2>Extras</h2>';
    const on = fee.extras.filter(function (e) { return e.default_on !== false; });
    if (on.length === 0) {
      html += rowFn('(none selected)', '—');
    } else {
      on.forEach(function (e) {
        html += rowFn(e.item_label, '₦' + Number(e.default_amount).toLocaleString());
      });
    }
    const extrasTotal = on.reduce(function (s, e) { return s + Number(e.default_amount); }, 0);

    html += '<div class="total"><span>TOTAL</span><span>₦' + (fee.class_bill.total + extrasTotal).toLocaleString() + '</span></div>';
    html += '<div class="ft">Printed ' + new Date().toLocaleString() + '</div>';
    html += '</body></html>';

    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(function () {
      try { w.focus(); w.print(); } catch (e) {}
    }, 600);
    closeModal();
  }
  window.printProspectSheet = printProspectSheet;

  // ---------- Enroll / Admit / Decline ----------
  async function prospectEnroll(id) {
    if (!confirm('Mark this prospect as ENROLLED? No learner row is created yet.')) return;
    startLoader();
    const r = await window.TIS.enrollProspectiveLearner(id);
    stopLoader();
    if (r && r.ok) { showToast('Enrolled.', 'success'); __prospectsFetchedAt = 0; loadProspects(); }
    else showToast('Failed: ' + ((r && r.error) || ''), 'error');
  }
  window.prospectEnroll = prospectEnroll;

  async function prospectAdmit(id) {
    if (!confirm('Admit this prospect? A real learner row with a PIN will be created.')) return;
    startLoader();
    const r = await window.TIS.admitProspectiveLearner(id);
    stopLoader();
    if (r && r.ok) {
      const learner = r.data.learner || {};
      showToast('Admitted. PIN ' + (learner.pin || '(auto)'), 'success');
      __prospectsFetchedAt = 0;
      loadProspects();
      // Refresh learners cache so the new row appears immediately.
      State.learnersFetchedAt = 0;
      if (learner.pin) {
        setTimeout(function () { openLearnerEditModal(learner.pin); }, 400);
      }
    } else {
      showToast('Failed: ' + ((r && r.error) || ''), 'error');
    }
  }
  window.prospectAdmit = prospectAdmit;

  async function prospectDecline(id) {
    if (!confirm('Mark this prospect as DECLINED?')) return;
    startLoader();
    const r = await window.TIS.declineProspectiveLearner(id);
    stopLoader();
    if (r && r.ok) { showToast('Declined.', 'success'); __prospectsFetchedAt = 0; loadProspects(); }
    else showToast('Failed: ' + ((r && r.error) || ''), 'error');
  }
  window.prospectDecline = prospectDecline;

  // ---------- Manage extras modal ----------
  async function openManageExtrasModal() {
    closeModal();
    startLoader();
    const r = await window.TIS.listFeeExtrasDefaults(false);
    stopLoader();
    if (!r || !r.ok) { showToast('Could not load extras.', 'error'); return; }
    const extras = r.data || [];

    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">';
    html += '<div class="modal-box wide" onclick="event.stopPropagation()">';
    html += '<div class="modal-header"><h2>Fee Extras Defaults</h2>' +
            '<button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';
    html += '<p style="font-size:12px;color:#666;margin:0 0 10px;">These amounts appear on every prospectus. Amounts are shared across all classes.</p>';

    html += '<table class="users-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr style="background:#0d4d26;color:#fff;">' +
            '<th style="text-align:left;padding:6px;">Item</th>' +
            '<th style="padding:6px;">Amount ₦</th>' +
            '<th style="padding:6px;">Active</th>' +
            '<th style="padding:6px;">Save</th></tr></thead><tbody>';
    extras.forEach(function (e, i) {
      html += '<tr data-extra-id="' + i + '">';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;font-weight:600;">' + esc(e.item_label) + '</td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><input type="number" step="0.01" class="ext-amt" data-key="' + escAttr(e.item_key) + '" value="' + Number(e.default_amount || 0) + '" style="width:120px;"></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><input type="checkbox" class="ext-on" data-key="' + escAttr(e.item_key) + '"' + (e.is_active !== false ? ' checked' : '') + '></td>';
      html += '<td style="padding:5px;border-bottom:1px solid #eee;text-align:center;"><button class="btn btn-sm btn-success" type="button" onclick="saveExtraRow(\'' + escAttr(e.item_key) + '\')">Save</button></td>';
      html += '</tr>';
    });
    html += '</tbody></table>';

    html += '<div style="text-align:right;margin-top:12px;">';
    html += '<button class="btn btn-secondary" onclick="TIS.closeModal()">Close</button>';
    html += '</div></div></div>';
    setHTML('modalContainer', html);
  }
  window.openManageExtrasModal = openManageExtrasModal;

  async function saveExtraRow(itemKey) {
    const amtEl = document.querySelector('.ext-amt[data-key="' + itemKey + '"]');
    const onEl  = document.querySelector('.ext-on[data-key="' + itemKey + '"]');
    if (!amtEl || !onEl) return;
    startLoader();
    const r = await window.TIS.upsertFeeExtraDefault({
      item_key: itemKey,
      default_amount: Number(amtEl.value || 0),
      is_active: onEl.checked
    });
    stopLoader();
    if (r && r.ok) showToast('Saved.', 'success');
    else showToast('Save failed: ' + ((r && r.error) || ''), 'error');
  }
  window.saveExtraRow = saveExtraRow;

  // ---------- Tab wiring ----------
  function initProspectsTab() {
    const add = document.getElementById('btnAddProspect');
    if (add && !add.__wired) { add.addEventListener('click', function () { openProspectEditModal(null); }); add.__wired = true; }

    const rf = document.getElementById('btnRefreshProspects');
    if (rf && !rf.__wired) { rf.addEventListener('click', function () { __prospectsFetchedAt = 0; loadProspects(); }); rf.__wired = true; }

    const mg = document.getElementById('btnManageExtras');
    if (mg && !mg.__wired) { mg.addEventListener('click', openManageExtrasModal); mg.__wired = true; }

    const sf = document.getElementById('prospectStatusFilter');
    if (sf && !sf.__wired) { sf.addEventListener('change', prospectSearch); sf.__wired = true; }

    const si = document.getElementById('prospectSearchInput');
    if (si && !si.__wired) { si.addEventListener('input', prospectSearch); si.__wired = true; }

    loadProspects();
  }
  window.initProspectsTab = initProspectsTab;

  // ================================================================
  // Edit modal — dropdowns for class / gender / religion,
  //
