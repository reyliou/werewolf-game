/**
 * @file peer-manager.ts
 * @description PeerJS 實例封裝與連線生命週期管理（零污染、強型別）
 */

import { Peer } from 'peerjs';

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'WW-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface PeerOptions {
  peerId?: string;
  onOpen?: (id: string) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

export class PeerManager {
  private peer: Peer | null = null;
  public id: string | null = null;

  public init(options: PeerOptions = {}): Promise<string> {
    return new Promise((resolve, reject) => {
      // 若有指定 peerId 則使用（Host），無指定則由伺服器自動生成（Client）
      this.peer = options.peerId ? new Peer(options.peerId) : new Peer();

      this.peer.on('open', (id) => {
        this.id = id;
        options.onOpen?.(id);
        resolve(id);
      });

      this.peer.on('error', (err) => {
        console.error('[PeerManager] 連線異常:', err);
        options.onError?.(err);
        reject(err);
      });

      this.peer.on('close', () => {
        options.onClose?.();
      });
    });
  }

  public getRawPeer(): Peer {
    if (!this.peer) throw new Error('Peer 尚未初始化');
    return this.peer;
  }

  public destroy(): void {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
      this.id = null;
    }
  }
}
