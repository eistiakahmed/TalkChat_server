import { Socket, Server } from 'socket.io';
import { prisma } from '../../config/database.config.js';
import { SocketEvents } from '../../constants/socketEvents.js';
import { logger } from '../../utils/logger.js';

/**
 * Chat and Conversation Socket Event Handler.
 * 
 * Manages real-time room joining/leaving and typing status indicators.
 * Strictly verifies conversation membership before permitting room subscription.
 * 
 * @see https://socket.io/docs/v4/rooms/
 * @see https://owasp.org/www-project-api-security/ (BOLA / Room isolation)
 */
export const registerChatHandlers = (_io: Server, socket: Socket): void => {
  const userId = socket.data.userId as string;
  const username = socket.data.user?.username as string;

  /**
   * Handle joining a conversation room.
   * 
   * Validates that the requesting socket belongs to an active participant
   * of the conversation before binding the socket to room `conversation:${conversationId}`.
   */
  socket.on(SocketEvents.JOIN_ROOM, async (payload: { conversationId: string }) => {
    try {
      const { conversationId } = payload;
      if (!conversationId) return;

      const membership = await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId,
            userId,
          },
        },
      });

      if (!membership || membership.leftAt !== null) {
        logger.warn({ userId, conversationId }, 'Socket denied room access: not an active member');
        socket.emit(SocketEvents.ERROR, {
          message: 'You do not have permission to join this conversation room',
          code: 'FORBIDDEN',
        });
        return;
      }

      const roomName = `conversation:${conversationId}`;
      await socket.join(roomName);

      socket.emit(SocketEvents.ROOM_JOINED, { conversationId });
      logger.debug({ userId, roomName }, 'Socket joined conversation room');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error joining conversation room');
      socket.emit(SocketEvents.ERROR, { message: 'Internal socket error joining room' });
    }
  });

  /**
   * Handle leaving a conversation room.
   */
  socket.on(SocketEvents.LEAVE_ROOM, async (payload: { conversationId: string }) => {
    try {
      const { conversationId } = payload;
      if (!conversationId) return;

      const roomName = `conversation:${conversationId}`;
      await socket.leave(roomName);

      socket.emit(SocketEvents.ROOM_LEFT, { conversationId });
      logger.debug({ userId, roomName }, 'Socket left conversation room');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error leaving conversation room');
    }
  });

  /**
   * Handle typing indicator started.
   */
  socket.on(SocketEvents.TYPING_START, (payload: { conversationId: string }) => {
    const { conversationId } = payload;
    if (!conversationId) return;

    const roomName = `conversation:${conversationId}`;
    socket.to(roomName).emit(SocketEvents.TYPING_START, {
      conversationId,
      userId,
      username,
    });
  });

  /**
   * Handle typing indicator stopped.
   */
  socket.on(SocketEvents.TYPING_STOP, (payload: { conversationId: string }) => {
    const { conversationId } = payload;
    if (!conversationId) return;

    const roomName = `conversation:${conversationId}`;
    socket.to(roomName).emit(SocketEvents.TYPING_STOP, {
      conversationId,
      userId,
    });
  });
};
