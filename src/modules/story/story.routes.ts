import { Router } from 'express';
import { storyController } from './story.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import {
  createStorySchema,
  getStoryFeedSchema,
  viewStorySchema,
  getStoryViewersSchema,
  deleteStorySchema,
} from './story.validation.js';

/**
 * Ephemeral Stories Router.
 * 
 * Routes:
 * - POST /api/v1/stories/create   - Create 24h expiring story (Protected)
 * - POST /api/v1/stories/feed     - Get active stories feed (Protected)
 * - POST /api/v1/stories/view     - Mark a story as viewed (Protected)
 * - POST /api/v1/stories/viewers  - Get viewers roster for a story (Protected, Creator only)
 * - POST /api/v1/stories/delete   - Delete a story manually (Protected, Creator only)
 * - POST /api/v1/stories/me       - Get user's own active stories (Protected)
 * 
 * Strictly body-only parameters (no URL/path params).
 * @see https://expressjs.com/en/guide/routing.html
 */
const router = Router();

// All story routes require authentication
router.use(authenticate);

// Create a new story
router.post(
  '/create',
  validate(createStorySchema),
  (req, res, next) => storyController.createStory(req, res, next)
);

// Get stories feed from contacts and self
router.post(
  '/feed',
  validate(getStoryFeedSchema),
  (req, res, next) => storyController.getStoryFeed(req, res, next)
);

// Record a view on a story
router.post(
  '/view',
  validate(viewStorySchema),
  (req, res, next) => storyController.viewStory(req, res, next)
);

// Get viewers roster (Creator only)
router.post(
  '/viewers',
  validate(getStoryViewersSchema),
  (req, res, next) => storyController.getStoryViewers(req, res, next)
);

// Delete story manually
router.post(
  '/delete',
  validate(deleteStorySchema),
  (req, res, next) => storyController.deleteStory(req, res, next)
);

// Get my active stories
router.post('/me', (req, res, next) => storyController.getMyStories(req, res, next));

export default router;
