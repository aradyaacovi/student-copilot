# Architecture and design decisions

## Goals

1. Tell a student what to do next, with a reason.
2. Stay current without manual upkeep.
3. Keep personal academic data private by default.
4. Be simple enough to read end to end in one sitting.

## Components

| Part | Responsibility |
| --- | --- |
| `js/logic.js` | All domain logic as pure functions: session occurrences, pace, grades, the planner, the workload heatmap, spaced review, calendar export, merging remote changes |
| `js/app.js` | Rendering, events, local persistence, Supabase sync, the updates inbox |
| `supabase/schema.sql` | Five tables with row-level security |
| `automations/lib/*` | Moodle iCal parsing and course matching, email extraction and interpretation, brief and reminder builders, a thin PostgREST client |
| `automations/build.js` | Bundles `logic.js` and the libs into n8n Code nodes and writes the workflow JSON |

## Data model

- `semester_data`: one JSON document per user describing the semester (courses, grade components, recurring sessions, deadlines). The same shape as the local data file.
- `user_state`: what the student marked (watched, done, grades, notes, settings).
- `events`: deadlines discovered by automations, unique per `(user, source, external_id)` so re-syncs are idempotent.
- `schedule_changes`: cancellations, make-ups and moves, each with a `status` of `applied`, `needs_review` or `rejected`.
- `inbox`: briefs, reminders and alerts, unique per `(user, dedupe_key)` so a workflow that runs twice never duplicates a message.

Sessions are stored as recurrence rules (weekday, time, start date, cancellations, extras), not as a list of dates. Counts such as "4 lectures took place" are always derived, so one cancellation updates the pace tracker, the schedule and the plan at once.

## Decisions and trade-offs

### No framework, no build step
The app is a single HTML file with two scripts. It opens from the file system, deploys to any static host and has no dependency to keep updated. The cost is hand-written rendering with template strings and a full re-render on each change. That is acceptable at this size (one user's semester) and would be the first thing to revisit if the UI grew.

### One logic module shared by the browser and n8n
The risk in a system with a UI and background jobs is that they compute the same thing differently. Here the planner that orders the Today screen is the same code that writes the morning brief. n8n Code nodes cannot import local files, so `build.js` inlines the module. Workflow files are therefore build artifacts and are never edited by hand.

### Generated workflows, tested by executing them
`tests/automations.test.js` loads each generated workflow, extracts its code and runs it with fake `$env`, `$input` and HTTP. This catches integration errors (a wrong table name, a missing header, a broken bundle) without a network or an n8n instance.

### The model extracts, deterministic code decides
Free-text emails are a good fit for a language model; deciding what to change in someone's timetable is not something to leave to one. The model is given the course list and returns JSON constrained by a schema: course, change type, explicit date if any, group relevance, confidence. Code then applies fixed rules:

- A relative phrase such as "the next lecture" resolves to the next occurrence after the email's send time.
- A change aimed at another tutorial group is ignored.
- Low confidence, an unknown group for a tutorial, or a date that does not match a real session becomes `needs_review`, shown in the app with approve and reject buttons.

Email content is passed as data and the prompt states that instructions inside it must not be followed. The workflow has no ability to send email or modify anything outside its own tables.

### Offline first, cloud optional
The app is fully usable with a local data file and `localStorage`. Supabase adds cross-device sync and is the channel through which automations deliver updates. `applyRemote` merges remote events and changes into the base data without mutating it.

### Security model
Row-level security on every table restricts rows to `auth.uid()`. The browser uses the publishable key plus the user's session. Automations use the secret key and set `user_id` explicitly. The secret key is supplied through environment variables and never appears in the repository or in workflow files.

## The planner in detail

```
effort    = explicit hours, or a default by kind and grade weight
needDays  = ceil(effort / hoursPerDay)
slack     = daysUntilDue - needDays
bucket    = must (slack <= 0 or due within a day) | should (slack <= 3) | later
order     = ascending slack, ties broken by grade weight
today     = take items in order while capacity remains, max 2h per item
            (only real deadlines due within a day may exceed capacity)
```

Capacity is the time left until the day's end, minus remaining in-person sessions, capped at the student's daily study hours. Recorded lectures do not reduce capacity because they can be watched at any time.

Catch-up items come from the pace tracker. A lecture from the last week is due before the course's next tutorial. Anything older is backlog and is assigned synthetic due dates, two items per day, so it drains steadily.

## Known limitations

- Self-hosted n8n runs only while the machine is on; a missed schedule is not replayed.
- Moodle events are matched by course number in the category field, which is specific to how this university names courses.
- Effort estimates are heuristics. They can be overridden per task but are not yet learned from history.
- Single user in practice. The schema supports many users; onboarding does not exist yet.
