/**
 * @file fog-of-war.ts
 * @description 動態迷霧視野系統 (Fog of War)：基於視野光圈、視線障礙遮蔽與心智壓迫
 */

import { Rect, VillageMap } from '../core/map-data';
import { PlayerState } from '../core/types';

/**
 * 簡易二維線段相交檢測 (用於視線遮蔽判定)
 */
function isLineIntersectingRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect
): boolean {
  // 檢查視線是否穿過牆體矩形
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  // 粗略邊界檢驗 (Bounding box test)
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false;
  }

  // 射線與矩形 4 邊進行交叉相交檢查
  return (
    lineIntersectsSegment(x1, y1, x2, y2, left, top, right, top) ||
    lineIntersectsSegment(x1, y1, x2, y2, right, top, right, bottom) ||
    lineIntersectsSegment(x1, y1, x2, y2, right, bottom, left, bottom) ||
    lineIntersectsSegment(x1, y1, x2, y2, left, bottom, left, top)
  );
}

function lineIntersectsSegment(
  p0_x: number,
  p0_y: number,
  p1_x: number,
  p1_y: number,
  p2_x: number,
  p2_y: number,
  p3_x: number,
  p3_y: number
): boolean {
  const s1_x = p1_x - p0_x;
  const s1_y = p1_y - p0_y;
  const s2_x = p3_x - p2_x;
  const s2_y = p3_y - p2_y;

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y);
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y);

  return s >= 0 && s <= 1 && t >= 0 && t <= 1;
}

export class FogOfWar {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.offscreenCanvas = document.createElement('canvas');
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) throw new Error('無法初始化離屏 Canvas 遮罩');
    this.offscreenCtx = ctx;
  }

  /**
   * 判定目標玩家對本機玩家是否可見
   */
  public isPlayerVisible(
    localPlayer: PlayerState,
    target: PlayerState,
    map: VillageMap
  ): boolean {
    if (localPlayer.id === target.id) return true;
    if (!localPlayer.isAlive) return true; // 幽靈/陣亡者具備全知幽靈視角

    // 若目標在木屋室內且本地玩家不在同間屋內，不可見
    if (target.insideCottageId && target.insideCottageId !== localPlayer.insideCottageId) {
      return false;
    }

    // 視野半徑檢查
    const dx = target.x - localPlayer.x;
    const dy = target.y - localPlayer.y;
    const distSq = dx * dx + dy * dy;
    const visionRadius = 150 + (localPlayer.sanity / 100) * 110; // 150 ~ 260px

    if (distSq > visionRadius * visionRadius) {
      return false;
    }

    // 長廊牆體障礙視線遮蔽檢查 (Line-of-Sight)
    for (const wall of map.walls) {
      if (isLineIntersectingRect(localPlayer.x, localPlayer.y, target.x, target.y, wall)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 繪製動態迷霧視野遮罩至主畫面
   */
  public applyFog(
    ctx: CanvasRenderingContext2D,
    localPlayer: PlayerState,
    map: { width: number; height: number; bonfire?: { x: number; y: number } }
  ): void {
    const octx = this.offscreenCtx;
    const w = this.offscreenCanvas.width;
    const h = this.offscreenCanvas.height;

    // 1. 在離屏畫布鋪滿深邃迷霧底色 (95% 暗度)
    octx.globalCompositeOperation = 'source-over';
    octx.fillStyle = 'rgba(5, 7, 12, 0.94)';
    octx.fillRect(0, 0, w, h);

    // 2. 切換至 'destination-out'，在玩家處挖出羽化光圈
    octx.globalCompositeOperation = 'destination-out';

    // 陣亡者視野全開；存活者依 Sanity 縮放光圈
    const baseRadius = localPlayer.isAlive
      ? 160 + (localPlayer.sanity / 100) * 100
      : 800;

    const grad = octx.createRadialGradient(
      localPlayer.x,
      localPlayer.y,
      baseRadius * 0.4,
      localPlayer.x,
      localPlayer.y,
      baseRadius
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.85)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    octx.fillStyle = grad;
    octx.beginPath();
    octx.arc(localPlayer.x, localPlayer.y, baseRadius, 0, Math.PI * 2);
    octx.fill();

    // 3. 中央火堆微光引導
    if (map.bonfire) {
      const bx = map.bonfire.x;
      const by = map.bonfire.y;
      const fireGrad = octx.createRadialGradient(bx, by, 30, bx, by, 120);
      fireGrad.addColorStop(0, 'rgba(0, 0, 0, 0.7)');
      fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      octx.fillStyle = fireGrad;
      octx.beginPath();
      octx.arc(bx, by, 120, 0, Math.PI * 2);
      octx.fill();
    }

    // 4. 將離屏迷霧蓋回主畫布
    ctx.drawImage(this.offscreenCanvas, 0, 0);
  }
}
