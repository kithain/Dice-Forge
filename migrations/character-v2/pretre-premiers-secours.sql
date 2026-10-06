-- Ajoute la compétence sans retirer les compétences professionnelles existantes.
begin;
update diceforge_v2.profession_skills
set skills = skills || '["skill.premiers_secours"]'::jsonb
where profession = 'Prêtre'
  and not (skills @> '["skill.premiers_secours"]'::jsonb);
commit;
