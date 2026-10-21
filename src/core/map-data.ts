/**
 * @file map-data.ts
 * @description 狼人村莊地圖：6間獨立木屋、金黃小麥田、肉品燻房、中央火堆與周邊圍欄
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
  rect: Rect;            // 木屋本體矩形
  doorRect: Rect;        // 門口出入口感應區 (踩入即進屋)
  interiorColor: string;
  isLocked?: boolean;    // 是否上鎖防範狼人
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
  walls: Rect[];         // 碰撞障礙牆（含小屋四壁，門口除外）
}

export const VILLAGE_MAP: VillageMap = {
  width: 1400,
  height: 1000,
  bonfire: { x: 700, y: 500, radius: 45 },
  cottages: [
    // 北側 3 間小屋
    {
      id: 'cottage-1',
      name: '1號木屋 (亞歷山大小屋)',
      ownerIndex: 0,
      rect: { x: 200, y: 80, width: 140, height: 120 },
      doorRect: { x: 250, y: 190, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
    },
    {
      id: 'cottage-2',
      name: '2號木屋 (艾蓮娜小屋)',
      ownerIndex: 1,
      rect: { x: 630, y: 80, width: 140, height: 120 },
      doorRect: { x: 680, y: 190, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
    },
    {
      id: 'cottage-3',
      name: '3號木屋 (萊昂小屋)',
      ownerIndex: 2,
      rect: { x: 1060, y: 80, width: 140, height: 120 },
      doorRect: { x: 1110, y: 190, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
    },
    // 南側 3 間小屋
    {
      id: 'cottage-4',
      name: '4號木屋 (諾亞小屋)',
      ownerIndex: 3,
      rect: { x: 200, y: 800, width: 140, height: 120 },
      doorRect: { x: 250, y: 790, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
    },
    {
      id: 'cottage-5',
      name: '5號木屋 (卡爾小屋)',
      ownerIndex: 4,
      rect: { x: 630, y: 800, width: 140, height: 120 },
      doorRect: { x: 680, y: 790, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
    },
    {
      id: 'cottage-6',
      name: '6號木屋 (洛基小屋)',
      ownerIndex: 5,
      rect: { x: 1060, y: 800, width: 140, height: 120 },
      doorRect: { x: 1110, y: 790, width: 40, height: 25 },
      interiorColor: '#3b2f2f'
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
    // 外圍邊界大柵欄
    { x: 0, y: 0, width: 1400, height: 16 },
    { x: 0, y: 984, width: 1400, height: 16 },
    { x: 0, y: 0, width: 16, height: 1000 },
    { x: 1384, y: 0, width: 16, height: 1000 },

    // 小屋 1 牆壁 (中心 270, 140 -> 3D: -47.3, -39.6；加寬南側大門通道 x: 236~304 確保順暢進出)
    { x: 200, y: 80, width: 140, height: 12 },
    { x: 200, y: 80, width: 12, height: 120 },
    { x: 328, y: 80, width: 12, height: 120 },
    { x: 200, y: 188, width: 36, height: 12 },
    { x: 304, y: 188, width: 36, height: 12 },

    // 小屋 2 牆壁 (中心 700, 140 -> 3D: 0.0, -39.6；大門通道 x: 666~734)
    { x: 630, y: 80, width: 140, height: 12 },
    { x: 630, y: 80, width: 12, height: 120 },
    { x: 758, y: 80, width: 12, height: 120 },
    { x: 630, y: 188, width: 36, height: 12 },
    { x: 734, y: 188, width: 36, height: 12 },

    // 小屋 3 牆壁 (中心 1130, 140 -> 3D: +47.3, -39.6；大門通道 x: 1096~1164)
    { x: 1060, y: 80, width: 140, height: 12 },
    { x: 1060, y: 80, width: 12, height: 120 },
    { x: 1188, y: 80, width: 12, height: 120 },
    { x: 1060, y: 188, width: 36, height: 12 },
    { x: 1164, y: 188, width: 36, height: 12 },

    // 小屋 4 牆壁 (中心 270, 860 -> 3D: -47.3, +39.6；北側大門通道 x: 236~304)
    { x: 200, y: 908, width: 140, height: 12 },
    { x: 200, y: 800, width: 12, height: 120 },
    { x: 328, y: 800, width: 12, height: 120 },
    { x: 200, y: 800, width: 36, height: 12 },
    { x: 304, y: 800, width: 36, height: 12 },

    // 小屋 5 牆壁 (中心 700, 860 -> 3D: 0.0, +39.6；北側大門通道 x: 666~734)
    { x: 630, y: 908, width: 140, height: 12 },
    { x: 630, y: 800, width: 12, height: 120 },
    { x: 758, y: 800, width: 12, height: 120 },
    { x: 630, y: 800, width: 36, height: 12 },
    { x: 734, y: 800, width: 36, height: 12 },

    // 小屋 6 牆壁 (中心 1130, 860 -> 3D: +47.3, +39.6；北側大門通道 x: 1096~1164)
    { x: 1060, y: 908, width: 140, height: 12 },
    { x: 1060, y: 800, width: 12, height: 120 },
    { x: 1188, y: 800, width: 12, height: 120 },
    { x: 1060, y: 800, width: 36, height: 12 },
    { x: 1164, y: 800, width: 36, height: 12 }
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
