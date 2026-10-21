/**
 * @file three-village-view.ts
 * @description 3D Low-Poly 狼人村莊渲染器：地形高低起伏、GLB 模型載入、相機跟隨與四時段動態光影
 */

import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { VillageMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState, RoleType } from '../core/types';
import { CharacterMotionSystem } from './character-motion';

export class ThreeVillageRenderer {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  private gltfLoader: GLTFLoader;
  public motionSystem: CharacterMotionSystem = new CharacterMotionSystem();

  // 第一人稱視角狀態
  public isFirstPerson: boolean = false;
  public fpvYaw: number = Math.PI / 2;
  public fpvPitch: number = -0.05;

  // 光源
  private sunLight: THREE.DirectionalLight;
  private ambientLight: THREE.AmbientLight;
  private bonfireLight: THREE.PointLight;
  private playerLantern: THREE.PointLight;

  // 3D 玩家網格快取與可走入式木屋實例快取
  private playerMeshes: Map<PlayerId, THREE.Group> = new Map();
  private cottageInstances: Map<
    string,
    {
      group: THREE.Group;
      roofGroup: THREE.Group;
      frontWallGroup: THREE.Group;
      doorPivot: THREE.Group;
      lockBar: THREE.Mesh;
      isNorthRow: boolean;
    }
  > = new Map();

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
   * 計算特定 (x, z) 座標的 3D 地形高度：
   * 為所有建築、農田、廣場與營地建立 100% 平坦的台地 (Flat Terraces)，徹底消除建築卡進土裡或斜坡穿模問題！
   */
  public getTerrainHeight(x: number, z: number): number {
    // 定義平坦台地清單 (cx, cz 與 map-data.ts 的 2D 碰撞牆中心 100% 對齊！)
    const flatPads: Array<{ cx: number; cz: number; rFlat: number; rBlend: number; targetY: number }> = [
      // 中央火堆議事大廣場
      { cx: 0, cz: 0, rFlat: 18.0, rBlend: 26.0, targetY: 0.0 },
      // 1號木屋 (西北紅瓦屋: 2D 中心 270, 140 -> 3D -47.3, -39.6)
      { cx: -47.3, cz: -39.6, rFlat: 13.5, rBlend: 20.0, targetY: 0.8 },
      // 2號木屋與預言家觀星高地 (北側藍瓦屋: 2D 中心 700, 140 -> 3D 0.0, -39.6)
      { cx: -6.0, cz: -43.0, rFlat: 21.0, rBlend: 28.0, targetY: 2.0 },
      // 3號木屋 (東北金麥屋: 2D 中心 1130, 140 -> 3D +47.3, -39.6)
      { cx: 47.3, cz: -39.6, rFlat: 13.5, rBlend: 20.0, targetY: 1.2 },
      // 4號木屋 (西南松林屋: 2D 中心 270, 860 -> 3D -47.3, +39.6)
      { cx: -47.3, cz: 39.6, rFlat: 13.5, rBlend: 20.0, targetY: 0.6 },
      // 5號木屋與獵人哨站 (南側木屋: 2D 中心 700, 860 -> 3D 0.0, +39.6)
      { cx: -4.0, cz: 38.0, rFlat: 18.5, rBlend: 25.0, targetY: 0.8 },
      // 6號木屋 (東南黑森林邊境屋: 2D 中心 1130, 860 -> 3D +47.3, +39.6)
      { cx: 47.3, cz: 39.6, rFlat: 13.5, rBlend: 20.0, targetY: 1.0 },
      // 東側狼人秘密肉品燻房空地
      { cx: 52.0, cz: 5.0, rFlat: 12.5, rBlend: 18.5, targetY: 0.6 }
    ];

    // 西側金黃農莊與大穀倉矩形平坦區 (涵蓋穀倉 x=-68、麥田 x=-60~-44、推車與木桶 x=-42~-38)
    const inWestFarmX = Math.max(0, Math.abs(x - (-54.0)) - 22.0);
    const inWestFarmZ = Math.max(0, Math.abs(z - 0.0) - 23.0);
    const westFarmDist = Math.hypot(inWestFarmX, inWestFarmZ);

    // 十字主要道路平坦帶 (確保道路平整不崎嶇)
    const roadDistX = Math.abs(z) < 4.5 && x > -56 && x < 52 ? 0 : Math.max(0, Math.abs(z) - 4.5);
    const roadDistZ = Math.abs(x + 7.7) < 4.5 && z > -47 && z < 34 ? 0 : Math.max(0, Math.abs(x + 7.7) - 4.5);

    // 計算自然背景緩坡高度 (僅在非建築區起伏)
    let rawH = (Math.sin(x * 0.05) * Math.cos(z * 0.05) * 0.55) + 0.3;

    // 北側外圍山坡
    if (z < -28) {
      rawH += Math.min(3.5, (-z - 28) * 0.12);
    }
    // 東側黑森林緩丘
    if (x > 28) {
      rawH += Math.min(2.8, (x - 28) * 0.08 + Math.sin(z * 0.09) * 0.4);
    }
    // 南側外圍緩丘
    if (z > 38) {
      rawH += Math.min(3.0, (z - 38) * 0.12);
    }
    // 地圖最外圍邊界護城山脊 (僅在 |x| > 78 或 |z| > 60 升起，絕不影響內部建築)
    const edgeDistX = Math.max(0, Math.abs(x) - 78);
    const edgeDistZ = Math.max(0, Math.abs(z) - 60);
    const edgeDist = Math.hypot(edgeDistX, edgeDistZ);
    if (edgeDist > 0) {
      rawH += Math.min(12.0, edgeDist * 0.55);
    }

    // 1. 先套用西側農莊與大穀倉平坦台地 (高度 0.0m)
    if (westFarmDist === 0) {
      return 0.0;
    } else if (westFarmDist < 8.0) {
      const t = westFarmDist / 8.0;
      const smooth = t * t * (3 - 2 * t);
      rawH = THREE.MathUtils.lerp(0.0, rawH, smooth);
    }

    // 2. 套用各棟建築與營地的專屬平坦台地
    for (const pad of flatPads) {
      const d = Math.hypot(x - pad.cx, z - pad.cz);
      if (d <= pad.rFlat) {
        return pad.targetY;
      } else if (d < pad.rBlend) {
        const t = (d - pad.rFlat) / (pad.rBlend - pad.rFlat);
        const smooth = t * t * (3 - 2 * t);
        rawH = THREE.MathUtils.lerp(pad.targetY, rawH, smooth);
      }
    }

    // 3. 道路平滑壓平
    if (roadDistX === 0 && Math.abs(x) < 42) {
      rawH = THREE.MathUtils.lerp(0.0, rawH, 0.25);
    }
    if (roadDistZ === 0 && Math.abs(z) < 30) {
      rawH = THREE.MathUtils.lerp(0.0, rawH, 0.25);
    }

    return rawH;
  }

