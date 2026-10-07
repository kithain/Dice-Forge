-- Apply after campaign-valombre.sql and the current character-v2 migrations.
-- Rooms carry the authoritative campaign. Permanent identities may have one
-- independent state per campaign; they deliberately have no single campaign_id.
begin;

alter table diceforge_v2.campaigns add column if not exists description text not null default '';
alter table diceforge_v2.campaigns add column if not exists archived_at timestamptz;
alter table diceforge_v2.campaigns alter column id set default gen_random_uuid();
alter table diceforge_v2.campaigns alter column reference_room drop not null;
alter table public.rooms add column if not exists campaign_id uuid;
do $$ begin
 if exists(select 1 from public.rooms where campaign_id is null) then
  raise exception 'Exécutez la reprise Valombre avant la gestion des campagnes.';
 end if;
 if exists(select 1 from public.rooms r join diceforge_v2.campaign_rooms cr using(room_code)
  where cr.campaign_id is distinct from r.campaign_id) then
  raise exception 'Rattachements de campagnes incohérents : reprise préalable requise.';
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.rooms'::regclass and conname='rooms_campaign_id_fkey') then
  alter table public.rooms add constraint rooms_campaign_id_fkey foreign key(campaign_id) references diceforge_v2.campaigns(id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='public.rooms'::regclass and conname='df_rooms_campaign_identity') then
  alter table public.rooms add constraint df_rooms_campaign_identity unique(room_code,campaign_id);
 end if;
 if not exists(select 1 from pg_constraint where conrelid='diceforge_v2.campaign_rooms'::regclass and conname='df_campaign_room_matches_room') then
  alter table diceforge_v2.campaign_rooms add constraint df_campaign_room_matches_room
   foreign key(room_code,campaign_id) references public.rooms(room_code,campaign_id);
 end if;
end $$;
alter table public.rooms alter column campaign_id set not null;
create index if not exists df_rooms_campaign_idx on public.rooms(campaign_id);
insert into diceforge_v2.campaign_rooms(room_code,campaign_id)
 select room_code,campaign_id from public.rooms on conflict(room_code) do nothing;

create or replace function diceforge_v2.can_manage_campaign(p_campaign uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(
  select 1 from diceforge_v2.campaigns c join diceforge_v2.mj_users m on m.user_id=c.owner_user_id
  where c.id=p_campaign and c.owner_user_id=auth.uid() and c.archived_at is null)
$$;
create or replace function diceforge_v2.can_access_campaign(p_campaign uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from diceforge_v2.campaigns c
  where c.id=p_campaign and c.archived_at is null and
   (diceforge_v2.can_manage_campaign(c.id) or exists(
    select 1 from public.rooms r join public.room_members rm using(room_code)
    where r.campaign_id=c.id and rm.user_id=auth.uid())))
$$;

-- Replaces the original MJ trigger: direct INSERT is subject to the same rules
-- as the RPC, including an explicit campaign owned by an administratively set MJ.
create or replace function diceforge_v2.guard_mj_room() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.campaign_id is null then
  raise exception 'Sélectionnez une campagne pour créer le salon.' using errcode='22023';
 end if;
 if new.owner_id is distinct from auth.uid() or not diceforge_v2.can_manage_campaign(new.campaign_id) then
  raise exception 'Création de salon réservée au MJ de cette campagne.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists df_mj_room on public.rooms;
create trigger df_mj_room before insert on public.rooms for each row execute function diceforge_v2.guard_mj_room();

create or replace function diceforge_v2.guard_room_campaign() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if new.campaign_id is distinct from old.campaign_id then
  raise exception 'Un salon ne peut pas changer de campagne.' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists df_room_campaign_immutable on public.rooms;
create trigger df_room_campaign_immutable before update on public.rooms for each row execute function diceforge_v2.guard_room_campaign();

create or replace function diceforge_v2.guard_campaign_room_link() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.rooms where room_code=old.room_code) then
   raise exception 'Le rattachement obligatoire du salon ne peut pas être supprimé.' using errcode='22023';
  end if;
  return old;
 end if;
 if tg_op='UPDATE' and (new.room_code is distinct from old.room_code or new.campaign_id is distinct from old.campaign_id) then
  raise exception 'Le rattachement du salon est immuable.' using errcode='22023';
 end if;
 if not exists(select 1 from public.rooms r where r.room_code=new.room_code and r.campaign_id=new.campaign_id) then
  raise exception 'Le rattachement doit correspondre à la campagne du salon.' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists df_campaign_room_consistent on diceforge_v2.campaign_rooms;
