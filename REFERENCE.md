# TIS EMIS — REFERENCE

**Companion to:** `HANDOVER.md` (current state) and `HISTORY.md` (session log).
**Last updated:** 5 October 2026

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

Expected: rls_enabled = false. If true, the client gets empty results
and 403 on writes.

users
Portal operators. Linked 1-to-1 with auth.users.

Column	Type	Notes
id	uuid	PK, matches auth.users.id
operator_id	text	01 … 04
name	text	Display name
role	text	super_admin / admin / operator / teacher
position	text	
avatar_url	text	
is_active	boolean	
must_change_password	boolean	
authorities	jsonb	Permission map
last_login	timestamptz	
password_last_changed	timestamptz	
deleted	boolean	Legacy filter flag
created_at, updated_at	timestamptz	
learners
One row per learner. Bio only — fees in learner_terms and
fee_schedule + fee_adjustments.

Column	Type	Notes
id	bigint	PK
pin	text	Unique. TIS####. Auto-assigned by trigger if blank. Never reused.
name	text	Surname first
class_name	text	Canonical
gender	text	Male / Female
date_of_birth	text	Mixed formats historically
photo_url	text	Public URL to TISAssets
father_phone, mother_phone, guardian_phone	text	
contact_priority_1, _2, _3	text	Calling order
account_number	text	
blood_group	text	
religion, allergy, parents_name	text	
address	text	
state_of_origin, lga_of_origin	text	
state_of_birth, lga_of_birth	text	
lin	text	Learner Identification Number
class_before_admission, class_admitted_into	text	
date_of_admission	text	
class_at_withdrawal	text	
date_of_withdrawal	text	Non-empty → exited
exit_reason	text	Filled on exit. Used by Hide Inactive filter.
card_active	boolean	Default true
created_at, updated_at	timestamptz	
learner_terms
Fee record per learner per term. Per-learner snapshot: what was
actually billed and what has been paid.

Column	Type	Notes
id	bigint	PK
learner_id	bigint	FK learners.id
term_type	text	1st / 2nd / 3rd
year	int	
class_name	text	Snapshot
tuition, scholarship, bill, other_bill	numeric	
other_bills_major, other_bills_minor, books	numeric	
balance_bf, total_part_payment, balance_cf	numeric	
part_payment_N_date, part_payment_N_amount	text / numeric	N = 1..5
cleared	text	Yes / No
clearance	text	Date
created_at, updated_at	timestamptz	
fee_schedule
The class-wide bill. One row per class × term × year. This is the
school's published fee structure. The report card's fee breakdown
reads tuition, other_bills_major, other_bills_minor and books from
here.

Column	Type	Notes
id	bigserial	PK
class_name	text	Canonical class name
term_type	text	1st / 2nd / 3rd
year	int	
tuition	numeric(12,2)	Default 0
other_bills_major	numeric(12,2)	Default 0
other_bills_minor	numeric(12,2)	Default 0
books	numeric(12,2)	Default 0
notes	text	
created_at, updated_at	timestamptz	
Unique on (class_name, term_type, year).

fee_adjustments
Per-learner deviations from the class bill. One row per learner ×
term × year. deductions is what the report card shows as
Scholarship (hidden when zero). additions is the Additions
row (hidden when zero).

Column	Type	Notes
id	bigserial	PK
learner_id	bigint	FK learners.id
term_type	text	
year	int	
additions	numeric(12,2)	Default 0
deductions	numeric(12,2)	Default 0
reason	text	
notes	text	
created_at, updated_at	timestamptz	
Unique on (learner_id, term_type, year).

terms
Column	Type	Notes
id	bigint	PK
term_type	text	1st / 2nd / 3rd
year	int	
label	text	1ST TERM 2026/2027
start_date, end_date	date	
is_active	boolean	
created_at	timestamptz	
No academic_year column. Derived as year + '/' + (year + 1).

academic_calendar
Column	Type	Notes
id	bigint	PK
event_date	date	
day_name	text	
event_type	text	
description	text	Resumption tags: RESUMPTION (FIRST TERM), RESUMPTION (SECOND TERM), RESUMPTION (THIRD TERM)
term_type	text	
week_number	int	
academic_year	text	2026/2027
is_holiday	boolean	
holiday_name	text	
classes
Column	Type	Notes
id	bigint	PK
name	text	Canonical
level	text	
stream	text	SCIENCE / ART / HUMANITIES / BUSINESS
next_class	text	
is_active	boolean	
sort_order	int	100 CRECHE … 630 SS 3 BUSINESS
notes	text	
created_at	timestamptz	
class_subjects
Slot map per class.

