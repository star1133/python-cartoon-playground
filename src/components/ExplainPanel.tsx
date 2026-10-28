import React, { useState } from 'react';
import { Zap, Code2, BookOpen, ChevronsDown, ChevronsUp } from 'lucide-react';
import type { TraceEvent } from '../runtime/types';
import { explainTraceEvent } from '../explain/thaiExplainer';
import { explainWhyEvent } from '../explain/whyExplainer';

export interface ExplainPanelProps {
  currentEvent: TraceEvent | null;
  prevEvent?: TraceEvent | null;
  codeSnapshot?: string;
  currentIndex: number;
  totalEvents: number;
}

export const ExplainPanel: React.FC<ExplainPanelProps> = ({
  currentEvent,
  prevEvent,
  codeSnapshot,
  currentIndex,
  totalEvents,
}) => {
  const [showWhy, setShowWhy] = useState(false);

  const explanation = currentEvent
    ? explainTraceEvent(currentEvent, codeSnapshot, prevEvent)
    : 'กด "รันโค้ด" เพื่อเริ่ม →';

  const why = currentEvent
    ? explainWhyEvent(currentEvent, codeSnapshot, prevEvent)
    : null;

  const isActive = currentEvent !== null;

  return (
    <div
      className={`explain-panel ${isActive ? 'explain-card-active' : ''}`.trim()}
      role="region"
      aria-label="คำอธิบายการทำงานภาษาไทย"
      style={{
        display: 'flex',
        flexDirection: 'column',
        padding: '10px 14px',
        background: '#1f2430',
        borderRadius: '6px',
        border: '1px solid #2d3748',
        borderLeft: isActive ? '3px solid #38bdf8' : '3px solid #2d3748',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
        gap: '6px',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#ffcc00' }}>
          <Zap size={14} aria-hidden="true" />
          <span style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '0.02em' }}>
            คำอธิบายทีละขั้น
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {currentEvent && currentEvent.line > 0 ? (
            <>
              <span
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '3px',
                  padding: '1px 7px', background: '#2d3748', color: '#63b3ed',
                  borderRadius: '4px', fontSize: '10px',
                }}
              >
                <Code2 size={10} aria-hidden="true" />
                บรรทัด {currentEvent.line}
              </span>
              {totalEvents > 0 && (
                <span style={{
                  padding: '1px 7px', background: '#2b6cb0', color: '#fff',
                  borderRadius: '4px', fontSize: '10px', fontWeight: 500,
                }}>
                  {currentIndex + 1}/{totalEvents}
                </span>
              )}
            </>
          ) : null}

          {/* Why button — only when there is a why explanation */}
          {why && (
            <button
              type="button"
              onClick={() => setShowWhy(v => !v)}
              aria-expanded={showWhy}
              aria-controls="explain-why-panel"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                padding: '2px 8px',
                background: showWhy ? '#3730a3' : '#1e293b',
                border: `1px solid ${showWhy ? '#6366f1' : '#334155'}`,
                borderRadius: '4px', cursor: 'pointer',
                color: showWhy ? '#c7d2fe' : '#94a3b8',
                fontSize: '11px', fontWeight: 600,
                transition: 'background 0.15s, border-color 0.15s',
              }}
            >
              <BookOpen size={11} aria-hidden="true" />
              ทำไม?
              {showWhy ? <ChevronsUp size={10} aria-hidden="true" /> : <ChevronsDown size={10} aria-hidden="true" />}
            </button>
          )}
        </div>
      </div>

      {/* Main ADHD-friendly explanation — short, emoji-led */}
      <div
        key={currentEvent ? currentEvent.seq : 'idle'}
        className="explain-panel-text"
        style={{
          fontSize: 'clamp(14px, 1.1vw, 17px)',
          lineHeight: '1.55',
          color: '#e2e8f0',
          fontWeight: 500,
        }}
      >
        {explanation}
      </div>

      {/* Why panel — expandable, shows reasoning behind the event */}
      {why && (
        <div
          id="explain-why-panel"
          className={`explain-why-expand ${showWhy ? 'open' : ''}`.trim()}
          style={{
            background: '#0f172a',
            borderRadius: '4px',
            border: 'none',
            borderLeft: '3px solid #6366f1',
            fontSize: 'clamp(12px, 0.95vw, 15px)',
            lineHeight: '1.7',
            color: '#c7d2fe',
            padding: '8px 12px',
          }}
          aria-live="polite"
          aria-hidden={!showWhy}
        >
          {why
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .map((paragraph, idx) => (
              <p key={idx} style={{ margin: idx === 0 ? 0 : '6px 0 0 0' }}>
                {paragraph}
              </p>
            ))}
        </div>
      )}
    </div>
  );
};
