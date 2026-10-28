/**
 * languageClient.ts
 * Client interface for static Python language intelligence.
 * Translates Monaco 1-based coordinates to Jedi 0-based columns,
 * routes requests to dedicated language Web Worker, and rejects stale requests.
 */

import type { Completion } from './types';

export interface LanguageClient {
  init(): Promise<void>;
  complete(code: string, line: number, column: number): Promise<Completion[]>;
  signature(code: string, line: number, column: number): Promise<string>;
  hover(code: string, line: number, column: number): Promise<string>;
  dispose(): void;
}

export function createLanguageClient(): LanguageClient {
  let worker: Worker | null = null;
  let requestId = 0;
  const pendingRequests = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  let initPromise: Promise<void> | null = null;

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(new URL('../workers/language.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (event: MessageEvent) => {
        const { id, type, ...payload } = event.data;

        if (type === 'init_done') {
          // Handled by init promise listener
          return;
        }

        const pending = pendingRequests.get(id);
        if (!pending) return;
        pendingRequests.delete(id);

        if (type === 'error') {
          pending.reject(new Error(payload.error || 'Language service error'));
        } else if (type === 'complete_res') {
          pending.resolve(payload.completions || []);
        } else if (type === 'signature_res') {
          pending.resolve(payload.signature || '');
        } else if (type === 'hover_res') {
          pending.resolve(payload.hover || '');
        }
      };

      worker.onerror = (err) => {
        console.error('Language worker error:', err);
        for (const [, pending] of pendingRequests) {
          pending.reject(new Error('Language worker error'));
        }
        pendingRequests.clear();
      };
    }
    return worker;
  }

  return {
    async init(): Promise<void> {
      if (initPromise) return initPromise;
      const w = ensureWorker();

      initPromise = new Promise<void>((resolve, reject) => {
        const handler = (event: MessageEvent) => {
          if (event.data.type === 'init_done') {
            w.removeEventListener('message', handler);
            resolve();
          } else if (event.data.type === 'error' && !event.data.id) {
            w.removeEventListener('message', handler);
            reject(new Error(event.data.error || 'Failed to initialize language worker'));
          }
        };
        w.addEventListener('message', handler);
        w.postMessage({ type: 'init' });
      }).catch((err) => {
        initPromise = null;
        throw err;
      });

      return initPromise;
    },

    async complete(code: string, line: number, column: number): Promise<Completion[]> {
      const w = ensureWorker();
      const id = ++requestId;
      // Monaco is 1-based line and 1-based column.
      // Jedi is 1-based line and 0-based column.
      const jediLine = line;
      const jediCol = Math.max(0, column - 1);

      return new Promise<Completion[]>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        w.postMessage({
          id,
          type: 'complete',
          code,
          line: jediLine,
          column: jediCol,
        });
      });
    },

    async signature(code: string, line: number, column: number): Promise<string> {
      const w = ensureWorker();
      const id = ++requestId;
      const jediLine = line;
      const jediCol = Math.max(0, column - 1);

      return new Promise<string>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        w.postMessage({
          id,
          type: 'signature',
          code,
          line: jediLine,
          column: jediCol,
        });
      });
    },

    async hover(code: string, line: number, column: number): Promise<string> {
      const w = ensureWorker();
      const id = ++requestId;
      const jediLine = line;
      const jediCol = Math.max(0, column - 1);

      return new Promise<string>((resolve, reject) => {
        pendingRequests.set(id, { resolve, reject });
        w.postMessage({
          id,
          type: 'hover',
          code,
          line: jediLine,
          column: jediCol,
        });
      });
    },

    dispose(): void {
      for (const [, pending] of pendingRequests) {
        pending.reject(new Error('Language client disposed'));
      }
      pendingRequests.clear();
      if (worker) {
        worker.terminate();
        worker = null;
      }
      initPromise = null;
    },
  };
}
