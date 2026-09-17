import { Socket, Server } from 'socket.io';
import { CallType, CallStatus } from '@prisma/client';
import { prisma } from '../../config/database.config.js';
import { SocketEvents } from '../../constants/socketEvents.js';
import { dispatchNotification } from '../../queues/producer/notification.queue.js';
import { logger } from '../../utils/logger.js';

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
    async (payload: {
      recipientId: string;
      type: 'AUDIO' | 'VIDEO';
      offerSdp: unknown;
      conversationId?: string;
    }) => {
      try {
        const { recipientId, type = 'AUDIO', offerSdp, conversationId } = payload;
        if (!recipientId || !offerSdp) {
          socket.emit(SocketEvents.ERROR, { message: 'Recipient ID and SDP Offer are required' });
          return;
        }

        if (recipientId === userId) {
          socket.emit(SocketEvents.ERROR, { message: 'Cannot call yourself' });
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
          socket.emit(SocketEvents.ERROR, {
            message: 'Unable to initiate call because communication with this user is blocked',
            code: 'BLOCKED',
          });
          return;
        }

        // Persist CallLog in database
        const call = await prisma.callLog.create({
          data: {
            callerId: userId,
            receiverId: recipientId,
            conversationId,
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
          conversationId,
        });

        // Acknowledge initiation back to caller
        socket.emit('call:initiated', { callId: call.id });
        logger.info({ callId: call.id, callerId: userId, recipientId, type }, 'WebRTC Call initiated');

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
  socket.on(SocketEvents.CALL_ACCEPT, async (payload: { callId: string; answerSdp: unknown }) => {
    try {
      const { callId, answerSdp } = payload;
      if (!callId || !answerSdp) return;

      const timeout = activeCallTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(callId);
      }

      const call = await prisma.callLog.findUnique({ where: { id: callId } });
      if (!call || call.receiverId !== userId) {
        socket.emit(SocketEvents.ERROR, { message: 'Call not found or unauthorized' });
        return;
      }

      const answeredAt = new Date();
      await prisma.callLog.update({
        where: { id: callId },
        data: {
          status: CallStatus.ACCEPTED,
          answeredAt,
        },
      });

      // Relay SDP answer back to caller
      io.to(`user:${call.callerId}`).emit(SocketEvents.CALL_ACCEPTED, {
        callId,
        answerSdp,
      });

      logger.info({ callId, answeredAt }, 'WebRTC Call accepted');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error accepting WebRTC call');
    }
  });

  /**
   * Recipient rejects or declines incoming call.
   */
  socket.on(SocketEvents.CALL_REJECT, async (payload: { callId: string; reason?: 'DECLINED' | 'BUSY' }) => {
    try {
      const { callId, reason = 'DECLINED' } = payload;
      if (!callId) return;

      const timeout = activeCallTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(callId);
      }

      const call = await prisma.callLog.findUnique({ where: { id: callId } });
      if (!call) return;

      const finalStatus = reason === 'BUSY' ? CallStatus.BUSY : CallStatus.REJECTED;

      await prisma.callLog.update({
        where: { id: callId },
        data: {
          status: finalStatus,
          endedAt: new Date(),
          endReason: reason,
        },
      });

      // Relay rejection back to caller
      io.to(`user:${call.callerId}`).emit(SocketEvents.CALL_REJECTED, {
        callId,
        reason,
      });

      logger.info({ callId, reason }, 'WebRTC Call rejected');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error rejecting WebRTC call');
    }
  });

  /**
   * Exchange Trickle ICE Candidates between peers.
   */
  socket.on(
    SocketEvents.CALL_ICE_CANDIDATE,
    (payload: { callId: string; targetUserId: string; candidate: unknown }) => {
      const { callId, targetUserId, candidate } = payload;
      if (!callId || !targetUserId || !candidate) return;

      // Relay ICE candidate directly to target peer socket room
      io.to(`user:${targetUserId}`).emit(SocketEvents.CALL_ICE_CANDIDATE, {
        callId,
        candidate,
      });
    }
  );

  /**
   * Terminate/hang up an active or ringing call.
   */
  socket.on(SocketEvents.CALL_END, async (payload: { callId: string }) => {
    try {
      const { callId } = payload;
      if (!callId) return;

      const timeout = activeCallTimeouts.get(callId);
      if (timeout) {
        clearTimeout(timeout);
        activeCallTimeouts.delete(callId);
      }

      const call = await prisma.callLog.findUnique({ where: { id: callId } });
      if (!call || call.status === CallStatus.ENDED) return;

      const endedAt = new Date();
      let duration: number | null = null;

      if (call.answeredAt) {
        duration = Math.max(0, Math.round((endedAt.getTime() - call.answeredAt.getTime()) / 1000));
      }

      await prisma.callLog.update({
        where: { id: callId },
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
        callId,
        duration,
        endedAt: endedAt.toISOString(),
      });

      socket.emit(SocketEvents.CALL_ENDED, {
        callId,
        duration,
        endedAt: endedAt.toISOString(),
      });

      logger.info({ callId, duration }, 'WebRTC Call ended');
    } catch (error) {
      logger.error({ error, userId, payload }, 'Error ending WebRTC call');
    }
  });
};
