-- Apply after progression-publication.sql. No change to historical scores or budgets.
begin;
alter table diceforge_v2.initial_allocations drop constraint if exists initial_allocations_origin_check;
alter table diceforge_v2.initial_allocations add constraint initial_allocations_origin_check check(origin in ('creation','inherited','learning'));
create or replace function diceforge_v2.roll_d6() returns integer
language sql volatile set search_path=pg_catalog as $$ select floor(random()*6)::integer+1 $$;
create or replace function diceforge_v2.allocation_metadata(p_state uuid,p_resource text,p_id text) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select coalesce((select jsonb_build_object('origin',origin,'base',base,'points',points,'score',score,
 'creation_points',case when origin='creation' then points else null end,
 'inherited_points',case when origin='inherited' then points else null end,
 'xp_points',diceforge_v2.xp_total(p_state,p_resource,p_id),
 'learning_points',case when origin='learning' then points else 0 end,
 'learning',case when origin='learning' then payload else null end)
 from diceforge_v2.initial_allocations where state_id=p_state and resource=p_resource and resource_id=p_id),'{}')
$$;
create or replace function diceforge_v2.progression_metadata(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('xp_points',coalesce((select sum(amount) from diceforge_v2.point_events where state_id=p_state and kind='xp'),0),
 'learning_points',coalesce((select sum(amount) from diceforge_v2.point_events where state_id=p_state and kind='spell_learning'),0),
 'session',(select diceforge_v2.session_metadata(p_state,x.room_code) from diceforge_v2.xp_sessions x where state_id=p_state order by opened_at desc limit 1))
$$;
create or replace function public.df_learn_spell(p_state uuid,p_room text,p_spell text,p_source text,p_method text,
 p_study_days integer,p_confirmed boolean,p_request uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s diceforge_v2.states; uid uuid:=auth.uid(); previous diceforge_v2.point_events;
 dice jsonb; score integer; receipt jsonb; spell_name text;
begin
 if uid is null or not coalesce((select enabled from diceforge_v2.configuration),false) then raise exception 'Apprentissage indisponible.' using errcode='42501'; end if;
 select st.* into s from diceforge_v2.states st join diceforge_v2.characters c on c.id=st.character_id
 join diceforge_v2.campaign_rooms r on r.campaign_id=st.campaign_id and r.room_code=p_room
 where st.id=p_state and c.owner_user_id=uid and c.status='active' for update of st;
 if not found or (not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)
 and not exists(select 1 from diceforge_v2.campaigns where id=s.campaign_id and owner_user_id=uid)) then raise exception 'Fiche ou salon non autorisé.' using errcode='42501'; end if;
 if p_request is null then raise exception 'Identité de requête requise.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from diceforge_v2.point_events where request_id=p_request;
 if found then
  if previous.state_id<>p_state or previous.kind<>'spell_learning' or previous.resource_id is distinct from p_spell
   or previous.payload->>'room_code' is distinct from p_room or previous.payload->>'source' is distinct from trim(p_source)
   or previous.payload->>'method' is distinct from p_method or (previous.payload->>'study_days')::integer is distinct from p_study_days
   or p_confirmed is distinct from true then raise exception 'Identité de requête réutilisée.' using errcode='22023'; end if;
  return jsonb_build_object('sheet_data',jsonb_set(diceforge_v2.sheet(p_state),'{progression,session}',coalesce(diceforge_v2.session_metadata(p_state,p_room),'null')),'receipt',previous.payload);
 end if;
 if exists(select 1 from diceforge_v2.xp_attempts where request_id=p_request) then raise exception 'Identité de requête réutilisée.' using errcode='22023'; end if;
 if not exists(select 1 from diceforge_v2.creation_states where state_id=p_state and phase='play')
 or not exists(select 1 from diceforge_v2.xp_sessions where state_id=p_state and room_code=p_room and closed_at is null) then
  raise exception 'Apprentissage réservé à une fiche validée dans sa session active.' using errcode='42501'; end if;
 if p_expected_revision is null or p_expected_revision<>s.sheet_revision then raise exception 'Fiche modifiée : rechargez.' using errcode='40001'; end if;
 if p_confirmed is distinct from true or nullif(trim(p_source),'') is null or length(p_source)>500
 or p_method is null or p_method not in ('text','mentor') or p_study_days is null or p_study_days<1 then
  raise exception 'Source, durée d’étude et confirmation de réussite après accord oral du MJ requises.' using errcode='22023'; end if;
 select name into spell_name from diceforge_v2.spell_catalog where id=p_spell;
 if not found then raise exception 'Sort inconnu.' using errcode='22023'; end if;
 if exists(select 1 from diceforge_v2.spells where state_id=p_state and spell_id=p_spell) then raise exception 'Ce sort est déjà connu : aucun nouveau tirage.' using errcode='42501'; end if;
 dice:=jsonb_build_array(diceforge_v2.roll_d6(),diceforge_v2.roll_d6(),diceforge_v2.roll_d6());
 select 20+sum(value::integer) into score from jsonb_array_elements_text(dice);
 receipt:=jsonb_build_object('room_code',p_room,'spell_id',p_spell,'name',spell_name,'source',trim(p_source),'method',p_method,
  'study_days',p_study_days,'dice',dice,'score',score,'request_id',p_request,'confirmed_orally',true);
 insert into diceforge_v2.point_events(state_id,kind,resource,resource_id,amount,actor_user_id,request_id,payload)
 values(p_state,'spell_learning','spell',p_spell,score,uid,p_request,receipt);
 -- Reserved attribution is created first, so every ordinary insert/save is still guarded by the same numeric baseline.
 insert into diceforge_v2.initial_allocations(state_id,resource,resource_id,origin,base,points,score,payload)
 values(p_state,'spell',p_spell,'learning',0,score,score,receipt);
 insert into diceforge_v2.spells(id,state_id,spell_id,legacy_index,raw_payload,points,checked)
 values(gen_random_uuid(),p_state,p_spell,(select coalesce(max(legacy_index),-1)+1 from diceforge_v2.spells where state_id=p_state),
  jsonb_build_object('id',p_spell,'name',spell_name),score,false);
 update diceforge_v2.states set sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=p_state;
 return jsonb_build_object('sheet_data',jsonb_set(diceforge_v2.sheet(p_state),'{progression,session}',coalesce(diceforge_v2.session_metadata(p_state,p_room),'null')),'receipt',receipt);
end $$;
revoke all on function diceforge_v2.roll_d6(),diceforge_v2.allocation_metadata(uuid,text,text),diceforge_v2.progression_metadata(uuid) from public,anon,authenticated;
revoke all on function public.df_learn_spell(uuid,text,text,text,text,integer,boolean,uuid,bigint) from public,anon;
grant execute on function public.df_learn_spell(uuid,text,text,text,text,integer,boolean,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
