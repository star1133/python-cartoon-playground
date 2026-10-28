/**
 * client.ts
 * Main RuntimeClient implementation coordinating the Pyodide Web Worker.
 * Manages run modes (normal/slow), bounded trace streaming, live SAB input with fallbacks,
 * cooperative SIGINT interrupt, and hard-terminate watchdog.
 */

import type {
  RuntimeClient,
  RuntimeCallbacks,
  RunOptions,
  TraceEvent,
} from './types';
import {
  createSharedControl,
  signalInterrupt,
  clearInterrupt,
  writeSharedInput,
  type SharedControl,
} from './sharedControl';
import { filterAndValidatePackages } from './packageControl';

export function createRuntimeClient(callbacks: RuntimeCallbacks): RuntimeClient {
  let worker: Worker | null = null;
  let sharedControl: SharedControl | null = null;
  let isRunning = false;
  let currentRunResolve: (() => void) | null = null;
  let currentRunReject: ((err: any) => void) | null = null;
  let installResolve: (() => void) | null = null;
  let installReject: ((err: any) => void) | null = null;
  let initPromise: Promise<void> | null = null;
  let stopWatchdogTimer: any = null;
  let executionTimer: ReturnType<typeof setTimeout> | null = null;
  let outputChars = 0;
  const MAX_OUTPUT_CHARS = 100_000;

  function clearExecutionTimer() {
    if (executionTimer) clearTimeout(executionTimer);
    executionTimer = null;
  }

  function hardStop(reason: string) {
    clearExecutionTimer();
    cleanupWatchdog();
    worker?.terminate();
    worker = null;
    initPromise = null;
    isRunning = false;
    callbacks.onDone(reason);
    currentRunResolve?.();
    currentRunResolve = null;
    currentRunReject = null;
  }

  function cleanupWatchdog() {
    if (stopWatchdogTimer) {
      clearTimeout(stopWatchdogTimer);
      stopWatchdogTimer = null;
    }
  }

  function setupWorker(): Worker {
    if (worker) return worker;

    worker = new Worker(new URL('../workers/python.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent) => {
      const { type, ...payload } = event.data;

      if (type === 'status') {
        callbacks.onStatus(payload.status);
      } else if (type === 'output') {
        outputChars += String(payload.text).length;
        if (outputChars > MAX_OUTPUT_CHARS) { hardStop('Output limit exceeded (100,000 characters)'); return; }
        callbacks.onOutput(payload.text, payload.channel);
      } else if (type === 'event') {
        const evt = payload.event as TraceEvent;
        if (!evt || !Number.isFinite(evt.seq) || typeof evt.kind !== 'string') return;
        if (evt.kind === 'stdout' || evt.kind === 'stderr') outputChars += (evt.text || '').length;
        if (outputChars > MAX_OUTPUT_CHARS) { hardStop('Output limit exceeded (100,000 characters)'); return; }
        callbacks.onEvent(evt);
      } else if (type === 'input_request') {
        clearExecutionTimer();
        callbacks.onInput();
      } else if (type === 'done') {
        clearExecutionTimer();
        cleanupWatchdog();
        isRunning = false;
        if (sharedControl) {
          clearInterrupt(sharedControl.sab);
        }
        callbacks.onDone(payload.error);
        if (currentRunResolve) {
          const res = currentRunResolve;
          currentRunResolve = null;
          currentRunReject = null;
          res();
        }
      } else if (type === 'install_done') {
        if (installResolve) {
          const res = installResolve;
          installResolve = null;
          installReject = null;
          res();
        }
      } else if (type === 'error') {
        clearExecutionTimer();
        if (installReject) {
          installReject(new Error(payload.error));
          installResolve = null;
          installReject = null;
        }
        cleanupWatchdog();
        isRunning = false;
        callbacks.onDone(payload.error);
        if (currentRunReject) {
          const rej = currentRunReject;
          currentRunResolve = null;
          currentRunReject = null;
          rej(new Error(payload.error));
        }
      }
    };

    worker.onerror = (err) => {
      cleanupWatchdog();
      isRunning = false;
      const errorMsg = 'Worker execution error: ' + String(err);
      callbacks.onOutput(errorMsg + '\n', 'stderr');
      callbacks.onDone(errorMsg);
      if (currentRunReject) {
        const rej = currentRunReject;
        currentRunResolve = null;
        currentRunReject = null;
        rej(new Error(errorMsg));
      }
    };

    return worker;
  }

  return {
    async init(): Promise<void> {
      if (initPromise) return initPromise;
      const w = setupWorker();

      // Allocate SharedArrayBuffer if supported
      sharedControl = createSharedControl();

      initPromise = new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          if (event.data.type === 'init_done') {
            w.removeEventListener('message', handler);
            callbacks.onStatus('พร้อมสำหรับการรันโค้ด');
            resolve();
          } else if (event.data.type === 'error' && !isRunning) {
            w.removeEventListener('message', handler);
            reject(new Error(event.data.error || 'Failed to initialize Python runtime'));
          }
        };
        w.addEventListener('message', handler);
        w.postMessage({
          type: 'init',
          sab: sharedControl?.sab,
        });
      });

      const pendingInit = initPromise;
      try {
        await pendingInit;
      } catch (error) {
        initPromise = null;
        worker?.terminate();
        worker = null;
        throw error;
      }
    },

    async run(options: RunOptions): Promise<void> {
      if (isRunning) {
        throw new Error('A program is already running. Please stop it first.');
      }

      if (options.code.length > 100_000) throw new Error('Source limit exceeded (100,000 characters)');
      callbacks.onStatus('initializing');
      await this.init();
      const w = setupWorker();
      outputChars = 0;
      executionTimer = setTimeout(() => hardStop('Execution time limit exceeded (30 seconds)'), 30_000);

      // Validate packages if requested
      if (options.packages && options.packages.length > 0) {
        filterAndValidatePackages(options.packages);
      }

      isRunning = true;
      if (sharedControl) {
        clearInterrupt(sharedControl.sab);
      }

      return new Promise<void>((resolve, reject) => {
        currentRunResolve = resolve;
        currentRunReject = reject;

        w.postMessage({
          type: 'run',
          code: options.code,
          mode: options.mode,
          files: options.files,
          packages: options.packages,
          inputs: options.inputs,
        });
      });
    },

    stop(): void {
      if (!isRunning) return;

      callbacks.onStatus('กำลังหยุดการทำงาน...');

      // 1. Cooperative SIGINT via SharedArrayBuffer
      if (sharedControl) {
        signalInterrupt(sharedControl.sab);
      }

      // 2. Hard-terminate watchdog fallback (500ms)
      cleanupWatchdog();
      stopWatchdogTimer = setTimeout(() => {
        if (isRunning) {
          console.warn('Worker unresponsive to SIGINT interrupt. Executing hard terminate.');
          if (worker) {
            worker.terminate();
            worker = null;
          }
          isRunning = false;
          callbacks.onOutput('การทำงานถูกบังคับหยุดโดยระบบ (Hard Terminate)\n', 'stderr');
          callbacks.onDone('Terminated');
          if (currentRunResolve) {
            const res = currentRunResolve;
            currentRunResolve = null;
            currentRunReject = null;
            res();
          }
          // Recreate fresh worker on next run
          initPromise = null;
        }
      }, 500);
    },

    provideInput(text: string): void {
      if (!isRunning) return;
      clearExecutionTimer();
      executionTimer = setTimeout(() => hardStop('Execution time limit exceeded (30 seconds)'), 30_000);

      if (sharedControl) {
        writeSharedInput(sharedControl.sab, text);
      } else {
        // Fallback: send input over postMessage
        if (worker) {
          worker.postMessage({ type: 'provide_input', text });
        }
      }
    },

    async install(packages: string[]): Promise<void> {
      const valid = filterAndValidatePackages(packages);
      await this.init();
      const w = setupWorker();

      return new Promise<void>((resolve, reject) => {
        installResolve = resolve;
        installReject = reject;
        w.postMessage({ type: 'install', packages: valid });
      });
    },

    dispose(): void {
      clearExecutionTimer();
      cleanupWatchdog();
      installReject?.(new Error('Runtime client disposed'));
      isRunning = false;
      if (currentRunReject) {
        currentRunReject(new Error('Runtime client disposed'));
      }
      currentRunResolve = null;
      currentRunReject = null;
      installResolve = null;
      installReject = null;
      if (worker) {
        worker.terminate();
        worker = null;
      }
      initPromise = null;
      sharedControl = null;
    },
  };
}

export * from './types';
export * from './languageClient';
export * from './packageControl';
export * from './sharedControl';
