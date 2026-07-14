-- Fiches PJ Markdown complètes, liées à une partie et à un joueur.
-- À exécuter dans Supabase > SQL Editor.

create table if not exists public.pj_sheets (
  id bigint generated always as identity primary key,
  room_code text not null,
  player_name text not null,
  character_name text not null,
  sheet_data jsonb not null default '{}'::jsonb,
  markdown_content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pj_sheets_room_player_unique unique (room_code, player_name)
);

create index if not exists pj_sheets_room_code_idx
  on public.pj_sheets (room_code);

alter table public.pj_sheets enable row level security;

drop policy if exists "Allow anon read pj_sheets" on public.pj_sheets;
create policy "Allow anon read pj_sheets"
  on public.pj_sheets for select to anon
  using (true);

drop policy if exists "Allow anon insert pj_sheets" on public.pj_sheets;
create policy "Allow anon insert pj_sheets"
  on public.pj_sheets for insert to anon
  with check (true);

drop policy if exists "Allow anon update pj_sheets" on public.pj_sheets;
create policy "Allow anon update pj_sheets"
  on public.pj_sheets for update to anon
  using (true)
  with check (true);

grant select, insert, update on public.pj_sheets to anon;
grant usage, select on sequence public.pj_sheets_id_seq to anon;
