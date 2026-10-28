export type PaneId = 'editor' | 'scene' | 'results';
export type WorkbenchMode = 'ide' | 'columns' | 'rows';

export interface WorkbenchLayoutState {
  version: 1;
  mode: WorkbenchMode;
  order: PaneId[];
  primaryRatio: number;
  secondaryRatio: number;
  hiddenPanes: PaneId[];
  maximizedPane: PaneId | null;
}

export const WORKBENCH_LAYOUT_STORAGE_KEY = 'python-cartoon-workbench-layout-v1';
export const LEGACY_PANEL_SPLIT_KEY = 'python-right-panel-split-v1';

export const PANE_IDS: readonly PaneId[] = ['editor', 'scene', 'results'] as const;

export const PANE_LABELS_TH: Record<PaneId, string> = {
  editor: 'ตัวแก้ไขโค้ด',
  scene: 'กระดานแสดงผล',
  results: 'คอนโซลและผลลัพธ์',
};

export const MIN_SPLIT_RATIO = 20;
export const MAX_SPLIT_RATIO = 80;
export const DEFAULT_PRIMARY_RATIO = 50;
export const DEFAULT_SECONDARY_RATIO = 70;

export const DEFAULT_WORKBENCH_LAYOUT: WorkbenchLayoutState = {
  version: 1,
  mode: 'ide',
  order: ['editor', 'scene', 'results'],
  primaryRatio: DEFAULT_PRIMARY_RATIO,
  secondaryRatio: DEFAULT_SECONDARY_RATIO,
  hiddenPanes: [],
  maximizedPane: null,
};

export function clampRatio(
  value: number,
  min: number = MIN_SPLIT_RATIO,
  max: number = MAX_SPLIT_RATIO,
  fallback: number = DEFAULT_PRIMARY_RATIO
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function isValidPaneId(value: unknown): value is PaneId {
  return typeof value === 'string' && (value === 'editor' || value === 'scene' || value === 'results');
}

export function isValidMode(value: unknown): value is WorkbenchMode {
  return value === 'ide' || value === 'columns' || value === 'rows';
}

export function sanitizeOrder(order: unknown): PaneId[] {
  if (!Array.isArray(order)) return [...DEFAULT_WORKBENCH_LAYOUT.order];
  const valid = order.filter(isValidPaneId);
  const deduped: PaneId[] = [];
  for (const id of valid) {
    if (!deduped.includes(id)) deduped.push(id);
  }
  for (const id of PANE_IDS) {
    if (!deduped.includes(id)) deduped.push(id);
  }
  if (deduped.length !== 3) return [...DEFAULT_WORKBENCH_LAYOUT.order];
  return deduped;
}

export function sanitizeHiddenPanes(hidden: unknown): PaneId[] {
  if (!Array.isArray(hidden)) return [];
  const valid = hidden.filter(isValidPaneId);
  const deduped: PaneId[] = [];
  for (const id of valid) {
    if (!deduped.includes(id)) deduped.push(id);
  }
  // Prevent all panes from being hidden: at least one pane must remain visible
  if (deduped.length >= PANE_IDS.length) {
    return [];
  }
  return deduped;
}

export function validateWorkbenchLayout(raw: unknown): WorkbenchLayoutState {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_WORKBENCH_LAYOUT, order: [...DEFAULT_WORKBENCH_LAYOUT.order] };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.version !== undefined && obj.version !== 1) {
    return { ...DEFAULT_WORKBENCH_LAYOUT, order: [...DEFAULT_WORKBENCH_LAYOUT.order], hiddenPanes: [] };
  }
  const mode: WorkbenchMode = isValidMode(obj.mode) ? obj.mode : DEFAULT_WORKBENCH_LAYOUT.mode;
  const order = sanitizeOrder(obj.order);
  const primaryRatio = clampRatio(Number(obj.primaryRatio), MIN_SPLIT_RATIO, MAX_SPLIT_RATIO, DEFAULT_PRIMARY_RATIO);
  const secondaryRatio = clampRatio(
    Number(obj.secondaryRatio),
    MIN_SPLIT_RATIO,
    MAX_SPLIT_RATIO,
    DEFAULT_SECONDARY_RATIO
  );
  const hiddenPanes = sanitizeHiddenPanes(obj.hiddenPanes);

  let maximizedPane: PaneId | null = null;
  if (isValidPaneId(obj.maximizedPane) && !hiddenPanes.includes(obj.maximizedPane)) {
    maximizedPane = obj.maximizedPane;
  }

  return {
    version: 1,
    mode,
    order,
    primaryRatio,
    secondaryRatio,
    hiddenPanes,
    maximizedPane,
  };
}

