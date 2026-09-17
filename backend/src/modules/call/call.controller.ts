import { Request, Response, NextFunction } from 'express';
import { callService } from './call.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * WebRTC Call History Controller.
 * 
 * Transport layer handling REST requests for call logs and details.
 * Strictly adheres to body-only parameters (no URL/path params).
 */
export class CallController {
  /**
   * Fetch paginated call history.
   * 
   * @route POST /api/v1/calls/history
   * @body { limit?: number, cursor?: string, type?: 'AUDIO' | 'VIDEO', status?: string }
   */
  async getCallHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await callService.getCallHistory(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('call.history_fetched', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Fetch single call details.
   * 
   * @route POST /api/v1/calls/details
   * @body { callId: string }
   */
  async getCallDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const result = await callService.getCallDetails(userId, req.body);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('call.details_fetched', req.language),
        data: { call: result },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const callController = new CallController();
