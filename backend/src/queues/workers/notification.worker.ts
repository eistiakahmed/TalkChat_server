import { Worker, Job } from 'bullmq';
import { queueRedisConnection, QueueNames } from '../queue.config.js';
import { NotificationJobData } from '../queue.types.js';
import { prisma } from '../../config/database.config.js';
import { logger } from '../../utils/logger.js';

/**
 * BullMQ Push Notification Background Worker.
 * 
 * Consumes notification jobs from `talkchat:notification`:
 * 1. Checks conversation mute status for the recipient user.
 * 2. Formats push notification payload (compatible with FCM / APNS standards).
 * 3. Logs and simulates or dispatches remote push notification delivery.
 * 
 * @see https://docs.bullmq.io/guide/workers
 * @see https://docs.bullmq.io/guide/workers/concurrency
 */
export const createNotificationWorker = (): Worker<NotificationJobData> => {
  const worker = new Worker<NotificationJobData>(
    QueueNames.NOTIFICATION,
    async (job: Job<NotificationJobData>) => {
      const { userId, conversationId, title, body, data } = job.data;
      logger.info({ jobId: job.id, userId, conversationId }, 'Processing notification job');

      // Check if user has muted this conversation
      if (conversationId) {
        const member = await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId,
              userId,
            },
          },
          select: {
            isMuted: true,
            mutedUntil: true,
          },
        });

        if (member) {
          const isCurrentlyMuted =
            member.isMuted &&
            (!member.mutedUntil || new Date(member.mutedUntil) > new Date());

          if (isCurrentlyMuted) {
            logger.info({ userId, conversationId }, 'Notification skipped: conversation is muted by user');
            return { delivered: false, reason: 'MUTED' };
          }
        }
      }

      // Format push notification payload
      const pushPayload = {
        to: userId,
        notification: {
          title,
          body,
        },
        data: {
          conversationId,
          timestamp: new Date().toISOString(),
          ...data,
        },
      };

      // In production, dispatch via Firebase Admin SDK / WebPush
      logger.info({ pushPayload }, 'Push notification simulated/dispatched successfully');

      return { delivered: true, recipient: userId, timestamp: new Date().toISOString() };
    },
    {
      connection: queueRedisConnection,
      concurrency: 10,
      limiter: {
        max: 100,
        duration: 1000, // 100 notifications/second rate limit
      },
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Notification job completed successfully');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Notification job failed');
  });

  return worker;
};
