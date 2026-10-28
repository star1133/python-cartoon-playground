import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveReplay,
  findReplay,
  listReplays,
  deleteReplay,
  clearReplays,
  setReplayPersistenceEnabled,
  isReplayPersistenceEnabled,
  computeSourceHash,
  normalizePackages,
  buildReplayCacheKey,
  estimateReplaySize,
  ReplayValidationError,
  ReplayCache,
  MemoryReplayStorageBackend,
  IndexedDBReplayStorageBackend,
  MAX_REPLAY_COUNT,
  MAX_STORAGE_BYTES,
  REPLAY_TTL_MS,
  REPLAY_CACHE_SCHEMA_VERSION,
  DEFAULT_RUNTIME_VERSION,
  type SaveReplayInput,
} from '../../src/storage/replayCache';
import type { TraceEvent } from '../../src/runtime/types';

// Real TraceEvent test data matching playground_world.py and tracer.py
const REAL_ARITHMETIC_CODE = `x = 10
y = 20
print(x + y)`;

const REAL_ARITHMETIC_EVENTS: TraceEvent[] = [
  {
    seq: 1,
    kind: 'line',
    line: 1,
    file: 'main.py',
    name: '<module>',
    locals: { x: { type: 'int', value: '10' } },
    stack: ['<main>'],
  },
  {
    seq: 2,
    kind: 'line',
    line: 2,
    file: 'main.py',
    name: '<module>',
    locals: {
      x: { type: 'int', value: '10' },
      y: { type: 'int', value: '20' },
    },
    stack: ['<main>'],
  },
  {
    seq: 3,
    kind: 'stdout',
    line: 3,
    file: 'main.py',
    name: '<module>',
    locals: {
      x: { type: 'int', value: '10' },
      y: { type: 'int', value: '20' },
    },
    stack: ['<main>'],
    text: '30\n',
  },
  {
    seq: 4,
    kind: 'line',
    line: 3,
    file: 'main.py',
    name: '<module>',
    locals: {
      x: { type: 'int', value: '10' },
      y: { type: 'int', value: '20' },
    },
    stack: ['<main>'],
  },
];

const REAL_WORLD_CODE = `from playground_world import move_forward
move_forward()`;

const REAL_WORLD_EVENTS: TraceEvent[] = [
  {
    seq: 1,
    kind: 'line',
    line: 1,
    file: 'main.py',
    name: '<module>',
    locals: {},
    stack: ['<main>'],
    world: { x: 0, y: 0, direction: 0, action: 'idle' },
  },
  {
    seq: 2,
    kind: 'line',
    line: 2,
    file: 'main.py',
    name: '<module>',
    locals: {},
    stack: ['<main>'],
    world: { x: 0, y: 0, direction: 0, action: 'idle' },
  },
  {
    seq: 3,
    kind: 'line',
    line: 2,
    file: 'main.py',
    name: '<module>',
    locals: {},
    stack: ['<main>'],
    world: { x: 1, y: 0, direction: 0, action: 'walk' },
  },
];

const REAL_ERROR_CODE = `a = 5
b = 0
res = a / b`;

const REAL_ERROR_EVENTS: TraceEvent[] = [
  {
    seq: 1,
    kind: 'line',
    line: 1,
    file: 'main.py',
    name: '<module>',
    locals: { a: { type: 'int', value: '5' } },
    stack: ['<main>'],
  },
  {
    seq: 2,
    kind: 'line',
    line: 2,
    file: 'main.py',
    name: '<module>',
    locals: {
      a: { type: 'int', value: '5' },
      b: { type: 'int', value: '0' },
    },
    stack: ['<main>'],
  },
  {
    seq: 3,
    kind: 'exception',
    line: 3,
    file: 'main.py',
    name: '<module>',
    locals: {
      a: { type: 'int', value: '5' },
      b: { type: 'int', value: '0' },
    },
    stack: ['<main>'],
    text: 'ZeroDivisionError: division by zero',
  },
];

const REAL_PARTIAL_CODE = `count = 0
while True:
    count += 1`;