create trigger df_campaign_room_consistent before insert or update or delete on diceforge_v2.campaign_rooms
 for each row execute function diceforge_v2.guard_campaign_room_link();

create or replace function diceforge_v2.sync_room_campaign() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 insert into diceforge_v2.campaign_rooms(room_code,campaign_id) values(new.room_code,new.campaign_id) on conflict(room_code) do nothing;
 update diceforge_v2.campaigns set reference_room=new.room_code where id=new.campaign_id and reference_room is null;
 return new;
end $$;
drop trigger if exists df_sync_room_campaign on public.rooms;
create trigger df_sync_room_campaign after insert on public.rooms for each row execute function diceforge_v2.sync_room_campaign();

create or replace function public.df_campaigns(p_operation text default 'list',p_campaign uuid default null,
 p_name text default null,p_description text default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); mj boolean; chosen diceforge_v2.campaigns; result jsonb; answer jsonb;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if p_operation is null or p_operation not in ('list','create','update','room') then
  raise exception 'Opération de campagne inconnue.' using errcode='22023';
 end if;
 mj:=exists(select 1 from diceforge_v2.mj_users where user_id=uid);
 if p_operation in ('create','update') then
  if not mj then raise exception 'Gestion des campagnes réservée au MJ.' using errcode='42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 1 and 120
    or char_length(coalesce(p_description,''))>10000 then
   raise exception 'Nom de campagne requis (120 caractères maximum) et description de 10 000 caractères maximum.' using errcode='22023';
  end if;
  if p_operation='create' then
   insert into diceforge_v2.campaigns(name,description,owner_user_id)
    values(trim(p_name),trim(coalesce(p_description,'')),uid) returning * into chosen;
  else
   if not diceforge_v2.can_manage_campaign(p_campaign) then
    raise exception 'Vous ne gérez pas cette campagne.' using errcode='42501';
   end if;
   update diceforge_v2.campaigns set name=trim(p_name),description=trim(coalesce(p_description,''))
    where id=p_campaign and owner_user_id=uid and archived_at is null returning * into chosen;
   if not found then raise exception 'Campagne inaccessible.' using errcode='42501'; end if;
  end if;
 elsif p_operation='room' then
  select c.* into chosen from public.rooms r join diceforge_v2.campaigns c on c.id=r.campaign_id
   where r.room_code=p_room and c.archived_at is null
    and (diceforge_v2.can_manage_campaign(c.id) or exists(
     select 1 from public.room_members rm where rm.room_code=r.room_code and rm.user_id=uid));
  if not found then raise exception 'Rejoignez le salon pour consulter sa campagne.' using errcode='42501'; end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'description',c.description,
  'can_manage',diceforge_v2.can_manage_campaign(c.id),
  'room_count',(select count(*) from public.rooms r where r.campaign_id=c.id)) order by lower(c.name),c.id),'[]')
  into result from diceforge_v2.campaigns c where diceforge_v2.can_access_campaign(c.id);
 answer:=jsonb_build_object('is_mj',mj,'campaigns',result);
 if chosen.id is not null then
  answer:=answer || jsonb_build_object('campaign',jsonb_build_object('id',chosen.id,'name',chosen.name,'description',chosen.description));
 end if;
 return answer;
end $$;

