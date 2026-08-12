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

create table if not exists public.room_invitations (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(room_code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_room text not null references public.rooms(room_code) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  player_name text not null,
  character_name text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (room_code, user_id)
);

create table if not exists public.pending_experience (
  id bigint generated always as identity primary key,
  room_code text not null references public.rooms(room_code) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  roll_id bigint not null references public.rolls(id) on delete cascade,
  skill_name text not null,
  revealed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (room_code, user_id, skill_name)
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
select distinct on (roll.room_code, roll.user_id)
  roll.room_code,
  roll.user_id,
  roll.player_name
from public.rolls as roll
join public.rooms as room on room.room_code = roll.room_code
where roll.user_id is not null
order by roll.room_code, roll.user_id, roll.created_at desc, roll.id desc
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
  is_hidden boolean not null default false check (is_hidden = false)
);

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

  if new.is_hidden then
    delete from public.obs_rolls where roll_id = new.id;
  else
    insert into public.obs_rolls (
      roll_id, created_at, room_code, player_name, expression,
      rolls_detail, total, is_crit, is_fail, is_hidden
    ) values (
      new.id, new.created_at, new.room_code, new.player_name, new.expression,
      new.rolls_detail, new.total, new.is_crit, new.is_fail, false
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
      is_hidden = false;
  end if;
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

-- Les jets cachés sont générés côté base : le navigateur du joueur ne reçoit
-- jamais les valeurs. Seul le propriétaire de la room obtient le résultat.
drop function if exists public.roll_hidden_dice(text, text, text, jsonb, integer);
drop function if exists public.roll_hidden_dice(text, text, text, jsonb, integer, text, integer);
create or replace function public.roll_hidden_dice(
  requested_room text,
  requested_player text,
  requested_expression text,
  requested_terms jsonb,
  requested_modifier integer default 0,
  requested_experience_skill text default '',
  requested_difficulty text default 'normal'
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  term jsonb;
  die_count integer;
  die_sides integer;
  die_sign integer;
  die_value integer;
  subtotal integer;
  roll_total integer := requested_modifier;
  values_text text;
  detail text := '';
  inserted_id bigint;
  owner_can_see boolean;
  stored_skill_score integer;
  success_threshold integer := 0;
begin
  if current_user_id is null then raise exception 'Authentification requise'; end if;
  if requested_room !~ '^[A-Z0-9]{1,6}$' then raise exception 'Code de room invalide'; end if;
  if length(trim(requested_player)) < 1 or length(requested_player) > 80 then raise exception 'Joueur invalide'; end if;
  if length(requested_expression) < 1 or length(requested_expression) > 160 then raise exception 'Expression invalide'; end if;
  if requested_modifier < -10000 or requested_modifier > 10000 then raise exception 'Modificateur invalide'; end if;
  if jsonb_typeof(requested_terms) <> 'array' or jsonb_array_length(requested_terms) > 10 then raise exception 'Termes de dés invalides'; end if;
  if not exists (
    select 1 from public.room_members
    where room_code = requested_room and user_id = current_user_id and player_name = requested_player
  ) then raise exception 'Le joueur ne fait pas partie de cette room'; end if;

  for term in select value from jsonb_array_elements(requested_terms)
  loop
    die_count := (term ->> 'count')::integer;
    die_sides := (term ->> 'sides')::integer;
    die_sign := (term ->> 'sign')::integer;
    if die_count < 1 or die_count > 10 or die_sides not in (4, 6, 8, 10, 12, 20, 100) or die_sign not in (-1, 1) then
      raise exception 'Terme de dés interdit';
    end if;
    subtotal := 0;
    values_text := '';
    for die_index in 1..die_count loop
      die_value := floor(random() * die_sides)::integer + 1;
      subtotal := subtotal + die_value;
      values_text := values_text || case when values_text = '' then '' else ',' end || die_value::text;
    end loop;
    roll_total := roll_total + die_sign * subtotal;
    detail := detail || case when detail = '' then '' else ' + ' end || case when die_sign = -1 then '-' else '' end || 'D' || die_sides || '[' || values_text || ']';
  end loop;

  insert into public.rolls (room_code, player_name, user_id, expression, rolls_detail, total, is_crit, is_fail, is_hidden)
  values (requested_room, requested_player, current_user_id, requested_expression, detail, roll_total, false, false, true)
  returning id into inserted_id;

  if trim(requested_experience_skill) <> '' then
    select (skill ->> 'score')::integer into stored_skill_score
    from public.pj_sheets sheet, jsonb_array_elements(coalesce(sheet.sheet_data -> 'skills', '[]'::jsonb)) skill
    where sheet.room_code = requested_room and sheet.user_id = current_user_id and skill ->> 'name' = trim(requested_experience_skill)
    order by sheet.updated_at desc limit 1;
    success_threshold := case requested_difficulty
      when 'easy' then coalesce(stored_skill_score, 0) * 2
      when 'hard' then ceil(coalesce(stored_skill_score, 0)::numeric / 2)::integer
      when 'automatic' then 100
      when 'impossible' then 0
      else coalesce(stored_skill_score, 0)
    end;
  end if;
  if success_threshold > 0 and roll_total between 1 and 95 and roll_total <= success_threshold then
    insert into public.pending_experience (room_code, user_id, roll_id, skill_name)
    values (requested_room, current_user_id, inserted_id, trim(requested_experience_skill))
    on conflict (room_code, user_id, skill_name) do update
    set roll_id = excluded.roll_id, revealed_at = null, created_at = now();
  end if;

  select exists (select 1 from public.rooms where room_code = requested_room and owner_id = current_user_id) into owner_can_see;
  return jsonb_build_object(
    'accepted', true,
    'id', inserted_id,
    'is_owner', owner_can_see,
    'total', case when owner_can_see then roll_total else null end,
    'rolls_detail', case when owner_can_see then detail else null end
  );
end;
$$;

revoke all on function public.roll_hidden_dice(text, text, text, jsonb, integer, text, text) from public, anon;
grant execute on function public.roll_hidden_dice(text, text, text, jsonb, integer, text, text) to authenticated;

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

create or replace function public.reset_sheet_experience(source_data jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_set(
    jsonb_set(
      coalesce(source_data, '{}'::jsonb),
      '{skills}',
      coalesce((select jsonb_agg(item || jsonb_build_object('checked', false)) from jsonb_array_elements(coalesce(source_data -> 'skills', '[]'::jsonb)) item), '[]'::jsonb),
      true
    ),
    '{spells}',
    coalesce((select jsonb_agg(item || jsonb_build_object('checked', false)) from jsonb_array_elements(coalesce(source_data -> 'spells', '[]'::jsonb)) item), '[]'::jsonb),
    true
  );
$$;

create or replace function public.copy_character_to_room(target_user uuid, requested_player text, requested_room text, requested_source_room text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_sheet public.pj_sheets%rowtype;
  source_inventory public.pj_inventory%rowtype;
begin
  select * into source_sheet from public.pj_sheets
  where user_id = target_user
    and room_code <> requested_room
    and (requested_source_room is null or room_code = requested_source_room)
  order by updated_at desc limit 1;
  if source_sheet.id is not null and not exists (select 1 from public.pj_sheets where room_code = requested_room and user_id = target_user) then
    insert into public.pj_sheets (user_id, room_code, player_name, character_name, sheet_data, markdown_content)
    values (target_user, requested_room, requested_player, source_sheet.character_name, public.reset_sheet_experience(source_sheet.sheet_data), '');
  end if;
  select * into source_inventory from public.pj_inventory
  where user_id = target_user
    and room_code <> requested_room
    and (requested_source_room is null or room_code = requested_source_room)
  order by updated_at desc limit 1;
  if source_inventory.id is not null and not exists (select 1 from public.pj_inventory where room_code = requested_room and user_id = target_user) then
    insert into public.pj_inventory (user_id, room_code, player_name, character_name, po, pa, pc, weapons, armors, equipment, consumables, miscellaneous)
    values (target_user, requested_room, requested_player, source_inventory.character_name, source_inventory.po, source_inventory.pa, source_inventory.pc, source_inventory.weapons, source_inventory.armors, source_inventory.equipment, source_inventory.consumables, source_inventory.miscellaneous);
  end if;
end;
$$;

create or replace function public.join_room_with_character(requested_room text, requested_player text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then raise exception 'Authentification requise'; end if;
  if not exists (select 1 from public.rooms where room_code = requested_room) then raise exception 'Room inconnue'; end if;
  insert into public.room_members (room_code, user_id, player_name)
  values (requested_room, current_user_id, requested_player)
  on conflict (room_code, user_id) do update set player_name = excluded.player_name;
  perform public.copy_character_to_room(current_user_id, requested_player, requested_room, null);
end;
$$;

create or replace function public.list_invitable_characters(requested_room text)
returns table (user_id uuid, player_name text, character_name text, source_room text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (member.user_id)
    member.user_id, member.player_name, coalesce(sheet.character_name, member.player_name), member.room_code
  from public.room_members member
  join public.rooms owned_room on owned_room.room_code = member.room_code and owned_room.owner_id = (select auth.uid())
  left join public.pj_sheets sheet on sheet.user_id = member.user_id and sheet.room_code = member.room_code
  where public.is_room_owner(requested_room)
    and member.room_code <> requested_room
    and member.user_id <> (select auth.uid())
    and not exists (select 1 from public.room_members target where target.room_code = requested_room and target.user_id = member.user_id)
  order by member.user_id, sheet.updated_at desc nulls last;
$$;

create or replace function public.invite_character(requested_room text, target_user uuid, requested_source_room text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare source_member public.room_members%rowtype; source_name text;
begin
  if not public.is_room_owner(requested_room) then raise exception 'Seul le créateur de la room peut inviter'; end if;
  if not exists (select 1 from public.rooms where room_code = requested_source_room and owner_id = (select auth.uid())) then raise exception 'Room source inaccessible'; end if;
  select * into source_member from public.room_members where room_code = requested_source_room and user_id = target_user;
  if source_member.user_id is null then raise exception 'Personnage source introuvable'; end if;
  select character_name into source_name from public.pj_sheets where room_code = requested_source_room and user_id = target_user order by updated_at desc limit 1;
  insert into public.room_invitations (room_code, user_id, source_room, invited_by, player_name, character_name, status)
  values (requested_room, target_user, requested_source_room, (select auth.uid()), source_member.player_name, coalesce(source_name, source_member.player_name), 'pending')
  on conflict (room_code, user_id) do update set source_room = excluded.source_room, invited_by = excluded.invited_by, player_name = excluded.player_name, character_name = excluded.character_name, status = 'pending', created_at = now();
end;
$$;

create or replace function public.pending_character_invitations()
returns table (invitation_id bigint, room_code text, player_name text, character_name text, source_room text)
language sql
stable
security definer
set search_path = ''
as $$
  select room_invitations.id, room_invitations.room_code, room_invitations.player_name, room_invitations.character_name, room_invitations.source_room
  from public.room_invitations where user_id = (select auth.uid()) and status = 'pending' order by created_at desc;
$$;

create or replace function public.accept_character_invitation(requested_invitation bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare invitation public.room_invitations%rowtype;
begin
  select * into invitation from public.room_invitations where id = requested_invitation and user_id = (select auth.uid()) and status = 'pending';
  if invitation.id is null then raise exception 'Invitation introuvable'; end if;
  insert into public.room_members (room_code, user_id, player_name) values (invitation.room_code, invitation.user_id, invitation.player_name)
  on conflict (room_code, user_id) do update set player_name = excluded.player_name;
  perform public.copy_character_to_room(invitation.user_id, invitation.player_name, invitation.room_code, invitation.source_room);
  update public.room_invitations set status = 'accepted' where id = invitation.id;
  return invitation.room_code;
end;
$$;

create or replace function public.reveal_hidden_experience(requested_room text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare pending record; updated_count integer := 0;
begin
  if not public.is_room_owner(requested_room) then raise exception 'Seul le créateur de la room peut terminer la partie'; end if;
  for pending in
    select user_id, skill_name from public.pending_experience
    where room_code = requested_room and revealed_at is null
  loop
    update public.pj_sheets sheet
    set sheet_data = jsonb_set(
      sheet.sheet_data,
      '{skills}',
      coalesce((select jsonb_agg(case when item ->> 'name' = pending.skill_name then item || jsonb_build_object('checked', true) else item end) from jsonb_array_elements(coalesce(sheet.sheet_data -> 'skills', '[]'::jsonb)) item), '[]'::jsonb),
      true
    ), updated_at = now()
    where sheet.room_code = requested_room and sheet.user_id = pending.user_id;
    if found then updated_count := updated_count + 1; end if;
  end loop;
  update public.pending_experience set revealed_at = now() where room_code = requested_room and revealed_at is null;
  return updated_count;
end;
$$;

alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invitations enable row level security;
alter table public.pending_experience enable row level security;
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
  using (public.is_room_owner(room_code));
create policy "Allow authenticated insert rolls" on public.rolls
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_room_member(room_code) and not is_hidden);
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
  public.room_invitations, public.pending_experience, public.obs_rolls, public.personnages, public.pj_sheets, public.pj_inventory from anon;
revoke all on public.rolls_personnages from anon, authenticated;
revoke all on sequence public.rolls_id_seq, public.pj_sheets_id_seq,
  public.pj_inventory_id_seq from anon;

grant select, insert on public.rooms to authenticated;
grant select, insert, update on public.room_members to authenticated;
revoke all on public.room_invitations from authenticated;
revoke all on public.pending_experience from authenticated;
grant select, insert, delete on public.rolls to authenticated;
grant select on public.obs_rolls to anon, authenticated;
grant select, insert, update on public.personnages to authenticated;
grant select, insert, update on public.pj_sheets to authenticated;
grant select, insert, update, delete on public.pj_inventory to authenticated;
grant execute on function public.is_room_member(text) to authenticated;
grant execute on function public.is_room_owner(text) to authenticated;
grant execute on function public.can_access_player_data(uuid) to authenticated;
revoke all on function public.join_room_with_character(text, text) from public, anon;
revoke all on function public.list_invitable_characters(text) from public, anon;
revoke all on function public.invite_character(text, uuid, text) from public, anon;
revoke all on function public.pending_character_invitations() from public, anon;
revoke all on function public.accept_character_invitation(bigint) from public, anon;
revoke all on function public.reveal_hidden_experience(text) from public, anon;
grant execute on function public.join_room_with_character(text, text) to authenticated;
grant execute on function public.list_invitable_characters(text) to authenticated;
grant execute on function public.invite_character(text, uuid, text) to authenticated;
grant execute on function public.pending_character_invitations() to authenticated;
grant execute on function public.accept_character_invitation(bigint) to authenticated;
grant execute on function public.reveal_hidden_experience(text) to authenticated;
revoke all on function public.copy_character_to_room(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reset_sheet_experience(jsonb) from public, anon, authenticated;
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
