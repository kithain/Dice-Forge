import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest


class DummyParticipant:
    @classmethod
    def from_dict(cls, data):
        return data


sys.modules.setdefault("app", types.SimpleNamespace())
sys.modules["app.models"] = types.SimpleNamespace(Participant=DummyParticipant)
PROJECT_ROOT = Path(__file__).parents[1]
SPEC = importlib.util.spec_from_file_location("encounter_utils", PROJECT_ROOT / "app" / "utils.py")
utils = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(utils)


class EncounterDeletionTests(unittest.TestCase):
    def test_delete_existing_json_encounter(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = utils.ENCOUNTERS_DIR
            utils.ENCOUNTERS_DIR = directory
            try:
                encounter = Path(directory) / "combat.json"
                encounter.write_text("{}", encoding="utf-8")
                self.assertTrue(utils.delete_encounter("combat.json"))
                self.assertFalse(encounter.exists())
            finally:
                utils.ENCOUNTERS_DIR = previous

    def test_rejects_traversal_non_json_and_missing_files(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = utils.ENCOUNTERS_DIR
            utils.ENCOUNTERS_DIR = directory
            try:
                self.assertFalse(utils.delete_encounter("../players.json"))
                self.assertFalse(utils.delete_encounter("notes.txt"))
                self.assertFalse(utils.delete_encounter("missing.json"))
            finally:
                utils.ENCOUNTERS_DIR = previous


class EncounterNameTests(unittest.TestCase):
    def test_encounter_name_is_limited_to_60_characters(self):
        with tempfile.TemporaryDirectory() as directory:
            previous = utils.ENCOUNTERS_DIR
            utils.ENCOUNTERS_DIR = directory
            try:
                self.assertIsNotNone(utils.save_encounter("A" * 60, []))
                self.assertIsNone(utils.save_encounter("B" * 61, []))
                self.assertEqual(len(list(Path(directory).glob("*.json"))), 1)
            finally:
                utils.ENCOUNTERS_DIR = previous

    def test_encounter_name_field_exposes_the_limit(self):
        html = (PROJECT_ROOT / "app" / "templates" / "index.html").read_text(encoding="utf-8")
        self.assertIn('name="encounter_name"', html)
        self.assertIn('maxlength="60"', html)
        self.assertIn("pattern=", html)
        self.assertIn("Caractères interdits", html)

    def test_windows_forbidden_names_and_characters_are_rejected(self):
        invalid_names = [
            "combat/test", "combat\\test", "combat:test", "combat?test",
            "combat*test", 'combat\"test', "combat<test", "combat>test",
            "combat|test", "combat.", " combat", "combat ", "CON", "nul.json",
            "COM1", "LPT9", "nom\x01invalide",
        ]
        for name in invalid_names:
            with self.subTest(name=name):
                self.assertIsNotNone(utils.validate_encounter_name(name))
        self.assertIsNone(utils.validate_encounter_name("Convoi vers Nuln"))

class PortraitDisplayTests(unittest.TestCase):
    def test_portrait_is_limited_to_310_without_image_processing(self):
        html = (PROJECT_ROOT / "app" / "templates" / "portrait_view.html").read_text(encoding="utf-8")
        self.assertIn("max-width: 310px", html)
        self.assertIn("max-height: 310px", html)
        self.assertIn("width: auto", html)
        self.assertIn("height: auto", html)


class PlayerViewStatusStyleTests(unittest.TestCase):
    def test_dying_and_dead_cards_have_distinct_backgrounds(self):
        html = (PROJECT_ROOT / "app" / "templates" / "view.html").read_text(encoding="utf-8")
        self.assertIn(".participant.status-dying", html)
        self.assertIn("background:#741b1b", html)
        self.assertIn(".participant.status-dead", html)
        self.assertIn("background:#4b1717", html)

    def test_player_view_uses_the_same_number_and_role_color(self):
        html = (PROJECT_ROOT / "app" / "templates" / "view.html").read_text(encoding="utf-8")
        table = (PROJECT_ROOT / "app" / "templates" / "_view_table.html").read_text(encoding="utf-8")
        obs = (PROJECT_ROOT / "app" / "static" / "js" / "obs_app.js").read_text(encoding="utf-8")
        connector = (PROJECT_ROOT / "app" / "static" / "js" / "webtracker-connector.js").read_text(encoding="utf-8")
        battlemap = (PROJECT_ROOT / "app" / "static" / "js" / "battlemap_app.js").read_text(encoding="utf-8")
        self.assertIn("var(--token-color", html)
        self.assertIn("participant.token_color", table)
        self.assertIn("participant.token_number", table)
        self.assertIn("participant.token_border_color", table)
        self.assertNotIn('class="rank"', table)
        self.assertNotIn("strokeText(", obs)
        self.assertIn("fillText(String(token.marker", obs)
        self.assertIn("ctx.drawImage(token.portraitImg", obs)
        self.assertIn("participant.portrait || null", connector)
        self.assertIn("token.style.border = `5px solid ${color}`", battlemap)

    def test_player_cards_darkens_from_right_with_missing_hp(self):
        html = (PROJECT_ROOT / "app" / "templates" / "view.html").read_text(encoding="utf-8")
        table = (PROJECT_ROOT / "app" / "templates" / "_view_table.html").read_text(encoding="utf-8")
        self.assertIn(".participant::before", html)
        self.assertIn("right:0", html)
        self.assertIn("width:var(--hp-missing,0%)", html)
        self.assertIn("100 - participant.hp_percent", table)


if __name__ == "__main__":
    unittest.main()
