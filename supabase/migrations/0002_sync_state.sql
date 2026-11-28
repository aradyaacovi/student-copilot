-- 0002: sync heartbeat per automation

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

do $$
declare t text;
begin
  foreach t in array array['sync_state'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