const REAL_PARTIAL_EVENTS: TraceEvent[] = [
  {
    seq: 1,
    kind: 'line',
    line: 1,
    file: 'main.py',
    name: '<module>',
    locals: { count: { type: 'int', value: '0' } },
    stack: ['<main>'],
  },
  {
    seq: 2,
    kind: 'line',
    line: 2,
    file: 'main.py',
    name: '<module>',
    locals: { count: { type: 'int', value: '0' } },
    stack: ['<main>'],
  },
  {
    seq: 3,
    kind: 'line',
    line: 3,
    file: 'main.py',
    name: '<module>',
    locals: { count: { type: 'int', value: '1' } },
    stack: ['<main>'],
  },
];

describe('ReplayCache Core API & Validation', () => {
  beforeEach(async () => {
    setReplayPersistenceEnabled(false);
    await clearReplays();
  });

  afterEach(async () => {
    await clearReplays();
  });

  it('computes exact source hash via SHA-256 and matches identical strings', async () => {
    const hash1 = await computeSourceHash('x = 42');
    const hash2 = await computeSourceHash('x = 42');
    const hash3 = await computeSourceHash('x = 43');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(64);
  });

  it('normalizes and deduplicates package names canonically', () => {
    const pkgs = [' Matplotlib ', 'numpy', 'MATPLOTLIB', '  numpy  ', 'pandas'];
    const normalized = normalizePackages(pkgs);
    expect(normalized).toEqual(['matplotlib', 'numpy', 'pandas']);
  });

  it('builds canonical cache keys with schema, runtime, hash, packages, and mode', async () => {
    const hash = await computeSourceHash('print(1)');
    const key = buildReplayCacheKey(1, 'pyodide-314.0.7', hash, ['numpy'], 'slow');
    expect(key).toContain('v1::');
    expect(key).toContain('rt:pyodide-314.0.7::');
    expect(key).toContain(`hash:${hash}::`);
    expect(key).toContain('pkgs:[numpy]::');
    expect(key).toContain('mode:slow');
  });

  it('saves and finds completed slow run with exact code, mode, and packages', async () => {
    const saved = await saveReplay({
      code: REAL_ARITHMETIC_CODE,
      mode: 'slow',
      packages: ['numpy'],
      events: REAL_ARITHMETIC_EVENTS,
      output: '30\n',
    });

    expect(saved.id).toBeDefined();
    expect(saved.status).toBe('completed');
    expect(saved.hasError).toBe(false);
    expect(saved.isPartial).toBe(false);
    expect(saved.eventCount).toBe(4);
    expect(saved.events).toHaveLength(4);

    // Exact hit
    const found = await findReplay(REAL_ARITHMETIC_CODE, ['numpy'], 'slow');
    expect(found).not.toBeNull();
    expect(found?.code).toBe(REAL_ARITHMETIC_CODE);
    expect(found?.output).toBe('30\n');
    expect(found?.events[2].text).toBe('30\n');

    // Packages order-independent lookup
    const foundReversed = await findReplay(REAL_ARITHMETIC_CODE, ['NUMPY'], 'slow');
    expect(foundReversed).not.toBeNull();

    // Mode mismatch returns null
    const wrongMode = await findReplay(REAL_ARITHMETIC_CODE, ['numpy'], 'normal');
    expect(wrongMode).toBeNull();

    // Code mismatch returns null
    const wrongCode = await findReplay(REAL_ARITHMETIC_CODE + '\n# edit', ['numpy'], 'slow');
    expect(wrongCode).toBeNull();

    // Packages mismatch returns null
    const wrongPkgs = await findReplay(REAL_ARITHMETIC_CODE, ['numpy', 'pandas'], 'slow');
    expect(wrongPkgs).toBeNull();
  });

  it('supports object argument signature for findReplay', async () => {
    await saveReplay({
      code: REAL_WORLD_CODE,
      mode: 'slow',
      events: REAL_WORLD_EVENTS,
    });

    const found = await findReplay({
      code: REAL_WORLD_CODE,
      mode: 'slow',
    });

    expect(found).not.toBeNull();
    expect(found?.events[2].world?.action).toBe('walk');
  });

  it('distinguishes error traces and preserves error details', async () => {
    const errorRun = await saveReplay({
      code: REAL_ERROR_CODE,
      mode: 'slow',
      events: REAL_ERROR_EVENTS,
      error: 'ZeroDivisionError: division by zero',
    });

    expect(errorRun.status).toBe('error');
    expect(errorRun.hasError).toBe(true);
    expect(errorRun.isPartial).toBe(false);
    expect(errorRun.error).toBe('ZeroDivisionError: division by zero');

    const found = await findReplay(REAL_ERROR_CODE, [], 'slow');
    expect(found?.status).toBe('error');
    expect(found?.hasError).toBe(true);
    expect(found?.error).toBe('ZeroDivisionError: division by zero');
  });

  it('distinguishes partial/interrupted traces', async () => {
    const partialRun = await saveReplay({
      code: REAL_PARTIAL_CODE,
      mode: 'slow',
      events: REAL_PARTIAL_EVENTS,
      isPartial: true,
    });

    expect(partialRun.status).toBe('partial');
    expect(partialRun.isPartial).toBe(true);
    expect(partialRun.hasError).toBe(false);

    const found = await findReplay(REAL_PARTIAL_CODE, [], 'slow');
    expect(found?.status).toBe('partial');
    expect(found?.isPartial).toBe(true);
  });

  it('deep-clones events on save and retrieval to prevent mutation corruption', async () => {
    const mutableEvents: TraceEvent[] = JSON.parse(JSON.stringify(REAL_ARITHMETIC_EVENTS));
    const saved = await saveReplay({
      code: REAL_ARITHMETIC_CODE,
      mode: 'slow',
      events: mutableEvents,
    });

    // Mutate original source array
    mutableEvents[0].line = 999;
    expect(saved.events[0].line).toBe(1);

    // Retrieve and mutate retrieved result
    const found = await findReplay(REAL_ARITHMETIC_CODE, [], 'slow');
    expect(found?.events[0].line).toBe(1);
    found!.events[0].line = 888;

    // Check again
    const secondFound = await findReplay(REAL_ARITHMETIC_CODE, [], 'slow');
    expect(secondFound?.events[0].line).toBe(1);
  });

  it('rejects non-monotonic event sequences', async () => {
    const nonMonotonicEvents: TraceEvent[] = [
      { seq: 1, kind: 'line', line: 1 },
      { seq: 3, kind: 'line', line: 2 },
      { seq: 2, kind: 'line', line: 3 }, // Decreasing seq!
    ];

    await expect(
      saveReplay({
        code: 'a = 1\nb = 2',
        mode: 'slow',
        events: nonMonotonicEvents,
      })
    ).rejects.toThrow(ReplayValidationError);
  });

  it('rejects duplicate or non-positive sequence numbers', async () => {
    const duplicateSeqEvents: TraceEvent[] = [
      { seq: 1, kind: 'line', line: 1 },
      { seq: 1, kind: 'line', line: 2 }, // Duplicate!
    ];

    await expect(
      saveReplay({
        code: 'a = 1',
        mode: 'slow',
        events: duplicateSeqEvents,
      })
    ).rejects.toThrow(/Non-monotonic event sequence/);

    const zeroSeqEvents: TraceEvent[] = [{ seq: 0, kind: 'line', line: 1 }];
    await expect(
      saveReplay({
        code: 'a = 1',
        mode: 'slow',
        events: zeroSeqEvents,
      })
    ).rejects.toThrow(/seq must be a positive integer/);
  });

  it('rejects corrupted locals structure', async () => {
    const corruptedLocalsEvents: any[] = [
      {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: {
          badVar: 'not an object with type and value',
        },
      },
    ];

    await expect(
      saveReplay({
        code: 'bad = 1',
        mode: 'slow',
        events: corruptedLocalsEvents,
      })
    ).rejects.toThrow(/corrupted local variable/);
  });

  it('rejects invalid execution modes and non-string codes', async () => {
    await expect(
      saveReplay({
        code: 'x = 1',
        mode: 'turbo' as any,
        events: [],
      })
    ).rejects.toThrow(/Invalid mode/);

    await expect(
      saveReplay({
        code: null as any,
        mode: 'slow',
        events: [],
      })
    ).rejects.toThrow(/code must be a string/);
  });

  it('rejects oversized single events (>256KB)', async () => {
    const hugeString = 'A'.repeat(300 * 1024);
    const oversizedEvents: TraceEvent[] = [
      {
        seq: 1,
        kind: 'line',
        line: 1,
        locals: { huge: { type: 'str', value: hugeString } },
      },
    ];

    await expect(
      saveReplay({
        code: 'huge = "..."',
        mode: 'slow',
        events: oversizedEvents,
      })
    ).rejects.toThrow(/oversized/);
  });
});

