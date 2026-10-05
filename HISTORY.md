# TIS EMIS — HISTORY

**Companion to:** HANDOVER.md (current state) and REFERENCE.md (schemas, rules).
**Purpose:** Session-by-session log of how the project got here.

This file is **append-only**. Never edit or delete past entries. If
something recorded here later turns out to be wrong, add a new entry
correcting it — do not modify the old one. History is a record of what
was done at a specific time, not a summary of what is true now.

Current state lives in HANDOVER.md. This file explains how we got there.

---

## HOW TO READ THIS FILE

Each session entry has:

- **Date**
- **Owner's ask** — what was requested
- **What was delivered** — files changed, functions added, tables created
- **What broke** — errors encountered, with the fix
- **What is now live** — anything new that works
- **Open items** — anything left incomplete

Read the newest entries first if you want recent context. Read the
oldest first if you want to understand the project's arc.

---

## SESSION LOG

### Session 1 — 29 September 2026 — Migration and recovery foundation

**Owner's ask:** Take over the project. It has a working portal but
some modules are broken. Read the existing handover note.

**What was delivered:**
- Full read of the original handover note and the codebase.
- Confirmed 14 critical fixes from the original note were applied.
- Began work on the ID Cards module (`[S21]`) — restored from a
  truncated paste, redrew the card layout for portrait CR80.
- Fixed a duplicate `idcHeaderBlockH` / `idcPhotoBlockH` /
  `idcNameRowH` causing a fatal SyntaxError.

**What broke:**
- `[S21]` block was incomplete (truncated paste). Fixed by full
  rewrite of the section.
- `CONTACT_LABELS` duplicate caused login freeze. Removed.

**What is now live:**
- ID Cards module (portrait CR80, 3 × 3 A4, ZIP export).
- Learner photo upload to `TISAssets/learners/<PIN>.png`.
- Staff photo upload to `TISAssets/staff/<STAFF_ID>.png`.

**Open items at end of session:** Public results page, fees module,
audit log UI, various small fixes.

---

### Session 2 — 30 September 2026 — Auto-PIN, duplicate detection, scan handler

**Owner's ask:** Make the Add Learner flow robust. Auto-assign PINs.
Prevent duplicate PINs and duplicate learners. Build the `/s/<code>`
scan handler for the new per-person QR cards.

**What was delivered:**
- Gap-fill auto-PIN trigger: lowest unused number ≥ 101, else max + 1.
- Reserved range `TIS0001`–`TIS0100` never auto-assigned.
- Duplicate detection: name + DOB → warn + allow override. Duplicate
  typed PIN → hard refuse.
- `TIS.findLearnerDuplicate` method.
- `TIS.recordLearnerScan`, `TIS.recordVisitorScan`, `TIS.logScanEvent`.
- `handleIDCardScanIfPresent` — routes `/s/<code>` to learner
  attendance, staff smart flow, or visitor prompt.
- Extended all in-page scan success/fatal screens with the message:
  *"Thanks, Dr AYOOLA G O FCIA, NIIA. Appreciate."* and auto-close
  after 7 seconds.

**What broke:**
- RLS was re-enabled on `scan_events` after a fresh create. Fix:
  always verify RLS is off after every new table.
- A temporary duplicate of the subjects table blocked the CBT schema.
  Resolved by dropping and recreating.

**What is now live:**
- Auto-PIN assignment.
- `/s/<code>` scan handler.
- Visitor in/out via `VIS-01` … `VIS-05`.
- `scan_events` audit log.

**Open items:** CBT scores schema, importer, report card.

---

### Session 3 — 1 October 2026 — CBT schema, template generator, importer

**Owner's ask:** Build the CBT pipeline. Download template, upload
scores, auto-compute grades. Make it flexible so any subset of classes
or subjects can be uploaded at any time.

**What was delivered:**
- Four tables: `subjects` (25 rows), `class_subjects` (231 rows),
  `class_aliases` (28 rows), `scores`.
- `TIS.listSubjects`, `TIS.getClassSubjects`, `TIS.setClassSubjects`.
- Classes tab "Manage Subjects" — editable slot map per class, with
  double-confirm dialogs on save.
- Broad Sheet & Scores console: Download Template, Upload Filled File.
- Template generator: scope = Class / Subject / School / Student.
  PIN and name pre-filled. Existing scores merged in. Legend sheet
  included (later removed — slots mapped by class_subjects).
- Importer: parses XLSX, verifies PINs and names, resolves slots,
  conflict modal for overwrites, upserts to `scores`.

**What broke:**
- Excel "sheet protection" was silently locking all cells. Fix:
  removed `!protect` — server-side verification on import instead.