  /**
   * 繪製 2048x2048 高解析度中世紀村莊地表紋理 (草地、石板廣場、蜿蜒土路、犁田土壤、木屋石砌庭院)
   */
  private createVillageGroundTexture(): THREE.CanvasTexture {
    const size = 2048;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 世界座標 (x in [-120, 120], z in [-100, 100]) 轉換為 Canvas 像素座標
    const toPxX = (wx: number) => ((wx + 120) / 240) * size;
    const toPxY = (wz: number) => ((wz + 100) / 200) * size;
    const toPxR = (wr: number) => (wr / 240) * size;

    // 1. 底層：柔和自然的翠綠牧草地漸層
    const baseGrad = ctx.createRadialGradient(size * 0.45, size * 0.5, size * 0.05, size * 0.5, size * 0.5, size * 0.7);
    baseGrad.addColorStop(0, '#558738');
    baseGrad.addColorStop(0.55, '#48752e');
    baseGrad.addColorStop(1, '#365922');
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, size, size);

    // 2. 東側黑森林幽暗松針苔蘚區 (x > 26)
    const forestGrad = ctx.createLinearGradient(toPxX(22), 0, toPxX(85), 0);
    forestGrad.addColorStop(0, 'rgba(34, 56, 24, 0)');
    forestGrad.addColorStop(0.35, 'rgba(34, 56, 24, 0.72)');
    forestGrad.addColorStop(1, 'rgba(22, 38, 16, 0.92)');
    ctx.fillStyle = forestGrad;
    ctx.fillRect(toPxX(22), 0, size - toPxX(22), size);

    // 3. 北側預言家高地岩灰草坡 (z < -30)
    const northGrad = ctx.createLinearGradient(0, toPxY(-26), 0, toPxY(-65));
    northGrad.addColorStop(0, 'rgba(76, 94, 74, 0)');
    northGrad.addColorStop(0.5, 'rgba(76, 94, 74, 0.55)');
    northGrad.addColorStop(1, 'rgba(62, 74, 64, 0.85)');
    ctx.fillStyle = northGrad;
    ctx.fillRect(0, 0, size, toPxY(-26));

    // 4. 繪製全圖柔和草叢色斑與微細節 (取代原本鋸齒狀頂點色塊)
    for (let i = 0; i < 4500; i++) {
      const rx = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const ry = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const px = Math.abs(rx) * size;
      const py = Math.abs(ry) * size;
      const radius = 6 + (i % 18);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(102, 152, 64, 0.12)' : 'rgba(42, 72, 26, 0.12)';
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. 西側金黃農莊肥沃犁田耕地 (x in [-64, -41], z in [-22, 22])
    const farmLeft = toPxX(-63.5);
    const farmTop = toPxY(-22.5);
    const farmW = toPxX(-41.0) - farmLeft;
    const farmH = toPxY(22.5) - farmTop;

    // 耕地外圍柔和泥土暈染
    ctx.save();
    ctx.fillStyle = '#7c5a37';
    ctx.beginPath();
    ctx.roundRect(farmLeft - 14, farmTop - 14, farmW + 28, farmH + 28, 28);
    ctx.fill();

    // 耕地深色肥沃土壤底色
    ctx.fillStyle = '#634427';
    ctx.beginPath();
    ctx.roundRect(farmLeft, farmTop, farmW, farmH, 18);
    ctx.fill();

    // 耕地整齊犁溝條紋
    ctx.strokeStyle = '#4e341c';
    ctx.lineWidth = 5;
    for (let fy = farmTop + 12; fy < farmTop + farmH - 10; fy += 14) {
      ctx.beginPath();
      ctx.moveTo(farmLeft + 10, fy);
      ctx.lineTo(farmLeft + farmW - 10, fy);
      ctx.stroke();
    }
    ctx.restore();

    // 6. 繪製平滑蜿蜒的村莊泥土與碎石步道網路
    const drawRoad = (x1: number, z1: number, x2: number, z2: number, widthMeters: number) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // 外層草土過渡邊緣
      ctx.strokeStyle = 'rgba(122, 95, 62, 0.55)';
      ctx.lineWidth = toPxR(widthMeters + 3.2);
      ctx.beginPath();
      ctx.moveTo(toPxX(x1), toPxY(z1));
      ctx.lineTo(toPxX(x2), toPxY(z2));
      ctx.stroke();

      // 中層夯實黃土路
      ctx.strokeStyle = '#9e7f56';
      ctx.lineWidth = toPxR(widthMeters);
      ctx.beginPath();
      ctx.moveTo(toPxX(x1), toPxY(z1));
      ctx.lineTo(toPxX(x2), toPxY(z2));
      ctx.stroke();

      // 內層淺色車轍石板路芯
      ctx.strokeStyle = '#b3956b';
      ctx.lineWidth = toPxR(widthMeters * 0.55);
      ctx.beginPath();
      ctx.moveTo(toPxX(x1), toPxY(z1));
      ctx.lineTo(toPxX(x2), toPxY(z2));
      ctx.stroke();
      ctx.restore();
    };

    // 主幹道與通往 6 間木屋、穀倉、肉架的分支步道
    drawRoad(-68, -2, 52, 5, 5.2);        // 東西向橫貫主幹道 (大穀倉 <-> 中央廣場 <-> 東側狼人肉架)
    drawRoad(0, -39.6, 0, 39.6, 5.0);     // 南北向縱貫主幹道 (預言家2號屋 <-> 中央廣場 <-> 獵人5號屋)
    drawRoad(-42, -2, -47.3, -39.6, 4.2); // 通往 1號木屋 (西北)
    drawRoad(0, -39.6, -21, -48, 3.6);    // 通往北側觀星瞭望塔
    drawRoad(18, 2, 47.3, -39.6, 4.2);    // 通往 3號木屋 (東北)
    drawRoad(-42, 2, -47.3, 39.6, 4.2);   // 通往 4號木屋 (西南)
    drawRoad(18, 2, 47.3, 39.6, 4.2);     // 通往 6號木屋 (東南)

