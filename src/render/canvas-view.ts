/**
 * @file canvas-view.ts
 * @description Among Us 風格 2D 俯視狼人村莊主渲染器：使用 Pixel Crawler 角色序列幀動畫 (Idle 4幀 / Walk 6幀)、流暢跟隨鏡頭、牆體視線遮蔽與小地圖
 */

import { VILLAGE_MAP, VillageMap } from '../core/map-data';
import { GamePhase, GameStateSnapshot, PlayerId, PlayerState, RoleType } from '../core/types';
import { FogOfWar } from './fog-of-war';
import { spriteAtlas } from './sprite-atlas';
import { VillageRenderer } from './village-renderer';

interface PlayerAnimTrack {
  lastX: number;
  lastY: number;
  animTime: number;
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
  private currentZoom: number = 1.55;

  private animTracks: Map<PlayerId, PlayerAnimTrack> = new Map();
  private dustParticles: DustParticle[] = [];
  private elapsedTime: number = 0;

  constructor(containerOrCanvas: HTMLElement | HTMLCanvasElement) {
    if (containerOrCanvas instanceof HTMLCanvasElement) {
      this.domElement = containerOrCanvas;
    } else {
      this.domElement = document.createElement('canvas');
      containerOrCanvas.querySelectorAll('canvas').forEach((c) => c.remove());
      containerOrCanvas.prepend(this.domElement);
    }

    const context = this.domElement.getContext('2d');
    if (!context) throw new Error('無法取得 2D Canvas Context');
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;

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
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * 觸發指定角色的揮擊 / 採集 / 技能動畫
   */
  public triggerAction(playerId: PlayerId): void {
    const track = this.animTracks.get(playerId);
    if (track) {
      track.actionTimer = 0.38;
    }
  }

  /**
   * 大廳待機背景預覽渲染
   */
  public renderPreview(map: VillageMap, deltaSec: number = 0.016): void {
    this.elapsedTime += deltaSec;
    const ctx = this.ctx;
    const canvasW = this.domElement.width;
    const canvasH = this.domElement.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const fitScale = Math.min(canvasW / map.width, canvasH / map.height);
    const dummyObserver: PlayerState = {
      id: 'preview',
      name: 'Observer',
      role: RoleType.VILLAGER,
      faction: 'VILLAGE',
      isAlive: false,
      x: map.bonfire.x,
      y: map.bonfire.y,
      rotation: 0,
      speed: 0,
      sanity: 100,
      skillCooldownRemaining: 0,
      hasShield: false,
      isTransformed: false,
      wheatCount: 0,
      meatCount: 0,
      assignedCottageId: 'cottage-1',
      insideCottageId: null,
      unreadLetters: [],
      color: '#38bdf8'
    };

    ctx.save();
    ctx.translate(canvasW / 2, canvasH / 2);
    ctx.scale(fitScale, fitScale);
    ctx.translate(-map.width / 2, -map.height / 2);
    this.villageRenderer.renderEnvironment(ctx, map, dummyObserver, GamePhase.AFTERNOON, deltaSec);
    this.villageRenderer.renderForegroundAndAtmosphere(ctx, map, dummyObserver, GamePhase.AFTERNOON);
    ctx.restore();
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

    // 1. 清空螢幕背景並鎖定像素銳利渲染
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, canvasW, canvasH);

    if (!localPlayer) return;

    // 2. 計算平滑鏡頭縮放與跟隨座標 (Among Us 近景跟隨 vs 全村俯瞰)
    const fitScale = Math.min(canvasW / map.width, canvasH / map.height);
    const targetZoom = this.isCloseupCamera ? Math.max(fitScale * 1.55, 1.45) : fitScale * 0.96;
    this.currentZoom += (targetZoom - this.currentZoom) * Math.min(1, deltaSec * 10);

    const targetCamX = this.isCloseupCamera ? localPlayer.x : map.width / 2;
    const targetCamY = this.isCloseupCamera ? localPlayer.y : map.height / 2;
    this.camX += (targetCamX - this.camX) * Math.min(1, deltaSec * 10);
    this.camY += (targetCamY - this.camY) * Math.min(1, deltaSec * 10);

    // 限制鏡頭不超出村莊邊界
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

    // 4. 更新並繪製腳步塵土像素微粒
    this.updateAndRenderDust(ctx, deltaSec);

    // 5. 依 Y 座標排序繪製所有可見玩家 (使用 Pixel Crawler 4幀待機 / 6幀奔跑序列幀)
    this.renderPlayers(ctx, snapshot.players, localPlayer, map, snapshot.phase, deltaSec);

    // 6. 繪製木屋屋頂遮罩 (Among Us 屋外蓋屋頂、進屋透視室內) 與外圍森林樹冠
    this.villageRenderer.renderForegroundAndAtmosphere(ctx, map, localPlayer, snapshot.phase);

    // 7. 繪製 Among Us 風格牆體視線陰影與夜晚火把迷霧
    this.fogOfWar.applyFog(ctx, localPlayer, map, snapshot.phase);

    // 8. 在迷霧之上繪製本地玩家的朝向指示器
    this.renderLocalPlayerOverlay(ctx, localPlayer);

    ctx.restore();

    // 9. 繪製右下角 Among Us 戰術雷達小地圖 (Minimap)
    this.renderMinimap(ctx, snapshot, map, localPlayer);
  }

