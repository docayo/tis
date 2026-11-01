
---

### 2026-11-01 — Online ↔ Offline Integration Complete

**Scope:** CBT (offline LAN server) extended into full bidirectional mirror of online portal. School can operate without internet; one-click pull/push syncs to cloud.

**CBT commits:** 4d736ac (baseline) → fe1501c (Phase 2 pull) → 1c4d03e (Phase 3 push) → e782d5f (Phase 4.5-6 learners/prospects/fees)

**Portal commits:** 5ddf504 (attendance filter) → 548f277 (Show Inactive attendance) → 1a7710d (remove reload) → 9b33653 (global toggle) → b48184e (ID card layout)

**Features delivered:**
1. Learner modal — click row, operator password, Profile A/B/C gated, Payment tab, 80mm print
2. Prospect flow — auto TIS### PIN, exam-capable immediately, Section B fees, per-sitting A4 print, Add to Class
3. Fee Schedule notice board — 26 classes → 11 grouped bills, A4 print, bank footer
4. Chat ringtone presets — beep/chime/pulse, per-device localStorage, bell button, vibration
5. Exited learners global filter — yellow toggle, applies to all panes
6. ID card — banner/passport overlap, QR bottom margin regained (confirmed on 2 devices)
7. Upload regex fix — Excel bulk question upload works

**Testing:** 12 features confirmed end-to-end. Payment record → push → verified in Supabase. Prospect created → sat CBT exam → admitted → appeared in Learners pane. Fee schedule printed with correct groups.

**Pending:** chat ringback + end propagation (helpers added), Collectibles pane (Phase 7), Server B deploy (Phase 8), www.tis.ng domain + push notifications for closed browser.
