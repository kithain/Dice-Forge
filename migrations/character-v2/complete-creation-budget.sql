-- Require a complete allocation only when a draft enters play. Preserve old sheets.
begin;
create or replace function diceforge_v2.guard_complete_creation_budget() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare budget bigint; spent bigint;
begin
 if old.phase<>'draft' or new.phase<>'play' then return new; end if;
 select coalesce(nullif(s.fields->>'skillProfessionalPool',''),'325')::bigint +
  (s.stats->>'intelligence')::bigint*10 into budget from diceforge_v2.states s where s.id=new.state_id;
 select coalesce((select sum(points) from diceforge_v2.skills where state_id=new.state_id),0)+
  coalesce((select sum(points) from diceforge_v2.spells where state_id=new.state_id),0) into spent;
 if spent<budget then
  raise exception 'Il reste % point(s) à répartir avant de valider la création.',budget-spent using errcode='22023';
 end if;
 if spent>budget then
  raise exception 'Budget initial dépassé de % point(s).',spent-budget using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists df_complete_creation_budget on diceforge_v2.creation_states;
create trigger df_complete_creation_budget before update on diceforge_v2.creation_states
 for each row execute function diceforge_v2.guard_complete_creation_budget();
revoke all on function diceforge_v2.guard_complete_creation_budget() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
