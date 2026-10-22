/**
 * @file main.ts
 * @description 狼人村莊前端啟動入口：支援小村莊場景、木屋室內避難、小麥割取、狼人變身、火堆會議與黃昏傳信
 */

import { soundManager } from './audio/audio-manager';
import { VILLAGE_MAP } from './core/map-data';
import { GamePhase, GameStateSnapshot, PlayerState, RoleType } from './core/types';
import { InputController } from './input/input-controller';
import { P2PClient } from './net/p2p-client';
import { P2PHost } from './net/p2p-host';
import { generateRoomCode } from './net/peer-manager';
import { CanvasRenderer } from './render/canvas-view';

const container = document.getElementById('game-container')!;
const renderer = new CanvasRenderer(container);
const input = new InputController(renderer.domElement);

// 音訊點擊首解鎖
const initAudioOnce = () => {
  soundManager.preloadAll();
  window.removeEventListener('click', initAudioOnce);
  window.removeEventListener('keydown', initAudioOnce);
};
window.addEventListener('click', initAudioOnce);
window.addEventListener('keydown', initAudioOnce);

// DOM 元素
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

const hudPhase = document.getElementById('hud-phase')!;
const hudWheat = document.getElementById('hud-wheat')!;
const hudRole = document.getElementById('hud-role')!;
const hudTimer = document.getElementById('hud-timer')!;

const meetingModal = document.getElementById('meeting-modal')!;
const votingTimer = document.getElementById('voting-timer')!;
const voteOptions = document.getElementById('vote-options')!;
const btnSkipVote = document.getElementById('btn-skip-vote')!;

const letterModal = document.getElementById('letter-modal')!;
const letterRecipient = document.getElementById('letter-recipient') as HTMLSelectElement;
const letterContent = document.getElementById('letter-content') as HTMLInputElement;
const btnCloseLetter = document.getElementById('btn-close-letter')!;
const btnSendLetter = document.getElementById('btn-send-letter')!;
const btnLetters = document.getElementById('btn-letters')!;
const tabCompose = document.getElementById('tab-compose')!;
const tabInbox = document.getElementById('tab-inbox')!;
const panelCompose = document.getElementById('panel-compose')!;
const panelInbox = document.getElementById('panel-inbox')!;
const inboxCount = document.getElementById('inbox-count')!;
const letterInboxList = document.getElementById('letter-inbox-list')!;
const btnCloseInbox = document.getElementById('btn-close-inbox')!;

const interactionPrompt = document.getElementById('interaction-prompt')!;
const promptText = document.getElementById('prompt-text')!;
const gameToast = document.getElementById('game-toast')!;

const btnInteract = document.getElementById('btn-interact')!;
const btnSkill = document.getElementById('btn-skill')!;
const btnCameraView = document.getElementById('btn-camera-view')!;

// 提示訊息浮窗 Toast
let toastTimer: number | null = null;
function showToast(message: string, durationMs: number = 2800) {
  if (toastTimer) window.clearTimeout(toastTimer);
  gameToast.innerText = message;
  gameToast.style.display = 'block';
  gameToast.style.opacity = '1';
  toastTimer = window.setTimeout(() => {
    gameToast.style.opacity = '0';
    setTimeout(() => {
      gameToast.style.display = 'none';
    }, 300);
  }, durationMs);
}

// 遊戲狀態模式
type GameMode = 'NONE' | 'HOST' | 'CLIENT' | 'SOLO';
let currentMode: GameMode = 'NONE';
let hostInstance: P2PHost | null = null;
let clientInstance: P2PClient | null = null;
let localPlayerId: string = '';
let latestSnapshot: GameStateSnapshot | null = null;
let lastPhase: GamePhase | null = null;

