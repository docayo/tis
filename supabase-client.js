// ================================================================
// TIS EMIS — SUPABASE CLIENT
// File: supabase-client.js
// ================================================================
// This version:
//   - Adds full Users & Permissions support against public.users
//   - Uses the `authorities` jsonb column (matches DDL in Supabase)
//   - operator_id is the login key (passkey column ignored for login)
//   - Keeps every previous function intact
// ================================================================

(function () {
  'use strict';

  const SUPABASE_URL      = 'https://ndsroviwrfjbgaucajri.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vEa5YAU8ac7pyhCiejkMtw_PMiLDuhI';
  const SDK_URL           = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';

  const OPERATOR_EMAIL_SUFFIX = '@tis.local';

  // Canonical permission matrix — matches Users.gs v6 on the sheets side.
  const PERMISSION_MODULES = [
    { key: 'learners',         label: 'Learners',            defaultReadAll: false },
    { key: 'staff',            label: 'Staff',               defaultReadAll: false },
    { key: 'attendance',       label: 'Student Attendance',  defaultReadAll: true  },
    { key: 'staff_attendance', label: 'Staff Attendance',    defaultReadAll: true  },
    { key: 'broadsheet',       label: 'Broad Sheet',         defaultReadAll: false },
    { key: 'reports',          label: 'Reports',             defaultReadAll: false },
    { key: 'calendar',         label: 'Calendar',            defaultReadAll: false },
    { key: 'classes',          label: 'Classes',             defaultReadAll: false },
    { key: 'users',            label: 'Users & Permissions', defaultReadAll: false }
  ];
  const PERMISSION_ACTIONS = ['read', 'write', 'print'];

  let sbPromise = null;

  function loadSdk() {
    if (sbPromise) return sbPromise;
    sbPromise = new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) {
        try {
          resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
            global: {
              fetch: function (url, opts) {
                const ctrl = new AbortController();
                const timer = setTimeout(function () { ctrl.abort(); }, 12000);
                const merged = Object.assign({}, opts || {}, { signal: ctrl.signal });
                return fetch(url, merged).finally(function () { clearTimeout(timer); });
              }
            }
          }));
        } catch (e) { reject(e); }
        return;
      }
      const s = document.createElement('script');
      s.src = SDK_URL;
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        if (!window.supabase || !window.supabase.createClient) {
          reject(new Error('Supabase SDK loaded but createClient is not available.'));
          return;
        }
        try {
          resolve(window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
            global: {
              fetch: function (url, opts) {
                const ctrl = new AbortController();
                const timer = setTimeout(function () { ctrl.abort(); }, 12000);
                const merged = Object.assign({}, opts || {}, { signal: ctrl.signal });
                return fetch(url, merged).finally(function () { clearTimeout(timer); });
              }
            }
          }));
        } catch (e) { reject(e); }
      };
      s.onerror = function () {
        reject(new Error('Could not load the Supabase SDK. Check your internet connection.'));
      };
      document.head.appendChild(s);
      setTimeout(function () {
        if (!window.supabase || !window.supabase.createClient) {
          reject(new Error('Supabase SDK timed out. Please reload the page.'));
        }
      }, 15000);
    });
    return sbPromise;
  }

  function ok(data)    { return { ok: true,  data: data }; }
  function fail(error) {
    const msg = (error && error.message) ? error.message
              : (typeof error === 'string') ? error
              : 'Unknown error';
    return { ok: false, error: msg };
  }

  function toAuthEmail(operatorId) {
    const id = String(operatorId || '').trim().toLowerCase();
    return id + OPERATOR_EMAIL_SUFFIX;
  }

  const TIS = {};

  // ----------------------------------------------------------------
  // AUTH
  // ----------------------------------------------------------------
  TIS.signIn = async function (operatorId, password) {
    try {
      const sb = await loadSdk();
      const email = toAuthEmail(operatorId);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return fail(error.message || 'Sign in failed');

      const { data: profile, error: profErr } = await sb
        .from('users')
        .select('id, operator_id, name, role, position, avatar_url, is_active, must_change_password, authorities')
        .eq('id', data.user.id)
        .single();

      if (profErr) return fail('Signed in but profile not found: ' + profErr.message);
      if (profile.is_active === false) {
        await sb.auth.signOut();
        return fail('That account is currently inactive.');
      }

      try {
        await sb.from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', data.user.id);
      } catch (_) { /* silent */ }

      return ok({ user: data.user, profile });
    } catch (err) { return fail(err); }
  };

  TIS.signOut = async function () {
    try {
      const sb = await loadSdk();
      const { error } = await sb.auth.signOut();
      if (error) return fail(error.message);
      return ok({});
    } catch (err) { return fail(err); }
  };

  TIS.getCurrentProfile = async function () {
    try {
      const sb = await loadSdk();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return fail('Not signed in');
      const { data, error } = await sb
        .from('users')
        .select('id, operator_id, name, role, position, avatar_url, is_active, must_change_password, authorities')
        .eq('id', user.id)
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.changePassword = async function (newPassword) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) return fail(error.message);

      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { error: flagErr } = await sb.from('users')
          .update({
            must_change_password: false,
            password_last_changed: new Date().toISOString()
          })
          .eq('id', user.id);
        if (flagErr) {
          return fail('Password changed, but profile flag not cleared: ' + flagErr.message);
        }
      }
      return ok({});
    } catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // Generic table helpers
  // ----------------------------------------------------------------
  async function tableSelect(table, opts) {
    const sb = await loadSdk();
    let q = sb.from(table).select(opts && opts.select ? opts.select : '*');
    if (opts && opts.eq)    Object.keys(opts.eq).forEach(k => { q = q.eq(k, opts.eq[k]); });
    if (opts && opts.neq)   Object.keys(opts.neq).forEach(k => { q = q.neq(k, opts.neq[k]); });
    if (opts && opts.ilike) Object.keys(opts.ilike).forEach(k => { q = q.ilike(k, opts.ilike[k]); });
    if (opts && opts.order) q = q.order(opts.order.column, { ascending: !!opts.order.ascending });
    if (opts && opts.limit) q = q.limit(opts.limit);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function tableInsert(table, row) {
    const sb = await loadSdk();
    const { data, error } = await sb.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function tableUpdate(table, patch, eq) {
    const sb = await loadSdk();
    let q = sb.from(table).update(patch);
    Object.keys(eq).forEach(k => { q = q.eq(k, eq[k]); });
    const { data, error } = await q.select();
    if (error) throw error;
    return data;
  }

  async function tableDelete(table, eq) {
    const sb = await loadSdk();
    let q = sb.from(table).delete();
    Object.keys(eq).forEach(k => { q = q.eq(k, eq[k]); });
    const { error } = await q;
    if (error) throw error;
    return true;
  }

  // ----------------------------------------------------------------
  // CLASSES / TERMS / LEARNERS / STAFF (kept from previous version)
  // ----------------------------------------------------------------
  TIS.listClasses = async function () {
    try { return ok(await tableSelect('classes', { order: { column: 'name', ascending: true } })); }
    catch (err) { return fail(err); }
  };
  TIS.createClass = async function (row) {
    try { return ok(await tableInsert('classes', row)); }
    catch (err) { return fail(err); }
  };
  TIS.updateClass = async function (id, patch) {
    try { return ok(await tableUpdate('classes', patch, { id })); }
    catch (err) { return fail(err); }
  };
  TIS.deleteClass = async function (id) {
    try { await tableDelete('classes', { id }); return ok({}); }
    catch (err) { return fail(err); }
  };

  TIS.listTerms = async function () {
    try {
      const rows = await tableSelect('terms', {
        order: { column: 'year', ascending: false }
      });
      // Sort so 3rd → 2nd → 1st for the same year, newest year first.
      rows.sort(function (a, b) {
        if (a.year !== b.year) return b.year - a.year;
        const order = { '3rd': 3, '2nd': 2, '1st': 1 };
        return (order[b.term_type] || 0) - (order[a.term_type] || 0);
      });
      return ok(rows);
    } catch (err) { return fail(err); }
  };

  TIS.getTerms = TIS.listTerms; // alias for the new UI

  TIS.getActiveTerm = async function () {
    try {
      const rows = await tableSelect('terms', {
        eq: { is_active: true },
        limit: 1
      });
      return ok(rows[0] || null);
    } catch (err) { return fail(err); }
  };

  TIS.createTerm = async function (row) {
    try { return ok(await tableInsert('terms', row)); }
    catch (err) { return fail(err); }
  };

  TIS.setActiveTerm = async function (termId) {
    try {
      const sb = await loadSdk();
      // Clear all, then set one. Two quick calls.
      const { error: clrErr } = await sb
        .from('terms')
        .update({ is_active: false })
        .neq('id', -1); // matches all rows
      if (clrErr) return fail(clrErr.message);

      const { error: setErr } = await sb
        .from('terms')
        .update({ is_active: true })
        .eq('id', termId);
      if (setErr) return fail(setErr.message);

      return ok({ id: termId });
    } catch (err) { return fail(err); }
  };

  TIS.listLearners = async function () {
    try { return ok(await tableSelect('learners', { order: { column: 'name', ascending: true } })); }
    catch (err) { return fail(err); }
  };
  TIS.searchLearners = async function (term) {
    try {
      const q = String(term || '').trim();
      if (!q) return ok([]);
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners')
        .select('*')
        .or('pin.ilike.%' + q + '%,name.ilike.%' + q + '%')
        .order('name', { ascending: true })
        .limit(100);
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };
  TIS.getLearner = async function (id) {
    try {
      const rows = await tableSelect('learners', { eq: { id }, limit: 1 });
      return ok(rows[0] || null);
    } catch (err) { return fail(err); }
  };
  TIS.createLearner = async function (row) {
    try { return ok(await tableInsert('learners', row)); }
    catch (err) { return fail(err); }
  };
  TIS.updateLearner = async function (id, patch) {
    try { return ok(await tableUpdate('learners', patch, { id })); }
    catch (err) { return fail(err); }
  };
  TIS.deleteLearner = async function (id) {
    try { await tableDelete('learners', { id }); return ok({}); }
    catch (err) { return fail(err); }
  };

  TIS.listStaff = async function () {
    try { return ok(await tableSelect('staff', { order: { column: 'full_name', ascending: true } })); }
    catch (err) { return fail(err); }
  };
  TIS.getStaff = async function (id) {
    try {
      const rows = await tableSelect('staff', { eq: { id }, limit: 1 });
      return ok(rows[0] || null);
    } catch (err) { return fail(err); }
  };
  TIS.createStaff = async function (row) {
    try { return ok(await tableInsert('staff', row)); }
    catch (err) { return fail(err); }
  };
  TIS.updateStaff = async function (id, patch) {
    try { return ok(await tableUpdate('staff', patch, { id })); }
    catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // ATTENDANCE (learners)
  // ----------------------------------------------------------------
  TIS.listAttendanceForClassTerm = async function (classId, termId) {
    try {
      return ok(await tableSelect('attendance_learner', {
        eq: { class_id: classId, term_id: termId },
        order: { column: 'attendance_date', ascending: true }
      }));
    } catch (err) { return fail(err); }
  };

  TIS.saveLearnerAttendance = async function (termId, classId, dateISO, marks, markedBy) {
    try {
      if (!marks || marks.length === 0) return ok([]);
      const sb = await loadSdk();
      const rows = marks.map(function (m) {
        return {
          learner_id: m.learnerId,
          term_id: termId,
          class_id: classId,
          attendance_date: dateISO,
          mark: m.mark,
          marked_by: markedBy || '',
          marked_at: new Date().toISOString()
        };
      });
      const { data, error } = await sb
        .from('attendance_learner')
        .upsert(rows, { onConflict: 'learner_id,attendance_date' })
        .select();
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.classAnalysis = async function (classId, termId) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.rpc('class_analysis', {
        p_class_id: classId,
        p_term_id: termId
      });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // ATTENDANCE (staff)
  // ----------------------------------------------------------------
  TIS.listStaffAttendanceToday = async function (dateISO) {
    try {
      return ok(await tableSelect('attendance_staff', { eq: { attendance_date: dateISO } }));
    } catch (err) { return fail(err); }
  };

  TIS.listStaffAttendanceForMonth = async function (year, month) {
    try {
      const sb = await loadSdk();
      const fromDate = year + '-' + String(month).padStart(2, '0') + '-01';
      const toDate   = year + '-' + String(month).padStart(2, '0') + '-31';
      const { data, error } = await sb
        .from('attendance_staff')
        .select('*')
        .gte('attendance_date', fromDate)
        .lte('attendance_date', toDate)
        .order('attendance_date', { ascending: false });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.upsertStaffAttendance = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('attendance_staff')
        .upsert(row, { onConflict: 'staff_id,attendance_date' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.staffMonthlySummary = async function (year, month) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.rpc('staff_monthly_summary', {
        p_year: year,
        p_month: month
      });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // MOVEMENTS
  // ----------------------------------------------------------------
  TIS.listMovementsToday = async function (dateISO) {
    try {
      return ok(await tableSelect('movements', {
        eq: { movement_date: dateISO },
        order: { column: 'created_at', ascending: false }
      }));
    } catch (err) { return fail(err); }
  };
  TIS.createMovement = async function (row) {
    try { return ok(await tableInsert('movements', row)); }
    catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // PAYMENTS
  // ----------------------------------------------------------------
  TIS.listPayments = async function (learnerId) {
    try {
      return ok(await tableSelect('payments', {
        eq: { learner_id: learnerId },
        order: { column: 'payment_date', ascending: false }
      }));
    } catch (err) { return fail(err); }
  };
  TIS.recordPayment = async function (row) {
    try { return ok(await tableInsert('payments', row)); }
    catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // CALENDAR
  // ----------------------------------------------------------------
  TIS.listCalendar = async function () {
    try {
      return ok(await tableSelect('calendar', { order: { column: 'event_date', ascending: true } }));
    } catch (err) { return fail(err); }
  };
  TIS.listCalendarImports = async function () {
    try {
      return ok(await tableSelect('calendar_imports', { order: { column: 'uploaded_at', ascending: false } }));
    } catch (err) { return fail(err); }
  };
  TIS.listCalendarStaging = async function (importId) {
    try {
      return ok(await tableSelect('calendar_staging', {
        eq: { import_id: importId },
        order: { column: 'row_index', ascending: true }
      }));
    } catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // SUBJECTS
  // ----------------------------------------------------------------
  TIS.listSubjects = async function (classId) {
    try {
      const rows = await tableSelect('subjects', {
        eq: classId ? { class_id: classId } : {},
        order: { column: 'slot', ascending: true }
      });
      return ok(rows);
    } catch (err) { return fail(err); }
  };

  // ----------------------------------------------------------------
  // SETTINGS
  // ----------------------------------------------------------------
  TIS.getSetting = async function (key) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data ? data.value : null);
    } catch (err) { return fail(err); }
  };

  TIS.setSetting = async function (key, value) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // USERS & PERMISSIONS  (new in this version)
  // ================================================================

  // Returns the shape the Users page needs: modules, actions, and each
  // user's current authorities (falling back to role defaults).
  TIS.getPermissionMatrix = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('users')
        .select('id, operator_id, name, role, position, avatar_url, is_active, must_change_password, authorities, deleted')
        .order('operator_id', { ascending: true });
      if (error) return fail(error.message);

      const users = (data || [])
        .filter(u => u.deleted !== true)
        .map(function (u) {
          const auth = (u.authorities && Object.keys(u.authorities).length > 0)
            ? u.authorities
            : roleDefaults(u.role);
          return {
            id: u.operator_id || u.id,
            uuid: u.id,
            name: u.name,
            role: u.role,
            position: u.position,
            image: u.avatar_url,
            isActive: u.is_active !== false,
            mustChangePassword: u.must_change_password === true,
            authorities: auth
          };
        });

      return ok({
        modules: PERMISSION_MODULES,
        actions: PERMISSION_ACTIONS,
        users: users
      });
    } catch (err) { return fail(err); }
  };

  // Save one user's permissions. `id` may be operator_id or uuid.
  TIS.setUserAuthorities = async function (id, authorities) {
    try {
      const sb = await loadSdk();
      const { error } = await sb
        .from('users')
        .update({ authorities: authorities, updated_at: new Date().toISOString() })
        .or('operator_id.eq.' + id + ',id.eq.' + id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };

  TIS.getAllUsers = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('users')
        .select('id, operator_id, name, role, position, avatar_url, is_active, must_change_password, authorities')
        .order('operator_id', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getUserById = async function (id) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('users')
        .select('*')
        .or('operator_id.eq.' + id + ',id.eq.' + id)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.updateUser = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { error } = await sb
        .from('users')
        .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
        .or('operator_id.eq.' + id + ',id.eq.' + id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };

  TIS.deactivateUser = async function (id) {
    return TIS.updateUser(id, { is_active: false });
  };

  TIS.reactivateUser = async function (id) {
    return TIS.updateUser(id, { is_active: true });
  };

  TIS.createUser = async function (data) {
    try {
      const sb = await loadSdk();
      const row = {
        operator_id: data.id || data.operator_id,
        name: data.name,
        role: data.role || 'teacher',
        position: data.position || '',
        avatar_url: data.image || '',
        is_active: true,
        must_change_password: true,
        authorities: data.authorities || roleDefaults(data.role || 'teacher')
      };
      const { data: inserted, error } = await sb
        .from('users')
        .insert(row)
        .select()
        .single();
      if (error) return fail(error.message);

      // Also create the Supabase Auth account. Requires the anon key to
      // have permission to sign up — check Supabase Auth → Settings.
      try {
        const email = toAuthEmail(row.operator_id);
        const { error: authErr } = await sb.auth.signUp({
          email: email,
          password: data.password || '1234'
        });
        if (authErr) {
          // Roll back the row so a half-created user doesn't linger.
          await sb.from('users').delete().eq('operator_id', row.operator_id);
          return fail('Auth account creation failed: ' + authErr.message);
        }
      } catch (authErr) {
        await sb.from('users').delete().eq('operator_id', row.operator_id);
        return fail('Auth exception: ' + (authErr.message || String(authErr)));
      }

      return ok(inserted);
    } catch (err) { return fail(err); }
  };

  TIS.adminResetPassword = async function (operatorId, newPassword, adminName) {
    // Requires a Supabase Edge Function or Service Role key.
    // Placeholder that surfaces a clear message until that's wired.
    return fail('Password reset requires an Edge Function. Admin "' + (adminName || '') +
                '" tried to reset operator ' + operatorId + '.');
  };

  // Role defaults — mirrors Users.gs v6 getDefaultAuthorities.
  function roleDefaults(role) {
    const superAdmin = {
      learners: { read: true, write: true, print: true },
      staff: { read: true, write: true, print: true },
      attendance: { read: true, write: true, print: true },
      staff_attendance: { read: true, write: true, print: true },
      broadsheet: { read: true, write: true, print: true },
      reports: { read: true, write: true, print: true },
      calendar: { read: true, write: true, print: true },
      classes: { read: true, write: true, print: true },
      users: { read: true, write: true, print: true }
    };
    const admin = {
      learners: { read: true, write: true, print: true },
      staff: { read: true, write: true, print: true },
      attendance: { read: true, write: true, print: true },
      staff_attendance: { read: true, write: true, print: true },
      broadsheet: { read: true, write: true, print: true },
      reports: { read: true, write: true, print: true },
      calendar: { read: true, write: true, print: true },
      classes: { read: true, write: false, print: true },
      users: { read: true, write: false, print: true }
    };
    const teacher = {
      learners: { read: true, write: false, print: false },
      staff: { read: false, write: false, print: false },
      attendance: { read: true, write: true, print: false },
      staff_attendance: { read: true, write: false, print: false },
      broadsheet: { read: true, write: true, print: false },
      reports: { read: true, write: false, print: false },
      calendar: { read: true, write: false, print: false },
      classes: { read: true, write: false, print: false },
      users: { read: false, write: false, print: false }
    };
    const operator = {
      learners: { read: true, write: false, print: true },
      staff: { read: true, write: false, print: false },
      attendance: { read: true, write: true, print: true },
      staff_attendance: { read: true, write: true, print: true },
      broadsheet: { read: true, write: false, print: true },
      reports: { read: true, write: false, print: true },
      calendar: { read: true, write: false, print: false },
      classes: { read: true, write: false, print: false },
      users: { read: false, write: false, print: false }
    };

    const profile =
      role === 'super_admin' ? superAdmin :
      role === 'admin'       ? admin :
      role === 'teacher'     ? teacher : operator;

    const auth = {};
    PERMISSION_MODULES.forEach(function (m) {
      const p = profile[m.key] || {};
      auth['read_' + m.key]  = !!p.read;
      auth['write_' + m.key] = !!p.write;
      auth['print_' + m.key] = !!p.print;
    });
    return auth;
  }
  TIS.roleDefaults = roleDefaults;

  // ----------------------------------------------------------------
  // STORAGE
  // ----------------------------------------------------------------
  TIS.uploadPhoto = async function (bucket, path, file) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) return fail(error.message);
      const { data: pub } = sb.storage.from(bucket).getPublicUrl(data.path);
      return ok({ url: pub.publicUrl, path: data.path });
    } catch (err) { return fail(err); }
  };

  loadSdk().catch(function (e) {
    console.warn('[TIS] Supabase SDK preload failed:', e.message);
  });

  window.TIS = window.TIS || {};
  Object.assign(window.TIS, TIS);
  console.log('[TIS] Supabase client ready. Connection to:', SUPABASE_URL);

})();
// ================================================================
// END OF supabase-client.js
// ================================================================
