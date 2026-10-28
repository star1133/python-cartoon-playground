# Python Cartoon Playground

Thai-first browser Python IDE. Runs entirely in the browser: user Python executes in a Pyodide worker, never on the server.

## Architecture

- React + Monaco desktop / CodeMirror touch editor.
- Pyodide 314.0.7 in a module Web Worker: user Python executes on the visitor's device, not the web server.
- Independent Jedi worker for static code completions and help.
- Slow mode is bounded trace playback; Pause controls the visualization, not a live Python debugger.
- Original Three.js isometric character/world, variable inspector and call stack.
- Local code storage/import/export; no user source/input/trace uploads by default.
- Python static server only delivers compiled app/runtime/packages. CSP restricts connections to this origin; no server execution endpoint.

## Build and test

```bash
npm ci
node scripts/prepare-runtime.mjs
npm test
uv run --with pytest --with jedi python -m pytest tests/python -q
npm run build
HOSTNAME=127.0.0.1 PORT=3100 python3 scripts/serve.py
node scripts/browser-qa.mjs
```

Runtime wheels are generated/downloaded by the pinned preparation script and ignored in Git. Do not commit runtime logs, secrets, user projects or trace output. Dependency lockfile is committed.

## Browser limitations

Most Python core and standard library work subject to Pyodide compatibility. Desktop GUI/OS subprocess/raw sockets/multiprocessing are not desktop-equivalent. Packages require matching WASM builds or compatible pure Python dependencies; not every PyPI package works. Files live in a virtual workspace, not unrestricted device storage. Interrupt/live stdin require cross-origin isolation and SharedArrayBuffer; hard worker termination remains available. Browser worker isolation does not protect secrets placed on the same origin; do not add credentials to this dedicated playground.


## License

MIT — see [LICENSE](LICENSE).
