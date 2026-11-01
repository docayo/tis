
---

## CBT Offline Mirror — Schema Reference (2026-11-01)

### learner_terms_local — mirror of cloud learner_terms
| Column | Type | Notes |
|---|---|---|
| learner_id | INTEGER | FK learners_local.id |
| term_type | TEXT | '1st' / '2nd' / '3rd' |
| year | INTEGER | |
| bill, tuition, scholarship, founders_scholarship, additions | REAL | Fee lines |
| other_bills_major, other_bills_minor, books, uniform, sportswear, waist_coat, tie | REAL | Item lines |
| extra_lesson, special_lesson, registration_fee | REAL | |
| balance_bf, balance_cf, total_part_payment | REAL | |
| part_payment_1..5_date / amount | TEXT / REAL | Up to 5 payments |
| cleared, clearance | TEXT | |
| sync_state | TEXT | synced / pending |
Primary key: (learner_id, term_type, year)

### fee_schedule_local — mirror of cloud fee_schedule
Primary key: (class_name, term_type, year). Mirrors cloud fee_schedule columns.

### portal_sync_queue — pending write queue
| Column | Type |
|---|---|
| id | INTEGER PK |
| entity | TEXT (learner / prospect / collectible_item / collectible_tick / payment / balance_adjust) |
| entity_local_id | INTEGER |
| entity_remote_id | INTEGER (null if not yet pushed) |
| action | TEXT (create / update / upsert / delete) |
| payload | TEXT (JSON) |
| created_at | TEXT (ISO) |
| pushed_at | TEXT (null = pending) |
| push_error | TEXT |

### learner_counter — TIS### PIN generator
1 row: (id=1, next_number=180). Next new learner gets TIS0180.

### learners_local — new columns 2026-11-01
- is_prospect (1 = prospect, excluded from Learners pane; 0 = real learner)
- date_of_withdrawal
- class_at_withdrawal

### prospects_local — key additional columns
- linked_learner_id — FK to learners_local.id (created at prospect creation)
- sync_state, updated_by

Status values: new / enrolled / admitted / declined

### Sync endpoints
- POST /api/portal/pull — response: {ok, pulled:{learners, terms, prospects, items, ticks, fee_schedules}}
- POST /api/portal/push — response: {ok, pushed, failed, details:[{id, entity, action, ok, remote_id, error}]}
- GET /api/portal/health — {ok, version, queue_pending, last_pull_at, last_push_at}

### Environment variables (C:\TIS-CBT\.env)
- SUPABASE_URL = https://ndsroviwrfjbgaucajri.supabase.co
- SUPABASE_SERVICE_KEY — service role JWT (pull/push use this)
- SUPABASE_ANON_KEY — public anon
- CBT_ADMIN_PW — admin password (default tis-admin)
- CBT_OPERATOR_01_PW — Operator 01 password for Section C unlock
