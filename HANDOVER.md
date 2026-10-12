# TIS EMIS — MASTER HANDOVER

**Project:** The Ideal Schools — Operational Portal & Databank
**Owner:** Dr Ayoola Gabriel Ololade FCIA. NIIA — ayonio@gmail.com — 08067071557
**Last updated:** 5 October 2026

---

## HOW TO USE THIS DOCUMENT

This file is the **entry point** for any new developer or AI taking over
the project. It is deliberately short. Read it first.

After reading this file, consult:

- **`REFERENCE.md`** — database schemas, `app.js` section map,
  `supabase-client.js` method list, absolute rules, coding conventions.
- **`HISTORY.md`** — the session-by-session log of how the project got
  here.

**Live copies:**
- https://tis-tan.vercel.app/handover
- https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md
- https://raw.githubusercontent.com/docayo/tis/main/REFERENCE.md
- https://raw.githubusercontent.com/docayo/tis/main/HISTORY.md

---

## PART 0 — EMERGENCY CARD

### Where things live

| Asset | Location |
|---|---|
| Live portal | `https://tis-tan.vercel.app` |
| Public results page | `https://tis-tan.vercel.app/r` and `/r/<PIN>` |
| Recovery page | `https://tis-tan.vercel.app/rec` |
| Handover (this doc) | `https://tis-tan.vercel.app/handover` |
| GitHub code repo | `github.com/docayo/tis` |
| GitHub backups repo | `github.com/docayo/tis-backups` |
| Supabase project | `https://ndsroviwrfjbgaucajri.supabase.co` |
| Supabase dashboard | `https://supabase.com/dashboard/project/ndsroviwrfjbgaucajri` |
| Vercel dashboard | `vercel.com/dashboard` |
| Sealed recovery codes | Physical envelope in school safe |
| Recovery email | `theidealschools15@gmail.com` (also `ayonio@gmail.com`) |

### First three checks before doing ANYTHING

1. **Is it you or everyone?** Open the portal in a different browser,
   or on a phone with mobile data. If it works there → it is your
   device or the school Wi-Fi. Do NOT run recovery.
2. **Is Supabase itself up?** Open `https://status.supabase.com`.
   If down → wait. Do NOT run recovery while Supabase is offline.
3. **One wrong record or the whole database wrong?** If one record →
   use the portal's edit tools, NOT recovery.

### If the portal loads but is broken (JS errors)

Nine times out of ten, it is stale cache. Test in **incognito with
`?v=<Date.now()>`** before diagnosing.

If it is a real error and you know which commit broke it:

1. Go to `github.com/docayo/tis/commits/main/app.js`
2. Click the commit before the broken one
3. Click `<>` → app.js → Raw → Ctrl+A / Ctrl+C
4. Go to app.js on main, Edit, Ctrl+A, Delete, Paste
5. Commit `Revert app.js to last working state`
6. Vercel deploys in 30 seconds

### Recovery

Visit `/rec`. Request a key (emailed to the school inbox, valid 30
minutes). Or use a sealed code from the safe. Verify. Then follow
`REC.md` in the repo root.

### Do NOT do these things

- Delete the old Supabase project until the new one is verified for 24 hours.
- Run UPDATE or DELETE SQL without a WHERE clause.
- Push to GitHub main during a recovery.
- Share the recovery key.
- Assume an error is real until you have tested in incognito.

### Contacts

| Role | Name | Phone | Email |
|---|---|---|---|
| Owner | Dr Ayoola Gabriel Ololade FCIA. NIIA | 08067071557 | ayonio@gmail.com |
| Admin | Dr Mrs Ayoola Oseyemi O | 08027270404 | oseyemio3@gmail.com |
| School | — | — | theidealschools15@gmail.com |

---

## PART 1 — WHAT IS LIVE TODAY

State as of 5 October 2026.

### Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JS + HTML + CSS on Vercel |
| Backend | Supabase (Postgres 17) |
| Auth | Supabase Auth (`@tis.local` email domain) |
| Storage | Supabase Storage, public bucket `TISAssets` |
| Edge Functions | Deno — `send-recovery-key`, `verify-recovery-key` |
| Email | Resend (free tier) |
| Backups | GitHub Actions → `tis-backups` repo, monthly |

### Modules that work end to end

1. **Login** — operators 01–04 via Supabase Auth.
2. **Users & Permissions** — per-module read/write/print grid.
3. **Learners** — 148+ records. Grid, search, view (3-tier),
   edit, add, photo upload, print (A4 + 80mm), bulk Excel.
4. **Staff** — 16 records. Grid, view, edit, add, photo, print,
   active/inactive filter.
5. **Terms & Promotion** — activate terms, promote learners,
   exit learners with reason.
