import { Worker } from 'bullmq';
import { createNotificationWorker } from './notification.worker.js';
import { createEmailWorker } from './email.worker.js';
import { createMediaWorker } from './media.worker.js';
import { createEphemeralWorker } from './ephemeral.worker.js';
import { logger } from '../../utils/logger.js';

let notificationWorker: Worker | null = null;
let emailWorker: Worker | null = null;
let mediaWorker: Worker | null = null;
let ephemeralWorker: Worker | null = null;

/**
 * Initialize all BullMQ background workers.
 * 
 * Spawns worker listeners for notification, transactional email,
 * media processing, and ephemeral purge queues.
 * 
 * @see https://docs.bullmq.io/guide/workers
 */
export const initWorkers = (): void => {
  if (notificationWorker || emailWorker || mediaWorker || ephemeralWorker) {
    logger.warn('BullMQ workers are already running');
    return;
  }

  try {
    notificationWorker = createNotificationWorker();
    emailWorker = createEmailWorker();
    mediaWorker = createMediaWorker();
    ephemeralWorker = createEphemeralWorker();

    logger.info('BullMQ background workers initialized successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize BullMQ background workers');
  }
};

/**
 * Gracefully stop and close all active BullMQ workers.
 * 
 * Ensures currently executing jobs are allowed to complete before closing Redis connections,
 * avoiding stalled jobs or lost lock tokens in Redis.
 * 
 * @see https://docs.bullmq.io/guide/workers/graceful-shutdown
 */
export const stopWorkers = async (): Promise<void> => {
  logger.info('Shutting down BullMQ workers...');

  const closePromises: Promise<void>[] = [];

  if (notificationWorker) {
    closePromises.push(notificationWorker.close());
    notificationWorker = null;
  }

  if (emailWorker) {
    closePromises.push(emailWorker.close());
    emailWorker = null;
  }

  if (mediaWorker) {
    closePromises.push(mediaWorker.close());
    mediaWorker = null;
  }

  if (ephemeralWorker) {
    closePromises.push(ephemeralWorker.close());
    ephemeralWorker = null;
  }

  await Promise.allSettled(closePromises);
  logger.info('All BullMQ workers stopped gracefully');
};
