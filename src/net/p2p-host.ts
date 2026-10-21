/**
 * @file p2p-host.ts
 * @description P2P 房主權威端 (Host Server Engine)：掌控連線接納、封包廣播與邏輯仲裁
 */

import { DataConnection } from 'peerjs';
import { GameEngine } from '../core/engine';
import { GamePhase, PlayerId, PlayerState, RoleType } from '../core/types';
import { PeerManager } from './peer-manager';
import { NetworkPacket, PacketType, StateSyncPacket } from './protocol';

const PLAYER_COLORS = [
  '#38bdf8', // 蔚藍 (Host)
  '#10b981', // 翡翠綠
  '#a855f7', // 靈能紫
  '#f59e0b', // 琥珀金
  '#ef4444', // 猩紅
  '#ec4899'  // 薔薇粉
];

export class P2PHost {
  public engine: GameEngine;
  public roomCode: string;
  private peerManager: PeerManager;
  private connections: Map<PlayerId, DataConnection> = new Map();
  private broadcastInterval: number | null = null;
  private onPlayerCountChange?: (count: number) => void;

  constructor(roomCode: string, hostName: string = '房主 (Host)') {
    this.roomCode = roomCode;
    this.peerManager = new PeerManager();
    const hostPlayerId = 'host-' + roomCode;
    this.engine = new GameEngine(hostPlayerId);

    // 註冊房主自己的角色
    this.engine.fsm.addPlayer({
      id: hostPlayerId,
      name: hostName,
      role: RoleType.VILLAGER,
      faction: 'VILLAGE',
      isAlive: true,
      x: 700,
      y: 560,
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
      color: PLAYER_COLORS[0]
    });
  }

  public async start(onPlayerUpdate?: (count: number) => void): Promise<string> {
    this.onPlayerCountChange = onPlayerUpdate;

    const id = await this.peerManager.init({
      peerId: this.roomCode,
      onOpen: (peerId) => {
        console.log(`[Host] 房間已建立，代碼: ${peerId}`);
      },
      onError: (err) => {
        console.error('[Host] 房主連線異常:', err);
      }
    });

    const peer = this.peerManager.getRawPeer();
    peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    // 啟動 20Hz (50ms) 狀態同步廣播
    this.startBroadcastLoop(50);
    return id;
  }

  private handleIncomingConnection(conn: DataConnection): void {
    conn.on('open', () => {
      console.log(`[Host] 收到連線請求: ${conn.peer}`);
    });

    conn.on('data', (raw) => {
      const packet = raw as NetworkPacket;
      this.handlePacket(conn, packet);
    });

    conn.on('close', () => {
      console.log(`[Host] 玩家離線: ${conn.peer}`);
      this.connections.delete(conn.peer);
      this.engine.fsm.removePlayer(conn.peer);
      this.onPlayerCountChange?.(this.getConnectedPlayerCount());
    });

    conn.on('error', (err) => {
      console.error(`[Host] 連線錯誤 (${conn.peer}):`, err);
    });
  }

  private handlePacket(conn: DataConnection, packet: NetworkPacket): void {
    switch (packet.type) {
      case PacketType.JOIN_REQ: {
        const count = Object.keys(this.engine.fsm.getSnapshot().players).length;
        if (count >= 6) {
          conn.send({
            type: PacketType.JOIN_ACK,
            success: false,
            hostId: this.engine.fsm.getSnapshot().hostId,
            message: '房間已滿 (上限 6 人)'
          });
          conn.close();
          return;
        }

        const newPlayer: PlayerState = {
          id: packet.playerId,
          name: packet.playerName || `村民 ${count + 1}`,
          role: RoleType.VILLAGER,
          faction: 'VILLAGE',
          isAlive: true,
          x: 700 + (count * 25),
          y: 560 + (count % 2 === 0 ? 30 : -30),
          rotation: 0,
          speed: 160,
          sanity: 100,
          skillCooldownRemaining: 0,
          hasShield: false,
          isTransformed: false,
          wheatCount: 0,
          meatCount: 0,
          assignedCottageId: `cottage-${count + 1}`,
          insideCottageId: null,
          unreadLetters: [],
          color: PLAYER_COLORS[count % PLAYER_COLORS.length]
        };

        this.engine.fsm.addPlayer(newPlayer);
        this.connections.set(packet.playerId, conn);

        conn.send({
          type: PacketType.JOIN_ACK,
          success: true,
          assignedRole: newPlayer.role,
          hostId: this.engine.fsm.getSnapshot().hostId,
          message: '加入村莊成功！'
        });

        this.onPlayerCountChange?.(this.getConnectedPlayerCount());
        break;
      }

      case PacketType.INPUT: {
        const deltaSec = 0.05; // 標準網路 Tick 週期
        this.engine.handlePlayerMove(packet.playerId, packet.dx, packet.dy, packet.rotation, deltaSec);
        if (packet.actionTriggered === 'SKILL') {
          this.engine.handleSkillCast(packet.playerId);
        } else if (packet.actionTriggered === 'INTERACT') {
          this.engine.handleInteract(packet.playerId);
        }
        break;
      }

      case PacketType.SEND_LETTER: {
        this.engine.fsm.sendDuskLetter(packet.fromId, packet.toId, packet.content);
        break;
      }

      case PacketType.CALL_MEETING: {
        break;
      }

      case PacketType.CAST_VOTE: {
        this.engine.fsm.castVote(packet.voterId, packet.targetId);
        break;
      }

      case PacketType.CHAT_MSG: {
        this.broadcast(packet);
        break;
      }
    }
  }

