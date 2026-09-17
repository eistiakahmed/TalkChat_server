/**
 * Strongly-typed Payload Definitions for Asynchronous Background Jobs.
 * 
 * Ensures end-to-end type safety between Queue Producers and Worker Consumers.
 * 
 * @see https://docs.bullmq.io/guide/jobs
 */

export interface NotificationJobData {
  userId: string;
  senderId?: string;
  conversationId?: string;
  title: string;
  body: string;
  badge?: number;
  data?: Record<string, unknown>;
}

export type EmailTemplate = 'WELCOME' | 'PASSWORD_RESET' | 'UNREAD_DIGEST';

export interface EmailJobData {
  to: string;
  subject: string;
  template: EmailTemplate;
  context: {
    fullName?: string;
    username?: string;
    resetToken?: string;
    unreadCount?: number;
    [key: string]: unknown;
  };
}

export type MediaJobAction = 'PROCESS_THUMBNAIL' | 'OPTIMIZE' | 'CLEANUP';

export interface MediaJobData {
  messageId?: string;
  fileUrl: string;
  publicId?: string;
  mimeType: string;
  action: MediaJobAction;
}

/**
 * Payload definition for Ephemeral media and message cleanup tasks.
 * @see https://docs.bullmq.io/guide/jobs
 */
export type EphemeralJobType = 'PURGE_EXPIRED_STORIES' | 'PURGE_EXPIRED_MESSAGES' | 'PURGE_SINGLE_MESSAGE';

export interface EphemeralPurgeJobData {
  type: EphemeralJobType;
  messageId?: string;
  conversationId?: string;
}

