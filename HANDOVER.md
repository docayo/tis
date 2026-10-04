# TIS EMIS — MASTER HANDOVER DOCUMENT
## Part 1 of 3 — Emergency Card · Where We Came From · Where We Are

**Date:** 4 October 2026
**Project:** The Ideal Schools — Operational Portal & Databank (TIS EMIS)
**Owner:** Dr Ayoola Gabriel Ololade FCIA. NIIA — ayonio@gmail.com — 08067071557
**Supersedes:** the original handover note dated 29 September 2026, and any interim notes.

**Read this entire document before touching anything.** It is deliberately long because the project has grown. If you are a new developer or an AI taking over, this is the only document you need. This document is split into three parts:

- **Part 1 (this file):** Emergency Card, Where We Came From, Where We Are.
- **Part 2:** Table schemas, `app.js` section map, `supabase-client.js` method list.
- **Part 3:** Rules, communication conventions, lessons learned, pending items, roadmap.

---

## PART 0 — EMERGENCY CARD (read this in 5 minutes)

If something is broken and you need the portal back up fast, start here.

### Where things live

| Asset | URL / Location |
|---|---|
| Live portal | `https://tis-tan.vercel.app` |
| Public results page (planned) | `https://tis-tan.vercel.app/check` |
| Recovery page | `https://tis-tan.vercel.app/rec` |
| GitHub repo (code) | `github.com/docayo/tis` |
| GitHub repo (backups) | `github.com/docayo/tis-backups` |
| Supabase project | `https://ndsroviwrfjbgaucajri.supabase.co` |
| Supabase dashboard | `https://supabase.com/dashboard/project/ndsroviwrfjbgaucajri` |
| Vercel dashboard | `vercel.com/dashboard` |
| Google Sheet (legacy) | `TIS DATABANK 01` — Sheet ID `1su0NjPu3LzuhmVo8Ec6xr0rCeuT2831pL_SoifnVZ8` |
| Apps Script | calendar proxy only — do NOT delete `Core.gs` / `Calendar.gs` |
| Sealed recovery codes | Physical envelope in school safe — "TIS RECOVERY CODES" |
| Recovery email | `theidealschools15@gmail.com` (owner also `ayonio@gmail.com`) |

### First three checks before doing ANYTHING

1. **Is it you or everyone?** Open the portal in a different browser, or on a phone with mobile data. If it works there → it's your device or the school Wi-Fi, NOT the portal. Do NOT run recovery.
2. **Is Supabase itself up?** Open `https://status.supabase.com`. If down → wait. Do NOT run recovery while Supabase is offline.
3. **One wrong record or the whole database wrong?** If one record → use the portal's edit tools, NOT recovery.

### If the portal loads but is broken (JS errors)

Nine times out of ten, it's stale cache. Test in **incognito with `?v=<Date.now()>`** before diagnosing.

If it's a real error and you know which commit broke it:
1. `github.com/docayo/tis/commits/main/app.js`
2. Click the commit **before** the broken one
3. Click `<>` (Browse repository at this point) → `app.js` → Raw → Ctrl+A / Ctrl+C
4. Go to `app.js` on `main`, pencil (Edit), Ctrl+A / Delete, paste the good version
5. Commit `Revert app.js to last working state`
6. Vercel deploys in 30 seconds

### Recovery trigger

Visit `/rec`. Request a key (emailed to the school inbox, valid 30 minutes). Or use a sealed code from the safe. Verify. Then follow the restore procedures in `REC.md`.

### If you need to restore from backup

See `REC.md` in the repo root — full procedure for restoring the database and storage. The condensed version is in Part 3 of this handover.

### Do NOT do these things

- Delete the old Supabase project until the new one is verified for 24 hours.
- Run `UPDATE` or `DELETE` SQL without a `WHERE` clause.
- Push to GitHub `main` during a recovery.
- Share the recovery key.
- Assume an error is real until you've tested in incognito.

### Contact

| Role | Name | Phone | Email |
|---|---|---|---|
| Owner | Dr Ayoola Gabriel Ololade FCIA. NIIA | 08067071557 | ayonio@gmail.com |
| Admin | Dr Mrs Ayoola Oseyemi O | 08027270404 | oseyemio3@gmail.com |
| School office | — | — | theidealschools15@gmail.com |

---

## PART 1 — WHERE WE CAME FROM

### Origin

The project started as a Google Sheet (`TIS DATABANK 01`) with an Apps Script backend. Record-keeping for learners, staff, terms, attendance, and finances was manual or semi-manual. The original handover note (29 September 2026) describes the state at the point of migration.

### Migration decisions

- **Frontend moved** to Vercel + Vanilla JS (`app.js` is a single IIFE-wrapped file).
- **Backend moved** to Supabase (Postgres + Auth + Storage + Edge Functions).
- **Apps Script retired** from active use. Only `Core.gs` and `Calendar.gs` remain live, providing the calendar proxy for the Calendar Import tab.
- **Legacy `learner-bulk.js`** was dead code and has been deleted from the repo.
- **Custom auth replaced** with Supabase Auth. Operators log in with `01@tis.local` … `04@tis.local`.

### What was fixed during migration

The original handover note lists 14 critical fixes. The most important:

1. Duplicate `const CONTACT_LABELS` — caused a fatal SyntaxError. Removed.
2. Duplicate `sw.js` service worker — caused login freeze. Deleted.
3. Overly-broad `vercel.json` rewrite (`/(.*)`) hijacked every JS file. Tightened to explicit routes only (`/g/:token`, `/s/:code`, `/rec`).
4. QR token columns were camelCase, Supabase expects snake_case. Rewrote.
5. RLS disabled on all public tables (closed operator group). Note: Supabase occasionally re-enables RLS on newly created tables — always verify with the check in Part 3.

---

## PART 2 — WHERE WE ARE (state at 4 October 2026)

### The stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | Vanilla JS + HTML + CSS on Vercel | `app.js`, `supabase-client.js`, `calendar-module.js`, `index.html`, `styles.css` |
| Backend | Supabase (Postgres 17) | RLS disabled (closed operator group) |
| Auth | Supabase Auth | Custom email domain `@tis.local` |
| Storage | Supabase Storage, bucket `TISAssets` | Public bucket. Learner photos, staff photos, brand assets, GTB logo, stamp image |
| Edge Functions | Supabase Edge Functions (Deno) | `send-recovery-key`, `verify-recovery-key` |
| Email | Resend | Free tier. Sends to `theidealschools15@gmail.com` only (forwarded to `ayonio@gmail.com` via Gmail filter) |
| Backups | GitHub Actions → `tis-backups` repo | Monthly `pg_dump` + retention of last 12 months |
| Recovery | `/rec` page + sealed codes | 6-char key, emailed to school inbox, 30-minute validity |
| Public viewer | `/check` page | In build. Student enters PIN, sees report card |

### What is live and working

#### Auth and permissions

- 4 operators (`01`–`04`). All can log in.
- Super-admin sees everything. Admin / Operator / Teacher scoped by `users.authorities` JSONB.
- Custom permission grid per module, per operator. Editable from the Users tab.

#### Core modules