// ==========================================
// 1. 建立村莊 (Host)
// ==========================================
btnCreateRoom.addEventListener('click', async () => {
  const name = inputNickname.value.trim() || '村長';
  const code = generateRoomCode();
  currentMode = 'HOST';
  localPlayerId = 'host-' + code;

  btnCreateRoom.setAttribute('disabled', 'true');
  btnCreateRoom.innerText = '建立村莊中...';

  try {
    hostInstance = new P2PHost(code, name);
    await hostInstance.start((count) => {
      playerStatusList.innerHTML = `已抵達村民: <strong>${count} / 6</strong> 名<br/>`;
      const players = hostInstance!.engine.fsm.getSnapshot().players;
      for (const id in players) {
        playerStatusList.innerHTML += `• ${players[id].name} ${id === localPlayerId ? '(村長/你)' : ''}<br/>`;
      }
    });

    displayRoomCode.innerText = code;
    mainActions.style.display = 'none';
    joinSection.style.display = 'none';
    hostRoomPanel.style.display = 'block';
    playerStatusList.innerHTML = `已抵達村民: <strong>1 / 6</strong><br/>• ${name} (村長/你)<br/>`;
  } catch (err) {
    alert('建立村莊失敗: ' + err);
    btnCreateRoom.removeAttribute('disabled');
    btnCreateRoom.innerText = '🏠 建立村莊 (Host)';
  }
});

btnCopyCode.addEventListener('click', () => {
  const code = displayRoomCode.innerText;
  navigator.clipboard.writeText(code).then(() => {
    btnCopyCode.innerText = '✅ 已複製村莊代碼！';
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
    showToast('🌾 村莊生活正式開啟！使用 WASD 或方向鍵移動，按 [E] 進行互動！', 4000);
  } else {
    alert('啟動村莊失敗，請重試！');
  }
});

// ==========================================
// 2. 加入村莊 (Client)
// ==========================================
btnJoinRoom.addEventListener('click', async () => {
  const name = inputNickname.value.trim() || '村民';
  const code = inputRoomCode.value.trim().toUpperCase();

  if (!code) {
    alert('請輸入 6 位數房間代碼');
    return;
  }

  currentMode = 'CLIENT';
  btnJoinRoom.setAttribute('disabled', 'true');
  btnJoinRoom.innerText = '前往村莊中...';

  clientInstance = new P2PClient(code, name, {
    onConnected: () => {
      console.log('[Main] 已連線至村莊');
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
    alert('無法連線: ' + err);
    btnJoinRoom.removeAttribute('disabled');
    btnJoinRoom.innerText = '🔗 連線加入 (Join)';
  }
});

// ==========================================
// 3. 單機模擬村莊 (Solo Sandbox)
// ==========================================
btnSoloSandbox.addEventListener('click', () => {
  currentMode = 'SOLO';
  const soloCode = 'VILLAGE-SOLO';
  localPlayerId = 'host-' + soloCode;
  hostInstance = new P2PHost(soloCode, inputNickname.value.trim() || '村莊農夫');

  // 加入 5 名沙盒村民
  const mockRoles = [RoleType.WEREWOLF, RoleType.DOCTOR, RoleType.HUNTER, RoleType.SEER, RoleType.TRICKSTER];
  const mockNames = ['狼人-卡爾', '藥劑師-艾蓮娜', '老獵人-萊昂', '占卜師-諾亞', '狂徒-洛基'];

  for (let i = 0; i < 5; i++) {
    const botId = `bot-${i + 1}`;
    const p: PlayerState = {
      id: botId,
      name: mockNames[i],
      role: mockRoles[i],
      faction: mockRoles[i] === RoleType.WEREWOLF ? 'WEREWOLF' : mockRoles[i] === RoleType.TRICKSTER ? 'NEUTRAL' : 'VILLAGE',
      isAlive: true,
      x: 300 + i * 180,
      y: 350 + (i % 2 === 0 ? 50 : 250),
      rotation: 0,
      speed: 155,
      sanity: 100,
      skillCooldownRemaining: 0,
      hasShield: false,
      isTransformed: false,
      wheatCount: 0,
      meatCount: 0,
      assignedCottageId: `cottage-${i + 2}`,
      insideCottageId: null,
      unreadLetters: [],
      color: '#cbd5e1'
    };
    hostInstance.engine.fsm.addPlayer(p);
  }

  hostInstance.startGame();
  lobbyModal.style.display = 'none';
  showToast('🌾 已進入單機村莊！使用 WASD 或方向鍵移動，按 [E] 進行互動！', 4000);
});

// ==========================================
// 4. 輸入與互動綁定 (割麥 / 吃肉 / 變身 / Among Us 鏡頭縮放切換)
// ==========================================
input.registerCameraToggleHandler((isCloseup) => {
  renderer.isCloseupCamera = isCloseup;
  btnCameraView.innerText = isCloseup ? '🔍 視角: 近景跟隨 [V]' : '🗺️ 視角: 全村俯瞰 [V]';
  showToast(
    isCloseup
      ? '🔍 已切換為【Among Us 近景跟隨視角】！進入木屋自動透視室內，按 [V] 可切換全村俯瞰。'
      : '🗺️ 已切換為【全村戰術俯瞰視角】！按 [V] 可隨時切回近景跟隨。',
    3000
  );
});
btnCameraView.addEventListener('click', () => {
  input.toggleCameraView();
});

input.registerInteractHandler(() => {
  triggerInteractAction();
});
btnInteract.addEventListener('click', () => {
  triggerInteractAction();
});

function triggerInteractAction() {
  renderer.triggerAction(localPlayerId);
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    const res = hostInstance?.engine.handleInteract(localPlayerId);
    if (res) {
      showToast(res.message);
      if (res.success) {
        if (res.message.includes('小麥')) soundManager.playFootstep();
        else if (res.message.includes('鮮肉')) soundManager.playKillStrike();
        else if (res.message.includes('木屋') || res.message.includes('門鎖') || res.message.includes('反鎖') || res.message.includes('避難')) soundManager.playDoor();
        else soundManager.playFootstep();
      }
    }
  } else if (currentMode === 'CLIENT') {
    clientInstance?.sendInput(0, 0, 0, 'INTERACT');
  }
}

input.registerSkillHandler(() => {
  triggerSkillAction();
});
btnSkill.addEventListener('click', () => {
  triggerSkillAction();
});

function triggerSkillAction() {
  renderer.triggerAction(localPlayerId);
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    const res = hostInstance?.engine.handleSkillCast(localPlayerId);
    if (res) {
      showToast(res.message);
      if (res.success && res.message.includes('狂暴巨狼')) {
        soundManager.playWolfGrowl();
      } else if (res.success && res.message.includes('撕碎')) {
        soundManager.playKillStrike();
      } else if (res.success && res.message.includes('藥水') || res.message.includes('護盾')) {
        soundManager.playShieldShatter();
      }
    }
  } else if (currentMode === 'CLIENT') {
    clientInstance?.sendInput(0, 0, 0, 'SKILL');
  }
}

// 秘密羊皮紙書信面板頁籤切換
tabCompose.addEventListener('click', () => {
  tabCompose.classList.add('active');
  tabInbox.classList.remove('active');
  panelCompose.style.display = 'block';
  panelInbox.style.display = 'none';
});

tabInbox.addEventListener('click', () => {
  tabInbox.classList.add('active');
  tabCompose.classList.remove('active');
  panelCompose.style.display = 'none';
  panelInbox.style.display = 'block';
  renderInboxList();
});

btnLetters.addEventListener('click', () => {
  openLettersUI();
});
btnCloseLetter.addEventListener('click', () => {
  letterModal.style.display = 'none';
});
btnCloseInbox.addEventListener('click', () => {
  letterModal.style.display = 'none';
});

btnSendLetter.addEventListener('click', () => {
  const targetId = letterRecipient.value;
  const content = letterContent.value.trim();
  if (!targetId || !content) return;

  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    hostInstance?.engine.fsm.sendDuskLetter(localPlayerId, targetId, content);
  } else if (currentMode === 'CLIENT') {
    clientInstance?.sendLetter(targetId, content);
  }

  showToast('🕊️ 封蠟密函已由夜鷹穿過暮色秘密送達！');
  letterModal.style.display = 'none';
});

