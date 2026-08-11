from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_PUBLIC_FILES = (
    "index.html",
    "login.html",
    "account.html",
    "pj.html",
    "inventory-sheet.html",
    "obs.html",
    "obs-dice.html",
    "supabase-config.js",
)
JAVASCRIPT_FOLDERS = (
    ROOT / "js",
    ROOT / "Roll20" / "Webtracker" / "app" / "static" / "js",
)


def main():
    missing = [name for name in REQUIRED_PUBLIC_FILES if not (ROOT / name).is_file()]
    if missing:
        print("Fichiers publics manquants : " + ", ".join(missing), file=sys.stderr)
        return 1

    node = shutil.which("node")
    if not node:
        print("Node.js est introuvable.", file=sys.stderr)
        return 1

    javascript_files = sorted(
        path
        for folder in JAVASCRIPT_FOLDERS
        for path in folder.rglob("*.js")
    )
    for path in javascript_files:
        subprocess.run([node, "--check", str(path)], check=True)

    print(f"Validation réussie : {len(REQUIRED_PUBLIC_FILES)} fichiers publics, {len(javascript_files)} scripts JavaScript.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
