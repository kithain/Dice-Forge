-- Apply after character-deletion.sql (also compatible with the original roster).
-- A new campaign inherits current scores; XP sessions and ledgers stay in their campaign.
begin;
create or replace function diceforge_v2.inherit_sheet_snapshot(p_source uuid,p_target uuid) returns void
language plpgsql set search_path=pg_catalog as $$
declare source diceforge_v2.states; target diceforge_v2.states; creation diceforge_v2.creation_states; snapshot jsonb;
begin
 select * into strict source from diceforge_v2.states where id=p_source for share;
 select * into strict target from diceforge_v2.states where id=p_target for update;
 if source.character_id<>target.character_id or source.campaign_id=target.campaign_id
  or not exists(select 1 from diceforge_v2.creation_states where state_id=p_target and phase='draft')
  or exists(select 1 from diceforge_v2.skills where state_id=p_target)
  or exists(select 1 from diceforge_v2.spells where state_id=p_target)
  or exists(select 1 from diceforge_v2.initial_allocations where state_id=p_target)
  or exists(select 1 from diceforge_v2.point_events where state_id=p_target)
  or exists(select 1 from diceforge_v2.xp_sessions where state_id=p_target) then
  raise exception 'La reprise exige une fiche vierge du même personnage dans une autre campagne.' using errcode='22023';
 end if;
 select * into strict creation from diceforge_v2.creation_states where state_id=p_source;
 -- Successful-roll checks belong to the source campaign, like its XP session.
 snapshot:=diceforge_v2.sheet(p_source)-'character_id'-'state_id'-'campaign_id'-'revision'-'creation'-'progression'-'lifecycle';
 snapshot:=snapshot || jsonb_build_object(
  'skills',(select jsonb_agg(case when e='{}'::jsonb then e else (e-'allocation') || '{"checked":false}'::jsonb end order by n) from jsonb_array_elements(snapshot->'skills') with ordinality a(e,n)),
  'spells',(select coalesce(jsonb_agg((e-'allocation') || '{"checked":false}'::jsonb order by n),'[]'::jsonb) from jsonb_array_elements(snapshot->'spells') with ordinality a(e,n)));
 update diceforge_v2.states set fields=source.fields,stats=source.stats,legacy_sheet_data=snapshot,
  legacy_markdown=source.legacy_markdown,revision=revision+1,sheet_revision=sheet_revision+1,updated_at=clock_timestamp()
  where id=p_target;
 insert into diceforge_v2.skills(id,state_id,skill_id,specialty,base,points,score,checked,legacy_index,raw_payload)
  select gen_random_uuid(),p_target,skill_id,specialty,base,points,score,false,legacy_index,(raw_payload-'allocation') || '{"checked":false}'::jsonb
  from diceforge_v2.skills where state_id=p_source;
 insert into diceforge_v2.spells(id,state_id,spell_id,points,checked,legacy_index,raw_payload)
  select gen_random_uuid(),p_target,spell_id,points,false,legacy_index,(raw_payload-'allocation') || '{"checked":false}'::jsonb
  from diceforge_v2.spells where state_id=p_source;
 if creation.phase<>'draft' then
  perform diceforge_v2.capture_initial_allocations(p_target,'inherited');
  -- Inherited scores can include XP beyond the creation budget. They are not a new validation.
  update diceforge_v2.creation_states set phase='legacy_review',origin='inherited',
   professional_pool=creation.professional_pool,personal_pool=creation.personal_pool,
   validated_at=clock_timestamp(),validated_by=auth.uid(),baseline=snapshot,review_issues=creation.review_issues
   where state_id=p_target;
  if creation.phase='play' then update diceforge_v2.creation_states set phase='play' where state_id=p_target; end if;
  insert into diceforge_v2.point_events(state_id,kind,actor_user_id,payload)
   values(p_target,'inherited_baseline',auth.uid(),jsonb_build_object('source_state_id',p_source,'source_revision',source.sheet_revision));
 end if;
end $$;
create or replace function diceforge_v2.copy_campaign_sheet(p_character uuid,p_campaign uuid) returns uuid
language plpgsql set search_path=pg_catalog as $$
declare source diceforge_v2.states; sid uuid;
begin
 select s.* into source from diceforge_v2.states s where s.character_id=p_character and s.campaign_id<>p_campaign
  and (exists(select 1 from diceforge_v2.skills k where k.state_id=s.id)
    or exists(select 1 from diceforge_v2.spells p where p.state_id=s.id))
  order by s.updated_at desc,s.id limit 1 for share;
 if not found then return null; end if;
 insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
  values(gen_random_uuid(),p_campaign,p_character,source.fields,source.stats,'{}','') returning id into sid;
 perform diceforge_v2.inherit_sheet_snapshot(source.id,sid);
 return sid;
end $$;
revoke all on function diceforge_v2.inherit_sheet_snapshot(uuid,uuid),diceforge_v2.copy_campaign_sheet(uuid,uuid) from public,anon,authenticated;
-- Patch the roster implementation while retaining deletion/preset wrappers already deployed.
do $upgrade$
declare signature regprocedure; definition text; start_at integer; end_at integer; block text; patched boolean:=false;
begin
 for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where (n.nspname='public' and p.proname='df_character_roster')
    or (n.nspname='diceforge_v2' and p.proname='character_roster_before_deletion') loop
  select pg_get_functiondef(signature) into definition;
  if position('diceforge_v2.copy_campaign_sheet(c.id,campaign)' in definition)>0 then patched:=true; continue; end if;
  start_at:=position('data:=jsonb_build_object(' in definition);
  end_at:=position('perform diceforge_v2.save_sheet(sid,data);' in definition);
  if start_at=0 or end_at<start_at then continue; end if;
  end_at:=end_at+length('perform diceforge_v2.save_sheet(sid,data);');
  block:=substring(definition from start_at for end_at-start_at);
  execute substring(definition from 1 for start_at-1) ||
   'sid:=diceforge_v2.copy_campaign_sheet(c.id,campaign); if sid is null then ' || block || ' end if;' ||
   substring(definition from end_at);
  patched:=true;
 end loop;
 if not patched then raise exception 'Implémentation de reprise du roster introuvable'; end if;
end $upgrade$;
notify pgrst,'reload schema';
commit;
