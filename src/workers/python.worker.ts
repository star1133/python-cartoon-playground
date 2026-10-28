/**
 * python.worker.ts
 * Pyodide execution Web Worker.
 * Handles normal run and slow educational tracing via sys.settrace.
 * Manages stdout/stderr exact byte writes, live SAB input, and cooperative SIGINT interrupt.
 */

import {
  readSharedInputWorker,
  DATA_OFFSET_BYTES,
  type SharedControl,
} from '../runtime/sharedControl';
import { validatePackageName, detectImports } from '../runtime/packageControl';

// Import raw Python support module source codes for zero-drift parity
import rawPlaygroundWorld from '../../public/python/playground_world.py?raw';
import rawSerializer from '../../public/python/serializer.py?raw';
import rawTracer from '../../public/python/tracer.py?raw';

// Worker state
let pyodide: any = null;
let sharedSab: SharedArrayBuffer | null = null;
let prequeuedInputs: string[] = [];
let isRunning = false;
let currentRunMode: 'normal' | 'slow' = 'normal';
let stdinBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

const textDecoder = new TextDecoder();

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

function validateWorkspaceFileName(name: string): string {
  const clean = name.trim();
  if (!clean) {
    throw new Error('File name cannot be empty');
  }
  if (
    clean.includes('..') ||
    clean.startsWith('/') ||
    clean.startsWith('\\') ||
    clean.includes(':')
  ) {
    throw new Error(`Invalid file name or path traversal rejected: "${name}"`);
  }
  return clean;
}

// Terminal-style echo: show the typed answer after the prompt, ending the line like a real TTY
function echoInput(text: string): void {
  if (currentRunMode === 'normal') {
    self.postMessage({ type: 'output', text: text.endsWith('\n') ? text : text + '\n', channel: 'stdout' });
  }
}

function getNextInputBytes(): Uint8Array | null {
  if (sharedSab) {
    self.postMessage({ type: 'input_request' });
    const text = readSharedInputWorker(sharedSab, 100, () => !isRunning);
    if (text === null) {
      return null;
    }
    echoInput(text);
    const withNewline = text.endsWith('\n') ? text : text + '\n';
    return new TextEncoder().encode(withNewline);
  }
  if (prequeuedInputs.length > 0) {
    const next = prequeuedInputs.shift()!;
    echoInput(next);
    const withNewline = next.endsWith('\n') ? next : next + '\n';
    return new TextEncoder().encode(withNewline);
  }
  self.postMessage({
    type: 'status',
    status: 'SAB ไม่พร้อมใช้งาน และไม่มี prequeued input ในคิว',
  });
  return null;
}

