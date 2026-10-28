import * as THREE from 'three';
import type { WorldTile, FloatingDataItem } from './sceneReducer';

export interface WorldTilesController {
  group: THREE.Group;
  update(tiles: WorldTile[], dataItems: FloatingDataItem[], delta: number, reducedMotion?: boolean): void;
  dispose(): void;
}

export function createWorldTiles(): WorldTilesController {
  const group = new THREE.Group();

  // วัสดุกระเบื้องต่างๆ
  const normalTileGeo = new THREE.BoxGeometry(1.3, 0.2, 1.3);
  const normalTileMat = new THREE.MeshStandardMaterial({
    color: 0x37474f, // Slate dark stone
    roughness: 0.8,
  });

  const pathTileMat = new THREE.MeshStandardMaterial({
    color: 0x546e7a, // Light stone
    roughness: 0.6,
  });

  const visitedTileMat = new THREE.MeshStandardMaterial({
    color: 0x00838f, // Teal glowing stepped stone
    roughness: 0.4,
  });

  const targetTileMat = new THREE.MeshStandardMaterial({
    color: 0xf57f17, // Golden goal stone
    roughness: 0.3,
  });

  // แผนผัง Mesh ของกระเบื้อง
  const tileMeshes: Map<string, THREE.Mesh> = new Map();

  // กลุ่มสำหรับ Floating Data Items (General Python)
  const dataGroup = new THREE.Group();
  group.add(dataGroup);

  const crystalGeo = new THREE.OctahedronGeometry(0.25, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xab47bc, // Violet magic crystal
    roughness: 0.2,
    metalness: 0.5,
  });

  // Mesh pool เพื่อป้องกัน memory leak จากการสร้าง Mesh ใหม่ทุกเฟรม (Prevent per-frame allocation leak)
  const crystalMeshPool: THREE.Mesh[] = [];

  let pulseTime = 0;

  return {
    group,
    update(tiles: WorldTile[], dataItems: FloatingDataItem[], delta: number, reducedMotion = false) {
      if (!reducedMotion) {
        pulseTime += delta * 3;
      }

      // 1. อัปเดตหรือสร้างกระเบื้อง
      for (const tile of tiles) {
        const key = `${tile.x}_${tile.y}`;
        let mesh = tileMeshes.get(key);

        if (!mesh) {
          mesh = new THREE.Mesh(normalTileGeo, normalTileMat);
          mesh.position.set(tile.x * 1.5, -0.1, tile.y * 1.5);
          mesh.receiveShadow = true;
          group.add(mesh);
          tileMeshes.set(key, mesh);
        }

        // เลือกวัสดุตามสถานะ
        if (tile.isTarget) {
          mesh.material = targetTileMat;
        } else if (tile.isVisited) {
          mesh.material = visitedTileMat;
        } else if (tile.isPath) {
          mesh.material = pathTileMat;
        } else {
          mesh.material = normalTileMat;
        }
      }

      // 2. อัปเดต Floating Data Items สำหรับโค้ดทั่วไปโดยใช้ Object Pool (Zero per-frame allocation)
      const count = dataItems.length;

      // เพิ่ม Mesh ใน Pool เมื่อจำเป็น
      while (crystalMeshPool.length < count) {
        const mesh = new THREE.Mesh(crystalGeo, crystalMat);
        mesh.castShadow = true;
        dataGroup.add(mesh);
        crystalMeshPool.push(mesh);
      }

      // ปรับตำแหน่งและการแสดงผลของแต่ละ Mesh
      for (let idx = 0; idx < crystalMeshPool.length; idx++) {
        const mesh = crystalMeshPool[idx];
        if (!mesh) continue;

        if (idx < count) {
          mesh.visible = true;
          const item = dataItems[idx];
          const baseHeight = item?.height ?? 1;

          if (reducedMotion) {
            const angle = (idx / Math.max(1, count)) * Math.PI * 2;
            const radius = 2.2;
            const cx = Math.cos(angle) * radius + 1.5;
            const cz = Math.sin(angle) * radius;
            mesh.position.set(cx, baseHeight, cz);
            mesh.rotation.set(0, (idx * Math.PI) / 4, 0);
          } else {
            const angle = (idx / Math.max(1, count)) * Math.PI * 2 + pulseTime * 0.2;
            const radius = 2.2;
            const cx = Math.cos(angle) * radius + 1.5;
            const cz = Math.sin(angle) * radius;
            const cy = baseHeight + Math.sin(pulseTime + idx) * 0.15;

            mesh.position.set(cx, cy, cz);
            mesh.rotation.y = pulseTime * 1.5 + idx;
            mesh.rotation.x = pulseTime * 0.8;
          }
        } else {
          mesh.visible = false;
        }
      }
    },
    dispose() {
      normalTileGeo.dispose();
      normalTileMat.dispose();
      pathTileMat.dispose();
      visitedTileMat.dispose();
      targetTileMat.dispose();
      crystalGeo.dispose();
      crystalMat.dispose();

      tileMeshes.forEach((mesh) => {
        group.remove(mesh);
      });
      tileMeshes.clear();

      crystalMeshPool.forEach((mesh) => {
        dataGroup.remove(mesh);
      });
      crystalMeshPool.length = 0;

      dataGroup.clear();
      group.clear();
    },
  };
}
