import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';
import {
  type PaneId,
  type WorkbenchMode,
  type WorkbenchLayoutState,
  DEFAULT_WORKBENCH_LAYOUT,
  DEFAULT_PRIMARY_RATIO,
  DEFAULT_SECONDARY_RATIO,
  MIN_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  PANE_IDS,
  PANE_LABELS_TH,
  clampRatio,
  loadWorkbenchLayout,
  saveWorkbenchLayout,
  resetWorkbenchLayout,
  swapPaneOrder,
  movePaneOrder,
  togglePaneVisibility,
  explanationLayout,
} from '../storage/workbenchLayout';
import './WorkbenchLayout.css';

export interface WorkbenchLayoutProps {
  editor: React.ReactNode;
  scene: React.ReactNode;
  results: React.ReactNode;
  mobile?: boolean;
  revealResultsToken?: number;
}

export function WorkbenchLayout({
  editor,
  scene,
  results,
  mobile,
  revealResultsToken,
}: WorkbenchLayoutProps) {
  const [layout, setLayout] = useState<WorkbenchLayoutState>(() => loadWorkbenchLayout());
  const [draggedPane, setDraggedPane] = useState<PaneId | null>(null);
  const [dragOverPane, setDragOverPane] = useState<PaneId | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const activeSeparatorRef = useRef<{
    type: 'primary' | 'secondary';
    pointerId: number;
    initialRatio: number;
  } | null>(null);

  const prevRevealTokenRef = useRef<number | undefined>(revealResultsToken);

  // Synchronize state changes with storage
  const updateLayout = useCallback((updater: (prev: WorkbenchLayoutState) => WorkbenchLayoutState) => {
    setLayout((prev) => {
      const next = updater(prev);
      saveWorkbenchLayout(next);
      return next;
    });
  }, []);

  // Reveal results on nonzero changing token (e.g. on stdin request from parent)
  useEffect(() => {
    if (
      revealResultsToken !== undefined &&
      revealResultsToken !== 0 &&
      revealResultsToken !== prevRevealTokenRef.current
    ) {
      prevRevealTokenRef.current = revealResultsToken;
      updateLayout((prev) => ({
        ...prev,
        hiddenPanes: prev.hiddenPanes.filter((id) => id !== 'results'),
        maximizedPane: null,
      }));
    }
  }, [revealResultsToken, updateLayout]);

  const { mode, order, primaryRatio, secondaryRatio, hiddenPanes, maximizedPane } = layout;

  const visiblePanes = order.filter((id) => !hiddenPanes.includes(id));
  const visibleCount = visiblePanes.length;

  // Handle Drag & Drop header reordering
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: PaneId) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedPane(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, id: PaneId) => {
    e.preventDefault();
    setDragOverPane(id);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, id: PaneId) => {
    if (dragOverPane === id) {
      setDragOverPane(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: PaneId) => {
    e.preventDefault();
    const sourceId = (e.dataTransfer.getData('text/plain') as PaneId) || draggedPane;
    if (sourceId && sourceId !== targetId && PANE_IDS.includes(sourceId)) {
      updateLayout((prev) => ({
        ...prev,
        order: swapPaneOrder(prev.order, sourceId, targetId),
      }));
    }
    setDraggedPane(null);
    setDragOverPane(null);
  };

  const handleDragEnd = () => {
    setDraggedPane(null);
    setDragOverPane(null);
  };

  // Accessible move order
  const handleMovePane = (id: PaneId, direction: 'prev' | 'next') => {
    updateLayout((prev) => ({
      ...prev,
      order: movePaneOrder(prev.order, id, direction),
    }));
  };

  // Maximize / restore
  const handleToggleMaximize = (id: PaneId) => {
    updateLayout((prev) => ({
      ...prev,
      maximizedPane: prev.maximizedPane === id ? null : id,
    }));
  };

  // Toggle visibility (prevent all hidden)
  const handleToggleVisibility = (id: PaneId) => {
    updateLayout((prev) => {
      const nextHidden = togglePaneVisibility(prev.hiddenPanes, id);
      const nextMax = prev.maximizedPane === id && nextHidden.includes(id) ? null : prev.maximizedPane;
      return {
        ...prev,
        hiddenPanes: nextHidden,
        maximizedPane: nextMax,
      };
    });
  };

  // Reset layout (layout only, not user code)
  const handleResetLayout = () => {
    const fresh = resetWorkbenchLayout();
    setLayout(fresh);
  };

  // Mode switch
  const handleSetMode = (nextMode: WorkbenchMode) => {
    updateLayout((prev) => ({
      ...prev,
      mode: nextMode,
    }));
  };

  // Resizing pointers
  const handleSeparatorPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    type: 'primary' | 'secondary'
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    activeSeparatorRef.current = {
      type,
      pointerId: e.pointerId,
      initialRatio: type === 'primary' ? primaryRatio : secondaryRatio,
    };
  };

  const handleSeparatorPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activeSeparatorRef.current || activeSeparatorRef.current.pointerId !== e.pointerId) return;
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const { type } = activeSeparatorRef.current;

    if (type === 'primary') {
      const isVertical = mode !== 'rows';
      let nextRatio = primaryRatio;
      if (isVertical) {
        if (rect.width > 0) {
          nextRatio = ((e.clientX - rect.left) / rect.width) * 100;
        }
      } else {
        if (rect.height > 0) {
          nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
        }
      }
      setLayout((prev) => ({
        ...prev,
        primaryRatio: clampRatio(nextRatio, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO, DEFAULT_PRIMARY_RATIO),
      }));
    } else {
      // Secondary separator
      let nextRatio = secondaryRatio;
      if (mode === 'ide') {
        if (rect.height > 0) {
          nextRatio = ((e.clientY - rect.top) / rect.height) * 100;
        }
      } else if (mode === 'columns') {
        const startX = rect.left + (rect.width * (primaryRatio / 100));
        const remW = rect.width - (rect.width * (primaryRatio / 100));
        if (remW > 0) {
          nextRatio = ((e.clientX - startX) / remW) * 100;
        }
      } else {
        // Rows mode
        const startY = rect.top + (rect.height * (primaryRatio / 100));
        const remH = rect.height - (rect.height * (primaryRatio / 100));
        if (remH > 0) {
          nextRatio = ((e.clientY - startY) / remH) * 100;
        }
      }
      setLayout((prev) => ({
        ...prev,
        secondaryRatio: clampRatio(
          nextRatio,
          MIN_SPLIT_RATIO,
          MAX_SPLIT_RATIO,
          DEFAULT_SECONDARY_RATIO
        ),
      }));
    }
  };

  const handleSeparatorPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeSeparatorRef.current && activeSeparatorRef.current.pointerId === e.pointerId) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      activeSeparatorRef.current = null;
      // Persist finalized ratio
      setLayout((prev) => {
        saveWorkbenchLayout(prev);
        return prev;
      });
    }
  };

  // Keyboard navigation on ARIA separators
  const handleSeparatorKeyDown = (
    e: React.KeyboardEvent<HTMLDivElement>,
    type: 'primary' | 'secondary',
    isVertical: boolean
  ) => {
    const step = e.shiftKey ? 10 : 2;
    const currentVal = type === 'primary' ? primaryRatio : secondaryRatio;
    const defaultVal = type === 'primary' ? DEFAULT_PRIMARY_RATIO : DEFAULT_SECONDARY_RATIO;

    let nextVal: number | null = null;
    const decKey = isVertical ? 'ArrowLeft' : 'ArrowUp';
    const incKey = isVertical ? 'ArrowRight' : 'ArrowDown';

    if (e.key === decKey) {
      nextVal = currentVal - step;
    } else if (e.key === incKey) {
      nextVal = currentVal + step;
    } else if (e.key === 'Home') {
      nextVal = MIN_SPLIT_RATIO;
    } else if (e.key === 'End') {
      nextVal = MAX_SPLIT_RATIO;
    } else if (e.key === 'Enter') {
      nextVal = defaultVal;
    }

    if (nextVal !== null) {
      e.preventDefault();
      const clamped = clampRatio(nextVal, MIN_SPLIT_RATIO, MAX_SPLIT_RATIO, defaultVal);
      updateLayout((prev) => ({
        ...prev,
        [type === 'primary' ? 'primaryRatio' : 'secondaryRatio']: clamped,
      }));
    }
  };

  // Calculate CSS Grid templates
  let gridTemplateColumns = '1fr';
  let gridTemplateRows = '1fr';

  if (!maximizedPane) {
    if (visibleCount === 1) {
      gridTemplateColumns = '1fr';
      gridTemplateRows = '1fr';
    } else if (visibleCount === 2) {
      if (mode === 'rows') {
        gridTemplateColumns = '1fr';
        gridTemplateRows = `minmax(0, ${primaryRatio}fr) var(--wb-sep-size) minmax(0, ${100-primaryRatio}fr)`;
      } else {
        gridTemplateColumns = `minmax(0, ${primaryRatio}fr) var(--wb-sep-size) minmax(0, ${100-primaryRatio}fr)`;
        gridTemplateRows = '1fr';
      }
    } else if (visibleCount === 3) {
      if (mode === 'ide') {
        gridTemplateColumns = `minmax(0, ${primaryRatio}fr) var(--wb-sep-size) minmax(0, ${100-primaryRatio}fr)`;
        gridTemplateRows = `minmax(0, ${secondaryRatio}fr) var(--wb-sep-size) minmax(0, ${100-secondaryRatio}fr)`;
      } else if (mode === 'columns') {
        const col1 = primaryRatio;
        const col2 = Math.round((100 - primaryRatio) * (secondaryRatio / 100));
        gridTemplateColumns = `minmax(0, ${col1}fr) var(--wb-sep-size) minmax(0, ${col2}fr) var(--wb-sep-size) minmax(0, ${100-col1-col2}fr)`;
        gridTemplateRows = '1fr';
      } else {
        // Rows
        const row1 = primaryRatio;
        const row2 = Math.round((100 - primaryRatio) * (secondaryRatio / 100));
        gridTemplateColumns = '1fr';
        gridTemplateRows = `minmax(0, ${row1}fr) var(--wb-sep-size) minmax(0, ${row2}fr) var(--wb-sep-size) minmax(0, ${100-row1-row2}fr)`;
      }
    }
  }

  // Get style placement for each pane without altering DOM tree order
  const getPanePlacementStyle = (id: PaneId): React.CSSProperties => {
    const isHidden = hiddenPanes.includes(id);

    if (maximizedPane) {
      if (maximizedPane === id) {
        return { gridColumn: '1 / -1', gridRow: '1 / -1', display: 'flex' };
      }
      return { display: 'none' };
    }

    if (isHidden) {
      return { display: 'none' };
    }

    const idx = visiblePanes.indexOf(id);
    if (visibleCount === 1) {
      return { gridColumn: '1', gridRow: '1', display: 'flex' };
    }

    if (visibleCount === 2) {
      if (mode === 'rows') {
        return idx === 0
          ? { gridColumn: '1', gridRow: '1', display: 'flex' }
          : { gridColumn: '1', gridRow: '3', display: 'flex' };
      }
      return idx === 0
        ? { gridColumn: '1', gridRow: '1', display: 'flex' }
        : { gridColumn: '3', gridRow: '1', display: 'flex' };
    }

    // 3 panes visible
    if (mode === 'ide') {
      if (idx === 0) return { gridColumn: '1', gridRow: '1 / 4', display: 'flex' };
      if (idx === 1) return { gridColumn: '3', gridRow: '1', display: 'flex' };
      return { gridColumn: '3', gridRow: '3', display: 'flex' };
    }

    if (mode === 'columns') {
      if (idx === 0) return { gridColumn: '1', gridRow: '1', display: 'flex' };
      if (idx === 1) return { gridColumn: '3', gridRow: '1', display: 'flex' };
      return { gridColumn: '5', gridRow: '1', display: 'flex' };
    }

    // mode === 'rows'
    if (idx === 0) return { gridColumn: '1', gridRow: '1', display: 'flex' };
    if (idx === 1) return { gridColumn: '1', gridRow: '3', display: 'flex' };
    return { gridColumn: '1', gridRow: '5', display: 'flex' };
  };

  // Separator 1 (Primary) placement and orientation
  const isPrimarySepVisible = !maximizedPane && visibleCount >= 2;
  const isPrimaryVertical = mode !== 'rows';
  const primarySepStyle: React.CSSProperties = {
    display: isPrimarySepVisible ? 'flex' : 'none',
  };
  if (isPrimarySepVisible) {
    if (visibleCount === 2) {
      if (mode === 'rows') {
        primarySepStyle.gridColumn = '1';
        primarySepStyle.gridRow = '2';
      } else {
        primarySepStyle.gridColumn = '2';
        primarySepStyle.gridRow = '1';
      }
    } else {
      // 3 panes visible
      if (mode === 'ide') {
        primarySepStyle.gridColumn = '2';
        primarySepStyle.gridRow = '1 / 4';
      } else if (mode === 'columns') {
        primarySepStyle.gridColumn = '2';
        primarySepStyle.gridRow = '1';
      } else {
        primarySepStyle.gridColumn = '1';
        primarySepStyle.gridRow = '2';
      }
    }
  }

  // Separator 2 (Secondary) placement and orientation
  const isSecondarySepVisible = !maximizedPane && visibleCount === 3;
  const isSecondaryVertical = mode === 'columns';
  const secondarySepStyle: React.CSSProperties = {
    display: isSecondarySepVisible ? 'flex' : 'none',
  };
  if (isSecondarySepVisible) {
    if (mode === 'ide') {
      secondarySepStyle.gridColumn = '3';
      secondarySepStyle.gridRow = '2';
    } else if (mode === 'columns') {
      secondarySepStyle.gridColumn = '4';
      secondarySepStyle.gridRow = '1';
    } else {
      secondarySepStyle.gridColumn = '1';
      secondarySepStyle.gridRow = '4';
    }
  }

  const paneNodes: Record<PaneId, React.ReactNode> = {
    editor,
    scene,
    results,
  };

  return (
    <div
      className={`workbench-layout-container ${mobile ? 'workbench-mobile' : ''}`}
      data-testid="workbench-layout"
    >
      {/* Top Compact Workbench Toolbar */}
      <header className="workbench-toolbar" role="toolbar" aria-label="แถบควบคุม Workbench">
        <div className="workbench-toolbar-left">
          {/* Details Layout Menu */}
          <details className="workbench-layout-details">
            <summary className="workbench-layout-summary" aria-label="เมนูเลย์เอาต์ (Layout)">
              <span className="workbench-layout-icon" aria-hidden="true">
                ⊞
              </span>
              <span>Layout</span>
            </summary>
            <div className="workbench-layout-menu" role="menu">
              <div className="workbench-menu-section-title">โหมดการจัดวาง</div>
              <button
                type="button"
                className={`workbench-menu-item ${mode === 'ide' ? 'active' : ''}`}
                onClick={() => handleSetMode('ide')}
                role="menuitemradio"
                aria-checked={mode === 'ide'}
              >
                IDE (ซ้ายเดี่ยว / ขวาซ้อน)
              </button>
              <button
                type="button"
                className={`workbench-menu-item ${mode === 'columns' ? 'active' : ''}`}
                onClick={() => handleSetMode('columns')}
                role="menuitemradio"
                aria-checked={mode === 'columns'}
              >
                Columns (เรียงคอลัมน์)
              </button>
              <button
                type="button"
                className={`workbench-menu-item ${mode === 'rows' ? 'active' : ''}`}
                onClick={() => handleSetMode('rows')}
                role="menuitemradio"
                aria-checked={mode === 'rows'}
              >
                Rows (เรียงแถวแนวนอน)
              </button>

              <div className="workbench-menu-divider" />
              <div className="workbench-menu-section-title">แสดง/ซ่อนแผง</div>
              {PANE_IDS.map((id) => (
                <label key={id} className="workbench-menu-checkbox">
                  <input
                    type="checkbox"
                    checked={!hiddenPanes.includes(id)}
                    disabled={!hiddenPanes.includes(id) && visibleCount <= 1}
                    onChange={() => handleToggleVisibility(id)}
                  />
                  <span>{PANE_LABELS_TH[id]}</span>
                </label>
              ))}

              <div className="workbench-menu-divider" />
              <button
                type="button"
                className="workbench-menu-item"
                onClick={handleResetLayout}
                role="menuitem"
              >
                รีเซ็ตเลย์เอาต์เริ่มต้น
              </button>
            </div>
          </details>

          <div className="workbench-focus-actions" role="group" aria-label="มุมมองคำอธิบาย">
            <button type="button" className="workbench-toggle-btn" onClick={() => updateLayout(prev => explanationLayout(prev, 'only'))}>ดูคำอธิบายเต็มพื้นที่</button>
            <button type="button" className="workbench-toggle-btn" onClick={() => updateLayout(prev => explanationLayout(prev, 'with-code'))}>โค้ด + คำอธิบาย</button>
          </div>

          {/* Quick Mode Switches */}
          <div className="workbench-mode-pill-group" role="group" aria-label="โหมดเลย์เอาต์">
            <button
              type="button"
              className={`workbench-mode-btn ${mode === 'ide' ? 'active' : ''}`}
              onClick={() => handleSetMode('ide')}
              title="โหมด IDE: แผงหลักซ้าย อีก 2 แผงซ้อนขวา"
              aria-pressed={mode === 'ide'}
            >
              IDE
            </button>
            <button
              type="button"
              className={`workbench-mode-btn ${mode === 'columns' ? 'active' : ''}`}
              onClick={() => handleSetMode('columns')}
              title="โหมดคอลัมน์: เรียงขนาน 3 คอลัมน์"
              aria-pressed={mode === 'columns'}
            >
              Columns
            </button>
            <button
              type="button"
              className={`workbench-mode-btn ${mode === 'rows' ? 'active' : ''}`}
              onClick={() => handleSetMode('rows')}
              title="โหมดแถว: เรียงซ้อนกันแนวนอน"
              aria-pressed={mode === 'rows'}
            >
              Rows
            </button>
          </div>
        </div>

        {/* Visible Restore Toolbar Toggles - prevent all hidden */}
        <div className="workbench-toolbar-right" role="group" aria-label="สวิตช์แสดงแผงทำงาน">
          {PANE_IDS.map((id) => {
            const isVisible = !hiddenPanes.includes(id);
            const isLastVisible = isVisible && visibleCount <= 1;
            return (
              <button
                key={id}
                type="button"
                className={`workbench-toggle-btn ${isVisible ? 'active' : 'hidden'}`}
                disabled={isLastVisible}
                onClick={() => handleToggleVisibility(id)}
                title={
                  isLastVisible
                    ? 'ไม่สามารถซ่อนได้ (ต้องแสดงอย่างน้อย 1 แผง)'
                    : isVisible
                    ? `คลิกเพื่อซ่อน ${PANE_LABELS_TH[id]}`
                    : `คลิกเพื่อแสดงคืนค่า ${PANE_LABELS_TH[id]}`
                }
                aria-pressed={isVisible}
                aria-label={
                  isVisible ? `ซ่อน ${PANE_LABELS_TH[id]}` : `แสดงคืนค่า ${PANE_LABELS_TH[id]}`
                }
              >
                <span aria-hidden="true">{isVisible ? '●' : '○'}</span>
                <span>{PANE_LABELS_TH[id].split(' ')[0]}</span>
              </button>
            );
          })}

          {maximizedPane && (
            <button
              type="button"
              className="workbench-toggle-btn workbench-restore-btn"
              onClick={() => updateLayout((prev) => ({ ...prev, maximizedPane: null }))}
              title="ยกเลิกการขยายเต็มจอ (Restore)"
              aria-label="ย่อขนาดกลับปกติ"
            >
              ย่อลง
            </button>
          )}

          <button
            type="button"
            className="workbench-toggle-btn workbench-reset-btn"
            onClick={handleResetLayout}
            title="คืนค่าเลย์เอาต์เริ่มต้น (ไม่แตะต้องโค้ด)"
            aria-label="รีเซ็ตเลย์เอาต์"
          >
            รีเซ็ต
          </button>
        </div>
      </header>

      {/* Main Grid Host: Panels are always mounted in fixed order to preserve contents */}
      <main
        className="workbench-grid-host"
        ref={hostRef}
        style={{
          gridTemplateColumns,
          gridTemplateRows,
        }}
      >
        {PANE_IDS.map((id) => {
          const isHidden = hiddenPanes.includes(id);
          const isMax = maximizedPane === id;
          const placementStyle = getPanePlacementStyle(id);
          const orderIndex = order.indexOf(id);
          const isFirstInOrder = orderIndex === 0;
          const isLastInOrder = orderIndex === order.length - 1;

          return (
            <section
              key={id}
              id={`workbench-pane-${id}`}
              className={`workbench-pane workbench-pane-${id} ${
                isHidden ? 'workbench-pane-hidden' : ''
              } ${isMax ? 'workbench-pane-maximized' : ''}`}
              style={placementStyle}
              data-pane-id={id}
              aria-label={PANE_LABELS_TH[id]}
            >
              {/* Draggable header & accessible move buttons */}
              <div
                className={`workbench-pane-header ${dragOverPane === id ? 'workbench-pane-header-dragover' : ''}`}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, id)}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, id)}
                onDragLeave={(e) => handleDragLeave(e, id)}
                onDrop={(e) => handleDrop(e, id)}
                onDragEnd={handleDragEnd}
                onDoubleClick={() => handleToggleMaximize(id)}
                title="ลากเพื่อสลับตำแหน่ง • ดับเบิลคลิกเพื่อขยายเต็มจอ"
              >
                <div className="workbench-pane-header-title">
                  <span className="workbench-pane-drag-handle" aria-hidden="true">
                    ⋮⋮
                  </span>
                  <span>{PANE_LABELS_TH[id]}</span>
                </div>

                <div
                  className="workbench-pane-header-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="workbench-pane-btn"
                    disabled={isFirstInOrder}
                    onClick={() => handleMovePane(id, 'prev')}
                    aria-label={`ย้าย ${PANE_LABELS_TH[id]} ไปก่อนหน้า`}
                    title="ย้ายไปก่อนหน้า"
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    className="workbench-pane-btn"
                    disabled={isLastInOrder}
                    onClick={() => handleMovePane(id, 'next')}
                    aria-label={`ย้าย ${PANE_LABELS_TH[id]} ไปถัดไป`}
                    title="ย้ายไปถัดไป"
                  >
                    ▶
                  </button>
                  <button
                    type="button"
                    className="workbench-pane-btn"
                    onClick={() => handleToggleMaximize(id)}
                    aria-label={isMax ? `ย่อขนาด ${PANE_LABELS_TH[id]}` : `ขยาย ${PANE_LABELS_TH[id]} เต็มจอ`}
                    title={isMax ? 'ย่อลง (Restore)' : 'ขยายเต็มจอ (Maximize)'}
                  >
                    {isMax ? <Minimize2 size={12} aria-hidden="true" /> : <Maximize2 size={12} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="workbench-pane-btn"
                    disabled={visibleCount <= 1}
                    onClick={() => handleToggleVisibility(id)}
                    aria-label={`ซ่อน ${PANE_LABELS_TH[id]}`}
                    title="ซ่อนแผง"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* Pane Content: keeps React node mounted permanently */}
              <div className="workbench-pane-body">{paneNodes[id]}</div>
            </section>
          );
        })}

        {/* Primary Separator */}
        <div
          className={`workbench-separator ${
            isPrimaryVertical ? 'workbench-separator-vertical' : 'workbench-separator-horizontal'
          }`}
          style={primarySepStyle}
          role="separator"
          tabIndex={isPrimarySepVisible ? 0 : -1}
          aria-label="ปรับขนาดแผงหลัก"
          aria-orientation={isPrimaryVertical ? 'vertical' : 'horizontal'}
          aria-valuemin={MIN_SPLIT_RATIO}
          aria-valuemax={MAX_SPLIT_RATIO}
          aria-valuenow={Math.round(primaryRatio)}
          aria-valuetext={`แผงหลัก ${Math.round(primaryRatio)} เปอร์เซ็นต์`}
          aria-controls="workbench-pane-editor workbench-pane-scene workbench-pane-results"
          title="ลากเพื่อปรับขนาด • ลูกศรปรับ • ดับเบิลคลิกคืนค่า"
          onPointerDown={(e) => handleSeparatorPointerDown(e, 'primary')}
          onPointerMove={handleSeparatorPointerMove}
          onPointerUp={handleSeparatorPointerUp}
          onPointerCancel={handleSeparatorPointerUp}
          onLostPointerCapture={() => {
            activeSeparatorRef.current = null;
          }}
          onDoubleClick={() => {
            updateLayout((prev) => ({ ...prev, primaryRatio: DEFAULT_PRIMARY_RATIO }));
          }}
          onKeyDown={(e) => handleSeparatorKeyDown(e, 'primary', isPrimaryVertical)}
        >
          <span className="workbench-separator-grip" aria-hidden="true" />
        </div>

        {/* Secondary Separator */}
        <div
          className={`workbench-separator ${
            isSecondaryVertical ? 'workbench-separator-vertical' : 'workbench-separator-horizontal'
          }`}
          style={secondarySepStyle}
          role="separator"
          tabIndex={isSecondarySepVisible ? 0 : -1}
          aria-label="ปรับขนาดแผงรอง"
          aria-orientation={isSecondaryVertical ? 'vertical' : 'horizontal'}
          aria-valuemin={MIN_SPLIT_RATIO}
          aria-valuemax={MAX_SPLIT_RATIO}
          aria-valuenow={Math.round(secondaryRatio)}
          aria-valuetext={`แผงรอง ${Math.round(secondaryRatio)} เปอร์เซ็นต์`}
          aria-controls="workbench-pane-scene workbench-pane-results"
          title="ลากเพื่อปรับขนาด • ลูกศรปรับ • ดับเบิลคลิกคืนค่า"
          onPointerDown={(e) => handleSeparatorPointerDown(e, 'secondary')}
          onPointerMove={handleSeparatorPointerMove}
          onPointerUp={handleSeparatorPointerUp}
          onPointerCancel={handleSeparatorPointerUp}
          onLostPointerCapture={() => {
            activeSeparatorRef.current = null;
          }}
          onDoubleClick={() => {
            updateLayout((prev) => ({ ...prev, secondaryRatio: DEFAULT_SECONDARY_RATIO }));
          }}
          onKeyDown={(e) => handleSeparatorKeyDown(e, 'secondary', isSecondaryVertical)}
        >
          <span className="workbench-separator-grip" aria-hidden="true" />
        </div>
      </main>
    </div>
  );
}

export default WorkbenchLayout;