  public getConnectedPlayerCount(): number {
    return Object.keys(this.engine.fsm.getSnapshot().players).length;
  }

  /**
   * 啟動 6 人村莊對局並隨機分派身分
   */
  public startGame(): boolean {
    const mockNames = ['農夫-亞歷山大', '藥劑師-艾蓮娜', '老獵人-萊昂', '占卜師-諾亞', '混亂狂徒-洛基', '神秘客-卡爾'];
    let botIndex = 1;

    // 若玩家不足 6 人，自動補齊 AI 村民，確保房主一人即可即時暢玩體驗
    while (Object.keys(this.engine.fsm.getSnapshot().players).length < 6) {
      const count = Object.keys(this.engine.fsm.getSnapshot().players).length;
      const botId = `bot-${botIndex}`;
      this.engine.fsm.addPlayer({
        id: botId,
        name: mockNames[count % mockNames.length],
        role: RoleType.VILLAGER,
        faction: 'VILLAGE',
        isAlive: true,
        x: 350 + count * 120,
        y: 400 + (count % 2 === 0 ? 60 : -60),
        rotation: 0,
        speed: 155,
        sanity: 100,
        skillCooldownRemaining: 0,
        hasShield: false,
        isTransformed: false,
        wheatCount: 0,
        meatCount: 0,
        assignedCottageId: `cottage-${count + 1}`,
        insideCottageId: null,
        unreadLetters: [],
        color: PLAYER_COLORS[count % PLAYER_COLORS.length]
      });
      botIndex++;
    }

    const snapshot = this.engine.fsm.getSnapshot();
    const playerIds = Object.keys(snapshot.players);

    // 6 大村莊核心職業槽位
    const rolesPool = [
      RoleType.VILLAGER,
      RoleType.WEREWOLF,
      RoleType.DOCTOR,
      RoleType.HUNTER,
      RoleType.SEER,
      RoleType.TRICKSTER
    ];

    // 洗牌分派
    const shuffledRoles = [...rolesPool].sort(() => Math.random() - 0.5);
    const assignedRoles: Record<PlayerId, RoleType> = {};

    for (let i = 0; i < playerIds.length; i++) {
      assignedRoles[playerIds[i]] = shuffledRoles[i];
    }

    return this.engine.fsm.startGame(assignedRoles);
  }

  private startBroadcastLoop(intervalMs: number): void {
    if (this.broadcastInterval !== null) clearInterval(this.broadcastInterval);

    this.broadcastInterval = window.setInterval(() => {
      const snapshot = this.engine.fsm.getSnapshot();
      if (snapshot.phase !== GamePhase.LOBBY) {
        // 主循環推進
        this.engine.update(intervalMs / 1000);
      }

      const syncPacket: StateSyncPacket = {
        type: PacketType.STATE_SYNC,
        snapshot: this.engine.fsm.getSnapshot(),
        serverTimestamp: Date.now()
      };
      this.broadcast(syncPacket);
    }, intervalMs);
  }

  public broadcast(packet: NetworkPacket): void {
    const serialized = packet;
    for (const conn of this.connections.values()) {
      if (conn.open) {
        conn.send(serialized);
      }
    }
  }

  public stop(): void {
    if (this.broadcastInterval !== null) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.peerManager.destroy();
  }
}
