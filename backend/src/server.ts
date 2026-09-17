import { createApp } from './app.js';
import { env } from './config/env.config.js';
import { logger } from './utils/logger.js';
import { connectDatabase, disconnectDatabase } from './config/database.config.js';
import { connectRedis, disconnectRedis } from './config/redis.config.js';

/**
 * TalkChat HTTP Server Entrypoint.
 * 
 * Boots the Express application, establishes connections to PostgreSQL (via Prisma)
 * and Redis (via ioredis), and registers signal handlers for graceful zero-downtime shutdown.
 * 
 * @see https://nodejs.org/api/process.html#signal-events
 * @see https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
 */

const startServer = async () => {
  // Connect to persistent storage and cache
  await connectDatabase();
  await connectRedis();

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(
      `TalkChat Server running on http://localhost:${env.PORT} in ${env.NODE_ENV} mode`
    );
    logger.info(`Health check available at http://localhost:${env.PORT}/api/health`);
    logger.info(`Auth endpoints mounted at http://localhost:${env.PORT}${env.API_PREFIX}/auth`);
  });

  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    server.close(async () => {
      logger.info('HTTP server closed.');
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

  return server;
};

startServer().catch((error) => {
  logger.error({ error }, 'Fatal error during server startup');
  process.exit(1);
});

export default startServer;
