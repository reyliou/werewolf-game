/**
 * @file canvas-view.ts
 * @description 狼人村莊 2D 畫布主渲染器：村莊場景、木屋室內透視、狼人變身外觀與迷霧整合
 */

import { VillageMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState } from '../core/types';
import { FogOfWar } from './fog-of-war';
import { VillageRenderer } from './village-renderer';

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;
  public fogOfWar: FogOfWar;
  public villageRenderer: VillageRenderer;

  constructor(canvas: HTMLCanvasElement) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('無法取得 2D Canvas Context');
    this.ctx = context;
    this.width = canvas.width;
    this.height = canvas.height;
    this.fogOfWar = new FogOfWar(canvas.width, canvas.height);
    this.villageRenderer = new VillageRenderer();
  }

  public render(
    snapshot: GameStateSnapshot,
    map: VillageMap,
    localPlayerId: PlayerId,
    deltaSec: number = 0.016
  ): void {
    const ctx = this.ctx;
    const localPlayer = snapshot.players[localPlayerId];

    // 1. 清空畫布
    ctx.clearRect(0, 0, this.width, this.height);

    // 2. 繪製村莊環境地景（草皮、小麥田、肉架、火堆、6間小屋、圍欄與松樹）
    if (localPlayer) {
      this.villageRenderer.renderEnvironment(ctx, map, localPlayer, snapshot.phase, deltaSec);
    }

    // 3. 繪製視線內之所有玩家小人
    if (localPlayer) {
      this.renderPlayers(ctx, snapshot.players, localPlayer);
    }

    // 4. 夜晚時段套用黑暗動態迷霧 (Fog of War)；在屋內避難者光線微亮
    if (localPlayer && snapshot.phase === GamePhase.NIGHT) {
      // 轉換舊版 map 介面以適配 fog of war
      const legacyMap = {
        width: map.width,
        height: map.height,
        walls: map.walls,
        zones: [
          {
            id: 'bonfire',
            name: '中央火堆',
            type: 'MEETING_TABLE' as const,
            rect: { x: map.bonfire.x - 40, y: map.bonfire.y - 40, width: 80, height: 80 }
          }
        ]
      };
      this.fogOfWar.applyFog(ctx, localPlayer, legacyMap);
    }
  }

  private renderPlayers(
    ctx: CanvasRenderingContext2D,
    players: Record<PlayerId, PlayerState>,
    localPlayer: PlayerState
  ): void {
    for (const id in players) {
      const player = players[id];
      const isLocal = id === localPlayer.id;

      ctx.save();
      ctx.translate(player.x, player.y);

      // 若已陣亡
      if (!player.isAlive) {
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('✝ 遺體', 0, 4);
        ctx.restore();
        continue;
      }

      // 護盾光環
      if (player.hasShield) {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 判斷是否為「變身巨狼 (Transformed Werewolf)」
      if (player.isTransformed) {
        // 兇猛黑狼體態
        ctx.fillStyle = '#1c1917'; // 漆黑毛皮
        ctx.strokeStyle = '#dc2626'; // 猩紅邊框
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 尖銳狼耳
        ctx.rotate(player.rotation);
        ctx.fillStyle = '#450a0a';
        ctx.beginPath();
        ctx.moveTo(10, -14);
        ctx.lineTo(24, -20);
        ctx.lineTo(16, -6);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(10, 14);
        ctx.lineTo(24, 20);
        ctx.lineTo(16, 6);
        ctx.fill();

        // 血紅眼眸
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(8, -5, 5, 4);
        ctx.fillRect(8, 2, 5, 4);
      } else {
        // 普通人類/村民外觀
        ctx.fillStyle = player.color || '#3b82f6';
        ctx.strokeStyle = isLocal ? '#fbbf24' : '#0f172a';
        ctx.lineWidth = isLocal ? 3 : 2;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // 視線面罩
        ctx.rotate(player.rotation);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(6, -4, 8, 8);
      }

      ctx.restore();

      // 頭頂名字與身分狀態
      ctx.fillStyle = isLocal ? '#fbbf24' : '#f8fafc';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';

      let statusBadge = '';
      if (player.insideCottageId) {
        statusBadge = ' [在屋內]';
      } else if (player.isTransformed) {
        statusBadge = ' 🐺[狂暴巨狼]';
      }

      // 自己的身分可見，其他人的狼人身分隱藏（除非已變身）
      const roleText = (isLocal || player.isTransformed) ? `[${player.role}]` : '';
      ctx.fillText(`${player.name} ${roleText}${statusBadge}`, player.x, player.y - 25);
    }
  }
}
