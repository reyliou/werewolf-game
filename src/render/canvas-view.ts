/**
 * @file canvas-view.ts
 * @description Among Us 風格 2D 俯視狼人村莊主渲染器：整合網路開源角色精靈 (Wesnoth Units)、流暢跟隨鏡頭、動作揮擊特效、牆體視線遮蔽與小地圖
 */

import { VILLAGE_MAP, VillageMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState, RoleType } from '../core/types';
import { FogOfWar } from './fog-of-war';
import { spriteAtlas } from './sprite-atlas';
import { VillageRenderer } from './village-renderer';

interface PlayerAnimTrack {
  lastX: number;
  lastY: number;
  walkPhase: number;
  isMoving: boolean;
  facingLeft: boolean;
  actionTimer: number;
}

interface DustParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
}

export class CanvasRenderer {
  public domElement: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mapWidth: number = VILLAGE_MAP.width;
  private mapHeight: number = VILLAGE_MAP.height;

  public fogOfWar: FogOfWar;
  public villageRenderer: VillageRenderer;

  // Among Us 風格鏡頭：預設為近景跟隨視角 (isCloseupCamera = true)，按 [V] 可切換全村戰術俯瞰
  public isCloseupCamera: boolean = true;
  private camX: number = 700;
  private camY: number = 500;
  private currentZoom: number = 1.48;

  private animTracks: Map<PlayerId, PlayerAnimTrack> = new Map();
  private dustParticles: DustParticle[] = [];
  private elapsedTime: number = 0;

  constructor(containerOrCanvas: HTMLElement | HTMLCanvasElement) {
    if (containerOrCanvas instanceof HTMLCanvasElement) {
      this.domElement = containerOrCanvas;
    } else {
      this.domElement = document.createElement('canvas');
      containerOrCanvas.innerHTML = '';
      containerOrCanvas.appendChild(this.domElement);
    }

    const context = this.domElement.getContext('2d');
    if (!context) throw new Error('無法取得 2D Canvas Context');
    this.ctx = context;

    this.fogOfWar = new FogOfWar(this.mapWidth, this.mapHeight);
    this.villageRenderer = new VillageRenderer();

    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  private handleResize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth || this.mapWidth;
    const h = window.innerHeight || this.mapHeight;
    this.domElement.width = Math.floor(w * dpr);
    this.domElement.height = Math.floor(h * dpr);
  }

  /**
   * 觸發指定角色的揮擊 / 採集 / 技能 2D 精靈動畫
   */
  public triggerAction(playerId: PlayerId): void {
    const track = this.animTracks.get(playerId);
    if (track) {
      track.actionTimer = 0.42;
    }
  }

  public render(
    snapshot: GameStateSnapshot,
    map: VillageMap,
    localPlayerId: PlayerId,
    deltaSec: number = 0.016
  ): void {
    this.elapsedTime += deltaSec;
    const ctx = this.ctx;
    const localPlayer = snapshot.players[localPlayerId];

    const canvasW = this.domElement.width;
    const canvasH = this.domElement.height;

    // 1. 清空螢幕背景
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (!localPlayer) return;

    // 2. 計算平滑鏡頭縮放與跟隨座標 (Among Us 近景跟隨 vs 全村俯瞰)
    const fitScale = Math.min(canvasW / map.width, canvasH / map.height);
    const targetZoom = this.isCloseupCamera ? Math.max(fitScale * 1.48, 1.35) : fitScale * 0.96;
    this.currentZoom += (targetZoom - this.currentZoom) * Math.min(1, deltaSec * 10);

    const targetCamX = this.isCloseupCamera ? localPlayer.x : map.width / 2;
    const targetCamY = this.isCloseupCamera ? localPlayer.y : map.height / 2;
    this.camX += (targetCamX - this.camX) * Math.min(1, deltaSec * 10);
    this.camY += (targetCamY - this.camY) * Math.min(1, deltaSec * 10);

    // 限制鏡頭不超出村莊邊界過多
    const halfViewW = (canvasW / this.currentZoom) * 0.5;
    const halfViewH = (canvasH / this.currentZoom) * 0.5;
    const clampedCamX =
      halfViewW >= map.width / 2
        ? map.width / 2
        : Math.max(halfViewW, Math.min(map.width - halfViewW, this.camX));
    const clampedCamY =
      halfViewH >= map.height / 2
        ? map.height / 2
        : Math.max(halfViewH, Math.min(map.height - halfViewH, this.camY));

    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(this.currentZoom, this.currentZoom);
    ctx.translate(-clampedCamX, -clampedCamY);

    // 3. 繪製村莊地面、農田、肉架、營火與木屋室內地板家具
    this.villageRenderer.renderEnvironment(ctx, map, localPlayer, snapshot.phase, deltaSec);

    // 4. 更新並繪製腳步塵土粒子
    this.updateAndRenderDust(ctx, deltaSec);

    // 5. 依 Y 座標排序繪製所有可見玩家 (Y-Sorting 實現前後遮擋立體感)
    this.renderPlayers(ctx, snapshot.players, localPlayer, map, snapshot.phase, deltaSec);

    // 6. 繪製木屋屋頂遮罩 (Among Us 屋外蓋屋頂、進屋透視室內) 與外圍高聳樹冠
    this.villageRenderer.renderForegroundAndAtmosphere(ctx, map, localPlayer, snapshot.phase);

    // 7. 繪製 Among Us 風格牆體視線陰影與夜晚火把迷霧
    this.fogOfWar.applyFog(ctx, localPlayer, map, snapshot.phase);

    // 8. 在迷霧之上繪製本地玩家的互動範圍提示圈與頭頂指標，確保暗夜中自身清晰可辨
    this.renderLocalPlayerOverlay(ctx, localPlayer);

    ctx.restore();

    // 9. 繪製右下角 Among Us 戰術小地圖 (Minimap)
    this.renderMinimap(ctx, snapshot, map, localPlayer);
  }

