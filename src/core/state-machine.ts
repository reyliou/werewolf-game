/**
 * @file state-machine.ts
 * @description 狼人村莊四時段有限狀態機 (FSM)：早晨火堆會議、下午割麥工作、黃昏秘密傳信、夜晚變身獵殺
 */

import { Faction, GamePhase, GameStateSnapshot, LetterMessage, PlayerId, PlayerState, RoleType } from './types';

export interface VillagePhaseDurations {
  morningDuration: number;    // 早晨火堆票人時間 (秒)
  afternoonDuration: number;  // 下午工作割麥時間 (秒)
  duskDuration: number;       // 黃昏傳信時間 (秒)
  nightDuration: number;      // 夜晚自由獵殺時間 (秒)
}

export const DEFAULT_PHASE_CONFIG: VillagePhaseDurations = {
  morningDuration: 40,
  afternoonDuration: 60,
  duskDuration: 25,
  nightDuration: 45
};

export class GameStateMachine {
  private state: GameStateSnapshot;
  private config: VillagePhaseDurations;
  private votes: Record<PlayerId, PlayerId | 'SKIP'> = {};

  constructor(hostId: PlayerId, config: VillagePhaseDurations = DEFAULT_PHASE_CONFIG) {
    this.config = config;
    this.state = {
      tick: 0,
      dayCount: 1,
      phase: GamePhase.LOBBY,
      phaseRemainingTime: 0,
      villageWheatTotal: 0,
      targetWheatGoal: 25, // 採集滿 25 綑小麥村民獲勝
      players: {},
      hostId,
      winnerFaction: null,
      winReason: undefined,
      lastExecutedPlayerId: null
    };
  }