create or replace function public.df_create_session_room(p_source text,p_code text,p_name text,p_campaign uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign_name text;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if p_campaign is null then raise exception 'Sélectionnez une campagne pour créer le salon.' using errcode='22023'; end if;
 if not diceforge_v2.can_manage_campaign(p_campaign) then
  raise exception 'Création de salon réservée au MJ de cette campagne.' using errcode='42501';
 end if;
 if p_code is null or p_code !~ '^[A-Z0-9]{4}$' or nullif(trim(p_name),'') is null then
  raise exception 'Code ou nom invalide.' using errcode='22023';
 end if;
 if nullif(trim(p_source),'') is not null and not exists(
  select 1 from public.rooms where room_code=p_source and campaign_id=p_campaign and owner_id=uid) then
  raise exception 'Le salon source doit appartenir à la campagne sélectionnée.' using errcode='42501';
 end if;
 select name into campaign_name from diceforge_v2.campaigns where id=p_campaign for update;
 -- Insertion, link trigger and MJ membership commit together or roll back together.
 insert into public.rooms(room_code,owner_id,owner_name,campaign_id) values(p_code,uid,trim(p_name),p_campaign);
 insert into public.room_members(room_code,user_id,player_name) values(p_code,uid,trim(p_name));
 return jsonb_build_object('room_code',p_code,'campaign_id',p_campaign,'campaign_name',campaign_name);
end $$;

-- Transitional clients may continue an existing campaign, never create an
-- unnamed campaign. New clients always use the four-argument RPC above.
create or replace function public.df_create_session_room(p_source text,p_code text,p_name text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare campaign uuid;
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if nullif(trim(p_source),'') is null then
  raise exception 'Sélectionnez une campagne avant de créer un salon.' using errcode='22023';
 end if;
 select campaign_id into campaign from public.rooms where room_code=p_source;
 if campaign is null then raise exception 'Salon source inconnu.' using errcode='42501'; end if;
 return public.df_create_session_room(p_source,p_code,p_name,campaign);
end $$;

create or replace function public.df_link_campaign_room(p_source text,p_target text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare campaign uuid; target_campaign uuid;
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if nullif(trim(p_source),'') is null then
  raise exception 'Le rattachement exige un salon source et une campagne existante.' using errcode='22023';
 end if;
 select campaign_id into campaign from public.rooms where room_code=p_source;
 if not diceforge_v2.can_manage_campaign(campaign) then
  raise exception 'Vous ne gérez pas cette campagne.' using errcode='42501';
 end if;
 select campaign_id into target_campaign from public.rooms where room_code=p_target and owner_id=auth.uid() for update;
 if target_campaign is null then raise exception 'Salon cible inaccessible.' using errcode='42501'; end if;
 if target_campaign<>campaign then raise exception 'Salon déjà lié à une autre campagne.' using errcode='22023'; end if;
 insert into diceforge_v2.campaign_rooms(room_code,campaign_id) values(p_target,campaign) on conflict(room_code) do nothing;
 return campaign;
end $$;

-- Keep deletion, preset, generation and progression behavior behind the new
-- campaign boundary rather than replacing their implementations.
do $$ begin
 if to_regprocedure('diceforge_v2.character_roster_before_campaign_management(text,text,uuid,uuid)') is null then
  alter function public.df_character_roster(text,text,uuid,uuid) set schema diceforge_v2;
  alter function diceforge_v2.df_character_roster(text,text,uuid,uuid) rename to character_roster_before_campaign_management;
 end if;
 if to_regprocedure('diceforge_v2.character_query_before_campaign_management(text,text,jsonb,jsonb,text)') is null then
  alter function public.df_character_query(text,text,jsonb,jsonb,text) set schema diceforge_v2;
  alter function diceforge_v2.df_character_query(text,text,jsonb,jsonb,text) rename to character_query_before_campaign_management;
 end if;
end $$;

create or replace function diceforge_v2.can_read(p_state uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from diceforge_v2.states s
  join diceforge_v2.characters c on c.id=s.character_id
  where s.id=p_state and c.status<>'deleted' and diceforge_v2.can_access_campaign(s.campaign_id)
   and (c.owner_user_id=auth.uid() or diceforge_v2.can_manage_campaign(s.campaign_id)))
$$;

create or replace function public.df_character_roster(p_room text,p_operation text default 'list',
 p_character uuid default null,p_reserved_user uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; result jsonb; characters jsonb; trash jsonb;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 select r.campaign_id into campaign from public.rooms r join diceforge_v2.campaigns c on c.id=r.campaign_id
  where r.room_code=p_room and c.archived_at is null;
 if campaign is null or (not diceforge_v2.can_manage_campaign(campaign)
  and not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)) then
  raise exception 'Rejoignez le salon de la campagne.' using errcode='42501';
 end if;
 -- Cross-campaign attachment is an explicit owner action. Other operations
 -- cannot silently import an identity, including MJ offer/preset/deletion.
 if p_character is not null and p_operation not in ('list','new','attach')
  and not exists(select 1 from diceforge_v2.states where campaign_id=campaign and character_id=p_character) then
  raise exception 'Ce personnage n’est pas rattaché à cette campagne.' using errcode='42501';
 end if;
 result:=diceforge_v2.character_roster_before_campaign_management(p_room,p_operation,p_character,p_reserved_user);
 select coalesce(jsonb_agg(e.value || jsonb_build_object('campaign_id',campaign) order by e.ordinality),'[]') into characters
  from jsonb_array_elements(coalesce(result->'characters','[]')) with ordinality e(value,ordinality)
  where exists(select 1 from diceforge_v2.states s where s.campaign_id=campaign and s.character_id=(e.value->>'character_id')::uuid);
 select coalesce(jsonb_agg(e.value || jsonb_build_object('campaign_id',campaign) order by e.ordinality),'[]') into trash
  from jsonb_array_elements(coalesce(result->'deleted_characters','[]')) with ordinality e(value,ordinality)
  where exists(select 1 from diceforge_v2.states s where s.campaign_id=campaign and s.character_id=(e.value->>'character_id')::uuid);
 return result || jsonb_build_object('characters',characters,'deleted_characters',trash,'campaign_id',campaign);
end $$;

create or replace function public.df_character_query(p_resource text,p_operation text default 'read',p_filters jsonb default '{}',
 p_payload jsonb default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; target uuid; filters jsonb:=coalesce(p_filters,'{}');
 result jsonb; row jsonb; rows jsonb:='[]';
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 select r.campaign_id into campaign from public.rooms r join diceforge_v2.campaigns c on c.id=r.campaign_id
  where r.room_code=p_room and c.archived_at is null;
 if campaign is null or (not diceforge_v2.can_manage_campaign(campaign)
  and not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)) then
  raise exception 'Rejoignez le salon de la campagne.' using errcode='42501';
 end if;
 if filters ? 'campaign_id' and filters->>'campaign_id' is distinct from campaign::text then
  if p_operation='read' then return jsonb_build_object('rows','[]'::jsonb); end if;
  raise exception 'Campagne incorrecte.' using errcode='22023';
 end if;
 filters:=filters-'campaign_id';
 if (p_payload ? 'campaign_id' and p_payload->>'campaign_id' is distinct from campaign::text)
  or (p_payload->'sheet_data' ? 'campaign_id' and p_payload->'sheet_data'->>'campaign_id' is distinct from campaign::text)
  or (p_payload ? 'room_code' and p_payload->>'room_code' is distinct from p_room) then
  raise exception 'La sauvegarde doit appartenir à la campagne et au salon courants.' using errcode='22023';
 end if;
 if p_operation<>'read' then
  target:=coalesce(nullif(filters->>'character_id','')::uuid,nullif(p_payload->'sheet_data'->>'character_id','')::uuid,
   nullif(p_payload->>'character_id','')::uuid,nullif(p_payload->>'__character_id','')::uuid);
  if filters ? 'id' then
   select character_id into target from diceforge_v2.states where id=(filters->>'id')::uuid and campaign_id=campaign;
   if target is null then raise exception 'Fiche extérieure à cette campagne.' using errcode='42501'; end if;
  end if;
  if target is null then
   select character_id into target from diceforge_v2.character_selections where campaign_id=campaign and user_id=uid;
   if target is null then
    select c.id into target from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
     where s.campaign_id=campaign and c.owner_user_id=uid and c.status='active'
      and c.name=coalesce(p_payload->>'nom',p_payload->>'character_name') limit 1;
   end if;
  end if;
  if target is not null and not exists(select 1 from diceforge_v2.states where campaign_id=campaign and character_id=target) then
   raise exception 'Reprenez explicitement ce personnage dans cette campagne avant de sauvegarder.' using errcode='42501';
  end if;
  if target is null then
   raise exception 'Créez le personnage avec le générateur de la campagne.' using errcode='42501';
  end if;
  if target is not null then filters:=filters || jsonb_build_object('character_id',target); end if;
 end if;
 result:=diceforge_v2.character_query_before_campaign_management(p_resource,p_operation,filters,p_payload,p_room);
 for row in select value from jsonb_array_elements(coalesce(result->'rows','[]')) loop
  row:=row || jsonb_build_object('campaign_id',campaign);
  if p_resource='pj_inventory' then row:=row || jsonb_build_object('character_id',row->'character_id'); end if;
  rows:=rows || jsonb_build_array(row);
 end loop;
 return result || jsonb_build_object('rows',rows,'campaign_id',campaign);
end $$;

-- All browser entry points authenticate and authorize internally. Private
-- helpers and preserved implementations remain inaccessible through the API.
revoke all on function diceforge_v2.can_manage_campaign(uuid),diceforge_v2.can_access_campaign(uuid),
 diceforge_v2.guard_mj_room(),diceforge_v2.guard_room_campaign(),diceforge_v2.guard_campaign_room_link(),diceforge_v2.sync_room_campaign(),
 diceforge_v2.can_read(uuid),diceforge_v2.character_roster_before_campaign_management(text,text,uuid,uuid),
 diceforge_v2.character_query_before_campaign_management(text,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.df_campaigns(text,uuid,text,text,text),public.df_create_session_room(text,text,text,uuid),
 public.df_create_session_room(text,text,text),public.df_link_campaign_room(text,text),
 public.df_character_roster(text,text,uuid,uuid),public.df_character_query(text,text,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.df_campaigns(text,uuid,text,text,text),public.df_create_session_room(text,text,text,uuid),
 public.df_create_session_room(text,text,text),public.df_link_campaign_room(text,text),
 public.df_character_roster(text,text,uuid,uuid),public.df_character_query(text,text,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
