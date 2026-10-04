# TIS EMIS — MASTER HANDOVER

**Project:** The Ideal Schools — Operational Portal & Databank
**Owner:** Dr Ayoola Gabriel Ololade FCIA. NIIA — ayonio@gmail.com — 08067071557
**Last updated:** 4 October 2026

---

## HOW TO USE THIS DOCUMENT

This file is the **entry point** for any new developer or AI taking over
the project. It is deliberately short. Read it first.

After reading this file, consult:

- **`REFERENCE.md`** — database schemas, `app.js` section map,
  `supabase-client.js` method list, absolute rules, coding conventions.
  Read it once when you start. Consult it when you need detail.

- **`HISTORY.md`** — the session-by-session log of how the project got
  here. Read it if you need to understand why something is the way it is.
  Never confuse it with current state.

**The rule:** current state lives here. Architecture lives in
REFERENCE. History lives in HISTORY. Never mix them.

**Live copies:**
- https://tis-tan.vercel.app/handover
- https://raw.githubusercontent.com/docayo/tis/main/HANDOVER.md
- https://raw.githubusercontent.com/docayo/tis/main/REFERENCE.md
- https://raw.githubusercontent.com/docayo/tis/main/HISTORY.md

---

## PART 0 — EMERGENCY CARD

If something is broken and you need the portal back up fast.

### Where things live

| Asset | Location |
|---|---|
| Live portal | `https://tis-tan.vercel.app` |
| Recovery page | `https://tis-tan.vercel.app/rec` |
| Handover (this doc) | `https://tis-tan.vercel.app/handover` |
| Public results page (in build) | `https://tis-tan.vercel.app/check` |
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

State as of 4 October 2026.

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
    School + ministry logos, GTB badge, stamp on back.
13. **QR** — `/g/<token>` staff gate QR. `/s/<code>` per-person
    card QR. Learner → attendance. Staff → smart clock flow.
    Visitor → check-in/out. Auto-close after 7 seconds.
14. **Broad Sheet & Scores** — Download Template (scoped to
    Class / Subject / School / Student). Upload Filled File
    (importer with conflict modal). Auto-assign after import.
15. **Recovery system** — `/rec` page + Edge Functions + Resend
    + 9 sealed backup codes in the safe.

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

Full schemas in `REFERENCE.md`.

### What is pending

| # | Item | Priority |
|---|---|---|
| A | Public results page `/check` | Highest |
| B | Report card parity with PDF samples | High |
| C | Shared `report-render.js` | High — unblocks A and B |
| D | Fees module | Medium |
| E | Deactivate/reactivate learners | Medium |
| F | Delete duplicate learners | Medium |
| G | Audit log UI + full write-path wiring | Medium |
| H | Learner Collectibles tab | Low |
| I | Offline report generation + upload | Later |
| J | Digital library (staff and learner) | Later |
| K | Offline CBT app upload | Separate project |

Detailed scope for each in `HISTORY.md`.

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

### Class list (26, in academic order)

CRECHE · STARTERS · BEGINNERS · NURSERY 1 · NURSERY 2 · NURSERY 3
· BASIC 1 · BASIC 2 · BASIC 3 · BASIC 4 · BASIC 5
· JSS 1 · JSS 2 · JSS 3
· SS 1 SCIENCE · SS 1 ART · SS 1 HUMANITIES · SS 1 BUSINESS
· SS 2 SCIENCE · SS 2 ART · SS 2 HUMANITIES · SS 2 BUSINESS
· SS 3 SCIENCE · SS 3 ART · SS 3 HUMANITIES · SS 3 BUSINESS

---

## PART 2 — WHAT TO DO NEXT

### Phase A — Public results viewer (`/check`)

The single most valuable remaining feature. Parents and students
view their own report card by PIN, without login.

Deliver in four steps:

1. `check.html` and `check.js` — PIN input, learner lookup,
   "Welcome, <Name>" banner. No portal code loaded.
2. Extend `report-render.js` (see Phase C) so public and internal
   pages render identically.
3. Clearance gate — if `learner_terms.cleared != 'Yes'`, score
   cells show `—` with overlay: *"TIS Payment Policy — please
   pay your outstanding balance to view this result. Contact the
   school office."*
4. `results_views` audit table — log every public lookup.

### Phase B — Report card parity

Match `SAMPLE TERMLY REPORT CARD.pdf` and
`SAMPLE CUMULATIVE REPORT CARD.pdf` exactly. Missing pieces:

- Psychomotor column (10 ratings) from `report_ratings.ratings`.
- CLASS AVG / H.S. / L.S. columns per subject.
- Stamp image (`TISAssets/stamp and signed.gif`).
- QR code on the report card → `/check/<PIN>`.
- Bar chart (subject totals, coloured by grade).
- Auto term selection (1st/2nd → termly, 3rd → sessional).
- Comments from `report_ratings` with `{first}` filled.

### Phase C — Shared renderer

Extract the whole render pipeline from `[S22]` into
`report-render.js`, loaded by both `index.html` and `check.html`.
Expose on `window.TISReport`.

### Phase D — Fees, learner lifecycle, audit

- Fees module: class-wide bills + per-learner adjustments.
- Deactivate/reactivate learners.
- Delete duplicate learners.
- Audit log UI + full write-path wiring.

### Phase E — Later phases

- Offline report generation.
- Digital library.
- Offline CBT app integration.

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

When starting a new AI conversation, paste this:
