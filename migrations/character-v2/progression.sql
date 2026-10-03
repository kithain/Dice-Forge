-- Apply AFTER creation-lock.sql. Local preparation; never enables v2 by itself.
begin;
create table if not exists diceforge_v2.xp_sessions (
 state_id uuid references diceforge_v2.states(id), room_code text references public.rooms(room_code),
 pool integer not null check(pool>=0), spent integer not null default 0 check(spent>=0 and spent<=pool),
 closed_at timestamptz, lost integer not null default 0 check(lost>=0), opened_at timestamptz not null default clock_timestamp(),
 checks jsonb not null default '[]',
 primary key(state_id,room_code)
);
create unique index if not exists df_one_active_session on diceforge_v2.xp_sessions(state_id) where closed_at is null;
create table if not exists diceforge_v2.xp_attempts (
 state_id uuid, room_code text, resource text check(resource in ('skill','spell')), resource_id text,
 roll integer not null check(roll between 1 and 100), score integer not null check(score between 0 and 100),
 unlocked boolean not null, request_id uuid not null unique, created_at timestamptz not null default clock_timestamp(),
 primary key(state_id,room_code,resource,resource_id),
 foreign key(state_id,room_code) references diceforge_v2.xp_sessions(state_id,room_code)
);
-- Explicit MJ role: only existing campaign owners are seeded. New MJs need an administrative assignment.
create table if not exists diceforge_v2.mj_users(user_id uuid primary key references auth.users(id));
insert into diceforge_v2.mj_users select distinct owner_user_id from diceforge_v2.campaigns on conflict do nothing;
alter table diceforge_v2.xp_sessions enable row level security;
alter table diceforge_v2.xp_attempts enable row level security;
alter table diceforge_v2.mj_users enable row level security;
revoke all on diceforge_v2.xp_sessions,diceforge_v2.xp_attempts,diceforge_v2.mj_users from public,anon,authenticated;

create or replace function diceforge_v2.guard_mj_room() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from diceforge_v2.mj_users where user_id=new.owner_id) or new.owner_id is distinct from auth.uid() then
  raise exception 'Seul un MJ autorisé peut créer un salon.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists df_mj_room on public.rooms;
create trigger df_mj_room before insert on public.rooms for each row execute function diceforge_v2.guard_mj_room();

do $$ begin
 if to_regprocedure('diceforge_v2.link_campaign_room_base(text,text)') is null then
  alter function public.df_link_campaign_room(text,text) set schema diceforge_v2;
  alter function diceforge_v2.df_link_campaign_room(text,text) rename to link_campaign_room_base;
 end if;
end $$;
create or replace function public.df_link_campaign_room(p_source text,p_target text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not exists(select 1 from diceforge_v2.mj_users where user_id=auth.uid()) then
  raise exception 'Rattachement de salon réservé au MJ.' using errcode='42501'; end if;
 return diceforge_v2.link_campaign_room_base(p_source,p_target);
end $$;
revoke all on function public.df_link_campaign_room(text,text) from public,anon;
grant execute on function public.df_link_campaign_room(text,text) to authenticated;

create or replace function public.df_create_session_room(p_source text,p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid;
begin
 if not exists(select 1 from diceforge_v2.mj_users where user_id=uid) then
  raise exception 'Création de salon réservée au MJ.' using errcode='42501'; end if;
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 if p_code is null or p_code !~ '^[A-Z0-9]{4}$' or nullif(trim(p_name),'') is null then
  raise exception 'Code ou nom invalide.' using errcode='22023'; end if;
 if p_source is not null and not exists(select 1 from diceforge_v2.campaign_rooms r join diceforge_v2.campaigns c on c.id=r.campaign_id
  where r.room_code=p_source and c.owner_user_id=uid) then
  raise exception 'Vous ne gérez pas cette campagne.' using errcode='42501'; end if;
 insert into public.rooms(room_code,owner_id,owner_name) values(p_code,uid,p_name);
 insert into public.room_members(room_code,user_id,player_name) values(p_code,uid,p_name);
 campaign:=public.df_link_campaign_room(p_source,p_code);
 return jsonb_build_object('room_code',p_code,'campaign_id',campaign);
end $$;
revoke all on function public.df_create_session_room(text,text,text) from public,anon;
grant execute on function public.df_create_session_room(text,text,text) to authenticated;

create or replace function diceforge_v2.xp_total(p_state uuid,p_resource text,p_id text) returns integer
language sql stable set search_path=pg_catalog as $$
 select coalesce(sum(amount),0)::integer from diceforge_v2.point_events
 where state_id=p_state and kind='xp' and resource=p_resource and resource_id=p_id
$$;
create or replace function diceforge_v2.checked_targets(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('resource',resource,'resource_id',resource_id) order by resource,resource_id),'[]')
 from (select 'skill' resource,skill_id resource_id from diceforge_v2.skills where state_id=p_state and checked
 union all select 'spell',spell_id from diceforge_v2.spells where state_id=p_state and checked) marked
$$;
create or replace function diceforge_v2.sync_session_checks() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 update diceforge_v2.xp_sessions set checks=diceforge_v2.checked_targets(new.state_id) where state_id=new.state_id and closed_at is null;
 return new;
end $$;
drop trigger if exists df_sync_skill_session_checks on diceforge_v2.skills;
drop trigger if exists df_sync_spell_session_checks on diceforge_v2.spells;
create trigger df_sync_skill_session_checks after insert or update on diceforge_v2.skills for each row execute function diceforge_v2.sync_session_checks();
create trigger df_sync_spell_session_checks after insert or update on diceforge_v2.spells for each row execute function diceforge_v2.sync_session_checks();
create or replace function diceforge_v2.allocation_metadata(p_state uuid,p_resource text,p_id text) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select coalesce((select jsonb_build_object('origin',origin,'base',base,'points',points,'score',score,
 'creation_points',case when origin='creation' then points else null end,
 'inherited_points',case when origin='inherited' then points else null end,
 'xp_points',diceforge_v2.xp_total(p_state,p_resource,p_id),'learning_points',0)
 from diceforge_v2.initial_allocations where state_id=p_state and resource=p_resource and resource_id=p_id),'{}')
$$;
create or replace function diceforge_v2.guard_initial_allocation() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare target uuid; v_resource text; identity text; allocated diceforge_v2.initial_allocations; gained integer;
begin
 if tg_op='DELETE' then target:=old.state_id; else target:=new.state_id; end if;
 if tg_op='UPDATE' and (new.state_id is distinct from old.state_id or new.id is distinct from old.id) then
  raise exception 'Identité verrouillée.' using errcode='42501'; end if;
 if not exists(select 1 from diceforge_v2.creation_states where state_id=target and phase<>'draft') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then raise exception 'Suppression de points acquis refusée.' using errcode='42501'; end if;
 v_resource:=case when tg_table_name='skills' then 'skill' else 'spell' end;
 identity:=to_jsonb(new)->>(case when v_resource='skill' then 'skill_id' else 'spell_id' end);
 if tg_op='UPDATE' and identity is distinct from (to_jsonb(old)->>(case when v_resource='skill' then 'skill_id' else 'spell_id' end)) then
  raise exception 'Identité de compétence ou de sort verrouillée.' using errcode='42501'; end if;
 select * into allocated from diceforge_v2.initial_allocations where state_id=target and resource=v_resource and resource_id=identity;
 if not found then raise exception 'Attribution inconnue.' using errcode='42501'; end if;
 gained:=diceforge_v2.xp_total(target,v_resource,identity);
 if new.points is distinct from allocated.points+gained or
 (v_resource='skill' and ((to_jsonb(new)->>'base')::integer is distinct from allocated.base or
 (to_jsonb(new)->>'score')::integer is distinct from allocated.score+gained)) then
  raise exception 'Points acquis verrouillés : utilisez la progression.' using errcode='42501'; end if;
 return new;
end $$;

create or replace function diceforge_v2.session_metadata(p_state uuid,p_room text) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select to_jsonb(x) || jsonb_build_object('remaining',case when closed_at is null then pool-spent else 0 end,
 'attempts',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from diceforge_v2.xp_attempts a where a.state_id=x.state_id and a.room_code=x.room_code),'[]'))
 from diceforge_v2.xp_sessions x where state_id=p_state and room_code=p_room
