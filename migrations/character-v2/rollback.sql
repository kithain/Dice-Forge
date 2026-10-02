-- Retour arrière du schéma parallèle ; anciennes tables conservées.
-- Réactivez d'abord les lectures/écritures de l'application ancienne.
-- Utiliser la sauvegarde d'avant bascule, en acceptant de perdre les changements v2.
-- Armement explicite de la session : SET diceforge.allow_v2_rollback = 'yes';
begin;
do $$
begin
  if current_setting('diceforge.allow_v2_rollback', true) is distinct from 'yes' then
    raise exception 'Retour arrière non armé';
  end if;
  if to_regclass('public.personnages') is null
     or to_regclass('public.pj_sheets') is null
     or to_regclass('public.pj_inventory') is null then
    raise exception 'Anciennes tables manquantes : restaurer la sauvegarde avant le retour arrière';
  end if;
  if exists (
    select 1 from pg_depend d
    join pg_class old_table on old_table.oid = d.objid
    join pg_namespace old_schema on old_schema.oid = old_table.relnamespace
    join pg_class new_table on new_table.oid = d.refobjid
    join pg_namespace new_schema on new_schema.oid = new_table.relnamespace
    where old_schema.nspname = 'public' and new_schema.nspname = 'diceforge_v2'
  ) then
    raise exception 'Dépendance du schéma public vers v2 : arrêt du retour arrière';
  end if;
end $$;
-- Le client déjà déployé peut revenir aux anciennes tables sans attendre un CDN.
create or replace function public.df_character_query(p_resource text,p_operation text default 'read',p_filters jsonb default '{}',
 p_payload jsonb default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin return jsonb_build_object('legacy',true); end $$;
drop function if exists public.df_link_campaign_room(text,text);
drop schema diceforge_v2 cascade;
commit;