6. **Learner Attendance** — full register with morning/afternoon,
   holiday adjuster, class analysis, per-day breakdown, week
   signatures, B/F + AY Total.
7. **Staff Attendance** — month view, daily tables, movement log,
   auto-archive. Inactive staff filtered. Future days hidden.
8. **Calendar** — 53+ events by academic year and term.
9. **Classes** — 26 classes in academic order. Manage Subjects
   per class — the slot map that drives the CBT pipeline.
10. **Reports** — the Workshop. Fill in psychomotor ratings and
    comments per learner per term. Auto-assigned when scores
    upload; editable here; human-edited rows never overwritten.
11. **Results** — in-portal report card viewer. Loads by PIN.
    Termly (1st and 2nd) or sessional (3rd). Print on demand.
12. **ID Cards** — portrait CR80, 3 × 3 A4 grid, ZIP export of
    Front + Back PNGs (662 × 1036 px @ 300 DPI with 2 mm bleed).
13. **QR** — `/g/<token>` staff gate QR. `/s/<code>` per-person
    card QR. Learner → attendance. Staff → smart clock flow.
    Visitor → check-in/out. Auto-close after 7 seconds.
14. **Broad Sheet & Scores** — Download Template (scoped to
    Class / Subject / School / Student). Upload Filled File
    (importer with conflict modal). Auto-assign after import.
15. **Recovery system** — `/rec` page + Edge Functions + Resend
    + 9 sealed backup codes in the safe.
16. **Public Results Page** — `/r` and `/r/<PIN>`, login-free,
    print-only, clearance gate covers scores for not-cleared
    learners, every lookup logged to `results_views`.
17. **Fees Module** — `fee_schedule` (class × term × year bill),
    `fee_adjustments` (per-learner additions and deductions).
    Panel inside the Terms tab. Feeds the fee breakdown table
    on the report card.
18. **Report Card** — termly and sessional. Includes watermark,
    inline-SVG header, learner photo, subject table, psychomotor
    ratings, fee breakdown, stats, comments, LIN, PROMOTED TO,
    bottom row with stamp / performance chart / QR code.

### Data current state

| Table | Rows | Purpose |
|---|---|---|
| users | 4 | Operators 01–04 |
| learners | 148+ | Learner records |
| learner_terms | 592+ | Fee rows per term |
| staff | 16 | Staff roster |
| terms | 3 | Academic terms |
| classes | 26 | Canonical class list |
| subjects | 25 | Master subject list |
| class_subjects | 231 | Slot map per class |
| class_aliases | 28 | Upload code → canonical |
| scores | varies | Learner × subject × term × year |
| report_ratings | varies | Psychomotor + comments |
| comment_bank | 336 | Pre-written comments |
| attendance_learner | varies | Daily marks |
| attendance_staff | varies | Clock in/out |
| staff_movements | varies | Movement log |
| qr_tokens | varies | Active gate token |
| recovery_codes | 10 | Live + sealed |
| recovery_attempts | varies | Audit log |
| visits | varies | Visitor in/out |
| scan_events | varies | Every card scan |
| audit_log | varies | Operator write log (partial) |
| results_views | varies | Public lookup log |
| fee_schedule | varies | Class bill per class × term × year |
| fee_adjustments | varies | Per-learner additions and deductions |

Full schemas in `REFERENCE.md`.

### Data conventions

