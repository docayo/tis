// ================================================================
// BEFORE YOU TOUCH THIS FILE:
//   Read HANDOVER.md (repo root) or /handover (live URL).
//   Every method here is exposed on window.TIS.
//   Return shape: { ok: true, data } or { ok: false, error }.
//   Never throw. Never return raw Supabase responses.
// ================================================================
// TIS EMIS — SUPABASE CLIENT
// File: supabase-client.js
// ================================================================
// Contents:
//   [SDK]      loadSdk, ok, fail, toAuthEmail
//   [AUTH]     signIn, signOut, getCurrentProfile, changePassword
//   [LEARNERS] listLearners, searchLearners, get/create/update,
//              setLearnerContactPriority
//   [LEARNER_TERMS] getLearnerTerms, getLearnerTermForActive,
//                   getLearnerTermFor, recordPartPayment
//   [ATTENDANCE_LEARNER] getAttendanceRegister, saveAttendanceMarks,
//                        shiftHoliday, markWeekForLearners
//   [STAFF]    listStaff, getStaff, createStaff, updateStaff, deleteStaff
//   [STAFF_ATTENDANCE] listStaffAttendanceToday, upsertStaffAttendance,
//                      listStaffAttendanceRange, listStaffMovementsToday,
//                      createStaffMovement, updateStaffMovement
//   [QR]       getActiveQRToken, generateQRToken, getQRTokenByValue
//   [TERMS]    listTerms, getTerms, getActiveTerm, setActiveTerm
//   [PROMOTION] getPromotionStatus, termPromote, yearPromote,
//               getLearnersForClasses, promoteLearners
//   [CLASSES]  listClasses, createClass, updateClass, deleteClass, getNextClass
//   [CALENDAR] getCalendar, listCalendar
//   [USERS]    getPermissionMatrix, setUserAuthorities, getAllUsers,
//              getUserById, updateUser, deactivateUser, reactivateUser,
//              createUser, adminResetPassword, roleDefaults
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
    { key: 'results',          label: 'Results',             defaultReadAll: true  },
    { key: 'calendar',         label: 'Calendar',            defaultReadAll: false },
    { key: 'classes',          label: 'Classes',             defaultReadAll: false },
    { key: 'terms',            label: 'Terms & Promotion',   defaultReadAll: false },
    { key: 'users',            label: 'Users & Permissions', defaultReadAll: false },
    { key: 'idcards',          label: 'ID Cards',            defaultReadAll: true  }
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

  // ================================================================
  // [AUTH]
  // ================================================================
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
        await sb.from('users').update({ last_login: new Date().toISOString() }).eq('id', data.user.id);
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
        await sb.from('users').update({
          must_change_password: false,
          password_last_changed: new Date().toISOString()
        }).eq('id', user.id);
      }
      return ok({});
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [LEARNERS]
  // ================================================================
  TIS.listLearners = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners')
        .select('*')
        .order('name', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.searchLearners = async function (term) {
    try {
      const q = String(term || '').trim();
      if (!q) return ok([]);
      const sb = await loadSdk();
      const pattern = '%' + q + '%';
      const { data, error } = await sb
        .from('learners').select('*')
        .or('pin.ilike.' + pattern +
            ',name.ilike.' + pattern +
            ',father_phone.ilike.' + pattern +
            ',mother_phone.ilike.' + pattern +
            ',guardian_phone.ilike.' + pattern +
            ',account_number.ilike.' + pattern)
        .order('name', { ascending: true }).limit(100);
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getLearner = async function (id) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.from('learners').select('*').eq('id', id).maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.getLearnerByPin = async function (pin) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.from('learners').select('*').eq('pin', pin).maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.createLearner = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.from('learners').insert(row).select().single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.updateLearner = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners')
        .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
        .eq('id', id)
        .select();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

    TIS.setLearnerContactPriority = async function (learnerId, order) {
    try {
      const sb = await loadSdk();
      const patch = {
        contact_priority_1: order.p1 || null,
        contact_priority_2: order.p2 || null,
        contact_priority_3: order.p3 || null,
        updated_at: new Date().toISOString()
      };
      const { error } = await sb.from('learners').update(patch).eq('id', learnerId);
      if (error) return fail(error.message);
      return ok({ id: learnerId });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [LEARNERS] findLearnerDuplicate
  //   Case-insensitive name match + exact date_of_birth match.
  //   Returns { row: <learner> } when a match is found,
  //   or { row: null } when the learner is safe to add.
  //   Used by the Add Learner flow to warn + allow override.
  // ================================================================
  TIS.findLearnerDuplicate = async function (name, dateOfBirth) {
    try {
      const n = String(name || '').trim();
      const d = String(dateOfBirth || '').trim();
      if (!n || !d) return ok({ row: null });

      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners')
        .select('id, pin, name, class_name, date_of_birth, gender, photo_url')
        .ilike('name', n)
        .eq('date_of_birth', d)
        .limit(1);

      if (error) return fail(error.message);
      const row = (data && data.length) ? data[0] : null;
      return ok({ row: row });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [LEARNER SCAN] — records a learner present for a single day.
  //   First scan of the day → '\'   (morning)
  //   Second scan same day  → '\ /' (both)
  //   If already '\ /', returns { noop: true }.
  //   Returns { mark, action } where action is
  //     'morning' | 'afternoon' | 'already-both'.
  // ================================================================
  TIS.recordLearnerScan = async function (learnerId, termType, year, markedBy) {
    try {
      const sb = await loadSdk();
      const today = new Date().toISOString().slice(0, 10);

      const existingR = await sb
        .from('attendance_learner')
        .select('mark')
        .eq('learner_id', learnerId)
        .eq('attendance_date', today)
        .maybeSingle();
      if (existingR.error) return fail(existingR.error.message);

      const current = existingR.data ? String(existingR.data.mark || '') : '';

      let nextMark = '\\';
      let action   = 'morning';

      if (current === '\\')        { nextMark = '\\ /'; action = 'afternoon'; }
      else if (current === '\\ /') { nextMark = '\\ /'; action = 'already-both'; }
      else if (current === '/')    { nextMark = '\\ /'; action = 'afternoon'; }
      else if (current === 'O O' || current === '') { nextMark = '\\'; action = 'morning'; }

      if (action === 'already-both') {
        return ok({ mark: nextMark, action: action, noop: true });
      }

      const upsertR = await sb
        .from('attendance_learner')
        .upsert({
          learner_id:      learnerId,
          term_type:       termType,
          year:            year,
          attendance_date: today,
          mark:            nextMark,
          marked_by:       markedBy || 'ID-card scan',
          marked_at:       new Date().toISOString()
        }, { onConflict: 'learner_id,attendance_date' });
      if (upsertR.error) return fail(upsertR.error.message);

      return ok({ mark: nextMark, action: action });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [VISITS] — visitor card scans.
  //   First scan of the day for a card_code → INSERT with time_in.
  //   Second scan same day for the same card_code → UPDATE time_out.
  //   Returns { action: 'check-in' | 'check-out', row }.
  // ================================================================
  TIS.recordVisitorScan = async function (payload) {
    try {
      const sb = await loadSdk();
      const today = new Date().toISOString().slice(0, 10);
      const cardCode = String(payload.card_code || '').trim();

      const openR = await sb
        .from('visits')
        .select('*')
        .eq('card_code', cardCode)
        .eq('visit_date', today)
        .is('time_out', null)
        .order('time_in', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openR.error) return fail(openR.error.message);

      const now = new Date();
      const timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                      String(now.getMinutes()).padStart(2, '0');

      if (openR.data && openR.data.id) {
        const updR = await sb
          .from('visits')
          .update({
            time_out:   timeStr,
            status:     'Out',
            updated_at: new Date().toISOString()
          })
          .eq('id', openR.data.id)
          .select()
          .single();
        if (updR.error) return fail(updR.error.message);
        return ok({ action: 'check-out', row: updR.data });
      }

      const insR = await sb
        .from('visits')
        .insert({
          card_code:    cardCode,
          visitor_name: payload.visitor_name || '',
          purpose:      payload.purpose || '',
          agency:       payload.agency || null,
          agency_other: payload.agency_other || null,
          time_in:      timeStr,
          visit_date:   today,
          status:       'In',
          recorded_by:  payload.recorded_by || 'ID-card scan',
          notes:        payload.notes || null
        })
        .select()
        .single();
      if (insR.error) return fail(insR.error.message);
      return ok({ action: 'check-in', row: insR.data });
    } catch (err) { return fail(err); }
  };
  // ================================================================
      // [SCAN EVENTS] — audit log of every scan.
  //   Best-effort write; a failure here must never block the scan.
  // ================================================================
  TIS.logScanEvent = async function (event) {
    try {
      const sb = await loadSdk();
      const payload = {
        code:       String(event.code || ''),
        code_type:  String(event.code_type || ''),
        actor_id:   event.actor_id != null ? String(event.actor_id) : null,
        actor_name: String(event.actor_name || ''),
        action:     String(event.action || ''),
        success:    event.success !== false,
        detail:     event.detail ? String(event.detail) : null,
        scanned_by: String(event.scanned_by || 'ID-card scan'),
        scan_date:  new Date().toISOString().slice(0, 10),
        scanned_at: new Date().toISOString()
      };
      const r = await sb.from('scan_events').insert(payload);
      if (r.error) return ok({ skipped: true, reason: r.error.message });
      return ok({ logged: true });
    } catch (err) { return ok({ skipped: true, reason: String(err) }); }
  };

  // ================================================================
  // [RESULTS_VIEWS] — audit log of every public results-page lookup.
  //   Best-effort. Never throws. Never blocks the page.
  // ================================================================
  TIS.logResultsView = async function (entry) {
    try {
      const sb = await loadSdk();

      let ip_masked = null;
      try {
        const r = await fetch('https://api.ipify.org?format=json');
        const j = await r.json();
        const ip = String((j && j.ip) || '');
        const parts = ip.split('.');
        if (parts.length === 4) ip_masked = parts[0] + '.' + parts[1] + '.x.x';
        else ip_masked = ip ? ip.slice(0, 6) + '...' : null;
      } catch (e) { ip_masked = null; }

      const payload = {
        learner_id:  (entry && entry.learner_id != null) ? entry.learner_id : null,
        pin:         String((entry && entry.pin) || '').toUpperCase().slice(0, 32),
        term_type:   (entry && entry.term_type) || null,
        year:        (entry && entry.year) ? parseInt(entry.year, 10) : null,
        report_type: (entry && entry.report_type) || null,
        outcome:     (entry && entry.outcome) || 'ok',
        ip_masked:   ip_masked,
        user_agent:  String((navigator && navigator.userAgent) || '').slice(0, 400)
      };

      const r = await sb.from('results_views').insert(payload);
      if (r.error) return ok({ skipped: true, reason: r.error.message });
      return ok({ logged: true });
    } catch (err) {
      return ok({ skipped: true, reason: String(err) });
    }
  };

  // ================================================================
  // [FEE_SCHEDULE] — class-wide bill per class × term × year.
  //   listFeeSchedule(year?, term?)      — filter, or all if omitted
  //   getFeeScheduleRow(cls, term, year) — one row
  //   upsertFeeSchedule(row)             — insert or update one row
  //   deleteFeeSchedule(id)              — remove one row
  // ================================================================
  TIS.listFeeSchedule = async function (year, termType) {
    try {
      const sb = await loadSdk();
      let q = sb.from('fee_schedule')
        .select('*')
        .order('year', { ascending: false })
        .order('term_type', { ascending: true })
        .order('class_name', { ascending: true });
      if (year)     q = q.eq('year', year);
      if (termType) q = q.eq('term_type', termType);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getFeeScheduleRow = async function (className, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('fee_schedule')
        .select('*')
        .eq('class_name', className)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.upsertFeeSchedule = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = {
        class_name:        String(row.class_name || '').trim(),
        term_type:         String(row.term_type || '').trim(),
        year:              parseInt(row.year, 10),
        tuition:           Number(row.tuition || 0),
        other_bills_major: Number(row.other_bills_major || 0),
        other_bills_minor: Number(row.other_bills_minor || 0),
        books:             Number(row.books || 0),
        registration_fee:  Number(row.registration_fee  || 0),
        uniform:           Number(row.uniform           || 0),
        sportswear:        Number(row.sportswear        || 0),
        waist_coat:        Number(row.waist_coat        || 0),
        tie:               Number(row.tie               || 0),
        extra_lesson:      Number(row.extra_lesson      || 0),
        special_lesson:    Number(row.special_lesson    || 0),
        notes:             row.notes ? String(row.notes).slice(0, 500) : null,
        updated_at:        new Date().toISOString()
      };
      if (!payload.class_name || !payload.term_type || !payload.year) {
        return fail('class_name, term_type and year are required');
      }
      const { data, error } = await sb
        .from('fee_schedule')
        .upsert(payload, { onConflict: 'class_name,term_type,year' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };
  // ================================================================
  // [FEE_EXTRAS] — the seven optional items on a class bill.
  // Reads the class's row from fee_schedule and returns just the
  // extras slice, ordered the way the office prints them.
  // Used by the prospect sheet and the report card fee block.
  // ================================================================
  TIS.getFeeExtrasForClass = async function (className, termType, year) {
    try {
      const r = await TIS.getFeeScheduleRow(className, termType, year);
      if (!r.ok) return r;
      const row = r.data || {};
      const extras = [
        { item_key: 'registration_fee', item_label: 'Registration Fee',                default_amount: Number(row.registration_fee || 0), sort_order: 10, default_on: true },
        { item_key: 'uniform',          item_label: 'Uniform',                          default_amount: Number(row.uniform           || 0), sort_order: 20, default_on: true },
        { item_key: 'sportswear',       item_label: 'Sportswear',                       default_amount: Number(row.sportswear        || 0), sort_order: 30, default_on: true },
        { item_key: 'waist_coat',       item_label: 'Waist Coat',                       default_amount: Number(row.waist_coat        || 0), sort_order: 40, default_on: true },
        { item_key: 'tie',              item_label: 'Tie',                              default_amount: Number(row.tie               || 0), sort_order: 50, default_on: true },
        { item_key: 'extra_lesson',     item_label: 'Extra Lesson (3:00 – 4:30)',       default_amount: Number(row.extra_lesson      || 0), sort_order: 60, default_on: true },
        { item_key: 'special_lesson',   item_label: 'Special Lesson (4:30 – 5:30)',     default_amount: Number(row.special_lesson    || 0), sort_order: 70, default_on: true }
      ];
      return ok(extras);
    } catch (err) { return fail(err); }
  };
  TIS.deleteFeeSchedule = async function (id) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('fee_schedule').delete().eq('id', id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [FEE_ADJUSTMENTS] — per-learner additions and deductions.
  //   listFeeAdjustments(year?, term?)  — filter, or all if omitted
  //   getFeeAdjustment(learnerId,term,year) — one row
  //   listFeeAdjustmentsForLearners(ids, term, year) — many rows
  //   upsertFeeAdjustment(row)          — insert or update one row
  //   deleteFeeAdjustment(id)           — remove one row
  // ================================================================
  TIS.listFeeAdjustments = async function (year, termType) {
    try {
      const sb = await loadSdk();
      let q = sb.from('fee_adjustments')
        .select('*')
        .order('year', { ascending: false })
        .order('term_type', { ascending: true });
      if (year)     q = q.eq('year', year);
      if (termType) q = q.eq('term_type', termType);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getFeeAdjustment = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('fee_adjustments')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.listFeeAdjustmentsForLearners = async function (learnerIds, termType, year) {
    try {
      if (!learnerIds || learnerIds.length === 0) return ok([]);
      const sb = await loadSdk();
      const map = [];
      const CHUNK = 200;
      for (let i = 0; i < learnerIds.length; i += CHUNK) {
        const slice = learnerIds.slice(i, i + CHUNK);
        const { data, error } = await sb
          .from('fee_adjustments')
          .select('*')
          .eq('term_type', termType)
          .eq('year', year)
          .in('learner_id', slice);
        if (error) return fail(error.message);
        (data || []).forEach(function (r) { map.push(r); });
      }
      return ok(map);
    } catch (err) { return fail(err); }
  };

  TIS.upsertFeeAdjustment = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = {
        learner_id: parseInt(row.learner_id, 10),
        term_type:  String(row.term_type || '').trim(),
        year:       parseInt(row.year, 10),
        additions:  Number(row.additions || 0),
        deductions: Number(row.deductions || 0),
        reason:     row.reason ? String(row.reason).slice(0, 200) : null,
        notes:      row.notes  ? String(row.notes).slice(0, 500) : null,
        updated_at: new Date().toISOString()
      };
      if (!payload.learner_id || !payload.term_type || !payload.year) {
        return fail('learner_id, term_type and year are required');
      }
      const { data, error } = await sb
        .from('fee_adjustments')
        .upsert(payload, { onConflict: 'learner_id,term_type,year' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.deleteFeeAdjustment = async function (id) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('fee_adjustments').delete().eq('id', id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };
  // ================================================================
  // [AUDIT LOG] — record every operator write, with before/after
  //   snapshots so changes can be reviewed and (if safe) reversed.
  //   Best-effort: never blocks the underlying operation.
  // ================================================================
  TIS.logAudit = async function (entry) {
    try {
      const sb = await loadSdk();

      let actor_id = entry.actor_id || null;
      let actor_name = entry.actor_name || '';
      let actor_role = entry.actor_role || '';

      if (!actor_id) {
        try {
          const { data } = await sb.auth.getUser();
          if (data && data.user) actor_id = data.user.id;
        } catch (_) {}
      }

      let term_type = entry.term_type || null;
      let year      = entry.year || null;
      if (!term_type || !year) {
        try {
          const t = await TIS.getActiveTerm();
          if (t && t.ok && t.data) {
            term_type = term_type || t.data.term_type;
            year      = year      || t.data.year;
          }
        } catch (_) {}
      }

      const payload = {
        actor_id:    actor_id,
        actor_name:  String(actor_name || ''),
        actor_role:  String(actor_role || ''),
        action:      String(entry.action || '').trim(),
        entity_type: String(entry.entity_type || '').trim(),
        entity_id:   entry.entity_id != null ? String(entry.entity_id) : null,
        entity_name: String(entry.entity_name || '').slice(0, 200),
        before:      entry.before || null,
        after:       entry.after  || null,
        notes:       entry.notes ? String(entry.notes).slice(0, 500) : null,
        term_type:   term_type,
        year:        year
      };

      if (!payload.action || !payload.entity_type) {
        return ok({ skipped: true, reason: 'action and entity_type required' });
      }

      const r = await sb.from('audit_log').insert(payload).select().single();
      if (r.error) return ok({ skipped: true, reason: r.error.message });
      return ok({ logged: true, id: r.data.id });
    } catch (err) {
      return ok({ skipped: true, reason: String(err) });
    }
  };
  // ================================================================
  // [LEARNER_TERMS]
  // ================================================================
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

  TIS.getLearnerTermFor = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learner_terms').select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };
  // Returns { [learnerId]: totalAttendanceCount } for the given learner IDs,
  // summed across every term in the SAME academic year that comes BEFORE
  // the given exclude term. Used to compute "Brought Forward" for the
  // Learner Attendance register.
  //
  //   term_type ordering:  1st → 2nd → 3rd
  //   mark values:         'O O' = 0  |  '\' = 1  |  '/' = 1  |  '\ /' = 2
  //
  // Params:
  //   learnerIds        — array of learner UUIDs (or numeric ids) present in
  //                       the register you are viewing.
  //   academicYearStart — the integer year of the CURRENT term
  //                       (e.g. 2026 for 1ST TERM 2026/2027).
  //   excludeTermType   — '1st' | '2nd' | '3rd' — the current term. Terms
  //                       before this one (within the same year) are summed.
  TIS.getAttendanceTotalsInAcademicYear = async function (learnerIds, academicYearStart, excludeTermType) {
    try {
      if (!learnerIds || learnerIds.length === 0) return ok({});
      const sb = await loadSdk();

      // Determine which term_types count as "before" the current term.
      const ORDER = { '1st': 1, '2nd': 2, '3rd': 3 };
      const curRank = ORDER[excludeTermType] || 0;
      const priorTermTypes = Object.keys(ORDER).filter(function (t) {
        return ORDER[t] < curRank;
      });
      if (priorTermTypes.length === 0) return ok({});   // 1st term → no B/F

      // Fetch attendance rows for this academic year's prior terms.
      const { data, error } = await sb
        .from('attendance_learner')
        .select('learner_id, mark')
        .eq('year', academicYearStart)
        .in('term_type', priorTermTypes)
        .in('learner_id', learnerIds);
      if (error) return fail(error.message);

      const totals = {};
      (data || []).forEach(function (row) {
        const id = row.learner_id;
        if (totals[id] === undefined) totals[id] = 0;
        const m = row.mark;
        if (m === '\\')        totals[id] += 1;
        else if (m === '/')    totals[id] += 1;
        else if (m === '\\ /') totals[id] += 2;
        // 'O O' → 0
      });
      return ok(totals);
    } catch (err) { return fail(err); }
  };
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

      const slots = [1, 2, 3, 4, 5];
      let slot = null;
      for (var i = 0; i < slots.length; i++) {
        if (!row['part_payment_' + slots[i] + '_amount']) { slot = slots[i]; break; }
      }
      if (slot === null) return fail('All 5 part-payment slots are full. See Accounts.');

      const patch = {};
      patch['part_payment_' + slot + '_amount'] = String(amount);
      patch['part_payment_' + slot + '_date']   = dateISO || new Date().toISOString().slice(0, 10);

      const num = function (v) { return Number(String(v || '').replace(/[^0-9.\-]/g, '')) || 0; };
      let newTotal = 0;
      for (var j = 0; j < slots.length; j++) {
        const m = slots[j];
        const v = (m === slot) ? Number(amount) : num(row['part_payment_' + m + '_amount']);
        newTotal += v;
      }
      patch.total_part_payment = String(newTotal);

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

  // ================================================================
  // [ATTENDANCE_LEARNER]
  // ================================================================
 TIS.getAttendanceRegister = async function (className, termType, year) {
    try {
      const sb = await loadSdk();

      const learnerQ = await sb
        .from('learners')
        .select('id, pin, name, gender, date_of_birth, photo_url, class_name, date_of_withdrawal')
        .eq('class_name', className)
        .order('name', { ascending: true });
      if (learnerQ.error) return fail(learnerQ.error.message);
      const learners = (learnerQ.data || []).filter(function (l) {
        const w = (l.date_of_withdrawal || '').toString().trim();
        return !(w && w !== '' && w !== 'N/A');
      });

      const attQ = await sb
        .from('attendance_learner')
        .select('learner_id, attendance_date, mark')
        .eq('term_type', termType)
        .eq('year', year);
      if (attQ.error) return fail(attQ.error.message);

      const termQ = await sb
        .from('terms')
        .select('*')
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (termQ.error) return fail(termQ.error.message);
      const term = termQ.data;

      const holQ = await sb
        .from('academic_calendar')
        .select('event_date, event_type, is_holiday, holiday_name, description')
        .eq('term_type', termType)
        .eq('academic_year', term ? (term.year + '/' + (term.year + 1)) : '')
        .order('event_date', { ascending: true });
      const holidayMap = {};
      if (!holQ.error && holQ.data) {
        holQ.data.forEach(function (h) {
          if (h.is_holiday || h.event_type === 'Holiday') {
            holidayMap[h.event_date] = h.holiday_name || h.description || 'Holiday';
          }
        });
      }

      const marksByDate = {};
      (attQ.data || []).forEach(function (r) {
        if (!marksByDate[r.attendance_date]) marksByDate[r.attendance_date] = {};
        marksByDate[r.attendance_date][r.learner_id] = r.mark;
      });

      // Local-date helper. toISOString() reports UTC and, in timezones
      // ahead of UTC (Nigeria is UTC+1), shifts local-midnight back by
      // one calendar day. Every grid column was therefore labelled with
      // the date BEFORE the real school day. QR scans (which use the
      // true local date) landed on a row the grid never looked at, and
      // grid writes landed on the previous day. This helper returns the
      // local calendar date as YYYY-MM-DD, matching what QR writes and
      // what the office sees on the wall calendar.
      function localISO(d) {
        return d.getFullYear() + '-' +
               String(d.getMonth() + 1).padStart(2, '0') + '-' +
               String(d.getDate()).padStart(2, '0');
      }

      const today = localISO(new Date());
      const startISO = term ? term.start_date : null;
      const endISO   = term ? term.end_date   : null;
      const weeks = [];
      if (startISO && endISO) {
        // Parse the term start as a LOCAL date, not a UTC one.
        const startParts = String(startISO).split('-');
        let cursor = new Date(
          Number(startParts[0]),
          Number(startParts[1]) - 1,
          Number(startParts[2])
        );
        const dow = cursor.getDay();
        const offsetToMonday = (dow === 0 ? -6 : 1 - dow);
        cursor.setDate(cursor.getDate() + offsetToMonday);

        const endParts = String(endISO).split('-');
        const end = new Date(
          Number(endParts[0]),
          Number(endParts[1]) - 1,
          Number(endParts[2])
        );

        let weekNumber = 1;
        while (cursor <= end && weekNumber <= 20) {
          const days = [];
          for (let d = 0; d < 5; d++) {
            const day = new Date(
              cursor.getFullYear(),
              cursor.getMonth(),
              cursor.getDate() + d
            );
            const iso = localISO(day);
            const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][day.getDay()];
            const isHoliday = !!holidayMap[iso];
            const marksForLearner = marksByDate[iso] || {};
            const isFuture = iso > today;
            days.push({
              date: iso,
              dayName: dayName,
              isHoliday: isHoliday,
              holidayName: holidayMap[iso] || '',
              isFuture: isFuture,
              marksByLearner: marksForLearner
            });
          }
          const weekEnding = days[4].date;
          weeks.push({ weekNumber: weekNumber, weekEnding: weekEnding, days: days });
          cursor.setDate(cursor.getDate() + 7);
          weekNumber++;
        }
      }

      learners.forEach(function (l) {
        l.age = computeAge_(l.date_of_birth);
      });

      return ok({
        className: className,
        termType: termType,
        year: year,
        termLabel: term ? term.label : '',
        learners: learners,
        weeks: weeks
      });
    } catch (err) { return fail(err); }
  };

  function computeAge_(dobStr) {
    if (!dobStr) return '';
    const s = String(dobStr).trim();
    let d = null;
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    else d = new Date(s);
    if (!d || isNaN(d.getTime())) return '';
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const mm = today.getMonth() - d.getMonth();
    if (mm < 0 || (mm === 0 && today.getDate() < d.getDate())) age--;
    return age;
  }

  TIS.saveAttendanceMarks = async function (termType, year, marks, markedBy) {
    try {
      if (!marks || marks.length === 0) return ok({ applied: 0, deleted: 0 });
      const sb = await loadSdk();

      const toUpsert = [];
      const toDelete = [];
      marks.forEach(function (m) {
        if (!m.mark) toDelete.push(m);
        else toUpsert.push(m);
      });

      let applied = 0, deleted = 0;
      const CHUNK = 200;

      for (let i = 0; i < toDelete.length; i += CHUNK) {
        const slice = toDelete.slice(i, i + CHUNK);
        for (const d of slice) {
          await sb.from('attendance_learner')
            .delete()
            .eq('learner_id', d.learnerId)
            .eq('attendance_date', d.date);
        }
        deleted += slice.length;
      }

      for (let i = 0; i < toUpsert.length; i += CHUNK) {
        const slice = toUpsert.slice(i, i + CHUNK);
        const rows = slice.map(function (m) {
          return {
            learner_id:      m.learnerId,
            term_type:       termType,
            year:            year,
            attendance_date: m.date,
            mark:            m.mark,
            marked_by:       markedBy || '',
            marked_at:       new Date().toISOString()
          };
        });
        const r = await sb.from('attendance_learner')
          .upsert(rows, { onConflict: 'learner_id,attendance_date' });
        if (r.error) return fail(r.error.message);
        applied += rows.length;
      }
      return ok({ applied: applied, deleted: deleted });
    } catch (err) { return fail(err); }
  };

  TIS.shiftHoliday = async function (oldDate, newDate, holidayName) {
    try {
      const sb = await loadSdk();
      const { data: existing } = await sb
        .from('academic_calendar')
        .select('id')
        .eq('event_date', oldDate)
        .eq('is_holiday', true)
        .maybeSingle();
      if (existing && existing.id) {
        const { error } = await sb.from('academic_calendar')
          .update({ event_date: newDate, description: 'MOVED from ' + oldDate })
          .eq('id', existing.id);
        if (error) return fail(error.message);
      } else {
        const { error } = await sb.from('academic_calendar').insert({
          event_date: newDate,
          event_type: 'Holiday',
          is_holiday: true,
          holiday_name: holidayName || 'Holiday',
          description: 'MOVED from ' + oldDate
        });
        if (error) return fail(error.message);
      }
      return ok({ oldDate: oldDate, newDate: newDate });
    } catch (err) { return fail(err); }
  };
  TIS.moveHoliday = async function (fromDate, toDate, holidayName) {
    try {
      const sb = await loadSdk();

      // 1. Look up the holiday row currently on `fromDate`.
      const { data: existing, error: lookErr } = await sb
        .from('academic_calendar')
        .select('*')
        .eq('event_date', fromDate)
        .maybeSingle();
      if (lookErr) return fail(lookErr.message);

      // 2. If we found one, move it (delete the old, insert the new).
      //    This is simpler and safer than trying to update in place,
      //    because the table may have a unique constraint on event_date.
      if (existing) {
        const { error: delErr } = await sb
          .from('academic_calendar')
          .delete()
          .eq('id', existing.id);
        if (delErr) return fail(delErr.message);
      }

      // 3. Insert the moved holiday on the new date.
      const { data: inserted, error: insErr } = await sb
        .from('academic_calendar')
        .insert({
          event_date:    toDate,
          event_type:    'Holiday',
          is_holiday:    true,
          holiday_name:  holidayName || (existing && existing.holiday_name) || 'Holiday',
          description:   'MOVED from ' + fromDate,
          term_type:     existing ? existing.term_type : null,
          academic_year: existing ? existing.academic_year : null
        })
        .select()
        .single();
      if (insErr) return fail(insErr.message);

      return ok({ from: fromDate, to: toDate, holiday: inserted });
    } catch (err) { return fail(err); }
  };
  TIS.markWeekForLearners = async function (termType, year, learnerIds, dates, mark, markedBy) {
    const marks = [];
    learnerIds.forEach(function (id) {
      dates.forEach(function (d) { marks.push({ learnerId: id, date: d, mark: mark }); });
    });
    return TIS.saveAttendanceMarks(termType, year, marks, markedBy);
  };
  
  // ================================================================
  // [STAFF]
  // ================================================================
  TIS.listStaff = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff')
        .select('*')
        .order('full_name', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.getStaff = async function (id) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.createStaff = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff')
        .insert(row)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.updateStaff = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff')
        .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
        .eq('id', id)
        .select();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.deleteStaff = async function (id) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('staff').delete().eq('id', id);
      if (error) return fail(error.message);
      return ok({});
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [STORAGE] — public bucket "TISAssets"
  //   Folder layout:
  //     TISAssets/                          shared brand assets
  //     TISAssets/learners/<PIN>.png        one file per learner
  //     TISAssets/staff/<STAFFID>.png       one file per staff
  //   upsert:true means a re-upload replaces the existing file,
  //   so photo changes never leave orphans behind.
  // ================================================================
  TIS.uploadAsset = async function (folder, filename, file) {
    try {
      if (!file) return fail('No file provided.');
      const safeFolder   = String(folder   || '').trim().replace(/^\/+|\/+$/g, '');
      const safeFilename = String(filename || '').trim().replace(/^\/+|\/+$/g, '');
      if (!safeFolder || !safeFilename) return fail('Folder and filename are required.');
      const path = safeFolder + '/' + safeFilename;

      const sb = await loadSdk();
      const contentType = file.type || 'image/png';
      const { error: upErr } = await sb.storage
        .from('TISAssets')
        .upload(path, file, { upsert: true, contentType: contentType });
      if (upErr) return fail(upErr.message);

      const { data } = sb.storage.from('TISAssets').getPublicUrl(path);
      if (!data || !data.publicUrl) return fail('Upload succeeded but no public URL was returned.');
      return ok({ url: data.publicUrl, path: path });
    } catch (err) { return fail(err); }
  };

  TIS.deleteAsset = async function (folder, filename) {
    try {
      const safeFolder   = String(folder   || '').trim().replace(/^\/+|\/+$/g, '');
      const safeFilename = String(filename || '').trim().replace(/^\/+|\/+$/g, '');
      if (!safeFolder || !safeFilename) return fail('Folder and filename are required.');
      const path = safeFolder + '/' + safeFilename;

      const sb = await loadSdk();
      const { error } = await sb.storage.from('TISAssets').remove([path]);
      if (error) return fail(error.message);
      return ok({ path: path });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [STAFF_ATTENDANCE]
  // ================================================================
  TIS.listStaffAttendanceToday = async function (dateISO) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('attendance_staff')
        .select('*')
        .eq('attendance_date', dateISO);
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.upsertStaffAttendance = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
      const { data, error } = await sb
        .from('attendance_staff')
        .upsert(payload, { onConflict: 'staff_id,attendance_date' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.listStaffAttendanceRange = async function (fromISO, toISO) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('attendance_staff')
        .select('*')
        .gte('attendance_date', fromISO)
        .lte('attendance_date', toISO)
        .order('attendance_date', { ascending: false });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.listStaffMovementsToday = async function (dateISO) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_movements')
        .select('*')
        .eq('movement_date', dateISO)
        .order('time_out', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.createStaffMovement = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_movements')
        .insert(row)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.updateStaffMovement = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_movements')
        .update(Object.assign({}, patch, { updated_at: new Date().toISOString() }))
        .eq('id', id)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [STAFF_ATTENDANCE_DAILY] — new module for the redesigned
  // Staff Attendance tab. One method per action.
  // ================================================================

  TIS.listStaffAttendanceForDay = async function (dateISO) {
    try {
      const sb = await loadSdk();

      const [staffR, attR] = await Promise.all([
        sb.from('staff')
          .select('id, staff_id, full_name, surname, first_name, middle_name, department, resume_time, late_cutoff, status')
          .order('full_name', { ascending: true }),
        sb.from('attendance_staff')
          .select('*')
          .eq('attendance_date', dateISO)
      ]);

      if (staffR.error) return fail(staffR.error.message);
      if (attR.error)   return fail(attR.error.message);

      const attMap = {};
      (attR.data || []).forEach(function (r) { attMap[r.staff_id] = r; });

      const active = (staffR.data || []).filter(function (s) {
        return (s.status || 'Active') === 'Active';
      });

      const rows = active.map(function (s) {
        const a = attMap[s.id] || {};
        const fullName = s.full_name
          || [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ');
        return {
          staff_id:    s.id,
          staff_no:    s.staff_id || '',
          name:        fullName,
          department:  s.department || '',
          resume_time: s.resume_time || '',
          late_cutoff: s.late_cutoff || '',
          clock_in:    a.clock_in  || null,
          clock_out:   a.clock_out || null,
          status:      a.status    || null,
          note:        a.note      || null,
          row_id:      a.id        || null
        };
      });

      return ok({ date: dateISO, staff: rows });
    } catch (err) { return fail(err); }
  };

  TIS.listStaffAttendanceForMonth = async function (year, month) {
    try {
      const sb = await loadSdk();

      const firstISO = year + '-' + String(month).padStart(2, '0') + '-01';
      const lastDate = new Date(year, month, 0);
      const lastISO  = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDate.getDate()).padStart(2, '0');

      const [staffR, attR] = await Promise.all([
        sb.from('staff')
          .select('id, staff_id, full_name, surname, first_name, middle_name, department, resume_time, late_cutoff, status')
          .order('full_name', { ascending: true }),
        sb.from('attendance_staff')
          .select('*')
          .gte('attendance_date', firstISO)
          .lte('attendance_date', lastISO)
      ]);

      if (staffR.error) return fail(staffR.error.message);
      if (attR.error)   return fail(attR.error.message);

      const activeStaff = (staffR.data || []).filter(function (s) {
        return (s.status || 'Active') === 'Active';
      });

      const byDate = {};
      (attR.data || []).forEach(function (r) {
        if (!byDate[r.attendance_date]) byDate[r.attendance_date] = [];
        byDate[r.attendance_date].push(r);
      });

      const todayISO_ = new Date().toISOString().slice(0, 10);
      const days = [];
      for (let d = 1; d <= lastDate.getDate(); d++) {
        const iso = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const atts = byDate[iso] || [];
        const attMap = {};
        atts.forEach(function (a) { attMap[a.staff_id] = a; });

        const rows = activeStaff.map(function (s) {
          const a = attMap[s.id] || {};
          const fullName = s.full_name
            || [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ');
          return {
            staff_id:    s.id,
            staff_no:    s.staff_id || '',
            name:        fullName,
            department:  s.department || '',
            resume_time: s.resume_time || '',
            late_cutoff: s.late_cutoff || '',
            clock_in:    a.clock_in  || null,
            clock_out:   a.clock_out || null,
            status:      a.status    || null,
            note:        a.note      || null,
            row_id:      a.id        || null
          };
        });

        rows.sort(function (a, b) {
          const ai = a.clock_in || '99:99';
          const bi = b.clock_in || '99:99';
          if (ai !== bi) return ai < bi ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '');
        });

        days.push({
          date:        iso,
          arrived:     iso <= todayISO_,
          hasAnyMarks: atts.length > 0,
          staff:       rows
        });
      }

      return ok({ year: year, month: month, days: days });
    } catch (err) { return fail(err); }
  };

  TIS.listStaffMovementsForMonth = async function (year, month) {
    try {
      const sb = await loadSdk();

      const firstISO = year + '-' + String(month).padStart(2, '0') + '-01';
      const lastDate = new Date(year, month, 0);
      const lastISO  = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDate.getDate()).padStart(2, '0');

      const [staffR, mvR] = await Promise.all([
        sb.from('staff').select('id, staff_id, full_name, surname, first_name, middle_name, department'),
        sb.from('staff_movements').select('*')
          .gte('movement_date', firstISO)
          .lte('movement_date', lastISO)
      ]);

      if (staffR.error) return fail(staffR.error.message);
      if (mvR.error)    return fail(mvR.error.message);

      const staffMap = {};
      (staffR.data || []).forEach(function (s) {
        const fullName = s.full_name
          || [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ');
        staffMap[s.id] = {
          staff_id: s.id,
          staff_no: s.staff_id || '',
          name:     fullName,
          department: s.department || ''
        };
      });

      const byDate = {};
      (mvR.data || []).forEach(function (m) {
        if (!byDate[m.movement_date]) byDate[m.movement_date] = [];
        byDate[m.movement_date].push(m);
      });

      const days = [];
      for (let d = 1; d <= lastDate.getDate(); d++) {
        const iso = year + '-' + String(month).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const movements = (byDate[iso] || []).map(function (m) {
          const s = staffMap[m.staff_id] || {};
          return {
            id:          m.id,
            staff_id:    m.staff_id,
            staff_no:    s.staff_no || '',
            name:        s.name || '',
            department:  s.department || '',
            time_out:    m.time_out || null,
            time_in:     m.time_in  || null,
            reason:      m.reason      || null,
            destination: m.destination || null,
            purpose:     m.purpose     || null
          };
        }).sort(function (a, b) {
          const at = a.time_out || '99:99';
          const bt = b.time_out || '99:99';
          if (at !== bt) return at < bt ? -1 : 1;
          return (a.name || '').localeCompare(b.name || '');
        });

        days.push({ date: iso, movements: movements });
      }

      return ok({ year: year, month: month, days: days });
    } catch (err) { return fail(err); }
  };

  TIS.upsertStaffAttendance = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
      const { data, error } = await sb
        .from('attendance_staff')
        .upsert(payload, { onConflict: 'staff_id,attendance_date' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.closeStaffMovement = async function (id, timeIn) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_movements')
        .update({ time_in: timeIn, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.createStaffMovement = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_movements')
        .insert(row)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.archiveStaffMonth = async function (year, month) {
    try {
      const sb = await loadSdk();
      const firstISO = year + '-' + String(month).padStart(2, '0') + '-01';
      const lastDate = new Date(year, month, 0);
      const lastISO  = year + '-' + String(month).padStart(2, '0') + '-' + String(lastDate.getDate()).padStart(2, '0');

      const staffR = await sb.from('staff').select('id, staff_id, full_name, surname, first_name, middle_name');
      if (staffR.error) return fail(staffR.error.message);
      const staffMap = {};
      (staffR.data || []).forEach(function (s) {
        const fullName = s.full_name
          || [s.surname, s.first_name, s.middle_name].filter(Boolean).join(' ');
        staffMap[s.id] = { staff_no: s.staff_id || '', staff_name: fullName };
      });

      const attR = await sb.from('attendance_staff').select('*')
        .gte('attendance_date', firstISO)
        .lte('attendance_date', lastISO);
      if (attR.error) return fail(attR.error.message);

      const attRows = (attR.data || []).map(function (a) {
        const s = staffMap[a.staff_id] || {};
        return {
          staff_id:        a.staff_id,
          staff_no:        s.staff_no,
          staff_name:      s.staff_name,
          attendance_date: a.attendance_date,
          clock_in:        a.clock_in,
          clock_out:       a.clock_out,
          status:          a.status,
          remark:          a.note,
          archive_year:    year,
          archive_month:   month
        };
      });
      if (attRows.length > 0) {
        const insA = await sb.from('staff_attendance_archive').insert(attRows);
        if (insA.error) return fail(insA.error.message);
      }

      const mvR = await sb.from('staff_movements').select('*')
        .gte('movement_date', firstISO)
        .lte('movement_date', lastISO);
      if (mvR.error) return fail(mvR.error.message);

      const mvRows = (mvR.data || []).map(function (m) {
        const s = staffMap[m.staff_id] || {};
        return {
          staff_id:      m.staff_id,
          staff_no:      s.staff_no,
          staff_name:    s.staff_name,
          movement_date: m.movement_date,
