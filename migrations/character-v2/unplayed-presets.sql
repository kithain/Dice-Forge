-- Validation opens an XP pool automatically; an untouched pool is not play.
begin;
create or replace function diceforge_v2.preset_has_game_activity(p_character uuid) returns boolean
language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from diceforge_v2.xp_sessions x join diceforge_v2.states s on s.id=x.state_id
   where s.character_id=p_character and (x.spent>0 or x.closed_at is not null or x.checks<>'[]'::jsonb))
 or exists(select 1 from diceforge_v2.xp_attempts a join diceforge_v2.states s on s.id=a.state_id where s.character_id=p_character)
 or exists(select 1 from diceforge_v2.point_events e join diceforge_v2.states s on s.id=e.state_id
   where s.character_id=p_character and e.kind in ('xp','spell_learning'))
 or exists(select 1 from diceforge_v2.skill_roll_receipts r join diceforge_v2.states s on s.id=r.state_id where s.character_id=p_character)
$$;
revoke all on function diceforge_v2.preset_has_game_activity(uuid) from public,anon,authenticated;
do $upgrade$
declare definition text; old_condition text:='or exists(select 1 from diceforge_v2.xp_sessions x join diceforge_v2.states s on s.id=x.state_id where s.character_id=c.id)';
 new_condition text:='or diceforge_v2.preset_has_game_activity(c.id)';
begin
 select pg_get_functiondef('public.df_character_roster(text,text,uuid,uuid)'::regprocedure) into definition;
 if position(old_condition in definition)>0 then
  execute replace(definition,old_condition,new_condition);
 elsif position(new_condition in definition)=0 then
  raise exception 'Version de df_character_roster inattendue : aucune modification effectuée';
 end if;
end $upgrade$;
notify pgrst,'reload schema';
commit;
