-- Run this in Supabase SQL Editor
create table if not exists public.poker_state (
  id int primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.poker_state enable row level security;

-- Allow read/write with anon key for this app's shared state.
-- You can tighten these policies later with auth.
drop policy if exists "poker_state_select_all" on public.poker_state;
create policy "poker_state_select_all"
  on public.poker_state for select
  to anon
  using (true);

drop policy if exists "poker_state_upsert_all" on public.poker_state;
create policy "poker_state_upsert_all"
  on public.poker_state for all
  to anon
  using (true)
  with check (true);
