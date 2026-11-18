# Calendar write-back — design

Design note for the roadmap item *"Calendar write-back: schedule catch-up blocks into
free slots."* Nothing here is built yet. It records what the integration has to do,
what Google requires in return, and where it plugs into the existing modules.

## Why

The planner currently derives today's free hours from the timetable: in-person classes,
then everything until the day's end time is assumed available. That assumption is the
weakest input it has. A shift at work, a commute, a dentist appointment — none of it is
visible, so a plan can be correct on paper and impossible in practice.

Write-back closes the loop in both directions:

- **Read** the real calendar, so capacity reflects the actual day.
- **Write** the planned blocks back, so the plan exists where the day is already managed,
  including on a phone lock screen.

## The two directions

| Direction | Call | Feeds |
| --- | --- | --- |
| Read busy time | `freebusy.query` over the planning window | `buildPlan` capacity, replacing the day-end heuristic |
| Read classes | `events.list` on the primary calendar | optional: detect timetable drift against `courses[].sessions[]` |
| Write blocks | `events.insert` / `patch` on a dedicated calendar | the plan, visible outside the app |

## Scopes, and the trap worth avoiding

Google sorts OAuth scopes into three tiers, and the tier decides what shipping costs.

| Scope | Tier | Needed for |
| --- | --- | --- |
| `calendar.readonly` | Sensitive | reading busy time |
| `calendar.events` | Sensitive | creating and updating blocks |
| `calendar.app.created` | Sensitive | a calendar only this app can touch — worth checking whether it is sufficient on its own, since it is the narrowest write scope |
| `gmail.readonly` and the other Gmail scopes | **Restricted** | — |

Sensitive scopes require OAuth verification before public release: a reviewed consent
screen, a verified domain, a privacy policy, a demo video. Restricted scopes require all
of that **plus** a CASA security assessment through the App Defense Alliance, which has
to be renewed roughly every twelve months.

Two consequences for this project:

1. **Stay off Gmail scopes.** The email workflow already reads IMAP directly, which needs
   no Google scope at all. Asking for `gmail.readonly` to do the same job would move the
   whole project into the restricted tier for no new capability.
2. **Verification is deferrable, not avoidable.** While the app runs as a personal tool
   with a small set of test users, Google's testing mode needs no verification. The
   consent screen, privacy policy and verified domain only become blocking at public
   release — but they should be written before then, not after.

Scope classifications change. Check them against Google's current reference before
implementing, not against this table.

## Sync strategy

Reading a calendar correctly is mostly about not re-reading it.

1. **Initial full sync**, then store the returned `syncToken`.
2. **Incremental sync** on every later call, passing that token; store the new one from
   the last page.
3. **`410 Gone` means start over.** The token expired; discard it and run a full sync.
   This is expected behaviour, not an error to alert on.
4. **Watch channel plus polling.** `events.watch` pushes a notification containing only
   metadata, so the app still has to fetch the change. Channels expire and sometimes fail
   silently, so a 30-minute poll has to back them up — doubly so here, where n8n is
   self-hosted and a missed schedule is never replayed.
5. **Keep query parameters consistent.** A sync initialised with `singleEvents=true` must
   keep sending it; changing it mid-stream returns `400`.
6. **Writes are idempotent.** Every block carries a stable external id, and writing is an
   upsert. A workflow that runs twice must not produce two events.

## Where it fits

```
logic.js      buildPlan(..., busy)   ← new input: busy intervals. Still pure.
app.js        fetches busy time, renders
automations/  workflow 5: calendar sync, every 30 minutes
supabase/     sync_state (token, last success, failure count)
              block_events (block id ↔ Google event id)
```

`js/logic.js` stays pure: it receives `busy` as an argument and never fetches anything.
The planner's existing capacity calculation becomes "free windows minus busy intervals"
rather than "end of day minus classes". That is a change to one input, not a rewrite.

## Rules

- **Write to a dedicated calendar, never the primary one.** If the student deletes that
  calendar in Google, the app loses nothing.
- **Never modify or delete an event the app did not create.** The primary calendar is
  read-only to us, always.
- **A pinned block does not move** when the plan is rebuilt.
- **Stale means stop writing.** If sync has been failing, show that on screen and leave
  the calendar alone rather than writing a plan built on outdated availability.
- **Travel time is part of a block, not an afterthought.** Sessions already carry a
  `location`; an in-person class should reserve the trip around it.

## Open questions

- Does every planned item get an event, or only the "now" item and today's plan? Writing
  everything risks turning the calendar into noise the student stops reading.
- Should a block the student moves inside Google be read back as a preference, or
  overwritten on the next rebuild?
- Time zone handling across the winter clock change — `Asia/Jerusalem`, not a fixed offset.

## Sources

- [Google Calendar API — Synchronize resources efficiently](https://developers.google.com/calendar/api/guides/sync)
- [OAuth — Restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification)
- [Google verification and CASA security assessment](https://developer.nylas.com/docs/provider-guides/google/google-verification-security-assessment-guide/)
