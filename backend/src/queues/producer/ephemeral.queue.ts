import { Queue, JobsOptions } from 'bullmq';
import { queueRedisConnection, defaultJobOptions, QueueNames } from '../queue.config.js';
import { EphemeralPurgeJobData } from '../queue.types.js';
import { logger } from '../../utils/logger.js';

/**
 * BullMQ Ephemeral Media & Message Queue Producer.
 * 
 * Manages scheduling and dispatching asynchronous background purge tasks
 * for 24-hour expired stories, Cloudinary media assets, and per-conversation
 * disappearing messages.
 * 
 * @see https://docs.bullmq.io/guide/queues
 * @see https://docs.bullmq.io/guide/jobs/delayed
 */
export const ephemeralQueue = new Queue<EphemeralPurgeJobData>(QueueNames.EPHEMERAL, {
  connection: queueRedisConnection,
  defaultJobOptions,
});

/**
 * Schedule a delayed purge job for a single disappearing message.
 * 
 * @param messageId - UUID of the disappearing message
 * @param conversationId - UUID of the target conversation
 * @param delayMs - Delay duration in milliseconds before purge executes
 * @returns The enqueued Job instance
 * 
 * @see https://docs.bullmq.io/guide/jobs/delayed
 */
export const scheduleDisappearingMessagePurge = async (
  messageId: string,
  conversationId: string,
  delayMs: number
) => {
  try {
    const job = await ephemeralQueue.add(
      'purge_single_message',
      {
        type: 'PURGE_SINGLE_MESSAGE',
        messageId,
        conversationId,
      },
      {
        delay: Math.max(0, delayMs),
        jobId: `msg-purge-${messageId}`, // Idempotent job key
      }
    );
    logger.debug({ jobId: job.id, messageId, delayMs }, 'Scheduled disappearing message purge');
    return job;
  } catch (error) {
    logger.error({ error, messageId, conversationId }, 'Failed to schedule message purge');
    throw error;
  }
};

/**
 * Trigger an immediate or scheduled sweep of all expired stories and messages.
 * 
 * @param type - Target purge category ('PURGE_EXPIRED_STORIES' | 'PURGE_EXPIRED_MESSAGES')
 * @param options - BullMQ job execution options
 * @returns The enqueued Job instance
 */
export const dispatchEphemeralSweep = async (
  type: 'PURGE_EXPIRED_STORIES' | 'PURGE_EXPIRED_MESSAGES',
  options?: JobsOptions
) => {
  try {
    const job = await ephemeralQueue.add('ephemeral_sweep', { type }, options);
    logger.debug({ jobId: job.id, type }, 'Dispatched ephemeral cleanup sweep');
    return job;
  } catch (error) {
    logger.error({ error, type }, 'Failed to dispatch ephemeral cleanup sweep');
    throw error;
  }
};
