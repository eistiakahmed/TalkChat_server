import { Router } from 'express';
import { messageController } from './message.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  sendMessageSchema,
  getMessageHistorySchema,
  editMessageSchema,
  deleteMessageSchema,
  reactMessageSchema,
  updateReceiptSchema,
} from './message.validation.js';

/**
 * Message and Real-time Chat History Router.
 * 
 * Declares RESTful routes for message transmission, cursor-based chat history retrieval,
 * editing, deletion, emoji reactions, and receipts.
 * Strictly adheres to body-only parameters (no URL/path params).
 * 
 * Routes:
 * - POST   /api/v1/messages/send    - Send message with optional media attachment (Protected)
 * - POST   /api/v1/messages/list    - Fetch cursor-paginated chat history (Protected)
 * - PATCH  /api/v1/messages/edit    - Edit previously sent message (Protected)
 * - POST   /api/v1/messages/delete  - Delete message (FOR_ME / FOR_EVERYONE) (Protected)
 * - POST   /api/v1/messages/react   - Toggle emoji reaction on message (Protected)
 * - POST   /api/v1/messages/receipt - Bulk update message delivery/read status (Protected)
 * 
 * @see https://expressjs.com/en/guide/routing.html
 * @see https://owasp.org/www-project-api-security/
 */
const router = Router();

// All message routes require valid JWT bearer authentication
router.use(authenticate);

// Send message (supports optional multipart/form-data media attachment)
router.post(
  '/send',
  upload.single('attachment'),
  validate(sendMessageSchema),
  (req, res, next) => messageController.sendMessage(req, res, next)
);

// Fetch conversation chat history using cursor pagination
router.post('/list', validate(getMessageHistorySchema), (req, res, next) =>
  messageController.getMessageHistory(req, res, next)
);

// Edit message text
router.patch('/edit', validate(editMessageSchema), (req, res, next) =>
  messageController.editMessage(req, res, next)
);

// Delete message
router.post('/delete', validate(deleteMessageSchema), (req, res, next) =>
  messageController.deleteMessage(req, res, next)
);

// Toggle emoji reaction
router.post('/react', validate(reactMessageSchema), (req, res, next) =>
  messageController.toggleReaction(req, res, next)
);

// Delivery and read receipts
router.post('/receipt', validate(updateReceiptSchema), (req, res, next) =>
  messageController.updateReceipts(req, res, next)
);

export default router;