function openLettersUI(preferInbox: boolean = false) {
  const snap = getActiveSnapshot();
  if (!snap) return;

  letterRecipient.innerHTML = '';
  for (const id in snap.players) {
    if (id === localPlayerId) continue;
    const p = snap.players[id];
    if (!p.isAlive) continue;
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.innerText = `${p.name} (${p.assignedCottageId})`;
    letterRecipient.appendChild(opt);
  }

  const me = snap.players[localPlayerId];
  const unreadCount = me?.unreadLetters?.length || 0;
  inboxCount.innerText = String(unreadCount);

  if (preferInbox || unreadCount > 0) {
    tabInbox.click();
  } else {
    tabCompose.click();
  }

  letterModal.style.display = 'flex';
}

function renderInboxList() {
  const snap = getActiveSnapshot();
  const me = snap?.players[localPlayerId];
  if (!me || !me.unreadLetters || me.unreadLetters.length === 0) {
    letterInboxList.innerHTML = `
      <div style="text-align: center; color: #8c6239; padding: 24px 0; font-style: italic;">
        🕊️ 信箱中尚無來信。黃昏時段可等待其他村民或暗線的密報。
      </div>
    `;
    return;
  }

  letterInboxList.innerHTML = '';
  for (const letter of me.unreadLetters) {
    const item = document.createElement('div');
    item.className = 'letter-item';
    const timeStr = new Date(letter.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    item.innerHTML = `
      <div class="letter-item-header">
        <span>🕊️ 發信人: <strong>${letter.fromName}</strong></span>
        <span>${timeStr}</span>
      </div>
      <div class="letter-item-body">
        "${letter.content}"
      </div>
    `;
    letterInboxList.appendChild(item);
  }
}

btnSkipVote.addEventListener('click', () => {
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    hostInstance?.engine.fsm.castVote(localPlayerId, 'SKIP');
  } else if (currentMode === 'CLIENT') {
    clientInstance?.castVote('SKIP');
  }
});

