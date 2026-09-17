import { prisma } from '../../config/database.config.js';
import { uploadBufferToCloudinary, deleteFromCloudinary } from '../../config/cloudinary.config.js';
import { NotFoundError, BadRequestError, ConflictError } from '../../errors/AppError.js';
import { UpdateProfileInput, SearchUserQuery } from './user.validation.js';
import { ContactStatus } from '@prisma/client';

/**
 * User & Profile Management Service.
 * 
 * Handles user identity metadata, avatar uploads via Cloudinary, user search queries,
 * contact/friendship requests, and bidirectional user blocking.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/crud
 * @see https://cloudinary.com/documentation/image_upload_api_reference
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/filtering-and-sorting
 */
export class UserService {
  /**
   * Update user profile information, optionally uploading a new avatar image to Cloudinary.
   * 
   * @param userId - ID of user updating profile
   * @param data - Full name, bio fields
   * @param avatarFile - Optional uploaded multer image file
   */
  async updateProfile(userId: string, data: UpdateProfileInput, avatarFile?: Express.Multer.File) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found', 'errors.not_found');
    }

    let avatarUrl = user.avatarUrl;
    let avatarPublicId = user.avatarPublicId;

    // Upload new avatar to Cloudinary if provided
    if (avatarFile) {
      // Delete previous avatar from Cloudinary if it exists
      if (user.avatarPublicId) {
        await deleteFromCloudinary(user.avatarPublicId, 'image').catch(() => {});
      }

      const uploadResult = await uploadBufferToCloudinary(
        avatarFile.buffer,
        'talkchat/avatars',
        'image'
      );

      avatarUrl = uploadResult.secureUrl;
      avatarPublicId = uploadResult.publicId;
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName ?? user.fullName,
        bio: data.bio ?? user.bio,
        avatarUrl,
        avatarPublicId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Search users by username, email, or full name (excluding requester and blocked users).
   * 
   * @param currentUserId - Requester's user UUID
   * @param query - Search term, page, limit
   */
  async searchUsers(currentUserId: string, query: SearchUserQuery) {
    const { q } = query;
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    // Retrieve blocked user IDs to filter out of results
    const blockedEntries = await prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: currentUserId }, { blockedId: currentUserId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const excludedUserIds = new Set<string>([currentUserId]);
    blockedEntries.forEach((b) => {
      excludedUserIds.add(b.blockerId);
      excludedUserIds.add(b.blockedId);
    });

    const whereCondition = {
      id: { notIn: Array.from(excludedUserIds) },
      OR: [
        { username: { contains: q, mode: 'insensitive' as const } },
        { email: { contains: q, mode: 'insensitive' as const } },
        { fullName: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    const [total, users] = await Promise.all([
      prisma.user.count({ where: whereCondition }),
      prisma.user.findMany({
        where: whereCondition,
        skip,
        take: limit,
        select: {
          id: true,
          username: true,
          fullName: true,
          avatarUrl: true,
          bio: true,
          isOnline: true,
          lastSeen: true,
        },
        orderBy: { username: 'asc' },
      }),
    ]);

    return {
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Retrieve a user's public profile by ID.
   * 
   * @param userId - Target user UUID
   */
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        bio: true,
        isOnline: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User not found', 'errors.not_found');
    }

    return user;
  }

  /**
   * Send a contact/friendship request to another user.
   * 
   * @param userId - Sender's user ID
   * @param contactId - Recipient's user ID
   */
  async sendContactRequest(userId: string, contactId: string) {
    if (userId === contactId) {
      throw new BadRequestError('Cannot send contact request to yourself', 'user.cannot_contact_self');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: contactId } });
    if (!targetUser) {
      throw new NotFoundError('Contact target user not found', 'errors.not_found');
    }

    // Check if user is blocked
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: contactId },
          { blockerId: contactId, blockedId: userId },
        ],
      },
    });

    if (isBlocked) {
      throw new BadRequestError('Cannot add contact: user is blocked', 'user.user_is_blocked');
    }

    // Check existing contact relationship
    const existing = await prisma.contact.findFirst({
      where: {
        OR: [
          { userId, contactId },
          { userId: contactId, contactId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === ContactStatus.ACCEPTED) {
        throw new ConflictError('User is already in your contacts', 'user.already_contact');
      }
      throw new ConflictError('Contact request already pending', 'user.request_already_pending');
    }

    const contact = await prisma.contact.create({
      data: {
        userId,
        contactId,
        status: ContactStatus.PENDING,
      },
      include: {
        contact: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return contact;
  }

  /**
   * Accept or decline an incoming contact request.
   * 
   * @param currentUserId - Recipient user accepting/declining
   * @param contactId - Requester who sent the request
   * @param status - ACCEPTED or BLOCKED
   */
  async respondToContactRequest(currentUserId: string, contactId: string, status: ContactStatus) {
    const contact = await prisma.contact.findFirst({
      where: {
        userId: contactId,
        contactId: currentUserId,
        status: ContactStatus.PENDING,
      },
    });

    if (!contact) {
      throw new NotFoundError('Pending contact request not found', 'user.request_not_found');
    }

    const updated = await prisma.contact.update({
      where: { id: contact.id },
      data: { status },
    });

    return updated;
  }

  /**
   * List contacts for the user.
   * 
   * @param userId - Target user ID
   * @param status - Optional status filter (PENDING, ACCEPTED)
   */
  async getContacts(userId: string, status: ContactStatus = ContactStatus.ACCEPTED) {
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { userId, status },
          { contactId: userId, status },
        ],
      },
      include: {
        user: {
          select: { id: true, username: true, fullName: true, avatarUrl: true, isOnline: true },
        },
        contact: {
          select: { id: true, username: true, fullName: true, avatarUrl: true, isOnline: true },
        },
      },
    });

    // Normalize output so other party is always returned
    return contacts.map((c) => {
      const friend = c.userId === userId ? c.contact : c.user;
      return {
        contactId: c.id,
        status: c.status,
        createdAt: c.createdAt,
        user: friend,
      };
    });
  }

  /**
   * Block a user.
   * 
   * @param blockerId - User initiating the block
   * @param blockedId - User being blocked
   */
  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestError('Cannot block yourself', 'user.cannot_block_self');
    }

    const targetUser = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!targetUser) {
      throw new NotFoundError('Target user not found', 'errors.not_found');
    }

    // Remove any contact relationships between the two
    await prisma.contact.deleteMany({
      where: {
        OR: [
          { userId: blockerId, contactId: blockedId },
          { userId: blockedId, contactId: blockerId },
        ],
      },
    });

    const blocked = await prisma.blockedUser.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      create: { blockerId, blockedId },
      update: {},
    });

    return blocked;
  }

  /**
   * Unblock a previously blocked user.
   * 
   * @param blockerId - User who initiated the block
   * @param blockedId - User to unblock
   */
  async unblockUser(blockerId: string, blockedId: string) {
    const blocked = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });

    if (!blocked) {
      throw new NotFoundError('User is not in your blocked list', 'user.not_in_blocked_list');
    }

    await prisma.blockedUser.delete({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
    });
  }

  /**
   * List all users blocked by the user.
   * 
   * @param userId - User UUID
   */
  async getBlockedUsers(userId: string) {
    const blocked = await prisma.blockedUser.findMany({
      where: { blockerId: userId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return blocked.map((b) => ({
      blockedId: b.id,
      createdAt: b.createdAt,
      user: b.blocked,
    }));
  }
}

export const userService = new UserService();
