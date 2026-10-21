/**
 * @file roles.ts
 * @description 狼人村莊 6 人角色體系與技能邏輯（村民割麥、狼人夜晚變身暗殺、白天破壞）
 */

import { PlayerState, RoleDefinition, RoleType } from './types';

export const ROLE_DEFINITIONS: Record<RoleType, RoleDefinition> = {
  [RoleType.VILLAGER]: {
    type: RoleType.VILLAGER,
    name: '村民 (Villager)',
    faction: 'VILLAGE',
    description: '村莊勞動中堅，下午可奮力農作割麥，維繫全村繁榮。',
    skillName: '奮力農作 (Double Reap)',
    skillCooldown: 20
  },
  [RoleType.WEREWOLF]: {
    type: RoleType.WEREWOLF,
    name: '狼人 (Werewolf)',
    faction: 'WEREWOLF',
    description: '白天偽裝成好人吃肉破壞麥田；夜晚可自由變身為兇猛黑狼獵殺村民！',
    skillName: '月夜變身 / 撕裂 (Beast Hunt)',
    skillCooldown: 25
  },
  [RoleType.DOCTOR]: {
    type: RoleType.DOCTOR,
    name: '藥劑師 (Doctor)',
    faction: 'VILLAGE',
    description: '配製守護草藥，為村民施加庇護之盾，抵禦狼人夜襲。',
    skillName: '庇護聖光 (Aegis Herb)',
    skillCooldown: 35
  },
  [RoleType.HUNTER]: {
    type: RoleType.HUNTER,
    name: '老獵人 (Hunter)',
    faction: 'VILLAGE',
    description: '隨身配備獵槍，若在早晨火堆被處決，可開槍反擊帶走一人。',
    skillName: '警惕裝填 (Quick Draw)',
    skillCooldown: 30
  },
  [RoleType.SEER]: {
    type: RoleType.SEER,
    name: '占卜師 (Seer)',
    faction: 'VILLAGE',
    description: '通曉星象，黃昏傳信時可洞察目標的真實陣營底細。',
    skillName: '真知洞察 (True Sight)',
    skillCooldown: 25
  },
  [RoleType.TRICKSTER]: {
    type: RoleType.TRICKSTER,
    name: '混亂狂徒 (Trickster)',
    faction: 'NEUTRAL',
    description: '非對稱勝利：若成功引導眾人在早晨火堆中將自己過半票決淘汰，即刻奪勝！',
    skillName: '顛倒是非 (Confusion)',
    skillCooldown: 20
  }
};

/**
 * 狼人執行暗殺攻擊 (夜晚或變身狀態)
 */
export function executeWerewolfKill(
  wolf: PlayerState,
  victim: PlayerState,
  maxKillDist: number = 60
): { success: boolean; message: string; updatedWolf: PlayerState; updatedVictim: PlayerState } {
  if (wolf.role !== RoleType.WEREWOLF) {
    return {
      success: false,
      message: '只有狼人可以發動獵殺！',
      updatedWolf: wolf,
      updatedVictim: victim
    };
  }

  if (!wolf.isAlive || !victim.isAlive) {
    return {
      success: false,
      message: '雙方皆需處於存活狀態',
      updatedWolf: wolf,
      updatedVictim: victim
    };
  }

  if (victim.role === RoleType.WEREWOLF) {
    return {
      success: false,
      message: '無法傷害狼人同伴',
      updatedWolf: wolf,
      updatedVictim: victim
    };
  }

  const dx = wolf.x - victim.x;
  const dy = wolf.y - victim.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > maxKillDist) {
    return {
      success: false,
      message: '目標距離過遠，無法撲殺',
      updatedWolf: wolf,
      updatedVictim: victim
    };
  }

  // 檢查受害者是否有藥劑師護盾
  if (victim.hasShield) {
    const protectedVictim: PlayerState = {
      ...victim,
      hasShield: false
    };
    const stunnedWolf: PlayerState = {
      ...wolf,
      skillCooldownRemaining: 15
    };
    return {
      success: false,
      message: `${victim.name} 身上的庇護草藥破碎，擋下了致命獠牙！`,
      updatedWolf: stunnedWolf,
      updatedVictim: protectedVictim
    };
  }

  // 處決成功
  const deadVictim: PlayerState = {
    ...victim,
    isAlive: false
  };

  const refreshedWolf: PlayerState = {
    ...wolf,
    skillCooldownRemaining: 25
  };

  return {
    success: true,
    message: `${wolf.name} 於黑夜中殘酷撕咬了 ${victim.name}！`,
    updatedWolf: refreshedWolf,
    updatedVictim: deadVictim
  };
}