  private updateAndRenderDust(ctx: CanvasRenderingContext2D, deltaSec: number): void {
    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.x += p.vx * deltaSec;
      p.y += p.vy * deltaSec;
      p.alpha -= deltaSec * 2.0;
      if (p.alpha <= 0) {
        this.dustParticles.splice(i, 1);
        continue;
      }
      ctx.fillStyle = `rgba(214, 197, 169, ${p.alpha.toFixed(2)})`;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
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
    const sortedPlayers = Object.values(players).sort((a, b) => a.y - b.y);

    for (const player of sortedPlayers) {
      const isLocal = player.id === localPlayer.id;

      let track = this.animTracks.get(player.id);
      if (!track) {
        track = {
          lastX: player.x,
          lastY: player.y,
          animTime: Math.random() * 10,
          isMoving: false,
          facingLeft: false,
          actionTimer: 0
        };
        this.animTracks.set(player.id, track);
      }

      const moveDx = player.x - track.lastX;
      const moveDy = player.y - track.lastY;
      const moveDist = Math.hypot(moveDx, moveDy);
      track.isMoving = moveDist > 0.3;
      track.animTime += deltaSec;

      if (Math.abs(moveDx) > 0.2) {
        track.facingLeft = moveDx < 0;
      } else if (isLocal) {
        track.facingLeft = Math.cos(player.rotation) < -0.15;
      }

      if (track.isMoving && player.isAlive && Math.random() < 0.35) {
        this.dustParticles.push({
          x: player.x + (Math.random() - 0.5) * 10,
          y: player.y + 14,
          vx: -moveDx * 4,
          vy: -moveDy * 2 - 5,
          alpha: 0.6,
          size: 3
        });
      }

      if (track.actionTimer > 0) {
        track.actionTimer = Math.max(0, track.actionTimer - deltaSec);
      }

      track.lastX = player.x;
      track.lastY = player.y;

      // 檢查視線可見度 (Among Us 屋內外隔離 + 牆後死角遮蔽)
      if (!isLocal && !this.fogOfWar.isPlayerVisible(localPlayer, player, map, phase)) {
        continue;
      }

      ctx.save();
      ctx.translate(Math.round(player.x), Math.round(player.y));

      // 1. 若已陣亡：繪製血泊與 Pixel Crawler 骷髏遺體幀
      if (!player.isAlive) {
        ctx.fillStyle = 'rgba(153, 27, 27, 0.78)';
        ctx.beginPath();
        ctx.ellipse(0, 8, 20, 10, 0, 0, Math.PI * 2);
        ctx.fill();

        spriteAtlas.drawRegionCentered(ctx, 'corpse_skeleton', 0, 2, 52, 52);
        this.drawCharacterTag(ctx, `💀 ${player.name} (遺體)`, 0, -26, '#fca5a5', false);
        ctx.restore();
        continue;
      }

      // 2. 角色腳底橢圓落地陰影與 Among Us 風格陣營識別光圈
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.ellipse(0, 16, player.isTransformed ? 20 : 14, player.isTransformed ? 9 : 6, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = player.isTransformed
        ? '#ef4444'
        : isLocal
          ? '#facc15'
          : player.color || '#38bdf8';
      ctx.lineWidth = isLocal || player.isTransformed ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 16, player.isTransformed ? 18 : 13, player.isTransformed ? 8 : 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();

      // 3. 藥劑師護盾光環
      if (player.hasShield) {
        const shieldPulse = 1 + Math.sin(this.elapsedTime * 6) * 0.08;
        ctx.strokeStyle = '#38bdf8';
        ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -4, 26 * shieldPulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 4. 變身狂暴巨獸之血紅氣場
      if (player.isTransformed) {
        const wolfGrad = ctx.createRadialGradient(0, -4, 4, 0, -4, 34);
        wolfGrad.addColorStop(0, 'rgba(220, 38, 38, 0.48)');
        wolfGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        ctx.fillStyle = wolfGrad;
        ctx.beginPath();
        ctx.arc(0, -4, 34, 0, Math.PI * 2);
        ctx.fill();
      }

      // 5. 依據職業與移動狀態選取 Pixel Crawler 動畫條與當前幀格 (Idle 8fps / Walk 12fps)
      const stripKey = this.resolveAnimStripKey(player, track.isMoving);
      const fps = track.isMoving ? 12 : 7;
      const frameIndex = Math.floor(track.animTime * fps);
      const spriteSize = player.isTransformed ? 68 : 56;
      const actionLungeX = track.actionTimer > 0 ? (track.facingLeft ? -5 : 5) : 0;

      // 將標準化 32x32 角色框的腳底對齊至 y = +16
      const drawn = spriteAtlas.drawAnimFrameCentered(
        ctx,
        stripKey,
        frameIndex,
        actionLungeX,
        16 - spriteSize / 2,
        spriteSize,
        spriteSize,
        track.facingLeft,
        0
      );

      if (!drawn) {
        ctx.fillStyle = player.isTransformed ? '#991b1b' : player.color || '#3b82f6';
        ctx.beginPath();
        ctx.arc(0, 0, 14, 0, Math.PI * 2);
        ctx.fill();
      }

      // 6. 揮擊 / 割麥 / 襲擊刀光弧線特效
      if (track.actionTimer > 0) {
        const progress = 1 - track.actionTimer / 0.38;
        const dir = track.facingLeft ? -1 : 1;
        ctx.save();
        ctx.translate(dir * 14, -4);
        ctx.strokeStyle = player.isTransformed ? '#ef4444' : '#fde047';
        ctx.lineWidth = player.isTransformed ? 4 : 3;
        ctx.beginPath();
        ctx.arc(0, 0, 20, -0.9 + progress * 0.6, 0.9 + progress * 0.6);
        ctx.stroke();
        ctx.restore();
      }

      // 7. 頭頂名稱、職業與屋內狀態標籤
      let statusBadge = '';
      if (player.insideCottageId) {
        statusBadge = ' 🏠[屋內]';
      } else if (player.isTransformed) {
        statusBadge = ' 🐺[狂暴狼獸]';
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
        player.isTransformed ? -44 : -36,
        nameColor,
        isLocal
      );

      ctx.restore();
    }
  }

  private resolveAnimStripKey(player: PlayerState, isMoving: boolean): string {
    if (player.isTransformed) {
      return isMoving ? 'beast_walk' : 'beast_idle';
    }

    switch (player.role) {
      case RoleType.VILLAGER:
        return isMoving ? 'peasant_walk' : 'peasant_idle';
      case RoleType.DOCTOR:
        return isMoving ? 'doctor_walk' : 'doctor_idle';
      case RoleType.HUNTER:
        return isMoving ? 'hunter_walk' : 'hunter_idle';
      case RoleType.SEER:
        return isMoving ? 'seer_walk' : 'seer_idle';
      case RoleType.TRICKSTER:
        return isMoving ? 'trickster_walk' : 'trickster_idle';
      case RoleType.WEREWOLF:
      default:
        return isMoving ? 'disguise_walk' : 'disguise_idle';
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

  private renderLocalPlayerOverlay(ctx: CanvasRenderingContext2D, localPlayer: PlayerState): void {
    if (!localPlayer.isAlive) return;
    ctx.save();
    ctx.translate(localPlayer.x, localPlayer.y);

    const dirX = Math.cos(localPlayer.rotation) * 22;
    const dirY = Math.sin(localPlayer.rotation) * 22;
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(dirX, dirY + 6, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

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
    ctx.fillStyle = 'rgba(12, 20, 14, 0.88)';
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.roundRect(x0, y0, miniW, miniH, 8 * dpr);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(234, 179, 8, 0.65)';
    for (const p of map.wheatPatches) {
      ctx.fillRect(
        x0 + p.rect.x * scaleX,
        y0 + p.rect.y * scaleY,
        p.rect.width * scaleX,
        p.rect.height * scaleY
      );
    }

    ctx.fillStyle = 'rgba(220, 38, 38, 0.65)';
    for (const r of map.meatRacks) {
      ctx.fillRect(
        x0 + r.rect.x * scaleX,
        y0 + r.rect.y * scaleY,
        r.rect.width * scaleX,
        r.rect.height * scaleY
      );
    }

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

    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(x0 + map.bonfire.x * scaleX, y0 + map.bonfire.y * scaleY, 5 * dpr, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(x0 + localPlayer.x * scaleX, y0 + localPlayer.y * scaleY, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

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
