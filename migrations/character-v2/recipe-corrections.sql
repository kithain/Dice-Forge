-- Apply after character-roster.sql. Preserve historical sheet values.
begin;
create table if not exists diceforge_v2.profession_skills (
 profession text primary key, skills jsonb not null, magic boolean not null default false
);
alter table diceforge_v2.profession_skills enable row level security;
revoke all on diceforge_v2.profession_skills from public,anon,authenticated;

create or replace function diceforge_v2.guard_profession_budget() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare allowed jsonb; has_magic boolean; outside_points integer; personal integer;
begin
 if new.phase<>'play' or old.phase<>'draft' then return new; end if;
 select p.skills,p.magic into allowed,has_magic from diceforge_v2.profession_skills p
 join diceforge_v2.states s on s.fields->>'profession'=p.profession where s.id=new.state_id;
 if allowed is null then raise exception 'Profession inconnue : faites préciser ses compétences par le MJ.' using errcode='22023'; end if;
 select coalesce(sum(points),0) into outside_points from diceforge_v2.skills
 where state_id=new.state_id and not allowed ? skill_id;
 if not has_magic then outside_points:=outside_points+coalesce((select sum(points) from diceforge_v2.spells where state_id=new.state_id),0); end if;
 select (stats->>'intelligence')::integer*10 into personal from diceforge_v2.states where id=new.state_id;
 if outside_points>personal then raise exception 'Points personnels dépassés : % points hors profession pour % disponibles.',outside_points,personal using errcode='22023'; end if;
 return new;
end $$;
drop trigger if exists df_profession_budget on diceforge_v2.creation_states;
create trigger df_profession_budget before update on diceforge_v2.creation_states for each row execute function diceforge_v2.guard_profession_budget();