Column	Type	Notes
id	bigint	PK
class_name	text	
slot	int	1..18
subject_code	text	FK subjects.code
created_at	timestamptz	
Unique on (class_name, slot) and (class_name, subject_code).

class_aliases
Column	Type	Notes
upload_code	text	PK. E.g. JSS_1
canonical_name	text	E.g. JSS 1
subjects
Column	Type	Notes
id	bigint	PK
code	text	Unique. ENG, MATH, CHEM, …
display_name	text	ENGLISH LANGUAGE, …
is_active	boolean	
created_at	timestamptz	
scores
One row per learner × subject × term × year.

Column	Type	Notes
id	bigint	PK
learner_id	bigint	FK learners.id
subject_code	text	FK subjects.code
term_type	text	
year	int	
test1, test2, exam	numeric(5,2)	Max 20/30/50
total	numeric(6,2)	Sum
grade	text	A..F
remark	text	EXCELLENT, VERY GOOD, …
source	text	upload / manual
uploaded_at, updated_at	timestamptz	
uploaded_by	text	
Unique on (learner_id, subject_code, term_type, year).

report_ratings
Column	Type	Notes
id	bigint	PK
learner_id	bigint	FK learners.id
term_type	text	
year	int	
ratings	jsonb	{ leadership: 'V.GOOD', … } 10 keys
teacher_comment	text	
principal_comment	text	
teacher_edited, principal_edited	boolean	Human has saved
auto_assigned_at	timestamptz	
updated_at, updated_by	timestamptz, text	
Unique on (learner_id, term_type, year).

comment_bank
Column	Type	Notes
id	bigint	PK
field	text	teacher / principal
band	text	excellent / very_good / good / average / fair / poor
category	text	general / subject_strong / subject_strong_weak / subject_weak
text	text	Placeholders {first}, {strong1}, {weak1}
is_active	boolean	
created_at	timestamptz	
Unique on (field, band, category, text). 336 rows.

attendance_learner
Column	Type	Notes
id	bigint	PK
learner_id	bigint	FK learners.id
term_type	text	
year	int	
attendance_date	date	
mark	text	O O / backslash / slash / both
marked_by	text	
marked_at	timestamptz	
Unique on (learner_id, attendance_date).

attendance_staff
Column	Type	Notes
id	bigint	PK
staff_id	bigint	FK staff.id
attendance_date	date	
clock_in, clock_out	text	HH:MM
status	text	Present
note	text	Has note, not remark
logged_by	text	
source	text	QR / Manual
month_archived	boolean	
created_at, updated_at	timestamptz	
Unique on (staff_id, attendance_date).

staff
Column	Type	Notes
id	bigint	PK
staff_id	text	E.g. TIS2406
surname, first_name, middle_name	text	
full_name	text	Generated
gender, date_of_birth	text	
school, department, position	text	
phone, email	text	
qualification, graduation_year, course_of_study	text	
subjects_taught	text	
bank, account_number, bvn	text	
salary	numeric	
resume_time, close_time	text	HH:MM
late_cutoff, early_cutoff	text	HH:MM
status	text	Active / Inactive
photo_url	text	TISAssets/staff/ID.png
card_active	boolean	Default true
created_at, updated_at	timestamptz	
staff_movements
Column	Type	Notes
id	bigint	PK
staff_id	bigint	FK staff.id
movement_date	date	
time_out, time_in	text	
reason, destination, purpose	text	
logged_by	text	
month_archived	boolean	
created_at, updated_at	timestamptz	
staff_attendance_archive, staff_movements_archive
Month snapshots. Mirror live tables plus archive_year,
archive_month, staff_no, staff_name.

