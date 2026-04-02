import Redis from 'ioredis';
import { env } from '../config/env';
import { Message, Room, PresenceInfo } from '../types';

class RedisService {
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor() {
    const opts = { lazyConnect: true, enableOfflineQueue: false };
    this.client = new Redis(env.REDIS_URL, opts);
    this.subscriber = new Redis(env.REDIS_URL, opts);
    this.publisher = new Redis(env.REDIS_URL, opts);
  }

  async connect(): Promise<void> {
    await Promise.all([
      this.client.connect(),
      this.subscriber.connect(),
      this.publisher.connect(),
    ]);
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);
  }

  // --- Presence ---
  async setPresence(userId: string, info: PresenceInfo): Promise<void> {
    await this.client.setex(`presence:${userId}`, 300, JSON.stringify(info));
  }

  async getPresence(userId: string): Promise<PresenceInfo | null> {
    const data = await this.client.get(`presence:${userId}`);
    return data ? (JSON.parse(data) as PresenceInfo) : null;
  }

  async removePresence(userId: string): Promise<void> {
    await this.client.del(`presence:${userId}`);
  }

  async getRoomPresence(roomId: string): Promise<PresenceInfo[]> {
    const members = await this.client.smembers(`room:${roomId}:members`);
    if (members.length === 0) return [];
    const pipeline = this.client.pipeline();
    members.forEach((uid) => pipeline.get(`presence:${uid}`));
    const results = await pipeline.exec();
    if (!results) return [];
    return results
      .map(([, data]) => (data ? JSON.parse(data as string) as PresenceInfo : null))
      .filter((p): p is PresenceInfo => p !== null);
  }

  // --- Room membership ---
  async joinRoom(roomId: string, userId: string): Promise<void> {
    await this.client.sadd(`room:${roomId}:members`, userId);
    await this.client.sadd(`user:${userId}:rooms`, roomId);
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await this.client.srem(`room:${roomId}:members`, userId);
    await this.client.srem(`user:${userId}:rooms`, roomId);
  }

  async getRoomMembers(roomId: string): Promise<string[]> {
    return this.client.smembers(`room:${roomId}:members`);
  }

  async getRoomMemberCount(roomId: string): Promise<number> {
    return this.client.scard(`room:${roomId}:members`);
  }

  async getUserRooms(userId: string): Promise<string[]> {
    return this.client.smembers(`user:${userId}:rooms`);
  }

  async isRoomMember(roomId: string, userId: string): Promise<boolean> {
    return (await this.client.sismember(`room:${roomId}:members`, userId)) === 1;
  }

  // --- Room metadata ---
  async saveRoom(room: Room): Promise<void> {
    await this.client.hset('rooms', room.id, JSON.stringify(room));
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const data = await this.client.hget('rooms', roomId);
    return data ? (JSON.parse(data) as Room) : null;
  }

  async getAllRooms(): Promise<Room[]> {
    const all = await this.client.hgetall('rooms');
    return Object.values(all).map((v) => JSON.parse(v) as Room);
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.client.hdel('rooms', roomId);
    await this.client.del(`room:${roomId}:messages`);
    await this.client.del(`room:${roomId}:members`);
  }

  // --- Message history ---
  async saveMessage(message: Message): Promise<void> {
    const key = `room:${message.roomId}:messages`;
    await this.client.zadd(key, message.createdAt, JSON.stringify(message));
    // Keep last 500 messages per room
    await this.client.zremrangebyrank(key, 0, -501);
  }

  async getMessages(
    roomId: string,
    before?: number,
    limit = env.MESSAGE_HISTORY_LIMIT
  ): Promise<Message[]> {
    const key = `room:${roomId}:messages`;
    const max = before ? before - 1 : '+inf';
    const results = await this.client.zrevrangebyscore(
      key,
      max,
      '-inf',
      'LIMIT',
      0,
      limit
    );
    return results.map((r) => JSON.parse(r) as Message).reverse();
  }

  async getMessage(roomId: string, messageId: string): Promise<Message | null> {
    const messages = await this.getMessages(roomId, undefined, 500);
    return messages.find((m) => m.id === messageId) ?? null;
  }

  async updateMessage(roomId: string, updated: Message): Promise<void> {
    const key = `room:${roomId}:messages`;
    const all = await this.client.zrangebyscore(key, '-inf', '+inf', 'WITHSCORES');
    for (let i = 0; i < all.length; i += 2) {
      const msg = JSON.parse(all[i]) as Message;
      if (msg.id === updated.id) {
        const score = parseFloat(all[i + 1]);
        await this.client.zrem(key, all[i]);
        await this.client.zadd(key, score, JSON.stringify(updated));
        return;
      }
    }
  }

  async deleteMessage(roomId: string, messageId: string): Promise<void> {
    const key = `room:${roomId}:messages`;
    const all = await this.client.zrangebyscore(key, '-inf', '+inf');
    for (const raw of all) {
      const msg = JSON.parse(raw) as Message;
      if (msg.id === messageId) {
        await this.client.zrem(key, raw);
        return;
      }
    }
  }

  // --- Pub/Sub for horizontal scaling ---
  async publish(channel: string, data: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(data));
  }

  async subscribe(channel: string, handler: (data: unknown) => void): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) handler(JSON.parse(message));
    });
  }

  // --- DM rooms ---
  getDmRoomId(userA: string, userB: string): string {
    return [userA, userB].sort().join(':');
  }

  // --- Rate limiting ---
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const count = await this.client.incr(`ratelimit:${key}`);
    if (count === 1) await this.client.expire(`ratelimit:${key}`, windowSeconds);
    return count <= limit;
  }
}

export const redis = new RedisService();
