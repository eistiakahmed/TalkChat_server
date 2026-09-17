import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.config.js';
import { i18nMiddleware, t } from './i18n/i18n.middleware.js';
import { errorHandler } from './errors/errorHandler.js';
import { NotFoundError } from './errors/AppError.js';
import { HttpStatus } from './constants/httpStatusCodes.js';
import authRouter from './modules/auth/auth.routes.js';
import userRouter from './modules/user/user.routes.js';
import chatRouter from './modules/chat/chat.routes.js';
import messageRouter from './modules/message/message.routes.js';
import e2eeRouter from './modules/e2ee/e2ee.routes.js';

export const createApp = (): Express => {
  const app = express();

  // Security & standard middlewares
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // i18n localization middleware
  app.use(i18nMiddleware);

  // Health check endpoint
  const healthCheck = (req: Request, res: Response) => {
    const lang = req.language || 'en';
    res.status(HttpStatus.OK).json({
      success: true,
      status: 'UP',
      message: t('server.health_ok', lang),
      env: env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/health', healthCheck);
  app.get('/api/health', healthCheck);
  app.get(`${env.API_PREFIX}/health`, healthCheck);

  // Authentication Module Routes
  // @see https://expressjs.com/en/guide/routing.html
  app.use(`${env.API_PREFIX}/auth`, authRouter);

  // User & Profile Management Routes
  // @see https://expressjs.com/en/guide/routing.html
  app.use(`${env.API_PREFIX}/users`, userRouter);

  // Chat & Conversation Management Routes
  // @see https://expressjs.com/en/guide/routing.html
  app.use(`${env.API_PREFIX}/chats`, chatRouter);

  // Message & Chat History Routes
  // @see https://expressjs.com/en/guide/routing.html
  app.use(`${env.API_PREFIX}/messages`, messageRouter);

  // End-to-End Encryption (E2EE) Key Exchange & Safety Numbers
  // @see https://signal.org/docs/specifications/x3dh/
  app.use(`${env.API_PREFIX}/e2ee`, e2eeRouter);

  // 404 Handler for undefined routes
  app.use((_req: Request, _res: Response, next) => {
    next(new NotFoundError('Route not found', 'errors.route_not_found'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};
