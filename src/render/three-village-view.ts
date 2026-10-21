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

  // 營火火星粒子系統
  private emberParticles: THREE.Points | null = null;
  private emberPositions: Float32Array | null = null;

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

    // 2. 初始化 WebGL 渲染器 (確保正確 DPI 解析度、柔和陰影與色調映射)
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

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

    // 響應視窗調整 (高解析度重設)
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  /**
   * 計算特定 (x, z) 座標的 3D Low-Poly 地形高度，確保建築、植被與玩家緊貼地表
   */
  public getTerrainHeight(x: number, z: number): number {
    const distCenter = Math.sqrt(x * x + z * z);
    // 基礎微起伏噪波
    let h = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 1.4 + Math.sin((x + z) * 0.12) * 0.4;

    // 1. 北側占星台與預言家高地 (z < -18): 逐級升高為天然石台
    if (z < -18) {
      const northFactor = (-z - 18) * 0.28;
      h += Math.min(6.2, northFactor + Math.cos(x * 0.1) * 0.8);
    }

    // 2. 東側黑森林與狼人狩獵秘境 (x > 24): 連綿山丘與幽暗樹谷
    if (x > 24) {
      const eastFactor = (x - 24) * 0.22;
      const distToLair = Math.sqrt((x - 52) ** 2 + (z - 5) ** 2);
      if (distToLair < 14) {
        h += 0.8; // 盆地平整
      } else {
        h += Math.min(5.2, eastFactor + Math.sin(z * 0.14) * 1.2);
      }
    }

    // 3. 西側金黃農莊階梯田 (x < -24): 梯田緩坡與平整麥田
    if (x < -24) {
      const westFactor = (-x - 24) * 0.12;
      h += Math.min(2.8, westFactor + Math.sin(z * 0.18) * 0.5);
    }

    // 4. 南側邊境丘陵 (z > 32): 防禦性微丘
    if (z > 32) {
      h += Math.min(4.5, (z - 32) * 0.2);
    }

    // 5. 村莊外圍天然山脊高牆 (防邊界空洞)
    const edgeDistX = Math.max(0, Math.abs(x) - 72);
    const edgeDistZ = Math.max(0, Math.abs(z) - 58);
    const edgeDist = Math.sqrt(edgeDistX * edgeDistX + edgeDistZ * edgeDistZ);
    if (edgeDist > 0) {
      h += Math.min(14.0, edgeDist * 0.7);
    }

    // 6. 中央火堆議事廣場 (半徑 18 內平緩，方便眾人圍坐會議)
    if (distCenter < 18) {
      const blend = Math.max(0, (distCenter - 6) / 12);
      h = h * (blend * blend * (3 - 2 * blend));
    }

    return h;
  }

  /**
   * 建立具備高低起伏與豐富生態頂點色 (Vertex Colors) 的 Low-Poly 地形
   */
  private createUndulatingTerrain(): void {
    const geo = new THREE.PlaneGeometry(240, 200, 72, 60);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    const colorPlaza = new THREE.Color('#9e825a');      // 暖色泥土/踏實廣場
    const colorPath = new THREE.Color('#b39368');       // 步道土黃
    const colorGrass = new THREE.Color('#46702e');      // 鮮活青草地
    const colorDarkGrass = new THREE.Color('#355722');  // 深色草坪
    const colorWheatSoil = new THREE.Color('#8b6336');  // 肥沃農莊耕地
    const colorRock = new THREE.Color('#646c65');       // 北山石質高台
    const colorForest = new THREE.Color('#1c3315');     // 東側黑森林幽暗松針苔蘚

    const tmpColor = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);

      // 使用高度採樣函數
      const h = this.getTerrainHeight(vx, vz);
      pos.setY(i, h);

      // 依據位置與海拔計算頂點顏色
      const distFromCenter = Math.sqrt(vx * vx + vz * vz);
      const isRoad = Math.abs(vx) < 3.2 || Math.abs(vz) < 3.2 || (distFromCenter < 14);

      if (distFromCenter < 14) {
        tmpColor.copy(colorPlaza);
      } else if (isRoad && distFromCenter < 52) {
        tmpColor.copy(colorPath);
      } else if (vx < -28 && Math.abs(vz) < 32) {
        tmpColor.copy(colorWheatSoil);
      } else if (vz < -24 && h > 2.8) {
        tmpColor.copy(colorRock);
      } else if (vx > 25) {
        tmpColor.copy(colorForest);
      } else {
        const jitter = (Math.sin(vx * 3.7) + Math.cos(vz * 4.1)) * 0.08;
        tmpColor.copy(jitter > 0 ? colorGrass : colorDarkGrass);
      }

      if (h > 5.5) {
        tmpColor.lerp(colorRock, Math.min(0.7, (h - 5.5) * 0.15));
      }

      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.88,
      metalness: 0.04
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.terrainMesh = mesh;

    // 建立營火火星飄逸粒子系統
    this.createBonfireEmbers();
  }

  /**
   * 建立火堆星火上升粒子
   */
  private createBonfireEmbers(): void {
    const particleCount = 45;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 1.8;
      positions[i * 3 + 1] = 0.5 + Math.random() * 3.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.emberPositions = positions;

    const material = new THREE.PointsMaterial({
      color: '#ff9800',
      size: 0.25,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending
    });

    this.emberParticles = new THREE.Points(geometry, material);
    this.scene.add(this.emberParticles);
  }

  /**
   * 批次加載萃取好的 .glb 模型 (包含全套自然景觀與裝飾)
   */
  private async loadAllGLBModels(): Promise<void> {
    const modelPaths: Record<string, string> = {
      // 建築與設施
      house1: '/assets/models/house_01.glb',
      house2: '/assets/models/house_02.glb',
      bonfire: '/assets/models/bonfire.glb',
      wheat: '/assets/models/wheat_crop.glb',
      bench: '/assets/models/bench.glb',
      crate: '/assets/models/crate.glb',
      barrel: '/assets/models/barrel.glb',
      // 樹木森林
      tree1: '/assets/models/nature/tree_01.glb',
      tree2: '/assets/models/nature/tree_02.glb',
      tree3: '/assets/models/nature/tree_03.glb',
      tree4: '/assets/models/nature/tree_04.glb',
      tree5: '/assets/models/nature/tree_05.glb',
      // 岩石巨石
      rock1: '/assets/models/nature/rock_01.glb',
      rock2: '/assets/models/nature/rock_02.glb',
      rock3: '/assets/models/nature/rock_03.glb',
      rock4: '/assets/models/nature/rock_04.glb',
      rock5: '/assets/models/nature/rock_05.glb',
      // 灌木植被
      bush1: '/assets/models/nature/bush_01.glb',
      bush2: '/assets/models/nature/bush_02.glb',
      bush3: '/assets/models/nature/bush_03.glb',
      // 花卉香草
      flowers1: '/assets/models/nature/flowers_01.glb',
      flowers2: '/assets/models/nature/flowers_02.glb',
      // 神秘蘑菇
      mushroom1: '/assets/models/nature/mushroom_01.glb',
      mushroom2: '/assets/models/nature/mushroom_02.glb',
      // 砍伐樹樁與枯木
      stump1: '/assets/models/nature/stump_01.glb',
      branch1: '/assets/models/nature/branch_01.glb'
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
   * 依據村莊藍圖將 3D 模型實體化擺放到起伏地形上 (結合職業場景、豐富自然植被與裝飾)
   */
  private populateVillageDecorations(): void {
    // 1. 中央會議營火與 6 張石木長椅
    const fireY = this.getTerrainHeight(0, 0);
    this.spawnModel('bonfire', 0, fireY, 0, 0.45);

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const dist = 5.4;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      const by = this.getTerrainHeight(bx, bz);
      this.spawnModel('bench', bx, by, bz, 0.8, -angle + Math.PI / 2);
    }

    // 火堆周圍散落鵝卵石
    this.spawnModel('rock1', 3.2, this.getTerrainHeight(3.2, 2.5), 2.5, 0.4);
    this.spawnModel('rock2', -3.0, this.getTerrainHeight(-3.0, -2.8), -2.8, 0.45);
    this.spawnModel('rock1', -2.8, this.getTerrainHeight(-2.8, 3.1), 3.1, 0.38);

    // 2. 6 間村民小屋 (位置與 2D 碰撞盒緊密匹配，並各自依高度落座)
    const cottageSpecs = [
      { key: 'house1', x: -55, z: -46.2, rot: 0.15, role: '亞歷山大小屋 (醫生/村民)' },
      { key: 'house2', x: -7.7, z: -46.2, rot: 0, role: '艾蓮娜小屋 (預言家占星高地)' },
      { key: 'house1', x: 39.6, z: -46.2, rot: -0.15, role: '萊昂小屋 (村民)' },
      { key: 'house2', x: -55, z: 33, rot: 3.14, role: '諾亞小屋 (農莊/小麥倉)' },
      { key: 'house1', x: -7.7, z: 33, rot: 3.0, role: '卡爾小屋 (獵人哨站)' },
      { key: 'house2', x: 39.6, z: 33, rot: -3.0, role: '洛基小屋 (黑森林狼影)' }
    ];

    for (const c of cottageSpecs) {
      const cy = this.getTerrainHeight(c.x, c.z);
      this.spawnModel(c.key, c.x, cy, c.z, 0.88, c.rot);
    }

    // 3. 北側占星高地 (預言家聖域)：巨石環、神秘蘑菇群與高山松
    const stoneRingRadius = 9.5;
    const stoneKeys = ['rock1', 'rock2', 'rock3', 'rock4', 'rock5'];
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const rx = -7.7 + Math.cos(angle) * stoneRingRadius;
      const rz = -46.2 + Math.sin(angle) * (stoneRingRadius * 0.8);
      const ry = this.getTerrainHeight(rx, rz);
      const key = stoneKeys[i % stoneKeys.length];
      this.spawnModel(key, rx, ry, rz, 0.75 + (i % 3) * 0.25, angle);
    }
    // 預言家聖域神秘發光蘑菇
    for (let m = 0; m < 5; m++) {
      const mx = -7.7 + (m - 2) * 2.2;
      const mz = -54 + Math.sin(m) * 1.8;
      const my = this.getTerrainHeight(mx, mz);
      this.spawnModel(m % 2 === 0 ? 'mushroom1' : 'mushroom2', mx, my, mz, 0.9, Math.random() * Math.PI);
    }

    // 4. 西側金黃農田與穀倉 (村民小麥工作區)
    for (let row = -24; row <= 24; row += 4.5) {
      for (let col = -68; col <= -38; col += 4.2) {
        // 避開西側木屋周邊
        const distToCottage1 = Math.sqrt((col - (-55)) ** 2 + (row - (-46.2)) ** 2);
        const distToCottage4 = Math.sqrt((col - (-55)) ** 2 + (row - 33) ** 2);
        if (distToCottage1 > 14 && distToCottage4 > 14) {
          const wx = col + Math.sin(row * 0.8) * 1.2;
          const wz = row + Math.cos(col * 0.8) * 1.2;
          const wy = this.getTerrainHeight(wx, wz);
          this.spawnModel('wheat', wx, wy, wz, 0.65, Math.random() * Math.PI);
        }
      }
    }
    // 農莊收穫木箱與酒桶堆
    this.spawnModel('crate', -42, this.getTerrainHeight(-42, -5), -5, 0.9);
    this.spawnModel('crate', -40, this.getTerrainHeight(-40, -7), -7, 0.95, 0.4);
    this.spawnModel('barrel', -45, this.getTerrainHeight(-45, 6), 6, 0.9);
    this.spawnModel('barrel', -44, this.getTerrainHeight(-44, 8), 8, 0.85);
    this.spawnModel('stump1', -38, this.getTerrainHeight(-38, 2), 2, 0.8);

    // 5. 東側深邃黑森林與狼人秘密肉品燻房
    const forestTreeKeys = ['tree1', 'tree2', 'tree3', 'tree4', 'tree5'];
    for (let fx = 28; fx <= 74; fx += 8) {
      for (let fz = -46; fz <= 46; fz += 9) {
        const distToLair = Math.sqrt((fx - 52) ** 2 + (fz - 5) ** 2);
        // 狼人肉架空地中央保持微開闊，周圍環繞茂密暗林
        if (distToLair > 7) {
          const ox = fx + (Math.sin(fz) * 3);
          const oz = fz + (Math.cos(fx) * 3);
          const oy = this.getTerrainHeight(ox, oz);
          const key = forestTreeKeys[Math.floor(Math.random() * forestTreeKeys.length)];
          this.spawnModel(key, ox, oy, oz, 0.85 + Math.random() * 0.45, Math.random() * Math.PI);

          // 森林地表隨機散落巨石、灌木與陰暗毒蘑菇
          if (Math.random() > 0.65) {
            this.spawnModel('rock2', ox + 2.5, this.getTerrainHeight(ox + 2.5, oz - 1.5), oz - 1.5, 0.6);
          }
          if (Math.random() > 0.6) {
            this.spawnModel('bush2', ox - 2, this.getTerrainHeight(ox - 2, oz + 2), oz + 2, 0.85);
          }
          if (Math.random() > 0.75) {
            this.spawnModel('mushroom2', ox + 1.5, this.getTerrainHeight(ox + 1.5, oz + 1.8), oz + 1.8, 0.8);
          }
        }
      }
    }
    // 狼人肉品燻架區域裝飾 (枯木、砍伐樁、生肉儲藏箱)
    this.spawnModel('stump1', 52, this.getTerrainHeight(52, 5), 5, 1.1);
    this.spawnModel('branch1', 55, this.getTerrainHeight(55, 7), 7, 1.0, 0.8);
    this.spawnModel('crate', 48, this.getTerrainHeight(48, 4), 4, 0.95);
    this.spawnModel('barrel', 49, this.getTerrainHeight(49, 7), 7, 0.9);

    // 6. 南側獵人營地 (射擊伐木樁與木箱)
    this.spawnModel('stump1', -7.7, this.getTerrainHeight(-7.7, 42), 42, 0.9);
    this.spawnModel('branch1', -12, this.getTerrainHeight(-12, 40), 40, 0.9, 1.2);
    this.spawnModel('crate', -4, this.getTerrainHeight(-4, 38), 38, 0.85);

    // 7. 村民主要通道兩旁花卉與灌木裝飾
    for (let pz = -30; pz <= 30; pz += 6.5) {
      if (Math.abs(pz) > 7) {
        // 西南東南步道花卉
        this.spawnModel('flowers1', -14, this.getTerrainHeight(-14, pz), pz, 0.75, Math.random());
        this.spawnModel('flowers2', 14, this.getTerrainHeight(14, pz), pz, 0.75, Math.random());
        this.spawnModel('bush1', -17, this.getTerrainHeight(-17, pz), pz, 0.7);
        this.spawnModel('bush3', 17, this.getTerrainHeight(17, pz), pz, 0.7);
      }
    }

    // 8. 外圍全圖邊界護城森林山脈 (環繞全村)
    for (let bx = -80; bx <= 80; bx += 10) {
      this.spawnModel('tree1', bx, this.getTerrainHeight(bx, -62), -62, 1.2, Math.random());
      this.spawnModel('tree2', bx, this.getTerrainHeight(bx, 62), 62, 1.2, Math.random());
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

    // 3. 營火火星飄逸動畫
    if (this.emberParticles && this.emberPositions) {
      const posAttr = this.emberParticles.geometry.attributes.position as THREE.BufferAttribute;
      const arr = posAttr.array as Float32Array;
      const count = arr.length / 3;
      const fireY = this.getTerrainHeight(0, 0);

      for (let i = 0; i < count; i++) {
        arr[i * 3 + 1] += deltaSec * (1.3 + Math.sin(i + this.animTime) * 0.4);
        arr[i * 3] += Math.sin(this.animTime * 3 + i) * 0.012;
        arr[i * 3 + 2] += Math.cos(this.animTime * 3 + i) * 0.012;

        if (arr[i * 3 + 1] > fireY + 4.2) {
          arr[i * 3] = (Math.random() - 0.5) * 1.5;
          arr[i * 3 + 1] = fireY + 0.4 + Math.random() * 0.3;
          arr[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
        }
      }
      posAttr.needsUpdate = true;
    }

    // 4. 更新與插值所有玩家 3D 角色 (緊貼起伏地表)
    this.updatePlayerMeshes(snapshot.players, localPlayerId, deltaSec);

    // 5. 相機平滑跟隨本地玩家 (平滑 Lerp)
    if (localPlayer) {
      const { x: targetX, z: targetZ } = this.to3DCoords(localPlayer.x, localPlayer.y);
      const groundY = this.getTerrainHeight(targetX, targetZ);
      const targetCamPos = new THREE.Vector3(targetX, groundY + 34, targetZ + 30);
      this.camera.position.lerp(targetCamPos, 0.08);
      this.camera.lookAt(targetX, groundY + 1.2, targetZ);

      // 夜晚點亮隨身提燈 (緊隨玩家身側)
      this.playerLantern.position.set(targetX, groundY + 2.2, targetZ);
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

      // 座標插值平滑移動
      const { x: tx, z: tz } = this.to3DCoords(p.x, p.y);
      group.position.x = THREE.MathUtils.lerp(group.position.x, tx, 0.25);
      group.position.z = THREE.MathUtils.lerp(group.position.z, tz, 0.25);

      const groundY = this.getTerrainHeight(group.position.x, group.position.z);

      // 陣亡隱藏或轉為倒地狀態
      if (!p.isAlive) {
        group.rotation.x = Math.PI / 2;
        group.position.y = groundY + 0.3;
        continue;
      } else {
        group.rotation.x = 0;
      }

      // 旋轉角度 (面向滑鼠/移動方向)
      group.rotation.y = -p.rotation + Math.PI / 2;

      // 走動微幅起伏 (Bobbing) 與貼地高度
      const isMoving = Math.abs(group.position.x - tx) > 0.05 || Math.abs(group.position.z - tz) > 0.05;
      if (isMoving) {
        group.position.y = groundY + Math.abs(Math.sin(this.animTime * 14)) * 0.18;
      } else {
        group.position.y = groundY;
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