function getActiveSnapshot(): GameStateSnapshot | null {
  if (currentMode === 'HOST' || currentMode === 'SOLO') {
    return hostInstance?.engine.fsm.getSnapshot() || null;
  }
  return latestSnapshot;
}

// ==========================================
// 5. 早晨火堆票人會議更新
// ==========================================
function updateMeetingUI(snapshot: GameStateSnapshot) {
  if (snapshot.phase === GamePhase.MORNING) {
    if (lastPhase !== GamePhase.MORNING) {
      soundManager.playBell();
    }
    meetingModal.style.display = 'flex';
    votingTimer.innerText = `剩餘 ${Math.ceil(snapshot.phaseRemainingTime)}s`;

    if (voteOptions.children.length === 0) {
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
          btn.style.borderColor = '#facc15';
        };
        voteOptions.appendChild(btn);
      }
    }
  } else {
    meetingModal.style.display = 'none';
    voteOptions.innerHTML = '';
  }
  lastPhase = snapshot.phase;
}

// ==========================================
// 6. 主渲染循環
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
      if (me && snap.phase !== GamePhase.GAME_OVER) {
        const { dx, dy, rotation } = input.getMovement(me.x, me.y);
        if (dx !== 0 || dy !== 0) {
          soundManager.playFootstep();
        }
        hostInstance.engine.handlePlayerMove(localPlayerId, dx, dy, rotation, deltaSec);
      }
      activeSnapshot = hostInstance.engine.update(deltaSec);
    }
  } else if (currentMode === 'CLIENT') {
    activeSnapshot = latestSnapshot;
    if (activeSnapshot && clientInstance) {
      const me = activeSnapshot.players[localPlayerId];
      if (me && activeSnapshot.phase !== GamePhase.GAME_OVER) {
        const { dx, dy, rotation } = input.getMovement(me.x, me.y);
        if (dx !== 0 || dy !== 0) {
          soundManager.playFootstep();
        }
        clientInstance.sendInput(dx, dy, rotation);
      }
    }
  }

  // 更新 HUD
  if (activeSnapshot) {
    const me = activeSnapshot.players[localPlayerId];
    const phaseNames: Record<GamePhase, string> = {
      [GamePhase.LOBBY]: '大廳準備',
      [GamePhase.MORNING]: '🔥 早晨 [火堆會議票人]',
      [GamePhase.AFTERNOON]: '🌾 下午 [割麥工作時間]',
      [GamePhase.DUSK]: '✉️ 黃昏 [秘密書信時段]',
      [GamePhase.NIGHT]: '🌑 夜晚 [自由獵殺時間]',
      [GamePhase.GAME_OVER]: '🏆 對局結算'
    };

    hudPhase.innerText = `第 ${activeSnapshot.dayCount} 天 · ${phaseNames[activeSnapshot.phase]}`;
    hudWheat.innerText = `🌾 ${activeSnapshot.villageWheatTotal} / ${activeSnapshot.targetWheatGoal} 綑 (我的小麥: ${me?.wheatCount || 0})`;
    hudRole.innerText = me ? `${me.name} [${me.role}] (${me.assignedCottageId})` : '旁觀中';
    hudTimer.innerText = `${Math.ceil(activeSnapshot.phaseRemainingTime)}s`;

    // 時段切換情境提醒
    if (activeSnapshot.phase !== lastPhase) {
      if (activeSnapshot.phase === GamePhase.DUSK) {
        showToast('🌅 黃昏降臨！夜鷹飛旋，請抓緊時間傳遞秘密信函！', 3500);
        soundManager.playBell();
      } else if (activeSnapshot.phase === GamePhase.NIGHT) {
        showToast('🌑 暗夜降臨！狂暴巨狼出沒，請速回專屬木屋並按 [E] 反鎖避難！', 4000);
        soundManager.setHeartbeatActive(true);
      } else if (activeSnapshot.phase === GamePhase.AFTERNOON) {
        soundManager.setHeartbeatActive(false);
        showToast('🌾 下午工作時間！村民請前往西側麥田揮鐮割麥！', 3000);
      } else {
        soundManager.setHeartbeatActive(false);
      }
    }

    // 動態感應 [E] 互動提示
    let prompt: string | null = null;
    if (hostInstance) {
      prompt = hostInstance.engine.getInteractionPrompt(localPlayerId);
    } else if (me) {
      for (const patch of VILLAGE_MAP.wheatPatches) {
        if (me.x >= patch.rect.x && me.x <= patch.rect.x + patch.rect.width && me.y >= patch.rect.y && me.y <= patch.rect.y + patch.rect.height) {
          prompt = activeSnapshot.phase === GamePhase.AFTERNOON ? '🌾 按 [E] 收割金黃小麥' : '🌾 小麥生長中 (下午可收割)';
        }
      }
      for (const rack of VILLAGE_MAP.meatRacks) {
        if (me.x >= rack.rect.x && me.x <= rack.rect.x + rack.rect.width && me.y >= rack.rect.y && me.y <= rack.rect.y + rack.rect.height) {
          prompt = me.role === RoleType.WEREWOLF ? '🥩 按 [E] 吞食鮮肉' : '🥩 生鮮燻肉架';
        }
      }
      if (me.insideCottageId) {
        const cot = VILLAGE_MAP.cottages.find(c => c.id === me.insideCottageId);
        if (cot) {
          const dcX = cot.doorRect.x + cot.doorRect.width / 2;
          const dcY = cot.doorRect.y + cot.doorRect.height / 2;
          if (Math.hypot(me.x - dcX, me.y - dcY) < 45) {
            prompt = '🚪 按 [E] 走出木屋';
          } else if (me.assignedCottageId === cot.id) {
            prompt = cot.isLocked ? '🔓 按 [E] 打開門鎖' : '🔒 按 [E] 反鎖小屋防狼';
          }
        }
      } else {
        for (const cot of VILLAGE_MAP.cottages) {
          const dcX = cot.doorRect.x + cot.doorRect.width / 2;
          const dcY = cot.doorRect.y + cot.doorRect.height / 2;
          if (Math.hypot(me.x - dcX, me.y - dcY) < 55) {
            prompt = me.assignedCottageId === cot.id ? '🏠 按 [E] 進入專屬木屋' : `🚪 按 [E] 進入 ${cot.name}`;
          }
        }
      }
    }

    if (prompt) {
      interactionPrompt.style.display = 'flex';
      promptText.innerText = prompt;
      btnInteract.innerText = prompt;
    } else {
      interactionPrompt.style.display = 'none';
      btnInteract.innerText = '🌾 互動 / 割麥 / 進屋 [E]';
    }

    if (me) {
      const unreadCount = me.unreadLetters?.length || 0;
      btnLetters.innerText = `✉️ 秘密書信 (${unreadCount}封未讀)`;
      inboxCount.innerText = String(unreadCount);
      if (unreadCount > 0) {
        btnLetters.style.borderColor = '#facc15';
        btnLetters.style.boxShadow = '0 0 12px rgba(250, 204, 21, 0.6)';
      } else {
        btnLetters.style.borderColor = '#a855f7';
        btnLetters.style.boxShadow = 'none';
      }
    }

    updateMeetingUI(activeSnapshot);
    renderer.isCloseupCamera = input.isCloseupView;
    renderer.render(activeSnapshot, VILLAGE_MAP, localPlayerId, deltaSec);
  }

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
