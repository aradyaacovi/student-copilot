# Diagrams

All diagrams are [Mermaid](https://mermaid.js.org/), so GitHub renders them and they live in version control next to the code. Each one answers a different question; the written reasoning is in [ARCHITECTURE.md](ARCHITECTURE.md).

| # | Diagram | Question it answers |
| --- | --- | --- |
| 1 | System context | Who and what does the system talk to? |
| 2 | Containers | What runs where, and with which credentials? |
| 3 | Data model (ERD) | What is stored, and how are duplicates prevented? |
| 4 | Automation run (sequence) | What happens on each scheduled run, and how is silence detected? |
| 5 | Email change decision | How does the app decide whether to apply a schedule change? |
| 6 | Planner pipeline | How is "what now" computed? |
| 7 | Schedule change lifecycle | Which states can a change be in? |
| 8 | CI/CD and environments | How does code reach production? |
| 9 | User journeys | What does the student do, and what happens automatically? |

## 1. System context

```mermaid
flowchart LR
  S([Student])
  APP[Student Copilot]
  M[Moodle iCal feed]
  G[Gmail IMAP]
  GC[Google Calendar<br/>read-only, busy hours]
  C[Claude API]

  S -- "daily plan, marks done/seen, approves changes" --> APP
  M -- deadlines --> APP
  G -- schedule-change emails --> APP
  GC -- busy time, no titles --> APP
  APP -- "email text + course list" --> C
  C -- "schema-constrained JSON" --> APP
```

## 2. Containers and trust boundaries

The browser only ever holds the publishable key and the user's own session. The secret key exists only in GitHub Actions secrets, one job per automation, each job receiving only what it needs.

```mermaid
flowchart TB
  subgraph Client["Client (untrusted)"]
    SW[Service worker<br/>offline shell]
    UI[app.js]
    L1[logic.js]
    LS[(localStorage<br/>seen / done / notes)]
    UI --> L1
    UI --> LS
    SW -. caches shell, never Supabase .- UI
  end

  subgraph Pages["GitHub Pages (static)"]
    ST[index.html, css, js]
  end

  subgraph SB["Supabase"]
    AU[Auth: magic link]
    PG[(Postgres<br/>RLS on every table)]
  end

  subgraph GHA["GitHub Actions (trusted)"]
    D[decide job<br/>Israel hour to workflows]
    J1[moodle job]
    J2[email job]
    J3[briefs job]
    J4[reminders job]
    J5[calendar job]
    L2[logic.js, same file]
    D --> J1 & J2 & J3 & J4 & J5
    J3 --- L2
  end

  ST --> Client
  UI -- "publishable key + user JWT" --> PG
  UI --> AU
  J1 & J2 & J3 & J4 & J5 -- "secret key, explicit user_id" --> PG
  J1 --> MO[Moodle iCal]
  J2 --> GM[Gmail IMAP]
  J2 --> CL[Claude API]
  J5 --> GCal[Google Calendar]
```

## 3. Data model

`semester_data` and `user_state` are one JSON document per user. The other tables are written by automations and made idempotent by unique keys, so a workflow that runs twice never duplicates a row.

```mermaid
erDiagram
  AUTH_USERS ||--o| SEMESTER_DATA : owns
  AUTH_USERS ||--o| USER_STATE : owns
  AUTH_USERS ||--o{ EVENTS : owns
  AUTH_USERS ||--o{ SCHEDULE_CHANGES : owns
  AUTH_USERS ||--o{ INBOX : owns
  AUTH_USERS ||--o{ SYNC_STATE : owns
  AUTH_USERS ||--o{ CALENDAR_BUSY : owns
  SCHEDULE_CHANGES ||--o{ INBOX : "ref_id (review prompt)"

  SEMESTER_DATA {
    uuid user_id PK
    jsonb data "courses, grade components, session rules"
    timestamptz updated_at
  }
  USER_STATE {
    uuid user_id PK
    jsonb state "watched, done, grades, notes, settings"
    timestamptz updated_at
  }
  EVENTS {
    bigint id PK
    uuid user_id FK
    text source "moodle | email | manual"
    text external_id "UNIQUE with user_id, source"
    text kind "submission | exam | quiz | other"
    text title
    date date
    numeric weight
  }
  SCHEDULE_CHANGES {
    bigint id PK
    uuid user_id FK
    text course_id
    text session_type "lecture | tutorial | workshop"
    text change "cancelled | extra | moved"
    date date
    text confidence "high | low"
    text status "applied | needs_review | rejected"
    text source_ref "UNIQUE with user, course, type, change, date"
  }
  INBOX {
    bigint id PK
    uuid user_id FK
    text kind "brief | weekly | reminder | alert | review"
    text dedupe_key "UNIQUE with user_id"
    bigint ref_id
    boolean read
  }
  SYNC_STATE {
    uuid user_id PK
    text source PK "workflow name"
    timestamptz last_success
    text last_error
    int failures
  }
  CALENDAR_BUSY {
    uuid user_id PK
    date date PK
    text start_time PK
    text end_time PK
  }
```

## 4. One automation run

Every run reports a heartbeat, so the app can tell the difference between "nothing changed" and "the sync has stopped" ([ADR 0003](decisions/0003-heartbeat-for-silent-failures.md)).

```mermaid
sequenceDiagram
  autonumber
  participant Cron as GitHub cron (hourly, UTC)
  participant Dec as decide job
  participant Job as workflow job
  participant Src as Moodle / Gmail / Calendar
  participant DB as Supabase
  participant App as Browser app

  Cron->>Dec: tick
  Dec->>Dec: convert to Israel hour, pick workflows
  Dec->>Job: start only the due ones
  Job->>Src: fetch (read-only)
  Src-->>Job: raw events / emails / busy time
  Job->>Job: parse + match to courses (pure functions)
  Job->>DB: upsert with unique key (idempotent)
  alt success
    Job->>DB: sync_state.last_success = now
  else failure
    Job->>DB: sync_state.last_error, failures + 1
    Job-->>Cron: run fails, GitHub emails the owner
  end
  App->>DB: load inbox, events, changes, sync_state
  DB-->>App: rows (RLS: own rows only)
  App->>App: applyRemote merges without mutating base data
  App->>App: warn if last_success is too old
```

## 5. Email change decision

The model extracts. Fixed code decides.

```mermaid
flowchart TD
  A[New email] --> B[Claude: structured extraction<br/>course, change, date, group, confidence]
  B --> C{Course found<br/>in the course list?}
  C -- no --> R[needs_review]
  C -- yes --> D{Aimed at another<br/>tutorial group?}
  D -- yes --> X[Ignore]
  D -- no --> E{Relative date?}
  E -- yes --> F[Resolve to next occurrence<br/>after the email's send time]
  E -- no --> G
  F --> G{Date matches a<br/>real session?}
  G -- no --> R
  G -- yes --> H{Confidence high and<br/>group known?}
  H -- no --> R
  H -- yes --> AP[applied]
  R --> U[Student approves or rejects in the app]
  U -- approve --> AP
  U -- reject --> RJ[rejected]
```

## 6. Planner pipeline

Single source of ordering: `L.buildPlan` ([logic.js](../js/logic.js)).

```mermaid
flowchart LR
  I1[Deadlines and exams] --> P
  I2[Missed lectures<br/>from pace tracker] --> P
  I3[Spaced reviews] --> P
  I4[Custom tasks] --> P
  P[estimate effort<br/>hours by kind and weight] --> N[needDays =<br/>effort / hoursPerDay]
  N --> SL[slack =<br/>days until due - needDays]
  SL --> B{bucket}
  B -- "slack <= 0 or due in 1 day" --> MU[must]
  B -- "slack <= 3" --> SH[should]
  B -- otherwise --> LA[later]
  MU & SH & LA --> O[order by slack,<br/>ties by grade weight]
  CAP["capacity today =<br/>time to day's end<br/>- in-person classes<br/>- calendar busy time<br/>capped at study hours"] --> T
  O --> T[fill today<br/>max 2h per item]
  T --> NOW["Now task + today's plan<br/>each with a one-line reason"]
```

## 7. Schedule change lifecycle

```mermaid
stateDiagram-v2
  [*] --> applied: confident, matches a real session
  [*] --> needs_review: low confidence, unknown group, no matching session
  needs_review --> applied: student approves
  needs_review --> rejected: student rejects
  applied --> [*]
  rejected --> [*]
```

## 8. CI/CD and environments

```mermaid
flowchart LR
  Dev[Developer branch] --> PR[Pull request]
  PR --> T["tests workflow<br/>logic + automations + UI smoke"]
  T -- fail --> Art[Upload screenshots<br/>as artifact]
  T -- pass --> Rev[Review + merge to main]
  Rev --> Pg["pages workflow<br/>stub private files, default to demo"]
  Pg --> Prod[GitHub Pages<br/>public demo]
  Rev -. "schema changes: run supabase/schema.sql manually" .-> SBp[(Supabase project)]
  Rev --> Auto["automations workflow<br/>runs the merged main code hourly"]
  Auto --> SBp
  Dep[Dependabot] --> PR
```

| Environment | What it is | Data |
| --- | --- | --- |
| Local | `npm start`, `?demo=1` or `data/my-semester.js` | Demo or personal file, never committed |
| CI | GitHub Actions, headless browser, fake Supabase and Claude | Fixtures only |
| Production (demo) | GitHub Pages | Bundled demo data |
| Production (personal) | Same static files, Supabase configured through the git-ignored `js/config.js` | The student's own rows, protected by RLS |

## 9. User journeys

```mermaid
journey
  title A student's day
  section Morning
    Brief arrives in the inbox: 5: Automation
    Open Today, read the one task: 5: Student
  section Study
    Work on the task, mark it done: 4: Student
    Mark a recorded lecture as seen: 4: Student
  section When something changes
    Cancellation email is read: 3: Automation
    Approve an uncertain change: 4: Student
  section Evening
    Reminder for tomorrow's deadline: 5: Automation
    Check the grade needed in the exam: 4: Student
```
