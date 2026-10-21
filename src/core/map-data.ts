/**
 * @file map-data.ts
 * @description 狼人村莊地圖：6間可走入式獨立木屋 (含室內家具碰撞箱)、大穀倉、瞭望塔、中央火堆、小麥田與肉品燻房
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Cottage {
  id: string;
  name: string;
  ownerIndex: number;
  rect: Rect;            // 木屋本體室內外邊界矩形
  doorRect: Rect;        // 門口出入口感應與門扇碰撞區
  interiorColor: string;
  isLocked?: boolean;    // 是否上鎖防範狼人 (上鎖時門扇關閉並阻擋外部碰撞)
}

export interface WheatPatch {
  id: string;
  rect: Rect;
  maxWheat: number;
  currentWheat: number;
  replenishTimer: number;
}

export interface MeatRack {
  id: string;
  rect: Rect;
  meatAvailable: number;
}

export interface VillageMap {
  width: number;
  height: number;
  bonfire: { x: number; y: number; radius: number };
  cottages: Cottage[];
  wheatPatches: WheatPatch[];
  meatRacks: MeatRack[];
  walls: Rect[];         // 靜態碰撞障礙箱（含木屋四面牆壁、室內家具、穀倉、瞭望塔、火堆與外圍柵欄）
}

/**
 * 依據木屋左上角 (x, y) 與朝向 (isNorthRow: 大門朝南或朝北) 自動生成：
 * 1. 四面厚實牆壁碰撞箱 (留出中央 56px 寬敞大門通道)
 * 2. 室內三大核心家具碰撞箱 (木床、石砌壁爐、工作桌/儲物櫃)，保留中央寬敞走道
 */
function createCottageCollisionBoxes(x: number, y: number, isNorthRow: boolean): Rect[] {
  const w = 140;
  const h = 120;
  const wallThick = 10;
  const sideDoorWallW = 42; // (140 - 42*2) = 56px 寬敞門口通道

  if (isNorthRow) {
    // 北排木屋 (1~3號)：大門在南側 (y + h)
    return [
      // 外牆：北後牆、西側牆、東側牆、南前左牆、南前右牆
      { x, y, width: w, height: wallThick },
      { x, y, width: wallThick, height: h },
      { x: x + w - wallThick, y, width: wallThick, height: h },
      { x, y: y + h - wallThick, width: sideDoorWallW, height: wallThick },
      { x: x + w - sideDoorWallW, y: y + h - wallThick, width: sideDoorWallW, height: wallThick },
      // 室內家具碰撞箱：左上角木床、後牆中央壁爐、右上角工作桌與木桶
      { x: x + 12, y: y + 12, width: 34, height: 26 },
      { x: x + 56, y: y + 10, width: 28, height: 16 },
      { x: x + 94, y: y + 12, width: 34, height: 24 }
    ];
  } else {
    // 南排木屋 (4~6號)：大門在北側 (y)
    return [
      // 外牆：南後牆、西側牆、東側牆、北前左牆、北前右牆
      { x, y: y + h - wallThick, width: w, height: wallThick },
      { x, y, width: wallThick, height: h },
      { x: x + w - wallThick, y, width: wallThick, height: h },
      { x, y, width: sideDoorWallW, height: wallThick },
      { x: x + w - sideDoorWallW, y, width: sideDoorWallW, height: wallThick },
      // 室內家具碰撞箱：左下角木床、後牆中央壁爐、右下角工作桌與木桶
      { x: x + 12, y: y + h - 38, width: 34, height: 26 },
      { x: x + 56, y: y + h - 26, width: 28, height: 16 },
      { x: x + 94, y: y + h - 36, width: 34, height: 24 }
    ];
  }
}

