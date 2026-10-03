-- After spell-learning.sql. Permanent identities, availability and death.
begin;
alter table diceforge_v2.characters drop constraint if exists characters_status_check;
alter table diceforge_v2.characters add constraint characters_status_check check(status in ('active','archived','dead'));
create table if not exists diceforge_v2.character_roster (
 campaign_id uuid references diceforge_v2.campaigns(id), character_id uuid references diceforge_v2.characters(id),
 available boolean not null default false, preset boolean not null default false,
 reserved_user_id uuid references auth.users(id), primary key(campaign_id,character_id)
);
create table if not exists diceforge_v2.character_selections (
 campaign_id uuid references diceforge_v2.campaigns(id), user_id uuid references auth.users(id),
 character_id uuid references diceforge_v2.characters(id), primary key(campaign_id,user_id)
);
create table if not exists diceforge_v2.character_lifecycle_events (
 id uuid primary key default gen_random_uuid(), campaign_id uuid references diceforge_v2.campaigns(id),
 character_id uuid references diceforge_v2.characters(id), actor uuid references auth.users(id),
 action text not null, payload jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
alter table diceforge_v2.character_roster enable row level security;
alter table diceforge_v2.character_selections enable row level security;
alter table diceforge_v2.character_lifecycle_events enable row level security;
revoke all on diceforge_v2.character_roster,diceforge_v2.character_selections,diceforge_v2.character_lifecycle_events from public,anon,authenticated;
drop trigger if exists df_guard_lifecycle_history on diceforge_v2.character_lifecycle_events;
create trigger df_guard_lifecycle_history before update or delete on diceforge_v2.character_lifecycle_events for each row execute function diceforge_v2.guard_point_history();
insert into diceforge_v2.character_roster(campaign_id,character_id,available)
 select s.campaign_id,s.character_id,c.status='active' from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
 on conflict do nothing;
insert into diceforge_v2.character_selections(campaign_id,user_id,character_id)
 select s.campaign_id,c.owner_user_id,(array_agg(c.id))[1] from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
 where c.status='active' and c.owner_user_id is not null group by s.campaign_id,c.owner_user_id having count(*)=1
 on conflict do nothing;

create or replace function public.df_character_roster(p_room text,p_operation text default 'list',p_character uuid default null,p_reserved_user uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; mj boolean; c diceforge_v2.characters; r diceforge_v2.character_roster;
 selected uuid; result jsonb; data jsonb; sid uuid;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 select cr.campaign_id into campaign from diceforge_v2.campaign_rooms cr where room_code=p_room;
 if campaign is null then raise exception 'Salon sans campagne' using errcode='42501'; end if;
 mj:=exists(select 1 from diceforge_v2.campaigns a join diceforge_v2.mj_users m on m.user_id=a.owner_user_id where a.id=campaign and a.owner_user_id=uid);
 if not mj and not exists(select 1 from public.room_members where room_code=p_room and user_id=uid) then raise exception 'Rejoignez le salon' using errcode='42501'; end if;
 if p_operation not in ('list','select','attach','offer','withdraw','dead','preset','new') then raise exception 'Opération inconnue' using errcode='22023'; end if;
 if p_operation='new' then
  perform 1 from diceforge_v2.campaigns where id=campaign for update;
  insert into diceforge_v2.character_selections values(campaign,uid,null) on conflict(campaign_id,user_id) do update set character_id=null;
 elsif p_operation<>'list' then
  -- All selection/availability operations in a campaign serialize, including first attribution.
  perform 1 from diceforge_v2.campaigns where id=campaign for update;
  select * into c from diceforge_v2.characters where id=p_character for update;
  if not found then raise exception 'Personnage inconnu' using errcode='42501'; end if;
  select * into r from diceforge_v2.character_roster where campaign_id=campaign and character_id=c.id;
  if p_operation in ('offer','withdraw','dead','preset') and not mj then raise exception 'Action réservée au MJ de cette campagne' using errcode='42501'; end if;
  if p_operation='attach' then
   if c.owner_user_id is distinct from uid or c.status<>'active' then raise exception 'Reprise réservée au propriétaire d’un PJ vivant' using errcode='42501'; end if;
   if not exists(select 1 from diceforge_v2.states where campaign_id=campaign and character_id=c.id) then
    data:=jsonb_build_object('fields',jsonb_build_object('name',c.name,'player',c.source_player_name,'profession',coalesce(c.initial_record->>'profession',''),'race',coalesce(c.initial_record->>'espece',''),'skillProfessionalPool','325','movement',coalesce(c.initial_record->>'mouvement','10')),
     'stats',coalesce((select jsonb_object_agg(case key when 'charisme' then 'apparence' else key end,value) from jsonb_each(c.initial_record) where key in ('force','constitution','taille','intelligence','pouvoir','dexterite','charisme')),'{}'),
     'skills','[]'::jsonb,'spells','[]'::jsonb,'weapons','[]'::jsonb);
    insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
     values(gen_random_uuid(),campaign,c.id,'{}','{}','{}','') returning id into sid;
    perform diceforge_v2.save_sheet(sid,data);
   end if;
   insert into diceforge_v2.character_roster(campaign_id,character_id,available) values(campaign,c.id,true) on conflict do nothing;
  elsif p_operation in ('offer','preset') then
   if c.status<>'active' then raise exception 'Un PJ mort ou archivé ne peut pas être proposé' using errcode='42501'; end if;
   if not exists(select 1 from diceforge_v2.states where campaign_id=campaign and character_id=c.id) then
    if c.owner_user_id is distinct from uid then raise exception 'PJ extérieur à cette campagne' using errcode='42501'; end if;
    perform public.df_character_roster(p_room,'attach',c.id);
   end if;
   if p_operation='preset' then
    if c.owner_user_id is distinct from uid or exists(select 1 from diceforge_v2.states where character_id=c.id and campaign_id<>campaign)
      or exists(select 1 from diceforge_v2.xp_sessions x join diceforge_v2.states s on s.id=x.state_id where s.character_id=c.id)
      then raise exception 'Un prétiré doit appartenir au MJ, sans autre campagne ni session jouée' using errcode='42501'; end if;
    if p_reserved_user is not null and not exists(select 1 from public.room_members rm join diceforge_v2.campaign_rooms cr on cr.room_code=rm.room_code where cr.campaign_id=campaign and rm.user_id=p_reserved_user) then raise exception 'Joueur hors campagne' using errcode='42501'; end if;
   end if;
   insert into diceforge_v2.character_roster(campaign_id,character_id,available,preset,reserved_user_id)
    values(campaign,c.id,true,p_operation='preset',case when p_operation='preset' then p_reserved_user end)
    on conflict(campaign_id,character_id) do update set available=true,preset=case when p_operation='preset' then true else character_roster.preset end,
     reserved_user_id=case when p_operation='preset' then p_reserved_user else character_roster.reserved_user_id end;
  elsif p_operation='withdraw' then
   if r.character_id is null then raise exception 'PJ extérieur à cette campagne' using errcode='42501'; end if;
   update diceforge_v2.character_roster set available=false where campaign_id=campaign and character_id=c.id;
  elsif p_operation='dead' then
   if r.character_id is null then raise exception 'PJ extérieur à cette campagne' using errcode='42501'; end if;
   update diceforge_v2.characters set status='dead' where id=c.id;
   update diceforge_v2.character_roster set available=false where character_id=c.id;
   delete from diceforge_v2.character_selections where character_id=c.id;
   update diceforge_v2.xp_sessions set closed_at=clock_timestamp(),lost=pool-spent where state_id in(select id from diceforge_v2.states where character_id=c.id) and closed_at is null;
  elsif p_operation='select' then
   if c.status<>'active' or not coalesce(r.available,false) or not exists(select 1 from diceforge_v2.states where campaign_id=campaign and character_id=c.id) then raise exception 'Ce PJ n’est pas disponible' using errcode='42501'; end if;
   if c.owner_user_id is distinct from uid then
    if not r.preset or (r.reserved_user_id is not null and r.reserved_user_id<>uid)
      or c.owner_user_id is distinct from (select owner_user_id from diceforge_v2.campaigns where id=campaign)
      or exists(select 1 from diceforge_v2.states where character_id=c.id and campaign_id<>campaign)
      or exists(select 1 from diceforge_v2.xp_sessions x join diceforge_v2.states s on s.id=x.state_id where s.character_id=c.id)
      then raise exception 'Cette fiche appartient à un autre joueur' using errcode='42501'; end if;
    update diceforge_v2.characters set owner_user_id=uid,source_player_name=coalesce((select max(to_jsonb(rm)->>'player_name') from public.room_members rm where room_code=p_room and user_id=uid),c.source_player_name) where id=c.id;
    update diceforge_v2.character_roster set preset=false,reserved_user_id=null where campaign_id=campaign and character_id=c.id;
    delete from diceforge_v2.character_selections where character_id=c.id and user_id<>uid;
   end if;
   if r.preset then update diceforge_v2.character_roster set preset=false,reserved_user_id=null where campaign_id=campaign and character_id=c.id; end if;
   insert into diceforge_v2.character_selections values(campaign,uid,c.id) on conflict(campaign_id,user_id) do update set character_id=excluded.character_id;
  end if;
  insert into diceforge_v2.character_lifecycle_events(campaign_id,character_id,actor,action,payload) values(campaign,c.id,uid,p_operation,jsonb_build_object('previous_owner',c.owner_user_id,'reserved_user',p_reserved_user));
 end if;
 select character_id into selected from diceforge_v2.character_selections where campaign_id=campaign and user_id=uid;
 select coalesce(jsonb_agg(jsonb_build_object('character_id',ch.id,'state_id',s.id,'name',ch.name,'owner_user_id',ch.owner_user_id,'player_name',ch.source_player_name,
  'status',ch.status,'available',coalesce(ro.available,false),'preset',coalesce(ro.preset,false),'reserved_user_id',ro.reserved_user_id,'needs_sheet',s.id is null,
  'can_select',ch.status='active' and coalesce(ro.available,false) and (ch.owner_user_id=uid or (ro.preset and (ro.reserved_user_id is null or ro.reserved_user_id=uid)))) order by ch.name,ch.id),'[]') into result
 from diceforge_v2.characters ch left join diceforge_v2.states s on s.character_id=ch.id and s.campaign_id=campaign
 left join diceforge_v2.character_roster ro on ro.character_id=ch.id and ro.campaign_id=campaign
 where (s.id is not null or ch.owner_user_id=uid) and (mj or ch.owner_user_id=uid or (ro.available and ro.preset and (ro.reserved_user_id is null or ro.reserved_user_id=uid)))
 and (mj or ch.status='active');
 return jsonb_build_object('characters',result,'selected_character_id',selected,'is_mj',mj,'campaign_id',campaign,
  'members',case when mj then (select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'name',m.name)),'[]') from
   (select rm.user_id,coalesce(max(to_jsonb(rm)->>'player_name'),'Joueur connecté') name from public.room_members rm join diceforge_v2.campaign_rooms cr on cr.room_code=rm.room_code where cr.campaign_id=campaign group by rm.user_id) m) else '[]'::jsonb end);
