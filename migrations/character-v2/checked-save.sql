-- Apply after recipe-corrections.sql. Saving an existing server check is allowed.
begin;
create or replace function diceforge_v2.guard_automatic_check() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare previously_checked boolean := false;
begin
 if coalesce(current_setting('diceforge_v2.marking_check',true),'')='trusted_roll' then return new; end if;
 if tg_op='INSERT' and new.checked then
  -- BEFORE INSERT also runs for ON CONFLICT DO UPDATE. Compare with the
  -- persisted target, not the generated row UUID used by the save operation.
  if tg_table_name='skills' then
   select checked into previously_checked from diceforge_v2.skills
    where state_id=new.state_id and skill_id=new.skill_id and specialty=new.specialty;
  else
   select checked into previously_checked from diceforge_v2.spells
    where state_id=new.state_id and spell_id=new.spell_id;
  end if;
  if not coalesce(previously_checked,false) then
   raise exception 'Coche réservée à un jet réussi enregistré par le serveur.' using errcode='42501';
  end if;
 elsif tg_op='UPDATE' then
  if new.checked and not old.checked then
   raise exception 'Coche réservée à un jet réussi enregistré par le serveur.' using errcode='42501';
  end if;
  if new.checked is distinct from old.checked and exists(
   select 1 from diceforge_v2.xp_sessions where state_id=new.state_id and closed_at is null
  ) then
   raise exception 'Les coches sont gérées par les jets et le changement de session.' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
notify pgrst,'reload schema';
commit;
