import { prisma } from '../../config/database.config.js';
import { cloudinary } from '../../config/cloudinary.config.js';
import { getIO } from '../../socket/socket.server.js';
import { SocketEvents } from '../../constants/socketEvents.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../../errors/AppError.js';
import {
  CreateStoryInput,
  GetStoryFeedInput,
  ViewStoryInput,
  GetStoryViewersInput,
  DeleteStoryInput,
} from './story.validation.js';
import { ContactStatus, StoryMediaType, StoryPrivacy } from '@prisma/client';
import { logger } from '../../utils/logger.js';

/**
 * Ephemeral Stories Business Logic Service.
 * 
 * Manages life cycle of 24-hour auto-expiring media statuses, privacy filters,
 * viewer rosters, and real-time WebSocket notifications.
 * 
 * @see https://www.prisma.io/docs/concepts/components/prisma-client/crud
 * @see https://socket.io/docs/v4/emitting-events/
 */
export class StoryService {
  /**
   * Create a new ephemeral story expiring in exactly 24 hours.
   * 
   * @param userId - ID of the creating user
   * @param input - Story payload parameters
   * @returns Newly created story record
   */
  async createStory(userId: string, input: CreateStoryInput) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = await prisma.story.create({
      data: {
        userId,
        mediaUrl: input.mediaUrl,
        mediaPublicId: input.mediaPublicId,
        mediaType: input.mediaType as StoryMediaType,
        caption: input.caption,
        privacy: input.privacy as StoryPrivacy,
        allowedUserIds: input.allowedUserIds || [],
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Notify connected contacts via WebSocket
    try {
      const io = getIO();
      // Fetch accepted contacts to broadcast to their notification channels
      const contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { userId, status: ContactStatus.ACCEPTED },
            { contactId: userId, status: ContactStatus.ACCEPTED },
          ],
        },
      });

      const contactUserIds = contacts.map((c) => (c.userId === userId ? c.contactId : c.userId));

