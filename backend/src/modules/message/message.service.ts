import { MessageType, DeliveryStatus, MemberRole } from '@prisma/client';
import { prisma } from '../../config/database.config.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../errors/AppError.js';
import { uploadBufferToCloudinary } from '../../config/cloudinary.config.js';
import {
  SendMessageInput,
  GetMessageHistoryInput,
  EditMessageInput,
  DeleteMessageInput,
  ReactMessageInput,
  UpdateReceiptInput,
} from './message.validation.js';
import { getIO } from '../../socket/socket.server.js';
import { SocketEvents } from '../../constants/socketEvents.js';

/**
 * Safely emit WebSocket events to a conversation room if socket server is active.
 */
const emitToConversation = (conversationId: string, event: string, payload: unknown): void => {
  try {
    getIO().to(`conversation:${conversationId}`).emit(event, payload);
  } catch {
    // Gracefully handle situations where socket server is uninitialized (e.g. CLI/tests)
  }
};

/**
 * Message and Real-time Chat History Service.
 * 
 * Orchestrates business workflows for message persistence, high-performance cursor pagination,
 * thread replies, attachments, message editing, soft-deletion, emoji reactions, and receipts.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/transactions
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination
 * @see https://owasp.org/www-project-api-security/ (BOLA / Broken Object Level Authorization)
 */
