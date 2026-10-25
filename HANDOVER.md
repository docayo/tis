markdown
# TIS-EMIS HANDOVER — 2026-10-25 (Evening Update)

**Repo:** https://github.com/docayo/tis
**Local clone:** C:\Users\LENOVO\tis-portal
**Live (Server A):** https://192.168.0.81:3443
**Live (Server B):** https://192.168.0.28:3443
**Supabase:** ndsroviwrfjbgaucajri.supabase.co
**Owner:** Dr Ayoola Gabriel O, FCIA, NIIA
**Copyright:** 2026

**Read this file first before touching any code.**

---

## 1. SESSION SUMMARY — What shipped on 2026-10-25

All commits below are on `main` and deployed via Vercel. Total today: 17 commits.

| Commit | What |
|---|---|
| `cca091a` | View modal itemization (single itemized fee set, statutory labels) |
| `20cbf34` | Removed duplicate infoRow fee block from view modal |
| `656af88` | `.gitattributes` — LF normalization |
| `2c2ae7f` | Print card (80mm) Section B itemization |
| `e4ca312` | Sitewide rename: Other Bills Major→Text Books, Other Bills Minor→Dept Text Book, Books→NoteBooks |
| `5a97e87` | Print Uncleared Learners report (A4 landscape) |
| `0907484` | Optional items — data model + UNLOCKED/LOCKED gating |
| `f6f81a0` | Statutory lock: 1st-Term-only for Text Books/NoteBooks/Uniform |
| `ebd8f95` | Dept Text Book optional across all terms |
| `c2f183b` | Removed duplicate "Net Bill (this term)" line |
| `037f1fa` | **Fixed mojibake corruption (493 patterns)** — cp1252→UTF-8 roundtrip |
| `2977bd4` | **Payment revocation** — slot-based delete + UI button + recompute |
| `49d120c` | Batch confirm for paid learners (window.confirm) |
| `dce51d3` | Dept Text Book in optional dropdown + auto-populate amount from schedule |
| `ef1ddaf` | **Performance caches** — getActiveTerm (30s TTL) + getFeeScheduleRow (per key) |
| `05ef0fe` | **Manual B/F edit** — Edit button + inline form + confirm dialog for paid learners |
| `79eead0` | **Term management** — schedule copy + B/F backfill on forward advance |
| `c158bc2` | Fixed `window.closeModal` / `window.setHTML` missing exports |
| `07d2dd7` | Fixed fee computation: optional items use learner value + registration_fee in net bills + optionalActive gating |
| `9f8234a` | Added `registration_fee` to `visibleLines` in modal + print card |

**All features are live and tested** except term-advance (which only fires when operator actually advances 1st→2nd Term).

---

## 2. APPLICATION ARCHITECTURE

### Files

| File | Lines | Purpose |
|---|---|---|
| `app.js` | ~13,530 | **Main application** — all UI logic, modal rendering, fee computation, learner/staff/results/attendance modules |
| `supabase-client.js` | ~3,580 | **Supabase API layer** — all DB access via `window.TIS.*` methods |
| `index.html` | ~1,165 | Shell + module layouts + nav tabs |
| `.gitattributes` | 1 | Forces LF line endings for all text files |

### IIFE pattern

