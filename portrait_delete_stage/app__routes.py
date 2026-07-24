import os

from flask import jsonify, render_template, request

from app import app
from app import models, utils
from app.models import Participant
from app.markdown_importer import (
    MarkdownImportError,
    ensure_portrait,
    list_markdown_entries,
    parse_markdown,
)
from app.portrait_utils import get_portraits_and_folders


PORTRAIT_DIR = os.path.join(app.static_folder, "portraits")
os.makedirs(PORTRAIT_DIR, exist_ok=True)


def _form_int(name, default, minimum=None):
    try:
        value = int(request.form.get(name, default))
    except (ValueError, TypeError):
        value = default
    return max(minimum, value) if minimum is not None else value


def _tracker_context():
    return {
        "participants": models.combat.participants,
        "current_turn_index": models.combat.current_turn_index,
        "round_number": models.combat.round_number,
        "current_phase": "attack",
        "phase_label": "Attaque",
    }


@app.route("/")
def index():
    return render_template(
        "index.html",
        encounters=utils.list_encounters(),
        all_statuses=models.STATUS_EFFECTS,
        **_tracker_context(),
    )


@app.route("/view")
def view():
    return render_template("view.html", **_tracker_context())


@app.route("/portrait_view")
def portrait_view():
    participant = None
    if models.combat.participants:
        participant = models.combat.participants[models.combat.current_turn_index]
    return render_template("portrait_view.html", participant=participant)


@app.route("/select_portrait")
def select_portrait():
    return render_template(
        "select_portrait.html",
        target_field=request.args.get("target", "portrait"),
    )


@app.route("/add", methods=["POST"])
def add():
    name = (request.form.get("name") or "").strip()
    if not name:
        return jsonify({"success": False, "message": "Nom requis."}), 400

    role = request.form.get("role") or request.form.get("is_player") or "monster"
    hp_max = _form_int("hp_max", 10, 1)
    participant = Participant(
        name=name,
        role=role,
        is_player=role == "player",
        dexterity=_form_int("dexterity", 10, 1),
        hp=hp_max,
        hp_max=hp_max,
        portrait=request.form.get("portrait") or None,
    )
    models.combat.participants.append(participant)
    models.sort_participants()
    return jsonify({"success": True})


@app.route("/participant/<int:p_index>/edit", methods=["POST"])
def edit_participant(p_index):
    if not 0 <= p_index < len(models.combat.participants):
        return jsonify({"success": False, "message": "Participant introuvable."}), 404

    participant = models.combat.participants[p_index]
    participant.name = (request.form.get("name") or participant.name).strip()
    role = request.form.get("role", participant.role)
    if role in {"player", "ally", "monster"}:
        participant.role = role
        participant.is_player = role == "player"
    participant.dexterity = _form_int("dexterity", participant.dexterity, 1)
    participant.hp_max = _form_int("hp_max", participant.hp_max, 1)
    participant.hp = max(0, min(_form_int("hp", participant.hp, 0), participant.hp_max))
    if "portrait" in request.form:
        participant.portrait = request.form.get("portrait") or None
    models.sort_participants()
    return jsonify({"success": True})


@app.route("/remove/<int:index>", methods=["POST"])
def remove_participant(index):
    if 0 <= index < len(models.combat.participants):
        models.combat.participants.pop(index)
        if models.combat.current_turn_index >= len(models.combat.participants):
            models.combat.current_turn_index = max(0, len(models.combat.participants) - 1)
        elif index < models.combat.current_turn_index:
            models.combat.current_turn_index -= 1
        models.update_state()
    return jsonify({"success": True})


def _change_hp(index, direction):
    if not 0 <= index < len(models.combat.participants):
        return jsonify({"success": False, "message": "Participant introuvable."}), 404
    amount = _form_int(f"amount_{index}", 1, 0)
    delta = amount if direction == "gain" else -amount
    models.combat.participants[index].adjust_hp(delta)
    models.update_state()
    return jsonify({"success": True})


@app.route("/hp/<int:index>/loss", methods=["POST"])
@app.route("/damage/<int:index>", methods=["POST"])
def lose_hp(index):
    """Retire directement des PV calculés par DICE-FORGE."""
    return _change_hp(index, "loss")


@app.route("/hp/<int:index>/gain", methods=["POST"])
@app.route("/heal/<int:index>", methods=["POST"])
def gain_hp(index):
    """Ajoute directement des PV calculés par DICE-FORGE."""
    return _change_hp(index, "gain")


@app.route("/participant/<int:p_index>/status/add", methods=["POST"])
def add_status(p_index):
    if 0 <= p_index < len(models.combat.participants):
        participant = models.combat.participants[p_index]
        name = request.form.get(f"status_{p_index}")
        existing = {status["name"] for status in participant.statuses}
        if name in models.STATUS_EFFECTS and name not in existing:
            duration = request.form.get(f"duration_{p_index}")
            try:
                duration = max(1, int(duration)) if duration else None
            except (ValueError, TypeError):
                duration = None
            participant.statuses.append({"name": name, "duration": duration})
            models.update_state()
    return jsonify({"success": True})


@app.route("/participant/<int:p_index>/status/remove", methods=["POST"])
def remove_status(p_index):
    if 0 <= p_index < len(models.combat.participants):
        name = request.form.get("remove_status")
        participant = models.combat.participants[p_index]
        participant.statuses = [s for s in participant.statuses if s["name"] != name]
        models.update_state()
    return jsonify({"success": True})


