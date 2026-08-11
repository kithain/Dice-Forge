import importlib.util
import os
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "markdown_importer.py"
SPEC = importlib.util.spec_from_file_location("markdown_importer", MODULE_PATH)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


PLAYER_TEMPLATE = """---
aliases: ["{name}"]
---
# {name}

| Carac | Score | Jet |
|---|---:|---:|
| FOR | 17 | 85 |
| CON | 17 | 85 |
| TAI | 15 | 75 |
| INT | 10 | 50 |
| POU | 6 | 30 |
| DEX | {dexterity} | 65 |
| APP | 5 | 25 |

- **Points de vie :** {hp}
{image}
"""


class MarkdownImporterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary_directory = tempfile.TemporaryDirectory()
        cls.vault = Path(cls.temporary_directory.name)
        cls.previous_vault = os.environ.get("DICE_FORGE_VAULT")
        os.environ["DICE_FORGE_VAULT"] = str(cls.vault)

        for folder in ("PJ", "PNJ/Communauté Naine", "Bestiaire/Skaven", "Images"):
            (cls.vault / folder).mkdir(parents=True, exist_ok=True)
        (cls.vault / "Images/thorgar.png").write_bytes(b"portrait-thorgar")
        (cls.vault / "Images/ilya.png").write_bytes(b"portrait-ilya")

        (cls.vault / "PJ/thokk_le_briseur.md").write_text(
            PLAYER_TEMPLATE.format(name="Thokk Le Briseur", dexterity=13, hp=16, image=""),
            encoding="utf-8",
        )
        (cls.vault / "PJ/ilyandra_vaelith_dite_ilya.md").write_text(
            PLAYER_TEMPLATE.format(
                name="Ilyandra Vaelith",
                dexterity=17,
                hp=8,
                image="![[Images/ilya.png]]",
            ),
            encoding="utf-8",
        )
        (cls.vault / "PNJ/Communauté Naine/pnj_communaute_naine_thorgar.md").write_text(
            """---
id: thorgar
aliases: ["Thorgar"]
categorie: allies
---
# Thorgar

**Caractéristiques :** FOR 12, CON 11, TAI 11, INT 10, POU 10, DEX 14, APP 9
**Points de vie :** 11
**Déplacement :** 10
![[Images/thorgar.png]]
""",
            encoding="utf-8",
        )
        (cls.vault / "PNJ/fiche_invalide.md").write_text(
            "# Fiche invalide\n\n**Points de vie :** 10\n",
            encoding="utf-8",
        )
        (cls.vault / "PNJ/index_non_importable.md").write_text(
            "---\ntype: pnj\nwebtracker: false\n---\n# Index PNJ\n",
            encoding="utf-8",
        )
        (cls.vault / "Bestiaire/Skaven/Vermine de choc.md").write_text(
            """# Vermine de choc

| FOR | CON | TAI | INT | POU | DEX | CHA |
|---|---|---|---|---|---|---|
| 14 | 12 | 12 | 8 | 9 | 12 | 6 |

**Points de vie :** 12
""",
            encoding="utf-8",
        )

    @classmethod
    def tearDownClass(cls):
        if cls.previous_vault is None:
            os.environ.pop("DICE_FORGE_VAULT", None)
        else:
            os.environ["DICE_FORGE_VAULT"] = cls.previous_vault
        cls.temporary_directory.cleanup()

    def test_player_table(self):
        entry = importer.parse_markdown("PJ/thokk_le_briseur.md")
        self.assertEqual(
            (entry["name"], entry["default_role"], entry["dexterity"], entry["hp_max"]),
            ("Thokk Le Briseur", "player", 13, 16),
        )

    def test_npc_inline_stats_and_linked_portrait(self):
        entry = importer.parse_markdown(
            "PNJ/Communauté Naine/pnj_communaute_naine_thorgar.md",
            self.vault / "portraits",
        )
        self.assertEqual(entry["name"], "Thorgar")
        self.assertEqual(entry["default_role"], "ally")
        self.assertTrue(entry["portrait_available"])
        self.assertTrue(entry["_image_source"].is_file())

    def test_markdown_link_has_priority_over_existing_portrait(self):
        entry = importer.parse_markdown("PNJ/Communauté Naine/pnj_communaute_naine_thorgar.md")
        entry["portrait"] = "PNJ/ancien_portrait_incorrect.jpg"
        with tempfile.TemporaryDirectory() as directory:
            imported = importer.ensure_portrait(entry, directory)
            self.assertTrue(imported.startswith("Imported/thorgar_"))
            self.assertTrue((Path(directory) / imported).is_file())

    def test_bestiary_stat_block(self):
        entry = importer.parse_markdown("Bestiaire/Skaven/Vermine de choc.md")
        self.assertEqual(
            (entry["name"], entry["default_role"], entry["strength"], entry["dexterity"], entry["hp_max"]),
            ("Vermine de choc", "monster", 14, 12, 12),
        )

    def test_player_image_can_be_imported(self):
        entry = importer.parse_markdown("PJ/ilyandra_vaelith_dite_ilya.md")
        with tempfile.TemporaryDirectory() as directory:
            portrait = importer.ensure_portrait(entry, directory)
            self.assertTrue((Path(directory) / portrait).is_file())

    def test_full_vault_categories_are_available(self):
        self.assertEqual(len(importer.list_markdown_entries(source_type="pj", limit=500)), 2)
        self.assertEqual(len(importer.list_markdown_entries(source_type="pnj", limit=500)), 1)
        self.assertEqual(len(importer.list_markdown_entries(source_type="bestiaire", limit=500)), 1)

    def test_invalid_markdown_is_reported(self):
        entries, issues = importer.scan_markdown_entries(source_type="pnj", limit=500)
        self.assertEqual(len(entries), 1)
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["source"], "PNJ/fiche_invalide.md")

    def test_disabled_markdown_is_silently_ignored(self):
        entries, issues = importer.scan_markdown_entries(source_type="pnj", limit=500)
        self.assertNotIn("Index PNJ", [entry["name"] for entry in entries])
        self.assertNotIn("PNJ/index_non_importable.md", [issue["source"] for issue in issues])
        self.assertIn("DEX introuvable", issues[0]["message"])

    def test_path_escape_is_rejected(self):
        with self.assertRaises(importer.MarkdownImportError):
            importer.parse_markdown("../Sessions/session 1.md")


if __name__ == "__main__":
    unittest.main()
