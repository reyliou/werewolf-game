/**
 * @file engine.ts
 * @description 狼人村莊權威引擎：物理移動、進出木屋室內檢測、割麥、吃肉與狼人變身判定
 */

import { checkCircleRectCollision, isPointInRect, VILLAGE_MAP, VillageMap } from './map-data';
import { executeWerewolfKill } from './roles';
import { GameStateMachine } from './state-machine';
import { GamePhase, GameStateSnapshot, PlayerId, RoleType } from './types';

export class GameEngine {
  public fsm: GameStateMachine;
  public map: VillageMap;
  private readonly playerRadius: number = 18;

  constructor(hostId: PlayerId, map: VillageMap = VILLAGE_MAP) {
    this.fsm = new GameStateMachine(hostId);
    this.map = map;
  }

  /**
   * 處理玩家移動輸入與進出木屋室內檢測
   */
  public handlePlayerMove(
    playerId: PlayerId,
    dx: number,
    dy: number,
    rotation: number,
    deltaSec: number
  ): void {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase === GamePhase.GAME_OVER || snapshot.phase === GamePhase.LOBBY) return;

    const player = snapshot.players[playerId];
    if (!player || !player.isAlive) return;

    // 狼人變身後獲得速度爆發加成
    const currentSpeed = player.isTransformed ? player.speed * 1.35 : player.speed;

    // 正規化移動向量
    let moveX = dx;
    let moveY = dy;
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      moveX = (moveX / len) * currentSpeed * deltaSec;
      moveY = (moveY / len) * currentSpeed * deltaSec;
    }

    let targetX = player.x + moveX;
    let targetY = player.y + moveY;

    // 地圖邊界限制
    targetX = Math.max(this.playerRadius + 20, Math.min(this.map.width - this.playerRadius - 20, targetX));
    targetY = Math.max(this.playerRadius + 20, Math.min(this.map.height - this.playerRadius - 20, targetY));

    // 碰撞檢查 (X 軸)
    let collisionX = false;
    for (const wall of this.map.walls) {
      if (checkCircleRectCollision(targetX, player.y, this.playerRadius, wall)) {
        collisionX = true;
        break;
      }
    }
    if (collisionX) targetX = player.x;

    // 碰撞檢查 (Y 軸)
    let collisionY = false;
    for (const wall of this.map.walls) {
      if (checkCircleRectCollision(player.x, targetY, this.playerRadius, wall)) {
        collisionY = true;
        break;
      }
    }
    if (collisionY) targetY = player.y;

    player.x = targetX;
    player.y = targetY;
    player.rotation = rotation;

    // 檢測當前是否走進某間木屋內部
    let insideId: string | null = null;
    for (const cottage of this.map.cottages) {
      if (isPointInRect(player.x, player.y, cottage.rect)) {
        insideId = cottage.id;
        break;
      }
    }
    player.insideCottageId = insideId;

    this.fsm.updatePlayer(player);
  }

  /**
   * 玩家按下 [E] 進行互動（下午在麥田割麥、在肉架吃肉）
   */
  public handleInteract(playerId: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    const player = snapshot.players[playerId];
    if (!player || !player.isAlive) return { success: false, message: '玩家無法互動' };

    // 1. 檢測是否在麥田範圍內 (下午工作時段)
    for (const patch of this.map.wheatPatches) {
      if (isPointInRect(player.x, player.y, patch.rect)) {
        if (snapshot.phase !== GamePhase.AFTERNOON) {
          return { success: false, message: '非下午工作時間，農田休耕中' };
        }
        if (patch.currentWheat <= 0) {
          return { success: false, message: '此耕地小麥已被收割完畢，等待生長' };
        }

        patch.currentWheat -= 1;
        player.wheatCount += 1;
        this.fsm.addVillageWheat(1);
        this.fsm.updatePlayer(player);
        return {
          success: true,
          message: `${player.name} 揮動鐮刀收割了 1 綑金黃小麥！🌾 (全村累積: ${this.fsm.getSnapshot().villageWheatTotal}/${snapshot.targetWheatGoal})`
        };
      }
    }

    // 2. 檢測是否在生鮮肉架範圍內 (狼人吃肉)
    for (const rack of this.map.meatRacks) {
      if (isPointInRect(player.x, player.y, rack.rect)) {
        if (player.role !== RoleType.WEREWOLF) {
          return { success: false, message: '那是風乾肉品，只有嗜血的野獸才會急迫吞食。' };
        }
        if (rack.meatAvailable <= 0) {
          return { success: false, message: '肉架上的鮮肉已被吃光！' };
        }

        rack.meatAvailable -= 1;
        player.meatCount += 1;
        this.fsm.updatePlayer(player);
        return {
          success: true,
          message: `你撕咬吞食了鮮肉塊 🥩 (當前食量: ${player.meatCount})，體力暴漲！`
        };
      }
    }

    return { success: false, message: '附近沒有可互動的物件。' };
  }

  /**
   * 玩家按下 [Space] 觸發角色專屬技能或變身
   */
  public handleSkillCast(playerId: PlayerId, targetId?: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    const player = snapshot.players[playerId];
    if (!player || !player.isAlive) return { success: false, message: '無法施展' };

    // 狼人變身機制 (夜晚限定)
    if (player.role === RoleType.WEREWOLF) {
      if (snapshot.phase === GamePhase.NIGHT) {
        player.isTransformed = !player.isTransformed;
        this.fsm.updatePlayer(player);
        return {
          success: true,
          message: player.isTransformed
            ? '🐺 獠牙顯露！你已變身為狂暴巨狼！速度暴增，開始獵殺！'
            : '已收起獠牙，恢復人類偽裝外觀。'
        };
      } else {
        // 白天狼人破壞麥田
        if (snapshot.phase === GamePhase.AFTERNOON) {
          for (const patch of this.map.wheatPatches) {
            if (isPointInRect(player.x, player.y, patch.rect)) {
              this.fsm.sabotageWheat(2);
              return { success: true, message: '你暗中踐踏並毀損了麥田 (-2 🌾)！村民間的猜疑正在蔓延...' };
            }
          }
        }
        return { success: false, message: '白晝之下無法變身，請在夜晚月光下現出真身。' };
      }
    }

    // 藥劑師庇護護盾
    if (player.role === RoleType.DOCTOR) {
      const target = targetId ? snapshot.players[targetId] : player;
      if (target && target.isAlive) {
        target.hasShield = true;
        this.fsm.updatePlayer(target);
        return { success: true, message: `已為 ${target.name} 施加了聖光草藥護盾！` };
      }
    }

    return { success: false, message: '目前時段無法施展該技能。' };
  }

  /**
   * 狼人於夜晚撲殺村民
   */
  public handleWerewolfAttack(wolfId: PlayerId, victimId: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase !== GamePhase.NIGHT) {
      return { success: false, message: '只有在黑夜之中才能發動狼人獵殺！' };
    }

    const wolf = snapshot.players[wolfId];
    const victim = snapshot.players[victimId];
    if (!wolf || !victim) return { success: false, message: '玩家不存在' };

    const killRes = executeWerewolfKill(wolf, victim);
    if (killRes.success || killRes.message.includes('破碎')) {
      this.fsm.updatePlayer(killRes.updatedWolf);
      this.fsm.updatePlayer(killRes.updatedVictim);
    }
    return { success: killRes.success, message: killRes.message };
  }

  /**
   * 主循環更新
   */
  public update(deltaSec: number): GameStateSnapshot {
    return this.fsm.step(deltaSec);
  }
}