qr_tokens
Column	Type	Notes
id	uuid	PK
token	text	
generated_by	text	
generated_at	timestamptz	
expires_at	timestamptz	
is_active	boolean	
regenerated_by, regenerated_at	text, timestamptz	
recovery_codes
Column	Type	Notes
id	bigint	PK
code	text	6 chars, no ambiguous (0/O/1/I/L)
email_to	text[]	
created_at, expires_at	timestamptz	
used_at	timestamptz	
used_by_ip, used_by_ua	text	
notes	text	
recovery_attempts
Column	Type	Notes
id	bigint	PK
created_at	timestamptz	
ip_address, user_agent, referrer	text	
action	text	request / verify-ok / verify-bad
success	boolean	
code_masked	text	
notes	text	
visits
Column	Type	Notes
id	bigint	PK
card_code	text	VIS-01 … VIS-05
visitor_name	text	
purpose	text	Official / Personal
agency, agency_other	text	
time_in, time_out	text	
visit_date	date	
status	text	In / Out
recorded_by, notes	text	
created_at, updated_at	timestamptz	
scan_events
Column	Type	Notes
id	bigserial	PK
code	text	PIN / Staff ID / VIS code
code_type	text	learner / staff / visitor / unknown
actor_id, actor_name	text	
action	text	attendance / clock-in / clock-out / movement-out / movement-in / visit-in / visit-out / lookup
success	boolean	
detail, scanned_by	text	
scan_date	date	
scanned_at	timestamptz	
results_views
Audit log of every public results-page lookup. Written by
TIS.logResultsView on /r and /r/<PIN>.

Column	Type	Notes
id	bigserial	PK
created_at	timestamptz	Default now()
learner_id	bigint	Null if not found
pin	text	The PIN that was queried
term_type	text	
year	int	
report_type	text	termly / sessional
outcome	text	ok / not-cleared / not-found / build-failed
ip_masked	text	Best-effort, first two octets
user_agent	text	
Indexes on pin and created_at desc. RLS off.

audit_log
Table exists; UI not built; write paths partially wired.

Column	Type	Notes
id	bigserial	PK
created_at	timestamptz	
actor_id	uuid	
actor_name, actor_role	text	
action	text	learner.create / learner.update / …
entity_type	text	learner / staff / attendance / user
entity_id, entity_name	text	
before, after	jsonb	Full row snapshots
notes	text	
term_type, year	text / int	For termly grouping
undone_at, undone_by	timestamptz / text	Reserved
<!-- end of part 1 -->
PART 2 — app.js SECTION MAP
IIFE-wrapped. Sections [S01]–[S22]. Line numbers drift; use the
section header comments to locate.

Section	Purpose	Key functions
[S01] STATE	Global state, module list	State, ALL_MODULES
[S02] UTILITIES	DOM, escape, dates, loaders, modal	$, esc, escAttr, showToast, startLoader, stopLoader, closeModal, pageLoaderHTML, emptyHTML, errorHTML, debounce
[S03] PERMISSIONS	Permission checks	hasPermission, isSuperAdmin, applyPermissionsToUI, getFirstPermittedTab
[S04] AUTH	Login, logout, session	doLogin, doLogout, showLoginScreen, enterDashboard
[S05] PASSWORD CHANGE	Change modal	openChangePasswordModal, submitChangePassword
[S06] NAVIGATION	Tab switching	switchTab
[S07] LEARNERS	Grid, view, edit, add, photo, print, bulk	loadLearners, renderLearners, openLearnerViewModal, openLearnerEditModal, saveLearnerEdits, openAddLearnerModal, submitNewLearner, openPartPaymentModal, openPrintOptionsModal, openLearnerPhotoModal, submitLearnerPhoto, openBulkPhotoUploadDialog, submitBulkPhotoUpload, downloadLearnerTemplate, uploadLearnerUpdates, printLearnerList
[S08] STAFF	Grid, view, edit, add, photo, print	loadStaff, renderStaff, openStaffProfile, openStaffEditModal, saveStaffEdits, openAddStaffModal, submitNewStaff, openStaffPhotoModal, submitStaffPhoto, printStaffCard, printStaffList
[S09] TERMS	List, activate, promotion, fees panel	loadTerms, activateTerm, openPromotionWizard, renderPromotionWizard, pwApplyTerm, pwApplyYear, pwApplySpecial, checkPromotionBanner, initFeesPanel, feesLoad, feesLoadSchedule, feesLoadAdjustments, feesSaveScheduleRow, feesSaveAdjustmentRow
[S10] LEARNER ATTENDANCE	Register, holiday, analysis, breakdown, signatures, print	initLearnerAttendanceTab, loadAttendanceRegister, renderAttendanceRegister, attCycleCell, attMarkClassPresent, attSaveAllChanges, attApplyHolidayMove, renderClassAnalysisPanel, renderDayBreakdownPanel, renderSignaturePanel, attRunPrint
[S11] STAFF ATTENDANCE	Month, daily, movements, archive, QR preview	initStaffAttendanceTab, loadStaffMonth, renderStaffMonthTables, renderStaffMovementTables, staffAttOpenMovementModal, staffAttClockOut, renderStaffArchiveList, staffAttRunPrint
[S12] CALENDAR	Viewer	loadCalendar
[S13] CALENDAR IMPORT	Placeholder	loadCalendarImportHistory, initCalendarImportTab
[S14] QR	Gate QR + /g/ flow	loadActiveQR, renderQR, generateQR, handleQRScanIfPresent, qrScanPromptStaffId, qrScanRecordClockIn, qrScanRecordMovementOut, qrScanRecordMovementIn, qrScanRecordClockOut, qrScanShowSuccess, qrScanShowFatal, qrShowToast
[S14b] ID-CARD SCAN	/s/ per-person flow	handleIDCardScanIfPresent, idcScanLearnerFlow, idcScanStaffFlow, idcScanVisitorFlow, idcPromptOneLine, idcPromptChoice
[S15] REPORTS	The Workshop	initReportsTab
[S16] CLASSES	List, add, Manage Subjects	loadClasses, openClassSubjectsEditor, saveClassSubjects, openAddClassModal, seedDefaultClasses
[S17] USERS	Permissions grid	loadUsers, renderPermEditor, saveUserPerms, setAllPerms, resetUserPassword
[S18] BROAD SHEET	Scores console, importer, auto-assign	initBroadSheetTab, bsPopulatePickers, bsDownloadTemplate, bsImportScoresFile, bsCommitImport, autoAssignRatings, gradeForScore, buildRatingsForBand, pickCommentFromBank
[S19] WIRE + BOOT	Wiring, boot, scan routing	wireEventListeners, boot, safetySweep
[S20] PUBLIC API	Expose essentials to window.TIS	(inline)
[S21] ID CARDS	CR80 designer	initIDCardsTab, idcDrawFront, idcDrawBack, idcRenderCardPng, idcOpenA4Preview, idcDownloadZip
[S22] RESULTS	Report card viewer	initResultsTab, resultsLoadReport, resultsPrint, resultsBuildTermly, resultsBuildSessional, resultsPrintCss, resultsWatermarkHtml, resultsHeaderHtml, resultsStudentBar, resultsStatsBlock, resultsSessionalStats, resultsCommentsBlock, resultsPsychomotorBlock, resultsFeeBreakdownBlock, resultsPerformanceChart, resultsQRCode, resultsBottomRow, buildFeeBreakdown, nextTermLabel
Frozen sections: [S01]–[S14], [S19], [S20], [S21].
Active work areas: [S07], [S09], [S15], [S18], [S22].