describe('ReplayCache Bounded Eviction & TTL', () => {
  let cache: ReplayCache;

  beforeEach(() => {
    cache = new ReplayCache({ persistenceEnabled: false });
  });

  it('enforces maximum 10 runs capacity with LRU eviction', async () => {
    const startTime = Date.now();

    // Save 10 items
    for (let i = 1; i <= 10; i++) {
      await cache.saveReplay(
        {
          code: `val_${i} = ${i}`,
          mode: 'slow',
          events: [{ seq: 1, kind: 'line', line: 1, locals: { val: { type: 'int', value: `${i}` } } }],
        },
        { now: startTime + i * 100 }
      );
    }

    let list = await cache.listReplays({ now: startTime + 1100 });
    expect(list).toHaveLength(10);

    // Access item #1 to refresh its LRU timestamp
    await cache.findReplay(`val_1 = 1`, [], 'slow', { now: startTime + 1200 });

    // Now save item #11 (should evict item #2, since item #1 was recently accessed)
    await cache.saveReplay(
      {
        code: `val_11 = 11`,
        mode: 'slow',
        events: [{ seq: 1, kind: 'line', line: 1, locals: { val: { type: 'int', value: '11' } } }],
      },
      { now: startTime + 1300 }
    );

    list = await cache.listReplays({ now: startTime + 1400 });
    expect(list).toHaveLength(10);

    // Item 1 is still present!
    const item1 = await cache.findReplay(`val_1 = 1`, [], 'slow', { now: startTime + 1400 });
    expect(item1).not.toBeNull();

    // Item 2 was evicted!
    const item2 = await cache.findReplay(`val_2 = 2`, [], 'slow', { now: startTime + 1400 });
    expect(item2).toBeNull();

    // Item 11 is present!
    const item11 = await cache.findReplay(`val_11 = 11`, [], 'slow', { now: startTime + 1400 });
    expect(item11).not.toBeNull();
  });

  it('evicts expired replays past 7-day TTL', async () => {
    const t0 = Date.now();

    await cache.saveReplay(
      {
        code: REAL_ARITHMETIC_CODE,
        mode: 'slow',
        events: REAL_ARITHMETIC_EVENTS,
      },
      { now: t0 }
    );

    // Within 7 days (e.g. 6 days later)
    const sixDaysLater = t0 + 6 * 24 * 60 * 60 * 1000;
    const foundValid = await cache.findReplay(REAL_ARITHMETIC_CODE, [], 'slow', {
      now: sixDaysLater,
    });
    expect(foundValid).not.toBeNull();

    // After 7 days + 1 hour
    const eightDaysLater = t0 + 8 * 24 * 60 * 60 * 1000;
    const foundExpired = await cache.findReplay(REAL_ARITHMETIC_CODE, [], 'slow', {
      now: eightDaysLater,
    });
    expect(foundExpired).toBeNull();

    // Ensure listReplays also filters expired entries
    const list = await cache.listReplays({ now: eightDaysLater });
    expect(list).toHaveLength(0);
  });

  it('rejects payloads exceeding total storage limit (20MB)', async () => {
    // Generate massive code string that pushes total size > 20MB
    const oversizedCode = 'x = 1\n'.repeat(3500000); // ~24.5 MB
    await expect(
      cache.saveReplay({
        code: oversizedCode,
        mode: 'slow',
        events: [{ seq: 1, kind: 'line', line: 1 }],
      })
    ).rejects.toThrow(/exceeds maximum/);
  });

  it('lists replays with metadataOnly option and supports delete/clear', async () => {
    await cache.saveReplay({
      code: REAL_ARITHMETIC_CODE,
      mode: 'slow',
      events: REAL_ARITHMETIC_EVENTS,
    });
    await cache.saveReplay({
      code: REAL_WORLD_CODE,
      mode: 'slow',
      events: REAL_WORLD_EVENTS,
    });

    const metadataList = await cache.listReplays({ metadataOnly: true });
    expect(metadataList).toHaveLength(2);
    expect((metadataList[0] as any).events).toBeUndefined();
    expect((metadataList[0] as any).code).toBeUndefined();
    expect(metadataList[0].id).toBeDefined();

    // Delete one item by code
    const deleted = await cache.deleteReplay(REAL_ARITHMETIC_CODE);
    expect(deleted).toBe(true);

    const remaining = await cache.listReplays();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].code).toBe(REAL_WORLD_CODE);

    // Clear all
    await cache.clearReplays();
    const emptyList = await cache.listReplays();
    expect(emptyList).toHaveLength(0);
  });
});

