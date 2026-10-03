"""Prepare a synthetic checked character for visual tests on Supabase base test."""
import argparse, json, re, urllib.error, urllib.request, uuid
from pathlib import Path
cli=argparse.ArgumentParser(); cli.add_argument('accounts',type=Path); cli.add_argument('report',type=Path)
args=cli.parse_args(); accounts=json.loads(args.accounts.read_text(encoding='utf-8'))
assert accounts['project_ref']=='edmojqwjfyzeyewhkeah'
account=accounts['accounts'][1]
config=(Path(__file__).resolve().parents[1]/'supabase-config.test.js').read_text(encoding='utf-8')
url=re.search(r"url: '([^']+)'",config)[1]; key=re.search(r"anonKey: '([^']+)'",config)[1]
assert url=='https://edmojqwjfyzeyewhkeah.supabase.co'
token=None
def call(path,data):
    headers={'apikey':key,'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    try:
        with urllib.request.urlopen(urllib.request.Request(url+path,data=json.dumps(data).encode(),headers=headers),timeout=30) as response:
            return json.load(response)
    except urllib.error.HTTPError as error: raise AssertionError(json.loads(error.read())) from error
def rpc(name,**data): return call('/rest/v1/rpc/'+name,data)
auth=call('/auth/v1/token?grant_type=password',{'email':account['email'],'password':account['password']}); token=auth['access_token']
roster=rpc('df_character_roster',p_room='TEST',p_operation='list'); previous=roster['selected_character_id']
def read(sid): return rpc('df_character_query',p_resource='pj_sheets',p_operation='read',p_room='TEST',p_filters={'id':sid})['rows'][0]
try:
    rpc('df_character_roster',p_room='TEST',p_operation='new')
    details={'nom':'Recette Dés XP '+str(uuid.uuid4())[:6],'espece':'Humain','profession':'Guerrier','richesse':'Moyen'}
    generated=rpc('df_generate_character',p_room='TEST',p_operation='create',p_details=details,p_adjustments={},p_request=str(uuid.uuid4()))
    sid=generated['state_id']; row=read(sid); data=row['sheet_data']
    data['skills']=[{'id':sid,'name':name,'base':base,'points':50-base,'score':50,'checked':False}
                    for sid,name,base in [('skill.estimation','Estimation',15),('skill.medecine','Médecine',5),('skill.bagarre','Bagarre',25)]]
    row=rpc('df_character_query',p_resource='pj_sheets',p_operation='upsert',p_room='TEST',p_filters={'id':sid},
        p_payload={'user_id':account['id'],'character_name':details['nom'],'expected_revision':row['revision'],'sheet_data':data})['rows'][0]
    rpc('df_validate_creation',p_state=sid,p_room='TEST',p_expected_revision=row['revision'])
    rolls=[]
    for skill in data['skills']:
        for _ in range(25):
            result=rpc('df_roll_skill_test',p_state=sid,p_room='TEST',p_resource='skill',p_id=skill['id'],p_difficulty='normal',p_malus=0,p_request=str(uuid.uuid4()))
            rolls.append(result)
            if result['checked']: break
        assert result['checked']
    row=read(sid)
    assert row['sheet_data']['creation']['phase']=='play'
    assert len([s for s in row['sheet_data']['skills'] if s.get('checked')])==3
    args.report.write_text(json.dumps({'character_id':generated['character_id'],'state_id':sid,'name':details['nom'],'sheet':row,'rolls':rolls},ensure_ascii=False,indent=2),encoding='utf-8')
    print('Prepared synthetic XP character:',details['nom'],sid,generated['character_id'])
finally:
    rpc('df_character_roster',p_room='TEST',p_operation='select' if previous else 'new',p_character=previous)
