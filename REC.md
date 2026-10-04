# TIS EMIS — RECOVERY RUNBOOK
For project state and rules, see HANDOVER.md or /handover.
**Version:** 1.0
**Date:** 1 October 2026
**Owner:** Dr Ayoola Gabriel Ololade FCIA. NIIA
**Severity:** Read this if the portal is broken, data looks wrong, or you suspect unauthorised access.

---

## 1. Emergency contacts

| Role | Name | Phone | Email |
|---|---|---|---|
| Owner / First responder | Dr Ayoola Gabriel Ololade | 08067071557 | ayonio@gmail.com |
| Admin / Second responder | Dr Mrs Ayoola Oseyemi O | 08027270404 | oseyemio3@gmail.com |
| School office | The Ideal Schools | — | theidealschools15@gmail.com |
| Owner (alt) | — | — | dr_ayoola_gabriel@tis.ng |

**If Dr Ayoola is unreachable and the situation is critical, contact Dr Mrs Ayoola.**
**If both are unreachable, the recovery may proceed via the sealed codes in the school safe.**

---

## 2. Before doing anything — the 3-step check

Do this **before** touching anything. Nine times out of ten, the problem is one of these three:

### Step A — Is it just you, or everyone?

- Open `https://tis-tan.vercel.app` on **a different device** (a phone with mobile data, not school Wi-Fi).
- If it works there → the problem is your device or the school's network. Try a different browser, then a different network. Do NOT run any recovery.
- If it fails there too → continue to Step B.

### Step B — Is the portal up, or is Supabase down?

- Open `https://ndsroviwrfjbgaucajri.supabase.co` in a browser.
- If it shows a JSON response or a login page → Supabase is up.
- If it shows an error or times out → **Supabase is down.** Wait 10 minutes and check again. Supabase's status page is `https://status.supabase.com`. Do NOT run recovery while Supabase is offline.

### Step C — Is a specific record wrong, or is the whole database wrong?

- If a single learner's data looks wrong → **do not run recovery.** Use the portal's edit tools to correct it.
- If many records are wrong, or everything is missing → continue to Section 3.

---

## 3. The recovery key — required for EVERY recovery

**You cannot restore data without a recovery key.** This is intentional.

### How to obtain a key

1. Open `https://tis-tan.vercel.app/rec` (the recovery page).
2. Click **Send Recovery Key**.
3. A 6-character key is emailed to:
   - `theidealschools15@gmail.com`
   - `ayonio@gmail.com`
4. The key is valid for **30 minutes**. It cannot be reused.

### How to use a key

1. Open the email. Copy the 6-character key.
2. Return to `/rec`, paste the key into the field, and click **Verify**.
3. If valid, the recovery page reveals the step-by-step restore instructions.

### If email is unavailable

If neither of the two email accounts can be reached:
1. Open the school safe.
2. Retrieve the sealed envelope marked **TIS RECOVERY CODES**.
3. Any single code from that envelope works, once.
4. **After using one, mark it as spent and destroy it.**
5. Email the school address immediately to report which code was used and why.

### If a key was requested that you did not initiate

**Do not ignore this.** Someone may be attempting unauthorised recovery.
1. Immediately change your Supabase database password (Settings → Database → Reset Database Password).
2. Immediately rotate your Supabase anon key (Settings → API → Regenerate).
3. Change your GitHub password.
4. Change your Bitwarden master password.
5. Contact Dr Ayoola directly.

---

## 4. Where everything lives

| Thing | Where | Access |
|---|---|---|
| Supabase Dashboard | `supabase.com/dashboard/project/ndsroviwrfjbgaucajri` | Login in Bitwarden under **"TIS — Supabase"** |
| Supabase service role key | Bitwarden → **"TIS — Supabase Service Key"** | Bitwarden master password required |
| GitHub repo | `github.com/docayo/tis` | Login in Bitwarden under **"TIS — GitHub"** |
| Vercel dashboard | `vercel.com/dashboard` | Login in Bitwarden under **"TIS — Vercel"** |
| Google Drive (backups) | Folder: **"TIS Backups"** | Shared with the school email |
| School email | `theidealschools15@gmail.com` | Login in Bitwarden under **"TIS — School Email"** |
| Sealed codes | Physical school safe | Envelope marked **"TIS RECOVERY CODES"** |
| Nightly database backups | `tis-backups` repo (to be set up) | Login in Bitwarden |

**All passwords and access tokens are stored in Bitwarden.** If Bitwarden is unavailable, the sealed codes in the safe are the fallback.

---

## 5. Restore procedures

**Do NOT proceed to this section without a verified recovery key.**

### 5.1 Restore the database (learners, staff, attendance, scores, terms)

1. Open Supabase Dashboard → SQL Editor.
2. In a **new query tab**, run the diagnostic to see the current damage:
   ```sql
   select count(*) from learners;
   select count(*) from staff;
   select count(*) from attendance_learner;
   select count(*) from learner_terms;
