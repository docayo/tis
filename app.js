// ================================================================
// TIS EMIS — APPLICATION LOGIC
// File: app.js
// ================================================================
// PART 1 of 4 — State · Utilities · Auth · Navigation · Learners
// PART 2 of 4 — Staff · Terms · Learner Attendance
// PART 3 of 4 — Staff Attendance · Movements · Monthly
// PART 4 of 4 — Broadsheet · Calendar · Import · QR · Reports ·
//               Classes · Users · Birthdays · Init (closes IIFE)
//
// Every part appends to the end. Only Part 4 closes the IIFE.
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
    const found = State.cachedLearners.find(l => l.pin === pin);
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
  // PART 1 PUBLIC API
  // ================================================================
  window.TIS = window.TIS || {};
  window.TIS.closeModal = closeModal;

  // ================================================================
  // END OF PART 1 OF 4
  // ================================================================


  // ================================================================
  // [SECTION 08] STAFF
  // ================================================================
  async function loadStaff() {
    setHTML('staffGrid', pageLoaderHTML('Loading staff...'));
    startLoader();
    const r = await window.TIS.listStaff();
    stopLoader();
    if (!r.ok) {
      setHTML('staffGrid', errorHTML('Could not load staff', r.error));
      return;
    }
    State.cachedStaff = r.data || [];
    renderStaff(State.cachedStaff);
    renderStaffStats(State.cachedStaff);
  }

  function renderStaff(staff) {
    if (!staff || staff.length === 0) {
      setHTML('staffGrid', emptyHTML('fa-user-tie', 'No staff to show'));
      return;
    }
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
    html += '<div class="photo-picker"><div class="photo-preview">' + (s.photo_url ? '<img src="' + esc(s.photo_url) + '">' : esc((s.first_name || '?').charAt(0))) + '</div></div>';
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
      '<div class="form-row"><div class="form-group"><label>Resume</label><input id="ns_resumeTime" type="time" value="07:00"></div><div class="form-group"><label>Close</label><input id="ns_closeTime" type="time" value="16:30"></div></div>' +
      '<div style="text-align:right;margin-top:16px;"><button class="btn btn-success" id="ns_submit" type="button">Save staff</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    $('ns_submit').addEventListener('click', submitNewStaff);
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
      resume_time: $('ns_resumeTime').value || '07:00',
      close_time: $('ns_closeTime').value || '16:30',
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
    const add = $('btnAddStaff');
    if (add) add.addEventListener('click', openAddStaffModal);
    const rf = $('btnRefreshStaff');
    if (rf) rf.addEventListener('click', loadStaff);
    const pr = $('btnPrintStaff');
    if (pr) pr.addEventListener('click', printStaff);
  }

  function printStaff() {
    if (!State.cachedStaff || State.cachedStaff.length === 0) { showToast('Load the list first', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Staff</title><style>body{font-family:Arial;padding:20px;}h1{color:#0b6623;text-align:center;}table{width:100%;border-collapse:collapse;}th{background:#0b6623;color:white;padding:8px;font-size:11px;}td{padding:6px 8px;border-bottom:1px solid #eee;font-size:11px;}</style></head><body>';
    html += '<h1>THE IDEAL SCHOOLS — Staff List</h1>';
    html += '<table><thead><tr><th>ID</th><th>Name</th><th>Dept</th><th>Phone</th></tr></thead><tbody>';
    State.cachedStaff.forEach(s => {
      html += '<tr><td>' + esc(s.staff_id) + '</td><td>' + esc(s.full_name) + '</td><td>' + esc(s.department) + '</td><td>' + esc(s.phone) + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }

  // ================================================================
  // [SECTION 09] TERMS & PROMOTION
  // ================================================================
  async function initTermsTab() {
    await loadTerms();
    await populatePromotionDropdowns();
    await loadArchives();
  }

  async function loadTerms() {
    setHTML('termsList', pageLoaderHTML('Loading terms...'));
    const r = await window.TIS.listTerms();
    if (!r.ok) { setHTML('termsList', errorHTML('Could not load terms', r.error)); return; }
    State.cachedTerms = r.data || [];
    if (State.cachedTerms.length === 0) {
      setHTML('termsList', emptyHTML('fa-calendar-alt', 'No terms found', 'Generate a calendar to create terms.'));
      return;
    }
    let html = '';
    State.cachedTerms.forEach(t => {
      html += '<div class="term-card"><div><strong>' + esc(t.label) + '</strong> ' +
        (t.is_active ? '<span class="card-badge" style="background:#27ae60;">ACTIVE</span>' : '') +
        '</div><div style="font-size:11px;color:#666;">' +
        (t.start_date ? fmtDate(t.start_date) + ' → ' + fmtDate(t.end_date) : '') +
        '</div></div>';
    });
    setHTML('termsList', html);
  }

  async function populatePromotionDropdowns() {
    const fromSel = $('promoteFromTerm');
    const toSel = $('promoteToTerm');
    if (!fromSel || !toSel) return;
    fromSel.innerHTML = '<option value="">-- Select --</option>';
    toSel.innerHTML = '<option value="">-- Select --</option>';
    State.cachedTerms.forEach(t => {
      const v = t.term_type + '|' + t.year;
      fromSel.innerHTML += '<option value="' + esc(v) + '">' + esc(t.label) + '</option>';
      toSel.innerHTML += '<option value="' + esc(v) + '">' + esc(t.label) + '</option>';
    });
    const exitSel = $('exitReasonSelect');
    if (exitSel) {
      exitSel.innerHTML = '';
      ['Completion of Studies', 'Inability to Pay Tuition', 'Change of Location',
       'Parent Differences', 'School Vs Parent Ideology', 'Discipline/Expulsion',
       'Health Grounds', 'Life'].forEach(r => {
        exitSel.innerHTML += '<option>' + esc(r) + '</option>';
      });
    }
    const clsRes = await window.TIS.listClasses();
    if (clsRes.ok && clsRes.data) {
      const oldSel = $('promoteOldClass');
      const newSel = $('promoteNewClass');
      if (oldSel) {
        oldSel.innerHTML = '<option value="">-- All --</option>';
        clsRes.data.forEach(c => { oldSel.innerHTML += '<option value="' + escAttr(c.name) + '">' + esc(c.name) + '</option>'; });
      }
      if (newSel) {
        newSel.innerHTML = '<option value="">-- Auto --</option>';
        clsRes.data.forEach(c => { newSel.innerHTML += '<option value="' + escAttr(c.name) + '">' + esc(c.name) + '</option>'; });
      }
    }
  }

  async function loadArchives() {
    setHTML('archivesList', pageLoaderHTML('Loading archives...'));
    const r = await window.TIS.listTerms();
    if (!r.ok) { setHTML('archivesList', emptyHTML('fa-box-archive', 'No archives yet')); return; }
    const archived = (r.data || []).filter(t => !t.is_active);
    if (archived.length === 0) {
      setHTML('archivesList', emptyHTML('fa-box-archive', 'No archived terms yet'));
      return;
    }
    let html = '';
    archived.forEach(a => {
      html += '<div class="term-card"><div><strong>' + esc(a.label) + '</strong></div>' +
        '<div style="font-size:11px;color:#666;">' + (a.start_date ? fmtDate(a.start_date) + ' → ' + fmtDate(a.end_date) : '') + '</div></div>';
    });
    setHTML('archivesList', html);
  }

  function initTermsWiring() {
    const btnArchive = $('btnArchiveOnly');
    if (btnArchive) btnArchive.addEventListener('click', () => showToast('Archiving is handled by the API in the next release', 'info'));
    const btnPreview = $('btnPreviewPromotion');
    if (btnPreview) btnPreview.addEventListener('click', () => showToast('Preview coming with the API layer', 'info'));
    const btnFull = $('btnFullTransition');
    if (btnFull) btnFull.addEventListener('click', () => showToast('Full transition coming with the API layer', 'info'));
    const btnExit = $('btnExitStudent');
    if (btnExit) btnExit.addEventListener('click', () => showToast('Exit is handled by the API in the next release', 'info'));
  }

  // ================================================================
  // [SECTION 10] LEARNER ATTENDANCE
  // ================================================================
  async function initLearnerAttendanceTab() {
    await populateAttendanceClasses();
    const btn = $('btnLoadAttendance');
    if (btn) btn.addEventListener('click', loadAttendanceTerm);
    const gen = $('btnGenerateAttendance');
    if (gen) gen.addEventListener('click', () => showToast('Generate is handled by the API in the next release', 'info'));
    const pr = $('btnPrintAttendance');
    if (pr) pr.addEventListener('click', printAttendance);

    const analysis = $('analysisFrame');
    if (analysis) {
      analysis.querySelector('.expandable-header').addEventListener('click', () => toggleExpandable('analysisFrame'));
    }
    const sig = $('signatureFrame');
    if (sig) {
      sig.querySelector('.expandable-header').addEventListener('click', () => toggleExpandable('signatureFrame'));
    }
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
    setText('attendanceFeedback', 'Loading...');
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

    if (learnersInClass.length === 0) {
      setHTML('attendanceTermView', emptyHTML('fa-user-slash', 'No learners in ' + clsName));
      setText('attendanceFeedback', '0 learners');
      return;
    }

    const byDate = {};
    rows.forEach(m => {
      if (!byDate[m.attendance_date]) byDate[m.attendance_date] = {};
      byDate[m.attendance_date][m.learner_id] = m.mark;
    });

    setText('attendanceFeedback', learnersInClass.length + ' learners • ' + termRow.label);
    renderAttendanceView(clsName, termRow.label, learnersInClass, byDate);
  }

  function renderAttendanceView(clsName, termLabel, learners, byDate) {
    const dates = Object.keys(byDate).sort();
    let html = '<div class="card-bg" style="overflow-x:auto;">';
    html += '<table class="attendance-table"><thead><tr>';
    html += '<th>PIN</th><th>Name</th>';
    dates.forEach(d => { html += '<th class="day-header">' + esc(d) + '</th>'; });
    html += '</tr></thead><tbody>';
    learners.forEach(l => {
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

  function printAttendance() {
    showToast('Print is handled by the API in the next release', 'info');
  }

  // ================================================================
  // END OF PART 2 OF 4
  // ================================================================
 
  // ================================================================
  // [SECTION 11] STAFF ATTENDANCE
  // ================================================================
  async function initStaffAttendanceTab() {
    const r1 = $('btnRefreshStaffAtt');
    if (r1) r1.addEventListener('click', refreshStaffAttendance);
    const r2 = $('btnManualStaffEntry');
    if (r2) r2.addEventListener('click', openManualStaffEntryModal);
    const r3 = $('btnViewArchivedMonths');
    if (r3) r3.addEventListener('click', loadArchives);
    const r4 = $('btnRunStaffArchive');
    if (r4) r4.addEventListener('click', runStaffArchive);

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

    if (!r.ok) { setHTML('staffAttList', errorHTML('Could not load attendance', r.error)); return; }
    if (!staffRes.ok) { setHTML('staffAttList', errorHTML('Could not load staff', staffRes.error)); return; }

    const todayRows = r.data || [];
    const staff = (staffRes.data || []).filter(s => s.status === 'Active');
    const map = {};
    todayRows.forEach(row => { map[row.staff_id] = row; });

    let present = 0, late = 0, out = 0, notMarked = 0;
    let html = '';
    staff.forEach(s => {
      const row = map[s.id];
      let stateLabel = 'Not Marked';
      let badgeClass = '';
      let state = 'NOT_MARKED';
      if (row) {
        if (row.status === 'Late') { stateLabel = 'Late'; badgeClass = 'late'; state = 'CLOCKED_IN'; late++; present++; }
        else if (row.status === 'HalfDay') { stateLabel = 'Half Day'; badgeClass = 'late'; state = 'CLOCKED_IN'; present++; }
        else if (row.clock_out) { stateLabel = 'Clocked Out'; badgeClass = 'out'; state = 'CLOCKED_OUT'; out++; present++; }
        else { stateLabel = 'Present'; badgeClass = 'present'; state = 'CLOCKED_IN'; present++; }
      } else {
        notMarked++;
      }
      html += '<div class="staff-card state-' + state + '">' +
        '<div class="sc-info">' +
        '<div class="sc-name">' + esc(s.full_name) + '</div>' +
        '<div class="sc-detail">' + esc(s.department || '') + ' • ID: ' + esc(s.staff_id) + '</div>' +
        '<div class="sc-detail">In: ' + esc(row && row.clock_in ? row.clock_in : '—') +
        ' • Out: ' + esc(row && row.clock_out ? row.clock_out : '—') +
        ' • Resume: ' + esc(s.resume_time || '07:00') +
        ' Close: ' + esc(s.close_time || '16:30') + '</div>' +
        '</div>' +
        '<div class="sc-badge ' + badgeClass + '">' + esc(stateLabel) + '</div>' +
        '</div>';
    });
    setHTML('staffAttList', html || emptyHTML('fa-user-clock', 'No staff records'));

    setHTML('staffAttStats',
      '<div class="stat-card"><div class="stat-label">Present</div><div class="stat-value green">' + present + '</div></div>' +
      '<div class="stat-card red"><div class="stat-label">Late</div><div class="stat-value red">' + late + '</div></div>' +
      '<div class="stat-card gold"><div class="stat-label">Clocked Out</div><div class="stat-value gold">' + out + '</div></div>' +
      '<div class="stat-card blue"><div class="stat-label">Not Marked</div><div class="stat-value" style="color:#1a5276;">' + notMarked + '</div></div>');
  }

  async function loadMovementLogToday() {
    setHTML('movementLogList', pageLoaderHTML('Loading movements...'));
    const r = await window.TIS.listMovementsToday(todayISO());
    if (!r.ok || !r.data || r.data.length === 0) {
      setHTML('movementLogList', emptyHTML('fa-route', 'No movements today'));
      return;
    }
    const byStaff = {};
    r.data.forEach(m => {
      const sid = m.staff_id || '';
      if (!sid) return;
      if (!byStaff[sid]) byStaff[sid] = [];
      byStaff[sid].push(m);
    });
    const staffRes = await window.TIS.listStaff();
    const staffMap = {};
    if (staffRes.ok) (staffRes.data || []).forEach(s => { staffMap[s.id] = s; });

    const pairs = [];
    Object.keys(byStaff).forEach(sid => {
      const events = byStaff[sid].slice().sort((a, b) => (a.time_out || '').localeCompare(b.time_out || ''));
      let pendingOut = null;
      events.forEach(ev => {
        const type = (ev.type || '').toUpperCase();
        if (type === 'OUT') {
          if (pendingOut) {
            pairs.push({ staffName: staffMap[sid] ? staffMap[sid].full_name : '', destination: pendingOut.destination,
              timeOut: pendingOut.time_out, timeIn: '', date: pendingOut.movement_date, purpose: pendingOut.purpose, duration: '—' });
          }
          pendingOut = ev;
        } else if (type === 'IN') {
          if (pendingOut) {
            pairs.push({ staffName: staffMap[sid] ? staffMap[sid].full_name : '', destination: pendingOut.destination,
              timeOut: pendingOut.time_out, timeIn: ev.time_in, date: pendingOut.movement_date,
              purpose: pendingOut.purpose, duration: (ev.duration_minutes || 0) + ' min' });
            pendingOut = null;
          }
        }
      });
      if (pendingOut) {
        pairs.push({ staffName: staffMap[sid] ? staffMap[sid].full_name : '', destination: pendingOut.destination,
          timeOut: pendingOut.time_out, timeIn: 'Still out', date: pendingOut.movement_date,
          purpose: pendingOut.purpose, duration: '—' });
      }
    });

    let html = '<div style="overflow-x:auto;"><table class="attendance-table"><thead><tr>';
    html += '<th>Staff</th><th>Destination</th><th>Time Out</th><th>Time In</th><th>Date</th><th>Purpose</th><th>Duration</th>';
    html += '</tr></thead><tbody>';
    pairs.forEach(p => {
      html += '<tr>' +
        '<td class="name-cell">' + esc(p.staffName) + '</td>' +
        '<td>' + esc(p.destination) + '</td>' +
        '<td style="background:#f8d7da;color:#721c24;font-weight:600;">' + esc(p.timeOut) + '</td>' +
        '<td style="background:#d4edda;color:#155724;font-weight:600;">' + esc(p.timeIn) + '</td>' +
        '<td>' + esc(p.date) + '</td>' +
        '<td>' + esc(p.purpose) + '</td>' +
        '<td>' + esc(p.duration) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('movementLogList', html);
  }

  async function loadStaffMonthlyCurrent() {
    setHTML('staffMonthlyView', pageLoaderHTML('Loading monthly view...'));
    const now = new Date();
    const r = await window.TIS.listStaffAttendanceForMonth(now.getFullYear(), now.getMonth() + 1);
    if (!r.ok || !r.data || r.data.length === 0) {
      setHTML('staffMonthlyView', emptyHTML('fa-calendar-day', 'No records this month'));
      return;
    }
    const byDate = {};
    r.data.forEach(row => {
      const d = row.attendance_date;
      if (!d) return;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(row);
    });
    const dates = Object.keys(byDate).sort().reverse();
    const staffRes = await window.TIS.listStaff();
    const staffMap = {};
    if (staffRes.ok) (staffRes.data || []).forEach(s => { staffMap[s.id] = s; });

    let html = '<div style="margin-bottom:12px;font-size:13px;font-weight:700;color:var(--blue-primary);">' +
               esc(now.toLocaleString('en-GB', { month: 'long' }).toUpperCase()) + ' ' + now.getFullYear() +
               ' — ' + dates.length + ' day(s) recorded</div>';

    dates.forEach(d => {
      const dayRows = byDate[d];
      const dayDate = new Date(d + 'T00:00:00');
      const dayName = dayDate.toLocaleDateString('en-GB', { weekday: 'long' });
      const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
      const isToday = d === todayISO();
      let headerClass = 'monthly-day-header';
      if (isToday) headerClass += ' today';
      else if (isWeekend) headerClass += ' weekend';

      html += '<div class="monthly-day-table">' +
        '<div class="' + headerClass + '">' +
        '<div class="day-title">' + esc(dayName.toUpperCase()) + '</div>' +
        '<div class="day-date">' + esc(d) + (isToday ? ' — TODAY' : '') + '</div>' +
        '</div>' +
        '<table class="monthly-table"><thead><tr>' +
        '<th>Staff</th><th>Clock In</th><th>Clock Out</th><th>Status</th><th>Remarks</th>' +
        '</tr></thead><tbody>';
      dayRows.forEach(row => {
        const staff = staffMap[row.staff_id] || {};
        const status = row.status || 'Present';
        let remarks = '<span style="color:#27ae60;font-weight:700;">Present</span>';
        if (status === 'Late') remarks = '<span class="late-note">LATE</span>';
        else if (status === 'HalfDay') remarks = '<span class="halfday-note">HALF DAY</span>';
        else if (status === 'Absent') remarks = '<span style="color:#856404;font-weight:700;">ABSENT</span>';
        html += '<tr>' +
          '<td><strong>' + esc(staff.full_name || '') + '</strong> <span style="font-size:10px;color:#8899bb;">' + esc(staff.staff_id || '') + '</span></td>' +
          '<td>' + esc(row.clock_in || '—') + '</td>' +
          '<td>' + esc(row.clock_out || '—') + '</td>' +
          '<td>' + esc(status) + '</td>' +
          '<td>' + remarks + '</td>' +
          '</tr>';
      });
      html += '</tbody></table></div>';
    });
    setHTML('staffMonthlyView', html);
  }

  function openManualStaffEntryModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" style="max-width:520px;" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Staff Entry</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Staff ID</label><input id="se_staffId" placeholder="e.g. TIS2629"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Action</label><select id="se_action">' +
      '<option value="in">Clock In</option><option value="out">Clock Out</option>' +
      '<option value="mout">Movement Out</option><option value="min">Movement In</option>' +
      '</select></div></div>' +
      '<div class="form-row" id="se_destRow" style="display:none;">' +
      '<div class="form-group"><label>Destination</label><input id="se_destination"></div>' +
      '<div class="form-group"><label>Purpose</label><input id="se_purpose"></div></div>' +
      '<div style="text-align:right;margin-top:16px;"><button class="btn btn-success" id="se_submit" type="button">Submit</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    $('se_action').addEventListener('change', function () {
      $('se_destRow').style.display = this.value === 'mout' ? 'flex' : 'none';
    });
    $('se_submit').addEventListener('click', submitManualStaffEntry);
  }

  async function submitManualStaffEntry() {
    const staffId = $('se_staffId').value.trim();
    const action = $('se_action').value;
    if (!staffId) { showToast('Enter a staff ID', 'warning'); return; }

    const staffRes = await window.TIS.listStaff();
    if (!staffRes.ok) { showToast('Could not load staff', 'error'); return; }
    const staff = (staffRes.data || []).find(s => s.staff_id === staffId);
    if (!staff) { showToast('Staff not found: ' + staffId, 'error'); return; }

    if (action === 'in') {
      const now = new Date();
      const clockIn = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const status = 'Present';
      startLoader();
      const r = await window.TIS.upsertStaffAttendance({
        staff_id: staff.id,
        attendance_date: todayISO(),
        clock_in: clockIn,
        status: status,
        logged_by: State.profile ? State.profile.name : 'Portal'
      });
      stopLoader();
      if (!r.ok) { showToast(r.error || 'Could not clock in', 'error'); return; }
      showToast('Clocked in at ' + clockIn, 'success');
    } else if (action === 'out') {
      const now = new Date();
      const clockOut = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      startLoader();
      const r = await window.TIS.upsertStaffAttendance({
        staff_id: staff.id,
        attendance_date: todayISO(),
        clock_out: clockOut,
        status: 'Present',
        logged_by: State.profile ? State.profile.name : 'Portal'
      });
      stopLoader();
      if (!r.ok) { showToast(r.error || 'Could not clock out', 'error'); return; }
      showToast('Clocked out at ' + clockOut, 'success');
    } else if (action === 'mout') {
      const dest = $('se_destination').value.trim();
      const purpose = $('se_purpose').value.trim();
      if (!dest || !purpose) { showToast('Destination and purpose required', 'warning'); return; }
      const now = new Date();
      const timeOut = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const movementId = 'MOV' + Date.now();
      startLoader();
      const r = await window.TIS.createMovement({
        staff_id: staff.id,
        movement_date: todayISO(),
        movement_id: movementId,
        type: 'OUT',
        time_out: timeOut,
        destination: dest,
        purpose: purpose,
        logged_by: State.profile ? State.profile.name : 'Portal'
      });
      stopLoader();
      if (!r.ok) { showToast(r.error || 'Could not record movement', 'error'); return; }
      showToast('Movement out recorded', 'success');
    } else if (action === 'min') {
      const now = new Date();
      const timeIn = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const movementId = 'MOV' + Date.now();
      startLoader();
      const r = await window.TIS.createMovement({
        staff_id: staff.id,
        movement_date: todayISO(),
        movement_id: movementId,
        type: 'IN',
        time_in: timeIn,
        logged_by: State.profile ? State.profile.name : 'Portal'
      });
      stopLoader();
      if (!r.ok) { showToast(r.error || 'Could not record movement in', 'error'); return; }
      showToast('Movement in recorded', 'success');
    }

    closeModal();
    refreshStaffAttendance();
  }

  async function loadArchiveList() {
    setHTML('archiveList', pageLoaderHTML('Loading archives...'));
    // Uses staff_monthly_summary for the current month as a preview
    const now = new Date();
    const r = await window.TIS.staffMonthlySummary(now.getFullYear(), now.getMonth() + 1);
    if (!r.ok || !r.data || r.data.length === 0) {
      setHTML('archiveList', emptyHTML('fa-history', 'No archived months yet'));
      return;
    }
    let html = '<div style="overflow-x:auto;"><table class="attendance-table"><thead><tr>';
    html += '<th>Staff</th><th>Department</th><th>Present</th><th>Late</th><th>Movements</th><th>Late Minutes</th>';
    html += '</tr></thead><tbody>';
    r.data.forEach(row => {
      html += '<tr>' +
        '<td><strong>' + esc(row.staff_name || '') + '</strong> <span style="font-size:10px;color:#8899bb;">' + esc(row.staff_id || '') + '</span></td>' +
        '<td>' + esc(row.department || '') + '</td>' +
        '<td>' + (row.total_days_present || 0) + '</td>' +
        '<td>' + (row.total_days_late || 0) + '</td>' +
        '<td>' + (row.total_movements || 0) + '</td>' +
        '<td>' + (row.total_late_minutes || 0) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('archiveList', html);
  }

  async function runStaffArchive() {
    showToast('Archive is handled by the API in the next release', 'info');
  }

  // ================================================================
  // [SECTION 12] CALENDAR
  // ================================================================
  async function loadCalendar() {
    setHTML('calendarContent', pageLoaderHTML('Loading calendar...'));
    startLoader();
    const r = await window.TIS.listCalendar();
    stopLoader();
    if (!r.ok) { setHTML('calendarContent', errorHTML('Could not load calendar', r.error)); return; }
    const events = r.data || [];
    if (events.length === 0) {
      setHTML('calendarContent', emptyHTML('fa-calendar', 'No calendar events yet', 'Upload one from the Calendar Import tab.'));
      return;
    }
    let html = '<div class="card-bg"><h4>' + events.length + ' events</h4><div style="overflow-x:auto;"><table class="attendance-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Holiday</th></tr></thead><tbody>';
    events.forEach(e => {
      html += '<tr>' +
        '<td>' + esc(e.event_date) + '</td>' +
        '<td>' + esc(e.event_type) + '</td>' +
        '<td class="name-cell">' + esc(e.description) + '</td>' +
        '<td>' + (e.is_holiday ? 'Yes' : 'No') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div></div>';
    setHTML('calendarContent', html);
  }

  function initCalendarTab() {
    const btn = $('btnLoadCalendar');
    if (btn) btn.addEventListener('click', loadCalendar);
  }

  // ================================================================
  // [SECTION 13] CALENDAR IMPORT
  // ================================================================
  async function loadCalendarImportHistory() {
    setHTML('ci_history', pageLoaderHTML('Loading history...'));
    const r = await window.TIS.listCalendarImports();
    if (!r.ok || !r.data || r.data.length === 0) {
      setHTML('ci_history', emptyHTML('fa-file-import', 'No imports yet'));
      return;
    }
    let html = '<div style="overflow-x:auto;"><table class="attendance-table"><thead><tr>';
    html += '<th>Import ID</th><th>Filename</th><th>Session</th><th>Uploaded</th><th>Status</th><th>Rows</th>';
    html += '</tr></thead><tbody>';
    r.data.forEach(imp => {
      html += '<tr>' +
        '<td style="font-size:10px;">' + esc(imp.import_id) + '</td>' +
        '<td>' + esc(imp.filename) + '</td>' +
        '<td>' + esc(imp.session) + '</td>' +
        '<td style="font-size:10px;">' + esc((imp.uploaded_at || '').substring(0, 19)) + '</td>' +
        '<td>' + esc(imp.status) + '</td>' +
        '<td>' + (imp.parsed_rows || 0) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('ci_history', html);
  }

  function initCalendarImportTab() {
    const zone = $('ci_uploadZone');
    const fileInput = $('ci_file');
    if (zone && fileInput) {
      zone.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', handleCalendarFileSelect);
    }
    const r1 = $('btnImportFromDrive');
    if (r1) r1.addEventListener('click', () => showToast('Drive import coming with the API layer', 'info'));
    const r2 = $('btnCommitReviewed');
    if (r2) r2.addEventListener('click', () => showToast('Commit coming with the API layer', 'info'));
    const r3 = $('btnCommitAll');
    if (r3) r3.addEventListener('click', () => showToast('Commit coming with the API layer', 'info'));
    const r4 = $('btnDiscardImport');
    if (r4) r4.addEventListener('click', () => showToast('Discard coming with the API layer', 'info'));
  }

  async function handleCalendarFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('File too large (max 5 MB)', 'warning'); return; }
    showToast('File selected: ' + file.name + ' — parsing will be available in the next release', 'info');
  }

  // ================================================================
  // END OF PART 3 OF 4
  // ================================================================
 
  // ================================================================
  // [SECTION 14] QR CODE
  // ================================================================
  async function loadActiveQR() {
    setHTML('qrContent', pageLoaderHTML('Loading QR code...'));
    const r = await window.TIS.getSetting('qr_active_token');
    if (!r.ok || !r.data) {
      setHTML('qrContent', emptyHTML('fa-qrcode', 'No active QR code', 'Generate one to let staff clock in.'));
      return;
    }
    let token = r.data;
    let generated = '';
    const r2 = await window.TIS.getSetting('qr_generated_at');
    if (r2.ok && r2.data) generated = r2.data;
    renderQR(token, generated);
  }

  function renderQR(token, generated) {
    const appUrl = window.location.origin + window.location.pathname;
    const payload = appUrl + '?qrtoken=' + encodeURIComponent(token);
    const url = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(payload);

    let html = '<div class="card-bg qr-box" oncontextmenu="return false;">';
    html += '<img src="' + esc(url) + '" alt="QR code for staff clock-in" draggable="false">';
    html += '<p style="font-size:11px;margin-top:10px;">Token: <code>' + esc(token) + '</code></p>';
    if (generated) html += '<p style="font-size:11px;">Generated: ' + esc(generated) + '</p>';
    html += '<p style="font-size:11px;color:#666;">Print, laminate, and post it where staff arrive.</p>';
    html += '<div style="margin-top:12px;"><a href="' + esc(url) + '" target="_blank" class="btn btn-primary"><i class="fas fa-download"></i> Download</a> ';
    html += '<button class="btn btn-secondary" id="qr_copyBtn" type="button"><i class="fas fa-copy"></i> Copy token</button></div></div>';
    setHTML('qrContent', html);
    const cp = $('qr_copyBtn');
    if (cp) cp.addEventListener('click', () => copyToken(token));
  }

  async function copyToken(token) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(token);
        showToast('Token copied', 'success');
      } catch (e) {
        showToast('Copy manually: ' + token, 'info');
      }
    } else {
      showToast('Copy manually: ' + token, 'info');
    }
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
    renderQR(token, new Date().toISOString());
  }

  function initQRTab() {
    const r1 = $('btnGenerateQR');
    if (r1) r1.addEventListener('click', generateQR);
    const r2 = $('btnShowActiveQR');
    if (r2) r2.addEventListener('click', loadActiveQR);
  }

  // ================================================================
  // [SECTION 15] REPORTS
  // ================================================================
  function initReportsTab() {
    const btn = $('btnGenerateReport');
    if (btn) btn.addEventListener('click', generateReport);
  }

  function generateReport() {
    const from = $('reportFrom').value;
    const to = $('reportTo').value;
    if (!from || !to) { showToast('Choose both dates', 'warning'); return; }
    showToast('PDF generation will be handled by the Apps Script bridge in the next release', 'info');
    setText('reportFeedback', 'PDF export will be wired to the Apps Script bridge.');
  }

  // ================================================================
  // [SECTION 16] CLASSES
  // ================================================================
  async function loadClasses() {
    setHTML('classesContent', pageLoaderHTML('Loading classes...'));
    const r = await window.TIS.listClasses();
    if (!r.ok) { setHTML('classesContent', errorHTML('Could not load classes', r.error)); return; }
    State.cachedClasses = r.data || [];
    if (State.cachedClasses.length === 0) {
      setHTML('classesContent', emptyHTML('fa-layer-group', 'No classes yet', 'Click Seed Defaults to create the starting list.'));
      return;
    }
    let html = '<div class="card-bg" style="overflow-x:auto;"><table class="users-table"><thead><tr>';
    html += '<th>Class</th><th>Level</th><th>Stream</th><th>Next Class</th><th>Status</th>';
    if (hasPermission('write_classes')) html += '<th style="text-align:right;">Actions</th>';
    html += '</tr></thead><tbody>';
    State.cachedClasses.forEach(c => {
      html += '<tr>' +
        '<td><strong>' + esc(c.name) + '</strong></td>' +
        '<td>' + esc(c.level || '—') + '</td>' +
        '<td>' + esc(c.stream || '—') + '</td>' +
        '<td>' + esc(c.next_class || '—') + '</td>' +
        '<td>' + (c.is_active ? '<span style="color:#27ae60;font-weight:600;">Active</span>' : '<span style="color:#c0392b;font-weight:600;">Retired</span>') + '</td>';
      if (hasPermission('write_classes')) {
        html += '<td style="text-align:right;">' +
          '<button class="btn btn-sm btn-danger" data-retire="' + escAttr(c.id) + '" type="button"><i class="fas fa-eye-slash"></i></button>' +
          '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('classesContent', html);
    document.querySelectorAll('#classesContent [data-retire]').forEach(btn => {
      btn.addEventListener('click', () => toggleClassActive(btn.dataset.retire));
    });
  }

  async function toggleClassActive(id) {
    const c = State.cachedClasses.find(x => x.id === id);
    if (!c) return;
    if (!confirm((c.is_active ? 'Retire "' : 'Reactivate "') + c.name + '"?')) return;
    startLoader();
    const r = await window.TIS.updateClass(id, { is_active: !c.is_active });
    stopLoader();
    if (!r.ok) { showToast(r.error || 'Could not update', 'error'); return; }
    showToast('Class updated', 'success');
    loadClasses();
  }

  function initClassesTab() {
    const r1 = $('btnRefreshClasses');
    if (r1) r1.addEventListener('click', loadClasses);
    const r2 = $('btnAddClass');
    if (r2) r2.addEventListener('click', openAddClassModal);
    const r3 = $('btnSeedDefaultClasses');
    if (r3) r3.addEventListener('click', seedDefaultClasses);
    const r4 = $('btnShowRetiredClasses');
    if (r4) r4.addEventListener('click', () => showToast('Retired-class filter coming soon', 'info'));
  }

  function openAddClassModal() {
    const html = '<div class="modal-overlay" onclick="if(event.target===this)TIS.closeModal()">' +
      '<div class="modal-box" onclick="event.stopPropagation()">' +
      '<div class="modal-header"><h2>Add Class</h2><button class="close-btn" onclick="TIS.closeModal()">&times;</button></div>' +
      '<div class="form-row"><div class="form-group"><label>Class Name</label><input id="ac_name" placeholder="e.g. SS 2 TECHNICAL"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Level</label><input id="ac_level" placeholder="e.g. SS 2"></div>' +
      '<div class="form-group"><label>Stream</label><input id="ac_stream" placeholder="e.g. TECHNICAL"></div></div>' +
      '<div class="form-row"><div class="form-group"><label>Next Class (optional)</label><input id="ac_next" placeholder="e.g. SS 3 TECHNICAL"></div></div>' +
      '<div style="text-align:right;"><button class="btn btn-success" id="ac_submit" type="button">Create class</button></div>' +
      '</div></div>';
    setHTML('modalContainer', html);
    $('ac_submit').addEventListener('click', async () => {
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
    if (!confirm('Seed default classes (Creche → SS 3 streams)? Existing classes are not touched.')) return;
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
  // [SECTION 17] USERS
  // ================================================================
  async function loadUsers() {
    setHTML('usersContent', pageLoaderHTML('Loading users...'));
    const r = await window.TIS.listUsers();
    if (!r.ok) { setHTML('usersContent', errorHTML('Could not load users', r.error)); return; }
    const users = r.data || [];
    if (users.length === 0) { setHTML('usersContent', emptyHTML('fa-user-cog', 'No users found')); return; }
    let html = '<div class="card-bg" style="font-size:12px;"><strong>' + users.length + '</strong> user(s)</div>';
    html += '<div class="card-bg" style="overflow-x:auto;"><table class="users-table"><thead><tr>';
    html += '<th>ID</th><th>Name</th><th>Role</th><th>Position</th><th>Status</th>';
    html += '</tr></thead><tbody>';
    users.forEach(u => {
      const avatar = u.avatar_url ? '<img class="u-avatar" src="' + esc(u.avatar_url) + '">' : '';
      html += '<tr>' +
        '<td><strong>' + esc(u.operator_id) + '</strong></td>' +
        '<td>' + avatar + esc(u.name) + '</td>' +
        '<td>' + esc(u.role) + '</td>' +
        '<td>' + esc(u.position || '—') + '</td>' +
        '<td><span class="u-active' + (u.is_active ? '' : ' off') + '"><span class="dot"></span>' + (u.is_active ? 'Active' : 'Inactive') + '</span></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    setHTML('usersContent', html);
  }

  function initUsersTab() {
    const r1 = $('btnRefreshUsers');
    if (r1) r1.addEventListener('click', loadUsers);
  }

  // ================================================================
  // [SECTION 18] BIRTHDAYS
  // ================================================================
  function startBirthdayWatcher() {
    if (State.birthdayInterval) clearInterval(State.birthdayInterval);
    setTimeout(checkBirthdays, 2500);
    State.birthdayInterval = setInterval(checkBirthdays, 30 * 60 * 1000);
  }

  async function checkBirthdays() {
    if (!State.profile) return;
    if (document.querySelector('.birthday-overlay')) return;
    // Birthdays are computed from learners + staff DOB, handled later
    // in a dedicated RPC. For now, this is a placeholder that keeps
    // the interval from firing errors.
  }

  function closeBirthdayOverlay() {
    const el = document.querySelector('.birthday-overlay');
    if (el) el.remove();
  }

  // ================================================================
  // [SECTION 19] BROADSHEET — placeholder wiring
  // ================================================================
  function initBroadSheetTab() {
    const r1 = $('btnLoadBroadSheet');
    if (r1) r1.addEventListener('click', () => showToast('Broad sheet data coming with the API layer', 'info'));
    const r2 = $('btnPopulateBroadSheet');
    if (r2) r2.addEventListener('click', () => showToast('Populate coming with the API layer', 'info'));
  }

  // ================================================================
  // [SECTION 20] INIT — wire everything, then boot
  // ================================================================
  function wireEventListeners() {
    // Login
    const loginBtn = $('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', doLogin);
    const pw = $('loginPassword');
    if (pw) pw.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });
    const idIn = $('loginId');
    if (idIn) idIn.addEventListener('keypress', e => { if (e.key === 'Enter') doLogin(); });

    const eye = $('togglePwBtn');
    if (eye) eye.addEventListener('click', () => {
      const p = $('loginPassword');
      if (!p) return;
      p.type = p.type === 'password' ? 'text' : 'password';
    });

    // Banner buttons
    const chp = $('btnChangePassword');
    if (chp) chp.addEventListener('click', openChangePasswordModal);
    const lo = $('btnLogout');
    if (lo) lo.addEventListener('click', doLogout);

    // Nav
    document.querySelectorAll('.nav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Module-specific wiring
    initLearnersTab();
    initStaffTab();
    initTermsWiring();
    initCalendarTab();
    initCalendarImportTab();
    initQRTab();
    initReportsTab();
    initClassesTab();
    initUsersTab();
  }

  function boot() {
    wireEventListeners();
    showLoginScreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // ================================================================
  // [SECTION 21] PUBLIC API — inline handlers in the HTML
  // ================================================================
  window.TIS = window.TIS || {};
  window.TIS.closeModal = closeModal;
  window.TIS.switchTab = switchTab;
  window.TIS.login = doLogin;
  window.TIS.logout = doLogout;
  window.TIS.changePassword = openChangePasswordModal;
  window.TIS.toggleExpandable = toggleExpandable;
  window.TIS.closeBirthdayOverlay = closeBirthdayOverlay;

  // ================================================================
  // END OF PART 4 OF 4
  // END OF APP.JS
  // ================================================================
})();
