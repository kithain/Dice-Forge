"""Assemble the atomic campaign release with a private, server-side backup.

Only tables changed by this release are copied. No Auth records or user data
are exported. Immutable content is checked with hashes inside PostgreSQL.
"""
import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PREFIX = r"""begin;
lock table public.rooms,public.room_members,diceforge_v2.campaigns,diceforge_v2.campaign_rooms,
 diceforge_v2.states,diceforge_v2.character_roster,diceforge_v2.character_selections,
 diceforge_v2.character_generations,public.personnages,public.pj_sheets,public.pj_inventory
 in share row exclusive mode;
create schema diceforge_campaign_20261007;
revoke all on schema diceforge_campaign_20261007 from public,anon,authenticated;
create table diceforge_campaign_20261007.invariants(table_name text primary key,checksum text);
create table diceforge_campaign_20261007.functions as
 select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl::text acl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in ('df_create_session_room','df_link_campaign_room','df_character_roster','df_character_query'))
  or (n.nspname='diceforge_v2' and p.proname in ('can_read','guard_mj_room'));
do $$
declare source text; checksum text;
begin
 foreach source in array array['public.rooms','diceforge_v2.campaigns','diceforge_v2.campaign_rooms',
  'diceforge_v2.states','diceforge_v2.character_roster','diceforge_v2.character_selections',
  'diceforge_v2.character_generations','public.personnages','public.pj_sheets','public.pj_inventory'] loop
  execute format('create table diceforge_campaign_20261007.%I as table %s',replace(source,'.','__'),source);
 end loop;
 foreach source in array array['diceforge_v2.characters','diceforge_v2.skills','diceforge_v2.spells','diceforge_v2.items',
  'diceforge_v2.wallets','diceforge_v2.creation_states','diceforge_v2.initial_allocations','diceforge_v2.point_events',
  'diceforge_v2.xp_sessions','diceforge_v2.xp_attempts','diceforge_v2.skill_roll_receipts','diceforge_v2.generation_receipts'] loop
  if to_regclass(source) is not null then
   execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'')::text) from %s t',source) into checksum;
   insert into diceforge_campaign_20261007.invariants values(source,checksum);
  end if;
 end loop;
 for source in select tablename from pg_tables where schemaname='diceforge_campaign_20261007' loop
  execute format('alter table diceforge_campaign_20261007.%I enable row level security',source);
  execute format('revoke all on diceforge_campaign_20261007.%I from public,anon,authenticated',source);
 end loop;
end $$;
"""
SUFFIX = r"""
do $$
declare source record; checksum text; before_rows jsonb; after_rows jsonb; target uuid;
begin
 for source in select * from diceforge_campaign_20261007.invariants loop
  execute format('select md5(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),''[]'')::text) from %s t',source.table_name) into checksum;
  if checksum is distinct from source.checksum then raise exception 'Contenu historique modifié : %',source.table_name; end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(t)-'campaign_id'),'[]') into before_rows from diceforge_campaign_20261007.diceforge_v2__states t;
 select coalesce(jsonb_agg(to_jsonb(t)-'campaign_id'),'[]') into after_rows from diceforge_v2.states t;
 if not (before_rows @> after_rows and after_rows @> before_rows) or jsonb_array_length(before_rows)<>jsonb_array_length(after_rows) then
  raise exception 'Fiches historiques altérées'; end if;
 select campaign_id into target from diceforge_v2.campaign_migrations where migration_key='valombre_20261007';
 if target is null or exists(select 1 from public.rooms where campaign_id is distinct from target)
  or not exists(select 1 from diceforge_v2.campaigns where id=target and name='Valombre' and reference_room='4SSU' and archived_at is null) then
  raise exception 'Rattachement Valombre incomplet'; end if;
 if exists(select 1 from public.rooms r left join diceforge_v2.campaign_rooms cr using(room_code) where cr.campaign_id is distinct from r.campaign_id) then
  raise exception 'Rattachement des rooms incohérent'; end if;
end $$;
notify pgrst,'reload schema';
commit;
"""

def assemble():
    parts = [PREFIX]
    for name in ['campaign-valombre.sql', 'campaign-management.sql']:
        source = (ROOT / 'migrations/character-v2' / name).read_text(encoding='utf-8')
        parts.append(re.sub(r'^\s*(?:begin|commit);\s*$', '', source, flags=re.MULTILINE))
    parts.append(SUFFIX)
    return '\n'.join(parts)

if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('output', type=Path)
    args = cli.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(assemble(), encoding='utf-8')
    print(f'Atomic campaign SQL prepared: {args.output}')