Companion files loaded by index.html, in order:

supabase-client.js — backend bridge, exposes window.TIS.

report-render.js — shared report renderer, exposes window.TISReport.

app.js — portal UI.

learner-bulk.js — legacy, Apps Script era. Not loaded by index.html. Not maintained.

calendar-module.js — calendar upload/render/adjust via Apps Script.

Companion files loaded by check.html, in order:

supabase-client.js

report-render.js

check.js

PART 3 — supabase-client.js METHOD LIST
Every method on window.TIS. Return shape: { ok: true, data } or
{ ok: false, error }. Never throw.

Auth
signIn(operatorId, password) — authenticate; returns user + profile

signOut() — end session

getCurrentProfile() — fetch current operator's row

changePassword(newPassword) — update and clear flag

Learners
listLearners() — all, ordered by name

searchLearners(term) — fuzzy search

getLearner(id) — by numeric id

getLearnerByPin(pin) — by PIN

createLearner(row) — insert; auto-PIN if pin blank

updateLearner(id, patch) — update

setLearnerContactPriority(learnerId, {p1,p2,p3}) — calling order

findLearnerDuplicate(name, dateOfBirth) — duplicate check

recordLearnerScan(learnerId, term, year, markedBy) — daily attendance from scan

Storage
uploadAsset(folder, filename, file) — TISAssets upload, returns URL

deleteAsset(folder, filename) — delete from bucket

Staff
listStaff, getStaff, createStaff, updateStaff, deleteStaff

Staff Attendance
listStaffAttendanceToday(date)

listStaffAttendanceRange(from, to)

listStaffMovementsToday(date)

listStaffAttendanceForMonth(year, month)

listStaffMovementsForMonth(year, month)

upsertStaffAttendance(row)

createStaffMovement(row)

updateStaffMovement(id, patch)

closeStaffMovement(id, time)

archiveStaffMonth(year, month)

listArchivedStaffMonths()

getArchivedStaffMonth(year, month)

QR
getActiveQRToken()

generateQRToken(operatorName)

getQRTokenByValue(token)

Visits and Scan Events
recordVisitorScan(payload) — first scan in, second out

logScanEvent(event) — best-effort log