export class MessageService {
  /**
   * Send a new message to a conversation.
   * 
   * Atomically persists the message, optional media attachments, updates conversation
   * lastMessage timestamps, and increments unread counters for all other active members.
   * 
   * @param senderId - Authenticated author UUID
   * @param input - Conversation ID, content, reply parent ID, and message type
   * @param file - Optional uploaded media attachment file
   * @returns Complete message entity with sender profile and attachments
   */
  async sendMessage(senderId: string, input: SendMessageInput, file?: Express.Multer.File) {
    if (!input.content && !file) {
      throw new BadRequestError(
        'Message content or an attachment is required',
        'message.empty_content'
      );
    }

    // OWASP BOLA Check: Verify sender is an active member of the conversation
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: senderId,
        },
      },
    });

    if (!membership || membership.leftAt !== null) {
      throw new ForbiddenError(
        'You are not an active member of this conversation',
        'message.not_member'
      );
    }

    // Verify parent reply message if replying to a thread
    if (input.parentMessageId) {
      const parent = await prisma.message.findUnique({
        where: { id: input.parentMessageId },
      });

      if (!parent || parent.conversationId !== input.conversationId) {
        throw new NotFoundError(
          'Parent reply message not found in this conversation',
          'message.reply_not_found'
        );
      }
    }

    // Upload attachment to Cloudinary if provided
    let uploadedAttachment:
      | {
          fileUrl: string;
          publicId: string;
          fileName: string;
          fileSize: number;
          mimeType: string;
        }
      | undefined;

    if (file) {
      const resourceType = file.mimetype.startsWith('video/')
        ? 'video'
        : file.mimetype.startsWith('image/')
        ? 'image'
        : 'auto';

      const uploadResult = await uploadBufferToCloudinary(
        file.buffer,
        'talkchat/attachments',
        resourceType
      );

      uploadedAttachment = {
        fileUrl: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
      };
    }

    // Determine message type
    let determinedType: MessageType = input.type ?? MessageType.TEXT;
    if (file) {
      if (file.mimetype.startsWith('image/')) determinedType = MessageType.IMAGE;
      else if (file.mimetype.startsWith('video/')) determinedType = MessageType.VIDEO;
      else if (file.mimetype.startsWith('audio/')) determinedType = MessageType.AUDIO;
      else determinedType = MessageType.FILE;
    }

    // Execute atomic transaction for message persistence, conversation update, and unread counters
    const createdMessage = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          senderId,
          parentMessageId: input.parentMessageId,
          type: determinedType,
          content: input.content,
          attachments: uploadedAttachment
            ? {
                create: {
                  fileUrl: uploadedAttachment.fileUrl,
                  publicId: uploadedAttachment.publicId,
                  fileName: uploadedAttachment.fileName,
                  fileSize: uploadedAttachment.fileSize,
                  mimeType: uploadedAttachment.mimeType,
                },
              }
            : undefined,
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
          parentMessage: {
            select: {
              id: true,
              content: true,
              type: true,
              sender: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                },
              },
            },
          },
          attachments: true,
          reactions: true,
        },
      });

      // Update conversation's latest message activity
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: {
          lastMessageId: message.id,
          lastMessageAt: message.createdAt,
        },
      });

      // Increment unreadCount for all other active conversation members
      await tx.conversationMember.updateMany({
        where: {
          conversationId: input.conversationId,
          userId: { not: senderId },
          leftAt: null,
        },
        data: {
          unreadCount: { increment: 1 },
        },
      });

      return message;
    });

    // Broadcast real-time message event to conversation room
    emitToConversation(input.conversationId, SocketEvents.MESSAGE_NEW, { message: createdMessage });

    return createdMessage;
  }

  /**
   * Retrieve conversation message history using cursor-based pagination.
   * 
   * Leverages the composite database index on [conversationId, createdAt(sort: Desc)]
   * to guarantee sub-millisecond query execution on million-row message tables.
   * 
   * @param userId - Authenticated requesting user UUID
   * @param input - Conversation ID, page limit, and cursor message ID
   * @returns Message records with reply context, attachments, grouped reactions, and receipts
   */
  async getMessageHistory(userId: string, input: GetMessageHistoryInput) {
    const limit = Number(input.limit) || 30;

    // OWASP BOLA Check: Verify requester is an active member
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
    });

    if (!membership || membership.leftAt !== null) {
      throw new ForbiddenError(
        'You are not an active member of this conversation',
        'message.not_member'
      );
    }

    // Resolve cursor reference for timestamp comparison
    let cursorDate: Date | undefined;
    if (input.cursor) {
      const cursorMessage = await prisma.message.findUnique({
        where: { id: input.cursor },
        select: { createdAt: true },
      });

      if (cursorMessage) {
        cursorDate = cursorMessage.createdAt;
      }
    }

    // Query messages excluding those deleted for this specific user
    const messages = await prisma.message.findMany({
      where: {
        conversationId: input.conversationId,
        NOT: {
          deletedForUserIds: { has: userId },
        },
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      take: limit + 1, // Query limit + 1 to detect whether more items remain
      orderBy: { createdAt: 'desc' },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
        parentMessage: {
          select: {
            id: true,
            content: true,
            type: true,
            sender: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
              },
            },
          },
        },
        receipts: {
          select: {
            userId: true,
            status: true,
            deliveredAt: true,
            readAt: true,
          },
        },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    // Sanitize content for globally deleted messages
    const formatted = items.map((msg) => {
      if (msg.isDeleted) {
        return {
          ...msg,
          content: null,
          attachments: [],
        };
      }
      return msg;
    });

    return {
      messages: formatted,
      pagination: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  }

  /**
   * Edit a previously sent message.
   * 
   * Only the original author can edit their message. Sets `isEdited` flag to true.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Message ID and updated text content
   */
  async editMessage(userId: string, input: EditMessageInput) {
    const message = await prisma.message.findUnique({
      where: { id: input.messageId },
    });

    if (!message) {
      throw new NotFoundError('Message not found', 'message.not_found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenError(
        'You can only edit your own messages',
        'message.cannot_edit_others'
      );
    }

    if (message.isDeleted) {
      throw new BadRequestError('Cannot edit a deleted message', 'errors.bad_request');
    }

    const updated = await prisma.message.update({
      where: { id: input.messageId },
      data: {
        content: input.content,
        isEdited: true,
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
        attachments: true,
        reactions: true,
      },
    });

    emitToConversation(message.conversationId, SocketEvents.MESSAGE_EDITED, { message: updated });

    return updated;
  }

  /**
   * Delete a message ("FOR_ME" or "FOR_EVERYONE").
   * 
   * - FOR_ME: Appends user UUID to `deletedForUserIds` without affecting other participants.
   * - FOR_EVERYONE: Clears content, marks `isDeleted: true`. Requires author or group Admin role.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Message ID and delete type
   */
  async deleteMessage(userId: string, input: DeleteMessageInput) {
    const message = await prisma.message.findUnique({
      where: { id: input.messageId },
      include: {
        conversation: {
          include: {
            members: {
              where: { userId, leftAt: null },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundError('Message not found', 'message.not_found');
    }

    const requesterMember = message.conversation.members[0];
    if (!requesterMember) {
      throw new ForbiddenError(
        'You are not an active member of this conversation',
        'message.not_member'
      );
    }

    if (input.deleteType === 'FOR_ME') {
      // Append user ID to deletedForUserIds array
      await prisma.message.update({
        where: { id: input.messageId },
        data: {
          deletedForUserIds: {
            push: userId,
          },
        },
      });

      return { messageId: input.messageId, deleteType: 'FOR_ME' };
    }

    // FOR_EVERYONE: Author or group Admin/Moderator authorization required
    const isAuthor = message.senderId === userId;
    const isAdminOrMod =
      requesterMember.role === MemberRole.ADMIN ||
      requesterMember.role === MemberRole.MODERATOR;

    if (!isAuthor && !isAdminOrMod) {
      throw new ForbiddenError(
        'You do not have permission to delete this message for everyone',
        'message.cannot_delete_others'
      );
    }

    await prisma.message.update({
      where: { id: input.messageId },
      data: {
        isDeleted: true,
        content: null,
      },
    });

    emitToConversation(message.conversationId, SocketEvents.MESSAGE_DELETED, {
      messageId: input.messageId,
      conversationId: message.conversationId,
      deleteType: 'FOR_EVERYONE',
    });

    return { messageId: input.messageId, deleteType: 'FOR_EVERYONE' };
  }

  /**
   * Toggle an emoji reaction on a message.
   * 
   * If the reaction already exists from this user, it is removed; otherwise, it is created.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Target message ID and emoji string
   */
  async toggleReaction(userId: string, input: ReactMessageInput) {
    const message = await prisma.message.findUnique({
      where: { id: input.messageId },
      include: {
        conversation: {
          include: {
            members: {
              where: { userId, leftAt: null },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundError('Message not found', 'message.not_found');
    }

    if (!message.conversation.members.length) {
      throw new ForbiddenError(
        'You are not an active member of this conversation',
        'message.not_member'
      );
    }

    // Check if reaction already exists
    const existing = await prisma.messageReaction.findUnique({
      where: {
        messageId_userId_emoji: {
          messageId: input.messageId,
          userId,
          emoji: input.emoji,
        },
      },
    });

    if (existing) {
      await prisma.messageReaction.delete({
        where: { id: existing.id },
      });

      emitToConversation(message.conversationId, SocketEvents.MESSAGE_REACTION, {
        messageId: input.messageId,
        conversationId: message.conversationId,
        emoji: input.emoji,
        userId,
        reacted: false,
      });

      return { messageId: input.messageId, emoji: input.emoji, reacted: false };
    }

    const created = await prisma.messageReaction.create({
      data: {
        messageId: input.messageId,
        userId,
        emoji: input.emoji,
      },
    });

    emitToConversation(message.conversationId, SocketEvents.MESSAGE_REACTION, {
      messageId: input.messageId,
      conversationId: message.conversationId,
      emoji: created.emoji,
      userId,
      reacted: true,
    });

    return { messageId: input.messageId, emoji: created.emoji, reacted: true };
  }

  /**
   * Bulk update message receipts (DELIVERED / READ) and reset unread counters.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Conversation ID, array of message IDs, and status (DELIVERED | READ)
   */
  async updateReceipts(userId: string, input: UpdateReceiptInput) {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
    });

    if (!membership || membership.leftAt !== null) {
      throw new ForbiddenError(
        'You are not an active member of this conversation',
        'message.not_member'
      );
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      for (const messageId of input.messageIds) {
        await tx.messageReceipt.upsert({
          where: {
            messageId_userId: {
              messageId,
              userId,
            },
          },
          update: {
            status: input.status,
            ...(input.status === DeliveryStatus.READ ? { readAt: now } : {}),
            ...(input.status === DeliveryStatus.DELIVERED ? { deliveredAt: now } : {}),
          },
          create: {
            messageId,
            userId,
            status: input.status,
            deliveredAt: now,
            readAt: input.status === DeliveryStatus.READ ? now : null,
          },
        });
      }

      // If messages are marked READ, reset user's unread counter and update lastReadMessageId
      if (input.status === DeliveryStatus.READ) {
        const latestMessageId = input.messageIds[input.messageIds.length - 1];
        await tx.conversationMember.update({
          where: { id: membership.id },
          data: {
            unreadCount: 0,
            lastReadMessageId: latestMessageId,
          },
        });
      }
    });

    emitToConversation(input.conversationId, SocketEvents.MESSAGE_RECEIPT, {
      conversationId: input.conversationId,
      userId,
      status: input.status,
      messageIds: input.messageIds,
    });

    return {
      conversationId: input.conversationId,
      updatedCount: input.messageIds.length,
      status: input.status,
    };
  }
}

export const messageService = new MessageService();
