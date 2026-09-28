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
    { key: 'calendar',         label: 'Calendar',            defaultReadAll: false },
    { key: 'classes',          label: 'Classes',             defaultReadAll: false },
    { key: 'terms',            label: 'Terms & Promotion',   defaultReadAll: false },
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
      const { error } = await sb.from('users')
        .update({ authorities: authorities, updated_at: new Date().toISOString() })
        .or('operator_id.eq.' + id + ',id.eq.' + id);
      if (error) return fail(error.message);
      return ok({ id: id });
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
      calendar: { read: true, write: true, print: true },
      classes: { read: true, write: true, print: true },
      terms: { read: true, write: true, print: true },
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
      terms: { read: true, write: true, print: true },
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
      terms: { read: true, write: false, print: false },
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
      terms: { read: true, write: false, print: false },
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
