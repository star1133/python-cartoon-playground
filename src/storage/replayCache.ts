import type { TraceEvent, Value } from '../runtime/types';

export type ReplayMode = 'normal' | 'slow';
export type ReplayStatus = 'completed' | 'error' | 'partial';

export interface SaveReplayInput {
  code: string;
  mode: ReplayMode;
  packages?: string[];
  events: TraceEvent[];
  error?: string;
  output?: string;
  isPartial?: boolean;
}

export interface CachedReplayMetadata {
  id: string;
  schemaVersion: number;
  runtimeVersion: string;
  sourceHash: string;
  codeLength: number;
  mode: ReplayMode;
  packages: string[];
  normalizedPackages: string;
  eventCount: number;
  status: ReplayStatus;
  hasError: boolean;
  isPartial: boolean;
  error?: string;
  createdAt: number;
  lastAccessedAt: number;
  estimatedSizeBytes: number;
}

export interface CachedReplay extends CachedReplayMetadata {
  code: string;
  events: TraceEvent[];
  output?: string;
}

export interface SaveReplayOptions {
  runtimeVersion?: string;
  persist?: boolean;
  forceEviction?: boolean;
  now?: number;
}

export interface FindReplayOptions {
  runtimeVersion?: string;
  updateAccessTime?: boolean;
  searchPersistent?: boolean;
  now?: number;
}

export interface ListReplaysOptions {
  includeExpired?: boolean;
  metadataOnly?: boolean;
  now?: number;
}

export class ReplayValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayValidationError';
  }
}

export class ReplayStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayStorageError';
  }
}

export const REPLAY_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_RUNTIME_VERSION = 'pyodide-314.0.7';
export const MAX_REPLAY_COUNT = 10;
export const MAX_STORAGE_BYTES = 20 * 1024 * 1024; // 20 MB
export const REPLAY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in ms
export const MAX_EVENTS_PER_REPLAY = 3000;
export const MAX_SINGLE_EVENT_BYTES = 256 * 1024; // 256 KB
export const DB_NAME = 'python_playground_replay_db';
export const STORE_NAME = 'replays';
export const DB_VERSION = 1;

/**
 * Deep clone utility to isolate cache entries from external mutations
 */
export function deepClone<T>(obj: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(obj);
    } catch {
      // Fall through to JSON serialization fallback
    }
  }
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Compute cryptographic SHA-256 hash of the exact source code via crypto.subtle,
 * with deterministic fallback for restricted or legacy test environments.
 */
export async function computeSourceHash(code: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto?.subtle && typeof crypto.subtle.digest === 'function') {
    const encoder = new TextEncoder();
    const data = encoder.encode(code);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Deterministic fallback (64 hex characters)
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c64e6d ^ 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2).repeat(4);
}

/**
 * Normalize and deduplicate package names to ensure canonical cache keys.
 */
export function normalizePackages(packages?: string[]): string[] {
  if (!packages || !Array.isArray(packages)) return [];
  const cleaned = packages
    .map((p) => (typeof p === 'string' ? p.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).sort();
}

/**
 * Construct composite cache key including schema version, runtime version,
 * exact source hash, normalized packages, and execution mode.
 */
export function buildReplayCacheKey(
  schemaVersion: number,
  runtimeVersion: string,
  sourceHash: string,
  packages: string[],
  mode: ReplayMode
): string {
  const normPkgs = normalizePackages(packages).join(',');
  return `v${schemaVersion}::rt:${runtimeVersion}::hash:${sourceHash}::pkgs:[${normPkgs}]::mode:${mode}`;
}

/**
 * Estimate size of cache entry in UTF-8 bytes.
 */
export function estimateReplaySize(replay: Partial<CachedReplay>): number {
  try {
    const json = JSON.stringify(replay);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).length;
    }
    return json.length * 2;
  } catch {
    return 0;
  }
}

/**
 * Validate replay run inputs, strict monotonic seq, non-oversized payloads,
 * and well-formed TraceEvent structures.
 */
