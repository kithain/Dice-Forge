create table if not exists public.personnages (
  player_name text primary key,
  nom text not null check (length(trim(nom)) > 0),
  force integer not null check (force >= 1),
  constitution integer not null check (constitution >= 1),
  taille integer not null check (taille >= 1),
  intelligence integer not null check (intelligence >= 1),
  pouvoir integer not null check (pouvoir >= 1),
  dexterite integer not null check (dexterite >= 1),
  apparence integer not null check (apparence >= 1),
  created_at timestamptz not null default now()
);

delete from public.personnages
where player_name is null
   or length(trim(player_name)) = 0;

-- Migration depuis l'ancienne version ou player_character etait la PK.
-- Si plusieurs fiches existent pour le meme player_name, la plus recente est gardee.
with ranked_personnages as (
  select
    ctid,
    row_number() over (
      partition by player_name
      order by created_at desc, ctid::text desc
    ) as row_rank
  from public.personnages
)
delete from public.personnages p
using ranked_personnages r
where p.ctid = r.ctid
  and r.row_rank > 1;

alter table public.personnages
  drop constraint if exists personnages_pkey;

alter table public.personnages
  drop column if exists player_character;

alter table public.personnages
  alter column player_name set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.personnages'::regclass
      and contype = 'p'
  ) then
    alter table public.personnages
      add constraint personnages_pkey primary key (player_name);
  end if;
end $$;

create index if not exists rolls_player_name_idx
  on public.rolls(player_name);

create or replace view public.rolls_personnages as
select
  r.*,
  p.nom as personnage_nom,
  p.force,
  p.constitution,
  p.taille,
  p.intelligence,
  p.pouvoir,
  p.dexterite,
  p.apparence
from public.rolls r
left join public.personnages p
  on p.player_name = r.player_name;

alter table public.personnages enable row level security;

drop policy if exists "Allow read personnages" on public.personnages;
create policy "Allow read personnages"
  on public.personnages for select
  to anon
  using (true);

drop policy if exists "Allow insert personnages" on public.personnages;
create policy "Allow insert personnages"
  on public.personnages for insert
  to anon
  with check (true);

drop policy if exists "Allow update personnages" on public.personnages;
create policy "Allow update personnages"
  on public.personnages for update
  to anon
  using (true)
  with check (true);
