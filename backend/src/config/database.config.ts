/**
 * @file TalkChat Backend - Database Configuration
 * @description PostgreSQL database connection management using Prisma ORM v7 with the `@prisma/adapter-pg` driver adapter.
 * Decouples runtime connection pooling to native node-pg and integrates with PrismaClient.
 * @see https://pris.ly/d/prisma7-client-config Prisma ORM v7 Client Configuration Guide
 * @see https://www.prisma.io/docs/orm/overview/databases/postgresql PostgreSQL with Prisma
 * @see https://node-postgres.com/apis/pool node-postgres Pool documentation
 */

import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env } from './env.config.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// Global singleton declaration to preserve connection pools across hot reloads in development
const globalForDatabase = globalThis as unknown as {
  prisma?: PrismaClient;
  pool?: pg.Pool;
};

/**
 * Native PostgreSQL connection pool instance
 */
export const pool =
  globalForDatabase.pool ||
  new Pool({
    connectionString: env.DATABASE_URL,
    max: 20, // Max concurrent database connections per instance
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

pool.on('error', (err) => {
  logger.error({ error: err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Prisma Driver Adapter for PostgreSQL
 */
const adapter = new PrismaPg(pool);

/**
 * Prisma Client instance initialized with PostgreSQL Driver Adapter
 */
export const prisma =
  globalForDatabase.prisma ||
  new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'query' },
            { emit: 'stdout', level: 'error' },
            { emit: 'stdout', level: 'info' },
            { emit: 'stdout', level: 'warn' },
          ]
        : ['error'],
  });

if (env.NODE_ENV === 'development') {
  globalForDatabase.prisma = prisma;
  globalForDatabase.pool = pool;

  // Log queries in development
  (prisma as any).$on('query', (e: any) => {
    logger.debug(
      {
        query: e.query,
        params: e.params,
        duration: `${e.duration}ms`,
      },
      'Prisma Query'
    );
  });
}

/**
 * Establishes and verifies database connectivity
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('PostgreSQL Database connected successfully via Prisma');
  } catch (error) {
    logger.error({ error }, 'Database connection failed');
    process.exit(1);
  }
};

/**
 * Gracefully disconnects Prisma and the underlying PostgreSQL pool
 */
export const disconnectDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    await pool.end();
    logger.info('PostgreSQL Database disconnected');
  } catch (error) {
    logger.error({ error }, 'Error disconnecting PostgreSQL database');
  }
};
