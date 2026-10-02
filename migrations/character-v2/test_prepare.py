import copy
import unittest

from prepare import prepare, verify


def fixture():
    return {'personnages': [{'player_name': 'Joueur', 'user_id': 'owner', 'nom': 'Personnage',
                             'generation': {'rerollsUsed': 2}, 'extra': {'unknown': [1, None]}}],
            'pj_sheets': [
                {'id': 1, 'user_id': 'owner', 'room_code': '8QXJ', 'character_name': 'Personnage',
                 'sheet_data': {'stats': {'intelligence': '1'}, 'skills': [], 'spells': []}},
                {'id': 2, 'user_id': 'owner', 'room_code': '4SSU', 'character_name': 'Personnage',
                 'markdown_content': '# Source intégrale', 'sheet_data': {
                     'fields': {'skillProfessionalPool': '325', 'custom': ['champ libre']},
                     'stats': {'intelligence': '16', 'pouvoir': '13'},
                     'skills': [{'name': 'Arme de mêlée (divers)', 'base': '0', 'points': '33', 'score': '33', 'checked': True}],
                     'spells': [{'name': 'Guérison Supérieure', 'points': '59', 'checked': True},
                                {'name': '', 'points': '7', 'checked': True}], 'custom': {'a': 1}}}],
            'pj_inventory': [{'id': 1, 'user_id': 'owner', 'room_code': '4SSU', 'character_name': '',
                              'po': 5, 'pa': 4, 'pc': 0, 'weapons': [{'name': 'Marteau', 'custom': None}],
                              'armors': [], 'equipment': [], 'consumables': [{'type': 'alchemy-potions', 'entries': []}],
                              'miscellaneous': [{'name': 'Objet', 'description': 'Histoire\ncomplète'}]}]}


class MigrationTests(unittest.TestCase):
    def test_catalog_has_unique_ids_and_no_professions(self):
        result = prepare(fixture())
        for kind in ('skills', 'spells'):
            rows = result['catalog'][kind]
            self.assertEqual(len(rows), len({r['id'] for r in rows}))
            self.assertEqual(len(rows), len({r['name'] for r in rows}))
        self.assertFalse({'Sorcier', 'Prêtre', 'Chaman', 'Étudiant'} &
                         {r['name'] for r in result['catalog']['spells']})

    def test_reference_not_latest_date(self):
        source = fixture()
        source['pj_sheets'][0]['updated_at'] = '2099-01-01'
        result = prepare(source)
        self.assertEqual(result['states'][0]['source_sheet_id'], 2)
        self.assertEqual(result['states'][0]['stats']['pouvoir'], 13)
        self.assertEqual(result['spells'][0]['points'], 59)
        self.assertEqual(result['wallets'][0]['pa'], 4)

    def test_anonymous_spell_and_unknown_fields_are_preserved(self):
        source = fixture()
        before = copy.deepcopy(source)
        result = prepare(source)
        self.assertEqual(source, before)
        self.assertTrue(any(i['kind'] == 'anonymous_spell' for i in result['issues']))
        self.assertEqual(result['states'][0]['legacy_sheet_data']['spells'][1]['points'], '7')
        self.assertEqual(result['characters'][0]['initial_record']['extra'], {'unknown': [1, None]})
        verify(source, result)

    def test_named_historical_skills_resolve_without_position(self):
        source = fixture()
        source['pj_sheets'][1]['sheet_data']['skills'].insert(0, {'name': 'Science (divers)', 'base': 1, 'points': 10, 'score': 11})
        result = prepare(source)
        self.assertEqual([s['skill_id'] for s in result['skills']], ['skill.alchimie', 'skill.arme_de_melee'])

    def test_ids_survive_named_rows_reordering(self):
        source = fixture()
        rows = source['pj_sheets'][1]['sheet_data']['skills']
        rows.append({'name': 'Défense', 'base': 16, 'points': 20, 'score': 36})
        before = prepare(source)
        rows.reverse()
        after = prepare(source)
        self.assertEqual({s['skill_id']: s['id'] for s in before['skills']}, {s['skill_id']: s['id'] for s in after['skills']})

    def test_verification_detects_data_loss(self):
        source = fixture()
        for mutate in (
            lambda r: r['archives'][0]['payload'].pop('extra'),
            lambda r: r['items'].pop(),
            lambda r: r['wallets'][0].update(pa=0),
            lambda r: r['skills'].clear(),
            lambda r: r['spells'].clear(),
            lambda r: r['skills'][0].update(points=0),
            lambda r: r['spells'][0].update(checked=False),
            lambda r: r['states'][0]['stats'].update(pouvoir=12),
        ):
            with self.subTest(mutate=mutate):
                result = prepare(source)
                mutate(result)
                with self.assertRaises(AssertionError):
                    verify(source, result)

    def test_ambiguous_reference_fails(self):
        source = fixture()
        second = copy.deepcopy(source['pj_sheets'][1])
        second['id'] = 3
        source['pj_sheets'].append(second)
        with self.assertRaises(ValueError):
            prepare(source)

    def test_no_silent_number_truncation(self):
        source = fixture()
        source['pj_sheets'][1]['sheet_data']['stats']['pouvoir'] = '13.5'
        with self.assertRaises(ValueError):
            prepare(source)


if __name__ == '__main__':
    unittest.main()
