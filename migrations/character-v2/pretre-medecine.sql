-- Ajoute Médecine sans modifier les fiches ni les autres compétences.
begin;
update diceforge_v2.profession_skills
set skills = skills || '["skill.medecine"]'::jsonb
where profession = 'Prêtre'
  and not (skills @> '["skill.medecine"]'::jsonb);
commit;
