// ================================================================
// TIS EMIS — APPLICATION LOGIC
// File: app.js
// ================================================================
// PART 1 of 4 — State · Utilities · Auth · Navigation · Learners
// PART 2 of 4 — Staff · Terms · Learner Attendance
// PART 3 of 4 — Staff Attendance · Movements · Monthly
// PART 4 of 4 — Broadsheet · Calendar · Import · QR · Reports ·
//               Classes · Users · Birthdays · Init
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [SECTION 01] STATE
  // ================================================================
  const State = {
    profile: null,
    permissions: {},
    cachedLearners: [],
    cachedStaff: [],
    cachedTerms: [],
    cachedClasses: [],
    lastTermView: null,
    todayContext: null,
    markingShortcutsUsed: false,
    searchTimer: null,
    staffSearchTimer: null,
    loaderCount: 0,
    loaderInterval: null,
    loaderPercent: 0,
    birthdayInterval: null,
    celebratedThisSession: {},
    ci_currentImportId: null,
    ci_currentFile: null,
    ci_currentFilename: null
  };

  const ALL_MODULES = [
    'learners', 'staff', 'terms', 'attendance', 'staffatt',
    'broadsheet', 'calendar', 'calimport', 'qr', 'reports',
    'classes', 'users'
  ];

  // ================================================================
  // [SECTION 02] UTILITIES
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

  function fmtMoney(v) {
    if (v === '' || v === null || v === undefined) return '—';
    const n = Number(v);
    if (isNaN(n)) return v.toString();
    return '\u20a6' + n.toLocaleString();
  }

  function showToast(msg, type) {
    const t = $('toast');
    if (!t) return;
    t.className = 'toast ' + (type || 'info');
    t.textContent = msg;
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 4500);
  }

  function startLoader() {
    State.loaderCount++;
    if (State.loaderCount === 1) {
      const cl = $('cornerLoader');
      if (cl) cl.classList.remove('hidden');
      State.loaderPercent = 0;
      if (State.loaderInterval) clearInterval(State.loaderInterval);
      State.loaderInterval = setInterval(() => {
        if (State.loaderPercent < 80) State.loaderPercent += 5;
        setText('miniPercent', Math.floor(State.loaderPercent) + '%');
      }, 100);
    }
  }

  function stopLoader() {
    State.loaderCount--;
    if (State.loaderCount < 0) State.loaderCount = 0;
    if (State.loaderCount === 0) {
      State.loaderPercent = 100;
      setText('miniPercent', '100%');
      setTimeout(() => {
        if (State.loaderCount > 0) return;
        if (State.loaderInterval) clearInterval(State.loaderInterval);
        State.loaderInterval = null;
        const cl = $('cornerLoader');
        if (cl) cl.classList.add('hidden');
        State.loaderPercent = 0;
      }, 400);
    }
  }

  function resetLoader() {
    State.loaderCount = 0;
    if (State.loaderInterval) clearInterval(State.loaderInterval);
    State.loaderInterval = null;
    const cl = $('cornerLoader');
    if (cl) cl.classList.add('hidden');
  }

  function showWelcomeLoader() {
    const el = $('loadingScreen');
    if (!el) return;
    el.classList.remove('hidden');
    el.style.opacity = '1';
    const pctEl = $('loadingPercent');
    let pct = 0;
    const iv = setInterval(() => {
      pct += 3;
      if (pct > 80) pct = 80;
      if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
    }, 40);
    setTimeout(() => {
      clearInterval(iv);
      if (pctEl) pctEl.textContent = '100%';
      setTimeout(() => {
        el.style.opacity = '0';
        setTimeout(() => {
          el.classList.add('hidden');
          el.style.opacity = '1';
        }, 500);
      }, 400);
    }, 1500);
  }

  function pageLoaderHTML(msg) {
    return '<div class="page-loader"><div class="mini-tis-l"><div class="r-o"></div><div class="r-i"></div><div class="l-bg"></div><div class="m-t">TIS</div></div><p>' + esc(msg || 'Loading...') + '</p></div>';
  }

  function emptyHTML(icon, title, sub) {
    return '<div class="empty-state"><i class="fas ' + (icon || 'fa-inbox') + '"></i><h3>' + esc(title || 'Nothing here') + '</h3>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>';
  }

  function errorHTML(title, detail) {
    return '<div class="empty-state"><i class="fas fa-triangle-exclamation"></i><h3>' + esc(title) + '</h3>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '</div>';
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
  // [SECTION 03] PERMISSIONS
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
  // [SECTION 04] AUTH
  // ================================================================
  async function doLogin() {
    const idEl = $('loginId');
    const pwEl = $('loginPassword');
    const id = idEl ? idEl.value.trim() : '';
    const pw = pwEl ? pwEl.value : '';

    if (!id || !pw) {
      setText('loginStatus', 'Enter your User ID and password.');
      return;
    }

    const btn = $('loginBtn');
    if (btn) btn.disabled = true;
    setText('loginStatus', 'Checking your details...');

    const r = await window.TIS.signIn(id, pw);
    if (!r.ok) {
      if (btn) btn.disabled = false;
      setText('loginStatus', r.error || 'Login failed.');
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
    resetLoader();
    closeModal();
    try { await window.TIS.signOut(); } catch (e) { /* silent */ }

    State.profile = null;
    State.permissions = {};
    State.cachedLearners = [];
    State.cachedStaff = [];
    State.cachedTerms = [];
    State.cachedClasses = [];
    State.lastTermView = null;
    State.todayContext = null;
    State.celebratedThisSession = {};

    if (State.birthdayInterval) clearInterval(State.birthdayInterval);

    showLoginScreen();
    showToast('Signed out', 'info');
  }

  function showLoginScreen() {
    resetLoader();
    const bd = document.querySelector('.birthday-overlay');
    if (bd) bd.remove();
    $('loginPage').classList.remove('hidden');
    $('dashboardHeader').classList.add('hidden');
    $('mainContainer').classList.add('hidden');
    $('dashboardFooter').classList.add('hidden');
    $('loadingScreen').classList.add('hidden');
    const idEl = $('loginId');
    if (idEl) { idEl.value = ''; setTimeout(() => idEl.focus(), 100); }
    const st = $('loginStatus');
    if (st) st.textContent = '';
    const btn = $('loginBtn');
    if (btn) btn.disabled = false;
  }

  function enterDashboard() {
    showWelcomeLoader();
    setTimeout(() => {
      $('loginPage').classList.add('hidden');
      $('dashboardHeader').classList.remove('hidden');
      $('mainContainer').classList.remove('hidden');
      $('dashboardFooter').classList.remove('hidden');

      setText('dashOperatorName', State.profile.name || 'Operator');
      setText('dashOperatorRole', State.profile.role || 'Operator');
      const av = $('dashAvatar');
      if (av && State.profile.avatar_url) av.src = State.profile.avatar_url;

      applyPermissionsToUI();
      showToast('Welcome, ' + (State.profile.name || 'Operator'), 'success');

      if (State.profile.must_change_password) {
        setTimeout(() => {
          showToast('Please change your password before you continue.', 'warning');
          openChangePasswordModal();
        }, 1800);
      }

      switchTab(getFirstPermittedTab());
      startBirthdayWatcher();
    }, 2000);
  }

  async function openChangePasswordModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:420px;" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Change password</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-group"><label>Current password</label><input type="password" id="cp_old"></div>' +
      '<div class="form-group"><label>New password</label><input type="password" id="cp_new" placeholder="at least 4 characters"></div>' +
      '<div class="form-group"><label>Confirm new password</label><input type="password" id="cp_new2"></div>' +
      '<div style="text-align:right;margin-top:12px;"><button class="btn btn-success" id="cp_submit" type="button">Update password</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    $('cp_submit').addEventListener('click', submitChangePassword);
  }

  async function submitChangePassword() {
    const oldPw = $('cp_old').value;
    const newPw = $('cp_new').value;
    const newPw2 = $('cp_new2').value;
    if (!oldPw || !newPw || !newPw2) { showToast('Fill in all three fields', 'warning'); return; }
    if (newPw.length < 4) { showToast('Use at least 4 characters', 'warning'); return; }
    if (newPw !== newPw2) { showToast('The new passwords do not match', 'warning'); return; }

    // Supabase's updateUser does not require old password; we do a
    // quick re-auth first to be safe.
    startLoader();
    const re = await window.TIS.signIn(State.profile.operator_id, oldPw);
    if (!re.ok) { stopLoader(); showToast('Current password is incorrect', 'error'); return; }

    const r = await window.TIS.changePassword(newPw);
    stopLoader();
    if (!r.ok) { showToast(r.error || 'Could not change the password', 'error'); return; }
    showToast('Password updated', 'success');
    State.profile.must_change_password = false;
    closeModal();
  }

  // ================================================================
  // [SECTION 05] NAVIGATION
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

    if (name === 'learners') loadLearners();
    else if (name === 'staff') loadStaff();
    else if (name === 'terms') initTermsTab();
    else if (name === 'attendance') initLearnerAttendanceTab();
    else if (name === 'staffatt') initStaffAttendanceTab();
    else if (name === 'broadsheet') initBroadSheetTab();
    else if (name === 'calendar') loadCalendar();
    else if (name === 'calimport') loadCalendarImportHistory();
    else if (name === 'qr') loadActiveQR();
    else if (name === 'classes') loadClasses();
    else if (name === 'users') loadUsers();
  }

  // ================================================================
  // [SECTION 06] LEARNERS
  // ================================================================
  async function loadLearners() {
    setHTML('learnersGrid', pageLoaderHTML('Loading learners...'));
    startLoader();
    const r = await window.TIS.listLearners();
    stopLoader();
    if (!r.ok) {
      setHTML('learnersGrid', errorHTML('Could not load learners', r.error));
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
    rows.forEach(row => {
      const pin = row.pin || '';
      const name = row.name || '';
      const cls = row.class_name || '';
      const gender = (row.gender || '').toLowerCase();
      const photo = row.photo_url || '';
      const nameColor = gender.indexOf('female') === 0 ? '#ff6b9d' : (gender.indexOf('male') === 0 ? '#6ddb9a' : 'white');
      html += '<div class="student-card" data-pin="' + escAttr(pin) + '">' +
        '<div class="card-header">' +
        '<div class="card-avatar">' + (photo ? '<img src="' + esc(photo) + '">' : esc(name.charAt(0) || '?')) + '</div>' +
        '<div class="card-title"><h3 style="color:' + nameColor + ';">' + esc(name) + '</h3>' +
        '<div class="pin">' + esc(pin) + ' • ' + esc(cls) + '</div></div>' +
        '</div></div>';
    });
    setHTML('learnersGrid', html);
    document.querySelectorAll('#learnersGrid .student-card').forEach(card => {
      card.addEventListener('click', () => openLearnerProfile(card.dataset.pin));
    });
  }

  function renderLearnerStats(rows) {
    const total = rows.length;
    let exited = 0;
    rows.forEach(r => { if (r.exit_reason && r.exit_reason !== 'N/A') exited++; });
    setHTML('learnerStats',
      '<div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">' + total + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Exited</div><div class="stat-value">' + exited + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Active</div><div class="stat-value">' + (total - exited) + '</div></div>');
  }

  async function openLearnerProfile(pin) {
    startLoader();
    const found = State.cachedLearners.find(l => l.pin === pin);
    stopLoader();
    if (!found) { showToast('Learner not found', 'error'); return; }
    showLearnerModal(found);
  }

  function infoRow(label, value) {
    const v = (value !== undefined && value !== null && value !== '') ? esc(value) : '—';
    return '<div class="info-row"><span class="info-label">' + esc(label) + '</span><span class="info-value">' + v + '</span></div>';
  }

  function showLearnerModal(d) {
    let html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>' + esc(d.name) + '</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>';

    html += '<div class="expandable open"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">A — Identity</div><div class="expandable-body">';
    html += infoRow('Class', d.class_name);
    html += infoRow('PIN', d.pin);
    html += infoRow('Gender', d.gender);
    html += infoRow('Father Phone', d.father_phone);
    html += infoRow('Mother Phone', d.mother_phone);
    html += infoRow('Guardian Phone', d.guardian_phone);
    html += infoRow('Account', d.account_number);
    html += '</div></div>';

    html += '<div class="expandable open"><div class="expandable-header" onclick="this.parentElement.classList.toggle(\'open\')">B — Bio</div><div class="expandable-body">';
    html += infoRow('Date of Admission', fmtDate(d.date_of_admission));
    html += infoRow('Date of Birth', fmtDate(d.date_of_birth));
    html += infoRow('Blood Group', d.blood_group);
    html += infoRow('Religion', d.religion);
    html += infoRow('Parents Name', d.parents_name);
    html += infoRow('Address', d.address);
    html += infoRow('State of Origin', d.state_of_origin);
    html += infoRow('LGA of Origin', d.lga_of_origin);
    html += infoRow('State of Birth', d.state_of_birth);
    html += infoRow('LGA of Birth', d.lga_of_birth);
    html += infoRow('Allergy', d.allergy);
    html += '</div></div>';

    html += '</div></div>';
    setHTML('modalContainer', html);
  }

  function initLearnersTab() {
    const input = $('learnerSearchInput');
    if (input) {
      input.addEventListener('input', debounce(async () => {
        const q = input.value.trim();
        if (q.length === 0) { loadLearners(); return; }
        if (q.length < 2) return;
        setHTML('learnersGrid', pageLoaderHTML('Searching...'));
        const r = await window.TIS.searchLearners(q);
        if (r.ok) renderLearners(r.data);
        else setHTML('learnersGrid', errorHTML('Search failed', r.error));
      }, 350));
    }
    const rl = $('btnRefreshLearners');
    if (rl) rl.addEventListener('click', loadLearners);
    const pl = $('btnPrintLearners');
    if (pl) pl.addEventListener('click', printLearners);
  }

  function printLearners() {
    if (!State.cachedLearners || State.cachedLearners.length === 0) {
      showToast('Load the list first', 'warning');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Learners</title><style>body{font-family:Arial;padding:20px;}h1{color:#0b6623;text-align:center;}table{width:100%;border-collapse:collapse;}th{background:#0b6623;color:white;padding:8px;font-size:11px;}td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;}</style></head><body>';
    html += '<h1>THE IDEAL SCHOOLS — Learners List</h1>';
    html += '<table><thead><tr><th>Class</th><th>PIN</th><th>Name</th><th>Gender</th></tr></thead><tbody>';
    State.cachedLearners.forEach(row => {
      const g = (row.gender || '').toLowerCase();
      const color = g.indexOf('female') === 0 ? 'color:#c0392b;' : (g.indexOf('male') === 0 ? 'color:#1a5276;' : '');
      html += '<tr><td>' + esc(row.class_name || '') + '</td><td>' + esc(row.pin || '') + '</td><td style="' + color + 'font-weight:600;">' + esc(row.name || '') + '</td><td>' + esc(row.gender || '') + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }

  // ================================================================
  // [SECTION 07] EXPOSE — everything else in this file refers
  // to functions defined in Parts 2–4. We expose a minimal API
  // so inline onclick handlers can call closeModal, switchTab, etc.
  // ================================================================
  window.TIS_APP = {
    State,
    $, setHTML, setText, esc, escAttr,
    todayISO, fmtDate, fmtMoney,
    showToast, startLoader, stopLoader, resetLoader, showWelcomeLoader,
    pageLoaderHTML, emptyHTML, errorHTML, closeModal, toggleExpandable,
    isSuperAdmin, hasPermission, getFirstPermittedTab,
    switchTab, doLogin, doLogout, showLoginScreen, openChangePasswordModal
  };

  // Public aliases for inline handlers in HTML
  window.TIS = window.TIS || {};
  window.TIS.closeModal = closeModal;

  // ================================================================
  // END OF PART 1 OF 4
  // ================================================================
})();
