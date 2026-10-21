/**
 * @file state-machine.ts
 * @description 遊戲核心有限狀態機 (FSM) 與勝負結算引擎（嚴格純函數式狀態流轉）
 */

import { Faction, GamePhase, GameStateSnapshot, PlayerId, PlayerState, RoleType } from './types';

export interface StateMachineConfig {
  freeRoamDuration: number;   // 自由探索單次回合時間 (秒)
  meetingDuration: number;    // 會議發言時間 (秒)
  votingDuration: number;     // 投票時間 (秒)
  ritualSpeedPerSec: number;  // 儀式基礎破譯速度 (%/秒)
}

export const DEFAULT_CONFIG: StateMachineConfig = {
  freeRoamDuration: 90,
  meetingDuration: 45,
  votingDuration: 25,
  ritualSpeedPerSec: 0.25
};

export class GameStateMachine {
  private state: GameStateSnapshot;
  private config: StateMachineConfig;
  private votes: Record<PlayerId, PlayerId | 'SKIP'> = {};
  private emergencyCalledBy: PlayerId | null = null;
  private emergencyReason: string = '';

  constructor(hostId: PlayerId, config: StateMachineConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.state = {
      tick: 0,
      phase: GamePhase.LOBBY,
      phaseRemainingTime: 0,
      ritualProgress: 0,
      players: {},
      hostId,
      winnerFaction: null,
      winReason: undefined
    };
  }

  public getSnapshot(): GameStateSnapshot {
    return JSON.parse(JSON.stringify(this.state));
  }

  public getMeetingInfo(): { callerId: PlayerId | null; reason: string } {
    return {
      callerId: this.emergencyCalledBy,
      reason: this.emergencyReason
    };
  }

  public addPlayer(player: PlayerState): boolean {
    if (this.state.phase !== GamePhase.LOBBY) return false;
    if (Object.keys(this.state.players).length >= 6) return false;
    this.state.players[player.id] = { ...player };
    return true;
  }

  public removePlayer(playerId: PlayerId): void {
    delete this.state.players[playerId];
  }

  public updatePlayer(player: PlayerState): void {
    if (this.state.players[player.id]) {
      this.state.players[player.id] = { ...player };
    }
  }

  /**
   * 正式開始遊戲（分配身分並進入自由探索階段）
   */
  public startGame(assignedRoles: Record<PlayerId, RoleType>): boolean {
    const playerIds = Object.keys(this.state.players);
    if (playerIds.length < 2) {
      // 至少需 2 人即可啟動測試（正式 6 人）
      return false;
    }

    for (const id of playerIds) {
      const role = assignedRoles[id] || RoleType.SCHOLAR;
      const faction = role === RoleType.STALKER ? 'SHADOW' : role === RoleType.TRICKSTER ? 'NEUTRAL' : 'ALIGNED';
      this.state.players[id].role = role;
      this.state.players[id].faction = faction;
      this.state.players[id].isAlive = true;
      this.state.players[id].sanity = 100;
      this.state.players[id].skillCooldownRemaining = 0;
      this.state.players[id].hasShield = false;
      this.state.players[id].isStealthed = false;
    }

    this.state.phase = GamePhase.FREE_ROAM;
    this.state.phaseRemainingTime = this.config.freeRoamDuration;
    this.state.ritualProgress = 0;
    this.state.winnerFaction = null;
    this.state.winReason = undefined;
    this.votes = {};
    return true;
  }

  /**
   * 遊戲時鐘心跳 (每秒或每次 Tick 推進 delta 秒)
   */
  public step(deltaSeconds: number): GameStateSnapshot {
    if (this.state.phase === GamePhase.GAME_OVER || this.state.phase === GamePhase.LOBBY) {
      return this.getSnapshot();
    }

    this.state.tick += 1;
    this.state.phaseRemainingTime = Math.max(0, this.state.phaseRemainingTime - deltaSeconds);

    // 遞減玩家技能冷卻時間
    for (const id in this.state.players) {
      const p = this.state.players[id];
      if (p.skillCooldownRemaining > 0) {
        p.skillCooldownRemaining = Math.max(0, p.skillCooldownRemaining - deltaSeconds);
      }
    }

    // 自由探索階段：增加儀式進度並檢查勝負
    if (this.state.phase === GamePhase.FREE_ROAM) {
      // 計算存活學者與普通存活守密成員數量，推動儀式進度
      const livingScholars = Object.values(this.state.players).filter(
        p => p.isAlive && p.role === RoleType.SCHOLAR
      ).length;
      const progressDelta = (this.config.ritualSpeedPerSec + livingScholars * 0.15) * deltaSeconds;
      this.state.ritualProgress = Math.min(100, this.state.ritualProgress + progressDelta);

      // 檢查進度滿是否獲勝
      if (this.state.ritualProgress >= 100) {
        this.triggerGameOver('ALIGNED', '古老封印儀式已全部破譯完成！守密同盟獲勝！');
        return this.getSnapshot();
      }

      // 時間倒數耗盡：自動進入圓桌會議
      if (this.state.phaseRemainingTime <= 0) {
        this.callMeeting(this.state.hostId, '時間週期結束，鐘聲響起，全員召集。');
      }
    } else if (this.state.phase === GamePhase.MEETING_CALLED) {
      if (this.state.phaseRemainingTime <= 0) {
        this.state.phase = GamePhase.VOTING;
        this.state.phaseRemainingTime = this.config.votingDuration;
        this.votes = {};
      }
    } else if (this.state.phase === GamePhase.VOTING) {
      if (this.state.phaseRemainingTime <= 0) {
        this.resolveVoting();
      }
    }

    // 每次狀態更新都檢驗常規勝負條件
    this.checkVictoryConditions();
    return this.getSnapshot();
  }

