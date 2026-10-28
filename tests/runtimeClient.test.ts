import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRuntimeClient } from '../src/runtime/client';
import { createLanguageClient } from '../src/runtime/languageClient';
import {
  validatePackageName,
  filterAndValidatePackages,
  ALLOWED_PACKAGES,
  detectImports,
} from '../src/runtime/packageControl';
import {
  createSharedControl,
  signalInterrupt,
  clearInterrupt,
  writeSharedInput,
  readSharedInputWorker,
  INTERRUPT_INDEX,
  INPUT_STATUS_INDEX,
  INPUT_LENGTH_INDEX,
} from '../src/runtime/sharedControl';
import type { RuntimeCallbacks, RunOptions, TraceEvent } from '../src/runtime/types';

describe('packageControl', () => {
  it('allows curated safe packages from catalog', () => {
    expect(validatePackageName('numpy')).toBe('numpy');
    expect(validatePackageName('pandas')).toBe('pandas');
    expect(validatePackageName('matplotlib')).toBe('matplotlib');
    expect(validatePackageName('jedi')).toBe('jedi');
    expect(validatePackageName('parso')).toBe('parso');
    expect(validatePackageName('contourpy')).toBe('contourpy');
    expect(validatePackageName('fonttools')).toBe('fonttools');
  });

  it('detects imports automatically from Python source code', () => {
    const code = `
import numpy as np
from pandas import DataFrame
import matplotlib.pyplot as plt
import math, sys
from os.path import join
`;
    const detected = detectImports(code);
    expect(detected).toContain('numpy');
    expect(detected).toContain('pandas');
    expect(detected).toContain('matplotlib');
    expect(detected).not.toContain('math'); // standard library, not catalog package
    expect(detected).not.toContain('sys');
  });

  it('rejects arbitrary URLs and wheels', () => {
    expect(() => validatePackageName('https://evil.com/malicious.whl')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
    expect(() => validatePackageName('http://example.com/test.zip')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
    expect(() => validatePackageName('local_pkg.whl')).toThrow(
      /Arbitrary package URLs or files are prohibited/
    );
  });

  it('rejects path traversal and unauthorized packages', () => {
    expect(() => validatePackageName('../../../etc/passwd')).toThrow();
    expect(() => validatePackageName('unapproved_custom_hacker_package')).toThrow(
      /not in the curated allowed catalog/
    );
  });

  it('batch validates lists of packages correctly', () => {
    const valid = filterAndValidatePackages(['numpy', 'scipy']);
    expect(valid).toEqual(['numpy', 'scipy']);
  });
});

describe('sharedControl', () => {
  it('creates shared control with correct memory layout if SAB is available', () => {
    // In node/vitest, SharedArrayBuffer is available by default
    const control = createSharedControl();
    if (!control) {
      // If environment does not support SAB, check isSharedArrayBufferSupported
      return;
    }

    expect(control.sab).toBeDefined();
    expect(control.controlInt32.length).toBeGreaterThanOrEqual(3);
    expect(control.interruptBuffer[0]).toBe(0);

    // Test signalInterrupt
    signalInterrupt(control.sab);
    expect(control.controlInt32[INTERRUPT_INDEX]).toBe(2);

    // Test clearInterrupt
    clearInterrupt(control.sab);
    expect(control.controlInt32[INTERRUPT_INDEX]).toBe(0);
  });

  it('writes and reads UTF-8 input using SharedArrayBuffer and Atomics', () => {
    const control = createSharedControl();
    if (!control) return;

    const testInput = 'สวัสดีชาวโลก (Hello World)';
    const success = writeSharedInput(control.sab, testInput);
    expect(success).toBe(true);

    expect(control.controlInt32[INPUT_STATUS_INDEX]).toBe(1);
    expect(control.controlInt32[INPUT_LENGTH_INDEX]).toBeGreaterThan(0);

    const readText = readSharedInputWorker(control.sab, 10);
    expect(readText).toBe(testInput);
    expect(control.controlInt32[INPUT_STATUS_INDEX]).toBe(0);
  });
});

describe('createLanguageClient coordinate translation and protocol', () => {
  let mockWorker: any;
  let postedMessages: any[] = [];

  beforeEach(() => {
    postedMessages = [];
    const messageListeners = new Set<(ev: any) => void>();

    mockWorker = {
      onmessage: null as any,
      postMessage: vi.fn((msg) => {
        postedMessages.push(msg);
        const dispatch = (data: any) => {
          const ev = { data };
          if (mockWorker.onmessage) mockWorker.onmessage(ev);
          messageListeners.forEach((fn) => fn(ev));
        };

        if (msg.type === 'init') {
          queueMicrotask(() => {
            dispatch({ type: 'init_done' });
          });
        } else if (msg.type === 'complete') {
          queueMicrotask(() => {
            dispatch({
              id: msg.id,
              type: 'complete_res',
              completions: [{ label: 'print', kind: 'Function', insertText: 'print' }],
            });
          });
        } else if (msg.type === 'signature') {
          queueMicrotask(() => {
            dispatch({
              id: msg.id,
              type: 'signature_res',
              signature: 'print(*values)',
            });
          });
        } else if (msg.type === 'hover') {
          queueMicrotask(() => {
            dispatch({
              id: msg.id,
              type: 'hover_res',
              hover: 'Print documentation',
            });
          });
        }
      }),
      terminate: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === 'message') {
          messageListeners.add(cb);
        }
      }),
      removeEventListener: vi.fn((event, cb) => {
        if (event === 'message') {
          messageListeners.delete(cb);
        }
      }),
    };

    class MockWorker {
      postMessage = mockWorker.postMessage;
      terminate = mockWorker.terminate;
      addEventListener = mockWorker.addEventListener;
      removeEventListener = mockWorker.removeEventListener;
      constructor() {
        // assign instance
        return mockWorker;
      }
    }

    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates Monaco 1-based coordinates to Jedi 0-based column', async () => {
    const client = createLanguageClient();
    await client.init();

    // Monaco: line 2, col 5 ('math.')
    // Jedi expects: line 2, col 4
    const completionsPromise = client.complete('import math\nmath.', 2, 5);
    const completions = await completionsPromise;

    expect(completions).toHaveLength(1);
    expect(completions[0].label).toBe('print');

    const completeMsg = postedMessages.find((m) => m.type === 'complete');
    expect(completeMsg).toBeDefined();
    expect(completeMsg.line).toBe(2);
    expect(completeMsg.column).toBe(4); // 5 - 1 = 4
  });

  it('translates Monaco column 1 to Jedi column 0 for line start', async () => {
    const client = createLanguageClient();
    await client.init();

    await client.complete('pri', 1, 1);
    const completeMsg = postedMessages.find((m) => m.type === 'complete' && m.column === 0);
    expect(completeMsg).toBeDefined();
    expect(completeMsg.line).toBe(1);
    expect(completeMsg.column).toBe(0); // max(0, 1 - 1) = 0
  });

  it('handles signature help and hover requests', async () => {
    const client = createLanguageClient();
    await client.init();

    const sig = await client.signature('print(', 1, 6);
    expect(sig).toContain('print(*values)');

    const hov = await client.hover('print', 1, 3);
    expect(hov).toContain('Print documentation');
  });

  it('terminates worker cleanly on dispose', () => {
    const client = createLanguageClient();
    client.init();
    client.dispose();
    expect(mockWorker.terminate).toHaveBeenCalled();
  });
});