| Item | Value |
|---|---|
| Academic year | `2026/2027` — derived from year + 1 |
| Term labels | `1ST TERM 2026/2027`, etc. |
| Attendance marks | `O O` absent · `\` morning · `/` afternoon · `\ /` both |
| Money | `₦18,000.00` |
| Login key | `operator_id` (`01`–`04`) |
| Auth email | `<operator_id>@tis.local` |
| Score bands | ≥80 excellent · 70–79 very_good · 60–69 good · 50–59 average · 40–49 fair · <40 poor |
| Grades | A / B / C / D / E / F matched to bands |
| Storage bucket | `TISAssets` (public) |
| Photo filenames | Learners `<PIN>.png`. Staff `<STAFF_ID>.png` |
| Public results path | `/r/<PIN>` |
| Stamp URL | `TISAssets/stamp and signed.gif` |

### Class list (26, in academic order)

CRECHE · STARTERS · BEGINNERS · NURSERY 1 · NURSERY 2 · NURSERY 3
· BASIC 1 · BASIC 2 · BASIC 3 · BASIC 4 · BASIC 5
· JSS 1 · JSS 2 · JSS 3
· SS 1 SCIENCE · SS 1 ART · SS 1 HUMANITIES · SS 1 BUSINESS
· SS 2 SCIENCE · SS 2 ART · SS 2 HUMANITIES · SS 2 BUSINESS
· SS 3 SCIENCE · SS 3 ART · SS 3 HUMANITIES · SS 3 BUSINESS

---

## PART 2 — WHAT TO DO NEXT

### Item 1 — Fix the "Hide Inactive" bug on the Learners tab

Symptom: exited learners stay visible by default even with an exit
reason filled in, and pressing the toggle has no visible effect on
the grid. Fix in `app.js` `[S07]`. One delivery.

### Item 2 — Reports Workshop comment default + keyboard navigation

Teacher Comment and Principal Comment fields should pre-load with a
comment-bank entry by default. Up / Down arrow keys inside the field
should cycle through the bank. Fix in `app.js` `[S15]` plus the
comment bank read from `window.TIS`. One delivery.

### Item 3 — Learners tab wired to the fee schedule

The View modal inside `[S07]` should show the same fee breakdown
the report card shows: read from `fee_schedule` + `fee_adjustments`
+ `learner_terms`. Adding a new learner to a class should apply that
class's bill by definition — no manual write required, because the
bill comes from `fee_schedule`, not from the learner row. 2–3
deliveries.

### Item 4 — Deactivate / reactivate learners

Add `is_active` to `learners`, grid filter Active / Inactive / All,
edit-modal toggle, exclude inactive from attendance and ID Cards.
1 delivery.

### Item 5 — Delete duplicate learners

Diagnostic SQL by name + DOB, review screen, merge or delete with
confirmation. 1 delivery.

### Item 6 — Audit log UI + full write-path wiring

Table exists. Write paths partially wired. Panel missing.
2 deliveries.

### Item 7 — Later phases

- Offline report generation + upload. Multi-week.
- Digital library. Multi-month.
- Offline CBT app integration. Separate project.

### Data conventions for the fee module

| Item | Value |
|---|---|
| Class bill | `fee_schedule.class_name × term_type × year` |
| Per-learner adjustment | `fee_adjustments.learner_id × term_type × year` |
| Scholarship | `fee_adjustments.deductions` (shown only when > 0) |
| Additions | `fee_adjustments.additions` (shown only when > 0) |
| Balance C/D | adjusted tuition + other major + other minor + books + additions + previous B/F |
| Report card fee row order | Prev B/F → Tuition → Scholarship → Adjusted → Other Major → Other Minor → Books → Additions → Balance C/D |

---

## PART 3 — THE MAINTENANCE LOOP

Every session that ends without an update to this file leaves a gap.
Follow this loop.

### Every session

1. Update the "Last updated" date at the top of this file.
2. Move any completed item from "pending" to "live".
3. If new items were discovered, add them to the pending table.
4. Append one entry to `HISTORY.md` — what was asked, what was
   delivered, what broke, what was fixed.
5. Commit both files. Vercel publishes `/handover` in 30 seconds.

### When architecture changes

Update `REFERENCE.md` — new tables, new `app.js` sections, new
`supabase-client.js` methods, new rules.

### The first-message prompt
The payment math still has structural problems. Before touching code again, let me put down the handover document you asked for — because if we keep patching without a clear reference, a new assistant would inherit the same confusion we are working through.

I'll write the handover first, then come back to the fee math.

---

# TIS — HANDOVER

**Last updated:** 2026-10-12
**Maintainer:** Dr Ayoola G O (owner) · assisted by prior developer
**Repo:** `tis-tan.vercel.app` (Vercel-hosted)
**Production URL:** https://tis-tan.vercel.app
**Reference doc:** this file, kept at repo root as `HANDOVER.md` and published at `/handover`

---

## 1. What this system is

The Ideal Schools (TIS) runs two portals off one Supabase project:

**The office portal** — a single-page app served from `tis-tan.vercel.app`. Handles learners, staff, terms, fees, attendance, results, ID cards, prospects, collectibles, and the CBT question bank admin. Used by operators on office machines.

**The CBT LAN server** — a Node.js/Express/SQLite app that runs on a dedicated Windows 10 machine called the **TIS CBT Server**, reachable on the school LAN at `http://192.168.29.55:3000`. Runs the actual exams, holds all questions and answers locally, and produces a scores file at the end that the office uploads back to the portal. **Does not touch the internet during an exam.**

The two are connected only when:
- The office exports a learner list from the portal and imports it to the LAN server.
- The LAN server produces the school's Scores template after the exams, which the office uploads to the portal.

Nothing else crosses between them.

---

## 2. The office portal

### 2.1 Stack

- **Frontend:** vanilla HTML/CSS/JS. No framework. One `index.html`, one `styles.css`, four JS files loaded in order.
- **Backend:** Supabase (Postgres + Auth + Storage). No custom server.
- **Hosting:** Vercel, auto-deploys from the connected Git branch.
- **Auth:** Supabase email-based auth, but the user types only a short User ID. The client converts `03` → `03@tis.local` before calling Supabase. This is done in `toAuthEmail()` inside `supabase-client.js`.

