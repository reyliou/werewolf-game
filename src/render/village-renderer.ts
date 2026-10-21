/**
 * @file village-renderer.ts
 * @description 狼人村莊高質感 2D 場景渲染器：木造小屋(可進出室內)、金黃麥浪、肉架、火堆營火與日夜天色
 */

import { Cottage, VillageMap, WheatPatch } from '../core/map-data';
import { GamePhase, PlayerState } from '../core/types';

export class VillageRenderer {
  private fireFlickerTime: number = 0;
  private wheatWindTime: number = 0;

  /**
   * 繪製村莊完整地面、路徑、建築與環境
   */
  public renderEnvironment(
    ctx: CanvasRenderingContext2D,
    map: VillageMap,
    localPlayer: PlayerState,
    phase: GamePhase,
    deltaSec: number
  ): void {
    this.fireFlickerTime += deltaSec * 8;
    this.wheatWindTime += deltaSec * 3;

    // 1. 草地地景與泥土小徑
    this.renderTerrainAndPaths(ctx, map);

    // 2. 小麥耕地與金黃麥浪
    this.renderWheatFields(ctx, map.wheatPatches);

    // 3. 肉品燻房與狩獵肉架
    this.renderMeatRacks(ctx, map);

    // 4. 中央火堆廣場與圍坐木樁
    this.renderBonfire(ctx, map.bonfire.x, map.bonfire.y, map.bonfire.radius);

    // 5. 6 間村民小屋 (根據本地玩家是否在屋內切換屋頂透視)
    this.renderCottages(ctx, map.cottages, localPlayer);

    // 6. 村莊周邊木柵欄與裝飾樹木
    this.renderFencesAndTrees(ctx, map);

    // 7. 日夜四時段全域環境光濾鏡
    this.renderPhaseAtmosphere(ctx, map.width, map.height, phase);
  }

  private renderTerrainAndPaths(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    // 墨綠色草皮基底
    ctx.fillStyle = '#22381b';
    ctx.fillRect(0, 0, map.width, map.height);

    // 隨機細碎草點增添質感
    ctx.fillStyle = '#2d4a24';
    ctx.beginPath();
    ctx.arc(400, 300, 180, 0, Math.PI * 2);
    ctx.arc(900, 700, 220, 0, Math.PI * 2);
    ctx.fill();

    // 泥土碎石主徑 (通往火堆、小麥田、肉架與木屋)
    ctx.strokeStyle = '#5a4632';
    ctx.lineWidth = 36;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    // 橫貫中央之主道路
    ctx.moveTo(180, 500);
    ctx.lineTo(1220, 500);
    // 連接北側與南側小屋的垂直道路
    ctx.moveTo(700, 180);
    ctx.lineTo(700, 820);
    // 岔路通往小麥田與肉架
    ctx.moveTo(700, 500);
    ctx.lineTo(270, 190);
    ctx.moveTo(700, 500);
    ctx.lineTo(1130, 190);
    ctx.moveTo(700, 500);
    ctx.lineTo(270, 800);
    ctx.moveTo(700, 500);
    ctx.lineTo(1130, 800);
    ctx.stroke();

    // 小徑石子紋理
    ctx.strokeStyle = '#433425';
    ctx.lineWidth = 28;
    ctx.stroke();
  }

