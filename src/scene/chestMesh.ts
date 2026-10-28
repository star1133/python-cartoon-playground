import * as THREE from 'three';

export interface ChestController {
  group: THREE.Group;
  update(isOpen: boolean, delta: number, reducedMotion: boolean): void;
  setPosition(gridX: number, gridY: number): void;
  dispose(): void;
}

export function createChestMesh(): ChestController {
  const group = new THREE.Group();

  // 1. ฐานกล่องสมบัติ (Base Chest) ไม้สีน้ำตาลอบอุ่น
  const baseGeo = new THREE.BoxGeometry(0.8, 0.45, 0.6);
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6d4c41, // Warm mahogany wood
    roughness: 0.6,
  });
  const baseMesh = new THREE.Mesh(baseGeo, woodMat);
  baseMesh.position.y = 0.225;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // ขอบทองที่ฐาน (Gold Trim Band)
  const trimGeo = new THREE.BoxGeometry(0.82, 0.08, 0.62);
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xffca28, // Bright gold
    metalness: 0.7,
    roughness: 0.2,
  });
  const trimMesh = new THREE.Mesh(trimGeo, goldMat);
  trimMesh.position.y = 0.35;
  group.add(trimMesh);

  // รูกุญแจสีทองด้านหน้า (Lock plate)
  const lockGeo = new THREE.BoxGeometry(0.12, 0.12, 0.04);
  const lockMesh = new THREE.Mesh(lockGeo, goldMat);
  lockMesh.position.set(0, 0.3, 0.32);
  group.add(lockMesh);

  // 2. ฝากล่องแบบเปิด-ปิดได้ (Hinged Lid)
  const lidPivot = new THREE.Group();
  // จุดหมุนอยู่ขอบด้านหลังที่ความสูง 0.45 และแกน Z = -0.3
  lidPivot.position.set(0, 0.45, -0.3);
  group.add(lidPivot);

  // ตัวฝาไม้ทรงโค้งมน
  const lidGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16, 1, false, 0, Math.PI);
  const lidMesh = new THREE.Mesh(lidGeo, woodMat);
  lidMesh.rotation.z = Math.PI / 2;
  lidMesh.position.set(0, 0, 0.3); // ปรับตำแหน่งเทียบกับ pivot
  lidMesh.castShadow = true;
  lidPivot.add(lidMesh);

  // ขอบทองบนฝา
  const lidTrimGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.1, 16, 1, false, 0, Math.PI);
  const lidTrimLeft = new THREE.Mesh(lidTrimGeo, goldMat);
  lidTrimLeft.rotation.z = Math.PI / 2;
  lidTrimLeft.position.set(-0.25, 0, 0.3);
  lidPivot.add(lidTrimLeft);

  const lidTrimRight = new THREE.Mesh(lidTrimGeo, goldMat);
  lidTrimRight.rotation.z = Math.PI / 2;
  lidTrimRight.position.set(0.25, 0, 0.3);
  lidPivot.add(lidTrimRight);

  // 3. แสงทองส่องประกายภายในเมื่อเปิด (Golden Glow Mesh)
  const glowGeo = new THREE.SphereGeometry(0.2, 12, 12);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffe082,
    transparent: true,
    opacity: 0,
  });
  const glowMesh = new THREE.Mesh(glowGeo, glowMat);
  glowMesh.position.set(0, 0.35, 0);
  group.add(glowMesh);

  let currentLidAngle = 0;

  return {
    group,
    setPosition(gridX: number, gridY: number) {
      group.position.set(gridX * 1.5, 0, gridY * 1.5);
    },
    update(isOpen: boolean, delta: number, reducedMotion: boolean) {
      const targetAngle = isOpen ? -1.8 : 0; // เปิดฝาไปข้างหลัง

      if (reducedMotion) {
        currentLidAngle = targetAngle;
        glowMat.opacity = isOpen ? 0.9 : 0;
        glowMesh.scale.set(1, 1, 1);
      } else {
        const speed = Math.min(delta * 6, 1);
        currentLidAngle += (targetAngle - currentLidAngle) * speed;
        const openProgress = Math.abs(currentLidAngle) / 1.8;
        glowMat.opacity = Math.min(openProgress * 0.9, 0.9);
        if (openProgress > 0.5) {
          const pulse = 1 + Math.sin(Date.now() * 0.006) * 0.15;
          glowMesh.scale.set(pulse, pulse, pulse);
        }
      }

      lidPivot.rotation.x = currentLidAngle;
    },
    dispose() {
      baseGeo.dispose();
      woodMat.dispose();
      trimGeo.dispose();
      goldMat.dispose();
      lockGeo.dispose();
      lidGeo.dispose();
      lidTrimGeo.dispose();
      glowGeo.dispose();
      glowMat.dispose();
      lidPivot.clear();
      group.clear();
    },
  };
}
