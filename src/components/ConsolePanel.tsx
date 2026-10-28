import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Trash2, Send } from 'lucide-react';

export interface ConsoleOutputEntry {
  id: string;
  text: string;
  channel: 'stdout' | 'stderr' | 'system';
  timestamp: number;
}

interface ConsolePanelProps {
  outputs: ConsoleOutputEntry[];
  onClear: () => void;
  waitingForInput: boolean;
  onSubmitInput: (text: string) => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  outputs,
  onClear,
  waitingForInput,
  onSubmitInput,
}) => {
  const [inputText, setInputText] = useState('');
  const logContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // เลื่อนหน้าจอลงล่างสุดอัตโนมัติเมื่อมีข้อความใหม่
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [outputs]);

  // โฟกัสช่องกรอกข้อมูลอัตโนมัติเมื่อรอรับ input()
  useEffect(() => {
    if (waitingForInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [waitingForInput]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitingForInput) return;
    onSubmitInput(inputText);
    setInputText('');
  };

  return (
    <div
      className="console-panel"
      role="region"
      aria-label="หน้าต่างแสดงผลคอนโซล (Console Output)"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#181818',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid #333333',
        fontSize: '13px',
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      }}
    >
      {/* Console Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: '#222222',
          borderBottom: '1px solid #333333',
          color: '#cccccc',
          fontSize: '12px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TerminalIcon size={14} style={{ color: '#4fc1ff' }} aria-hidden="true" />
          <span style={{ fontWeight: 500 }}>คอนโซลผลลัพธ์ (Terminal)</span>
          {waitingForInput ? (
            <span
              style={{
                display: 'inline-block',
                padding: '2px 6px',
                background: '#ff9800',
                color: '#000000',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              รอข้อมูล input()
            </span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onClear}
          title="ล้างข้อความในคอนโซล"
          aria-label="ล้างข้อความในคอนโซล"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: 'none',
            color: '#858585',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '2px 6px',
          }}
        >
          <Trash2 size={12} aria-hidden="true" />
          <span>ล้างหน้าจอ</span>
        </button>
      </div>

      {/* Console Output Log */}
      <div
        ref={logContainerRef}
        className="console-log-area"
        tabIndex={0}
        aria-label="ประวัติเอาต์พุตคอนโซล"
        style={{
          flex: 1,
          minHeight: '120px',
          padding: '10px 12px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          lineHeight: '1.5',
        }}
      >
        {outputs.length === 0 ? (
          <div style={{ color: '#555555', fontStyle: 'italic', fontFamily: 'system-ui, sans-serif' }}>
            ยังไม่มีข้อความส่งออกจากโปรแกรม (กด &quot;รันโค้ด&quot; เพื่อดูผลลัพธ์)
          </div>
        ) : (
          outputs.map((item) => {
            let textColor = '#cccccc';
            if (item.channel === 'stderr') textColor = '#f48771';
            else if (item.channel === 'system') textColor = '#4fc1ff';

            return (
              <span key={item.id} style={{ color: textColor }}>
                {item.text}
              </span>
            );
          })
        )}
      </div>

      {/* Interactive Stdin Input Form */}
      {waitingForInput ? (
        <form
          onSubmit={handleInputSubmit}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            background: '#252526',
            borderTop: '1px solid #3e3e42',
            gap: '6px',
          }}
        >
          <span style={{ color: '#4fc1ff', fontWeight: 600 }}>&gt;&gt;&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="พิมพ์ข้อความตอบกลับ input() แล้วกด Enter..."
            aria-label="ช่องป้อนข้อมูลอินพุต"
            style={{
              flex: 1,
              background: '#1e1e1e',
              border: '1px solid #007acc',
              borderRadius: '4px',
              padding: '6px 10px',
              color: '#ffffff',
              fontSize: '13px',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            aria-label="ส่งข้อมูลอินพุต"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: '#007acc',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 12px',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Send size={12} aria-hidden="true" />
            <span>ส่ง</span>
          </button>
        </form>
      ) : null}
    </div>
  );
};
