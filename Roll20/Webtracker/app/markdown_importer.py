import hashlib
import math
import os
from pathlib import Path
import re
import shutil
import unicodedata


DEFAULT_VAULT = Path(r"D:\kitha\Documents\JDR - BRP\Obsidian_Ombre_de_la_Spirale")
SOURCE_FOLDERS = {
    "pj": ("30 - PERSONNAGES/PJ", "PJ"),
    "pnj": ("30 - PERSONNAGES/PNJ", "PNJ"),
    "bestiaire": ("50 - OUTILS/Bestiaire", "Bestiaire"),
}
STAT_NAMES = ("FOR", "CON", "TAI", "INT", "POU", "DEX", "APP")
STAT_FIELDS = {
    "FOR": "strength", "CON": "constitution", "TAI": "size",
    "INT": "intelligence", "POU": "power", "DEX": "dexterity",
    "APP": "charisma", "CHA": "charisma",
}


class MarkdownImportError(ValueError):
    pass


def vault_root():
    return Path(os.environ.get("DICE_FORGE_VAULT", DEFAULT_VAULT)).resolve()


def _source_folder(root, source_type):
    """Utilise la structure actuelle du coffre, avec repli sur l'ancienne."""
    candidates = SOURCE_FOLDERS[source_type]
    for relative in candidates:
        folder = (root / relative).resolve()
        if folder.is_dir():
            return folder
    return (root / candidates[0]).resolve()


def _slug(value):
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")


def _frontmatter(text):
    if not text.startswith("---"):
        return ""
    parts = text.split("---", 2)
    return parts[1] if len(parts) == 3 else ""


def _frontmatter_value(frontmatter, key):
    match = re.search(rf"(?mi)^{re.escape(key)}\s*:\s*[\"']?([^\r\n\"']+)", frontmatter)
    return match.group(1).strip() if match else ""


def _is_webtracker_disabled(text):
    value = _frontmatter_value(_frontmatter(text), "webtracker").casefold()
    return value in {"false", "non", "no", "0"}


def _first_alias(frontmatter):
    inline = re.search(r"(?mi)^aliases\s*:\s*\[(.*?)\]\s*$", frontmatter)
    if inline:
        quoted = re.findall(r"[\"']([^\"']+)[\"']", inline.group(1))
        if quoted:
            return quoted[0].strip()
        values = [value.strip() for value in inline.group(1).split(",") if value.strip()]
        if values:
            return values[0]
    block = re.search(r"(?ms)^aliases\s*:\s*\n((?:\s+-[^\n]*\n?)+)", frontmatter)
    if block:
        value = re.search(r"(?m)^\s+-\s*[\"']?(.+?)[\"']?\s*$", block.group(1))
        if value:
            return value.group(1).strip()
    return ""


def _safe_source(relative_path):
    root = vault_root()
    candidate = (root / Path(relative_path.replace("/", os.sep))).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise MarkdownImportError("Chemin Markdown invalide.") from error
    allowed_roots = [
        (root / relative).resolve()
        for candidates in SOURCE_FOLDERS.values()
        for relative in candidates
    ]
    if not any(candidate == allowed or allowed in candidate.parents for allowed in allowed_roots):
        raise MarkdownImportError("Seuls les dossiers PJ, PNJ et Bestiaire sont autorisés.")
    if candidate.suffix.lower() != ".md" or not candidate.is_file():
        raise MarkdownImportError("Fiche Markdown introuvable.")
    return candidate


def _source_type(path):
    resolved = path.resolve()
    root = vault_root()
    for source_type, candidates in SOURCE_FOLDERS.items():
        for relative in candidates:
            folder = (root / relative).resolve()
            if resolved == folder or folder in resolved.parents:
                return source_type
    raise MarkdownImportError("Type de fiche non reconnu.")


