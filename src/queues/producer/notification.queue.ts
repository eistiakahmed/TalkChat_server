import { Queue, JobsOptions } from 'bullmq';
import { queueRedisConnection, defaultJobOptions, QueueNames } from '../queue.config.js';
import { NotificationJobData } from '../queue.types.js';
import { logger } from '../../utils/logger.js';

/**
 * BullMQ Push Notification Queue Producer.
 * 
 * Manages dispatching push notifications, chat alerts, and badge count updates
 * to background workers asynchronously without blocking HTTP/WebSocket response cycles.
 * 
 * @see https://docs.bullmq.io/guide/queues
 */
export const notificationQueue = new Queue<NotificationJobData>(QueueNames.NOTIFICATION, {
  connection: queueRedisConnection,
  defaultJobOptions,
});

/**
 * Enqueue a push notification job for an offline user.
 * 
 * @param data - Notification payload parameters
 * @param options - Optional custom BullMQ job options
 * @returns The enqueued Job instance
 */
export const dispatchNotification = async (
  data: NotificationJobData,
  options?: JobsOptions
) => {
  try {
    const job = await notificationQueue.add('send_notification', data, options);
    logger.debug({ jobId: job.id, userId: data.userId }, 'Notification job enqueued');
    return job;
  } catch (error) {
    logger.error({ error, data }, 'Failed to enqueue notification job');
    throw error;
  }
};
