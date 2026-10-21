/**
 * @file three-village-view.ts
 * @description 3D Low-Poly 狼人村莊渲染器：地形高低起伏、GLB 模型載入、相機跟隨與四時段動態光影
 */

import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VillageMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState } from '../core/types';

export class ThreeVillageRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private gltfLoader: GLTFLoader;

  // 光源
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private bonfireLight: THREE.PointLight;
  private playerLantern: THREE.PointLight;

  // 3D 玩家網格快取
  private playerMeshes: Map<PlayerId, THREE.Group> = new Map();

  // GLB 模型原型快取
  private modelPrototypes: Map<string, THREE.Group> = new Map();
  public isModelsLoaded: boolean = false;

  // 地形網格
  public terrainMesh: THREE.Mesh | null = null;

  // 火堆動畫計時
  private animTime: number = 0;

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0b1009');
    this.scene.fog = new THREE.FogExp2('#0b1009', 0.008);

    // 1. 初始化斜 45 度微縮模型跟隨相機 (Isometric-style Perspective)
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 500);
    this.camera.position.set(0, 42, 38);

    // 2. 初始化 WebGL 渲染器 (柔和陰影與色調映射)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    container.appendChild(this.renderer.domElement);

    // 3. 設定光照系統
    this.ambientLight = new THREE.AmbientLight('#fff3d6', 0.6);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight('#fff8e7', 1.4);
    this.sunLight.position.set(40, 60, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 180;
    const shadowD = 75;
    this.sunLight.shadow.camera.left = -shadowD;
    this.sunLight.shadow.camera.right = shadowD;
    this.sunLight.shadow.camera.top = shadowD;
    this.sunLight.shadow.camera.bottom = -shadowD;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // 中央火堆動態暖光
    this.bonfireLight = new THREE.PointLight('#ff7a18', 3.0, 35, 1.2);
    this.bonfireLight.position.set(0, 2.2, 0);
    this.bonfireLight.castShadow = true;
    this.scene.add(this.bonfireLight);

    // 玩家隨身提燈 (夜晚自動增強)
    this.playerLantern = new THREE.PointLight('#ffe4a0', 0, 18, 1.5);
    this.scene.add(this.playerLantern);

    this.gltfLoader = new GLTFLoader();

    // 4. 建立起伏低多邊形地形與裝飾
    this.createUndulatingTerrain();

    // 5. 批次載入外部 .glb 模型
    this.loadAllGLBModels();

    // 響應視窗調整
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * 建立具備高低起伏與斜坡的 Low-Poly 地形
   */
  private createUndulatingTerrain(): void {
    const geo = new THREE.PlaneGeometry(220, 180, 56, 44);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      // 中心火堆廣場微微凹陷 (聚攏感)，邊界向外微微隆起為自然山丘
      const distFromCenter = Math.sqrt(vx * vx + vz * vz);
      let height = Math.sin(vx * 0.08) * Math.cos(vz * 0.08) * 1.5;

      // 北方占星高地山丘 (vz < -25)
      if (vz < -20) {
        height += Math.min(6.5, (-vz - 20) * 0.35);
      }

      // 東方黑森林邊界微丘 (vx > 35)
      if (vx > 30) {
        height += Math.min(4.5, (vx - 30) * 0.25);
      }

      // 中央廣場平坦
      if (distFromCenter < 18) {
        height *= 0.2;
      }

      pos.setY(i, height);
    }

    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: '#344e26',
      flatShading: true,
      roughness: 0.85,
      metalness: 0.05
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;
  }

  /**
   * 批次加載萃取好的 .glb 模型
   */
  private async loadAllGLBModels(): Promise<void> {
    const modelPaths: Record<string, string> = {
      house1: '/assets/models/house_01.glb',
      house2: '/assets/models/house_02.glb',
      bonfire: '/assets/models/bonfire.glb',
      wheat: '/assets/models/wheat_crop.glb',
      bench: '/assets/models/bench.glb',
      crate: '/assets/models/crate.glb',
      barrel: '/assets/models/barrel.glb',
      tree1: '/assets/models/nature/tree_01.glb',
      tree2: '/assets/models/nature/tree_02.glb',
      tree3: '/assets/models/nature/tree_03.glb',
      tree4: '/assets/models/nature/tree_04.glb',
      rock1: '/assets/models/nature/rock_01.glb',
      rock2: '/assets/models/nature/rock_02.glb',
      bush1: '/assets/models/nature/bush_01.glb',
      flowers1: '/assets/models/nature/flowers_01.glb'
    };

    const loadPromises = Object.entries(modelPaths).map(([key, url]) => {
      return new Promise<void>((resolve) => {
        this.gltfLoader.load(
          url,
          (gltf: GLTF) => {
            const root = gltf.scene;
            root.traverse((node) => {
              if ((node as THREE.Mesh).isMesh) {
                node.castShadow = true;
                node.receiveShadow = true;
              }
            });
            this.modelPrototypes.set(key, root);
            resolve();
          },
          undefined,
          (err) => {
            console.warn(`[ThreeRenderer] 模型 ${url} 載入失敗:`, err);
            resolve();
          }
        );
      });
    });

    await Promise.all(loadPromises);
    this.isModelsLoaded = true;
    this.populateVillageDecorations();
    console.log('✅ 所有 3D Low-Poly 村莊模型加載並佈局完成！');
  }

  /**
   * 依據村莊藍圖將 3D 模型實體化擺放到地形上
   */
  private populateVillageDecorations(): void {
    // 1. 中央營火
    this.spawnModel('bonfire', 0, 0, 0, 0.45);

    // 2. 圍繞營火的 6 張木椅
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const dist = 5.2;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      this.spawnModel('bench', bx, 0, bz, 0.8, -angle + Math.PI / 2);
    }

    // 3. 6 間村民小屋 (環形分佈)
    const houseCoords = [
      { key: 'house1', x: -38, z: -32, rot: 0.2 },
      { key: 'house2', x: 0, z: -42, rot: 0 },
      { key: 'house1', x: 38, z: -32, rot: -0.2 },
      { key: 'house2', x: -38, z: 28, rot: 3.0 },
      { key: 'house1', x: 0, z: 35, rot: 3.14 },
      { key: 'house2', x: 38, z: 28, rot: -2.9 }
    ];

    for (const hc of houseCoords) {
      this.spawnModel(hc.key, hc.x, 0, hc.z, 0.9, hc.rot);
    }

    // 4. 西側金黃小麥農田 (擺放小麥叢與收穫木箱)
    for (let row = -18; row <= 18; row += 5) {
      for (let col = -65; col <= -45; col += 4.5) {
        this.spawnModel('wheat', col + Math.sin(row) * 1.5, 0, row + Math.cos(col) * 1.5, 0.65, Math.random() * Math.PI);
      }
    }
    this.spawnModel('crate', -48, 0, -4, 0.9);
    this.spawnModel('crate', -46, 0, -6, 0.9, 0.5);
    this.spawnModel('barrel', -50, 0, 8, 0.9);

    // 5. 東側黑森林 (大量樹木、巨石、灌木叢)
    const forestX = [38, 46, 54, 62, 70];
    const forestZ = [-35, -20, -5, 10, 25, 40];
    const treeKeys = ['tree1', 'tree2', 'tree3', 'tree4'];

    for (const fx of forestX) {
      for (const fz of forestZ) {
        const offset = (Math.random() - 0.5) * 8;
        const key = treeKeys[Math.floor(Math.random() * treeKeys.length)];
        this.spawnModel(key, fx + offset, 0, fz + offset, 0.75 + Math.random() * 0.4, Math.random() * Math.PI);

        // 偶爾生成岩石與灌木
        if (Math.random() > 0.6) {
          this.spawnModel('rock1', fx + offset + 3, 0, fz + offset - 2, 0.6 + Math.random() * 0.5);
        }
        if (Math.random() > 0.5) {
          this.spawnModel('bush1', fx + offset - 3, 0, fz + offset + 3, 0.8 + Math.random() * 0.4);
        }
      }
    }

    // 6. 步道兩旁的花朵裝飾
    for (let pz = -22; pz <= 22; pz += 6) {
      this.spawnModel('flowers1', -16, 0, pz, 0.75, Math.random());
      this.spawnModel('flowers1', 16, 0, pz, 0.75, Math.random());
    }
  }

  private spawnModel(key: string, x: number, y: number, z: number, scale: number = 1.0, rotationY: number = 0): THREE.Group | null {
    const proto = this.modelPrototypes.get(key);
    if (!proto) return null;

    const clone = proto.clone(true);
    clone.position.set(x, y, z);
    clone.scale.set(scale, scale, scale);
    clone.rotation.y = rotationY;
    this.scene.add(clone);
    return clone;
  }

  /**
   * 2D 地圖座標映射至 3D 空間座標
   */
  public to3DCoords(x2d: number, y2d: number): { x: number; z: number } {
    // 地圖中心 (700, 500) 映射為 (0, 0)
    return {
      x: (x2d - 700) * 0.11,
      z: (y2d - 500) * 0.11
    };
  }

  /**
   * 主渲染與相機平滑跟隨
   */
  public render(
    snapshot: GameStateSnapshot,
    _map: VillageMap,
    localPlayerId: PlayerId,
    deltaSec: number = 0.016
  ): void {
    this.animTime += deltaSec;
    const localPlayer = snapshot.players[localPlayerId];

    // 1. 動態光影調整 (隨四時段自然演化)
    this.updateAtmosphereLighting(snapshot.phase, deltaSec);

    // 2. 火堆營火動態微光跳動
    const flicker = Math.sin(this.animTime * 12) * 0.6 + Math.cos(this.animTime * 21) * 0.4;
    this.bonfireLight.intensity = Math.max(1.8, 3.0 + flicker);

    // 3. 更新與插值所有玩家 3D 角色
    this.updatePlayerMeshes(snapshot.players, localPlayerId, deltaSec);

    // 4. 相機平滑跟隨本地玩家 (平滑 Lerp)
    if (localPlayer) {
      const { x: targetX, z: targetZ } = this.to3DCoords(localPlayer.x, localPlayer.y);
      const targetCamPos = new THREE.Vector3(targetX, 36, targetZ + 32);
      this.camera.position.lerp(targetCamPos, 0.08);
      this.camera.lookAt(targetX, 1.2, targetZ);

      // 夜晚點亮隨身提燈
      this.playerLantern.position.set(targetX, 2.5, targetZ);
      this.playerLantern.intensity = snapshot.phase === GamePhase.NIGHT ? 1.8 : 0;
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 四時段 3D 光影色調切換
   */
  private updateAtmosphereLighting(phase: GamePhase, _deltaSec: number): void {
    switch (phase) {
      case GamePhase.MORNING:
        // 早晨：溫暖晨曦金橘光
        this.sunLight.color.set('#ffb074');
        this.sunLight.intensity = 1.3;
        this.ambientLight.color.set('#ffe1cc');
        this.ambientLight.intensity = 0.65;
        this.scene.fog!.color.set('#20140c');
        break;

      case GamePhase.AFTERNOON:
        // 下午：明亮白晝金光
        this.sunLight.color.set('#fffbe8');
        this.sunLight.intensity = 1.5;
        this.ambientLight.color.set('#f4ebd0');
        this.ambientLight.intensity = 0.75;
        this.scene.fog!.color.set('#162214');
        break;

      case GamePhase.DUSK:
        // 黃昏：唯美紫粉晚霞
        this.sunLight.color.set('#e879f9');
        this.sunLight.intensity = 1.1;
        this.ambientLight.color.set('#d8b4fe');
        this.ambientLight.intensity = 0.55;
        this.scene.fog!.color.set('#1c0d28');
        break;

      case GamePhase.NIGHT:
        // 夜晚：深邃幽藍月光與暗夜迷霧
        this.sunLight.color.set('#38bdf8');
        this.sunLight.intensity = 0.45;
        this.ambientLight.color.set('#0f172a');
        this.ambientLight.intensity = 0.28;
        this.scene.fog!.color.set('#040711');
        break;
    }
  }

  /**
   * 3D 玩家角色的幾何結構與狀態外觀
   */
  private updatePlayerMeshes(
    players: Record<PlayerId, PlayerState>,
    localPlayerId: PlayerId,
    deltaSec: number
  ): void {
    // 移除已離線玩家
    for (const [id, group] of this.playerMeshes.entries()) {
      if (!players[id]) {
        this.scene.remove(group);
        this.playerMeshes.delete(id);
      }
    }

    for (const id in players) {
      const p = players[id];
      const isLocal = id === localPlayerId;
      let group = this.playerMeshes.get(id);

      if (!group) {
        group = this.createPlayerCharacterGroup(p, isLocal);
        this.scene.add(group);
        this.playerMeshes.set(id, group);
      }

      // 陣亡隱藏或轉為倒地狀態
      if (!p.isAlive) {
        group.rotation.x = Math.PI / 2;
        group.position.y = 0.3;
        continue;
      } else {
        group.rotation.x = 0;
      }

      // 座標插值平滑移動
      const { x: tx, z: tz } = this.to3DCoords(p.x, p.y);
      group.position.x = THREE.MathUtils.lerp(group.position.x, tx, 0.25);
      group.position.z = THREE.MathUtils.lerp(group.position.z, tz, 0.25);

      // 旋轉角度 (面向滑鼠/移動方向)
      group.rotation.y = -p.rotation + Math.PI / 2;

      // 走動微幅起伏 (Bobbing)
      const isMoving = Math.abs(group.position.x - tx) > 0.05 || Math.abs(group.position.z - tz) > 0.05;
      if (isMoving) {
        group.position.y = 1.0 + Math.sin(this.animTime * 14) * 0.15;
      } else {
        group.position.y = 1.0;
      }

      // 狼人變身狀態更新
      const wolfBody = group.getObjectByName('wolfBody');
      const humanBody = group.getObjectByName('humanBody');
      if (wolfBody && humanBody) {
        wolfBody.visible = p.isTransformed;
        humanBody.visible = !p.isTransformed;
      }

      // 護盾光環狀態
      const shield = group.getObjectByName('shieldAura');
      if (shield) {
        shield.visible = p.hasShield;
        if (p.hasShield) {
          shield.rotation.y += deltaSec * 2;
        }
      }
    }
  }

  /**
   * 建立單一角色的 3D 複合幾何模型 (人型 + 巨狼型態 + 護盾)
   */
  private createPlayerCharacterGroup(p: PlayerState, isLocal: boolean): THREE.Group {
    const group = new THREE.Group();

    // 1. 人類形態 (精緻 Low-Poly 黏土小人)
    const humanGroup = new THREE.Group();
    humanGroup.name = 'humanBody';

    // 身體軀幹
    const bodyGeo = new THREE.CylinderGeometry(0.55, 0.7, 1.2, 7);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: p.color || '#3b82f6',
      flatShading: true,
      roughness: 0.5
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.6;
    bodyMesh.castShadow = true;
    humanGroup.add(bodyMesh);

    // 頭部
    const headGeo = new THREE.DodecahedronGeometry(0.48, 1);
    const headMat = new THREE.MeshStandardMaterial({ color: '#fcd34d', flatShading: true, roughness: 0.6 });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.45;
    headMesh.castShadow = true;
    humanGroup.add(headMesh);

    // 視線面罩/帽簷 (指示朝向)
    const visorGeo = new THREE.ConeGeometry(0.2, 0.4, 4);
    visorGeo.rotateX(-Math.PI / 2);
    const visorMat = new THREE.MeshStandardMaterial({ color: '#1e293b' });
    const visorMesh = new THREE.Mesh(visorGeo, visorMat);
    visorMesh.position.set(0, 1.45, 0.45);
    humanGroup.add(visorMesh);

    group.add(humanGroup);

    // 2. 狼人變身形態 (兇猛黑狼體態 + 尖耳 + 血紅雙眼)
    const wolfGroup = new THREE.Group();
    wolfGroup.name = 'wolfBody';
    wolfGroup.visible = false;

    // 狼人健碩身軀
    const wolfGeo = new THREE.DodecahedronGeometry(0.85, 1);
    const wolfMat = new THREE.MeshStandardMaterial({ color: '#1c1917', flatShading: true, roughness: 0.7 });
    const wolfMesh = new THREE.Mesh(wolfGeo, wolfMat);
    wolfMesh.position.y = 0.8;
    wolfMesh.scale.set(1.1, 1.2, 1.3);
    wolfMesh.castShadow = true;
    wolfGroup.add(wolfMesh);

    // 狼頭與尖吻
    const snoutGeo = new THREE.ConeGeometry(0.4, 0.8, 5);
    snoutGeo.rotateX(Math.PI / 2);
    const snoutMesh = new THREE.Mesh(snoutGeo, wolfMat);
    snoutMesh.position.set(0, 1.2, 0.65);
    wolfGroup.add(snoutMesh);

    // 血紅雙眼 (發光材質)
    const eyeGeo = new THREE.BoxGeometry(0.12, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: '#ef4444' });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.25, 1.35, 0.6);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.25, 1.35, 0.6);
    wolfGroup.add(eyeL, eyeR);

    group.add(wolfGroup);

    // 3. 聖光護盾光環
    const shieldGeo = new THREE.IcosahedronGeometry(1.6, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      wireframe: true,
      transparent: true,
      opacity: 0.6
    });
    const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    shieldMesh.name = 'shieldAura';
    shieldMesh.position.y = 1.0;
    shieldMesh.visible = false;
    group.add(shieldMesh);

    // 4. 本地玩家腳底黃金光圈
    if (isLocal) {
      const ringGeo = new THREE.RingGeometry(0.9, 1.1, 16);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: '#facc15', side: THREE.DoubleSide });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.y = 0.05;
      group.add(ringMesh);
    }

    return group;
  }
}
