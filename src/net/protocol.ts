/**
 * @file protocol.ts
 * @description P2P WebRTC 序列化通訊協定（Discriminated Unions 輕量封包契約）
 */

import { GameStateSnapshot, PlayerId, RoleType } from '../core/types';

export enum PacketType {
  JOIN_REQ = 'JOIN_REQ',
  JOIN_ACK = 'JOIN_ACK',
  INPUT = 'INPUT',
  STATE_SYNC = 'STATE_SYNC',
  CALL_MEETING = 'CALL_MEETING',
  CAST_VOTE = 'CAST_VOTE',
  CHAT_MSG = 'CHAT_MSG',
  SEND_LETTER = 'SEND_LETTER'
}

export interface JoinRequestPacket {
  type: PacketType.JOIN_REQ;
  playerId: PlayerId;
  playerName: string;
}

export interface JoinAckPacket {
  type: PacketType.JOIN_ACK;
  success: boolean;
  assignedRole?: RoleType;
  hostId: PlayerId;
  message?: string;
}

export interface PlayerInputPacket {
  type: PacketType.INPUT;
  playerId: PlayerId;
  dx: number;
  dy: number;
  rotation: number;
  actionTriggered?: 'SKILL' | 'INTERACT' | 'ATTACK';
  seq: number;
}

export interface StateSyncPacket {
  type: PacketType.STATE_SYNC;
  snapshot: GameStateSnapshot;
  serverTimestamp: number;
}

export interface CallMeetingPacket {
  type: PacketType.CALL_MEETING;
  callerId: PlayerId;
  reason: 'EMERGENCY_BUTTON' | 'BODY_REPORTED';
}

export interface CastVotePacket {
  type: PacketType.CAST_VOTE;
  voterId: PlayerId;
  targetId: PlayerId | 'SKIP';
}

export interface ChatMessagePacket {
  type: PacketType.CHAT_MSG;
  senderId: PlayerId;
  senderName: string;
  message: string;
  timestamp: number;
}

export interface SendLetterPacket {
  type: PacketType.SEND_LETTER;
  fromId: PlayerId;
  toId: PlayerId;
  content: string;
}

export type NetworkPacket =
  | JoinRequestPacket
  | JoinAckPacket
  | PlayerInputPacket
  | StateSyncPacket
  | CallMeetingPacket
  | CastVotePacket
  | ChatMessagePacket
  | SendLetterPacket;
