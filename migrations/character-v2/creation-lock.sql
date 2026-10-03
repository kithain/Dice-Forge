-- Incremental foundation for creation/progression. Apply AFTER save-fixes.sql.
-- Does not deploy XP or learned-spell operations and does not enable character-v2.
begin;

create table if not exists diceforge_v2.creation_states (
 state_id uuid primary key references diceforge_v2.states(id),
 phase text not null check(phase in ('draft','play','legacy_review')),
 origin text not null check(origin in ('creation','inherited')),
 professional_pool integer,
 personal_pool integer,
 validated_at timestamptz,
 validated_by uuid references auth.users(id),
 baseline jsonb,
 review_issues jsonb not null default '[]'
);
create table if not exists diceforge_v2.initial_allocations (
 state_id uuid not null references diceforge_v2.states(id),
 resource text not null check(resource in ('skill','spell')),
 resource_id text not null,
 origin text not null check(origin in ('creation','inherited')),
 base integer, points integer, score integer,
 payload jsonb not null,
 primary key(state_id,resource,resource_id)
);
-- Future XP and acquisition RPCs will record separate, append-only events here.
-- No normal sheet save can produce such an event.
create table if not exists diceforge_v2.point_events (
 id uuid primary key default gen_random_uuid(),
 state_id uuid not null references diceforge_v2.states(id),
 kind text not null check(kind in ('creation_validated','inherited_baseline','xp','spell_learning')),
 resource text check(resource in ('skill','spell')),
 resource_id text,
 amount integer check(amount>=0),
 actor_user_id uuid references auth.users(id),
 request_id uuid unique,
 payload jsonb not null default '{}',
 created_at timestamptz not null default clock_timestamp()
);
alter table diceforge_v2.creation_states enable row level security;
alter table diceforge_v2.initial_allocations enable row level security;
alter table diceforge_v2.point_events enable row level security;
revoke all on diceforge_v2.creation_states,diceforge_v2.initial_allocations,diceforge_v2.point_events from public,anon,authenticated;

create or replace function diceforge_v2.creation_issues(p_state uuid) returns jsonb
language plpgsql stable set search_path=pg_catalog as $$
declare s diceforge_v2.states; issue jsonb:='[]'; professional integer; personal integer; spent bigint;
begin
 select * into strict s from diceforge_v2.states where id=p_state;
 if coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325') !~ '^[0-9]{1,4}$' then
  issue:=issue || jsonb_build_array('Pool professionnel invalide');
 else professional:=coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325')::integer; end if;
 if coalesce(s.stats->>'intelligence','') !~ '^[0-9]{1,3}$' then
  issue:=issue || jsonb_build_array('INT manquante ou invalide pour valider le budget');
 else personal:=(s.stats->>'intelligence')::integer*10; end if;
 if exists(select 1 from diceforge_v2.skills where state_id=p_state and
   (base is null or points is null or score is null or base<0 or points<0 or score not between 0 and 100 or base+points<>score)) then
  issue:=issue || jsonb_build_array('Compétence incohérente ou score hors 0–100'); end if;
 if exists(select 1 from diceforge_v2.spells where state_id=p_state and
   (points<0 or coalesce(personal/10,0)+points not between 0 and 100)) then
  issue:=issue || jsonb_build_array('Sort incohérent ou score hors 0–100'); end if;
 if exists(select 1 from jsonb_array_elements(coalesce(s.legacy_sheet_data->'spells','[]')) e
   where coalesce(e->>'name','')='' and coalesce(e->>'points','0') not in ('0','')) then
  issue:=issue || jsonb_build_array('Points de sort sans identité : décision du MJ requise'); end if;
 select coalesce((select sum(points) from diceforge_v2.skills where state_id=p_state),0)+
   coalesce((select sum(points) from diceforge_v2.spells where state_id=p_state),0) into spent;
 if professional is not null and personal is not null and spent>professional+personal then
  issue:=issue || jsonb_build_array('Budget initial dépassé de ' || (spent-professional-personal)::text || ' point(s)'); end if;
 return issue;
end $$;

