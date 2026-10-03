-- Reject invalid draft allocations atomically; leave existing drafts untouched.
begin;
create or replace function diceforge_v2.check_draft_budget() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare allowed jsonb; has_magic boolean; outside_points bigint; personal integer; issues jsonb; chosen_profession text;
begin
 if not exists(select 1 from diceforge_v2.creation_states where state_id=new.id and phase='draft') then return null; end if;
 issues:=diceforge_v2.creation_issues(new.id);
 if issues<>'[]'::jsonb then raise exception 'Brouillon à corriger : %',issues using errcode='22023'; end if;
 select s.fields->>'profession',(s.stats->>'intelligence')::integer*10 into chosen_profession,personal from diceforge_v2.states s where id=new.id;
 select p.skills,p.magic into allowed,has_magic from diceforge_v2.profession_skills p where p.profession=chosen_profession;
 if allowed is null then
  if exists(select 1 from diceforge_v2.skills where state_id=new.id and points>0) or exists(select 1 from diceforge_v2.spells where state_id=new.id and points>0) then
   raise exception 'Sélectionnez une profession connue avant de répartir les points.' using errcode='22023';
  end if;
  return null;
 end if;
 select coalesce(sum(points),0) into outside_points from diceforge_v2.skills where state_id=new.id and not allowed ? skill_id;
 if not has_magic then outside_points:=outside_points+coalesce((select sum(points) from diceforge_v2.spells where state_id=new.id),0); end if;
 if outside_points>personal then raise exception 'Points personnels dépassés : % points hors profession pour % disponibles.',outside_points,personal using errcode='22023'; end if;
 return null;
end $$;
drop trigger if exists df_draft_budget on diceforge_v2.states;
create constraint trigger df_draft_budget after insert or update on diceforge_v2.states deferrable initially deferred for each row execute function diceforge_v2.check_draft_budget();

create or replace function diceforge_v2.guard_professional_pool() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
 if coalesce(nullif(new.fields->>'skillProfessionalPool',''),'325') is distinct from coalesce(nullif(old.fields->>'skillProfessionalPool',''),'325') then
  raise exception 'Budget professionnel fixé à la création : il ne peut pas être augmenté.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists df_professional_pool on diceforge_v2.states;
create trigger df_professional_pool before update on diceforge_v2.states for each row execute function diceforge_v2.guard_professional_pool();
revoke all on function diceforge_v2.check_draft_budget(),diceforge_v2.guard_professional_pool() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
