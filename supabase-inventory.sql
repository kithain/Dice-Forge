-- Inventaires PJ, liés à une partie et à un joueur.
-- À exécuter dans Supabase > SQL Editor.

create table if not exists public.pj_inventory (
  id bigint generated always as identity primary key,
  room_code text not null,
  player_name text not null,
  character_name text not null default '',
  po integer not null default 0 check (po between 0 and 9999),
  pa integer not null default 0 check (pa between 0 and 9),
  pc integer not null default 0 check (pc between 0 and 9),
  weapons jsonb not null default '[]'::jsonb,
  armors jsonb not null default '[]'::jsonb,
  equipment jsonb not null default '[]'::jsonb,
  consumables jsonb not null default '[]'::jsonb,
  miscellaneous jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pj_inventory_room_player_unique unique (room_code, player_name)
);

create index if not exists pj_inventory_room_code_idx
  on public.pj_inventory (room_code);

alter table public.pj_inventory enable row level security;

drop policy if exists "Allow anon read pj_inventory" on public.pj_inventory;
create policy "Allow anon read pj_inventory"
  on public.pj_inventory for select to anon
  using (true);

drop policy if exists "Allow anon insert pj_inventory" on public.pj_inventory;
create policy "Allow anon insert pj_inventory"
  on public.pj_inventory for insert to anon
  with check (true);

drop policy if exists "Allow anon update pj_inventory" on public.pj_inventory;
create policy "Allow anon update pj_inventory"
  on public.pj_inventory for update to anon
  using (true)
  with check (true);

drop policy if exists "Allow anon delete pj_inventory" on public.pj_inventory;
create policy "Allow anon delete pj_inventory"
  on public.pj_inventory for delete to anon
  using (true);

grant select, insert, update, delete on public.pj_inventory to anon;
grant usage, select on sequence public.pj_inventory_id_seq to anon;
