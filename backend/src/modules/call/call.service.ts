import { CallType, CallStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.config.js';
import { NotFoundError, ForbiddenError } from '../../errors/AppError.js';
import { GetCallHistoryInput, GetCallDetailsInput } from './call.validation.js';

/**
 * WebRTC Call History and Log Management Service.
 * 
 * Provides high-performance cursor pagination over historical call records,
 * filtering by call type (audio/video) or status, with strict OWASP BOLA authorization.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination
 * @see https://owasp.org/www-project-api-security/
 */
export class CallService {
  /**
   * Retrieve cursor-paginated call history for the authenticated user.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Limit, cursor, call type, and call status filter
   */
  async getCallHistory(userId: string, input: GetCallHistoryInput) {
    const limit = Number(input.limit) || 20;

    const whereClause: Prisma.CallLogWhereInput = {
      OR: [{ callerId: userId }, { receiverId: userId }],
    };

    if (input.type) {
      whereClause.type = input.type === 'VIDEO' ? CallType.VIDEO : CallType.AUDIO;
    }

    if (input.status) {
      whereClause.status = input.status as CallStatus;
    }

    const calls = await prisma.callLog.findMany({
      where: whereClause,
      take: limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        caller: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    const hasMore = calls.length > limit;
    const records = hasMore ? calls.slice(0, limit) : calls;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      calls: records,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Retrieve detailed call log record.
   * 
   * Enforces BOLA protection: user must be either caller or receiver.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Call ID
   */
  async getCallDetails(userId: string, input: GetCallDetailsInput) {
    const call = await prisma.callLog.findUnique({
      where: { id: input.callId },
      include: {
        caller: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            isOnline: true,
          },
        },
        receiver: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
            isOnline: true,
          },
        },
      },
    });

    if (!call) {
      throw new NotFoundError('Call record not found', 'call.not_found');
    }

    if (call.callerId !== userId && call.receiverId !== userId) {
      throw new ForbiddenError(
        'You do not have permission to view this call record',
        'call.unauthorized_access'
      );
    }

    return call;
  }
}

export const callService = new CallService();
