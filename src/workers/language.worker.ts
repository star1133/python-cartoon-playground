/**
 * language.worker.ts
 * Dedicated static Python code intelligence worker using Jedi.
 * Runs completely in-process via InterpreterEnvironment without executing user source code.
 */

import rawLanguageService from '../../public/python/language_service.py?raw';

let pyodide: any = null;
let isReady = false;
let initPromise: Promise<void> | null = null;

async function getModuleSource(rawSource: string, filename: string): Promise<string> {
  if (typeof rawSource === 'string' && rawSource.trim().length > 0) {
    return rawSource;
  }
  try {
    const res = await fetch(`/python/${filename}`);
    if (res.ok) {
      return await res.text();
    }
  } catch {
    // fallback
  }
  return rawSource || '';
}

async function initLanguageService(): Promise<void> {
  if (isReady) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // In ESM worker, native dynamic import /* @vite-ignore */ absolute /runtime/pyodide.mjs
    // Strictly avoid eval() to comply with CSP script-src 'self' 'wasm-unsafe-eval'
    let loadPyodideFn: any;
    try {
      const runtimeUrl = '/runtime/pyodide.mjs';
      const mod = await import(/* @vite-ignore */ runtimeUrl);
      loadPyodideFn = mod.loadPyodide;
    } catch (err: any) {
      if (typeof process !== 'undefined' && process.versions?.node) {
        const nodeMod = await import('pyodide');
        loadPyodideFn = nodeMod.loadPyodide;
      } else {
        throw new Error(`Failed to load Pyodide runtime from /runtime/pyodide.mjs: ${err?.message || err}`);
      }
    }

    pyodide = await loadPyodideFn({
      indexURL: '/runtime/',
    });

    // Load jedi and parso from same-origin /runtime/
    await pyodide.loadPackage(['parso', 'jedi']);

    // Write language service module into Pyodide virtual filesystem
    const langSrc = await getModuleSource(rawLanguageService, 'language_service.py');
    pyodide.FS.writeFile('/home/pyodide/language_service.py', langSrc);

    // Import language_service and verify Jedi availability truthfully
    pyodide.runPython(`
import language_service
if not language_service._JEDI_AVAILABLE:
    raise RuntimeError(f"Jedi initialization failed: {language_service._INIT_ERROR}")
`);

    isReady = true;
    self.postMessage({ type: 'init_done' });
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, ...payload } = event.data;

  try {
    if (type === 'init') {
      if (isReady) {
        self.postMessage({ type: 'init_done' });
      } else {
        await initLanguageService();
      }
    } else if (type === 'complete') {
      if (!isReady) await initLanguageService();
      const { code, line, column } = payload;
      pyodide.globals.set('_code', code);
      pyodide.globals.set('_line', line);
      pyodide.globals.set('_col', column);

      const res = pyodide.runPython(`
import pyodide
import language_service
comps = language_service.complete(_code, _line, _col)
comps
`);
      try {
        const completions = res.toJs({ dict_converter: Object.fromEntries });
        self.postMessage({ id, type: 'complete_res', completions });
      } finally {
        res?.destroy?.();
      }
    } else if (type === 'signature') {
      if (!isReady) await initLanguageService();
      const { code, line, column } = payload;
      pyodide.globals.set('_code', code);
      pyodide.globals.set('_line', line);
      pyodide.globals.set('_col', column);

      const sig = pyodide.runPython(`
import language_service
language_service.signature(_code, _line, _col)
`);
      self.postMessage({ id, type: 'signature_res', signature: sig || '' });
    } else if (type === 'hover') {
      if (!isReady) await initLanguageService();
      const { code, line, column } = payload;
      pyodide.globals.set('_code', code);
      pyodide.globals.set('_line', line);
      pyodide.globals.set('_col', column);

      const hov = pyodide.runPython(`
import language_service
language_service.hover(_code, _line, _col)
`);
      self.postMessage({ id, type: 'hover_res', hover: hov || '' });
    }
  } catch (err: any) {
    self.postMessage({ id, type: 'error', error: String(err?.message || err) });
  }
};
