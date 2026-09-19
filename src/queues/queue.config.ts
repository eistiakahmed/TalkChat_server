import { ConnectionOptions, DefaultJobOptions } from 'bullmq';
import { env } from '../config/env.config.js';

/**
 * BullMQ Distributed Queue Configuration.
 * 
 * Configures Redis connectivity and default job lifecycle options for background workers.
 * Requires `maxRetriesPerRequest: null` for blocking Redis connections used in job processing.
 * 
 * @see https://docs.bullmq.io/guide/connections
 * @see https://docs.bullmq.io/guide/jobs/retrying-failing-jobs
 */
export const queueRedisConnection: ConnectionOptions = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

/**
 * Default Job Execution and Retention Policies.
 * 
 * - Retries: 3 attempts with exponential backoff (1s, 2s, 4s).
 * - Retention: Auto-cleans completed jobs to prevent Redis memory exhaustion,
 *   while preserving failed jobs in a dead-letter state for 24 hours.
 * 
 * @see https://docs.bullmq.io/guide/jobs/job-retention
 */
export const defaultJobOptions: DefaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: {
    count: 1000,
    age: 3600, // Keep last 1,000 completed jobs or up to 1 hour
  },
  removeOnFail: {
    count: 5000,
    age: 24 * 3600, // Keep failed jobs up to 24 hours for diagnostics
  },
};

/**
 * Centralized Queue Name Registry.
 * Note: BullMQ prohibits colons (:) in queue names as they are reserved for Redis keyspacing.
 */
export const QueueNames = {
  NOTIFICATION: 'talkchat-notification',
  EMAIL: 'talkchat-email',
  MEDIA: 'talkchat-media',
  EPHEMERAL: 'talkchat-ephemeral',
} as const;

export type QueueName = (typeof QueueNames)[keyof typeof QueueNames];
