import React from 'react';
import { Layers } from 'lucide-react';

interface CallStackProps {
  stack: string[];
  activeLine?: number;
}

export const CallStack: React.FC<CallStackProps> = ({ stack, activeLine = 0 }) => {
  const frames = stack.length > 0 ? stack : ['<module>'];

  return (
    <div
      className="callstack-panel"
      role="region"
      aria-label="ลำดับการเรียกฟังก์ชัน (Call Stack)"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#1e1e1e',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid #333333',
        fontSize: '12px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          background: '#252526',
          borderBottom: '1px solid #333333',
          color: '#cccccc',
          fontWeight: 500,
        }}
      >
        <Layers size={14} style={{ color: '#dcdcaa' }} aria-hidden="true" />
        <span>ลำดับการเรียก (Call Stack)</span>
        <span style={{ fontSize: '11px', color: '#858585' }}>({frames.length} frames)</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {frames.map((frame, index) => {
            const isTop = index === frames.length - 1;
            return (
              <li
                key={`${frame}_${index}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  borderRadius: '4px',
                  background: isTop ? 'rgba(0, 122, 204, 0.2)' : 'transparent',
                  border: isTop ? '1px solid rgba(0, 122, 204, 0.4)' : '1px solid transparent',
                  marginBottom: '4px',
                  color: isTop ? '#ffffff' : '#cccccc',
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isTop ? '#007acc' : '#555555',
                    }}
                  />
                  <span style={{ fontWeight: isTop ? 600 : 400 }}>{frame}</span>
                </div>
                {isTop && activeLine > 0 ? (
                  <span style={{ color: '#858585', fontSize: '11px' }}>line {activeLine}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};