export const VILLAGE_MAP: VillageMap = {
  width: 1400,
  height: 1000,
  bonfire: { x: 700, y: 500, radius: 45 },
  cottages: [
    // 北側 3 間小屋 (大門朝南)
    {
      id: 'cottage-1',
      name: '1號木屋 (亞歷山大農夫屋)',
      ownerIndex: 0,
      rect: { x: 200, y: 80, width: 140, height: 120 },
      doorRect: { x: 242, y: 188, width: 56, height: 24 },
      interiorColor: '#8b5a2b'
    },
    {
      id: 'cottage-2',
      name: '2號木屋 (艾蓮娜煉金屋)',
      ownerIndex: 1,
      rect: { x: 630, y: 80, width: 140, height: 120 },
      doorRect: { x: 672, y: 188, width: 56, height: 24 },
      interiorColor: '#1e3a8a'
    },
    {
      id: 'cottage-3',
      name: '3號木屋 (萊昂獵人屋)',
      ownerIndex: 2,
      rect: { x: 1060, y: 80, width: 140, height: 120 },
      doorRect: { x: 1102, y: 188, width: 56, height: 24 },
      interiorColor: '#78350f'
    },
    // 南側 3 間小屋 (大門朝北)
    {
      id: 'cottage-4',
      name: '4號木屋 (諾亞占星屋)',
      ownerIndex: 3,
      rect: { x: 200, y: 800, width: 140, height: 120 },
      doorRect: { x: 242, y: 788, width: 56, height: 24 },
      interiorColor: '#581c87'
    },
    {
      id: 'cottage-5',
      name: '5號木屋 (卡爾哨站屋)',
      ownerIndex: 4,
      rect: { x: 630, y: 800, width: 140, height: 120 },
      doorRect: { x: 672, y: 788, width: 56, height: 24 },
      interiorColor: '#14532d'
    },
    {
      id: 'cottage-6',
      name: '6號木屋 (洛基領主屋)',
      ownerIndex: 5,
      rect: { x: 1060, y: 800, width: 140, height: 120 },
      doorRect: { x: 1102, y: 788, width: 56, height: 24 },
      interiorColor: '#7f1d1d'
    }
  ],
  wheatPatches: [
    // 西側農莊小麥田 (完整涵蓋 3D 麥田 x3d: -68 ~ -42, z3d: -22 ~ +22)
    { id: 'wheat-1', rect: { x: 80, y: 300, width: 235, height: 135 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 },
    { id: 'wheat-2', rect: { x: 80, y: 435, width: 235, height: 135 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 },
    { id: 'wheat-3', rect: { x: 80, y: 570, width: 235, height: 140 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 }
  ],
  meatRacks: [
    // 東側肉品燻房與狩獵肉架 (完整涵蓋 3D 肉架空地 x3d: 45 ~ 66)
    { id: 'meat-rack-1', rect: { x: 1110, y: 350, width: 210, height: 150 }, meatAvailable: 8 },
    { id: 'meat-rack-2', rect: { x: 1110, y: 500, width: 210, height: 160 }, meatAvailable: 8 }
  ],
  walls: [
    // 1. 外圍邊界大柵欄
    { x: 0, y: 0, width: 1400, height: 16 },
    { x: 0, y: 984, width: 1400, height: 16 },
    { x: 0, y: 0, width: 16, height: 1000 },
    { x: 1384, y: 0, width: 16, height: 1000 },

    // 2. 中央火堆石圈碰撞箱 (防止角色直接踩進火焰中心)
    { x: 688, y: 488, width: 24, height: 24 },

    // 3. 西側農莊大穀倉 (Barn: 3D -68, -2 -> 2D 中心 82, 482) 實體碰撞箱
    { x: 24, y: 428, width: 112, height: 108 },

    // 4. 北側預言家觀星瞭望塔 (Watchtower: 3D -18, -46 -> 2D 中心 536, 82) 實體碰撞箱
    { x: 518, y: 64, width: 36, height: 36 },

    // 5. 六間木屋的四面牆壁與室內家具碰撞箱
    ...createCottageCollisionBoxes(200, 80, true),
    ...createCottageCollisionBoxes(630, 80, true),
    ...createCottageCollisionBoxes(1060, 80, true),
    ...createCottageCollisionBoxes(200, 800, false),
    ...createCottageCollisionBoxes(630, 800, false),
    ...createCottageCollisionBoxes(1060, 800, false)
  ]
};

/**
 * 簡易 AABB 圓形與矩形碰撞檢測
 */
export function checkCircleRectCollision(
  cx: number,
  cy: number,
  radius: number,
  rect: Rect
): boolean {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));

  const distanceX = cx - closestX;
  const distanceY = cy - closestY;

  return distanceX * distanceX + distanceY * distanceY < radius * radius;
}

/**
 * 檢驗點是否在矩形範圍內 (用於進屋門口感應與採集互動)
 */
export function isPointInRect(px: number, py: number, rect: Rect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}