async function initPyodideRuntime(sab?: SharedArrayBuffer): Promise<void> {
  if (sab) {
    sharedSab = sab;
  }

  // Load Pyodide from /runtime/
  // In ESM worker, native dynamic import /* @vite-ignore */ absolute /runtime/pyodide.mjs
  // Strictly avoid eval() to comply with CSP script-src 'self' 'wasm-unsafe-eval'
  let loadPyodideFn: any;
  try {
    const runtimeUrl = '/runtime/pyodide.mjs';
    const mod = await import(/* @vite-ignore */ runtimeUrl);
    loadPyodideFn = mod.loadPyodide;
  } catch (err: any) {
    // Fallback if imported in node test environment
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

  // Configure SharedArrayBuffer interrupt buffer if available
  if (sharedSab) {
    const interruptBuffer = new Int32Array(sharedSab, 0, 1);
    pyodide.setInterruptBuffer(interruptBuffer);
  }

  // Set up standard I/O streams using exact byte write handler (no batched invented newlines)
  pyodide.setStdout({
    write: (buffer: Uint8Array) => {
      const text = textDecoder.decode(buffer);
      // In normal mode, output is dispatched immediately
      // In slow mode, output is emitted in ordered TraceEvents by tracer.py to avoid double display
      if (currentRunMode === 'normal') {
        self.postMessage({ type: 'output', text, channel: 'stdout' });
      }
      return buffer.length;
    },
  });

  pyodide.setStderr({
    write: (buffer: Uint8Array) => {
      const text = textDecoder.decode(buffer);
      if (currentRunMode === 'normal') {
        self.postMessage({ type: 'output', text, channel: 'stderr' });
      }
      return buffer.length;
    },
  });

  // Set up synchronous stdin supporting both stdin() and read(buf) contracts
  pyodide.setStdin({
    stdin: () => {
      try {
        const chunk = getNextInputBytes();
        if (chunk === null) return null;
        return new TextDecoder().decode(chunk);
      } catch (error) {
        console.error('stdin adapter failure', error);
        throw error;
      }
    },
  });

  // Write Python runtime modules into Pyodide virtual filesystem
  const worldPy = await getModuleSource(rawPlaygroundWorld, 'playground_world.py');
  const serializerPy = await getModuleSource(rawSerializer, 'serializer.py');
  const tracerPy = await getModuleSource(rawTracer, 'tracer.py');

  pyodide.FS.writeFile('/home/pyodide/playground_world.py', worldPy);
  pyodide.FS.writeFile('/home/pyodide/serializer.py', serializerPy);
  pyodide.FS.writeFile('/home/pyodide/tracer.py', tracerPy);

  self.postMessage({ type: 'init_done' });
}

async function handleRun(data: {
  code: string;
  mode: 'normal' | 'slow';
  files?: Record<string, string>;
  packages?: string[];
  inputs?: string[];
}): Promise<void> {
  if (!pyodide) {
    throw new Error('Pyodide runtime is not initialized');
  }

  isRunning = true;
  currentRunMode = data.mode;
  prequeuedInputs = data.inputs ? [...data.inputs] : [];
  stdinBuffer = new Uint8Array(0);

  self.postMessage({ type: 'status', status: 'running' });

  // Detect and install requested or code-imported packages from same origin /runtime/ catalog
  const detected = detectImports(data.code);
  const requested = data.packages || [];
  const allPackages = Array.from(new Set([...requested, ...detected]));

  if (allPackages.length > 0) {
    for (const pkg of allPackages) {
      const valid = validatePackageName(pkg);
      self.postMessage({type:'status',status:`กำลังโหลดแพ็กเกจ ${valid}`});
      await pyodide.loadPackage(valid);
    }
  }

  if (allPackages.some(pkg => validatePackageName(pkg) === 'matplotlib')) {
    pyodide.runPython("import matplotlib\nmatplotlib.use('Agg')");
  }

  // Write virtual workspace files if provided (rejecting path traversal)
  if (data.files) {
    for (const [name, content] of Object.entries(data.files)) {
      const validName = validateWorkspaceFileName(name);
      pyodide.FS.writeFile(`/home/pyodide/${validName}`, content);
    }
  }

  // Reset world state between runs
  pyodide.runPython(`
import playground_world
playground_world.reset_world()
`);

  try {
    if (data.mode === 'normal') {
      // Normal run: execute without tracer overhead
      await pyodide.runPythonAsync(data.code, { filename: 'main.py' });

      // In normal mode, emit final real scene state if playground_world was modified
      const finalWorldPy = pyodide.runPython(`
import playground_world
playground_world.get_state()
`);
      const finalWorld = finalWorldPy?.toJs ? finalWorldPy.toJs({ dict_converter: Object.fromEntries }) : finalWorldPy;
      if (finalWorld && (finalWorld.action !== 'idle' || finalWorld.x !== 0 || finalWorld.y !== 0 || finalWorld.direction !== 0)) {
        self.postMessage({
          type: 'event',
          event: {
            seq: 1,
            kind: 'line',
            line: 1,
            world: finalWorld,
          },
        });
      }
    } else {
      // Slow run: use bounded CPython tracer
      const onTraceEvent = (pyEvent: any) => {
        try {
          let jsEvent: any;
          if (pyEvent && typeof pyEvent.toJs === 'function') {
            jsEvent = pyEvent.toJs({ dict_converter: Object.fromEntries });
          } else if (pyEvent instanceof Map) {
            const convertMap = (val: any): any => {
              if (val instanceof Map) {
                const obj: any = {};
                for (const [k, v] of val.entries()) {
                  obj[k] = convertMap(v);
                }
                return obj;
              }
              if (Array.isArray(val)) {
                return val.map(convertMap);
              }
              return val;
            };
            jsEvent = convertMap(pyEvent);
          } else {
            jsEvent = pyEvent;
          }
          self.postMessage({ type: 'event', event: jsEvent });
        } catch (err) {
          console.warn('Error converting trace event to JS:', err);
        } finally {
          if (pyEvent && typeof pyEvent.destroy === 'function') {
            pyEvent.destroy();
          }
        }
      };

      // Register JS callback in Python globals
      pyodide.globals.set('_on_trace_event_cb', onTraceEvent);

      const runScript = `
import tracer

def _cb(ev):
    _on_trace_event_cb(ev)

events = tracer.run_traced(
    code=${JSON.stringify(data.code)},
    filename="main.py",
    max_events=3000,
    on_event=_cb,
)
`;
      await pyodide.runPythonAsync(runScript);
      pyodide.globals.delete('_on_trace_event_cb');
    }

    self.postMessage({ type: 'done' });
  } catch (err: any) {
    const errorStr = String(err?.message || err);
    if (errorStr.includes('KeyboardInterrupt') || errorStr.includes('Interrupted')) {
      self.postMessage({ type: 'output', text: 'Program stopped by user\n', channel: 'stderr' });
      self.postMessage({ type: 'done', error: 'Interrupted' });
    } else {
      self.postMessage({ type: 'output', text: `${errorStr}\n`, channel: 'stderr' });
      self.postMessage({ type: 'done', error: errorStr });
    }
  } finally {
    isRunning = false;
  }
}

async function handleInstall(packages: string[]): Promise<void> {
  if (!pyodide) {
    throw new Error('Pyodide is not initialized');
  }
  for (const pkg of packages) {
    const valid = validatePackageName(pkg);
    await pyodide.loadPackage(valid);
  }
  self.postMessage({ type: 'install_done', packages });
}

self.onmessage = async (event: MessageEvent) => {
  const { type, ...payload } = event.data;
  try {
    if (type === 'init') {
      await initPyodideRuntime(payload.sab);
    } else if (type === 'run') {
      await handleRun(payload as any);
    } else if (type === 'install') {
      await handleInstall(payload.packages);
    } else if (type === 'provide_input') {
      prequeuedInputs.push(payload.text);
    }
  } catch (err: any) {
    self.postMessage({ type: 'error', error: String(err?.message || err) });
  }
};
