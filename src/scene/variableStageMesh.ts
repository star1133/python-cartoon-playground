import * as THREE from 'three';
import type { GenericSceneModel, VariableBox } from './sceneReducer';

export interface VariableStageController {
  group: THREE.Group;
  update(model: GenericSceneModel, delta: number, reducedMotion?: boolean): void;
  getVariablePosition(gridIndex: number): { x: number; y: number; z: number };
  getStackPosition(): { x: number; y: number; z: number };
  dispose(): void;
}

const MAX_STATIONS = 12;

interface CanvasHelper {
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  texture: THREE.CanvasTexture | THREE.Texture;
}

function createCanvasHelper(w: number, h: number): CanvasHelper {
  if (typeof document === 'undefined') {
    const texture = new THREE.Texture();
    return { canvas: null, ctx: null, texture };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  return { canvas, ctx, texture };
}

interface VariableStationMesh {
  stationGroup: THREE.Group;
  baseMesh: THREE.Mesh;
  glowRing: THREE.Mesh;
  labelMesh: THREE.Mesh;
  labelCanvas: HTMLCanvasElement | null;
  labelCtx: CanvasRenderingContext2D | null;
  labelTexture: THREE.CanvasTexture | THREE.Texture;
  valueGroup: THREE.Group;
  valueMesh: THREE.Mesh;
  valueCanvas: HTMLCanvasElement | null;
  valueCtx: CanvasRenderingContext2D | null;
  valueTexture: THREE.CanvasTexture | THREE.Texture;
  currentY: number;
  targetY: number;
  glowIntensity: number;
  lastLabelKey: string;
  lastValueKey: string;
}

interface StackFrameMesh {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;
  texture: THREE.CanvasTexture | THREE.Texture;
  lastText: string;
}

export function createVariableStage(): VariableStageController {
  const group = new THREE.Group();

  // 1. ฐานเวทีหลัก (Isometric Stage Platform)
  const platformGeo = new THREE.BoxGeometry(11.5, 0.25, 7.5);
  const platformMat = new THREE.MeshStandardMaterial({
    color: 0x1a1e24, // Dark slate
    roughness: 0.85,
    metalness: 0.1,
  });
  const platformMesh = new THREE.Mesh(platformGeo, platformMat);
  platformMesh.position.set(0, -0.15, 1.2);
  platformMesh.receiveShadow = true;
  group.add(platformMesh);

  // ขอบไฟนีออนรอบเวที (Glowing Edge Trim)
  const edgeGeo = new THREE.BoxGeometry(11.6, 0.05, 7.6);
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0x2d3748,
  });
  const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
  edgeMesh.position.set(0, -0.01, 1.2);
  group.add(edgeMesh);

  // 2. ลูปแทร็ก (Loop Track Circuit)
  const loopCurveGeo = new THREE.TorusGeometry(2.2, 0.05, 8, 32);
  const loopTrackMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.4,
    metalness: 0.3,
  });
  const loopTrackMesh = new THREE.Mesh(loopCurveGeo, loopTrackMat);
  loopTrackMesh.rotation.x = Math.PI / 2;
  loopTrackMesh.position.set(0, 0.02, 0);
  group.add(loopTrackMesh);

  const loopGlowMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.0,
  });
  const loopGlowMesh = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.08, 8, 32), loopGlowMat);
  loopGlowMesh.rotation.x = Math.PI / 2;
  loopGlowMesh.position.set(0, 0.03, 0);
  group.add(loopGlowMesh);

  // 3. สถานีคอลสแตก (Call Stack Station) ที่ฝั่งซ้ายของเวที
  const stackBaseGeo = new THREE.BoxGeometry(2.0, 0.2, 2.0);
  const stackBaseMat = new THREE.MeshStandardMaterial({
    color: 0x24292e,
    roughness: 0.7,
  });
  const stackBaseMesh = new THREE.Mesh(stackBaseGeo, stackBaseMat);
  stackBaseMesh.position.set(-4.5, 0, -1.0);
  stackBaseMesh.receiveShadow = true;
  group.add(stackBaseMesh);

  const stackFrames: StackFrameMesh[] = [];
  const stackFrameGeo = new THREE.BoxGeometry(1.8, 0.15, 0.8);

  for (let i = 0; i < 4; i++) {
    const helper = createCanvasHelper(256, 64);

    const mat = new THREE.MeshStandardMaterial({
      map: helper.texture,
      roughness: 0.4,
      metalness: 0.2,
    });
    const frameMesh = new THREE.Mesh(stackFrameGeo, mat);
    frameMesh.position.set(-4.5, 0.25 + i * 0.25, -1.0);
    frameMesh.castShadow = true;
    frameMesh.visible = false;
    group.add(frameMesh);

    stackFrames.push({
      mesh: frameMesh,
      canvas: helper.canvas,
      ctx: helper.ctx,
      texture: helper.texture,
      lastText: '',
    });
  }

  // 4. สถานีเอาต์พุตคอนโซล (Stdout Screen Station) ที่ฝั่งขวา
  const consoleBaseGeo = new THREE.BoxGeometry(2.0, 0.2, 1.4);
  const consoleBaseMat = new THREE.MeshStandardMaterial({
    color: 0x24292e,
    roughness: 0.7,
  });
  const consoleBaseMesh = new THREE.Mesh(consoleBaseGeo, consoleBaseMat);
  consoleBaseMesh.position.set(4.5, 0, -1.0);
  consoleBaseMesh.receiveShadow = true;
  group.add(consoleBaseMesh);

  const consoleHelper = createCanvasHelper(256, 128);
  const consoleScreenGeo = new THREE.PlaneGeometry(1.8, 0.9);
  const consoleScreenMat = new THREE.MeshBasicMaterial({
    map: consoleHelper.texture,
    transparent: true,
  });
  const consoleScreenMesh = new THREE.Mesh(consoleScreenGeo, consoleScreenMat);
  consoleScreenMesh.position.set(4.5, 0.65, -1.0);
  consoleScreenMesh.rotation.y = -Math.PI / 6;
  group.add(consoleScreenMesh);
  let lastConsoleText = '';

  // 5. ป้ายแจ้งเตือน +N Omitted
  const omittedHelper = createCanvasHelper(256, 64);
  const omittedPlateGeo = new THREE.PlaneGeometry(1.4, 0.35);
  const omittedPlateMat = new THREE.MeshBasicMaterial({
    map: omittedHelper.texture,
    transparent: true,
  });
  const omittedMesh = new THREE.Mesh(omittedPlateGeo, omittedPlateMat);
  omittedMesh.position.set(4.8, 0.3, 3.6);
  omittedMesh.visible = false;
  group.add(omittedMesh);
  let lastOmittedCount = -1;

  // 6. สถานีกล่องตัวแปร (Variable Stations Pool: 12 stations max)
  // จัดเรียง 3 แถว x 4 คอลัมน์ อย่างสมดุลในมุมไอโซเมตริก
  const boxBaseGeo = new THREE.BoxGeometry(1.3, 0.28, 1.05);
  const boxBaseMat = new THREE.MeshStandardMaterial({
    color: 0x242b35,
    roughness: 0.6,
    metalness: 0.1,
  });

  const glowRingGeo = new THREE.BoxGeometry(1.36, 0.04, 1.11);
  const labelPlaneGeo = new THREE.PlaneGeometry(1.22, 0.3);
  const valuePlaneGeo = new THREE.PlaneGeometry(1.2, 0.34);

  const stations: VariableStationMesh[] = [];

  const getStationCoords = (index: number) => {
    const row = Math.floor(index / 4); // 0, 1, 2
    const col = index % 4; // 0, 1, 2, 3
    const x = (col - 1.5) * 1.65;
    const z = 1.3 + row * 1.35;
    return { x, y: 0.14, z };
  };

  for (let i = 0; i < MAX_STATIONS; i++) {
    const coords = getStationCoords(i);
    const stationGroup = new THREE.Group();
    stationGroup.position.set(coords.x, 0, coords.z);
    stationGroup.visible = false;

    // แท่นวางตัวแปร
    const baseMesh = new THREE.Mesh(boxBaseGeo, boxBaseMat);
    baseMesh.position.y = 0.14;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    stationGroup.add(baseMesh);

    // วงแหวนสะท้อนการเปลี่ยนแปลงค่า
    const glowRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
    });
    const glowRing = new THREE.Mesh(glowRingGeo, glowRingMat);
    glowRing.position.y = 0.28;
    stationGroup.add(glowRing);

    // ป้ายชื่อตัวแปรและประเภท (Name & Type label)
    const labelHelper = createCanvasHelper(256, 64);
    const labelMat = new THREE.MeshBasicMaterial({
      map: labelHelper.texture,
      transparent: true,
    });
    const labelMesh = new THREE.Mesh(labelPlaneGeo, labelMat);
    labelMesh.position.set(0, 0.3, 0.35);
    labelMesh.rotation.x = -Math.PI / 4;
    stationGroup.add(labelMesh);

    // แผ่นโทเคนแสดงค่าของตัวแปร (Value Token Display)
    const valueGroup = new THREE.Group();
    valueGroup.position.set(0, 0.55, -0.05);

    const valueHelper = createCanvasHelper(256, 72);
    const valueMat = new THREE.MeshBasicMaterial({
      map: valueHelper.texture,
      transparent: true,
    });
    const valueMesh = new THREE.Mesh(valuePlaneGeo, valueMat);
    valueMesh.rotation.x = -Math.PI / 4;
    valueGroup.add(valueMesh);
    stationGroup.add(valueGroup);

    group.add(stationGroup);

    stations.push({
      stationGroup,
      baseMesh,
      glowRing,
      labelMesh,
      labelCanvas: labelHelper.canvas,
      labelCtx: labelHelper.ctx,
      labelTexture: labelHelper.texture,
      valueGroup,
      valueMesh,
      valueCanvas: valueHelper.canvas,
      valueCtx: valueHelper.ctx,
      valueTexture: valueHelper.texture,
      currentY: 0.55,
      targetY: 0.55,
      glowIntensity: 0,
      lastLabelKey: '',
      lastValueKey: '',
    });
  }

  // ตัวช่วยวาดป้ายข้อความบน 2D Canvas แบบ Zero-allocation
  const drawLabel = (ctx: CanvasRenderingContext2D, name: string, type: string) => {
    ctx.clearRect(0, 0, 256, 64);

    // พื้นหลังป้าย
    ctx.fillStyle = '#1e2530';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(4, 4, 248, 56, 8);
    } else {
      ctx.rect(4, 4, 248, 56);
    }
    ctx.fill();

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.stroke();

    // ชื่อตัวแปร
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 14, 32);

    // ชนิดข้อมูล
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(type, 242, 32);
  };

  const drawValue = (ctx: CanvasRenderingContext2D, preview: string, isChanged: boolean) => {
    ctx.clearRect(0, 0, 256, 72);

    // พื้นหลังโทเคน
    ctx.fillStyle = isChanged ? '#0c4a6e' : '#0f172a';
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(4, 4, 248, 64, 8);
    } else {
      ctx.rect(4, 4, 248, 64);
    }
    ctx.fill();

    ctx.strokeStyle = isChanged ? '#38bdf8' : '#475569';
    ctx.lineWidth = isChanged ? 3 : 2;
    ctx.stroke();

    // ข้อความค่าของตัวแปร
    ctx.fillStyle = isChanged ? '#7dd3fc' : '#f8fafc';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(preview, 128, 36);
  };

  const drawStackFrame = (ctx: CanvasRenderingContext2D, name: string, retVal?: string) => {
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(2, 2, 252, 60);

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 252, 60);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 12, 32);

    if (retVal) {
      ctx.fillStyle = '#4ade80';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`→ ${retVal}`, 244, 32);
    }
  };

  let animTime = 0;

  return {
    group,
    getVariablePosition(gridIndex: number) {
      const idx = Math.min(Math.max(0, gridIndex), MAX_STATIONS - 1);
      return getStationCoords(idx);
    },
    getStackPosition() {
      return { x: -4.5, y: 0.5, z: -1.0 };
    },
    update(model: GenericSceneModel, delta: number, reducedMotion = false) {
      animTime += delta;

      // 1. อัปเดตลูปแทร็ก (Loop Track)
      if (model.loopInfo?.isLooping) {
        loopGlowMesh.visible = true;
        const pulse = reducedMotion ? 0.6 : 0.4 + 0.3 * Math.sin(animTime * 6);
        (loopGlowMesh.material as THREE.MeshBasicMaterial).opacity = pulse;
      } else {
        loopGlowMesh.visible = false;
      }

      // 2. อัปเดตคอลสแตก (Call Stack Frames)
      const stackList = model.callStack ?? [];
      for (let i = 0; i < stackFrames.length; i++) {
        const frame = stackFrames[i]!;
        if (i < stackList.length) {
          frame.mesh.visible = true;
          const info = stackList[i]!;
          const textKey = `${info.frameName}_${info.returnValue ?? ''}`;
          if (frame.lastText !== textKey && frame.ctx) {
            drawStackFrame(frame.ctx, info.frameName, info.returnValue);
            frame.texture.needsUpdate = true;
            frame.lastText = textKey;
          }
        } else {
          frame.mesh.visible = false;
        }
      }

      // 3. อัปเดตสถานีคอนโซล (Stdout Screen)
      const curStdout = model.recentStdout || '';
      if (curStdout !== lastConsoleText && consoleHelper.ctx) {
        consoleHelper.ctx.clearRect(0, 0, 256, 128);
        consoleHelper.ctx.fillStyle = '#0f172a';
        consoleHelper.ctx.fillRect(4, 4, 248, 120);

        consoleHelper.ctx.strokeStyle = '#38bdf8';
        consoleHelper.ctx.lineWidth = 2;
        consoleHelper.ctx.strokeRect(4, 4, 248, 120);

        consoleHelper.ctx.fillStyle = '#38bdf8';
        consoleHelper.ctx.font = 'bold 16px monospace';
        consoleHelper.ctx.textAlign = 'left';
        consoleHelper.ctx.fillText('> stdout output', 14, 28);

        consoleHelper.ctx.fillStyle = '#f1f5f9';
        consoleHelper.ctx.font = '16px monospace';
        const displayLines = curStdout.split('\n').slice(0, 3);
        displayLines.forEach((line, idx) => {
          consoleHelper.ctx?.fillText(line.slice(0, 24), 14, 56 + idx * 24);
        });

        consoleHelper.texture.needsUpdate = true;
        lastConsoleText = curStdout;
      }

      // 4. อัปเดตป้ายแจ้งเตือน +N Omitted
      if (model.omittedCount > 0) {
        omittedMesh.visible = true;
        if (model.omittedCount !== lastOmittedCount && omittedHelper.ctx) {
          omittedHelper.ctx.clearRect(0, 0, 256, 64);
          omittedHelper.ctx.fillStyle = 'rgba(51, 65, 85, 0.9)';
          omittedHelper.ctx.fillRect(4, 4, 248, 56);
          omittedHelper.ctx.strokeStyle = '#94a3b8';
          omittedHelper.ctx.lineWidth = 2;
          omittedHelper.ctx.strokeRect(4, 4, 248, 56);

          omittedHelper.ctx.fillStyle = '#f8fafc';
          omittedHelper.ctx.font = 'bold 20px monospace';
          omittedHelper.ctx.textAlign = 'center';
          omittedHelper.ctx.textBaseline = 'middle';
          omittedHelper.ctx.fillText(`+${model.omittedCount} ตัวแปรเพิ่มเติม`, 128, 32);

          omittedHelper.texture.needsUpdate = true;
          lastOmittedCount = model.omittedCount;
        }
      } else {
        omittedMesh.visible = false;
      }

      // 5. อัปเดตสถานีกล่องตัวแปร (Variable Stations)
      const varCount = model.variables.length;
      for (let i = 0; i < MAX_STATIONS; i++) {
        const st = stations[i]!;
        if (i < varCount) {
          st.stationGroup.visible = true;
          const v: VariableBox = model.variables[i]!;

          // ตรวจสอบและวาดป้ายชื่อเมื่อเปลี่ยนแปลง
          const labelKey = `${v.name}_${v.type}`;
          if (st.lastLabelKey !== labelKey && st.labelCtx) {
            drawLabel(st.labelCtx, v.name, v.parsed.displayType);
            st.labelTexture.needsUpdate = true;
            st.lastLabelKey = labelKey;
          }

          // ตรวจสอบและวาดป้ายค่าเมื่อเปลี่ยนแปลง
          const valueKey = `${v.rawPreview}_${v.isChanged ? '1' : '0'}`;
          if (st.lastValueKey !== valueKey && st.valueCtx) {
            drawValue(st.valueCtx, v.rawPreview, v.isChanged);
            st.valueTexture.needsUpdate = true;
            st.lastValueKey = valueKey;

            if (v.isChanged) {
              st.targetY = 0.55;
              st.currentY = reducedMotion ? 0.55 : 0.95; // Animation drop token into box
              st.glowIntensity = 1.0;
            }
          }

          // แอนิเมชันการเคลื่อนที่ของโทเคนค่าลงสู่กล่อง
          if (reducedMotion) {
            st.valueGroup.position.y = 0.55;
            st.glowIntensity = 0;
            (st.glowRing.material as THREE.MeshBasicMaterial).opacity = v.isChanged ? 0.8 : 0;
          } else {
            if (st.currentY > st.targetY) {
              st.currentY = Math.max(st.targetY, st.currentY - delta * 2.0);
            }
            st.valueGroup.position.y = st.currentY;

            if (st.glowIntensity > 0) {
              st.glowIntensity = Math.max(0, st.glowIntensity - delta * 1.5);
            }
            (st.glowRing.material as THREE.MeshBasicMaterial).opacity = st.glowIntensity * 0.85;
          }
        } else {
          st.stationGroup.visible = false;
        }
      }
    },
    dispose() {
      platformGeo.dispose();
      platformMat.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      loopCurveGeo.dispose();
      loopTrackMat.dispose();
      loopGlowMat.dispose();
      stackBaseGeo.dispose();
      stackBaseMat.dispose();
      stackFrameGeo.dispose();
      consoleBaseGeo.dispose();
      consoleBaseMat.dispose();
      consoleScreenGeo.dispose();
      consoleScreenMat.dispose();
      consoleHelper.texture.dispose();
      omittedPlateGeo.dispose();
      omittedPlateMat.dispose();
      omittedHelper.texture.dispose();
      boxBaseGeo.dispose();
      boxBaseMat.dispose();
      glowRingGeo.dispose();
      labelPlaneGeo.dispose();
      valuePlaneGeo.dispose();

      for (const f of stackFrames) {
        f.texture.dispose();
        if (f.mesh.material instanceof THREE.Material) f.mesh.material.dispose();
      }

      for (const st of stations) {
        st.labelTexture.dispose();
        st.valueTexture.dispose();
        if (st.glowRing.material instanceof THREE.Material) st.glowRing.material.dispose();
        if (st.labelMesh.material instanceof THREE.Material) st.labelMesh.material.dispose();
        if (st.valueMesh.material instanceof THREE.Material) st.valueMesh.material.dispose();
      }
    },
  };
}
