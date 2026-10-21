/**
 * @file roles.ts
 * @description 6 人微創新非對稱角色體系與技能規則集（純函數式、無依賴、零副作用）
 */

import { PlayerId, PlayerState, RoleDefinition, RoleType } from './types';

/** 6 人非對稱角色規格清單 */
export const ROLE_DEFINITIONS: Record<RoleType, RoleDefinition> = {
  [RoleType.DETECTIVE]: {
    type: RoleType.DETECTIVE,
    name: '偵探 (Detective)',
    faction: 'ALIGNED',
    description: '可感知附近的移動足跡與異常殘留，洞察幽影動向。',
    skillName: '靈魂追跡 (Soul Trace)',
    skillCooldown: 25
  },
  [RoleType.DOCTOR]: {
    type: RoleType.DOCTOR,
    name: '醫師 (Doctor)',
    faction: 'ALIGNED',
    description: '為同伴施加守護結界，使其免疫下一次致命攻擊。',
    skillName: '庇護聖光 (Aegis Ward)',
    skillCooldown: 40
  },
  [RoleType.SEALER]: {
    type: RoleType.SEALER,
    name: '封印師 (Sealer)',
    faction: 'ALIGNED',
    description: '在地面設置隱形符文陣，幽影穿過時會向全員發送心靈共振警報。',
    skillName: '警戒符印 (Alarm Ward)',
    skillCooldown: 35
  },
  [RoleType.SCHOLAR]: {
    type: RoleType.SCHOLAR,
    name: '學者 (Scholar)',
    faction: 'ALIGNED',
    description: '專注解讀古代封印儀式，大幅提升祭壇修復速率。',
    skillName: '真知加速 (Insight Surge)',
    skillCooldown: 20
  },
  [RoleType.STALKER]: {
    type: RoleType.STALKER,
    name: '幽影潛行者 (Stalker)',
    faction: 'SHADOW',
    description: '可遁入暗影隱形，並能對落單的調查員進行無聲處決。',
    skillName: '幽影匿蹤 (Shadow Veil)',
    skillCooldown: 30
  },
  [RoleType.TRICKSTER]: {
    type: RoleType.TRICKSTER,
    name: '混亂狂徒 (Trickster)',
    faction: 'NEUTRAL',
    description: '中立非對稱勝利：若成功引導眾人在圓桌會議中將自己投票處決，立即單獨獲勝！',
    skillName: '幻覺低語 (Chaos Mirage)',
    skillCooldown: 20
  }
};

/** 技能觸發結果 */
export interface SkillResult {
  success: boolean;
  message: string;
  updatedPlayer: PlayerState;
  targetPlayer?: PlayerState;
  spawnObject?: {
    type: 'ALARM_WARD' | 'CLUE_PULSE';
    x: number;
    y: number;
    ownerId: PlayerId;
  };
}

/**
 * 執行角色主動技能
 * @param caster 發動者當前狀態
 * @param target 目標玩家狀態（可選）
 */