  /**
   * 召開緊急會議或報告遺體
   */
  public callMeeting(callerId: PlayerId, reason: string): boolean {
    if (this.state.phase !== GamePhase.FREE_ROAM) return false;

    this.state.phase = GamePhase.MEETING_CALLED;
    this.state.phaseRemainingTime = this.config.meetingDuration;
    this.state.meetingCallerId = callerId;
    this.state.meetingReason = reason;
    this.emergencyCalledBy = callerId;
    this.emergencyReason = reason;
    this.votes = {};

    // 召開會議時，解除所有人的隱形與護盾
    for (const id in this.state.players) {
      this.state.players[id].isStealthed = false;
      this.state.players[id].hasShield = false;
    }
    return true;
  }

  /**
   * 提交投票
   */
  public castVote(voterId: PlayerId, targetId: PlayerId | 'SKIP'): boolean {
    if (this.state.phase !== GamePhase.VOTING) return false;
    const voter = this.state.players[voterId];
    if (!voter || !voter.isAlive) return false;

    this.votes[voterId] = targetId;

    // 若所有存活玩家皆已投票，提前結算
    const livingPlayers = Object.values(this.state.players).filter(p => p.isAlive);
    const hasAllVoted = livingPlayers.every(p => this.votes[p.id] !== undefined);
    if (hasAllVoted) {
      this.resolveVoting();
    }
    return true;
  }

  /**
   * 結算圓桌投票票數
   */
  private resolveVoting(): void {
    const tally: Record<string, number> = { SKIP: 0 };
    for (const voterId in this.votes) {
      const target = this.votes[voterId];
      tally[target] = (tally[target] || 0) + 1;
    }

    let highestTarget: string | null = null;
    let highestVotes = 0;
    let isTie = false;

    for (const target in tally) {
      const count = tally[target];
      if (count > highestVotes) {
        highestVotes = count;
        highestTarget = target;
        isTie = false;
      } else if (count === highestVotes && count > 0) {
        isTie = true;
      }
    }

    if (!isTie && highestTarget && highestTarget !== 'SKIP') {
      const victim = this.state.players[highestTarget];
      if (victim && victim.isAlive) {
        victim.isAlive = false;

        // 【微創新非對稱核心機制】：狂徒 (Trickster) 被投票淘汰時直接奪得勝利！
        if (victim.role === RoleType.TRICKSTER) {
          this.triggerGameOver('NEUTRAL', '混亂狂徒 (Trickster) 成功誘導眾人將其處決，達成終極非對稱狂歡勝利！');
          return;
        }
      }
    }

    // 投票結算後檢查勝負；若未分勝負，重回自由探索階段
    if (!this.checkVictoryConditions()) {
      this.state.phase = GamePhase.FREE_ROAM;
      this.state.phaseRemainingTime = this.config.freeRoamDuration;
      this.votes = {};
    }
  }

  /**
   * 檢驗整體勝利條件
   */
  private checkVictoryConditions(): boolean {
    if (this.state.phase === GamePhase.GAME_OVER) return true;

    const living = Object.values(this.state.players).filter(p => p.isAlive);
    const livingShadows = living.filter(p => p.faction === 'SHADOW').length;
    const livingAligned = living.filter(p => p.faction === 'ALIGNED').length;

    // 1. 所有幽影陣營滅亡 -> 守密同盟獲勝
    if (livingShadows === 0 && living.length > 0) {
      this.triggerGameOver('ALIGNED', '所有暗影已完全被驅逐消滅！守密同盟獲勝！');
      return true;
    }

    // 2. 幽影數量大於或等於存活守密成員 -> 幽影獲勝
    if (livingShadows >= livingAligned && livingShadows > 0) {
      this.triggerGameOver('SHADOW', '暗影已徹底籠罩並壓制了守密同盟！幽影陣營獲勝！');
      return true;
    }

    return false;
  }

  private triggerGameOver(winner: Faction, reason: string): void {
    this.state.phase = GamePhase.GAME_OVER;
    this.state.winnerFaction = winner;
    this.state.winReason = reason;
  }
}