@app.route("/update_initiatives", methods=["POST"])
def update_initiatives():
    for key, value in request.form.items():
        if not key.startswith("p_"):
            continue
        try:
            index = int(key.split("_", 1)[1])
            if 0 <= index < len(models.combat.participants):
                models.combat.participants[index].dexterity = max(1, int(value))
        except (ValueError, TypeError):
            pass
    models.sort_participants()
    return jsonify({"success": True})


@app.route("/next", methods=["POST"])
def next_turn():
    if not models.combat.next_turn():
        return jsonify({"success": False, "message": "Aucun combattant actif."})
    return jsonify({"success": True})


@app.route("/next_phase", methods=["POST"])
def next_phase():
    """Compatibilité : il n'existe plus qu'une phase d'attaque."""
    return next_turn()


@app.route("/new_round", methods=["POST"])
def new_round():
    models.combat.start_new_round()
    return jsonify({"success": True})


@app.route("/sort_dexterity", methods=["POST"])
@app.route("/roll_initiative", methods=["POST"])
def roll_initiative():
    models.sort_participants()
    return jsonify({"success": True})


@app.route("/reset_combat", methods=["POST"])
def reset_combat():
    models.combat.participants[:] = [p for p in models.combat.participants if p.role == "player"]
    for participant in models.combat.participants:
        participant.hp = participant.hp_max
        participant.statuses = []
    models.combat.current_turn_index = 0
    models.combat.round_number = 1
    models.combat.current_phase = "attack"
    models.update_state()
    return jsonify({"success": True})


@app.route("/reset", methods=["POST"])
def reset():
    models.combat.participants.clear()
    models.combat.current_turn_index = 0
    models.combat.round_number = 1
    models.combat.current_phase = "attack"
    models.update_state()
    return jsonify({"success": True})


@app.route("/api/markdown_entries")
def api_markdown_entries():
    """Recherche les fiches de combat dans les dossiers PJ, PNJ et Bestiaire."""
    try:
        entries = list_markdown_entries(
            query=request.args.get("q", ""),
            source_type=request.args.get("type", ""),
            portrait_root=PORTRAIT_DIR,
            limit=200,
        )
        return jsonify({"success": True, "entries": entries})
    except (MarkdownImportError, OSError) as error:
        return jsonify({"success": False, "message": str(error), "entries": []}), 500


@app.route("/import_markdown", methods=["POST"])
def import_markdown():
    """Ajoute un ou plusieurs combattants depuis une fiche Markdown Obsidian."""
    source = request.form.get("source", "")
    try:
        entry = parse_markdown(source, PORTRAIT_DIR)
        role = request.form.get("role", entry["default_role"])
        if role not in {"player", "ally", "monster"}:
            role = entry["default_role"]
        quantity = max(1, min(_form_int("quantity", 1), 20))
        portrait = ensure_portrait(entry, PORTRAIT_DIR)
    except (MarkdownImportError, OSError, UnicodeError) as error:
        return jsonify({"success": False, "message": str(error)}), 400

    for number in range(1, quantity + 1):
        name = entry["name"] if quantity == 1 else f"{entry['name']} {number}"
        models.combat.participants.append(Participant(
            name=name,
            role=role,
            is_player=role == "player",
            strength=entry["strength"],
            constitution=entry["constitution"],
            size=entry["size"],
            intelligence=entry["intelligence"],
            power=entry["power"],
            dexterity=entry["dexterity"],
            charisma=entry["charisma"],
            movement=entry["movement"],
            hp=entry["hp_max"],
            hp_max=entry["hp_max"],
            armor_points=entry["armor_points"],
            portrait=portrait,
        ))
    models.sort_participants()
    return jsonify({
        "success": True,
        "added": quantity,
        "name": entry["name"],
    })


@app.route("/save_players", methods=["POST"])
def save_players_route():
    return jsonify({"success": utils.save_players(models.combat.participants)})


@app.route("/load_players", methods=["POST"])
def load_players_route():
    models.combat.participants, loaded = utils.load_players(models.combat.participants)
    models.sort_participants()
    return jsonify({"success": loaded})


@app.route("/save_encounter", methods=["POST"])
def save_encounter_route():
    name = (request.form.get("encounter_name") or "").strip()
    filename = utils.save_encounter(name, models.combat.participants) if name else None
    return jsonify({"success": bool(filename)})


@app.route("/load_encounter/<filename>", methods=["POST"])
def load_encounter_route(filename):
    path = os.path.join(utils.ENCOUNTERS_DIR, filename)
    models.combat.participants, loaded = utils.load_encounter(path, models.combat.participants)
    models.sort_participants()
    return jsonify({"success": loaded})


@app.route("/api/participants")
def api_participants_list():
    return jsonify([p.to_dict() for p in models.combat.participants])


@app.route("/api/portraits")
def api_portraits():
    rel_path = request.args.get("path", "")
    full_path = os.path.realpath(os.path.join(PORTRAIT_DIR, rel_path))
    if os.path.commonpath([full_path, os.path.realpath(PORTRAIT_DIR)]) != os.path.realpath(PORTRAIT_DIR):
        return jsonify({"error": "Chemin invalide"}), 400
    return jsonify(get_portraits_and_folders(PORTRAIT_DIR, rel_path))


@app.route("/api/view_content")
def api_view_content():
    return render_template("_view_table.html", **_tracker_context())


@app.route("/api/portrait_content")
def api_portrait_content():
    participant = None
    if models.combat.participants:
        participant = models.combat.participants[models.combat.current_turn_index]
    return render_template("_portrait.html", participant=participant)


@app.route("/api/main_content")
def api_main_content():
    return render_template(
        "_main_table.html", all_statuses=models.STATUS_EFFECTS, **_tracker_context()
    )
