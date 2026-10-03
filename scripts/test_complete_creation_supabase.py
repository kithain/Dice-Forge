"""Complete-allocation checks against the named Supabase base test only."""
import argparse, copy, json, re, urllib.error, urllib.request, uuid
from pathlib import Path
cli=argparse.ArgumentParser(); cli.add_argument('accounts',type=Path); cli.add_argument('report',type=Path)
args=cli.parse_args(); accounts=json.loads(args.accounts.read_text(encoding='utf-8'))
assert accounts['project_ref']=='edmojqwjfyzeyewhkeah'
account=accounts['accounts'][1]
config=(Path(__file__).resolve().parents[1]/'supabase-config.test.js').read_text(encoding='utf-8')
url=re.search(r"url: '([^']+)'",config)[1]; key=re.search(r"anonKey: '([^']+)'",config)[1]
assert url=='https://edmojqwjfyzeyewhkeah.supabase.co'
token=None; checks=[]; fixtures=[]
def call(path,data):
    headers={'apikey':key,'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    try:
        with urllib.request.urlopen(urllib.request.Request(url+path,data=json.dumps(data).encode(),headers=headers),timeout=30) as response:
            return response.status,json.load(response)
    except urllib.error.HTTPError as error: return error.code,json.loads(error.read())
def rpc(name,**data): return call('/rest/v1/rpc/'+name,data)
def ok(label,condition):
    checks.append({'check':label,'ok':bool(condition)}); assert condition,label; print('PASS',label)
_,auth=call('/auth/v1/token?grant_type=password',{'email':account['email'],'password':account['password']}); token=auth['access_token']
_,roster=rpc('df_character_roster',p_room='TEST',p_operation='list'); previous=roster['selected_character_id']
def read(sid): return rpc('df_character_query',p_resource='pj_sheets',p_operation='read',p_room='TEST',p_filters={'id':sid})[1]['rows'][0]
def write(row,data):
    status,result=rpc('df_character_query',p_resource='pj_sheets',p_operation='upsert',p_room='TEST',p_filters={'id':row['id']},
        p_payload={'user_id':account['id'],'character_name':row['character_name'],'expected_revision':row['revision'],'sheet_data':data})
    assert status==200,result
    return result['rows'][0]
def create(prefix):
    rpc('df_character_roster',p_room='TEST',p_operation='new')
    status,generated=rpc('df_generate_character',p_room='TEST',p_operation='create',p_details={'nom':prefix+' '+str(uuid.uuid4())[:6],'espece':'Humain','profession':'Guerrier','richesse':'Moyen'},p_adjustments={},p_request=str(uuid.uuid4()))
    assert status==200,generated
    row=read(generated['state_id']); data=copy.deepcopy(row['sheet_data']); data['skills']=[]; data['spells']=[]
    inside=[('skill.bagarre',25),('skill.defense',int(data['stats']['dexterite'])*2),('skill.lutte',25),('skill.arme_de_melee',0),('skill.arme_de_jet',0)]
    outside=[('skill.estimation',15),('skill.medecine',5),('skill.alchimie',1)]
    for targets,budget in [(inside,325),(outside,int(data['stats']['intelligence'])*10)]:
        for sid,base in targets:
            points=min(budget,100-base); budget-=points
            data['skills'].append({'id':sid,'base':base,'points':points,'score':base+points,'checked':False})
        assert budget==0
    return row,data
def partial(complete,remaining):
    data=copy.deepcopy(complete)
    for skill in data['skills']:
        amount=min(remaining,skill['points']);remaining-=amount;skill['points']-=amount;skill['score']-=amount
    assert remaining==0
    return data
try:
    row,complete=create('Recette Validation complète')
    for remaining in [110,1]:
        row=write(row,partial(complete,remaining)); baseline=copy.deepcopy(row)
        status,result=rpc('df_validate_creation',p_state=row['id'],p_room='TEST',p_expected_revision=row['revision'])
        ok(f'{remaining} unspent points rejected by hosted API',status==400 and result.get('code')=='22023' and f'{remaining} point' in result.get('message',''))
        ok('Rejected validation preserves draft, data and revision',read(row['id'])==baseline)
        ok('Rejected validation opens no XP session',not baseline['sheet_data']['progression'].get('session'))
    row=write(row,complete)
    status,result=rpc('df_validate_creation',p_state=row['id'],p_room='TEST',p_expected_revision=row['revision'])
    ok('Fully allocated creation accepted by hosted API',status==200 and result['sheet_data']['creation']['phase']=='play')
    row=read(row['id']); status,result=rpc('df_validate_creation',p_state=row['id'],p_room='TEST',p_expected_revision=row['revision'])
    ok('Repeated validation does not allocate another pool',status==200 and result['already_validated'])
    fixtures.append({'state_id':row['id'],'name':row['character_name'],'phase':'play'})
    row,complete=create('Recette 110 points'); row=write(row,partial(complete,110))
    ok('Partial allocation can still be saved as draft',row['sheet_data']['creation']['phase']=='draft')
    fixtures.append({'state_id':row['id'],'character_id':row['sheet_data']['character_id'],'name':row['character_name'],'phase':'draft','sheet':row})
finally:
    rpc('df_character_roster',p_room='TEST',p_operation='select' if previous else 'new',p_character=previous)
    args.report.write_text(json.dumps({'checks':checks,'fixtures':fixtures},ensure_ascii=False,indent=2),encoding='utf-8')
