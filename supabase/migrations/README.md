# Database migrations

The database changes in small numbered steps instead of one file that is edited forever.

| File | Adds |
| --- | --- |
| `0001_core_tables.sql` | `semester_data`, `user_state`, `events`, `schedule_changes`, `inbox`, their indexes and RLS |
| `0002_sync_state.sql` | `sync_state`, the heartbeat per automation |
| `0003_calendar_busy.sql` | `calendar_busy`, busy hours from the calendar |

## Rules

1. **Never edit a migration that already ran.** To change something, add the next number.
2. **Every migration is safe to run twice** (`if not exists`, `drop policy if exists`). No `drop table`.
3. **Every new table gets row-level security** with the `own_rows` policy in the same file.
4. After adding a migration, add the same change to `supabase/schema.sql`. That file is the full picture for a fresh project.
5. `node tests/migrations.test.js` checks rules 1-4 and runs in CI.

## Applying

Supabase → SQL Editor → paste the new file → Run. A fresh project can paste all of `schema.sql` once instead.
Apply to a staging project first when one exists, and only then to production.
