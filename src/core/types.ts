/**
 * @file types.ts
 * @description 狼人村莊核心資料型別規格（6人村莊、小麥與肉品、四時段循環）
 */

export type PlayerId = string;

/** 陣營分類 */
export type Faction = 'VILLAGE' | 'WEREWOLF' | 'NEUTRAL';

/** 角色列舉 (村莊與狼人殺) */
export enum RoleType {
  VILLAGER = 'VILLAGER',     // 普通村民：辛勤耕作，收集小麥維持村莊繁榮
  WEREWOLF = 'WEREWOLF',     // 狼人：白天偽裝、破壞麥田、偷吃肉；夜晚變身獵殺
  DOCTOR = 'DOCTOR',         // 藥劑師：採集草藥，施加庇護之盾抵抗夜襲
  HUNTER = 'HUNTER',         // 老獵人：若在火堆被處決或被殺，可開槍反擊帶走一人
  SEER = 'SEER',             // 占卜師：黃昏能以靈視私信洞悉一名村民底細
  TRICKSTER = 'TRICKSTER'    // 狂徒：中立非對稱，誘導早晨火堆處決自己即奪勝
}

/** 角色規格與元資料 */
export interface RoleDefinition {
  type: RoleType;
  name: string;
  faction: Faction;
  description: string;
  skillName: string;
  skillCooldown: number;
}

/** 遊戲四時段日程循環 */
export enum GamePhase {
  LOBBY = 'LOBBY',           // 大廳等待
  MORNING = 'MORNING',       // 早晨：中央火堆旁會議，過半票數處決，沒過半維持原議
  AFTERNOON = 'AFTERNOON',   // 下午：工作時間，村民採集小麥、狼人吃肉與搗亂
  DUSK = 'DUSK',             // 黃昏：秘密書信時段，可選一人發送私信密謀
  NIGHT = 'NIGHT',           // 夜晚：自由時間，狼人可變身為狼獵殺，村民在小屋避難
  GAME_OVER = 'GAME_OVER'    // 遊戲結算
}

/** 秘密書信 */
export interface LetterMessage {
  fromId: PlayerId;
  fromName: string;
  toId: PlayerId;
  content: string;
  timestamp: number;
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
  sanity: number;            // 0 - 100 心智值
  skillCooldownRemaining: number;
  hasShield: boolean;        // 護盾狀態
  isTransformed: boolean;    // 是否變身為兇猛巨狼 (夜晚專屬)
  wheatCount: number;        // 當前採集小麥數量
  meatCount: number;         // 當前進食肉類數量
  assignedCottageId: string; // 被分配的專屬小屋 ID
  insideCottageId: string | null; // 當前正處於哪間小屋內部 (null 為室外)
  unreadLetters: LetterMessage[]; // 黃昏收到的未讀秘密書信
  color: string;             // 識別色
}

/** 投票紀錄 */
export interface VoteRecord {
  voterId: PlayerId;
  targetId: PlayerId | 'SKIP' | null;
}

/** 全域遊戲狀態快照 */
export interface GameStateSnapshot {
  tick: number;
  dayCount: number;          // 當前第幾天
  phase: GamePhase;
  phaseRemainingTime: number;// 當前時段剩餘秒數
  villageWheatTotal: number; // 村莊總累計收穫小麥 (達標村莊獲勝)
  targetWheatGoal: number;   // 獲勝目標小麥量 (例如 30 綑)
  players: Record<PlayerId, PlayerState>;
  hostId: PlayerId;
  winnerFaction: Faction | null;
  winReason?: string;
  meetingCallerId?: PlayerId;
  meetingReason?: string;
  lastExecutedPlayerId?: PlayerId | null; // 早晨被處決者
}