`app.js` and `supabase-client.js` are both **single IIFEs**:
```js
(function () {
  'use strict';
  // ... all code
})();
All state and helpers are IIFE-scoped unless explicitly exported to window.*.

Critical exports at bottom of app.js (~line 4,000+):

window.openLearnerViewModal, window.openLearnerEditModal, etc.

window.closeModal, window.setHTML (added c158bc2)

window.feeSaveBF, window.feeRevokePayment, window.feeApplyBatch, window.feeCancelBatch

window.printUnclearedList, window.openStatusPage

window.prepareTermData (added in 79eead0)

Inline handlers in HTML (onclick="closeModal()") require the function to be on window. Missing exports cause "click does nothing" bugs.

3. DATABASE SCHEMA (Supabase)
Core tables
learners — one row per enrolled learner

id (int, PK), pin (text, unique), full_name, class_name, gender, father_phone, mother_phone, guardian_phone, parents_name, photo_url, blood_group, allergy, date_of_birth, religion, state_of_origin, lga_of_origin, state_of_birth, lga_of_birth, parents_name, address, lin, class_before_admission, date_of_admission, class_admitted_into, class_at_withdrawal, date_of_withdrawal, exit_reason, account_number, is_active, created_at

classes — one row per class

name (text, PK-ish), next_class, class_order

terms — one row per term/year

id (int, PK), term_type ('1st', '2nd', '3rd'), year (int), label (e.g., "1ST TERM 2026/2027"), is_active (bool), created_at

fee_schedule — class bill per term/year

class_name, term_type, year (composite unique)

tuition, other_bills_major, other_bills_minor, books, uniform, registration_fee, sportswear, waist_coat, tie, extra_lesson, special_lesson

updated_at

learner_terms — per-learner fee snapshot / receipt per term/year

learner_id, term_type, year (composite unique)

optional_items_enabled (TEXT, default '') — CSV of enabled optional item keys

tuition, other_bills_major, other_bills_minor, books, uniform, registration_fee, sportswear, waist_coat, tie, extra_lesson, special_lesson, additions, scholarship

balance_bf (TEXT) — carried forward balance from previous term

balance_cf (TEXT) — computed current balance

total_part_payment (TEXT) — sum of active payment slots

part_payment_1_amount, part_payment_1_date, part_payment_2_amount, ... up to slot 5

bill (legacy) — snapshot of netBills at first payment

other_bill (legacy) — always '0'

cleared ('Yes' or ''), clearance (date string)

updated_at

fee_learner_item_overrides — legacy per-learner removal of statutory items

learner_id, term_type, year, item_key, note, updated_at

STATUS: not used for optional items. Optional items use optional_items_enabled in learner_terms. Overrides table still queried for statutory items but X on optional items now removes from CSV.

fee_adjustments — per-learner additions/deductions

learner_id, term_type, year, additions, deductions, reason, notes, updated_at

users — operator accounts

id, username, role ('super_admin', 'admin', 'operator'), password_hash, is_active, permission_matrix

staff — staff records (separate from operators)

Similar structure with staff_id, full_name, role, contact, etc.

Attendance tables: learner_attendance, staff_attendance, attendance_events

Audit: audit_log — records every write with actor_name, action, entity_type, entity_id, before, after, notes

4. BUSINESS RULES
4.1 Fee item classification
Statutory (cannot be removed, ever):

tuition (always statutory)

other_bills_major (Text Books — 1st Term only)

other_bills_minor (Dept Text Book — NEVER statutory, always optional)

books (NoteBooks — 1st Term only)

uniform (Uniform — 1st Term only)

Rule (from 2026-10-25):

1st Term: Tuition, Text Books, NoteBooks, Uniform are STATUTORY (no X, no batch checkbox)

2nd/3rd Term: Text Books, NoteBooks, Uniform become OPTIONAL (must be explicitly enabled via optional_items_enabled)

Dept Text Book is ALWAYS optional

Optional (must be enabled per learner via optional_items_enabled CSV):

registration_fee

other_bills_minor (Dept Text Book)

sportswear

waist_coat

tie

extra_lesson

special_lesson

additions (via fee_adjustments table, not CSV)

Default: ALL optional items start DISABLED (empty CSV). Operators add per learner.

4.2 Fee computation — THREE places
CRITICAL: netBills is computed in THREE separate locations. All three must be consistent.

A. resolveLearnerFeePicture() — UNLOCKED branch (fresh, no payments)

Location: app.js ~line 866+

Reads: schedRow (class schedule), termRow (learner's snapshot), optionalEnabledSet (from termRow.optional_items_enabled)

pick(key, fallback) function: prefer learner's row for optionalActive items, prefer schedule otherwise

netBills = tuition + otherMajor + otherMinor + books + uniform + sportswear + waistCoat + tie + extraLesson + specialLesson + registrationFee + additions - deductions

Contains registrationFee (fixed 07d2dd7)

B. resolveLearnerFeePicture() — LOCKED branch (has payments — snapshot frozen)

Location: app.js ~line 792+

Reads: all fee values from termRow directly (frozen at first payment)

Does NOT include registrationFee ⚠️ BUG STILL PRESENT if learner has paid

balanceCf = netBills + balanceBf - paid

C. feeRecomputeSnapshot() — used after every save (X, add, B/F, payment)

Location: app.js ~line 1670+

Reads: sched (schedule), row (learner's snapshot), overrides, optionalEnabledSet (loaded from row.optional_items_enabled)

pick(key) function: prefer row for optionalActive items, schedule otherwise

netBills = tuition + ... + specialLesson + registrationFee + additions - deductions

Contains registrationFee (fixed 07d2dd7)

Contains optionalActive gating (fixed 07d2dd7)

Writes back to learner_terms: bill, tuition, all fee columns, additions, scholarship, balance_cf, cleared, clearance, updated_at

D. visibleLines in view modal

Location: app.js ~line 1179

Sums fee.* object (already computed by resolveLearnerFeePicture)

Now includes fee.registration_fee (fixed 9f8234a)

E. visibleLines in print card

Location: app.js ~line 3461

Same as D, for print

Now includes fee.registration_fee (fixed 9f8234a)

⚠️ KNOWN REMAINING BUG: LOCKED branch (B) does NOT include registrationFee. If a learner has any payment (total_part_payment > 0), the fee picture freezes and registration_fee won't be in netBills. Fix in a future session: add registrationFee to LOCKED netBills calculation.

4.3 Term advance behavior
Function: prepareTermData(prevTerm, newTerm) — app.js ~line 5416
Triggered by: activateTerm(id, label) — app.js ~line 5395

When operator advances 1st → 2nd Term:

getActiveTerm() captures prevTerm

setActiveTerm(id) writes to terms.is_active

getActiveTerm(true) re-fetches newTerm (force refresh — bypasses 30s cache)

prepareTermData(prevTerm, newTerm) runs:

Direction check: forward = (newTerm.year > prevTerm.year) || (same year && newOrd > prevOrd). Skip if backward/same.

If within-year (not year advance): call advanceTermFees({fromTerm, fromYear, toTerm, toYear}) — copies fee_schedule and fee_adjustments forward (skips existing rows)

Iterate all learners: read prevTerm.balance_cf; if > 0 and existing newTerm.balance_bf is 0/empty, backfill it via updateLearnerTermSnapshot

Does NOT create learner_terms rows — only backfills B/F on existing rows

⚠️ CRITICAL LIMITATION: If learner_terms rows for the new term don't exist, prepareTermData skips them. Only existing rows get backfilled. If you advance terms and rows don't exist, learners show ₦0 fees until manually reconciled.

Mitigation: use the manual B/F edit feature per learner, OR (future) add row creation to prepareTermData.

Year advance (3rd → next 1st): Class promotion is separate (via promotion wizard). prepareTermData skips schedule copy for year advance but still backfills B/F on existing rows.

Backward (2nd → 1st): Do nothing. Just set active term.

4.4 Payment model — SLOTS not rows
Payments are stored as 5 slots on learner_terms, not in a separate learner_payments table:

part_payment_1_amount, part_payment_1_date

part_payment_2_amount, part_payment_2_date

... up to slot 5

total_part_payment = sum of active slots.

recordPartPayment(learnerId, termType, year, amount, date, mode, netBills) — finds first empty slot, fills it, updates total_part_payment. On first payment, freezes the snapshot (bill = netBills).

revokeLearnerPaymentSlot(learnerId, termType, year, slotNumber) — clears the specified slot (sets amount and date to null), recomputes total_part_payment.

UI: Delete button on each payment line in view modal.

After revoking the last payment, learner becomes UNLOCKED — resolveLearnerFeePicture switches from frozen snapshot to live schedule+overrides.

4.5 B/F (Previous Term Balance carried forward)
Storage: learner_terms.balance_bf (TEXT)

Display logic (fixed 05ef0fe, 9f8234a):

js
let balanceBfRaw = termRow && termRow.balance_bf;
let balanceBf = num(balanceBfRaw);
const bfIsMissing = (balanceBfRaw === null || balanceBfRaw === undefined || String(balanceBfRaw).trim() === '');
if (bfIsMissing && term) {
  // fallback to previous term's balance_cf
}
Key rule: explicit 0 in DB → displays 0. Only null/undefined/''/' ' falls back to previous term.

Manual edit: Edit button in view modal. Writes balance_bf via updateLearnerTermSnapshot. If learner has paid (total_part_payment > 0), confirmation dialog appears.

Edit flow:

Click Edit → inline input appears

Enter value → Save → feeSaveBF(pin) runs

getLearnerTermFor fetches row

If row exists → updateLearnerTermSnapshot({ balance_bf: String(newVal) })

If row doesn't exist (shouldn't happen normally) → currently fails silently, needs upsert fix ⚠️

feeRecomputeSnapshot runs

Modal re-renders

4.6 Payment revocation UI
Per payment in view modal: Delete button next to each Less Payment N row.

Delete flow: confirm → revokeLearnerPaymentSlot → recompute → re-render.

No audit trail — hard delete of slot values (was chosen over soft delete for simplicity).

5. POWERSHELL ↔ PROJECT COMMUNICATION STRATEGY
5.1 PowerShell version
Windows PowerShell 5.1 (default on Windows 10). NOT PowerShell 7+.

Critical consequences:

Set-Content -Encoding UTF8 writes UTF-8 WITH BOM → mojibake when re-read

Out-File has same BOM bug

> redirect also adds BOM

Here-strings @'...'@ are safe (preserve exact content)

[System.IO.File]::WriteAllText(path, content, (New-Object System.Text.UTF8Encoding($false))) is the ONLY safe way to write text files

Never use Set-Content for UTF-8 files with any non-ASCII

5.2 The mojibake trap (LEARNED THE HARD WAY 2026-10-25)
Symptom: every em-dash (—) became â€", arrow (→) became â†', naira (₦) became â‚¦, etc. 493 patterns corrupted across app.js.

Root cause: at some point, a script wrote app.js via Set-Content -Encoding UTF8. The BOM plus the double-encoding corrupted every non-ASCII character.

Recovery:

powershell
$src = [System.IO.File]::ReadAllText((Resolve-Path 'app.js').Path, [System.Text.Encoding]::UTF8)
$bytes = [System.Text.Encoding]::GetEncoding(1252).GetBytes($src)
$fixed = [System.Text.Encoding]::UTF8.GetString($bytes)
[System.IO.File]::WriteAllText("$PWD\app.js", $fixed, (New-Object System.Text.UTF8Encoding($false)))
Prevention:

ALWAYS use [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))

NEVER use Set-Content on files with non-ASCII

Add .gitattributes with * text=auto eol=lf (done in 656af88)

After every file write: verify with node --check and (if non-ASCII expected) count ₦ / — / → occurrences

5.3 The CRLF trap
Windows editors (Notepad, VS Code default) save CRLF line endings. Git .gitattributes forces LF on commit. Result: every git add shows a warning and phantom diffs.

Symptom: git diff --stat shows 1000+ lines changed for a small edit.

Fix:

Run git diff --stat before every commit

If diff > 100 lines for small edit → CRLF noise

Fix: git add --renormalize app.js (stages normalised version)

Prevent: set VS Code "files.eol": "\n", Notepad++ default EOL to "Unix (LF)"

5.4 The escaping trap (LEARNED THE HARD WAY)
Problem: PowerShell string literals with JS content.

Rules:

Double-quoted PowerShell strings ("...") process escapes:

$var → variable interpolation

`n → newline (backtick-n, NOT \n)

