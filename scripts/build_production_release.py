"""Prepare a private incremental release from a fresh application snapshot.

No network calls. Generated SQL contains campaign data and must stay outside Git.
The restore file restores the pre-release v2 state; later v2 changes are discarded.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = [
    'save-fixes.sql', 'creation-lock.sql', 'progression.sql',
    'progression-publication.sql', 'spell-learning.sql', 'character-roster.sql',
    'recipe-corrections.sql', 'character-generation.sql', 'creation-budget.sql',
    'checked-save.sql', 'complete-creation-budget.sql', 'unplayed-presets.sql',
]


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def qualified(schema, name):
    return ident(schema) + '.' + ident(name)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def payload(value):
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    marker = '$df_release_data$'
    if marker in text:
        raise ValueError('SQL delimiter occurs in source')
    return marker + text + marker + '::jsonb'


def permissions(kind, target, acl):
    # NULL means PostgreSQL's default ACL; functions default to PUBLIC EXECUTE.
    if acl is None:
        return []
    sql = [f'revoke all on {kind} {target} from public,anon,authenticated,service_role;']
    mappings = {'r': 'SELECT', 'a': 'INSERT', 'w': 'UPDATE', 'd': 'DELETE',
                'D': 'TRUNCATE', 'x': 'REFERENCES', 't': 'TRIGGER',
                'X': 'EXECUTE', 'U': 'USAGE', 'C': 'CREATE', 'm': 'MAINTAIN'}
    for entry in acl:
        role, rest = entry.split('=', 1)
        rights = rest.split('/', 1)[0]
        # Owners retain implicit rights. Preserve grant options per privilege.
        for index, code in enumerate(rights):
            if code == '*':
                continue
            if code not in mappings:
                raise ValueError(f'Unsupported ACL: {code}')
            grant_option = ' with grant option' if rights[index:index+2].endswith('*') else ''
            sql.append(f'grant {mappings[code]} on {kind} {target} to {ident(role) if role else "public"}{grant_option};')
    return sql


def restore_objects(snapshot, schemas, restore_public_functions=False):
    sql = ['set local check_function_bodies=off;']
    tables = [t for t in snapshot['tables'] if t['schema'] in schemas]
    for schema in schemas:
        if schema != 'public':
            sql.append(f'create schema {ident(schema)};')
    # SERIAL defaults refer to these sequences. Identity columns create their own.
    identity_sequences = {t['schema'] + '.' + t['name'] + '_' + c['name'] + '_seq'
                          for t in tables for c in t['columns'] if c['identity']}
    for seq in snapshot['sequences']:
        key = seq['schemaname'] + '.' + seq['sequencename']
        if seq['schemaname'] in schemas and key not in identity_sequences:
            sql.append(f'create sequence {qualified(seq["schemaname"], seq["sequencename"])} as {seq["data_type"]};')
    for table in tables:
        cols = []
        for col in table['columns']:
            value = ident(col['name']) + ' ' + col['type']
            if col['identity']:
                value += ' generated ' + ('always' if col['identity'] == 'a' else 'by default') + ' as identity'
            elif col['generated']:
                value += f' generated always as ({col["default"]}) stored'
            elif col['default'] is not None:
                value += ' default ' + col['default']
            if col['not_null']:
                value += ' not null'
            cols.append(value)
        target = qualified(table['schema'], table['name'])
        sql.append(f'create table {target} ({",".join(cols)});')
        rows = snapshot['data'][table['schema'] + '.' + table['name']]
        if rows:
            names = ','.join(ident(c['name']) for c in table['columns'] if not c['generated'])
            sql.append(f'insert into {target}({names}) overriding system value select {names} from jsonb_populate_recordset(null::{target},{payload(rows)});')
    # Constraints follow data and primary keys precede foreign keys.
    for con in sorted(snapshot['constraints'] or [], key=lambda c: c['kind'] == 'f'):
        if con['schema'] in schemas:
            sql.append(f'alter table {qualified(con["schema"],con["table"])} add constraint {ident(con["name"])} {con["definition"]};')
    for index in snapshot['indexes'] or []:
        if index['schema'] in schemas:
            sql.append(index['definition'] + ';')
    for fn in snapshot['functions']:
        if fn['schema'] in schemas or (restore_public_functions and fn['schema'] == 'public'):
            target = qualified(fn['schema'], fn['name']) + '(' + fn['identity_args'] + ')'
            sql.append(fn['definition'] + ';')
            sql.extend(permissions('function', target, fn['acl']))
    for view in snapshot['views'] or []:
        if view['schema'] in schemas:
            target = qualified(view['schema'], view['name'])
            options = ' with (' + ','.join(view['options']) + ')' if view['options'] else ''
            sql.append(f'create view {target}{options} as {view["definition"]};')
            sql.extend(permissions('table', target, view['acl']))
    for trigger in snapshot['triggers'] or []:
        if trigger['schema'] in schemas:
            sql.append(trigger['definition'] + ';')
            if trigger['enabled'] != 'O':
                mode = {'D': 'disable', 'R': 'enable replica', 'A': 'enable always'}[trigger['enabled']]
                sql.append(f'alter table {qualified(trigger["schema"],trigger["table"])} {mode} trigger {ident(trigger["name"])};')
    for policy in snapshot['policies'] or []:
        if policy['schemaname'] in schemas:
            roles = ','.join('public' if r == 'public' else ident(r) for r in policy['roles'])
            statement = f'create policy {ident(policy["policyname"])} on {qualified(policy["schemaname"],policy["tablename"])} as {policy["permissive"]} for {policy["cmd"]} to {roles}'
            if policy['qual']:
                statement += ' using (' + policy['qual'] + ')'
            if policy['with_check']:
                statement += ' with check (' + policy['with_check'] + ')'
            sql.append(statement + ';')
    for table in tables:
        target = qualified(table['schema'], table['name'])
        if table['rls']:
            sql.append(f'alter table {target} enable row level security;')
        if table['force_rls']:
            sql.append(f'alter table {target} force row level security;')
        sql.extend(permissions('table', target, table['acl']))
    for schema in snapshot['schemas']:
        if schema['name'] in schemas:
            sql.extend(permissions('schema', ident(schema['name']), schema['acl']))
    for key, values in snapshot['sequence_values'].items():
        if key.split('.')[0] in schemas:
            seq = next(s for s in snapshot['sequences'] if s['schemaname']+'.'+s['sequencename'] == key)
            target = qualified(seq['schemaname'],seq['sequencename'])
            sql.append(f'alter sequence {target} increment by {seq["increment_by"]} minvalue {seq["min_value"]} no maxvalue start with {seq["start_value"]} cache {seq["cache_size"]} {"cycle" if seq["cycle"] else "no cycle"};')
            sql.append(f'select setval({literal(target)},{values["last_value"]},{str(values["is_called"]).lower()});')
    return sql


def build(snapshot, output):
    if snapshot['project_ref'] != 'bwrylcvkplonkfhnegvm':
        raise ValueError('Production snapshot required')
    if any(t['name'] == 'creation_states' for t in snapshot['tables']):
        raise ValueError('This release requires the pre-creation-lock v2 schema')
    output = output.resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Private SQL must be generated outside Git')
    output.mkdir(parents=True, exist_ok=True)
    bootstrap = ['begin;', 'create role anon;', 'create role authenticated;', 'create role service_role;',
                 "create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');",
                 "create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';",
                 "create function auth.role() returns text language sql stable as 'select current_setting(''request.jwt.claim.role'',true)';"]
    bootstrap += ['insert into auth.users(id) values ' + ','.join('('+literal(uid)+'::uuid)' for uid in snapshot['auth_user_ids']) + ';']
    bootstrap += restore_objects(snapshot, ['public', 'diceforge_v2']) + ['commit;']
    (output/'bootstrap-copy.sql').write_text('\n'.join(bootstrap), encoding='utf-8')
    restore = ["-- PRIVATE. Restores the pre-release v2 state; later v2 changes are discarded.", 'begin;',
               "do $$ begin if current_setting('diceforge.allow_release_restore',true) is distinct from 'yes' then raise exception 'Restauration non armée'; end if; end $$;",
               'drop schema diceforge_v2 cascade;',
               "do $$ declare f record; begin for f in select p.oid::regprocedure as signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'df_%' and p.proname not in ('df_character_query','df_link_campaign_room') loop execute 'drop function '||f.signature||' cascade'; end loop; end $$;"]
    restore += restore_objects(snapshot, ['diceforge_v2'], restore_public_functions=True)
    restore += ["notify pgrst,'reload schema';", 'commit;']
    (output/'restore-before-release.sql').write_text('\n'.join(restore), encoding='utf-8')
    protected = {k:v for k,v in snapshot['data'].items() if k.startswith('diceforge_v2.')}
    deploy = ['begin isolation level repeatable read;', "set local timezone='UTC';", "set local lock_timeout='10s';", "set local statement_timeout='120s';",
              'lock table ' + ','.join(qualified(*k.split('.')) for k in protected) + ',public.rooms,public.room_members in share row exclusive mode;',
              'create temporary table df_release_expected(data jsonb) on commit drop;',
              f'insert into df_release_expected values({payload(protected)});',
              "do $$ declare t record; actual jsonb; begin if to_regclass('diceforge_v2.creation_states') is not null then raise exception 'Lot déjà installé'; end if; for t in select key,value from df_release_expected,jsonb_each(data) loop execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from '||t.key||' r' into actual; if jsonb_array_length(actual)<>jsonb_array_length(t.value) or exists(select 1 from jsonb_array_elements(actual) a where not t.value @> jsonb_build_array(a)) then raise exception 'Source % modifiée depuis la sauvegarde',t.key; end if; end loop; end $$;",
              'create schema diceforge_release_20261003;', 'revoke all on schema diceforge_release_20261003 from public,anon,authenticated;',
              "do $$ declare t record; target text; begin for t in select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','diceforge_v2') and c.relkind='r' loop target:=t.schema||'__'||t.name; execute format('create table diceforge_release_20261003.%I as table %I.%I',target,t.schema,t.name); execute format('alter table diceforge_release_20261003.%I enable row level security',target); end loop; end $$;",
              'create table diceforge_release_20261003.metadata(backup jsonb not null);',
              'alter table diceforge_release_20261003.metadata enable row level security;',
              'insert into diceforge_release_20261003.metadata values('+payload({k:v for k,v in snapshot.items() if k != 'data'})+');']
    for name in MIGRATIONS:
        sql = (ROOT/'migrations/character-v2'/name).read_text(encoding='utf-8')
        lines = [line for line in sql.splitlines() if line.strip().lower() not in ('begin;', 'commit;')]
        deploy += ['-- ' + name, '\n'.join(lines)]
    deploy += ["do $$ declare t record; actual jsonb; begin for t in select key,value from df_release_expected,jsonb_each(data) where key not in ('diceforge_v2.states','diceforge_v2.items') loop execute 'select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from '||t.key||' r' into actual; if actual @> t.value and t.value @> actual then continue; end if; raise exception 'Données historiques altérées : %',t.key; end loop; if exists(select 1 from diceforge_v2.states s join diceforge_release_20261003.diceforge_v2__states old using(id) where s.fields is distinct from old.fields or s.stats is distinct from old.stats or s.legacy_sheet_data is distinct from old.legacy_sheet_data or s.legacy_markdown is distinct from old.legacy_markdown or s.legacy_inventory is distinct from old.legacy_inventory or s.character_id<>old.character_id or s.campaign_id<>old.campaign_id) or (select count(*) from diceforge_v2.states)<>(select count(*) from diceforge_release_20261003.diceforge_v2__states) then raise exception 'Fiches historiques altérées'; end if; if exists(select 1 from diceforge_release_20261003.diceforge_v2__items old left join diceforge_v2.items i using(id) where to_jsonb(i) is distinct from to_jsonb(old)) then raise exception 'Inventaires historiques altérés'; end if; end $$;",
               "notify pgrst,'reload schema';", 'commit;',
               "select 'release-20261003 installed' as status,(select count(*) from diceforge_v2.states) as states,(select count(*) from diceforge_v2.skills) as skills,(select count(*) from diceforge_v2.spells) as spells,(select count(*) from diceforge_v2.items) as items;"]
    (output/'deploy-incremental.sql').write_text('\n\n'.join(deploy), encoding='utf-8')
    manifest = {'project_ref': snapshot['project_ref'], 'captured_at': snapshot['captured_at'], 'migrations': MIGRATIONS,
                'files': {p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in output.glob('*.sql')}}
    (output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(json.dumps({'output':str(output),'migrations':len(MIGRATIONS),'snapshot_tables':len(snapshot['data'])}))


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('--snapshot',type=Path,required=True)
    cli.add_argument('--output',type=Path,required=True)
    args = cli.parse_args()
    build(json.loads(args.snapshot.read_text(encoding='utf-8')),args.output)
