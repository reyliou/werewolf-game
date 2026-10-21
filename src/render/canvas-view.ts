/**
 * @file canvas-view.ts
 * @description 2D Canvas 俯視小人與動態迷霧視野渲染器（原生 Canvas 2D 雙緩衝，零多餘套件依賴）
 */

import { GameMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState } from '../core/types';
import { FogOfWar } from './fog-of-war';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  public fogOfWar: FogOfWar;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('無法取得 2D Canvas Context');
    this.ctx = context;
    this.width = canvas.width;
    this.height = canvas.height;
    this.fogOfWar = new FogOfWar(canvas.width, canvas.height);
  }

  public render(snapshot: GameStateSnapshot, map: GameMap, localPlayerId: PlayerId): void {
    const ctx = this.ctx;
    const localPlayer = snapshot.players[localPlayerId];

    // 1. 清空畫布背景
    ctx.fillStyle = '#090a10';
    ctx.fillRect(0, 0, this.width, this.height);

    // 2. 繪製地圖地磚網格
    this.renderFloorGrid(ctx, map);

    // 3. 繪製特殊區域 (中央會議桌與 4 角落祭壇)
    this.renderZones(ctx, map);

    // 4. 繪製長廊障礙牆體
    this.renderWalls(ctx, map);

    // 5. 繪製視線內之玩家俯視小人 (結合牆線遮擋與視野半徑)
    if (localPlayer) {
      this.renderPlayers(ctx, snapshot.players, localPlayer, map);
    }

    // 6. 施加動態迷霧視野 (Fog of War)
    if (localPlayer && snapshot.phase === GamePhase.FREE_ROAM) {
      this.fogOfWar.applyFog(ctx, localPlayer, map);
    } else if (snapshot.phase === GamePhase.MEETING_CALLED || snapshot.phase === GamePhase.VOTING) {
      // 會議期間全員在圓桌聚首，全場視野清晰，僅施加會議暗化濾鏡
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  private renderFloorGrid(ctx: CanvasRenderingContext2D, map: GameMap): void {
    ctx.strokeStyle = '#141726';
    ctx.lineWidth = 1;
    const gridSize = 40;

    for (let x = 0; x < map.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, map.height);
      ctx.stroke();
    }
    for (let y = 0; y < map.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(map.width, y);
      ctx.stroke();
    }
  }

  private renderZones(ctx: CanvasRenderingContext2D, map: GameMap): void {
    for (const zone of map.zones) {
      const { x, y, width, height } = zone.rect;

      if (zone.type === 'MEETING_TABLE') {
        // 中央圓桌發光同心圓
        ctx.fillStyle = '#1e1b4b';
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#818cf8';
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, x + width / 2, y + height / 2 + 5);
      } else {
        // 祭壇矩形
        ctx.fillStyle = '#064e3b';
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);

        ctx.fillStyle = '#6ee7b7';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(zone.name, x + width / 2, y + height / 2 + 4);
      }
    }
  }

  private renderWalls(ctx: CanvasRenderingContext2D, map: GameMap): void {
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;

    for (const wall of map.walls) {
      ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }
  }

  private renderPlayers(
    ctx: CanvasRenderingContext2D,
    players: Record<PlayerId, PlayerState>,
    localPlayer: PlayerState,
    map: GameMap
  ): void {
    for (const id in players) {
      const player = players[id];
      const isLocal = id === localPlayer.id;

      // 檢驗是否在本地玩家的視線範圍內 (Fog of War 遮蔽)
      if (!isLocal && !this.fogOfWar.isPlayerVisible(localPlayer, player, map)) {
        continue;
      }

      ctx.save();
      ctx.translate(player.x, player.y);

      // 若陣亡，繪製倒地遺體骸骨標記
      if (!player.isAlive) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✝', 0, 4);

        ctx.restore();
        continue;
      }

      // 幽影隱形透明度處理
      if (player.isStealthed) {
        ctx.globalAlpha = isLocal ? 0.35 : 0.0; // 隊友或自己半透明，敵方全隱形
      }

      // 護盾光環
      if (player.hasShield) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 角色外體圓形
      ctx.fillStyle = player.color || '#3b82f6';
      ctx.strokeStyle = isLocal ? '#fbbf24' : '#0f172a';
      ctx.lineWidth = isLocal ? 3 : 2;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 朝向面罩方向指針 (Visor)
      ctx.rotate(player.rotation);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(6, -4, 8, 8);

      ctx.restore();

      // 名字與身分標記
      ctx.fillStyle = isLocal ? '#fbbf24' : '#cbd5e1';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.name + (isLocal ? ' (你)' : ''), player.x, player.y - 24);
    }
  }
}
