import { Router } from 'express';
import { callController } from './call.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { getCallHistorySchema, getCallDetailsSchema } from './call.validation.js';

/**
 * WebRTC Call Management Router.
 * 
 * Routes:
 * - POST /api/v1/calls/history  - Fetch user's paginated call history (Protected)
 * - POST /api/v1/calls/details  - Fetch single call record details (Protected)
 * 
 * Strictly body-only parameters (no URL/path params).
 */
const router = Router();

// All call management routes require active authentication
router.use(authenticate);

// Fetch paginated call logs
router.post(
  '/history',
  validate(getCallHistorySchema),
  (req, res, next) => callController.getCallHistory(req, res, next)
);

// Fetch call details
router.post(
  '/details',
  validate(getCallDetailsSchema),
  (req, res, next) => callController.getCallDetails(req, res, next)
);

export default router;