Results Views
logResultsView(entry) — best-effort public lookup log. Writes to results_views. Records learner_id, pin, term_type, year, report_type, outcome, ip_masked (best-effort via ipify), user_agent.

Fee Schedule
listFeeSchedule(year?, termType?) — filtered or all

getFeeScheduleRow(className, termType, year) — one row

upsertFeeSchedule(row) — insert or update, onConflict (class_name, term_type, year)

deleteFeeSchedule(id) — remove one row

Fee Adjustments
listFeeAdjustments(year?, termType?) — filtered or all

getFeeAdjustment(learnerId, termType, year) — one row

listFeeAdjustmentsForLearners(learnerIds, termType, year) — many rows, chunked

upsertFeeAdjustment(row) — insert or update, onConflict (learner_id, term_type, year)

deleteFeeAdjustment(id) — remove one row

Terms
listTerms() / getTerms()

getActiveTerm()

setActiveTerm(termId)

Promotion
getPromotionStatus()

termPromote(fromTerm, fromYear, toTerm, toYear, ids)

yearPromote(promotions)

getLearnersForClasses(classNames)

Classes and Subjects
listClasses()

createClass, updateClass, deleteClass

getNextClass(name)

getClassSubjects(className)

setClassSubjects(className, mappings)

listSubjects()

listClassAliases()

Scores
getScoresForLearners(learnerIds, term, year)

getScoresForTerm(learnerId, term, year)

upsertScore(row)

Report Ratings
getReportRatings(learnerId, term, year)

upsertReportRating(row)

Comment Bank
getCommentBank(field, band)

listCommentBank()

createCommentBank(row)

updateCommentBank(id, patch)

deleteCommentBank(id)

bandForAverage(average) — returns band name

Calendar
getCalendar() / listCalendar()

Users
getPermissionMatrix()

setUserAuthorities(id, authorities)

getAllUsers, getUserById, updateUser

deactivateUser, reactivateUser

createUser(data)

adminResetPassword(...) — not implemented

roleDefaults(role)

Results helpers
getClassPopulation(className)

getAttendanceSummaryForTerm(learnerId, term, year)

getResumptionDate(term, year)

getLearnerTermRecord(learnerId, term, year)

getLearnerTermFor(learnerId, termType, year)

PART 4 — report-render.js METHOD LIST
Every method on window.TISReport. Loaded by both index.html and
check.html. Produces the report card HTML and print CSS.

Sections
resultsHeaderHtml(title, learner) — school identity band. SVG titles, learner photo, school logo

resultsStudentBar(learner, pop, term, year, att) — student detail rows

resultsPsychomotorBlock(ratings) — 10-item psychomotor table

resultsFeeBreakdownBlock(fees) — the fee table below psychomotor. Scholarship and Additions rows hidden when zero

resultsStatsBlock(args) — TOTAL C.A / TOTAL EXAM / AGGREGATE / PERCENTAGE / HIGHEST / LOWEST. Accepts { sessional: true, sumTerm: [...] } for sessional

resultsSessionalStats(sumTerm, sessionalTotal, maxSessional, pct) — kept for compatibility

resultsCommentsBlock(learner, resume, feeText, ratings, promotedTo, lin) — comments, PROMOTED TO, LIN, RESUMPTION DATE. feeText is now always '' from callers, kept for signature compatibility

resultsStampBlock() — stamp image cell

resultsPerformanceChart(subjects) — coloured bar chart by grade

resultsQRCode(pin) — QR pointing at /r/<PIN>

resultsBottomRow(subjects, pin) — stamp / chart / QR side by side

Utilities
buildFeeText(termRec) — legacy single-line fee text. Retained for signature compatibility, no longer called from [S22] or check.js

resultsPrintCss() — the full print stylesheet

bandForTotal(total) — returns { grade, remark }

Private helpers
esc(s) — HTML escape

PSYCHOMOTOR_FIELDS — the ten rating keys and labels

PART 5 — ROUTES (vercel.json)
Route	Destination	Purpose
/g/:token	/index.html	Staff gate QR, smart clock flow
/s/:code	/index.html	Per-person card QR (learner / staff / visitor)
/rec	/rec.html	Recovery page
/handover	/handover.html	Handover reader
/r	/check.html	Public results page (new)
/r/:pin	/check.html	Public results deep link
/check	/check.html	Legacy route, kept so old QR codes resolve
/check/:pin	/check.html	Legacy deep link
Canonical public results path: /r and /r/<PIN>.

PART 6 — ABSOLUTE RULES
These are not suggestions. They exist because each was learned from a
real failure.