- Multi-class downloads were unsorted. Fix: sort by class sort_order,
  then by name.

**What is now live:**
- Full CBT scores pipeline (schema, template, importer, conflict).

**Open items:** Report card renderer, auto-assign, fees module.

---

### Session 4 — 2 October 2026 — Comment bank and auto-assign

**Owner's ask:** Fill in the non-academic half of the report card
automatically. Psychomotor ratings and comments. Should feel natural,
not stamped. Comments must be encouraging, even for weak performance.

**What was delivered:**
- `report_ratings` table — one row per learner × term × year.
- `comment_bank` table — 336 comments (28 per band per field).
- Six bands: excellent, very_good, good, average, fair, poor.
- Two fields: teacher, principal.
- Four categories: general, subject_strong, subject_strong_weak,
  subject_weak.
- Placeholders `{first}`, `{strong1}`, `{weak1}`.
- `TIS.getReportRatings`, `TIS.upsertReportRating`,
  `TIS.getCommentBank`, `TIS.listCommentBank`,
  `TIS.createCommentBank`, `TIS.updateCommentBank`,
  `TIS.deleteCommentBank`, `TIS.bandForAverage`.
- `autoAssignRatings(plannedRows)` — runs after every import. Uses
  weighted random ratings within the band. Picks comments avoiding
  repeats within the same class. Prefers `subject_strong_weak` when a
  clear strong/weak pair exists. Marks rows `teacher_edited` or
  `principal_edited` if a human has saved — auto-assign skips those.

**What broke:**
- Duplicate seed doubled the bank (192 instead of 96). Fix: delete
  duplicates, add unique constraint `(field, band, category, text)`.
- The full SQL seed was truncated in delivery. Fix: split into parts,
  full-file single-message delivery.
- RLS re-enabled on both tables after a fresh attempt. Fix: verify
  with `pg_class.relrowsecurity` and re-disable.

**What is now live:**
- 336-comment bank.
- Auto-assign after score uploads.
- Ratings and comments ready for the report card renderer.

**Open items:** Full renderer parity with PDF samples, public viewer.

---

### Session 5 — 3 October 2026 — Report card viewer (internal)

**Owner's ask:** Build the in-portal Results tab. Load by PIN, view
termly or sessional report card, print on demand. Not auto-print.

**What was delivered:**
- New Results tab in the portal nav.
- `initResultsTab`, `resultsLoadReport`, `resultsPrint`.
- `resultsBuildTermly` — single term. Columns: SUBJECTS, TEST 1,
  TEST 2, EXAM, TOTAL, GRADE, REMARKS.
- `resultsBuildSessional` — three terms side by side + CUMULATIVE.
- `resultsPrintCss`, `resultsHeaderHtml`, `resultsStudentBar`,
  `resultsStatsBlock`, `resultsSessionalStats`,
  `resultsCommentsBlock`, `bandForTotal`.
- Print button opens the print dialog on demand. Never auto-print.
- `results` added to `ALL_MODULES` and to `PERMISSION_MODULES`.
- `read_results` permission added to all existing operators via SQL.

**What broke:**
- A partial paste of `resultsPrintCss` left an unterminated string.
  Fix: add `;` and closing `}`. Root cause: truncation in delivery.
- Refactored to always split large section deliveries going forward.

**What is now live:**
- In-portal report card viewer with termly and sessional layouts.
- Permissions wired.
- Print on demand.

**Open items:** Parity with sample PDFs (stamp, QR, bar chart,
psychomotor column). Public viewer.

---

### Session 6 — 4 October 2026 — Handover and cleanup

**Owner's ask:** Multiple small fixes and the master handover document.

**What was delivered:**
- Fixed the `resultsPrintCss` truncation.
- Auto-assign delivery 3 (the `[S18c]` block) applied.
- `HANDOVER.md` written — 13 parts, complete.
- `/handover` route added to `vercel.json`.
- `handover.html` — renders `HANDOVER.md` as a page.
- Comment blocks at the top of `app.js`, `supabase-client.js`,
  `index.html` telling any reader to consult the handover.
- `README.md` replaced with a pointer to the handover.
- Split `HANDOVER.md` into three files: `HANDOVER.md` (current state),
  `REFERENCE.md` (schemas, rules), `HISTORY.md` (this file).

**What broke:**
- The initial `Part 3` delivery of the handover was truncated mid-
  sentence. Fix: split into 3a, 3b, 3c.
- RLS was disabled and re-disabled on some tables during handover
  setup — cosmetic.

**What is now live:**
- Full handover system: three files + live page + first-message prompt.
- All modules working end to end.