$$;
create or replace function diceforge_v2.progression_metadata(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('xp_points',coalesce((select sum(amount) from diceforge_v2.point_events where state_id=p_state and kind='xp'),0),
 'learning_points',0,'session',(select diceforge_v2.session_metadata(p_state,x.room_code)
 from diceforge_v2.xp_sessions x where state_id=p_state order by opened_at desc limit 1))
$$;
-- Preserve the established canonical projection instead of duplicating its skill/spell compatibility rules.
do $$ begin
 if to_regprocedure('diceforge_v2.sheet_without_progression(uuid)') is null then
  alter function diceforge_v2.sheet(uuid) rename to sheet_without_progression;
 end if;
end $$;
create or replace function diceforge_v2.sheet(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select diceforge_v2.sheet_without_progression(p_state) || jsonb_build_object('progression',diceforge_v2.progression_metadata(p_state))
$$;

create or replace function diceforge_v2.session_open(p_state uuid,p_room text) returns void
language plpgsql set search_path=pg_catalog as $$
declare previous boolean; phase text; intelligence integer;
begin
 -- Caller must have authorized and locked the state first.
 select cs.phase,(s.stats->>'intelligence')::integer into phase,intelligence from diceforge_v2.creation_states cs
 join diceforge_v2.states s on s.id=cs.state_id where cs.state_id=p_state;
 if phase is distinct from 'play' then return; end if;
 if exists(select 1 from diceforge_v2.xp_sessions where state_id=p_state and room_code=p_room) then return; end if;
 previous:=exists(select 1 from diceforge_v2.xp_sessions where state_id=p_state);
 update diceforge_v2.xp_sessions set closed_at=clock_timestamp(),lost=pool-spent where state_id=p_state and closed_at is null;
 insert into diceforge_v2.xp_sessions(state_id,room_code,pool,checks) values(p_state,p_room,(intelligence+1)/2,
  case when previous then '[]'::jsonb else diceforge_v2.checked_targets(p_state) end);
 -- Preserve audited historical checks on the first session; later sessions start with no checks.
 if previous then
  update diceforge_v2.skills set checked=false where state_id=p_state;
  update diceforge_v2.spells set checked=false where state_id=p_state;
 end if;
 update diceforge_v2.states set sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=p_state;
end $$;
create or replace function diceforge_v2.unlock_result(p_score integer,p_roll integer) returns boolean
language sql immutable set search_path=pg_catalog as $$ select p_roll>p_score $$;
create or replace function diceforge_v2.roll_d100() returns integer
language sql volatile set search_path=pg_catalog as $$ select floor(random()*100)::integer+1 $$;

create or replace function public.df_progression(p_state uuid,p_room text,p_operation text default 'status',
 p_resource text default null,p_id text default null,p_amount integer default null,p_request uuid default null,p_expected_revision bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s diceforge_v2.states; x diceforge_v2.xp_sessions; attempt diceforge_v2.xp_attempts; event diceforge_v2.point_events;
 allocated diceforge_v2.initial_allocations; current_score integer; marked boolean; result jsonb; uid uuid:=auth.uid();
begin
 if uid is null or not coalesce((select enabled from diceforge_v2.configuration),false) then
  raise exception 'Progression indisponible.' using errcode='42501'; end if;
 select st.* into s from diceforge_v2.states st join diceforge_v2.characters c on c.id=st.character_id
 join diceforge_v2.campaign_rooms r on r.campaign_id=st.campaign_id and r.room_code=p_room
 where st.id=p_state and c.owner_user_id=uid and c.status='active' for update of st;
 if not found or (not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)
 and not exists(select 1 from diceforge_v2.campaigns where id=s.campaign_id and owner_user_id=uid)) then
  raise exception 'Fiche ou salon non autorisé.' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('status','open','unlock','spend','close') then raise exception 'Opération inconnue.' using errcode='22023'; end if;
 if not exists(select 1 from diceforge_v2.creation_states where state_id=p_state and phase='play') then
  raise exception 'Validez la création ou faites trancher les incohérences par le MJ.' using errcode='42501'; end if;
 if p_operation='open' then perform diceforge_v2.session_open(p_state,p_room); end if;
 select * into x from diceforge_v2.xp_sessions where state_id=p_state and room_code=p_room;
 if not found then raise exception 'Session non ouverte.' using errcode='22023'; end if;
 if p_operation in ('unlock','spend') then
  if p_request is null or p_resource is null or p_resource not in ('skill','spell') or p_id is null then
   raise exception 'Identité de requête et cible requises.' using errcode='22023'; end if;
  -- Both ledgers share the same request namespace, including concurrent calls on different states.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into attempt from diceforge_v2.xp_attempts where request_id=p_request;
  if found then
   if p_operation<>'unlock' or attempt.state_id<>p_state or attempt.room_code<>p_room or attempt.resource<>p_resource or attempt.resource_id<>p_id then
    raise exception 'Identité de requête réutilisée.' using errcode='22023'; end if;
   result:=to_jsonb(attempt);
  else
   select * into event from diceforge_v2.point_events where request_id=p_request;
   if found then
    if p_operation<>'spend' or event.state_id<>p_state or event.kind<>'xp' or event.resource<>p_resource or event.resource_id<>p_id
     or event.amount is distinct from p_amount or event.payload->>'room_code'<>p_room then
     raise exception 'Identité de requête réutilisée.' using errcode='22023'; end if;
    result:=to_jsonb(event);
   end if;
  end if;
  if result is null then
   if x.closed_at is not null then raise exception 'Session clôturée : les points restants sont perdus.' using errcode='42501'; end if;
   if p_expected_revision is null or p_expected_revision<>s.sheet_revision then
    raise exception 'Fiche modifiée : rechargez.' using errcode='40001'; end if;
   select * into allocated from diceforge_v2.initial_allocations where state_id=p_state and resource=p_resource and resource_id=p_id;
   if not found then raise exception 'Cible inconnue.' using errcode='22023'; end if;
   current_score:=allocated.score+diceforge_v2.xp_total(p_state,p_resource,p_id);
   if p_resource='skill' then select checked into marked from diceforge_v2.skills where state_id=p_state and skill_id=p_id;
   else select checked into marked from diceforge_v2.spells where state_id=p_state and spell_id=p_id; end if;
   if p_operation='unlock' then
    if not coalesce(marked,false) or current_score>=100 or exists(select 1 from diceforge_v2.xp_attempts
      where state_id=p_state and room_code=p_room and resource=p_resource and resource_id=p_id) then
     raise exception 'Coche requise, score plafonné ou tentative déjà consommée.' using errcode='42501'; end if;
    attempt.roll:=diceforge_v2.roll_d100();
    insert into diceforge_v2.xp_attempts(state_id,room_code,resource,resource_id,roll,score,unlocked,request_id)
    values(p_state,p_room,p_resource,p_id,attempt.roll,current_score,diceforge_v2.unlock_result(current_score,attempt.roll),p_request)
    returning * into attempt;
    result:=to_jsonb(attempt);
   else
    if p_amount is null or p_amount<=0 or p_amount>x.pool-x.spent or current_score+p_amount>100 then
     raise exception 'Montant invalide, pool insuffisant ou score supérieur à 100.' using errcode='22023'; end if;
    if not exists(select 1 from diceforge_v2.xp_attempts where state_id=p_state and room_code=p_room and resource=p_resource and resource_id=p_id and unlocked) then
     raise exception 'Cible non déverrouillée.' using errcode='42501'; end if;
    insert into diceforge_v2.point_events(state_id,kind,resource,resource_id,amount,actor_user_id,request_id,payload)
     values(p_state,'xp',p_resource,p_id,p_amount,uid,p_request,jsonb_build_object('room_code',p_room)) returning * into event;
    if p_resource='skill' then update diceforge_v2.skills set points=points+p_amount,score=score+p_amount where state_id=p_state and skill_id=p_id;
    else update diceforge_v2.spells set points=points+p_amount where state_id=p_state and spell_id=p_id; end if;
    update diceforge_v2.xp_sessions set spent=spent+p_amount where state_id=p_state and room_code=p_room;
    result:=to_jsonb(event);
   end if;
   update diceforge_v2.states set sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=p_state;
  end if;
 elsif p_operation='close' and x.closed_at is null then
  if p_expected_revision is null or p_expected_revision<>s.sheet_revision then raise exception 'Fiche modifiée : rechargez.' using errcode='40001'; end if;
  update diceforge_v2.xp_sessions set closed_at=clock_timestamp(),lost=pool-spent where state_id=p_state and room_code=p_room;
  update diceforge_v2.states set sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=p_state;
 end if;
 result:=diceforge_v2.session_metadata(p_state,p_room);
 return jsonb_build_object('sheet_data',jsonb_set(diceforge_v2.sheet(p_state),'{progression,session}',result),'session',result,'receipt',
  case when p_operation='unlock' then to_jsonb(attempt) when p_operation='spend' then to_jsonb(event) else null end);
end $$;

-- Creation validation starts the first session immediately, avoiding a stale revision on the next save.
do $$ begin
 if to_regprocedure('diceforge_v2.validate_creation_base(uuid,text,bigint)') is null then
  alter function public.df_validate_creation(uuid,text,bigint) set schema diceforge_v2;
  alter function diceforge_v2.df_validate_creation(uuid,text,bigint) rename to validate_creation_base;
 end if;
end $$;
create or replace function public.df_validate_creation(p_state uuid,p_room text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 result:=diceforge_v2.validate_creation_base(p_state,p_room,p_expected_revision);
 if exists(select 1 from diceforge_v2.creation_states where state_id=p_state and phase='play') then
  perform public.df_progression(p_state,p_room,'open');
 end if;
 return result || jsonb_build_object('sheet_data',diceforge_v2.sheet(p_state));
end $$;
revoke all on function public.df_validate_creation(uuid,text,bigint) from public,anon;
grant execute on function public.df_validate_creation(uuid,text,bigint) to authenticated;

-- Original persistence stays private. The public boundary opens only the caller's own playable sheet,
-- never another player's sheet viewed by the MJ. State locking serializes reconnects and XP writes.
do $$ begin
 if to_regprocedure('diceforge_v2.character_query_base(text,text,jsonb,jsonb,text)') is null then
  alter function public.df_character_query(text,text,jsonb,jsonb,text) set schema diceforge_v2;
  alter function diceforge_v2.df_character_query(text,text,jsonb,jsonb,text) rename to character_query_base;
 end if;
end $$;
create or replace function public.df_character_query(p_resource text,p_operation text default 'read',p_filters jsonb default '{}',p_payload jsonb default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb; row jsonb; sid uuid; phase text; projected jsonb:='[]';
begin
 if p_room is not null and (p_resource='pj_sheets' or (p_resource='personnages' and p_operation='read'))
  and coalesce((select enabled from diceforge_v2.configuration),false) then
  result:=diceforge_v2.character_query_base(p_resource,'read',p_filters,null,p_room);
  for row in select value from jsonb_array_elements(coalesce(result->'rows','[]')) loop
   if row->>'user_id'=auth.uid()::text and (p_operation='read' or p_payload->>'character_name' is null
    or row->>'character_name'=p_payload->>'character_name' or row->>'character_id'=p_payload->'sheet_data'->>'character_id') then
    sid:=(row->>'state_id')::uuid;
    perform 1 from diceforge_v2.states where id=sid for update;
    select cs.phase into phase from diceforge_v2.creation_states cs where state_id=sid;
    if phase='play' then
     -- Membership is checked by df_progression before a session may be opened.
     perform public.df_progression(sid,p_room,'open');
     if p_operation<>'read' and exists(select 1 from diceforge_v2.xp_sessions where state_id=sid and room_code=p_room and closed_at is not null) then
      raise exception 'Ancienne session clôturée : fiche en lecture seule dans ce salon.' using errcode='42501'; end if;
    end if;
   end if;
  end loop;
 end if;
 result:=diceforge_v2.character_query_base(p_resource,p_operation,p_filters,p_payload,p_room);
 if p_resource='pj_sheets' and not coalesce((result->>'legacy')::boolean,false) then
  for row in select value from jsonb_array_elements(coalesce(result->'rows','[]')) loop
   row:=jsonb_set(row,'{sheet_data,progression,session}',coalesce(diceforge_v2.session_metadata((row->>'state_id')::uuid,p_room),'null'));
   projected:=projected || jsonb_build_array(row);
  end loop;
  result:=result || jsonb_build_object('rows',projected);
 end if;
 return result;
end $$;
revoke all on all functions in schema diceforge_v2 from public,anon,authenticated;
revoke all on function public.df_progression(uuid,text,text,text,text,integer,uuid,bigint),public.df_character_query(text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.df_progression(uuid,text,text,text,text,integer,uuid,bigint),public.df_character_query(text,text,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