Delivery format
Every code delivery begins with a header of exactly this shape:

text
FILE: <file>
ACTION: REPLACE
START: <a line that exists verbatim in the owner's copy of the file>
END:   <a line that exists verbatim in the owner's copy of the file>
NEXT:  <the line immediately after END, also verbatim, so the paste
        boundary is visible>
Then, immediately below the header, the code. Nothing between the
header and the code. No prose. No "here is the block".

Boundaries
START and END are always lines that already exist in the
owner's copy of the file. If a boundary line is not in the file, it
is not a valid boundary.

When a change touches several sections of one file, deliver one
grouped replacement that begins at the earliest affected boundary
and ends at the latest affected boundary. Everything between is
handed over whole.

When a change touches most of a file, deliver a full-file
replacement.

Banned phrasing
"Find this line and change it."

"Insert after line X."

"The closing brace of function Y."

"Inside function X reading Y."

Any description of a boundary that is not itself a verbatim line
from the file.

Every delivery includes
The header block (FILE / ACTION / START / END / NEXT).

The full replacement code.

What to test.

What to report back.

Never
Touch a frozen section without a full-section replacement.

Assume the file state. Ask for the current file before modifying it.

Diagnose an error without first asking the owner to test in
incognito with ?v=<Date.now()>.

Argue from memory. If the owner says something is missing, believe
him. Ask for the surrounding code.

End a message in the middle of a code block.

Deliver more than one change at a time.

Never end a message in the middle of a code block
If the output limit is approaching, stop the message before the
code starts, and continue in the next message with the same header.

Never assume
Ask the owner to paste the current file before modifying it.

Ask for confirmation after every delivery.

Test in incognito with ?v=<Date.now()> before diagnosing an
error the owner reports.

If the owner says something is missing, believe them. Ask
them to paste the surrounding code, do not argue from memory.

Delivery cadence
One delivery at a time. Test between each.

Each delivery includes:

What to test.

Expected outcome.

What to report back.

Never move to the next delivery until the previous is confirmed
working — or confirmed broken with a specific error.

Terminology
Term	Meaning
Full-section replacement	The entire function or section, not a diff
Full-file replacement	The whole file, no partial boundaries
Inline patch	Line-by-line instruction. Banned except for cosmetic string-only edits
Frozen section	Must not be touched without full-section replacement
Truncated	Code block cut off. Always a delivery bug, not a code bug
Scan route	/s/<code> — per-person card QR
Gate route	/g/<token> — staff gate QR
Public page	/r — login-free results viewer
Print rendering
Do not use background-clip: text for anything that must print.
Chrome, Firefox and Edge rasterise the text without the background
and the text disappears. Use inline SVG with a real
<linearGradient> fill instead.

Do not use a CSS ::before pseudo-element with a
background-image for watermarks. Use a real <img> inside a
positioned container. The pseudo-element version does not render in
Chrome print preview.

Where things live — file-to-concern map
Concern	File
Portal UI, all sections	app.js
Backend bridge, all window.TIS methods	supabase-client.js
Report card renderer, shared by both pages	report-render.js
Public results page logic	check.js
Public results page markup	check.html
Portal markup	index.html
Routes	vercel.json
Shared styles	styles.css
learner-bulk.js is legacy (Apps Script era) and is not loaded
by any current page. Do not add new work to it. If a concern is not
listed above and not in learner-bulk.js, it belongs in app.js.

PART 7 — LESSONS LEARNED
Failure modes hit in the sessions that produced this document. Every
one has a clear, repeatable cause.

Lesson 1 — Partial pastes silently break app.js
app.js is one IIFE. A single unclosed brace at the end of any
function kills the whole file. There is no isolation between
sections.

Prevention:

Split blocks over ~200 lines into Part 1 of N / Part 2 of N.

After every large paste, ask for 2–3 Ctrl+F checks confirming
known strings appear exactly once.

If a syntax error is reported, ask for 50 lines above and below
the error line. Do not guess.

Lesson 2 — RLS was silently re-enabled on new tables
After creating new tables (subjects, class_subjects,
comment_bank, report_ratings, fee_schedule, fee_adjustments,
results_views), a client fetch returned zero rows despite the
tables being populated. The RLS flag was true.

Cause: Supabase's SQL editor runs alter table statements as
they appear. If any earlier statement fails, the block can stop
partway, leaving the RLS-disable lines at the bottom unrun. When
the table is later re-created, Supabase defaults to RLS enabled.

Prevention:

