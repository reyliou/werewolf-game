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
  private readonly playerRadius: number = 12;

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

    // 3. 檢測是否在木屋室內（按 [E] 鎖門 / 開鎖 或 走出木屋）
    if (player.insideCottageId) {
      const cottage = this.map.cottages.find(c => c.id === player.insideCottageId);
      if (cottage) {
        const isOwner = player.assignedCottageId === cottage.id;
        const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
        const doorCenterY = cottage.doorRect.y + cottage.doorRect.height / 2;
        const distToDoor = Math.hypot(player.x - doorCenterX, player.y - doorCenterY);

        if (distToDoor < 55 || !isOwner) {
          const isNorth = cottage.rect.y < 400;
          player.y = isNorth ? cottage.doorRect.y + cottage.doorRect.height + 28 : cottage.doorRect.y - 28;
          player.x = doorCenterX;
          player.insideCottageId = null;
          this.fsm.updatePlayer(player);
          return { success: true, message: `你走出了 ${cottage.name}。` };
        } else {
          cottage.isLocked = !cottage.isLocked;
          return {
            success: true,
            message: cottage.isLocked
              ? `🔒 你已將 ${cottage.name} 緊緊反鎖！今晚狼人無法闖入破壞。(靠近門口按 [E] 或直接往外走即可離開)`
              : `🔓 你打開了 ${cottage.name} 的門鎖。(靠近門口按 [E] 或直接往外走即可離開)`
          };
        }
      }
    }

    // 4. 檢測是否在木屋門口（按 [E] 進入木屋）
    for (const cottage of this.map.cottages) {
      const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
      const doorCenterY = cottage.doorRect.y + cottage.doorRect.height / 2;
      const distToDoor = Math.hypot(player.x - doorCenterX, player.y - doorCenterY);

      if (distToDoor < 75) {
        const isOwner = player.assignedCottageId === cottage.id;
        if (cottage.isLocked && !isOwner) {
          return { success: false, message: `🔒 房門已從內部鎖上，你不是這間木屋的主人，無法進入！` };
        }
        player.x = cottage.rect.x + cottage.rect.width / 2;
        player.y = cottage.rect.y + cottage.rect.height / 2;
        player.insideCottageId = cottage.id;
        this.fsm.updatePlayer(player);
        return {
          success: true,
          message: isOwner
            ? `🏠 你回到了自己的專屬小屋 (${cottage.name}) 避難！在室內按 [E] 可反鎖門鎖。`
            : `🚪 你進入了 ${cottage.name} 作客。`
        };
      }
    }

    return { success: false, message: '附近沒有可互動的物件。' };
  }

  /**
   * 獲取當前位置可觸發的 [E] 互動提示文字
   */
  public getInteractionPrompt(playerId: PlayerId): string | null {
    const snapshot = this.fsm.getSnapshot();
    const player = snapshot.players[playerId];
    if (!player || !player.isAlive) return null;

    // 麥田
    for (const patch of this.map.wheatPatches) {
      if (isPointInRect(player.x, player.y, patch.rect)) {
        return snapshot.phase === GamePhase.AFTERNOON ? '🌾 按 [E] 收割金黃小麥' : '🌾 小麥生長中 (下午可收割)';
      }
    }

    // 肉架
    for (const rack of this.map.meatRacks) {
      if (isPointInRect(player.x, player.y, rack.rect)) {
        return player.role === RoleType.WEREWOLF ? '🥩 按 [E] 吞食鮮肉' : '🥩 生鮮燻肉架';
      }
    }

    // 室內
    if (player.insideCottageId) {
      const cottage = this.map.cottages.find(c => c.id === player.insideCottageId);
      if (cottage) {
        const isOwner = player.assignedCottageId === cottage.id;
        const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
        const doorCenterY = cottage.doorRect.y + cottage.doorRect.height / 2;
        const distToDoor = Math.hypot(player.x - doorCenterX, player.y - doorCenterY);
        if (distToDoor < 45) {
          return '🚪 按 [E] 走出木屋';
        } else if (isOwner) {
          return cottage.isLocked ? '🔓 按 [E] 打開門鎖' : '🔒 按 [E] 反鎖小屋防狼';
        }
      }
    }

    // 室外門口
    for (const cottage of this.map.cottages) {
      const doorCenterX = cottage.doorRect.x + cottage.doorRect.width / 2;
      const doorCenterY = cottage.doorRect.y + cottage.doorRect.height / 2;
      const distToDoor = Math.hypot(player.x - doorCenterX, player.y - doorCenterY);
      if (distToDoor < 55) {
        const isOwner = player.assignedCottageId === cottage.id;
        if (cottage.isLocked && !isOwner) {
          return '🔒 房門已反鎖';
        }
        return isOwner ? `🏠 按 [E] 進入專屬木屋` : `🚪 按 [E] 進入 ${cottage.name}`;
      }
    }

    return null;
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

    // 檢查受害者是否躲在已反鎖的木屋中
    if (victim.insideCottageId) {
      const cottage = this.map.cottages.find(c => c.id === victim.insideCottageId);
      if (cottage?.isLocked) {
        return {
          success: false,
          message: `🔒 ${victim.name} 將木屋房門牢牢反鎖了！厚重的大門阻擋了你的利爪！`
        };
      }
    }

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
