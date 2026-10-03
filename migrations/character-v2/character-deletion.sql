-- Apply after unplayed-presets.sql. Recoverable removal of permanent characters.
-- Existing sheets, inventories and XP ledgers are preserved and become inaccessible.
begin;
alter table diceforge_v2.characters drop constraint if exists characters_status_check;
alter table diceforge_v2.characters add constraint characters_status_check
 check(status in ('active','archived','dead','deleted'));
create table if not exists diceforge_v2.character_deletions (
 character_id uuid primary key references diceforge_v2.characters(id),
 campaign_id uuid not null references diceforge_v2.campaigns(id),
 deleted_by uuid not null references auth.users(id),
 deleted_at timestamptz not null default clock_timestamp(),
 previous_status text not null check(previous_status in ('active','archived','dead')),
 previous_roster jsonb not null default '[]',
 restored_at timestamptz
);
alter table diceforge_v2.character_deletions enable row level security;
revoke all on diceforge_v2.character_deletions from public,anon,authenticated;

create or replace function diceforge_v2.can_manage_deletion(p_character uuid,p_campaign uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from diceforge_v2.campaigns a join diceforge_v2.mj_users m on m.user_id=a.owner_user_id
  where a.id=p_campaign and a.owner_user_id=auth.uid())
 and exists(select 1 from diceforge_v2.characters c where c.id=p_character and
  (c.owner_user_id=auth.uid() or exists(select 1 from diceforge_v2.states s where s.character_id=c.id and s.campaign_id=p_campaign)))
 and not exists(select 1 from diceforge_v2.states s join diceforge_v2.campaigns a on a.id=s.campaign_id
  where s.character_id=p_character and a.owner_user_id is distinct from auth.uid())
$$;
revoke all on function diceforge_v2.can_manage_deletion(uuid,uuid) from public,anon,authenticated;

-- Keep all previously deployed roster rules behind an inaccessible facade.
do $$ begin
 if to_regprocedure('diceforge_v2.character_roster_before_deletion(text,text,uuid,uuid)') is null then
  alter function public.df_character_roster(text,text,uuid,uuid) set schema diceforge_v2;
  alter function diceforge_v2.df_character_roster(text,text,uuid,uuid) rename to character_roster_before_deletion;
 end if;
end $$;
revoke all on function diceforge_v2.character_roster_before_deletion(text,text,uuid,uuid) from public,anon,authenticated;

