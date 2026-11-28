-- 0003: busy time read from the calendar (hours only, no titles)

-- 7. זמן תפוס מהיומן (שעות בלבד, בלי כותרות). נכתב על ידי workflow 5-calendar-sync
create table if not exists public.calendar_busy (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  start_time text not null,    -- HH:MM בשעון ישראל
  end_time text not null,
  primary key (user_id, date, start_time, end_time)
);

do $$
declare t text;
begin
  foreach t in array array['calendar_busy'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists own_rows on public.%I', t);
    execute format('create policy own_rows on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
