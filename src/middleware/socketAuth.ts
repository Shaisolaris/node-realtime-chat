import { Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { userStore } from '../services/user.service';

export interface AuthSocket extends Socket {
  userId: string;
  username: string;
  email: string;
}

export function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): void {
  const token =
    (socket.handshake.auth?.token as string) ||
    (socket.handshake.headers?.authorization?.replace('Bearer ', '') as string);

  if (!token) {
    return next(new Error('Authentication token required'));
  }

  try {
    const payload = verifyToken(token);
    const user = userStore.findById(payload.userId);
    if (!user) return next(new Error('User not found'));

    const authSocket = socket as AuthSocket;
    authSocket.userId = payload.userId;
    authSocket.username = payload.username;
    authSocket.email = payload.email;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