create or replace function public.df_character_roster(p_room text,p_operation text default 'list',p_character uuid default null,p_reserved_user uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; c diceforge_v2.characters; deletion diceforge_v2.character_deletions;
 result jsonb; characters jsonb; trash jsonb; old_roster jsonb;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if not coalesce((select enabled from diceforge_v2.configuration),false) then return jsonb_build_object('legacy',true); end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_room;
 if campaign is null then raise exception 'Salon sans campagne' using errcode='42501'; end if;
 if p_operation in ('delete','restore') then
  if not diceforge_v2.can_manage_deletion(p_character,campaign) then
   raise exception 'Suppression et restauration réservées au MJ de toutes les campagnes de ce personnage.' using errcode='42501'; end if;
  -- Same campaign/character lock order as selection and attribution. Lock all affected campaigns.
  perform 1 from diceforge_v2.campaigns a where a.id=campaign or a.id in
   (select s.campaign_id from diceforge_v2.states s where s.character_id=p_character) order by a.id for update;
  select * into c from diceforge_v2.characters where id=p_character for update;
  if not diceforge_v2.can_manage_deletion(p_character,campaign) then
   raise exception 'Les droits sur ce personnage ont changé.' using errcode='42501'; end if;
  perform 1 from diceforge_v2.states where character_id=p_character order by id for update;
  if p_operation='delete' and c.status<>'deleted' then
   select coalesce(jsonb_agg(to_jsonb(r)),'[]') into old_roster from diceforge_v2.character_roster r where r.character_id=c.id;
   insert into diceforge_v2.character_deletions(character_id,campaign_id,deleted_by,previous_status,previous_roster)
    values(c.id,campaign,uid,c.status,old_roster)
    on conflict(character_id) do update set campaign_id=excluded.campaign_id,deleted_by=excluded.deleted_by,
     deleted_at=clock_timestamp(),previous_status=excluded.previous_status,previous_roster=excluded.previous_roster,restored_at=null;
   update diceforge_v2.characters set status='deleted' where id=c.id;
   update diceforge_v2.character_roster set available=false where character_id=c.id;
   delete from diceforge_v2.character_selections where character_id=c.id;
   insert into diceforge_v2.character_lifecycle_events(campaign_id,character_id,actor,action,payload)
    values(campaign,c.id,uid,'delete',jsonb_build_object('previous_status',c.status));
  elsif p_operation='restore' and c.status='deleted' then
   select * into deletion from diceforge_v2.character_deletions where character_id=c.id and restored_at is null for update;
   if not found then raise exception 'Sauvegarde de suppression absente.' using errcode='22023'; end if;
   update diceforge_v2.characters set status=deletion.previous_status where id=c.id;
   update diceforge_v2.character_roster r set available=saved.available,preset=saved.preset,reserved_user_id=saved.reserved_user_id
    from jsonb_populate_recordset(null::diceforge_v2.character_roster,deletion.previous_roster) saved
    where r.campaign_id=saved.campaign_id and r.character_id=saved.character_id;
   update diceforge_v2.character_deletions set restored_at=clock_timestamp() where character_id=c.id;
   insert into diceforge_v2.character_lifecycle_events(campaign_id,character_id,actor,action,payload)
    values(campaign,c.id,uid,'restore',jsonb_build_object('restored_status',deletion.previous_status));
  end if;
  -- Repeat requests are harmless; restoration never changes a player's current selection.
  result:=diceforge_v2.character_roster_before_deletion(p_room,'list',null,null);
 else
  if p_operation<>'list' and exists(select 1 from diceforge_v2.characters where id=p_character and status='deleted') then
   raise exception 'Personnage supprimé : le MJ doit le restaurer depuis la corbeille.' using errcode='42501'; end if;
  result:=diceforge_v2.character_roster_before_deletion(p_room,p_operation,p_character,p_reserved_user);
 end if;
 select coalesce(jsonb_agg(value || jsonb_build_object('can_delete',coalesce((result->>'is_mj')::boolean,false)
   and diceforge_v2.can_manage_deletion((value->>'character_id')::uuid,campaign))),'[]') into characters
  from jsonb_array_elements(result->'characters') where value->>'status'<>'deleted';
 trash:='[]';
 if coalesce((result->>'is_mj')::boolean,false) then
  select coalesce(jsonb_agg(jsonb_build_object('character_id',ch.id,'state_id',s.id,'name',ch.name,'player_name',ch.source_player_name,
   'status','deleted','deleted_at',d.deleted_at,'can_restore',diceforge_v2.can_manage_deletion(ch.id,campaign)) order by d.deleted_at desc,ch.id),'[]') into trash
   from diceforge_v2.characters ch join diceforge_v2.character_deletions d on d.character_id=ch.id and d.restored_at is null
   left join diceforge_v2.states s on s.character_id=ch.id and s.campaign_id=campaign
   where ch.status='deleted' and (s.id is not null or ch.owner_user_id=uid);
 end if;
 return result || jsonb_build_object('characters',characters,'deleted_characters',trash);
end $$;
revoke all on function public.df_character_roster(text,text,uuid,uuid) from public,anon;
grant execute on function public.df_character_roster(text,text,uuid,uuid) to authenticated;

-- Every sheet/inventory reader uses this predicate, including explicit UUID lookups.
create or replace function diceforge_v2.can_read(p_state uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
  join diceforge_v2.campaigns a on a.id=s.campaign_id
  where s.id=p_state and c.status<>'deleted' and (c.owner_user_id=auth.uid() or a.owner_user_id=auth.uid()))
$$;

-- Replaying a generator receipt must not resurrect a deleted character in the UI.
do $$ begin
 if to_regprocedure('diceforge_v2.generate_character_before_deletion(text,text,uuid,jsonb,jsonb,uuid)') is null then
  alter function public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) set schema diceforge_v2;
  alter function diceforge_v2.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) rename to generate_character_before_deletion;
 end if;
end $$;
revoke all on function diceforge_v2.generate_character_before_deletion(text,text,uuid,jsonb,jsonb,uuid) from public,anon,authenticated;
create or replace function public.df_generate_character(p_room text,p_operation text,p_character uuid default null,
 p_details jsonb default '{}',p_adjustments jsonb default '{}',p_request uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if exists(select 1 from diceforge_v2.characters where id=p_character and status='deleted') then
  raise exception 'Personnage supprimé : restauration MJ requise.' using errcode='42501'; end if;
 result:=diceforge_v2.generate_character_before_deletion(p_room,p_operation,p_character,p_details,p_adjustments,p_request);
 if exists(select 1 from diceforge_v2.characters where id=(result->>'character_id')::uuid and status='deleted') then
  raise exception 'Personnage supprimé : restauration MJ requise.' using errcode='42501'; end if;
 return result;
end $$;
revoke all on function public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
