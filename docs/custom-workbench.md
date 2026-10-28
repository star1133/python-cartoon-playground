# Custom workbench

Desktop layout uses three mounted panes: editor, scene, results. Drag a pane header onto another header to swap their positions, or use the preceding/next buttons. Presets: IDE (one primary pane with two stacked), Columns, Rows. Mouse/touch pointer splitters and keyboard arrows resize within 20–80%; Home/End set bounds, Enter/double click reset a ratio. Hide/restore and maximize preserve editor mounting and content. At least one pane remains visible. Layout reset changes no code.

Preferences are browser-local, schema-versioned, validated and guarded against unavailable storage. Saved state includes pane order, mode, sizes, hidden/maximized panes; selected results/mobile tabs are stored separately. Legacy right-pane split migrates. This is not account sync or arbitrary floating-window docking. Phones retain touch-friendly tabs rather than desktop splits. A stdin request automatically reveals results.

Verification: 209 TypeScript tests, 32 Python tests, typecheck and scratch build passed. scripts/workbench-acceptance.mjs verified real drag swapping, mouse/keyboard resize, hide/restore, maximize, reload persistence, editor node preservation and real Python Thai stdin with hidden-result rescue. scripts/mobile-acceptance.mjs verified 320×740, 390×844, 844×390 emulated touch layouts. No real iOS/Safari keyboard claim. Build retains large-bundle warning.

Artifacts were built and served only in scratch staging; this change has not been deployed.
