import { Prisma, ConversationType, MemberRole } from '@prisma/client';
import { prisma } from '../../config/database.config.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../errors/AppError.js';
import {
  uploadBufferToCloudinary,
  deleteFromCloudinary,
} from '../../config/cloudinary.config.js';
import {
  CreateGroupChatInput,
  GetChatsListInput,
  UpdateGroupChatInput,
  AddMembersInput,
  RemoveMemberInput,
  UpdateMemberRoleInput,
  MuteChatInput,
} from './chat.validation.js';

/**
 * Chat and Conversation Management Service.
 * 
 * Orchestrates business workflows for 1-to-1 direct messaging and group chat channels.
 * Enforces OWASP BOLA authorization invariants, atomic database transactions,
 * and Cloudinary media lifecycles.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/transactions
 * @see https://owasp.org/www-project-api-security/ (API1:2023 - Broken Object Level Authorization)
 * @see https://cloudinary.com/documentation/image_upload_api_reference
 */
export class ChatService {
  /**
   * Fetch or initialize an idempotent 1-to-1 Direct Conversation.
   * 
   * If a direct conversation already exists between the two users, it is returned
   * without creating duplicate records. Verifies blocking status before initiating.
   * 
   * @param userId - Authenticated user initiating or joining the conversation
   * @param participantId - Target participant UUID
   * @returns Active conversation model with participant metadata
   * 
   * @see https://www.prisma.io/docs/reference/api-reference/prisma-client-reference#findfirst
   */
  async getOrCreateDirectChat(userId: string, participantId: string) {
    if (userId === participantId) {
      throw new BadRequestError('Cannot start a direct conversation with yourself', 'chat.cannot_chat_self');
    }

    // Verify recipient existence
    const recipient = await prisma.user.findUnique({
      where: { id: participantId },
      select: { id: true },
    });

    if (!recipient) {
      throw new NotFoundError('User not found', 'errors.not_found');
    }

    // Enforce blocking policy
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: participantId },
          { blockerId: participantId, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      throw new ForbiddenError('Cannot initiate direct chat with a blocked user', 'chat.user_blocked');
    }