- **Learners** (148+): grid, search, view modal (3-tier: A = all, B = admin+, C = super-admin only), edit, photo upload (to `TISAssets/learners/<PIN>.png`), print (A4 + 80mm), bulk Excel upload, template download, live search, keyboard shortcuts.
- **Staff** (16): grid, view, edit, add, photo upload (to `TISAssets/staff/<STAFF_ID>.png`), print, active/inactive filter, deactivate/reactivate.
- **Terms & Promotion**: activate a term, promote by class or single learner, exit learners with reason.
- **Learner Attendance**: full register with morning/afternoon marks (`\` / `/` / `\ /` / `O O`), holiday adjuster, class analysis, per-day breakdown, week signatures, B/F + AY Total columns.
- **Staff Attendance**: month view, daily tables, red line for on-time cutoff, movement log, auto-archive on new month.
- **Calendar**: 53+ events grouped by academic year and term.
- **Classes**: managed list with academic ordering (`sort_order`), 26 active classes. Subject slots per class editable via Classes tab → Manage Subjects.
- **Users**: full permission grid, click to expand per operator.
- **Reports**: **now the Workshop** — fill in psychomotor ratings and comments for every learner in a class. Auto-assigned by the system when scores are uploaded; editable here; saved rows marked EDITED and never overwritten.
- **Results**: **in-portal report card viewer** — loads by PIN, shows termly or sessional, print on demand.
- **ID Cards**: portrait CR80, 3 × 3 A4 grid, ZIP export of Front + Back PNGs at 662 × 1036 px @ 300 DPI with 2 mm bleed. School + ministry logos, GTB badge on learner cards, stamp image on the back.

#### QR scan flow

- `/g/<token>` — staff gate QR (one QR, all staff).
- `/s/<code>` — per-person card QR. Routes by code type:
  - Learner PIN → attendance (morning, then afternoon).
  - Staff ID → smart clock flow (in → movement or out → movement in → out).
  - `VIS-01` … `VIS-05` → visitor in/out.
- After any scan, the success/fatal screen shows **"Thanks, Dr AYOOLA G O FCIA, NIIA. Appreciate."** and **auto-closes after 7 seconds**. The login page is NEVER reachable from a scan page.

#### CBT / Scores pipeline (Phase 2)

- `subjects` table (25 subjects).
- `class_subjects` table (231 rows) — slot map per class. Editable via Classes tab → Manage Subjects.
- `class_aliases` table (28 rows) — maps upload codes to canonical class names.
- `scores` table — one row per learner × subject × term × year.
- **Broad Sheet & Scores tab**:
  - **Download Template** — scoped to Class / Subject / School / Student.
  - **Upload Filled File** — importer with conflict modal and friendly error messages.
  - **Harvest to Excel** — removed. Download suffices.
- Subject-scoped downloads emit only the `subN` columns that subject occupies for the chosen class (not all 18).
- Auto-assign runs after every import: fills psychomotor ratings and picks comments from the bank based on the learner's average band.
- `report_ratings` table — one row per learner × term × year. Contains `ratings` JSONB, `teacher_comment`, `principal_comment`, `teacher_edited`, `principal_edited`, `auto_assigned_at`, `updated_by`.
- `comment_bank` table — 336 comments (28 per band per field). Six bands: excellent, very_good, good, average, fair, poor. Two fields: teacher, principal. Four categories: general, subject_strong, subject_strong_weak, subject_weak.
- Comments have `{first}`, `{strong1}`, `{weak1}` placeholders.
  - `first` = second word of the full name (after the surname). E.g. `ADEGOKE ADEWUNMI JOY` → `Adewunmi`.
  - `strong1` = top subject for the learner's term.
  - `weak1` = bottom subject for the learner's term.
- **Reports workshop**: load a class, see every learner's auto-assigned ratings and comments, override with dropdowns, pick from the comment bank, save row-by-row or save-all.
- **Any row saved by a human is marked EDITED** and will not be overwritten by future auto-assign.

#### Recovery system

- `recovery_codes` table — single-use 6-char codes, 30-minute expiry, 10-year expiry for sealed codes.
- `recovery_attempts` table — audit log of every request and verification (success and failure).
- `send-recovery-key` Edge Function — generates a code, sends email via Resend.
- `verify-recovery-key` Edge Function — validates a code, marks it used, single-use enforced.
- Sealed backup codes — 9 remaining in the school safe (1 used for testing).
- `REC.md` in the repo root — full recovery runbook.
- `stamp and signed.gif` — school stamp image, at `TISAssets/stamp and signed.gif` on Supabase Storage.

#### Backups

- `tis-backups` repo — GitHub Action runs on the 1st of each month at 2 a.m. UTC.
- Uses `pg_dump` version 17 (installed explicitly, absolute path).
- Refuses to save if dump is < 5 KB or missing critical tables.
- Keeps last 12 months.
- Manual trigger: GitHub → Actions tab → Monthly Backup → Run workflow.
- The connection string is stored as `SUPABASE_DB_URL` in GitHub Secrets.

### What is IN PROGRESS / NOT yet delivered

| # | Item | Notes |
|---|---|---|
| A | Public results page `/check` | Layout agreed. Needs HTML + JS + rate limiting + `results_views` audit table. |
| B | Clearance gate on public page | Not cleared → scores hidden, subject names shown, message "TIS Payment Policy". |
| C | Extract shared renderer to `report-render.js` | Currently duplicated in internal and (future) public. |
| D | Fees module | Class-wide bills, per-learner additions/deductions. Feeds the report card. |
| E | Deactivate/reactivate learners | Button to mute learners no longer in school. Inactive list separate. |
| F | Staff active/inactive filter in attendance | Only active staff load in attendance. Inactive grouped in Staff module. |
| G | Staff Attendance: hide future days | Currently shows "This day has not arrived yet" cards. Should skip. |
| H | Delete duplicate learners | Manual review + deletion tool. |
| I | Audit log UI | Table exists (`audit_log`). Write paths partially wired. Panel in Users tab not built. |
| J | Offline report generation + one-click upload | Large. Full-year roadmap item. |
| K | Full report card renderer matched to PDF samples | Stamp image, QR code on report card, psychomotor column, bar chart, layout parity with `SAMPLE TERMLY REPORT CARD.pdf` and `SAMPLE CUMULATIVE REPORT CARD.pdf`. |
| L | Digital library (Phase 4) | Staff lesson notes, learner assignments over LAN, cloud sync. |
| M | CBT offline app upload | Scores are uploaded via the Broad Sheet. Offline app itself is separate. |

### Data conventions

| Item | Value |
|---|---|
| Academic year | `2026/2027` — derived as `year + '/' + (year + 1)` |
| Term labels | `1ST TERM 2026/2027`, `2ND TERM 2026/2027`, `3RD TERM 2026/2027` |
| Attendance marks | `O O` absent · `\` morning only · `/` afternoon only · `\ /` both |
| Money | `₦18,000.00` |
| Login key | `operator_id` (`01`, `02`, `03`, `04`) |
| Auth email | `<operator_id>@tis.local` |
| Score bands | ≥80 excellent · 70–79 very_good · 60–69 good · 50–59 average · 40–49 fair · <40 poor |
| Grades | A / B / C / D / E / F matched to the same bands |
| Storage bucket | `TISAssets` (public) |
| Photo filename | Learners: `<PIN>.png`. Staff: `<STAFF_ID>.png` |
| Upload code → canonical name | `class_aliases` table. E.g. `JSS_1` → `JSS 1` |

### Class list (26 active, ordered)

1. CRECHE
2. STARTERS
3. BEGINNERS
4. NURSERY 1
5. NURSERY 2
6. NURSERY 3
7. BASIC 1
8. BASIC 2
9. BASIC 3
10. BASIC 4
11. BASIC 5
12. JSS 1
13. JSS 2
14. JSS 3
15. SS 1 SCIENCE
16. SS 1 ART
17. SS 1 HUMANITIES
18. SS 1 BUSINESS
19. SS 2 SCIENCE
20. SS 2 ART
21. SS 2 HUMANITIES
22. SS 2 BUSINESS
23. SS 3 SCIENCE
24. SS 3 ART
25. SS 3 HUMANITIES
26. SS 3 BUSINESS

Each class has a `next_class` field for promotion. `SS 3 *` all promote to `Graduated`.

---

**End of Part 1.**
# TIS EMIS — MASTER HANDOVER DOCUMENT
## Part 2 of 3 — Table Schemas · `app.js` Section Map · `supabase-client.js` Method List

**Read Part 1 first** for context. This part is the reference catalogue: everything that lives in the database and every function that lives in the code.

**How to use this part:** When you need to know "does a table exist for X?" or "which function handles Y?" — search this document first. It is kept current with each delivery.

---

## PART 3 — DATABASE SCHEMAS

Every table in the `public` schema of the Supabase project. Column lists are complete as of 4 October 2026. Types are Postgres types.

**Note on RLS:** Row Level Security is disabled on all tables below. This is deliberate — the portal is a closed operator group, and RLS is not used for authorisation (permission is enforced in the app via `users.authorities`). If a table is ever recreated, verify RLS with the check at the end of this section.

### `users`

Portal operators. Linked 1-to-1 with Supabase Auth users.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key. Matches `auth.users.id`. |
| operator_id | text | `01` … `04`. Used as login key. |
| name | text | Full display name. |
| role | text | `super_admin` / `admin` / `operator` / `teacher` |
| position | text | Free text. |
| avatar_url | text | Photo URL. |
| is_active | boolean | Soft-delete flag. |
| must_change_password | boolean | Prompt on login. |
| authorities | jsonb | Permission map: `{ read_learners: true, write_learners: false, ... }` |
| last_login | timestamptz | |
| password_last_changed | timestamptz | |
| deleted | boolean | Legacy flag. Filters in `getPermissionMatrix`. |
| created_at, updated_at | timestamptz | |

### `learners`

One row per learner. 29+ columns plus `card_active`. Bio only — no fee columns (fees are in `learner_terms`).

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| pin | text | **Unique.** Format `TIS####`. Auto-assigned by trigger if blank on insert. Never reused. |
| name | text | Full name. Surname first, e.g. `ADEGOKE ADEWUNMI JOY`. |
| class_name | text | Canonical class name, e.g. `JSS 1`. |
| gender | text | `Male` / `Female`. |
| date_of_birth | text | `YYYY-MM-DD` or `DD/MM/YYYY`. Mixed historical formats. |
| photo_url | text | Public URL to `TISAssets/learners/<PIN>.png`. |
| father_phone, mother_phone, guardian_phone | text | |
| contact_priority_1, contact_priority_2, contact_priority_3 | text | `father` / `mother` / `guardian` — the calling order. |
| account_number | text | Bank account. |
| blood_group | text | Blood group / genotype. |
| religion | text | |
| allergy | text | |
| parents_name | text | |
| address | text | |
| state_of_origin, lga_of_origin | text | |
| state_of_birth, lga_of_birth | text | |
| lin | text | Learner Identification Number. |
| class_before_admission, class_admitted_into | text | |
| date_of_admission | text | |
| class_at_withdrawal | text | |
| date_of_withdrawal | text | Non-empty → learner is exited. |
| exit_reason | text | |
| card_active | boolean | Default `true`. For future card deactivation. |
| created_at, updated_at | timestamptz | |

### `learner_terms`

Fee record per learner per term. Four rows per learner per academic year (three terms + carry-forward).

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| learner_id | bigint | FK → `learners.id`. |
| term_type | text | `1st` / `2nd` / `3rd`. |
| year | int | E.g. `2026`. |
| class_name | text | Snapshot at the time. |
| tuition | numeric | |
| scholarship | numeric | |
| bill | numeric | Tuition + bill components. |
| other_bill | numeric | |
| other_bills_major, other_bills_minor | numeric | |
| books | numeric | |
| balance_bf | numeric | Brought forward from previous term. |
| total_part_payment | numeric | |
| balance_cf | numeric | Carried forward to next term. |
| part_payment_1_date, part_payment_1_amount | text / numeric | Up to 5 slots. |
| part_payment_2_date, part_payment_2_amount | text / numeric | |
| part_payment_3_date, part_payment_3_amount | text / numeric | |
| part_payment_4_date, part_payment_4_amount | text / numeric | |
| part_payment_5_date, part_payment_5_amount | text / numeric | |
| cleared | text | `Yes` / `No`. |
| clearance | text | Date cleared. |
| created_at, updated_at | timestamptz | |

### `terms`

Academic terms.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| term_type | text | `1st` / `2nd` / `3rd`. |
| year | int | E.g. `2026`. |
| label | text | `1ST TERM 2026/2027`. |
| start_date, end_date | date | |
| is_active | boolean | Only one active at a time. |
| created_at | timestamptz | |

**No `academic_year` column.** Academic year is derived as `year + '/' + (year + 1)`.

### `academic_calendar`

Calendar events and holidays.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| event_date | date | |
| day_name | text | |
| event_type | text | |
| description | text | |
| term_type | text | |
| week_number | int | |
| academic_year | text | `2026/2027`. |
| is_holiday | boolean | |
| holiday_name | text | |

### `classes`

Managed class list.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| name | text | Canonical, e.g. `JSS 1`. |
| level | text | E.g. `JSS 1`, `SS 1`. |
| stream | text | `SCIENCE` / `ART` / `HUMANITIES` / `BUSINESS`. |
| next_class | text | For promotion. |
| is_active | boolean | |
| sort_order | int | Academic order: 100 CRECHE, 110 STARTERS, ..., 630 SS 3 BUSINESS. |
| notes | text | |
| created_at | timestamptz | |

### `class_subjects`

Slot map per class. Slot N for class X = subject Y.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| class_name | text | Canonical. |
| slot | int | 1..18. |
| subject_code | text | FK → `subjects.code`. |
| created_at | timestamptz | |

Unique on `(class_name, slot)` and `(class_name, subject_code)`. 231 rows total.

### `class_aliases`

Upload file class codes → canonical names.

| Column | Type | Notes |
|---|---|---|
| upload_code | text | Primary key. E.g. `JSS_1`, `NUR_1`, `STARTER`. |
| canonical_name | text | E.g. `JSS 1`, `NURSERY 1`, `STARTERS`. |

28 rows.

### `subjects`

Master subject list.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| code | text | Unique. E.g. `ENG`, `MATH`, `CHEM`. |
| display_name | text | E.g. `ENGLISH LANGUAGE`, `MATHEMATICS`. |
| is_active | boolean | |
| created_at | timestamptz | |

25 subjects.

### `scores`

One row per learner × subject × term × year.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| learner_id | bigint | FK → `learners.id`. |
| subject_code | text | FK → `subjects.code`. |
| term_type | text | |
| year | int | |
| test1, test2, exam | numeric(5,2) | Max 20 / 30 / 50. |
| total | numeric(6,2) | Sum of the three. |
| grade | text | `A` … `F`. |
| remark | text | `EXCELLENT`, `VERY GOOD`, etc. |
| source | text | `upload` (default) or `manual`. |
| uploaded_at | timestamptz | |
| uploaded_by | text | |
| updated_at | timestamptz | |

Unique on `(learner_id, subject_code, term_type, year)`.

### `report_ratings`

One row per learner × term × year. Holds psychomotor and comments.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| learner_id | bigint | FK → `learners.id`. |
| term_type | text | |
| year | int | |
| ratings | jsonb | `{ leadership: 'V.GOOD', hardwork: 'GOOD', ... }`. Ten keys. |
| teacher_comment | text | |
| principal_comment | text | |
| teacher_edited | boolean | `true` once a human saves. Auto-assign skips these. |
| principal_edited | boolean | Same. |
| auto_assigned_at | timestamptz | Last auto-assign run. |
| updated_at | timestamptz | |
| updated_by | text | `auto` or operator name. |

Unique on `(learner_id, term_type, year)`.

### `comment_bank`

Pre-written comments, filtered by field and band.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| field | text | `teacher` / `principal`. |
| band | text | `excellent` / `very_good` / `good` / `average` / `fair` / `poor`. |
| category | text | `general` / `subject_strong` / `subject_strong_weak` / `subject_weak`. |
| text | text | Contains `{first}`, `{strong1}`, `{weak1}` placeholders. |
| is_active | boolean | Default `true`. |
| created_at | timestamptz | |

Unique on `(field, band, category, text)`. 336 rows.

### `attendance_learner`

One row per learner × date.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| learner_id | bigint | FK → `learners.id`. |
| term_type | text | |
| year | int | |
| attendance_date | date | |
| mark | text | `O O` / `\` / `/` / `\ /`. |
| marked_by | text | |
| marked_at | timestamptz | |

Unique on `(learner_id, attendance_date)`.

### `attendance_staff`

One row per staff × date.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| staff_id | bigint | FK → `staff.id`. |
| attendance_date | date | |
| clock_in | text | `HH:MM`. |
| clock_out | text | |
| status | text | `Present`. |
| note | text | **Has `note`, not `remark`.** |
| logged_by | text | |
| source | text | `QR` / `Manual`. |
| month_archived | boolean | |
| created_at, updated_at | timestamptz | |

Unique on `(staff_id, attendance_date)`.

### `staff`

Staff roster.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| staff_id | text | E.g. `TIS2406`. |
| surname, first_name, middle_name | text | |
| full_name | text | Generated field. |
| gender | text | |
| date_of_birth | text | |
| school | text | |
| department | text | `Teaching` / `Admin` / `Support`. |
| position | text | |
| phone, email | text | |
| qualification, graduation_year, course_of_study | text | |
| subjects_taught | text | |
| bank, account_number, bvn | text | |
| salary | numeric | |
| resume_time, close_time | text | `HH:MM`. |
| late_cutoff, early_cutoff | text | `HH:MM`. |
| status | text | `Active` / `Inactive`. |
| photo_url | text | Public URL to `TISAssets/staff/<STAFF_ID>.png`. |
| card_active | boolean | Default `true`. |
| created_at, updated_at | timestamptz | |

### `staff_movements`

Movement log.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| staff_id | bigint | FK → `staff.id`. |
| movement_date | date | |
| time_out, time_in | text | |
| reason, destination, purpose | text | |
| logged_by | text | |
| month_archived | boolean | |
| created_at, updated_at | timestamptz | |

### `staff_attendance_archive`, `staff_movements_archive`

Month snapshots. Mirror the live tables plus `archive_year`, `archive_month`, `staff_no`, `staff_name`. Auto-archived on new month first load.

### `qr_tokens`

Staff gate QR tokens. snake_case.

| Column | Type | Notes |
|---|---|---|
| id | uuid | Primary key. |
| token | text | |
| generated_by | text | |
| generated_at | timestamptz | |
| expires_at | timestamptz | |
| is_active | boolean | |
| regenerated_by | text | |
| regenerated_at | timestamptz | |

### `recovery_codes`

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| code | text | 6 chars, uppercase, no ambiguous (no 0/O/1/I/L). |
| email_to | text[] | Default: `[theidealschools15@gmail.com, ayonio@gmail.com]` |
| created_at | timestamptz | |
| expires_at | timestamptz | 30 min for emailed, 10 years for sealed. |
| used_at | timestamptz | Non-null once used. |
| used_by_ip, used_by_ua | text | |
| notes | text | `Issued via /rec`, `Sealed batch — envelope in school safe`, etc. |

### `recovery_attempts`

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| created_at | timestamptz | |
| ip_address, user_agent, referrer | text | |
| action | text | `request` / `verify-ok` / `verify-bad` |
| success | boolean | |
| code_masked | text | E.g. `AB***XY`. |
| notes | text | |

### `visits`

Visitor in/out via `VIS-01` … `VIS-05` cards.

| Column | Type | Notes |
|---|---|---|
| id | bigint | Primary key. |
| card_code | text | `VIS-01` … `VIS-05`. |
| visitor_name | text | |
| purpose | text | `Official` / `Personal`. |
| agency, agency_other | text | If Official. |
| time_in, time_out | text | `HH:MM`. |
| visit_date | date | |
| status | text | `In` / `Out`. |
| recorded_by | text | |
| notes | text | |
| created_at, updated_at | timestamptz | |

### `scan_events`

Audit log of every card scan.

| Column | Type | Notes |
|---|---|---|
| id | bigserial | Primary key. |
| code | text | PIN / Staff ID / VIS code. |
| code_type | text | `learner` / `staff` / `visitor` / `unknown`. |
| actor_id | text | |
| actor_name | text | |
| action | text | `attendance` / `clock-in` / `clock-out` / `movement-out` / `movement-in` / `visit-in` / `visit-out` / `lookup`. |
| success | boolean | |
| detail | text | |
| scanned_by | text | |
| scan_date | date | |
| scanned_at | timestamptz | |

### `audit_log`

Operator write log. Table exists; UI not built; write paths partially wired.

| Column | Type | Notes |
|---|---|---|
| id | bigserial | Primary key. |
| created_at | timestamptz | |
| actor_id | uuid | |
| actor_name, actor_role | text | |
| action | text | `learner.create`, `learner.update`, etc. |
| entity_type | text | `learner` / `staff` / `attendance` / `user`. |
| entity_id, entity_name | text | |
| before, after | jsonb | Full row snapshots. |
| notes | text | |
| term_type, year | text / int | For termly grouping. |
| undone_at, undone_by | timestamptz / text | Reserved for undo feature. |

### RLS safety check

Run this whenever you create a new table or a table is re-created:

```sql
alter table <table_name> disable row level security;

select relname, relrowsecurity as rls_enabled
from pg_class
where relname in ('<table_name>')
order by relname;
```

Expected: `rls_enabled = false`.

If you see `true`, the client will get empty results and 403 errors on writes.

---

## PART 4 — `app.js` SECTION MAP

`app.js` is a single IIFE. Sections are labelled `[S01]` … `[S22]` in comments. Each section is a self-contained block of functions.

**Line numbers are approximate** — they drift as edits are made. Use the section header comments (`// [Sxx] …`) to locate them.

| Section | Purpose | Key functions |
|---|---|---|
| **[S01] STATE** | Global application state, list of module keys | `State`, `ALL_MODULES` |
| **[S02] UTILITIES** | DOM helpers, escape functions, date formatting, loaders, modal close | `$`, `esc`, `escAttr`, `showToast`, `startLoader`, `stopLoader`, `closeModal`, `pageLoaderHTML`, `emptyHTML`, `errorHTML`, `debounce` |
| **[S03] PERMISSIONS** | Permission checks and UI adaptation | `hasPermission`, `isSuperAdmin`, `applyPermissionsToUI`, `getFirstPermittedTab` |
| **[S04] AUTH** | Login, logout, session handling | `doLogin`, `doLogout`, `showLoginScreen`, `enterDashboard` |
| **[S05] PASSWORD CHANGE** | Change password modal | `openChangePasswordModal`, `submitChangePassword` |
| **[S06] NAVIGATION** | Tab switching | `switchTab` |
| **[S07] LEARNERS** | Learner grid, view, edit, add, print, bulk upload | `loadLearners`, `renderLearners`, `openLearnerViewModal`, `openLearnerEditModal`, `saveLearnerEdits`, `openAddLearnerModal`, `submitNewLearner`, `openPartPaymentModal`, `openPrintOptionsModal`, `openLearnerPhotoModal`, `submitLearnerPhoto`, `openBulkPhotoUploadDialog`, `submitBulkPhotoUpload`, `downloadLearnerTemplate`, `uploadLearnerUpdates`, `printLearnerList` |
| **[S08] STAFF** | Staff grid, view, edit, add, photo, print | `loadStaff`, `renderStaff`, `openStaffProfile`, `openStaffEditModal`, `saveStaffEdits`, `openAddStaffModal`, `submitNewStaff`, `openStaffPhotoModal`, `submitStaffPhoto`, `printStaffCard`, `printStaffList` |
| **[S09] TERMS** | Term list, activation, promotion wizard | `loadTerms`, `activateTerm`, `openPromotionWizard`, `renderPromotionWizard`, `pwApplyTerm`, `pwApplyYear`, `pwApplySpecial`, `checkPromotionBanner` |
| **[S10] LEARNER ATTENDANCE** | Register grid, holiday adjuster, class analysis, per-day breakdown, week signatures, print | `initLearnerAttendanceTab`, `loadAttendanceRegister`, `renderAttendanceRegister`, `attCycleCell`, `attMarkClassPresent`, `attSaveAllChanges`, `attApplyHolidayMove`, `renderClassAnalysisPanel`, `renderDayBreakdownPanel`, `renderSignaturePanel`, `attRunPrint` |
| **[S11] STAFF ATTENDANCE** | Month view, daily tables, movements, archive, QR preview | `initStaffAttendanceTab`, `loadStaffMonth`, `renderStaffMonthTables`, `renderStaffMovementTables`, `staffAttOpenMovementModal`, `staffAttClockOut`, `renderStaffArchiveList`, `staffAttRunPrint` |
| **[S12] CALENDAR** | Calendar viewer | `loadCalendar` |
| **[S13] CALENDAR IMPORT** | Placeholder for Drive import | `loadCalendarImportHistory`, `initCalendarImportTab` |
| **[S14] QR** | Gate QR generation, `/g/<token>` scan flow | `loadActiveQR`, `renderQR`, `generateQR`, `handleQRScanIfPresent`, `qrScanPromptStaffId`, `qrScanRecordClockIn`, `qrScanRecordMovementOut`, `qrScanRecordMovementIn`, `qrScanRecordClockOut`, `qrScanShowSuccess`, `qrScanShowFatal`, `qrShowToast` |
| **[S14b] ID-CARD SCAN** | `/s/<code>` per-person card QR | `handleIDCardScanIfPresent`, `idcScanLearnerFlow`, `idcScanStaffFlow`, `idcScanVisitorFlow`, `idcPromptOneLine`, `idcPromptChoice` |
| **[S15] REPORTS** | Placeholder — now the Workshop (being filled) | `initReportsTab` |
| **[S16] CLASSES** | Class list, add, seed, Manage Subjects | `loadClasses`, `openClassSubjectsEditor`, `saveClassSubjects`, `openAddClassModal`, `seedDefaultClasses` |
| **[S17] USERS** | Permission grid | `loadUsers`, `renderPermEditor`, `saveUserPerms`, `setAllPerms`, `resetUserPassword` |
| **[S18] BROAD SHEET** | Scores console, template, importer, auto-assign | `initBroadSheetTab`, `bsPopulatePickers`, `bsDownloadTemplate`, `bsImportScoresFile`, `bsCommitImport`, `autoAssignRatings`, `gradeForScore`, `buildRatingsForBand`, `pickCommentFromBank` |
| **[S19] WIRE + BOOT** | Event wiring, boot sequence, scan routing | `wireEventListeners`, `boot`, `safetySweep` |
| **[S20] PUBLIC API** | Expose essentials to `window.TIS` | (inline assignments) |
| **[S21] ID CARDS** | CR80 portrait card designer | `initIDCardsTab`, `idcDrawFront`, `idcDrawBack`, `idcRenderCardPng`, `idcOpenA4Preview`, `idcDownloadZip` |
| **[S22] RESULTS** | In-portal report card viewer | `initResultsTab`, `resultsLoadReport`, `resultsPrint`, `resultsBuildTermly`, `resultsBuildSessional`, `resultsPrintCss`, `resultsHeaderHtml`, `resultsStudentBar`, `resultsStatsBlock`, `resultsSessionalStats`, `resultsCommentsBlock` |

**Frozen sections** — treat as production. Any change must be a full-section replacement, not an inline patch: `[S01]`–`[S14]`, `[S19]`, `[S20]`, `[S21]`.

**Active work areas** (safe to modify with full-function replacement only): `[S15]` (Reports workshop), `[S18]` (Broad Sheet), `[S22]` (Results).

---

## PART 5 — `supabase-client.js` METHOD LIST

Every method exposed on `window.TIS`. One-line description each.

### Auth
- `signIn(operatorId, password)` — authenticate; returns `{ user, profile }`.
- `signOut()` — end session.
- `getCurrentProfile()` — fetch the current operator's profile row.
- `changePassword(newPassword)` — update password and clear `must_change_password`.

### Learners
- `listLearners()` — fetch all learners, ordered by name.
- `searchLearners(term)` — fuzzy search by PIN, name, phone, or account.
- `getLearner(id)` — fetch one learner by numeric id.
- `getLearnerByPin(pin)` — fetch one learner by PIN.
- `createLearner(row)` — insert a learner. Auto-PIN if `pin` is null/blank.
- `updateLearner(id, patch)` — update a learner.
- `setLearnerContactPriority(learnerId, {p1,p2,p3})` — save calling order.
- `findLearnerDuplicate(name, dateOfBirth)` — check name+DOB for duplicate.
- `recordLearnerScan(learnerId, term, year, markedBy)` — record a learner's daily attendance from a card scan.

### Storage
- `uploadAsset(folder, filename, file)` — upload to `TISAssets/<folder>/<filename>`, returns public URL.
- `deleteAsset(folder, filename)` — delete from the bucket.

### Staff
- `listStaff()` — fetch all staff.
- `getStaff(id)`, `createStaff(row)`, `updateStaff(id, patch)`, `deleteStaff(id)` — CRUD.

### Staff Attendance
- `listStaffAttendanceToday(date)` — one day's attendance rows.
- `listStaffAttendanceRange(from, to)` — range fetch.
- `listStaffMovementsToday(date)` — one day's movements.
- `listStaffAttendanceForMonth(year, month)` — full month, per-day rows for the tab.
- `listStaffMovementsForMonth(year, month)` — same for movements.
- `upsertStaffAttendance(row)` — insert/update one attendance row.
- `createStaffMovement(row)` — log a movement.
- `updateStaffMovement(id, patch)`, `closeStaffMovement(id, time)` — update.
- `archiveStaffMonth(year, month)` — snapshot into archive.
- `listArchivedStaffMonths()` — list archived month buckets.
- `getArchivedStaffMonth(year, month)` — read one archived month.

### QR
- `getActiveQRToken()` — the current staff-gate QR token.
- `generateQRToken(operatorName)` — deactivate old, create new.
- `getQRTokenByValue(token)` — look up a scanned token.

### Visits and Scan Events
- `recordVisitorScan(payload)` — first scan → check-in; second same day → check-out.
- `logScanEvent(event)` — best-effort audit log. Never blocks.

### Terms
- `listTerms()` / `getTerms()` — all terms, newest first.
- `getActiveTerm()` — the one with `is_active = true`.
- `setActiveTerm(termId)` — deactivate all others, activate this.

### Promotion
- `getPromotionStatus()` — whether learners still need promoting.
- `termPromote(fromTerm, fromYear, toTerm, toYear, ids)` — create next-term fee rows.
- `yearPromote(promotions)` — bulk class changes.
- `getLearnersForClasses(classNames)` — fetch active learners in given classes.

### Classes and Subjects
- `listClasses()` — active classes, ordered by name.
- `createClass(row)`, `updateClass(id, patch)`, `deleteClass(id)` — CRUD.
- `getNextClass(name)` — the next-class value for one class.
- `getClassSubjects(className)` — the slot map for one class.
- `setClassSubjects(className, mappings)` — replace the slot map.
- `listSubjects()` — all active subjects.
- `listClassAliases()` — all upload-code → canonical-name mappings.

### Scores
- `getScoresForLearners(learnerIds, term, year)` — batch fetch, map keyed by `learnerId|subjectCode`.
- `getScoresForTerm(learnerId, term, year)` — one learner's scores in one term.
- `upsertScore(row)` — insert/update one score row.

### Report Ratings
- `getReportRatings(learnerId, term, year)` — one learner's ratings+comments.
- `upsertReportRating(row)` — create/update.

### Comment Bank
- `getCommentBank(field, band)` — comments for a field + band.
- `listCommentBank()` — every comment.
- `createCommentBank(row)`, `updateCommentBank(id, patch)`, `deleteCommentBank(id)` — CRUD.
- `bandForAverage(average)` — returns `excellent` / `very_good` / `good` / `average` / `fair` / `poor`.

### Calendar
- `getCalendar()` / `listCalendar()` — all events.

### Users
- `getPermissionMatrix()` — users + modules + actions in one call.
- `setUserAuthorities(id, authorities)` — update one operator's permission map.
- `getAllUsers()`, `getUserById(id)`, `updateUser(id, patch)` — CRUD.
- `deactivateUser(id)`, `reactivateUser(id)` — soft toggle.
- `createUser(data)` — insert user + auth account atomically.
- `adminResetPassword(id, newPwd, adminName)` — requires Edge Function (not implemented).
- `roleDefaults(role)` — default permission map per role.

### Results helpers
- `getClassPopulation(className)` — count of active learners in a class.
- `getAttendanceSummaryForTerm(learnerId, term, year)` — `{ opened, present, absent }`.
- `getResumptionDate(term, year)` — first day of the next term.
- `getLearnerTermRecord(learnerId, term, year)` — the fee row.

---

**End of Part 2.**

# TIS EMIS — MASTER HANDOVER DOCUMENT
## Part 3a of 3 — Absolute Rules · Coding Conventions

**Read Parts 1, 2, and 3a together.** This sub-part covers the rules of engagement — what you must never do and how you must write code for this project.

---

## PART 6 — ABSOLUTE RULES

Every rule below was learned the hard way. Do not break them. If a rule seems not to apply, ask the owner before making an exception.

### 6.1 Data integrity rules

1. **Never assume a fixed column list.** Read by column name. The `learners` table has changed before and will change again.

2. **Never hardcode calendar data.** Every academic year comes from the user (upload or UI). If you find yourself typing a list of holidays into code, stop.

3. **Never reuse a PIN.** Once a learner has a PIN, it is theirs forever — even after they exit. Records are retrieved years later.

4. **Never delete a learner row without a super-admin decision.** Exited learners keep their row. The `date_of_withdrawal` field marks the exit. If a row is genuinely corrupt or a test, a super-admin deletes it via Supabase, not via the portal.

5. **Never overwrite a non-zero score without confirmation.** The importer enforces this. Any new code path that writes to `scores` must apply the same rule: null or zero → overwrite silently; non-zero → require operator confirmation.

6. **Never overwrite a human-edited rating or comment.** Once `teacher_edited` or `principal_edited` is `true`, the auto-assign must skip those fields. Any new auto-assignment logic must check the flags.

7. **Never use `delete` on `attendance_learner` outside the marks-save flow.** Absent days are `O O`, not missing rows.

8. **RLS is disabled on all public tables by design.** This is safe because the portal is a closed operator group. Before any public launch (results viewer or otherwise), this must be re-evaluated — some tables (like `results_views` when it exists) should have RLS enabled with a policy.

9. **Never store secrets in code.** All secrets live in Supabase Secrets (for Edge Functions) or GitHub Secrets (for Actions). The `SUPABASE_ANON_KEY` in `supabase-client.js` is the only exception, and it is a public key — safe by design.

10. **Never expose the portal URL in a public-facing page.** `/check` must not load `app.js`. Scan success pages must not link to the portal. QR codes must not contain the portal URL.

### 6.2 Code structure rules

1. **All JavaScript files share the page's global scope.** Duplicate `const` names across files cause a fatal SyntaxError that stops the entire file from parsing. Before adding any top-level `const`, search the entire repo for that name.

2. **Every `app.js` section is labelled `[S01]`–`[S22]`.** Keep that convention. Do not add unlabelled sections.

3. **Sections `[S01]`–`[S14]`, `[S19]`, `[S20]`, `[S21]` are frozen production code.** Change requires a full-section replacement. Never patch inline.

4. **`app.js` is IIFE-wrapped.** Nothing inside it is on `window` unless explicitly exposed. Every function that HTML `onclick=` handlers call must be attached to `window` in its own section's globals block.

5. **Every user-facing string is escaped.** Use `esc()` for text, `escAttr()` for attribute values. Never insert raw user data into HTML.

6. **Never use `fetch()` POST to Apps Script.** It causes CORS + 302 + ORB errors. Only JSONP GET is used, and only for the calendar proxy. All other backend work goes through Supabase.

7. **Never leave a duplicate function.** If you find one, delete it. Before delivering any full-function replacement, search the file for that function name to confirm it exists exactly once.

8. **Never trust the browser cache.** After every commit, hard-reload in incognito with `?v=<Date.now()>` before diagnosing any error. Nine out of ten "the portal is broken" reports are stale cache.

9. **Supabase Edge Functions run Deno, not Node.** Use `Deno.env.get()`, not `process.env`. Use `esm.sh` for imports of npm packages.

10. **The public results page (`/check`) is a separate JS scope.** It does not load `app.js`. It loads only `report-render.js` (once extracted) plus its own small script.

---

## PART 7 — CODING CONVENTIONS

Follow these exactly. They keep the codebase consistent.

### 7.1 Naming

| Thing | Convention | Example |
|---|---|---|
| Database tables | snake_case, plural | `report_ratings`, `comment_bank` |
| Database columns | snake_case | `learner_id`, `teacher_edited` |
| JS functions | camelCase | `openLearnerEditModal` |
| JS constants | UPPER_SNAKE | `ALL_MODULES`, `AUTO_RATING_VALUES` |
| JS objects/state | camelCase | `State.cachedLearners` |
| Section prefixes | `[Sxx]`, `[Sxx.x]`, `[Sxxb]` | `[S18c]` |
| Function name prefixes | per section | `att*` = attendance, `bs*` = broadsheet, `idc*` = ID cards, `qr*` = QR, `pw*` = promotion wizard |
| Sub-page prefixes | three letters, lowercase | `idcSubStaff`, `bsTerm` |

### 7.2 HTML

1. **`id` attributes are camelCase** (`learnerSearchInput`, not `learner_search_input`).
2. **Classes are kebab-case** (`card-bg`, `btn-primary`, `nav-tab`).
3. **Inline `onclick` handlers are discouraged** except where unavoidable. Wire events with `addEventListener` in `init*Tab()` functions.
4. **Every module container is `<div class="module-view hidden" id="module-<name>">`.** The nav tab toggles it.
5. **`data-perm` attributes** gate buttons by permission. Format: `data-perm="read_learners"`.
6. **`data-action` / `data-staff-action` / `data-manage-class`** — use data-attributes for list-driven click handling.

### 7.3 JavaScript

1. **IIFE-wrapped.** Do not add new top-level IIFEs. Add to the existing one.
2. **Strict mode.** `'use strict';` at the top.
3. **Use `var`/`let`/`const` consistently.** Modern code uses `const` unless reassignment is needed, then `let`. Never `var` in new code.
4. **`async/await` throughout.** No `.then()` chains except in legacy code. Wrap in `try { ... } catch (err) { return fail(err); }` for Supabase methods.
5. **Return shape for Supabase methods:** `{ ok: true, data }` or `{ ok: false, error }`. Never throw. Never return a raw Supabase response.
6. **Best-effort operations return `ok: true, data: { skipped: true, reason }`** when the operation is non-critical. Example: `logAudit`, `logScanEvent`.
7. **`window.TIS`** is the only global namespace. Every method on `supabase-client.js` must be `window.TIS.methodName`.
8. **Every inline handler used in HTML must be exposed on `window`** at the end of the section it belongs to. Example: `window.openLearnerEditModal = openLearnerEditModal;`
9. **Comments describe *why*, not *what*.** The code says what it does. Comments say why it exists.

### 7.4 SQL

1. **Idempotent where possible.** Use `if not exists` for tables and indexes. Use `on conflict do nothing` for seeds.
2. **Never use `add constraint if not exists`** — Postgres does not support it. Wrap in a `do $$ ... $$` block.
3. **Always disable RLS on new tables** with `alter table ... disable row level security;`
4. **Always verify with a diagnostic** at the end of every SQL block. Show counts, confirm RLS off.
5. **Add a unique constraint when seeding** so re-running does not duplicate rows.

### 7.5 Dates, times, money

| Thing | Format |
|---|---|
| Dates in database | `YYYY-MM-DD` (string) or `date` type |
| Dates displayed | `DD/MM/YYYY` |
| Times | `HH:MM` (24-hour) |
| Money | `₦18,000.00` |
| Academic year | `2026/2027` — always derived from the year column, never stored separately |

### 7.6 Error messages — tone

Every user-facing error message is calm, specific, and actionable.

- ✅ `"PIN TIS0241 is already in use by ADEGOKE ADEWUNMI JOY. Pick a different PIN, or leave the field blank for an automatic one."`
- ❌ `"Error: duplicate key value violates unique constraint"`
- ❌ `"Oops! Something went wrong."`
- ❌ `"Invalid input"`

Every success message is warm and specific.

- ✅ `"Learner added: ADEGOKE ADEWUNMI JOY — PIN TIS0291"`
- ❌ `"Success"`

Every warning is non-alarming.

- ✅ `"This key has expired. Request a fresh one."`
- ❌ `"ERROR: token expired"`

---

**End of Part 3a.**
# TIS EMIS — MASTER HANDOVER DOCUMENT
## Part 3b of 3 — Communication Conventions · Lessons Learned

**Read Parts 1, 2, and 3a first.** This sub-part covers how to work *with the owner* — the delivery discipline he requires, and the specific failure modes we hit in this session so you don't repeat them.

---

## PART 8 — COMMUNICATION CONVENTIONS

The owner has been burned repeatedly by partial patches, truncated code, and vague instructions. He has therefore adopted strict rules for how work is delivered. **Follow them without exception.** They are not stylistic preferences — they prevent production breakage.

### 8.1 The golden rule

**Full-section replacement, never inline patch.**

If a function changes, you give him the entire function. If a section changes, you give him the entire section. Never say "find this line and change it." Never say "insert after X." Never say "delete the stray `}`."

**Why:** an inline patch requires him to interpret your instruction correctly under time pressure. A full replacement requires him only to select and paste. Mistakes go down to near-zero.

**Exception — cosmetic edits only.** A one-line string change (e.g. removing a sentence from a modal) may be delivered as FIND/REPLACE, but only if it is a pure string or a CSS value, with no logic change. Anything touching behaviour is a full-function replacement.

### 8.2 The three-line header before every delivery

Every code delivery must begin with this header, verbatim:

```
FILE:   <filename>
START:  <exact first line to select, verbatim>
END:    <exact last line to select, verbatim>
NEXT:   <the line after END — leave this alone; it proves the selection is right>
```

The `NEXT` line is a sanity check — it confirms to the owner that he has selected the correct end boundary.

**Example:**
```
FILE:   app.js
START:  async function openAddLearnerModal() {
END:    }
        } (the closing brace of submitNewLearner)
NEXT:   // ================================================================
        // Part payment
```

### 8.3 Truncation rules

**Never truncate a code block.**

If a code block will not fit in one message, split it clearly:

```
[Part 1 of 2]  — paste this first.
...first half...

[Part 2 of 2]  — paste this immediately after Part 1.
...second half...

INSTRUCTIONS: paste Parts 1 and 2 together as a single block before saving.
```

Never end a message in the middle of a code block. If you are approaching the output limit, stop the message **before** the code starts, and continue in the next message with the same header.

### 8.4 Never assume

1. **Never assume the file matches what you delivered previously.** Ask the owner to paste the current file before modifying it — even if you saw it three messages ago.
2. **Never assume the owner applied a change.** After every delivery, ask for confirmation (e.g. "Did the deploy go green? Any console errors?").
3. **Never assume an error is real.** Before diagnosing, ask the owner to test in **incognito with `?v=<Date.now()>`** appended to the URL. Nine out of ten "broken" reports are stale cache.
4. **Never assume you know what is in the file.** If the owner says "the function is missing" or "the string is not there," believe them and ask them to paste the surrounding code, rather than arguing from memory.

### 8.5 Delivery cadence

**One delivery at a time.**

Deliver a change, wait for the owner to apply and test it, then deliver the next. Do not bundle three unrelated changes into one message unless they must ship together.

**Test before the next delivery.**

For every delivery, include:
1. What to test.
2. What the expected outcome is.
3. What to report back (specific things to paste or type).

Never move to the next delivery until the previous is confirmed working — or confirmed broken with a specific error.

### 8.6 Terminology

| Term | Meaning |
|---|---|
| **Full-section replacement** | Deliver the entire function or section, not a diff |
| **Inline patch** | A specific line or fragment — banned except for cosmetic string-only edits |
| **Frozen section** | A section that must not be touched without a full-section replacement |
| **Truncated** | A code block that got cut off — always a bug in the delivery, not the code |
| **Scan route** | `/s/<code>` — the per-person card QR route |
| **Gate route** | `/g/<token>` — the staff gate QR route |
| **Public page** | `/check` — the login-free results viewer (in build) |

---

## PART 9 — LESSONS LEARNED FROM THIS SESSION

Four failure modes hit hard in the session that produced this document. Every one of them has a clear, repeatable cause. The next assistant should read this section **before** starting any work.

### Lesson 1 — Partial pastes silently break `app.js`

**What happened:** The owner pasted the `[S22]` report card renderer into `app.js`. A segment of the paste was cut off — either by the browser losing clipboard content, or by the code block itself being truncated in the chat. Result: an unterminated function followed by `})();`, causing `Uncaught SyntaxError: Unexpected token ')'`. Nothing on the site loaded. The whole portal was down.

**Root cause:** `app.js` is a single IIFE. A single unclosed brace at the end of any function kills the whole file. There is no isolation between sections.

**How to prevent:**
- When delivering large blocks (>200 lines), **split them** into Part 1 of N / Part 2 of N with explicit "paste these together" instructions.
- After every paste, ask the owner to run **2–3 Ctrl+F checks** confirming known strings appear exactly once.
- If the owner reports a syntax error, ask for **50 lines above and below** the error line. Do not guess.

### Lesson 2 — RLS was silently re-enabled on new tables

**What happened:** After creating new tables (`subjects`, `class_subjects`, `comment_bank`, `report_ratings`), a client fetch returned zero rows despite the tables being populated. The diagnostic in Supabase SQL showed `rls_enabled = true` on those tables — even though the creation script included `alter table ... disable row level security;`.

**Root cause:** Supabase's web SQL editor runs each `alter table` statement as it appears. If any earlier statement in the block fails, the block can stop partway, leaving the `alter table` statements at the bottom unrun. When the table then gets re-created (via a re-run of the create block), Supabase defaults to RLS enabled.

**How to prevent:**
- Always put `alter table ... disable row level security` **early** in the block, right after each `create table`.
- **Always** end any schema SQL with a diagnostic that checks `pg_class.relrowsecurity` for every new table and prints `false`. If it prints `true`, the table needs the alter.
- Do not assume the disable succeeded. Verify it in the diagnostic.

### Lesson 3 — The duplicate seed silently doubled

**What happened:** The `comment_bank` seed was run twice. The result was 192 rows instead of the expected 96. Because there was no unique constraint on `(field, band, text)`, Postgres accepted both runs.

**Root cause:** `on conflict do nothing` only deduplicates if there is a constraint to conflict against. Without a constraint, every insert is a new row.

**How to prevent:**
- **Always** add a unique constraint to any table that will be seeded more than once.
- **Always** include the constraint creation in the seed block, using the `do $$ ... $$` syntax that Postgres actually supports.
- Confirm the resulting count matches the expected count.

### Lesson 4 — Chasing the wrong layer

**What happened:** Several hours were spent diagnosing "the secret is wrong" when the actual failure was somewhere else entirely. Specifically:
- The `SUPABASE_DB_URL` secret was correct for several attempts. The failure was that `pg_dump` on the GitHub runner was version 16, and the Supabase server was version 17.5. The version mismatch caused the connection to fail before auth even mattered.
- The `comment_bank` table was populated but the client kept returning empty. The failure was RLS on the table, not the data.

**Root cause:** When a diagnostic layer is ambiguous, the natural instinct is to assume the wrong thing and keep re-trying it. In both cases the actual issue was one or two layers *deeper* than the obvious.

**How to prevent:**
- **Add a diagnostic step first.** Before trying a fix, add a step that prints the actual state. For example: `echo "Length of secret: ${#URL}"` — this immediately told us the secret was correct.
- **Isolate one variable at a time.** If the connection fails, first prove the secret is correct, then prove the host is reachable, then prove the credentials are valid. Never guess two things at once.
- **Read the exact error.** `pg_dump` said "server version: 17.6; pg_dump version: 16.15". That was specific. We should have acted on it immediately.
- **Test the layer above the layer you suspect.** If the client returns empty, check the table with SQL first. If the table has data, the problem is on the client side. If the table is empty, the problem is server-side.

### Lesson 5 — Bitwarden was assumed, Gmail was the reality

**What happened:** The recovery runbook was written assuming Bitwarden would store credentials. In practice, the owner stores everything in linked Gmail accounts (with the sealed envelope as fallback). The runbook had to be revised.

**Root cause:** Assumptions about the operator's tools without asking.

**How to prevent:**
- Ask before assuming. "Where do credentials live?" — a two-word answer that saves an hour.
- If the answer is not one of the common tools, adapt. Gmail + sealed envelope is a perfectly valid two-factor pattern.

### Lesson 6 — The URL was assumed to be the file path

**What happened:** The owner wanted `/check` on the portal domain. The design assumed the file would be `check.html`. But the QR codes on ID cards were already pointing to `/s/<code>`, and there was a risk of confusing the two. Only after a clarification round did the design settle.

**Root cause:** Two very similar routes (`/s/...` for scan, `/check` for results) meant every conversation about "the QR" required disambiguation.

**How to prevent:**
- Name routes so their purpose is obvious. `/s/` is scan. `/check` is check. Never use two single-letter prefixes for adjacent features.
- When designing a new route, ask: "Will someone reading this URL in a year know what it's for?"

### Lesson 7 — Truncation happens even to the best of us

**What happened:** The initial delivery of this very document — Part 3 — was cut off mid-sentence. The owner caught it. The document had to be re-delivered as three sub-parts (3a, 3b, 3c).

**Root cause:** The message hit the output ceiling mid-paragraph. The AI did not stop before the ceiling.

**How to prevent:**
- **Know your own limits.** If a section is going to be long, split it *before* you start writing.
- **Stop cleanly.** Never end a message mid-sentence. If you must stop, stop at a paragraph break with a clear "to be continued" note.
- **When in doubt, split.** Three short messages are better than one that gets truncated.

### The meta-lesson

Every failure above was caught by the **owner asking a direct question**. "Is everything covered?" "How do I use this?" "Where does this go?" The owner's discipline in stopping and asking caught each bug before it became permanent.

**So: encourage the owner to ask.** Never make him feel that a "why" or a "wait, what about X?" is a distraction. It is the single most valuable thing he does.

---

**End of Part 3b.**

# TIS EMIS — MASTER HANDOVER DOCUMENT
## Part 3c of 3 — Pending Items · Roadmap · Keeping This Document Current

**Read Parts 1, 2, 3a, and 3b first.** This is the final sub-part. It closes the document with what remains, the sequence in which to deliver it, and how to keep this document alive.

---

## PART 10 — PENDING ITEMS (in detail)

Every item below is a known gap between the current state and the target state. Each entry has: what it is, why it matters, rough scope, and what unblocks it.

### 10.1 Public results viewer (`/check`)

**What:** A login-free page where a student or parent enters a PIN, sees "Welcome, <Name>", picks a term and year, and views the report card. Print from the page.

**Why it matters:** This is the delivery mechanism for the entire CBT pipeline. Without it, parents come to the school office to see results.

**Scope:** 3–4 deliveries.

- **A** — `check.html` and `check.js`, PIN input, learner lookup, welcome banner. No portal code loaded. Route added to `vercel.json`.
- **B** — Extend `report-render.js` (see 10.3) so the public page and the internal Results tab render identically.
- **C** — Clearance gate UI. When `learner_terms.cleared != 'Yes'`, all score cells become `—` with a cover overlay: *"TIS Payment Policy — please pay your outstanding balance to view this result. Contact the school office."* Subject names, attendance, class, gender stay visible.
- **D** — `results_views` audit table and logging. Every lookup recorded (PIN, IP, timestamp, term, year, success). Rate limiting can follow later.

**Unblocked by:** nothing. Can start immediately.

**Note:** Because `/check` is public, no portal URL, no app.js, no login link may appear on it. The page has its own standalone script.

### 10.2 Fees module

**What:** A new top-level module for setting class-wide bills and per-learner adjustments.

**Why it matters:** Feeds the report card. Provides the "next term bill" and the fee notice currently shown in the report card footer.

**Scope:** 2 deliveries.

- **A** — SQL: `fee_schedule` table (class × term × year → tuition, other_major, other_minor, books) and `fee_adjustments` table (learner × term × year → additions, deductions, notes).
- **B** — UI: one panel for class-wide schedule, one panel for per-learner adjustments. Report card renderer reads from these tables.

**Unblocked by:** nothing. Can start after the public viewer if that's higher priority.

### 10.3 Shared `report-render.js`

**What:** Extract the entire report card rendering pipeline from `[S22]` into a standalone `report-render.js` file that both the internal Results tab and the public `/check` page can load.

**Why it matters:** Currently the render logic would have to be duplicated. Any layout change would have to be made twice.

**Scope:** 1 delivery.

- Move `resultsBuildTermly`, `resultsBuildSessional`, `resultsPrintCss`, `resultsHeaderHtml`, `resultsStudentBar`, `resultsStatsBlock`, `resultsSessionalStats`, `resultsCommentsBlock`, `bandForTotal` into `report-render.js`.
- `app.js` and `check.js` both include `<script src="/report-render.js"></script>`.
- Expose the render functions on `window.TISReport` for both to call.

**Unblocked by:** public viewer design (so we know what shape the public page expects).

### 10.4 Full report card parity with PDF samples

**What:** The current in-portal report card is functionally correct but not pixel-matched to `SAMPLE TERMLY REPORT CARD.pdf` and `SAMPLE CUMULATIVE REPORT CARD.pdf`. Missing pieces:

- **Psychomotor column** — LEADERSHIP through PERSEVERANCE, ten ratings, read from `report_ratings.ratings`.
- **CLASS AVG / H.S. / L.S.** columns — computed per subject per class per term.
- **Stamp image** — bottom-right of the footer. `TISAssets/stamp and signed.gif`.
- **QR code on the report card** — pointing to `https://tis-tan.vercel.app/check/<PIN>?term=1st&year=2026`.
- **Bar chart** — subject total per subject, coloured by grade, rendered on a canvas.
- **Termly vs sessional auto-selection** — 1st and 2nd terms show termly; 3rd term shows sessional. No manual picker.
- **Grade / Remarks auto-computed** — already computed in `scores.total` / `.grade` / `.remark`. Fall back to on-the-fly computation if a row is missing them.
- **Comments** — from `report_ratings.teacher_comment` and `report_ratings.principal_comment`, with `{first}` already filled.

**Scope:** 2–3 deliveries, iterating against the sample PDFs.

**Unblocked by:** `report-render.js` extraction.

### 10.5 Deactivate / reactivate learners

**What:** A toggle in the Learners module to mark a learner as not currently in school, without deleting their record.

**Why it matters:** Learners leave for a term and return. Their records must be preserved. Today, `date_of_withdrawal` handles exits but there is no clean way to "mute" a learner temporarily.

**Scope:** 1 delivery.

- Add `is_active` boolean to `learners` (default true). Or reuse `date_of_withdrawal`.
- Learners grid gets an "Active only" / "Inactive" / "All" filter.
- Edit modal gets a Deactivate / Reactivate button.
- Attendance registers and ID Cards exclude inactive learners.

**Unblocked by:** nothing. Can start immediately.

### 10.6 Staff active/inactive filter in attendance

**What:** Staff Attendance tab and its registers should load only `status = 'Active'` staff. Inactive staff remain visible in the Staff module for record.

**Scope:** 30 minutes.

**Unblocked by:** nothing. Can start immediately.

**Note:** The handover note you sent on 4 October 2026 lists this as **done**. Confirm on the live site. If the filter is only applied in the Staff module and not in Staff Attendance, extend it.

### 10.7 Staff Attendance — hide future days

**What:** When viewing a month in Staff Attendance, days that have not arrived yet show a "This day has not arrived yet" placeholder. Should be skipped entirely.

**Scope:** 15 minutes.

**Unblocked by:** nothing. Can start immediately.

**Note:** The handover note you sent on 4 October 2026 lists this as **done**. Verify on the live site.

### 10.8 Delete duplicate learners

**What:** A tool for super-admin to identify and remove duplicated learner rows (same PIN, same name, or duplicated through upload).

**Scope:** 1 delivery.

- Diagnostic SQL listing suspected duplicates (same name + date of birth).
- Super-admin review screen showing candidate rows side-by-side.
- Merge or delete with confirmation.

**Unblocked by:** nothing. Can start immediately.

### 10.9 Audit log UI

**What:** The `audit_log` table exists. Write paths are partially wired (learner edits are logged; most other writes are not). The panel that displays the log inside the Users tab is not built.

**Scope:** 2 deliveries.

- **A** — Complete the write-path wiring. Every create, update, and delete in `app.js` should call `window.TIS.logAudit({...})`. Roughly 15 call sites.
- **B** — The panel: reverse-chronological list, grouped by term, filterable by operator/action/entity. Row expand → before/after diff. Undo button with the safety rule (only if no later edit exists on the same entity).

**Unblocked by:** nothing. Can start after the public viewer.

### 10.10 Offline report generation + one-click upload

**What:** The larger CBT roadmap item — generating report cards offline and uploading in bulk.

**Scope:** Multi-week. Do not attempt until the online pipeline is stable.

**Unblocked by:** completion of 10.1 through 10.4.

### 10.11 Digital library (Phase 4)

**What:** Staff lesson-note generation and research tools. Learner assignments and resources over the school LAN with cloud sync.

**Scope:** Multi-month. Design phase not started.

**Unblocked by:** everything above.

### 10.12 CBT offline app upload

**What:** The offline CBT app itself (running on the school LAN). Scores export from it are what the Broad Sheet importer consumes.

**Scope:** Outside the scope of this portal. Belongs to a separate project.

**Unblocked by:** nothing on the portal side. The importer is already built and waiting.

---

## PART 11 — ROADMAP

The order in which to build the pending items. Each phase is standalone — completing it delivers value without waiting for later phases.

### Phase A — Public results viewer (highest priority)

Deliver 10.1 A–D.

**End state:** `/check` is live. Parents and students can view results by PIN. Clearance gate applies. Lookups are audited.

### Phase B — Report card parity

Deliver 10.3 (extract renderer) then 10.4 (parity with PDF samples).

**End state:** Report cards match the sample PDFs. Stamp, QR, psychomotor, bar chart, auto term selection all present.

### Phase C — Fees module

Deliver 10.2 A–B.

**End state:** Class-wide bills and per-learner adjustments feed the report card footer.

### Phase D — Learner and staff housekeeping

Deliver 10.5, 10.6, 10.7, 10.8.

**End state:** Deactivate/reactivate learners. Inactive filtering. Duplicate cleanup. Staff attendance hides future days.

### Phase E — Audit log

Deliver 10.9 A–B.

**End state:** Every write is logged. Super-admin can review and (safely) undo.

### Phase F — Offline pipeline

Deliver 10.10.

**End state:** Report cards can be generated offline and uploaded in bulk.

### Phase G — Digital library

Deliver 10.11. Design phase first.

**End state:** Staff and learner resource management on the LAN with cloud sync.

---

## PART 12 — HOW TO KEEP THIS DOCUMENT CURRENT

This document will drift unless it is maintained. The following process keeps it accurate at every handover.

### 12.1 Where the document lives

Three copies, kept in sync:

| Copy | Location | Purpose |
|---|---|---|
| **Source** | `docayo/tis` repo, root, as `HANDOVER.md` | Versioned. Every developer sees it. |
| **Live page** | `https://tis-tan.vercel.app/handover` | Always-current public mirror, rendered from the file above. |
| **Pinned doc** | Google Drive, shared to school email | Reachable without GitHub. Backup copy. |

### 12.2 The `/handover` route

Just like `/rec`:

- Add `{ "source": "/handover", "destination": "/handover.html" }` to `vercel.json`.
- Create `handover.html` that loads `/HANDOVER.md` and renders it with the same markdown renderer `/rec` uses.
- Add the route to the whitelist in any future CORS setup.

### 12.3 The "before you touch anything" comments

Add a short comment block at the top of each major file:

```js
// ================================================================
// BEFORE YOU TOUCH THIS FILE:
//   Read HANDOVER.md (repo root) or /handover (live URL).
//   It is the master reference for state, rules, and conventions.
// ================================================================
```

Files that need it: `app.js`, `supabase-client.js`, `index.html`, `rec.html`, `check.html` (once created), `report-render.js` (once created).

### 12.4 The README at the repo root

Replace `docayo/tis/README.md` with:

```markdown
# TIS EMIS — The Ideal Schools Operational Portal

**Before anything else, read [HANDOVER.md](./HANDOVER.md).**

That document is the single source of truth for:
- Current state of the project
- Table schemas
- Code section map
- Rules and conventions
- Pending items and roadmap

The live version is at https://tis-tan.vercel.app/handover

If you are an AI assistant taking over this project: read HANDOVER.md
in full, then ask the owner to confirm nothing has changed since its
date before making any edits.
```

### 12.5 The first-message prompt for any new AI

Every time you start a conversation with a fresh AI, paste this as your first message:

```
Hello. You are taking over an existing project called TIS EMIS — The Ideal
Schools Operational Portal.

Before doing anything else, please read the master handover document at:

    https://tis-tan.vercel.app/handover

or, if that URL is not reachable, the file:

    https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md

Confirm when you have read it. Then wait for me to tell you what to work on.

Rules for working with me:
- Always give full-section replacements, not inline patches.
- Use the exact FILE / START / END / NEXT header before every delivery.
- Never truncate a code block. If a block is too long, split it clearly as
  Part 1 of N / Part 2 of N.
- Never say "find this line and change it."
- Always ask for the current file before modifying it.
- Do not assume anything about the state of the project that the handover
  does not explicitly confirm.
```

This three-sentence prompt plus the URL is all a new AI needs. It will read the handover and start correctly.

### 12.6 The handover checklist

Before handing the project to a new AI or developer, run this checklist:

- [ ] **Update `HANDOVER.md`.** Mark completed items done. Add new pending items. Bump the date at the top.
- [ ] **Commit.** Vercel publishes `/handover` automatically.
- [ ] **Verify the live page.** Open `https://tis-tan.vercel.app/handover` in incognito. Confirm the latest date appears.
- [ ] **Update the pinned Google Doc.** Copy the new `HANDOVER.md` over the old one.
- [ ] **Confirm the sealed codes** are still in the school safe.
- [ ] **Confirm the latest backup** ran (GitHub Actions → Monthly Backup).
- [ ] **Start the new conversation** with the first-message prompt above.

That's the loop. Seven steps. Takes five minutes.

### 12.7 What to update, and how

| Change type | Where it goes in the handover |
|---|---|
| New table | Part 2, section "Database schemas" |
| New `app.js` section | Part 2, section "`app.js` section map" |
| New `window.TIS` method | Part 2, section "`supabase-client.js` method list" |
| New rule | Part 3a, section "Absolute rules" |
| New convention | Part 3a, section "Coding conventions" |
| Item completed | Part 1, "What is in progress" — move to "What is live and working" |
| New item discovered | Part 1 and Part 3c both — brief in Part 1, detailed in Part 3c |
| Date change | Top of every part — keep them in sync |

**Do not add a new part.** The three-part structure (Emergency + State + Rules) has held up. Add content to the existing parts.

### 12.8 The rule for the next assistant

When a new AI starts, they should:

1. Read the handover.
2. Confirm with the owner that the state described matches reality (ask "has anything changed since <date>?").
3. Ask for the file before modifying it.
4. Deliver one full-section replacement at a time.
5. Test after every delivery.
6. Update the handover when a phase completes.

If a new AI does those six things, the project will continue smoothly regardless of how many times it changes hands.

---

## PART 13 — CLOSING

This project has grown from a Google Sheet to a live, multi-module operational portal in a short time. The core systems — auth, learners, staff, attendance, terms, calendar, classes, QR, ID cards, scores, report cards, recovery, backups — are working. The remaining work is well-scoped.

The single most valuable thing you can do going forward is **keep this document alive**. Every session that ends with an updated handover is a session that ends cleanly. Every session that ends without it leaves a gap for the next person.

The owner has been a careful, patient partner through this build. Treat his questions as valuable diagnostics, not interruptions. He has caught more bugs than any single test.

**The next assistant should be better than the last. That is the whole point of this document.**

---

**End of Part 3c.**
**End of the Master Handover Document.**
