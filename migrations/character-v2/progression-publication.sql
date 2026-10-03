-- Apply AFTER progression.sql. Atomic, exactly-once publication of each actual unlock attempt.
begin;
create or replace function diceforge_v2.publish_unlock() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare character diceforge_v2.characters; target_name text;
begin
 select c.* into strict character from diceforge_v2.characters c join diceforge_v2.states s on s.character_id=c.id where s.id=new.state_id;
 if new.resource='skill' then select name into target_name from diceforge_v2.skill_catalog where id=new.resource_id;
 else select name into target_name from diceforge_v2.spell_catalog where id=new.resource_id; end if;
 insert into public.rolls(room_code,user_id,player_name,expression,rolls_detail,total,is_crit,is_fail,is_hidden)
 values(new.room_code,character.owner_user_id,character.name,'Progression · ' || target_name || ' · D100 > ' || new.score,
  'D100 ' || new.roll || ' / score ' || new.score || ' % · ' || case when new.unlocked then 'Déverrouillé' else 'Échoué : tentative consommée' end,
  new.roll,false,not new.unlocked,false);
 return new;
end $$;
drop trigger if exists df_publish_unlock on diceforge_v2.xp_attempts;
create trigger df_publish_unlock after insert on diceforge_v2.xp_attempts for each row execute function diceforge_v2.publish_unlock();
revoke all on function diceforge_v2.publish_unlock() from public,anon,authenticated;
commit;
