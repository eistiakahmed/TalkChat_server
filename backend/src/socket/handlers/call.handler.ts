import { Socket, Server } from 'socket.io';
import { CallType, CallStatus, MessageType, ConversationType } from '@prisma/client';
import { prisma } from '../../config/database.config.js';
import { SocketEvents } from '../../constants/socketEvents.js';
import { dispatchNotification } from '../../queues/producer/notification.queue.js';
import { logger } from '../../utils/logger.js';

/**
 * Record a persistent call log message in the conversation and notify both participants in real-time.
 */
async function recordCallMessageInConversation(
  io: Server,
  {
    callId,
    conversationId,
    callerId,
    receiverId,
    callType,
    status,
    duration = 0,
  }: {
    callId: string;
    conversationId?: string | null;
    callerId: string;
    receiverId: string;
    callType: CallType | string;
    status: CallStatus | string;
    duration?: number | null;
  }
) {
  try {
    let convId = conversationId;
    if (!convId) {
      const directConv = await prisma.conversation.findFirst({
        where: {
          type: ConversationType.DIRECT,
          AND: [
            { members: { some: { userId: callerId, leftAt: null } } },
            { members: { some: { userId: receiverId, leftAt: null } } },
          ],
        },
        select: { id: true },
      });
      if (directConv) {
        convId = directConv.id;
      }
    }

    if (!convId) {
      logger.warn({ callId, callerId, receiverId }, 'No conversation found to record call log message');
      return;
    }

    const payload = {
      _type: 'CALL_LOG',
      callId,
      callType,
      status,
      duration: duration ?? 0,
      callerId,
      receiverId,
    };

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: convId!,
          senderId: callerId,
          type: MessageType.SYSTEM,
          content: JSON.stringify(payload),
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      await tx.conversation.update({
        where: { id: convId! },
        data: {
          lastMessageId: msg.id,
          lastMessageAt: msg.createdAt,
        },
      });

      return msg;
    });

    // Real-time broadcast to conversation room and both users
    io.to(`conversation:${convId}`).emit(SocketEvents.MESSAGE_NEW, {
      message,
      conversationId: convId,
    });
    io.to(`user:${callerId}`).emit(SocketEvents.MESSAGE_NEW, {
      message,
      conversationId: convId,
    });
    io.to(`user:${receiverId}`).emit(SocketEvents.MESSAGE_NEW, {
      message,
      conversationId: convId,
    });

    logger.info({ callId, convId, status, duration }, 'Call message recorded in conversation');
  } catch (err) {
    logger.error({ err, callId }, 'Failed to record call message in conversation');
  }
}

/**
 * In-memory map of active call ringing timeouts.
 * Key: callId, Value: NodeJS.Timeout
 */
const activeCallTimeouts = new Map<string, NodeJS.Timeout>();

/**
 * WebRTC 1-to-1 Audio & Video Call Signaling Socket Event Handler.
 * 
 * Manages the full lifecycle of real-time WebRTC call signaling:
 * 1. Verification of blocking permissions between caller and recipient.
 * 2. Real-time routing of Session Description Protocol (SDP) Offers and Answers.
 * 3. Bidirectional Trickle ICE Candidate exchange.
 * 4. Call State Machine (INITIATED -> RINGING -> ACCEPTED -> ENDED / REJECTED / MISSED).
 * 5. Ringing timeout orchestration (45-second window).
 * 6. Precise call duration tracking and persistent database CallLog synchronization.
 * 
 * @see https://webrtc.org/getting-started/peer-connections
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling
 */
