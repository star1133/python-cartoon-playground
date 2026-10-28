import React from 'react';
import { ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, History } from 'lucide-react';

interface TimelineProps {
  currentIndex: number;
  totalEvents: number;
  onSeek: (index: number) => void;
  onStepPrev: () => void;
  onStepNext: () => void;
  activeLine?: number;
}

export const Timeline: React.FC<TimelineProps> = ({
  currentIndex,
  totalEvents,
  onSeek,
  onStepPrev,
  onStepNext,
  activeLine = 0,
}) => {
  const hasEvents = totalEvents > 0;
  const isReplaying = hasEvents && currentIndex < totalEvents - 1;

  return (
    <div
      className="timeline-bar"
      role="region"
      aria-label="แถบควบคุมเส้นเวลา Replay Timeline"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 14px',
        background: '#1e1e1e',
        borderTop: '1px solid #333333',
        gap: '12px',
        fontSize: '12px',
        color: '#cccccc',
      }}
    >
      {/* ส่วนควบคุมการข้ามขั้นตอน */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          type="button"
          onClick={() => onSeek(0)}
          disabled={!hasEvents || currentIndex <= 0}
          title="ขั้นตอนแรกสุด"
          aria-label="ไปยังขั้นตอนแรกสุด"
          style={{
            background: 'transparent',
            border: 'none',
            color: hasEvents && currentIndex > 0 ? '#cccccc' : '#555555',
            cursor: hasEvents && currentIndex > 0 ? 'pointer' : 'not-allowed',
            padding: '4px',
          }}
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onStepPrev}
          disabled={!hasEvents || currentIndex <= 0}
          title="ย้อนกลับ 1 ขั้น"
          aria-label="ย้อนกลับหนึ่งขั้น"
          style={{
            background: 'transparent',
            border: 'none',
            color: hasEvents && currentIndex > 0 ? '#cccccc' : '#555555',
            cursor: hasEvents && currentIndex > 0 ? 'pointer' : 'not-allowed',
            padding: '4px',
          }}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onStepNext}
          disabled={!hasEvents || currentIndex >= totalEvents - 1}
          title="ก้าวไปข้างหน้า 1 ขั้น"
          aria-label="ก้าวไปข้างหน้าหนึ่งขั้น"
          style={{
            background: 'transparent',
            border: 'none',
            color: hasEvents && currentIndex < totalEvents - 1 ? '#cccccc' : '#555555',
            cursor: hasEvents && currentIndex < totalEvents - 1 ? 'pointer' : 'not-allowed',
            padding: '4px',
          }}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => onSeek(totalEvents - 1)}
          disabled={!hasEvents || currentIndex >= totalEvents - 1}
          title="ขั้นตอนล่าสุด"
          aria-label="ไปยังขั้นตอนล่าสุด"
          style={{
            background: 'transparent',
            border: 'none',
            color: hasEvents && currentIndex < totalEvents - 1 ? '#cccccc' : '#555555',
            cursor: hasEvents && currentIndex < totalEvents - 1 ? 'pointer' : 'not-allowed',
            padding: '4px',
          }}
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </button>
      </div>

      {/* Slider Scrubber */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalEvents - 1)}
          value={hasEvents ? currentIndex : 0}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          disabled={!hasEvents}
          aria-label="แถบเลื่อนเวลาประมวลผล"
          style={{
            flex: 1,
            cursor: hasEvents ? 'pointer' : 'not-allowed',
            accentColor: '#007acc',
          }}
        />

        <div style={{ minWidth: '110px', textAlign: 'right', fontSize: '11px', color: '#999999' }}>
          {hasEvents ? (
            <span>
              ขั้นตอน <strong style={{ color: '#ffffff' }}>{currentIndex + 1}</strong> / {totalEvents}
            </span>
          ) : (
            <span>ยังไม่มีประวัติ</span>
          )}
        </div>
      </div>

      {/* ป้ายสถานะ Replay หรือบรรทัดปัจจุบัน */}
      {isReplaying ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            background: 'rgba(255, 152, 0, 0.15)',
            border: '1px solid rgba(255, 152, 0, 0.4)',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#ffb74d',
          }}
        >
          <History size={12} aria-hidden="true" />
          <span>ย้อนดูประวัติ</span>
        </div>
      ) : activeLine > 0 ? (
        <div
          style={{
            padding: '2px 8px',
            background: 'rgba(0, 122, 204, 0.15)',
            border: '1px solid rgba(0, 122, 204, 0.4)',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#4fc1ff',
          }}
        >
          บรรทัด {activeLine}
        </div>
      ) : null}
    </div>
  );
};
