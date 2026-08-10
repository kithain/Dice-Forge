from pathlib import Path
import sys
import unittest


PROJECT_ROOT = Path(__file__).parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Certains tests historiques chargent des modules isolés sous le nom ``app``.
# Le test d'intégration a besoin ici du vrai package Flask.
for module_name in [name for name in sys.modules if name == "app" or name.startswith("app.")]:
    del sys.modules[module_name]

from app import app


class CockpitRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config.update(TESTING=True)
        cls.client = app.test_client()

    def test_cockpit_and_tools_are_available(self):
        for path in ("/", "/tracker", "/battlemap", "/view", "/overlays/map"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)

    def test_dice_forge_is_served_from_the_same_origin(self):
        for path in ("/dice/index.html", "/dice/js/app.js"):
            with self.subTest(path=path):
                response = self.client.get(path)
                try:
                    self.assertEqual(response.status_code, 200)
                finally:
                    response.close()

    def test_internal_project_files_are_not_public(self):
        self.assertEqual(self.client.get("/dice/supabase-auth.sql").status_code, 404)
        self.assertEqual(self.client.get("/dice/.git/config").status_code, 404)

    def test_overlay_redirects_preserve_the_room(self):
        rolls = self.client.get("/overlays/rolls?room=8QXJ")
        dice = self.client.get("/overlays/dice?room=8QXJ")
        self.assertEqual(rolls.location, "/dice/obs.html?room=8QXJ")
        self.assertEqual(dice.location, "/dice/obs-dice.html?room=8QXJ")


if __name__ == "__main__":
    unittest.main()
