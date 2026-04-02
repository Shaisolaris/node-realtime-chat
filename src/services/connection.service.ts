import { AuthSocket } from '../middleware/socketAuth';

// userId -> Set of socketIds
const userSockets = new Map<string, Set<string>>();
// socketId -> AuthSocket
const socketMap = new Map<string, AuthSocket>();

export const connectionManager = {
  add(socket: AuthSocket): void {
    const { userId } = socket;
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket.id);
    socketMap.set(socket.id, socket);
  },

  remove(socketId: string): string | null {
    const socket = socketMap.get(socketId);
    if (!socket) return null;
    const { userId } = socket;
    userSockets.get(userId)?.delete(socketId);
    if (userSockets.get(userId)?.size === 0) userSockets.delete(userId);
    socketMap.delete(socketId);
    return userId;
  },

  getSocket(socketId: string): AuthSocket | undefined {
    return socketMap.get(socketId);
  },

  getUserSockets(userId: string): AuthSocket[] {
    const ids = userSockets.get(userId) ?? new Set<string>();
    return [...ids].map((id) => socketMap.get(id)).filter((s): s is AuthSocket => !!s);
  },

  isOnline(userId: string): boolean {
    return (userSockets.get(userId)?.size ?? 0) > 0;
  },

  getOnlineUserIds(): string[] {
    return [...userSockets.keys()];
  },

  getConnectionCount(): number {
    return socketMap.size;
  },
};
