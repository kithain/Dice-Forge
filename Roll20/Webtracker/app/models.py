import json
import math
import os


INACTIVE_STATUSES = {"Unconscious", "Dying", "Dead", "Incapacitated"}

STATUS_EFFECTS = [
    "Bleeding", "Blinded", "Confused", "Dead", "Deafened", "Dying",
    "Entangled", "Exhausted", "Frightened", "Grappled", "Helpless",
    "Impaled", "Incapacitated", "Major Wound", "Paralyzed", "Prone",
    "Shock", "Stunned", "Unconscious",
]

STATUS_ICON_MAP = {
    "Blinded": "Aveuglé", "Deafened": "Assourdi", "Dead": "Mort",
    "Entangled": "Entravé", "Frightened": "Effrayé",
    "Incapacitated": "Incapacité", "Paralyzed": "Immobilisé",
    "Stunned": "Secoué", "Unconscious": "Inconscient",
}

ROLE_TOKEN_COLORS = {
    "player": "#4A90E2",
    "ally": "#2ECC71",
    "monster": "#D9534F",
}


def ensure_participant_colors(participants):
    """Attribue un numero stable et unique a chaque combattant."""
    used_numbers = set()
    pending = []
    for participant in participants:
        number = getattr(participant, "token_number", None)
        if isinstance(number, int) and number > 0 and number not in used_numbers:
            used_numbers.add(number)
        else:
            pending.append(participant)

    next_number = 1
    for participant in pending:
        while next_number in used_numbers:
            next_number += 1
        participant.token_number = next_number
        used_numbers.add(next_number)


def contrasting_border(color):
    red, green, blue = (int(color[index:index + 2], 16) for index in (1, 3, 5))
    yiq = (red * 299 + green * 587 + blue * 114) / 1000
    return "#000000" if yiq >= 130 else "#FFFFFF"


def get_status_icon_name(status_name):
    return STATUS_ICON_MAP.get(status_name, status_name)


class Participant:
    """Données minimales suivies en session.

    Les caractéristiques BRP sont conservées pour lire les anciennes sauvegardes,
    mais le tracker ne résout aucun jet ni aucun dégât DICE-FORGE.
    """

    def __init__(self, name, role, is_player, strength=10, constitution=10,
                 size=10, intelligence=10, power=10, dexterity=10, charisma=10,
                 movement=10, action_rank_modifier=0, hp=None, hp_max=None,
                 armor_points=0, portrait=None, statuses=None, token_number=None,
                 **_ignored):
        self.name = str(name)
        self.role = role if role in {"player", "ally", "monster"} else "monster"
        self.is_player = self.role == "player"
        self.strength = max(1, int(strength))
        self.constitution = max(1, int(constitution))
        self.size = max(1, int(size))
        self.intelligence = max(1, int(intelligence))
        self.power = max(1, int(power))
        self.dexterity = max(1, int(dexterity))
        self.charisma = max(1, int(charisma))
        self.movement = max(0, int(movement))
        self.action_rank_modifier = int(action_rank_modifier)
        self.armor_points = max(0, int(armor_points))

        calculated_hp = math.ceil((self.constitution + self.size) / 2)
        self.hp_max = max(1, int(hp_max if hp_max is not None else calculated_hp))
        self.hp = max(0, min(int(hp if hp is not None else self.hp_max), self.hp_max))
        self.portrait = portrait or None
        self.statuses = self._normalize_statuses(statuses or [])
        try:
            self.token_number = int(token_number) if int(token_number) > 0 else None
        except (TypeError, ValueError):
            self.token_number = None
        self._sync_hp_status()

    @property
    def token_color(self):
        return ROLE_TOKEN_COLORS[self.role]

    @property
    def token_border_color(self):
        return contrasting_border(self.token_color)

    @staticmethod
    def _normalize_statuses(statuses):
        normalized = []
        for status in statuses:
            if isinstance(status, str):
                normalized.append({"name": status, "duration": None})
            elif isinstance(status, dict) and status.get("name"):
                normalized.append({
                    "name": str(status["name"]),
                    "duration": status.get("duration"),
                })
        return normalized

    def _has_status(self, name):
        return any(status.get("name") == name for status in self.statuses)

    def _sync_hp_status(self):
        """Maintient l'etat Mort en coherence avec le compteur de PV."""
        self.statuses = [
            status for status in self.statuses
            if status.get("name") not in {"Dead", "Dying"}
        ]
        if self.hp == 0:
            self.statuses.append({"name": "Dead", "duration": None})

    @property
    def can_act(self):
        return not any(self._has_status(name) for name in INACTIVE_STATUSES)

    @property
    def hp_percent(self):
        return max(0, min(100, round(self.hp / self.hp_max * 100)))

    @property
    def status(self):
        priorities = (
            ("Dead", "Mort", "status-dead"),
            ("Dying", "Mourant", "status-dying"),
            ("Unconscious", "Inconscient", "status-unconscious"),
            ("Incapacitated", "Incapable de combattre", "status-incapacitated"),
        )
        for name, text, css_class in priorities:
            if self._has_status(name):
                return {"text": text, "class": css_class}
        return {"text": "", "class": ""}

    def set_hp(self, value):
        previous = self.hp
        self.hp = max(0, min(self.hp_max, int(value)))
        self._sync_hp_status()
        return self.hp - previous

    def adjust_hp(self, delta):
        return self.set_hp(self.hp + int(delta))

    def to_dict(self):
        return {
            "system": "DICE-FORGE-BRP",
            "name": self.name,
            "role": self.role,
            "is_player": self.is_player,
            "strength": self.strength,
            "constitution": self.constitution,
            "size": self.size,
            "intelligence": self.intelligence,
            "power": self.power,
            "dexterity": self.dexterity,
            "charisma": self.charisma,
            "movement": self.movement,
            "hp": self.hp,
            "hp_max": self.hp_max,
            "hp_percent": self.hp_percent,
            "armor_points": self.armor_points,
            "portrait": self.portrait,
            "token_color": self.token_color,
            "token_border_color": self.token_border_color,
            "token_number": self.token_number,
            "statuses": self.statuses,
        }

    @classmethod
    def from_dict(cls, data):
        data = dict(data)
        data.pop("system", None)
        data.pop("status", None)

        if "dexterity" not in data:
            data["dexterity"] = data.get("initiative_roll", 10) or 10

        # Compatibilité avec les anciennes sauvegardes D&D/Savage Worlds.
        hp_max = max(1, int(data.get("hp_max", 10)))
        data.setdefault("hp_max", hp_max)
        data.setdefault("hp", hp_max)
        data.setdefault("constitution", hp_max)
        data.setdefault("size", hp_max)
        data.setdefault("armor_points", 0)
        data.setdefault("statuses", [])
        data.setdefault("is_player", data.get("role") == "player")
        return cls(**data)


