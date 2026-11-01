Set-Location C:\TIS-CBT
$md = @'
# TIS EMIS — Handover

**Last updated:** 2026-11-01
**Owner:** Dr Ayoola Gabriel Ololade FCIA, NIIA

---

## 1. What this system is

**The Ideal Schools Educational Management Information System** — a two-tier school operations platform:

### Tier 1 — Online cloud portal
- **Live:** https://tis-tan.vercel.app/ (moving to `www.tis.ng` when domain is ready)
- **Backend:** Supabase (`ndsroviwrfjbgaucajri.supabase.co`)
- **Purpose:** Authoritative cloud record — learners, staff, fees, results, attendance, ID cards, chat, CBT exam
- **Repo:** https://github.com/docayo/tis → `main` branch
- **Deploy:** auto on `git push origin main` → Vercel in 30-60s

### Tier 2 — Offline LAN CBT server
- **Dev:** `C:\TIS-CBT` on Server A (laptop)
- **Prod:** `C:\TIS-CBT` on Server B → `https://192.168.0.28:3443`
- **Backend:** SQLite (`data/cbt.sqlite`)
- **Purpose:** Works without internet — mirrors core portal data, lets school operate on LAN during outages
- **Auth:** `X-Admin-Password: tis-admin` (single shared admin password)
- **Deploy:** `push-to-b.ps1` over WinRM (needs TrustedHosts on Server A)

---

## 2. The online ↔ offline integration (built 2026-11-01)

The CBT server is now a **bidirectional mirror** of the online portal for the school's critical operating data. Every page works offline. Cloud sync is explicit (operator clicks buttons).

### What's mirrored
| Entity | Direction | Table (local) | Table (cloud) |
|---|---|---|---|
| Learners | ⇅ pull + push | `learners_local` | `learners` |
| Learner terms (fees) | ⇅ pull + push | `learner_terms_local` | `learner_terms` |
| Prospects | ⇅ pull + push | `prospects_local` | `prospective_learners` |
| Collectible items | ⇅ pull + push | `collectible_items_local` | `collectible_items` |
| Collectible ticks | ⇅ pull + push | `collectible_ticks_local` | `collectible_ticks` |
| Fee schedule | ↓ pull only | `fee_schedule_local` | `fee_schedule` |
| Attendance (learner) | ⇅ separate | `attendance_learner_local` | `attendance_learner` |
| Attendance (staff) | ⇅ separate | `attendance_staff_local` | `attendance_staff` |
| Chat | local only | `chat_*` tables | (not mirrored) |

### How sync works

**Pull** (cloud → local):
- Operator clicks floating green "Pull from Portal" button (any page)
- CBT fetches all entities in parallel from Supabase
- Transactional upsert into SQLite — 1 round trip, ~45s for 179 learners + 685 terms + 78 fee schedules
- Any row with pending local changes (in `portal_sync_queue`) is **skipped** — offline edits preserved
- No internet → operator sees toast "Pull failed: no connection"

**Push** (local → cloud):
- Operator clicks floating gold "Push to Portal" button
- Shows red badge with pending count (auto-updates every 30s)
- CBT reads `portal_sync_queue` FIFO, sends each row to Supabase
- Success → `pushed_at` set, row removed from queue
- Failure → `push_error` set, row stays in queue for retry
- Response: `{ok, pushed: N, failed: M, details: [...]}`

**No auto-sync.** Nothing leaves the CBT without a button click. This is a design decision — school controls when data goes to cloud.

### Learner lifecycle across both tiers

1. **Prospect created offline** → gets unique TIS### PIN, learner row created with `is_prospect=1`
2. **Prospect sits CBT exam** → works (same PIN, same table)
3. **"Add to Class" clicked** → `is_prospect=0`, prospect becomes real learner
4. **Push to Portal** → learner row + prospect update both sent to Supabase, learner ID remapped to portal's ID
5. **Portal now shows this learner** — same TIS### PIN, same fees, same identity

---

## 3. Today's commits (2026-11-01)

### CBT repo (`C:\TIS-CBT`)
| Commit | Description |
|---|---|
| `4d736ac` | Baseline: pre-Phase-1 CBT state (init git) |
| `fe1501c` | Phase 2: portal-sync routes — pull + 5 read endpoints |
| `1c4d03e` | Phase 3: portal-sync write endpoints + push + queue |
| `e782d5f` | Phase 4.5–6: learners, prospects, fee schedule, sanitizer, upload regex |

