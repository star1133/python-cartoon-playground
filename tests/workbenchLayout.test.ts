import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  clampRatio,
  sanitizeOrder,
  sanitizeHiddenPanes,
  validateWorkbenchLayout,
  loadWorkbenchLayout,
  saveWorkbenchLayout,
  resetWorkbenchLayout,
  swapPaneOrder,
  movePaneOrder,
  togglePaneVisibility,
  DEFAULT_WORKBENCH_LAYOUT,
  WORKBENCH_LAYOUT_STORAGE_KEY,
  LEGACY_PANEL_SPLIT_KEY,
  type WorkbenchLayoutState,
} from '../src/storage/workbenchLayout';
import { WorkbenchLayout } from '../src/components/WorkbenchLayout';

describe('WorkbenchLayout Storage & State Logic', () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    });
  });

  describe('clampRatio', () => {
    it('clamps ratios strictly within [20, 80]', () => {
      expect(clampRatio(10)).toBe(20);
      expect(clampRatio(95)).toBe(80);
      expect(clampRatio(55)).toBe(55);
      expect(clampRatio(20)).toBe(20);
      expect(clampRatio(80)).toBe(80);
    });

    it('handles non-finite values and NaN with fallback', () => {
      expect(clampRatio(NaN)).toBe(50);
      expect(clampRatio(Infinity)).toBe(50);
      expect(clampRatio(-Infinity)).toBe(50);
      expect(clampRatio(NaN, 20, 80, 60)).toBe(60);
    });
  });

  describe('Order & Pane Sanitization', () => {
    it('sanitizes invalid or truncated order arrays', () => {
      expect(sanitizeOrder(null)).toEqual(['editor', 'scene', 'results']);
      expect(sanitizeOrder(['scene'])).toEqual(['scene', 'editor', 'results']);
      expect(sanitizeOrder(['results', 'scene', 'invalid' as any])).toEqual(['results', 'scene', 'editor']);
      expect(sanitizeOrder(['scene', 'scene', 'editor'])).toEqual(['scene', 'editor', 'results']);
    });

    it('prevents hiding all panes', () => {
      expect(sanitizeHiddenPanes(['editor', 'scene', 'results'])).toEqual([]);
      expect(sanitizeHiddenPanes(['editor', 'scene'])).toEqual(['editor', 'scene']);
      expect(sanitizeHiddenPanes(null)).toEqual([]);
    });

    it('validates and normalizes full layout state schema', () => {
      const corrupt = {
        version: 1,
        mode: 'unknown-mode',
        primaryRatio: 500,
        secondaryRatio: -10,
        order: ['invalid'],
        hiddenPanes: ['editor', 'scene', 'results'],
        maximizedPane: 'not-a-pane',
      };
      const validated = validateWorkbenchLayout(corrupt);
      expect(validated.version).toBe(1);
      expect(validated.mode).toBe('ide');
      expect(validated.primaryRatio).toBe(80);
      expect(validated.secondaryRatio).toBe(20);
      expect(validated.order).toEqual(['editor', 'scene', 'results']);
      expect(validated.hiddenPanes).toEqual([]);
      expect(validated.maximizedPane).toBeNull();
    });

    it('clears maximizedPane if that pane is hidden', () => {
      const state = validateWorkbenchLayout({
        hiddenPanes: ['results'],
        maximizedPane: 'results',
      });
      expect(state.maximizedPane).toBeNull();
    });
  });

  describe('Storage persistence & migration', () => {
    it('returns default layout on empty storage', () => {
      const layout = loadWorkbenchLayout();
      expect(layout).toEqual(DEFAULT_WORKBENCH_LAYOUT);
    });

    it('migrates legacy split ratio from python-right-panel-split-v1 when new key is missing', () => {
      store[LEGACY_PANEL_SPLIT_KEY] = '72';
      const layout = loadWorkbenchLayout();
      expect(layout.secondaryRatio).toBe(72);
      expect(layout.mode).toBe('ide');
      expect(layout.order).toEqual(['editor', 'scene', 'results']);
    });

    it('saves and reloads state cleanly round-trip', () => {
      const custom: WorkbenchLayoutState = {
        version: 1,
        mode: 'columns',
        order: ['scene', 'editor', 'results'],
        primaryRatio: 35,
        secondaryRatio: 45,
        hiddenPanes: ['results'],
        maximizedPane: null,
      };
      const ok = saveWorkbenchLayout(custom);
      expect(ok).toBe(true);

      const loaded = loadWorkbenchLayout();
      expect(loaded).toEqual(custom);
      expect(store[LEGACY_PANEL_SPLIT_KEY]).toBe('45');
    });

    it('catches JSON parse errors on corrupted localStorage safely', () => {
      store[WORKBENCH_LAYOUT_STORAGE_KEY] = 'INVALID_JSON{{{';
      const loaded = loadWorkbenchLayout();
      expect(loaded).toEqual(DEFAULT_WORKBENCH_LAYOUT);
    });

    it('catches localStorage QuotaExceededError without throwing', () => {
      vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      });
      expect(() => saveWorkbenchLayout(DEFAULT_WORKBENCH_LAYOUT)).not.toThrow();
      expect(saveWorkbenchLayout(DEFAULT_WORKBENCH_LAYOUT)).toBe(false);
    });

    it('resets layout to default without clearing other stored keys like code or settings', () => {
      store['python-saved-code-v1'] = 'print("hello")';
      store[WORKBENCH_LAYOUT_STORAGE_KEY] = JSON.stringify({ mode: 'rows' });

      const reset = resetWorkbenchLayout();
      expect(reset.mode).toBe('ide');
      expect(reset.hiddenPanes).toEqual([]);
      expect(store['python-saved-code-v1']).toBe('print("hello")');
    });
  });

  describe('Layout Reorder & Visibility Operations', () => {
    it('swaps pane order correctly', () => {
      const order = ['editor', 'scene', 'results'] as const;
      const swapped = swapPaneOrder([...order], 'editor', 'results');
      expect(swapped).toEqual(['results', 'scene', 'editor']);
    });

    it('moves pane position with direction boundary checks', () => {
      const order = ['editor', 'scene', 'results'] as const;
      // Cannot move first item prev
      expect(movePaneOrder([...order], 'editor', 'prev')).toEqual(['editor', 'scene', 'results']);
      // Move editor next
      expect(movePaneOrder([...order], 'editor', 'next')).toEqual(['scene', 'editor', 'results']);
      // Move results prev
      expect(movePaneOrder([...order], 'results', 'prev')).toEqual(['editor', 'results', 'scene']);
      // Cannot move last item next
      expect(movePaneOrder([...order], 'results', 'next')).toEqual(['editor', 'scene', 'results']);
    });

    it('toggles pane visibility while preventing all panels from being hidden', () => {
      let hidden = togglePaneVisibility([], 'results');
      expect(hidden).toEqual(['results']);

      hidden = togglePaneVisibility(hidden, 'scene');
      expect(hidden).toEqual(['results', 'scene']);

      // Trying to hide the last visible pane ('editor') must be rejected
      const rejected = togglePaneVisibility(hidden, 'editor');
      expect(rejected).toEqual(['results', 'scene']);

      // Unhiding works
      hidden = togglePaneVisibility(hidden, 'results');
      expect(hidden).toEqual(['scene']);
    });
  });
});