from app import socketio


_AUTOSAVE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(_AUTOSAVE_DIR, exist_ok=True)
_AUTOSAVE_FILE = os.path.join(_AUTOSAVE_DIR, "combat_autosave.json")


class CombatState:
    """Ordre d'attaque, rounds, PV et états — sans résolution de règles."""

    def __init__(self):
        self.participants = []
        self.current_turn_index = 0
        self.round_number = 1
        self.current_phase = "attack"

    @property
    def phase_label(self):
        return "Attaque"

    def notify(self):
        ensure_participant_colors(self.participants)
        socketio.emit("update_data", {
            "participants": [participant.to_dict() for participant in self.participants],
            "round_number": self.round_number,
            "current_phase": self.current_phase,
        })
        self.autosave()

    def turn_order_indices(self):
        return [
            index for index, participant in enumerate(self.participants)
            if participant.can_act
        ]

    def sort(self):
        active = None
        if 0 <= self.current_turn_index < len(self.participants):
            active = self.participants[self.current_turn_index]
        self.participants.sort(
            key=lambda participant: (participant.dexterity, participant.name), reverse=True
        )
        self.current_turn_index = self.participants.index(active) if active in self.participants else 0
        if self.participants and not self.participants[self.current_turn_index].can_act:
            order = self.turn_order_indices()
            self.current_turn_index = order[0] if order else 0
        self.notify()

    def next_turn(self):
        order = self.turn_order_indices()
        if not order:
            return False
        if self.current_turn_index not in order:
            self.current_turn_index = order[0]
            self.notify()
            return True
        position = order.index(self.current_turn_index)
        if position == len(order) - 1:
            self.start_new_round()
        else:
            self.current_turn_index = order[position + 1]
            self.notify()
        return True

    def start_new_round(self):
        self.round_number += 1
        for participant in self.participants:
            remaining_statuses = []
            for status in participant.statuses:
                duration = status.get("duration")
                if duration is None:
                    remaining_statuses.append(status)
                    continue
                status["duration"] = int(duration) - 1
                if status["duration"] > 0:
                    remaining_statuses.append(status)
            participant.statuses = remaining_statuses
        order = self.turn_order_indices()
        self.current_turn_index = order[0] if order else 0
        self.current_phase = "attack"
        self.notify()

    def restart(self):
        """Recommence le combat sans retirer aucun participant."""
        for participant in self.participants:
            participant.statuses = []
            participant.set_hp(participant.hp_max)
        self.current_turn_index = 0
        self.round_number = 1
        self.current_phase = "attack"
        self.notify()

    def autosave(self):
        try:
            ensure_participant_colors(self.participants)
            with open(_AUTOSAVE_FILE, "w", encoding="utf-8") as file:
                json.dump({
                    "system": "DICE-FORGE-BRP",
                    "participants": [p.to_dict() for p in self.participants],
                    "current_turn_index": self.current_turn_index,
                    "round_number": self.round_number,
                    "current_phase": "attack",
                }, file, ensure_ascii=False, indent=2)
        except Exception as error:
            print(f"[AUTOSAVE] Erreur: {error}")

    def load_autosave(self):
        try:
            if not os.path.exists(_AUTOSAVE_FILE):
                return False
            with open(_AUTOSAVE_FILE, "r", encoding="utf-8") as file:
                data = json.load(file)
            self.participants = [Participant.from_dict(item) for item in data.get("participants", [])]
            ensure_participant_colors(self.participants)
            self.current_turn_index = int(data.get("current_turn_index", 0))
            self.round_number = max(1, int(data.get("round_number", 1)))
            self.current_phase = "attack"
            if self.current_turn_index >= len(self.participants):
                self.current_turn_index = 0
            # Enregistre immediatement les couleurs attribuees aux anciennes sauvegardes.
            self.autosave()
            return bool(self.participants)
        except Exception as error:
            print(f"[AUTOSAVE] Erreur lors du chargement: {error}")
            return False


combat = CombatState()
initiative_data = combat.participants
current_turn_index = 0


def update_state():
    combat.notify()


def sort_participants():
    combat.sort()
