/**
 * @file p2p-client.ts
 * @description P2P 客戶端連線層：負責向 Host 發送操作輸入與接收廣播快照
 */

import { DataConnection } from 'peerjs';
import { GameStateSnapshot, PlayerId, RoleType } from '../core/types';
import { PeerManager } from './peer-manager';
import { NetworkPacket, PacketType, PlayerInputPacket } from './protocol';

export interface ClientCallbacks {
  onConnected?: () => void;
  onJoined?: (role?: RoleType, hostId?: PlayerId) => void;
  onStateSync?: (snapshot: GameStateSnapshot) => void;
  onError?: (err: Error) => void;
  onDisconnected?: () => void;
}

export class P2PClient {
  public playerId: PlayerId;
  public playerName: string;
  public roomCode: string;
  private peerManager: PeerManager;
  private connection: DataConnection | null = null;
  private callbacks: ClientCallbacks;
  private inputSeq: number = 0;

  constructor(roomCode: string, playerName: string, callbacks: ClientCallbacks = {}) {
    this.roomCode = roomCode.trim().toUpperCase();
    this.playerName = playerName.trim() || '遊客';
    this.playerId = 'client-' + Math.random().toString(36).substring(2, 9);
    this.peerManager = new PeerManager();
    this.callbacks = callbacks;
  }

  public async connect(): Promise<void> {
    await this.peerManager.init({
      onError: (err) => {
        this.callbacks.onError?.(err);
      }
    });

    const peer = this.peerManager.getRawPeer();
    const conn = peer.connect(this.roomCode, { reliable: true });
    this.connection = conn;

    conn.on('open', () => {
      console.log(`[Client] 已連線至房主 ${this.roomCode}，發送加入請求...`);
      this.callbacks.onConnected?.();

      // 發送加入房間封包
      conn.send({
        type: PacketType.JOIN_REQ,
        playerId: this.playerId,
        playerName: this.playerName
      });
    });

    conn.on('data', (raw) => {
      const packet = raw as NetworkPacket;
      this.handlePacket(packet);
    });

    conn.on('close', () => {
      console.log('[Client] 與房主連線已斷開');
      this.callbacks.onDisconnected?.();
    });

    conn.on('error', (err) => {
      console.error('[Client] 連線發生錯誤:', err);
      this.callbacks.onError?.(err);
    });
  }

  private handlePacket(packet: NetworkPacket): void {
    switch (packet.type) {
      case PacketType.JOIN_ACK: {
        if (packet.success) {
          console.log(`[Client] 加入成功！分配角色: ${packet.assignedRole}`);
          this.callbacks.onJoined?.(packet.assignedRole, packet.hostId);
        } else {
          console.warn(`[Client] 加入被拒絕: ${packet.message}`);
          this.callbacks.onError?.(new Error(packet.message || '加入失敗'));
        }
        break;
      }

      case PacketType.STATE_SYNC: {
        this.callbacks.onStateSync?.(packet.snapshot);
        break;
      }
    }
  }

  public sendInput(dx: number, dy: number, rotation: number, action?: 'SKILL' | 'INTERACT' | 'ATTACK'): void {
    if (!this.connection || !this.connection.open) return;

    const packet: PlayerInputPacket = {
      type: PacketType.INPUT,
      playerId: this.playerId,
      dx,
      dy,
      rotation,
      actionTriggered: action,
      seq: ++this.inputSeq
    };
    this.connection.send(packet);
  }

  public castVote(targetId: PlayerId | 'SKIP'): void {
    if (!this.connection || !this.connection.open) return;

    this.connection.send({
      type: PacketType.CAST_VOTE,
      voterId: this.playerId,
      targetId
    });
  }

  public triggerEmergency(): void {
    if (!this.connection || !this.connection.open) return;

    this.connection.send({
      type: PacketType.CALL_MEETING,
      callerId: this.playerId,
      reason: 'EMERGENCY_BUTTON'
    });
  }

  public disconnect(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.peerManager.destroy();
  }
}
