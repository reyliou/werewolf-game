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
    // 西側農莊小麥田 (村民工作區)
    { id: 'wheat-1', rect: { x: 80, y: 320, width: 130, height: 100 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 },
    { id: 'wheat-2', rect: { x: 80, y: 460, width: 130, height: 100 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 },
    { id: 'wheat-3', rect: { x: 80, y: 600, width: 130, height: 100 }, maxWheat: 10, currentWheat: 10, replenishTimer: 0 }
  ],
  meatRacks: [
    // 東側肉品燻房與狩獵肉架 (狼人吞食進補區)
    { id: 'meat-rack-1', rect: { x: 1180, y: 360, width: 130, height: 110 }, meatAvailable: 8 },
    { id: 'meat-rack-2', rect: { x: 1180, y: 530, width: 130, height: 110 }, meatAvailable: 8 }
  ],
  walls: [
    // 外圍邊界大柵欄
    { x: 0, y: 0, width: 1400, height: 20 },
    { x: 0, y: 980, width: 1400, height: 20 },
    { x: 0, y: 0, width: 20, height: 1000 },
    { x: 1380, y: 0, width: 20, height: 1000 },

    // 小屋 1 實心牆壁 (避開 doorRect x: 250~290, y: 190~200)
    { x: 200, y: 80, width: 140, height: 15 },
    { x: 200, y: 80, width: 15, height: 120 },
    { x: 325, y: 80, width: 15, height: 120 },
    { x: 200, y: 185, width: 50, height: 15 },
    { x: 290, y: 185, width: 50, height: 15 },

    // 小屋 2 實心牆壁
    { x: 630, y: 80, width: 140, height: 15 },
    { x: 630, y: 80, width: 15, height: 120 },
    { x: 755, y: 80, width: 15, height: 120 },
    { x: 630, y: 185, width: 50, height: 15 },
    { x: 720, y: 185, width: 50, height: 15 },

    // 小屋 3 實心牆壁
    { x: 1060, y: 80, width: 140, height: 15 },
    { x: 1060, y: 80, width: 15, height: 120 },
    { x: 1185, y: 80, width: 15, height: 120 },
    { x: 1060, y: 185, width: 50, height: 15 },
    { x: 1150, y: 185, width: 50, height: 15 },

    // 小屋 4 實心牆壁 (南側門口在上方 doorRect y: 790~815)
    { x: 200, y: 905, width: 140, height: 15 },
    { x: 200, y: 800, width: 15, height: 120 },
    { x: 325, y: 800, width: 15, height: 120 },
    { x: 200, y: 800, width: 50, height: 15 },
    { x: 290, y: 800, width: 50, height: 15 },

    // 小屋 5 實心牆壁
    { x: 630, y: 905, width: 140, height: 15 },
    { x: 630, y: 800, width: 15, height: 120 },
    { x: 755, y: 800, width: 15, height: 120 },
    { x: 630, y: 800, width: 50, height: 15 },
    { x: 720, y: 800, width: 50, height: 15 },

    // 小屋 6 實心牆壁
    { x: 1060, y: 905, width: 140, height: 15 },
    { x: 1060, y: 800, width: 15, height: 120 },
    { x: 1185, y: 800, width: 15, height: 120 },
    { x: 1060, y: 800, width: 50, height: 15 },
    { x: 1150, y: 800, width: 50, height: 15 }
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