create or replace function diceforge_v2.capture_initial_allocations(p_state uuid,p_origin text) returns void
language plpgsql set search_path=pg_catalog as $$
begin
 insert into diceforge_v2.initial_allocations(state_id,resource,resource_id,origin,base,points,score,payload)
  select state_id,'skill',skill_id,p_origin,base,points,score,raw_payload from diceforge_v2.skills where state_id=p_state;
 insert into diceforge_v2.initial_allocations(state_id,resource,resource_id,origin,base,points,score,payload)
  select p.state_id,'spell',p.spell_id,p_origin,
    case when coalesce(s.stats->>'intelligence','') ~ '^[0-9]{1,3}$' then (s.stats->>'intelligence')::integer end,p.points,
    case when coalesce(s.stats->>'intelligence','') ~ '^[0-9]{1,3}$' then (s.stats->>'intelligence')::integer+p.points end,p.raw_payload
   from diceforge_v2.spells p join diceforge_v2.states s on s.id=p.state_id where p.state_id=p_state;
end $$;

-- Existing scores are inherited as-is, never reclassified as newly available XP.
-- Anomalies become review flags; no score or original field is corrected.
do $$
declare s diceforge_v2.states; issues jsonb;
begin
 for s in select * from diceforge_v2.states where id not in (select state_id from diceforge_v2.creation_states) loop
  issues:=diceforge_v2.creation_issues(s.id);
  insert into diceforge_v2.creation_states(state_id,phase,origin,professional_pool,personal_pool,validated_at,baseline,review_issues)
   values(s.id,case when issues='[]'::jsonb then 'play' else 'legacy_review' end,'inherited',
    case when coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325') ~ '^[0-9]{1,4}$'
      then coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325')::integer end,
    case when coalesce(s.stats->>'intelligence','') ~ '^[0-9]{1,3}$' then (s.stats->>'intelligence')::integer*10 end,
    clock_timestamp(),diceforge_v2.sheet(s.id),issues);
  perform diceforge_v2.capture_initial_allocations(s.id,'inherited');
  insert into diceforge_v2.point_events(state_id,kind,payload)
   values(s.id,'inherited_baseline',jsonb_build_object('provenance','Unknown historical split; values preserved','issues',issues));
 end loop;
end $$;

