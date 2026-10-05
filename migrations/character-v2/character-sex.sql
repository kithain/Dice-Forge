-- Valeurs demandées par l'utilisateur le 5 octobre 2026.
-- Les UUID et les noms protègent les éventuels personnages homonymes.
begin;

do $$
declare
  target record;
  matched integer;
begin
  for target in select * from (values
    ('5091b30d-e183-5df3-8657-991e343c822a'::uuid, '3e9bf998-12ed-57f5-b8df-8363e64fe653'::uuid, 'Gram Tolgarinn', 'M'),
    ('3966086d-2b82-50d9-8aa1-36a94af2b123'::uuid, 'c6c68b7b-1e55-5f54-869e-8284bb4cb821'::uuid, 'Ilyandra Vaelith (dite Ilya)', 'F'),
    ('fe76e6c9-4475-5b80-97c0-c5836bec98ad'::uuid, '2f755ece-5440-57c8-bbdd-44202cf1680a'::uuid, 'Thokk Le Briseur', 'M')
  ) as requested(character_id, state_id, name, sex)
  loop
    perform 1 from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
      where s.id=target.state_id and c.id=target.character_id and c.name=target.name
      for update of s;
    if not found then raise exception 'Fiche introuvable : %', target.name; end if;

    update diceforge_v2.states
      set fields=jsonb_set(fields, '{sex}', to_jsonb(target.sex), true),
          sheet_revision=sheet_revision+1, revision=revision+1, updated_at=clock_timestamp()
      where id=target.state_id and fields->>'sex' is distinct from target.sex;
    get diagnostics matched = row_count;
    if matched > 1 then raise exception 'Plusieurs fiches correspondent : %', target.name; end if;
  end loop;
end $$;

commit;

select c.name as personnage, s.fields->>'sex' as sexe
from diceforge_v2.states s join diceforge_v2.characters c on c.id=s.character_id
where s.id in ('3e9bf998-12ed-57f5-b8df-8363e64fe653', 'c6c68b7b-1e55-5f54-869e-8284bb4cb821', '2f755ece-5440-57c8-bbdd-44202cf1680a')
order by c.name;
