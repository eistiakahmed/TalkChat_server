import { createServer } from 'http';
import { createApp } from './app.js';
import { env } from './config/env.config.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.config.js';
import { connectRedis, disconnectRedis } from './config/redis.config.js';
import { initSocketServer } from './socket/socket.server.js';

/**
 * TalkChat HTTP & WebSocket Server Entrypoint.
 * 
 * Boots the Express application, mounts distributed Socket.io real-time layer,
 * establishes connections to PostgreSQL (via Prisma) and Redis (via ioredis),
 * and registers signal handlers for graceful zero-downtime shutdown.
 * 
 * @see https://nodejs.org/api/http.html#httpcreateserveroptions-requestlistener
 * @see https://socket.io/docs/v4/server-initialization/
 */

const startServer = async () => {
  // Connect to persistent storage and cache
  await connectDatabase();
  await connectRedis();

  const app = createApp();
  const httpServer = createServer(app);

  // Initialize Socket.io with Redis Adapter attached to HTTP server
  const io = initSocketServer(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(
      `TalkChat Server running on http://localhost:${env.PORT} in ${env.NODE_ENV} mode`
    );
    logger.info(`Health check available at http://localhost:${env.PORT}/api/health`);
    logger.info(`WebSocket real-time layer active on ws://localhost:${env.PORT}`);
    logger.info(`Auth endpoints mounted at http://localhost:${env.PORT}${env.API_PREFIX}/auth`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    httpServer.close(async () => {
      logger.info('HTTP and WebSocket server closed.');
      io.close();
      await disconnectDatabase();
      await disconnectRedis();
      process.exit(0);
    });

    // Force close after 10s timeout
    setTimeout(() => {
      logger.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return httpServer;
};

startServer().catch((error) => {
  logger.error({ error }, 'Fatal error during server startup');
  process.exit(1);
});

export default startServer;
