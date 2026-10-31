# TIS EMIS — Handover

**Live URL:** https://tis-tan.vercel.app/ (Vercel production)
**Repo:** https://github.com/docayo/tis (`main` branch)
**Local clone:** `C:\Users\LENOVO\tis-portal`
**Deployed HEAD as of 2026-10-31:** `4467f04`

---

## Session 2026-10-31 — fee display and term-advance pipeline

Ten commits landed today. All verified live. In order:

| SHA | What |
|---|---|
| `6f5ca15` | FIX1–4: LOCKED learners read live fee picture + recompute after saves |
| `a89295d` | FIX5A/5B: other_bills_minor is1st gate; snapshot/display alignment |
| `9fbae0b` | Founders Scholarship support in resolve + recompute |
| `5e46cba` | Term view: Founders ₦ + Total Schol. ₦ columns |
| `5ddf68c` | §8.2/§8.3: prepareTermData creates rows; feeSaveBF uses upsert |
| `2c4e6c6` | prepareTermData: log advanceTermFees return value; warn on failure |
| `d0249b6` | advanceTermFees: remove notes NULL, add copySchedule option |
| `5f52268` | upsertLearnerTerm insert path fix (term_label/class_name NOT NULL) |
| `d0249b6` | advanceTermFees: copySchedule option (see above) |
| `4467f04` | advanceTermFees: adjInsertRow undeclared (strict ReferenceError) |

---

## Current data state (verified 2026-10-31)

**1st term 2026/2027 — active term, in production:**
- `fee_schedule.tuition` increased per class group: +₦5,000 (Creche→Basic 2), +₦8,000 (Basic 3→5), +₦10,000 (all secondary)
- `learner_terms.founders_scholarship` = matching per-class amount for all 179 learners (1st term only)
- Net effect for parents: tuition up + Founders down = same net bill as before the increase
- All 179 learners: `learner_terms.bill` synced via bulk recompute

**2nd term 2026/2027 — pre-seeded, inactive:**
- 26 `fee_schedule` rows (copied from 1st)
- 39 `fee_adjustments` rows (₦446,000.01 total — personal scholarships carried)
- 179 `learner_terms` rows (B/F = 1st term C/F)
- Founders = 0 (correct — off for 2nd/3rd term)
- TIS0224 verified: tuition 35,000 − scholarship 12,000 − founders 0 = bill 23,000; B/F 62,500 → C/F 85,500

**3rd term 2026/2027 — pre-seeded, inactive:**
- 26 `fee_schedule` rows (copied from 2nd)
- 39 `fee_adjustments` rows (₦446,000.01 — personal scholarships carried forward)
- 179 `learner_terms` rows (B/F = 2nd term C/F)
- Founders = 0
- TIS0224 verified: tuition 35,000 − scholarship 12,000 − founders 0 = bill 23,000; B/F 85,500 → C/F 108,500

**1st term 2027/2028 — empty, awaiting admin preparation:**
- 0 `fee_schedule` (admin must set up new-year prices)
- 0 `fee_adjustments`
- 0 `learner_terms`
- Year-advance test cleaned up after verification. `advanceTermFees({copySchedule: false})` confirmed working — copies fee_adjustments only, skips fee_schedule.

---

## Term-advance behavior — verified end-to-end

| Path | Behavior |
|---|---|
| **1st → 2nd** same year | Copies fee_schedule (26) + fee_adjustments (39). Creates learner_terms with B/F from prev C/F |
| **2nd → 3rd** same year | Same as above |
| **3rd → 1st** year advance | **Only** copies fee_adjustments (39). Fee_schedule untouched — admin sets up new-year fees separately. Creates learner_terms with B/F |
| Founders scope | Only 1st term 2026/2027. Zero on 2nd/3rd and future 1st terms (unless admin explicitly sets) |
| Personal scholarship | Carries every term and across years (39 learners, ₦446,000.01 same cohort) |

**Runtime for advance:** ~250s for 179 learners (sequential API calls). School should be told: click "Set Active" and don't touch the browser for 4–5 minutes until the done toast appears.

---

## Verification rules (hard-won this session)

1. Any test that calls `resolveLearnerFeePicture` must use `select=*` on `learner_terms` — partial selects flip LOCKED/live branch and produce false MISMATCH.
2. Never use `new RegExp` with backslash patterns through PowerShell — use `.includes()`.
3. Every saved `.ps1` needs byte-count verification BEFORE running. Truncated pastes are silent — `powershell -File` produces no output when it succeeds with a stub.
4. `.ps1` files with UTF-8 no BOM trigger codepage trap on PS 5.1 if they contain any byte >127 — sanitize to ASCII before running.
5. `[System.IO.File]::*` requires absolute paths — `Set-Location` doesn't affect the process working directory.
6. Internal functions (`feesLoadAdjustments`, `feeRecomputeSnapshot` internals) are NOT on `window` — verify by fetching `/app.js` and grepping content instead.
7. **Paste target discipline:** PowerShell commands → PowerShell terminal. JS blocks (start with `(async` or `console.log`) → browser DevTools console (F12). Python file content → never paste directly; write to disk via PowerShell here-string first. Getting this wrong three times this session cost ~1 hour.
8. **Test the actual write path before commit** — syntax check only catches parse errors, not runtime failures (`adjInsertRow` undeclared passed `node --check` but failed at runtime).
9. Check return value of `advanceTermFees`, not just try/catch — returns `{ok:false,error:...}` on failure, doesn't throw.

## Order rule for DB + code changes

**Code first, DB second.**
1. Patch → verify → commit → push → confirm deploy live (fetch `/app.js` marker)
2. **Then** apply DB change
3. Never DB first — we created a real production exposure window this session by applying fee_schedule first, before the code that reads it was deployed.

---

## Next session open items

| § | Item | Priority |
|---|---|---|
| — | Optimize `prepareTermData` runtime — batch `upsertLearnerTerm` into single SQL insert (250s → ~3s) | Medium (blocks UX when admin advances) |
| §8.4 | Status page checks shallow | Low |
| §8.5 | Historical 3rd-term 2025/2026 debt reconciliation | Medium (needs school input) |

**Not blocking** — the school can advance terms whenever ready. Advance-day checklist:

1. Admin sets up `1st 2027` `fee_schedule` for all 26 classes
2. Admin promotes learners (updates `learners.class_name`)
3. Admin clicks "Set Active" on 1st 2027
4. Wait 4–5 minutes (don't refresh browser)
5. Console log confirms: `[prepareTermData] advanceTermFees OK - mode=year(adj-only) classes=0 adj=39` + `created=179 failed=0`

If anything fails, the toast (`Warning: fee advance failed - ...`) + console log surface it immediately.

---

## Test URLs (verified working)

- Production: https://tis-tan.vercel.app/ (append `?v=<timestamp>` for cache-bust)
- Supabase project: `ndsroviwrfjbgaucajri.supabase.co`
- Anon key in `supabase-client.js` (public)

**Deploy trigger:** `git push origin main` → Vercel auto-deploys in 30–60s. Confirm live via `fetch('/app.js?_=' + Date.now())` + `.includes(marker)` before trusting.