# TIS EMIS — REFERENCE

**Companion to:** `HANDOVER.md` (current state) and `HISTORY.md` (session log).
**Last updated:** 4 October 2026

Read `HANDOVER.md` first. This file holds the reference material —
schemas, code maps, method lists, rules, conventions. Read once when
you start. Consult when you need detail. Update only when architecture
changes.

---

## PART 1 — DATABASE SCHEMAS

Every table in the `public` schema. Column lists complete as of the
date above.

**Note:** Row Level Security is disabled on all tables by design (closed
operator group). Verify after creating any new table:

```sql
alter table <name> disable row level security;

select relname, relrowsecurity as rls_enabled
from pg_class
where relname in ('<name>')
order by relname;

Expected: `rls_enabled = false`. If true, the client gets empty results
and 403 on writes.

### users

Portal operators. Linked 1-to-1 with `auth.users`.

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, matches auth.users.id |
| operator_id | text | 01 … 04 |
| name | text | Display name |
| role | text | super_admin / admin / operator / teacher |
| position | text | |
| avatar_url | text | |
| is_active | boolean | |
| must_change_password | boolean | |
| authorities | jsonb | Permission map |
| last_login | timestamptz | |
| password_last_changed | timestamptz | |
| deleted | boolean | Legacy filter flag |
| created_at, updated_at | timestamptz | |

### learners

One row per learner. Bio only — fees in `learner_terms`.

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| pin | text | Unique. TIS####. Auto-assigned by trigger if blank. Never reused. |
| name | text | Surname first |
| class_name | text | Canonical |
| gender | text | Male / Female |
| date_of_birth | text | Mixed formats historically |
| photo_url | text | Public URL to TISAssets |
| father_phone, mother_phone, guardian_phone | text | |
| contact_priority_1, _2, _3 | text | Calling order |
| account_number | text | |
| blood_group | text | |
| religion, allergy, parents_name | text | |
| address | text | |
| state_of_origin, lga_of_origin | text | |
| state_of_birth, lga_of_birth | text | |
| lin | text | Learner Identification Number |
| class_before_admission, class_admitted_into | text | |
| date_of_admission | text | |
| class_at_withdrawal | text | |
| date_of_withdrawal | text | Non-empty → exited |
| exit_reason | text | |
| card_active | boolean | Default true |
| created_at, updated_at | timestamptz | |

### learner_terms

Fee record per learner per term.

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| learner_id | bigint | FK learners.id |
| term_type | text | 1st / 2nd / 3rd |
| year | int | |
| class_name | text | Snapshot |
| tuition, scholarship, bill, other_bill | numeric | |
| other_bills_major, other_bills_minor, books | numeric | |
| balance_bf, total_part_payment, balance_cf | numeric | |
| part_payment_N_date, part_payment_N_amount | text / numeric | N = 1..5 |
| cleared | text | Yes / No |
| clearance | text | Date |
| created_at, updated_at | timestamptz | |

### terms

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| term_type | text | 1st / 2nd / 3rd |
| year | int | |
| label | text | 1ST TERM 2026/2027 |
| start_date, end_date | date | |
| is_active | boolean | |
| created_at | timestamptz | |

No `academic_year` column. Derived as `year + '/' + (year + 1)`.

### academic_calendar

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| event_date | date | |
| day_name | text | |
| event_type | text | |
| description | text | |
| term_type | text | |
| week_number | int | |
| academic_year | text | 2026/2027 |
| is_holiday | boolean | |
| holiday_name | text | |

### classes

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| name | text | Canonical |
| level | text | |
| stream | text | SCIENCE / ART / HUMANITIES / BUSINESS |
| next_class | text | |
| is_active | boolean | |
| sort_order | int | 100 CRECHE … 630 SS 3 BUSINESS |
| notes | text | |
| created_at | timestamptz | |

### class_subjects

Slot map per class.

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| class_name | text | |
| slot | int | 1..18 |
| subject_code | text | FK subjects.code |
| created_at | timestamptz | |

Unique on `(class_name, slot)` and `(class_name, subject_code)`.

### class_aliases

| Column | Type | Notes |
|---|---|---|
| upload_code | text | PK. E.g. JSS_1 |
| canonical_name | text | E.g. JSS 1 |

### subjects

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| code | text | Unique. ENG, MATH, CHEM, … |
| display_name | text | ENGLISH LANGUAGE, … |
| is_active | boolean | |
| created_at | timestamptz | |

### scores

One row per learner × subject × term × year.

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| learner_id | bigint | FK learners.id |
| subject_code | text | FK subjects.code |
| term_type | text | |
| year | int | |
| test1, test2, exam | numeric(5,2) | Max 20/30/50 |
| total | numeric(6,2) | Sum |
| grade | text | A..F |
| remark | text | EXCELLENT, VERY GOOD, … |
| source | text | upload / manual |
| uploaded_at, updated_at | timestamptz | |
| uploaded_by | text | |

Unique on `(learner_id, subject_code, term_type, year)`.

### report_ratings

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| learner_id | bigint | FK learners.id |
| term_type | text | |
| year | int | |
| ratings | jsonb | { leadership: 'V.GOOD', … } 10 keys |
| teacher_comment | text | |
| principal_comment | text | |
| teacher_edited, principal_edited | boolean | Human has saved |
| auto_assigned_at | timestamptz | |
| updated_at, updated_by | timestamptz, text | |

Unique on `(learner_id, term_type, year)`.

### comment_bank

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| field | text | teacher / principal |
| band | text | excellent / very_good / good / average / fair / poor |
| category | text | general / subject_strong / subject_strong_weak / subject_weak |
| text | text | Placeholders {first}, {strong1}, {weak1} |
| is_active | boolean | |
| created_at | timestamptz | |

Unique on `(field, band, category, text)`. 336 rows.

### attendance_learner

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| learner_id | bigint | FK learners.id |
| term_type | text | |
| year | int | |
| attendance_date | date | |
| mark | text | O O / backslash / slash / both |
| marked_by | text | |
| marked_at | timestamptz | |

Unique on `(learner_id, attendance_date)`.

### attendance_staff

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| staff_id | bigint | FK staff.id |
| attendance_date | date | |
| clock_in, clock_out | text | HH:MM |
| status | text | Present |
| note | text | Has note, not remark |
| logged_by | text | |
| source | text | QR / Manual |
| month_archived | boolean | |
| created_at, updated_at | timestamptz | |

Unique on `(staff_id, attendance_date)`.

### staff

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| staff_id | text | E.g. TIS2406 |
| surname, first_name, middle_name | text | |
| full_name | text | Generated |
| gender, date_of_birth | text | |
| school, department, position | text | |
| phone, email | text | |
| qualification, graduation_year, course_of_study | text | |
| subjects_taught | text | |
| bank, account_number, bvn | text | |
| salary | numeric | |
| resume_time, close_time | text | HH:MM |
| late_cutoff, early_cutoff | text | HH:MM |
| status | text | Active / Inactive |
| photo_url | text | TISAssets/staff/ID.png |
| card_active | boolean | Default true |
| created_at, updated_at | timestamptz | |

### staff_movements

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| staff_id | bigint | FK staff.id |
| movement_date | date | |
| time_out, time_in | text | |
| reason, destination, purpose | text | |
| logged_by | text | |
| month_archived | boolean | |
| created_at, updated_at | timestamptz | |

### staff_attendance_archive, staff_movements_archive

Month snapshots. Mirror live tables plus `archive_year`,
`archive_month`, `staff_no`, `staff_name`.

### qr_tokens

| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| token | text | |
| generated_by | text | |
| generated_at | timestamptz | |
| expires_at | timestamptz | |
| is_active | boolean | |
| regenerated_by, regenerated_at | text, timestamptz | |

### recovery_codes

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| code | text | 6 chars, no ambiguous (0/O/1/I/L) |
| email_to | text[] | |
| created_at, expires_at | timestamptz | |
| used_at | timestamptz | |
| used_by_ip, used_by_ua | text | |
| notes | text | |

### recovery_attempts

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| created_at | timestamptz | |
| ip_address, user_agent, referrer | text | |
| action | text | request / verify-ok / verify-bad |
| success | boolean | |
| code_masked | text | |
| notes | text | |

### visits

| Column | Type | Notes |
|---|---|---|
| id | bigint | PK |
| card_code | text | VIS-01 … VIS-05 |
| visitor_name | text | |
| purpose | text | Official / Personal |
| agency, agency_other | text | |
| time_in, time_out | text | |
| visit_date | date | |
| status | text | In / Out |
| recorded_by, notes | text | |
| created_at, updated_at | timestamptz | |

### scan_events

| Column | Type | Notes |
|---|---|---|
| id | bigserial | PK |
| code | text | PIN / Staff ID / VIS code |
| code_type | text | learner / staff / visitor / unknown |
| actor_id, actor_name | text | |
| action | text | attendance / clock-in / clock-out / movement-out / movement-in / visit-in / visit-out / lookup |
| success | boolean | |
| detail, scanned_by | text | |
| scan_date | date | |
| scanned_at | timestamptz | |

### audit_log

Table exists; UI not built; write paths partially wired.

| Column | Type | Notes |
|---|---|---|
| id | bigserial | PK |
| created_at | timestamptz | |
| actor_id | uuid | |
| actor_name, actor_role | text | |
| action | text | learner.create / learner.update / … |
| entity_type | text | learner / staff / attendance / user |
| entity_id, entity_name | text | |
| before, after | jsonb | Full row snapshots |
| notes | text | |
| term_type, year | text / int | For termly grouping |
| undone_at, undone_by | timestamptz / text | Reserved |

<!-- end of part 1 -->

---

## PART 2 — `app.js` SECTION MAP

IIFE-wrapped. Sections `[S01]`–`[S22]`. Line numbers drift; use the
section header comments to locate.

| Section | Purpose | Key functions |
|---|---|---|
| [S01] STATE | Global state, module list | State, ALL_MODULES |
| [S02] UTILITIES | DOM, escape, dates, loaders, modal | $, esc, escAttr, showToast, startLoader, stopLoader, closeModal, pageLoaderHTML, emptyHTML, errorHTML, debounce |
| [S03] PERMISSIONS | Permission checks | hasPermission, isSuperAdmin, applyPermissionsToUI, getFirstPermittedTab |
| [S04] AUTH | Login, logout, session | doLogin, doLogout, showLoginScreen, enterDashboard |
| [S05] PASSWORD CHANGE | Change modal | openChangePasswordModal, submitChangePassword |
| [S06] NAVIGATION | Tab switching | switchTab |
| [S07] LEARNERS | Grid, view, edit, add, photo, print, bulk | loadLearners, renderLearners, openLearnerViewModal, openLearnerEditModal, saveLearnerEdits, openAddLearnerModal, submitNewLearner, openPartPaymentModal, openPrintOptionsModal, openLearnerPhotoModal, submitLearnerPhoto, openBulkPhotoUploadDialog, submitBulkPhotoUpload, downloadLearnerTemplate, uploadLearnerUpdates, printLearnerList |
| [S08] STAFF | Grid, view, edit, add, photo, print | loadStaff, renderStaff, openStaffProfile, openStaffEditModal, saveStaffEdits, openAddStaffModal, submitNewStaff, openStaffPhotoModal, submitStaffPhoto, printStaffCard, printStaffList |
| [S09] TERMS | List, activate, promotion | loadTerms, activateTerm, openPromotionWizard, renderPromotionWizard, pwApplyTerm, pwApplyYear, pwApplySpecial, checkPromotionBanner |
| [S10] LEARNER ATTENDANCE | Register, holiday, analysis, breakdown, signatures, print | initLearnerAttendanceTab, loadAttendanceRegister, renderAttendanceRegister, attCycleCell, attMarkClassPresent, attSaveAllChanges, attApplyHolidayMove, renderClassAnalysisPanel, renderDayBreakdownPanel, renderSignaturePanel, attRunPrint |
| [S11] STAFF ATTENDANCE | Month, daily, movements, archive, QR preview | initStaffAttendanceTab, loadStaffMonth, renderStaffMonthTables, renderStaffMovementTables, staffAttOpenMovementModal, staffAttClockOut, renderStaffArchiveList, staffAttRunPrint |
| [S12] CALENDAR | Viewer | loadCalendar |
| [S13] CALENDAR IMPORT | Placeholder | loadCalendarImportHistory, initCalendarImportTab |
| [S14] QR | Gate QR + /g/ flow | loadActiveQR, renderQR, generateQR, handleQRScanIfPresent, qrScanPromptStaffId, qrScanRecordClockIn, qrScanRecordMovementOut, qrScanRecordMovementIn, qrScanRecordClockOut, qrScanShowSuccess, qrScanShowFatal, qrShowToast |
| [S14b] ID-CARD SCAN | /s/ per-person flow | handleIDCardScanIfPresent, idcScanLearnerFlow, idcScanStaffFlow, idcScanVisitorFlow, idcPromptOneLine, idcPromptChoice |
| [S15] REPORTS | The Workshop | initReportsTab |
| [S16] CLASSES | List, add, Manage Subjects | loadClasses, openClassSubjectsEditor, saveClassSubjects, openAddClassModal, seedDefaultClasses |
| [S17] USERS | Permissions grid | loadUsers, renderPermEditor, saveUserPerms, setAllPerms, resetUserPassword |
| [S18] BROAD SHEET | Scores console, importer, auto-assign | initBroadSheetTab, bsPopulatePickers, bsDownloadTemplate, bsImportScoresFile, bsCommitImport, autoAssignRatings, gradeForScore, buildRatingsForBand, pickCommentFromBank |
| [S19] WIRE + BOOT | Wiring, boot, scan routing | wireEventListeners, boot, safetySweep |
| [S20] PUBLIC API | Expose essentials to window.TIS | (inline) |
| [S21] ID CARDS | CR80 designer | initIDCardsTab, idcDrawFront, idcDrawBack, idcRenderCardPng, idcOpenA4Preview, idcDownloadZip |
| [S22] RESULTS | Report card viewer | initResultsTab, resultsLoadReport, resultsPrint, resultsBuildTermly, resultsBuildSessional, resultsPrintCss, resultsHeaderHtml, resultsStudentBar, resultsStatsBlock, resultsSessionalStats, resultsCommentsBlock |

**Frozen sections:** [S01]–[S14], [S19], [S20], [S21].
**Active work areas:** [S15], [S18], [S22].

---

## PART 3 — `supabase-client.js` METHOD LIST

Every method on `window.TIS`. Return shape: `{ ok: true, data }` or
`{ ok: false, error }`. Never throw.

### Auth
- signIn(operatorId, password) — authenticate; returns user + profile
- signOut() — end session
- getCurrentProfile() — fetch current operator's row
- changePassword(newPassword) — update and clear flag

### Learners
- listLearners() — all, ordered by name
- searchLearners(term) — fuzzy search
- getLearner(id) — by numeric id
- getLearnerByPin(pin) — by PIN
- createLearner(row) — insert; auto-PIN if pin blank
- updateLearner(id, patch) — update
- setLearnerContactPriority(learnerId, {p1,p2,p3}) — calling order
- findLearnerDuplicate(name, dateOfBirth) — duplicate check
- recordLearnerScan(learnerId, term, year, markedBy) — daily attendance from scan

### Storage
- uploadAsset(folder, filename, file) — TISAssets upload, returns URL
- deleteAsset(folder, filename) — delete from bucket

### Staff
- listStaff, getStaff, createStaff, updateStaff, deleteStaff

### Staff Attendance
- listStaffAttendanceToday(date)
- listStaffAttendanceRange(from, to)
- listStaffMovementsToday(date)
- listStaffAttendanceForMonth(year, month)
- listStaffMovementsForMonth(year, month)
- upsertStaffAttendance(row)
- createStaffMovement(row)
- updateStaffMovement(id, patch)
- closeStaffMovement(id, time)
- archiveStaffMonth(year, month)
- listArchivedStaffMonths()
- getArchivedStaffMonth(year, month)

### QR
- getActiveQRToken()
- generateQRToken(operatorName)
- getQRTokenByValue(token)

### Visits and Scan Events
- recordVisitorScan(payload) — first scan in, second out
- logScanEvent(event) — best-effort log

### Terms
- listTerms() / getTerms()
- getActiveTerm()
- setActiveTerm(termId)

### Promotion
- getPromotionStatus()
- termPromote(fromTerm, fromYear, toTerm, toYear, ids)
- yearPromote(promotions)
- getLearnersForClasses(classNames)

### Classes and Subjects
- listClasses()
- createClass, updateClass, deleteClass
- getNextClass(name)
- getClassSubjects(className)
- setClassSubjects(className, mappings)
- listSubjects()
- listClassAliases()

### Scores
- getScoresForLearners(learnerIds, term, year)
- getScoresForTerm(learnerId, term, year)
- upsertScore(row)

### Report Ratings
- getReportRatings(learnerId, term, year)
- upsertReportRating(row)

### Comment Bank
- getCommentBank(field, band)
- listCommentBank()
- createCommentBank(row)
- updateCommentBank(id, patch)
- deleteCommentBank(id)
- bandForAverage(average) — returns band name

### Calendar
- getCalendar() / listCalendar()

### Users
- getPermissionMatrix()
- setUserAuthorities(id, authorities)
- getAllUsers, getUserById, updateUser
- deactivateUser, reactivateUser
- createUser(data)
- adminResetPassword(...) — not implemented
- roleDefaults(role)

### Results helpers
- getClassPopulation(className)
- getAttendanceSummaryForTerm(learnerId, term, year)
- getResumptionDate(term, year)
- getLearnerTermRecord(learnerId, term, year)

<!-- end of part 2 -->

Never end a message in the middle of a code block. If the output
limit is approaching, stop the message before the code starts,
and continue in the next message with the same header.

### Never assume

- Ask the owner to paste the current file before modifying it.
- Ask for confirmation after every delivery.
- Test in incognito with `?v=<Date.now()>` before diagnosing an
  error the owner reports.
- If the owner says something is missing, believe them. Ask
  them to paste the surrounding code, do not argue from memory.

### Delivery cadence

One delivery at a time. Test between each.

Each delivery includes:
1. What to test.
2. Expected outcome.
3. What to report back.

Never move to the next delivery until the previous is confirmed
working — or confirmed broken with a specific error.

### Terminology

| Term | Meaning |
|---|---|
| Full-section replacement | The entire function or section, not a diff |
| Inline patch | Line-by-line instruction. Banned except for cosmetic string-only edits |
| Frozen section | Must not be touched without full-section replacement |
| Truncated | Code block cut off. Always a delivery bug, not a code bug |
| Scan route | `/s/<code>` — per-person card QR |
| Gate route | `/g/<token>` — staff gate QR |
| Public page | `/check` — login-free results viewer |

---

## PART 7 — LESSONS LEARNED

Seven failure modes hit hard in the session that produced this
document. Every one has a clear, repeatable cause.

### Lesson 1 — Partial pastes silently break `app.js`

`app.js` is one IIFE. A single unclosed brace at the end of any
function kills the whole file. There is no isolation between
sections.

Prevention:
- Split blocks over ~200 lines into Part 1 of N / Part 2 of N.
- After every large paste, ask for 2–3 Ctrl+F checks confirming
  known strings appear exactly once.
- If a syntax error is reported, ask for 50 lines above and below
  the error line. Do not guess.

### Lesson 2 — RLS was silently re-enabled on new tables

After creating new tables (`subjects`, `class_subjects`,
`comment_bank`, `report_ratings`), a client fetch returned zero
rows despite the tables being populated. The RLS flag was true.

Cause: Supabase's SQL editor runs `alter table` statements as
they appear. If any earlier statement fails, the block can stop
partway, leaving the RLS-disable lines at the bottom unrun. When
the table is later re-created, Supabase defaults to RLS enabled.

Prevention:
- Put `alter table ... disable row level security` early in the
  block, right after each `create table`.
- Always end a schema SQL block with a diagnostic that checks
  `pg_class.relrowsecurity` for every new table. If it prints
  true, the alter did not run.

### Lesson 3 — The duplicate seed silently doubled

The `comment_bank` seed ran twice, producing 192 rows instead of
96. Because there was no unique constraint on
`(field, band, text)`, Postgres accepted both runs.

Cause: `on conflict do nothing` only deduplicates if there is a
constraint to conflict against.

Prevention:
- Always add a unique constraint to any table that will be seeded.
- Confirm the resulting count matches the expected count after
  seeding.

### Lesson 4 — Chasing the wrong layer wastes hours

Time was spent diagnosing "the secret is wrong" when the actual
failure was two layers deeper. The `SUPABASE_DB_URL` secret was
correct; the failure was that `pg_dump` version 16 on the GitHub
runner could not connect to a Supabase server running version
17.6. The `comment_bank` table was populated but the client kept
returning empty; the failure was RLS on the table.

Prevention:
- Add a diagnostic step first. Before trying a fix, print the
  actual state (e.g. `echo "Length of secret: ${#URL}"`).
- Isolate one variable at a time. Prove the secret is correct,
  then the host is reachable, then the credentials are valid.
- Read the exact error. It usually names the layer.

### Lesson 5 — Bitwarden was assumed; Gmail was reality

The recovery runbook was written assuming Bitwarden would store
credentials. In practice the owner stores everything in linked
Gmail accounts (school email + personal email) with the sealed
envelope as fallback.

Cause: Assumptions about the owner's tools without asking.

Prevention: Ask before assuming. If the answer is not one of the
common tools, adapt.

### Lesson 6 — Two similar routes caused confusion

`/s/<code>` (scan) and `/check` (results) are adjacent in the
URL space. Every conversation about "the QR" required
disambiguation.

Prevention: Name routes so their purpose is obvious. When
designing a new route, ask: "Will someone reading this URL in a
year know what it is for?"

### Lesson 7 — Truncation happens

The initial delivery of the handover was cut off mid-sentence.
The owner caught it. The document was re-delivered as three
sub-parts.

Prevention:
- Know your own limits. If a section will be long, split it
  before writing.
- Stop cleanly. Never end a message mid-sentence. If you must
  stop, stop at a paragraph break with a "to be continued"
  note.
- When in doubt, split.

### The meta-lesson

Every failure this session was caught by the owner asking a
direct question. "Is everything covered?" "How do I use this?"
"Where does this go?"

Encourage the owner to ask. Never make him feel that a "why" or
a "wait, what about X?" is a distraction. It is the single most
valuable thing he does.

---

## PART 8 — PENDING ITEMS (detailed scope)

Each item has: what, why, scope estimate, unblocked by.

### A — Public results viewer `/check`

What: Login-free page. Student enters PIN, sees "Welcome,
<Name>", picks term and year, views the report card.

Why: Delivery mechanism for the CBT pipeline. Without it,
parents come to the office.

Scope: 3–4 deliveries.

1. `check.html` and `check.js` — PIN input, learner lookup,
   welcome banner. No portal code loaded. Route in `vercel.json`.
2. Extend `report-render.js` (see C) so public and internal
   render identically.
3. Clearance gate. `learner_terms.cleared != 'Yes'` → score
   cells show `—` with overlay: *"TIS Payment Policy — please
   pay your outstanding balance to view this result. Contact
   the school office."* Subject names, attendance, class,
   gender visible.
4. `results_views` audit table and logging.

Unblocked by: nothing. Start any time.

### B — Report card parity with PDF samples

What: Match `SAMPLE TERMLY REPORT CARD.pdf` and
`SAMPLE CUMULATIVE REPORT CARD.pdf` exactly.

Missing pieces:
- Psychomotor column (10 ratings) from `report_ratings.ratings`.
- CLASS AVG / H.S. / L.S. columns per subject.
- Stamp image from `TISAssets/stamp and signed.gif`.
- QR code on the report card pointing to `/check/<PIN>`.
- Bar chart (subject totals, coloured by grade) on canvas.
- Auto term selection: 1st/2nd → termly, 3rd → sessional.
- Comments from `report_ratings` with `{first}` filled.
- Grade / Remarks auto-computed.

Scope: 2–3 deliveries, iterated against the PDFs.

Unblocked by: C.

### C — Shared `report-render.js`

What: Extract the whole render pipeline from `[S22]` into a
standalone file loaded by both `index.html` and `check.html`.

Why: Avoids duplication. Layout changes update both pages at
once.

Scope: 1 delivery.

Unblocked by: A design (so the file exports the right shape).

### D — Fees module

What: Class-wide bills and per-learner adjustments.

Scope: 2 deliveries.

1. SQL: `fee_schedule` (class × term × year → tuition,
   other_major, other_minor, books) and `fee_adjustments`
   (learner × term × year → additions, deductions, notes).
2. UI: one panel for schedule, one for adjustments. Report
   card reads from these.

Unblocked by: nothing.

### E — Deactivate / reactivate learners

What: Toggle in the Learners module to mark a learner as not
currently in school, without deleting the record.

Scope: 1 delivery.

- Add `is_active` boolean to `learners` (or reuse
  `date_of_withdrawal`).
- Grid filter: Active only / Inactive / All.
- Edit modal: Deactivate / Reactivate button.
- Attendance registers and ID Cards exclude inactive.

Unblocked by: nothing.

### F — Delete duplicate learners

What: Super-admin tool to identify and remove duplicated rows.

Scope: 1 delivery.

- Diagnostic SQL listing suspected duplicates (name + DOB).
- Review screen with side-by-side comparison.
- Merge or delete with confirmation.

Unblocked by: nothing.

### G — Audit log UI + full write-path wiring

What: Table exists (`audit_log`). Write paths partially wired
(learner edits logged; most other writes are not). Panel not
built.

Scope: 2 deliveries.

1. Complete write-path wiring — ~15 call sites in `app.js`.
2. Panel in Users tab — reverse-chronological, grouped by
   term, filterable, before/after diff, undo (only if no later
   edit exists on the same entity).

Unblocked by: nothing.

### H — Learner Collectibles tab

What: New non-critical tab for collectibles.

Scope: 1 delivery.

Unblocked by: nothing. Low priority.

### I — Offline report generation + one-click upload

What: Larger CBT roadmap item — generate report cards offline,
upload in bulk.

Scope: Multi-week. Do not start until the online pipeline is
stable.

Unblocked by: A–D complete.

### J — Digital library

What: Staff lesson-note generation, research tools. Learner
assignments and resources over the school LAN with cloud sync.

Scope: Multi-month. Design phase not started.

Unblocked by: everything above.

### K — Offline CBT app upload

What: The offline CBT app itself. Belongs to a separate
project. The importer is already built and waiting.

Unblocked by: nothing on the portal side.

---

## PART 9 — ROADMAP

Ordered phases. Each delivers value standalone.

### Phase A — Public results viewer (highest priority)

Deliver 8.A items 1–4.

End state: `/check` live. Parents view results by PIN. Clearance
gate applies. Lookups audited.

### Phase B — Report card parity

Deliver 8.C (extract renderer), then 8.B.

End state: Report cards match the sample PDFs. Stamp, QR,
psychomotor, bar chart, auto term selection all present.

### Phase C — Fees module

Deliver 8.D.

End state: Class bills and per-learner adjustments feed the
report card footer.

### Phase D — Learner and staff housekeeping

Deliver 8.E, 8.F.

End state: Deactivate/reactivate learners. Duplicate cleanup.

### Phase E — Audit log

Deliver 8.G.

End state: Every write logged. Super-admin review and undo.

### Phase F — Offline pipeline

Deliver 8.I.

End state: Report cards generated offline, uploaded in bulk.

### Phase G — Digital library

Deliver 8.J. Design first.

End state: Staff and learner resource management on the LAN.

---

## PART 10 — MAINTAINING THIS DOCUMENT

Three files, kept in sync:

| File | Purpose | Update |
|---|---|---|
| `HANDOVER.md` | Current state | Every session |
| `REFERENCE.md` | Schemas, maps, rules, conventions | Only when architecture changes |
| `HISTORY.md` | Session-by-session log | Every session, append-only |

### The maintenance loop

Every session:

1. Update the "Last updated" date at the top of `HANDOVER.md`.
2. Move completed items from "pending" to "live".
3. Add newly discovered items to the pending table.
4. Append one entry to `HISTORY.md`.
5. Commit both. Vercel publishes `/handover` in ~30 seconds.
6. Update the pinned Google Doc if one exists.

When architecture changes:

1. Update `REFERENCE.md` — new tables, new sections, new
   methods, new rules.

### The rule for the next assistant

When a new AI starts:

1. Read `HANDOVER.md`, `REFERENCE.md`, `HISTORY.md`.
2. Ask the owner: "Has anything changed since the date at the
   top of HANDOVER.md?"
3. Ask for the current file before modifying it.
4. Deliver one full-section replacement at a time.
5. Test after every delivery.
6. Update the handover when a phase completes.

### Live URLs

- https://tis-tan.vercel.app/handover
- https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md
- https://raw.githubusercontent.com/docayo/tis/main/REFERENCE.md
- https://raw.githubusercontent.com/docayo/tis/main/HISTORY.md

---

## PART 11 — CLOSING

This project has grown from a Google Sheet to a live
multi-module portal in a short time. The core is stable. The
remaining work is well-scoped.

The single most valuable thing you can do going forward is keep
this document alive. Every session that ends with an updated
handover is a session that ends cleanly.

The owner has been a careful, patient partner through this
build. Treat his questions as valuable diagnostics, not
interruptions. He has caught more bugs than any single test.

The next assistant should be better than the last. That is the
point of this document.

---

**End of `REFERENCE.md`.**
**Next file: `HISTORY.md`.**
