from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from verbal_overlay_state import publish, snapshot


class VerbalOverlayTests(unittest.TestCase):
    def payload(self):
        return {'visible': True, 'draw_id': 'a' * 32, 'new_draw': True,
                'character': 'Ilya', 'approach': 'Persuader',
                'words': [{'word': f'Mot {i}', 'discarded': False, 'used': False} for i in range(7)]}

    def test_update_and_restore_active_draw(self):
        state = publish('OBS_TEST', self.payload())
        self.assertTrue(snapshot('OBS_TEST')['visible'])
        state['new_draw'] = False
        state['words'][0]['discarded'] = True
        state['words'][1]['used'] = True
        changed = publish('OBS_TEST', state)
        self.assertGreater(changed['revision'], state['revision'])
        self.assertTrue(snapshot('OBS_TEST')['words'][0]['discarded'])
        self.assertTrue(snapshot('OBS_TEST')['words'][1]['used'])
        state['words'][0]['discarded'] = False
        publish('OBS_TEST', state)
        self.assertFalse(snapshot('OBS_TEST')['words'][0]['discarded'])
        self.assertFalse(snapshot('OTHER_ROOM')['visible'])

    def test_old_draw_cannot_replace_latest_draw(self):
        first = self.payload()
        publish('OBS_PLAYERS', first)
        second = {**self.payload(), 'draw_id': 'b' * 32, 'character': 'Autre joueur'}
        latest = publish('OBS_PLAYERS', second)
        first['new_draw'] = False
        first['words'][0]['used'] = True
        self.assertEqual(publish('OBS_PLAYERS', first), latest)
        self.assertEqual(snapshot('OBS_PLAYERS'), latest)
        second['new_draw'] = False
        second['words'][0]['used'] = True
        updated = publish('OBS_PLAYERS', second)
        self.assertTrue(updated['words'][0]['used'])
        self.assertGreater(updated['revision'], latest['revision'])
        third = {**self.payload(), 'draw_id': 'c' * 32}
        self.assertEqual(publish('OBS_PLAYERS', third)['character'], 'Ilya')

    def test_updates_cannot_create_a_draw_in_another_room(self):
        update = {**self.payload(), 'new_draw': False}
        empty = snapshot('OBS_NO_DRAW')
        self.assertEqual(publish('OBS_NO_DRAW', update), empty)
        self.assertEqual(snapshot('OBS_NO_DRAW'), empty)

    def test_invalid_states_are_rejected(self):
        for payload in (None, {'visible': 'yes'}, {'visible': True}, {'visible': False},
                        {**self.payload(), 'draw_id': '../room'},
                        {**self.payload(), 'draw_id': None},
                        {**self.payload(), 'new_draw': 'yes'}):
            with self.assertRaises(ValueError):
                publish('OBS_BAD', payload)
        payload = self.payload()
        for entry in payload['words'][:3]:
            entry['discarded'] = True
        with self.assertRaises(ValueError):
            publish('OBS_BAD', payload)
        payload = self.payload()
        payload['words'][1]['word'] = payload['words'][0]['word']
        with self.assertRaises(ValueError):
            publish('OBS_BAD', payload)
        with self.assertRaises(ValueError):
            snapshot('../room')


if __name__ == '__main__':
    unittest.main()
