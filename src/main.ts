/**
 * @file main.ts
 * @description 前端啟動入口：支援 P2P 開房/加入、單機沙盒、2D 畫布與 HUD 即時反應
 */

import { DEFAULT_MAP } from './core/map-data';
import { GamePhase, GameStateSnapshot, PlayerState, RoleType } from './core/types';
import { InputController } from './input/input-controller';
import { P2PClient } from './net/p2p-client';
import { P2PHost } from './net/p2p-host';
import { generateRoomCode } from './net/peer-manager';
import { CanvasRenderer } from './render/canvas-view';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const renderer = new CanvasRenderer(canvas);
const input = new InputController(canvas);

// DOM 元素參照
const lobbyModal = document.getElementById('lobby-modal')!;
const inputNickname = document.getElementById('input-nickname') as HTMLInputElement;
const inputRoomCode = document.getElementById('input-roomcode') as HTMLInputElement;
const btnCreateRoom = document.getElementById('btn-create-room')!;
const btnJoinRoom = document.getElementById('btn-join-room')!;
const btnSoloSandbox = document.getElementById('btn-solo-sandbox')!;
const hostRoomPanel = document.getElementById('host-room-panel')!;
const clientWaitingPanel = document.getElementById('client-waiting-panel')!;
const displayRoomCode = document.getElementById('display-room-code')!;
const btnCopyCode = document.getElementById('btn-copy-code')!;
const playerStatusList = document.getElementById('player-status-list')!;
const btnStartGame = document.getElementById('btn-start-game')!;
const mainActions = document.getElementById('main-actions')!;
const joinSection = document.getElementById('join-section')!;

const hudRole = document.getElementById('hud-role')!;
const hudRitual = document.getElementById('hud-ritual')!;
const hudTimer = document.getElementById('hud-timer')!;
const meetingModal = document.getElementById('meeting-modal')!;
const votingTimer = document.getElementById('voting-timer')!;
const voteOptions = document.getElementById('vote-options')!;
const btnSkill = document.getElementById('btn-skill')!;
const btnEmergency = document.getElementById('btn-emergency')!;
const btnSkipVote = document.getElementById('btn-skip-vote')!;

// 連線狀態變數
type GameMode = 'NONE' | 'HOST' | 'CLIENT' | 'SOLO';
let currentMode: GameMode = 'NONE';
let hostInstance: P2PHost | null = null;
let clientInstance: P2PClient | null = null;
let localPlayerId: string = '';
let latestSnapshot: GameStateSnapshot | null = null;

// ==========================================
// 1. 建立房間 (Host 流程)
// ==========================================
btnCreateRoom.addEventListener('click', async () => {
  const name = inputNickname.value.trim() || '房主';
  const code = generateRoomCode();
  currentMode = 'HOST';
  localPlayerId = 'host-' + code;

  btnCreateRoom.setAttribute('disabled', 'true');
  btnCreateRoom.innerText = '建立連線中...';

  try {
    hostInstance = new P2PHost(code, name);
    await hostInstance.start((count) => {
      playerStatusList.innerHTML = `已連入成員: <strong>${count} / 6</strong> 名玩家<br/>`;
      const players = hostInstance!.engine.fsm.getSnapshot().players;
      for (const id in players) {
        playerStatusList.innerHTML += `• ${players[id].name} ${id === localPlayerId ? '(房主/你)' : ''}<br/>`;
      }
    });

    displayRoomCode.innerText = code;
    mainActions.style.display = 'none';
    joinSection.style.display = 'none';
    hostRoomPanel.style.display = 'block';
    playerStatusList.innerHTML = `已連入成員: <strong>1 / 6</strong><br/>• ${name} (房主/你)<br/>`;
  } catch (err) {
    alert('房主建立房間失敗，請重試: ' + err);
    btnCreateRoom.removeAttribute('disabled');
    btnCreateRoom.innerText = '🏠 建立房間 (Host)';
  }
});

btnCopyCode.addEventListener('click', () => {
  const code = displayRoomCode.innerText;
  navigator.clipboard.writeText(code).then(() => {
    btnCopyCode.innerText = '✅ 已複製代碼！';
    setTimeout(() => {
      btnCopyCode.innerText = '📋 複製房間代碼';
    }, 2000);
  });
});

btnStartGame.addEventListener('click', () => {
  if (!hostInstance) return;
  const started = hostInstance.startGame();
  if (started) {
    lobbyModal.style.display = 'none';
  } else {
    alert('需要至少 2 名以上玩家或點擊下方單機沙盒測試！');
  }
});

// ==========================================
// 2. 加入房間 (Client 流程)
// ==========================================
btnJoinRoom.addEventListener('click', async () => {
  const name = inputNickname.value.trim() || '訪客';
  const code = inputRoomCode.value.trim().toUpperCase();

  if (!code) {
    alert('請輸入 6 位數房間代碼 (例如: WW-XXXX)');
    return;
  }

  currentMode = 'CLIENT';
  btnJoinRoom.setAttribute('disabled', 'true');
  btnJoinRoom.innerText = '連線加入中...';

  clientInstance = new P2PClient(code, name, {
    onConnected: () => {
      console.log('[Main] 已建立 Peer 管道');
    },
    onJoined: (_role, _hostId) => {
      localPlayerId = clientInstance!.playerId;
      mainActions.style.display = 'none';
      joinSection.style.display = 'none';
      clientWaitingPanel.style.display = 'block';
    },
    onStateSync: (snapshot) => {
      latestSnapshot = snapshot;
      if (snapshot.phase !== GamePhase.LOBBY && lobbyModal.style.display !== 'none') {
        lobbyModal.style.display = 'none';
      }
    },
    onError: (err) => {
      alert('連線失敗: ' + err.message);
      btnJoinRoom.removeAttribute('disabled');
      btnJoinRoom.innerText = '🔗 連線加入 (Join)';
    }
  });

  try {
    await clientInstance.connect();
  } catch (err) {
    alert('無法連線到該房間: ' + err);
    btnJoinRoom.removeAttribute('disabled');
    btnJoinRoom.innerText = '🔗 連線加入 (Join)';
  }
});

