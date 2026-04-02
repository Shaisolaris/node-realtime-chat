function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const env = {
  PORT: parseInt(process.env.PORT ?? '3001', 10),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '24h',
  REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
  MAX_MESSAGE_LENGTH: parseInt(process.env.MAX_MESSAGE_LENGTH ?? '2000', 10),
  MAX_ROOM_MEMBERS: parseInt(process.env.MAX_ROOM_MEMBERS ?? '100', 10),
  MESSAGE_HISTORY_LIMIT: parseInt(process.env.MESSAGE_HISTORY_LIMIT ?? '50', 10),
};
