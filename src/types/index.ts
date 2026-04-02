export interface User {
  id: string;
  username: string;
  email: string;
  avatarUrl?: string;
}

export interface AuthenticatedSocket {
  userId: string;
  username: string;
  email: string;
  socketId: string;
  connectedAt: number;
  currentRooms: Set<string>;
}

export interface Room {
  id: string;
  name: string;
  description?: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: number;
  memberCount: number;
}

export interface Message {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  type: MessageType;
  replyTo?: string;
  editedAt?: number;
  createdAt: number;
}

export interface Reaction {
  messageId: string;
  userId: string;
  username: string;
  emoji: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'system';

export interface PresenceInfo {
  userId: string;
  username: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: number;
  currentRooms: string[];
}

export interface TypingIndicator {
  roomId: string;
  userId: string;
  username: string;
}

// Socket event payloads
export interface JoinRoomPayload {
  roomId: string;
}

export interface LeaveRoomPayload {
  roomId: string;
}

export interface SendMessagePayload {
  roomId: string;
  content: string;
  type?: MessageType;
  replyTo?: string;
}

export interface EditMessagePayload {
  messageId: string;
  roomId: string;
  content: string;
}

export interface DeleteMessagePayload {
  messageId: string;
  roomId: string;
}

export interface ReactToMessagePayload {
  messageId: string;
  roomId: string;
  emoji: string;
}

export interface TypingPayload {
  roomId: string;
  isTyping: boolean;
}

export interface GetHistoryPayload {
  roomId: string;
  before?: number;
  limit?: number;
}

export interface DirectMessagePayload {
  toUserId: string;
  content: string;
}

export interface CreateRoomPayload {
  name: string;
  description?: string;
  isPrivate?: boolean;
}