export function validateReplayRun(run: SaveReplayInput): void {
  if (!run || typeof run !== 'object') {
    throw new ReplayValidationError('Invalid run input: must be an object');
  }

  if (typeof run.code !== 'string') {
    throw new ReplayValidationError('Invalid run code: code must be a string');
  }

  if (run.mode !== 'normal' && run.mode !== 'slow') {
    throw new ReplayValidationError(`Invalid mode "${String(run.mode)}": mode must be "normal" or "slow"`);
  }

  if (run.packages !== undefined) {
    if (!Array.isArray(run.packages)) {
      throw new ReplayValidationError('Invalid packages: packages must be an array of strings');
    }
    for (const pkg of run.packages) {
      if (typeof pkg !== 'string') {
        throw new ReplayValidationError('Invalid package name: each package must be a string');
      }
    }
  }

  if (!Array.isArray(run.events)) {
    throw new ReplayValidationError('Invalid events: events must be an array');
  }

  if (run.events.length > MAX_EVENTS_PER_REPLAY) {
    throw new ReplayValidationError(
      `Event count ${run.events.length} exceeds maximum allowed limit (${MAX_EVENTS_PER_REPLAY})`
    );
  }

  let prevSeq = 0;
  for (let i = 0; i < run.events.length; i++) {
    const ev = run.events[i];
    if (!ev || typeof ev !== 'object') {
      throw new ReplayValidationError(`Event at index ${i} is corrupted or not an object`);
    }

    if (typeof ev.seq !== 'number' || !Number.isInteger(ev.seq) || ev.seq <= 0) {
      throw new ReplayValidationError(
        `Event at index ${i} has invalid seq "${String(ev.seq)}": seq must be a positive integer`
      );
    }

    if (i > 0 && ev.seq <= prevSeq) {
      throw new ReplayValidationError(
        `Non-monotonic event sequence: event at index ${i} (seq ${ev.seq}) is not strictly greater than previous event (seq ${prevSeq})`
      );
    }
    prevSeq = ev.seq;

    if (typeof ev.kind !== 'string' || ev.kind.trim().length === 0) {
      throw new ReplayValidationError(`Event seq ${ev.seq} has missing or invalid kind`);
    }

    if (typeof ev.line !== 'number' || !Number.isFinite(ev.line) || ev.line < 0) {
      throw new ReplayValidationError(`Event seq ${ev.seq} has invalid line number`);
    }

    if (ev.locals !== undefined) {
      if (typeof ev.locals !== 'object' || ev.locals === null || Array.isArray(ev.locals)) {
        throw new ReplayValidationError(`Event seq ${ev.seq} has corrupted locals`);
      }
      for (const [varName, valObj] of Object.entries(ev.locals)) {
        if (!valObj || typeof valObj !== 'object' || typeof valObj.type !== 'string' || typeof valObj.value !== 'string') {
          throw new ReplayValidationError(
            `Event seq ${ev.seq} has corrupted local variable "${varName}": missing type or value string`
          );
        }
      }
    }

    if (ev.stack !== undefined) {
      if (!Array.isArray(ev.stack)) {
        throw new ReplayValidationError(`Event seq ${ev.seq} has corrupted stack: must be an array of strings`);
      }
    }

    if (ev.world !== undefined) {
      if (
        typeof ev.world !== 'object' ||
        ev.world === null ||
        typeof ev.world.x !== 'number' ||
        typeof ev.world.y !== 'number' ||
        typeof ev.world.direction !== 'number' ||
        typeof ev.world.action !== 'string'
      ) {
        throw new ReplayValidationError(`Event seq ${ev.seq} has corrupted world state`);
      }
    }

    const evSize = JSON.stringify(ev).length;
    if (evSize > MAX_SINGLE_EVENT_BYTES) {
      throw new ReplayValidationError(
        `Event seq ${ev.seq} is oversized (${evSize} bytes > ${MAX_SINGLE_EVENT_BYTES} bytes limit)`
      );
    }
  }

  if (run.error !== undefined && typeof run.error !== 'string') {
    throw new ReplayValidationError('Invalid error: error must be a string');
  }

  if (run.output !== undefined && typeof run.output !== 'string') {
    throw new ReplayValidationError('Invalid output: output must be a string');
  }
}

