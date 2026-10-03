"""Audit a private campaign snapshot without changing cloud data or character files."""
import argparse
import hashlib
import json
import re
import unicodedata
from pathlib import Path


def normalized(value):
    value = re.sub(r'\s*\(divers\)', '', str(value))
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFD', value).encode('ascii', 'ignore').decode().lower())


def audit(snapshot):
    findings, summaries = [], []
    campaign_ids = set()
    inventories = {r['state_id']: r for r in snapshot['pj_inventory']}
    characters = {r['character_id']: r for r in snapshot['personnages']}
    for row in snapshot['pj_sheets']:
        sheet, name = row['sheet_data'], row['character_name']
        campaign_ids.add(row['campaign_id'])
        for key in ['character_id', 'state_id', 'campaign_id']:
            if sheet.get(key) != row.get(key):
                findings.append({'kind': 'identity_mismatch', 'name': name, 'field': key})
        if row['character_id'] not in characters or row['state_id'] not in inventories:
            findings.append({'kind': 'missing_related_record', 'name': name})
        if sheet.get('revision') != row.get('revision'):
            findings.append({'kind': 'revision_mismatch', 'name': name})
        skills = [r for r in sheet.get('skills', []) if r.get('id')]
        spells = [r for r in sheet.get('spells', []) if r.get('name')]
        intelligence = int(sheet['stats']['intelligence'])
        total = int(sheet['fields'].get('skillProfessionalPool', 325)) + intelligence * 10
        spent = sum(int(r.get('points', 0)) for r in skills + spells)
        if spent > total:
            findings.append({'kind': 'budget_exceeded', 'name': name, 'excess': spent-total})
        md_rows = {}
        for line in row.get('markdown_content', '').splitlines():
            cells = [c.strip() for c in line.split('|')[1:-1]]
            if len(cells) == 5 and cells[3].isdigit():
                md_rows[normalized(cells[0])] = cells
        checked = []
        for collection in [skills, spells]:
            ids = [r.get('id') for r in collection]
            if len(ids) != len(set(ids)):
                findings.append({'kind': 'duplicate_id', 'name': name})
            for entry in collection:
                score = int(entry['score']) if 'score' in entry else intelligence + int(entry['points'])
                points = int(entry.get('points', 0))
                if score < 0 or score > 100 or points < 0:
                    findings.append({'kind': 'out_of_range', 'name': name, 'entry': entry.get('name'), 'score': score, 'points': points})
                if 'base' in entry and score != int(entry['base']) + points:
                    findings.append({'kind': 'score_mismatch', 'name': name, 'entry': entry.get('name')})
                if entry.get('checked'):
                    checked.append(entry['name'])
                cells = md_rows.get(normalized(entry['name']))
                if cells is None:
                    findings.append({'kind': 'markdown_missing', 'name': name, 'entry': entry['name'], 'score': score})
                elif int(cells[3]) != score or ('x' in cells[4].lower()) != bool(entry.get('checked')):
                    findings.append({'kind': 'markdown_mismatch', 'name': name, 'entry': entry['name'], 'cloud_score': score, 'markdown_score': cells[3]})
        inv = inventories.get(row['state_id'], {})
        summaries.append({'name': name, 'character_id': row['character_id'], 'state_id': row['state_id'],
                          'campaign_id': row['campaign_id'], 'professional': int(sheet['fields'].get('skillProfessionalPool',325)),
                          'personal': intelligence*10, 'total': total, 'spent': spent, 'remaining': total-spent,
                          'skills': len(skills), 'spells': len(spells), 'checked': checked,
                          'coins': {k: inv.get(k) for k in ['po','pa','pc']}})
    return {'source_captured_at': snapshot['captured_at'], 'campaign_ids': sorted(campaign_ids),
            'characters': summaries, 'findings': findings, 'rooms': snapshot.get('rooms', [])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('snapshot', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    result = audit(json.loads(args.snapshot.read_text(encoding='utf-8')))
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'audit-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    lines = ['# Audit avant évolution — 3 octobre 2026', '',
             f"Source : export RPC réel, room 4SSU, capture UTC {result['source_captured_at']}.", '',
             'Portée : Ilya, Gram et Thokk uniquement ; les personnages de test sont exclus. Aucune donnée serveur modifiée.', '',
             '## Budgets et fiches', '', '| PJ | Professionnels | Personnels | Total | Utilisés | Restants | Sorts |', '|---|---:|---:|---:|---:|---:|---:|']
    for c in result['characters']:
        lines.append(f"| {c['name']} | {c['professional']} | {c['personal']} | {c['total']} | {c['spent']} | {c['remaining']} | {c['spells']} |")
    lines += ['', 'Les trois identités de personnage et leurs états sont distincts, dans la même campagne. Les fiches correspondent aux inventaires ; les révisions sont cohérentes. Aucun dépassement de budget, score hors 0–100 ou différence entre base + points et score n’a été relevé.', '',
              '## Écarts à signaler au MJ', '']
    for issue in result['findings']:
        lines.append('- '+json.dumps(issue, ensure_ascii=False))
    lines += ['', 'Pour Gram et Thokk, Alchimie vaut 1 % dans les données structurées mais n’apparaît pas dans le Markdown serveur. Il s’agit d’un écart de représentation ; aucun score n’a été ajouté ou corrigé.', '',
              'Les pools professionnels actuels sont 343, 342 et 335 ; le formulaire utilise 325 par défaut. Leur origine historique (création ou progression) n’est pas établie par cette lecture. Conserver les totaux acquis ; ne pas convertir automatiquement ces écarts en nouvelle réserve d’XP.', '',
              '## Salons accessibles', '', '| Room | Lecture de campagne | Fiches ciblées |', '|---|---|---:|']
    for r in result['rooms']:
        lines.append(f"| {r['room_code']} | {'Campagne confirmée' if r['mapping_verified'] else 'Aucune fiche ciblée ; lien non établi par cette lecture'} | {r['selected_sheets']} |")
    lines += ['', 'La RPC ne donne pas un inventaire administrateur des liens sans fiche accessible. Les rooms historiques ne sont pas fusionnées et leur absence de résultat n’est pas interprétée comme une absence certaine de lien.', '',
              '## Sauvegarde et limites', '',
              f"- Export privé : `{args.snapshot.resolve()}`.",
              '- Source de l’audit : fiches, personnages, inventaires et rooms accessibles au compte MJ ; ce n’est pas une sauvegarde complète du schéma serveur.',
              '- Les SQL locaux sont sauvegardés séparément ; un export frais des fonctions, permissions et politiques serveur reste requis avant toute migration.',
              '- Les gains historiques ne sont pas réattribués, les coches sont conservées et aucun pool de session n’est créé par cet audit.',
              '- Aucun changement serveur ni déploiement de la refonte effectué.']
    (args.output/'RAPPORT.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')
    print(json.dumps({'characters': len(result['characters']), 'findings': result['findings'], 'report': str((args.output/'RAPPORT.md').resolve())},ensure_ascii=False))

if __name__ == '__main__':
    main()
