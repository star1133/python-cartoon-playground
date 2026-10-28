import React, { useState, useReducer, useEffect, useRef, useCallback, useMemo } from 'react';
import './styles.css';
import { RunToolbar } from './components/RunToolbar';
import { Timeline } from './components/Timeline';
import { EditorHost } from './editor/EditorHost';
import { AdaptiveExecutionScene } from './scene/AdaptiveExecutionScene';
import { ExplainPanel } from './components/ExplainPanel';
import { ConsolePanel, type ConsoleOutputEntry } from './components/ConsolePanel';
import { VariableInspector } from './components/VariableInspector';
import { CallStack } from './components/CallStack';
import { PackageModal } from './components/PackageModal';
import { StatusBar } from './components/StatusBar';
import { WorkbenchLayout } from './components/WorkbenchLayout';
import { loadWorkbenchTabs, saveWorkbenchTabs, type ResultTab, type MobileTab } from './storage/workbenchTabs';
import { prefersMobileLayout } from './editor/mobileLayout';

import {
  playbackReducer,
  INITIAL_PLAYBACK_STATE,
} from './editor/playbackReducer';
import {
  reduceSceneState,
  reduceSceneStateHistory,
  INITIAL_SCENE_STATE,
} from './scene/sceneReducer';
import {
  loadSavedCode,
  saveCode,
  exportCodeAsFile,
  readImportedFile,
  saveRunSnapshot,
} from './storage/codeStore';
import { EXAMPLES, type CodeExample } from './storage/examples';
import { createSceneReplayCache } from './scene/sceneReplayCache';
import { saveReplay, findReplay, clearReplays, setReplayPersistenceEnabled } from './storage/replayCache';
import { detectImports } from './runtime/packageControl';
import { ReplayCacheControls } from './components/ReplayCacheControls';
import type { CachedReplay } from './storage/replayCache';
import { loadReplayPersistencePreference, saveReplayPersistencePreference } from './storage/replayPreference';

import { createRuntimeClient } from './editor/runtimeBridge';
import { getLanguageService } from './editor/languageBridge';
import type { RuntimeClient, TraceEvent } from './runtime/types';

