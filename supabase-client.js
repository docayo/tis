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
  //   Records PIN, term, year, report type, outcome, a masked IP and
  //   the user agent, so the school can see who is querying what.
  // ================================================================
  TIS.logResultsView = async function (entry) {
    try {
      const sb = await loadSdk();

      // Best-effort IP lookup. If it fails, ip_masked stays null
      // and the insert still goes ahead.
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
  // [AUDIT LOG] — record every operator write, with before/after
  //   snapshots so changes can be reviewed and (if safe) reversed.
  //   Best-effort: never blocks the underlying operation.
  // ================================================================
  TIS.logAudit = async function (entry) {
    try {
      const sb = await loadSdk();

      // Who is doing this? Read from the current auth user + State.profile
      // (the caller passes what they know; we fill what we can).
      let actor_id = entry.actor_id || null;
      let actor_name = entry.actor_name || '';
      let actor_role = entry.actor_role || '';

      if (!actor_id) {
        try {
          const { data } = await sb.auth.getUser();
          if (data && data.user) actor_id = data.user.id;
        } catch (_) {}
      }

      // Determine the current term so the log can be grouped by term.
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

      const today = new Date().toISOString().slice(0, 10);
      const startISO = term ? term.start_date : null;
      const endISO   = term ? term.end_date   : null;
      const weeks = [];
      if (startISO && endISO) {
        let cursor = new Date(startISO + 'T00:00:00');
        const dow = cursor.getDay();
        const offsetToMonday = (dow === 0 ? -6 : 1 - dow);
        cursor.setDate(cursor.getDate() + offsetToMonday);

        const end = new Date(endISO + 'T00:00:00');
        let weekNumber = 1;
        while (cursor <= end && weekNumber <= 20) {
          const days = [];
          for (let d = 0; d < 5; d++) {
            const day = new Date(cursor.getTime());
            day.setDate(day.getDate() + d);
            const iso = day.toISOString().slice(0, 10);
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
          time_out:      m.time_out,
          time_in:       m.time_in,
          reason:        m.reason,
          destination:   m.destination,
          purpose:       m.purpose,
          archive_year:  year,
          archive_month: month
        };
      });
      if (mvRows.length > 0) {
        const insM = await sb.from('staff_movements_archive').insert(mvRows);
        if (insM.error) return fail(insM.error.message);
      }

      const stampA = await sb.from('attendance_staff')
        .update({ month_archived: true })
        .gte('attendance_date', firstISO)
        .lte('attendance_date', lastISO);
      if (stampA.error) return fail(stampA.error.message);

      const stampM = await sb.from('staff_movements')
        .update({ month_archived: true })
        .gte('movement_date', firstISO)
        .lte('movement_date', lastISO);
      if (stampM.error) return fail(stampM.error.message);

      return ok({
        year: year, month: month,
        attendance_rows: attRows.length,
        movement_rows:   mvRows.length
      });
    } catch (err) { return fail(err); }
  };

  TIS.listArchivedStaffMonths = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('staff_attendance_archive')
        .select('archive_year, archive_month');
      if (error) return fail(error.message);

      const buckets = {};
      (data || []).forEach(function (r) {
        const key = r.archive_year + '-' + String(r.archive_month).padStart(2, '0');
        if (!buckets[key]) buckets[key] = { year: r.archive_year, month: r.archive_month, attendance_count: 0 };
        buckets[key].attendance_count++;
      });
      const list = Object.values(buckets).sort(function (a, b) {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      return ok(list);
    } catch (err) { return fail(err); }
  };

  TIS.getArchivedStaffMonth = async function (year, month) {
    try {
      const sb = await loadSdk();
      const [attR, mvR] = await Promise.all([
        sb.from('staff_attendance_archive').select('*')
          .eq('archive_year', year).eq('archive_month', month)
          .order('attendance_date', { ascending: true }),
        sb.from('staff_movements_archive').select('*')
          .eq('archive_year', year).eq('archive_month', month)
          .order('movement_date', { ascending: true })
      ]);
      if (attR.error) return fail(attR.error.message);
      if (mvR.error)  return fail(mvR.error.message);
      return ok({
        year: year,
        month: month,
        attendance: attR.data || [],
        movements:  mvR.data || []
      });
    } catch (err) { return fail(err); }
  };
  // ================================================================
  // [QR] — snake_case columns
  // ================================================================
  TIS.getActiveQRToken = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('qr_tokens')
        .select('*')
        .eq('is_active', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.generateQRToken = async function (operatorName) {
    try {
      const sb = await loadSdk();

      const deact = await sb
        .from('qr_tokens')
        .update({ is_active: false })
        .eq('is_active', true);
      if (deact.error) return fail(deact.error.message);

      const token = 'QR' + Date.now() + Math.random().toString(36).substring(2, 12).toUpperCase();
      const now = new Date().toISOString();
      const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

      const insert = await sb
        .from('qr_tokens')
        .insert({
          token:           token,
          generated_by:    operatorName || 'Portal',
          generated_at:    now,
          expires_at:      expires,
          is_active:       true,
          regenerated_by:  operatorName || 'Portal',
          regenerated_at:  now
        })
        .select()
        .single();
      if (insert.error) return fail(insert.error.message);

      return ok(insert.data);
    } catch (err) { return fail(err); }
  };

  TIS.getQRTokenByValue = async function (token) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('qr_tokens')
        .select('*')
        .eq('token', token)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [TERMS]
  // ================================================================
  TIS.listTerms = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('terms')
        .select('*')
        .order('year', { ascending: false });
      if (error) return fail(error.message);
      const rows = data || [];
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
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('terms')
        .select('*')
        .eq('is_active', true)
        .limit(1);
      if (error) return fail(error.message);
      return ok((data && data[0]) || null);
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

  // ================================================================
  // [PROMOTION]
  // ================================================================
  TIS.getPromotionStatus = async function () {
    try {
      const active = await TIS.getActiveTerm();
      if (!active.ok || !active.data) return ok({ needsTermPromotion: false });
      const t = active.data;

      let nextType, nextYear;
      if (t.term_type === '1st') { nextType = '2nd'; nextYear = t.year; }
      else if (t.term_type === '2nd') { nextType = '3rd'; nextYear = t.year; }
      else { nextType = '1st'; nextYear = Number(t.year) + 1; }

      const today = new Date().toISOString().slice(0, 10);
      const endDate = t.end_date || '';
      if (!endDate || today <= endDate) {
        return ok({
          needsTermPromotion: false,
          activeTerm: t,
          nextTerm: { term_type: nextType, year: nextYear }
        });
      }

      const sb = await loadSdk();
      const learnersR = await sb.from('learners').select('id, date_of_withdrawal');
      if (learnersR.error) return fail(learnersR.error.message);
      const activeLearnerIds = (learnersR.data || [])
        .filter(function (l) {
          const w = (l.date_of_withdrawal || '').toString().trim();
          return !(w && w !== '' && w !== 'N/A');
        })
        .map(function (l) { return l.id; });

      if (activeLearnerIds.length === 0) {
        return ok({ needsTermPromotion: false, activeTerm: t });
      }

      const termsR = await sb
        .from('learner_terms')
        .select('learner_id')
        .eq('term_type', nextType)
        .eq('year', nextYear)
        .in('learner_id', activeLearnerIds);
      if (termsR.error) return fail(termsR.error.message);

      const haveIds = {};
      (termsR.data || []).forEach(function (r) { haveIds[r.learner_id] = true; });
      const pending = activeLearnerIds.filter(function (id) { return !haveIds[id]; });

      return ok({
        needsTermPromotion: pending.length > 0,
        activeTerm: t,
        nextTerm: { term_type: nextType, year: nextYear },
        pendingLearners: pending.length,
        totalActive: activeLearnerIds.length
      });
    } catch (err) { return fail(err); }
  };

  TIS.termPromote = async function (fromTermType, fromYear, toTermType, toYear, learnerIds) {
    try {
      if (!learnerIds || learnerIds.length === 0) return ok({ created: 0 });
      const sb = await loadSdk();

      const fromR = await sb
        .from('learner_terms')
        .select('learner_id, balance_cf, class_name')
        .eq('term_type', fromTermType)
        .eq('year', fromYear)
        .in('learner_id', learnerIds);
      if (fromR.error) return fail(fromR.error.message);
      const fromMap = {};
      (fromR.data || []).forEach(function (r) { fromMap[r.learner_id] = r; });

      const existingR = await sb
        .from('learner_terms')
        .select('learner_id')
        .eq('term_type', toTermType)
        .eq('year', toYear)
        .in('learner_id', learnerIds);
      if (existingR.error) return fail(existingR.error.message);
      const existsSet = {};
      (existingR.data || []).forEach(function (r) { existsSet[r.learner_id] = true; });

      const rowsToInsert = [];
      learnerIds.forEach(function (id) {
        if (existsSet[id]) return;
        const from = fromMap[id];
        rowsToInsert.push({
          learner_id: id,
          term_type: toTermType,
          year: toYear,
          class_name: from ? from.class_name : null,
          balance_bf: from && from.balance_cf ? String(from.balance_cf) : null,
          total_part_payment: '0',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      });

      if (rowsToInsert.length === 0) return ok({ created: 0 });

      const CHUNK = 100;
      let created = 0;
      for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
        const slice = rowsToInsert.slice(i, i + CHUNK);
        const ins = await sb.from('learner_terms').insert(slice);
        if (ins.error) return fail(ins.error.message);
        created += slice.length;
      }
      return ok({ created: created });
    } catch (err) { return fail(err); }
  };

  TIS.yearPromote = async function (promotions) {
    if (!promotions || promotions.length === 0) return ok({ applied: 0 });
    return TIS.promoteLearners(promotions);
  };

  TIS.getLearnersForClasses = async function (classNames) {
    try {
      const sb = await loadSdk();
      let q = sb.from('learners').select('*').order('name', { ascending: true });
      if (classNames && classNames.length > 0) {
        q = q.in('class_name', classNames);
      }
      const { data, error } = await q;
      if (error) return fail(error.message);
      const filtered = (data || []).filter(function (l) {
        const w = (l.date_of_withdrawal || '').toString().trim();
        return !(w && w !== '' && w !== 'N/A');
      });
      return ok(filtered);
    } catch (err) { return fail(err); }
  };

  TIS.promoteLearners = async function (promotions) {
    try {
      if (!promotions || promotions.length === 0) return ok({ applied: 0 });
      const sb = await loadSdk();
      const CHUNK = 50;
      let applied = 0;
      for (let i = 0; i < promotions.length; i += CHUNK) {
        const slice = promotions.slice(i, i + CHUNK);
        await Promise.all(slice.map(function (p) {
          return sb.from('learners')
            .update({ class_name: p.newClassName, updated_at: new Date().toISOString() })
            .eq('id', p.learnerId);
        }));
        applied += slice.length;
      }
      return ok({ applied: applied });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [CLASSES]
  // ================================================================
  TIS.listClasses = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('classes')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.createClass = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = {
        name:       row.name || row.className,
        level:      row.level || null,
        stream:     row.stream || null,
        next_class: row.next_class || row.nextClass || null,
        is_active:  true,
        notes:      row.notes || null
      };
      const { data, error } = await sb.from('classes').insert(payload).select().single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.updateClass = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.from('classes').update(patch).eq('id', id).select();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.deleteClass = async function (id) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('classes').delete().eq('id', id);
      if (error) return fail(error.message);
      return ok({});
    } catch (err) { return fail(err); }
  };

  TIS.getNextClass = async function (currentClassName) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('classes')
        .select('next_class')
        .eq('name', currentClassName)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data ? data.next_class : null);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [CLASS_SUBJECTS] — read and write the slot map per class
  //   Slot numbers 1..18 (extendable). A slot can be empty (unused)
  //   or bound to one subject_code.
  // ================================================================
  TIS.getClassSubjects = async function (className) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('class_subjects')
        .select('slot, subject_code')
        .eq('class_name', className)
        .order('slot', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.setClassSubjects = async function (className, mappings) {
    try {
      const sb = await loadSdk();

      // 1. Delete all current mappings for this class.
      const del = await sb
        .from('class_subjects')
        .delete()
        .eq('class_name', className);
      if (del.error) return fail(del.error.message);

      // 2. Insert the new set (skipping any empty slots).
      const rows = (mappings || [])
        .filter(function (m) { return m && m.slot && m.subject_code; })
        .map(function (m) {
          return {
            class_name:   className,
            slot:         Number(m.slot),
            subject_code: String(m.subject_code).toUpperCase()
          };
        });

      if (rows.length === 0) return ok({ class_name: className, count: 0 });

      const ins = await sb.from('class_subjects').insert(rows);
      if (ins.error) return fail(ins.error.message);

      return ok({ class_name: className, count: rows.length });
    } catch (err) { return fail(err); }
  };
  TIS.listSubjects = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('subjects')
        .select('code, display_name, is_active')
        .eq('is_active', true)
        .order('display_name', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [SCORES] — read and write the CBT scores table
  // ================================================================
   TIS.getScoresForLearners = async function (learnerIds, termType, year) {
    try {
      if (!learnerIds || learnerIds.length === 0) return ok({});
      const sb = await loadSdk();
      const map = {};
      const CHUNK = 200;
      for (let i = 0; i < learnerIds.length; i += CHUNK) {
        const slice = learnerIds.slice(i, i + CHUNK);
        const { data, error } = await sb
          .from('scores')
          .select('learner_id, subject_code, test1, test2, exam, total, grade, remark')
          .eq('term_type', termType)
          .eq('year', year)
          .in('learner_id', slice);
        if (error) return fail(error.message);
        (data || []).forEach(function (row) {
          map[row.learner_id + '|' + row.subject_code] = row;
        });
      }
      return ok(map);
    } catch (err) { return fail(err); }
  };

  TIS.upsertScore = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('scores')
        .upsert(row, { onConflict: 'learner_id,subject_code,term_type,year' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.listClassAliases = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('class_aliases')
        .select('upload_code, canonical_name');
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [RESULTS HELPERS]
  // ================================================================
  TIS.getClassPopulation = async function (className) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learners')
        .select('id, date_of_withdrawal')
        .eq('class_name', className);
      if (error) return fail(error.message);
      const active = (data || []).filter(function (l) {
        const w = (l.date_of_withdrawal || '').toString().trim();
        return !(w && w !== '' && w !== 'N/A');
      });
      return ok(active.length);
    } catch (err) { return fail(err); }
  };

  TIS.getAttendanceSummaryForTerm = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('attendance_learner')
        .select('mark')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year);
      if (error) return fail(error.message);

      let present = 0;
      (data || []).forEach(function (r) {
        const m = r.mark;
        if (m === '\\') present += 1;
        else if (m === '/') present += 1;
        else if (m === '\\ /') present += 2;
      });

      // "Times opened" — count school days in the term from the calendar.
      let opened = 0;
      try {
        const termQ = await sb
          .from('terms')
          .select('start_date, end_date')
          .eq('term_type', termType)
          .eq('year', year)
          .maybeSingle();
        if (!termQ.error && termQ.data && termQ.data.start_date && termQ.data.end_date) {
          const start = new Date(termQ.data.start_date + 'T00:00:00');
          const end   = new Date(termQ.data.end_date   + 'T00:00:00');
          // Count weekdays between start and end, excluding holidays.
          const holQ = await sb
            .from('academic_calendar')
            .select('event_date, is_holiday, event_type')
            .eq('term_type', termType)
            .gte('event_date', termQ.data.start_date)
            .lte('event_date', termQ.data.end_date);
          const holSet = {};
          (holQ && holQ.data ? holQ.data : []).forEach(function (h) {
            if (h.is_holiday || h.event_type === 'Holiday') holSet[h.event_date] = true;
          });
          let cur = new Date(start.getTime());
          while (cur <= end) {
            const dow = cur.getDay();
            if (dow >= 1 && dow <= 5) {
              const iso = cur.toISOString().slice(0, 10);
              if (!holSet[iso]) opened += 2;   // M + A slots per day
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      } catch (e) { /* non-fatal */ }

      const absent = Math.max(0, opened - present);
      return ok({ opened: opened, present: present, absent: absent });
    } catch (err) { return fail(err); }
  };

     TIS.getResumptionDate = async function (termType, year) {
    try {
      const sb = await loadSdk();
      const y = Number(year);

      // Which calendar row carries the NEXT term's resumption?
      //   1st term of year N → look for RESUMPTION (SECOND TERM) in year N / N+1
      //   2nd term of year N → look for RESUMPTION (THIRD TERM)  in year N / N+1
      //   3rd term of year N → look for RESUMPTION (FIRST TERM)  in year N+1 / N+2
      //
      // The academic_year column is stored as "YYYY/YYYY" (e.g. "2026/2027").
      // No dates are hard-coded — the search key is the calendar tag itself,
      // so a future calendar upload with the same tags will be found.
      let key, academicYear;
      if (termType === '1st') {
        key = '%RESUMPTION (SECOND TERM)%';
        academicYear = y + '/' + (y + 1);
      } else if (termType === '2nd') {
        key = '%RESUMPTION (THIRD TERM)%';
        academicYear = y + '/' + (y + 1);
      } else {
        key = '%RESUMPTION (FIRST TERM)%';
        academicYear = (y + 1) + '/' + (y + 2);
      }

      const r = await sb
        .from('academic_calendar')
        .select('event_date, description, academic_year')
        .ilike('description', key)
        .eq('academic_year', academicYear)
        .order('event_date', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (r.error) return fail(r.error.message);
      if (!r.data || !r.data.event_date) return ok(null);
      return ok(r.data.event_date);
    } catch (err) { return fail(err); }
  };
  TIS.getScoresForTerm = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('scores')
        .select('subject_code, test1, test2, exam, total, grade, remark')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year);
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };
  TIS.getLearnerTermRecord = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('learner_terms')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [REPORT_RATINGS] — psychomotor + comments per learner × term
  // ================================================================
  TIS.getReportRatings = async function (learnerId, termType, year) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('report_ratings')
        .select('*')
        .eq('learner_id', learnerId)
        .eq('term_type', termType)
        .eq('year', year)
        .maybeSingle();
      if (error) return fail(error.message);
      return ok(data || null);
    } catch (err) { return fail(err); }
  };

  TIS.upsertReportRating = async function (row) {
    try {
      const sb = await loadSdk();
      const payload = Object.assign({}, row, { updated_at: new Date().toISOString() });
      const { data, error } = await sb
        .from('report_ratings')
        .upsert(payload, { onConflict: 'learner_id,term_type,year' })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [COMMENT_BANK] — read and pick
  // ================================================================
  TIS.getCommentBank = async function (field, band) {
    try {
      const sb = await loadSdk();
      let q = sb
        .from('comment_bank')
        .select('id, field, band, category, text')
        .eq('is_active', true);
      if (field) q = q.eq('field', field);
      if (band)  q = q.eq('band', band);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.listCommentBank = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('comment_bank')
        .select('id, field, band, category, text, is_active, created_at')
        .order('field', { ascending: true })
        .order('band', { ascending: true })
        .order('category', { ascending: true })
        .order('id', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };

  TIS.createCommentBank = async function (row) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('comment_bank')
        .insert({
          field:    String(row.field || '').trim(),
          band:     String(row.band  || '').trim(),
          category: String(row.category || 'general').trim(),
          text:     String(row.text || '').trim(),
          is_active: row.is_active !== false
        })
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.updateCommentBank = async function (id, patch) {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('comment_bank')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) return fail(error.message);
      return ok(data);
    } catch (err) { return fail(err); }
  };

  TIS.deleteCommentBank = async function (id) {
    try {
      const sb = await loadSdk();
      const { error } = await sb.from('comment_bank').delete().eq('id', id);
      if (error) return fail(error.message);
      return ok({ id: id });
    } catch (err) { return fail(err); }
  };

  // ================================================================
  // [RATINGS] — helper that maps a score band to a descriptive band
  //   Used by both auto-assign and the renderer.
  // ================================================================
  TIS.bandForAverage = function (average) {
    if (average >= 80) return 'excellent';
    if (average >= 70) return 'very_good';
    if (average >= 60) return 'good';
    if (average >= 50) return 'average';
    if (average >= 40) return 'fair';
    return 'poor';
  };
  // ================================================================
  // [CALENDAR]
  // ================================================================
  TIS.getCalendar = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb
        .from('academic_calendar')
        .select('*')
        .order('event_date', { ascending: true });
      if (error) return fail(error.message);
      return ok(data || []);
    } catch (err) { return fail(err); }
  };
  TIS.listCalendar = TIS.getCalendar;

  // ================================================================
  // [USERS]
  // ================================================================
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

      // Step 1 — look up the real UUID from the operator_id.
      const lookup = await sb
        .from('users')
        .select('id')
        .eq('operator_id', id)
        .maybeSingle();
      if (lookup.error) return fail(lookup.error.message);
      if (!lookup.data || !lookup.data.id) {
        return fail('No user found with operator_id "' + id + '"');
      }

      // Step 2 — update by UUID only. This avoids Postgres trying to
      // cast a value like "03" to the uuid column, which is what threw
      // the "invalid input syntax for type uuid" error.
      const uuid = lookup.data.id;
      const { error } = await sb.from('users')
        .update({ authorities: authorities, updated_at: new Date().toISOString() })
        .eq('id', uuid);
      if (error) return fail(error.message);
      return ok({ id: id, uuid: uuid });
    } catch (err) { return fail(err); }
  };

  TIS.getAllUsers = async function () {
    try {
      const sb = await loadSdk();
      const { data, error } = await sb.from('users')
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
      results: { read: true, write: true, print: true },
      calendar: { read: true, write: true, print: true },
      classes: { read: true, write: true, print: true },
      terms: { read: true, write: true, print: true },
      users: { read: true, write: true, print: true },
      idcards: { read: true, write: true, print: true }
    };
    const admin = {
      learners: { read: true, write: true, print: true },
      staff: { read: true, write: true, print: true },
      attendance: { read: true, write: true, print: true },
      staff_attendance: { read: true, write: true, print: true },
      broadsheet: { read: true, write: true, print: true },
      reports: { read: true, write: true, print: true },
      results: { read: true, write: true, print: true },
      calendar: { read: true, write: true, print: true },
      classes: { read: true, write: false, print: true },
      terms: { read: true, write: true, print: true },
      users: { read: true, write: false, print: true },
      idcards: { read: true, write: true, print: true }
    };
    const teacher = {
      learners: { read: true, write: false, print: false },
      staff: { read: false, write: false, print: false },
      attendance: { read: true, write: true, print: false },
      staff_attendance: { read: true, write: false, print: false },
      broadsheet: { read: true, write: true, print: false },
      reports: { read: true, write: false, print: false },
      results: { read: true, write: false, print: false },
      calendar: { read: true, write: false, print: false },
      classes: { read: true, write: false, print: false },
      terms: { read: true, write: false, print: false },
      users: { read: false, write: false, print: false },
      idcards: { read: true, write: false, print: false }
    };
    const operator = {
      learners: { read: true, write: false, print: true },
      staff: { read: true, write: false, print: false },
      attendance: { read: true, write: true, print: true },
      staff_attendance: { read: true, write: true, print: true },
      broadsheet: { read: true, write: false, print: true },
      reports: { read: true, write: false, print: true },
      results: { read: true, write: false, print: true },
      calendar: { read: true, write: false, print: false },
      classes: { read: true, write: false, print: false },
      terms: { read: true, write: false, print: false },
      users: { read: false, write: false, print: false },
      idcards: { read: true, write: false, print: false }
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

  // ================================================================
  // Expose + boot
  // ================================================================
  loadSdk().catch(function (e) {
    console.warn('[TIS] Supabase SDK preload failed:', e.message);
  });

  window.TIS = window.TIS || {};
  Object.assign(window.TIS, TIS);
  console.log('[TIS] Supabase client ready with', Object.keys(TIS).length, 'methods.');

})();
// ================================================================
// END OF supabase-client.js
// ================================================================