      for (const contactId of contactUserIds) {
        // Respect selective privacy settings
        if (
          input.privacy === StoryPrivacy.ALL_CONTACTS ||
          (input.privacy === StoryPrivacy.SELECTED && input.allowedUserIds?.includes(contactId))
        ) {
          io.to(`user:${contactId}`).emit(SocketEvents.STORY_NEW, {
            storyId: story.id,
            author: story.user,
            mediaType: story.mediaType,
            createdAt: story.createdAt,
            expiresAt: story.expiresAt,
          });
        }
      }
    } catch {
      // Ignore socket errors in background or test environments
    }

    logger.info({ storyId: story.id, userId }, 'Ephemeral story created successfully');
    return story;
  }

  /**
   * Retrieve active stories feed for the authenticated user and their accepted contacts.
   * 
   * Filters:
   * 1. Only stories with `expiresAt > now()`.
   * 2. Excludes blocked users bidirectionally.
   * 3. Respects privacy settings (`ALL_CONTACTS` vs `SELECTED`).
   * 4. Annotates each story with `hasViewed` status for the requesting user.
   * 
   * @param userId - ID of the viewing user
   * @param input - Pagination parameters
   */
  async getStoryFeed(userId: string, input: GetStoryFeedInput) {
    const now = new Date();

    // 1. Fetch blocked users (both ways)
    const blocks = await prisma.blockedUser.findMany({
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
      select: { blockerId: true, blockedId: true },
    });

    const blockedUserIds = new Set<string>();
    blocks.forEach((b) => {
      blockedUserIds.add(b.blockerId === userId ? b.blockedId : b.blockerId);
    });

    // 2. Fetch accepted contacts
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { userId, status: ContactStatus.ACCEPTED },
          { contactId: userId, status: ContactStatus.ACCEPTED },
        ],
      },
    });

    const contactIds = contacts
      .map((c) => (c.userId === userId ? c.contactId : c.userId))
      .filter((id) => !blockedUserIds.has(id));

    // Include the user themselves to see their own active stories in the feed
    const eligibleAuthorIds = [userId, ...contactIds];

    // 3. Query active stories
    const stories = await prisma.story.findMany({
      where: {
        userId: { in: eligibleAuthorIds },
        expiresAt: { gt: now },
      },
      take: input.limit ? input.limit + 1 : 31,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
        views: {
          where: { viewerId: userId },
          select: { id: true, viewedAt: true },
        },
        _count: {
          select: { views: true },
        },
      },
    });

    let nextCursor: string | null = null;
    const limit = input.limit || 30;
    let paginatedStories = stories;
    if (stories.length > limit) {
      const nextItem = paginatedStories.pop();
      nextCursor = nextItem?.id || null;
    }

    // 4. Apply privacy filtering and structure feed grouped by user
    const filteredStories = paginatedStories.filter((s) => {
      // User can always see their own story
      if (s.userId === userId) return true;
      if (s.privacy === StoryPrivacy.ALL_CONTACTS) return true;
      if (s.privacy === StoryPrivacy.SELECTED || s.privacy === StoryPrivacy.CLOSE_FRIENDS) {
        return s.allowedUserIds.includes(userId);
      }
      return false;
    });

    // Group stories by author
    const authorMap = new Map<
      string,
      {
        author: {
          id: string;
          fullName: string;
          username: string;
          avatarUrl: string | null;
        };
        allViewed: boolean;
        stories: Array<{
          id: string;
          mediaUrl: string;
          mediaType: StoryMediaType;
          caption: string | null;
          hasViewed: boolean;
          viewsCount: number;
          createdAt: Date;
          expiresAt: Date;
        }>;
      }
    >();

    for (const s of filteredStories) {
      const hasViewed = s.views.length > 0;
      const storyItem = {
        id: s.id,
        mediaUrl: s.mediaUrl,
        mediaType: s.mediaType,
        caption: s.caption,
        hasViewed,
        viewsCount: s._count.views,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
      };

      if (!authorMap.has(s.userId)) {
        authorMap.set(s.userId, {
          author: s.user,
          allViewed: hasViewed,
          stories: [storyItem],
        });
      } else {
        const group = authorMap.get(s.userId)!;
        group.stories.push(storyItem);
        if (!hasViewed) {
          group.allViewed = false;
        }
      }
    }

    return {
      feed: Array.from(authorMap.values()),
      nextCursor,
    };
  }

  /**
   * Mark an active story as viewed by the authenticated user.
   * 
   * Enforces idempotency via `@@unique([storyId, viewerId])`.
   * Emits real-time notification to the story creator.
   * 
   * @param viewerId - User viewing the story
   * @param input - Story identification payload
   */
  async viewStory(viewerId: string, input: ViewStoryInput) {
    const story = await prisma.story.findUnique({
      where: { id: input.storyId },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    if (!story) {
      throw new NotFoundError('Story not found', 'story.not_found');
    }

    if (story.expiresAt <= new Date()) {
      throw new BadRequestError('Story has already expired', 'story.expired');
    }

    // Check bidirectional block
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: story.userId, blockedId: viewerId },
          { blockerId: viewerId, blockedId: story.userId },
        ],
      },
    });

    if (isBlocked) {
      throw new ForbiddenError('Cannot view story: user is blocked', 'story.blocked');
    }

    // Fetch viewer profile details
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { id: true, fullName: true, username: true, avatarUrl: true },
    });

    // Record view idempotently
    const storyView = await prisma.storyView.upsert({
      where: {
        storyId_viewerId: {
          storyId: input.storyId,
          viewerId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        storyId: input.storyId,
        viewerId,
      },
    });

    // Real-time notification to story creator if not viewing own story
    if (story.userId !== viewerId) {
      try {
        const io = getIO();
        io.to(`user:${story.userId}`).emit(SocketEvents.STORY_VIEWED, {
          storyId: story.id,
          viewer,
          viewedAt: storyView.viewedAt,
        });
      } catch {
        // Socket may not be connected
      }
    }

    const totalViews = await prisma.storyView.count({
      where: { storyId: input.storyId },
    });

    return {
      success: true,
      storyId: input.storyId,
      viewedAt: storyView.viewedAt,
      totalViews,
    };
  }

  /**
   * Retrieve the list of viewers for a story.
   * 
   * Broken Object Level Authorization (BOLA) Guard:
   * Strictly restricted to the story creator.
   * 
   * @param userId - Requesting user ID
   * @param input - Story ID and pagination options
   */
  async getStoryViewers(userId: string, input: GetStoryViewersInput) {
    const story = await prisma.story.findUnique({
      where: { id: input.storyId },
      select: { id: true, userId: true },
    });

    if (!story) {
      throw new NotFoundError('Story not found', 'story.not_found');
    }

    // BOLA Authorization: Only creator can see who viewed
    if (story.userId !== userId) {
      throw new ForbiddenError(
        'Forbidden: Only the story creator can view the viewer roster',
        'story.forbidden_viewers'
      );
    }

    const limit = input.limit || 50;
    const views = await prisma.storyView.findMany({
      where: { storyId: input.storyId },
      take: limit + 1,
      cursor: input.cursor ? { id: input.cursor } : undefined,
      orderBy: { viewedAt: 'desc' },
      include: {
        viewer: {
          select: {
            id: true,
            fullName: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    let paginatedViews = views;
    if (views.length > limit) {
      const nextItem = paginatedViews.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      storyId: input.storyId,
      totalViews: await prisma.storyView.count({ where: { storyId: input.storyId } }),
      viewers: paginatedViews.map((v) => ({
        id: v.id,
        viewer: v.viewer,
        viewedAt: v.viewedAt,
      })),
      nextCursor,
    };
  }

  /**
   * Delete a story before its 24-hour expiration window.
   * Cleans up associated Cloudinary asset and notifies connected clients.
   * 
   * @param userId - ID of user initiating deletion
   * @param input - Story identification payload
   */
  async deleteStory(userId: string, input: DeleteStoryInput) {
    const story = await prisma.story.findUnique({
      where: { id: input.storyId },
      select: { id: true, userId: true, mediaPublicId: true },
    });

    if (!story) {
      throw new NotFoundError('Story not found', 'story.not_found');
    }

    // BOLA Check: Only author can delete
    if (story.userId !== userId) {
      throw new ForbiddenError('You can only delete your own stories', 'story.forbidden_delete');
    }

    // Cleanup Cloudinary asset if present
    if (story.mediaPublicId) {
      try {
        await cloudinary.uploader.destroy(story.mediaPublicId);
      } catch (error) {
        logger.warn({ error, publicId: story.mediaPublicId }, 'Failed to delete Cloudinary asset on story delete');
      }
    }

    await prisma.story.delete({
      where: { id: input.storyId },
    });

    // Emit real-time deletion event
    try {
      const io = getIO();
      io.emit(SocketEvents.STORY_DELETED, {
        storyId: input.storyId,
        authorId: userId,
      });
    } catch {
      // Ignore socket error
    }

    logger.info({ storyId: input.storyId, userId }, 'Story deleted manually');
    return { success: true, storyId: input.storyId };
  }

  /**
   * Fetch caller's own active stories with view counts.
   * 
   * @param userId - ID of the calling user
   */
  async getMyStories(userId: string) {
    const now = new Date();
    const stories = await prisma.story.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { views: true },
        },
      },
    });

    return stories.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      mediaType: s.mediaType,
      caption: s.caption,
      privacy: s.privacy,
      viewsCount: s._count.views,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }
}

export const storyService = new StoryService();