### 2.2 Load order of JS files

Order matters. Do not rearrange.

```
supabase-client.js     — Supabase bridge, exposes window.TIS
report-render.js       — report card HTML helpers
app.js                 — main UI, all modules except the next two
learner-bulk.js        — legacy learner bulk importer
calendar-module.js     — academic calendar import/adjust
cbt-module.js          — CBT tab in the portal (question bank + learner export)
```

### 2.3 Section map of `app.js`

Every section is labelled `[S01]`–`[S22]`. Search for the label.

```
[S01] STATE                — global State object, ALL_MODULES array
[S02] UTILITIES            — $, setHTML, setText, esc, escAttr, todayISO, fmtDate,
                             showToast, startLoader, stopLoader, closeModal, debounce
[S03] PERMISSIONS          — isSuperAdmin, hasPermission, applyPermissionsToUI
[S04] AUTH                 — doLogin, doLogout, showLoginScreen, enterDashboard
[S05] PASSWORD CHANGE      — openChangePasswordModal, submitChangePassword
[S06] NAVIGATION           — switchTab
[S07] LEARNERS             — the biggest section:
                             • learnerIsInactive (single source of truth)
                             • loadLearners, renderLearners, applyLearnerFilter
                             • resolveLearnerFeePicture (the fee logic — see §4)
                             • openLearnerViewModal
                             • openLearnerEditModal / saveLearnerEdits
                             • openAddLearnerModal / submitNewLearner
                             • openPartPaymentModal / submitPartPayment
                             • printLearnerCard (80mm thermal)
                             • bulk photo upload
[S07b] PROSPECTS           — pre-admission learners
[S07c] COLLECTIBLES        — flat checklist per learner
[S08] STAFF
[S09] TERMS                — plus [S09.x] FEES MODULE, promotion wizard
[S10] LEARNER ATTENDANCE
[S11] STAFF ATTENDANCE
[S12] CALENDAR
[S13] CALENDAR IMPORT
[S14] QR                   — /g/<token> scan handler
[S14b] ID-CARD SCAN        — /s/<code> scan handler (learner, staff, visitor)
[S15] REPORTS              — psychomotor ratings workshop
[S16] CLASSES              — includes class_subjects slot editor
[S17] USERS                — permission matrix
[S18] BROAD SHEET          — Scores template download, harvest, upload
[S18b] SCORES IMPORTER     — the Excel upload parser
[S18c] AUTO-ASSIGN         — psychometric auto-assignment after score upload
[S19] WIRE + BOOT
[S20] PUBLIC API           — window.TIS.closeModal and friends
[S21] ID CARDS             — canvas renderer for CR80 portrait
[S22] RESULTS              — internal report card viewer + print
```

### 2.4 Section map of `supabase-client.js`

Every method is exposed on `window.TIS`. Return shape is always `{ ok: true, data }` or `{ ok: false, error }`. Never throws.

Blocks in the file:

