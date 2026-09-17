import { Router } from 'express';
import { chatController } from './chat.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.js';
import { upload } from '../../middlewares/upload.middleware.js';
import {
  createDirectChatSchema,
  createGroupChatSchema,
  getChatsListSchema,
  chatDetailsSchema,
  updateGroupChatSchema,
  addMembersSchema,
  removeMemberSchema,
  updateMemberRoleSchema,
  leaveGroupSchema,
  muteChatSchema,
  markReadSchema,
  updateDisappearingTimerSchema,
} from './chat.validation.js';

/**
 * Chat and Conversation Management Router.
 * 
 * Declares RESTful routes for 1-to-1 direct messaging and group chat channels.
 * Strictly adheres to body-only parameters (no URL/path params).
 * 
 * Routes:
 * - POST   /api/v1/chats/direct        - Create or get existing direct chat (Protected)
 * - POST   /api/v1/chats/group         - Create group conversation with avatar (Protected)
 * - POST   /api/v1/chats/list          - List user conversations with pagination (Protected)
 * - POST   /api/v1/chats/details       - Get conversation details & active roster (Protected)
 * - PATCH  /api/v1/chats/update-group  - Update group title, description, avatar (Protected)
 * - POST   /api/v1/chats/add-members   - Add members to group (Protected)
 * - POST   /api/v1/chats/remove-member - Remove member from group (Protected)
 * - PATCH  /api/v1/chats/update-role   - Update member role (ADMIN/MODERATOR/MEMBER) (Protected)
 * - POST   /api/v1/chats/leave         - Voluntarily leave group (Protected)
 * - PATCH  /api/v1/chats/mute          - Toggle conversation mute setting (Protected)
 * - PATCH  /api/v1/chats/read          - Mark conversation as read (reset unreadCount) (Protected)
 * 
 * @see https://expressjs.com/en/guide/routing.html
 * @see https://owasp.org/www-project-api-security/
 */
const router = Router();

// All chat routes require valid JWT bearer authentication
router.use(authenticate);

// 1-to-1 Direct Chat initiation
router.post('/direct', validate(createDirectChatSchema), (req, res, next) =>
  chatController.createDirectChat(req, res, next)
);

// Group Chat creation (supports multipart/form-data avatar upload)
router.post(
  '/group',
  upload.single('avatar'),
  validate(createGroupChatSchema),
  (req, res, next) => chatController.createGroupChat(req, res, next)
);

// List user conversations
router.post('/list', validate(getChatsListSchema), (req, res, next) =>
  chatController.getUserConversations(req, res, next)
);

// Conversation details & roster inspection
router.post('/details', validate(chatDetailsSchema), (req, res, next) =>
  chatController.getConversationDetails(req, res, next)
);

// Group metadata modification (supports multipart/form-data avatar upload)
router.patch(
  '/update-group',
  upload.single('avatar'),
  validate(updateGroupChatSchema),
  (req, res, next) => chatController.updateGroupChat(req, res, next)
);

// Member management
router.post('/add-members', validate(addMembersSchema), (req, res, next) =>
  chatController.addMembers(req, res, next)
);

router.post('/remove-member', validate(removeMemberSchema), (req, res, next) =>
  chatController.removeMember(req, res, next)
);

router.patch('/update-role', validate(updateMemberRoleSchema), (req, res, next) =>
  chatController.updateMemberRole(req, res, next)
);

router.post('/leave', validate(leaveGroupSchema), (req, res, next) =>
  chatController.leaveGroup(req, res, next)
);

// Notification and read status controls
router.patch('/mute', validate(muteChatSchema), (req, res, next) =>
  chatController.toggleMute(req, res, next)
);

router.patch('/read', validate(markReadSchema), (req, res, next) =>
  chatController.markAsRead(req, res, next)
);

// Disappearing message lifespan configuration
router.post('/disappearing', validate(updateDisappearingTimerSchema), (req, res, next) =>
  chatController.updateDisappearingTimer(req, res, next)
);

export default router;