export interface ReplayStorageBackend {
  readonly isPersistent: boolean;
  getItem(id: string): Promise<CachedReplay | null>;
  setItem(item: CachedReplay): Promise<void>;
  removeItem(id: string): Promise<boolean>;
  getAll(): Promise<CachedReplay[]>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

/**
 * Safe in-memory fallback backend
 */
export class MemoryReplayStorageBackend implements ReplayStorageBackend {
  readonly isPersistent = false;
  private items = new Map<string, CachedReplay>();

  async getItem(id: string): Promise<CachedReplay | null> {
    const item = this.items.get(id);
    return item ? deepClone(item) : null;
  }

  async setItem(item: CachedReplay): Promise<void> {
    this.items.set(item.id, deepClone(item));
  }

  async removeItem(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async getAll(): Promise<CachedReplay[]> {
    return Array.from(this.items.values()).map(deepClone);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  async count(): Promise<number> {
    return this.items.size;
  }
}

export function getIndexedDBFactory(): IDBFactory | undefined {
  if (typeof window !== 'undefined' && window.indexedDB) {
    return window.indexedDB;
  }
  if (typeof indexedDB !== 'undefined') {
    return indexedDB;
  }
  return undefined;
}

/**
 * Check if IndexedDB is available in the current runtime environment.
 */
export function isIndexedDBAvailable(): boolean {
  try {
    const idb = getIndexedDBFactory();
    return Boolean(idb && typeof idb.open === 'function');
  } catch {
    return false;
  }
}

/**
 * Browser-only IndexedDB storage backend
 */
export class IndexedDBReplayStorageBackend implements ReplayStorageBackend {
  readonly isPersistent = true;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private dbName: string;
  private storeName: string;
  private version: number;

  constructor(dbName = DB_NAME, storeName = STORE_NAME, version = DB_VERSION) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.version = version;
  }

  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    const idb = getIndexedDBFactory();
    if (!idb) {
      throw new ReplayStorageError('IndexedDB is not available in this environment');
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      try {
        const request = idb.open(this.dbName, this.version);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
            store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
            store.createIndex('sourceHash', 'sourceHash', { unique: false });
          }
        };

        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => {
            db.close();
            this.dbPromise = null;
          };
          resolve(db);
        };

        request.onerror = () => {
          this.dbPromise = null;
          reject(request.error || new ReplayStorageError('Failed to open IndexedDB'));
        };

