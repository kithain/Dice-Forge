-- One-time historical backfill. 4SSU is the reference room selected by the MJ.
-- Keep permanent identities, state UUIDs, revisions and all historical content.
-- A second state of the same identity stays intact in its archived campaign.
begin;
alter table diceforge_v2.campaigns add column if not exists description text not null default '';
alter table diceforge_v2.campaigns add column if not exists archived_at timestamptz;
alter table diceforge_v2.campaigns alter column id set default gen_random_uuid();
alter table diceforge_v2.campaigns alter column reference_room drop not null;
alter table public.rooms add column if not exists campaign_id uuid references diceforge_v2.campaigns(id);

create table if not exists diceforge_v2.campaign_migrations (
 migration_key text primary key,
 campaign_id uuid not null references diceforge_v2.campaigns(id),
 reference_room text not null,
 completed_at timestamptz not null default clock_timestamp()
);
alter table diceforge_v2.campaign_migrations enable row level security;
revoke all on diceforge_v2.campaign_migrations from public,anon,authenticated;

do $$
declare target uuid; mj uuid; source record; legacy text;
begin
 if exists(select 1 from diceforge_v2.campaign_migrations where migration_key='valombre_20261007') then return; end if;
 select owner_id into mj from public.rooms where room_code='4SSU';
 if mj is null then raise exception 'La room de référence 4SSU est requise pour la reprise Valombre.'; end if;
 if exists(select 1 from public.rooms where owner_id is distinct from mj)
  or exists(select 1 from diceforge_v2.campaigns where owner_user_id is distinct from mj) then
  raise exception 'Des rooms ou campagnes appartiennent à un autre MJ : reprise explicite requise.';
 end if;
 select campaign_id into target from diceforge_v2.campaign_rooms where room_code='4SSU';
 if target is null then
  insert into diceforge_v2.campaigns(name,description,reference_room,owner_user_id)
   values('Valombre','Campagne de JDR de Valombre.','4SSU',mj) returning id into target;
 else
  update diceforge_v2.campaigns set name='Valombre',reference_room='4SSU',archived_at=null,
   description=case when nullif(trim(description),'') is null then 'Campagne de JDR de Valombre.' else description end
   where id=target;
 end if;

 -- Move only states without a conflicting canonical version. No state is removed.
 for source in select id,character_id from diceforge_v2.states where campaign_id<>target order by updated_at desc,id loop
  if not exists(select 1 from diceforge_v2.states where campaign_id=target and character_id=source.character_id) then
   update diceforge_v2.states set campaign_id=target where id=source.id;
  end if;
 end loop;
 if to_regclass('diceforge_v2.character_roster') is not null then
  insert into diceforge_v2.character_roster(campaign_id,character_id,available,preset,reserved_user_id)
   select target,r.character_id,r.available,r.preset,r.reserved_user_id from diceforge_v2.character_roster r
   where r.campaign_id<>target and exists(select 1 from diceforge_v2.states s where s.campaign_id=target and s.character_id=r.character_id)
   order by r.campaign_id on conflict(campaign_id,character_id) do nothing;
 end if;
 if to_regclass('diceforge_v2.character_selections') is not null then
  insert into diceforge_v2.character_selections(campaign_id,user_id,character_id)
   select target,r.user_id,r.character_id from diceforge_v2.character_selections r
   where r.campaign_id<>target and r.character_id is not null
    and exists(select 1 from diceforge_v2.states s where s.campaign_id=target and s.character_id=r.character_id)
   order by r.campaign_id on conflict(campaign_id,user_id) do nothing;
 end if;
 if to_regclass('diceforge_v2.character_generations') is not null then
  update diceforge_v2.character_generations set campaign_id=target where campaign_id<>target;
 end if;

 update public.rooms set campaign_id=target;
 update diceforge_v2.campaign_rooms set campaign_id=target;
 insert into diceforge_v2.campaign_rooms(room_code,campaign_id)
  select room_code,target from public.rooms on conflict(room_code) do nothing;
 update diceforge_v2.campaigns set archived_at=clock_timestamp() where id<>target and archived_at is null;

 -- The legacy tables keep their exact historical values plus the campaign UUID.
 foreach legacy in array array['personnages','pj_sheets','pj_inventory'] loop
  if to_regclass('public.'||legacy) is not null then
   execute format('alter table public.%I add column if not exists campaign_id uuid references diceforge_v2.campaigns(id)',legacy);
   execute format('update public.%I set campaign_id=$1',legacy) using target;
   execute format('alter table public.%I alter column campaign_id set not null',legacy);
  end if;
 end loop;
 insert into diceforge_v2.campaign_migrations(migration_key,campaign_id,reference_room)
  values('valombre_20261007',target,'4SSU');
end $$;
commit;