// ==========================================
// 3. 單機沙盒模式 (Solo Sandbox)
// ==========================================
btnSoloSandbox.addEventListener('click', () => {
  currentMode = 'SOLO';
  const soloCode = 'SOLO-DEBUG';
  localPlayerId = 'host-' + soloCode;
  hostInstance = new P2PHost(soloCode, inputNickname.value.trim() || '研究員');

  // 加入 5 名沙盒機器人
  const mockRoles = [RoleType.DOCTOR, RoleType.SEALER, RoleType.SCHOLAR, RoleType.STALKER, RoleType.TRICKSTER];
  const mockNames = ['醫師-艾蓮娜', '封印師-萊昂', '學者-諾亞', '幽影-卡爾', '狂徒-洛基'];

  for (let i = 0; i < 5; i++) {
    const botId = `bot-${i + 1}`;
    const p: PlayerState = {
      id: botId,
      name: mockNames[i],
      role: mockRoles[i],
      faction: mockRoles[i] === RoleType.STALKER ? 'SHADOW' : mockRoles[i] === RoleType.TRICKSTER ? 'NEUTRAL' : 'ALIGNED',
      isAlive: true,
      x: 200 + i * 180,
      y: 200 + (i % 2 === 0 ? 100 : 350),
      rotation: 0,
      speed: 150,
      sanity: 100,
      skillCooldownRemaining: 0,
      hasShield: i === 0,
      isStealthed: false,
      color: '#cbd5e1'
    };
    hostInstance.engine.fsm.addPlayer(p);
  }

  hostInstance.startGame();
  lobbyModal.style.display = 'none';
});

// ==========================================
// 4. 輸入與按鈕交互綁定
// ==========================================
input.registerSkillHandler(() => {
  triggerSkillAction();
});
btnSkill.addEventListener('click', () => {
  triggerSkillAction();
});

function triggerSkillAction() {
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    hostInstance?.engine.handleSkillCast(localPlayerId);
  } else if (currentMode === 'CLIENT') {
    clientInstance?.sendInput(0, 0, 0, 'SKILL');
  }
}

input.registerInteractHandler(() => {
  triggerEmergencyAction();
});
btnEmergency.addEventListener('click', () => {
  triggerEmergencyAction();
});

function triggerEmergencyAction() {
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    const res = hostInstance?.engine.handleTriggerEmergency(localPlayerId);
    console.log(`[警鐘] ${res?.message}`);
  } else if (currentMode === 'CLIENT') {
    clientInstance?.triggerEmergency();
  }
}

btnSkipVote.addEventListener('click', () => {
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    hostInstance?.engine.fsm.castVote(localPlayerId, 'SKIP');
  } else if (currentMode === 'CLIENT') {
    clientInstance?.castVote('SKIP');
  }
});

// ==========================================
// 5. 會議 UI 更新
// ==========================================
function updateMeetingUI(snapshot: GameStateSnapshot) {
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
          if (currentMode === 'HOST' || currentMode === 'SOLO') {
            hostInstance?.engine.fsm.castVote(localPlayerId, p.id);
          } else if (currentMode === 'CLIENT') {
            clientInstance?.castVote(p.id);
          }
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

// ==========================================
// 6. 主渲染與主循環
// ==========================================
let lastTime = performance.now();

function gameLoop(now: number) {
  const deltaSec = (now - lastTime) / 1000;
  lastTime = now;

  let activeSnapshot: GameStateSnapshot | null = null;

  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    if (hostInstance) {
      const snap = hostInstance.engine.fsm.getSnapshot();
      const me = snap.players[localPlayerId];
      if (me && snap.phase === GamePhase.FREE_ROAM) {
        const { dx, dy, rotation } = input.getMovement(me.x, me.y);
        hostInstance.engine.handlePlayerMove(localPlayerId, dx, dy, rotation, deltaSec);
      }
      activeSnapshot = hostInstance.engine.update(deltaSec);
    }
  } else if (currentMode === 'CLIENT') {
    activeSnapshot = latestSnapshot;
    if (activeSnapshot && clientInstance) {
      const me = activeSnapshot.players[localPlayerId];
      if (me && activeSnapshot.phase === GamePhase.FREE_ROAM) {
        const { dx, dy, rotation } = input.getMovement(me.x, me.y);
        clientInstance.sendInput(dx, dy, rotation);
      }
    }
  }

  // 畫面渲染與 HUD 更新
  if (activeSnapshot) {
    const me = activeSnapshot.players[localPlayerId];
    hudRole.innerText = me ? `${me.name} [${me.role}]` : '旁觀中';
    hudRitual.innerText = `${activeSnapshot.ritualProgress.toFixed(1)}%`;
    hudTimer.innerText = `${Math.ceil(activeSnapshot.phaseRemainingTime)}s`;

    updateMeetingUI(activeSnapshot);
    renderer.render(activeSnapshot, DEFAULT_MAP, localPlayerId);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