def _parse_stats(text):
    stats = {}

    # PNJ : une ligne « Caractéristiques : FOR 12, CON 11... ».
    inline = re.search(r"(?im)^\*\*Caractéristiques\s*:\*\*\s*([^\r\n]+)", text)
    if inline:
        for key, value in re.findall(r"\b(FOR|CON|TAI|INT|POU|DEX|APP|CHA)\s+(\d+)\b", inline.group(1), re.I):
            stats[key.upper()] = int(value)

    # PJ : une ligne par caractéristique dans un tableau.
    for key, value in re.findall(r"(?m)^\|\s*(FOR|CON|TAI|INT|POU|DEX|APP|CHA)\s*\|\s*(\d+)\s*\|", text, re.I):
        stats[key.upper()] = int(value)

    # Bestiaire : en-tête des sept caractéristiques puis une ligne de valeurs.
    lines = text.splitlines()
    for index, line in enumerate(lines):
        cells = [cell.strip().upper() for cell in line.strip().strip("|").split("|")]
        if cells[:7] != ["FOR", "CON", "TAI", "INT", "POU", "DEX", "CHA"]:
            continue
        for following in lines[index + 1:index + 4]:
            values = [cell.strip() for cell in following.strip().strip("|").split("|")]
            if len(values) >= 7 and all(re.fullmatch(r"\d+", value) for value in values[:7]):
                for key, value in zip(("FOR", "CON", "TAI", "INT", "POU", "DEX", "CHA"), values):
                    stats[key] = int(value)
                break
        break
    return stats


def _last_number_in_field(text, label, stop_at_dot=False):
    value_pattern = r"([^·\r\n]+)" if stop_at_dot else r"([^\r\n]+)"
    match = re.search(rf"(?i){label}\s*:\s*\*{{0,2}}{value_pattern}", text)
    if not match:
        return None
    values = re.findall(r"\d+", match.group(1))
    return int(values[-1]) if values else None


def _field_number(text, label, stop_at_dot=False):
    match = re.search(rf"(?i){label}\s*:\s*\*{{0,2}}\s*\+?(\d+)(?=[^\d]|$)", text)
    return int(match.group(1)) if match else None


def _markdown_image(text, source_path):
    match = re.search(r"!\[\[([^\]|]+?\.(?:png|jpe?g|webp))(?:\|[^\]]+)?\]\]", text, re.I)
    if not match:
        return None
    image = (vault_root() / Path(match.group(1).replace("/", os.sep))).resolve()
    try:
        image.relative_to(vault_root())
    except ValueError:
        return None
    return image if image.is_file() else None


def _existing_portrait(portrait_root, name, source_path, identifier):
    portrait_root = Path(portrait_root)
    if not portrait_root.is_dir():
        return None
    stems = {_slug(name), _slug(source_path.stem), _slug(identifier)}
    stems |= {f"pnj_{stem}" for stem in tuple(stems) if stem}
    for portrait in portrait_root.rglob("*"):
        if portrait.is_file() and _slug(portrait.stem) in stems:
            return portrait.relative_to(portrait_root).as_posix()
    return None


