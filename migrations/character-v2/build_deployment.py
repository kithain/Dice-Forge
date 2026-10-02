"""Build a single atomic SQL deployment outside Git; embeds private saved data."""
import argparse
import json
from pathlib import Path


def quote(value):
    return '"' + value.replace('"', '""') + '"'


def build(data):
    here = Path(__file__).parent
    payload = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
    marker = '$diceforge_import$'
    if marker in payload:
        raise ValueError('SQL delimiter occurs in source')
    pieces = ["begin isolation level repeatable read;\nlock table public.personnages,public.pj_sheets,public.pj_inventory in share mode;",
              "create temporary table df_import(payload jsonb) on commit drop;",
              f"insert into df_import values({marker}{payload}{marker}::jsonb);"]
    pieces.append("""do $$ declare source text; actual jsonb; expected jsonb; begin
      foreach source in array array['personnages','pj_sheets','pj_inventory'] loop
        execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t',source) into actual;
        select coalesce(jsonb_agg(e->'payload'),'[]') into expected from df_import,
          jsonb_array_elements(payload->'archives') e where e->>'source_table'=source;
        if jsonb_array_length(actual)<>jsonb_array_length(expected)
          or exists(select 1 from jsonb_array_elements(actual) a where not expected @> jsonb_build_array(a)) then
          raise exception 'La source % a changé depuis la sauvegarde : bascule annulée',source;
        end if;
      end loop;
    end $$;""")
    pieces.append("""create schema diceforge_backup_20261002;
    revoke all on schema diceforge_backup_20261002 from public,anon,authenticated;
    do $$ declare t record; begin
      for t in select tablename from pg_tables where schemaname='public' loop
        execute format('create table diceforge_backup_20261002.%I as table public.%I',t.tablename,t.tablename);
        execute format('alter table diceforge_backup_20261002.%I enable row level security',t.tablename);
      end loop;
    end $$;
    create table diceforge_backup_20261002.metadata as select now() as captured_at,
     (select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public') as columns,
     (select jsonb_agg(to_jsonb(c)) from information_schema.table_privileges c where table_schema='public') as grants,
     (select jsonb_agg(to_jsonb(c)) from pg_policies c where schemaname='public') as policies,
     (select jsonb_agg(jsonb_build_object('name',c.conname,'table',c.conrelid::regclass::text,'definition',pg_get_constraintdef(c.oid)))
       from pg_constraint c where connamespace='public'::regnamespace) as constraints,
     (select jsonb_agg(to_jsonb(c)) from pg_indexes c where schemaname='public') as indexes,
     (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid)))
       from pg_proc p where pronamespace='public'::regnamespace and prokind='f') as functions,
     (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid)))
       from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relnamespace='public'::regnamespace and not t.tgisinternal) as triggers,
     (select jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid)))
       from pg_class c where c.relnamespace='public'::regnamespace and relkind='v') as views;
    alter table diceforge_backup_20261002.metadata enable row level security;""")
    for name in ('schema.sql', 'api.sql'):
        text = (here / name).read_text(encoding='utf-8')
        lines = [line for line in text.splitlines() if line.strip().lower() not in ('begin;', 'commit;')]
        # Only standalone transaction delimiters occur in these files; function BEGIN is unpunctuated.
        pieces.append('\n'.join(lines))
    tables = {'campaigns': data['campaigns'], 'characters': data['characters'], 'states': data['states'],
              'skill_catalog': data['catalog']['skills'], 'spell_catalog': data['catalog']['spells'],
              'skills': data['skills'], 'spells': [{k: v for k, v in row.items() if k != 'name'} for row in data['spells']],
              'items': data['items'], 'wallets': data['wallets'], 'archives': data['archives']}
    paths = {'skill_catalog': "payload->'catalog'->'skills'", 'spell_catalog': "payload->'catalog'->'spells'"}
    for table, rows in tables.items():
        if not rows:
            continue
        keys = sorted(set().union(*(row.keys() for row in rows)))
        columns = ','.join(map(quote, keys))
        selections = ','.join('r.' + quote(k) for k in keys)
        expression = paths.get(table, f"payload->'{table}'")
        pieces.append(f"insert into diceforge_v2.{table}({columns}) select {selections} from df_import,\n"
                      f"jsonb_populate_recordset(null::diceforge_v2.{table},{expression}) r;")
    pieces.append("""update diceforge_v2.campaigns set owner_user_id=(select owner_id from public.rooms where room_code='4SSU');
    do $$ begin if exists(select 1 from diceforge_v2.campaigns where owner_user_id is null) then
      raise exception 'Le propriétaire de 4SSU est manquant'; end if; end $$;
    insert into diceforge_v2.campaign_rooms select reference_room,id from diceforge_v2.campaigns;
    insert into diceforge_v2.migration_issues(payload) select e from df_import,jsonb_array_elements(payload->'issues') e;
    update diceforge_v2.skill_catalog c set legacy_index=(slot.ordinality-1)::int from df_import,
      jsonb_array_elements_text(payload->'catalog'->'legacy_catalogs'->'brp_57_v1') with ordinality slot(id,ordinality) where c.id=slot.id;
    update diceforge_v2.skill_catalog c set aliases=coalesce((select jsonb_agg(a.key) from df_import,
      jsonb_each_text(payload->'catalog'->'aliases') a where a.value=c.name),'[]');
    do $$ declare t text; expected int; actual int; begin
      foreach t in array array['characters','states','skills','spells','items','wallets','archives'] loop
        select jsonb_array_length(payload->t) into expected from df_import;
        execute format('select count(*) from diceforge_v2.%I',t) into actual;
        if actual<>expected then raise exception 'Compte incorrect pour %',t; end if;
      end loop;
      if exists(select 1 from diceforge_v2.states s join public.pj_sheets p on p.id=s.source_sheet_id
        where s.legacy_sheet_data is distinct from p.sheet_data or s.legacy_markdown is distinct from p.markdown_content) then
        raise exception 'La fiche reprise diffère de 4SSU'; end if;
      if exists(select 1 from diceforge_v2.states s join public.pj_inventory p on p.id=s.source_inventory_id
        where s.legacy_inventory is distinct from to_jsonb(p)) then raise exception 'Inventaire différent de 4SSU'; end if;
    end $$;
    commit;
    select 'v2 préparée, application ancienne encore active' as status,
      (select count(*) from diceforge_v2.states) as states,
      (select count(*) from diceforge_v2.spells) as spells,
      (select count(*) from diceforge_v2.archives) as archives;""")
    return '\n\n'.join(pieces) + '\n'


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('--data', required=True)
    cli.add_argument('--output', required=True)
    args = cli.parse_args()
    Path(args.output).write_text(build(json.loads(Path(args.data).read_text(encoding='utf-8'))), encoding='utf-8')
    print('SQL atomique préparé hors dépôt :', args.output)
