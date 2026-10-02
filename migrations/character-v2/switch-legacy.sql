-- Retour applicatif immédiat. Les anciennes tables sont celles d'avant bascule.
-- Les changements v2 sont volontairement abandonnés (décision utilisateur).
begin;
update diceforge_v2.configuration set enabled=false where singleton;
commit;
