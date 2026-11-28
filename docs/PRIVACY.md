# Privacy and data handling

The data is a student's grades, schedule and deadlines. It is not special-category data, but it is personal, so it is treated as private by default. Israeli privacy law and the GDPR (if students from the EU ever use it) point to the same basics: collect little, say what you hold, let people see it, take it with them and delete it.

## What is stored, and where

| Data | Where | Why |
| --- | --- | --- |
| Courses, grade components, session rules | `semester_data` (Supabase), or the local file | The schedule and the planner |
| Marks, grades, notes, settings | `user_state` (Supabase) and the browser's `localStorage` | The student's own progress |
| Deadlines from Moodle | `events` | Planning |
| Schedule changes | `schedule_changes` | Keeping the timetable current |
| Busy hours from the calendar | `calendar_busy` | Subtracting booked time from free time. **Hours only. Titles, attendees and locations are never read.** |
| Run times and error codes | `sync_state` | Detecting silent failure. No content. |

Not stored: passwords, email bodies (the email workflow reads them to extract a change, keeps only the extracted fields and a message id, and is currently off), calendar titles.

## Who else sees it

| Party | What it receives | Note |
| --- | --- | --- |
| Supabase | All rows above | Hosting. Row-level security keeps each user to their own rows. |
| GitHub | Code, and run logs | The repository and its logs are public, so logs carry counts and error codes only. A lint rule blocks `console.log` in the shared code. |
| Anthropic API | Email text and the course list | Only when the email workflow is on. It is off. |
| Google | An OAuth read-only calendar token | Only when calendar sync is on. |
| jsDelivr | The visitor's IP address, when the Supabase library loads | Pinned with a subresource integrity hash. Fonts are self-hosted, so Google receives nothing. |

## Rights, and how each is met

| Right | How |
| --- | --- |
| See my data | The app shows all of it. Each table can also be exported as CSV from the Supabase table editor. (`npm run export` only writes the demo data.) |
| Take it with me | Settings → "ייצוא גיבוי" downloads everything the browser holds as JSON. |
| Delete it | Deleting the user in Supabase (Authentication → Users) removes every row, because each table references `auth.users` with `on delete cascade`. Clearing site data removes the local copy. |
| Correct it | Editing in the app, or the data file. |
| Know what is collected | This page. |

## Rules for changes

1. A new table has `user_id`, row-level security and a line in the table above, in the same pull request.
2. A new integration reads the least it can (the calendar rule above is the model) and ships off by default.
3. Public logs never contain content. The test suite checks the existing workflows.
4. Real data is never committed. `data/my-semester.js`, `js/config.js` and `automations/.env` are git-ignored.

## Not done

- No in-app "delete my account" button. Deletion is a manual step in Supabase, which is fine for one user and must change before there are more.
- No retention rule: old `inbox` and `events` rows stay until deleted. A scheduled cleanup at the end of each semester would be the simple fix.
- The Supabase library still loads from a CDN, even in demo mode. Bundling it, or loading it only when cloud is configured, would remove the last third-party request.
