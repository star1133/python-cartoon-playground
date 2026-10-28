import React, { useState, useEffect, useId } from 'react';
import {
  Grid2x2,
  RefreshCw,
  Lightbulb,
  ArrowRight,
  ClipboardList,
  AlertTriangle,
} from 'lucide-react';
import './NumberBoard2D.css';
import { computeVisualTeachingCard } from '../explain/visualTeachingModel';
import type { SceneState, VariableBox } from './sceneReducer';
import type { TraceEvent } from '../runtime/types';
import {
  computeFlowExplanation,
  getPhaseDescriptionTh,
  type VariableFlowItem,
} from './flowExplanationModel';

export interface NumberBoard2DProps {
  sceneState: SceneState;
  currentEvent?: TraceEvent | null;
  sourceSnapshot?: string;
  activeLine?: number;
  isPlaying?: boolean;
  speed?: number;
  initialPhase?: 1 | 2 | 3;
}

function isNumericTypeOrValue(type: string, value: string): boolean {
  if (type === 'int' || type === 'float') return true;
  if (!value) return false;
  const trimmed = value.trim();
  return !isNaN(Number(trimmed)) && trimmed !== '';
}

function getTypeBadgeClass(type: string): string {
  switch (type) {
    case 'int':
      return 'nb2d-type-int';
    case 'float':
      return 'nb2d-type-float';
    case 'str':
      return 'nb2d-type-str';
    case 'list':
    case 'dict':
    case 'tuple':
    case 'set':
      return 'nb2d-type-container';
    case 'bool':
      return 'nb2d-type-bool';
    default:
      return 'nb2d-type-other';
  }
}

/**
 * SVG Arrow Component with progressive reveal animation and accessible reduced-motion support
 */
interface FlowArrowProps {
  testId: string;
  isActive: boolean;
  labelTh?: string;
  directionLabel?: string;
}

const FlowArrow: React.FC<FlowArrowProps> = ({
  testId,
  isActive,
  labelTh,
  directionLabel = '➔',
}) => {
  const markerId = useId();

  return (
    <div
      data-testid={testId}
      className={`nb2d-flow-arrow ${isActive ? 'nb2d-arrow-active' : 'nb2d-arrow-inactive'}`}
      title={labelTh}
      aria-label={labelTh || 'ลูกศรแสดงทิศทางการไหลของข้อมูล'}
    >
      <div className="nb2d-arrow-svg-wrap">
        <svg
          className="nb2d-arrow-svg"
          viewBox="0 0 64 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="7"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" />
            </marker>
          </defs>
          <line
            x1="4"
            y1="12"
            x2="54"
            y2="12"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            markerEnd={`url(#${markerId})`}
          />
        </svg>
      </div>
      <span className="nb2d-arrow-badge" aria-hidden="true">
        {directionLabel}
      </span>
      {labelTh && <span className="nb2d-arrow-caption">{labelTh}</span>}
    </div>
  );
};

