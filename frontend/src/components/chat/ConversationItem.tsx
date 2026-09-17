'use client';

import * as React from 'react';
import type { Conversation, ConversationMember } from '../../types/chat.types';
import { useAuthStore } from '../../stores/auth.store';
import { Avatar, Badge } from '../ui';
import { formatConversationTime } from '../../utils/date.util';
import { Clock, VolumeX, Users } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface ConversationItemProps {
  conversation: Conversation;
  isActive: boolean;
  onClick: () => void;
}

/**
 * Conversation List Item Component.
 * 
 * Renders individual conversations in the sidebar with avatar,
 * presence indicator, unread pill badge, disappearing timer icon,
 * and relative timestamp.
 */
export function ConversationItem({
  conversation,
  isActive,
  onClick,
}: ConversationItemProps) {
  const currentUserId = useAuthStore((s) => s.user?.id);

  // Identify display metadata depending on Direct or Group conversation
  const isGroup = conversation.type === 'GROUP';

  const otherMember = conversation.members?.find(
    (m: ConversationMember) => m.userId !== currentUserId
  );

  const displayName = isGroup
    ? conversation.title || 'Unnamed Group'
    : otherMember?.user.fullName || otherMember?.user.username || 'Direct Message';

  const avatarUrl = isGroup
    ? conversation.avatarUrl
    : otherMember?.user.avatarUrl;

  const isOnline = !isGroup && (otherMember?.user.isOnline ?? false);

  const unreadCount = conversation.userSettings?.unreadCount || 0;
  const isMuted = conversation.userSettings?.isMuted || false;
  const isDisappearing =
    conversation.disappearingDuration !== undefined &&
    conversation.disappearingDuration !== null &&
    conversation.disappearingDuration > 0;

  const timestamp = formatConversationTime(
    conversation.lastMessageAt || conversation.updatedAt
  );

  const lastMessageText = conversation.lastMessage
    ? conversation.lastMessage.isDeleted
      ? 'This message was deleted'
      : conversation.lastMessage.content || 'Attachment'
    : 'No messages yet';

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left transition-all select-none group',
        isActive
          ? 'bg-brand-500/10 dark:bg-brand-500/15 text-foreground font-medium'
          : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
      )}
    >
      {/* Avatar Container */}
      <div className="relative shrink-0">
        <Avatar
          src={avatarUrl}
          name={displayName}
          size="md"
          status={isGroup ? undefined : isOnline ? 'online' : 'offline'}
          icon={isGroup ? <Users className="w-5 h-5 text-muted-foreground" /> : undefined}
        />
      </div>

      {/* Main Metadata & Message Preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span
            className={cn(
              'font-semibold text-sm truncate',
              isActive ? 'text-brand-600 dark:text-brand-400' : 'text-foreground'
            )}
          >
            {displayName}
          </span>
          {timestamp && (
            <span
              className={cn(
                'text-xs shrink-0',
                unreadCount > 0
                  ? 'text-brand-600 dark:text-brand-400 font-semibold'
                  : 'text-muted-foreground'
              )}
            >
              {timestamp}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p
            className={cn(
              'text-xs truncate max-w-[190px]',
              unreadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'
            )}
          >
            {lastMessageText}
          </p>

          {/* Indicators: Muted, Disappearing Clock, Unread Pill */}
          <div className="flex items-center gap-1.5 shrink-0">
            {isMuted && <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />}
            {isDisappearing && (
              <Clock className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
            )}
            {unreadCount > 0 && (
              <Badge variant="primary" size="sm">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