describe('Opt-in Persistence & IndexedDB / In-Memory Fallback', () => {
  it('defaults to persistent storage being disabled (explicit opt-in)', () => {
    const cache = new ReplayCache();
    expect(cache.isPersistenceEnabled()).toBe(false);
  });

  it('allows parent component to toggle persistence', () => {
    const cache = new ReplayCache();
    expect(cache.isPersistenceEnabled()).toBe(false);

    cache.setPersistenceEnabled(true);
    expect(cache.isPersistenceEnabled()).toBe(true);

    cache.setPersistenceEnabled(false);
    expect(cache.isPersistenceEnabled()).toBe(false);
  });

  it('operates safely with in-memory storage when IndexedDB is unavailable', async () => {
    const memBackend = new MemoryReplayStorageBackend();
    const cache = new ReplayCache({
      memoryBackend: memBackend,
      idbBackend: null,
      persistenceEnabled: true, // persistence enabled but IDB is null
    });

    const saved = await cache.saveReplay({
      code: REAL_ARITHMETIC_CODE,
      mode: 'slow',
      events: REAL_ARITHMETIC_EVENTS,
    });

    expect(saved).toBeDefined();
    const found = await cache.findReplay(REAL_ARITHMETIC_CODE, [], 'slow');
    expect(found?.code).toBe(REAL_ARITHMETIC_CODE);
  });

  it('simulates IndexedDB operations when IDB factory is present', async () => {
    // Provide a lightweight mock IndexedDB backend
    const memoryStore = new Map<string, any>();

    class MockIDBObjectStore {
      constructor(private store: Map<string, any>) {}
      get(id: string) {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = this.store.get(id);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      put(val: any) {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          this.store.set(val.id, val);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      delete(id: string) {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          this.store.delete(id);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      getAll() {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = Array.from(this.store.values());
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      clear() {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          this.store.clear();
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      count() {
        const req: any = { result: undefined, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.result = this.store.size;
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      createIndex() {}
    }

    const mockDB: any = {
      objectStoreNames: { contains: () => true },
      transaction: () => ({
        objectStore: () => new MockIDBObjectStore(memoryStore),
      }),
      close: () => {},
    };

    const mockIDBFactory: any = {
      open: () => {
        const req: any = { result: mockDB, onsuccess: null, onerror: null };
        queueMicrotask(() => {
          req.onsuccess?.({ target: req });
        });
        return req;
      },
    };

    vi.stubGlobal('indexedDB', mockIDBFactory);

    try {
      const idbBackend = new IndexedDBReplayStorageBackend('test_db', 'replays');
      const cache = new ReplayCache({
        idbBackend,
        persistenceEnabled: true,
      });

      await cache.saveReplay({
        code: REAL_WORLD_CODE,
        mode: 'slow',
        events: REAL_WORLD_EVENTS,
      });

      expect(memoryStore.size).toBe(1);

      const found = await cache.findReplay(REAL_WORLD_CODE, [], 'slow');
      expect(found).not.toBeNull();
      expect(found?.code).toBe(REAL_WORLD_CODE);
      expect(found?.events[2].world?.action).toBe('walk');

      await cache.clearReplays();
      expect(memoryStore.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exercises complete IndexedDB lifecycle including upgradeneeded and transaction abort', async () => {
    let upgradeTriggered = false;
    let indicesCreated: string[] = [];
    let storeCreated = false;
    let versionChangeTriggered = false;

    const memoryStore = new Map<string, any>();

    class MockLifecycleObjectStore {
      constructor(public name: string) {}
      createIndex(indexName: string) {
        indicesCreated.push(indexName);
      }
      put(val: any) {
        const req: any = { onsuccess: null, onerror: null };
        queueMicrotask(() => {
          memoryStore.set(val.id, val);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      get(id: string) {
        const req: any = { onsuccess: null, onerror: null, result: undefined };
        queueMicrotask(() => {
          req.result = memoryStore.get(id);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      delete(id: string) {
        const req: any = { onsuccess: null, onerror: null };
        queueMicrotask(() => {
          memoryStore.delete(id);
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      getAll() {
        const req: any = { onsuccess: null, onerror: null, result: [] };
        queueMicrotask(() => {
          req.result = Array.from(memoryStore.values());
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      clear() {
        const req: any = { onsuccess: null, onerror: null };
        queueMicrotask(() => {
          memoryStore.clear();
          req.onsuccess?.({ target: req });
        });
        return req;
      }
      count() {
        const req: any = { onsuccess: null, onerror: null, result: 0 };
        queueMicrotask(() => {
          req.result = memoryStore.size;
          req.onsuccess?.({ target: req });
        });
        return req;
      }
    }

    let currentDB: any = null;

    const mockIDBFactory: any = {
      open: (name: string, version: number) => {
        const openReq: any = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null };
        queueMicrotask(() => {
          const stores = new Set<string>();
          currentDB = {
            objectStoreNames: { contains: (s: string) => stores.has(s) },
            createObjectStore: (storeName: string) => {
              stores.add(storeName);
              storeCreated = true;
              return new MockLifecycleObjectStore(storeName);
            },
            transaction: (storeName: string, mode: string) => ({
              objectStore: () => new MockLifecycleObjectStore(storeName),
              onerror: null,
              onabort: null,
            }),
            close: vi.fn(),
            onversionchange: null,
          };
          openReq.result = currentDB;

          // Trigger onupgradeneeded on first open
          upgradeTriggered = true;
          openReq.onupgradeneeded?.({ target: openReq });
          openReq.onsuccess?.({ target: openReq });
        });
        return openReq;
      },
    };

    vi.stubGlobal('indexedDB', mockIDBFactory);

    try {
      const backend = new IndexedDBReplayStorageBackend('lifecycle_db', 'replays');

      // Verify saving invokes upgradeneeded, creates store & indexes
      await backend.setItem({
        id: 'rec_1',
        schemaVersion: 1,
        runtimeVersion: 'pyodide-314.0.7',
        sourceHash: 'abc',
        codeLength: 10,
        mode: 'slow',
        packages: [],
        normalizedPackages: '',
        eventCount: 1,
        status: 'completed',
        hasError: false,
        isPartial: false,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        estimatedSizeBytes: 100,
        code: 'x = 1',
        events: [{ seq: 1, kind: 'line', line: 1 }],
      });

      expect(upgradeTriggered).toBe(true);
      expect(storeCreated).toBe(true);
      expect(indicesCreated).toContain('lastAccessedAt');
      expect(indicesCreated).toContain('sourceHash');

      // Verify retrieval
      const rec = await backend.getItem('rec_1');
      expect(rec).not.toBeNull();
      expect(rec?.code).toBe('x = 1');

      // Trigger versionchange event on open DB
      if (currentDB.onversionchange) {
        currentDB.onversionchange();
        expect(currentDB.close).toHaveBeenCalled();
      }

      // Close backend
      backend.close();
      expect(currentDB.close).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('falls back safely to in-memory store if IndexedDB throws during write', async () => {
    const memoryFallback = new MemoryReplayStorageBackend();

    // Mock an IDB backend that fails with QuotaExceededError
    const failingIDBBackend: any = {
      isPersistent: true,
      getAll: async () => [],
      getItem: async () => null,
      setItem: async () => {
        throw new Error('QuotaExceededError: storage limit reached');
      },
      removeItem: async () => true,
      clear: async () => {},
      count: async () => 0,
    };

    const cache = new ReplayCache({
      memoryBackend: memoryFallback,
      idbBackend: failingIDBBackend,
      persistenceEnabled: true,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Save should fall back to memory backend without crashing
    const saved = await cache.saveReplay({
      code: REAL_ARITHMETIC_CODE,
      mode: 'slow',
      events: REAL_ARITHMETIC_EVENTS,
    });

    expect(saved).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Persistent storage failed'),
      expect.anything()
    );

    // Finding replay should successfully retrieve from in-memory fallback
    const found = await cache.findReplay(REAL_ARITHMETIC_CODE, [], 'slow');
    expect(found).not.toBeNull();
    expect(found?.code).toBe(REAL_ARITHMETIC_CODE);

    warnSpy.mockRestore();
  });
});
