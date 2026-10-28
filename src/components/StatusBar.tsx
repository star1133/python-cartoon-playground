import React from 'react';
import { Terminal, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export interface StatusBarProps {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'waiting_input' | 'done' | 'stopped' | 'error';
  mode: 'normal' | 'slow';
  activeLine?: number;
  languageStatus?: 'initializing' | 'ready' | 'fallback' | 'error';
}

export const StatusBar: React.FC<StatusBarProps> = ({
  status,
  mode,
  activeLine = 0,
  languageStatus,
}) => {
  let statusText = 'พร้อม';
  let StatusIcon = CheckCircle2;
  let statusColor = '#89d185';

  if (status === 'initializing') {
    statusText = 'กำลังโหลดสภาพแวดล้อม';
    StatusIcon = Loader2;
    statusColor = '#4fc1ff';
  } else if (status === 'running') {
    statusText = mode === 'slow' ? 'กำลังแสดงแอนิเมชัน' : 'กำลังรันโค้ด';
    StatusIcon = Loader2;
    statusColor = '#4fc1ff';
  } else if (status === 'paused') {
    statusText = 'พักชั่วคราว';
    StatusIcon = AlertCircle;
    statusColor = '#cca700';
  } else if (status === 'waiting_input') {
    statusText = 'รอรับข้อมูล input()';
    StatusIcon = AlertCircle;
    statusColor = '#cca700';
  } else if (status === 'stopped') {
    statusText = 'หยุดแล้ว';
    StatusIcon = AlertCircle;
    statusColor = '#cca700';
  } else if (status === 'error') {
    statusText = 'เกิดข้อผิดพลาด';
    StatusIcon = AlertCircle;
    statusColor = '#f14c4c';
  }

  return (
    <footer
      className="vscode-status-bar"
      role="contentinfo"
      aria-label="แถบสถานะโปรแกรม"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 10px',
        background: status === 'error' ? '#f14c4c' : '#1e1e1e',
        color: status === 'error' ? '#ffffff' : '#cccccc',
        borderTop: '1px solid #333',
        fontSize: '11px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
        height: '24px',
      }}
    >
      {/* ซ้าย: สถานะการรัน */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <StatusIcon
            size={12}
            style={{
              animation: status === 'running' || status === 'initializing' ? 'spin 1s linear infinite' : 'none',
              color: statusColor,
            }}
            aria-hidden="true"
          />
          <span style={{ fontWeight: 500 }}>{statusText}</span>
        </div>

        {activeLine > 0 ? (
          <div>
            <span>บรรทัดปัจจุบัน: <strong>{activeLine}</strong></span>
          </div>
        ) : null}
      </div>

      {/* ขวา: ข้อมูลสภาพแวดล้อมและสถานะ Language Service */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        {languageStatus ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background:
                  languageStatus === 'ready'
                    ? '#89d185'
                    : languageStatus === 'fallback'
                    ? '#cca700'
                    : '#4fc1ff',
                display: 'inline-block',
              }}
              aria-hidden="true"
            />
            <span>
              {languageStatus === 'ready'
                ? 'IntelliSense (Jedi)'
                : languageStatus === 'fallback'
                ? 'IntelliSense (Static Fallback)'
                : 'IntelliSense (กำลังโหลด)'}
            </span>
          </div>
        ) : null}

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Terminal size={11} aria-hidden="true" />
          <span>Python (WASM)</span>
        </div>
        <span>UTF-8</span>
        <span>Spaces: 4</span>
      </div>
    </footer>
  );
};