```
[AUTH]              signIn, signOut, getCurrentProfile, changePassword
[LEARNERS]          listLearners, searchLearners, getLearner, getLearnerByPin,
                    createLearner, updateLearner, setLearnerContactPriority,
                    findLearnerDuplicate, recordLearnerScan
[VISITS]            recordVisitorScan
[SCAN EVENTS]       logScanEvent
[RESULTS_VIEWS]     logResultsView
[FEE_SCHEDULE]      listFeeSchedule, getFeeScheduleRow, upsertFeeSchedule,
                    deleteFeeSchedule, getFeeExtrasForClass
[FEE_ADJUSTMENTS]   listFeeAdjustments, getFeeAdjustment,
                    listFeeAdjustmentsForLearners, upsertFeeAdjustment,
                    deleteFeeAdjustment
[FEE_ADVANCE]       advanceTermFees
[AUDIT LOG]         logAudit
[LEARNER_TERMS]     getLearnerTerms, getLearnerTermForActive, getLearnerTermFor,
                    getAttendanceTotalsInAcademicYear, recordPartPayment
[ATTENDANCE_LEARNER] getAttendanceRegister, saveAttendanceMarks, shiftHoliday,
                    moveHoliday, markWeekForLearners
[STAFF]             listStaff, getStaff, createStaff, updateStaff, deleteStaff
[STORAGE]           uploadAsset, deleteAsset
[STAFF_ATTENDANCE]  listStaffAttendanceToday, upsertStaffAttendance,
                    listStaffAttendanceRange, listStaffMovementsToday,
                    createStaffMovement, updateStaffMovement
[STAFF_ATTENDANCE_DAILY]  listStaffAttendanceForDay, listStaffAttendanceForMonth,
                          listStaffMovementsForMonth, closeStaffMovement,
                          archiveStaffMonth, listArchivedStaffMonths,
                          getArchivedStaffMonth
[QR]                getActiveQRToken, generateQRToken, getQRTokenByValue
[TERMS]             listTerms, getActiveTerm, setActiveTerm
[PROMOTION]         getPromotionStatus, termPromote, yearPromote,
                    getLearnersForClasses, promoteLearners
[CLASSES]           listClasses, createClass, updateClass, deleteClass,
                    getNextClass, getClassSubjects, setClassSubjects,
                    listSubjects
[SCORES]            getScoresForLearners, upsertScore, listClassAliases
[RESULTS HELPERS]   getClassPopulation, getAttendanceSummaryForTerm,
                    getResumptionDate, getScoresForTerm, getLearnerTermRecord
[REPORT_RATINGS]    getReportRatings, upsertReportRating
[COMMENT_BANK]      getCommentBank, listCommentBank, createCommentBank,
                    updateCommentBank, deleteCommentBank
[RATINGS]           bandForAverage
[CALENDAR]          getCalendar, listCalendar
[USERS]             getPermissionMatrix, setUserAuthorities, getAllUsers,
                    getUserById, updateUser, deactivateUser, reactivateUser,
                    createUser, adminResetPassword, roleDefaults
[PROSPECTIVE_LEARNERS] listProspectiveLearners, getProspectiveLearner,
                       createProspectiveLearner, updateProspectiveLearner,
                       deleteProspectiveLearner, enrollProspectiveLearner,
                       declineProspectiveLearner, admitProspectiveLearner
[FEE_EXTRAS_DEFAULTS] listFeeExtrasDefaults, upsertFeeExtraDefault,
                      getProspectiveFeePreview
[COLLECTIBLES]      listCollectibleItems, listCollectibleTicksForLearner,
                    setCollectibleTick
[CBT]               listCbtQuestions, upsertCbtQuestions, listCbtTimetable,
                    upsertCbtTimetable, deleteCbtTimetable, listCbtUploads,
                    logCbtUpload
[FEE_LEARNER_OVERRIDES] listLearnerOverrides, setLearnerItemOff,
                        deleteLearnerOverride
```

### 2.5 Key conventions

- **Every loader** starts with `startLoader()` and finishes with `stopLoader()` in a `finally`.
- **Every button** has `type="button"` unless it's a submit.
- **Every modal** closes by clicking the overlay: `onclick="if(event.target===this)TIS.closeModal()"`.
- **Every list** filters out exited learners via `learnerIsInactive()`. **Do not** write a local filter that uses only `date_of_withdrawal` — three fields matter (`date_of_withdrawal`, `class_at_withdrawal`, `exit_reason`).
- **Never overwrite a database column with an empty string** unless the operator cleared it deliberately. Bulk imports that carry blank cells are the exception, and they warn the operator first.

---

## 3. The CBT LAN server

### 3.1 Machine

