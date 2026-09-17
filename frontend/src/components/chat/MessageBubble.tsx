'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Trash2, Smile, MoreHorizontal } from 'lucide-react';
import type { Message, MessageReaction } from '../../types/message.types';
import { Avatar, Dropdown } from '../ui';
import { cn } from '../../utils/cn';

export interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  isGroup?: boolean;
  onReply?: (message: Message) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

/**
 * Message Bubble Component.
 * 
 * Supports sent/received distinct styling, quote replies, media attachments,
 * delivery checkmarks (Sent, Delivered, Read), and emoji reaction counters.
 */
export function MessageBubble({
  message,
  isSelf,
  isGroup,
  onReply,
  onReact,
  onDelete,
}: MessageBubbleProps) {
  const [showEmojiBar, setShowEmojiBar] = React.useState(false);

  // Derive delivery receipt status for self-sent messages
  const receiptStatus = React.useMemo(() => {
    if (!isSelf || !message.receipts || message.receipts.length === 0) {
      return 'SENT';
    }
    const hasRead = message.receipts.some((r) => r.status === 'READ');
    if (hasRead) return 'READ';
    const hasDelivered = message.receipts.some((r) => r.status === 'DELIVERED');
    if (hasDelivered) return 'DELIVERED';
    return 'SENT';
  }, [isSelf, message.receipts]);

  // Group reactions by emoji
  const groupedReactions = React.useMemo(() => {
    const map = new Map<string, number>();
    message.reactions?.forEach((r) => {
      map.set(r.emoji, (map.get(r.emoji) || 0) + 1);
    });
    return Array.from(map.entries()).map(([emoji, count]) => ({ emoji, count }));
  }, [message.reactions]);

  const formattedTime = React.useMemo(() => {
    try {
      return format(new Date(message.createdAt), 'p'); // e.g. 10:45 AM
    } catch {
      return '';
    }
  }, [message.createdAt]);

  const menuItems = [
    {
      id: 'reply',
      label: 'Reply',
      icon: <Reply className="w-4 h-4" />,
      onClick: () => onReply?.(message),
    },
    ...(isSelf
      ? [
          {
            id: 'delete',
            label: 'Delete for everyone',
            icon: <Trash2 className="w-4 h-4" />,
            danger: true,
            onClick: () => onDelete?.(message.id),
          },
        ]
      : []),
  ];

  return (
    <div
      className={cn(
        'group relative flex flex-col my-1',
        isSelf ? 'items-end' : 'items-start'
      )}
      onMouseLeave={() => setShowEmojiBar(false)}
    >
      <div
        className={cn(
          'flex items-end gap-2 max-w-[85%] sm:max-w-[70%]',
          isSelf && 'flex-row-reverse'
        )}
      >
        {/* Other participant avatar in groups */}
        {!isSelf && isGroup && (
          <Avatar
            src={message.sender?.avatarUrl}
            name={message.sender?.fullName || message.sender?.username}
            size="xs"
            className="mb-1"
          />
        )}

        {/* Message Bubble Box */}
        <div
          className={cn(
            'relative px-4 py-2.5 shadow-xs select-text transition-all',
            isSelf
              ? 'bg-brand-600 text-white rounded-2xl rounded-br-xs'
              : 'bg-card border border-border-subtle text-foreground rounded-2xl rounded-bl-xs'
          )}
        >
          {/* Sender name for group chats */}
          {!isSelf && isGroup && (
            <p className="text-[11px] font-bold text-brand-600 dark:text-brand-400 mb-1">
              {message.sender?.fullName || message.sender?.username}
            </p>
          )}

          {/* Quoted Reply Parent Context */}
          {message.parentMessage && (
            <div
              className={cn(
                'mb-2 p-2 rounded-lg text-xs border-l-3 select-none',
                isSelf
                  ? 'bg-black/20 border-white/80 text-white/90'
                  : 'bg-muted/70 border-brand-600 text-muted-foreground'
              )}
            >
              <span className="font-semibold block text-[10px]">
                {message.parentMessage.sender?.fullName ||
                  message.parentMessage.sender?.username ||
                  'Message'}
              </span>
              <p className="truncate line-clamp-1">
                {message.parentMessage.content || 'Attachment'}
              </p>
            </div>
          )}

          {/* Media Attachments */}
          {message.attachments && message.attachments.length > 0 && (
            <div className="space-y-2 mb-2">
              {message.attachments.map((att) => (
                <div key={att.id} className="rounded-xl overflow-hidden">
                  {att.fileType === 'IMAGE' ? (
                    <img
                      src={att.fileUrl}
                      alt={att.fileName || 'Attachment'}
                      className="max-h-72 w-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition-opacity"
                    />
                  ) : att.fileType === 'AUDIO' ? (
                    <audio controls src={att.fileUrl} className="w-full h-10" />
                  ) : (
                    <a
                      href={att.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-lg text-xs underline',
                        isSelf ? 'text-white' : 'text-brand-600'
                      )}
                    >
                      📁 {att.fileName || 'Download attachment'}
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Text Content */}
          {message.isDeleted ? (
            <p className="italic text-xs opacity-70">This message was deleted</p>
          ) : (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </p>
          )}

          {/* Timestamp and Receipt Indicators */}
          <div
            className={cn(
              'flex items-center justify-end gap-1.5 mt-1 text-[10px]',
              isSelf ? 'text-white/80' : 'text-muted-foreground'
            )}
          >
            {message.isEdited && <span>(edited)</span>}
            <span>{formattedTime}</span>

            {isSelf && !message.isDeleted && (
              <span aria-label={`Status: ${receiptStatus}`}>
                {receiptStatus === 'SENT' ? (
                  <Check className="w-3.5 h-3.5 text-white/70" />
                ) : receiptStatus === 'DELIVERED' ? (
                  <CheckCheck className="w-3.5 h-3.5 text-white/80" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Hover Quick Action Buttons (Reply, React, Options) */}
        {!message.isDeleted && (
          <div
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shrink-0 pb-1',
              isSelf ? 'flex-row-reverse' : 'flex-row'
            )}
          >
            <button
              type="button"
              onClick={() => onReply?.(message)}
              className="p-1 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              aria-label="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowEmojiBar(!showEmojiBar)}
              className="p-1 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
              aria-label="React"
            >
              <Smile className="w-3.5 h-3.5" />
            </button>

            <Dropdown
              trigger={
                <button
                  type="button"
                  className="p-1 rounded-full text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
                  aria-label="More Options"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              }
              items={menuItems}
              align={isSelf ? 'right' : 'left'}
            />
          </div>
        )}
      </div>

      {/* Quick Reaction Emoji Popover Bar */}
      {showEmojiBar && (
        <div
          className={cn(
            'flex items-center gap-1.5 p-1.5 bg-card border border-border shadow-md rounded-full mt-1 z-20 animate-fadeIn',
            isSelf ? 'mr-2' : 'ml-2'
          )}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onReact?.(message.id, emoji);
                setShowEmojiBar(false);
              }}
              className="text-base p-1 hover:scale-125 transition-transform"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Rendered Reaction Pills */}
      {groupedReactions.length > 0 && (
        <div
          className={cn(
            'flex items-center gap-1 mt-1 z-10',
            isSelf ? 'mr-1' : 'ml-1'
          )}
        >
          {groupedReactions.map(({ emoji, count }) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(message.id, emoji)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-card border border-border text-[11px] font-medium shadow-xs hover:bg-muted/80 transition-colors"
            >
              <span>{emoji}</span>
              {count > 1 && <span className="text-muted-foreground">{count}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
