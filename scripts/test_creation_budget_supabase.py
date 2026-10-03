"""Budget regression checks against the named Supabase base test only."""
import argparse, copy, json, re, urllib.error, urllib.request, uuid
from pathlib import Path
cli=argparse.ArgumentParser(); cli.add_argument('accounts',type=Path); cli.add_argument('report',type=Path)
args=cli.parse_args(); accounts=json.loads(args.accounts.read_text(encoding='utf-8'))
assert accounts['project_ref']=='edmojqwjfyzeyewhkeah'
account=accounts['accounts'][2]
root=Path(__file__).resolve().parents[1]
config=(root/'supabase-config.test.js').read_text(encoding='utf-8')
url=re.search(r"url: '([^']+)'",config)[1]; key=re.search(r"anonKey: '([^']+)'",config)[1]
assert url=='https://edmojqwjfyzeyewhkeah.supabase.co'
token=None; checks=[]
def call(path,data):
    headers={'apikey':key,'Content-Type':'application/json'}
    if token: headers['Authorization']='Bearer '+token
    try:
        with urllib.request.urlopen(urllib.request.Request(url+path,data=json.dumps(data).encode(),headers=headers),timeout=30) as response:
            body=response.read(); return response.status,json.loads(body) if body else None
    except urllib.error.HTTPError as error: return error.code,json.loads(error.read())
def rpc(name,**data): return call('/rest/v1/rpc/'+name,data)
def check(label,condition,detail=None):
    checks.append({'check':label,'ok':bool(condition)}); assert condition,(label,detail); print('PASS',label)
_,auth=call('/auth/v1/token?grant_type=password',{'email':account['email'],'password':account['password']}); token=auth['access_token']
_,roster=rpc('df_character_roster',p_room='TEST',p_operation='list'); previous=roster['selected_character_id']
details={'nom':'Recette Budget '+str(uuid.uuid4())[:6],'espece':'Humain','profession':'Guerrier','richesse':'Moyen'}
def read(sid): return rpc('df_character_query',p_resource='pj_sheets',p_operation='read',p_room='TEST',p_filters={'id':sid})[1]['rows'][0]
def write(row,data): return rpc('df_character_query',p_resource='pj_sheets',p_operation='upsert',p_room='TEST',p_filters={'id':row['id']},
    p_payload={'user_id':account['id'],'character_name':details['nom'],'expected_revision':row['revision'],'sheet_data':data})
def rows(ids,points): return [{'id':sid,'base':0,'points':p,'score':p,'checked':False} for sid,p in zip(ids,points)]
inside=['skill.bagarre','skill.defense','skill.lutte','skill.arme_de_melee']
outside=['skill.estimation','skill.medecine','skill.alchimie']
try:
    rpc('df_character_roster',p_room='TEST',p_operation='new')
    status,generated=rpc('df_generate_character',p_room='TEST',p_operation='create',p_details=details,p_adjustments={},p_request=str(uuid.uuid4()))
    check('generated draft after budget migration',status==200,generated)
    sid=generated['state_id']; row=read(sid); personal=int(row['sheet_data']['stats']['intelligence'])*10
    valid=copy.deepcopy(row['sheet_data'])
    valid['skills']=rows(inside,[100,100,100,25])+rows(outside,[min(100,personal),max(0,min(100,personal-100)),max(0,personal-200)])
    status,result=write(row,valid); check('exact professional and personal budgets saved',status==200,result)
    row=read(sid); baseline=copy.deepcopy(row)
    total=copy.deepcopy(row['sheet_data']); next(s for s in total['skills'] if s.get('id')==inside[3]).update(points=26,score=26)
    status,result=write(row,total); check('overspent total draft rejected by hosted API',result.get('code')=='22023',result)
    check('rejected write preserves entire sheet and revision',read(sid)==baseline)
    wrong=copy.deepcopy(row['sheet_data']); wrong['skills']=rows(outside,[min(100,personal+1),max(0,min(100,personal+1-100)),max(0,personal+1-200)])
    status,result=write(row,wrong); check('personal excess rejected with professional points unused',result.get('code')=='22023',result)
    inflation=copy.deepcopy(row['sheet_data']); inflation['fields']['skillProfessionalPool']='999'
    status,result=write(row,inflation); check('professional pool cannot be increased',result.get('code')=='42501',result)
    spell=copy.deepcopy(row['sheet_data']); spell['spells']=[{'id':'spell.feu','name':'Feu','points':1,'checked':False}]
    status,result=write(row,spell); check('spells and skills use the same finite budget',result.get('code')=='22023',result)
    score=copy.deepcopy(row['sheet_data']); score['skills']=[{'id':inside[0],'base':50,'points':51,'score':101,'checked':False}]
    status,result=write(row,score); check('score above 100 rejected',result.get('code')=='22023',result)
    move=copy.deepcopy(row['sheet_data'])
    next(s for s in move['skills'] if s.get('id')==inside[0]).update(points=50,score=50)
    next(s for s in move['skills'] if s.get('id')==inside[3]).update(points=75,score=75)
    move['skills'].sort(key=lambda s:s.get('id')!=inside[3])
    status,result=write(row,move); check('whole-sheet redistribution saved atomically',status==200,result)
    row=read(sid)
    status,result=rpc('df_validate_creation',p_state=sid,p_room='TEST',p_expected_revision=row['revision'])
    check('valid draft can be validated',status==200,result)
    row=read(sid); check('validated phase is play',row['sheet_data']['creation']['phase']=='play')
    notes=copy.deepcopy(row['sheet_data']); notes['fields']['notes']='Notes après validation du budget'
    status,result=write(row,notes); check('normal notes save after validation',status==200,result)
finally:
    rpc('df_character_roster',p_room='TEST',p_operation='select' if previous else 'new',p_character=previous)
    args.report.write_text(json.dumps({'checks':checks,'state_id':locals().get('sid'),'character_id':locals().get('generated',{}).get('character_id')},ensure_ascii=False,indent=2),encoding='utf-8')
