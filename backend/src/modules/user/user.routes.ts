import { Router } from 'express';
import { userController } from './user.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  updateProfileSchema,
  searchUserSchema,
  contactParamSchema,
  respondContactSchema,
  blockParamSchema,
} from './user.validation.js';

/**
 * User & Profile Management Router.
 * 
 * Declares routes for profile updates (with avatar uploads), user search,
 * contact requests, and user blocking.
 * 
 * Routes:
 * - PATCH  /api/v1/users/me                     - Update profile & upload avatar (Protected)
 * - GET    /api/v1/users/search                 - Search users by username/email/name (Protected)
 * - GET    /api/v1/users/contacts               - Get user contacts (Protected)
 * - POST   /api/v1/users/contacts/:contactId    - Send contact request (Protected)
 * - PATCH  /api/v1/users/contacts/:contactId    - Accept/Decline contact request (Protected)
 * - GET    /api/v1/users/blocked                - Get blocked user list (Protected)
 * - POST   /api/v1/users/block/:targetUserId    - Block a user (Protected)
 * - DELETE /api/v1/users/block/:targetUserId    - Unblock a user (Protected)
 * - GET    /api/v1/users/:id                    - Get public profile by ID (Protected)
 * 
 * @see https://expressjs.com/en/guide/routing.html
 */
const router = Router();

// All routes require authentication
router.use(authenticate);

// Profile routes
router.patch('/me', upload.single('avatar'), validate(updateProfileSchema), (req, res, next) =>
  userController.updateProfile(req, res, next)
);

// Search routes
router.get('/search', validate(searchUserSchema), (req, res, next) =>
  userController.searchUsers(req, res, next)
);

// Contact routes
router.get('/contacts', (req, res, next) => userController.getContacts(req, res, next));
router.post('/contacts/:contactId', validate(contactParamSchema), (req, res, next) =>
  userController.sendContactRequest(req, res, next)
);
router.patch('/contacts/:contactId', validate(respondContactSchema), (req, res, next) =>
  userController.respondContactRequest(req, res, next)
);

// Block routes
router.get('/blocked', (req, res, next) => userController.getBlockedUsers(req, res, next));
router.post('/block/:targetUserId', validate(blockParamSchema), (req, res, next) =>
  userController.blockUser(req, res, next)
);
router.delete('/block/:targetUserId', validate(blockParamSchema), (req, res, next) =>
  userController.unblockUser(req, res, next)
);

// Public profile
router.get('/:id', (req, res, next) => userController.getUserById(req, res, next));

export default router;
