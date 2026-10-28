import React from 'react';
import { prefersMobileLayout } from '../editor/mobileLayout';
import {
  Play,
  Square,
  Pause,
  SkipForward,
  SkipBack,
  Download,
  Upload,
  RotateCcw,
  Package,
  Layers,
  Save,
  Clapperboard,
  Wand2,
} from 'lucide-react';
import { EXAMPLES, type CodeExample } from '../storage/examples';

interface RunToolbarProps {
  status: 'idle' | 'initializing' | 'running' | 'paused' | 'waiting_input' | 'done' | 'stopped' | 'error';
  mode: 'normal' | 'slow';
  speed: number;
  onRun: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onStepNext: () => void;
  onStepPrev: () => void;
  onSetMode: (mode: 'normal' | 'slow') => void;
  onSetSpeed: (speed: number) => void;
  onSelectExample: (example: CodeExample) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
  onSave: () => void;
  onOpenPackages: () => void;
}

export const RunToolbar: React.FC<RunToolbarProps> = ({
  status,
  mode,
  speed,
  onRun,
  onStop,
  onPause,
  onResume,
  onStepNext,
  onStepPrev,
  onSetMode,
  onSetSpeed,
  onSelectExample,
  onExport,
  onImport,
  onReset,
  onSave,
  onOpenPackages,
}) => {
  const isRunning = status === 'running' || status === 'waiting_input';
  const isPaused = status === 'paused';
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [moreOpen, setMoreOpen] = React.useState(() => !prefersMobileLayout());
  React.useEffect(() => {
    const resize = () => setMoreOpen(!prefersMobileLayout());
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImport(file);
      e.target.value = '';
    }
  };

  return (
    <div
      className="run-toolbar"
      role="toolbar"
      aria-label="แถบควบคุมการรันโค้ดและการตั้งค่า"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        background: '#252526',
        borderBottom: '1px solid #333333',
        gap: '8px',
      }}
    >
      {/* ฝั่งซ้าย: กลุ่มปุ่มรันและควบคุม Playback */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* สลับโหมด รันปกติ / แอนิเมชันช้า */}
        <div
          className="mode-toggle-group"
          role="group"
          aria-label="เลือกโหมดการรัน"
          style={{
            display: 'inline-flex',
            borderRadius: '6px',
            border: '1px solid #3e3e42',
            background: '#18181b',
            padding: '2px',
            gap: '2px',
          }}
        >
          <button
            type="button"
            className={`btn-mode ${mode === 'normal' ? 'active' : ''}`}
            onClick={() => onSetMode('normal')}
            disabled={isRunning}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              border: 'none',
              borderRadius: '4px',
              background: mode === 'normal' ? '#007acc' : 'transparent',
              color: mode === 'normal' ? '#ffffff' : '#a1a1aa',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: mode === 'normal' ? 600 : 400,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            รันปกติ
          </button>
          <button
            type="button"
            className={`btn-mode ${mode === 'slow' ? 'active btn-mode-anim-active' : ''}`}
            onClick={() => onSetMode('slow')}
            disabled={isRunning}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              fontSize: '12px',
              border: 'none',
              borderRadius: '4px',
              background: mode === 'slow' ? '#4f46e5' : 'transparent',
              color: mode === 'slow' ? '#ffffff' : '#a1a1aa',
              cursor: isRunning ? 'not-allowed' : 'pointer',
              fontWeight: mode === 'slow' ? 600 : 400,
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            <Clapperboard size={13} aria-hidden="true" />
            <span>แอนิเมชันทีละขั้น</span>
          </button>
        </div>

        {/* ปุ่ม Run (รันโค้ด) */}
        {!isRunning && !isPaused ? (
          <button
            type="button"
            onClick={onRun}
            className="btn-primary-run"
            aria-label="รันโค้ด Python"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: '#2ea043',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {mode === 'slow' ? (
              <Wand2 size={14} aria-hidden="true" />
            ) : (
              <Play size={14} fill="#ffffff" aria-hidden="true" />
            )}
            <span>รันโค้ด</span>
          </button>
        ) : null}

        {/* ปุ่ม Stop (หยุด) */}
        {isRunning || isPaused ? (
          <button
            type="button"
            onClick={onStop}
            className="btn-danger-stop"
            aria-label="หยุดการทำงาน"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: '#d32f2f',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Square size={13} fill="#ffffff" aria-hidden="true" />
            <span>หยุด</span>
          </button>
        ) : null}

        {/* ปุ่ม Pause / Resume สำหรับโหมด Slow */}
        {mode === 'slow' && isRunning ? (
          <button
            type="button"
            onClick={onPause}
            className="btn-control"
            aria-label="pause animation"
            title="พักแอนิเมชัน (Pause Animation)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: '#333333',
              color: '#ffffff',
              border: '1px solid #444444',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Pause size={13} aria-hidden="true" />
            <span>พักแอนิเมชัน</span>
          </button>
        ) : null}

        {mode === 'slow' && isPaused ? (
          <button
            type="button"
            onClick={onResume}
            className="btn-control"
            aria-label="เล่นต่อ"
            title="เล่นแอนิเมชันต่อ (Resume)"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              background: '#0e639c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <Play size={13} fill="#ffffff" aria-hidden="true" />
            <span>เล่นต่อ</span>
          </button>
        ) : null}

        {/* ปุ่มก้าวทีละขั้น (Step Next / Prev) */}
        {mode === 'slow' ? (
          <div style={{ display: 'inline-flex', gap: '4px' }}>
            <button
              type="button"
              onClick={onStepPrev}
              className="btn-icon"
              title="ย้อนกลับ 1 ขั้นตอน (Replay)"
              aria-label="ย้อนกลับหนึ่งขั้นตอน (Replay)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 8px',
                background: '#2d2d30',
                border: '1px solid #3e3e42',
                borderRadius: '4px',
                color: '#cccccc',
                cursor: 'pointer',
              }}
            >
              <SkipBack size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onStepNext}
              className="btn-icon"
              title="ก้าวไปข้างหน้า 1 ขั้นตอน (Replay)"
              aria-label="ก้าวไปข้างหน้าหนึ่งขั้นตอน (Replay)"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 8px',
                background: '#2d2d30',
                border: '1px solid #3e3e42',
                borderRadius: '4px',
                color: '#cccccc',
                cursor: 'pointer',
              }}
            >
              <SkipForward size={13} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        {/* ความเร็วแอนิเมชัน */}
        {mode === 'slow' ? (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
            <span style={{ fontSize: '11px', color: '#999999' }}>ความเร็ว:</span>
            <select
              value={speed}
              onChange={(e) => onSetSpeed(parseFloat(e.target.value))}
              aria-label="เลือกความเร็วแอนิเมชัน"
              style={{
                padding: '4px 6px',
                background: '#1e1e1e',
                color: '#cccccc',
                border: '1px solid #3e3e42',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1.0x (ปกติ)</option>
              <option value={2}>2.0x (เร็ว)</option>
              <option value={4}>4.0x (เร็วมาก)</option>
            </select>
          </div>
        ) : null}
      </div>

      {/* Secondary actions collapse on narrow/touch screens. */}
      <details className="toolbar-more" open={moreOpen} onToggle={e => setMoreOpen(e.currentTarget.open)}><summary>ตัวอย่าง / แพ็กเกจ / ไฟล์</summary>
      <div className="toolbar-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* รายการตัวอย่างโค้ด */}
        <select
          onChange={(e) => {
            const ex = EXAMPLES.find((item) => item.id === e.target.value);
            if (ex) onSelectExample(ex);
          }}
          defaultValue=""
          aria-label="เลือกตัวอย่างโค้ด Python"
          style={{
            padding: '5px 8px',
            background: '#1e1e1e',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
            maxWidth: '180px',
          }}
        >
          <option value="" disabled>
            -- เลือกตัวอย่างโค้ด --
          </option>
          {EXAMPLES.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.title}
            </option>
          ))}
        </select>

        {/* ปุ่มเปิดหน้าต่างแพ็กเกจ & ข้อจำกัด */}
        <button
          type="button"
          onClick={onOpenPackages}
          className="btn-secondary"
          title="จัดการแพ็กเกจและดูข้อจำกัดของเบราว์เซอร์"
          aria-label="เปิดหน้าต่างจัดการแพ็กเกจ"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 9px',
            background: '#2d2d30',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <Package size={13} aria-hidden="true" />
          <span>แพ็กเกจ</span>
        </button>

        {/* ปุ่มส่งออก .py */}
        <button
          type="button"
          onClick={onExport}
          className="btn-icon"
          title="ดาวน์โหลดโค้ดเป็นไฟล์ .py"
          aria-label="ส่งออกโค้ดเป็นไฟล์"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 8px',
            background: '#2d2d30',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Download size={13} aria-hidden="true" />
        </button>

        {/* ปุ่มนำเข้าไฟล์ .py */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".py"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="btn-icon"
          title="เปิดไฟล์ .py จากเครื่อง"
          aria-label="นำเข้าไฟล์โค้ดจากคอมพิวเตอร์"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 8px',
            background: '#2d2d30',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Upload size={13} aria-hidden="true" />
        </button>

        {/* ปุ่มบันทึกโค้ดลงเบราว์เซอร์ */}
        <button
          type="button"
          onClick={onSave}
          className="btn-icon"
          title="บันทึกโค้ดลงเบราว์เซอร์ (Local)"
          aria-label="บันทึกโค้ดลงเบราว์เซอร์"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 8px',
            background: '#2d2d30',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <Save size={13} aria-hidden="true" />
        </button>

        {/* ปุ่มรีเซ็ตเป็นค่าเริ่มต้น */}
        <button
          type="button"
          onClick={onReset}
          className="btn-icon"
          title="รีเซ็ตโค้ดกลับเป็นตัวอย่างเริ่มต้น"
          aria-label="รีเซ็ตโค้ด"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 8px',
            background: '#2d2d30',
            color: '#cccccc',
            border: '1px solid #3e3e42',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      </div>
      </details>
    </div>
  );
};