describe('createRuntimeClient lifecycle and callbacks', () => {
  let mockWorker: any;
  let postedMessages: any[] = [];
  let onMockMessageHook: ((msg: any, dispatch: (data: any) => void) => boolean) | null = null;

  beforeEach(() => {
    postedMessages = [];
    onMockMessageHook = null;
    const messageListeners = new Set<(ev: any) => void>();

    mockWorker = {
      onmessage: null as any,
      postMessage: vi.fn((msg) => {
        postedMessages.push(msg);
        const dispatch = (data: any) => {
          const ev = { data };
          if (mockWorker.onmessage) mockWorker.onmessage(ev);
          messageListeners.forEach((fn) => fn(ev));
        };

        if (onMockMessageHook) {
          const handled = onMockMessageHook(msg, dispatch);
          if (handled) return;
        }

        if (msg.type === 'init') {
          queueMicrotask(() => {
            dispatch({ type: 'init_done' });
          });
        } else if (msg.type === 'run') {
          queueMicrotask(() => {
            dispatch({ type: 'status', status: 'running' });
            dispatch({ type: 'output', text: 'Hello from Python\n', channel: 'stdout' });
            dispatch({
              type: 'event',
              event: {
                seq: 1,
                kind: 'line',
                line: 1,
                locals: { x: { type: 'int', value: '1' } },
              },
            });
            dispatch({ type: 'done' });
          });
        } else if (msg.type === 'install') {
          queueMicrotask(() => {
            dispatch({ type: 'install_done', packages: msg.packages });
          });
        }
      }),
      terminate: vi.fn(),
      addEventListener: vi.fn((event, cb) => {
        if (event === 'message') {
          messageListeners.add(cb);
        }
      }),
      removeEventListener: vi.fn((event, cb) => {
        if (event === 'message') {
          messageListeners.delete(cb);
        }
      }),
    };

    class MockWorker {
      postMessage = mockWorker.postMessage;
      terminate = mockWorker.terminate;
      addEventListener = mockWorker.addEventListener;
      removeEventListener = mockWorker.removeEventListener;
      constructor() {
        // assign instance
        return mockWorker;
      }
    }

    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('initializes runtime and executes code with callbacks', async () => {
    const statuses: string[] = [];
    const outputs: string[] = [];
    const events: TraceEvent[] = [];
    let doneCalled = false;

    const callbacks: RuntimeCallbacks = {
      onStatus: (s) => statuses.push(s),
      onOutput: (text, ch) => outputs.push(`[${ch}] ${text}`),
      onEvent: (ev) => events.push(ev),
      onInput: () => {},
      onDone: (err) => {
        doneCalled = true;
      },
    };

    const client = createRuntimeClient(callbacks);
    await client.init();

    expect(statuses).toContain('พร้อมสำหรับการรันโค้ด');

    await client.run({
      code: 'print("Hello from Python")',
      mode: 'normal',
    });

    expect(statuses).toContain('running');
    expect(outputs).toContain('[stdout] Hello from Python\n');
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('line');
    expect(doneCalled).toBe(true);

    client.dispose();
  });

  it('handles stop and invokes hard terminate if worker is unresponsive', async () => {
    vi.useFakeTimers();

    const statuses: string[] = [];
    const outputs: string[] = [];
    let doneError: string | undefined;

    // Simulate an infinite loop where worker does not respond with done
    onMockMessageHook = (msg, dispatch) => {
      if (msg.type === 'run') {
        dispatch({ type: 'status', status: 'running' });
        // Hangs! Does not post done.
        return true;
      }
      return false;
    };

    const client = createRuntimeClient({
      onStatus: (s) => statuses.push(s),
      onOutput: (text, ch) => outputs.push(text),
      onEvent: () => {},
      onInput: () => {},
      onDone: (err) => {
        doneError = err;
      },
    });

    await client.init();
    const runPromise = client.run({ code: 'while True: pass', mode: 'normal' });
    await vi.advanceTimersByTimeAsync(10);

    expect(statuses).toContain('running');

    client.stop();
    expect(statuses).toContain('กำลังหยุดการทำงาน...');

    // Fast-forward past the 500ms watchdog
    vi.advanceTimersByTime(550);

    await runPromise;

    expect(mockWorker.terminate).toHaveBeenCalled();
    expect(outputs.some((o) => o.includes('Hard Terminate'))).toBe(true);
    expect(doneError).toBe('Terminated');

    client.dispose();
    vi.useRealTimers();
  });

  it('provides input to running worker', async () => {
    const client = createRuntimeClient({
      onStatus: () => {},
      onOutput: () => {},
      onEvent: () => {},
      onInput: () => {},
      onDone: () => {},
    });

    await client.init();
    const runPromise = client.run({ code: 'x = input()', mode: 'normal' });

    client.provideInput('userInputText');
    await runPromise;

    client.dispose();
  });

  it('installs packages from allowed catalog', async () => {
    const client = createRuntimeClient({
      onStatus: () => {},
      onOutput: () => {},
      onEvent: () => {},
      onInput: () => {},
      onDone: () => {},
    });

    await client.init();
    await expect(client.install(['numpy', 'pandas'])).resolves.toBeUndefined();

    client.dispose();
  });
});
