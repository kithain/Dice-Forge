-- Schéma parallèle de reprise, sans modification des anciennes tables.
-- À tester sur une base isolée AVANT une exécution en production.
-- Aucun accès applicatif n'est accordé dans cette étape de préparation.
begin;
create schema diceforge_v2;
revoke all on schema diceforge_v2 from public, anon, authenticated;

create table diceforge_v2.campaigns (
  id uuid primary key,
  name text not null,
  reference_room text not null references public.rooms(room_code),
  owner_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create table diceforge_v2.campaign_rooms (
  room_code text primary key references public.rooms(room_code),
  campaign_id uuid not null references diceforge_v2.campaigns(id)
);
create table diceforge_v2.characters (
  id uuid primary key,
  owner_user_id uuid references auth.users(id),
  name text not null check (length(trim(name)) > 0),
  source_player_name text not null,
  status text not null check (status in ('active', 'archived')),
  generation jsonb,
  initial_record jsonb not null
);
create index on diceforge_v2.characters(owner_user_id);
create table diceforge_v2.states (
  id uuid primary key,
  campaign_id uuid not null references diceforge_v2.campaigns(id),
  character_id uuid not null references diceforge_v2.characters(id),
  revision bigint not null default 1 check (revision > 0),
  fields jsonb not null check (jsonb_typeof(fields) = 'object'),
  stats jsonb not null check (jsonb_typeof(stats) = 'object'),
  source_sheet_id bigint not null,
  source_inventory_id bigint,
  legacy_sheet_data jsonb not null,
  legacy_inventory jsonb,
  legacy_markdown text not null,
  source_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (campaign_id, character_id)
);
create index on diceforge_v2.states(character_id);
create table diceforge_v2.skill_catalog (id text primary key, name text not null);
create table diceforge_v2.spell_catalog (id text primary key, name text not null);
create table diceforge_v2.skills (
  id uuid primary key,
  state_id uuid not null references diceforge_v2.states(id),
  skill_id text not null references diceforge_v2.skill_catalog(id),
  specialty text not null default '',
  base integer,
  points integer,
  score integer,
  checked boolean not null default false,
  legacy_index integer not null,
  raw_payload jsonb not null,
  unique (state_id, skill_id, specialty)
);
create table diceforge_v2.spells (
  id uuid primary key,
  state_id uuid not null references diceforge_v2.states(id),
  spell_id text not null references diceforge_v2.spell_catalog(id),
  points integer not null,
  checked boolean not null default false,
  legacy_index integer not null,
  raw_payload jsonb not null,
  unique (state_id, spell_id)
);
create table diceforge_v2.items (
  id uuid primary key,
  state_id uuid not null references diceforge_v2.states(id),
  category text not null check (category in ('weapons', 'armors', 'equipment', 'consumables', 'miscellaneous')),
  name text,
  legacy_index integer not null,
  payload jsonb not null
);
create index on diceforge_v2.items(state_id);
create table diceforge_v2.wallets (
  state_id uuid primary key references diceforge_v2.states(id),
  po integer not null, pa integer not null, pc integer not null
);
create table diceforge_v2.archives (
  id uuid primary key,
  source_table text not null,
  source_key text not null,
  sha256 text not null,
  payload jsonb not null,
  unique (source_table, source_key)
);
create table diceforge_v2.migration_issues (
  id bigint generated always as identity primary key,
  payload jsonb not null
);
-- Les données historiques incohérentes doivent être importables sans correction
-- implicite. Les contraintes de budget/écriture seront introduites avec les RPC
-- applicatives et un traitement explicite des anomalies existantes.
do $$
declare target record;
begin
  for target in select tablename from pg_tables where schemaname = 'diceforge_v2' loop
    execute format('alter table diceforge_v2.%I enable row level security', target.tablename);
  end loop;
end $$;
commit;
