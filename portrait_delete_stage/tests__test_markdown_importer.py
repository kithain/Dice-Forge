import importlib.util
from pathlib import Path
import tempfile
import unittest


MODULE_PATH = Path(__file__).parents[1] / "app" / "markdown_importer.py"
SPEC = importlib.util.spec_from_file_location("markdown_importer", MODULE_PATH)
importer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(importer)


class MarkdownImporterTests(unittest.TestCase):
    def test_player_table(self):
        entry = importer.parse_markdown("PJ/thokk_le_briseur.md")
        self.assertEqual(
            (entry["name"], entry["default_role"], entry["dexterity"], entry["hp_max"]),
            ("Thokk Le Briseur", "player", 13, 16),
        )

    def test_npc_inline_stats_and_existing_portrait(self):
        portrait_root = Path(__file__).parents[1] / "app" / "static" / "portraits"
        entry = importer.parse_markdown("PNJ/Communauté Naine/pnj_thorgar.md", portrait_root)
        self.assertEqual(entry["name"], "Thorgar")
        self.assertEqual(entry["default_role"], "ally")
        self.assertEqual(entry["portrait"], "PNJ/pnj_thorgar_pretre_nain.jpg")

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
        self.assertEqual(len(importer.list_markdown_entries(source_type="pj", limit=500)), 3)
        self.assertEqual(len(importer.list_markdown_entries(source_type="pnj", limit=500)), 54)
        self.assertEqual(len(importer.list_markdown_entries(source_type="bestiaire", limit=500)), 4)

    def test_path_escape_is_rejected(self):
        with self.assertRaises(importer.MarkdownImportError):
            importer.parse_markdown("../Sessions/session 1.md")


if __name__ == "__main__":
    unittest.main()
