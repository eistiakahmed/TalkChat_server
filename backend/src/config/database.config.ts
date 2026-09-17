import { PrismaClient } from '@prisma/client';
import { env } from './env.config.js';
import { logger } from '../utils/logger.js';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
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
  globalForPrisma.prisma = prisma;

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

export const connectDatabase = async (): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('🐘 PostgreSQL Database connected successfully via Prisma');
  } catch (error) {
    logger.error({ error }, '❌ Database connection failed');
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info('🐘 PostgreSQL Database disconnected');
};
