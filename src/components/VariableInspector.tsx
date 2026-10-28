import React from 'react';
import { Variable, Box } from 'lucide-react';
import type { Value } from '../runtime/types';

interface VariableInspectorProps {
  locals: Record<string, Value>;
}

export const VariableInspector: React.FC<VariableInspectorProps> = ({ locals }) => {
  const entries = Object.entries(locals);

  return (
    <div
      className="variable-inspector"
      role="region"
      aria-label="ตัวตรวจสอบตัวแปร (Variable Inspector)"
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
        <Variable size={14} style={{ color: '#4ec9b0' }} aria-hidden="true" />
        <span>ตัวแปรในสโคป (Variables)</span>
        <span style={{ fontSize: '11px', color: '#858585' }}>({entries.length})</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {entries.length === 0 ? (
          <div
            style={{
              padding: '16px',
              textAlign: 'center',
              color: '#666666',
              fontStyle: 'italic',
            }}
          >
            ยังไม่มีตัวแปรที่ถูกกำหนดค่าในสโคปนี้
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            }}
          >
            <thead>
              <tr style={{ color: '#858585', borderBottom: '1px solid #333333', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>ชื่อตัวแปร</th>
                <th style={{ padding: '4px 8px' }}>ชนิดข้อมูล</th>
                <th style={{ padding: '4px 8px' }}>ค่าปัจจุบัน</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([name, item]) => (
                <tr
                  key={name}
                  style={{
                    borderBottom: '1px solid #2a2a2a',
                    transition: 'background-color 0.2s',
                  }}
                >
                  <td style={{ padding: '6px 8px', color: '#9cdcfe', fontWeight: 500 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Box size={12} style={{ color: '#4ec9b0' }} aria-hidden="true" />
                      <span>{name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px', color: '#4ec9b0' }}>
                    <span
                      style={{
                        padding: '1px 6px',
                        background: 'rgba(78, 201, 176, 0.1)',
                        borderRadius: '3px',
                        border: '1px solid rgba(78, 201, 176, 0.3)',
                      }}
                    >
                      {item.type}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '6px 8px',
                      color: item.type === 'str' ? '#ce9178' : item.type === 'int' || item.type === 'float' ? '#b5cea8' : '#d4d4d4',
                      wordBreak: 'break-all',
                    }}
                  >
                    {item.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
