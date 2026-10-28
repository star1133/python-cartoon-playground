#!/usr/bin/env python3
"""Static assets only. No user Python execution API."""
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'dist'
CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'"

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Robots-Tag', 'noindex, nofollow, noarchive')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        self.send_header('Cache-Control', 'public, max-age=86400' if '/assets/' in self.path or '/runtime/' in self.path else 'no-cache')
        super().end_headers()

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/healthz':
            data = b'{"ok":true,"execution":"browser-only","hostname":"localhost"}'
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        super().do_GET()

    def log_message(self, format, *args):
        # No source/input/query logging.
        if args and str(args[0]).startswith(('GET /healthz', 'HEAD /healthz')):
            return
        print('static request', args[1] if len(args) > 1 else '', flush=True)

if __name__ == '__main__':
    if not (DIST/'index.html').is_file():
        raise SystemExit('Build missing: run npm run build before serving')
    host = os.environ.get('HOSTNAME', '127.0.0.1')
    if host != '127.0.0.1':
        raise SystemExit('Only loopback binding allowed')
    port = int(os.environ.get('PORT','3100'))
    print(f'Static Python Playground: http://{host}:{port}', flush=True)
    ThreadingHTTPServer((host, port), Handler).serve_forever()
