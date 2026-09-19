import { Request, Response, NextFunction } from 'express';
import { messageService } from './message.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * Message and Real-time Chat History Controller.
 * 
 * Transport layer handling HTTP requests for message transmission, cursor-paginated
 * message retrieval, editing, deletion, emoji reactions, and receipts.
 * Strictly parses all arguments from the HTTP Request Body (`req.body`).
 * 
 * @see https://expressjs.com/en/guide/routing.html
 * @see https://owasp.org/www-project-api-security/
 */
export class MessageController {
  /**
   * Send a new message to a conversation (with optional media attachment).
   * 
   * @route POST /api/v1/messages/send
   * @body { conversationId: string, content?: string, type?: MessageType, parentMessageId?: string }
   */
  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const senderId = req.userId!;
      const file = req.file;

      const message = await messageService.sendMessage(senderId, req.body, file);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('message.sent_successfully', req.language),
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve conversation message history using cursor-based pagination.
   * 
   * @route POST /api/v1/messages/list
   * @body { conversationId: string, limit?: number, cursor?: string }
   */
  async getMessageHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await messageService.getMessageHistory(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('message.history_fetched', req.language),
        data: result.messages,
        meta: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Edit a previously sent message.
   * 
   * @route PATCH /api/v1/messages/edit
   * @body { messageId: string, content: string }
   */
  async editMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const message = await messageService.editMessage(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('message.edited_successfully', req.language),
        data: { message },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a message (FOR_ME or FOR_EVERYONE).
   * 
   * @route POST /api/v1/messages/delete
   * @body { messageId: string, deleteType: 'FOR_ME' | 'FOR_EVERYONE' }
   */
  async deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await messageService.deleteMessage(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('message.deleted_successfully', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Toggle emoji reaction on a message.
   * 
   * @route POST /api/v1/messages/react
   * @body { messageId: string, emoji: string }
   */
  async toggleReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await messageService.toggleReaction(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('message.reaction_updated', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk update message receipts (DELIVERED / READ).
   * 
   * @route POST /api/v1/messages/receipt
   * @body { conversationId: string, messageIds: string[], status: 'DELIVERED' | 'READ' }
   */
  async updateReceipts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await messageService.updateReceipts(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('message.receipt_updated', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const messageController = new MessageController();
