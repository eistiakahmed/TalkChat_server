import { Request, Response, NextFunction } from 'express';
import { userService } from './user.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';
import { ContactStatus } from '@prisma/client';

/**
 * User & Profile Management Controller.
 * 
 * Handles HTTP requests for:
 * - Profile updates with optional avatar media upload.
 * - Paginated user search.
 * - Contact management (requests, accepts, listing).
 * - User blocking and unblocking.
 * 
 * @see https://expressjs.com/en/guide/routing.html
 */
export class UserController {
  /**
   * Update authenticated user's profile and/or avatar image.
   */
  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const avatarFile = req.file;

      const user = await userService.updateProfile(userId, req.body, avatarFile);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('user.profile_updated', req.language),
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Search users matching a query string.
   */
  async searchUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const query = req.query as any;

      const result = await userService.searchUsers(userId, query);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: result.users,
        meta: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve a user's public profile by ID.
   */
  async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const user = await userService.getUserById(id);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a contact/friend request.
   */
  async sendContactRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const contactId = req.params.contactId as string;

      const contact = await userService.sendContactRequest(userId, contactId);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('user.contact_request_sent', req.language),
        data: { contact },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Respond to a contact request (ACCEPTED / BLOCKED).
   */
  async respondContactRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const contactId = req.params.contactId as string;
      const { status } = req.body;

      const updated = await userService.respondToContactRequest(userId, contactId, status);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message:
          status === ContactStatus.ACCEPTED
            ? t('user.contact_request_accepted', req.language)
            : t('user.user_blocked', req.language),
        data: { contact: updated },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List accepted or pending contacts.
   */
  async getContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const status = req.query.status as ContactStatus | undefined;

      const contacts = await userService.getContacts(userId, status);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: { contacts },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Block a user.
   */
  async blockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const blockerId = req.userId!;
      const targetUserId = req.params.targetUserId as string;

      await userService.blockUser(blockerId, targetUserId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('user.user_blocked', req.language),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Unblock a user.
   */
  async unblockUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const blockerId = req.userId!;
      const targetUserId = req.params.targetUserId as string;

      await userService.unblockUser(blockerId, targetUserId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('user.user_unblocked', req.language),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * List blocked users.
   */
  async getBlockedUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const blocked = await userService.getBlockedUsers(userId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: { blocked },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
