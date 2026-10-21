/**
 * @file engine.ts
 * @description 遊戲主邏輯循環、玩家物理移動與碰撞判定（由 Host 權威執行）
 */

import { checkCircleRectCollision, DEFAULT_MAP, GameMap } from './map-data';
import { executeRoleSkill, executeShadowKill } from './roles';
import { GameStateMachine } from './state-machine';
import { GamePhase, GameStateSnapshot, PlayerId } from './types';

export class GameEngine {
  public fsm: GameStateMachine;
  public map: GameMap;
  private readonly playerRadius: number = 18;

  constructor(hostId: PlayerId, map: GameMap = DEFAULT_MAP) {
    this.fsm = new GameStateMachine(hostId);
    this.map = map;
  }

  /**
   * 處理客戶端傳遞的移動輸入 (權威校驗並更新座標)
   */
  public handlePlayerMove(playerId: PlayerId, dx: number, dy: number, rotation: number, deltaSec: number): void {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase !== GamePhase.FREE_ROAM) return;

    const player = snapshot.players[playerId];
    if (!player || !player.isAlive) return;

    // 正規化輸入向量並套用速度
    let moveX = dx;
    let moveY = dy;
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > 0) {
      moveX = (moveX / len) * player.speed * deltaSec;
      moveY = (moveY / len) * player.speed * deltaSec;
    }

    let targetX = player.x + moveX;
    let targetY = player.y + moveY;

    // 邊界限制
    targetX = Math.max(this.playerRadius + 20, Math.min(this.map.width - this.playerRadius - 20, targetX));
    targetY = Math.max(this.playerRadius + 20, Math.min(this.map.height - this.playerRadius - 20, targetY));

    // 牆體碰撞檢測 (X 軸獨立碰撞檢測)
    let collisionX = false;
    for (const wall of this.map.walls) {
      if (checkCircleRectCollision(targetX, player.y, this.playerRadius, wall)) {
        collisionX = true;
        break;
      }
    }
    if (collisionX) {
      targetX = player.x;
    }

    // 牆體碰撞檢測 (Y 軸獨立碰撞檢測)
    let collisionY = false;
    for (const wall of this.map.walls) {
      if (checkCircleRectCollision(player.x, targetY, this.playerRadius, wall)) {
        collisionY = true;
        break;
      }
    }
    if (collisionY) {
      targetY = player.y;
    }

    player.x = targetX;
    player.y = targetY;
    player.rotation = rotation;

    this.fsm.updatePlayer(player);
  }

  /**
   * 玩家嘗試發動主動技能
   */
  public handleSkillCast(casterId: PlayerId, targetId?: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase !== GamePhase.FREE_ROAM) {
      return { success: false, message: '非自由探索階段無法施展技能' };
    }

    const caster = snapshot.players[casterId];
    if (!caster) return { success: false, message: '找不到該玩家' };

    const target = targetId ? snapshot.players[targetId] : undefined;
    const result = executeRoleSkill(caster, target);

    if (result.success) {
      this.fsm.updatePlayer(result.updatedPlayer);
      if (result.targetPlayer) {
        this.fsm.updatePlayer(result.targetPlayer);
      }
    }
    return { success: result.success, message: result.message };
  }

  /**
   * 幽影發動暗殺
   */
  public handleShadowAttack(stalkerId: PlayerId, victimId: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase !== GamePhase.FREE_ROAM) {
      return { success: false, message: '非探索暗殺階段' };
    }

    const stalker = snapshot.players[stalkerId];
    const victim = snapshot.players[victimId];
    if (!stalker || !victim) return { success: false, message: '玩家不存在' };

    const killResult = executeShadowKill(stalker, victim);
    if (killResult.success || killResult.message.includes('破碎')) {
      this.fsm.updatePlayer(killResult.updatedStalker);
      this.fsm.updatePlayer(killResult.updatedVictim);
    }
    return { success: killResult.success, message: killResult.message };
  }

  /**
   * 玩家在中央圓桌觸發緊急會議
   */
  public handleTriggerEmergency(callerId: PlayerId): { success: boolean; message: string } {
    const snapshot = this.fsm.getSnapshot();
    if (snapshot.phase !== GamePhase.FREE_ROAM) {
      return { success: false, message: '當前階段無法觸發會議' };
    }

    const caller = snapshot.players[callerId];
    if (!caller || !caller.isAlive) {
      return { success: false, message: '陣亡玩家無法召開會議' };
    }

    // 檢驗是否在中央圓桌範圍內
    const councilTable = this.map.zones.find(z => z.type === 'MEETING_TABLE');
    if (!councilTable) return { success: false, message: '未找到中央會議桌' };

    const inRange = checkCircleRectCollision(caller.x, caller.y, 40, councilTable.rect);
    if (!inRange) {
      return { success: false, message: '必須站在中央圓桌周圍才能敲響警鐘！' };
    }

    this.fsm.callMeeting(callerId, `${caller.name} 於中央圓桌敲響了緊急警鐘！全員召集！`);
    return { success: true, message: '會議已正式召開！' };
  }

  /**
   * 主循環心跳推進
   */
  public update(deltaSec: number): GameStateSnapshot {
    return this.fsm.step(deltaSec);
  }
}
