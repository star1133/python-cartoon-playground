import React, { useState, useEffect } from 'react';
import { MonacoEditor } from './MonacoEditor';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { Smartphone, Monitor } from 'lucide-react';
import { prefersMobileLayout } from './mobileLayout';

interface EditorHostProps {
  value: string;
  onChange: (value: string) => void;
  activeLine?: number;
  readOnly?: boolean;
}

export const EditorHost: React.FC<EditorHostProps> = ({
  value,
  onChange,
  activeLine = 0,
  readOnly = false,
}) => {
  const [useCodeMirror, setUseCodeMirror] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return prefersMobileLayout();
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      if (prefersMobileLayout()) {
        setUseCodeMirror(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      className="editor-host-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: '#1e1e1e',
        borderRadius: '6px',
        overflow: 'hidden',
        border: '1px solid #333333',
      }}
    >
      {/* Editor Sub-header Bar */}
      <div
        className="editor-sub-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 12px',
          background: '#252526',
          borderBottom: '1px solid #333333',
          fontSize: '12px',
          color: '#cccccc',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              padding: '2px 8px',
              background: '#1e1e1e',
              borderRadius: '4px',
              border: '1px solid #3e3e42',
              color: '#4fc1ff',
              fontWeight: 500,
            }}
          >
            main.py
          </span>
          <span style={{ color: '#858585', fontSize: '11px' }}>
            {useCodeMirror ? 'โหมดมือถือ (CodeMirror 6)' : 'โหมดเดสก์ท็อป (Monaco Editor)'}
          </span>
        </div>

        {/* ปุ่มสลับโหมดเอดิเตอร์ */}
        <button
          type="button"
          onClick={() => setUseCodeMirror((prev) => !prev)}
          className="btn-editor-toggle"
          title={useCodeMirror ? 'สลับเป็น Monaco Editor (Desktop)' : 'สลับเป็น CodeMirror (Mobile Touch)'}
          aria-label="สลับประเภทเอดิเตอร์"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'transparent',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            padding: '3px 8px',
            color: '#cccccc',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          {useCodeMirror ? (
            <>
              <Monitor size={12} aria-hidden="true" />
              <span>ใช้ Monaco</span>
            </>
          ) : (
            <>
              <Smartphone size={12} aria-hidden="true" />
              <span>ใช้ CodeMirror</span>
            </>
          )}
        </button>
      </div>

      {/* Editor Area */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {useCodeMirror ? (
          <CodeMirrorEditor
            value={value}
            onChange={onChange}
            activeLine={activeLine}
            readOnly={readOnly}
          />
        ) : (
          <MonacoEditor
            value={value}
            onChange={onChange}
            activeLine={activeLine}
            readOnly={readOnly}
          />
        )}
      </div>
    </div>
  );
};
