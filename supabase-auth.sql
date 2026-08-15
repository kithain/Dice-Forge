-- Authentification, proprietaire de room et flux OBS public filtre.
-- A executer dans Supabase > SQL Editor apres les scripts de creation des tables.

create table if not exists public.rooms (
  room_code text primary key,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.room_members (
  room_code text not null references public.rooms(room_code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  joined_at timestamptz not null default now(),
  primary key (room_code, user_id)
);

alter table public.rolls
  add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.personnages
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.pj_sheets
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.pj_inventory
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Conserve les anciennes rooms dans l'historique avant de tenter de les
-- rattacher au compte Auth correspondant.
insert into public.rooms (room_code, owner_name, created_at)
select distinct on (room_code)
  room_code,
  player_name,
  created_at
from public.rolls
where expression = '— Partie créée —'
order by room_code, created_at
on conflict (room_code) do nothing;

-- Rattache automatiquement les anciennes rooms a leur compte Auth lorsque
-- l'adresse interne correspond au nom historique (ex. MJ -> mj@diceforge.app).
update public.rooms as room
set owner_id = auth_user.id
from auth.users as auth_user
where room.owner_id is null
  and lower(split_part(auth_user.email, '@', 2)) = 'diceforge.app'
  and lower(split_part(auth_user.email, '@', 1)) = lower(
    regexp_replace(trim(room.owner_name), '[^a-zA-Z0-9]+', '.', 'g')
  );

-- Rattache aussi les anciens jets a leur auteur authentifie lorsque le nom
-- historique correspond, sans modifier le nom affiche ni le contenu du jet.
update public.rolls as roll
set user_id = auth_user.id
from auth.users as auth_user
where roll.user_id is null
  and lower(split_part(auth_user.email, '@', 2)) = 'diceforge.app'
  and lower(split_part(auth_user.email, '@', 1)) = lower(
    regexp_replace(trim(roll.player_name), '[^a-zA-Z0-9]+', '.', 'g')
  );

update public.personnages as personnage
set user_id = auth_user.id
from auth.users as auth_user
where personnage.user_id is null
  and lower(split_part(auth_user.email, '@', 2)) = 'diceforge.app'
  and lower(split_part(auth_user.email, '@', 1)) = lower(
    regexp_replace(trim(personnage.player_name), '[^a-zA-Z0-9]+', '.', 'g')
  );

update public.pj_sheets as sheet
set user_id = auth_user.id
from auth.users as auth_user
where sheet.user_id is null
  and lower(split_part(auth_user.email, '@', 2)) = 'diceforge.app'
  and lower(split_part(auth_user.email, '@', 1)) = lower(
    regexp_replace(trim(sheet.player_name), '[^a-zA-Z0-9]+', '.', 'g')
  );

update public.pj_inventory as inventory
set user_id = auth_user.id
from auth.users as auth_user
where inventory.user_id is null
  and lower(split_part(auth_user.email, '@', 2)) = 'diceforge.app'
  and lower(split_part(auth_user.email, '@', 1)) = lower(
    regexp_replace(trim(inventory.player_name), '[^a-zA-Z0-9]+', '.', 'g')
  );

drop index if exists public.personnages_user_id_unique_idx;
create index if not exists personnages_user_id_idx
  on public.personnages (user_id);
create index if not exists pj_sheets_user_updated_idx
  on public.pj_sheets (user_id, updated_at desc);
create index if not exists pj_inventory_user_updated_idx
  on public.pj_inventory (user_id, updated_at desc);

insert into public.room_members (room_code, user_id, player_name)
select distinct roll.room_code, roll.user_id, roll.player_name
from public.rolls as roll
join public.rooms as room on room.room_code = roll.room_code
where roll.user_id is not null
on conflict (room_code, user_id) do update
set player_name = excluded.player_name;

create table if not exists public.obs_rolls (
  roll_id bigint primary key,
  created_at timestamptz not null,
  room_code text not null,
  player_name text not null,
  expression text not null,
  rolls_detail text not null default '',
  total integer not null default 0,
  is_crit boolean not null default false,
  is_fail boolean not null default false,
  is_hidden boolean not null default false
);

-- Le flux OBS peut signaler l'existence d'un jet caché, mais uniquement avec
-- des valeurs neutralisées par le trigger (jamais le résultat réel).
alter table public.obs_rolls
  drop constraint if exists obs_rolls_is_hidden_check;

create index if not exists obs_rolls_room_created_idx
  on public.obs_rolls (room_code, created_at desc);

insert into public.obs_rolls (
  roll_id, created_at, room_code, player_name, expression,
  rolls_detail, total, is_crit, is_fail, is_hidden
)
select
  id, created_at, room_code, player_name, expression,
  rolls_detail, total, is_crit, is_fail, false
from public.rolls
where not is_hidden
on conflict (roll_id) do nothing;

create or replace function public.sync_obs_rolls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.obs_rolls where roll_id = old.id;
    return old;
  end if;

  insert into public.obs_rolls (
    roll_id, created_at, room_code, player_name, expression,
    rolls_detail, total, is_crit, is_fail, is_hidden
  ) values (
    new.id,
    new.created_at,
    new.room_code,
    new.player_name,
    case when new.is_hidden then 'Jet caché' else new.expression end,
    case when new.is_hidden then '' else new.rolls_detail end,
    case when new.is_hidden then 0 else new.total end,
    case when new.is_hidden then false else new.is_crit end,
    case when new.is_hidden then false else new.is_fail end,
    new.is_hidden
  )
  on conflict (roll_id) do update set
    created_at = excluded.created_at,
    room_code = excluded.room_code,
    player_name = excluded.player_name,
    expression = excluded.expression,
    rolls_detail = excluded.rolls_detail,
    total = excluded.total,
    is_crit = excluded.is_crit,
    is_fail = excluded.is_fail,
    is_hidden = excluded.is_hidden;
  return new;
end;
$$;

drop trigger if exists sync_obs_rolls_trigger on public.rolls;
create trigger sync_obs_rolls_trigger
after insert or update or delete on public.rolls
for each row execute function public.sync_obs_rolls();

create or replace function public.is_room_member(requested_room text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members
    where room_code = requested_room and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_room_owner(requested_room text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms
    where room_code = requested_room and owner_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_player_data(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null and (
    target_user = (select auth.uid())
    or exists (
      select 1
      from public.room_members as member
      join public.rooms as room on room.room_code = member.room_code
      where member.user_id = target_user
        and room.owner_id = (select auth.uid())
    )
  );
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.rolls enable row level security;
alter table public.obs_rolls enable row level security;
alter table public.personnages enable row level security;
alter table public.pj_sheets enable row level security;
alter table public.pj_inventory enable row level security;

drop policy if exists "Authenticated users read rooms" on public.rooms;
drop policy if exists "Authenticated users create rooms" on public.rooms;
create policy "Authenticated users read rooms" on public.rooms
  for select to authenticated using (true);
create policy "Authenticated users create rooms" on public.rooms
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists "Members read membership" on public.room_members;
drop policy if exists "Users join rooms" on public.room_members;
drop policy if exists "Users update own membership" on public.room_members;
create policy "Members read membership" on public.room_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_room_owner(room_code));
create policy "Users join rooms" on public.room_members
  for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (
    select 1 from public.rooms where rooms.room_code = room_members.room_code
  ));
create policy "Users update own membership" on public.room_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Allow anon read rolls" on public.rolls;
drop policy if exists "Allow anon insert rolls" on public.rolls;
drop policy if exists "Allow anon delete rolls" on public.rolls;
drop policy if exists "Allow authenticated read rolls" on public.rolls;
drop policy if exists "Allow authenticated insert rolls" on public.rolls;
drop policy if exists "Allow authenticated delete rolls" on public.rolls;
drop policy if exists "Allow room owner delete rolls" on public.rolls;
create policy "Allow authenticated read rolls" on public.rolls
  for select to authenticated
  using (
    public.is_room_member(room_code)
    and (
      not is_hidden
      or public.is_room_owner(room_code)
    )
  );
create policy "Allow authenticated insert rolls" on public.rolls
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_room_member(room_code));
create policy "Allow room owner delete rolls" on public.rolls
  for delete to authenticated using (public.is_room_owner(room_code));

drop policy if exists "Public read visible OBS rolls" on public.obs_rolls;
create policy "Public read visible OBS rolls" on public.obs_rolls
  for select to anon, authenticated using (true);

drop policy if exists "Allow read personnages" on public.personnages;
drop policy if exists "Allow insert personnages" on public.personnages;
drop policy if exists "Allow update personnages" on public.personnages;
drop policy if exists "Allow authenticated read personnages" on public.personnages;
drop policy if exists "Allow authenticated insert personnages" on public.personnages;
drop policy if exists "Allow authenticated update personnages" on public.personnages;
create policy "Allow authenticated read personnages" on public.personnages
  for select to authenticated using (public.can_access_player_data(user_id));
create policy "Allow authenticated insert personnages" on public.personnages
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Allow authenticated update personnages" on public.personnages
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Allow anon read pj_sheets" on public.pj_sheets;
drop policy if exists "Allow anon insert pj_sheets" on public.pj_sheets;
drop policy if exists "Allow anon update pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated read pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated insert pj_sheets" on public.pj_sheets;
drop policy if exists "Allow authenticated update pj_sheets" on public.pj_sheets;
create policy "Allow authenticated read pj_sheets" on public.pj_sheets
  for select to authenticated using (public.can_access_player_data(user_id));
create policy "Allow authenticated insert pj_sheets" on public.pj_sheets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Allow authenticated update pj_sheets" on public.pj_sheets
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Allow anon read pj_inventory" on public.pj_inventory;
drop policy if exists "Allow anon insert pj_inventory" on public.pj_inventory;
drop policy if exists "Allow anon update pj_inventory" on public.pj_inventory;
drop policy if exists "Allow anon delete pj_inventory" on public.pj_inventory;
drop policy if exists "Allow authenticated read pj_inventory" on public.pj_inventory;
drop policy if exists "Allow authenticated insert pj_inventory" on public.pj_inventory;
drop policy if exists "Allow authenticated update pj_inventory" on public.pj_inventory;
drop policy if exists "Allow authenticated delete pj_inventory" on public.pj_inventory;
create policy "Allow authenticated read pj_inventory" on public.pj_inventory
  for select to authenticated using (public.can_access_player_data(user_id));
create policy "Allow authenticated insert pj_inventory" on public.pj_inventory
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Allow authenticated update pj_inventory" on public.pj_inventory
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Allow authenticated delete pj_inventory" on public.pj_inventory
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.rooms, public.room_members, public.rolls,
  public.obs_rolls, public.personnages, public.pj_sheets, public.pj_inventory from anon;
revoke all on public.rolls_personnages from anon, authenticated;
revoke all on sequence public.rolls_id_seq, public.pj_sheets_id_seq,
  public.pj_inventory_id_seq from anon;

grant select, insert on public.rooms to authenticated;
grant select, insert, update on public.room_members to authenticated;
grant select, insert, delete on public.rolls to authenticated;
grant select on public.obs_rolls to anon, authenticated;
grant select, insert, update on public.personnages to authenticated;
grant select, insert, update on public.pj_sheets to authenticated;
grant select, insert, update, delete on public.pj_inventory to authenticated;
grant execute on function public.is_room_member(text) to authenticated;
grant execute on function public.is_room_owner(text) to authenticated;
grant execute on function public.can_access_player_data(uuid) to authenticated;
grant usage, select on sequence public.rolls_id_seq to authenticated;
grant usage, select on sequence public.pj_sheets_id_seq to authenticated;
grant usage, select on sequence public.pj_inventory_id_seq to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'obs_rolls'
  ) then
    alter publication supabase_realtime add table public.obs_rolls;
  end if;
end $$;
