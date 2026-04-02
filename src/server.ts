import { env } from './config/env';
import { redis } from './services/redis.service';
import { httpServer } from './app';

async function bootstrap(): Promise<void> {
  try {
    await redis.connect();
    console.log('✓ Redis connected');

    httpServer.listen(env.PORT, () => {
      console.log(`✓ Server running on port ${env.PORT} [${env.NODE_ENV}]`);
      console.log(`  HTTP: http://localhost:${env.PORT}/api/health`);
      console.log(`  WS:   ws://localhost:${env.PORT}`);
    });

    const shutdown = async (signal: string): Promise<void> => {
      console.log(`\n${signal} — shutting down`);
      httpServer.close(async () => {
        await redis.disconnect();
        console.log('✓ Disconnected');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

bootstrap();
