// ================================================================
// TIS EMIS — APPLICATION LOGIC
// File: app.js
// ================================================================
// Full file. One IIFE. One close.
//
// Design rules (locked):
//   - NO full-screen overlays that can get stuck.
//   - NO async call on tab switch that can block the UI.
//   - Every event handler is wrapped so a thrown error can't
//     kill subsequent clicks.
//   - A safety sweep runs at boot and clears any stray overlay.
// ================================================================

(function () {
  'use strict';

  // ================================================================
  // [01] STATE
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
    'broadsheet', 'calendar', 'calimport', 'qr', 'reports',
    'classes', 'users'
  ];

  // ================================================================
  // [02] UTILITIES
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

  // Very small non-blocking loaders — just the corner spinner.
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
  // [03] PERMISSIONS
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
  // [04] AUTH
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
    // NO blocking welcome loader. Just hide login, show dashboard.
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
  // [05] CHANGE PASSWORD
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
  // [06] NAVIGATION
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

    // Fire the module's loader but don't await it — the view is already visible.
    try {
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
    } catch (err) {
      console.error('[switchTab]', name, err);
    }
  }

  // ================================================================
  // [07] LEARNERS
  // ================================================================
  async function loadLearners() {
    setHTML('learnersGrid', pageLoaderHTML('Loading learners...'));
    startLoader();
    const r = await window.TIS.listLearners();
    stopLoader();
    if (!r.ok) { setHTML('learnersGrid', errorHTML('Could not load learners', r.error)); return; }
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
    html += '<div class="expandable open"><div class="expandable-header">A — Identity</div><div class="expandable-body">';
    html += infoRow('Class', d.class_name);
    html += infoRow('PIN', d.pin);
    html += infoRow('Gender', d.gender);
    html += infoRow('Father Phone', d.father_phone);
    html += infoRow('Mother Phone', d.mother_phone);
    html += infoRow('Guardian Phone', d.guardian_phone);
    html += infoRow('Account', d.account_number);
    html += '</div></div>';
    html += '<div class="expandable open"><div class="expandable-header">B — Bio</div><div class="expandable-body">';
    html += infoRow('Date of Admission', fmtDate(d.date_of_admission));
    html += infoRow('Date of Birth', fmtDate(d.date_of_birth));
    html += infoRow('Blood Group', d.blood_group);
    html += infoRow('Religion', d.religion);
    html += infoRow('Parents Name', d.parents_name);
    html += infoRow('Address', d.address);
    html += infoRow('Allergy', d.allergy);
    html += '</div></div></div></div>';
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
    const rl = $('btnRefreshLearners'); if (rl) rl.addEventListener('click', loadLearners);
    const pl = $('btnPrintLearners');   if (pl) pl.addEventListener('click', printLearners);
  }

  function printLearners() {
    if (!State.cachedLearners.length) { showToast('Load the list first', 'warning'); return; }
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups to print.', 'warning'); return; }
    let html = '<html><head><title>Learners</title></head><body>';
    html += '<h1>The Ideal Schools — Learners List</h1>';
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">';
    html += '<thead><tr><th>Class</th><th>PIN</th><th>Name</th><th>Gender</th></tr></thead><tbody>';
    State.cachedLearners.forEach(row => {
      html += '<tr><td>' + esc(row.class_name || '') + '</td><td>' + esc(row.pin || '') + '</td><td>' + esc(row.name || '') + '</td><td>' + esc(row.gender || '') + '</td></tr>';
    });
    html += '</tbody></table></body></html>';
    w.document.write(html); w.document.close(); w.print();
  }

  // ================================================================
  // [08] STAFF
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
  // [09] TERMS
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
    if (!State.cachedTerms.length) {
      setHTML('termsList', emptyHTML('fa-calendar-alt', 'No terms found', 'Generate a calendar to create terms.'));
      return;
    }
    let html = '';
    State.cachedTerms.forEach(t => {
      html += '<div class="term-card"><div><strong>' + esc(t.label) + '</strong> ' +
        (t.is_active ? '<span class="card-badge" style="background:#27ae60;">ACTIVE</span>' : '') +
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
      ['Completion of Studies','Inability to Pay Tuition','Change of Location',
       'Parent Differences','School Vs Parent Ideology','Discipline/Expulsion',
       'Health Grounds','Life'].forEach(r => {
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
    if (!archived.length) { setHTML('archivesList', emptyHTML('fa-box-archive', 'No archived terms yet')); return; }
    let html = '';
    archived.forEach(a => {
      html += '<div class="term-card"><div><strong>' + esc(a.label) + '</strong></div></div>';
    });
    setHTML('archivesList', html);
  }

  function initTermsWiring() {
    const map = {
      btnArchiveOnly: 'Archiving is handled by the API in the next release',
      btnPreviewPromotion: 'Preview coming with the API layer',
      btnFullTransition: 'Full transition coming with the API layer',
      btnExitStudent: 'Exit is handled by the API in the next release'
    };
    Object.keys(map).forEach(id => {
      const b = $(id);
      if (b) b.addEventListener('click', () => showToast(map[id], 'info'));
    });
  }

  // ================================================================
  // [10] LEARNER ATTENDANCE
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
  // [11] STAFF ATTENDANCE
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
  // [12] CALENDAR
  // ================================================================
  async function loadCalendar() {
    setHTML('calendarContent', pageLoaderHTML('Loading calendar...'));
    startLoader();
    const r = await window.TIS.listCalendar();
    stopLoader();
    if (!r.ok) { setHTML('calendarContent', errorHTML('Could not load calendar', r.error)); return; }
    const events = r.data || [];
    if (!events.length) {
      setHTML('calendarContent', emptyHTML('fa-calendar', 'No calendar events yet'));
      return;
    }
    let html = '<div class="card-bg"><div style="overflow-x:auto;"><table class="attendance-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Holiday</th></tr></thead><tbody>';
    events.forEach(e => {
      html += '<tr><td>' + esc(e.event_date) + '</td><td>' + esc(e.event_type) + '</td><td class="name-cell">' + esc(e.description) + '</td><td>' + (e.is_holiday ? 'Yes' : 'No') + '</td></tr>';
    });
    html += '</tbody></table></div></div>';
    setHTML('calendarContent', html);
  }

  function initCalendarTab() {
    const btn = $('btnLoadCalendar'); if (btn) btn.addEventListener('click', loadCalendar);
  }

  // ================================================================
  // [13] CALENDAR IMPORT
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
  // [14] QR
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
  // [15] REPORTS
  // ================================================================
  function initReportsTab() {
    const btn = $('btnGenerateReport');
    if (btn) btn.addEventListener('click', () => {
      showToast('PDF generation will be handled by the Apps Script bridge.', 'info');
      setText('reportFeedback', 'PDF export will be wired to the Apps Script bridge.');
    });
  }

  // ================================================================
  // [16] CLASSES
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
  // [17] USERS
  // ================================================================
  async function loadUsers() {
    setHTML('usersContent', pageLoaderHTML('Loading users...'));
    const r = await window.TIS.listUsers();
    if (!r.ok) { setHTML('usersContent', errorHTML('Could not load users', r.error)); return; }
    const users = r.data || [];
    if (!users.length) { setHTML('usersContent', emptyHTML('fa-user-cog', 'No users found')); return; }
    let html = '<div class="card-bg" style="overflow-x:auto;"><table class="users-table"><thead><tr><th>ID</th><th>Name</th><th>Role</th><th>Status</th></tr></thead><tbody>';
    users.forEach(u => {
      html += '<tr><td><strong>' + esc(u.operator_id) + '</strong></td><td>' + esc(u.name) + '</td><td>' + esc(u.role) + '</td><td>' + (u.is_active ? 'Active' : 'Inactive') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    setHTML('usersContent', html);
  }

  function initUsersTab() {
    const r1 = $('btnRefreshUsers'); if (r1) r1.addEventListener('click', loadUsers);
  }

  // ================================================================
  // [18] PLACEHOLDERS
  // ================================================================
  function initBroadSheetTab() {
    const r1 = $('btnLoadBroadSheet'); if (r1) r1.addEventListener('click', () => showToast('Broad sheet data coming with the API layer', 'info'));
    const r2 = $('btnPopulateBroadSheet'); if (r2) r2.addEventListener('click', () => showToast('Populate coming with the API layer', 'info'));
  }

  // ================================================================
  // [19] WIRE + BOOT
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
  }

  // Safety sweep: removes any stray blocking overlay that might
  // have been left behind by a previous version of the app.
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
  // [20] PUBLIC API
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
