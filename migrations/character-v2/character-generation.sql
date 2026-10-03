-- Authoritative creation rolls. Existing sheets and historical scores are preserved.
begin;
create table if not exists diceforge_v2.character_generations (
 character_id uuid primary key references diceforge_v2.characters(id),
 campaign_id uuid not null references diceforge_v2.campaigns(id),
 generation jsonb not null
);
create table if not exists diceforge_v2.generation_receipts (
 request_id uuid primary key, actor uuid not null, arguments jsonb not null, result jsonb not null
);
alter table diceforge_v2.character_generations enable row level security;
alter table diceforge_v2.generation_receipts enable row level security;
revoke all on diceforge_v2.character_generations,diceforge_v2.generation_receipts from public,anon,authenticated;

create or replace function diceforge_v2.guard_generated_stats() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare initial_stats jsonb; begin
 if coalesce(current_setting('diceforge_v2.generating',true),'')='trusted' then return new; end if;
 if nullif(old.fields->>'race','') is not null and new.fields->>'race' is distinct from old.fields->>'race' then
  raise exception 'Espèce verrouillée par le tirage.' using errcode='42501';
 end if;
 if old.stats='{}' then
  select coalesce(jsonb_object_agg(case key when 'charisme' then 'apparence' else key end,value),'{}') into initial_stats
   from diceforge_v2.characters c,jsonb_each(c.initial_record) where c.id=new.character_id
    and key in ('force','constitution','taille','intelligence','pouvoir','dexterite','charisme');
  if diceforge_v2.normalized_stat_values(new.stats)=diceforge_v2.normalized_stat_values(initial_stats) then return new; end if;
 end if;
 if diceforge_v2.normalized_stat_values(new.stats) is distinct from diceforge_v2.normalized_stat_values(old.stats) then
  raise exception 'Caractéristiques réservées au générateur : utilisez les tirages et les ajustements autorisés.' using errcode='42501';
 end if;
 return new;
end $$;
drop trigger if exists df_generated_stats on diceforge_v2.states;
create trigger df_generated_stats before update on diceforge_v2.states for each row execute function diceforge_v2.guard_generated_stats();

create or replace function diceforge_v2.guard_generation_record() returns trigger
language plpgsql set search_path=pg_catalog as $$
declare k text; begin
 if coalesce(current_setting('diceforge_v2.generating',true),'')='trusted' then return new; end if;
 if tg_op='INSERT' then raise exception 'Créez votre personnage avec le générateur.' using errcode='42501'; end if;
 foreach k in array array['force','constitution','taille','intelligence','pouvoir','dexterite','charisme','generation','rerolls_used'] loop
  if new.initial_record->k is distinct from old.initial_record->k then
   raise exception 'Tirages et caractéristiques réservés au générateur.' using errcode='42501';
  end if;
 end loop;
 if new.generation is distinct from old.generation then raise exception 'Tirage protégé.' using errcode='42501'; end if;
 return new;
end $$;
drop trigger if exists df_generation_record on diceforge_v2.characters;
create trigger df_generation_record before insert or update on diceforge_v2.characters for each row execute function diceforge_v2.guard_generation_record();