### Portal repo (`C:\Users\LENOVO\tis-portal` → Vercel)
| Commit | Description |
|---|---|
| `5ddf504` | Fix attendance register — filter sees `class_at_withdrawal` + `exit_reason` |
| `548f277` | Show Inactive toggle — extended to attendance, persists across pages |
| `1a7710d` | Remove cross-page attendance reload — no more "Pick a class first" toast |
| `9b33653` | Show Inactive toggle — applies globally (learners, attendance, fees, broadsheet, ID cards, results) |
| `b48184e` | ID card: remove divider, passport overlaps into banner, ~112px bottom space gained |

---

## 4. Features added today (2026-11-01)

### CBT offline portal — 6 phases completed

**Phase 1** — Schema migrations (additive only, backup-first):
- `learner_terms_local` — full fee history mirror
- `fee_schedule_local` — class bills for offline display
- `prospects_local` + `linked_learner_id` column
- `collectible_items_local` + `collectible_ticks_local`
- `portal_sync_queue` — pending-change tracker
- `learner_counter` — auto TIS### PIN
- `is_prospect` flag on `learners_local`

**Phase 2** — Read endpoints (`routes/portal-sync.js`):
- `GET /api/portal/health`
- `GET /api/portal/status`
- `GET /api/portal/learners` (filters `is_prospect=1` by default; `?includeProspects=1` opts in)
- `GET /api/portal/prospects`
- `GET /api/portal/collectibles`
- `GET /api/portal/terms/:learnerId`
- `GET /api/portal/fee-schedule/:className`
- `GET /api/portal/fee-schedule-all`
- `POST /api/portal/pull`

**Phase 3** — Write endpoints (`routes/portal-sync-write.js`):
- `PUT /api/portal/learners/:id`
- `POST /api/portal/prospects` — auto TIS### PIN + learner row
- `PUT /api/portal/prospects/:id` — edit + enroll + admit + decline
- `PUT /api/portal/tick` — collectible mark
- `POST /api/portal/collectible-item`
- `POST /api/portal/payment` — record part-payment
- `PUT /api/portal/balance-adjust` — override B/F (for internal corrections)
- `POST /api/portal/verify-operator01` — Section C gate
- `POST /api/portal/push` — process queue

**Phase 4.5** — Learner modal (`public/admin-portal.js`):
- Click any learner row (in `pane-learners`) → operator password prompt
- Modal with 3 tabs: Profile / Payment / Print Learner Card
- **Profile tab:**
  - Section A — Identity (all fields editable)
  - Section B — Fees (bill breakdown, payment history, balance C/F, read-only)
  - Section C — History & Origin — **locked by default**, "Unlock (Operator 01)" button asks for `CBT_OPERATOR_01_PW`
- **Payment tab:** record ₦500 test → refund tested → verified in Supabase
- **Print tab:** 80mm thermal format (matches online exactly)
- Copy/cut/right-click disabled on modal
- Auto-reset operator unlock on modal close

**Phase 6** — Prospect flow:
- Prospect auto-gets **TIS###** PIN (not TISP###)
- Creates learner row with `is_prospect=1` → **can sit CBT exam immediately**
- Section A + Section B (fees from `fee_schedule_local`) visible
- Test Results tab (from CBT `sittings` table) with per-paper A4 print
- **"Add to Class"** button → `is_prospect=0` → learner appears in Learners pane
- Legacy TISP prospects still admitted via fallback (creates learner at admit time)

**Fee Schedule notice board:**
- Floating purple button (bottom-right of every admin page)
- A4 print with classes grouped by identical bill (e.g. 26 classes → 11 cards)
- Bank footer with 4 school accounts (GTBank / Opay / Polaris / Jaiz)

**Sanitizer:**
- `sanitizePortalFloat()` runs on boot + every 3s
- Removes stray `[object HTMLDivElement]` text nodes from `#portal-float`
- Self-healing against future broken patches

**Upload regex fix:**
- `admin-upload-v2.js:71` — `/^[A-D]\.test(ans)/` → `/^[A-D]$/.test(ans)`
- Fixes Excel bulk question upload SyntaxError

### Portal fixes — today

**Exited learners global filter:**
- Yellow bar on Learners pane: "Show exited learners (inactive)"
- Persists via `localStorage` key `tis_showInactiveLearners`
- Applies to: learners list, attendance register, fees register, broadsheet scope, results, ID cards
- Prospect rows are separately excluded (`is_prospect=1`)