**Open items:** The full Phase A–G roadmap. Highest priority: public
results viewer at `/check`.

---


### Session 7 — 5 October 2026 — Phase A, D.1, and report card parity

**Owner's ask:** Multiple items across the session. Complete the
report card to match the sample PDFs. Build the public results
page. Build the fees module. Fix assorted visual issues.

**What was delivered:**

Report card parity and shared renderer:
- Extracted `[S22]` into a shared `report-render.js` exposing
  `window.TISReport`, loaded by both `index.html` and `check.html`.
- Header rewritten: inline SVG titles with real `linearGradient`
  fills (green → gold → red → blue), school logo on the left,
  learner photo circle on the right, ministry logo removed.
- Learner photo pulled from `learners.photo_url`.
- Faded school logo watermark behind the report card.
- Palette rebalanced: green 50%, gold 25%, blue 15%, red 10%.
- MARKS OBTAINABLE row added to both termly and sessional tables.
- PSYCHOMOTOR RATINGS table moved into a side column beside the
  subject table with Word-grid styling.
- FEE BREAKDOWN table added below the psychomotor block. Reads
  `fee_schedule` + `fee_adjustments` + `learner_terms`. Scholarship
  and Additions rows hidden when zero.
- Stats block extended with AGGREGATE SCORE / PERCENTAGE /
  HIGHEST PEC % / LOWEST PEC %.
- Comments block now reads `report_ratings.teacher_comment` and
  `report_ratings.principal_comment` instead of hard-coded text.
- PROMOTED TO logic: 1st and 2nd term → next term label;
  3rd term and sessional → next class from `classes.next_class`.
- LIN row now shows the learner's PIN.
- SCHOOL STAMP moved out of the comments block. Now sits in a
  bottom row alongside PERFORMANCE CHART (coloured bar chart by
  grade) and QR CODE (points at `/r/<PIN>`).
- `getResumptionDate` in `supabase-client.js` now reads the
  academic calendar by tag (`RESUMPTION (FIRST TERM)` etc.) for
  the correct academic year, no hard-coded dates.

Phase A — public results page:
- `check.html` and `check.js` created. Loaded by `/r` and `/r/<PIN>`
  via `vercel.json`. Login-free, print-only, no preview.
- Clearance gate: when `learner_terms.cleared != 'Yes'`, numeric
  cells render as `—` and a payment-policy notice appears above
  the subject table. Performance chart is empty for not-cleared
  learners. Subject names, grades, remarks, psychomotor, comments,
  stamp and QR still render.
- `results_views` table created (RLS off) and
  `TIS.logResultsView` added to `supabase-client.js`. Every public
  lookup writes one row with PIN, term, year, report type, outcome,
  masked IP and user agent.
- Deep link `/r/TIS0241` pre-fills the PIN and auto-opens the
  print dialog after load.

Phase D.1 — fees module:
- `fee_schedule` table — class × term × year bill. Unique on
  `(class_name, term_type, year)`. RLS off.
- `fee_adjustments` table — per-learner additions and deductions.
  Unique on `(learner_id, term_type, year)`. RLS off.
- Nine new methods on `window.TIS`: `listFeeSchedule`,
  `getFeeScheduleRow`, `upsertFeeSchedule`, `deleteFeeSchedule`,
  `listFeeAdjustments`, `getFeeAdjustment`,
  `listFeeAdjustmentsForLearners`, `upsertFeeAdjustment`,
  `deleteFeeAdjustment`.
- Fees panel added inside the Terms tab. Two sub-tabs — Class Bill
  and Adjustments. Class Bill lists one row per active class with
  four numeric fields and a live total. Adjustments lists one row
  per learner with additions, deductions, reason, and a live search
  plus class filter. Adjustments sorted by academic class order,
  then by name within class.
- Report card's FEE BREAKDOWN table now feeds from these tables
  instead of `learner_terms` alone.

**What broke:**
- Initial `report-render.js` extraction left `buildFeeText` and
  several helpers unresolved. Fixed by exposing them on
  `window.TISReport` and updating call sites in `app.js`.
- Inline `background-clip: text` gradients on the header titles did
  not render in Chrome's print preview. Fixed by switching to
  inline SVG with real `linearGradient` fills — prints everywhere.
- The first attempt at a hidden watermark (`::before` pseudo-element
  with `background-image`) did not render in print. Fixed by using a
  real `<img>` inside a `.rc-watermark` div.
- Two grouped replacements in `check.js` and `report-render.js`
  initially had wrong boundary lines that would have swallowed
  unrelated functions. Corrected before pasting.
