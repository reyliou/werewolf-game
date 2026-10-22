/**
 * @file fog-of-war.ts
 * @description Among Us 風格 2D 動態視線遮蔽與迷霧系統 (Fog of War)：支援牆體射線陰影投射、屋內外視野隔離與暗夜火把光圈
 */

import { Rect, VillageMap } from '../core/map-data';
import { GamePhase, PlayerState } from '../core/types';

/**
 * 二維線段與矩形相交檢測 (用於視線遮蔽判定)
 */
function isLineIntersectingRect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  rect: Rect
): boolean {
  const left = rect.x;
  const right = rect.x + rect.width;
  const top = rect.y;
  const bottom = rect.y + rect.height;

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  if (maxX < left || minX > right || maxY < top || minY > bottom) {
    return false;
  }

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

  const denom = -s2_x * s1_y + s1_x * s2_y;
  if (Math.abs(denom) < 1e-6) return false;

  const s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / denom;
  const t = (s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / denom;

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
   * 判定目標玩家對本機玩家是否可見 (Among Us 屋內外視線隔離 + 牆體遮蔽)
   */
  public isPlayerVisible(
    localPlayer: PlayerState,
    target: PlayerState,
    map: VillageMap,
    phase: GamePhase = GamePhase.AFTERNOON
  ): boolean {
    if (localPlayer.id === target.id) return true;
    if (!localPlayer.isAlive) return true; // 陣亡幽靈具備全知視角

    // 1. 屋內外隔離：若一人在木屋內、另一人在屋外（或不同木屋），彼此不可見
    if ((target.insideCottageId || null) !== (localPlayer.insideCottageId || null)) {
      return false;
    }

    // 2. 夜晚視野半徑限制
    if (phase === GamePhase.NIGHT) {
      const dx = target.x - localPlayer.x;
      const dy = target.y - localPlayer.y;
      const distSq = dx * dx + dy * dy;
      const visionRadius = localPlayer.isTransformed
        ? 340
        : 210 + (localPlayer.sanity / 100) * 80;

      // 若目標站在中央營火光圈內亦可見
      const distToFire = Math.hypot(target.x - map.bonfire.x, target.y - map.bonfire.y);
      if (distSq > visionRadius * visionRadius && distToFire > 115) {
        return false;
      }
    }

    // 3. 實體建築外牆視線遮蔽檢查 (跳過外圍邊界柵欄與低矮家具，僅檢查厚牆與穀倉)
    for (let i = 4; i < map.walls.length; i++) {
      const wall = map.walls[i];
      // 略過屋內低矮家具 (寬高皆小於 36 的床/桌/壁爐不擋視線)
      if (wall.width <= 36 && wall.height <= 28) continue;
      if (isLineIntersectingRect(localPlayer.x, localPlayer.y, target.x, target.y, wall)) {
        return false;
      }
    }

    return true;
  }

  /**
   * 繪製 Among Us 風格 2D 牆體投射陰影與夜晚動態視野遮罩
   */
  public applyFog(
    ctx: CanvasRenderingContext2D,
    localPlayer: PlayerState,
    map: VillageMap,
    phase: GamePhase = GamePhase.NIGHT
  ): void {
    const octx = this.offscreenCtx;
    const w = this.offscreenCanvas.width;
    const h = this.offscreenCanvas.height;

    octx.clearRect(0, 0, w, h);
    octx.globalCompositeOperation = 'source-over';

    const isNight = phase === GamePhase.NIGHT;
    const isInside = Boolean(localPlayer.insideCottageId);

    // 1. 基礎環境遮罩：夜晚全圖深邃暗幕；白天若進入木屋室內，則將屋外環境壓暗凸顯室內 (Among Us 房間聚焦效果)
    if (isNight) {
      octx.fillStyle = localPlayer.isAlive ? 'rgba(5, 8, 16, 0.92)' : 'rgba(5, 8, 16, 0.45)';
      octx.fillRect(0, 0, w, h);
    } else if (isInside) {
      octx.fillStyle = 'rgba(6, 10, 18, 0.52)';
      octx.fillRect(0, 0, w, h);
    } else {
      // 白天在戶外時，僅投射輕微建築背光陰影
      this.renderWallShadowVolumes(ctx, localPlayer, map, 'rgba(6, 10, 18, 0.26)');
      return;
    }

    // 2. 挖出玩家自身視野光圈
    octx.globalCompositeOperation = 'destination-out';

    if (isInside && !isNight) {
      // 白天在木屋內：完整照亮所在木屋內部與門口視野
      const myCottage = map.cottages.find(c => c.id === localPlayer.insideCottageId);
      if (myCottage) {
        const { x, y, width, height } = myCottage.rect;
        octx.fillStyle = 'rgba(0, 0, 0, 1)';
        octx.fillRect(x - 8, y - 8, width + 16, height + 16);
      }
    }

    const baseRadius = !localPlayer.isAlive
      ? 900
      : localPlayer.isTransformed
        ? 340
        : isNight
          ? 210 + (localPlayer.sanity / 100) * 80
          : 260;

    const grad = octx.createRadialGradient(
      localPlayer.x,
      localPlayer.y,
      baseRadius * 0.35,
      localPlayer.x,
      localPlayer.y,
      baseRadius
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.88)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    octx.fillStyle = grad;
    octx.beginPath();
    octx.arc(localPlayer.x, localPlayer.y, baseRadius, 0, Math.PI * 2);
    octx.fill();

    // 3. 中央火堆長明微光區
    if (map.bonfire) {
      const bx = map.bonfire.x;
      const by = map.bonfire.y;
      const fireGrad = octx.createRadialGradient(bx, by, 25, bx, by, 130);
      fireGrad.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
      fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      octx.fillStyle = fireGrad;
      octx.beginPath();
      octx.arc(bx, by, 130, 0, Math.PI * 2);
      octx.fill();
    }

    // 4. 在離屏遮罩上補回牆體背光陰影錐 (Among Us 牆後死角陰影)
    octx.globalCompositeOperation = 'source-over';
    this.renderWallShadowVolumes(
      octx,
      localPlayer,
      map,
      isNight ? 'rgba(5, 8, 16, 0.92)' : 'rgba(6, 10, 18, 0.55)'
    );

    // 5. 將離屏迷霧合成至主畫布
    ctx.drawImage(this.offscreenCanvas, 0, 0);
  }

  /**
   * 根據玩家座標，對周圍牆體邊緣投射 2D 射線陰影多邊形 (Shadow Volumes)
   */
  private renderWallShadowVolumes(
    targetCtx: CanvasRenderingContext2D,
    localPlayer: PlayerState,
    map: VillageMap,
    shadowColor: string
  ): void {
    if (!localPlayer.isAlive) return;

    const px = localPlayer.x;
    const py = localPlayer.y;
    const shadowLength = 900;

    targetCtx.save();
    targetCtx.fillStyle = shadowColor;

    // 針對第 4 個以後的建築實體牆投射陰影 (跳過地圖最外框四條邊界牆與小型室內家具)
    for (let i = 4; i < map.walls.length; i++) {
      const wall = map.walls[i];
      if (wall.width <= 36 && wall.height <= 28) continue;

      const cx = wall.x + wall.width / 2;
      const cy = wall.y + wall.height / 2;
      if (Math.hypot(cx - px, cy - py) > 520) continue;

      const corners = [
        { x: wall.x, y: wall.y },
        { x: wall.x + wall.width, y: wall.y },
        { x: wall.x + wall.width, y: wall.y + wall.height },
        { x: wall.x, y: wall.y + wall.height }
      ];

      // 對矩形 4 條邊檢查是否背對玩家，若背對則投射梯形陰影
      for (let e = 0; e < 4; e++) {
        const p1 = corners[e];
        const p2 = corners[(e + 1) % 4];

        // 邊向量與外法線
        const ex = p2.x - p1.x;
        const ey = p2.y - p1.y;
        const nx = ey;
        const ny = -ex;

        // 玩家指向該邊起點之向量
        const vx = p1.x - px;
        const vy = p1.y - py;

        // 若該邊背向光源/玩家，投射陰影多邊形
        if (nx * vx + ny * vy > 0) {
          const d1 = Math.max(1, Math.hypot(p1.x - px, p1.y - py));
          const d2 = Math.max(1, Math.hypot(p2.x - px, p2.y - py));

          const s1x = p1.x + ((p1.x - px) / d1) * shadowLength;
          const s1y = p1.y + ((p1.y - py) / d1) * shadowLength;
          const s2x = p2.x + ((p2.x - px) / d2) * shadowLength;
          const s2y = p2.y + ((p2.y - py) / d2) * shadowLength;

          targetCtx.beginPath();
          targetCtx.moveTo(p1.x, p1.y);
          targetCtx.lineTo(p2.x, p2.y);
          targetCtx.lineTo(s2x, s2y);
          targetCtx.lineTo(s1x, s1y);
          targetCtx.closePath();
          targetCtx.fill();
        }
      }
    }

    targetCtx.restore();
  }
}