**ID card layout (canvas, [S21] section):**
- Removed divider line between logo row and passport
- Passport photo Y position moved up — overlaps 25% into banner (between S and M logos)
- Name-to-identity gap tightened from `h*0.052` to `h*0.040`
- **~112px bottom space gained** — QR no longer touches bottom border
- Confirmed working on second device

### Chat improvements — today

**Ringtone system:**
- Web Audio API oscillator (no external files)
- 3 presets: **Beep** (900Hz) / **Chime** (dual-tone 1200+800Hz) / **Pulse** (triple 1500Hz triangle)
- Per-device selection via `localStorage` `tis_ringtone_preset`
- Bell button (bottom-right of chat page) cycles preset + plays preview
- 30s auto-stop if caller gives up
- Vibration on mobile: `navigator.vibrate([400,200,400,200,400])`
- Auto-unlocks AudioContext on first user gesture

**Helper functions ready (not wired):**
- `startRingback()` / `stopRingback()` — caller-side ringback tone (440Hz, 1s on / 2s off)
- End-propagation logic pending

---

## 5. What's tested and working

| # | Feature | Verified |
|---|---|---|
| 1 | Learner modal → Profile A/B/C, C gated | ✅ TIS0224 |
| 2 | Payment record → push → Supabase updated | ✅ ₦500 test, cleaned |
| 3 | Print Learner Card 80mm + bank footer | ✅ |
| 4 | Prospect → Profile + Section B fees | ✅ TIS0277 (Test Sunday) |
| 5 | Prospect Test Results → A4 per-sitting | ✅ |
| 6 | "Add to Class" → learner visible + same PIN | ✅ |
| 7 | New prospect TIS### → CBT login | ✅ |
| 8 | Fee Schedule button → 11 grouped cards | ✅ 26 classes → 11 groups |
| 9 | Exited filter — 124 active / 55 hidden | ✅ All panes |
| 10 | Sanitizer — `[object HTMLDivElement]` gone | ✅ |
| 11 | ID card on Vercel — no divider, QR has margin | ✅ Confirmed on 2 devices |
| 12 | Ringtone presets — beep/chime/pulse | ✅ Beep audible |

---

## 6. What's pending (next session)

### Chat — 2 items (~30 min)
- **Ringback tone on caller** — helpers added, need to wire into `startVoiceCall` (start on "Ringing...") and audio-connect event (stop). Requires 1 function body extraction from `startCallPolling`.
- **End propagation** — when 1 side hangs up, other side ends. Requires wiring into `startCallPolling` (detect `active === null` → cleanup).

### CBT Collectibles (Phase 7, ~2-3 hrs)
- `pane-collectibles` currently placeholder
- Backend endpoints exist (`/api/portal/tick`, `/api/portal/collectible-item`)
- Need UI: items manager + per-learner checklist + push
- Mirror of online `[S07c] Collectibles` section

### Deploy CBT to Server B (Phase 8, ~2 hrs)
- WinRM push from A (`192.168.120.55`) to B (`192.168.0.28`)
- `push-to-b.ps1` exists — verify it copies new files
- Backup Server B DB before first push
- Rollback: `pull-from-b.ps1` to restore

### www.tis.ng domain (when live)
- Point Vercel custom domain to portal
- Configure Let's Encrypt cert
- Deferred: chat push notifications for closed browser (needs PWA + push service worker)

### Handover §10 carryovers
- **§8.4** — status page checks shallow (low priority)
- **§8.5** — historical 3rd Term 2025/2026 debt reconciliation (needs school input)

---

## 7. URLs and infrastructure

| Service | URL | Notes |
|---|---|---|
| Portal (cloud) | https://tis-tan.vercel.app/ | Auto-deploy on `git push origin main` |
| Portal (custom domain, pending) | https://www.tis.ng/ | When DNS + cert ready |
| CBT dev | http://localhost:3000 / https://localhost:3443 | Server A laptop, HTTPS for camera |
| CBT prod | https://192.168.0.28:3443 | Server B on school LAN |
| Supabase | `ndsroviwrfjbgaucajri.supabase.co` | Anon key in `supabase-client.js` |
| Supabase (service role) | in CBT `.env` as `SUPABASE_SERVICE_KEY` | Used by `/api/portal/pull` and `/api/portal/push` |

---

## 8. Rollback

**Portal (if a bad commit ships):**
```powershell
Set-Location C:\Users\LENOVO\tis-portal
git revert HEAD --no-edit
git push origin main