export const registerCallHandlers = (io: Server, socket: Socket): void => {
  const userId = socket.data.userId as string;

  /**
   * Initiate 1-to-1 WebRTC Call with SDP Offer.
   */
  socket.on(
    SocketEvents.CALL_INITIATE,
    async (
      payload: {
        recipientId: string;
        type: 'AUDIO' | 'VIDEO';
        offerSdp: unknown;
        conversationId?: string;
      },
      callback?: (res: { success: boolean; callId?: string; error?: string }) => void
    ) => {
      try {
        const { recipientId, type = 'AUDIO', offerSdp, conversationId } = payload;
        if (!recipientId || !offerSdp) {
          const error = 'Recipient ID and SDP Offer are required';
          if (typeof callback === 'function') callback({ success: false, error });
          socket.emit(SocketEvents.ERROR, { message: error });
          return;
        }

        if (recipientId === userId) {
          const error = 'Cannot call yourself';
          if (typeof callback === 'function') callback({ success: false, error });
          socket.emit(SocketEvents.ERROR, { message: error });
          return;
        }

        // Check bidirectional blocking constraints
        const isBlocked = await prisma.blockedUser.findFirst({
          where: {
            OR: [
              { blockerId: userId, blockedId: recipientId },
              { blockerId: recipientId, blockedId: userId },
            ],
          },
        });

        if (isBlocked) {
          const error = 'Unable to initiate call because communication with this user is blocked';
          if (typeof callback === 'function') callback({ success: false, error });
          socket.emit(SocketEvents.ERROR, {
            message: error,
            code: 'BLOCKED',
          });
          return;
        }

        // Resolve or find direct conversation ID if not provided
        let resolvedConvId = conversationId;
        if (!resolvedConvId) {
          const directConv = await prisma.conversation.findFirst({
            where: {
              type: ConversationType.DIRECT,
              AND: [
                { members: { some: { userId, leftAt: null } } },
                { members: { some: { userId: recipientId, leftAt: null } } },
              ],
            },
            select: { id: true },
          });
          if (directConv) {
            resolvedConvId = directConv.id;
          }
        }

        // Persist CallLog in database
        const call = await prisma.callLog.create({
          data: {
            callerId: userId,
            receiverId: recipientId,
            conversationId: resolvedConvId,
            type: type === 'VIDEO' ? CallType.VIDEO : CallType.AUDIO,
            status: CallStatus.INITIATED,
          },
          include: {
            caller: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        });

        // Forward incoming call invitation to recipient's personal socket room
        io.to(`user:${recipientId}`).emit(SocketEvents.CALL_INCOMING, {
          callId: call.id,
          caller: call.caller,
          type: call.type,
          offerSdp,
          conversationId: resolvedConvId,
        });

        // Acknowledge initiation back to caller via both callback and event
        if (typeof callback === 'function') {
          callback({ success: true, callId: call.id });
        }
        socket.emit('call:initiated', { callId: call.id });
        logger.info({ callId: call.id, callerId: userId, recipientId, type }, 'WebRTC Call initiated');

        // Check if recipient has active socket connections
        const recipientSockets = await io.in(`user:${recipientId}`).fetchSockets();
        const isConnected = recipientSockets && recipientSockets.length > 0;
        if (!isConnected) {
          socket.emit('call:ringing', { callId: call.id, isOnline: false });
          // Dispatch push notification to reach offline mobile device
          dispatchNotification({
            userId: recipientId,
            senderId: userId,
            title: `Incoming ${call.type.toLowerCase()} call`,
            body: `${call.caller.fullName || call.caller.username} is calling you`,
            data: { callId: call.id, type: call.type, conversationId },
          }).catch((err) => logger.warn({ err, callId: call.id }, 'Failed to enqueue push call notification'));
        }

        // Set 45-second ringing timeout
        const timeout = setTimeout(async () => {
          activeCallTimeouts.delete(call.id);

          const currentCall = await prisma.callLog.findUnique({
            where: { id: call.id },
          });

          if (
            currentCall &&
            (currentCall.status === CallStatus.INITIATED || currentCall.status === CallStatus.RINGING)
          ) {
            await prisma.callLog.update({
              where: { id: call.id },
              data: {
                status: CallStatus.MISSED,
                endedAt: new Date(),
                endReason: 'TIMEOUT',
              },
            });

            // Notify both parties of missed call
            io.to(`user:${userId}`).emit(SocketEvents.CALL_MISSED, { callId: call.id });
            io.to(`user:${recipientId}`).emit(SocketEvents.CALL_MISSED, { callId: call.id });

            // Persist missed call message in conversation
            await recordCallMessageInConversation(io, {
              callId: call.id,
              conversationId: call.conversationId || currentCall.conversationId,
              callerId: userId,
              receiverId: recipientId,
              callType: call.type,
              status: CallStatus.MISSED,
              duration: 0,
            });

            // Enqueue background push notification for missed call
            dispatchNotification({
              userId: recipientId,
              senderId: userId,
              title: `Missed ${call.type.toLowerCase()} call`,
              body: `${call.caller.fullName || call.caller.username} called you`,
              data: { callId: call.id, type: call.type },
            }).catch((err) => logger.warn({ err, callId: call.id }, 'Failed to enqueue missed call notification'));

            logger.info({ callId: call.id }, 'Call timed out -> marked MISSED');
          }
        }, 45000);

        activeCallTimeouts.set(call.id, timeout);
      } catch (error) {
        logger.error({ error, userId, payload }, 'Error initiating WebRTC call');
        socket.emit(SocketEvents.ERROR, { message: 'Internal error initiating call' });
      }
    }
  );

  /**
   * Recipient device reports ringing alert state.
   */
  socket.on(SocketEvents.CALL_RINGING, async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      if (!callId) return;

      const call = await prisma.callLog.findUnique({ where: { id: callId } });
      if (!call) return;

      if (call.status === CallStatus.INITIATED) {
        await prisma.callLog.update({
          where: { id: callId },
          data: { status: CallStatus.RINGING },
        });
      }

      // Relay ringing state to caller
      io.to(`user:${call.callerId}`).emit(SocketEvents.CALL_RINGING, { callId });
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error handling call ringing');
    }
  });

  /**
   * Recipient accepts call and provides SDP Answer.
   */
  socket.on(SocketEvents.CALL_ACCEPT, async (payload: { callId?: string; answerSdp?: unknown }) => {
    try {
      const { callId, answerSdp = { type: 'answer', sdp: 'accepted-sdp' } } = payload || {};

      let call = (callId && callId !== 'pending')
        ? await prisma.callLog.findUnique({ where: { id: callId } }).catch(() => null)
        : null;

      // Fallback: locate the latest ringing, initiated, or accepted call involving this user
      if (!call) {
        call = await prisma.callLog.findFirst({
          where: {
            OR: [{ receiverId: userId }, { callerId: userId }],
            status: { in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED] },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!call) {
        logger.warn({ userId, callId }, 'Call accept failed: No active call found');
        socket.emit(SocketEvents.ERROR, { message: 'Call not found or already ended' });
        return;
      }

      const activeCallId = call.id;
      const timeout = activeCallTimeouts.get(activeCallId);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(activeCallId);
      }

      const answeredAt = new Date();
      await prisma.callLog.update({
        where: { id: activeCallId },
        data: {
          status: CallStatus.ACCEPTED,
          answeredAt,
        },
      });

      // Relay accepted signal to caller's private channel
      io.to(`user:${call.callerId}`).emit(SocketEvents.CALL_ACCEPTED, {
        callId: activeCallId,
        answerSdp,
      });

      // Also ensure receiver's channel and socket receive confirmation
      io.to(`user:${call.receiverId}`).emit(SocketEvents.CALL_ACCEPTED, {
        callId: activeCallId,
        answerSdp,
      });
      socket.emit(SocketEvents.CALL_ACCEPTED, {
        callId: activeCallId,
        answerSdp,
      });

      logger.info(
        { callId: activeCallId, callerId: call.callerId, receiverId: call.receiverId },
        'WebRTC Call accepted & relayed to both peers'
      );
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error accepting WebRTC call');
    }
  });

  /**
   * Recipient rejects or declines incoming call.
   */
  socket.on(SocketEvents.CALL_REJECT, async (payload: { callId?: string; reason?: 'DECLINED' | 'BUSY' }) => {
    try {
      const { callId, reason = 'DECLINED' } = payload || {};

      let call = (callId && callId !== 'pending')
        ? await prisma.callLog.findUnique({ where: { id: callId } }).catch(() => null)
        : null;

      if (!call) {
        call = await prisma.callLog.findFirst({
          where: {
            OR: [{ callerId: userId }, { receiverId: userId }],
            status: { in: [CallStatus.INITIATED, CallStatus.RINGING] },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!call) return;

      const timeout = activeCallTimeouts.get(call.id);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(call.id);
      }

      const finalStatus = reason === 'BUSY' ? CallStatus.BUSY : CallStatus.REJECTED;

      await prisma.callLog.update({
        where: { id: call.id },
        data: {
          status: finalStatus,
          endedAt: new Date(),
          endReason: reason,
        },
      });

      // Relay rejection back to caller
      io.to(`user:${call.callerId}`).emit(SocketEvents.CALL_REJECTED, {
        callId: call.id,
        reason,
      });

      // Persist rejected / busy call message in conversation
      await recordCallMessageInConversation(io, {
        callId: call.id,
        conversationId: call.conversationId,
        callerId: call.callerId,
        receiverId: call.receiverId,
        callType: call.type,
        status: finalStatus,
        duration: 0,
      });

      logger.info({ callId: call.id, reason }, 'WebRTC Call rejected');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error rejecting WebRTC call');
    }
  });

  /**
   * Exchange Trickle ICE Candidates between peers.
   */
  socket.on(
    SocketEvents.CALL_ICE_CANDIDATE,
    async (payload: { callId: string; targetUserId?: string; candidate: unknown }) => {
      try {
        const { callId, candidate } = payload || {};
        let targetUserId = payload?.targetUserId;
        if (!callId || !candidate) return;

        if (!targetUserId) {
          const call = (callId !== 'pending')
            ? await prisma.callLog.findUnique({ where: { id: callId } }).catch(() => null)
            : null;
          if (call) {
            targetUserId = call.callerId === userId ? call.receiverId : call.callerId;
          }
        }

        if (targetUserId) {
          io.to(`user:${targetUserId}`).emit(SocketEvents.CALL_ICE_CANDIDATE, {
            callId,
            candidate,
          });
        }
      } catch (err) {
        logger.error({ err, userId }, 'Error handling ICE candidate routing');
      }
    }
  );

  /**
   * Terminate/hang up an active or ringing call.
   */
  socket.on(SocketEvents.CALL_END, async (payload: { callId?: string }) => {
    try {
      const { callId } = payload || {};

      let call = (callId && callId !== 'pending')
        ? await prisma.callLog.findUnique({ where: { id: callId } }).catch(() => null)
        : null;

      if (!call) {
        call = await prisma.callLog.findFirst({
          where: {
            OR: [{ callerId: userId }, { receiverId: userId }],
            status: { in: [CallStatus.INITIATED, CallStatus.RINGING, CallStatus.ACCEPTED] },
          },
          orderBy: { createdAt: 'desc' },
        });
      }

      if (!call || call.status === CallStatus.ENDED) return;

      const timeout = activeCallTimeouts.get(call.id);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(call.id);
      }

      const endedAt = new Date();
      let duration: number | null = null;

      if (call.answeredAt) {
        duration = Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000));
      }

      await prisma.callLog.update({
        where: { id: call.id },
        data: {
          status: CallStatus.ENDED,
          endedAt,
          duration,
          endReason: 'NORMAL',
        },
      });

      // Notify peer that the call has ended
      const peerId = call.callerId === userId ? call.receiverId : call.callerId;
      io.to(`user:${peerId}`).emit(SocketEvents.CALL_ENDED, {
        callId: call.id,
        duration,
        endedAt: endedAt.toISOString(),
      });

      socket.emit(SocketEvents.CALL_ENDED, {
        callId: call.id,
        duration,
        endedAt: endedAt.toISOString(),
      });

      // Persist call ended or cancelled message in conversation
      await recordCallMessageInConversation(io, {
        callId: call.id,
        conversationId: call.conversationId,
        callerId: call.callerId,
        receiverId: call.receiverId,
        callType: call.type,
        status: call.answeredAt ? CallStatus.ENDED : 'CANCELLED',
        duration,
      });

      logger.info({ callId: call.id, duration }, 'WebRTC Call ended');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error ending WebRTC call');
    }
  });
};
