# Reliability targets and monitoring

A personal tool still deserves a stated target. Writing it down is what turns "it usually works" into something that can be measured and defended.

## Who depends on what

The student opens the app in the morning and trusts that the deadlines and schedule changes in it are current. The failure that matters is not a crash, it is **stale data nobody knows is stale** ([ADR 0003](decisions/0003-heartbeat-for-silent-failures.md)).

## Service level indicators and objectives

| Indicator | Measured from | Objective |
| --- | --- | --- |
| Moodle data freshness | `sync_state.last_success` for `1-moodle-sync` | Never older than 12 hours (the nightly gap is 9) |
| Morning brief delivered | `inbox` row with `brief` key for today, or `last_success` of `3-briefs` | By 09:00 on 95% of days |
| Reminders delivered | `last_success` of `4-reminders` | Never older than 30 hours |
| Duplicate messages | `unique (user_id, dedupe_key)` | Zero, enforced by the database |
| Silent failure | A stale or failing automation with no visible warning | Zero. The app shows a warning, and GitHub emails on a failed run |

The thresholds live in `SYNC_MAX_HOURS` in [logic.js](../js/logic.js): Moodle 12, email 10, briefs 30, reminders 30, calendar 3 hours. They are values to tune from experience, not facts.

## Layers of detection

| Layer | Catches | Misses |
| --- | --- | --- |
| Heartbeat in the app | A run that fails and a run that never happened | Supabase itself being down: the heartbeat lives in the same database |
| `uptime` workflow, from GitHub | Supabase paused or unreachable, the demo site down | Stale data while the project is up (that is the heartbeat's job) |
| One inbox alert per day per automation | Repeated failure, without a flood | Failures before the first alert |
| GitHub email on a failed run | Crashes and bad secrets | A disabled schedule (GitHub pauses scheduled workflows after 60 days of repository inactivity) |
| Manual failure drill (`drill` input, [runbook](RUNBOOK.he.md)) | That the alert path still works | Nothing automatic |

## Outside check

Monitoring that lives inside the system it watches fails with it. A paused Supabase project (it has happened) silences the heartbeat and the app too. The `uptime` workflow ([.github/workflows/uptime.yml](../.github/workflows/uptime.yml)) runs every 6 hours on GitHub, requests the demo page and the Supabase auth health endpoint, and fails the run when either does not answer. GitHub then emails the owner.

To switch on the Supabase half, add the repository secret `SUPABASE_ANON_KEY` (the publishable key already in `js/config.js`). Until it exists the check skips with a notice and only the demo page is checked.

Limits: GitHub may delay a scheduled run by minutes, and it pauses scheduled workflows after 60 days without repository activity, so this is a safety net, not a guarantee.

## Error budget

Taking 12 hours as the freshness limit and a 3-hourly sync, a month of 30 days allows roughly one stale day before the objective is missed. Spend a stale period on fixing the cause, not on raising the limit.

## Review

Look at the heartbeat table once a month: `select source, last_success, failures from sync_state;`. If `failures` keeps growing for one source, add a row to the runbook table.
