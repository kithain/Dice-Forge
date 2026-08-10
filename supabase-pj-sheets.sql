-- Fiches PJ Markdown complètes, liées à une partie et à un joueur.
-- À exécuter dans Supabase > SQL Editor.

create table if not exists public.pj_sheets (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  room_code text not null,
  player_name text not null,
  character_name text not null,
  sheet_data jsonb not null default '{}'::jsonb,
  markdown_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pj_sheets_room_player_unique unique (room_code, player_name)
);

alter table public.pj_sheets
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists pj_sheets_room_code_idx
  on public.pj_sheets (room_code);
create index if not exists pj_sheets_user_updated_idx
  on public.pj_sheets (user_id, updated_at desc);

alter table public.pj_sheets enable row level security;

drop policy if exists "Allow anon read pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated read pj_sheets" on public.pj_sheets;
create policy "Allow authenticated read pj_sheets"
  on public.pj_sheets for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Allow anon insert pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated insert pj_sheets" on public.pj_sheets;
create policy "Allow authenticated insert pj_sheets"
  on public.pj_sheets for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Allow anon update pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated update pj_sheets" on public.pj_sheets;
create policy "Allow authenticated update pj_sheets"
  on public.pj_sheets for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.pj_sheets to authenticated;
grant usage, select on sequence public.pj_sheets_id_seq to authenticated;
