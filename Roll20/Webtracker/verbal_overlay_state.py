"""État éphémère de l'aide verbale, partagé entre navigateur et OBS local."""
from copy import deepcopy
from threading import Lock
import re

_states = {}
_lock = Lock()


def room_key(value):
    key = (value or 'LOCAL').strip().upper()
    if not re.fullmatch(r'[A-Z0-9_-]{1,32}', key):
        raise ValueError('Code de salon invalide')
    return key


def snapshot(room):
    with _lock:
        return deepcopy(_states.get(room_key(room), {'visible': False, 'revision': 0}))


def publish(room, payload):
    key = room_key(room)
    if not isinstance(payload, dict) or type(payload.get('visible')) is not bool:
        raise ValueError('État invalide')
    state = {'visible': payload['visible']}
    if state['visible']:
        for field in ('character', 'approach'):
            value = payload.get(field)
            if not isinstance(value, str) or not value.strip() or len(value) > 100:
                raise ValueError('Identité ou approche invalide')
            state[field] = value
        words = payload.get('words')
        if not isinstance(words, list) or not 5 <= len(words) <= 8:
            raise ValueError('Liste de mots invalide')
        clean = []
        for entry in words:
            if not isinstance(entry, dict):
                raise ValueError('Mot invalide')
            word = entry.get('word')
            if not isinstance(word, str) or not word.strip() or len(word) > 80:
                raise ValueError('Mot invalide')
            if any(type(entry.get(flag)) is not bool for flag in ('discarded', 'used')):
                raise ValueError('Repère de mot invalide')
            clean.append({name: entry[name] for name in ('word', 'discarded', 'used')})
        if len({entry['word'] for entry in clean}) != len(clean):
            raise ValueError('Mots en double')
        if sum(entry['discarded'] for entry in clean) > len(clean) - 5:
            raise ValueError('Trop de jokers')
        state['words'] = clean
    with _lock:
        state['revision'] = _states.get(key, {}).get('revision', 0) + 1
        if key not in _states and len(_states) >= 64:
            del _states[next(iter(_states))]
        _states[key] = state
        return deepcopy(state)
