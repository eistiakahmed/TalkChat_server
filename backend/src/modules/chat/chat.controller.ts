import { Request, Response, NextFunction } from 'express';
import { chatService } from './chat.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * Chat and Conversation Management Controller.
 * 
 * Transport layer handling HTTP requests for direct messaging and group chat channels.
 * Strictly parses all arguments (conversationId, participantId, pagination, settings)
 * from the HTTP Request Body (`req.body`).
 * 
 * @see https://expressjs.com/en/guide/routing.html
 * @see https://owasp.org/www-project-api-security/
 */
export class ChatController {
  /**
   * Create or fetch existing idempotent Direct (1-to-1) Conversation.
   * 
   * @route POST /api/v1/chats/direct
   * @body { participantId: string }
   */
  async createDirectChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { participantId } = req.body;

      const conversation = await chatService.getOrCreateDirectChat(userId, participantId);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('chat.direct_chat_created', req.language),
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new Group Conversation with optional Cloudinary avatar.
   * 
   * @route POST /api/v1/chats/group
   * @body { title: string, description?: string, memberIds: string[] }
   */
  async createGroupChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const creatorId = req.userId!;
      const avatarFile = req.file;

      const conversation = await chatService.createGroupChat(creatorId, req.body, avatarFile);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('chat.group_created', req.language),
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List conversations for the authenticated user with unread counts and sorting.
   * 
   * @route POST /api/v1/chats/list
   * @body { page?: number, limit?: number, type?: 'DIRECT' | 'GROUP' }
   */
  async getUserConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await chatService.getUserConversations(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: result.items,
        meta: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve conversation details and full active member roster.
   * 
   * @route POST /api/v1/chats/details
   * @body { conversationId: string }
   */
  async getConversationDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { conversationId } = req.body;

      const conversation = await chatService.getConversationDetails(userId, conversationId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Group Chat title, description, or avatar.
   * 
   * @route PATCH /api/v1/chats/update-group
   * @body { conversationId: string, title?: string, description?: string }
   */
  async updateGroupChat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const avatarFile = req.file;

      const conversation = await chatService.updateGroupChat(userId, req.body, avatarFile);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.group_updated', req.language),
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Add new participants to an existing group conversation.
   * 
   * @route POST /api/v1/chats/add-members
   * @body { conversationId: string, memberIds: string[] }
   */
  async addMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const conversation = await chatService.addMembers(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.members_added', req.language),
        data: { conversation },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remove a member from a group conversation.
   * 
   * @route POST /api/v1/chats/remove-member
   * @body { conversationId: string, targetUserId: string }
   */
  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await chatService.removeMember(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.member_removed', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update participant role within a group conversation.
   * 
   * @route PATCH /api/v1/chats/update-role
   * @body { conversationId: string, targetUserId: string, role: 'ADMIN' | 'MODERATOR' | 'MEMBER' }
   */
  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const member = await chatService.updateMemberRole(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.role_updated', req.language),
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Voluntarily leave an active group conversation.
   * 
   * @route POST /api/v1/chats/leave
   * @body { conversationId: string }
   */
  async leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { conversationId } = req.body;

      const result = await chatService.leaveGroup(userId, conversationId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.left_group', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle mute settings for a specific conversation.
   * 
   * @route PATCH /api/v1/chats/mute
   * @body { conversationId: string, isMuted: boolean, mutedUntil?: string | null }
   */
  async toggleMute(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const member = await chatService.toggleMute(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: member.isMuted
          ? t('chat.muted', req.language)
          : t('chat.unmuted', req.language),
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reset participant unread message counter to 0.
   * 
   * @route PATCH /api/v1/chats/read
   * @body { conversationId: string }
   */
  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { conversationId } = req.body;

      const member = await chatService.markAsRead(userId, conversationId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('chat.marked_read', req.language),
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const chatController = new ChatController();
