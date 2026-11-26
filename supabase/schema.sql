-- Student Copilot – Supabase schema
-- להריץ פעם אחת: Supabase ← SQL Editor ← להדביק הכול ← Run.
-- כל טבלה שייכת למשתמש (user_id). RLS מבטיח שכל סטודנט רואה רק את שלו – מוכן לגרסה לכמה סטודנטים.
-- האוטומציות ב-n8n משתמשות במפתח service_role (עוקף RLS) ומציינות user_id במפורש.

-- 1. נתוני הסמסטר (אותו מבנה כמו data/my-semester.js)
create table if not exists public.semester_data (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2. מה שסימנת באפליקציה (ראיתי / בוצע / ציונים / סיכומים)
create table if not exists public.user_state (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. הגשות ומבחנים שהאוטומציות מצאו (מודל, מייל)
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null check (source in ('moodle', 'email', 'manual')),
  external_id text not null,
  course_id text,
  kind text not null default 'submission' check (kind in ('submission', 'exam', 'quiz', 'other')),
  title text not null,
  date date not null,
  time text,
  weight numeric,
  url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source, external_id)
);

-- 4. ביטולים, השלמות והזזות של שיעורים
create table if not exists public.schedule_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course_id text not null,
  session_type text not null check (session_type in ('lecture', 'tutorial', 'workshop')),
  change text not null check (change in ('cancelled', 'extra', 'moved')),
  date date not null,          -- המופע שבוטל/הוזז, או תאריך ההשלמה
  new_date date,               -- להזזה
  start_time text,
  end_time text,
  location text,
  note text,
  source_ref text not null,    -- מזהה המייל
  confidence text not null default 'high' check (confidence in ('high', 'low')),
  status text not null default 'applied' check (status in ('applied', 'needs_review', 'rejected')),
  created_at timestamptz not null default now(),
  unique (user_id, source_ref, course_id, session_type, change, date)
);

-- 5. הודעות לאפליקציה: תדריכים, תזכורות, התראות
create table if not exists public.inbox (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('brief', 'weekly', 'reminder', 'alert', 'review')),
  title text not null,
  body text not null default '',
  ref_id bigint,               -- למשל schedule_changes.id לאישור
  dedupe_key text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

-- 6. דופק הסנכרון: מתי כל אוטומציה רצה בהצלחה לאחרונה, כדי שהאפליקציה תוכל להזהיר כשהיא שותקת
create table if not exists public.sync_state (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null,        -- שם ה-workflow, למשל 1-moodle-sync
  last_attempt timestamptz,
  last_success timestamptz,
  last_error text,
  failures int not null default 0,
  primary key (user_id, source)
);

-- RLS: כל משתמש רואה ומשנה רק את השורות שלו
do $$
declare t text;
begin
  foreach t in array array['semester_data', 'user_state', 'events', 'schedule_changes', 'inbox', 'sync_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

create index if not exists inbox_user_created on public.inbox (user_id, created_at desc);
create index if not exists events_user_date on public.events (user_id, date);