    // 7. 繪製各棟建築底下的石砌/夯土庭院圓盤 (Courtyard Pads)
    const drawCourtyard = (wx: number, wz: number, radiusMeters: number, innerHex: string = '#8c7a65') => {
      const cx = toPxX(wx);
      const cy = toPxY(wz);
      const r = toPxR(radiusMeters);
      const grad = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
      grad.addColorStop(0, innerHex);
      grad.addColorStop(0.75, '#9c8362');
      grad.addColorStop(1, 'rgba(122, 95, 62, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    };

    drawCourtyard(-47.3, -39.6, 11.5);
    drawCourtyard(0.0, -39.6, 11.5);
    drawCourtyard(-21, -48, 6.5);
    drawCourtyard(47.3, -39.6, 11.5);
    drawCourtyard(-47.3, 39.6, 11.5);
    drawCourtyard(0.0, 39.6, 11.5);
    drawCourtyard(47.3, 39.6, 11.5);
    drawCourtyard(-68, -2, 12.0);
    drawCourtyard(52, 5, 9.5, '#6e553e');

    // 8. 中央營火石板大廣場 (同心圓中世紀石磚紋理)
    const plazaX = toPxX(0);
    const plazaY = toPxY(0);
    const plazaR = toPxR(15.5);

    const plazaGrad = ctx.createRadialGradient(plazaX, plazaY, plazaR * 0.1, plazaX, plazaY, plazaR);
    plazaGrad.addColorStop(0, '#786b5e');
    plazaGrad.addColorStop(0.55, '#8f7b65');
    plazaGrad.addColorStop(0.85, '#9e825a');
    plazaGrad.addColorStop(1, 'rgba(158, 130, 90, 0)');
    ctx.fillStyle = plazaGrad;
    ctx.beginPath();
    ctx.arc(plazaX, plazaY, plazaR, 0, Math.PI * 2);
    ctx.fill();

    // 廣場同心石環裝飾線
    ctx.strokeStyle = 'rgba(71, 60, 50, 0.45)';
    ctx.lineWidth = 4;
    for (const ringR of [4.2, 7.8, 11.5]) {
      ctx.beginPath();
      ctx.arc(plazaX, plazaY, toPxR(ringR), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 9. 沿道路與廣場撒上細緻鵝卵石顆粒
    for (let p = 0; p < 900; p++) {
      const angle = (p * 1.6180339) * Math.PI * 2;
      const dist = Math.sqrt(p / 900) * 13.5;
      const sx = toPxX(Math.cos(angle) * dist);
      const sy = toPxY(Math.sin(angle) * dist);
      ctx.fillStyle = p % 3 === 0 ? 'rgba(214, 204, 190, 0.35)' : 'rgba(87, 76, 65, 0.32)';
      ctx.beginPath();
      ctx.arc(sx, sy, 2 + (p % 3), 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * 建立具備平坦建築台地與高解析度地表貼圖的 3D 村莊地形
   */
  private createUndulatingTerrain(): void {
    const geo = new THREE.PlaneGeometry(240, 200, 180, 150);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vz = pos.getZ(i);
      pos.setY(i, this.getTerrainHeight(vx, vz));
    }

    geo.computeVertexNormals();

    const groundTexture = this.createVillageGroundTexture();
    const mat = new THREE.MeshStandardMaterial({
      map: groundTexture,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: false
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
   * 批次加載重新烘焙材質並消除 LOD 重疊破圖的 .glb 模型
   */
  private async loadAllGLBModels(): Promise<void> {
    const modelPaths: Record<string, string> = {
      // 4 種不同風格的村民木屋與職業專屬建築
      house1: '/assets/models/house_01.glb',
      house2: '/assets/models/house_02.glb',
      house3: '/assets/models/house_03.glb',
      house4: '/assets/models/house_04.glb',
      barn: '/assets/models/barn.glb',
      watchtower: '/assets/models/watchtower.glb',
      // 村莊設施與農具
      bonfire: '/assets/models/bonfire.glb',
      wheat: '/assets/models/wheat_crop.glb',
      bench: '/assets/models/bench.glb',
      crate: '/assets/models/crate.glb',
      barrel: '/assets/models/barrel.glb',
      cart: '/assets/models/cart.glb',
      streetlight: '/assets/models/streetlight.glb',
      table: '/assets/models/table.glb',
      chair: '/assets/models/chair.glb',
      // 樹木森林 (已移除 LOD1 重疊破圖並內嵌完整貼圖)
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
      // 花卉香草與 3D 草叢
      flowers1: '/assets/models/nature/flowers_01.glb',
      flowers2: '/assets/models/nature/flowers_02.glb',
      grass1: '/assets/models/nature/grass_01.glb',
      grass2: '/assets/models/nature/grass_02.glb',
      // 神秘蘑菇
      mushroom1: '/assets/models/nature/mushroom_01.glb',
      mushroom2: '/assets/models/nature/mushroom_02.glb',
      // 砍伐樹樁與枯木
      stump1: '/assets/models/nature/stump_01.glb',
      branch1: '/assets/models/nature/branch_01.glb',
      // 6 大中世紀 3D 村民角色模型 (已轉換為自然站姿並內嵌 people_texture_map.png)
      char_villager: '/assets/models/characters/peasant_1.glb',
      char_doctor: '/assets/models/characters/city_dwellers_1.glb',
      char_hunter: '/assets/models/characters/peasant_3.glb',
      char_seer: '/assets/models/characters/queen.glb',
      char_trickster: '/assets/models/characters/rich_citizens_1.glb',
      char_werewolf_human: '/assets/models/characters/king.glb'
    };

    const loadPromises = Object.entries(modelPaths).map(([key, url]) => {
      return new Promise<void>((resolve) => {
        this.gltfLoader.load(
          url,
          (gltf: GLTF) => {
            const root = gltf.scene;
            root.traverse((node) => {
              if ((node as THREE.Mesh).isMesh) {
                const mesh = node as THREE.Mesh;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                // 確保雙面渲染與法線平滑，防止單面破圖
                if (Array.isArray(mesh.material)) {
                  mesh.material.forEach((m) => {
                    m.side = THREE.DoubleSide;
                  });
                } else if (mesh.material) {
                  mesh.material.side = THREE.DoubleSide;
                }
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
    // 清除載入前暫存的幾何角色，讓下一幀立即換上真實 3D 角色模型與骨骼動畫
    for (const group of this.playerMeshes.values()) {
      this.scene.remove(group);
    }
    this.playerMeshes.clear();
    this.motionSystem.clearAll();

    this.populateVillageDecorations();
    console.log('✅ 所有 3D Low-Poly 村莊與 6 大中世紀角色模型 (含 41 骨骼動作系統) 加載完成！');
  }

  /**
   * 依據村莊藍圖將 3D 模型以正確真實比例擺放到起伏地形上
   */
  private populateVillageDecorations(): void {
    // 1. 中央會議大營火 (真實比例放大至 2.6 倍，火焰與木材層次分明) 與 6 張圍坐長椅
    const fireY = this.getTerrainHeight(0, 0);
    this.spawnModel('bonfire', 0, fireY, 0, 2.6);

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const dist = 6.2;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      const by = this.getTerrainHeight(bx, bz);
      this.spawnModel('bench', bx, by, bz, 2.2, -angle + Math.PI / 2);
    }

    // 廣場四周立起 4 座中古世紀鐵藝街燈
    const lampCoords = [
      { x: -10, z: -10, rot: Math.PI / 4 },
      { x: 10, z: -10, rot: -Math.PI / 4 },
      { x: -10, z: 10, rot: (Math.PI * 3) / 4 },
      { x: 10, z: 10, rot: -(Math.PI * 3) / 4 }
    ];
    for (const lc of lampCoords) {
      this.spawnModel('streetlight', lc.x, this.getTerrainHeight(lc.x, lc.z), lc.z, 2.4, lc.rot);
    }

    // 2. 6 間可走入式村民專屬木屋 (含完整 3D 室內裝潢、可動木門、自動掀頂透視，且與 map-data.ts 碰撞箱 100% 對齊！)
    const cottageSpecs = [
      { id: 'cottage-1', x: -47.3, z: -39.6, isNorth: true, roofHex: '#b45309', rugHex: '#991b1b', theme: 'FARMER' },
      { id: 'cottage-2', x: 0.0, z: -39.6, isNorth: true, roofHex: '#1e3a8a', rugHex: '#1d4ed8', theme: 'ALCHEMIST' },
      { id: 'cottage-3', x: 47.3, z: -39.6, isNorth: true, roofHex: '#a16207', rugHex: '#854d0e', theme: 'HUNTER' },
      { id: 'cottage-4', x: -47.3, z: 39.6, isNorth: false, roofHex: '#581c87', rugHex: '#6b21a8', theme: 'SEER' },
      { id: 'cottage-5', x: 0.0, z: 39.6, isNorth: false, roofHex: '#166534', rugHex: '#15803d', theme: 'TRICKSTER' },
      { id: 'cottage-6', x: 47.3, z: 39.6, isNorth: false, roofHex: '#7f1d1d', rugHex: '#991b1b', theme: 'LORD' }
    ];

    for (const c of cottageSpecs) {
      const cy = this.getTerrainHeight(c.x, c.z);
      this.spawnStoneFoundation(c.x, cy, c.z, 15.4, 13.2, 0);
      this.buildWalkInCottage(c.id, c.x, cy + 0.16, c.z, c.isNorth, c.roofHex, c.rugHex, c.theme);
    }

    // 3. 北側占星高地 (預言家聖域)：高聳觀星木塔、巨石陣與發光蘑菇群
    const towerY = this.getTerrainHeight(-18, -46);
    this.spawnStoneFoundation(-18, towerY, -46, 4.2, 4.2, 0.3);
    this.spawnModel('watchtower', -18, towerY + 0.16, -46, 0.95, 0.3);

    const stoneRingRadius = 10.5;
    const stoneKeys = ['rock1', 'rock4', 'rock5'];
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      const rx = 0.0 + Math.cos(angle) * stoneRingRadius;
      const rz = -39.6 + Math.sin(angle) * (stoneRingRadius * 0.85);
      const ry = this.getTerrainHeight(rx, rz);
      const key = stoneKeys[i % stoneKeys.length];
      this.spawnModel(key, rx, ry, rz, 1.8 + (i % 2) * 0.4, angle);
    }
    for (let m = 0; m < 6; m++) {
      const mx = 0.0 + (m - 2.5) * 2.5;
      const mz = -51 + Math.sin(m) * 1.8;
      const my = this.getTerrainHeight(mx, mz);
      this.spawnModel(m % 2 === 0 ? 'mushroom1' : 'mushroom2', mx, my, mz, 2.8, Math.random() * Math.PI);
    }

    // 4. 西側金黃農莊大穀倉 (Barn)、運麥木車 (Cart) 與茂密小麥田
    const barnY = this.getTerrainHeight(-68, -2);
    this.spawnStoneFoundation(-68, barnY, -2, 12.6, 14.0, Math.PI / 2);
    this.spawnModel('barn', -68, barnY + 0.16, -2, 0.78, Math.PI / 2);
    this.spawnModel('cart', -42, this.getTerrainHeight(-42, -9), -9, 2.2, 0.4);
    this.spawnModel('cart', -42, this.getTerrainHeight(-42, 11), 11, 2.2, -0.3);

    for (let row = -20; row <= 20; row += 3.8) {
      for (let col = -60; col <= -44; col += 3.8) {
        const wx = col + Math.sin(row * 0.7) * 0.6;
        const wz = row + Math.cos(col * 0.7) * 0.6;
        const wy = this.getTerrainHeight(wx, wz);
        this.spawnModel('wheat', wx, wy, wz, 2.3, (row + col) * 0.5);
      }
    }
    // 農莊收穫木箱與橡木桶堆
    this.spawnModel('crate', -40, this.getTerrainHeight(-40, -4), -4, 1.6);
    this.spawnModel('crate', -38.2, this.getTerrainHeight(-38.2, -5.5), -5.5, 1.5, 0.4);
    this.spawnModel('barrel', -41, this.getTerrainHeight(-41, 5), 5, 1.8);
    this.spawnModel('barrel', -39.5, this.getTerrainHeight(-39.5, 6.8), 6.8, 1.7);

    // 5. 東側深邃黑森林與狼人秘密肉品燻房
    const forestTreeKeys = ['tree1', 'tree2', 'tree3', 'tree4', 'tree5'];
    for (let fx = 30; fx <= 76; fx += 9) {
      for (let fz = -44; fz <= 44; fz += 9.5) {
        const distToLair = Math.sqrt((fx - 52) ** 2 + (fz - 5) ** 2);
        const distToHouse3 = Math.sqrt((fx - 47.3) ** 2 + (fz - (-39.6)) ** 2);
        const distToHouse6 = Math.sqrt((fx - 47.3) ** 2 + (fz - 39.6) ** 2);

        if (distToLair > 9 && distToHouse3 > 14 && distToHouse6 > 14) {
          const ox = fx + Math.sin(fz * 1.3) * 2.5;
          const oz = fz + Math.cos(fx * 1.3) * 2.5;
          const oy = this.getTerrainHeight(ox, oz);
          const key = forestTreeKeys[Math.abs(Math.floor(fx + fz)) % forestTreeKeys.length];
          this.spawnModel(key, ox, oy, oz, 1.85 + (Math.abs(fx) % 3) * 0.25, (fx * fz) % Math.PI);

          if ((fx + fz) % 3 === 0) {
            this.spawnModel('rock4', ox + 2.8, this.getTerrainHeight(ox + 2.8, oz - 1.8), oz - 1.8, 1.5);
          }
          if ((fx + fz) % 2 === 0) {
            this.spawnModel('bush1', ox - 2.2, this.getTerrainHeight(ox - 2.2, oz + 2.0), oz + 2.0, 2.0);
          }
        }
      }
    }

    // 狼人肉品燻架空地裝飾 (大型剁肉樹樁、枯木、儲肉木桶與毒蕈)
    this.spawnModel('stump1', 52, this.getTerrainHeight(52, 3), 3, 2.4);
    this.spawnModel('stump1', 55, this.getTerrainHeight(55, 8), 8, 2.1);
    this.spawnModel('branch1', 54, this.getTerrainHeight(54, 5.5), 5.5, 2.5, 0.8);
    this.spawnModel('crate', 48, this.getTerrainHeight(48, 2), 2, 1.7);
    this.spawnModel('barrel', 49, this.getTerrainHeight(49, 6), 6, 1.9);
    this.spawnModel('barrel', 50.8, this.getTerrainHeight(50.8, 7.2), 7.2, 1.8);
    this.spawnModel('mushroom2', 53.5, this.getTerrainHeight(53.5, 1.2), 1.2, 3.0);

    // 6. 南側獵人營地 (伐木樁、枯枝與木箱)
    this.spawnModel('stump1', -18, this.getTerrainHeight(-18, 36), 36, 2.0);
    this.spawnModel('branch1', -21, this.getTerrainHeight(-21, 34), 34, 2.2, 1.1);
    this.spawnModel('crate', 4, this.getTerrainHeight(4, 36), 36, 1.6);

    // 7. 村莊十字步道兩側花卉、灌木叢與 3D 青草簇
    for (let pz = -28; pz <= 26; pz += 7) {
      if (Math.abs(pz) > 9) {
        this.spawnModel('flowers1', -15, this.getTerrainHeight(-15, pz), pz, 2.8, pz);
        this.spawnModel('flowers2', 15, this.getTerrainHeight(15, pz), pz, 2.8, -pz);
        this.spawnModel('bush2', -18, this.getTerrainHeight(-18, pz + 2), pz + 2, 2.1);
        this.spawnModel('bush3', 18, this.getTerrainHeight(18, pz + 2), pz + 2, 2.1);
        this.spawnModel('grass1', -12.5, this.getTerrainHeight(-12.5, pz - 1.5), pz - 1.5, 2.5, pz);
        this.spawnModel('grass2', 12.5, this.getTerrainHeight(12.5, pz - 1.5), pz - 1.5, 2.5, -pz);
      }
    }

    // 8. 外圍全圖邊界護城高聳森林 (環繞全村山脊)
    for (let bx = -84; bx <= 84; bx += 11) {
      const tKey1 = forestTreeKeys[Math.abs(bx) % forestTreeKeys.length];
      const tKey2 = forestTreeKeys[(Math.abs(bx) + 2) % forestTreeKeys.length];
      this.spawnModel(tKey1, bx, this.getTerrainHeight(bx, -64), -64, 2.3, bx * 0.3);
      this.spawnModel(tKey2, bx, this.getTerrainHeight(bx, 60), 60, 2.3, bx * 0.5);
    }
  }

  /**
   * 在建築正下方建立穩固的中世紀石砌地基台階，確保建築與地面完美銜接不穿模
   */
  private spawnStoneFoundation(x: number, y: number, z: number, width: number, depth: number, rotationY: number = 0): void {
    const group = new THREE.Group();

    // 下層寬石基
    const outerGeo = new THREE.BoxGeometry(width + 0.8, 0.24, depth + 0.8);
    const outerMat = new THREE.MeshStandardMaterial({
      color: '#64748b',
      roughness: 0.9,
      metalness: 0.05
    });
    const outerMesh = new THREE.Mesh(outerGeo, outerMat);
    outerMesh.position.y = 0.04;
    outerMesh.receiveShadow = true;
    outerMesh.castShadow = true;
    group.add(outerMesh);

    // 上層暖灰石板台面
    const innerGeo = new THREE.BoxGeometry(width, 0.14, depth);
    const innerMat = new THREE.MeshStandardMaterial({
      color: '#94a3b8',
      roughness: 0.85,
      metalness: 0.05
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.position.y = 0.12;
    innerMesh.receiveShadow = true;
    innerMesh.castShadow = true;
    group.add(innerMesh);

    group.position.set(x, y, z);
    group.rotation.y = rotationY;
    this.scene.add(group);
  }

  /**
   * 建造可實際走入的中世紀 3D 實體木屋：
   * - 四面厚實牆體與大門開口完全對齊 map-data.ts 的碰撞箱 (15.4m x 13.2m)
   * - 內建溫潤橡木地板、可開關鎖栓的 3D 實木大門、壁爐暖光、木床、編織地毯、餐桌椅與 6 大職業專屬擺設
   * - 屋頂獨立成組 (roofGroup)：第三人稱進屋自動掀開屋頂俯視內裝；第一人稱進屋保留屋頂與樑柱！
   */
  private buildWalkInCottage(
    id: string,
    cx: number,
    baseY: number,
    cz: number,
    isNorthRow: boolean,
    roofHex: string,
    rugHex: string,
    theme: string
  ): void {
    const group = new THREE.Group();
    group.position.set(cx, baseY, cz);

    const W = 15.4;          // 對應 2D 寬 140 * 0.11
    const D = 13.2;          // 對應 2D 深 120 * 0.11
    const wallT = 1.1;       // 對應 2D 牆厚 10 * 0.11
    const wallH = 4.2;       // 牆壁高度
    const sideDoorW = 4.62;  // 對應 2D 門側牆 42 * 0.11 (中間留出 6.16m 寬敞門口)
    const dirZ = isNorthRow ? 1 : -1; // 北排大門朝 +Z (南)，南排大門朝 -Z (北)

    const wallMat = new THREE.MeshStandardMaterial({ color: '#f3e5ab', roughness: 0.88 });
    const frontWallMat = new THREE.MeshStandardMaterial({ color: '#f3e5ab', roughness: 0.88 });
    const timberMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.85 });
    const frontTimberMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.85 });
    const floorMat = new THREE.MeshStandardMaterial({ color: '#78350f', roughness: 0.82 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#57534e', roughness: 0.92 });
    const roofMat = new THREE.MeshStandardMaterial({ color: roofHex, roughness: 0.8, side: THREE.DoubleSide });

    // 1. 室內溫潤橡木地板與中央編織地毯
    const floorMesh = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.14, D - 0.4), floorMat);
    floorMesh.position.y = 0.07;
    floorMesh.receiveShadow = true;
    group.add(floorMesh);

    const rugBorder = new THREE.Mesh(
      new THREE.BoxGeometry(6.8, 0.04, 5.2),
      new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.9 })
    );
    rugBorder.position.set(0, 0.15, dirZ * 0.4);
    rugBorder.receiveShadow = true;
    group.add(rugBorder);

    const rugInner = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.05, 4.6),
      new THREE.MeshStandardMaterial({ color: rugHex, roughness: 0.92 })
    );
    rugInner.position.set(0, 0.16, dirZ * 0.4);
    rugInner.receiveShadow = true;
    group.add(rugInner);

    // 2. 後牆、左右側牆與木骨橫樑 (完全貼合 map-data.ts 外牆碰撞箱)
    const backWallZ = -dirZ * (D / 2 - wallT / 2);
    const frontWallZ = dirZ * (D / 2 - wallT / 2);
    const leftWallX = -(W / 2 - wallT / 2);
    const rightWallX = W / 2 - wallT / 2;

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(W, wallH, wallT), wallMat);
    backWall.position.set(0, wallH / 2, backWallZ);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);

    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, D), wallMat);
    leftWall.position.set(leftWallX, wallH / 2, 0);
    leftWall.castShadow = true;
    leftWall.receiveShadow = true;
    group.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(wallT, wallH, D), wallMat);
    rightWall.position.set(rightWallX, wallH / 2, 0);
    rightWall.castShadow = true;
    rightWall.receiveShadow = true;
    group.add(rightWall);

    // 四角深胡桃木立柱與橫樑
    for (const px of [-W / 2 + 0.35, W / 2 - 0.35]) {
      for (const pz of [-D / 2 + 0.35, D / 2 - 0.35]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.75, wallH + 0.2, 0.75), timberMat);
        post.position.set(px, wallH / 2, pz);
        post.castShadow = true;
        group.add(post);
      }
    }

    // 東西兩側暖光窗戶
    const winMat = new THREE.MeshStandardMaterial({
      color: '#fef08a',
      emissive: '#f59e0b',
      emissiveIntensity: 0.9,
      roughness: 0.2
    });
    for (const wx of [leftWallX, rightWallX]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(wallT + 0.14, 1.4, 2.2), winMat);
      win.position.set(wx, 2.3, 0);
      group.add(win);
    }

    // 3. 前牆組與可開關 3D 實木大門 (frontWallGroup)
    const frontWallGroup = new THREE.Group();
    const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(sideDoorW, wallH, wallT), frontWallMat);
    frontLeft.position.set(-(W / 2 - sideDoorW / 2), wallH / 2, frontWallZ);
    frontLeft.castShadow = true;
    frontLeft.receiveShadow = true;
    frontWallGroup.add(frontLeft);

    const frontRight = new THREE.Mesh(new THREE.BoxGeometry(sideDoorW, wallH, wallT), frontWallMat);
    frontRight.position.set(W / 2 - sideDoorW / 2, wallH / 2, frontWallZ);
    frontRight.castShadow = true;
    frontRight.receiveShadow = true;
    frontWallGroup.add(frontRight);

    // 門楣橫樑
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.75, wallT + 0.12), frontTimberMat);
    lintel.position.set(0, wallH - 0.35, frontWallZ);
    lintel.castShadow = true;
    frontWallGroup.add(lintel);

    // 門框立柱
    const doorHalfGap = (W - sideDoorW * 2) / 2; // 3.08m
    for (const dx of [-doorHalfGap, doorHalfGap]) {
      const framePost = new THREE.Mesh(new THREE.BoxGeometry(0.45, wallH, wallT + 0.16), frontTimberMat);
      framePost.position.set(dx, wallH / 2, frontWallZ);
      frontWallGroup.add(framePost);
    }

    // 可旋轉 3D 橡木門扇 (軸心設於左側門框)
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-doorHalfGap + 0.2, 0.15, frontWallZ);

    const doorWidth = doorHalfGap * 2 - 0.4;
    const doorHeight = wallH - 0.85;
    const doorPanel = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth, doorHeight, 0.28),
      new THREE.MeshStandardMaterial({ color: '#7c2d12', roughness: 0.8 })
    );
    doorPanel.position.set(doorWidth / 2, doorHeight / 2, 0);
    doorPanel.castShadow = true;
    doorPivot.add(doorPanel);

    // 門鎖橫栓 (反鎖時顯現發光紅鐵橫槓)
    const lockBar = new THREE.Mesh(
      new THREE.BoxGeometry(doorWidth + 0.6, 0.26, 0.42),
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: '#dc2626',
        emissiveIntensity: 1.4,
        metalness: 0.7,
        roughness: 0.3
      })
    );
    lockBar.position.set(doorWidth / 2, doorHeight * 0.52, 0);
    lockBar.visible = false;
    doorPivot.add(lockBar);

    frontWallGroup.add(doorPivot);
    group.add(frontWallGroup);

    // 4. 室內三大核心家具區 (100% 對應 map-data.ts 的室內家具碰撞箱座標！)
    const backFurnZ = -dirZ * 4.1;

    // (A) 左後角：中世紀實木床鋪與枕頭毛毯 (對應 x + 12..46 => 本地 X = -4.5m)
    const bedGroup = new THREE.Group();
    bedGroup.position.set(-4.5, 0.15, backFurnZ);
    const bedFrame = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.55, 2.6),
      new THREE.MeshStandardMaterial({ color: '#5c3a21', roughness: 0.85 })
    );
    bedFrame.position.y = 0.28;
    bedFrame.castShadow = true;
    bedGroup.add(bedFrame);

    const headboard = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.45, 0.32),
      new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.85 })
    );
    headboard.position.set(0, 0.72, -dirZ * 1.15);
    bedGroup.add(headboard);

    const blanket = new THREE.Mesh(
      new THREE.BoxGeometry(3.15, 0.25, 1.85),
      new THREE.MeshStandardMaterial({ color: rugHex, roughness: 0.9 })
    );
    blanket.position.set(0, 0.62, dirZ * 0.25);
    bedGroup.add(blanket);

    const pillow = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.22, 0.62),
      new THREE.MeshStandardMaterial({ color: '#fef9c3', roughness: 0.85 })
    );
    pillow.position.set(0, 0.66, -dirZ * 0.78);
    bedGroup.add(pillow);
    group.add(bedGroup);

    // (B) 後牆中央：石砌壁爐、餘燼火光與室內暖光源 (對應 x + 56..84 => 本地 X = 0.0m)
    const hearthGroup = new THREE.Group();
    hearthGroup.position.set(0, 0.15, -dirZ * 4.85);
    const hearthBody = new THREE.Mesh(new THREE.BoxGeometry(3.0, 3.6, 1.7), stoneMat);
    hearthBody.position.y = 1.8;
    hearthBody.castShadow = true;
    hearthGroup.add(hearthBody);

    const fireCore = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.9, 0.5),
      new THREE.MeshStandardMaterial({
        color: '#f97316',
        emissive: '#ea580c',
        emissiveIntensity: 2.2
      })
    );
    fireCore.position.set(0, 0.65, dirZ * 0.7);
    hearthGroup.add(fireCore);

    const indoorLight = new THREE.PointLight('#ff9e44', 1.65, 16, 1.4);
    indoorLight.position.set(0, 2.6, dirZ * 1.5);
    hearthGroup.add(indoorLight);
    group.add(hearthGroup);

    // (C) 右後角：實木餐桌、座椅與職業專屬擺設 (對應 x + 94..128 => 本地 X = +4.5m)
    const tableGroup = new THREE.Group();
    tableGroup.position.set(4.5, 0.15, backFurnZ);

    const tableProto = this.modelPrototypes.get('table');
    if (tableProto) {
      const tbl = tableProto.clone(true);
      tbl.scale.set(2.1, 1.7, 2.1);
      tbl.position.set(-0.3, 0, 0);
      tableGroup.add(tbl);
    } else {
      const fallbackTbl = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 1.5), timberMat);
      fallbackTbl.position.y = 0.48;
      tableGroup.add(fallbackTbl);
    }

    const chairProto = this.modelPrototypes.get('chair');
    if (chairProto) {
      const ch = chairProto.clone(true);
      ch.scale.set(1.6, 1.6, 1.6);
      ch.position.set(-0.3, 0, dirZ * 1.15);
      ch.rotation.y = isNorthRow ? Math.PI : 0;
      tableGroup.add(ch);
    }

    // 根據屋主職業主題擺放專屬道具 (煉金藥瓶/占卜水晶球/農夫木桶/獵人木箱)
    const barrelProto = this.modelPrototypes.get('barrel');
    const crateProto = this.modelPrototypes.get('crate');
    if (barrelProto) {
      const b = barrelProto.clone(true);
      b.scale.set(1.4, 1.4, 1.4);
      b.position.set(1.35, 0, -dirZ * 0.4);
      tableGroup.add(b);
    }
    if (crateProto) {
      const cr = crateProto.clone(true);
      cr.scale.set(1.2, 1.2, 1.2);
      cr.position.set(1.35, 0, dirZ * 0.65);
      tableGroup.add(cr);
    }

    if (theme === 'ALCHEMIST' || theme === 'SEER') {
      // 桌面上發光的煉金藥劑瓶與占卜水晶球
      const orbColor = theme === 'SEER' ? '#c084fc' : '#34d399';
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 12),
        new THREE.MeshStandardMaterial({
          color: orbColor,
          emissive: orbColor,
          emissiveIntensity: 1.8,
          roughness: 0.15
        })
      );
      orb.position.set(-0.3, 1.32, 0);
      tableGroup.add(orb);
    }
    group.add(tableGroup);

    // 5. 可掀式斜頂屋頂與煙囪組 (roofGroup：第三人稱進屋自動隱藏以俯瞰室內，第一人稱進屋保持顯示！)
    const roofGroup = new THREE.Group();
    roofGroup.position.y = wallH;

    const roofPitchH = 3.6;
    const slopeLen = Math.hypot(D / 2 + 1.1, roofPitchH);
    const slopeAngle = Math.atan2(roofPitchH, D / 2 + 1.1);

    const roofHalfFront = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.28, slopeLen), roofMat);
    roofHalfFront.position.set(0, roofPitchH / 2 - 0.1, (D / 4 + 0.45));
    roofHalfFront.rotation.x = slopeAngle;
    roofHalfFront.castShadow = true;
    roofGroup.add(roofHalfFront);

    const roofHalfBack = new THREE.Mesh(new THREE.BoxGeometry(W + 1.4, 0.28, slopeLen), roofMat);
    roofHalfBack.position.set(0, roofPitchH / 2 - 0.1, -(D / 4 + 0.45));
    roofHalfBack.rotation.x = -slopeAngle;
    roofHalfBack.castShadow = true;
    roofGroup.add(roofHalfBack);

    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.42, 0.45), timberMat);
    ridgeBeam.position.set(0, roofPitchH - 0.05, 0);
    roofGroup.add(ridgeBeam);

    // 石砌煙囪
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.8, 1.4), stoneMat);
    chimney.position.set(0, roofPitchH * 0.65, -dirZ * 4.5);
    chimney.castShadow = true;
    roofGroup.add(chimney);

    group.add(roofGroup);
    this.scene.add(group);

    this.cottageInstances.set(id, {
      group,
      roofGroup,
      frontWallGroup,
      doorPivot,
      lockBar,
      isNorthRow
    });
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

    // 5. 相機跟隨本地玩家：支援「第三人稱俯視微縮視角」與「第一人稱沉浸視角 (FPV)」無縫切換
    if (localPlayer) {
      const { x: targetX, z: targetZ } = this.to3DCoords(localPlayer.x, localPlayer.y);
      const groundY = this.getTerrainHeight(targetX, targetZ);

      if (this.isFirstPerson) {
        // 第一人稱視角 (FPV)：廣角 68 度、眼部高度 + 走動微幅呼吸晃動
        if (Math.abs(this.camera.fov - 68) > 0.5) {
          this.camera.fov = 68;
          this.camera.updateProjectionMatrix();
        }
        const localGroup = this.playerMeshes.get(localPlayerId);
        const camX = localGroup ? localGroup.position.x : targetX;
        const camZ = localGroup ? localGroup.position.z : targetZ;
        const camGroundY = this.getTerrainHeight(camX, camZ);
        const isMoving = Math.abs(camX - targetX) > 0.03 || Math.abs(camZ - targetZ) > 0.03;
        const headBob = isMoving ? Math.sin(this.animTime * 13) * 0.09 : Math.sin(this.animTime * 2.2) * 0.02;
        const eyeHeight = localPlayer.isTransformed ? 2.65 : 2.38;

        this.camera.position.set(camX, camGroundY + eyeHeight + headBob, camZ);

        // 依據 fpvYaw 與 fpvPitch 計算視線前方目標點
        const lookDist = 20;
        const cosPitch = Math.cos(this.fpvPitch);
        const lookX = camX + Math.cos(this.fpvYaw) * cosPitch * lookDist;
        const lookZ = camZ + Math.sin(this.fpvYaw) * cosPitch * lookDist;
        const lookY = (camGroundY + eyeHeight + headBob) + Math.sin(this.fpvPitch) * lookDist;
        this.camera.lookAt(lookX, lookY, lookZ);
      } else {
        // 第三人稱斜 45 度俯視視角
        if (Math.abs(this.camera.fov - 40) > 0.5) {
          this.camera.fov = 40;
          this.camera.updateProjectionMatrix();
        }
        const targetCamPos = new THREE.Vector3(targetX, groundY + 34, targetZ + 30);
        this.camera.position.lerp(targetCamPos, 0.08);
        this.camera.lookAt(targetX, groundY + 1.2, targetZ);
      }

      // 夜晚點亮隨身提燈 (緊隨玩家身側)
      this.playerLantern.position.set(targetX, groundY + 2.2, targetZ);
      this.playerLantern.intensity = snapshot.phase === GamePhase.NIGHT ? (this.isFirstPerson ? 2.4 : 1.8) : 0;

      // 動態更新 6 間木屋的：
      // 1. 3D 門扇開闔角度與發光紅鐵門栓 (上鎖時關門並亮起鐵栓，未鎖時敞開 78° 可直接走入)
      // 2. 屋頂透視 (第三人稱進屋自動掀開屋頂俯視完整內裝；第一人稱進屋保留屋頂感受真實室內空間)
      for (const [cid, inst] of this.cottageInstances.entries()) {
        const cottageData = _map.cottages.find((c) => c.id === cid);
        const isLocked = Boolean(cottageData?.isLocked);
        const isInsideThis = localPlayer.insideCottageId === cid;

        // 門扇平滑開闔動畫
        const openAngle = inst.isNorthRow ? -1.35 : 1.35;
        const targetDoorRot = isLocked ? 0 : openAngle;
        inst.doorPivot.rotation.y = THREE.MathUtils.lerp(
          inst.doorPivot.rotation.y,
          targetDoorRot,
          Math.min(1, deltaSec * 10)
        );
        inst.lockBar.visible = isLocked;

        // 第三人稱進屋自動掀開屋頂並半透明化前牆；第一人稱進屋則保留屋頂與實心牆面
        inst.roofGroup.visible = !(isInsideThis && !this.isFirstPerson);
        const frontOpacity = isInsideThis && !this.isFirstPerson ? 0.25 : 1.0;
        inst.frontWallGroup.traverse((node) => {
          if ((node as THREE.Mesh).isMesh && node !== inst.lockBar) {
            const mesh = node as THREE.Mesh;
            const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const m of mats) {
              if (m) {
                m.transparent = frontOpacity < 1.0;
                m.opacity = frontOpacity;
              }
            }
          }
        });
      }
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
        this.motionSystem.unregisterCharacter(id);
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

      // 第一人稱模式下隱藏本地玩家自身網格，避免頭部模型遮擋視線
      group.visible = !(isLocal && this.isFirstPerson);

      // 座標插值平滑移動
      const { x: tx, z: tz } = this.to3DCoords(p.x, p.y);
      const prevX = group.position.x;
      const prevZ = group.position.z;
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

      // 最短路徑平滑轉身 (解決原本角度突變或鎖定問題)
      const targetRotY = -p.rotation + Math.PI / 2;
      let diff = ((targetRotY - group.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (diff < -Math.PI) diff += Math.PI * 2;
      group.rotation.y += diff * Math.min(1, deltaSec * 14);

      // 判斷是否正在移動並更新 41 骨骼四肢邁步與呼吸系統
      const moveDelta = Math.hypot(group.position.x - prevX, group.position.z - prevZ);
      const isMoving = moveDelta > 0.008 || Math.hypot(group.position.x - tx, group.position.z - tz) > 0.04;
      this.motionSystem.updateCharacter(id, isMoving, p.isTransformed, deltaSec, this.animTime);

      if (isMoving) {
        group.position.y = groundY + Math.abs(Math.sin(this.animTime * 12)) * 0.08;
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
   * 建立單一角色的 3D 複合模型 (使用 SkeletonUtils.clone 複製 41 骨骼 Rigged 人物 + 巨狼變身形態 + 護盾)
   */
  private createPlayerCharacterGroup(p: PlayerState, isLocal: boolean): THREE.Group {
    const group = new THREE.Group();

    // 1. 人類形態：依據角色職業選取專屬中世紀 3D 骨骼人物模型
    const humanGroup = new THREE.Group();
    humanGroup.name = 'humanBody';

    const roleToCharKey: Record<RoleType, string> = {
      [RoleType.VILLAGER]: 'char_villager',
      [RoleType.DOCTOR]: 'char_doctor',
      [RoleType.HUNTER]: 'char_hunter',
      [RoleType.SEER]: 'char_seer',
      [RoleType.TRICKSTER]: 'char_trickster',
      [RoleType.WEREWOLF]: 'char_werewolf_human'
    };

    const charKey = roleToCharKey[p.role] || 'char_villager';
    const charProto = this.modelPrototypes.get(charKey) || this.modelPrototypes.get('char_villager');

    if (charProto) {
      const charClone = cloneSkeleton(charProto);
      charClone.scale.set(1.55, 1.55, 1.55);
      humanGroup.add(charClone);
      // 註冊至 41 骨骼動作控制器
      this.motionSystem.registerCharacter(p.id, humanGroup);
    } else {
      // GLB 尚未非同步載入完成前的幾毫秒過渡備援
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
    }

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