    // Check for existing direct conversation between both users
    const existingConversation = await prisma.conversation.findFirst({
      where: {
        type: ConversationType.DIRECT,
        AND: [
          { members: { some: { userId, leftAt: null } } },
          { members: { some: { userId: participantId, leftAt: null } } },
        ],
      },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
      },
    });

    if (existingConversation) {
      return existingConversation;
    }

    // Create new direct conversation atomically
    return prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.DIRECT,
          creatorId: userId,
          members: {
            create: [
              { userId, role: MemberRole.MEMBER },
              { userId: participantId, role: MemberRole.MEMBER },
            ],
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
          },
        },
      });

      return conversation;
    });
  }

  /**
   * Create a multi-participant Group Conversation with optional Cloudinary avatar.
   * 
   * Atomically provisions the conversation and assigns the creator as ADMIN
   * while assigning invited members as regular MEMBERs.
   * 
   * @param creatorId - Authenticated user creating the group
   * @param input - Group title, description, and list of member UUIDs
   * @param avatarFile - Optional uploaded avatar image buffer
   * @returns Newly created group conversation with roster
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/relation-queries#nested-writes
   */
  async createGroupChat(
    creatorId: string,
    input: CreateGroupChatInput,
    avatarFile?: Express.Multer.File
  ) {
    // Deduplicate and filter out creator from invited member array
    const memberIds = Array.from(new Set(input.memberIds.filter((id) => id !== creatorId)));

    // Verify all invited member IDs exist in database
    const existingUsers = await prisma.user.findMany({
      where: {
        id: { in: memberIds },
      },
      select: { id: true },
    });

    if (existingUsers.length !== memberIds.length) {
      throw new BadRequestError('One or more invited users do not exist', 'errors.bad_request');
    }

    // Upload group avatar to Cloudinary if provided
    let avatarUrl: string | undefined;
    let avatarPublicId: string | undefined;

    if (avatarFile) {
      const uploadRes = await uploadBufferToCloudinary(avatarFile.buffer, 'talkchat/groups', 'image');
      avatarUrl = uploadRes.secureUrl;
      avatarPublicId = uploadRes.publicId;
    }

    // Provision Group Conversation and assign memberships atomically
    return prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.create({
        data: {
          type: ConversationType.GROUP,
          title: input.title,
          description: input.description,
          avatarUrl,
          avatarPublicId,
          creatorId,
          members: {
            create: [
              { userId: creatorId, role: MemberRole.ADMIN },
              ...memberIds.map((uid) => ({ userId: uid, role: MemberRole.MEMBER })),
            ],
          },
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
          },
        },
      });

      return conversation;
    });
  }

  /**
   * Retrieve paginated conversations for the requesting user.
   * 
   * Filters conversations where the user is an active member (`leftAt === null`),
   * sorted by latest message activity or timestamp descending.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Pagination and conversation type filter
   * @returns Paginated conversations list with unread counters and member profiles
   */
  async getUserConversations(userId: string, input: GetChatsListInput) {
    const page = Number(input.page) || 1;
    const limit = Number(input.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ConversationWhereInput = {
      members: {
        some: {
          userId,
          leftAt: null,
        },
      },
      ...(input.type ? { type: input.type } : {}),
    };

    const [total, conversations] = await Promise.all([
      prisma.conversation.count({ where }),
      prisma.conversation.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
        ],
        include: {
          members: {
            where: { leftAt: null },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  fullName: true,
                  avatarUrl: true,
                  isOnline: true,
                  lastSeen: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Format output with member's personal settings (unreadCount, isMuted)
    const items = conversations.map((conv) => {
      const userMember = conv.members.find((m) => m.userId === userId);
      return {
        ...conv,
        userSettings: {
          unreadCount: userMember?.unreadCount ?? 0,
          isMuted: userMember?.isMuted ?? false,
          mutedUntil: userMember?.mutedUntil ?? null,
          role: userMember?.role ?? MemberRole.MEMBER,
        },
      };
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve full conversation details and active member roster.
   * 
   * Enforces OWASP BOLA check: only active participants can inspect conversation metadata.
   * 
   * @param userId - Requesting user UUID
   * @param conversationId - Target conversation UUID
   * @returns Full conversation entity with member details
   */
  async getConversationDetails(userId: string, conversationId: string) {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found', 'chat.not_found');
    }

    const requestingMember = conversation.members.find((m) => m.userId === userId);
    if (!requestingMember) {
      throw new ForbiddenError('You are not a member of this conversation', 'chat.not_member');
    }

    return conversation;
  }

  /**
   * Update Group Chat title, description, or avatar.
   * 
   * Requires ADMIN or MODERATOR privileges within the group.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Target conversation ID and updated fields
   * @param avatarFile - Optional new avatar buffer
   * @returns Updated conversation object
   */
  async updateGroupChat(
    userId: string,
    input: UpdateGroupChatInput,
    avatarFile?: Express.Multer.File
  ) {
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
      include: { conversation: true },
    });

    if (!member || member.leftAt !== null) {
      throw new ForbiddenError('You are not a member of this conversation', 'chat.not_member');
    }

    if (member.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestError('Only group conversations can be updated', 'errors.bad_request');
    }

    if (member.role !== MemberRole.ADMIN && member.role !== MemberRole.MODERATOR) {
      throw new ForbiddenError('Administrator or Moderator privileges required', 'chat.admin_required');
    }

    let avatarUrl = member.conversation.avatarUrl;
    let avatarPublicId = member.conversation.avatarPublicId;

    if (avatarFile) {
      const uploadRes = await uploadBufferToCloudinary(avatarFile.buffer, 'talkchat/groups', 'image');
      
      // Cleanup previous avatar asset asynchronously
      if (avatarPublicId) {
        deleteFromCloudinary(avatarPublicId, 'image').catch(() => {});
      }

      avatarUrl = uploadRes.secureUrl;
      avatarPublicId = uploadRes.publicId;
    }

    const updated = await prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        ...(input.title ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(avatarFile ? { avatarUrl, avatarPublicId } : {}),
      },
      include: {
        members: {
          where: { leftAt: null },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                isOnline: true,
                lastSeen: true,
              },
            },
          },
        },
      },
    });

    return updated;
  }

  /**
   * Add new participants to an existing Group Conversation.
   * 
   * Requires ADMIN or MODERATOR permissions.
   * Re-activates previously departed members if present.
   * 
   * @param userId - Requester UUID
   * @param input - Conversation ID and list of new member UUIDs
   * @returns Updated conversation object
   */
  async addMembers(userId: string, input: AddMembersInput) {
    const requester = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
      include: { conversation: true },
    });

    if (!requester || requester.leftAt !== null) {
      throw new ForbiddenError('You are not a member of this conversation', 'chat.not_member');
    }

    if (requester.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestError('Members can only be added to group conversations', 'errors.bad_request');
    }

    if (requester.role !== MemberRole.ADMIN && requester.role !== MemberRole.MODERATOR) {
      throw new ForbiddenError('Administrator or Moderator privileges required', 'chat.admin_required');
    }

    const memberIds = Array.from(new Set(input.memberIds));

    // Validate users exist
    const validUsers = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true },
    });

    if (validUsers.length !== memberIds.length) {
      throw new BadRequestError('One or more invited users do not exist', 'errors.bad_request');
    }

    // Upsert or restore memberships
    await prisma.$transaction(async (tx) => {
      for (const targetId of memberIds) {
        await tx.conversationMember.upsert({
          where: {
            conversationId_userId: {
              conversationId: input.conversationId,
              userId: targetId,
            },
          },
          update: {
            leftAt: null,
            role: MemberRole.MEMBER,
            joinedAt: new Date(),
          },
          create: {
            conversationId: input.conversationId,
            userId: targetId,
            role: MemberRole.MEMBER,
          },
        });
      }
    });

    return this.getConversationDetails(userId, input.conversationId);
  }

  /**
   * Remove a member from a Group Conversation.
   * 
   * Enforces role permission hierarchy:
   * - Admins can remove anyone except the creator.
   * - Moderators can remove regular members.
   * - Users can remove themselves (synonymous to leaving).
   * 
   * @param userId - Requester UUID
   * @param input - Target conversation ID and target user UUID
   */
  async removeMember(userId: string, input: RemoveMemberInput) {
    const requester = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
      include: { conversation: true },
    });

    if (!requester || requester.leftAt !== null) {
      throw new ForbiddenError('You are not a member of this conversation', 'chat.not_member');
    }

    if (requester.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestError('Members can only be removed from group conversations', 'errors.bad_request');
    }

    // Self removal delegates to leaveGroup
    if (userId === input.targetUserId) {
      return this.leaveGroup(userId, input.conversationId);
    }

    const target = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.targetUserId,
        },
      },
    });

    if (!target || target.leftAt !== null) {
      throw new NotFoundError('Target user is not an active member of this group', 'errors.not_found');
    }

    // Protect group creator
    if (requester.conversation.creatorId === input.targetUserId) {
      throw new BadRequestError('The creator of the group cannot be removed', 'chat.cannot_remove_creator');
    }

    // Hierarchy check: Moderators cannot remove Admins or other Moderators
    if (
      requester.role === MemberRole.MODERATOR &&
      (target.role === MemberRole.ADMIN || target.role === MemberRole.MODERATOR)
    ) {
      throw new ForbiddenError('Moderators can only remove standard members', 'errors.forbidden');
    }

    if (requester.role === MemberRole.MEMBER) {
      throw new ForbiddenError('Administrator or Moderator privileges required', 'chat.admin_required');
    }

    await prisma.conversationMember.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
    });

    return { removedUserId: input.targetUserId };
  }

  /**
   * Update participant role within a Group Conversation.
   * 
   * Restricted to group ADMINs.
   * The original group creator cannot be demoted.
   * 
   * @param userId - Requester UUID
   * @param input - Conversation ID, target user UUID, and new role
   */
  async updateMemberRole(userId: string, input: UpdateMemberRoleInput) {
    const requester = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
      include: { conversation: true },
    });

    if (!requester || requester.leftAt !== null) {
      throw new ForbiddenError('You are not a member of this conversation', 'chat.not_member');
    }

    if (requester.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestError('Roles can only be assigned in group conversations', 'errors.bad_request');
    }

    if (requester.role !== MemberRole.ADMIN) {
      throw new ForbiddenError('Only Group Administrators can manage member roles', 'chat.admin_required');
    }

    const target = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId: input.targetUserId,
        },
      },
    });

    if (!target || target.leftAt !== null) {
      throw new NotFoundError('Target member is not active in this group', 'errors.not_found');
    }

    if (
      requester.conversation.creatorId === input.targetUserId &&
      input.role !== MemberRole.ADMIN
    ) {
      throw new BadRequestError('Group creator cannot be demoted from Administrator', 'chat.cannot_demote_creator');
    }

    const updated = await prisma.conversationMember.update({
      where: { id: target.id },
      data: { role: input.role },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return updated;
  }

  /**
   * Voluntarily leave an active Group Conversation.
   * 
   * If the leaving user is the sole active ADMIN, automatically elects and promotes
   * the next oldest active member to ADMIN status to prevent orphaned groups.
   * 
   * @param userId - Authenticated user UUID
   * @param conversationId - Target group conversation UUID
   */
  async leaveGroup(userId: string, conversationId: string) {
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
      include: { conversation: true },
    });

    if (!member || member.leftAt !== null) {
      throw new ForbiddenError('You are not an active member of this conversation', 'chat.not_member');
    }

    if (member.conversation.type !== ConversationType.GROUP) {
      throw new BadRequestError('Cannot leave a direct 1-to-1 conversation', 'errors.bad_request');
    }

    return prisma.$transaction(async (tx) => {
      // Mark current member as departed
      await tx.conversationMember.update({
        where: { id: member.id },
        data: { leftAt: new Date() },
      });

      // If departed member was an ADMIN, ensure group retains an active admin
      if (member.role === MemberRole.ADMIN) {
        const remainingAdmin = await tx.conversationMember.findFirst({
          where: {
            conversationId,
            role: MemberRole.ADMIN,
            leftAt: null,
          },
        });

        if (!remainingAdmin) {
          // Promote next oldest active member
          const nextMember = await tx.conversationMember.findFirst({
            where: {
              conversationId,
              leftAt: null,
            },
            orderBy: { joinedAt: 'asc' },
          });

          if (nextMember) {
            await tx.conversationMember.update({
              where: { id: nextMember.id },
              data: { role: MemberRole.ADMIN },
            });
          }
        }
      }

      return { conversationId, leftUserId: userId };
    });
  }

  /**
   * Toggle mute settings for a specific conversation for the requesting user.
   * 
   * @param userId - Authenticated user UUID
   * @param input - Target conversation ID, isMuted flag, and optional mutedUntil datetime
   */
  async toggleMute(userId: string, input: MuteChatInput) {
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: input.conversationId,
          userId,
        },
      },
    });

    if (!member || member.leftAt !== null) {
      throw new ForbiddenError('You are not an active member of this conversation', 'chat.not_member');
    }

    const updated = await prisma.conversationMember.update({
      where: { id: member.id },
      data: {
        isMuted: input.isMuted,
        mutedUntil: input.isMuted && input.mutedUntil ? new Date(input.mutedUntil) : null,
      },
    });

    return updated;
  }

  /**
   * Reset the unread message counter for the requesting participant.
   * 
   * @param userId - Authenticated user UUID
   * @param conversationId - Target conversation UUID
   */
  async markAsRead(userId: string, conversationId: string) {
    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    });

    if (!member || member.leftAt !== null) {
      throw new ForbiddenError('You are not an active member of this conversation', 'chat.not_member');
    }

    const updated = await prisma.conversationMember.update({
      where: { id: member.id },
      data: { unreadCount: 0 },
    });

    return updated;
  }
}

export const chatService = new ChatService();
