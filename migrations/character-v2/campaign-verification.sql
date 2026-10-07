-- Authenticated production smoke checks. Every test write ends in ROLLBACK.
begin;
do $$
declare source record; result jsonb; row_data jsonb; saved jsonb; mj uuid; target uuid; temporary_campaign uuid;
begin
 select owner_id,campaign_id into mj,target from public.rooms where room_code='4SSU';
 for source in select s.id,c.owner_user_id,
  (select r.room_code from public.rooms r join public.room_members m using(room_code)
   where r.campaign_id=target and m.user_id=c.owner_user_id
    and not exists(select 1 from diceforge_v2.xp_sessions x where x.state_id=s.id and x.room_code=r.room_code and x.closed_at is not null)
   order by (r.room_code='4SSU') desc,r.created_at desc limit 1) room_code
  from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
  where s.campaign_id=target and c.status='active' loop
  perform set_config('request.jwt.claim.sub',source.owner_user_id::text,true);
  execute 'set local role authenticated';
  if source.room_code is null then raise exception 'Aucune session ouverte pour vérifier cette fiche'; end if;
  result:=public.df_character_query('pj_sheets','read',jsonb_build_object('id',source.id),null,source.room_code);
  row_data:=result->'rows'->0;
  if row_data is null or row_data->>'campaign_id'<>target::text then raise exception 'Lecture authentifiée de fiche échouée'; end if;
  saved:=public.df_character_query('pj_sheets','upsert',jsonb_build_object('id',source.id),
   jsonb_build_object('user_id',source.owner_user_id,'character_name',row_data->'character_name',
    'expected_revision',row_data->'revision','sheet_data',row_data->'sheet_data'),source.room_code);
  if saved ? 'error' or saved ? 'code' or saved->'rows'->0 is null then raise exception 'Sauvegarde authentifiée de fiche échouée : %',saved->>'code'; end if;
  execute 'reset role';
 end loop;
 perform set_config('request.jwt.claim.sub',mj::text,true);
 execute 'set local role authenticated';
 result:=public.df_campaigns('room',null,null,null,'4SSU');
 if result->'campaign'->>'id'<>target::text or result->'campaign'->>'name'<>'Valombre' then raise exception 'Identité Valombre incorrecte'; end if;
 result:=public.cm_context('4SSU');
 if result->>'campaignId'<>target::text or result->>'campaignName'<>'Valombre' then raise exception 'Contexte du lore incorrect'; end if;
 result:=public.df_campaigns('create',null,'Vérification temporaire','Cette campagne et sa room seront annulées.');
 temporary_campaign:=(result->'campaign'->>'id')::uuid;
 perform public.df_create_session_room(null,'QVF1','MJ',temporary_campaign);
 result:=public.df_character_query('pj_sheets','read','{}',null,'QVF1');
 if jsonb_array_length(result->'rows')<>0 then raise exception 'Fuite de fiche entre campagnes'; end if;
 result:=public.df_character_roster('QVF1','list');
 if jsonb_array_length(result->'characters')<>0 then raise exception 'Fuite de PJ entre campagnes'; end if;
 execute 'reset role';
end $$;
rollback;
