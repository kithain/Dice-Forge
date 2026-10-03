"""Prepare an atomic bootstrap for a NEW, EMPTY Supabase test project only."""
import argparse
import html
import json
import secrets
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[1]
cli = argparse.ArgumentParser()
cli.add_argument('--output', required=True)
cli.add_argument('--project-ref', required=True)
args = cli.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
if any((out/name).exists() for name in ('accounts.json', 'install-base-test.sql')):
    cli.error('Dossier déjà utilisé : choisir un autre dossier pour préserver les identifiants existants.')
accounts = [dict(name=name, email=email, id=str(uuid.uuid4()), password=secrets.token_urlsafe(24)) for name,email in
 [('MJ Test','mj.test@diceforge.app'),('Joueur Test','joueur.test@diceforge.app'),('Joueur Deux','joueur.deux@diceforge.app')]]
def literal(value):
    return "'" + str(value).replace("'", "''") + "'"
def source(path):
    return '\n'.join(line for line in (root/path).read_text(encoding='utf-8').splitlines() if line.strip().lower() not in ('begin;', 'commit;'))
parts = ["""begin;
do $$ begin
 if to_regnamespace('diceforge_v2') is not null or to_regclass('public.rolls') is not null then
  raise exception 'Installation réservée à un NOUVEAU projet de test vide. Aucune modification effectuée.';
 end if;
end $$;
create extension if not exists pgcrypto with schema extensions;
create table public.rolls (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 room_code text not null, player_name text not null, expression text not null,
 rolls_detail text not null default '', total integer not null default 0,
 is_crit boolean not null default false, is_fail boolean not null default false, is_hidden boolean not null default false
);
create index rolls_room_created_idx on public.rolls(room_code,created_at desc);
"""]
for name in ['supabase-personnages.sql','supabase-pj-sheets.sql','supabase-inventory.sql','supabase-auth.sql',
 'migrations/character-v2/schema.sql','migrations/character-v2/api.sql','migrations/character-v2/save-fixes.sql']:
    parts.append(source(Path(name)))
catalog=json.loads((root/'migrations/character-v2/catalog.json').read_text(encoding='utf-8'))
legacy=catalog['legacy_catalogs']['brp_57_v1']
for skill in catalog['skills']:
    index=str(legacy.index(skill['id'])) if skill['id'] in legacy else 'null'
    parts.append(f"insert into diceforge_v2.skill_catalog(id,name,legacy_index) values({literal(skill['id'])},{literal(skill['name'])},{index});")
for spell in catalog['spells']:
    parts.append(f"insert into diceforge_v2.spell_catalog(id,name) values({literal(spell['id'])},{literal(spell['name'])});")
for name in ['creation-lock.sql','progression.sql','progression-publication.sql','spell-learning.sql','character-roster.sql','recipe-corrections.sql']:
    parts.append(source(Path('migrations/character-v2')/name))
for account in accounts:
    meta=json.dumps({'player_name':account['name']},ensure_ascii=False)
    identity=json.dumps({'sub':account['id'],'email':account['email'],'email_verified':True})
    parts.append(f"""insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
 values('00000000-0000-0000-0000-000000000000',{literal(account['id'])},'authenticated','authenticated',{literal(account['email'])},extensions.crypt({literal(account['password'])},extensions.gen_salt('bf')),now(),'{{"provider":"email","providers":["email"]}}',{literal(meta)},now(),now(),'','','','');
 insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at)
 values(gen_random_uuid(),{literal(account['id'])},{literal(account['id'])},{literal(identity)},'email',now(),now());""")
mj,player,other=accounts
parts.append(f"""update diceforge_v2.configuration set enabled=true;
insert into diceforge_v2.mj_users values({literal(mj['id'])});
select set_config('request.jwt.claim.sub',{literal(mj['id'])},true);
select public.df_create_session_room(null,'TEST','MJ Test');
select public.df_create_session_room('TEST','TST2','MJ Test');
""")
for account in accounts[1:]:
    for room in ['TEST','TST2']:
        parts.append(f"insert into public.room_members(room_code,user_id,player_name) values({literal(room)},{literal(account['id'])},{literal(account['name'])});")
parts.append(f"select set_config('request.jwt.claim.sub',{literal(player['id'])},true);")
generation=dict(user_id=player['id'],player_name=player['name'],nom='Apprenti Test',intelligence=18,force=12,constitution=12,taille=12,pouvoir=12,dexterite=12,charisme=12,espece='Humain',profession='Sorcier')
parts.append(f"select public.df_character_query('personnages','insert','{{}}',{literal(json.dumps(generation,ensure_ascii=False))}::jsonb,'TEST');")
parts.append("""select public.df_character_roster('TEST','attach',(select id from diceforge_v2.characters where name='Apprenti Test'));
create table diceforge_v2.test_environment(project_name text not null,project_ref text not null,installed_at timestamptz default now());
alter table diceforge_v2.test_environment enable row level security;
revoke all on diceforge_v2.test_environment from public,anon,authenticated;
""")
parts.append(f"insert into diceforge_v2.test_environment(project_name,project_ref) values('base test',{literal(args.project_ref)});")
parts.append(source(Path('migrations/character-v2/character-generation.sql')))
parts.append(source(Path('migrations/character-v2/creation-budget.sql')))
parts.append(source(Path('migrations/character-v2/checked-save.sql')))
parts.append(source(Path('migrations/character-v2/complete-creation-budget.sql')))
parts.append(source(Path('migrations/character-v2/unplayed-presets.sql')))
parts.append(source(Path('migrations/character-v2/character-deletion.sql')))
parts.append("notify pgrst,'reload schema';\ncommit;\nselect project_name,project_ref,installed_at from diceforge_v2.test_environment;")
sql='\n\n'.join(parts)
(out/'install-base-test.sql').write_text(sql,encoding='utf-8')
(out/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>Installation base test</title><details><summary>Script SQL pour le projet base test</summary><pre id="installation-sql">'+html.escape(sql)+'</pre></details>',encoding='utf-8')
(out/'accounts.json').write_text(json.dumps({'project_ref':args.project_ref,'accounts':accounts},ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Installation préparée hors Git : {len(sql)} caractères ; 3 comptes de test, salles TEST/TST2, PJ Apprenti Test. Secrets non affichés.')
