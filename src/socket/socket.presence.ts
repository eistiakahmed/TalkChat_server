import { Server } from 'socket.io';
import { redis } from '../config/redis.config.js';
import { prisma } from '../config/database.config.js';
import { logger } from '../utils/logger.js';
import { SocketEvents } from '../constants/socketEvents.js';

/**
 * Distributed User Presence Tracker.
 * 
 * Tracks online and offline status across distributed server nodes using Redis sets:
 * - `online_users`: Global set of active user IDs.
 * - `user:sockets:{userId}`: Set of active Socket IDs associated with a specific user account.
 * 
 * Handles multi-device/multi-tab synchronization:
 * - A user is considered ONLINE as long as at least 1 socket is active.
 * - A user transitions to OFFLINE only when their last remaining socket disconnects.
 * 
 * @see https://redis.io/commands/sadd/
 * @see https://redis.io/commands/srem/
 * @see https://redis.io/commands/scard/
 */
export class PresenceTracker {
  /**
   * Handle user socket connection and update presence status.
   * 
   * @param io - Socket.io Server instance
   * @param userId - Connected user UUID
   * @param socketId - Connected socket client identifier
   */
  async handleUserConnect(io: Server, userId: string, socketId: string): Promise<void> {
    try {
      const userSocketsKey = `user:sockets:${userId}`;
      await redis.sadd(userSocketsKey, socketId);
      await redis.expire(userSocketsKey, 86400); // 24h safety expiry
      await redis.sadd('online_users', userId);

      await prisma.user.update({
        where: { id: userId },
        data: { isOnline: true },
      }).catch((err) => {
        logger.error({ err, userId }, 'Failed to persist user isOnline state in DB');
      });

      // Send the complete current roster of online users to the newly connected socket
      const onlineUserIds = await redis.smembers('online_users');
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('presence:roster', {
          onlineUserIds: onlineUserIds || [userId],
        });
      }

      // Broadcast presence change to all connected clients
      io.emit(SocketEvents.USER_ONLINE, {
        userId,
        isOnline: true,
      });

      logger.info({ userId, socketId, totalOnline: onlineUserIds?.length }, 'User presence transitioned to ONLINE');
    } catch (error) {
      logger.error({ error, userId, socketId }, 'Error handling socket connect presence');
    }
  }

  /**
   * Refresh presence heartbeat from an active client.
   */
  async handleHeartbeat(userId: string, socketId: string): Promise<void> {
    try {
      const userSocketsKey = `user:sockets:${userId}`;
      await redis.sadd(userSocketsKey, socketId);
      await redis.expire(userSocketsKey, 86400);
      await redis.sadd('online_users', userId);
    } catch (error) {
      logger.debug({ error, userId }, 'Error processing presence heartbeat');
    }
  }

  /**
   * Handle socket disconnection and update presence status.
   * 
   * @param io - Socket.io Server instance
   * @param userId - Disconnected user UUID
   * @param socketId - Disconnected socket client identifier
   */
  async handleUserDisconnect(io: Server, userId: string, socketId: string): Promise<void> {
    try {
      const userSocketsKey = `user:sockets:${userId}`;
      await redis.srem(userSocketsKey, socketId);

      // Verify truly connected active sockets in Socket.io room
      const liveSockets = await io.in(`user:${userId}`).fetchSockets();
      const remainingSockets = liveSockets.filter((s) => s.id !== socketId);

      logger.info(
        { userId, socketId, remainingLiveCount: remainingSockets.length },
        'Presence disconnect check'
      );

      // If no active sockets remain for this user, transition status to OFFLINE
      if (remainingSockets.length === 0) {
        await redis.del(userSocketsKey);
        await redis.srem('online_users', userId);
        const lastSeen = new Date();

        await prisma.user.update({
          where: { id: userId },
          data: {
            isOnline: false,
            lastSeen,
          },
        }).catch((err) => {
          logger.error({ err, userId }, 'Failed to persist user isOffline state in DB');
        });

        // Broadcast presence change to all connected clients
        io.emit(SocketEvents.USER_OFFLINE, {
          userId,
          isOnline: false,
          lastSeen: lastSeen.toISOString(),
        });

        logger.info({ userId, socketId }, 'User presence transitioned to OFFLINE');
      } else {
        // Prune stale socket IDs from Redis and retain only truly active ones
        await redis.del(userSocketsKey);
        await redis.sadd(userSocketsKey, ...remainingSockets.map((s) => s.id));
        await redis.expire(userSocketsKey, 86400);
      }
    } catch (error) {
      logger.error({ error, userId, socketId }, 'Error handling socket disconnect presence');
    }
  }

  /**
   * Synchronize online presence on server boot or restart.
   * Reconciles Redis sets and marks orphaned online users as offline in the DB.
   */
  async syncStartupPresence(io: Server): Promise<void> {
    try {
      const liveSockets = await io.fetchSockets();
      const liveUserIds = new Set<string>();
      for (const s of liveSockets) {
        const uid = s.data?.userId;
        if (uid) liveUserIds.add(uid);
      }

      await redis.del('online_users');
      if (liveUserIds.size > 0) {
        await redis.sadd('online_users', ...Array.from(liveUserIds));
      }

      // Mark all users who are not currently connected as offline in DB
      await prisma.user.updateMany({
        where: {
          id: { notIn: Array.from(liveUserIds) },
          isOnline: true,
        },
        data: {
          isOnline: false,
          lastSeen: new Date(),
        },
      });

      logger.info(
        { liveUsersCount: liveUserIds.size },
        'User presence successfully synchronized on server startup'
      );
    } catch (error) {
      logger.error({ error }, 'Error syncing presence on startup');
    }
  }

  /**
   * Check if a specific user is currently online.
   * 
   * @param userId - Target user UUID
   * @returns Boolean indicating presence status
   */
  async isUserOnline(userId: string): Promise<boolean> {
    const isMember = await redis.sismember('online_users', userId);
    return isMember === 1;
  }

  /**
   * Retrieve all currently online user IDs.
   * 
   * @returns Array of online user UUIDs
   */
  async getOnlineUsers(): Promise<string[]> {
    return redis.smembers('online_users');
  }
}

export const presenceTracker = new PresenceTracker();
