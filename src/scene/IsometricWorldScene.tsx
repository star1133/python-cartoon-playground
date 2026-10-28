import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Trophy } from 'lucide-react';
import * as THREE from 'three';
import { createCharacterMesh, type CharacterController } from './characterMesh';
import { createChestMesh, type ChestController } from './chestMesh';
import { createWorldTiles, type WorldTilesController } from './pathTiles';
import { createVariableStage, type VariableStageController } from './variableStageMesh';
import type { SceneState } from './sceneReducer';

interface IsometricWorldSceneProps {
  sceneState: SceneState;
}

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

export const IsometricWorldScene: React.FC<IsometricWorldSceneProps> = ({ sceneState }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState>(sceneState);
  stateRef.current = sceneState;
  const [webglSupported, setWebglSupported] = useState<boolean>(() => checkWebGLSupport());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!checkWebGLSupport()) {
      setWebglSupported(false);
      return;
    }

    // 1. Scene & Clock
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x181a1f); // Dark IDE themed slate background
    const clock = new THREE.Clock();

    // 2. Isometric Orthographic Camera
    const aspect = container.clientWidth / (container.clientHeight || 1);
    const frustumSize = 8.5;
    const camera = new THREE.OrthographicCamera(
      (-frustumSize * aspect) / 2,
      (frustumSize * aspect) / 2,
      frustumSize / 2,
      -frustumSize / 2,
      0.1,
      100
    );
    // วางกล้องในมุมไอโซเมตริก (Classic Isometric projection: 45 องศา และก้ม 35.264 องศา)
    camera.position.set(12, 14, 12);
    camera.lookAt(0.5, 0.5, 0.8);

    // 3. WebGLRenderer with Error Fallback
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.outline = 'none';
      container.appendChild(renderer.domElement);
    } catch {
      setWebglSupported(false);
      return;
    }

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.15);
    dirLight.position.set(10, 18, 8);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    const d = 10;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x81d4fa, 0.45);
    fillLight.position.set(-8, 6, -8);
    scene.add(fillLight);

    // 5. Procedural Controllers
    const character: CharacterController = createCharacterMesh();
    scene.add(character.group);

    const chest: ChestController = createChestMesh();
    chest.setPosition(sceneState.chest.x, sceneState.chest.y);
    scene.add(chest.group);

    const worldTiles: WorldTilesController = createWorldTiles();
    scene.add(worldTiles.group);

    const variableStage: VariableStageController = createVariableStage();
    scene.add(variableStage.group);

    // 6. Reduced Motion Check
    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;
    let reducedMotion = mediaQuery ? mediaQuery.matches : false;
    const motionListener = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    if (mediaQuery && mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', motionListener);
    }

    // 7. Render Loop
    let animationFrameId: number;
    let loopAnimTime = 0;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1);
      loopAnimTime += delta;

      const currentState = stateRef.current;

      if (currentState.isWorldMode) {
        // --- 7A. World Mode (บทเรียนแผนผังโลก) ---
        worldTiles.group.visible = true;
        chest.group.visible = true;
        variableStage.group.visible = false;

        character.update(
          currentState.character.x,
          currentState.character.y,
          currentState.character.direction,
          currentState.character.action,
          delta,
          reducedMotion
        );

        chest.setPosition(currentState.chest.x, currentState.chest.y);
        chest.update(currentState.chest.isOpen, delta, reducedMotion);
        worldTiles.update(currentState.tiles, currentState.dataItems, delta, reducedMotion);
      } else {
        // --- 7B. Generic Code Mode (โค้ดมาตรฐานทั่วไป: กล่องตัวแปร คอลสแตก ลูป) ---
        worldTiles.group.visible = false;
        chest.group.visible = false;
        variableStage.group.visible = true;

        variableStage.update(currentState.genericModel, delta, reducedMotion);

        // คำนวณพิกัดและการกระทำของตัวละครในเวทีจำลองข้อมูล
        let customWorldPos = { x: 0, z: 0, rotY: 0 };
        const lastVarName = currentState.genericModel.lastChangedVar;
        const varList = currentState.genericModel.variables;
        const changedVarIndex = varList.findIndex((v) => v.name === lastVarName);

        if (changedVarIndex !== -1) {
          // ตัวละครก้าวไปตรวจและชี้ที่กล่องตัวแปรที่เพิ่งอัปเดต
          const varCoords = variableStage.getVariablePosition(changedVarIndex);
          customWorldPos = { x: varCoords.x, z: varCoords.z - 0.7, rotY: 0 };
        } else if (
          currentState.genericModel.callStack.length > 1 ||
          currentState.character.action === 'cast'
        ) {
          // ตัวละครหันไปเพ่งมองสถานีคอลสแตก
          const stackCoords = variableStage.getStackPosition();
          customWorldPos = { x: stackCoords.x + 1.2, z: stackCoords.z, rotY: -Math.PI / 2 };
        } else if (currentState.genericModel.loopInfo?.isLooping) {
          // ตัวละครก้าวเดินไปตามเส้นทางลูป
          const angle = ((loopAnimTime * 0.8) % (Math.PI * 2));
          customWorldPos = {
            x: Math.cos(angle) * 2.2,
            z: Math.sin(angle) * 2.2,
            rotY: angle + Math.PI / 2,
          };
        } else if (currentState.character.action === 'celebrate') {
          customWorldPos = { x: 0, z: 0, rotY: 0 };
        } else if (varList.length > 0) {
          customWorldPos = { x: 0, z: 0.2, rotY: 0 };
        }

        character.update(
          0,
          0,
          0,
          currentState.character.action,
          delta,
          reducedMotion,
          customWorldPos
        );
      }

      renderer.render(scene, camera);
    };

    animate();

    // 8. Responsive Resize Observer & Window Resize
    const updateDimensions = (width: number, height: number) => {
      if (width === 0 || height === 0) return;
      const currentAspect = width / height;
      camera.left = (-frustumSize * currentAspect) / 2;
      camera.right = (frustumSize * currentAspect) / 2;
      camera.top = frustumSize / 2;
      camera.bottom = -frustumSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          updateDimensions(width, height);
        }
      });
      resizeObserver.observe(container);
    }

    const handleWindowResize = () => {
      if (container) {
        updateDimensions(container.clientWidth, container.clientHeight);
      }
    };
    window.addEventListener('resize', handleWindowResize);

    // 9. Comprehensive Cleanup to Prevent Memory Leaks
    return () => {
      cancelAnimationFrame(animationFrameId);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      window.removeEventListener('resize', handleWindowResize);
      if (mediaQuery && mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', motionListener);
      }

      character.dispose();
      chest.dispose();
      worldTiles.dispose();
      variableStage.dispose();

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      scene.clear();

      renderer.dispose();
      renderer.forceContextLoss?.();

      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const dirNames = ['ทิศตะวันออก', 'ทิศใต้', 'ทิศตะวันตก', 'ทิศเหนือ'];
  const currentDir = dirNames[((sceneState.character.direction % 4) + 4) % 4] ?? 'ทิศตะวันออก';

  // รายการตัวแปรสำหรับแสดงผล
  const variablesList = sceneState.genericModel?.variables?.length > 0
    ? sceneState.genericModel.variables
    : sceneState.dataItems.map((d, idx) => ({
        name: d.name,
        type: d.type,
        value: d.value,
        rawPreview: d.value,
        isChanged: false,
        isNew: false,
        gridIndex: idx,
        parsed: {
          type: d.type,
          displayType: d.type,
          fullValue: d.value,
          preview: d.value,
          isContainer: false,
          containerType: 'primitive' as const,
          elements: [],
          hasMore: false,
        },
      }));

  return (
    <div
      ref={containerRef}
      className="scene-canvas-container"
      role="region"
      aria-label="ฉากจำลองการทำงาน 3 มิติ (3D Isometric Scene)"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '260px',
        overflow: 'hidden',
        background: '#181a1f',
      }}
    >
      {/* Live Region สำหรับโปรแกรมอ่านหน้าจอ (Screen Readers) */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {sceneState.isWorldMode
          ? `สถานะฉาก 3 มิติ: ${sceneState.statusMessageTh} หุ่นยนต์อยู่ที่ตำแหน่ง (${sceneState.character.x}, ${sceneState.character.y}) หันไปทาง${currentDir} หีบสมบัติ${sceneState.chest.isOpen ? 'เปิดแล้ว' : 'ปิดอยู่'}`
          : `สถานะฉาก 3 มิติ: ${sceneState.statusMessageTh} ตัวแปร: ${variablesList.map((d) => `${d.name} = ${d.rawPreview}`).join(', ') || 'ไม่มี'}${sceneState.genericModel?.omittedCount > 0 ? ` (ละเว้น +${sceneState.genericModel.omittedCount} ตัวแปร)` : ''}`}
      </div>

      {/* ป้ายกำกับสถานะฉากภาษาไทย */}
      <div
        className="scene-badge"
        role="status"
        aria-label="สถานะฉากจำลอง"
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          background: 'rgba(24, 28, 36, 0.9)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #334155',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          color: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
          zIndex: 10,
        }}
      >
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: sceneState.isWorldMode
              ? sceneState.chest.isOpen
                ? '#ffd54f'
                : '#29b6f6'
              : sceneState.genericModel?.hasException
              ? '#ef4444'
              : '#38bdf8',
            boxShadow: `0 0 6px ${sceneState.isWorldMode ? (sceneState.chest.isOpen ? '#ffd54f' : '#29b6f6') : '#38bdf8'}`,
          }}
        />
        <span>{sceneState.statusMessageTh}</span>
      </div>

      {/* Accessible Variable Dock (แสดงแถบตัวแปรและข้อมูลบริบทเคียงข้างฉาก) */}
      {!sceneState.isWorldMode && variablesList.length > 0 && (
        <div
          className="scene-variable-dock"
          role="region"
          aria-label="แถบข้อมูลตัวแปรปัจจุบัน"
          style={{
            position: 'absolute',
            bottom: '12px',
            left: '12px',
            right: '12px',
            maxHeight: '110px',
            overflowY: 'auto',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '8px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
            zIndex: 10,
          }}
        >
          {variablesList.map((item) => (
            <div
              key={item.name}
              role="listitem"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: item.isChanged ? 'rgba(12, 74, 110, 0.7)' : 'rgba(30, 41, 59, 0.8)',
                border: item.isChanged ? '1px solid #38bdf8' : '1px solid #475569',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '11px',
                color: '#f8fafc',
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ fontWeight: 600, color: '#38bdf8' }}>{item.name}</span>
              <span style={{ color: '#94a3b8', fontSize: '10px' }}>[{item.type}]</span>
              <span style={{ color: '#64748b' }}>=</span>
              <span style={{ fontFamily: 'monospace', color: '#f1f5f9' }}>{item.rawPreview}</span>
            </div>
          ))}

          {sceneState.genericModel?.omittedCount > 0 && (
            <span
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                padding: '2px 6px',
                borderRadius: '4px',
                background: 'rgba(51, 65, 85, 0.5)',
                border: '1px solid #475569',
              }}
            >
              +{sceneState.genericModel.omittedCount} ตัวแปรเพิ่มเติม
            </span>
          )}

          {sceneState.genericModel?.loopInfo?.isLooping && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: '#fbbf24',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'rgba(120, 53, 15, 0.3)',
                border: '1px solid #d97706',
              }}
            >
              <RefreshCw size={12} aria-hidden="true" /> วนซ้ำรอบที่ {sceneState.genericModel.loopInfo.iterationCount}
            </span>
          )}
        </div>
      )}

      {/* WebGL Fallback View เมื่อ WebGL ไม่พร้อมใช้งาน */}
      {!webglSupported && (
        <div
          className="scene-fallback-view"
          role="region"
          aria-label="ฉากจำลองโหมด 2 มิติ (2D Fallback Mode)"
          style={{
            padding: '48px 16px 16px 16px',
            color: '#e0e0e0',
            fontSize: '13px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              borderRadius: '4px',
              background: 'rgba(255, 193, 7, 0.15)',
              border: '1px solid rgba(255, 193, 7, 0.3)',
              color: '#ffd54f',
              fontSize: '11px',
              width: 'fit-content',
            }}
          >
            <span>โหมดจำลอง 2 มิติ (WebGL Fallback)</span>
          </div>

          <div
            style={{
              background: '#22272e',
              border: '1px solid #373e47',
              borderRadius: '6px',
              padding: '12px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>
              {sceneState.isWorldMode ? 'แผนที่โลกจำลอง' : 'สถานะข้อมูล'}
            </div>
            <div style={{ color: '#adbac7', fontSize: '12px' }}>{sceneState.statusMessageTh}</div>

            {sceneState.isWorldMode ? (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#76e4f7' }}>
                พิกัดตัวละคร: ({sceneState.character.x}, {sceneState.character.y}) • หันไปทาง: {currentDir} • หีบสมบัติ:{' '}
                {sceneState.chest.isOpen ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    เปิดสำเร็จ <Trophy size={13} aria-hidden="true" style={{ color: '#fbbf24' }} />
                  </span>
                ) : (
                  'ปิดอยู่'
                )}{' '}
                (เป้าหมาย ({sceneState.chest.x}, {sceneState.chest.y}))
              </div>
            ) : (
              <div style={{ marginTop: '8px', fontSize: '12px', color: '#ce93d8' }}>
                ตัวแปรที่กำลังประมวลผล: {variablesList.length} รายการ • ความลึกคอลสแตก: {sceneState.callStackDepth}
                {variablesList.length > 0 && (
                  <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {variablesList.map((item) => (
                      <span
                        key={item.name}
                        style={{
                          background: item.isChanged ? '#1e3a5f' : '#2d333b',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          border: item.isChanged ? '1px solid #38bdf8' : '1px solid #444c56',
                          color: '#e2e8f0',
                        }}
                      >
                        {item.name}: {item.rawPreview}
                      </span>
                    ))}
                    {sceneState.genericModel?.omittedCount > 0 && (
                      <span
                        style={{
                          background: '#1f2937',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          border: '1px solid #374151',
                          color: '#9ca3af',
                        }}
                      >
                        +{sceneState.genericModel.omittedCount} ตัวแปรเพิ่มเติม
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