describe('WorkbenchLayout React Component Rendering', () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      clear: () => {},
    });
  });

  it('renders all three panels permanently mounted with their contents', () => {
    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', { id: 'test-editor-content' }, 'Code Editor Content'),
        scene: React.createElement('div', { id: 'test-scene-content' }, '3D & 2D Scene Content'),
        results: React.createElement('div', { id: 'test-results-content' }, 'Terminal Results Content'),
      })
    );

    // All pane sections mounted
    expect(html).toContain('id="workbench-pane-editor"');
    expect(html).toContain('id="workbench-pane-scene"');
    expect(html).toContain('id="workbench-pane-results"');

    // All children content present
    expect(html).toContain('Code Editor Content');
    expect(html).toContain('3D &amp; 2D Scene Content');
    expect(html).toContain('Terminal Results Content');
  });

  it('renders ARIA separators with valid range bounds and orientation', () => {
    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', null, 'Editor'),
        scene: React.createElement('div', null, 'Scene'),
        results: React.createElement('div', null, 'Results'),
      })
    );

    // Separators present with proper ARIA attributes
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-valuemin="20"');
    expect(html).toContain('aria-valuemax="80"');
    expect(html).toContain('aria-label="ปรับขนาดแผงหลัก"');
    expect(html).toContain('aria-label="ปรับขนาดแผงรอง"');
    expect(html).toContain('tabindex="0"');
  });

  it('renders compact Layout details menu and visible restore toolbar toggles', () => {
    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', null, 'Editor'),
        scene: React.createElement('div', null, 'Scene'),
        results: React.createElement('div', null, 'Results'),
      })
    );

    // Compact details Layout menu
    expect(html).toContain('<details class="workbench-layout-details"');
    expect(html).toContain('Layout');
    expect(html).toContain('โหมดการจัดวาง');
    expect(html).toContain('รีเซ็ตเลย์เอาต์เริ่มต้น');

    // Quick mode buttons
    expect(html).toContain('IDE');
    expect(html).toContain('Columns');
    expect(html).toContain('Rows');

    // Visible restore toolbar toggles for all 3 panes
    expect(html).toContain('aria-label="สวิตช์แสดงแผงทำงาน"');
    expect(html).toContain('ตัวแก้ไขโค้ด');
    expect(html).toContain('กระดานแสดงผล');
    expect(html).toContain('คอนโซลและผลลัพธ์');
  });

  it('provides draggable header handles and accessible reorder buttons', () => {
    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', null, 'Editor'),
        scene: React.createElement('div', null, 'Scene'),
        results: React.createElement('div', null, 'Results'),
      })
    );

    // Draggable header
    expect(html).toContain('draggable="true"');
    expect(html).toContain('workbench-pane-drag-handle');

    // Accessible reorder and action buttons
    expect(html).toContain('aria-label="ย้าย ตัวแก้ไขโค้ด ไปก่อนหน้า"');
    expect(html).toContain('aria-label="ย้าย ตัวแก้ไขโค้ด ไปถัดไป"');
    expect(html).toContain('title="ขยายเต็มจอ (Maximize)"');
    expect(html).toContain('title="ซ่อนแผง"');
  });

  it('renders correctly when hidden panels exist without unmounting their DOM containers', () => {
    // Pre-populate storage with hidden results
    const store: Record<string, string> = {
      [WORKBENCH_LAYOUT_STORAGE_KEY]: JSON.stringify({
        version: 1,
        mode: 'ide',
        order: ['editor', 'scene', 'results'],
        primaryRatio: 50,
        secondaryRatio: 60,
        hiddenPanes: ['results'],
        maximizedPane: null,
      }),
    };
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      clear: () => {},
    });

    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', null, 'Editor'),
        scene: React.createElement('div', null, 'Scene'),
        results: React.createElement('div', null, 'Hidden Results Node'),
      })
    );

    // results pane is STILL rendered in DOM with hidden class
    expect(html).toContain('id="workbench-pane-results"');
    expect(html).toContain('workbench-pane-hidden');
    expect(html).toContain('Hidden Results Node');
  });

  it('renders correctly with mobile prop', () => {
    const html = renderToString(
      React.createElement(WorkbenchLayout, {
        editor: React.createElement('div', null, 'Editor'),
        scene: React.createElement('div', null, 'Scene'),
        results: React.createElement('div', null, 'Results'),
        mobile: true,
      })
    );

    expect(html).toContain('workbench-mobile');
    expect(html).toContain('workbench-layout-container');
  });
});