create or replace function public.df_generate_character(p_room text,p_operation text,p_character uuid default null,
 p_details jsonb default '{}',p_adjustments jsonb default '{}',p_request uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare uid uuid:=auth.uid(); campaign uuid; c diceforge_v2.characters; s diceforge_v2.states;
 receipt diceforge_v2.generation_receipts; arguments jsonb; gen jsonb; rolled_scores jsonb:='{}'; gstats jsonb:='{}';
 k text; mapped text; count_dice integer; mod integer; rolls jsonb; total integer; racial integer; sign integer;
 base integer; adjustment integer; out_points integer:=0; in_points integer:=0; rerolls integer; race text;
 part jsonb; racial_data jsonb; record jsonb; answer jsonb; player text;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if p_request is null or p_operation not in ('create','reroll','save') or jsonb_typeof(p_details)<>'object' or jsonb_typeof(p_adjustments)<>'object' then
  raise exception 'Demande de génération invalide' using errcode='22023'; end if;
 select campaign_id into campaign from diceforge_v2.campaign_rooms where room_code=p_room;
 if campaign is null or (not exists(select 1 from public.room_members where room_code=p_room and user_id=uid)
  and not exists(select 1 from diceforge_v2.campaigns where id=campaign and owner_user_id=uid)) then
  raise exception 'Rejoignez le salon de la campagne' using errcode='42501'; end if;
 arguments:=jsonb_build_object('room',p_room,'operation',p_operation,'character',p_character,'details',p_details,'adjustments',p_adjustments);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into receipt from diceforge_v2.generation_receipts where request_id=p_request;
 if found then
  if receipt.actor<>uid or receipt.arguments<>arguments then raise exception 'Demande déjà utilisée' using errcode='22023'; end if;
  return receipt.result;
 end if;
 perform 1 from diceforge_v2.campaigns where id=campaign for update;
 if p_operation='create' then
  if p_character is not null or exists(select 1 from diceforge_v2.character_selections where campaign_id=campaign and user_id=uid and character_id is not null) then
   raise exception 'Ouvrez Nouveau personnage avant de générer.' using errcode='42501'; end if;
  rerolls:=0;
 else
  select * into c from diceforge_v2.characters where id=p_character and owner_user_id=uid and status='active' for update;
  if not found then raise exception 'Personnage inaccessible' using errcode='42501'; end if;
  select * into s from diceforge_v2.states where character_id=c.id and campaign_id=campaign for update;
  if not found or not exists(select 1 from diceforge_v2.creation_states where state_id=s.id and phase='draft') then
   raise exception 'Création validée : caractéristiques verrouillées.' using errcode='42501'; end if;
  select generation into gen from diceforge_v2.character_generations where character_id=c.id and campaign_id=campaign;
  if gen is null then raise exception 'Fiche antérieure conservée : ses caractéristiques ne sont pas réattribuables. Créez un nouveau personnage.' using errcode='42501'; end if;
  if p_details->>'espece' is distinct from s.fields->>'race' then raise exception 'Espèce verrouillée par le tirage.' using errcode='42501'; end if;
  rerolls:=(gen->>'rerollsUsed')::integer;
  if p_operation='reroll' then
   if rerolls>=2 then raise exception 'Les deux relances ont déjà été utilisées.' using errcode='22023'; end if;
   rerolls:=rerolls+1;
  end if;
 end if;
 race:=p_details->>'espece';
 if race is null or race not in ('Humain','Nain','Elfe','Demi-Elfe','Demi-Orc') or coalesce(trim(p_details->>'nom'),'')='' then
  raise exception 'Nom et espèce valides requis' using errcode='22023'; end if;
 foreach k in array array['force','constitution','taille','intelligence','pouvoir','dexterite','charisme'] loop
  mapped:=case when k='charisme' then 'apparence' else k end;
  if p_operation in ('create','reroll') then
   count_dice:=case when k in ('taille','intelligence') then 2 else 3 end;
   mod:=case when count_dice=2 then 6 else 0 end;
   select jsonb_agg(d),sum(d)+mod into rolls,total from (select floor(random()*6+1)::integer d from generate_series(1,count_dice)) dice;
   sign:=case
    when race in ('Nain','Demi-Orc') and k in ('force','constitution') then 1
    when race='Nain' and k in ('dexterite','charisme') then -1
    when race in ('Elfe','Demi-Elfe') and k in ('dexterite','charisme') then 1
    when race in ('Elfe','Demi-Elfe') and k='constitution' then -1
    when race='Elfe' and k='taille' then -1
    when race='Demi-Orc' and k in ('intelligence','charisme') then -1 else 0 end;
   racial:=case when sign=0 then 0 else floor(random()*6+1)::integer end;
   base:=greatest(3,least(21,total+sign*racial));
   racial_data:=case when sign=0 then 'null'::jsonb else jsonb_build_object('sign',sign,'count',1,'type',6,'rolls',jsonb_build_array(racial),'total',racial,'adjust',sign*racial) end;
   part:=jsonb_build_object('base',base,'rolledBase',total,'rawBase',total+sign*racial,'adjust',0,'rolls',rolls,
    'formula',jsonb_build_object('count',count_dice,'type',6,'mod',mod),'racial',racial_data);
   adjustment:=0;
  else
   part:=gen->'stats'->k; base:=(part->>'base')::integer;
   if coalesce(p_adjustments->>k,'0') !~ '^-?[0-9]{1,2}$' then raise exception 'Ajustement invalide' using errcode='22023'; end if;
   adjustment:=coalesce(p_adjustments->>k,'0')::integer;
   if base+adjustment not between 3 and 21 then raise exception 'Caractéristique hors 3–21' using errcode='22023'; end if;
   out_points:=out_points+greatest(0,-adjustment); in_points:=in_points+greatest(0,adjustment);
   part:=jsonb_set(part,'{adjust}',to_jsonb(adjustment));
  end if;
  rolled_scores:=rolled_scores || jsonb_build_object(mapped,base+adjustment);
  gstats:=gstats || jsonb_build_object(k,part);
 end loop;
 if out_points>3 or out_points<>in_points then raise exception 'Au maximum trois points déplacés ; tous doivent être réattribués.' using errcode='22023'; end if;
 gen:=jsonb_build_object('serverGenerated',true,'rerollsUsed',rerolls,'stats',gstats);
 select coalesce(player_name,'Joueur') into player from public.room_members where room_code=p_room and user_id=uid limit 1;
 player:=coalesce(player,c.source_player_name,'Joueur');
 record:=p_details || rolled_scores || jsonb_build_object('charisme',rolled_scores->'apparence','user_id',uid,'player_name',player,'generation',gen,'rerolls_used',rerolls);
 perform set_config('diceforge_v2.generating','trusted',true);
 if p_operation='create' then
  insert into diceforge_v2.characters(id,owner_user_id,name,source_player_name,status,initial_record,generation)
   values(gen_random_uuid(),uid,p_details->>'nom',player,'active',record,gen) returning * into c;
  insert into diceforge_v2.states(id,campaign_id,character_id,fields,stats,legacy_sheet_data,legacy_markdown)
   values(gen_random_uuid(),campaign,c.id,'{}',rolled_scores,'{}','') returning * into s;
 end if;
 insert into diceforge_v2.character_generations values(c.id,campaign,gen) on conflict(character_id) do update set generation=excluded.generation;
 update diceforge_v2.characters set name=p_details->>'nom',initial_record=initial_record || record,generation=gen where id=c.id;
 update diceforge_v2.states target set stats=target.stats || rolled_scores,
  fields=fields || jsonb_build_object('name',p_details->>'nom','player',player,'race',race,'profession',coalesce(p_details->>'profession',''),
   'age',p_details->>'age','wealth',coalesce(p_details->>'richesse','Moyen'),'skillProfessionalPool',coalesce(fields->>'skillProfessionalPool','325')),
  sheet_revision=sheet_revision+1,revision=revision+1,updated_at=clock_timestamp() where id=s.id;
 insert into diceforge_v2.character_selections values(campaign,uid,c.id) on conflict(campaign_id,user_id) do update set character_id=excluded.character_id;
 perform set_config('diceforge_v2.generating','',true);
 answer:=record || jsonb_build_object('character_id',c.id,'state_id',s.id,'campaign_id',campaign);
 insert into diceforge_v2.generation_receipts values(p_request,uid,arguments,answer);
 return answer;
end $$;
revoke all on function diceforge_v2.guard_generated_stats(),diceforge_v2.guard_generation_record() from public,anon,authenticated;
revoke all on function public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.df_generate_character(text,text,uuid,jsonb,jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