end $$;

-- Preserve the preceding XP wrapper. Narrow it BEFORE reads can open sessions.
do $$ begin
 if to_regprocedure('diceforge_v2.character_query_before_roster(text,text,jsonb,jsonb,text)') is null then
  alter function public.df_character_query(text,text,jsonb,jsonb,text) set schema diceforge_v2;
  alter function diceforge_v2.df_character_query(text,text,jsonb,jsonb,text) rename to character_query_before_roster;
 end if;
end $$;
create or replace function public.df_character_query(p_resource text,p_operation text default 'read',p_filters jsonb default '{}',p_payload jsonb default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare campaign uuid; selected uuid; target uuid; sid uuid; result jsonb; row jsonb; projected jsonb:='[]'; filters jsonb:=coalesce(p_filters,'{}');
begin
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_room;
 select character_id into selected from diceforge_v2.character_selections where campaign_id=campaign and user_id=auth.uid();
 if p_operation='read' and filters->>'user_id'=auth.uid()::text and selected is null and not filters ? 'id' and not filters ? 'character_id'
  and (exists(select 1 from diceforge_v2.character_selections where campaign_id=campaign and user_id=auth.uid() and character_id is null)
   or (select count(*) from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id where s.campaign_id=campaign and c.owner_user_id=auth.uid() and c.status='active')>1)
  then return jsonb_build_object('rows','[]'::jsonb,'selection_required',true); end if;
 -- Broad MJ reads stay broad; player screens request their own user_id.
 if campaign is not null and filters->>'user_id'=auth.uid()::text and not filters ? 'id' and not filters ? 'character_id' and selected is not null then
  filters:=filters || jsonb_build_object('character_id',selected);
 end if;
 target:=coalesce(nullif(filters->>'character_id','')::uuid,nullif(p_payload->'sheet_data'->>'character_id','')::uuid);
 if filters ? 'id' then select character_id into target from diceforge_v2.states where id=(filters->>'id')::uuid; end if;
 if p_operation<>'read' then
  if target is not null and p_resource in ('pj_sheets','pj_inventory') then
   select id into sid from diceforge_v2.states where campaign_id=campaign and character_id=target;
   if sid is not null then filters:=filters || jsonb_build_object('id',sid); end if;
  end if;
  if target is not null and exists(select 1 from diceforge_v2.characters where id=target and status<>'active') then raise exception 'PJ mort ou archivé : fiche conservée en lecture seule' using errcode='42501'; end if;
  if target is not null and p_resource='personnages' then
   if not exists(select 1 from diceforge_v2.characters where id=target and owner_user_id=auth.uid() and status='active' and name=p_payload->>'nom') then raise exception 'Identité du personnage incorrecte' using errcode='42501'; end if;
   if p_payload->>'user_id' is not null and p_payload->>'user_id'<>auth.uid()::text then raise exception 'Propriétaire incorrect' using errcode='42501'; end if;
   update diceforge_v2.characters set initial_record=initial_record || p_payload,generation=coalesce(p_payload->'generation',generation) where id=target;
   update diceforge_v2.states set
    stats=stats || coalesce((select jsonb_object_agg(case key when 'charisme' then 'apparence' else key end,value) from jsonb_each(p_payload) where key in ('force','constitution','taille','intelligence','pouvoir','dexterite','charisme')),'{}'),
    fields=fields || coalesce((select jsonb_object_agg(case key when 'espece' then 'race' else key end,value) from jsonb_each(p_payload) where key in ('espece','profession')),'{}'),
    sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where campaign_id=campaign and character_id=target;
   return jsonb_build_object('rows',jsonb_build_array(p_payload || jsonb_build_object('character_id',target,'user_id',auth.uid())));
  end if;
 end if;
 if campaign is null then return diceforge_v2.character_query_before_roster(p_resource,p_operation,filters,p_payload,p_room); end if;
 -- Dead characters can be read without opening/reviving XP sessions.
 result:=diceforge_v2.character_query_base(p_resource,'read',filters,null,p_room);
 if p_operation='read' then
  for row in select value from jsonb_array_elements(coalesce(result->'rows','[]')) loop
   if filters->>'user_id'=auth.uid()::text and not filters ? 'id' and not filters ? 'character_id'
    and exists(select 1 from diceforge_v2.characters where id=(row->>'character_id')::uuid and status<>'active') then continue; end if;
   sid:=nullif(row->>'state_id','')::uuid;
   if exists(select 1 from diceforge_v2.characters where id=(row->>'character_id')::uuid and status<>'active')
     or (filters->>'user_id' is distinct from auth.uid()::text and not filters ? 'id' and not filters ? 'character_id') then
    if p_resource='pj_sheets' then row:=jsonb_set(row,'{sheet_data,progression,session}',coalesce(diceforge_v2.session_metadata(sid,p_room),'null')); end if;
   else
    row:=coalesce((diceforge_v2.character_query_before_roster(p_resource,'read',filters || jsonb_build_object('character_id',row->'character_id'),null,p_room))->'rows'->0,row);
   end if;
   row:=row || jsonb_build_object('character_status',(select status from diceforge_v2.characters where id=(row->>'character_id')::uuid));
   if p_resource='pj_sheets' then row:=jsonb_set(row,'{sheet_data,lifecycle}',jsonb_build_object('status',row->'character_status')); end if;
   projected:=projected || jsonb_build_array(row);
  end loop;
  return jsonb_build_object('rows',projected);
 end if;
 return diceforge_v2.character_query_before_roster(p_resource,p_operation,filters,p_payload,p_room);
end $$;
create or replace function diceforge_v2.guard_dead_state() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if exists(select 1 from diceforge_v2.characters where id=new.character_id and status<>'active') then raise exception 'PJ mort ou archivé : aucune modification de fiche' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists df_dead_state on diceforge_v2.states;
create trigger df_dead_state before insert or update on diceforge_v2.states for each row execute function diceforge_v2.guard_dead_state();
create or replace function diceforge_v2.initialize_roster_state() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid; begin
 select owner_user_id into uid from diceforge_v2.characters where id=new.character_id;
 insert into diceforge_v2.character_roster(campaign_id,character_id,available) values(new.campaign_id,new.character_id,true) on conflict do nothing;
 if uid is not null then insert into diceforge_v2.character_selections values(new.campaign_id,uid,new.character_id) on conflict(campaign_id,user_id) do update set character_id=excluded.character_id where character_selections.character_id is null; end if;
 return new;
end $$;
drop trigger if exists df_initialize_roster_state on diceforge_v2.states;
create trigger df_initialize_roster_state after insert on diceforge_v2.states for each row execute function diceforge_v2.initialize_roster_state();
revoke all on all functions in schema diceforge_v2 from public,anon,authenticated;
revoke all on function public.df_character_roster(text,text,uuid,uuid),public.df_character_query(text,text,jsonb,jsonb,text) from public,anon;
grant execute on function public.df_character_roster(text,text,uuid,uuid),public.df_character_query(text,text,jsonb,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