export function executeRoleSkill(
  caster: PlayerState,
  target?: PlayerState
): SkillResult {
  if (!caster.isAlive) {
    return {
      success: false,
      message: '陣亡玩家無法施放技能',
      updatedPlayer: caster
    };
  }

  if (caster.skillCooldownRemaining > 0) {
    return {
      success: false,
      message: `技能冷卻中，剩餘 ${caster.skillCooldownRemaining.toFixed(1)} 秒`,
      updatedPlayer: caster
    };
  }

  const roleDef = ROLE_DEFINITIONS[caster.role];
  const cooldown = roleDef.skillCooldown;

  switch (caster.role) {
    case RoleType.STALKER: {
      // 幽影遁形：進入 6 秒匿蹤
      const updated: PlayerState = {
        ...caster,
        isStealthed: true,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: '幽影遁形已啟動，身影已融入黑暗。',
        updatedPlayer: updated
      };
    }

    case RoleType.DOCTOR: {
      if (!target || !target.isAlive) {
        return {
          success: false,
          message: '必須選擇一名存活的玩家施加庇護。',
          updatedPlayer: caster
        };
      }
      const updatedTarget: PlayerState = {
        ...target,
        hasShield: true
      };
      const updatedCaster: PlayerState = {
        ...caster,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: `已為 ${target.name} 施加庇護之盾，抵禦一次傷害。`,
        updatedPlayer: updatedCaster,
        targetPlayer: updatedTarget
      };
    }

    case RoleType.SEALER: {
      const updatedCaster: PlayerState = {
        ...caster,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: '已在腳下刻畫警戒符印。',
        updatedPlayer: updatedCaster,
        spawnObject: {
          type: 'ALARM_WARD',
          x: caster.x,
          y: caster.y,
          ownerId: caster.id
        }
      };
    }

    case RoleType.SCHOLAR: {
      const updatedCaster: PlayerState = {
        ...caster,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: '思維進入超頻狀態，破譯效率大幅倍增。',
        updatedPlayer: updatedCaster
      };
    }

    case RoleType.DETECTIVE: {
      const updatedCaster: PlayerState = {
        ...caster,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: '靈魂追跡已觸發，偵測附近殘留能量波動。',
        updatedPlayer: updatedCaster,
        spawnObject: {
          type: 'CLUE_PULSE',
          x: caster.x,
          y: caster.y,
          ownerId: caster.id
        }
      };
    }

    case RoleType.TRICKSTER: {
      const updatedCaster: PlayerState = {
        ...caster,
        skillCooldownRemaining: cooldown
      };
      return {
        success: true,
        message: '散播了混亂低語，擾亂了周遭磁場。',
        updatedPlayer: updatedCaster
      };
    }

    default:
      return {
        success: false,
        message: '未知的角色技能',
        updatedPlayer: caster
      };
  }
}

/**
 * 幽影處決背刺判定
 * @param stalker 刺客
 * @param victim 受害者
 * @param maxKillDistance 處決有效距離 (像素)
 */
export function executeShadowKill(
  stalker: PlayerState,
  victim: PlayerState,
  maxKillDistance: number = 60
): { success: boolean; message: string; updatedStalker: PlayerState; updatedVictim: PlayerState } {
  if (stalker.role !== RoleType.STALKER) {
    return {
      success: false,
      message: '只有幽影潛行者可執行處決。',
      updatedStalker: stalker,
      updatedVictim: victim
    };
  }

  if (!stalker.isAlive || !victim.isAlive) {
    return {
      success: false,
      message: '雙方皆需處於存活狀態。',
      updatedStalker: stalker,
      updatedVictim: victim
    };
  }

  if (victim.role === RoleType.STALKER) {
    return {
      success: false,
      message: '無法傷害幽影同伴。',
      updatedStalker: stalker,
      updatedVictim: victim
    };
  }

  const dx = stalker.x - victim.x;
  const dy = stalker.y - victim.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > maxKillDistance) {
    return {
      success: false,
      message: '距離目標過遠，無法背刺。',
      updatedStalker: stalker,
      updatedVictim: victim
    };
  }

  // 檢查受害者是否有醫師護盾
  if (victim.hasShield) {
    const brokenVictim: PlayerState = {
      ...victim,
      hasShield: false
    };
    const cooledStalker: PlayerState = {
      ...stalker,
      isStealthed: false,
      skillCooldownRemaining: 15 // 破盾給予短暫反噬冷卻
    };
    return {
      success: false,
      message: '目標身上的庇護聖光破碎，抵擋了這次致命打擊！',
      updatedStalker: cooledStalker,
      updatedVictim: brokenVictim
    };
  }

  // 處決成功
  const deadVictim: PlayerState = {
    ...victim,
    isAlive: false
  };

  const revealedStalker: PlayerState = {
    ...stalker,
    isStealthed: false,
    skillCooldownRemaining: 25 // 處決冷卻
  };

  return {
    success: true,
    message: `${stalker.name} 在暗影中處決了 ${victim.name}！`,
    updatedStalker: revealedStalker,
    updatedVictim: deadVictim
  };
}
