import React from 'react';
import { History, Trash2 } from 'lucide-react';

export interface ReplayCacheControlsProps {
  enabled: boolean;
  available: boolean;
  busy: boolean;
  message: string;
  onToggle: (enabled: boolean) => void;
  onReplay: () => void;
  onClear: () => void;
  open?: boolean;
}

export function ReplayCacheControls({
  enabled,
  available,
  busy,
  message,
  onToggle,
  onReplay,
  onClear,
  open,
}: ReplayCacheControlsProps) {
  return (
    <details
      className="replay-cache-controls"
      aria-label="แคชแอนิเมชัน"
      open={open}
      style={{
        background: '#252526',
        borderBottom: '1px solid #333333',
        padding: '5px 14px',
        fontSize: 12,
        color: '#cccccc',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          userSelect: 'none',
          color: '#858585',
          fontSize: '11px',
          lineHeight: '18px',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
          <History size={12} aria-hidden="true" style={{ color: '#007acc' }} />
          <span style={{ fontWeight: 500, color: '#cccccc' }}>แคชแอนิเมชัน (Replay Cache)</span>
          {available ? (
            <span style={{ color: '#38bdf8', fontSize: '10px' }}>(มีข้อมูล replay)</span>
          ) : null}
        </span>
      </summary>

      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '6px 0 2px 0',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            cursor: busy ? 'not-allowed' : 'pointer',
            userSelect: 'none',
            color: '#cccccc',
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => onToggle(e.target.checked)}
            style={{
              cursor: busy ? 'not-allowed' : 'pointer',
              accentColor: '#007acc',
            }}
          />
          <span>เก็บ replay หลังปิดหน้า (เฉพาะเบราว์เซอร์นี้)</span>
        </label>

        <button
          type="button"
          onClick={onReplay}
          disabled={busy || !available}
          className="btn-secondary"
          title="ดูผลเก่า ไม่รัน Python หรือทำ side effects ซ้ำ"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            background: '#2d2d30',
            color: busy || !available ? '#666666' : '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: 4,
            fontSize: 12,
            cursor: busy || !available ? 'not-allowed' : 'pointer',
            opacity: busy || !available ? 0.6 : 1,
          }}
        >
          <History size={13} aria-hidden="true" />
          <span>ดูแอนิเมชันเดิม</span>
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={busy}
          className="btn-secondary"
          title="ล้างแคช replay"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 9px',
            background: '#2d2d30',
            color: busy ? '#666666' : '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: 4,
            fontSize: 12,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Trash2 size={13} aria-hidden="true" />
          <span>ล้างแคช replay</span>
        </button>

        <span
          role="status"
          style={{
            color: '#858585',
            fontSize: 11,
            lineHeight: 1.4,
            marginLeft: 'auto',
          }}
        >
          {message || 'รันใหม่ให้ผลใหม่เสมอ • Cache เก็บโค้ด ค่า และ output ซึ่งอาจมีข้อมูลส่วนตัว'}
        </span>
      </div>
    </details>
  );
}
