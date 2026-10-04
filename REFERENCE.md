# TIS EMIS — REFERENCE

**Companion to:** `HANDOVER.md` (current state) and `HISTORY.md` (session log).
**Last updated:** 4 October 2026

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
