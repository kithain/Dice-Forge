-- Apply to an existing character-v2 deployment. Does not activate the server switch.
begin;
alter table diceforge_v2.states add column if not exists sheet_revision bigint;
alter table diceforge_v2.states add column if not exists inventory_revision bigint;
update diceforge_v2.states set sheet_revision=coalesce(sheet_revision,revision),inventory_revision=coalesce(inventory_revision,revision);
alter table diceforge_v2.states alter column sheet_revision set default 1, alter column sheet_revision set not null;
alter table diceforge_v2.states alter column inventory_revision set default 1, alter column inventory_revision set not null;
create or replace function diceforge_v2.can_read(p_state uuid) returns boolean
language sql stable security definer set search_path = pg_catalog as $$
  select exists(select 1 from diceforge_v2.states s
    join diceforge_v2.characters c on c.id=s.character_id
    join diceforge_v2.campaigns a on a.id=s.campaign_id
    where s.id=p_state and (c.owner_user_id=auth.uid() or a.owner_user_id=auth.uid()))
$$;

create or replace function diceforge_v2.sheet(p_state uuid) returns jsonb
language sql stable set search_path = pg_catalog as $$
  select s.legacy_sheet_data || jsonb_build_object(
    'character_id',s.character_id,'state_id',s.id,'campaign_id',s.campaign_id,'revision',s.sheet_revision,
    'fields',s.fields,'stats',s.stats,
    'skills',coalesce((select jsonb_agg(coalesce(k.raw_payload,'{}') ||
      case when k.id is null then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object(
        'id',k.skill_id,'name',cat.name,'base',k.base,'points',k.points,'score',k.score,'checked',k.checked)) end
      order by slot.index)
      from generate_series(0,56) slot(index)
      left join diceforge_v2.skill_catalog cat on cat.legacy_index=slot.index
      left join diceforge_v2.skills k on k.state_id=s.id and k.skill_id=cat.id),'[]'),
    'spells',coalesce((select jsonb_agg(
      coalesce(p.raw_payload,'{}') || jsonb_build_object('id',p.spell_id,'name',cat.name,'points',p.points,'checked',p.checked)
      order by p.legacy_index,p.id) from diceforge_v2.spells p
      join diceforge_v2.spell_catalog cat on cat.id=p.spell_id where p.state_id=s.id),'[]') ||
      coalesce((select jsonb_agg(e) from jsonb_array_elements(coalesce(s.legacy_sheet_data->'spells','[]')) e
       where coalesce(e->>'name','')=''),'[]'))
  from diceforge_v2.states s where s.id=p_state
$$;

create or replace function diceforge_v2.inventory(p_state uuid) returns jsonb
language plpgsql stable set search_path = pg_catalog as $$
declare result jsonb; v_category text;
begin
 select coalesce(s.legacy_inventory,'{}') || jsonb_build_object('state_id',s.id,'revision',s.inventory_revision,
   'po',coalesce(w.po,0),'pa',coalesce(w.pa,0),'pc',coalesce(w.pc,0)) into result
 from diceforge_v2.states s left join diceforge_v2.wallets w on w.state_id=s.id where s.id=p_state;
 foreach v_category in array array['weapons','armors','equipment','consumables','miscellaneous'] loop
  result := result || jsonb_build_object(v_category,coalesce((select jsonb_agg(i.payload || jsonb_build_object('id',i.id)
    order by i.legacy_index) from diceforge_v2.items i where i.state_id=p_state and i.category=v_category),'[]'));
 end loop;
 return result;
end $$;