\ is literal (not escape — PowerShell uses backtick)

" can be escaped as "" (double)

Single-quoted PowerShell strings ('...') are literal — no interpolation, no escapes except '' for literal '

Here-strings @'...'@ (single) — pure literal, ideal for JS/HTML

Here-strings @"..."@ (double) — processes $ interpolation

For JS with " quotes inside:

Use here-string @'...'@ — safest, preserves quotes exactly

Or double-quoted string with "" for literal " — works but error-prone

Or single-quoted string — works for content without '

Never build long JS blocks with "..." and manual escaping. Always use here-strings.

5.5 Multi-line paste corruption
Symptoms: pasting multi-line blocks into PowerShell console sometimes loses lines, duplicates lines, or mangles quotes.

Mitigation:

Use here-strings @'...'@ (single paste, no continuation prompts)

Verify content immediately after building: $block.Contains('unique_string'), ($block -split "n").Count`

Build blocks one element at a time for critical code

Always run node --check before committing

5.6 Copy-paste workflow (recommended)
Get diagnostic output — Select-String, line-numbered for loops, Write-Host verification

Build the fix as a here-string — verify with Contains and Count

Assemble the new file in memory — verify anchors, count

Write to disk via [System.IO.File]::WriteAllLines

Verify syntax — node --check

Verify anchors — Select-String for expected content

Commit and push — one logical commit per fix

Never edit app.js in a text editor directly. Always use PowerShell + WriteAllText/WriteAllLines.

5.7 VS Code as complementary tool (new 2026-10-25)
Installed: yes (today).

Useful for:

Reading / searching app.js (13,530 lines) — syntax highlighting, Ctrl+F, symbol jump (Ctrl+Shift+O)

Comparing — Git integration shows diffs

Quick manual inspection of function bodies

NOT to be used for:

Editing app.js on disk — use PowerShell per protocol above

Committing from VS Code — use PowerShell git commands (avoids CRLF surprises)

Configure VS Code:

File → Preferences → Settings → search "eol" → set Files: Eol to \n

Search "encoding" → set Files: Encoding to utf8

These prevent CRLF-on-save and UTF-8-BOM issues

6. ONLINE TIS-EMIS ↔ OFFLINE CBT RELATIONSHIP
Two separate systems, same school:

TIS-EMIS (Online — this project)

Hosted on: Vercel (portal) + Supabase (database)

Accessed via: LAN (192.168.0.81:3443, 192.168.0.28:3443) or public URL

Purpose: school management — learners, staff, fees, attendance, results

Data: 122 learners, 16 staff, 26 classes, fee schedules, payments, exam scores

Repo: github.com/docayo/tis

Database: Supabase (cloud)

TIS-CBT (Offline — separate system)

Hosted on: LAN computers at the school (Windows servers)

Data path: C:\TIS-CBT\data\cbt.sqlite

Cert dir: C:\TIS-CBT\certs\

Purpose: CBT exams, typing tutor, lesson delivery — no internet required

Database: SQLite (local file)

Relationship:

Data flow: TIS-EMIS is the master for learner data (names, PINs, classes). Offline CBT must have learner rosters synced from TIS-EMIS.

No automatic sync — operators export/import learner rosters manually

Exam results from offline CBT may be pushed back to TIS-EMIS results tables (future feature)

Session recording — offline CBT tracks scans, attendance, typing tests (local only)

Not the same portal — do not confuse app.js (TIS-EMIS) with the offline CBT codebase

The typing tutor is part of the offline CBT system, NOT TIS-EMIS

Future integration points (roadmap):

Learner roster sync from EMIS → CBT (scheduled or on-demand)

CBT exam results pushed to EMIS results table

Typing test scores stored in EMIS (learner_typing_results table TBD)

Certificate generation from typing levels

7. COMMON OPERATIONS RUNBOOK
7.1 First-payment snapshot (freeze)
When recordPartPayment is called and total_part_payment was 0:

Compute netBills from schedule at that moment

Write bill = netBills into learner_terms

From this point, resolveLearnerFeePicture returns source: 'snapshot' (frozen values, not live schedule)

Side effect: changing schedule after first payment does NOT affect this learner's bill.

7.2 Record a payment
UI: view modal → Record Payment button. Flow:

Prompt amount

submitPartPayment(learnerId, termType, year, amount, netBills) in app.js

window.TIS.recordPartPayment(...) — fills first empty slot

feeRecomputeSnapshot recomputes balance_cf

Modal re-renders with new balance

If all 5 slots are full — returns error. Learner must have their payments consolidated (future feature).

7.3 Revoke a payment
UI: Delete button on each payment line. Flow:

Confirm dialog

feeRevokePayment(slotNumber, pin) in app.js

window.TIS.revokeLearnerPaymentSlot(...) — clears the slot

feeRecomputeSnapshot

Modal re-renders

Effect: if this was the only payment, learner becomes UNLOCKED — fee picture switches from frozen snapshot to live schedule.

7.4 Add an optional item
UI: + Add optional item in view modal (super_admin/admin only). Flow:

Click → inline form with dropdown + amount input

Pick item → amount auto-populates from class schedule (via feeAddItemSelectChanged)

Save → feeSaveAddItem(pin)

Appends to optional_items_enabled CSV

Sets learner_terms.<item> = entered amount

feeRecomputeSnapshot — this now respects optionalActive (fixed 07d2dd7)

Net Bills and Balance C/F increase

Modal re-renders with new item + X button

7.5 Remove an optional item
UI: X button on the item line. Flow:

Click X → learnerFeeToggleOff(pin, itemKey, skipRefresh)

Detects optional item → removes from optional_items_enabled CSV

Sets learner_terms.<item> = "0"

feeRecomputeSnapshot

Modal re-renders — item disappears, balance decreases

For statutory items (shouldn't have X button): falls back to setLearnerItemOff (legacy overrides table).

7.6 Edit B/F
UI: Edit button on Previous Term Balance B/F row. Flow:

Click → inline input

Enter value → Save → feeSaveBF(pin)

If paid > 0 → confirm dialog

updateLearnerTermSnapshot({ balance_bf: String(newVal) })

feeRecomputeSnapshot — uses new B/F

Modal re-renders

Handles explicit 0 correctly (fixed 05ef0fe).

7.7 Advance term
UI: Terms tab → Set Active Term. Flow:

Confirm dialog

activateTerm(id, label)

getActiveTerm() → prevTerm

setActiveTerm(id) writes to terms.is_active

getActiveTerm(true) → newTerm (force refresh)

prepareTermData(prevTerm, newTerm) — copies schedule + backfills B/F

loadTerms() re-renders

⚠️ NOT creating learner_terms rows for new term. Only backfills existing. If rows don't exist, learners show ₦0 in new term until manually reconciled.

7.8 Print Uncleared Learners report
UI: Learners module → "Print Uncleared" button. Flow:

Click → printUnclearedList()

Fetch all learners (listLearners)

For each: getLearnerTermFor(id, active term_type, year) → check balance_cf > 0

Filter to uncleared

Sort by class, then name

Build A4 landscape HTML table (name, class, parent, phone, balance)

Open new window, auto-print

No caching — reads live data every print.

8. KNOWN REMAINING BUGS / DEFERRED WORK
8.1 LOCKED branch missing registration_fee
Location: resolveLearnerFeePicture LOCKED branch (app.js ~line 792–842)

Bug: netBills in LOCKED branch does NOT include registration_fee. If a learner has any payment, registration_fee won't count.

Fix: add reg to the sum, similar to UNLOCKED fix (07d2dd7).

Impact: low — only affects learners who have paid AND have registration_fee enabled.

8.2 prepareTermData doesn't create rows
Location: app.js ~line 5416

Bug: only backfills B/F on EXISTING learner_terms rows. Does not create rows if they don't exist.

Impact: medium — after term advance, learners without existing rows show ₦0 until manually entered.

Fix option: add upsert logic that creates learner_terms rows with schedule values + B/F.

8.3 B/F edit doesn't upsert row
Location: feeSaveBF in app.js ~line 1564

Bug: updateLearnerTermSnapshot does UPDATE only. If row doesn't exist, UPDATE matches 0 rows, returns ok({updated: true}) (silent success), value not saved.

Fix: use upsertLearnerTermSnapshot (method exists in supabase-client.js after 839, but not called here).

8.4 Status page is shallow (4 checks)
Location: openStatusPage in app.js ~line 1604

Current: 4 Supabase checks (Terms, Learners, Classes, Fee Schedule). Basic.

Planned v2: 4 stages

Stage 1: DATABASE (10 table checks)

Stage 2: DATA INTEGRITY (row counts, missing schedules, negative balances, duplicate PINs, orphans)

Stage 3: CONNECTIVITY (HTTPS, portal origin, internet)

Stage 4: APPLICATION (localStorage, cache state, session, JS bundles)

API methods exist in supabase-client.js (getRowCount, getNegativeBalances, getMissingFeeSchedules, getDuplicatePins, getOrphanLearnerTerms) — added but not yet wired into openStatusPage.

8.5 Historical 3rd Term 2025 payments not fully reconciled
Reported issue: some learners have debt from 3rd Term 2025/2026 that isn't reflected in 2026 1st Term records.

Current mitigation: manual B/F edit per learner.

Future: bulk SQL repair of learner_terms rows where balance_bf = 0 but previous term had balance_cf > 0.

8.6 Deferred features (from original handover)
Typing Class — offline CBT feature, separate system

Lesson Note Generator — not started

Digital Library — not started

Non-scanning ID cards — QR codes encode URLs without PIN, don't mark attendance

9. TESTING PROCEDURES
9.1 After every commit
Run 5 checks:

powershell
& node --check 'app.js' 2>&1
& node --check 'supabase-client.js' 2>&1
Write-Host "Lines: $((Get-Content 'app.js').Count)"
Select-String -Path 'app.js' -Pattern "â€|â†|Ã¢|Ã©|Ã¨|Â " | Measure-Object | Select-Object -ExpandProperty Count
# Expected: SYNTAX OK, SYNTAX OK, expected line count, 0 mojibake
9.2 Manual testing checklist
After any fee-related change:

□ Open unpaid learner → view modal → fees display correctly
□ Statutory items have "(statutory)" label + no X button
□ Optional items hidden by default
□ Add optional item → amount auto-fills from schedule → save → item shows + Net Bills increases
□ X optional item → item disappears + Net Bills decreases
□ Edit B/F → save → B/F displays correctly (including explicit 0)
□ Record payment → total_part_payment increases → balance decreases
□ Delete payment → total decreases → balance increases
□ If last payment deleted → learner becomes UNLOCKED
□ Print card (A4 + 80mm) → fee breakdown matches view
□ Print Uncleared report → shows correct learners + balances
After any term-related change:

□ Open 1st Term learner → view modal works
□ Open 2nd Term learner → view modal works
□ Advance 1st → 2nd Term → check DB for learner_terms rows (2nd Term)
□ Check balance_bf in 2nd Term matches 1st Term balance_cf
□ Revert to 1st Term → verify 1st Term data unchanged
9.3 Live site verification
Both servers (A: 192.168.0.81:3443, B: 192.168.0.28:3443):

Hard refresh (Ctrl+Shift+R) after each deploy

Check console for errors

Verify no visible mojibake

10. NEXT SESSION PRIORITIES
Ordered by impact:

Fix LOCKED branch missing registration_fee (5 min) — same fix as 07d2dd7 but for LOCKED

Fix feeSaveBF to upsert if row missing (15 min) — use upsertLearnerTermSnapshot

Add learner_terms row creation to prepareTermData (30 min) — critical for clean term advance

Full 4-stage status page (90 min) — API methods already exist

Bulk B/F repair for historical data (30 min) — SQL script

Payment revocation audit trail (60 min) — optional, add revoked_at columns

Typing tutor (1+ days) — separate offline CBT system

11. ENVIRONMENT
Item	Value
Server A	192.168.0.81:3443 (THE-IDEAL-SCHOOLS)
Server B	192.168.0.28:3443 (TIS-3)
Admin password	tis-admin
Links panel code	2026
Supabase project	ndsroviwrfjbgaucajri.supabase.co
Supabase anon key	sb_publishable_vEa5YAU8ac7pyhCiejkMtw_PMiLDuhI
GitHub repo	github.com/docayo/tis
Local clone	C:\Users\LENOVO\tis-portal
DB path (CBT)	C:\TIS-CBT\data\cbt.sqlite
Cert dir (CBT)	C:\TIS-CBT\certs\
B WinRM credential	%USERPROFILE%\B-cred.xml (on A)
VS Code	Installed 2026-10-25
PowerShell	5.1 (Windows 10)
12. COMMUNICATION PROTOCOL (next AI/session)
When working with this codebase:

Read this file completely before making any changes

Run diagnostics first — understand current state before patching

Use PowerShell here-strings for all multi-line blocks

Never use Set-Content for UTF-8 files — always [System.IO.File]::WriteAllText(..., UTF8Encoding($false))

Verify with node --check after every write

Verify line counts and anchors before and after assembly

One commit per logical change — never bundle unrelated fixes

Test on live site (192.168.0.81:3443) after every deploy

Check for mojibake after every write involving non-ASCII

Check git diff --stat — small change should be small diff (not 1000 lines)

If something is broken, git checkout -- <file> to revert to last committed state

Never git add -A without reviewing git status — untracked test files should not be committed

The user's expectation: efficient, decisive, no procrastination, no over-planning. Fix bugs directly. Test live. Move on.

The user's tolerance: zero for proposals to "defer to tomorrow". Everything must be solved in-session.

END OF HANDOVER