export const App: React.FC = () => {
  // 1. โค้ดต้นฉบับในเอดิเตอร์
  const [code, setCode] = useState<string>(() => loadSavedCode());

  // 2. State Machine ของ Playback และ Trace
  const [playbackState, dispatchPlayback] = useReducer(playbackReducer, {
    ...INITIAL_PLAYBACK_STATE,
    currentCode: loadSavedCode(),
    sourceSnapshot: loadSavedCode(),
  });

  // 3. สถานะฉากจำลองคำนวณแบบ Deterministic จากประวัติ TraceEvent (ป้องกัน Stale Replay เมื่อ Seek ย้อนหลัง)
  const sceneReplayCache = useRef(createSceneReplayCache());
  const sceneState = useMemo(() => {
    return sceneReplayCache.current.get(playbackState.events, playbackState.currentIndex);
  }, [playbackState.events, playbackState.currentIndex]);
  useEffect(() => () => sceneReplayCache.current.clear(), []);

  // 4. เอาต์พุตคอนโซล
  const [consoleOutputs, setConsoleOutputs] = useState<ConsoleOutputEntry[]>([]);

  // 5. แท็บและการสลับมุมมอง (Desktop & Mobile)
  const [rightBottomTab, setRightBottomTab] = useState<ResultTab>(() => loadWorkbenchTabs().result);
  const [mobileTab, setMobileTab] = useState<MobileTab>(() => loadWorkbenchTabs().mobile);
  const [revealResultsToken, setRevealResultsToken] = useState(0);
  useEffect(() => saveWorkbenchTabs(rightBottomTab, mobileTab), [rightBottomTab, mobileTab]);
  const [isMobile, setIsMobile] = useState(prefersMobileLayout);

  // 6. การจัดการแพ็กเกจ
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [installedPackages, setInstalledPackages] = useState<Set<string>>(new Set());
  const [installingPackage, setInstallingPackage] = useState<string | null>(null);
  const [persistReplay, setPersistReplay] = useState(loadReplayPersistencePreference);
  const [cachedReplay, setCachedReplay] = useState<CachedReplay | null>(null);
  const [cacheRevision, setCacheRevision] = useState(0);
  const [cacheMessage, setCacheMessage] = useState('');
  const replayPackages = useMemo(() => Array.from(new Set([...installedPackages, ...detectImports(code)])).sort(), [installedPackages, code]);
  const activeRunGeneration = useRef(0);
  const executionBusy = !playbackState.isExecutionDone && ['running','initializing','waiting_input','paused'].includes(playbackState.executionStatus);
  useEffect(() => {
    setReplayPersistenceEnabled(persistReplay);
    saveReplayPersistencePreference(persistReplay);
    let cancelled = false;
    setCachedReplay(null);
    void findReplay(code, replayPackages, 'slow').then(item => { if (!cancelled) setCachedReplay(item); }).catch(() => {});
    return () => { cancelled = true; };
  }, [code, replayPackages, persistReplay, cacheRevision]);
  const handleCachedReplay = useCallback(() => {
    if (!cachedReplay || executionBusy) return;
    runtimeClientRef.current?.dispose();
    runtimeClientRef.current = null;
    sceneReplayCache.current.clear();
    dispatchPlayback({ type:'REPLAY_LOAD', code:cachedReplay.code, events:cachedReplay.events, error:cachedReplay.error });
    setConsoleOutputs([{id:'cache',text:'[Replay] ผลที่บันทึกไว้ ไม่ได้รัน Python ใหม่\n',channel:'system',timestamp:Date.now()}]);
    setCacheMessage(`กำลังดูผลเดิม • ${cachedReplay.eventCount} events • ไม่ทำ side effects ซ้ำ`);
  }, [cachedReplay, executionBusy]);
  const handleClearReplay = useCallback(async () => {
    await clearReplays(); sceneReplayCache.current.clear(); setCachedReplay(null);
    setCacheRevision(v => v+1); setCacheMessage('ล้าง cache แล้ว');
  }, []);

  // 7. สถานะ Language Intelligence
  const [languageStatus, setLanguageStatus] = useState<'initializing' | 'ready' | 'fallback' | 'error'>('initializing');

  // Runtime Client Reference
  const runtimeClientRef = useRef<RuntimeClient | null>(null);

  // เริ่มต้น Language Service และดึงสถานะ
  useEffect(() => {
    const langService = getLanguageService();
    langService
      .init()
      .then(() => {
        setLanguageStatus(langService.getStatus());
      })
      .catch(() => {
        setLanguageStatus('fallback');
      });
  }, []);

  // บันทึกโค้ดลง localStorage อัตโนมัติเมื่อมีการเปลี่ยนแปลง
  useEffect(() => {
    saveCode(code);
    dispatchPlayback({ type: 'UPDATE_CODE', code });
  }, [code]);

  // ป้องกัน Worker รั่วไหลเมื่อ Unmount component
  useEffect(() => {
    return () => {
      if (runtimeClientRef.current) {
        runtimeClientRef.current.dispose();
        runtimeClientRef.current = null;
      }
    };
  }, []);

  // ตรวจสอบการปรับขนาดหน้าจอสำหรับ Responsive
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(prefersMobileLayout());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ตัวจับเวลาแอนิเมชันสำหรับโหมด Slow (Timer-based speed playback pacing)
  useEffect(() => {
    if (
      playbackState.mode !== 'slow' ||
      !playbackState.isPlaying ||
      playbackState.status !== 'running'
    ) {
      return;
    }

    // สำหรับกระดานข้อมูลตัวเลข 2D ใช้จังหวะที่ผ่อนคลาย ~1800ms / speed เพื่อให้อ่าน 3 ขั้นตอนของโฟลว์ลูกศรได้ชัดเจน
    // ส่วนโหมดโลก 3D ยังคงใช้จังหวะ 500ms / speed สำหรับการเคลื่อนไหว
    const baseInterval = sceneState.isWorldMode ? 500 : 1800;
    const intervalMs = Math.max(100, Math.round(baseInterval / playbackState.speed));

    const timer = setInterval(() => {
      dispatchPlayback({ type: 'PLAYBACK_TICK' });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [
    playbackState.mode,
    playbackState.isPlaying,
    playbackState.status,
    playbackState.speed,
    sceneState.isWorldMode,
  ]);

  // ซิงค์ข้อความคอนโซลกับการ Replay เหตุการณ์ตาม currentIndex
  const displayedConsoleOutputs = useMemo(() => {
    const hasTraceOutput = playbackState.events.some(
      (e) => (e.kind === 'stdout' || e.kind === 'stderr') && e.text
    );

    if (hasTraceOutput && playbackState.currentIndex >= 0) {
      // ดึงข้อความระบบที่ไม่ใช่ stdout/stderr เพื่อรวมกับ trace output ที่เล่นถึง currentIndex
      const baseSystem: ConsoleOutputEntry[] = [];
      const visibleEvents = playbackState.events.slice(0, playbackState.currentIndex + 1);
      const traceOutputs: ConsoleOutputEntry[] = [];

      for (const ev of visibleEvents) {
        if ((ev.kind === 'stdout' || ev.kind === 'stderr') && ev.text) {
          traceOutputs.push({
            id: `trace_out_${ev.seq ?? Math.random()}`,
            text: ev.text,
            channel: ev.kind === 'stderr' ? 'stderr' : 'stdout',
            timestamp: ev.seq ?? Date.now(),
          });
        }
      }
      return [...baseSystem, ...traceOutputs];
    }

    return consoleOutputs.filter(item => item.channel !== 'system');
  }, [consoleOutputs, playbackState.events, playbackState.currentIndex]);

  // ฟังก์ชันเริ่มรันโค้ด (Run)
  const handleRun = useCallback(async () => {
    // ปิดและทำลาย client เก่าที่รันเสร็จแล้วหรือค้างอยู่เพื่อป้องกัน memory/worker leak
    if (runtimeClientRef.current) {
      try {
        runtimeClientRef.current.dispose();
      } catch (err) {
        console.warn('Disposing prior runtime error:', err);
      }
      runtimeClientRef.current = null;
    }

    const generation = ++activeRunGeneration.current;
    const recordedEvents: TraceEvent[] = [];
    const runSource = code;
    const runPackages = [...replayPackages];
    const runMode = playbackState.mode;
    setCacheMessage('รันใหม่: ไม่ใช้ผลเก่าจาก cache');
    sceneReplayCache.current.clear();
    saveRunSnapshot(code);
    dispatchPlayback({ type: 'RUN_START', code, mode: playbackState.mode });

    // Console contains only program output; execution status lives in the status bar.
    setConsoleOutputs([]);

    // สร้าง Runtime Client ใหม่สำหรับรอบการรันนี้
    const client = await createRuntimeClient({
      onStatus: (status) => {
        if (generation !== activeRunGeneration.current) return;
        dispatchPlayback({ type: 'STATUS_CHANGE', status });
      },
      onOutput: (text, channel) => {
        if (generation !== activeRunGeneration.current) return;
        setConsoleOutputs((prev) => {
          const trimmed = prev.length > 200 ? prev.slice(-150) : prev;
          return [
            ...trimmed,
            {
              id: `out_${Date.now()}_${Math.random()}`,
              text,
              channel,
              timestamp: Date.now(),
            },
          ];
        });
      },
      onEvent: (event: TraceEvent) => {
        if (generation !== activeRunGeneration.current) return;
        if (recordedEvents.length < 3000) recordedEvents.push(structuredClone(event));
        dispatchPlayback({ type: 'EVENT_APPEND', event });
      },
      onInput: () => {
        if (generation !== activeRunGeneration.current) return;
        dispatchPlayback({ type: 'INPUT_REQUEST' });
        setRightBottomTab('console');
        setRevealResultsToken(v => v + 1);
        if (prefersMobileLayout()) setMobileTab('console');
      },
      onDone: (error) => {
        if (generation !== activeRunGeneration.current) return;
        if (runMode === 'slow' && recordedEvents.length && recordedEvents.length < 3000) {
          void saveReplay({code:runSource,mode:'slow',packages:runPackages,events:recordedEvents,error})
            .then(() => { setCacheRevision(v=>v+1); setCacheMessage('บันทึก replay แล้ว • ดูผลเดิมได้โดยไม่รันใหม่'); })
            .catch(() => setCacheMessage('ไม่สามารถเก็บ replay ได้ การรันจริงยังทำงานตามปกติ'));
        }
        dispatchPlayback({ type: 'RUN_DONE', error });
        if (error) setConsoleOutputs((prev) => [...prev, {
          id: `error_${Date.now()}`, text: `${error}\n`, channel: 'stderr', timestamp: Date.now(),
        }]);
      },
    });

    if (generation !== activeRunGeneration.current) { client.dispose(); return; }
    runtimeClientRef.current = client;

    try {
      await client.run({
        code,
        mode: playbackState.mode,
        packages: Array.from(installedPackages),
      });
    } catch (err: any) {
      dispatchPlayback({ type: 'RUN_DONE', error: err?.message || String(err) });
    }
  }, [code, playbackState.mode, installedPackages, replayPackages]);


  // หยุดการทำงาน (Stop)
  const handleStop = useCallback(() => {
    ++activeRunGeneration.current; // Cancelled/partial traces are never saved as completed.
    if (runtimeClientRef.current) {
      runtimeClientRef.current.stop();
    }
    dispatchPlayback({ type: 'STOP' });
    setConsoleOutputs((prev) => [
      ...prev,
      {
        id: `sys_stop_${Date.now()}`,
        text: `[ระบบ] การทำงานถูกยกเลิกโดยผู้ใช้\n`,
        channel: 'system',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // พักแอนิเมชันชั่วคราว (Pause Animation)
  const handlePause = useCallback(() => {
    dispatchPlayback({ type: 'PAUSE' });
  }, []);

  // เล่นแอนิเมชันต่อ (Resume Animation)
  const handleResume = useCallback(() => {
    dispatchPlayback({ type: 'RESUME' });
  }, []);

  // ก้าวไปข้างหน้าในการเล่นซ้ำ (Step Next Replay)
  const handleStepNext = useCallback(() => {
    dispatchPlayback({ type: 'PAUSE' });
    dispatchPlayback({ type: 'STEP_NEXT' });
  }, []);

  // ย้อนกลับในการเล่นซ้ำ (Step Prev Replay)
  const handleStepPrev = useCallback(() => {
    dispatchPlayback({ type: 'PAUSE' });
    dispatchPlayback({ type: 'STEP_PREV' });
  }, []);

  // เลื่อนเวลาไปยังขั้นตอนที่กำหนด (Seek)
  const handleSeek = useCallback((index: number) => {
    dispatchPlayback({ type: 'PAUSE' });
    dispatchPlayback({ type: 'SEEK_INDEX', index });
  }, []);

  // เลือกตัวอย่างโค้ด: รีเซ็ตสถานะเป็น idle โดยไม่ถือว่ากำลังรันโค้ด
  const handleSelectExample = useCallback((example: CodeExample) => {
    ++activeRunGeneration.current;
    if (runtimeClientRef.current) {
      try {
        runtimeClientRef.current.stop();
      } catch {}
    }
    setCode(example.code);
    dispatchPlayback({ type: 'RESET', code: example.code });
    setConsoleOutputs([]);
  }, []);

  // ส่งออกโค้ด
  const handleExport = useCallback(() => {
    exportCodeAsFile(code, 'playground_script.py');
  }, [code]);

  // นำเข้าไฟล์โค้ด
  const handleImport = useCallback(async (file: File) => {
    try {
      const content = await readImportedFile(file);
      setCode(content);
      dispatchPlayback({ type: 'RESET', code: content });
      setConsoleOutputs((prev) => [
        ...prev,
        {
          id: `sys_import_${Date.now()}`,
          text: `[ระบบ] นำเข้าไฟล์สำเร็จ: ${file.name}\n`,
          channel: 'system',
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      alert(`ไม่สามารถนำเข้าไฟล์ได้: ${err?.message || String(err)}`);
    }
  }, []);

  // รีเซ็ตเป็นค่าเริ่มต้น: รีเซ็ตสถานะเป็น idle โดยไม่ถือว่ากำลังรันโค้ด
  const handleReset = useCallback(() => {
    if (runtimeClientRef.current) {
      try {
        runtimeClientRef.current.stop();
      } catch {}
    }
    const defaultCode = EXAMPLES[0]?.code ?? '';
    setCode(defaultCode);
    dispatchPlayback({ type: 'RESET', code: defaultCode });
    setConsoleOutputs((prev) => [
      ...prev,
      {
        id: `sys_reset_${Date.now()}`,
        text: `[ระบบ] รีเซ็ตโค้ดกลับเป็นตัวอย่างเริ่มต้น\n`,
        channel: 'system',
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // บันทึกโค้ด
  const handleSave = useCallback(() => {
    saveCode(code);
    setConsoleOutputs((prev) => [
      ...prev,
      {
        id: `sys_save_${Date.now()}`,
        text: `[ระบบ] บันทึกโค้ดลงเบราว์เซอร์สำเร็จ\n`,
        channel: 'system',
        timestamp: Date.now(),
      },
    ]);
  }, [code]);

  // ส่งข้อมูล input()
  const handleSubmitInput = useCallback((text: string) => {
    if (runtimeClientRef.current) {
      runtimeClientRef.current.provideInput(text);
    }
    dispatchPlayback({ type: 'INPUT_SUBMIT' });
  }, []);

  // ติดตั้งแพ็กเกจด้วย Runtime Client จริง ไม่ใช้ Mock Timer
  const handleInstallPackage = useCallback(async (pkgName: string) => {
    setInstallingPackage(pkgName);
    try {
      let client = runtimeClientRef.current;
      if (!client) {
        client = await createRuntimeClient({
          onStatus: (status) => dispatchPlayback({ type: 'STATUS_CHANGE', status }),
          onOutput: (text, channel) => {
            setConsoleOutputs((prev) => [
              ...prev,
              {
                id: `pkg_out_${Date.now()}_${Math.random()}`,
                text,
                channel,
                timestamp: Date.now(),
              },
            ]);
          },
          onEvent: (event: TraceEvent) => {
            dispatchPlayback({ type: 'EVENT_APPEND', event });
          },
          onInput: () => {},
          onDone: () => {},
        });
        runtimeClientRef.current = client;
        await client.init();
      }

      await client.install([pkgName]);
      setInstalledPackages((prev) => new Set([...prev, pkgName]));
      setConsoleOutputs((prev) => [
        ...prev,
        {
          id: `sys_pkg_${Date.now()}`,
          text: `[ระบบ] ติดตั้งแพ็กเกจ ${pkgName} สำเร็จ\n`,
          channel: 'system',
          timestamp: Date.now(),
        },
      ]);
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      setConsoleOutputs((prev) => [
        ...prev,
        {
          id: `sys_pkg_err_${Date.now()}`,
          text: `[ระบบ] เกิดข้อผิดพลาดในการติดตั้ง ${pkgName}: ${errMsg}\n`,
          channel: 'stderr',
          timestamp: Date.now(),
        },
      ]);
      alert(`ไม่สามารถติดตั้งแพ็กเกจได้: ${errMsg}`);
    } finally {
      setInstallingPackage(null);
    }
  }, []);

  const editorPane = (
          <section className="workbench-left" aria-label="พื้นที่เขียนโค้ดและเส้นเวลา">
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <EditorHost
                value={code}
                onChange={setCode}
                activeLine={playbackState.activeLine}
                readOnly={playbackState.status === 'running'}
              />
            </div>
            <Timeline
              currentIndex={playbackState.currentIndex}
              totalEvents={playbackState.events.length}
              onSeek={handleSeek}
              onStepPrev={handleStepPrev}
              onStepNext={handleStepNext}
              activeLine={playbackState.activeLine}
            />
          </section>
  );
  const scenePane = (
              <div id="animation-panel" className="right-top-scene" style={{flex:1,minHeight:0}}>
                <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow:'auto' }}>
                  <AdaptiveExecutionScene
                    sceneState={sceneState}
                    currentEvent={playbackState.currentEvent}
                    sourceSnapshot={playbackState.sourceSnapshot}
                    activeLine={playbackState.activeLine}
                    isPlaying={playbackState.isPlaying && playbackState.status === 'running'}
                    speed={playbackState.speed}
                  />
                </div>
                <div className="explain-dock">
                  <ExplainPanel
                    currentEvent={playbackState.currentEvent}
                    prevEvent={playbackState.events[playbackState.currentIndex - 1] ?? null}
                    codeSnapshot={playbackState.sourceSnapshot}
                    currentIndex={playbackState.currentIndex}
                    totalEvents={playbackState.events.length}
                  />
                </div>
              </div>
  );
  const resultPane = (
              <div id="result-panel" className="right-bottom-tabs" style={{flex:1,minHeight:0}}>
                {/* Tab selector */}
                <div
                  style={{
                    display: 'flex',
                    background: '#222222',
                    borderBottom: '1px solid #333333',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setRightBottomTab('console')}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      border: 'none',
                      background: rightBottomTab === 'console' ? '#181818' : 'transparent',
                      color: rightBottomTab === 'console' ? '#ffffff' : '#858585',
                      borderTop: rightBottomTab === 'console' ? '2px solid #007acc' : '2px solid transparent',
                      cursor: 'pointer',
                      fontWeight: rightBottomTab === 'console' ? 600 : 400,
                    }}
                  >
                    คอนโซล (Console)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightBottomTab('variables')}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      border: 'none',
                      background: rightBottomTab === 'variables' ? '#181818' : 'transparent',
                      color: rightBottomTab === 'variables' ? '#ffffff' : '#858585',
                      borderTop: rightBottomTab === 'variables' ? '2px solid #4ec9b0' : '2px solid transparent',
                      cursor: 'pointer',
                      fontWeight: rightBottomTab === 'variables' ? 600 : 400,
                    }}
                  >
                    ตัวแปร (Variables)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightBottomTab('callstack')}
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      border: 'none',
                      background: rightBottomTab === 'callstack' ? '#181818' : 'transparent',
                      color: rightBottomTab === 'callstack' ? '#ffffff' : '#858585',
                      borderTop: rightBottomTab === 'callstack' ? '2px solid #dcdcaa' : '2px solid transparent',
                      cursor: 'pointer',
                      fontWeight: rightBottomTab === 'callstack' ? 600 : 400,
                    }}
                  >
                    ลำดับการเรียก (Call Stack)
                  </button>
                </div>

                {/* Tab Content */}
                <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                  {rightBottomTab === 'console' && (
                    <ConsolePanel
                      outputs={displayedConsoleOutputs}
                      onClear={() => setConsoleOutputs([])}
                      waitingForInput={playbackState.inputPromptActive}
                      onSubmitInput={handleSubmitInput}
                    />
                  )}

                  {rightBottomTab === 'variables' && (
                    <VariableInspector locals={playbackState.activeLocals} />
                  )}

                  {rightBottomTab === 'callstack' && (
                    <CallStack
                      stack={playbackState.activeStack}
                      activeLine={playbackState.activeLine}
                    />
                  )}
                </div>
              </div>
  );

  return (
    <div className={`app-container ${isMobile ? 'is-mobile' : ''}`}>
      {/* Top Main Navigation & Controls Toolbar */}
      <RunToolbar
        status={playbackState.status}
        mode={playbackState.mode}
        speed={playbackState.speed}
        onRun={handleRun}
        onStop={handleStop}
        onPause={handlePause}
        onResume={handleResume}
        onStepNext={handleStepNext}
        onStepPrev={handleStepPrev}
        onSetMode={(m) => dispatchPlayback({ type: 'SET_MODE', mode: m })}
        onSetSpeed={(s) => dispatchPlayback({ type: 'SET_SPEED', speed: s })}
        onSelectExample={handleSelectExample}
        onExport={handleExport}
        onImport={handleImport}
        onReset={handleReset}
        onSave={handleSave}
        onOpenPackages={() => setIsPackageModalOpen(true)}
      />
      <ReplayCacheControls enabled={persistReplay} available={!!cachedReplay} busy={executionBusy}
        message={cacheMessage} onToggle={setPersistReplay} onReplay={handleCachedReplay} onClear={handleClearReplay} />

      {/* Mobile Tab Navigation */}
      {isMobile ? (
        <nav className="mobile-tab-nav" aria-label="แถบสลับหน้าจอบนมือถือ">
          <button
            type="button"
            className={`mobile-tab-button ${mobileTab === 'editor' ? 'active' : ''}`}
            onClick={() => setMobileTab('editor')}
          >
            โค้ด
          </button>
          <button
            type="button"
            className={`mobile-tab-button ${mobileTab === 'scene' ? 'active' : ''}`}
            onClick={() => setMobileTab('scene')}
          >
            {sceneState.isWorldMode ? 'ฉาก 3D' : 'กระดาน 2D'}
          </button>
          <button
            type="button"
            className={`mobile-tab-button ${mobileTab === 'console' ? 'active' : ''}`}
            onClick={() => { setMobileTab('console'); setRightBottomTab('console'); }}
          >
            คอนโซล
          </button>
          <button
            type="button"
            className={`mobile-tab-button ${mobileTab === 'inspector' ? 'active' : ''}`}
            onClick={() => { setMobileTab('inspector'); setRightBottomTab('variables'); }}
          >
            ตัวแปร
          </button>
        </nav>
      ) : null}

      {/* Desktop panes remain mounted while rearranging; phones retain tabs. */}
      {isMobile ? <main className="main-workbench">
        {mobileTab === 'editor' ? editorPane : <section className="workbench-right">
          {mobileTab === 'scene' ? scenePane : resultPane}
        </section>}
      </main> : <WorkbenchLayout editor={editorPane} scene={scenePane} results={resultPane} revealResultsToken={revealResultsToken} />}

      {/* Bottom VS Code Status Bar */}
      <StatusBar
        status={playbackState.status}
        mode={playbackState.mode}
        activeLine={playbackState.activeLine}
        languageStatus={languageStatus}
      />

      {/* Package Chooser & Limitation Modal */}
      <PackageModal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        installedPackages={installedPackages}
        onInstallPackage={handleInstallPackage}
        installingPackage={installingPackage}
      />
    </div>
  );
};
