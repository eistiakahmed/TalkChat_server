import { Redis, RedisOptions } from 'ioredis';
import { env } from './env.config.js';
import { logger } from '../utils/logger.js';

/**
 * Redis Client Singleton Configuration.
 * 
 * Provides an enterprise-grade Redis connection managed via `ioredis`, featuring
 * exponential backoff reconnection strategy, connection status events, and safe shutdown.
 * Redis is utilized across TalkChat for token blacklisting, user presence tracking,
 * session management, Socket.io adapter pub/sub, and BullMQ queues.
 * 
 * @see https://github.com/redis/ioredis
 * @see https://redis.io/docs/latest/develop/connect/clients/nodejs/ioredis/
 */

const redisOptions: RedisOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  maxRetriesPerRequest: null, // Required by BullMQ
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    logger.warn({ times, delay }, 'Retrying Redis connection...');
    return delay;
  },
};

export const redis = new Redis(redisOptions);

redis.on('connect', () => {
  logger.info('Connected to Redis server');
});

redis.on('ready', () => {
  logger.info('Redis client ready for commands');
});

redis.on('error', (error) => {
  logger.error({ error }, 'Redis connection error');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

/**
 * Connect to Redis instance on application startup.
 * 
 * @see https://github.com/redis/ioredis#connect-to-redis
 */
export const connectRedis = async (): Promise<void> => {
  try {
    await redis.connect();
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Redis connection');
  }
};

/**
 * Disconnect from Redis on graceful shutdown.
 */
export const disconnectRedis = async (): Promise<void> => {
  try {
    await redis.quit();
    logger.info('Redis connection gracefully disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting Redis');
  }
};