create table if not exists diceforge_v2.legacy_equipment_imports (
 state_id uuid primary key references diceforge_v2.states(id), source_text text, imported_at timestamptz default now()
);
alter table diceforge_v2.legacy_equipment_imports enable row level security;
revoke all on diceforge_v2.legacy_equipment_imports from public,anon,authenticated;
create or replace function diceforge_v2.import_legacy_inventory(p_state uuid default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare s diceforge_v2.states; line text; wealth text; position integer; weapon jsonb; before_count integer; begin
 for s in select st.* from diceforge_v2.states st where (p_state is null or st.id=p_state) and not exists(select 1 from diceforge_v2.legacy_equipment_imports m where m.state_id=st.id) loop
  select count(*) into before_count from diceforge_v2.items where state_id=s.id;
  position:=coalesce((select max(legacy_index)+1 from diceforge_v2.items where state_id=s.id and category='equipment'),0);
  for line in select trim(value) from regexp_split_to_table(coalesce(s.fields->>'equipment',''),E'\r?\n') value where trim(value)<>'' loop
   if not exists(select 1 from diceforge_v2.items where state_id=s.id and category='equipment' and name=line) then
    insert into diceforge_v2.items values(gen_random_uuid(),s.id,'equipment',line,position,jsonb_build_object('name',line,'description',''));
    position:=position+1;
   end if;
  end loop;
  wealth:=coalesce(nullif(s.fields->>'wealth',''),nullif(s.fields->>'richesse',''),nullif((select initial_record->>'richesse' from diceforge_v2.characters where id=s.character_id),''));
  if wealth is not null and not exists(select 1 from diceforge_v2.items where state_id=s.id and category='miscellaneous' and name='Classe sociale') then
   insert into diceforge_v2.items values(gen_random_uuid(),s.id,'miscellaneous','Classe sociale',coalesce((select max(legacy_index)+1 from diceforge_v2.items where state_id=s.id and category='miscellaneous'),0),jsonb_build_object('name','Classe sociale','description',wealth));
  end if;
  for weapon in select value from jsonb_array_elements(coalesce(s.legacy_sheet_data->'weapons','[]')) where nullif(trim(value->>'name'),'') is not null loop
   if not exists(select 1 from diceforge_v2.items where state_id=s.id and category='weapons' and name=weapon->>'name') then
    insert into diceforge_v2.items values(gen_random_uuid(),s.id,'weapons',weapon->>'name',coalesce((select max(legacy_index)+1 from diceforge_v2.items where state_id=s.id and category='weapons'),0),jsonb_build_object('name',weapon->>'name','damage',weapon->>'damage','brp',coalesce(weapon->>'contactScore',weapon->>'distanceScore'),'description',''));
   end if;
  end loop;
  if coalesce(s.fields->>'armorType','')<>'' and not exists(select 1 from diceforge_v2.items where state_id=s.id and category='armors' and name=s.fields->>'armorType') then
   insert into diceforge_v2.items values(gen_random_uuid(),s.id,'armors',s.fields->>'armorType',coalesce((select max(legacy_index)+1 from diceforge_v2.items where state_id=s.id and category='armors'),0),jsonb_build_object('name',s.fields->>'armorType','protection',s.fields->>'armorPoints','description',''));
  end if;
  insert into diceforge_v2.wallets values(s.id,0,0,0) on conflict do nothing;
  insert into diceforge_v2.legacy_equipment_imports(state_id,source_text) values(s.id,s.fields->>'equipment');
  if before_count<>(select count(*) from diceforge_v2.items where state_id=s.id) and exists(select 1 from diceforge_v2.characters where id=s.character_id and status='active') then
   update diceforge_v2.states set revision=revision+1,inventory_revision=inventory_revision+1,updated_at=clock_timestamp() where id=s.id;
  end if;
 end loop;
end $$;


select diceforge_v2.import_legacy_inventory();
create or replace function public.df_import_legacy_inventory(p_state uuid,p_room text) returns void
language plpgsql security definer set search_path=pg_catalog as $$ begin
 if not exists(select 1 from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id join diceforge_v2.campaign_rooms r on r.campaign_id=s.campaign_id
  where s.id=p_state and c.owner_user_id=auth.uid() and r.room_code=p_room) or not exists(select 1 from public.room_members where room_code=p_room and user_id=auth.uid()) then
  raise exception 'Inventaire non autorisé.' using errcode='42501';
 end if;
 perform 1 from diceforge_v2.states where id=p_state for update;
 perform diceforge_v2.import_legacy_inventory(p_state);
end $$;
revoke all on function diceforge_v2.import_legacy_inventory(uuid) from public,anon,authenticated;
revoke all on function public.df_import_legacy_inventory(uuid,text) from public,anon;
grant execute on function public.df_import_legacy_inventory(uuid,text) to authenticated;

create table if not exists diceforge_v2.skill_roll_receipts (
 request_id uuid primary key, actor uuid not null, state_id uuid not null, room_code text not null,
 resource text not null, resource_id text not null, difficulty text not null, malus integer not null,
 result jsonb not null, created_at timestamptz default now()
);
alter table diceforge_v2.skill_roll_receipts enable row level security;
revoke all on diceforge_v2.skill_roll_receipts from public,anon,authenticated;
create or replace function diceforge_v2.guard_automatic_check() returns trigger
language plpgsql set search_path=pg_catalog as $$ begin
 if new.checked and (tg_op='INSERT' or not old.checked) and coalesce(current_setting('diceforge_v2.marking_check',true),'')<>'trusted_roll' then
  raise exception 'Coche réservée à un jet réussi enregistré par le serveur.' using errcode='42501';
 end if;
 if tg_op='UPDATE' and new.checked is distinct from old.checked and coalesce(current_setting('diceforge_v2.marking_check',true),'')<>'trusted_roll'
  and exists(select 1 from diceforge_v2.xp_sessions where state_id=new.state_id and closed_at is null) then
  raise exception 'Les coches sont gérées par les jets et le changement de session.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists df_automatic_skill_check on diceforge_v2.skills;
drop trigger if exists df_automatic_spell_check on diceforge_v2.spells;
create trigger df_automatic_skill_check before insert or update on diceforge_v2.skills for each row execute function diceforge_v2.guard_automatic_check();
create trigger df_automatic_spell_check before insert or update on diceforge_v2.spells for each row execute function diceforge_v2.guard_automatic_check();
do $$ begin
 if to_regprocedure('diceforge_v2.session_open_before_checks(uuid,text)') is null then
  alter function diceforge_v2.session_open(uuid,text) rename to session_open_before_checks;
 end if;
end $$;
create or replace function diceforge_v2.session_open(p_state uuid,p_room text) returns void
language plpgsql security definer set search_path=pg_catalog as $$ begin
 perform set_config('diceforge_v2.marking_check','trusted_roll',true);
 perform diceforge_v2.session_open_before_checks(p_state,p_room);
 perform set_config('diceforge_v2.marking_check','',true);
end $$;

create or replace function public.df_roll_skill_test(p_state uuid,p_room text,p_resource text,p_id text,p_difficulty text,p_malus integer,p_request uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare s diceforge_v2.states; previous diceforge_v2.skill_roll_receipts; score integer; threshold integer; roll_value integer; fumble integer; success boolean; marked boolean; result jsonb;
begin
 select st.* into s from diceforge_v2.states st join diceforge_v2.characters c on c.id=st.character_id
 join diceforge_v2.campaign_rooms r on r.campaign_id=st.campaign_id and r.room_code=p_room
 where st.id=p_state and c.owner_user_id=auth.uid() and c.status='active' for update of st;
 if not found or not exists(select 1 from public.room_members where room_code=p_room and user_id=auth.uid()) then raise exception 'Fiche ou salon non autorisé.' using errcode='42501'; end if;
 if p_request is null or p_resource is null or p_resource not in ('skill','spell') or p_difficulty is null or p_difficulty not in ('easy','normal','hard','impossible') or p_malus is null or p_malus not in (0,10,20,30,40) then raise exception 'Paramètres du jet invalides.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into previous from diceforge_v2.skill_roll_receipts where request_id=p_request;
 if found then
  if previous.actor<>auth.uid() or previous.state_id<>p_state or previous.room_code<>p_room or previous.resource<>p_resource or previous.resource_id<>p_id or previous.difficulty<>p_difficulty or previous.malus<>p_malus then raise exception 'Identité de requête réutilisée.' using errcode='22023'; end if;
  return previous.result;
 end if;
 if p_resource='skill' then select k.score into score from diceforge_v2.skills k where state_id=p_state and skill_id=p_id;
 else select coalesce(a.score+diceforge_v2.xp_total(p_state,'spell',p_id),coalesce((k.raw_payload->>'base')::integer,(s.stats->>'intelligence')::integer)+k.points) into score
  from diceforge_v2.spells k left join diceforge_v2.initial_allocations a on a.state_id=k.state_id and a.resource='spell' and a.resource_id=k.spell_id where k.state_id=p_state and k.spell_id=p_id;
 end if;
 if score is null then raise exception 'Compétence ou sort inconnu.' using errcode='22023'; end if;
 score:=greatest(0,least(100,score));
 threshold:=greatest(0,score-p_malus);
 threshold:=case p_difficulty when 'easy' then threshold*2 when 'hard' then ceil(threshold/2.0)::integer when 'impossible' then 0 else threshold end;
 fumble:=case when threshold<=20 then 96 when threshold<=40 then 97 when threshold<=60 then 98 when threshold<=80 then 99 else 100 end;
 roll_value:=diceforge_v2.roll_d100();
 success:=roll_value<fumble and (roll_value=1 or (roll_value<=threshold and (roll_value<96 or threshold>=100)));
 marked:=success and exists(select 1 from diceforge_v2.creation_states where state_id=p_state and phase='play') and exists(select 1 from diceforge_v2.xp_sessions where state_id=p_state and room_code=p_room and closed_at is null);
 if marked then
  perform set_config('diceforge_v2.marking_check','trusted_roll',true);
  if p_resource='skill' then update diceforge_v2.skills set checked=true where state_id=p_state and skill_id=p_id;
  else update diceforge_v2.spells set checked=true where state_id=p_state and spell_id=p_id; end if;
  perform set_config('diceforge_v2.marking_check','',true);
  update diceforge_v2.states set revision=revision+1,sheet_revision=sheet_revision+1,updated_at=clock_timestamp() where id=p_state;
 end if;
 result:=jsonb_build_object('roll',roll_value,'score',score,'threshold',threshold,'success',success,'checked',marked);
 insert into diceforge_v2.skill_roll_receipts values(p_request,auth.uid(),p_state,p_room,p_resource,p_id,p_difficulty,p_malus,result,now());
 return result;
end $$;
revoke all on function public.df_roll_skill_test(uuid,text,text,text,text,integer,uuid) from public,anon;
grant execute on function public.df_roll_skill_test(uuid,text,text,text,text,integer,uuid) to authenticated;
insert into diceforge_v2.profession_skills values ('Guerrier','["skill.bagarre","skill.escalade","skill.defense","skill.lutte","skill.se_cacher","skill.saut","skill.langue_divers","skill.ecouter","skill.arme_de_melee","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.discretion","skill.nage","skill.lancer","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Sorcier','["skill.artisanat","skill.intuition","skill.connaissance_divers","skill.langue_divers","skill.ecouter","skill.representation","skill.intimidation_persuasion","skill.recherche"]',true) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Prêtre','["skill.premiers_secours","skill.medecine","skill.baratin","skill.intuition","skill.connaissance_divers","skill.langue_divers","skill.ecouter","skill.alphabetisation_option","skill.representation","skill.intimidation_persuasion","skill.recherche","skill.statut","skill.enseignement"]',true) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Voleur','["skill.estimation","skill.marchandage","skill.bagarre","skill.escalade","skill.deguisement","skill.defense","skill.baratin","skill.manipulation_fine","skill.lutte","skill.se_cacher","skill.intuition","skill.saut","skill.connaissance_divers","skill.ecouter","skill.intimidation_persuasion","skill.observation","skill.discretion"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Chasseur','["skill.bagarre","skill.escalade","skill.defense","skill.premiers_secours","skill.se_cacher","skill.saut","skill.connaissance_divers","skill.ecouter","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.discretion","skill.nage","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Artisan','["skill.estimation","skill.art","skill.marchandage","skill.manipulation_fine","skill.reparation","skill.recherche","skill.observation","skill.statut"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Noble','["skill.marchandage","skill.etiquette_divers","skill.baratin","skill.intuition","skill.connaissance_divers","skill.langue_divers","skill.ecouter","skill.arme_de_melee","skill.representation","skill.intimidation_persuasion","skill.recherche","skill.equitation_divers","skill.statut"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Chaman','["skill.art","skill.artisanat","skill.baratin","skill.premiers_secours","skill.se_cacher","skill.intuition","skill.connaissance_divers","skill.langue_divers","skill.ecouter","skill.medecine","skill.representation","skill.intimidation_persuasion","skill.statut"]',true) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Érudit','["skill.connaissance_divers","skill.langue_divers","skill.intimidation_persuasion","skill.recherche","skill.enseignement","skill.alchimie","skill.medecine","skill.alphabetisation_option","skill.strategie","skill.observation","skill.intuition","skill.estimation","skill.sens","skill.manipulation_fine","skill.reparation"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Assassin','["skill.bagarre","skill.deguisement","skill.defense","skill.lutte","skill.se_cacher","skill.ecouter","skill.arme_de_melee","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.discretion","skill.lancer","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Soldat','["skill.bagarre","skill.escalade","skill.commandement","skill.defense","skill.premiers_secours","skill.se_cacher","skill.saut","skill.ecouter","skill.arme_de_melee","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.discretion","skill.lancer"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Amuseur','["skill.art","skill.deguisement","skill.baratin","skill.manipulation_fine","skill.intuition","skill.langue_divers","skill.ecouter","skill.representation","skill.intimidation_persuasion"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Explorateur','["skill.escalade","skill.baratin","skill.connaissance_divers","skill.langue_divers","skill.arme_de_jet","skill.navigation","skill.intimidation_persuasion","skill.recherche","skill.equitation_divers","skill.observation","skill.nage","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Fermier','["skill.marchandage","skill.bagarre","skill.artisanat","skill.premiers_secours","skill.connaissance_divers","skill.ecouter","skill.arme_de_melee","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Tribal','["skill.bagarre","skill.escalade","skill.artisanat","skill.defense","skill.premiers_secours","skill.lutte","skill.se_cacher","skill.saut","skill.connaissance_divers","skill.ecouter","skill.arme_de_melee","skill.arme_de_jet","skill.equitation_divers","skill.observation","skill.discretion","skill.nage","skill.lancer","skill.pistage"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Marchand','["skill.estimation","skill.marchandage","skill.baratin","skill.intuition","skill.langue_divers","skill.intimidation_persuasion","skill.observation","skill.statut"]',false) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
insert into diceforge_v2.profession_skills values ('Étudiant','["skill.art","skill.artisanat","skill.premiers_secours","skill.intuition","skill.connaissance_divers","skill.langue_divers","skill.ecouter","skill.medecine","skill.representation","skill.intimidation_persuasion","skill.recherche"]',true) on conflict(profession) do update set skills=excluded.skills,magic=excluded.magic;
notify pgrst,'reload schema';
commit;
