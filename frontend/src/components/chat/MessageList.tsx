'use client';

import * as React from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import type { Message } from '../../types/message.types';
import { MessageBubble } from './MessageBubble';
import { useAuthStore } from '../../stores/auth.store';
import { useSocketStore, type TypingUser } from '../../stores/socket.store';
import { Spinner } from '../ui';
import { Shield } from 'lucide-react';

const EMPTY_TYPING_USERS: TypingUser[] = [];
const selectCurrentUserId = (s: { user: { id: string } | null }) => s.user?.id;

export interface MessageListProps {
  conversationId: string;
  messages: Message[];
  isLoading?: boolean;
  isGroup?: boolean;
  disappearingDuration?: number | null;
  onReply: (message: Message) => void;
  onReact: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
}

/**
 * Format message date separator header.
 */
function formatDateSeparator(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMMM d, yyyy');
  } catch {
    return dateStr;
  }
}

/**
 * Real-Time Message History Timeline Component.
 * 
 * Renders chronological message stream with date headers,
 * auto-scroll management, and active typing presence indicators.
 */
export function MessageList({
  conversationId,
  messages,
  isLoading,
  isGroup,
  disappearingDuration,
  onReply,
  onReact,
  onDelete,
}: MessageListProps) {
  const currentUserId = useAuthStore(selectCurrentUserId);
  const typingSelector = React.useCallback(
    (s: { typingUsers: Record<string, TypingUser[]> }) => s.typingUsers[conversationId],
    [conversationId]
  );
  const rawTyping = useSocketStore(typingSelector);
  const typingUsers = rawTyping || EMPTY_TYPING_USERS;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on messages update
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typingUsers.length]);

  // Group messages chronologically by day
  const groupedByDate = React.useMemo(() => {
    const groups: Array<{ date: string; items: Message[] }> = [];
    let currentDate = '';

    messages.forEach((msg) => {
      const msgDate = new Date(msg.createdAt).toDateString();
      if (msgDate !== currentDate) {
        currentDate = msgDate;
        groups.push({ date: msg.createdAt, items: [msg] });
      } else {
        groups[groups.length - 1].items.push(msg);
      }
    });

    return groups;
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center space-y-3">
        <Spinner size="lg" />
        <p className="text-xs text-muted-foreground animate-pulse">
          Loading encrypted messages...
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4 select-none"
    >
      {/* Encryption Header Notice */}
      <div className="mx-auto max-w-sm text-center p-3 rounded-xl bg-card border border-border-subtle shadow-xs space-y-1">
        <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
          <Shield className="w-3.5 h-3.5" />
          End-to-End Encrypted
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Messages and calls are secured with X3DH signal protocol. No one outside of this chat can read or listen to them.
        </p>
      </div>

      {/* Disappearing Messages Duration Notification */}
      {disappearingDuration && disappearingDuration > 0 ? (
        <div className="flex justify-center">
          <span className="px-3 py-1 rounded-full bg-muted/70 border border-border-subtle text-[11px] text-muted-foreground">
            Disappearing messages enabled ({disappearingDuration / 3600}h lifespan)
          </span>
        </div>
      ) : null}

      {/* Grouped Messages Stream */}
      {groupedByDate.map((group) => (
        <div key={group.date} className="space-y-2">
          {/* Day Divider Pill */}
          <div className="flex justify-center my-3">
            <span className="px-3 py-0.5 rounded-full bg-muted/80 text-[11px] font-semibold text-muted-foreground border border-border-subtle shadow-xs">
              {formatDateSeparator(group.date)}
            </span>
          </div>

          {/* Messages for this day */}
          {group.items.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              isSelf={message.senderId === currentUserId}
              isGroup={isGroup}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
            />
          ))}
        </div>
      ))}

      {/* Active Typing Indicator Dots */}
      {typingUsers.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground animate-fadeIn pl-2">
          <div className="flex gap-1 py-1 px-2.5 rounded-full bg-card border border-border-subtle shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce" />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-600 animate-bounce [animation-delay:0.4s]" />
          </div>
          <span className="italic">
            {typingUsers.map((u) => u.username).join(', ')}{' '}
            {typingUsers.length > 1 ? 'are typing...' : 'is typing...'}
          </span>
        </div>
      )}

      {/* Anchor for auto-scrolling */}
      <div ref={bottomRef} />
    </div>
  );
}