- Windows 10 Pro, 64-bit.
- Hostname: any. LAN IP: **192.168.29.55** (reserve on the router so it doesn't change).
- Node.js v24, npm v11.
- Installed at `C:\TIS-CBT\`.
- Start with `start.bat` (double-click) or `npm start`.
- **Run as a normal user, not administrator.**

### 3.2 Folder layout

```
C:\TIS-CBT\
  ├─ start.bat
  ├─ package.json
  ├─ server.js                 ← the whole server
  ├─ data\
  │    ├─ cbt.sqlite           ← the local database (source of truth)
  │    └─ (bundle.json retired — do not use)
  ├─ logs\
  │    └─ push-YYYY-MM-DD.log
  └─ public\
       ├─ index.html           ← candidate login + dashboard
       ├─ exam.html            ← the paper-taking screen
       ├─ exam.js
       ├─ dashboard.js
       ├─ style.css
       ├─ bg.jpg               ← login background image
       ├─ school-logo.jpg
       ├─ ministry-logo.jpg
       ├─ admin.html           ← operator console (seven tiles)
       ├─ admin.js
       ├─ admin.css
       ├─ admin-manage.html    ← exam procedures per class
       ├─ admin-manage.js
       ├─ admin-questions.html ← upload MCQ / one-word questions
       ├─ admin-questions.js
       ├─ admin-learners.html  ← import learner list
       ├─ admin-learners.js
       ├─ admin-live.html      ← live scores board
       ├─ admin-live.js
       ├─ admin-manual.html    ← manual exam score entry
       ├─ admin-manual.js
       ├─ admin-export.html    ← export Scores file (Wave 3, not built)
       └─ admin-settings.html  ← term/year/password (Wave 3, not built)
```

### 3.3 API surface of `server.js`

**Candidate endpoints (no auth):**

```
POST /api/login              — validate PIN
GET  /api/dashboard          — list exams for the logged-in PIN
POST /api/start              — start or resume a paper
POST /api/answer             — save one answer
POST /api/submit             — submit a paper
```

**Admin endpoints (auth: X-Admin-Password header):**

```
POST /api/admin/status
POST /api/admin/groups
POST /api/admin/groups/update
POST /api/admin/procedures/applyGroup
POST /api/admin/procedures/list
POST /api/admin/procedures/update
POST /api/admin/learners/list
POST /api/admin/learners/import
POST /api/admin/learners/delete
POST /api/admin/classes/list
POST /api/admin/classes/import
POST /api/admin/subjects/list
POST /api/admin/questions/list
POST /api/admin/questions/import
POST /api/admin/questions/delete
POST /api/admin/live/list
POST /api/admin/manual/list
POST /api/admin/manual/set
POST /api/admin/setTerm
```

### 3.4 Local SQLite tables

```
sittings            — one row per candidate-paper-attempt
answers             — one row per answered question
classes_local       — the master class list, with sort_order
class_subjects_local— which subjects each class takes
learners_local      — PIN, name, gender, class_name
questions           — MCQ and one-word questions
exam_procedure      — per class × subject × paper: opens_at, qs, marks, duration
exam_groups         — the seven seed groups
manual_exam_scores  — teacher-entered exam scores
settings            — term_type, year, admin password (future)
```

### 3.5 The seven exam groups (seeded on first run)

| Key | Label | Classes | A Qs | A Marks | A Min | B Qs | B Marks | B Min |
|---|---|---|---|---|---|---|---|---|
| G1 | BASIC 1 | BASIC 1 | 15 | 30 | 20 | 5 | 20 | 5 |
| G2 | BASIC 2 & 3 | BASIC 2, BASIC 3 | 20 | 40 | 20 | 5 | 10 | 5 |
| G3 | BASIC 4 & 5 | BASIC 4, BASIC 5 | 30 | 30 | 20 | 5 | 20 | 5 |
| G4 | JSS 1 & 2 | JSS 1, JSS 2 | 40 | 40 | 30 | 5 | 10 | 5 |
| G5 | JSS 3 | JSS 3 | 60 | 30 | 30 | 10 | 20 | 10 |
| G6 | SS 1 & SS 2 | SS 1 & SS 2 streams | 80 | 40 | 40 | 10 | 10 | 5 |
| G7 | SS 3 | SS 3 streams | 100 | 40 | 50 | 10 | 10 | 5 |

Marks per question is derived at scoring time: `max_marks / question_count`. Every correct answer awards that amount. One-word typos at Levenshtein distance 1 award half.

### 3.6 Paper A and Paper B run separately

A candidate can sit Paper A on Monday and Paper B on Tuesday. Each paper writes its own `sittings` row. The Scores export step combines them (A + B) for each subject and writes the sum into the exam column of the school's Scores template.

---

## 4. The fee model

### 4.1 Where fees live

Three tables, each with a specific job:

**`fee_schedule`** — the class bill. One row per class × term × year. Columns:
```
tuition, other_bills_major, other_bills_minor, books,
registration_fee, uniform, sportswear, waist_coat, tie,
extra_lesson, special_lesson
```
`registration_fee` is prospect-only. It never appears in the Class Bill grid, never appears on an enrolled learner's card. It is read only by the prospect preview.

**`fee_adjustments`** — per-learner adjustments. One row per learner × term × year.
```
additions, deductions, reason
```
Additions raise the bill. Deductions (used as scholarships) lower it.

**`fee_learner_item_overrides`** — per-learner removal of a class-bill line.
```
learner_id, term_type, year, item_key, note
```
Presence of a row means "this line is removed for this learner in this term". Deleting the row restores it.

**`learner_terms`** — the receipt. One row per learner × term × year. Created by term promotion, or by the seed query.
```
balance_bf      text  — carried forward from previous term's balance_cf
bill            text  — legacy column, currently unused
other_bill      text  — legacy column, currently unused
tuition, scholarship, other_bills_major, other_bills_minor, books,
uniform, sportswear, waist_coat, tie, extra_lesson, special_lesson,
additions
total_part_payment, balance_cf, cleared, clearance
part_payment_1..5_date, part_payment_1..5_amount
```

### 4.2 The rule for a learner's fee picture

`resolveLearnerFeePicture(learner, termRow, term, year)` in `[S07]` returns the picture. Two branches:

**NOT LOCKED** — no payment has been recorded yet.
- Reads the class bill live from `fee_schedule`.
- Applies `fee_learner_item_overrides`: any item with an override row is zeroed.
- Reads `fee_adjustments`: additions are added, deductions (scholarship) are subtracted.
- Balance B/F comes from `termRow.balance_bf`, or from the previous term's `balance_cf` if the current row is empty.
- Returns live numbers.

**LOCKED** — at least one part payment has been recorded.
- Reads from the `learner_terms` row.
- The columns must have been populated at the moment of the first payment.
- Balance C/F = Balance B/F + net bill − total paid.

### 4.3 Known issues with the fee model (open)

1. **First-payment snapshot.** When the first payment is recorded, `recordPartPayment` must persist the true net bill into the `learner_terms` row before computing `balance_cf`. Currently `recordPartPayment` uses `bill + other_bill`, which are legacy zero columns. This causes C/F to compute as `0 − payment`, i.e. negative.

   **Partial fix applied:** the modal now passes `netBills` into `submitPartPayment` and `recordPartPayment` now accepts a seventh `netBillsForSnapshot` argument. **This fix has not yet been verified working.** See §7.

2. **Net Bills showing zero.** The locked branch of `resolveLearnerFeePicture` computes `netBills = tuition + otherMajor + otherMinor + books`. If the `learner_terms` row was written before those four columns were populated, they are zero and Net Bills shows 0 even though the learner owes money. Fix: fallback to `termRow.bill` when the four are zero.

3. **Removed items not restorable after payment.** Once the snapshot is frozen, the X-toggle UI has no way to restore an item, because the locked branch doesn't know what was removed. Fix: when the snapshot is frozen, store the list of removed item_keys in the `learner_terms` row (a new column `overrides_snapshot`), and have the locked branch read it.

4. **Negative balance on some learners.** Caused by defect 1. Bulk SQL repair exists (§4.4) but a systemic fix is needed.

### 4.4 Repair SQL for a learner already in negative

```sql
-- Step 1: rebuild the legacy bill column for any row where it's missing
UPDATE public.learner_terms
SET bill = (
  COALESCE(NULLIF(tuition, '')::numeric, 0)
  + COALESCE(NULLIF(other_bills_major, '')::numeric, 0)
  + COALESCE(NULLIF(other_bills_minor, '')::numeric, 0)
  + COALESCE(NULLIF(books, '')::numeric, 0)
  + COALESCE(NULLIF(uniform, '')::numeric, 0)
  + COALESCE(NULLIF(sportswear, '')::numeric, 0)
  + COALESCE(NULLIF(waist_coat, '')::numeric, 0)
  + COALESCE(NULLIF(tie, '')::numeric, 0)
  + COALESCE(NULLIF(extra_lesson, '')::numeric, 0)
  + COALESCE(NULLIF(special_lesson, '')::numeric, 0)
  + COALESCE(NULLIF(additions, '')::numeric, 0)
  - COALESCE(NULLIF(scholarship, '')::numeric, 0)
)::text
WHERE bill IS NULL OR bill = '' OR bill = '0';

-- Step 2: recompute C/F for every negative row
UPDATE public.learner_terms
SET
  balance_cf = (
    COALESCE(NULLIF(balance_bf, '')::numeric, 0)
    + COALESCE(NULLIF(bill, '')::numeric, 0)
    - COALESCE(NULLIF(total_part_payment, '')::numeric, 0)
  )::text,
  cleared = CASE
    WHEN (
      COALESCE(NULLIF(balance_bf, '')::numeric, 0)
      + COALESCE(NULLIF(bill, '')::numeric, 0)
      - COALESCE(NULLIF(total_part_payment, '')::numeric, 0)
    ) <= 0 THEN 'Yes'
    ELSE cleared
  END
WHERE balance_cf LIKE '-%';
```

---

## 5. Where the working documents live

- **This handover** — `HANDOVER.md` at repo root, also at `/handover` on the live site.
- **The Scores template** — produced by the portal's Broad Sheet tab, also visible in `supabase-client.js` `bsBuildTemplatePayload`.
- **The Legend sheet** — mapping of class → slot → subject, generated from `class_subjects`.

---

## 6. How to run a full exam day

1. **Before exam day, on the portal:**
   - Upload question files in the CBT tab (one per class × subject × paper).
   - Upload the timetable in the CBT tab.
   - Click **Export Learners for CBT**. A `.xlsx` with two sheets downloads.
2. **On the LAN server:**
   - Open `http://192.168.29.55:3000/admin`.
   - Click **Learners**, upload the file.
   - Click **Manage**, apply the seven groups. Set any per-class opening times.
3. **Exam day:**
   - Power on the CBT Server. Plug it into the router.
   - Double-click `start.bat`.
   - Candidates open `http://192.168.29.55:3000`, enter PIN, sit papers.
   - Teachers watch progress at `/admin-live.html`.
4. **After the last paper:**
   - Open `/admin-export.html` (Wave 3 — not yet built).
   - Download the Scores file.
   - On the portal, go to Broad Sheet, upload it.

---

## 7. Current status, as of this handover

### Completed and working

- Office portal: all modules except the CBT tab's network-connected bits.
- CBT LAN server: **Wave 1 (foundation) and Wave 2 (content management) built.**
  - `/admin` landing with seven tiles works.
  - `/admin-questions.html` — upload MCQ and one-word files.
  - `/admin-learners.html` — import learners from portal export.
  - `/admin-manage.html` — apply groups, edit procedures per class.
  - `/admin-live.html` — live score board, auto-refreshing.
  - `/admin-manual.html` — type exam scores by hand.
  - Exam delivery (login, dashboard, paper, submit) works once learners are imported.

### Completed and working (office portal)

- Learners, staff, terms, fees (Class Bill, Adjustments), learner attendance, staff attendance, calendar, QR, broad sheet, reports workshop, results, classes, users, ID cards, prospects, collectibles.

### Open issues, in priority order

**1. Fee — Net Bills showing zero after a payment.** Locked branch reads from columns that may be empty. Fix design in §4.3 item 2. **Fix not yet applied.**

**2. Fee — Removed items cannot be restored after a payment.** Fix design in §4.3 item 3. **Fix not yet applied.**

**3. Fee — Some learners in negative.** Bulk SQL repair exists. Systemic fix depends on fixing items 1 and 2.

**4. CBT — Wave 3 not built.** `admin-export.html` and `admin-settings.html` are placeholders. The portal's CBT tab still has the old question-bank buttons (Bundle, Upload Excel, Template) that are now redundant — they belong on the LAN server.

**5. CBT — Server currently not answering.** The last log said it was listening on 3000, but `curl http://localhost:3000/admin.html` returns "Unable to connect". Suspected: the process died silently, or a stale `node` process holds the port. Not yet diagnosed.

### Not yet started

- Offline CBT result download and portal upload (Wave 3).
- The portal's CBT tab cleanup: remove the redundant buttons, add a hint pointing staff to the LAN server.

---

## 8. Conventions for the next assistant

1. **Read this document before touching anything.** Especially §4 on fees.
2. **Never delete a column from a live table.** Add columns; migrate data by hand; then, if the column is truly dead, leave it in place.
3. **Bulk uploads add and update; they never delete by omission.** Deletion is a deliberate act with a button.
4. **Fees: when in doubt, do not touch.** The chain is: fee_schedule → overrides + adjustments → learner card. Every number must trace to a live source until the snapshot freezes.
5. **Every `resolveLearnerFeePicture` return object must include every column the modal and print functions read.** If a field is missing, the modal shows `—`. Test both branches (locked and not locked) after every change.
6. **A4 print removed.** Only 80mm thermal is used now. Do not reintroduce A4.
7. **The banks block on thermal print shows the four school accounts.** Do not remove. It is defined once in `[S07]` as `TIS_BANK_ACCOUNTS`.
8. **The CBT LAN server does not touch the internet.** Ever. If you find yourself adding a Supabase call in `server.js`, stop and reconsider.

---

## 9. Contact

- **Owner:** Dr Ayoola G O · FCIA, NIIA
- **Primary school contacts:** Dr Mrs Ayoola O O · B.Sc in-view Ayoola P · B.Ed in-view Ayoola M
- **Deployment platform:** Vercel (frontend) · Supabase (backend) · Windows 10 (CBT Server)

---

That is the handover. Save it as `HANDOVER.md` at the repo root, and also paste it into the `/handover` page of the live portal — whatever form that takes, whether it's a static HTML page or a markdown renderer. If you tell me where the `/handover` page currently lives in your repo, I'll wire it up.

Now the fee math. Two things to confirm before I write the corrected code:

**Question 1.** For the "restore removed items after a payment" requirement — do you want the removed items list to be stored alongside the snapshot in `learner_terms`? That means a new column `overrides_snapshot` (text, JSON array of item keys). Once a payment is made, the modal reads that column instead of querying `fee_learner_item_overrides`, and the X/Restore buttons act on the snapshot's list. Restoring an item after payment would raise the balance — which is exactly what you want, but it means the C/F must be recomputed at the same time.

**Question 2.** For the "net bill constant, shows progression" requirement — do you want:
- **(a)** Net Bill locked at the value it was when the first payment was made, shown at the top of Section B forever; and
- **(b)** the running balance shown separately as a reduction line, e.g. `Net Bill: ₦120,000 · Less Payments: ₦50,000 · Balance C/F: ₦70,000`?

That's what I'd build if you confirm. It makes the paper reconcile visually: a reader can see the original bill, the deductions, and the resulting balance, all on one screen.

Answer those two and I'll write the corrected `resolveLearnerFeePicture` and `openPartPaymentModal` and `recordPartPayment` as three clean replacements.

When starting a new AI conversation, paste the contents of
`PROMPT.md`.
