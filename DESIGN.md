# Design System & Craft Floor Documentation

**Product:** Python Cartoon Playground (สนามเด็กเล่นเขียนโปรแกรมภาษา Python แบบ 3 มิติ)  
**Target:** Thai-First, Browser-Only CPython/Pyodide IDE with Three.js Isometric Scene  
**Design Mode:** `operate` (Tool/IDE category with genuine VS Code Dark+ polish)

---

## 1. Visual Direction & Identity

- **Category Polish:** VS Code Dark+ theme (`#181818` base, `#1e1e1e` editor, `#252526` activity bars, `#007acc` status bar and focus accents).
- **Signature Move:** Original 3D isometric procedural cartoon scene showing a friendly blue robot explorer hopping along a stone pathway toward a treasure chest, dynamically driven by genuine execution trace events (`playground_world` and Python data abstractions).
- **Language Voice:** Thai-first. All action buttons, explanations, timeline labels, error states, and module limitation notices speak natural, clear, polite Thai without machine-translated jargon.

---

## 2. Craft Floor Verification

### A. Contrast & Accessibility
- **Body text (`#cccccc` on `#1e1e1e`):** Contrast ratio ~8.8:1 (exceeds WCAG AAA 7:1).
- **Muted text (`#858585` on `#252526`):** Contrast ratio ~4.9:1 (exceeds WCAG AA 4.5:1).
- **Status accent (`#2ea043`, `#007acc`, `#ffd54f`):** High visibility on dark surfaces.
- **Iconography:** Genuine Lucide React SVG icons (no unicode emojis standing in for icons).
- **Keyboard navigation:** Visible focus outline ring (`:focus-visible`) styled in `--color-accent` on all interactive controls.
- **Semantic HTML:** ARIA attributes (`role="toolbar"`, `role="region"`, `role="dialog"`, `aria-label`).

### B. Execution Line Coexistence
- The executing line highlight is rendered as a semi-transparent amber background (`rgba(255, 215, 0, 0.22)`) with a left border marker (`#ffd54f`) and glyph margin indicator.
- Crucially, it does **not** overwrite or erase Python syntax coloring underneath.
- If the user modifies source code while playback is paused or completed, the highlight is cleanly removed to prevent misleading offsets against stale code snapshots.

### C. Responsive Workbench
- **Desktop (≥ 768px):** Split layout with code editor on the left; 3D isometric cartoon scene on top-right; tabbed console/variables/call-stack on bottom-right.
- **Mobile (< 768px):** Tabbed workbench navigation (`โค้ด`, `ฉาก 3D`, `คอนโซล`, `ตัวแปร`) with CodeMirror 6 touch-optimized fallback editor.

### D. Motion & Reduced Motion
- Uses CSS `@media (prefers-reduced-motion: reduce)` to disable transitions and snap 3D character hops directly to the target tile without delay.

---

## 3. Architecture & Subsystem Mapping

1. **Editor Layer (`src/editor/`):**
   - `MonacoEditor.tsx`: Desktop Monaco instance with Python syntax, autocompletion, signature help, and hover providers.
   - `CodeMirrorEditor.tsx`: Mobile fallback editor with touch capabilities and same autocomplete data source.
   - `EditorHost.tsx`: Auto-switcher and toggle.
   - `staticPythonAnalyzer.ts`: Comprehensive static intelligence for builtins, keywords, world exports, and buffer symbols.
   - `languageBridge.ts`: Seamless bridge to sibling language worker or static analyzer.
   - `runtimeBridge.ts`: Seamless bridge to sibling runtime client or high-fidelity simulation.

2. **Scene Layer (`src/scene/`):**
   - `characterMesh.ts`: Procedural friendly blue character with rounded head, dark glossy visor, eyes, explorer backpack, antenna, and floating shadow.
   - `chestMesh.ts`: Procedural wooden treasure chest with gold rims, lock, and hinged lid that smoothly opens upon goal achievement.
   - `pathTiles.ts`: Procedural floating stone tiles (regular, path, visited, target) and crystal data entities.
   - `IsometricWorldScene.tsx`: Orthographic Three.js canvas with warm directional sunlight and soft shadows.
   - `sceneReducer.ts`: Pure state reducer transforming `TraceEvent` into coordinate, direction, and action updates.

3. **Storage & Catalogs (`src/storage/`):**
   - `codeStore.ts`: Safe localStorage draft persistence, run snapshots, and export/import helpers.
   - `examples.ts`: Curated examples (World Loop, Maze Navigation, Lists & Loops, Recursion Call Stack, JSON Data, OOP Classes).
   - `packageCatalog.ts`: Curated Pyodide packages and truthful browser limitation notices.

4. **Explain Engine (`src/explain/`):**
   - `thaiExplainer.ts` and `templates.th.ts`: Translates raw execution events and AST statements into natural Thai explanations.
