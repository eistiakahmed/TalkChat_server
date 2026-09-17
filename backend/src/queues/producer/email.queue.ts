import { Queue, JobsOptions } from 'bullmq';
import { queueRedisConnection, defaultJobOptions, QueueNames } from '../queue.config.js';
import { EmailJobData } from '../queue.types.js';
import { logger } from '../../utils/logger.js';

/**
 * BullMQ Email Queue Producer.
 * 
 * Manages dispatching transactional emails (welcome emails, password reset instructions,
 * unread message activity digests) asynchronously to avoid latency on auth & message flows.
 * 
 * @see https://docs.bullmq.io/guide/queues
 */
export const emailQueue = new Queue<EmailJobData>(QueueNames.EMAIL, {
  connection: queueRedisConnection,
  defaultJobOptions,
});

/**
 * Enqueue a transactional email job.
 * 
 * @param data - Email parameters and context
 * @param options - Optional custom BullMQ job options
 * @returns The enqueued Job instance
 */
export const dispatchEmail = async (
  data: EmailJobData,
  options?: JobsOptions
) => {
  try {
    const job = await emailQueue.add(`send_email_${data.template.toLowerCase()}`, data, options);
    logger.debug({ jobId: job.id, to: data.to, template: data.template }, 'Email job enqueued');
    return job;
  } catch (error) {
    logger.error({ error, data }, 'Failed to enqueue email job');
    throw error;
  }
};
