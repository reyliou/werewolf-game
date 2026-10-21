/**
 * @file types.ts
 * @description 遊戲核心型別定義（高內聚、無框架依賴、純資料規格）
 */

export type PlayerId = string;

/** 陣營分類 */
export type Faction = 'ALIGNED' | 'SHADOW' | 'NEUTRAL';

/** 角色列舉 (微創新非對稱 6 人配置) */
export enum RoleType {
  DETECTIVE = 'DETECTIVE',   // 守密陣營：偵探（可查探線索與移動軌跡）
  DOCTOR = 'DOCTOR',         // 守密陣營：醫師（急救護盾，抵禦暗殺）
  SEALER = 'SEALER',         // 守密陣營：封印師（布設感知結界）
  SCHOLAR = 'SCHOLAR',       // 守密陣營：學者（高效破譯儀式進度）
  STALKER = 'STALKER',       // 幽影陣營：潛行者（迷霧隱形、短距突襲）
  TRICKSTER = 'TRICKSTER'    // 中立陣營：狂徒（非對稱勝利：誘導被投出或暗助特定混亂）
}

/** 角色基本規格與元資料 */
export interface RoleDefinition {
  type: RoleType;
  name: string;
  faction: Faction;
  description: string;
  skillName: string;
  skillCooldown: number; // 秒數
}

/** 角色即時狀態 */
export interface PlayerState {
  id: PlayerId;
  name: string;
  role: RoleType;
  faction: Faction;
  isAlive: boolean;
  x: number;
  y: number;
  rotation: number;          // 面對角度 (rad)
  speed: number;
  sanity: number;            // 0 - 100 心智值（視野隨心智下降而緊縮）
  skillCooldownRemaining: number;
  hasShield: boolean;        // 醫師護盾
  isStealthed: boolean;      // 潛行者匿蹤
  color: string;             // 識別色
}

/** 遊戲整體階段 */
export enum GamePhase {
  LOBBY = 'LOBBY',           // 大廳等待連線
  FREE_ROAM = 'FREE_ROAM',   // 自由探索、調查與暗殺 (Day / Night cycle)
  MEETING_CALLED = 'MEETING_CALLED', // 發現遺體或緊急召集
  VOTING = 'VOTING',         // 圓桌發言與投票淘汰
  GAME_OVER = 'GAME_OVER'    // 結算勝負
}

/** 投票紀錄 */
export interface VoteRecord {
  voterId: PlayerId;
  targetId: PlayerId | 'SKIP' | null;
}

/** 全域遊戲狀態快照 (Snapshot) */
export interface GameStateSnapshot {
  tick: number;
  phase: GamePhase;
  phaseRemainingTime: number; // 倒數計時（秒）
  ritualProgress: number;     // 儀式完成度 (0 - 100%)
  players: Record<PlayerId, PlayerState>;
  hostId: PlayerId;
  winnerFaction: Faction | null;
  winReason?: string;
  meetingCallerId?: PlayerId;
  meetingReason?: string;
}
