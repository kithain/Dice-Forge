-- Statistiques de réussite des tests BRP, par partie et par joueur.
-- Les jets de dés ordinaires et la ligne technique de création de partie
-- sont exclus afin de ne pas fausser les pourcentages.

select
  room_code,
  player_name,
  count(*) as total_jets,
  count(*) filter (where not is_fail) as reussites,
  count(*) filter (where is_fail) as echecs,
  round(
    100.0 * count(*) filter (where not is_fail) / nullif(count(*), 0),
    2
  ) as taux_reussite,
  round(
    100.0 * count(*) filter (where is_fail) / nullif(count(*), 0),
    2
  ) as taux_echec
from public.rolls
where expression <> '— Partie créée —'
  and rolls_detail ~* '\]\s*(réussite|échec|maladresse)'
group by room_code, player_name
order by room_code, taux_reussite desc, total_jets desc, player_name;

