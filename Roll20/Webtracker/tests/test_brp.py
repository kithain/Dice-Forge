import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


socketio = types.SimpleNamespace(emit=lambda *args, **kwargs: None)
sys.modules["app"] = types.SimpleNamespace(socketio=socketio)
spec = importlib.util.spec_from_file_location(
    "simple_models", Path(__file__).parents[1] / "app" / "models.py"
)
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)


class ParticipantTests(unittest.TestCase):
    def test_role_colors_and_unique_token_numbers(self):
        self.assertEqual(models.ROLE_TOKEN_COLORS, {
            "player": "#4A90E2", "ally": "#2ECC71", "monster": "#D9534F",
        })
        participants = [models.Participant(f"Combattant {i}", "monster", False) for i in range(20)]
        models.ensure_participant_colors(participants)
        self.assertEqual({participant.token_number for participant in participants}, set(range(1, 21)))
        self.assertTrue(all(participant.token_color == "#D9534F" for participant in participants))
        data = participants[0].to_dict()
        self.assertIn("token_number", data)
        self.assertIn(data["token_border_color"], {"#000000", "#FFFFFF"})

    def test_hp_counter_only_applies_requested_change(self):
        participant = models.Participant("A", "monster", False, hp=8, hp_max=10, armor_points=5)
        participant.adjust_hp(-3)
        self.assertEqual(participant.hp, 5)
        self.assertEqual(participant.statuses, [])
        participant.adjust_hp(2)
        self.assertEqual(participant.hp, 7)

    def test_hp_counter_is_bounded(self):
        participant = models.Participant("A", "monster", False, hp=2, hp_max=10)
        participant.adjust_hp(-20)
        self.assertEqual(participant.hp, 0)
        self.assertEqual(participant.statuses, [{"name": "Dead", "duration": None}])
        self.assertFalse(participant.can_act)
        participant.adjust_hp(50)
        self.assertEqual(participant.hp, 10)
        self.assertNotIn("Dead", {status["name"] for status in participant.statuses})
        self.assertTrue(participant.can_act)

    def test_zero_hp_replaces_dying_with_dead(self):
        participant = models.Participant(
            "A", "monster", False, hp=0, hp_max=10,
            statuses=[{"name": "Dying", "duration": None}],
        )
        self.assertEqual(participant.statuses, [{"name": "Dead", "duration": None}])
        self.assertEqual(participant.status["class"], "status-dead")

    def test_old_dice_forge_save_remains_readable(self):
        participant = models.Participant.from_dict({
            "system": "DICE-FORGE-BRP", "name": "Ancien", "role": "monster",
            "is_player": False, "dexterity": 17, "hp": 8, "hp_max": 10,
            "armor_points": 2, "statuses": [], "wounds": [{"damage": 2}],
            "last_resolution": {"outcome": "normal"},
        })
        self.assertEqual(participant.dexterity, 17)
        self.assertEqual(participant.hp, 8)
        self.assertNotIn("wounds", participant.to_dict())


class CombatStateTests(unittest.TestCase):
    def setUp(self):
        self.combat = models.CombatState()
        self.combat.participants = [
            models.Participant("Rapide", "player", True, dexterity=16),
            models.Participant("Lent", "monster", False, dexterity=8),
        ]

    def test_only_attack_phase_exists(self):
        self.assertEqual(self.combat.current_phase, "attack")
        self.assertEqual(self.combat.phase_label, "Attaque")

    def test_next_turn_starts_new_round_after_last_attacker(self):
        with patch.object(self.combat, "notify"):
            self.assertTrue(self.combat.next_turn())
            self.assertEqual(self.combat.current_turn_index, 1)
            self.assertTrue(self.combat.next_turn())
        self.assertEqual(self.combat.round_number, 2)
        self.assertEqual(self.combat.current_turn_index, 0)

    def test_inactive_status_skips_attacker(self):
        self.combat.participants[1].statuses.append({"name": "Unconscious", "duration": None})
        self.assertEqual(self.combat.turn_order_indices(), [0])

    def test_round_decrements_status_duration_without_other_resolution(self):
        participant = self.combat.participants[0]
        participant.statuses.append({"name": "Bleeding", "duration": 2})
        hp_before = participant.hp
        with patch.object(self.combat, "notify"):
            self.combat.start_new_round()
        self.assertEqual(participant.hp, hp_before)
        self.assertEqual(participant.statuses[0]["duration"], 1)

    def test_restart_restores_everyone_without_removing_participants(self):
        self.combat.round_number = 6
        self.combat.current_turn_index = 1
        self.combat.participants[0].set_hp(2)
        self.combat.participants[0].statuses.append({"name": "Bleeding", "duration": 2})
        self.combat.participants[1].set_hp(0)
        with patch.object(self.combat, "notify"):
            self.combat.restart()
        self.assertEqual(len(self.combat.participants), 2)
        self.assertTrue(all(p.hp == p.hp_max for p in self.combat.participants))
        self.assertTrue(all(p.statuses == [] for p in self.combat.participants))
        self.assertEqual(self.combat.round_number, 1)
        self.assertEqual(self.combat.current_turn_index, 0)
        self.assertEqual(self.combat.current_phase, "attack")


if __name__ == "__main__":
    unittest.main()
