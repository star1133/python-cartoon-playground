# Replay cache and package coverage

## Implemented source / isolated verification (not deployed)
- Explicit 'ดูแอนิเมชันเดิม' loads recorded slow-run trace paused without initializing Python. Run always executes afresh; random, time, input and files are never silently served as new results.
- Memory scene checkpoints accelerate reconstruction and backwards seek; capped96 checkpoints. Persistent browser cache opt-in false by default, consent preference localStorage; traces IndexedDB. Trace/code/output can contain private data: no upload, clear control, max10 entries/20MiB/7days. Truncated/cancelled runs not auto-saved by UI. Error traces may be saved and labelled.
- Cache identity includes exact source, requested+detected packages, runtime version, schema and mode; files/inputs are historical output, not new execution. Runtime compatibility string must be bumped when tracer/serializer contract changes. Browser storage availability/quotas can cause bounded memory fallback.
- Teaching cards based on observed traces and conservative source captions. Not all Python statements have specialized diagrams; arbitrary supported Python remains executable with generic snapshots/output.

## Curated verified package set
17 packages: numpy, pandas, scikit-learn, scipy, sympy, mpmath, networkx, matplotlib, pillow, regex, beautifulsoup4, pytz, python-dateutil, jinja2, pyyaml, tqdm, micropip. Standard-library modules are separate from this count. Import mappings include sklearn/PIL/bs4/yaml/dateutil. Dynamic imports or unusual source syntax can need manual selection; static import detection is not a full Python parser.
Official Pyodide314.0.7 lock drives versions and SHA256. Preparation command `node scripts/prepare-runtime.mjs --stage-dir <scratch-dir>` stages core runtime plus dependency closure without live assets changes. Runtime stage verified33 package wheels (roots + dependencies). No arbitrary external wheels under same-origin CSP. Matplotlib Agg works for computation/file output, not an implemented inline interactive plotting pane. Micropip availability is not arbitrary PyPI compatibility.

## Acceptance actually executed
- npm test:182 passed; tsc --noEmit passed; Python tests32 passed.
- Staged Vite build passed; existing large-bundle warning remains (main JS about5.3MB uncompressed; code-splitting still pending, no blanket speed claim).
- `node scripts/replay-package-acceptance.mjs`: isolated loopback3101 with staged build and real browser Pyodide. Actual program ran; IndexedDB persisted9 events and survived reload, explicit replay caused0 Python-worker/runtime requests, teaching card mounted,390px controls fit, clear readback count0.
- All17 selected packages imported in real browser; assertions exercised numerical/table/symbolic/graph/image/HTML/YAML/template and linear-regression operations. This is an import/selected-operation smoke, not exhaustive package API verification.
- No uncaught browser errors, git diff --check passed, graphify updated.
- Loopback fixture stopped after QA. Public source/assets deployment, external reachability and private GitHub backup not performed in this pass.

## Limits
Browser cannot provide native desktop windows, raw sockets/server listening or OS subprocess/fork. Web Worker resource limits are soft, not an OS sandbox. Local replay data has no promise of availability if browser storage is cleared. No full-channel video-analysis claim or rehosting of third-party media.