Put alter table ... disable row level security early in the
block, right after each create table.

Always end a schema SQL block with a diagnostic that checks
pg_class.relrowsecurity for every new table. If it prints
true, the alter did not run.

Lesson 3 — The duplicate seed silently doubled
The comment_bank seed ran twice, producing 192 rows instead of

Because there was no unique constraint on
(field, band, text), Postgres accepted both runs.

Cause: on conflict do nothing only deduplicates if there is a
constraint to conflict against.

Prevention:

Always add a unique constraint to any table that will be seeded.

Confirm the resulting count matches the expected count after
seeding.

Lesson 4 — Chasing the wrong layer wastes hours
Time was spent diagnosing "the secret is wrong" when the actual
failure was two layers deeper. The SUPABASE_DB_URL secret was
correct; the failure was that pg_dump version 16 on the GitHub
runner could not connect to a Supabase server running version
17.6. The comment_bank table was populated but the client kept
returning empty; the failure was RLS on the table.

Prevention:

Add a diagnostic step first. Before trying a fix, print the
actual state (e.g. echo "Length of secret: ${#URL}").

Isolate one variable at a time. Prove the secret is correct,
then the host is reachable, then the credentials are valid.

Read the exact error. It usually names the layer.

Lesson 5 — Bitwarden was assumed; Gmail was reality
The recovery runbook was written assuming Bitwarden would store
credentials. In practice the owner stores everything in linked
Gmail accounts (school email + personal email) with the sealed
envelope as fallback.

Cause: Assumptions about the owner's tools without asking.

Prevention: Ask before assuming. If the answer is not one of the
common tools, adapt.

Lesson 6 — Two similar routes caused confusion
/s/<code> (scan) and /check (results) are adjacent in the
URL space. Every conversation about "the QR" required
disambiguation.

Prevention: Name routes so their purpose is obvious. When
designing a new route, ask: "Will someone reading this URL in a
year know what it is for?" The current public page is at /r.

Lesson 7 — Truncation happens
The initial delivery of the handover was cut off mid-sentence.
The owner caught it. The document was re-delivered as three
sub-parts.

Prevention:

Know your own limits. If a section will be long, split it
before writing.

Stop cleanly. Never end a message mid-sentence. If you must
stop, stop at a paragraph break with a "to be continued"
note.

When in doubt, split.

Lesson 8 — Boundary anchors must exist in the file
Several deliveries this session used a boundary such as "the
closing brace of function X, immediately above the blank line
before Y". If X is not adjacent to Y in the file, the boundary
silently swallows unrelated functions. The owner caught this
before pasting.

Prevention:

Every START, END, NEXT is a line that already exists
verbatim in the file.

When in doubt, ask for the current file and paste the whole
section that will be replaced, then read it back to the owner
with the exact anchors.

Lesson 9 — Wrong file delivered
The owner asked for a fix to the Hide Inactive filter on the
Learners tab. The delivery was aimed at learner-bulk.js, which
is the legacy Apps Script bridge and is not loaded by any current
page.

Prevention:

Before delivering, confirm which file the concern actually lives
in by consulting the file-to-concern map above.

If the owner pastes a file, check that it is the file the concern
belongs to. If not, say so plainly rather than delivering against
it.

The meta-lesson
Every failure this session was caught by the owner asking a
direct question. "Is everything covered?" "How do I use this?"
"Where does this go?"

Encourage the owner to ask. Never make him feel that a "why" or
a "wait, what about X?" is a distraction. It is the single most
valuable thing he does.

PART 8 — PENDING ITEMS (detailed scope)
Each item has: what, why, scope estimate, unblocked by.

Item 1 — Hide Inactive bug on Learners tab
What: exited learners stay visible by default even with an exit
reason filled in, and the toggle appears ineffective.

Why: exited learners should not clutter the working grid.

Fix location: app.js [S07]. The filter is applyLearnerFilter;
the toggle button is btnToggleInactiveLearners; the wiring is in
initLearnersTab.

Criterion TBD by owner: date_of_withdrawal only, exit_reason
only, or either.

Scope: 1 delivery.

Item 2 — Reports Workshop comment default + arrow navigation
What: Teacher Comment and Principal Comment fields pre-load with a
comment-bank entry by default. Up / Down arrows cycle through the
bank.

Why: faster authoring, fewer blank fields slipping through to the
report card.

Fix location: app.js [S15], plus reads via TIS.getCommentBank.

Scope: 1 delivery.

