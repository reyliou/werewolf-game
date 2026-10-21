/**
 * @file map-data.ts
 * @description 地圖結構、區域標籤與障礙物矩形資料（純資料結構，支援快速 AABB 碰撞檢測）
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Zone {
  id: string;
  name: string;
  type: 'MEETING_TABLE' | 'RITUAL_ALTAR' | 'SAFE_ZONE';
  rect: Rect;
}

export interface GameMap {
  width: number;
  height: number;
  zones: Zone[];
  walls: Rect[];
}

/** 預設古堡/密室地圖 (1200 x 900) */
export const DEFAULT_MAP: GameMap = {
  width: 1200,
  height: 900,
  zones: [
    {
      id: 'council-table',
      name: '中央圓桌 (Council Table)',
      type: 'MEETING_TABLE',
      rect: { x: 520, y: 370, width: 160, height: 160 }
    },
    {
      id: 'north-archive',
      name: '北側檔案庫 (North Archive)',
      type: 'RITUAL_ALTAR',
      rect: { x: 120, y: 100, width: 140, height: 140 }
    },
    {
      id: 'south-crypt',
      name: '南側地窖 (South Crypt)',
      type: 'RITUAL_ALTAR',
      rect: { x: 940, y: 660, width: 140, height: 140 }
    },
    {
      id: 'east-shrine',
      name: '東側星盤 (East Shrine)',
      type: 'RITUAL_ALTAR',
      rect: { x: 940, y: 100, width: 140, height: 140 }
    },
    {
      id: 'west-altar',
      name: '西側封印陣 (West Altar)',
      type: 'RITUAL_ALTAR',
      rect: { x: 120, y: 660, width: 140, height: 140 }
    }
  ],
  walls: [
    // 外圍邊界
    { x: 0, y: 0, width: 1200, height: 20 },
    { x: 0, y: 880, width: 1200, height: 20 },
    { x: 0, y: 0, width: 20, height: 900 },
    { x: 1180, y: 0, width: 20, height: 900 },

    // 內部長廊隔牆 (產生視線死角與暗殺機會)
    { x: 350, y: 150, width: 20, height: 250 },
    { x: 830, y: 150, width: 20, height: 250 },
    { x: 350, y: 500, width: 20, height: 250 },
    { x: 830, y: 500, width: 20, height: 250 }
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