  public getSnapshot(): GameStateSnapshot {
    return JSON.parse(JSON.stringify(this.state));
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
   * 啟動 6 人村莊對局
   */
  public startGame(assignedRoles: Record<PlayerId, RoleType>): boolean {
    const playerIds = Object.keys(this.state.players);
    if (playerIds.length < 1) return false;

    let cottageIdx = 1;
    for (const id of playerIds) {
      const role = assignedRoles[id] || RoleType.VILLAGER;
      const faction: Faction =
        role === RoleType.WEREWOLF ? 'WEREWOLF' : role === RoleType.TRICKSTER ? 'NEUTRAL' : 'VILLAGE';

      this.state.players[id].role = role;
      this.state.players[id].faction = faction;
      this.state.players[id].isAlive = true;
      this.state.players[id].sanity = 100;
      this.state.players[id].skillCooldownRemaining = 0;
      this.state.players[id].hasShield = false;
      this.state.players[id].isTransformed = false;
      this.state.players[id].wheatCount = 0;
      this.state.players[id].meatCount = 0;
      this.state.players[id].assignedCottageId = `cottage-${cottageIdx++}`;
      this.state.players[id].insideCottageId = null;
      this.state.players[id].unreadLetters = [];
    }

    // 第一天由下午工作時間開始（讓大家先熟悉割麥與環境），或由早晨開始
    this.state.dayCount = 1;
    this.state.phase = GamePhase.AFTERNOON;
    this.state.phaseRemainingTime = this.config.afternoonDuration;
    this.state.villageWheatTotal = 0;
    this.state.winnerFaction = null;
    this.state.winReason = undefined;
    this.votes = {};
    return true;
  }

  /**
   * 主循環時間推進
   */
  public step(deltaSeconds: number): GameStateSnapshot {
    if (this.state.phase === GamePhase.GAME_OVER || this.state.phase === GamePhase.LOBBY) {
      return this.getSnapshot();
    }

    this.state.tick += 1;
    this.state.phaseRemainingTime = Math.max(0, this.state.phaseRemainingTime - deltaSeconds);

    // 遞減玩家技能冷卻
    for (const id in this.state.players) {
      const p = this.state.players[id];
      if (p.skillCooldownRemaining > 0) {
        p.skillCooldownRemaining = Math.max(0, p.skillCooldownRemaining - deltaSeconds);
      }
    }

    // 時段倒數結束，觸發四時段流轉
    if (this.state.phaseRemainingTime <= 0) {
      this.advanceToNextPhase();
    }

    this.checkVictoryConditions();
    return this.getSnapshot();
  }

  /**
   * 四時段順序推進：早晨 -> 下午 -> 黃昏 -> 夜晚 -> (次日)早晨
   */
  private advanceToNextPhase(): void {
    switch (this.state.phase) {
      case GamePhase.MORNING:
        // 早晨火堆投票時間截止，結算票數
        this.resolveMorningVotes();
        // 進入下午工作時間
        this.state.phase = GamePhase.AFTERNOON;
        this.state.phaseRemainingTime = this.config.afternoonDuration;
        this.votes = {};
        break;

      case GamePhase.AFTERNOON:
        // 下午工作結束，進入黃昏秘密傳信時段
        this.state.phase = GamePhase.DUSK;
        this.state.phaseRemainingTime = this.config.duskDuration;
        break;

      case GamePhase.DUSK:
        // 黃昏結束，黑夜降臨，進入夜晚自由時間
        this.state.phase = GamePhase.NIGHT;
        this.state.phaseRemainingTime = this.config.nightDuration;
        break;

      case GamePhase.NIGHT:
        // 夜晚結束，狼人強制解除變身，全員迎接次日早晨火堆會議
        for (const id in this.state.players) {
          this.state.players[id].isTransformed = false;
        }
        this.state.dayCount += 1;
        this.state.phase = GamePhase.MORNING;
        this.state.phaseRemainingTime = this.config.morningDuration;
        this.votes = {};
        break;
    }
  }

  /**
   * 早晨火堆旁投票結算 (規則：必須「過半數」才處決，否則維持原議流票)
   */
  public castVote(voterId: PlayerId, targetId: PlayerId | 'SKIP'): boolean {
    if (this.state.phase !== GamePhase.MORNING) return false;
    const voter = this.state.players[voterId];
    if (!voter || !voter.isAlive) return false;

    this.votes[voterId] = targetId;

    // 若所有存活玩家皆已投票，提前結算
    const living = Object.values(this.state.players).filter(p => p.isAlive);
    const allVoted = living.every(p => this.votes[p.id] !== undefined);
    if (allVoted) {
      this.resolveMorningVotes();
      this.state.phase = GamePhase.AFTERNOON;
      this.state.phaseRemainingTime = this.config.afternoonDuration;
      this.votes = {};
    }
    return true;
  }

  private resolveMorningVotes(): void {
    const living = Object.values(this.state.players).filter(p => p.isAlive);
    const livingCount = living.length;
    const threshold = Math.floor(livingCount / 2) + 1; // 嚴格過半門檻

    const tally: Record<string, number> = {};
    for (const vId in this.votes) {
      const t = this.votes[vId];
      if (t && t !== 'SKIP') {
        tally[t] = (tally[t] || 0) + 1;
      }
    }

    let highestTarget: string | null = null;
    let highestCount = 0;

    for (const target in tally) {
      if (tally[target] > highestCount) {
        highestCount = tally[target];
        highestTarget = target;
      }
    }

    // 檢驗是否過半數
    if (highestTarget && highestCount >= threshold) {
      const victim = this.state.players[highestTarget];
      if (victim && victim.isAlive) {
        victim.isAlive = false;
        this.state.lastExecutedPlayerId = highestTarget;

        // 【狂徒非對稱獲勝】：成功引導火堆過半票死自己
        if (victim.role === RoleType.TRICKSTER) {
          this.triggerGameOver('NEUTRAL', '混亂狂徒於早晨火堆中成功被過半數票決淘汰，奪得終極非對稱狂歡勝利！');
          return;
        }

        // 老獵人死前反擊
        if (victim.role === RoleType.HUNTER) {
          console.log('[Hunter] 老獵人倒地前扣動了扳機！');
        }
      }
    } else {
      // 沒過半數，維持原議（流票平安夜）
      this.state.lastExecutedPlayerId = null;
    }
  }

  /**
   * 黃昏秘密發送書信
   */
  public sendDuskLetter(fromId: PlayerId, toId: PlayerId, content: string): boolean {
    if (this.state.phase !== GamePhase.DUSK) return false;
    const sender = this.state.players[fromId];
    const receiver = this.state.players[toId];
    if (!sender || !receiver || !sender.isAlive || !receiver.isAlive) return false;

    const letter: LetterMessage = {
      fromId,
      fromName: sender.name,
      toId,
      content,
      timestamp: Date.now()
    };
    receiver.unreadLetters.push(letter);
    return true;
  }

  /**
   * 村民採集小麥入庫
   */
  public addVillageWheat(amount: number): void {
    this.state.villageWheatTotal += amount;
    if (this.state.villageWheatTotal >= this.state.targetWheatGoal) {
      this.triggerGameOver('VILLAGE', `村莊成功收割累積了 ${this.state.targetWheatGoal} 綑小麥！村民陣營靠勤勞獲勝！`);
    }
  }

  /**
   * 狼人白天破壞小麥儲備
   */
  public sabotageWheat(amount: number): void {
    this.state.villageWheatTotal = Math.max(0, this.state.villageWheatTotal - amount);
  }

  /**
   * 檢驗整體勝負條件
   */
  private checkVictoryConditions(): boolean {
    if (this.state.phase === GamePhase.GAME_OVER) return true;

    const living = Object.values(this.state.players).filter(p => p.isAlive);
    const wolves = living.filter(p => p.faction === 'WEREWOLF').length;
    const villagers = living.filter(p => p.faction === 'VILLAGE').length;

    // 1. 所有狼人滅亡 -> 村民獲勝
    if (wolves === 0 && living.length > 0) {
      this.triggerGameOver('VILLAGE', '所有潛伏的狼人均已被驅逐消滅！村莊重獲和平！');
      return true;
    }

    // 2. 狼人數量大於或等於村民數量 -> 狼人獲勝
    if (wolves >= villagers && wolves > 0) {
      this.triggerGameOver('WEREWOLF', '夜幕血月降臨，狼人數量已壓制村莊！狼人陣營獲勝！');
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
