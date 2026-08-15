-- Migration ciblée : signaler les jets cachés dans l'historique OBS sans
-- publier leur expression, leurs dés, leur résultat ou leur réussite.
-- À exécuter dans Supabase SQL Editor après une sauvegarde de la base.

begin;

alter table public.obs_rolls
  drop constraint if exists obs_rolls_is_hidden_check;

create or replace function public.sync_obs_rolls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.obs_rolls where roll_id = old.id;
    return old;
  end if;

  insert into public.obs_rolls (
    roll_id, created_at, room_code, player_name, expression,
    rolls_detail, total, is_crit, is_fail, is_hidden
  ) values (
    new.id,
    new.created_at,
    new.room_code,
    new.player_name,
    case when new.is_hidden then 'Jet caché' else new.expression end,
    case when new.is_hidden then '' else new.rolls_detail end,
    case when new.is_hidden then 0 else new.total end,
    case when new.is_hidden then false else new.is_crit end,
    case when new.is_hidden then false else new.is_fail end,
    new.is_hidden
  )
  on conflict (roll_id) do update set
    created_at = excluded.created_at,
    room_code = excluded.room_code,
    player_name = excluded.player_name,
    expression = excluded.expression,
    rolls_detail = excluded.rolls_detail,
    total = excluded.total,
    is_crit = excluded.is_crit,
    is_fail = excluded.is_fail,
    is_hidden = excluded.is_hidden;

  return new;
end;
$$;

commit;

-- Retour arrière manuel :
-- 1. delete from public.obs_rolls where is_hidden is true;
-- 2. restaurer public.sync_obs_rolls() depuis la version précédente ;
-- 3. alter table public.obs_rolls add constraint obs_rolls_is_hidden_check
--      check (is_hidden = false);
