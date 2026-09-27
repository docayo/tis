// ================================================================
// TIS EMIS — SUPABASE CLIENT
// File: supabase-client.js
// ================================================================
// - operator_id is the login key
// - authorities column (jsonb) holds permissions
// - learner_terms holds per-term fee + part payments
// ================================================================

(function () {
  'use strict';

  const SUPABASE_URL      = 'https://ndsroviwrfjbgaucajri.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_vEa5YAU8ac7pyhCiejkMtw_PMiLDuhI';
  const SDK_URL           = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
  const OPERATOR_EMAIL_SUFFIX = '@tis.local';

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

  // ---------------- AUTH ----------------
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
      } catch (_) {}
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
        await sb.from('users')
          .update({ must_change_password: false, password_last_changed: new Date().toISOString() })
          .eq('id', user.id);
      }
      return ok({});
    } catch (err) { return fail(err); }
  };

  // ---------------- Generic table helpers ----------------
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

  // ---------------- USERS & PERMISSIONS ----------------
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
            ? u.authorities : roleDefaults(u.role);
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

      return ok({ modules: PERMISSION_MODULES, actions: PERMISSION_ACTIONS, users: users });
    } catch (err) { return fail(err); }
  };

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
      const { data, error } = await sb.from('users').select('*')
        .or('operator_id.eq.' + id + ',id.eq.' + id).maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.updateUser = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('users')
        .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
        .or('operator_id.eq.' + id + ',id.eq.' + id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };

  TIS.deactivateUser = async function (id) { return TIS.updateUser(id, { is_active: false }); };
  TIS.reactivateUser = async function (id) { return TIS.updateUser(id, { is_active: true }); };

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
      const { data: inserted, error } = await sb.from('users').insert(row).select().single();
      if (error) return fail(error.message);
      try {
        const email = toAuthEmail(row.operator_id);
        const { error: authErr } = await sb.auth.signUp({ email: email, password: data.password || '1234' });
        if (authErr) {
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
    return fail('Password reset requires an Edge Function. Admin "' + (adminName || '') +
                '" tried to reset ' + operatorId + '.');
  };

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
    const profile = role === 'super_admin' ? superAdmin
                  : role === 'admin' ? admin
                  : role === 'teacher' ? teacher : operator;
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

  // ---------------- TERMS ----------------
  TIS.listTerms = async function () {
    try {
      const rows = await tableSelect('terms', { order: { column: 'year', ascending: false } });
      rows.sort(function (a, b) {
        if (a.year !== b.year) return b.year - a.year;
        const order = { '3rd': 3, '2nd': 2, '1st': 1 };
        return (order[b.term_type] || 0) - (order[a.term_type] || 0);
      });
      return ok(rows);
    } catch (err) { return fail(err); }
  };
  TIS.getTerms = TIS.listTerms;

  TIS.getActiveTerm = async function () {
    try {
      const rows = await tableSelect('terms', { eq: { is_active: true }, limit: 1 });
      return ok(rows[0] || null);
    } catch (err) { return fail(err); }
  };

  TIS.setActiveTerm = async function (termId) {
    try {
      const sb = await loadSdk();
      const { error: clrErr } = await sb.from('terms').update({ is_active: false }).neq('id', -1);
      if (clrErr) return fail(clrErr.message);
      const { error: setErr } = await sb.from('terms').update({ is_active: true }).eq('id', termId);
      if (setErr) return fail(setErr.message);
      return ok({ id: termId });
    } catch (err) { return fail(err); }
  };

  // ---------------- CALENDAR ----------------
  TIS.getCalendar = async function () {
    try {
      const rows = await tableSelect('academic_calendar', { order: { column: 'event_date', ascending: true } });
      return ok(rows);
    } catch (err) { return fail(err); }
  };
  TIS.listCalendar = TIS.getCalendar;

  // ---------------- LEARNERS ----------------
  TIS.listLearners = async function () {
    try {
      const rows = await tableSelect('learners', { order: { column: 'name', ascending: true } });
      return ok(rows);
    } catch (err) { return fail(err); }
  };

  TIS.searchLearners = async function (term) {
    try {
      const q = String(term || '').trim();
      if (!q) return ok([]);
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners').select('*')
        .or('pin.ilike.%' + q + '%,name.ilike.%' + q + '%')
        .order('name', { ascending: true }).limit(100);
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

  TIS.getLearnerByPin = async function (pin) {
    try {
      const rows = await tableSelect('learners', { eq: { pin }, limit: 1 });
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

  // ---------------- LEARNER TERMS (fees + part payments) ----------------
  TIS.getLearnerTerms = async function (learnerId) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learner_terms').select('*')
        .eq('learner_id', learnerId)
        .order('year', { ascending: false });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getLearnerTermForActive = async function (learnerId) {
    try {
      const active = await TIS.getActiveTerm();
      if (!active.ok || !active.data) return fail('No active term set.');
      const t = active.data;
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learner_terms').select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', t.term_type)
        .eq('year', t.year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok({ row: data || null, term: t });
    } catch (err) { return fail(err); }
  };

  // Record a new part payment, writing to the next available slot.
  // Auto-recomputes total_part_payment and balance_cf. Marks cleared
  // when the balance reaches zero.
  TIS.recordPartPayment = async function (learnerId, termType, year, amount, dateISO, mode) {
    try {
      const sb = await loadSdk();
      const { data: row, error: rowErr } = await sb
        .from('learner_terms').select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (rowErr) return fail(rowErr.message);
      if (!row) return fail('No fee record for this learner in ' + termType + ' term ' + year);

      // Find next empty slot.
      const slots = [1, 2, 3, 4, 5];
      let slot = null;
      for (var i = 0; i < slots.length; i++) {
        var n = slots[i];
        if (!row['part_payment_' + n + '_amount']) { slot = n; break; }
      }
      if (slot === null) return fail('All 5 part-payment slots are full. See Accounts.');

      const patch = {};
      patch['part_payment_' + slot + '_amount'] = String(amount);
      patch['part_payment_' + slot + '_date']   = dateISO || new Date().toISOString().slice(0, 10);

      // Recompute total from all five slots after this insert.
      var newTotal = 0;
      for (var j = 0; j < slots.length; j++) {
        var m = slots[j];
        var v = (m === slot)
          ? Number(String(amount).replace(/[^0-9.\-]/g, '')) || 0
          : Number(String(row['part_payment_' + m + '_amount'] || '').replace(/[^0-9.\-]/g, '')) || 0;
        newTotal += v;
      }
      patch.total_part_payment = String(newTotal);

      // Balance C/F = balance_bf + bill + other_bill - total paid.
      const num = function (v) { return Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0; };
      const newBalance = num(row.balance_bf) + num(row.bill) + num(row.other_bill) - newTotal;
      patch.balance_cf = String(newBalance);

      if (newBalance <= 0) {
        patch.cleared   = 'Yes';
        patch.clearance = dateISO || new Date().toISOString().slice(0, 10);
      }
      patch.updated_at = new Date().toISOString();

      const { error: updErr } = await sb.from('learner_terms')
        .update(patch)
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year);
      if (updErr) return fail(updErr.message);

      return ok({ slot: slot, patch: patch });
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
