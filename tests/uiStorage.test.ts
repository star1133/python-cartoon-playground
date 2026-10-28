import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadSavedCode, saveCode, isCodeModifiedFromSnapshot } from '../src/storage/codeStore';
import { EXAMPLES } from '../src/storage/examples';
import { CURATED_PACKAGES, BROWSER_LIMITATIONS } from '../src/storage/packageCatalog';

describe('uiStorage and catalogs', () => {
  beforeEach(() => {
    // mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, val: string) => {
        store[key] = val;
      },
      clear: () => {
        for (const k in store) delete store[k];
      },
    });
  });

  it('loads default example code when localStorage is empty', () => {
    const code = loadSavedCode();
    expect(code).toBe(EXAMPLES[0]?.code);
  });

  it('saves and loads code correctly from localStorage', () => {
    const customCode = 'x = 42\nprint(x)';
    saveCode(customCode);
    expect(loadSavedCode()).toBe(customCode);
  });

  it('detects if code was modified from execution snapshot', () => {
    const snapshotCode = 'print("hello")';
    expect(isCodeModifiedFromSnapshot(snapshotCode, snapshotCode)).toBe(false);
    expect(isCodeModifiedFromSnapshot('print("hello world")', snapshotCode)).toBe(true);
  });

  it('provides rich curated examples including world loop and general python', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(5);
    const worldLoop = EXAMPLES.find((e) => e.id === 'world_loop');
    expect(worldLoop).toBeDefined();
    expect(worldLoop?.code).toContain('move_forward');

    const generalList = EXAMPLES.find((e) => e.id === 'general_list');
    expect(generalList).toBeDefined();
    expect(generalList?.code).toContain('numbers');
  });

  it('provides honest package catalog and limitation notes', () => {
    expect(CURATED_PACKAGES.length).toBeGreaterThan(0);
    const numpy = CURATED_PACKAGES.find((p) => p.name === 'numpy');
    expect(numpy).toBeDefined();
    expect(numpy?.status).toBe('available');

    expect(BROWSER_LIMITATIONS.length).toBeGreaterThanOrEqual(4);
    const sockets = BROWSER_LIMITATIONS.find((l) => l.titleTh.includes('Sockets'));
    expect(sockets).toBeDefined();
  });
});
