import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { User } from '../types';

export interface TokenPayload {
  userId: string;
  username: string;
  email: string;
}

export function signToken(user: Pick<User, 'id' | 'username' | 'email'>): string {
  return jwt.sign(
    { userId: user.id, username: user.username, email: user.email },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, issuer: 'realtime-chat' } as jwt.SignOptions
  );
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'realtime-chat',
  }) as TokenPayload;
}
