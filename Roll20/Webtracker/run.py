import importlib.metadata
from pathlib import Path
import re
import subprocess
import sys
import traceback


REQUIREMENTS_FILE = Path(__file__).with_name("requirements.txt")


def _extract_requirement_name(line):
    line = line.split("#", 1)[0].strip()
    if not line or line.startswith(("-", "git+", "http://", "https://")):
        return None

    match = re.match(r"([A-Za-z0-9_.-]+)", line)
    if not match:
        return None

    return match.group(1)


def _pause_before_exit():
    if sys.stdin and sys.stdin.isatty():
        try:
            input("\nAppuyez sur Entree pour fermer...")
        except EOFError:
            pass


def _get_missing_requirements():
    if not REQUIREMENTS_FILE.exists():
        print(f"[STARTUP] Fichier introuvable : {REQUIREMENTS_FILE}")
        print("[STARTUP] Impossible de verifier les dependances.")
        _pause_before_exit()
        sys.exit(1)

    missing = []
    for line in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines():
        package_name = _extract_requirement_name(line)
        if not package_name:
            continue

        try:
            importlib.metadata.version(package_name)
        except importlib.metadata.PackageNotFoundError:
            missing.append(package_name)

    return missing


def check_requirements():
    missing = _get_missing_requirements()
    if not missing:
        return

    print("[STARTUP] Dependances manquantes :")
    for package_name in missing:
        print(f"  - {package_name}")
    print("")
    print("[STARTUP] Installation des dependances...")

    try:
        subprocess.check_call([
            sys.executable,
            "-m",
            "pip",
            "install",
            "-r",
            str(REQUIREMENTS_FILE),
        ])
    except subprocess.CalledProcessError as error:
        print("")
        print("[STARTUP] L'installation des dependances a echoue.")
        print(f"[STARTUP] Code erreur : {error.returncode}")
        print("[STARTUP] Vous pouvez essayer manuellement :")
        print(f"  {sys.executable} -m pip install -r {REQUIREMENTS_FILE}")
        _pause_before_exit()
        sys.exit(error.returncode)

    missing = _get_missing_requirements()
    if missing:
        print("[STARTUP] Dependances manquantes :")
        for package_name in missing:
            print(f"  - {package_name}")
        print("")
        print("[STARTUP] Essayez manuellement :")
        print(f"  {sys.executable} -m pip install -r {REQUIREMENTS_FILE}")
        _pause_before_exit()
        sys.exit(1)


check_requirements()

try:
    from app import app, socketio
    from app.models import combat
    from app import battlemap
    import webbrowser
    from threading import Timer
except Exception:
    print("[STARTUP] Erreur pendant l'initialisation de l'application :")
    traceback.print_exc()
    _pause_before_exit()
    sys.exit(1)

def open_browser():
    """
    Ouvre un nouvel onglet dans le navigateur par défaut à l'adresse de l'application.
    """
    webbrowser.open_new('http://127.0.0.1:5000')

def main():
    """
    Point d'entrée de l'application.
    Ce bloc est exécuté lorsque le script est lancé directement (par ex. 'python run.py').
    """
    # Tente de restaurer l'état du combat depuis la dernière autosave (si crash ou redémarrage).
    if combat.load_autosave():
        print("[STARTUP] État du combat restauré depuis l'autosave.")

    # Restaure l'état de la Battle Map (carte + tokens) depuis la dernière sauvegarde.
    battlemap.load_state()
    
    # Démarre un minuteur qui déclenchera l'ouverture du navigateur après 1 seconde.
    # Cela laisse le temps au serveur de démarrer avant d'essayer d'ouvrir la page.
    Timer(1, open_browser).start()
    
    # Lance le serveur de développement Flask avec le support de SocketIO.
    # 'debug=True' active le mode de débogage pour avoir des messages d'erreur détaillés.
    # 'use_reloader=False' évite de démarrer deux processus et deux minuteurs.
    # 'host="0.0.0.0"' rend l'application accessible depuis d'autres appareils sur le même réseau.
    # Le serveur Werkzeug convient à ce tracker local ; Socket.IO utilise le mode threading.
    socketio.run(
        app,
        debug=True,
        use_reloader=False,
        host="0.0.0.0",
        allow_unsafe_werkzeug=True,
    )


if __name__ == '__main__':
    try:
        main()
    except Exception:
        print("[STARTUP] Erreur pendant le lancement de l'application :")
        traceback.print_exc()
        _pause_before_exit()
        sys.exit(1)
