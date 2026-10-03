"""Exercise authoritative generation only on Supabase base test."""
import argparse, json, re, urllib.request, urllib.error, uuid
from pathlib import Path
cli=argparse.ArgumentParser(); cli.add_argument('accounts',type=Path); cli.add_argument('report',type=Path)
args=cli.parse_args(); accounts=json.loads(args.accounts.read_text(encoding='utf-8'))
assert accounts['project_ref']=='edmojqwjfyzeyewhkeah'
account=accounts['accounts'][2]
config=(Path(__file__).resolve().parents[1]/'supabase-config.test.js').read_text(encoding='utf-8')
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
details={'nom':'Recette Génération '+str(uuid.uuid4())[:6],'espece':'Nain','profession':'Guerrier','richesse':'Moyen'}
def generate(operation,character=None,adjustments=None,request=None,profile=None):
    return rpc('df_generate_character',p_room='TEST',p_operation=operation,p_character=character,p_details=profile or details,
               p_adjustments=adjustments or {},p_request=request or str(uuid.uuid4()))
def read(sid): return rpc('df_character_query',p_resource='pj_sheets',p_operation='read',p_room='TEST',p_filters={'id':sid})[1]['rows'][0]
try:
    status,result=rpc('df_character_roster',p_room='TEST',p_operation='new'); check('new creation opened',status==200,result)
    request=str(uuid.uuid4()); status,generated=generate('create',request=request)
    check('server generated character',status==200 and generated['generation']['serverGenerated'],generated)
    cid=generated['character_id']; sid=generated['state_id']
    status,retry=generate('create',request=request); check('retry does not reroll or duplicate',retry==generated,retry)
    check('scores in 3-21',all(3<=s['base']<=21 for s in generated['generation']['stats'].values()))
    check('racial dice retained',generated['generation']['stats']['force']['racial']['sign']==1 and generated['generation']['stats']['dexterite']['racial']['sign']==-1)
    row=read(sid); forged=json.loads(json.dumps(row['sheet_data'])); forged['stats']['intelligence']=999
    status,result=rpc('df_character_query',p_resource='pj_sheets',p_operation='upsert',p_room='TEST',p_filters={'id':sid},
        p_payload={'user_id':account['id'],'character_name':details['nom'],'expected_revision':row['revision'],'sheet_data':forged})
    check('forged draft score denied',result.get('code')=='42501',result)
    status,result=rpc('df_character_query',p_resource='personnages',p_operation='update',p_room='TEST',p_filters={'character_id':cid},p_payload={**generated,'intelligence':999})
    check('old generator route denied',result.get('code')=='42501',result)
    status,result=generate('save',cid,{'force':1}); check('unbalanced adjustment denied',result.get('code')=='22023',result)
    status,result=generate('save',cid,{'force':4,'constitution':-4}); check('four-point transfer denied',result.get('code')=='22023',result)
    values=generated['generation']['stats']; plus=next(k for k,v in values.items() if v['base']<21); minus=next(k for k,v in values.items() if k!=plus and v['base']>3)
    status,result=generate('save',cid,{plus:1,minus:-1}); check('valid transfer saved',status==200 and result['generation']['stats'][plus]['adjust']==1,result)
    status,result=generate('reroll',cid); check('first reroll saved',status==200 and result['rerolls_used']==1,result)
    status,result=generate('reroll',cid); check('second reroll saved',status==200 and result['rerolls_used']==2,result)
    status,result=generate('reroll',cid); check('third reroll denied',result.get('code')=='22023',result)
    status,result=generate('save',cid,profile={**details,'espece':'Elfe'}); check('race change denied',result.get('code')=='42501',result)
    row=read(sid); status,result=rpc('df_validate_creation',p_state=sid,p_room='TEST',p_expected_revision=row['revision']); check('generated creation validated',status==200,result)
    status,result=generate('reroll',cid); check('validated character cannot reroll',result.get('code')=='42501',result)
    rpc('df_character_roster',p_room='TEST',p_operation='new'); status,second=generate('create')
    check('second character has own identity',status==200 and second['character_id']!=cid,second)
    check('first sheet preserved',read(sid)['sheet_data']['creation']['phase']=='play')
finally:
    rpc('df_character_roster',p_room='TEST',p_operation='select' if previous else 'new',p_character=previous)
    args.report.write_text(json.dumps({'checks':checks,'character_id':locals().get('cid'),'state_id':locals().get('sid')},ensure_ascii=False,indent=2),encoding='utf-8')
