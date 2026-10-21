/**
 * @file test-runner.ts
 * @description 狼人村莊核心狀態機與四時段循環自動化驗證腳本
 */

import { GameEngine } from './engine';
import { GamePhase, PlayerState, RoleType } from './types';

function createMockPlayer(id: string, name: string, role: RoleType, x: number, y: number): PlayerState {
  return {
    id,
    name,
    role,
    faction: role === RoleType.WEREWOLF ? 'WEREWOLF' : role === RoleType.TRICKSTER ? 'NEUTRAL' : 'VILLAGE',
    isAlive: true,
    x,
    y,
    rotation: 0,
    speed: 160,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isTransformed: false,
    wheatCount: 0,
    meatCount: 0,
    assignedCottageId: 'cottage-1',
    insideCottageId: null,
    unreadLetters: [],
    color: '#ffffff'
  };
}

function runTests() {
  console.log('=== [開始執行 狼人村莊 核心邏輯與四時段循環驗證] ===\n');

  const engine = new GameEngine('host-p1');

  // 1. 註冊 6 名村莊角色
  const p1 = createMockPlayer('p1', '農夫-亞歷山大', RoleType.VILLAGER, 100, 350); // 位於麥田
  const p2 = createMockPlayer('p2', '藥劑師-艾蓮娜', RoleType.DOCTOR, 650, 500);
  const p3 = createMockPlayer('p3', '老獵人-萊昂', RoleType.HUNTER, 700, 500);
  const p4 = createMockPlayer('p4', '占卜師-諾亞', RoleType.SEER, 750, 500);
  const p5 = createMockPlayer('p5', '狼人-卡爾', RoleType.WEREWOLF, 1200, 380); // 位於肉架
  const p6 = createMockPlayer('p6', '狂徒-洛基', RoleType.TRICKSTER, 800, 500);

  [p1, p2, p3, p4, p5, p6].forEach(p => engine.fsm.addPlayer(p));
  console.log('✅ 1. 成功註冊 6 名村民至村莊大廳。');

  // 2. 啟動遊戲 (進入下午工作時段)
  const startSuccess = engine.fsm.startGame({
    p1: RoleType.VILLAGER,
    p2: RoleType.DOCTOR,
    p3: RoleType.HUNTER,
    p4: RoleType.SEER,
    p5: RoleType.WEREWOLF,
    p6: RoleType.TRICKSTER
  });
  if (!startSuccess) throw new Error('村莊啟動失敗');
  console.log('✅ 2. 村莊順利開啟，進入下午工作時段 (AFTERNOON)。');

  // 3. 村民在麥田收割小麥
  const harvestRes = engine.handleInteract('p1');
  console.log(`✅ 3. 村民割麥結果: ${harvestRes.message}`);
  const snapAfterHarvest = engine.fsm.getSnapshot();
  if (snapAfterHarvest.villageWheatTotal !== 1) throw new Error('村莊小麥累積失敗！');

  // 4. 狼人在肉架撕咬進食鮮肉
  const meatRes = engine.handleInteract('p5');
  console.log(`✅ 4. 狼人吃肉結果: ${meatRes.message}`);
  const snapAfterMeat = engine.fsm.getSnapshot();
  if (snapAfterMeat.players['p5'].meatCount !== 1) throw new Error('狼人鮮肉進食失敗！');

  // 5. 推進至黃昏時段 (DUSK)，進行秘密傳信
  engine.fsm.step(61);
  const snapDusk = engine.fsm.getSnapshot();
  if (snapDusk.phase !== GamePhase.DUSK) throw new Error('未切換至黃昏傳信時段！');
  engine.fsm.sendDuskLetter('p4', 'p2', '艾蓮娜，我是占卜師，今晚請務必為自己套盾！');
  const snapAfterLetter = engine.fsm.getSnapshot();
  if (snapAfterLetter.players['p2'].unreadLetters.length !== 1) throw new Error('秘密書信傳遞失敗！');
  console.log('✅ 5. 黃昏秘密傳信成功送達！');

  // 6. 推進至黑夜時段 (NIGHT)，狼人變身與獵殺
  engine.fsm.step(26);
  const snapNight = engine.fsm.getSnapshot();
  if (snapNight.phase !== GamePhase.NIGHT) throw new Error('未切換至黑夜時段！');

  // 藥劑師為自己套盾
  engine.handleSkillCast('p2');

  // 狼人變身狂暴巨狼
  const transformRes = engine.handleSkillCast('p5');
  console.log(`✅ 6. 狼人夜間變身結果: ${transformRes.message}`);

  // 將狼人移至藥劑師身邊並襲擊
  snapNight.players['p5'].x = snapNight.players['p2'].x + 20;
  snapNight.players['p5'].y = snapNight.players['p2'].y;
  engine.fsm.updatePlayer(snapNight.players['p5']);

  const attack1 = engine.handleWerewolfAttack('p5', 'p2');
  console.log(`✅ 7. 狼人襲擊藥劑師 (有聖光護盾): ${attack1.message}`);
  if (!engine.fsm.getSnapshot().players['p2'].isAlive) throw new Error('護盾未成功抵擋夜襲！');

  // 7. 推進至次日早晨 (MORNING)，火堆票人會議
  engine.fsm.step(46);
  const snapMorning = engine.fsm.getSnapshot();
  if (snapMorning.phase !== GamePhase.MORNING) throw new Error('未迎接次日早晨火堆會議！');
  console.log(`✅ 8. 迎來第 ${snapMorning.dayCount} 天早晨，全員圍坐中央火堆進行審判會議！`);

  // 8. 眾人投票狂徒 p6 (全員 6 票過半數)
  engine.fsm.castVote('p1', 'p6');
  engine.fsm.castVote('p2', 'p6');
  engine.fsm.castVote('p3', 'p6');
  engine.fsm.castVote('p4', 'p6');
  engine.fsm.castVote('p5', 'p6');
  engine.fsm.castVote('p6', 'p6');

  const snapGameOver = engine.fsm.getSnapshot();
  console.log(`✅ 9. 火堆會議結算結果: ${snapGameOver.phase}, 獲勝方: ${snapGameOver.winnerFaction}`);
  console.log(`    獲勝宣言: "${snapGameOver.winReason}"`);

  if (snapGameOver.winnerFaction !== 'NEUTRAL') {
    throw new Error('狂徒過半數投票非對稱勝利驗證失敗！');
  }

  console.log('\n🎉 狼人村莊小麥農作、肉架、四時段與火堆過半票人邏輯 100% 驗證通過！');
}

runTests();
