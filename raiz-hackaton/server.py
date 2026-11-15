#!/usr/bin/env python3
"""Servidor del centro de equipo. Solo publica dist/ y una API acotada de tareas."""
import argparse
import json
import sqlite3
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
DB = ROOT / 'team.sqlite3'
STATUSES = ('Pendiente', 'En curso', 'Hecho')
PLAN = json.loads((ROOT / 'plan-equipo.json').read_text(encoding='utf-8'))
SEED = [(f"{task['code']} · {task['title']}", task['role']) for task in PLAN['tasks']]

def connection():
    db = sqlite3.connect(DB, timeout=10)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    with connection() as db:
        db.execute('CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY, title TEXT NOT NULL, area TEXT NOT NULL, owner TEXT NOT NULL DEFAULT "", status TEXT NOT NULL DEFAULT "Pendiente")')
        db.execute('CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT)')
        if not db.execute('SELECT 1 FROM metadata WHERE key="seeded"').fetchone():
            db.executemany('INSERT INTO tasks(title,area) VALUES (?,?)', SEED)
            db.execute('INSERT INTO metadata VALUES ("seeded", "1")')

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def respond(self, code, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/tasks':
            with connection() as db:
                tasks = [dict(row) for row in db.execute('SELECT * FROM tasks ORDER BY id')]
            return self.respond(200, tasks)
        if path == '/api/health':
            return self.respond(200, {'ok': True})
        if path not in ('/', '/index.html', '/app.js', '/style.css', '/favicon.svg'):
            return self.respond(404, {'error': 'Recurso no disponible'})
        return super().do_GET()

    def read_json(self):
        # Browser requests must come from this origin. No cross-origin writes.
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            raise ValueError('Origen no permitido')
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            raise ValueError('Se requiere JSON')
        size = int(self.headers.get('Content-Length', '0'))
        if size < 1 or size > 8192:
            raise ValueError('Tamaño no permitido')
        body = json.loads(self.rfile.read(size))
        if not isinstance(body, dict):
            raise ValueError('Objeto inválido')
        return body

    def do_POST(self):
        if urlsplit(self.path).path != '/api/tasks':
            return self.respond(404, {'error': 'Ruta no disponible'})
        try:
            body = self.read_json()
            title = str(body.get('title', '')).strip()
            area = str(body.get('area', 'Equipo')).strip()
            if not title or len(title) > 180 or len(area) > 40:
                raise ValueError('Revisa el título (1–180 caracteres) y el área (hasta 40)')
            with connection() as db:
                cur = db.execute('INSERT INTO tasks(title,area) VALUES (?,?)', (title, area or 'Equipo'))
                task = dict(db.execute('SELECT * FROM tasks WHERE id=?', (cur.lastrowid,)).fetchone())
            return self.respond(201, task)
        except (ValueError, json.JSONDecodeError) as error:
            return self.respond(400, {'error': str(error)})

    def do_PATCH(self):
        try:
            parts = urlsplit(self.path).path.split('/')
            if len(parts) != 4 or parts[1:3] != ['api', 'tasks'] or not parts[3].isdigit():
                return self.respond(404, {'error': 'Ruta no disponible'})
            body = self.read_json()
            if len(body) != 1:
                raise ValueError('Actualiza un campo por petición')
            key, value = next(iter(body.items()))
            if key not in ('owner', 'status') or not isinstance(value, str):
                raise ValueError('Campo no permitido')
            if key == 'owner' and len(value) > 80:
                raise ValueError('Nombre demasiado largo')
            if key == 'status' and value not in STATUSES:
                raise ValueError('Estado no válido')
            with connection() as db:
                cur = db.execute(f'UPDATE tasks SET {key}=? WHERE id=?', (value.strip(), int(parts[3])))
                if cur.rowcount == 0:
                    return self.respond(404, {'error': 'Tarea no encontrada'})
            return self.respond(200, {'ok': True})
        except (ValueError, json.JSONDecodeError) as error:
            return self.respond(400, {'error': str(error)})

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8787)
    parser.add_argument('--host', default='0.0.0.0')
    args = parser.parse_args()
    initialize()
    try:
        server = ThreadingHTTPServer((args.host, args.port), Handler)
    except OSError as error:
        parser.exit(1, f'No se pudo abrir el puerto {args.port}: {error}\nEjecuta este archivo desde Terminal en tu Mac.\n')
    print(f'Centro del equipo: http://localhost:{args.port}', flush=True)
    print(f'Escuchando en {args.host}:{args.port} · Ctrl+C para detener', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServidor detenido.')
    finally:
        server.server_close()
