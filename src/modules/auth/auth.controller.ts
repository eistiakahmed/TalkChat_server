import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { sendResponse } from '../../utils/response.util.js';
import { HttpStatus } from '../../constants/httpStatusCodes.js';
import { t } from '../../i18n/i18n.middleware.js';

/**
 * Authentication Controller.
 * 
 * Thin routing layer orchestrating incoming requests, invoking the AuthService,
 * and dispatching standardized HTTP responses.
 * 
 * @see https://expressjs.com/en/guide/routing.html
 */
export class AuthController {
  /**
   * Register a new user account.
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceInfo = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.register(req.body, deviceInfo, ipAddress);

      sendResponse({
        res,
        statusCode: HttpStatus.CREATED,
        message: t('auth.registered_successfully', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Authenticate with email or username and password.
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const deviceInfo = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const result = await authService.login(req.body, deviceInfo, ipAddress);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('auth.logged_in_successfully', req.language),
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Rotate refresh token and obtain new access token.
   */
  async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;
      const deviceInfo = req.headers['user-agent'];
      const ipAddress = req.ip || req.socket.remoteAddress;

      const tokens = await authService.refreshToken(refreshToken, deviceInfo, ipAddress);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('auth.token_refreshed', req.language),
        data: { tokens },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Revoke active session tokens and logout.
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const { refreshToken } = req.body;
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];

      await authService.logout(userId, refreshToken, accessToken);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        message: t('auth.logged_out_successfully', req.language),
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Retrieve profile of currently authenticated user.
   */
  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.userId!;
      const user = await authService.getProfile(userId);

      sendResponse({
        res,
        statusCode: HttpStatus.OK,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