Item 3 — Learners View modal reads from fee_schedule / fee_adjustments
What: the View modal in [S07] shows the same fee breakdown the
report card shows. Adding a new learner to a class applies that
class's bill by definition.

Fix location: app.js [S07], reading fee_schedule and
fee_adjustments.

Scope: 2–3 deliveries.

Item 4 — Deactivate / reactivate learners
What: Toggle in the Learners module to mark a learner as not
currently in school, without deleting the record.

Scope: 1 delivery.

Add is_active boolean to learners (or reuse
date_of_withdrawal).

Grid filter: Active only / Inactive / All.

Edit modal: Deactivate / Reactivate button.

Attendance registers and ID Cards exclude inactive.

Unblocked by: nothing.

Item 5 — Delete duplicate learners
What: Super-admin tool to identify and remove duplicated rows.

Scope: 1 delivery.

Diagnostic SQL listing suspected duplicates (name + DOB).

Review screen with side-by-side comparison.

Merge or delete with confirmation.

Unblocked by: nothing.

Item 6 — Audit log UI + full write-path wiring
What: Table exists (audit_log). Write paths partially wired.
Panel not built.

Scope: 2 deliveries.

Complete write-path wiring — ~15 call sites in app.js.

Panel in Users tab — reverse-chronological, grouped by
term, filterable, before/after diff, undo (only if no later
edit exists on the same entity).

Unblocked by: nothing.

Item 7 — Offline report generation + one-click upload
Multi-week. Do not start until the online pipeline is stable.
Unblocked by Items 1–5 complete.

Item 8 — Digital library
Multi-month. Design phase not started. Unblocked by everything above.

Item 9 — Offline CBT app integration
Belongs to a separate project. The importer is already built and
waiting. Unblocked by nothing on the portal side.

PART 9 — ROADMAP
Ordered phases. Each delivers value standalone.

Phase A — Public results viewer
Status: done. /r and /r/<PIN> live. Clearance gate. Lookups
audited in results_views.

Phase B — Report card parity
Status: done. Report cards match the sample PDFs. Stamp, QR,
psychomotor, bar chart, auto term selection, fee breakdown all
present.

Phase C — Shared report-render.js
Status: done. Extracted, loaded by both index.html and
check.html.

Phase D — Fees module and learner lifecycle
Sub-items:

D.1 — Fees module: done (tables, methods, panel, report card
wiring).

D.2 — Deactivate / reactivate learners: done per owner.

D.3 — Delete duplicate learners: pending.

D.4 — Audit log UI and full write-path wiring: pending.

Phase E — Small fixes and polish
Hide Inactive bug on Learners tab.

Reports Workshop comment default and arrow navigation.

Learners View modal reads from fee_schedule / fee_adjustments.

Phase F — Offline pipeline
Offline report generation, one-click upload.

Phase G — Digital library
Staff and learner resource management on the LAN. Design first.

PART 10 — MAINTAINING THIS DOCUMENT
Three files, kept in sync:

File	Purpose	Update
HANDOVER.md	Current state	Every session
REFERENCE.md	Schemas, maps, rules, conventions	Only when architecture changes
HISTORY.md	Session-by-session log	Every session, append-only
The maintenance loop
Every session:

Update the "Last updated" date at the top of HANDOVER.md.

Move completed items from "pending" to "live".

Add newly discovered items to the pending table.

Append one entry to HISTORY.md.

Commit both. Vercel publishes /handover in ~30 seconds.

When architecture changes:

Update REFERENCE.md — new tables, new sections, new
methods, new rules.

The rule for the next assistant
When a new AI starts:

Read HANDOVER.md, REFERENCE.md, HISTORY.md.

Ask the owner: "Has anything changed since the date at the
top of HANDOVER.md?"

Ask for the current file before modifying it.

Deliver one full-section replacement at a time.

Test after every delivery.

Update the handover when a phase completes.

Live URLs
https://tis-tan.vercel.app/handover

https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md

https://raw.githubusercontent.com/docayo/tis/main/REFERENCE.md

https://raw.githubusercontent.com/docayo/tis/main/HISTORY.md

PART 11 — CLOSING
This project has grown from a Google Sheet to a live multi-module
portal in a short time. The core is stable. The remaining work is
well-scoped.

The single most valuable thing you can do going forward is keep this
document alive. Every session that ends with an updated handover is a
session that ends cleanly.

The owner has been a careful, patient partner through this build.
Treat his questions as valuable diagnostics, not interruptions. He
has caught more bugs than any single test.

The next assistant should be better than the last. That is the point
of this document.

End of REFERENCE.md.