export function loadWorkbenchLayout(): WorkbenchLayoutState {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_WORKBENCH_LAYOUT, order: [...DEFAULT_WORKBENCH_LAYOUT.order] };
    }

    const raw = localStorage.getItem(WORKBENCH_LAYOUT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return validateWorkbenchLayout(parsed);
    }

    // Optional legacy migration: python-right-panel-split-v1
    const legacy = localStorage.getItem(LEGACY_PANEL_SPLIT_KEY);
    if (legacy !== null) {
      const legacyNum = Number(legacy);
      const migratedSecondary = clampRatio(
        legacyNum,
        MIN_SPLIT_RATIO,
        MAX_SPLIT_RATIO,
        DEFAULT_SECONDARY_RATIO
      );
      return {
        ...DEFAULT_WORKBENCH_LAYOUT,
        order: [...DEFAULT_WORKBENCH_LAYOUT.order],
        secondaryRatio: migratedSecondary,
      };
    }
  } catch {
    // Storage quota, security error, or corrupt JSON fallback safely
  }

  return { ...DEFAULT_WORKBENCH_LAYOUT, order: [...DEFAULT_WORKBENCH_LAYOUT.order] };
}

export function saveWorkbenchLayout(state: WorkbenchLayoutState): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    const validated = validateWorkbenchLayout(state);
    localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify(validated));
    // Keep legacy key synchronized for backwards compatibility
    try {
      localStorage.setItem(LEGACY_PANEL_SPLIT_KEY, String(Math.round(validated.secondaryRatio)));
    } catch {}
    return true;
  } catch {
    // Catch quota exceeded or disabled storage safely
    return false;
  }
}

export function resetWorkbenchLayout(): WorkbenchLayoutState {
  const fresh: WorkbenchLayoutState = {
    ...DEFAULT_WORKBENCH_LAYOUT,
    order: [...DEFAULT_WORKBENCH_LAYOUT.order],
    hiddenPanes: [],
    maximizedPane: null,
  };
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(WORKBENCH_LAYOUT_STORAGE_KEY, JSON.stringify(fresh));
      try {
        localStorage.setItem(LEGACY_PANEL_SPLIT_KEY, String(fresh.secondaryRatio));
      } catch {}
    }
  } catch {}
  return fresh;
}

export function swapPaneOrder(order: PaneId[], paneA: PaneId, paneB: PaneId): PaneId[] {
  if (paneA === paneB) return [...order];
  const idxA = order.indexOf(paneA);
  const idxB = order.indexOf(paneB);
  if (idxA === -1 || idxB === -1) return [...order];
  const next = [...order];
  next[idxA] = paneB;
  next[idxB] = paneA;
  return next;
}

export function movePaneOrder(order: PaneId[], pane: PaneId, direction: 'prev' | 'next'): PaneId[] {
  const idx = order.indexOf(pane);
  if (idx === -1) return [...order];
  const targetIdx = direction === 'prev' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= order.length) return [...order];
  const next = [...order];
  next[idx] = next[targetIdx]!;
  next[targetIdx] = pane;
  return next;
}

export function explanationLayout(state: WorkbenchLayoutState, view: 'only' | 'with-code'): WorkbenchLayoutState {
  return { ...state, mode: 'ide', order: ['editor','scene','results'],
    primaryRatio: view === 'with-code' ? 30 : state.primaryRatio,
    hiddenPanes: view === 'only' ? ['editor','results'] : ['results'], maximizedPane: null };
}

export function togglePaneVisibility(hiddenPanes: PaneId[], target: PaneId): PaneId[] {
  if (hiddenPanes.includes(target)) {
    return hiddenPanes.filter((id) => id !== target);
  }
  // Prevent all panes from being hidden: must leave at least one visible
  const visibleCount = PANE_IDS.length - hiddenPanes.length;
  if (visibleCount <= 1) {
    return hiddenPanes; // Reject hiding the last visible pane
  }
  return [...hiddenPanes, target];
}