  private updateAndRenderDust(ctx: CanvasRenderingContext2D, deltaSec: number): void {
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.alpha -= deltaSec * 1.8;
      if (p.alpha <= 0) {
        this.dustParticles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(214, 197, 169, ${p.alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderPlayers(
    ctx: CanvasRenderingContext2D,
    players: Record<PlayerId, PlayerState>,
    localPlayer: PlayerState,
    map: VillageMap,
    phase: GamePhase,
    deltaSec: number
  ): void {
    // 依 Y 軸由北向南排序，讓南側角色自然蓋在北側角色前方
    const sortedPlayers = Object.values(players).sort((a, b) => a.y - b.y);

    for (const player of sortedPlayers) {
      const isLocal = player.id === localPlayer.id;

      // 更新角色動畫軌跡
      let track = this.animTracks.get(player.id);
      if (!track) {
        track = {
          lastX: player.x,
          lastY: player.y,
          walkPhase: 0,
          isMoving: false,
          facingLeft: false,
          actionTimer: 0
        };
        this.animTracks.set(player.id, track);
      }

      const moveDx = player.x - track.lastX;
      const moveDy = player.y - track.lastY;
      const moveDist = Math.hypot(moveDx, moveDy);
      track.isMoving = moveDist > 0.35;

      if (Math.abs(moveDx) > 0.2) {
        track.facingLeft = moveDx < 0;
      } else if (isLocal) {
        track.facingLeft = Math.cos(player.rotation) < -0.15;
      }

      if (track.isMoving && player.isAlive) {
        track.walkPhase += deltaSec * 14;
        // 產生腳步揚塵微粒
        if (Math.random() < 0.35) {
          this.dustParticles.push({
            x: player.x + (Math.random() - 0.5) * 12,
            y: player.y + 14 + (Math.random() - 0.5) * 4,
            vx: -moveDx * 4,
            vy: -moveDy * 2 - 6,
            alpha: 0.55,
            size: 2.5 + Math.random() * 2.5
          });
        }
      } else {
        track.walkPhase = 0;
      }

      if (track.actionTimer > 0) {
        track.actionTimer = Math.max(0, track.actionTimer - deltaSec);
      }

      track.lastX = player.x;
      track.lastY = player.y;

      // 檢查視線可見度 (Among Us 屋內外隔離 + 牆後遮蔽)
      if (!isLocal && !this.fogOfWar.isPlayerVisible(localPlayer, player, map, phase)) {
        continue;
      }

      ctx.save();
      ctx.translate(player.x, player.y);

      // 1. 若已陣亡：繪製血泊與網路開源骸骨精靈 (bones.png)
      if (!player.isAlive) {
        ctx.fillStyle = 'rgba(153, 27, 27, 0.78)';
        ctx.beginPath();
        ctx.ellipse(0, 6, 22, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        if (!spriteAtlas.drawCentered(ctx, 'bones', 0, 0, 48, 48)) {
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.fill();
        }

        this.drawCharacterTag(ctx, `💀 ${player.name} (遺體)`, 0, -28, '#fca5a5', false);
        ctx.restore();
        continue;
      }

      // 2. 角色腳底橢圓落地陰影與 Among Us 風格陣營識別光圈
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 16, player.isTransformed ? 24 : 17, player.isTransformed ? 11 : 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // 腳底識別環
      ctx.strokeStyle = player.isTransformed
        ? '#ef4444'
        : isLocal
          ? '#facc15'
          : player.color || '#38bdf8';
      ctx.lineWidth = isLocal || player.isTransformed ? 2.8 : 1.8;
      ctx.beginPath();
      ctx.ellipse(0, 16, player.isTransformed ? 22 : 15, player.isTransformed ? 9 : 6.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 3. 藥劑師護盾光環
      if (player.hasShield) {
        const shieldPulse = 1 + Math.sin(this.elapsedTime * 6) * 0.08;
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, -2, 28 * shieldPulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 4. 變身狂暴巨狼之血紅氣場
      if (player.isTransformed) {
        const wolfGrad = ctx.createRadialGradient(0, 0, 6, 0, 0, 38);
        wolfGrad.addColorStop(0, 'rgba(220, 38, 38, 0.48)');
        wolfGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = wolfGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 38, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. 選擇角色對應的 Wesnoth 2D 網路精靈與動畫幀
      const spriteKey = this.resolveUnitSpriteKey(player, track);
      const bobY = track.isMoving ? -Math.abs(Math.sin(track.walkPhase)) * 5.5 : Math.sin(this.elapsedTime * 3) * 1.2;
      const tilt = track.isMoving
        ? Math.sin(track.walkPhase) * 0.09
        : track.actionTimer > 0
          ? (track.facingLeft ? -0.22 : 0.22)
          : 0;
      const spriteSize = player.isTransformed ? 76 : 64;

      const drawn = spriteAtlas.drawCentered(
        ctx,
        spriteKey,
        0,
        bobY - 4,
        spriteSize,
        spriteSize,
        track.facingLeft,
        tilt
      );

      if (!drawn) {
        // 備援幾何小人
        ctx.fillStyle = player.isTransformed ? '#1c1917' : player.color || '#3b82f6';
        ctx.beginPath();
        ctx.arc(0, bobY, 16, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. 若正在執行揮擊 / 割麥 / 狼爪攻擊，繪製動態刀光弧線
      if (track.actionTimer > 0) {
        const progress = 1 - track.actionTimer / 0.42;
        const dir = track.facingLeft ? -1 : 1;
        ctx.save();
        ctx.translate(dir * 16, -4);
        ctx.strokeStyle = player.isTransformed ? '#ef4444' : '#fde047';
        ctx.lineWidth = player.isTransformed ? 4 : 3;
        ctx.beginPath();
        ctx.arc(0, 0, 22, -0.9 + progress * 0.6, 0.9 + progress * 0.6);
        ctx.stroke();
        ctx.restore();
      }

      // 7. 頭頂名稱、職業與屋內狀態標籤
      let statusBadge = '';
      if (player.insideCottageId) {
        statusBadge = ' 🏠[屋內]';
      } else if (player.isTransformed) {
        statusBadge = ' 🐺[狂暴巨狼]';
      }

      const roleText = isLocal || player.isTransformed ? ` [${player.role}]` : '';
      const nameColor = player.isTransformed
        ? '#fca5a5'
        : isLocal
          ? '#fde047'
          : '#f8fafc';

      this.drawCharacterTag(
        ctx,
        `${player.name}${roleText}${statusBadge}`,
        0,
        player.isTransformed ? -42 : -34,
        nameColor,
        isLocal
      );

      ctx.restore();
    }
  }

  /**
   * 根據角色職業、移動與揮擊狀態決定對應的網路精靈圖名稱
   */
  private resolveUnitSpriteKey(player: PlayerState, track: PlayerAnimTrack): string {
    // 變身狼人型態
    if (player.isTransformed) {
      if (track.actionTimer > 0) return 'direwolf_atk';
      if (track.isMoving && Math.floor(track.walkPhase) % 2 === 1) return 'direwolf_move';
      return 'direwolf';
    }

    const isActFrame = track.actionTimer > 0 || (track.isMoving && Math.floor(track.walkPhase) % 2 === 1);
    const isAltAct = track.actionTimer > 0.21;

    switch (player.role) {
      case RoleType.VILLAGER:
        if (track.actionTimer > 0) return isAltAct ? 'peasant_atk1' : 'peasant_atk2';
        if (track.isMoving && Math.floor(track.walkPhase) % 2 === 1) return 'peasant_atk1';
        return Math.floor(this.elapsedTime * 1.5) % 4 === 0 ? 'peasant_idle1' : 'peasant';

      case RoleType.DOCTOR:
        if (isActFrame) return isAltAct ? 'doctor_act2' : 'doctor_act1';
        return 'doctor';

      case RoleType.HUNTER:
        if (isActFrame) return isAltAct ? 'hunter_act2' : 'hunter_act1';
        return 'hunter';

      case RoleType.SEER:
        if (isActFrame) return isAltAct ? 'seer_act2' : 'seer_act1';
        return 'seer';

      case RoleType.TRICKSTER:
        if (isActFrame) return isAltAct ? 'trickster_act2' : 'trickster_act1';
        return 'trickster';

      case RoleType.WEREWOLF:
      default:
        // 未變身時偽裝為村莊貴族領主外觀
        if (isActFrame) return isAltAct ? 'lord_act2' : 'lord_act1';
        return 'lord';
    }
  }

  private drawCharacterTag(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    color: string,
    isLocal: boolean
  ): void {
    ctx.save();
    ctx.font = 'bold 11.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    const w = ctx.measureText(text).width + 12;
    const h = 18;

    ctx.fillStyle = isLocal ? 'rgba(20, 30, 16, 0.92)' : 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();

    ctx.strokeStyle = isLocal ? 'rgba(250, 204, 21, 0.8)' : 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /**
   * 在夜晚迷霧之上標示本地玩家朝向指示器，確保完全不迷路
   */
  private renderLocalPlayerOverlay(ctx: CanvasRenderingContext2D, localPlayer: PlayerState): void {
    if (!localPlayer.isAlive) return;
    ctx.save();
    ctx.translate(localPlayer.x, localPlayer.y);

    // 朝向小箭頭
    const dirX = Math.cos(localPlayer.rotation) * 24;
    const dirY = Math.sin(localPlayer.rotation) * 24;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(dirX, dirY + 6, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 繪製右下角 Among Us 風格戰術雷達小地圖
   */
  private renderMinimap(
    ctx: CanvasRenderingContext2D,
    snapshot: GameStateSnapshot,
    map: VillageMap,
    localPlayer: PlayerState
  ): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const miniW = 168 * dpr;
    const miniH = 120 * dpr;
    const pad = 18 * dpr;
    const x0 = this.domElement.width - miniW - pad;
    const y0 = this.domElement.height - miniH - pad;

    const scaleX = miniW / map.width;
    const scaleY = miniH / map.height;

    ctx.save();
    // 背景框
    ctx.fillStyle = 'rgba(12, 20, 14, 0.88)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.roundRect(x0, y0, miniW, miniH, 8 * dpr);
    ctx.fill();
    ctx.stroke();

    // 麥田區塊
    ctx.fillStyle = 'rgba(234, 179, 8, 0.65)';
    for (const p of map.wheatPatches) {
      ctx.fillRect(
        x0 + p.rect.x * scaleX,
        y0 + p.rect.y * scaleY,
        p.rect.width * scaleX,
        p.rect.height * scaleY
      );
    }

    // 肉架區塊
    ctx.fillStyle = 'rgba(220, 38, 38, 0.65)';
    for (const r of map.meatRacks) {
      ctx.fillRect(
        x0 + r.rect.x * scaleX,
        y0 + r.rect.y * scaleY,
        r.rect.width * scaleX,
        r.rect.height * scaleY
      );
    }

    // 6 間木屋區塊 (專屬木屋高亮青色)
    for (const c of map.cottages) {
      const isMine = localPlayer.assignedCottageId === c.id;
      ctx.fillStyle = isMine ? 'rgba(56, 189, 248, 0.85)' : 'rgba(146, 64, 14, 0.75)';
      ctx.fillRect(
        x0 + c.rect.x * scaleX,
        y0 + c.rect.y * scaleY,
        c.rect.width * scaleX,
        c.rect.height * scaleY
      );
    }

    // 中央營火
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(x0 + map.bonfire.x * scaleX, y0 + map.bonfire.y * scaleY, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // 玩家自身光點
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x0 + localPlayer.x * scaleX, y0 + localPlayer.y * scaleY, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // 小地圖標題
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `bold ${10 * dpr}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `🗺️ 村莊雷達 (${snapshot.phase === GamePhase.NIGHT ? '暗夜' : '白晝'})`,
      x0 + 6 * dpr,
      y0 + 13 * dpr
    );

    ctx.restore();
  }
}
