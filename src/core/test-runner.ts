/**
 * @file test-runner.ts
 * @description 核心狀態機與非對稱角色技能自動化驗證腳本（Node 24 原生 TS 執行，零測試套件贅肉）
 */

import { GameEngine } from './engine';
import { PlayerState, RoleType } from './types';

function createMockPlayer(id: string, name: string, role: RoleType, x: number, y: number): PlayerState {
  return {
    id,
    name,
    role,
    faction: role === RoleType.STALKER ? 'SHADOW' : role === RoleType.TRICKSTER ? 'NEUTRAL' : 'ALIGNED',
    isAlive: true,
    x,
    y,
    rotation: 0,
    speed: 120,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#ffffff'
  };
}

function runTests() {
  console.log('=== [開始執行 幽影微語 核心邏輯與非對稱角色驗證] ===\n');

  const engine = new GameEngine('host-p1');

  // 1. 註冊 6 名角色
  const p1 = createMockPlayer('p1', '偵探-亞歷山大', RoleType.DETECTIVE, 550, 400);
  const p2 = createMockPlayer('p2', '醫師-艾蓮娜', RoleType.DOCTOR, 560, 400);
  const p3 = createMockPlayer('p3', '封印師-萊昂', RoleType.SEALER, 200, 200);
  const p4 = createMockPlayer('p4', '學者-諾亞', RoleType.SCHOLAR, 570, 400);
  const p5 = createMockPlayer('p5', '幽影-卡爾', RoleType.STALKER, 580, 400);
  const p6 = createMockPlayer('p6', '狂徒-洛基', RoleType.TRICKSTER, 800, 500);

  [p1, p2, p3, p4, p5, p6].forEach(p => engine.fsm.addPlayer(p));
  console.log('✅ 1. 成功註冊 6 名玩家至大廳。');

  // 2. 啟動遊戲
  const startSuccess = engine.fsm.startGame({
    p1: RoleType.DETECTIVE,
    p2: RoleType.DOCTOR,
    p3: RoleType.SEALER,
    p4: RoleType.SCHOLAR,
    p5: RoleType.STALKER,
    p6: RoleType.TRICKSTER
  });
  if (!startSuccess) throw new Error('遊戲啟動失敗');
  console.log('✅ 2. 遊戲順利啟動，進入自由探索階段 (FREE_ROAM)。');

  // 3. 醫師給學者上庇護之盾
  const shieldRes = engine.handleSkillCast('p2', 'p4');
  console.log(`✅ 3. 醫師施法結果: ${shieldRes.message}`);
  const snapAfterShield = engine.fsm.getSnapshot();
  if (!snapAfterShield.players['p4'].hasShield) throw new Error('護盾施加失敗！');

  // 4. 幽影試圖刺殺學者 (檢驗破盾保護機制)
  const killAttempt1 = engine.handleShadowAttack('p5', 'p4');
  console.log(`✅ 4. 幽影初次背刺 (目標有盾): ${killAttempt1.message}`);
  const snapAfterKill1 = engine.fsm.getSnapshot();
  if (!snapAfterKill1.players['p4'].isAlive) throw new Error('護盾未成功抵擋致死傷害！');
  if (snapAfterKill1.players['p4'].hasShield) throw new Error('護盾未破碎！');

  // 5. 幽影再次背刺學者 (護盾已破，應擊殺)
  const killAttempt2 = engine.handleShadowAttack('p5', 'p4');
  console.log(`✅ 5. 幽影二次背刺: ${killAttempt2.message}`);
  const snapAfterKill2 = engine.fsm.getSnapshot();
  if (snapAfterKill2.players['p4'].isAlive) throw new Error('受害者未被淘汰！');

  // 6. 中央圓桌敲響警鐘召開會議
  const meetingRes = engine.handleTriggerEmergency('p1');
  console.log(`✅ 6. 偵探敲響警鐘結果: ${meetingRes.message}`);
  const snapMeeting = engine.fsm.getSnapshot();
  if (snapMeeting.phase !== 'MEETING_CALLED') throw new Error('未成功切換至會議階段！');

  // 7. 推進倒數，切換至投票階段
  engine.fsm.step(46); // 超過 45 秒發言時間
  const snapVoting = engine.fsm.getSnapshot();
  if (snapVoting.phase !== 'VOTING') throw new Error('未切換至投票階段！');
  console.log('✅ 7. 成功過渡至圓桌投票階段 (VOTING)。');

  // 8. 測試狂徒 (Trickster) 非對稱勝利：眾人全數投給狂徒 p6
  engine.fsm.castVote('p1', 'p6');
  engine.fsm.castVote('p2', 'p6');
  engine.fsm.castVote('p3', 'p6');
  engine.fsm.castVote('p5', 'p6');
  engine.fsm.castVote('p6', 'p6');

  const snapGameOver = engine.fsm.getSnapshot();
  console.log(`✅ 8. 投票結算遊戲狀態: ${snapGameOver.phase}, 獲勝方: ${snapGameOver.winnerFaction}`);
  console.log(`    獲勝宣言: "${snapGameOver.winReason}"`);

  if (snapGameOver.winnerFaction !== 'NEUTRAL') {
    throw new Error('狂徒非對稱勝利判定失敗！');
  }

  console.log('\n🎉 所有核心狀態機與非對稱角色演算法驗證 100% 通過！');
}

runTests();
