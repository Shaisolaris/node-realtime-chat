# Real-Time Chat Server

Production-ready WebSocket chat server built with **Node.js**, **TypeScript**, **Socket.io**, and **Redis**. Supports multiple rooms, direct messaging, presence tracking, typing indicators, message history, reactions, and horizontal scaling via Redis pub/sub.

## Architecture

```
src/
├── config/         # Environment validation
├── handlers/       # Socket.io event handlers (all chat logic)
├── middleware/     # JWT socket authentication
├── routes/         # HTTP endpoints (auth, health)
├── services/
│   ├── redis.service.ts      # Presence, rooms, message history, pub/sub, rate limiting
│   ├── user.service.ts       # User store (swap for Prisma in production)
│   └── connection.service.ts # Active socket tracking per user
├── types/          # Shared TypeScript interfaces
└── utils/          # JWT sign/verify helpers
```

## Stack

- **Runtime**: Node.js 20 + TypeScript (strict mode)
- **Transport**: Socket.io 4 (WebSocket + polling fallback)
- **Cache/Pub-Sub**: Redis (ioredis) — presence, message history, rate limiting, horizontal scale
- **Auth**: JWT on every socket connection via handshake auth
- **HTTP**: Express for auth endpoints and health check

## Features

| Feature | Detail |
|---------|--------|
| **Rooms** | Create, join, leave. Public and private. Configurable member cap. |
| **Presence** | Online/offline events, per-room member list with status |
| **Typing indicators** | `typing:start` / `typing:stop` scoped per room |
| **Message history** | Paginated by timestamp, last 500 msgs per room in Redis sorted set |
| **Edit & delete** | Author-only, broadcast to room |
| **Reactions** | Emoji reactions broadcast to room |
| **Direct messages** | User-to-user DMs delivered to all active sockets |
| **Rate limiting** | 30 msgs/10s per user in rooms, 20 DMs/10s — Redis-backed |
| **System messages** | Auto-generated join/leave events in room history |
| **Horizontal scaling** | Redis pub/sub publisher/subscriber split for multi-instance |

## Socket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `room:create` | `{ name, description?, isPrivate? }` | Create a new room |
| `room:join` | `{ roomId }` | Join room, returns history + presence |
| `room:leave` | `{ roomId }` | Leave room |
| `rooms:list` | — | Get all public rooms |
| `message:send` | `{ roomId, content, type?, replyTo? }` | Send message |
| `message:edit` | `{ messageId, roomId, content }` | Edit own message |
| `message:delete` | `{ messageId, roomId }` | Delete own message |
| `message:react` | `{ messageId, roomId, emoji }` | React to message |
| `typing:start` | `{ roomId }` | Broadcast typing start |
| `typing:stop` | `{ roomId }` | Broadcast typing stop |
| `history:get` | `{ roomId, before?, limit? }` | Paginated history |
| `dm:send` | `{ toUserId, content }` | Direct message |
| `presence:online` | — | Get online user IDs |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `connected` | `{ userId, username, serverTime }` | Connection confirmed |
| `message:new` | `Message` | New message in room |
| `message:edited` | `Message` | Message was edited |
| `message:deleted` | `{ roomId, messageId }` | Message was deleted |
| `message:reaction` | `Reaction` | Reaction added |
| `room:created` | `Room` | New room available |
| `room:member_joined` | `{ roomId, userId, username }` | User joined room |
| `room:member_left` | `{ roomId, userId, username }` | User left room |
| `typing:start` | `{ roomId, userId, username }` | User typing |
| `typing:stop` | `{ roomId, userId, username }` | User stopped typing |
| `dm:received` | `Message` | Incoming DM |
| `user:online` | `{ userId, username }` | User came online |
| `user:offline` | `{ userId, username, lastSeen }` | User went offline |

## HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register user, returns JWT |
| POST | `/api/auth/login` | Login, returns JWT |
| GET | `/api/health` | Health + connection count |

## Setup

```bash
npm install
cp .env.example .env
# Start Redis (Docker):
docker run -d -p 6379:6379 redis:7-alpine
npm run dev
```

## Connect (JavaScript client)

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: 'your-jwt-token' }
});

socket.on('connected', ({ userId }) => console.log('Connected as', userId));

// Join a room and get history
socket.emit('room:join', { roomId: 'room-id' }, ({ success, history }) => {
  console.log('History:', history);
});

// Send a message
socket.emit('message:send', { roomId: 'room-id', content: 'Hello!' });

// Listen for messages
socket.on('message:new', (msg) => console.log(msg.username, ':', msg.content));
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `JWT_SECRET` | required | Min 32-char secret |
| `JWT_EXPIRES_IN` | `24h` | Token TTL |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `MAX_MESSAGE_LENGTH` | `2000` | Message character limit |
| `MAX_ROOM_MEMBERS` | `100` | Room member cap |
| `MESSAGE_HISTORY_LIMIT` | `50` | Default history page size |

## Scaling

Redis pub/sub is pre-wired. For multi-instance deployment, add `@socket.io/redis-adapter`:

```typescript
import { createAdapter } from '@socket.io/redis-adapter';
io.adapter(createAdapter(pubClient, subClient));
```
