import { Worker, Job } from 'bullmq';
import { queueRedisConnection, QueueNames } from '../queue.config.js';
import { EphemeralPurgeJobData } from '../queue.types.js';
import { prisma } from '../../config/database.config.js';
import { cloudinary } from '../../config/cloudinary.config.js';
import { getIO } from '../../socket/socket.server.js';
import { SocketEvents } from '../../constants/socketEvents.js';
import { logger } from '../../utils/logger.js';

/**
 * Sweeps and purges stories whose 24-hour expiration window has elapsed.
 * Also cleans up remote media assets from Cloudinary storage.
 * 
 * @returns Object containing number of deleted stories and cleaned assets
 * @see https://cloudinary.com/documentation/image_upload_api_reference#destroy_method
 */
export const purgeExpiredStories = async (): Promise<{ purgedCount: number; mediaCleaned: number }> => {
  const now = new Date();
  const expiredStories = await prisma.story.findMany({
    where: {
      expiresAt: { lte: now },
    },
    select: {
      id: true,
      mediaPublicId: true,
    },
  });

  if (expiredStories.length === 0) {
    return { purgedCount: 0, mediaCleaned: 0 };
  }

  let mediaCleaned = 0;
  for (const story of expiredStories) {
    if (story.mediaPublicId) {
      try {
        await cloudinary.uploader.destroy(story.mediaPublicId);
        mediaCleaned++;
      } catch (error) {
        logger.warn({ error, publicId: story.mediaPublicId }, 'Failed to delete story media from Cloudinary');
      }
    }
  }

  const deleteResult = await prisma.story.deleteMany({
    where: {
      id: { in: expiredStories.map((s) => s.id) },
    },
  });

  logger.info(
    { purgedCount: deleteResult.count, mediaCleaned },
    'Expired stories background cleanup completed'
  );

  return { purgedCount: deleteResult.count, mediaCleaned };
};

/**
 * Sweeps and purges disappearing messages that have reached their expiration timestamp.
 * Emits real-time `message:disappeared` socket events to conversation rooms.
 * 
 * @returns Object containing number of expired messages processed
 */
export const purgeExpiredMessages = async (): Promise<{ purgedCount: number }> => {
  const now = new Date();
  const expiredMessages = await prisma.message.findMany({
    where: {
      expiresAt: { lte: now },
      isDeleted: false,
    },
    select: {
      id: true,
      conversationId: true,
    },
  });

  if (expiredMessages.length === 0) {
    return { purgedCount: 0 };
  }

  const messageIds = expiredMessages.map((m) => m.id);

  // Soft-delete and clear sensitive content for expired messages
  await prisma.message.updateMany({
    where: { id: { in: messageIds } },
    data: {
      isDeleted: true,
      content: 'This message has disappeared',
    },
  });

  // Broadcast real-time message:disappeared events to respective conversation rooms
  try {
    const io = getIO();
    for (const msg of expiredMessages) {
      io.to(`conversation:${msg.conversationId}`).emit(SocketEvents.MESSAGE_DISAPPEARED, {
        messageId: msg.id,
        conversationId: msg.conversationId,
        disappearedAt: now.toISOString(),
      });
    }
  } catch (socketError) {
    // Socket server may not be active during standalone queue workers
    logger.debug({ error: socketError }, 'Socket.io unavailable during ephemeral purge broadcast');
  }

  logger.info({ purgedCount: expiredMessages.length }, 'Disappearing messages background cleanup completed');
  return { purgedCount: expiredMessages.length };
};

/**
 * Purges a single disappearing message and notifies the conversation room.
 * 
 * @param messageId - UUID of the message
 * @param conversationId - UUID of the conversation
 */
export const purgeSingleMessage = async (
  messageId: string,
  conversationId?: string
): Promise<boolean> => {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, expiresAt: true, isDeleted: true },
  });

  if (!message || message.isDeleted) {
    return false;
  }

  const now = new Date();
  if (message.expiresAt && message.expiresAt <= now) {
    await prisma.message.update({
      where: { id: messageId },
      data: {
        isDeleted: true,
        content: 'This message has disappeared',
      },
    });

    try {
      const io = getIO();
      const targetRoom = `conversation:${conversationId || message.conversationId}`;
      io.to(targetRoom).emit(SocketEvents.MESSAGE_DISAPPEARED, {
        messageId: message.id,
        conversationId: conversationId || message.conversationId,
        disappearedAt: now.toISOString(),
      });
    } catch {
      // Ignore if socket not ready
    }

    logger.info({ messageId }, 'Single disappearing message purged successfully');
    return true;
  }

  return false;
};

/**
 * BullMQ Ephemeral Processing Background Worker.
 * 
 * Consumes ephemeral purge jobs:
 * 1. Purges expired stories & associated Cloudinary media.
 * 2. Purges expired disappearing messages & notifies active clients via WebSocket.
 * 
 * @see https://docs.bullmq.io/guide/workers
 */
export const createEphemeralWorker = (): Worker<EphemeralPurgeJobData> => {
  const worker = new Worker<EphemeralPurgeJobData>(
    QueueNames.EPHEMERAL,
    async (job: Job<EphemeralPurgeJobData>) => {
      const { type, messageId, conversationId } = job.data;
      logger.info({ jobId: job.id, type, messageId }, 'Processing ephemeral background job');

      if (type === 'PURGE_SINGLE_MESSAGE' && messageId) {
        await purgeSingleMessage(messageId, conversationId);
        return { success: true, type, messageId };
      }

      if (type === 'PURGE_EXPIRED_STORIES') {
        const result = await purgeExpiredStories();
        return { success: true, type, ...result };
      }

      if (type === 'PURGE_EXPIRED_MESSAGES') {
        const result = await purgeExpiredMessages();
        return { success: true, type, ...result };
      }

      return { success: true, type };
    },
    {
      connection: queueRedisConnection,
      concurrency: 2,
    }
  );

  worker.on('completed', (job) => {
    logger.debug({ jobId: job.id, type: job.data.type }, 'Ephemeral purge job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, type: job?.data?.type, err: err.message },
      'Ephemeral purge job failed'
    );
  });

  return worker;
};
