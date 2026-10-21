/**
 * @file main.ts
 * @description 前端啟動入口：驅動 2D 畫布、輸入監聽與 HUD 即時反應
 */

import { GameEngine } from './core/engine';
import { GamePhase, PlayerState, RoleType } from './core/types';
import { InputController } from './input/input-controller';
import { CanvasRenderer } from './render/canvas-view';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas);
const input = new InputController(canvas);

// 初始化單機/Host 權威引擎
const LOCAL_PLAYER_ID = 'local-p1';
const engine = new GameEngine(LOCAL_PLAYER_ID);

// 建立 6 名初始模擬玩家進行視圖走動驗證
const mockPlayers: PlayerState[] = [
  {
    id: LOCAL_PLAYER_ID,
    name: '偵探-亞歷山大',
    role: RoleType.DETECTIVE,
    faction: 'ALIGNED',
    isAlive: true,
    x: 600,
    y: 500,
    rotation: 0,
    speed: 160,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#38bdf8'
  },
  {
    id: 'bot-2',
    name: '醫師-艾蓮娜',
    role: RoleType.DOCTOR,
    faction: 'ALIGNED',
    isAlive: true,
    x: 640,
    y: 350,
    rotation: 0,
    speed: 150,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: true,
    isStealthed: false,
    color: '#10b981'
  },
  {
    id: 'bot-3',
    name: '封印師-萊昂',
    role: RoleType.SEALER,
    faction: 'ALIGNED',
    isAlive: true,
    x: 200,
    y: 180,
    rotation: 0,
    speed: 150,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#a855f7'
  },
  {
    id: 'bot-4',
    name: '學者-諾亞',
    role: RoleType.SCHOLAR,
    faction: 'ALIGNED',
    isAlive: true,
    x: 1000,
    y: 180,
    rotation: 0,
    speed: 150,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#f59e0b'
  },
  {
    id: 'bot-5',
    name: '幽影-卡爾',
    role: RoleType.STALKER,
    faction: 'SHADOW',
    isAlive: true,
    x: 1000,
    y: 720,
    rotation: 0,
    speed: 175,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#ef4444'
  },
  {
    id: 'bot-6',
    name: '狂徒-洛基',
    role: RoleType.TRICKSTER,
    faction: 'NEUTRAL',
    isAlive: true,
    x: 200,
    y: 720,
    rotation: 0,
    speed: 155,
    sanity: 100,
    skillCooldownRemaining: 0,
    hasShield: false,
    isStealthed: false,
    color: '#ec4899'
  }
];

// 註冊玩家並開啟遊戲
for (const p of mockPlayers) {
  engine.fsm.addPlayer(p);
}
engine.fsm.startGame({
  [LOCAL_PLAYER_ID]: RoleType.DETECTIVE,
  'bot-2': RoleType.DOCTOR,
  'bot-3': RoleType.SEALER,
  'bot-4': RoleType.SCHOLAR,
  'bot-5': RoleType.STALKER,
  'bot-6': RoleType.TRICKSTER
});

// UI 元件參照
const hudRole = document.getElementById('hud-role')!;
const hudRitual = document.getElementById('hud-ritual')!;
const hudTimer = document.getElementById('hud-timer')!;
const meetingModal = document.getElementById('meeting-modal')!;
const votingTimer = document.getElementById('voting-timer')!;
const voteOptions = document.getElementById('vote-options')!;
const btnSkill = document.getElementById('btn-skill')!;
const btnEmergency = document.getElementById('btn-emergency')!;
const btnSkipVote = document.getElementById('btn-skip-vote')!;

// 綁定主動技能按鈕
input.registerSkillHandler(() => {
  const res = engine.handleSkillCast(LOCAL_PLAYER_ID);
  console.log(`[技能] ${res.message}`);
});
btnSkill.addEventListener('click', () => {
  const res = engine.handleSkillCast(LOCAL_PLAYER_ID);
  console.log(`[技能] ${res.message}`);
});

// 綁定敲響警鐘按鈕
input.registerInteractHandler(() => {
  const res = engine.handleTriggerEmergency(LOCAL_PLAYER_ID);
  console.log(`[警鐘] ${res.message}`);
});
btnEmergency.addEventListener('click', () => {
  const res = engine.handleTriggerEmergency(LOCAL_PLAYER_ID);
  console.log(`[警鐘] ${res.message}`);
});

btnSkipVote.addEventListener('click', () => {
  engine.fsm.castVote(LOCAL_PLAYER_ID, 'SKIP');
});

// 投票面板產生函式
function updateMeetingUI(snapshot: ReturnType<typeof engine.fsm.getSnapshot>) {
  if (snapshot.phase === GamePhase.MEETING_CALLED || snapshot.phase === GamePhase.VOTING) {
    meetingModal.style.display = 'flex';
    votingTimer.innerText = `剩餘 ${Math.ceil(snapshot.phaseRemainingTime)}s`;

    if (snapshot.phase === GamePhase.VOTING && voteOptions.children.length === 0) {
      for (const id in snapshot.players) {
        const p = snapshot.players[id];
        if (!p.isAlive) continue;
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.innerText = `投給: ${p.name}`;
        btn.onclick = () => {
          engine.fsm.castVote(LOCAL_PLAYER_ID, p.id);
          btn.style.borderColor = '#38bdf8';
        };
        voteOptions.appendChild(btn);
      }
    }
  } else {
    meetingModal.style.display = 'none';
    voteOptions.innerHTML = '';
  }
}

// 主渲染迴圈
let lastTime = performance.now();
function gameLoop(now: number) {
  const deltaSec = (now - lastTime) / 1000;
  lastTime = now;

  // 1. 取得本機輸入並更新本機玩家座標
  const snapshot = engine.fsm.getSnapshot();
  const localPlayer = snapshot.players[LOCAL_PLAYER_ID];
  if (localPlayer) {
    const { dx, dy, rotation } = input.getMovement(localPlayer.x, localPlayer.y);
    engine.handlePlayerMove(LOCAL_PLAYER_ID, dx, dy, rotation, deltaSec);
  }

  // 2. 推進遊戲引擎 Tick
  const updatedSnapshot = engine.update(deltaSec);

  // 3. 更新 HUD
  hudRole.innerText = `${localPlayer?.name || '未知'} [${localPlayer?.role}]`;
  hudRitual.innerText = `${updatedSnapshot.ritualProgress.toFixed(1)}%`;
  hudTimer.innerText = `${Math.ceil(updatedSnapshot.phaseRemainingTime)}s`;

  updateMeetingUI(updatedSnapshot);

  // 4. 繪製 2D 畫面
  renderer.render(updatedSnapshot, engine.map, LOCAL_PLAYER_ID);

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
