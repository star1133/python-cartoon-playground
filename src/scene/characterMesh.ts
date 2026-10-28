import * as THREE from 'three';

export interface CharacterController {
  group: THREE.Group;
  update(
    targetGridX: number,
    targetGridY: number,
    targetDirection: number,
    action: string,
    delta: number,
    reducedMotion: boolean,
    customWorldPos?: { x: number; y?: number; z: number; rotY?: number }
  ): void;
  dispose(): void;
}

export function createCharacterMesh(): CharacterController {
  const group = new THREE.Group();
  const robotGroup = new THREE.Group();

  // 1. ลำตัวหุ่นยนต์หลัก (ทรงแคปซูล/โค้งมน สีฟ้าสดใส สไตล์การ์ตูน)
  const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.45, 12, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x29b6f6, // Bright friendly cyan-blue
    roughness: 0.3,
    metalness: 0.1,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = 0.55;
  bodyMesh.castShadow = true;
  robotGroup.add(bodyMesh);

  // 2. หน้ากากใบหน้า (Visor กระจกเงาสีเข้ม)
  const visorGeo = new THREE.BoxGeometry(0.38, 0.22, 0.2);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x1a237e, // Deep navy gloss
    roughness: 0.1,
    metalness: 0.8,
  });
  const visorMesh = new THREE.Mesh(visorGeo, visorMat);
  visorMesh.position.set(0, 0.65, 0.25);
  robotGroup.add(visorMesh);

  // 3. ดวงตากลมโตเป็นมิตร (ดวงตาคู่เปล่งประกายสีขาว-ฟ้า)
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe0f7fa });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.1, 0.65, 0.36);
  robotGroup.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.1, 0.65, 0.36);
  robotGroup.add(rightEye);

  // 4. กระเป๋าหลังนักสำรวจ (Backpack) สีส้มอมทอง
  const packGeo = new THREE.BoxGeometry(0.32, 0.35, 0.18);
  const packMat = new THREE.MeshStandardMaterial({
    color: 0xff9800,
    roughness: 0.5,
  });
  const packMesh = new THREE.Mesh(packGeo, packMat);
  packMesh.position.set(0, 0.55, -0.25);
  robotGroup.add(packMesh);

  // 5. เสาอากาศมินิบนศีรษะ (Antenna)
  const antennaPoleGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.18);
  const antennaPoleMat = new THREE.MeshStandardMaterial({ color: 0x78909c });
  const antennaPole = new THREE.Mesh(antennaPoleGeo, antennaPoleMat);
  antennaPole.position.set(0, 0.95, 0);
  robotGroup.add(antennaPole);

  const antennaTipGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const antennaTipMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
  const antennaTip = new THREE.Mesh(antennaTipGeo, antennaTipMat);
  antennaTip.position.set(0, 1.05, 0);
  robotGroup.add(antennaTip);

  // 6. เงาทรงกลมใต้เท้า (Floating Shadow Disk) อยู่ที่ระดับพื้น
  const shadowGeo = new THREE.CircleGeometry(0.4, 24);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.25,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.y = 0.02;

  group.add(robotGroup);
  group.add(shadowMesh);

  let currentWorldX = 0;
  let currentWorldZ = 0;
  let currentRotY = 0;
  let hopTime = 0;

  return {
    group,
    update(targetGridX, targetGridY, targetDirection, action, delta, reducedMotion, customWorldPos) {
      // แปลงทิศทาง 0=East(+X), 1=South(+Z), 2=West(-X), 3=North(-Z)
      const targetAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];
      let targetRot = targetAngles[((targetDirection % 4) + 4) % 4] ?? 0;

      // พิกัดจริงใน Three.js (กรณีมี customWorldPos หรือคำนวณจาก grid)
      let targetX = targetGridX * 1.5;
      let targetZ = targetGridY * 1.5;

      if (customWorldPos) {
        targetX = customWorldPos.x;
        targetZ = customWorldPos.z;
        if (customWorldPos.rotY !== undefined) {
          targetRot = customWorldPos.rotY;
        }
      }

      if (reducedMotion) {
        currentWorldX = targetX;
        currentWorldZ = targetZ;
        currentRotY = targetRot;
        robotGroup.position.y = 0;
        robotGroup.rotation.y = 0;
        group.position.set(currentWorldX, 0, currentWorldZ);
        group.rotation.y = currentRotY;
        shadowMesh.scale.set(1, 1, 1);
        return;
      }

      const distToTarget = Math.hypot(targetX - currentWorldX, targetZ - currentWorldZ);

      // เมื่อมีการ seek หรือย้อนหลังข้ามพิกัดระยะไกล (> 3.0) ให้กระโดดพิกัดทันที
      if (distToTarget > 3.0) {
        currentWorldX = targetX;
        currentWorldZ = targetZ;
        currentRotY = targetRot;
      } else {
        // Smooth interpolation สู่พิกัดเป้าหมาย
        const lerpSpeed = Math.min(delta * 8, 1);
        currentWorldX += (targetX - currentWorldX) * lerpSpeed;
        currentWorldZ += (targetZ - currentWorldZ) * lerpSpeed;

        let rotDiff = targetRot - currentRotY;
        while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
        while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
        currentRotY += rotDiff * lerpSpeed;
      }

      // แอนิเมชันตามแอ็กชัน
      const isWalking = distToTarget > 0.05 || action === 'walk';

      if (isWalking) {
        hopTime += delta * 12;
        const hopY = Math.abs(Math.sin(hopTime)) * 0.28;
        robotGroup.position.y = hopY;
        robotGroup.rotation.y = 0;
        const shadowScale = Math.max(0.65, 1 - (hopY / 0.28) * 0.3);
        shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
      } else if (action === 'celebrate') {
        hopTime += delta * 14;
        const jumpY = Math.abs(Math.sin(hopTime)) * 0.45;
        robotGroup.position.y = jumpY;
        robotGroup.rotation.y += delta * 6; // หมุนฉลอง 360 องศา
        const shadowScale = Math.max(0.55, 1 - (jumpY / 0.45) * 0.4);
        shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
      } else if (action === 'cast') {
        hopTime += delta * 6;
        const hoverY = 0.12 + Math.sin(hopTime) * 0.08;
        robotGroup.position.y = hoverY;
        robotGroup.rotation.y = Math.sin(hopTime * 0.5) * 0.2;
        shadowMesh.scale.set(0.85, 0.85, 0.85);
      } else {
        // หายใจเบาๆ ตอนอยู่นิ่ง (Idle breathing / studying)
        hopTime += delta * 3;
        const breatheY = Math.sin(hopTime) * 0.03;
        robotGroup.position.y = breatheY;
        robotGroup.rotation.y = 0;
        shadowMesh.scale.set(1, 1, 1);
      }

      group.position.set(currentWorldX, 0, currentWorldZ);
      group.rotation.y = currentRotY;
    },
    dispose() {
      bodyGeo.dispose();
      bodyMat.dispose();
      visorGeo.dispose();
      visorMat.dispose();
      eyeGeo.dispose();
      eyeMat.dispose();
      packGeo.dispose();
      packMat.dispose();
      antennaPoleGeo.dispose();
      antennaPoleMat.dispose();
      antennaTipGeo.dispose();
      antennaTipMat.dispose();
      shadowGeo.dispose();
      shadowMat.dispose();
      robotGroup.clear();
      group.clear();
    },
  };
}