create or replace function diceforge_v2.save_sheet(p_state uuid, data jsonb) returns void
language plpgsql set search_path = pg_catalog as $$
declare row jsonb; idx integer; identity text; numeric_stats jsonb; seen_skills text[]:='{}'; seen_spells text[]:='{}';
begin
 if jsonb_typeof(data->'fields') is distinct from 'object' or jsonb_typeof(data->'stats') is distinct from 'object'
   or jsonb_typeof(data->'skills') is distinct from 'array' or jsonb_typeof(data->'spells') is distinct from 'array' then
   raise exception 'Fiche invalide';
 end if;
 if exists(select 1 from jsonb_each(data->'stats') where nullif(trim(value#>>'{}'),'') is not null
   and (value#>>'{}') !~ '^[0-9]{1,3}$') then
   raise exception 'Caractéristiques invalides : entier entre 0 et 999, ou vide pour N/A' using errcode='22023';
 end if;
 select jsonb_object_agg(key,nullif(trim(value#>>'{}'),'')::integer) into numeric_stats from jsonb_each(data->'stats');
 update diceforge_v2.states set fields=fields || (data->'fields'), stats=coalesce(numeric_stats,'{}'),
   legacy_sheet_data=legacy_sheet_data || data where id=p_state;
 for row,idx in select value,(ordinality-1)::int from jsonb_array_elements(data->'skills') with ordinality loop
  if row='{}'::jsonb then continue; end if;
  select c.id into identity from diceforge_v2.skill_catalog c where
   (row ? 'id' and c.id=row->>'id') or (not row ? 'id' and (c.name=row->>'name' or c.aliases ? (row->>'name')))
   or (not row ? 'id' and not row ? 'name' and c.legacy_index=idx);
  if identity is null then raise exception 'Compétence inconnue à la position %',idx; end if;
  if identity=any(seen_skills) then raise exception 'Compétence dupliquée : %',identity; end if;
  seen_skills:=array_append(seen_skills,identity);
  insert into diceforge_v2.skills(id,state_id,skill_id,legacy_index,raw_payload,base,points,score,checked)
  values(gen_random_uuid(),p_state,identity,idx,row,nullif(row->>'base','')::int,nullif(row->>'points','')::int,
    nullif(row->>'score','')::int,coalesce((row->>'checked')::boolean,false))
   on conflict(state_id,skill_id,specialty) do update set raw_payload=excluded.raw_payload,
    base=excluded.base,points=excluded.points,score=excluded.score,checked=excluded.checked,legacy_index=excluded.legacy_index;
 end loop;
 delete from diceforge_v2.skills where state_id=p_state and not skill_id=any(seen_skills);
 for row,idx in select value,(ordinality-1)::int from jsonb_array_elements(data->'spells') with ordinality loop
  if coalesce(row->>'name','')='' then continue; end if;
  select c.id into identity from diceforge_v2.spell_catalog c
   where (row ? 'id' and c.id=row->>'id') or (not row ? 'id' and c.name=row->>'name');
  if identity is null then raise exception 'Sort inconnu : %',row->>'name'; end if;
  if identity=any(seen_spells) then raise exception 'Sort dupliqué : %',identity; end if;
  seen_spells:=array_append(seen_spells,identity);
  insert into diceforge_v2.spells(id,state_id,spell_id,legacy_index,raw_payload,points,checked)
   values(gen_random_uuid(),p_state,identity,idx,row,(row->>'points')::int,coalesce((row->>'checked')::boolean,false))
   on conflict(state_id,spell_id) do update set raw_payload=excluded.raw_payload,points=excluded.points,
    checked=excluded.checked,legacy_index=excluded.legacy_index;
 end loop;
 delete from diceforge_v2.spells where state_id=p_state and not spell_id=any(seen_spells);
end $$;

create or replace function public.df_character_query(p_resource text,p_operation text default 'read',p_filters jsonb default '{}',
 p_payload jsonb default null,p_room text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; chosen diceforge_v2.states; character diceforge_v2.characters;
 result jsonb:='[]'; row jsonb; data jsonb; category text; element jsonb; idx integer; target uuid; created_state boolean:=false;
begin
 if not (select enabled from diceforge_v2.configuration) then return jsonb_build_object('legacy',true); end if;
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if p_resource not in ('personnages','pj_sheets','pj_inventory') or p_operation not in ('read','update','upsert','insert') then
  raise exception 'Opération inconnue'; end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_room;
 if p_operation='read' then
  if p_resource='personnages' and campaign is null then
   select coalesce(jsonb_agg(c.initial_record || jsonb_build_object('character_id',c.id,'user_id',c.owner_user_id,'nom',c.name)),'[]')
    into result from diceforge_v2.characters c where c.owner_user_id=uid and c.status='active'
    and (p_filters->>'user_id' is null or c.owner_user_id::text=p_filters->>'user_id');
  else
   for chosen in select s.* from diceforge_v2.states s where s.campaign_id=campaign and diceforge_v2.can_read(s.id) loop
    select * into character from diceforge_v2.characters c where c.id=chosen.character_id;
    if p_resource='personnages' then
     row:=character.initial_record || chosen.stats || jsonb_build_object('character_id',character.id,'state_id',chosen.id,
      'nom',character.name,'profession',chosen.fields->>'profession','espece',chosen.fields->>'race',
      'charisme',chosen.stats->'apparence','user_id',character.owner_user_id,'player_name',character.source_player_name);
    else
     data:=case when p_resource='pj_sheets' then diceforge_v2.sheet(chosen.id) else diceforge_v2.inventory(chosen.id) end;
     row:=jsonb_build_object('id',chosen.id,'state_id',chosen.id,'character_id',character.id,'campaign_id',campaign,
      'revision',case when p_resource='pj_sheets' then chosen.sheet_revision else chosen.inventory_revision end,'room_code',p_room,'user_id',character.owner_user_id,'player_name',character.source_player_name,
      'character_name',character.name,'updated_at',chosen.updated_at);
     if p_resource='pj_sheets' then row:=row || jsonb_build_object('sheet_data',data,'markdown_content',chosen.legacy_markdown);
     else row:=data || row; end if;
    end if;
    if not exists(select 1 from jsonb_each(p_filters) f where row->f.key is distinct from f.value) then result:=result || jsonb_build_array(row); end if;
   end loop;
  end if;
  return jsonb_build_object('rows',result);
 end if;
 if p_payload->>'user_id' is not null and (p_payload->>'user_id')::uuid<>uid then raise exception 'Propriétaire incorrect' using errcode='42501'; end if;
 if p_resource='personnages' then
  select * into character from diceforge_v2.characters c where c.owner_user_id=uid and c.status='active'
   and c.name=p_payload->>'nom' limit 1 for update;
  if not found then
   insert into diceforge_v2.characters(id,owner_user_id,name,source_player_name,status,initial_record,generation)
    values(gen_random_uuid(),uid,p_payload->>'nom',p_payload->>'player_name','active',p_payload,p_payload->'generation') returning * into character;
  else
   update diceforge_v2.characters set initial_record=initial_record || p_payload,generation=coalesce(p_payload->'generation',generation)
    where id=character.id;
  end if;
  -- Only the current campaign receives generator edits; other campaigns keep their state.
  update diceforge_v2.states set
    stats=stats || coalesce((select jsonb_object_agg(case key when 'charisme' then 'apparence' else key end,value)
      from jsonb_each(p_payload) where key in ('force','constitution','taille','intelligence','pouvoir','dexterite','charisme')),'{}'),
    fields=fields || coalesce((select jsonb_object_agg(case key when 'espece' then 'race' else key end,value)
      from jsonb_each(p_payload) where key in ('espece','profession')),'{}'),
    sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp()
    where character_id=character.id and campaign_id=campaign;
  return jsonb_build_object('rows',jsonb_build_array(p_payload || jsonb_build_object('character_id',character.id)));
 end if;
 if campaign is null then raise exception 'Ce salon doit être rattaché à une campagne'; end if;
 if not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)
  and not exists(select 1 from diceforge_v2.campaigns where id=campaign and owner_user_id=uid) then
  raise exception 'Rejoignez le salon avant de sauvegarder' using errcode='42501'; end if;
 select s.* into chosen from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
  where s.campaign_id=campaign and c.owner_user_id=uid
   and (p_filters->>'id' is null or s.id::text=p_filters->>'id')
   and (p_payload->>'character_name' is null or c.name=p_payload->>'character_name'
    or c.id::text=p_payload->'sheet_data'->>'character_id') limit 1 for update of s;
 if not found then
  if p_operation='update' then return jsonb_build_object('rows','[]'::jsonb); end if;
  select * into character from diceforge_v2.characters c where c.owner_user_id=uid and c.name=p_payload->>'character_name' and c.status='active';
  if not found then raise exception 'Créez ou sélectionnez le personnage permanent avant sa fiche'; end if;
  insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
   values(gen_random_uuid(),campaign,character.id,'{}','{}','{}','') returning * into chosen;
  created_state:=true;
 end if;
 if not created_state and not p_payload ? 'expected_revision' and not p_filters ? 'updated_at' then
  raise exception 'Rechargez la fiche de campagne avant de sauvegarder.' using errcode='40001'; end if;
 if p_filters ? 'updated_at' and (p_filters->>'updated_at')::timestamptz<>chosen.updated_at then return jsonb_build_object('rows','[]'::jsonb); end if;
 if p_payload ? 'expected_revision' and (p_payload->>'expected_revision')::bigint<>(case when p_resource='pj_sheets' then chosen.sheet_revision else chosen.inventory_revision end) then
  raise exception 'La fiche a changé. Rechargez les données avant de sauvegarder.' using errcode='40001'; end if;
 if p_resource='pj_sheets' then
  perform diceforge_v2.save_sheet(chosen.id,p_payload->'sheet_data');
  update diceforge_v2.characters set name=coalesce(nullif(trim(p_payload->>'character_name'),''),name) where id=chosen.character_id;
  update diceforge_v2.states set legacy_markdown=coalesce(p_payload->>'markdown_content',legacy_markdown) where id=chosen.id;
 else
  insert into diceforge_v2.wallets values(chosen.id,(p_payload->>'po')::int,(p_payload->>'pa')::int,(p_payload->>'pc')::int)
   on conflict(state_id) do update set po=excluded.po,pa=excluded.pa,pc=excluded.pc;
  if (p_payload->>'po')::int not between 0 and 9999 or (p_payload->>'pa')::int not between 0 and 9 or (p_payload->>'pc')::int not between 0 and 9 then
   raise exception 'Monnaie invalide'; end if;
  delete from diceforge_v2.items where state_id=chosen.id;
  foreach category in array array['weapons','armors','equipment','consumables','miscellaneous'] loop
   for element,idx in select value,(ordinality-1)::int from jsonb_array_elements(coalesce(p_payload->category,'[]')) with ordinality loop
    target:=coalesce(nullif(element->>'id','')::uuid,gen_random_uuid());
    insert into diceforge_v2.items values(target,chosen.id,category,element->>'name',idx,element);
   end loop;
  end loop;
  update diceforge_v2.states set legacy_inventory=coalesce(legacy_inventory,'{}') || p_payload where id=chosen.id;
 end if;
 update diceforge_v2.states set revision=revision+1,
  sheet_revision=sheet_revision+case when p_resource='pj_sheets' then 1 else 0 end,
  inventory_revision=inventory_revision+case when p_resource='pj_inventory' then 1 else 0 end,
  updated_at=clock_timestamp() where id=chosen.id;
 return public.df_character_query(p_resource,'read',jsonb_build_object('id',chosen.id),null,p_room);
end $$;

create or replace function public.df_link_campaign_room(p_source text,p_target text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare campaign uuid; existing uuid;
begin
 if not (select enabled from diceforge_v2.configuration) then return null; end if;
 if auth.uid() is null or not exists(select 1 from public.rooms where room_code=p_target and owner_id=auth.uid()) then
  raise exception 'Seul le MJ du salon peut le rattacher' using errcode='42501'; end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_source;
 if campaign is null then
  insert into diceforge_v2.campaigns values(gen_random_uuid(),'Nouvelle campagne',p_target,auth.uid(),now()) returning id into campaign;
 elsif not exists(select 1 from diceforge_v2.campaigns where id=campaign and owner_user_id=auth.uid()) then
  raise exception 'Vous ne gérez pas cette campagne' using errcode='42501';
 end if;
 select campaign_id into existing from diceforge_v2.campaign_rooms where room_code=p_target;
 if existing is not null and existing<>campaign then raise exception 'Salon déjà lié à une autre campagne'; end if;
 insert into diceforge_v2.campaign_rooms values(p_target,campaign) on conflict(room_code) do nothing;
 return campaign;
end $$;

notify pgrst,'reload schema';
commit;
