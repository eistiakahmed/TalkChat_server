import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../middlewares/validate.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { registerSchema, loginSchema, refreshTokenSchema } from './auth.validation.js';

/**
 * Authentication Module Express Router.
 * 
 * Declares all authentication endpoints, binding input validation schemas
 * and authentication middleware guards.
 * 
 * Routes:
 * - POST /api/v1/auth/register      - Create account
 * - POST /api/v1/auth/login         - User login
 * - POST /api/v1/auth/refresh-token - Rotate refresh token
 * - POST /api/v1/auth/logout        - Revoke session tokens (Protected)
 * - GET  /api/v1/auth/me            - Retrieve active user profile (Protected)
 * 
 * @see https://expressjs.com/en/guide/routing.html#express-router
 */
const router = Router();

router.post('/register', validate(registerSchema), (req, res, next) => authController.register(req, res, next));
router.post('/login', validate(loginSchema), (req, res, next) => authController.login(req, res, next));
router.post('/refresh-token', validate(refreshTokenSchema), (req, res, next) => authController.refreshToken(req, res, next));
router.post('/logout', authenticate, (req, res, next) => authController.logout(req, res, next));
router.get('/me', authenticate, (req, res, next) => authController.getMe(req, res, next));

export default router;
