'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { chatService } from '../../../../services/chat.service';
import { useAuthStore } from '../../../../stores/auth.store';
import { useChatStore } from '../../../../stores/chat.store';
import type { ConversationMember } from '../../../../types/chat.types';
import { Avatar, Button, Spinner, Dropdown } from '../../../../components/ui';
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Clock,
  Shield,
  Send,
  Paperclip,
  Smile,
  Mic,
} from 'lucide-react';

/**
 * Active Conversation Thread Page.
 * 
 * Displays the conversation header with participant presence and media call triggers,
 * message timeline canvas, and composer input bar.
 */
export default function ActiveChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params?.id as string;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const {
    data: conversation,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatService.getConversationDetails(conversationId),
    enabled: !!conversationId,
  });

  React.useEffect(() => {
    if (conversation) {
      setActiveConversation(conversation);
    }
  }, [conversation, setActiveConversation]);

  if (isLoading) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center space-y-3 bg-card/20">
        <Spinner size="lg" />
        <p className="text-xs text-muted-foreground animate-pulse">
          Opening conversation...
        </p>
      </div>
    );
  }

  if (isError || !conversation) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
        <p className="text-sm font-semibold text-danger">
          Failed to load conversation details
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push('/chat')}>
          Back to Chats
        </Button>
      </div>
    );
  }

  const isGroup = conversation.type === 'GROUP';
  const otherMember = conversation.members?.find(
    (m: ConversationMember) => m.userId !== currentUserId
  );

  const title = isGroup
    ? conversation.title || 'Group Chat'
    : otherMember?.user.fullName || otherMember?.user.username || 'Direct Message';

  const avatarUrl = isGroup
    ? conversation.avatarUrl
    : otherMember?.user.avatarUrl;

  const isOnline = !isGroup && (otherMember?.user.isOnline ?? false);
  const subtitle = isGroup
    ? `${conversation.members?.length || 0} participants`
    : isOnline
    ? 'Online'
    : otherMember?.user.lastSeen
    ? 'Recently active'
    : 'Offline';

  const chatMenuItems = [
    {
      id: 'details',
      label: isGroup ? 'Group Information' : 'Contact Details',
      onClick: () => {},
    },
    {
      id: 'disappearing',
      label: 'Disappearing Messages',
      icon: <Clock className="w-4 h-4" />,
      onClick: () => {},
    },
    {
      id: 'mute',
      label: conversation.userSettings?.isMuted ? 'Unmute' : 'Mute Notifications',
      onClick: () => {},
    },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-background overflow-hidden select-none">
      {/* 1. Header */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button on mobile */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push('/chat')}
            className="md:hidden -ml-2"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>

          <Avatar
            src={avatarUrl}
            name={title}
            size="md"
            status={isGroup ? undefined : isOnline ? 'online' : 'offline'}
          />

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-foreground truncate">{title}</h2>
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
              {isOnline && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              )}
              {subtitle}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Start Voice Call"
            className="text-muted-foreground hover:text-brand-600"
          >
            <Phone className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Start Video Call"
            className="text-muted-foreground hover:text-brand-600"
          >
            <Video className="w-4 h-4" />
          </Button>

          <Dropdown
            trigger={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Chat Options"
                className="text-muted-foreground hover:text-foreground"
              >
                <MoreVertical className="w-4 h-4" />
              </Button>
            }
            items={chatMenuItems}
            align="right"
          />
        </div>
      </header>

      {/* 2. Message Timeline Canvas Placeholder (F4 will expand full infinite scroll) */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 flex flex-col justify-end bg-card/10">
        <div className="mx-auto my-4 max-w-sm text-center p-3 rounded-xl bg-card border border-border-subtle shadow-xs space-y-1">
          <div className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
            <Shield className="w-3.5 h-3.5" />
            End-to-End Encrypted
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Messages and calls are secured with X3DH signal protocol. No one outside of this chat, not even TalkChat, can read or listen to them.
          </p>
        </div>

        {conversation.disappearingDuration ? (
          <div className="mx-auto text-center px-3 py-1 rounded-full bg-muted/60 border border-border-subtle text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-brand-600" />
            <span>Disappearing messages enabled ({conversation.disappearingDuration / 3600} hours)</span>
          </div>
        ) : null}
      </div>

      {/* 3. Composer Input Bar Placeholder */}
      <div className="p-3 border-t border-border bg-card/80 backdrop-blur-md flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Attach File"
          className="text-muted-foreground hover:text-foreground"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Type a message..."
            className="w-full h-10 px-4 pr-10 rounded-xl bg-muted/50 border border-border-subtle text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:border-brand-500/50 transition-colors"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Insert Emoji"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Voice Note"
          className="text-muted-foreground hover:text-foreground"
        >
          <Mic className="w-4 h-4" />
        </Button>

        <Button
          variant="primary"
          size="icon"
          aria-label="Send Message"
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