create or replace function diceforge_v2.creation_metadata(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('phase',phase,'origin',origin,'professional',professional_pool,'personal',personal_pool,
  'validated_at',validated_at,'review_issues',review_issues)
 from diceforge_v2.creation_states where state_id=p_state
$$;
create or replace function diceforge_v2.allocation_metadata(p_state uuid,p_resource text,p_id text) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select coalesce((select jsonb_build_object('origin',origin,'base',base,'points',points,'score',score,
    'creation_points',case when origin='creation' then points else null end,
    'inherited_points',case when origin='inherited' then points else null end,
    'xp_points',0,'learning_points',0)
   from diceforge_v2.initial_allocations where state_id=p_state and resource=p_resource and resource_id=p_id),'{}')
$$;

create or replace function diceforge_v2.initialize_creation_state() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 insert into diceforge_v2.creation_states(state_id,phase,origin) values(new.id,'draft','creation');
 return new;
end $$;
drop trigger if exists df_initialize_creation_state on diceforge_v2.states;
create trigger df_initialize_creation_state after insert on diceforge_v2.states
 for each row execute function diceforge_v2.initialize_creation_state();

create or replace function diceforge_v2.normalized_stat_values(data jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_object_agg(key,to_jsonb(trim(value#>>'{}'))) filter(where nullif(trim(value#>>'{}'),'') is not null),'{}')
 from jsonb_each(data)
$$;
create or replace function diceforge_v2.anonymous_spell_values(data jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(e),'[]') from jsonb_array_elements(coalesce(data->'spells','[]')) e where coalesce(e->>'name','')=''
$$;
create or replace function diceforge_v2.guard_creation_state() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if exists(select 1 from diceforge_v2.creation_states where state_id=old.id and phase<>'draft') then
  if new.character_id is distinct from old.character_id or new.campaign_id is distinct from old.campaign_id or
   diceforge_v2.normalized_stat_values(new.stats) is distinct from diceforge_v2.normalized_stat_values(old.stats) or
   coalesce(nullif(new.fields->>'skillProfessionalPool',''),'325') is distinct from coalesce(nullif(old.fields->>'skillProfessionalPool',''),'325') or
   nullif(trim(new.fields->>'profession'),'') is distinct from nullif(trim(old.fields->>'profession'),'') or nullif(trim(new.fields->>'race'),'') is distinct from nullif(trim(old.fields->>'race'),'') or
   diceforge_v2.anonymous_spell_values(new.legacy_sheet_data) is distinct from diceforge_v2.anonymous_spell_values(old.legacy_sheet_data) then
   raise exception 'Création verrouillée : caractéristiques, profession, espèce et budget initial ne peuvent plus être réattribués.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists df_guard_creation_state on diceforge_v2.states;
create trigger df_guard_creation_state before update on diceforge_v2.states
 for each row execute function diceforge_v2.guard_creation_state();

create or replace function diceforge_v2.guard_initial_allocation() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare target uuid; v_resource text; identity text; allocated diceforge_v2.initial_allocations;
begin
 if tg_op='DELETE' then target:=old.state_id; else target:=new.state_id; end if;
 if tg_op='UPDATE' and (new.state_id is distinct from old.state_id or new.id is distinct from old.id) then
  raise exception 'Identité d’attribution verrouillée.' using errcode='42501'; end if;
 if not exists(select 1 from diceforge_v2.creation_states where state_id=target and phase<>'draft') then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 v_resource:=case when tg_table_name='skills' then 'skill' else 'spell' end;
 if tg_op='DELETE' then raise exception 'Création verrouillée : suppression de compétence ou sort refusée.' using errcode='42501'; end if;
 identity:=case when v_resource='skill' then to_jsonb(new)->>'skill_id' else to_jsonb(new)->>'spell_id' end;
 select * into allocated from diceforge_v2.initial_allocations where state_id=target and initial_allocations.resource=v_resource and resource_id=identity;
 if tg_op='UPDATE' and (new.state_id is distinct from old.state_id or new.id is distinct from old.id) then
  raise exception 'Identité d’attribution verrouillée.' using errcode='42501'; end if;
 if not found or new.points is distinct from allocated.points or
   (v_resource='skill' and ((to_jsonb(new)->>'base')::integer is distinct from allocated.base or (to_jsonb(new)->>'score')::integer is distinct from allocated.score)) or
   (tg_op='UPDATE' and (case when v_resource='skill' then to_jsonb(old)->>'skill_id' else to_jsonb(old)->>'spell_id' end) is distinct from identity) then
  raise exception 'Points verrouillés : utilisez une opération de progression ou d’apprentissage autorisée.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists df_guard_skill_allocation on diceforge_v2.skills;
drop trigger if exists df_guard_spell_allocation on diceforge_v2.spells;
create trigger df_guard_skill_allocation before insert or update or delete on diceforge_v2.skills
 for each row execute function diceforge_v2.guard_initial_allocation();
create trigger df_guard_spell_allocation before insert or update or delete on diceforge_v2.spells
 for each row execute function diceforge_v2.guard_initial_allocation();

create or replace function diceforge_v2.guard_point_history() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin raise exception 'Historique des points immuable.' using errcode='42501'; end $$;
drop trigger if exists df_guard_point_history on diceforge_v2.point_events;
create trigger df_guard_point_history before update or delete on diceforge_v2.point_events
 for each row execute function diceforge_v2.guard_point_history();

create or replace function public.df_validate_creation(p_state uuid,p_room text,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s diceforge_v2.states; phase text; issues jsonb; uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if not (select enabled from diceforge_v2.configuration) then raise exception 'Création v2 non activée'; end if;
 select st.* into s from diceforge_v2.states st
  join diceforge_v2.characters c on c.id=st.character_id
  join diceforge_v2.campaign_rooms r on r.campaign_id=st.campaign_id and r.room_code=p_room
  where st.id=p_state and c.owner_user_id=uid and c.status='active' for update of st;
 if not found then raise exception 'Fiche non accessible pour cette campagne.' using errcode='42501'; end if;
 if not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)
  and not exists(select 1 from diceforge_v2.campaigns where id=s.campaign_id and owner_user_id=uid) then
  raise exception 'Rejoignez la room avant de valider.' using errcode='42501'; end if;
 select cs.phase into phase from diceforge_v2.creation_states cs where state_id=p_state;
 if phase<>'draft' then
  return jsonb_build_object('sheet_data',diceforge_v2.sheet(p_state),'already_validated',true);
 end if;
 if p_expected_revision is null or p_expected_revision<>s.sheet_revision then
  raise exception 'La fiche a changé. Rechargez avant de valider.' using errcode='40001'; end if;
 issues:=diceforge_v2.creation_issues(p_state);
 if issues<>'[]'::jsonb then raise exception 'Création à corriger : %',issues using errcode='22023'; end if;
 perform diceforge_v2.capture_initial_allocations(p_state,'creation');
 update diceforge_v2.creation_states set phase='play',professional_pool=coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325')::integer,
  personal_pool=(s.stats->>'intelligence')::integer*10,validated_at=clock_timestamp(),validated_by=uid,
  baseline=diceforge_v2.sheet(p_state),review_issues='[]' where state_id=p_state;
 insert into diceforge_v2.point_events(state_id,kind,actor_user_id) values(p_state,'creation_validated',uid);
 update diceforge_v2.states set sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=p_state;
 return jsonb_build_object('sheet_data',diceforge_v2.sheet(p_state),'already_validated',false);
end $$;
revoke all on function public.df_validate_creation(uuid,text,bigint) from public,anon;
grant execute on function public.df_validate_creation(uuid,text,bigint) to authenticated;

-- Same compatibility projection, with authoritative metadata overriding client JSON.
create or replace function diceforge_v2.sheet(p_state uuid) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select s.legacy_sheet_data || jsonb_build_object(
  'character_id',s.character_id,'state_id',s.id,'campaign_id',s.campaign_id,'revision',s.sheet_revision,
  'creation',diceforge_v2.creation_metadata(s.id),'progression',jsonb_build_object('xp_points',0,'learning_points',0),
  'fields',s.fields,'stats',s.stats,
  'skills',coalesce((select jsonb_agg(coalesce(k.raw_payload,'{}') ||
   case when k.id is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
    'id',k.skill_id,'name',cat.name,'base',k.base,'points',k.points,'score',k.score,'checked',k.checked,
    'allocation',diceforge_v2.allocation_metadata(s.id,'skill',k.skill_id))) end order by slot.index)
   from generate_series(0,56) slot(index)
   left join diceforge_v2.skill_catalog cat on cat.legacy_index=slot.index
   left join diceforge_v2.skills k on k.state_id=s.id and k.skill_id=cat.id),'[]'),
  'spells',coalesce((select jsonb_agg(coalesce(p.raw_payload,'{}') || jsonb_build_object(
    'id',p.spell_id,'name',cat.name,'points',p.points,'checked',p.checked,
    'allocation',diceforge_v2.allocation_metadata(s.id,'spell',p.spell_id)) order by p.legacy_index,p.id)
   from diceforge_v2.spells p join diceforge_v2.spell_catalog cat on cat.id=p.spell_id where p.state_id=s.id),'[]') ||
   coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(s.legacy_sheet_data->'spells','[]')) e where coalesce(e->>'name','')=''),'[]'))
 from diceforge_v2.states s where s.id=p_state
$$;

-- Private helpers are intentionally inaccessible to application roles.
revoke all on function diceforge_v2.creation_issues(uuid),diceforge_v2.capture_initial_allocations(uuid,text),
 diceforge_v2.creation_metadata(uuid),diceforge_v2.allocation_metadata(uuid,text,text),
 diceforge_v2.initialize_creation_state(),diceforge_v2.normalized_stat_values(jsonb),
 diceforge_v2.anonymous_spell_values(jsonb),diceforge_v2.guard_creation_state(),
 diceforge_v2.guard_initial_allocation(),diceforge_v2.guard_point_history() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