- A `git` command block pasted into the Supabase SQL editor produced
  a `42601` syntax error. Not harmful — the SQL editor does nothing
  with a failed query. The commit was performed via the GitHub web
  UI instead.

**What is now live:**
- Public results page at `/r` and `/r/<PIN>`.
- Shared `report-render.js`.
- Report card at parity with the sample PDFs.
- Fees module with class bill and per-learner adjustments.
- Fee breakdown table on the report card.
- `results_views` audit log.
- Report card watermark, learner photo, inline-SVG header.
- All palette and layout refinements.

**Open items:**
- Hide Inactive bug on the Learners tab — exited learners stay
  visible and the toggle appears ineffective.
- Reports Workshop comment fields should pre-load from the bank
  and support Up / Down arrow navigation.
- Learners View modal should show the fee breakdown from the same
  source the report card uses.
- Add Learner should apply the class bill automatically.
- Deactivate / reactivate learners.
- Delete duplicate learners.
- Audit log UI and full write-path wiring.
- Offline report generation, digital library, offline CBT integration.


### Session 8 — (add your next session here)

**Owner's ask:**

**What was delivered:**

**What broke:**

**What is now live:**

**Open items:**

---

## THE ROADMAP (unchanged since 4 October 2026)

**Phase A — Public results viewer `/check`** — highest priority.
PIN input, welcome banner, term/year picker, report card view, print.
Clearance gate. `results_views` audit table.

**Phase B — Report card parity** — match the sample PDFs. Stamp, QR,
psychomotor column, bar chart, auto term selection (1st/2nd → termly,
3rd → sessional).

**Phase C — Shared `report-render.js`** — extract the renderer so both
the internal Results tab and the public `/check` page use the same code.

**Phase D — Fees, learner lifecycle, audit** — Fees module (class
schedule + per-learner adjustments). Deactivate/reactivate learners.
Delete duplicate learners. Audit log UI and full write-path wiring.

**Phase E — Later phases** — Offline report generation. Digital
library (staff lesson notes, learner assignments over LAN). Offline
CBT app integration.

---

---

**What changed in this REFERENCE.md vs. the one you pasted:**

1. **Part 1 — schemas.** Added `fee_schedule`, `fee_adjustments`, and `results_views` tables with full column lists. Added the `exit_reason` note on `learners` and the resumption-tag note on `academic_calendar`.
2. **Part 2 — section map.** `[S09] TERMS` now lists the fees panel functions. `[S22] RESULTS` now lists all the report-render functions that live in `report-render.js`, plus the two new `[S22]`-side helpers (`buildFeeBreakdown`, `nextTermLabel`). Added a note that `learner-bulk.js` is legacy and not loaded. Added the script-loading order for `index.html` and `check.html`.
3. **Part 3 — `supabase-client.js` methods.** Added `logResultsView`, all nine fee methods, and `getLearnerTermFor`.
4. **Part 4 — NEW.** Complete method list for `report-render.js`.
5. **Part 5 — NEW.** Routes table for `vercel.json`, including the `/r` and `/r/<PIN>` routes plus the legacy `/check` routes.
6. **Part 6 — absolute rules.** Rewritten to incorporate the boundary-anchor discipline, the ban on inline-patch phrasing, the file-to-concern map, and the two print-rendering rules (no `background-clip: text`, no `::before` watermark).
7. **Part 7 — lessons learned.** Added Lessons 8 (boundary anchors must exist in the file) and 9 (wrong file delivered).
8. **Part 8 — pending items.** Replaced the lettered A–K list with the items actually open on your desk today, in your priority order: Hide Inactive bug, Workshop comments, Learners fee wiring, deactivate/reactivate (marked done), delete duplicates, audit log UI, plus the later phases.
9. **Part 9 — roadmap.** Phase A, B, C marked done. Phase D split into D.1–D.4 with D.1 and D.2 done. Added Phase E for the small fixes.
10. **Date** at the top: 5 October 2026.

---

**Commit and next move.**

Commit this REFERENCE.md. Then paste the current `[S07] LEARNERS` region of `app.js` — from the line `// [S07] LEARNERS — three-tier permission-gated record` to the line just before `// [S08] STAFF` — and I will deliver the **Hide Inactive fix** as a single grouped replacement, per the rules above.
## HOW TO MAINTAIN THIS FILE

Every time a session ends:

1. Add a new session entry above using the same template (Owner's ask,
   what was delivered, what broke, what is live, open items).
2. If a Phase item was completed, update the roadmap section accordingly.
3. Never edit an old entry.
4. Commit.

That is the whole maintenance procedure.

---

**End of `HISTORY.md`.**