        request.onblocked = () => {
          console.warn('IndexedDB database open blocked');
        };
      } catch (err) {
        this.dbPromise = null;
        reject(err instanceof Error ? err : new ReplayStorageError(String(err)));
      }
    });

    return this.dbPromise;
  }

  async getItem(id: string): Promise<CachedReplay | null> {
    const db = await this.getDB();
    return new Promise<CachedReplay | null>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.get(id);
        req.onsuccess = () => {
          const res = req.result as CachedReplay | undefined;
          resolve(res ? deepClone(res) : null);
        };
        req.onerror = () => reject(req.error || new ReplayStorageError('getItem failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async setItem(item: CachedReplay): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(deepClone(item));
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new ReplayStorageError('setItem failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
        tx.onabort = () => reject(tx.error || new ReplayStorageError('transaction aborted'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async removeItem(id: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise<boolean>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error || new ReplayStorageError('removeItem failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async getAll(): Promise<CachedReplay[]> {
    const db = await this.getDB();
    return new Promise<CachedReplay[]>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = (req.result || []) as CachedReplay[];
          resolve(list.map(deepClone));
        };
        req.onerror = () => reject(req.error || new ReplayStorageError('getAll failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error || new ReplayStorageError('clear failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  async count(): Promise<number> {
    const db = await this.getDB();
    return new Promise<number>((resolve, reject) => {
      try {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new ReplayStorageError('count failed'));
        tx.onerror = () => reject(tx.error || new ReplayStorageError('transaction failed'));
      } catch (err) {
        reject(err);
      }
    });
  }

  close(): void {
    if (this.dbPromise) {
      this.dbPromise.then((db) => db.close()).catch(() => {});
      this.dbPromise = null;
    }
  }
}

/**
 * Main bounded replay cache implementation
 */
export class ReplayCache {
  private memoryBackend: MemoryReplayStorageBackend;
  private idbBackend: IndexedDBReplayStorageBackend | null = null;
  private persistenceEnabled = false; // explicitly opt-in by default

  constructor(options?: {
    memoryBackend?: MemoryReplayStorageBackend;
    idbBackend?: IndexedDBReplayStorageBackend | null;
    persistenceEnabled?: boolean;
  }) {
    this.memoryBackend = options?.memoryBackend ?? new MemoryReplayStorageBackend();
    this.idbBackend =
      options?.idbBackend !== undefined
        ? options.idbBackend
        : isIndexedDBAvailable()
        ? new IndexedDBReplayStorageBackend()
        : null;
    if (options?.persistenceEnabled !== undefined) {
      this.persistenceEnabled = options.persistenceEnabled;
    }
  }

  /**
   * Toggle persistent IndexedDB storage (explicit opt-in)
   */
  setPersistenceEnabled(enabled: boolean): void {
    this.persistenceEnabled = enabled;
  }

  isPersistenceEnabled(): boolean {
    return this.persistenceEnabled;
  }

  private getPrimaryBackend(preferPersist?: boolean): ReplayStorageBackend {
    const shouldPersist = preferPersist !== undefined ? preferPersist : this.persistenceEnabled;
    if (shouldPersist && (this.idbBackend || isIndexedDBAvailable())) {
      if (!this.idbBackend) {
        this.idbBackend = new IndexedDBReplayStorageBackend();
      }
      return this.idbBackend;
    }
    return this.memoryBackend;
  }

  private async enforceBoundaries(
    backend: ReplayStorageBackend,
    newItemSize: number,
    targetKey: string,
    now: number
  ): Promise<void> {
    const all = await backend.getAll();

    // 1. Evict expired entries
    const expiredIds: string[] = [];
    const validItems: CachedReplay[] = [];

    for (const item of all) {
      const isExpired =
        now - item.lastAccessedAt > REPLAY_TTL_MS || now - item.createdAt > REPLAY_TTL_MS;
      if (isExpired) {
        expiredIds.push(item.id);
      } else {
        validItems.push(item);
      }
    }

    for (const id of expiredIds) {
      await backend.removeItem(id);
    }

    // 2. Calculate remaining size and count (excluding entry with targetKey if it already exists)
    let currentTotalSize = 0;
    const otherItems: CachedReplay[] = [];

    for (const item of validItems) {
      if (item.id === targetKey) {
        // will be replaced
        continue;
      }
      currentTotalSize += item.estimatedSizeBytes || estimateReplaySize(item);
      otherItems.push(item);
    }

    // 3. Evict oldest accessed items until within limits
    // Max runs is 10 (including the new item => otherItems can have at most 9 items)
    otherItems.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

    while (
      otherItems.length > 0 &&
      (otherItems.length + 1 > MAX_REPLAY_COUNT || currentTotalSize + newItemSize > MAX_STORAGE_BYTES)
    ) {
      const oldest = otherItems.shift()!;
      await backend.removeItem(oldest.id);
      currentTotalSize -= oldest.estimatedSizeBytes || estimateReplaySize(oldest);
    }
  }

  /**
   * Save a completed slow or normal run into bounded replay cache.
   * Validates events, deep-clones, checks payload limits, and updates metadata.
   */
  async saveReplay(run: SaveReplayInput, options?: SaveReplayOptions): Promise<CachedReplay> {
    validateReplayRun(run);

    const now = options?.now ?? Date.now();
    const runtimeVersion = options?.runtimeVersion ?? DEFAULT_RUNTIME_VERSION;
    const schemaVersion = REPLAY_CACHE_SCHEMA_VERSION;
    const sourceHash = await computeSourceHash(run.code);
    const normPkgs = normalizePackages(run.packages);
    const key = buildReplayCacheKey(schemaVersion, runtimeVersion, sourceHash, normPkgs, run.mode);

    let status: ReplayStatus = 'completed';
    if (run.isPartial) {
      status = 'partial';
    } else if (run.error) {
      status = 'error';
    }

    const preliminaryRecord: Partial<CachedReplay> = {
      id: key,
      schemaVersion,
      runtimeVersion,
      sourceHash,
      codeLength: run.code.length,
      mode: run.mode,
      packages: normPkgs,
      normalizedPackages: normPkgs.join(','),
      eventCount: run.events.length,
      status,
      hasError: Boolean(run.error),
      isPartial: Boolean(run.isPartial),
      error: run.error,
      createdAt: now,
      lastAccessedAt: now,
      code: run.code,
      events: run.events,
      output: run.output,
    };

    const estimatedSizeBytes = estimateReplaySize(preliminaryRecord);
    if (estimatedSizeBytes > MAX_STORAGE_BYTES) {
      throw new ReplayValidationError(
        `Replay payload size (${estimatedSizeBytes} bytes) exceeds maximum cache capacity (${MAX_STORAGE_BYTES} bytes)`
      );
    }

    const cachedRecord: CachedReplay = {
      ...(preliminaryRecord as CachedReplay),
      estimatedSizeBytes,
      events: deepClone(run.events),
    };

    let backend = this.getPrimaryBackend(options?.persist);

    try {
      await this.enforceBoundaries(backend, estimatedSizeBytes, key, now);
      await backend.setItem(cachedRecord);
    } catch (err) {
      // If IndexedDB failed (e.g. QuotaExceededError or SecurityError), fall back safely to in-memory
      if (backend !== this.memoryBackend) {
        console.warn('Persistent storage failed, falling back to in-memory replay cache:', err);
        backend = this.memoryBackend;
        await this.enforceBoundaries(backend, estimatedSizeBytes, key, now);
        await backend.setItem(cachedRecord);
      } else {
        throw err;
      }
    }

    return deepClone(cachedRecord);
  }

  /**
   * Find an existing replay matching exact code + packages + mode.
   * Never executes code or claims fresh live output; explicit replay only.
   */
  async findReplay(
    codeOrQuery: string | { code: string; packages?: string[]; mode?: ReplayMode },
    packages?: string[],
    mode: ReplayMode = 'slow',
    options?: FindReplayOptions
  ): Promise<CachedReplay | null> {
    let code: string;
    let queryPackages: string[] | undefined;
    let queryMode: ReplayMode;

    if (typeof codeOrQuery === 'object' && codeOrQuery !== null) {
      code = codeOrQuery.code;
      queryPackages = codeOrQuery.packages ?? packages;
      queryMode = codeOrQuery.mode ?? mode;
    } else {
      code = codeOrQuery;
      queryPackages = packages;
      queryMode = mode;
    }

    if (typeof code !== 'string') {
      return null;
    }

    const now = options?.now ?? Date.now();
    const runtimeVersion = options?.runtimeVersion ?? DEFAULT_RUNTIME_VERSION;
    const schemaVersion = REPLAY_CACHE_SCHEMA_VERSION;
    const sourceHash = await computeSourceHash(code);
    const normPkgs = normalizePackages(queryPackages);
    const key = buildReplayCacheKey(schemaVersion, runtimeVersion, sourceHash, normPkgs, queryMode);

    let backend = this.getPrimaryBackend(options?.searchPersistent);
    let item: CachedReplay | null = null;

    try {
      item = await backend.getItem(key);
    } catch (err) {
      if (backend !== this.memoryBackend) {
        backend = this.memoryBackend;
        item = await backend.getItem(key);
      }
    }

    // If not found in primary and persistence was enabled or requested, check secondary
    if (!item && backend !== this.memoryBackend) {
      item = await this.memoryBackend.getItem(key);
    }

    if (!item) {
      return null;
    }

    // Validate TTL
    const isExpired =
      now - item.lastAccessedAt > REPLAY_TTL_MS || now - item.createdAt > REPLAY_TTL_MS;
    if (isExpired) {
      await backend.removeItem(key).catch(() => {});
      return null;
    }

    // Validate schema & runtime version keys
    if (item.schemaVersion !== schemaVersion || item.runtimeVersion !== runtimeVersion) {
      await backend.removeItem(key).catch(() => {});
      return null;
    }

    // Exact verification of code, hash, packages, mode
    if (
      item.code !== code ||
      item.sourceHash !== sourceHash ||
      item.mode !== queryMode ||
      item.normalizedPackages !== normPkgs.join(',')
    ) {
      return null;
    }

    // Validate event integrity
    try {
      validateReplayRun({
        code: item.code,
        mode: item.mode,
        packages: item.packages,
        events: item.events,
        error: item.error,
        output: item.output,
        isPartial: item.isPartial,
      });
    } catch (corruptionErr) {
      // Reject corrupted cache entry
      console.warn('Cached replay corrupted, removing invalid entry:', corruptionErr);
      await backend.removeItem(key).catch(() => {});
      return null;
    }

    // Update access time for LRU tracking
    if (options?.updateAccessTime !== false) {
      item.lastAccessedAt = now;
      await backend.setItem(item).catch(() => {});
    }

    return deepClone(item);
  }

  /**
   * List all cached replays, ordered by newest last accessed time.
   */
  async listReplays(options?: ListReplaysOptions): Promise<CachedReplay[] | CachedReplayMetadata[]> {
    const now = options?.now ?? Date.now();
    const backend = this.getPrimaryBackend();
    let all: CachedReplay[] = [];

    try {
      all = await backend.getAll();
    } catch {
      all = await this.memoryBackend.getAll();
    }

    // Deduplicate by id if multiple backends involved
    const dedupedMap = new Map<string, CachedReplay>();
    for (const item of all) {
      const isExpired =
        now - item.lastAccessedAt > REPLAY_TTL_MS || now - item.createdAt > REPLAY_TTL_MS;
      if (!isExpired || options?.includeExpired) {
        dedupedMap.set(item.id, item);
      }
    }

    const sorted = Array.from(dedupedMap.values()).sort(
      (a, b) => b.lastAccessedAt - a.lastAccessedAt
    );

    if (options?.metadataOnly) {
      return sorted.map((item) => {
        const { code, events, output, ...meta } = item;
        return deepClone(meta);
      });
    }

    return sorted.map(deepClone);
  }

  /**
   * Delete a cached replay by key id or exact code.
   */
  async deleteReplay(idOrCode: string): Promise<boolean> {
    const backend = this.getPrimaryBackend();
    let deleted = false;

    // Check direct ID match
    try {
      const exists = await backend.getItem(idOrCode);
      if (exists) {
        deleted = await backend.removeItem(idOrCode);
      }
    } catch {
      // Continue searching
    }

    // Check memory backend if not yet deleted
    if (!deleted) {
      const memExists = await this.memoryBackend.getItem(idOrCode);
      if (memExists) {
        deleted = await this.memoryBackend.removeItem(idOrCode);
      }
    }

    // If still not deleted, check if idOrCode matches code
    if (!deleted) {
      const all = await backend.getAll();
      for (const it of all) {
        if (it.code === idOrCode || it.id === idOrCode) {
          await backend.removeItem(it.id);
          deleted = true;
        }
      }
    }

    return deleted;
  }

  /**
   * Clear all replays from both persistent and in-memory caches.
   */
  async clearReplays(): Promise<void> {
    await this.memoryBackend.clear();
    if (this.idbBackend) {
      try {
        await this.idbBackend.clear();
      } catch (err) {
        console.warn('Error clearing IndexedDB:', err);
      }
    }
  }
}

// Default singleton instance and exported functions
export const defaultReplayCache = new ReplayCache();

export const saveReplay = defaultReplayCache.saveReplay.bind(defaultReplayCache);
export const findReplay = defaultReplayCache.findReplay.bind(defaultReplayCache);
export const listReplays = defaultReplayCache.listReplays.bind(defaultReplayCache);
export const deleteReplay = defaultReplayCache.deleteReplay.bind(defaultReplayCache);
export const clearReplays = defaultReplayCache.clearReplays.bind(defaultReplayCache);
export const setReplayPersistenceEnabled = defaultReplayCache.setPersistenceEnabled.bind(defaultReplayCache);
export const isReplayPersistenceEnabled = defaultReplayCache.isPersistenceEnabled.bind(defaultReplayCache);

// Aliases
export { deleteReplay as delete, clearReplays as clear };
