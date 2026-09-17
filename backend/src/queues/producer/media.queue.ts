import { Queue, JobsOptions } from 'bullmq';
import { queueRedisConnection, defaultJobOptions, QueueNames } from '../queue.config.js';
import { MediaJobData } from '../queue.types.js';
import { logger } from '../../utils/logger.js';

/**
 * BullMQ Media Processing Queue Producer.
 * 
 * Offloads heavy media tasks (video thumbnail generation, audio waveform computation,
 * image compression, remote cloud asset deletion) to dedicated background worker processes.
 * 
 * @see https://docs.bullmq.io/guide/queues
 */
export const mediaQueue = new Queue<MediaJobData>(QueueNames.MEDIA, {
  connection: queueRedisConnection,
  defaultJobOptions,
});

/**
 * Enqueue an asynchronous media processing job.
 * 
 * @param data - Media processing parameters
 * @param options - Optional custom BullMQ job options
 * @returns The enqueued Job instance
 */
export const dispatchMediaJob = async (
  data: MediaJobData,
  options?: JobsOptions
) => {
  try {
    const job = await mediaQueue.add(`media_${data.action.toLowerCase()}`, data, options);
    logger.debug({ jobId: job.id, action: data.action, mimeType: data.mimeType }, 'Media job enqueued');
    return job;
  } catch (error) {
    logger.error({ error, data }, 'Failed to enqueue media job');
    throw error;
  }
};
