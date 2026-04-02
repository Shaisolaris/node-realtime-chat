import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { AuthSocket } from '../middleware/socketAuth';
import { redis } from '../services/redis.service';
import { connectionManager } from '../services/connection.service';
import { env } from '../config/env';
import {
  JoinRoomPayload,
  LeaveRoomPayload,
  SendMessagePayload,
  EditMessagePayload,
  DeleteMessagePayload,
  ReactToMessagePayload,
  TypingPayload,
  GetHistoryPayload,
  DirectMessagePayload,
  CreateRoomPayload,
  Message,
  Room,
  PresenceInfo,
} from '../types';

export function registerSocketHandlers(io: Server, socket: AuthSocket): void {
  const { userId, username } = socket;

  // --- Connection ---
  connectionManager.add(socket);

  const presence: PresenceInfo = {
    userId,
    username,
    status: 'online',
    lastSeen: Date.now(),
    currentRooms: [],
  };
  redis.setPresence(userId, presence).catch(console.error);

  socket.broadcast.emit('user:online', { userId, username });
  socket.emit('connected', {
    userId,
    username,
    serverTime: Date.now(),
  });

  // --- Room: Create ---
  socket.on('room:create', async (payload: CreateRoomPayload, ack?: (res: unknown) => void) => {
    try {
      const room: Room = {
        id: uuidv4(),
        name: payload.name.trim().slice(0, 80),
        description: payload.description?.trim().slice(0, 200),
        isPrivate: payload.isPrivate ?? false,
        createdBy: userId,
        createdAt: Date.now(),
        memberCount: 1,
      };
      await redis.saveRoom(room);
      await redis.joinRoom(room.id, userId);
      socket.join(room.id);
      io.emit('room:created', room);
      ack?.({ success: true, room });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Room: Join ---
  socket.on('room:join', async (payload: JoinRoomPayload, ack?: (res: unknown) => void) => {
    try {
      const room = await redis.getRoom(payload.roomId);
      if (!room) return ack?.({ success: false, error: 'Room not found' });

      const memberCount = await redis.getRoomMemberCount(payload.roomId);
      if (memberCount >= env.MAX_ROOM_MEMBERS) {
        return ack?.({ success: false, error: 'Room is full' });
      }

      await redis.joinRoom(payload.roomId, userId);
      socket.join(payload.roomId);

      const systemMsg: Message = {
        id: uuidv4(),
        roomId: payload.roomId,
        userId: 'system',
        username: 'system',
        content: `${username} joined the room`,
        type: 'system',
        createdAt: Date.now(),
      };
      await redis.saveMessage(systemMsg);
      io.to(payload.roomId).emit('message:new', systemMsg);
      io.to(payload.roomId).emit('room:member_joined', { roomId: payload.roomId, userId, username });

      const history = await redis.getMessages(payload.roomId);
      const presence = await redis.getRoomPresence(payload.roomId);
      ack?.({ success: true, room, history, presence });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Room: Leave ---
  socket.on('room:leave', async (payload: LeaveRoomPayload) => {
    await redis.leaveRoom(payload.roomId, userId);
    socket.leave(payload.roomId);

    const systemMsg: Message = {
      id: uuidv4(),
      roomId: payload.roomId,
      userId: 'system',
      username: 'system',
      content: `${username} left the room`,
      type: 'system',
      createdAt: Date.now(),
    };
    await redis.saveMessage(systemMsg);
    io.to(payload.roomId).emit('message:new', systemMsg);
    io.to(payload.roomId).emit('room:member_left', { roomId: payload.roomId, userId, username });
  });

  // --- Message: Send ---
  socket.on('message:send', async (payload: SendMessagePayload, ack?: (res: unknown) => void) => {
    try {
      const allowed = await redis.checkRateLimit(`msg:${userId}`, 30, 10);
      if (!allowed) return ack?.({ success: false, error: 'Rate limit exceeded' });

      const isMember = await redis.isRoomMember(payload.roomId, userId);
      if (!isMember) return ack?.({ success: false, error: 'Not a room member' });

      const content = payload.content?.trim();
      if (!content || content.length > env.MAX_MESSAGE_LENGTH) {
        return ack?.({ success: false, error: 'Invalid message content' });
      }

      const message: Message = {
        id: uuidv4(),
        roomId: payload.roomId,
        userId,
        username,
        content,
        type: payload.type ?? 'text',
        replyTo: payload.replyTo,
        createdAt: Date.now(),
      };

      await redis.saveMessage(message);
      io.to(payload.roomId).emit('message:new', message);
      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Message: Edit ---
  socket.on('message:edit', async (payload: EditMessagePayload, ack?: (res: unknown) => void) => {
    try {
      const msg = await redis.getMessage(payload.roomId, payload.messageId);
      if (!msg) return ack?.({ success: false, error: 'Message not found' });
      if (msg.userId !== userId) return ack?.({ success: false, error: 'Cannot edit others\' messages' });

      const updated: Message = {
        ...msg,
        content: payload.content.trim(),
        editedAt: Date.now(),
      };
      await redis.updateMessage(payload.roomId, updated);
      io.to(payload.roomId).emit('message:edited', updated);
      ack?.({ success: true, message: updated });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Message: Delete ---
  socket.on('message:delete', async (payload: DeleteMessagePayload, ack?: (res: unknown) => void) => {
    try {
      const msg = await redis.getMessage(payload.roomId, payload.messageId);
      if (!msg) return ack?.({ success: false, error: 'Message not found' });
      if (msg.userId !== userId) return ack?.({ success: false, error: 'Cannot delete others\' messages' });

      await redis.deleteMessage(payload.roomId, payload.messageId);
      io.to(payload.roomId).emit('message:deleted', { roomId: payload.roomId, messageId: payload.messageId });
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Message: React ---
  socket.on('message:react', async (payload: ReactToMessagePayload, ack?: (res: unknown) => void) => {
    try {
      const isMember = await redis.isRoomMember(payload.roomId, userId);
      if (!isMember) return ack?.({ success: false, error: 'Not a room member' });

      const reaction = { messageId: payload.messageId, userId, username, emoji: payload.emoji };
      io.to(payload.roomId).emit('message:reaction', reaction);
      ack?.({ success: true });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Typing indicators ---
  socket.on('typing:start', (payload: TypingPayload) => {
    socket.to(payload.roomId).emit('typing:start', { roomId: payload.roomId, userId, username });
  });

  socket.on('typing:stop', (payload: TypingPayload) => {
    socket.to(payload.roomId).emit('typing:stop', { roomId: payload.roomId, userId, username });
  });

  // --- Message history ---
  socket.on('history:get', async (payload: GetHistoryPayload, ack?: (res: unknown) => void) => {
    try {
      const isMember = await redis.isRoomMember(payload.roomId, userId);
      if (!isMember) return ack?.({ success: false, error: 'Not a room member' });

      const messages = await redis.getMessages(
        payload.roomId,
        payload.before,
        Math.min(payload.limit ?? env.MESSAGE_HISTORY_LIMIT, 100)
      );
      ack?.({ success: true, messages });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Direct messages ---
  socket.on('dm:send', async (payload: DirectMessagePayload, ack?: (res: unknown) => void) => {
    try {
      const allowed = await redis.checkRateLimit(`dm:${userId}`, 20, 10);
      if (!allowed) return ack?.({ success: false, error: 'Rate limit exceeded' });

      const dmRoomId = redis.getDmRoomId(userId, payload.toUserId);
      const message: Message = {
        id: uuidv4(),
        roomId: dmRoomId,
        userId,
        username,
        content: payload.content.trim(),
        type: 'text',
        createdAt: Date.now(),
      };
      await redis.saveMessage(message);

      // Deliver to recipient's active sockets
      const recipientSockets = connectionManager.getUserSockets(payload.toUserId);
      recipientSockets.forEach((s) => s.emit('dm:received', message));
      socket.emit('dm:sent', message);
      ack?.({ success: true, message });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Room list ---
  socket.on('rooms:list', async (ack?: (res: unknown) => void) => {
    try {
      const rooms = await redis.getAllRooms();
      const withCounts = await Promise.all(
        rooms
          .filter((r) => !r.isPrivate)
          .map(async (r) => ({
            ...r,
            memberCount: await redis.getRoomMemberCount(r.id),
          }))
      );
      ack?.({ success: true, rooms: withCounts });
    } catch (err) {
      ack?.({ success: false, error: (err as Error).message });
    }
  });

  // --- Presence: get online users ---
  socket.on('presence:online', (ack?: (res: unknown) => void) => {
    const onlineUserIds = connectionManager.getOnlineUserIds();
    ack?.({ success: true, users: onlineUserIds });
  });

  // --- Disconnect ---
  socket.on('disconnect', async () => {
    connectionManager.remove(socket.id);
    const stillOnline = connectionManager.isOnline(userId);

    if (!stillOnline) {
      await redis.removePresence(userId);
      const rooms = await redis.getUserRooms(userId);
      rooms.forEach((roomId) => {
        io.to(roomId).emit('typing:stop', { roomId, userId, username });
      });
      socket.broadcast.emit('user:offline', { userId, username, lastSeen: Date.now() });
    }
  });
}
