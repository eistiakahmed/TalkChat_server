import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.config.js';
import { i18nMiddleware, t } from './i18n/i18n.middleware.js';
import { errorHandler } from './errors/errorHandler.js';
import { NotFoundError } from './errors/AppError.js';
import { HttpStatus } from './constants/httpStatusCodes.js';

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

  // 404 Handler for undefined routes
  app.use((_req: Request, _res: Response, next) => {
    next(new NotFoundError('Route not found', 'errors.route_not_found'));
  });

  // Centralized Error Handling Middleware
  app.use(errorHandler);

  return app;
};
