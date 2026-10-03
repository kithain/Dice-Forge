-- Apply after character-deletion.sql. Read-only identities for migrating GM notes.
begin;
create or replace function public.df_mj_notebook_sources(p_room text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare campaign uuid; result jsonb;
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_room;
 if not exists(select 1 from diceforge_v2.campaigns a join diceforge_v2.mj_users m on m.user_id=a.owner_user_id
  where a.id=campaign and a.owner_user_id=auth.uid()) then
  raise exception 'Carnet réservé au MJ de cette campagne.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('state_id',s.id,'character_id',s.character_id,
  'legacy_sheet_ids',coalesce((select jsonb_agg(a.source_key order by a.source_key)
   from diceforge_v2.archives a where a.source_table='pj_sheets' and a.payload->>'room_code'=p_room
   and (a.source_key=anchor.source_key or
    (anchor.payload->>'user_id' is not null and a.payload->>'user_id'=anchor.payload->>'user_id'
     and a.payload->>'character_name'=anchor.payload->>'character_name'))),'[]'::jsonb)) order by s.id),'[]'::jsonb)
 into result from diceforge_v2.states s
 left join diceforge_v2.archives anchor on anchor.source_table='pj_sheets' and anchor.source_key=s.source_sheet_id::text
 where s.campaign_id=campaign;
 return result;
end $$;
revoke all on function public.df_mj_notebook_sources(text) from public,anon;
grant execute on function public.df_mj_notebook_sources(text) to authenticated;
notify pgrst,'reload schema';
commit;
