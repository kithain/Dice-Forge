"""Serveur de prévisualisation avec synchronisation OBS : python scripts/serve_local.py."""
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import sys
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'Roll20' / 'Webtracker'))
from verbal_overlay_state import publish, snapshot


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def respond(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != '/api/verbal-overlay':
            return super().do_GET()
        try:
            self.respond(snapshot(parse_qs(url.query).get('room', ['LOCAL'])[0]))
        except ValueError as error:
            self.respond({'error': str(error)}, 400)

    def do_POST(self):
        url = urlsplit(self.path)
        if url.path != '/api/verbal-overlay':
            return self.respond({'error': 'Route inconnue'}, 404)
        # Un formulaire ou un site tiers ne peut pas publier un état OBS.
        if self.headers.get('X-DiceForge-Overlay') != '1':
            return self.respond({'error': 'Requête invalide'}, 403)
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= 8192:
                raise ValueError('Taille invalide')
            data = json.loads(self.rfile.read(size))
            self.respond(publish(parse_qs(url.query).get('room', ['LOCAL'])[0], data))
        except (ValueError, UnicodeDecodeError) as error:
            self.respond({'error': str(error)}, 400)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'Dice Forge et OBS : http://127.0.0.1:{port}/', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
