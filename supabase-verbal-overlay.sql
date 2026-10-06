-- Online verbal draws share the same public OBS scope as obs_rolls.
-- Only room members/owners may publish, via the validating RPC.
begin;
create table if not exists public.obs_verbal_states (
 room_code text primary key references public.rooms(room_code) on delete cascade,
 state jsonb not null default '{}', revision bigint not null default 0,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.obs_verbal_states enable row level security;
revoke all on public.obs_verbal_states from public,anon,authenticated;
grant select on public.obs_verbal_states to anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='obs_verbal_states' and policyname='obs_verbal_read') then
  create policy obs_verbal_read on public.obs_verbal_states for select to anon,authenticated using(true);
 end if;
end $$;
create or replace function public.df_publish_verbal_overlay(p_room text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare room text:=upper(trim(p_room)); uid uuid:=auth.uid(); current public.obs_verbal_states; clean jsonb; words jsonb;
begin
 if uid is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 if room is null or room !~ '^[A-Z0-9_-]{1,32}$' then raise exception 'Salon invalide' using errcode='22023'; end if;
 if not exists(select 1 from public.rooms where room_code=room and owner_id=uid)
  and not exists(select 1 from public.room_members where room_code=room and user_id=uid) then
  raise exception 'Rejoignez le salon avant de publier' using errcode='42501'; end if;
 if jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>8192
  or p_payload->'visible' is distinct from 'true'::jsonb
  or jsonb_typeof(p_payload->'new_draw') is distinct from 'boolean'
  or coalesce(p_payload->>'draw_id','') !~ '^[a-f0-9]{32}$'
  or jsonb_typeof(p_payload->'character') is distinct from 'string'
  or length(trim(p_payload->>'character')) not between 1 and 100
  or jsonb_typeof(p_payload->'approach') is distinct from 'string'
  or length(trim(p_payload->>'approach')) not between 1 and 100
  or jsonb_typeof(p_payload->'words') is distinct from 'array' then
  raise exception 'État verbal invalide' using errcode='22023'; end if;
 words:=p_payload->'words';
 if jsonb_array_length(words) not between 5 and 8 or exists(select 1 from jsonb_array_elements(words) e
  where jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'word') is distinct from 'string'
  or length(trim(e->>'word')) not between 1 and 80
  or jsonb_typeof(e->'used') is distinct from 'boolean' or jsonb_typeof(e->'discarded') is distinct from 'boolean') then
  raise exception 'Mots invalides' using errcode='22023'; end if;
 if (select count(distinct e->>'word') from jsonb_array_elements(words) e)<>jsonb_array_length(words)
  or (select count(*) from jsonb_array_elements(words) e where e->'discarded'='true')>jsonb_array_length(words)-5 then
  raise exception 'Mots en double ou trop de jokers' using errcode='22023'; end if;
 -- Serialize first draws too; a late update cannot replace the latest draw.
 perform 1 from public.rooms where room_code=room for update;
 select * into current from public.obs_verbal_states where room_code=room;
 if p_payload->'new_draw'='false' and current.state->>'draw_id' is distinct from p_payload->>'draw_id' then
  return coalesce(current.state,'{"visible":false}'::jsonb) || jsonb_build_object('revision',coalesce(current.revision,0));
 end if;
 select jsonb_agg(jsonb_build_object('word',e->'word','used',e->'used','discarded',e->'discarded') order by n)
  into words from jsonb_array_elements(words) with ordinality a(e,n);
 clean:=jsonb_build_object('visible',true,'draw_id',p_payload->>'draw_id','character',p_payload->>'character','approach',p_payload->>'approach','words',words);
 insert into public.obs_verbal_states(room_code,state,revision) values(room,clean,1)
  on conflict(room_code) do update set state=excluded.state,revision=obs_verbal_states.revision+1,updated_at=clock_timestamp()
  returning * into current;
 return current.state || jsonb_build_object('revision',current.revision);
end $$;
revoke all on function public.df_publish_verbal_overlay(text,jsonb) from public,anon;
grant execute on function public.df_publish_verbal_overlay(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
