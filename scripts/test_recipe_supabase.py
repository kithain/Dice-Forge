"""Integration checks against the named test project; never production."""
import argparse
import json
import re
import urllib.error
import urllib.request
import uuid
from pathlib import Path

cli = argparse.ArgumentParser()
cli.add_argument('accounts', type=Path)
cli.add_argument('report', type=Path)
args = cli.parse_args()
root = Path(__file__).resolve().parents[1]
accounts = json.loads(args.accounts.read_text(encoding='utf-8'))
assert accounts['project_ref'] == 'edmojqwjfyzeyewhkeah', 'Project base test required'
account = accounts['accounts'][2]
config = (root/'supabase-config.test.js').read_text(encoding='utf-8')
url = re.search(r"url: '([^']+)'", config)[1]
key = re.search(r"anonKey: '([^']+)'", config)[1]
assert url == 'https://edmojqwjfyzeyewhkeah.supabase.co'
token = None
checks = []

def call(path, data):
    headers = {'apikey':key, 'Content-Type':'application/json'}
    if token:
        headers['Authorization'] = 'Bearer '+token
    try:
        req = urllib.request.Request(url+path, data=json.dumps(data).encode(), headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def rpc(name, data):
    return call('/rest/v1/rpc/'+name, data)

def check(label, result, detail=None):
    checks.append({'check':label, 'ok':bool(result)})
    assert result, (label, detail)
    print('PASS', label)

_, auth = call('/auth/v1/token?grant_type=password', {'email':account['email'], 'password':account['password']})
token = auth['access_token']
fixture_name = 'Recette Protection '+str(uuid.uuid4())[:6]
_, roster = rpc('df_character_roster', {'p_room':'TEST', 'p_operation':'list'})
character = next((c for c in roster['characters'] if c['name']==fixture_name), None)
if not character:
    status, result = rpc('df_character_query', {'p_resource':'personnages', 'p_operation':'insert', 'p_room':'TEST',
      'p_payload':{'user_id':account['id'],'player_name':account['name'],'nom':fixture_name,'profession':'Sorcier','espece':'Humain','intelligence':18}})
    assert status == 200, result
    _, roster = rpc('df_character_roster', {'p_room':'TEST','p_operation':'list'})
    character = next(c for c in roster['characters'] if c['name']==fixture_name)
if character['needs_sheet']:
    _, roster = rpc('df_character_roster', {'p_room':'TEST','p_operation':'attach','p_character':character['character_id']})
    character = next(c for c in roster['characters'] if c['character_id']==character['character_id'])
sid = character['state_id']

def read():
    status, result = rpc('df_character_query', {'p_resource':'pj_sheets','p_operation':'read','p_room':'TEST','p_filters':{'id':sid}})
    assert status == 200, result
    return result['rows'][0]

def write(sheet):
    row = read()
    return rpc('df_character_query', {'p_resource':'pj_sheets','p_operation':'upsert','p_room':'TEST','p_filters':{'id':sid},
      'p_payload':{'user_id':account['id'],'character_name':fixture_name,'expected_revision':row['revision'],'sheet_data':sheet}})

row = read()
if row['sheet_data']['creation']['phase']=='draft':
    sheet = row['sheet_data']
    sheet['fields'].update(profession='Sorcier',race='Humain',age='25',wealth='Riche',skillProfessionalPool='325',equipment='Sac de voyage\nRichesse : Riche')
    sheet['stats'].update(intelligence=18,force=12,constitution=12,taille=12,pouvoir=12,dexterite=12,apparence=12)
    catalog = json.loads((root/'migrations/character-v2/catalog.json').read_text(encoding='utf-8'))['legacy_catalogs']['brp_57_v1']
    for identity, base, points in [('skill.estimation',15,60),('skill.bagarre',25,60),('skill.nage',25,61),('skill.recherche',25,75)]:
        index = catalog.index(identity)
        while len(sheet['skills']) <= index:
            sheet['skills'].append({})
        sheet['skills'][index] = dict(id=identity,base=base,points=points,score=base+points,checked=False)
    status, result = write(sheet)
    check('draft save', status==200, result)
    row = read()
    status, result = rpc('df_validate_creation', {'p_state':sid,'p_room':'TEST','p_expected_revision':row['revision']})
    check('professional pool cannot finance outside profession', result.get('code')=='22023' and 'personnels' in result.get('message',''), result)
    sheet = read()['sheet_data']
    next(s for s in sheet['skills'] if s.get('id')=='skill.nage').update(points=60,score=85)
    status, result = write(sheet)
    check('corrected personal points saved', status==200, result)
    row = read()
    status, result = rpc('df_validate_creation', {'p_state':sid,'p_room':'TEST','p_expected_revision':row['revision']})
    check('valid creation accepted', status==200, result)

row = read()
forged = json.loads(json.dumps(row['sheet_data']))
target = next(s for s in forged['skills'] if s.get('id')=='skill.estimation')
target['checked'] = True
status, result = write(forged)
check('forged check rejected', result.get('code')=='42501', result)
roll_args = dict(p_state=sid,p_room='TEST',p_resource='skill',p_id='skill.recherche',p_difficulty='normal',p_malus=0,p_request=str(uuid.uuid4()))
status, roll = rpc('df_roll_skill_test', roll_args)
check('server percentile test', status==200 and roll.get('score')==100, roll)
status, retry = rpc('df_roll_skill_test', roll_args)
check('retry returns identical roll', retry==roll, retry)
marked = next(s for s in read()['sheet_data']['skills'] if s.get('id')=='skill.recherche')['checked']
check('check matches success', marked==roll['success'], roll)
status, result = rpc('df_progression', dict(p_state=sid,p_room='TST2',p_operation='open'))
check('next session clears checks', status==200, result)
check('server cleared skill check', not next(s for s in read()['sheet_data']['skills'] if s.get('id')=='skill.recherche')['checked'])
args.report.write_text(json.dumps(dict(checks=checks,state_id=sid,character_id=character['character_id']),ensure_ascii=False,indent=2),encoding='utf-8')