  private renderWheatFields(ctx: CanvasRenderingContext2D, patches: WheatPatch[]): void {
    const sway = Math.sin(this.wheatWindTime) * 3;

    for (const patch of patches) {
      const { x, y, width, height } = patch.rect;

      // 翻整深褐色農田底土
      ctx.fillStyle = '#3a2717';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#5c3a21';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // 金黃小麥桿
      const rows = 4;
      const cols = 5;
      const stepX = width / cols;
      const stepY = height / rows;

      ctx.strokeStyle = patch.currentWheat > 0 ? '#eab308' : '#785618';
      ctx.lineWidth = 2.5;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + c * stepX + stepX / 2;
          const wy = y + r * stepY + stepY / 2;

          ctx.beginPath();
          ctx.moveTo(wx, wy + 6);
          ctx.lineTo(wx + sway, wy - 8);
          ctx.stroke();

          // 麥穗頭
          ctx.fillStyle = patch.currentWheat > 0 ? '#facc15' : '#854d0e';
          ctx.beginPath();
          ctx.arc(wx + sway, wy - 9, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 採集互動指示標籤
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🌾 麥田 (${patch.currentWheat}/${patch.maxWheat})`, x + width / 2, y - 6);
    }
  }

  private renderMeatRacks(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    for (const rack of map.meatRacks) {
      const { x, y, width, height } = rack.rect;

      // 屠宰架木造地台
      ctx.fillStyle = '#261c14';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // 掛架橫樑
      ctx.fillStyle = '#78350f';
      ctx.fillRect(x + 10, y + 20, width - 20, 8);

      // 懸掛之生鮮肉品 (狼人食物)
      const meats = Math.min(4, rack.meatAvailable);
      for (let i = 0; i < meats; i++) {
        const mx = x + 25 + i * 24;
        const my = y + 28;

        // 肉品形狀
        ctx.fillStyle = '#991b1b';
        ctx.beginPath();
        ctx.ellipse(mx, my + 14, 8, 12, 0.1, 0, Math.PI * 2);
        ctx.fill();

        // 白色骨頭邊緣
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(mx - 2, my - 2, 4, 6);
      }

      ctx.fillStyle = '#f87171';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`🥩 鮮肉架 (${rack.meatAvailable})`, x + width / 2, y - 6);
    }
  }

  private renderBonfire(ctx: CanvasRenderingContext2D, bx: number, by: number, radius: number): void {
    // 圓形石砌基座
    ctx.fillStyle = '#334155';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(bx, by, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 焦黑柴火木炭
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(bx, by, radius * 0.65, 0, Math.PI * 2);
    ctx.fill();

    // 營火外圍動態橘紅光暈
    const flicker = Math.sin(this.fireFlickerTime) * 4;
    const fireRadius = radius * 0.55 + flicker;

    const fireGlow = ctx.createRadialGradient(bx, by, 6, bx, by, radius * 1.8 + flicker);
    fireGlow.addColorStop(0, 'rgba(251, 146, 60, 0.85)');
    fireGlow.addColorStop(0.5, 'rgba(239, 68, 68, 0.45)');
    fireGlow.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fireGlow;
    ctx.beginPath();
    ctx.arc(bx, by, radius * 1.8 + flicker, 0, Math.PI * 2);
    ctx.fill();

    // 內部金黃烈焰核心
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(bx, by, fireRadius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    // 圍坐木樁座 (6 名村民早晨投票座位)
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI * 2) / 6;
      const seatDist = radius + 32;
      const sx = bx + Math.cos(angle) * seatDist;
      const sy = by + Math.sin(angle) * seatDist;

      ctx.fillStyle = '#78350f';
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // 年輪線
      ctx.strokeStyle = '#92400e';
      ctx.beginPath();
      ctx.arc(sx, sy, 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private renderCottages(
    ctx: CanvasRenderingContext2D,
    cottages: Cottage[],
    localPlayer: PlayerState
  ): void {
    for (const cottage of cottages) {
      const { x, y, width, height } = cottage.rect;
      const isPlayerInside = localPlayer.insideCottageId === cottage.id;

      // 1. 小屋內部木地板（不管屋頂在不在都先繪製內部）
      ctx.fillStyle = '#3f2817';
      ctx.fillRect(x + 10, y + 10, width - 20, height - 20);

      // 地板條紋
      ctx.strokeStyle = '#2d1b0e';
      ctx.lineWidth = 1;
      for (let ly = y + 20; ly < y + height - 10; ly += 14) {
        ctx.beginPath();
        ctx.moveTo(x + 10, ly);
        ctx.lineTo(x + width - 10, ly);
        ctx.stroke();
      }

      // 溫暖小床與木桌
      ctx.fillStyle = '#7f1d1d'; // 紅色床單
      ctx.fillRect(x + 16, y + 16, 26, 38);
      ctx.fillStyle = '#f8fafc'; // 白色枕頭
      ctx.fillRect(x + 18, y + 18, 22, 10);

      ctx.fillStyle = '#92400e'; // 小木桌
      ctx.fillRect(x + width - 42, y + 20, 24, 20);

      // 門口踏墊 (Doorway Mat)
      ctx.fillStyle = '#78350f';
      ctx.fillRect(cottage.doorRect.x, cottage.doorRect.y, cottage.doorRect.width, cottage.doorRect.height);

      // 2. 屋頂渲染 (若玩家在屋內，屋頂半透明透視；若在屋外，實心遮蓋)
      ctx.save();
      if (isPlayerInside) {
        ctx.globalAlpha = 0.22; // 透視室內
      }

      // 茅草傾斜屋頂
      ctx.fillStyle = '#854d0e';
      ctx.fillRect(x, y, width, height);

      // 茅草橫條紋理
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = 2;
      for (let ry = y + 15; ry < y + height; ry += 18) {
        ctx.beginPath();
        ctx.moveTo(x, ry);
        ctx.lineTo(x + width, ry);
        ctx.stroke();
      }

      // 實心木牆邊框
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.strokeRect(x, y, width, height);

      ctx.restore();

      // 小屋標籤門牌
      ctx.fillStyle = isPlayerInside ? '#38bdf8' : '#e2e8f0';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      const label = cottage.name + (isPlayerInside ? ' [你在室內]' : '');
      ctx.fillText(label, x + width / 2, y + height + 16);
    }
  }

  private renderFencesAndTrees(ctx: CanvasRenderingContext2D, map: VillageMap): void {
    // 邊界木柵欄 (Brown Fences)
    ctx.strokeStyle = '#5c3a21';
    ctx.lineWidth = 4;
    for (const wall of map.walls) {
      ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    // 周邊松樹 (幾何圓錐綠樹)
    const treePositions = [
      { x: 70, y: 80 }, { x: 500, y: 70 }, { x: 920, y: 80 },
      { x: 70, y: 920 }, { x: 500, y: 930 }, { x: 920, y: 920 },
      { x: 1320, y: 220 }, { x: 1320, y: 780 }
    ];

    for (const t of treePositions) {
      // 樹幹
      ctx.fillStyle = '#451a03';
      ctx.fillRect(t.x - 4, t.y + 6, 8, 14);

      // 3 層松樹葉
      ctx.fillStyle = '#14532d';
      ctx.beginPath();
      ctx.arc(t.x, t.y + 2, 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#166534';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 8, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#15803d';
      ctx.beginPath();
      ctx.arc(t.x, t.y - 16, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderPhaseAtmosphere(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    phase: GamePhase
  ): void {
    switch (phase) {
      case GamePhase.MORNING:
        // 早晨：溫暖晨光微橘
        ctx.fillStyle = 'rgba(251, 146, 60, 0.12)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.AFTERNOON:
        // 下午：工作白晝金陽
        ctx.fillStyle = 'rgba(254, 240, 138, 0.05)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.DUSK:
        // 黃昏：唯美紫粉晚霞
        ctx.fillStyle = 'rgba(168, 85, 247, 0.18)';
        ctx.fillRect(0, 0, w, h);
        break;

      case GamePhase.NIGHT:
        // 夜晚：深邃暗藍幽月
        ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
        ctx.fillRect(0, 0, w, h);
        break;
    }
  }
}
