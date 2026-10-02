from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).parents[1]))
from verbal_overlay_state import publish, snapshot


class VerbalOverlayTests(unittest.TestCase):
    def payload(self):
        return {'visible': True, 'character': 'Ilya', 'approach': 'Persuasion',
                'words': [{'word': f'Mot {i}', 'discarded': False, 'used': False} for i in range(7)]}

    def test_update_restore_and_hide(self):
        state = publish('OBS_TEST', self.payload())
        self.assertTrue(snapshot('OBS_TEST')['visible'])
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
        hidden = publish('OBS_TEST', {'visible': False})
        self.assertFalse(hidden['visible'])
        self.assertNotIn('words', hidden)

    def test_invalid_states_are_rejected(self):
        for payload in (None, {'visible': 'yes'}, {'visible': True}):
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