def parse_markdown(relative_path, portrait_root=None):
    path = _safe_source(relative_path)
    text = path.read_text(encoding="utf-8-sig")
    frontmatter = _frontmatter(text)
    source_type = _source_type(path)

    heading = re.search(r"(?m)^#\s+(.+?)\s*$", text)
    name = _first_alias(frontmatter) or (heading.group(1).strip() if heading else path.stem)
    identifier = _frontmatter_value(frontmatter, "id")
    category = _frontmatter_value(frontmatter, "categorie").casefold()
    stats = _parse_stats(text)
    if "DEX" not in stats:
        raise MarkdownImportError(f"DEX introuvable dans {path.name}.")

    hp = _last_number_in_field(text, r"Points de [Vv]ie", stop_at_dot=True)
    if hp is None and "CON" in stats and "TAI" in stats:
        hp = math.ceil((stats["CON"] + stats["TAI"]) / 2)
    if hp is None:
        raise MarkdownImportError(f"Points de vie introuvables dans {path.name}.")

    if source_type == "pj":
        default_role = "player"
    elif source_type == "bestiaire":
        default_role = "monster"
    else:
        default_role = "ally" if category in {"allies", "alliés", "allies"} else "monster"

    portrait = _existing_portrait(portrait_root, name, path, identifier) if portrait_root else None
    image_source = _markdown_image(text, path)
    relative = path.relative_to(vault_root()).as_posix()
    data = {
        "source": relative,
        "source_type": source_type,
        "name": name,
        "default_role": default_role,
        "hp_max": hp,
        "dexterity": stats["DEX"],
        "portrait": portrait,
        "portrait_available": bool(portrait or image_source),
        "strength": stats.get("FOR", 10),
        "constitution": stats.get("CON", hp),
        "size": stats.get("TAI", hp),
        "intelligence": stats.get("INT", 10),
        "power": stats.get("POU", 10),
        "charisma": stats.get("APP", stats.get("CHA", 10)),
        "movement": _field_number(text, r"(?:Déplacement|Mouvement)") or 10,
        "armor_points": _field_number(text, r"(?:Points d['’]armure|Armure)") or 0,
        "_image_source": image_source,
    }
    return data


def scan_markdown_entries(query="", source_type="", portrait_root=None, limit=200):
    root = vault_root()
    query_folded = query.strip().casefold()
    requested = [source_type] if source_type in SOURCE_FOLDERS else list(SOURCE_FOLDERS)
    entries = []
    issues = []
    for kind in requested:
        folder = _source_folder(root, kind)
        if not folder.is_dir():
            issues.append({
                "source": SOURCE_FOLDERS[kind][0],
                "message": "Dossier Obsidian introuvable.",
            })
            continue
        for path in folder.rglob("*.md"):
            relative = path.relative_to(root).as_posix()
            try:
                if _is_webtracker_disabled(path.read_text(encoding="utf-8-sig")):
                    continue
            except (OSError, UnicodeError) as error:
                issues.append({"source": relative, "message": str(error)})
                continue
            if query_folded and query_folded not in relative.casefold():
                # Le nom lisible peut ne pas ressembler au nom de fichier : il sera
                # testé après parsing.
                pass
            try:
                entry = parse_markdown(relative, portrait_root)
            except (MarkdownImportError, OSError, UnicodeError) as error:
                issues.append({"source": relative, "message": str(error)})
                continue
            if query_folded and query_folded not in entry["name"].casefold() and query_folded not in relative.casefold():
                continue
            entry.pop("_image_source", None)
            entries.append(entry)
    entries.sort(key=lambda item: (item["source_type"], item["name"].casefold()))
    issues.sort(key=lambda item: item["source"].casefold())
    return entries[:max(1, min(int(limit), 500))], issues


def list_markdown_entries(query="", source_type="", portrait_root=None, limit=200):
    entries, _issues = scan_markdown_entries(query, source_type, portrait_root, limit)
    return entries


def ensure_portrait(entry, portrait_root):
    source = entry.get("_image_source")
    if not source or not Path(source).is_file():
        return entry.get("portrait")
    portrait_root = Path(portrait_root).resolve()
    destination_dir = portrait_root / "Imported"
    destination_dir.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha1(entry["source"].encode("utf-8")).hexdigest()[:8]
    filename = f"{_slug(entry['name'])}_{digest}{Path(source).suffix.lower()}"
    destination = (destination_dir / filename).resolve()
    try:
        destination.relative_to(portrait_root)
    except ValueError as error:
        raise MarkdownImportError("Destination de portrait invalide.") from error
    source_stat = Path(source).stat()
    destination_is_current = (
        destination.exists()
        and destination.stat().st_size == source_stat.st_size
        and destination.stat().st_mtime_ns == source_stat.st_mtime_ns
    )
    if not destination_is_current:
        shutil.copy2(source, destination)
    return destination.relative_to(portrait_root).as_posix()
