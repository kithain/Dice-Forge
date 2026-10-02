"""Importe les règles Obsidian et génère leur chapitre dans le livret.

python scripts/sync_alchemy_rules.py --source "chemin/vers/alchimie.md"
python scripts/sync_alchemy_rules.py --check
Le rendu prend en charge le sous-ensemble Markdown utilisé par ce document.
"""
import argparse
import hashlib
import html
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data' / 'alchimie.md'
BOOK = ROOT / 'livret_joueur.html'
SECTION = r'<section id="alchimie">.*?</section>'


def slug(text):
    text = unicodedata.normalize('NFD', text.casefold())
    text = ''.join(c for c in text if not unicodedata.combining(c))
    return 'alchimie-' + re.sub(r'[^a-z0-9]+', '-', text).strip('-')


def inline(text):
    links = []

    def wiki(match):
        target, _, label = match.group(1).replace(r'\|', '|').partition('|')
        label = label or target.lstrip('#')
        if target.startswith('#'):
            href = '#' + slug(target[1:])
        elif target.endswith('/Resolution BRP'):
            href = 'ecran_joueur_BRP_ORC.html#jets'
        else:
            raise ValueError(f'Lien Obsidian sans destination : {target}')
        links.append(f'<a href="{href}">{html.escape(label)}</a>')
        return f'\x00{len(links) - 1}\x00'

    text = re.sub(r'\[\[(.*?)\]\]', wiki, text)
    text = html.escape(text, quote=False).replace('&lt;br&gt;', '<br>')
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\*)\*([^*]+)\*(?!\*)', r'<em>\1</em>', text)
    for i, link in enumerate(links):
        text = text.replace(f'\x00{i}\x00', link)
    return text


def cells(line):
    return re.split(r'(?<!\\)\|', line.strip().strip('|'))


def render(source):
    lines = source.splitlines()
    output = ['<section id="alchimie">',
              f'<!-- Généré depuis data/alchimie.md ; SHA256 {hashlib.sha256(source.encode()).hexdigest()} -->']
    used_ids = {}
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        heading = re.match(r'^(#{1,4}) (.+)$', line)
        if heading:
            level, title = len(heading[1]), heading[2]
            ident = slug(title)
            used_ids[ident] = used_ids.get(ident, 0) + 1
            if used_ids[ident] > 1:
                ident += f'-{used_ids[ident]}'
            attrs = ' class="chapter"' if level == 1 else ''
            output.append(f'<h{level} id="{ident}"{attrs}>{"7. " if level == 1 else ""}{inline(title)}</h{level}>')
            if level == 1:
                output.append('<p class="note">Règles d’alchimie de la campagne : catégories de réactifs, recettes de degrés I et II et quatre doses transportées par personnage.</p>')
                output.append('<p>Utilisez le score en pourcentage d’Alchimie indiqué sur votre fiche (base de 1 % + points investis). La mention INT désigne la caractéristique associée ; elle ne remplace pas ce score par un jet d’INT.</p>')
            i += 1
        elif line == '---':
            output.append('<hr>')
            i += 1
        elif line.startswith('>'):
            quote = []
            while i < len(lines) and lines[i].startswith('>'):
                quote.append(lines[i].lstrip('> ').strip())
                i += 1
            quote[0] = re.sub(r'^\[![^]]+\]\s*', '', quote[0])
            output.append('<aside class="alchemy-callout">' + '<br>'.join(inline(s) for s in quote) + '</aside>')
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                rows.append(cells(lines[i]))
                i += 1
            if len(rows) < 2 or not all(re.fullmatch(r'\s*:?-+:?\s*', cell) for cell in rows[1]):
                raise ValueError('Table Markdown invalide')
            if any(len(row) != len(rows[0]) for row in rows):
                raise ValueError('Nombre de colonnes incohérent')
            output.append('<div class="alchemy-table"><table>')
            for n, row in enumerate([rows[0]] + rows[2:]):
                tag = 'th' if n == 0 else 'td'
                output.append('<tr>' + ''.join(f'<{tag}>{inline(c.strip())}</{tag}>' for c in row) + '</tr>')
            output.append('</table></div>')
        elif re.match(r'^(?:- |\d+\. )', line):
            ordered = bool(re.match(r'^\d+\. ', line))
            pattern = r'^\d+\. ' if ordered else r'^- '
            tag = 'ol' if ordered else 'ul'
            output.append(f'<{tag}>')
            while i < len(lines):
                if not lines[i].strip():
                    i += 1
                    continue
                if not re.match(pattern, lines[i].strip()):
                    break
                item = [re.sub(pattern, '', lines[i].strip())]
                i += 1
                while i < len(lines) and lines[i].startswith('  ') and not re.match(pattern, lines[i].strip()):
                    item.append(lines[i].strip())
                    i += 1
                output.append('<li>' + inline(' '.join(item)) + '</li>')
            output.append(f'</{tag}>')
        else:
            paragraph = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r'^(?:#|>|\||- |\d+\. |---$)', lines[i].strip()):
                paragraph.append(lines[i].strip())
                i += 1
            output.append('<p>' + inline(' '.join(paragraph)) + '</p>')
    output.append('</section>')
    section = '\n'.join(output)
    ids = set(re.findall(r' id="([^"]+)"', section))
    for target in re.findall(r'href="#([^"]+)"', section):
        if target not in ids:
            raise ValueError(f'Ancre introuvable : {target}')
    return section


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if args.source and args.check:
        parser.error('--source et --check sont incompatibles')
    source = (args.source or SOURCE).read_text(encoding='utf-8-sig')
    section = render(source)
    book = BOOK.read_text(encoding='utf-8')
    existing = re.search(SECTION, book, re.S)
    if not existing:
        raise ValueError('Chapitre Alchimie introuvable')
    if args.check:
        if existing.group() != section or SOURCE.read_text(encoding='utf-8') != source:
            raise SystemExit('Chapitre Alchimie désynchronisé : lancer scripts/sync_alchemy_rules.py')
        print('Alchimie : source et livret synchronisés.')
        return
    if args.source:
        SOURCE.parent.mkdir(exist_ok=True)
        SOURCE.write_text(source, encoding='utf-8', newline='\n')
    BOOK.write_text(book[:existing.start()] + section + book[existing.end():], encoding='utf-8', newline='\n')
    print('Alchimie : référentiel importé et chapitre généré.')


if __name__ == '__main__':
    main()
