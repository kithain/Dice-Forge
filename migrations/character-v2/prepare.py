"""Reprise hors ligne, sans connexion ni écriture en BDD.

Le catalogue est figé : ses IDs ne sont pas dérivés à nouveau des libellés.
Les sources intégrales restent dans archives, même quand elles sont ambiguës.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import uuid

NAMESPACE = uuid.UUID('267140d3-cc6e-480c-a03d-8d39a4d3a13e')
CATALOG_PATH = Path(__file__).with_name('catalog.json')
TABLES = ('personnages', 'pj_sheets', 'pj_inventory')


def stable_id(kind, key):
    return str(uuid.uuid5(NAMESPACE, f'{kind}:{key}'))


def digest(value):
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()
    return hashlib.sha256(encoded).hexdigest()


def leaves(value, path=''):
    if isinstance(value, dict) and value:
        for key, child in value.items():
            yield from leaves(child, f'{path}/{key}')
    elif isinstance(value, list) and value:
        for index, child in enumerate(value):
            yield from leaves(child, f'{path}/{index}')
    else:
        yield path, value


def integer(value, location):
    # Ne pas tronquer les nombres décimaux, convertir null ou remplacer par zéro.
    if isinstance(value, bool):
        raise ValueError(f'{location}: booléen au lieu de nombre')
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip() and value.strip().lstrip('-').isdigit():
        return int(value)
    raise ValueError(f'{location}: nombre entier invalide {value!r}')


def source_key(table, row):
    return str(row['player_name'] if table == 'personnages' else row['id'])


def prepare(source, reference_room='4SSU'):
    catalog = json.loads(CATALOG_PATH.read_text(encoding='utf-8'))
    for kind in ('skills', 'spells'):
        for field in ('id', 'name'):
            values = [row[field] for row in catalog[kind]]
            if len(set(values)) != len(values):
                raise ValueError(f'Catalogue {kind}: {field} dupliqué')
    skills = {item['name']: item['id'] for item in catalog['skills']}
    spells = {item['name']: item['id'] for item in catalog['spells']}
    campaign_id = stable_id('campaign', reference_room)
    result = {'schema_version': 2, 'reference_room': reference_room,
              'source_captured_at': source.get('captured_at'), 'catalog': catalog,
              'campaigns': [{'id': campaign_id, 'reference_room': reference_room,
                             'name': f'Campagne — référence {reference_room}'}],
              'characters': [], 'states': [], 'skills': [], 'spells': [],
              'items': [], 'wallets': [], 'archives': [], 'issues': []}
    issues = result['issues']
    for table in TABLES:
        rows = source.get(table)
        if not isinstance(rows, list):
            raise ValueError(f'Table manquante : {table}')
        seen = set()
        for row in rows:
            key = source_key(table, row)
            if key in seen:
                raise ValueError(f'Source dupliquée : {table}/{key}')
            seen.add(key)
            result['archives'].append({'id': stable_id('archive', f'{table}/{key}'),
                                       'source_table': table, 'source_key': key,
                                       'sha256': digest(row), 'payload': copy.deepcopy(row)})
    by_owner = {}
    for row in source['personnages']:
        character = {'id': stable_id('character', f"personnages/{row['player_name']}"),
                     'owner_user_id': row.get('user_id'), 'name': row['nom'],
                     'source_player_name': row['player_name'],
                     'generation': copy.deepcopy(row.get('generation')),
                     'initial_record': copy.deepcopy(row), 'status': 'archived'}
        result['characters'].append(character)
        if row.get('user_id'):
            by_owner.setdefault(row['user_id'], []).append(character)
        else:
            issues.append({'kind': 'owner_missing', 'source': f"personnages/{row['player_name']}"})
    selected = [row for row in source['pj_sheets'] if row['room_code'] == reference_room]
    if not selected:
        raise ValueError(f'Aucune fiche dans la salle de référence {reference_room}')
    selected_owners = set()
    for sheet in selected:
        owner = sheet.get('user_id')
        if not owner:
            raise ValueError(f"Fiche {sheet['id']} de référence sans propriétaire")
        if owner in selected_owners:
            raise ValueError(f'Plusieurs fiches de référence pour le compte {owner}')
        selected_owners.add(owner)
        candidates = [c for c in by_owner.get(owner, []) if c['name'] == sheet['character_name']]
        if len(candidates) != 1:
            raise ValueError(f"Identité ambiguë pour la fiche {sheet['id']}")
        character = candidates[0]
        character['status'] = 'active'
        data = sheet['sheet_data']
        state_id = stable_id('state', f"{campaign_id}/{character['id']}")
        state = {'id': state_id, 'campaign_id': campaign_id, 'character_id': character['id'],
                 'source_sheet_id': sheet['id'], 'revision': 1,
                 'fields': copy.deepcopy(data.get('fields', {})),
                 'stats': {k: integer(v, f"sheet/{sheet['id']}/stats/{k}") for k, v in data.get('stats', {}).items()},
                 'legacy_sheet_data': copy.deepcopy(data),
                 'legacy_markdown': sheet.get('markdown_content', ''),
                 'source_updated_at': sheet.get('updated_at')}
        result['states'].append(state)
        for index, row in enumerate(data.get('skills', [])):
            if not row:
                continue
            name = row.get('name')
            if name:
                skill_id = skills.get(catalog['aliases'].get(name, name))
            elif len(data['skills']) == len(catalog['legacy_catalogs']['brp_57_v1']):
                skill_id = catalog['legacy_catalogs']['brp_57_v1'][index]
            else:
                skill_id = None
            if not skill_id:
                issues.append({'kind': 'unmapped_skill', 'source_sheet_id': sheet['id'], 'index': index})
                continue
            if any(r['state_id'] == state_id and r['skill_id'] == skill_id for r in result['skills']):
                raise ValueError(f'Compétence dupliquée sans spécialité : {skill_id}')
            entry = {'id': stable_id('skill-entry', f'{state_id}/{skill_id}'),
                     'state_id': state_id, 'skill_id': skill_id, 'legacy_index': index,
                     'specialty': '', 'raw_payload': copy.deepcopy(row)}
            for key in ('base', 'points', 'score'):
                entry[key] = integer(row[key], f"sheet/{sheet['id']}/skills/{index}/{key}") if key in row else None
            entry['checked'] = bool(row.get('checked'))
            if entry['base'] is not None and entry['points'] is not None and entry['score'] != entry['base'] + entry['points']:
                issues.append({'kind': 'score_mismatch', 'source_sheet_id': sheet['id'], 'skill_id': skill_id})
            result['skills'].append(entry)
        for index, row in enumerate(data.get('spells', [])):
            if not row.get('name'):
                if integer(row.get('points', 0), 'anonymous spell points') or row.get('checked'):
                    issues.append({'kind': 'anonymous_spell', 'source_sheet_id': sheet['id'],
                                   'index': index, 'payload': copy.deepcopy(row)})
                continue
            spell_id = spells.get(row['name'])
            if not spell_id:
                spell_id = 'spell.custom.' + stable_id('custom-spell', row['name'])
                catalog['spells'].append({'id': spell_id, 'name': row['name']})
                spells[row['name']] = spell_id
            if any(r['state_id'] == state_id and r['spell_id'] == spell_id for r in result['spells']):
                raise ValueError(f'Sort dupliqué : {spell_id}')
            result['spells'].append({'id': stable_id('spell-entry', f'{state_id}/{spell_id}'),
                                     'state_id': state_id, 'spell_id': spell_id,
                                     'legacy_index': index, 'name': row['name'],
                                     'points': integer(row.get('points', 0), 'spell points'),
                                     'checked': bool(row.get('checked')), 'raw_payload': copy.deepcopy(row)})
        inventory_rows = [r for r in source['pj_inventory'] if r.get('user_id') == owner and r['room_code'] == reference_room]
        if len(inventory_rows) > 1:
            raise ValueError(f'Inventaire de référence ambigu pour {owner}')
        state['source_inventory_id'] = inventory_rows[0]['id'] if inventory_rows else None
        state['legacy_inventory'] = copy.deepcopy(inventory_rows[0]) if inventory_rows else None
        if inventory_rows:
            inventory = inventory_rows[0]
            result['wallets'].append({'state_id': state_id, **{unit: integer(inventory[unit], f'wallet/{unit}') for unit in ('po', 'pa', 'pc')}})
            for category in ('weapons', 'armors', 'equipment', 'consumables', 'miscellaneous'):
                for index, item in enumerate(inventory.get(category, [])):
                    result['items'].append({'id': stable_id('item', f"inventory/{inventory['id']}/{category}/{index}"),
                                            'state_id': state_id, 'category': category, 'legacy_index': index,
                                            'name': item.get('name'), 'payload': copy.deepcopy(item)})
        else:
            issues.append({'kind': 'inventory_missing', 'source_sheet_id': sheet['id']})
        available = integer(state['fields'].get('skillProfessionalPool', 325), 'professional budget') + state['stats'].get('intelligence', 0) * 10
        spent = sum(r['points'] or 0 for r in result['skills'] if r['state_id'] == state_id) + sum(r['points'] for r in result['spells'] if r['state_id'] == state_id)
        if spent > available:
            issues.append({'kind': 'budget_exceeded', 'source_sheet_id': sheet['id'], 'available': available, 'spent': spent})
    active_inventory_ids = {s['source_inventory_id'] for s in result['states']}
    for inventory in source['pj_inventory']:
        if inventory['id'] not in active_inventory_ids:
            issues.append({'kind': 'historical_inventory', 'source_inventory_id': inventory['id'],
                           'owner_missing': not bool(inventory.get('user_id'))})
    verify(source, result)
    return result


def verify(source, result):
    """Vérifie chaque valeur source, puis les projections actives vers les tables."""
    expected = {(t, source_key(t, r)): r for t in TABLES for r in source[t]}
    archives = {(a['source_table'], a['source_key']): a for a in result['archives']}
    assert len(archives) == len(result['archives']) == len(expected)
    for key, row in expected.items():
        assert row == archives[key]['payload'], f'Archive modifiée : {key}'
        assert digest(row) == archives[key]['sha256'], f'Empreinte différente : {key}'
        assert list(leaves(row)) == list(leaves(archives[key]['payload']))
    selected = [s for s in source['pj_sheets'] if s['room_code'] == result['reference_room']]
    assert len(result['states']) == len(selected)
    for sheet in selected:
        state = next(s for s in result['states'] if s['source_sheet_id'] == sheet['id'])
        assert state['legacy_sheet_data'] == sheet['sheet_data']
        assert state['legacy_markdown'] == sheet.get('markdown_content', '')
        assert state['fields'] == sheet['sheet_data'].get('fields', {})
        assert state['stats'] == {k: integer(v, k) for k, v in sheet['sheet_data'].get('stats', {}).items()}
        actual = sorted((r['legacy_index'], r['raw_payload']) for r in result['skills'] if r['state_id'] == state['id'])
        wanted = [(i, r) for i, r in enumerate(sheet['sheet_data'].get('skills', [])) if r]
        assert actual == wanted, f'Compétences actives non reprises : {sheet["id"]}'
        for row in (r for r in result['skills'] if r['state_id'] == state['id']):
            for key in ('base', 'points', 'score'):
                assert row[key] == (integer(row['raw_payload'][key], key) if key in row['raw_payload'] else None)
            assert row['checked'] == bool(row['raw_payload'].get('checked'))
        actual = sorted((r['legacy_index'], r['raw_payload']) for r in result['spells'] if r['state_id'] == state['id'])
        wanted = [(i, r) for i, r in enumerate(sheet['sheet_data'].get('spells', [])) if r.get('name')]
        assert actual == wanted, f'Sorts actifs non repris : {sheet["id"]}'
        for row in (r for r in result['spells'] if r['state_id'] == state['id']):
            assert row['points'] == integer(row['raw_payload'].get('points', 0), 'spell points')
            assert row['checked'] == bool(row['raw_payload'].get('checked'))
        if state['source_inventory_id'] is not None:
            inventory = next(i for i in source['pj_inventory'] if i['id'] == state['source_inventory_id'])
            assert state['legacy_inventory'] == inventory
            for category in ('weapons', 'armors', 'equipment', 'consumables', 'miscellaneous'):
                items = sorted((r['legacy_index'], r['payload']) for r in result['items'] if r['state_id'] == state['id'] and r['category'] == category)
                assert [r for _, r in items] == inventory.get(category, [])
            wallet = next(w for w in result['wallets'] if w['state_id'] == state['id'])
            assert all(wallet[k] == inventory[k] for k in ('po', 'pa', 'pc'))
    return sum(len(list(leaves(row))) for row in expected.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--reference-room', default='4SSU')
    args = parser.parse_args()
    source = json.loads(args.backup.read_text(encoding='utf-8-sig'))
    if isinstance(source, list):
        source = source[0]['backup']
    result = prepare(source, args.reference_room)
    args.output.mkdir(parents=True, exist_ok=True)
    output = args.output / 'character-v2.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    # Vérification indépendante du fichier réellement écrit, après relecture.
    count = verify(source, json.loads(output.read_text(encoding='utf-8')))
    report = {'reference_room': args.reference_room, 'verified_source_values': count,
              'source_counts': {t: len(source[t]) for t in TABLES},
              'active_characters': len(result['states']), 'skills': len(result['skills']),
              'spells': len(result['spells']), 'items': len(result['items']),
              'archive_count': len(result['archives']), 'issues': result['issues'],
              'source_sha256': hashlib.sha256(args.backup.read_bytes()).hexdigest(),
              'output_sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
              'database_modified': False, 'application_switched': False}
    (args.output / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k != 'issues'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
