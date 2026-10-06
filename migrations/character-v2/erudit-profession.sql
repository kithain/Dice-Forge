-- Appliquer aux bases existantes pour aligner le budget serveur sur Dice Forge.
begin;
insert into diceforge_v2.profession_skills (profession, skills, magic)
values ('Érudit', '["skill.connaissance_divers","skill.langue_divers","skill.intimidation_persuasion","skill.recherche","skill.enseignement","skill.alchimie","skill.medecine","skill.alphabetisation_option","skill.strategie","skill.observation","skill.intuition","skill.estimation","skill.sens","skill.manipulation_fine","skill.reparation"]', false)
on conflict (profession) do update set skills = excluded.skills, magic = excluded.magic;
commit;