export const NumberBoard2D: React.FC<NumberBoard2DProps> = ({
  sceneState,
  currentEvent,
  sourceSnapshot,
  activeLine,
  isPlaying = false,
  speed = 1,
  initialPhase,
}) => {
  const teaching = computeVisualTeachingCard(currentEvent, sourceSnapshot);
  const genericModel = sceneState.genericModel;
  const variables = genericModel.variables;
  const hasVariables = variables.length > 0;
  const hasStdout = Boolean(genericModel.recentStdout);
  const hasException = genericModel.hasException;
  const loopInfo = genericModel.loopInfo;
  const callStack = genericModel.callStack;

  // คำนวณโมเดลโฟลว์ลูกศรสำหรับอธิบาย 3 ขั้นตอน
  const flowState = computeFlowExplanation(
    variables,
    currentEvent,
    sourceSnapshot,
    activeLine
  );

  // ตรวจสอบการตั้งค่า prefers-reduced-motion ของระบบ
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // จัดการ Phase การอธิบาย 1, 2, 3
  const [phase, setPhase] = useState<1 | 2 | 3>(() => initialPhase ?? 1);

  // ซิงค์ initialPhase หากมีการระบุจากภายนอก (สำหรับโหมดทดสอบ)
  useEffect(() => {
    if (initialPhase !== undefined) {
      setPhase(initialPhase);
    }
  }, [initialPhase]);

  // รีเซ็ต Phase เป็น 1 ทุกครั้งที่เปลี่ยน Sequence, เปลี่ยนบรรทัด หรือเปลี่ยน Snapshot
  const eventSeq = currentEvent?.seq ?? null;
  useEffect(() => {
    if (initialPhase === undefined) {
      setPhase(1);
    }
  }, [eventSeq, sourceSnapshot, activeLine, initialPhase]);

  // ตัวจับเวลาแอนิเมชันสำหรับ 3 ขั้นตอนอัตโนมัติขณะ Playback กำลังเล่น (isPlaying)
  useEffect(() => {
    if (!isPlaying) {
      // เมื่อหยุดชั่วคราว (Paused) ต้องหยุดการเลื่อนขั้นภายในทันที
      return;
    }

    // คำนวณช่วงเวลาของแต่ละ Phase ตามความเร็ว Playback
    // Pace tick มาตรฐานที่ ~1800ms / speed เพื่อให้มนุษย์อ่านทัน
    const currentSpeed = speed > 0 ? speed : 1;
    const totalPacedMs = Math.max(300, Math.round(1800 / currentSpeed));
    const stepDurationMs = Math.round(totalPacedMs / 3);

    const timer1 = setTimeout(() => {
      setPhase((prev) => (prev < 2 ? 2 : prev));
    }, stepDurationMs);

    const timer2 = setTimeout(() => {
      setPhase(3);
    }, stepDurationMs * 2);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, [isPlaying, speed, eventSeq]);

  const isEmpty = !hasVariables && !hasStdout && !hasException;
  const primaryItem: VariableFlowItem | undefined = flowState.items[0];

  const handlePrevPhase = () => {
    if (!isPlaying && phase > 1) {
      setPhase((prev) => (prev - 1) as 1 | 2 | 3);
    }
  };

  const handleNextPhase = () => {
    if (!isPlaying && phase < 3) {
      setPhase((prev) => (prev + 1) as 1 | 2 | 3);
    }
  };

  return (
    <div
      className={`number-board-2d nb2d-container ${reducedMotion ? 'nb2d-reduced-motion' : ''}`}
      role="region"
      aria-label="กระดานแสดงค่าตัวเลขและคำอธิบายลูกศร 2D"
    >
      {/* Top Header bar with status badges & honest source line display */}
      <header className="nb2d-header">
        <div className="nb2d-badge-row">
          <span className="nb2d-badge nb2d-badge-mode" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Grid2x2 size={13} aria-hidden="true" />
            กระดานข้อมูล 2D
          </span>

          {callStack && callStack.length > 0 && (
            <span className="nb2d-badge nb2d-badge-stack">
              สแตก: {callStack.map((f) => f.frameName).join(' › ')}
            </span>
          )}

          {loopInfo?.isLooping && (
            <span className="nb2d-badge nb2d-badge-loop" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <RefreshCw size={12} aria-hidden="true" /> บรรทัด {loopInfo.activeLine} ถูกเข้าถึง {loopInfo.iterationCount} ครั้ง
            </span>
          )}
        </div>

        {flowState.effectiveLine > 0 && (
          <div className="nb2d-active-line-box" title={flowState.sourceLineText}>
            <span className="nb2d-active-line-num">{`${currentEvent?.kind === 'line' ? 'กำลังจะทำ' : 'ตำแหน่งโค้ด'} บรรทัด ${flowState.effectiveLine}:`}</span>{' '}
            {flowState.sourceLineText || '(กำลังประมวลผลคำสั่ง)'}
          </div>
        )}
      </header>

      {currentEvent && <section className="nb2d-teaching-card" data-testid="visual-teaching-card" aria-label="คำอธิบายโค้ดด้วยภาพ">
        <strong>{teaching.titleTh}</strong>
        <p className="nb2d-teaching-question">{teaching.questionTh}</p>
        <p>{teaching.explanationTh}</p>
        <details><summary>จุดที่มักเข้าใจผิด</summary><p>{teaching.misconceptionTh}</p></details>
        {!!teaching.observed.length && <div className="nb2d-teaching-observed" aria-label="ค่าจาก trace ไม่ใช่ผลคำนวณล่วงหน้า">
          {teaching.observed.map((item) => <code key={item.name}>{item.name}: {item.value} <small>({item.type})</small></code>)}
        </div>}
      </section>}

      {/* Prominent Flow Explanation Section with Animated Arrows & 3 Phases */}
      <section
        data-testid="flow-explanation"
        className="nb2d-flow-section"
        aria-label="การอธิบายลำดับการเปลี่ยนแปลงค่าทีละขั้นด้วยลูกศร"
      >
        <div className="nb2d-flow-toolbar">
          <div className="nb2d-flow-phase-nav">
            <button
              type="button"
              data-testid="phase-prev"
              className="nb2d-phase-btn nb2d-phase-prev"
              onClick={handlePrevPhase}
              disabled={isPlaying || phase <= 1}
              title="ย้อนดูขั้นตอนก่อนหน้า"
              aria-label="ย้อนดูขั้นตอนก่อนหน้า"
            >
              ❮ ย้อนขั้น
            </button>

            <div className="nb2d-phase-pills" role="tablist" aria-label="ขั้นตอนการอธิบาย">
              <button
                type="button"
                data-testid="flow-phase-1"
                className={`nb2d-phase-pill ${
                  phase === 1
                    ? 'nb2d-phase-pill-active'
                    : phase > 1
                    ? 'nb2d-phase-pill-done'
                    : ''
                }`}
                onClick={() => !isPlaying && setPhase(1)}
                disabled={isPlaying}
              >
                1. {primaryItem?.hasPrev ? 'ค่าเดิม' : 'ตรวจพบค่า'}
              </button>

              <button
                type="button"
                data-testid="flow-phase-2"
                className={`nb2d-phase-pill ${
                  phase === 2
                    ? 'nb2d-phase-pill-active'
                    : phase > 2
                    ? 'nb2d-phase-pill-done'
                    : ''
                }`}
                onClick={() => !isPlaying && setPhase(2)}
                disabled={isPlaying}
              >
                2. {primaryItem?.hasPrev ? 'ค่าใหม่' : 'ส่งต่อค่า'}
              </button>

              <button
                type="button"
                data-testid="flow-phase-3"
                className={`nb2d-phase-pill ${
                  phase === 3 ? 'nb2d-phase-pill-active' : ''
                }`}
                onClick={() => !isPlaying && setPhase(3)}
                disabled={isPlaying}
              >
                3. บันทึกตัวแปร
              </button>
            </div>

            <button
              type="button"
              data-testid="phase-next"
              className="nb2d-phase-btn nb2d-phase-next"
              onClick={handleNextPhase}
              disabled={isPlaying || phase >= 3}
              title="ก้าวไปขั้นตอนถัดไป"
              aria-label="ก้าวไปขั้นตอนถัดไป"
            >
              ขั้นถัดไป ❯
            </button>
          </div>

          <div data-testid="phase-indicator" className="nb2d-phase-desc-banner">
            <span className="nb2d-phase-tag">{`ขั้นที่ ${phase}/3`}</span>
            <span className="nb2d-phase-text">
              {getPhaseDescriptionTh(primaryItem, phase)}
            </span>
          </div>
        </div>

        {/* Visual Flow Arena: Large Numbers Linked by Progressively Revealed SVG Arrows */}
        {flowState.hasChanges ? (
          <div className="nb2d-flow-arena">
            {flowState.items.map((item) => {
              const isItemNumeric = isNumericTypeOrValue(item.varType, item.newValue);

              return (
                <div key={item.varName} className="nb2d-flow-track">
                  {/* Case 1: Existing Variable Update: Node Prev -> Arrow 1 -> Node New -> Arrow 2 -> Node Dest */}
                  {item.hasPrev && item.prevNode && (
                    <>
                      <div
                        data-testid="flow-node-prev"
                        className={`nb2d-node nb2d-node-prev ${
                          phase === 1 ? 'nb2d-node-highlighted' : 'nb2d-node-subtle'
                        }`}
                      >
                        <span className="nb2d-node-sublabel">ค่าเดิมก่อนหน้า</span>
                        <div className="nb2d-node-val nb2d-node-prev-val">
                          {item.prevNode.value}
                        </div>
                      </div>

                      <FlowArrow
                        testId="flow-arrow-1"
                        isActive={phase >= 2}
                        labelTh="เปลี่ยนเป็น"
                        directionLabel="➔"
                      />
                    </>
                  )}

                  {/* Case 2: New Value Node (for both new variables and updates) */}
                  <div
                    data-testid="flow-node-new"
                    className={`nb2d-node nb2d-node-new ${
                      phase === (item.hasPrev ? 2 : 1) || phase === 2
                        ? 'nb2d-node-highlighted'
                        : phase >= 2
                        ? 'nb2d-node-confirmed'
                        : 'nb2d-node-waiting'
                    } ${item.newNode.isFloat ? 'nb2d-val-float' : ''} ${
                      item.newNode.isNegative ? 'nb2d-val-negative' : ''
                    }`}
                  >
                    <span className="nb2d-node-sublabel">
                      {item.hasPrev ? 'ค่าใหม่ที่คำนวณได้' : 'ค่าใหม่ที่เตรียมบันทึก'}
                    </span>
                    <div className="nb2d-node-val nb2d-node-current-val">
                      {item.newNode.value}
                    </div>
                    {item.varType && (
                      <span className={`nb2d-type-badge ${getTypeBadgeClass(item.varType)}`}>
                        {item.varType}
                      </span>
                    )}
                  </div>

                  {/* Arrow to Destination Variable (Revealed progressively in Phase 2/3) */}
                  <FlowArrow
                    testId="flow-arrow-2"
                    isActive={phase >= (item.hasPrev ? 3 : 2)}
                    labelTh="เก็บลงใน"
                    directionLabel="➔"
                  />

                  {/* Destination Variable Node */}
                  <div
                    data-testid="flow-node-dest"
                    className={`nb2d-node nb2d-node-dest ${
                      phase === 3 ? 'nb2d-node-highlighted nb2d-node-stored' : 'nb2d-node-waiting'
                    }`}
                  >
                    <span className="nb2d-node-sublabel">ตัวแปรเป้าหมาย</span>
                    <div className="nb2d-node-dest-name">{item.destNode.varName}</div>
                    <div className="nb2d-node-dest-badge">
                      {phase === 3 ? `= ${item.newValue}` : '(รอรับค่า)'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Recorded values remain visible; no invented update or transfer. */
          <div data-testid="flow-no-change" className="nb2d-stable-state">
            {hasVariables ? <>
              <div className="nb2d-stable-heading">ค่าที่สังเกตได้ตอนนี้ <span>ยังเป็นค่าเดิม</span></div>
              <div className="nb2d-stable-grid">
                {variables.map(variable => <article key={variable.name} className="nb2d-stable-card">
                  <div className="nb2d-stable-name">{variable.name} <small>{variable.type}</small></div>
                  <div data-testid="stable-value" className={`nb2d-stable-value ${variable.type === 'int' || variable.type === 'float' ? 'nb2d-stable-number' : ''}`}>{variable.value}</div>
                  <span className="nb2d-stable-label">ยังเป็นค่าเดิม</span>
                </article>)}
              </div>
              <p className="nb2d-stable-note">ค่าเท่ากับ snapshot ก่อนหน้า — ไม่ได้หมายความว่าไม่มีการกำหนดค่าซ้ำ</p>
            </> : <p className="nb2d-stable-note">ยังไม่มีค่าตัวแปรที่บันทึก</p>}
          </div>
        )}
      </section>

      {/* Empty State before running code */}
      {isEmpty && (
        <section className="nb2d-empty-state" aria-label="สถานะเริ่มต้นพร้อมใช้งาน">
          <div className="nb2d-empty-icon" aria-hidden="true">
            <Lightbulb size={40} />
          </div>
          <h2 className="nb2d-empty-title">กระดานแสดงค่าตัวเลขและการคำนวณ 2D</h2>
          <p className="nb2d-empty-desc">
            พร้อมประมวลผลโค้ด Python — กดปุ่ม &apos;รันปกติ&apos; หรือ &apos;แอนิเมชันทีละขั้น (Slow)&apos;
            เพื่อสังเกตค่าตัวเลข ตัวแปร และโฟลว์ลูกศรทีละสเต็ปบนกระดานนี้
          </p>
          <div className="nb2d-empty-tips">
            <span className="nb2d-tip-item"><ArrowRight size={14} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} />ลูกศรอธิบายการส่งต่อค่า 3 ขั้นตอน</span>
            <span className="nb2d-tip-item"><Grid2x2 size={14} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} />ตัวเลขมุมมองตรง 2D ชัดเจน</span>
            <span className="nb2d-tip-item"><ClipboardList size={14} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '4px' }} />รองรับ int, float, list, dict</span>
          </div>
        </section>
      )}

      {/* Main Variable and Number Cards Grid */}
      {hasVariables && (
        <section className="nb2d-variables-section" aria-label="รายการตัวแปรและค่าตัวเลขทั้งหมด">
          <div className="nb2d-section-heading">
            <h3 className="nb2d-heading-text">หน่วยความจำตัวแปร (Variables in Memory)</h3>
            {genericModel.omittedCount > 0 && (
              <span className="nb2d-omitted-notice" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={13} aria-hidden="true" /> แสดง {variables.length} ตัวแปรแรก (ซ่อน +{genericModel.omittedCount} ตัวแปร)
              </span>
            )}
          </div>

          <div className="nb2d-grid">
            {variables.map((variable: VariableBox) => {
              const isNumeric = isNumericTypeOrValue(variable.type, variable.value);
              const isFloat = variable.type === 'float' || variable.value.includes('.');
              const isNegative = variable.value.trim().startsWith('-');
              const isChanged = variable.isChanged;
              const hasPrev =
                variable.previousValue !== undefined &&
                variable.previousValue !== variable.value;

              return (
                <article
                  key={variable.name}
                  className={`nb2d-card ${isChanged ? 'nb2d-card-changed' : ''}`}
                >
                  <div className="nb2d-card-header">
                    <span className="nb2d-var-name">{variable.name}</span>
                    <span className={`nb2d-type-badge ${getTypeBadgeClass(variable.type)}`}>
                      {variable.type}
                    </span>
                  </div>

                  {/* Large Front-facing numeric value vs string/collection */}
                  {isNumeric ? (
                    <div
                      key={`${variable.name}:${variable.value}:${currentEvent?.seq ?? 'idle'}`}
                      className={`nb2d-number-val ${isFloat ? 'nb2d-val-float' : ''} ${
                        isNegative ? 'nb2d-val-negative' : ''
                      } ${isChanged ? 'nb2d-val-changed' : ''}`}
                    >
                      {variable.value}
                    </div>
                  ) : (
                    <div className="nb2d-val-non-number">{variable.rawPreview}</div>
                  )}

                  {/* List / Container chips if present */}
                  {variable.parsed.elements && variable.parsed.elements.length > 0 && (
                    <div className="nb2d-container-chips">
                      {variable.parsed.elements.map((elem, idx) => {
                        const chipText =
                          elem.key !== undefined
                            ? `${elem.key}: ${elem.value}`
                            : elem.index !== undefined
                            ? `[${elem.index}]: ${elem.value}`
                            : elem.value;
                        return (
                          <span key={idx} className="nb2d-container-chip">
                            {chipText}
                          </span>
                        );
                      })}
                      {variable.parsed.hasMore && (
                        <span className="nb2d-container-chip nb2d-chip-more">...</span>
                      )}
                    </div>
                  )}

                  {/* Diff / Value Transfer: Before -> After */}
                  {isChanged && (
                    <div className="nb2d-transfer-row">
                      {variable.isNew ? (
                        <span className="nb2d-new-badge">สร้างใหม่</span>
                      ) : hasPrev ? (
                        <>
                          <span className="nb2d-prev-val">{variable.previousValue}</span>
                          <span className="nb2d-transfer-arrow" aria-hidden="true">
                            →
                          </span>
                          <span className="nb2d-current-val">{variable.value}</span>
                        </>
                      ) : (
                        <span className="nb2d-current-val">อัปเดต</span>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Stdout Printed Output Panel */}
      {hasStdout && genericModel.recentStdout && (
        <section className="nb2d-stdout-panel" aria-label="เอาต์พุตจากการพิมพ์">
          <div className="nb2d-stdout-title">เอาต์พุตล่าสุด (Recent Print Output)</div>
          <div className="nb2d-stdout-text">{genericModel.recentStdout}</div>
        </section>
      )}

      {/* Exception Alert Panel */}
      {hasException && (
        <section className="nb2d-exception-panel" role="alert" aria-label="แจ้งเตือนข้อผิดพลาด">
          <div className="nb2d-exception-text" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <AlertTriangle size={16} aria-hidden="true" /> {genericModel.exceptionMessage || 'เกิดข้อผิดพลาดในการประมวลผล'}
          </div>
        </section>
      )}
    </div>
  );
};
