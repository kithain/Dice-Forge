create table if not exists public.personnages (
  player_name text primary key,
  nom text not null check (length(trim(nom)) > 0),
  espece text,
  genre text,
  age integer,
  profession text,
  richesse text,
  traits text,
  notes text,
  force integer not null check (force >= 1),
  constitution integer not null check (constitution >= 1),
  taille integer not null check (taille >= 1),
  intelligence integer not null check (intelligence >= 1),
  pouvoir integer not null check (pouvoir >= 1),
  dexterite integer not null check (dexterite >= 1),
  charisme integer not null check (charisme >= 1),
  created_at timestamptz not null default now()
);

alter table public.personnages
  add column if not exists genre text,
  add column if not exists espece text,
  add column if not exists age integer,
  add column if not exists profession text,
  add column if not exists richesse text,
  add column if not exists traits text,
  add column if not exists notes text,
  add column if not exists charisme integer,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'personnages'
      and column_name = 'apparence'
  ) then
    update public.personnages
    set charisme = coalesce(charisme, apparence)
    where charisme is null;
  end if;
end $$;

update public.personnages
set charisme = 1
where charisme is null;

alter table public.personnages
  alter column charisme set not null;

alter table public.personnages
  drop constraint if exists personnages_age_check,
  drop constraint if exists personnages_charisme_check;

alter table public.personnages
  add constraint personnages_age_check check (age is null or age >= 0),
  add constraint personnages_charisme_check check (charisme >= 1);

-- L'ancienne vue peut encore dependre de la colonne apparence.
-- On la supprime ici puis on la recree plus bas avec charisme.
drop view if exists public.rolls_personnages;

alter table public.personnages
  drop column if exists apparence;

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
  p.espece,
  p.genre,
  p.age,
  p.profession,
  p.richesse,
  p.traits,
  p.notes,
  p.force,
  p.constitution,
  p.taille,
  p.intelligence,
  p.pouvoir,
  p.dexterite,
  p.charisme
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
