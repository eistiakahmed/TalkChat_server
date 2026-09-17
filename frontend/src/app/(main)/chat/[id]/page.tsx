'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatService } from '../../../../services/chat.service';
import { messageService } from '../../../../services/message.service';
import { useAuthStore } from '../../../../stores/auth.store';
import { useChatStore } from '../../../../stores/chat.store';
import { useChatSocket } from '../../../../hooks/useChatSocket';
import { useWebRTC } from '../../../../hooks/useWebRTC';
import type { ConversationMember } from '../../../../types/chat.types';
import type { Message, MessageType } from '../../../../types/message.types';
import { Avatar, Button, Spinner, Dropdown } from '../../../../components/ui';
import { MessageList } from '../../../../components/chat/MessageList';
import { MessageInput } from '../../../../components/chat/MessageInput';
import { DisappearingMessagesModal } from '../../../../components/chat/DisappearingMessagesModal';
import { SafetyNumberModal } from '../../../../components/chat/SafetyNumberModal';
import { ConversationInfoModal } from '../../../../components/chat/ConversationInfoModal';
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Clock,
  ShieldCheck,
} from 'lucide-react';

import { soundUtil } from '../../../../utils/sound.util';

/**
 * Active Conversation Thread Page.
 * 
 * Displays full real-time encrypted messaging channel with
 * timeline history, sent/delivered/read receipts, replies, and reactions.
 */
export default function ActiveChatPage() {
  const params = useParams();
  const router = useRouter();
  const conversationId = params?.id as string;
  const queryClient = useQueryClient();

  const currentUserId = useAuthStore((s) => s.user?.id);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  // Bind real-time WebSocket events for this conversation
  useChatSocket(conversationId);

  // WebRTC calling triggers
  const { startCall } = useWebRTC();

  const [replyingTo, setReplyingTo] = React.useState<Message | null>(null);
  const [isInfoOpen, setIsInfoOpen] = React.useState(false);
  const [isDisappearingOpen, setIsDisappearingOpen] = React.useState(false);
  const [isSafetyNumberOpen, setIsSafetyNumberOpen] = React.useState(false);

  // 1. Fetch conversation details
  const {
    data: conversation,
    isLoading: isLoadingConv,
    isError: isErrorConv,
  } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => chatService.getConversationDetails(conversationId),
    enabled: !!conversationId,
  });

  // 2. Fetch messages history
  const {
    data: messages = [],
    isLoading: isLoadingMessages,
  } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      const res = await messageService.getMessageHistory({
        conversationId,
        limit: 50,
      });
      // Backend returns newest first; reverse for chronological stream (oldest to newest)
      return res.messages.reverse();
    },
    enabled: !!conversationId,
  });

  React.useEffect(() => {
    if (conversation) {
      setActiveConversation(conversation);
    }
  }, [conversation, setActiveConversation]);

  // Send Message Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      content,
      file,
      parentMessageId,
    }: {
      content: string;
      file?: File;
      parentMessageId?: string;
    }) => {
      let type: MessageType = 'TEXT';
      if (file) {
        if (file.type.startsWith('image/')) type = 'IMAGE';
        else if (file.type.startsWith('audio/')) type = 'AUDIO';
        else if (file.type.startsWith('video/')) type = 'VIDEO';
        else type = 'FILE';
      }

      return messageService.sendMessage(
        {
          conversationId,
          content: content || undefined,
          type,
          parentMessageId,
        },
        file
      );
    },
    onSuccess: (newMessage) => {
      soundUtil.playMessageSent();
      queryClient.setQueryData<Message[]>(
        ['messages', conversationId],
        (old = []) => [...old, newMessage]
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setReplyingTo(null);
    },
  });

  // Reaction Mutation
  const reactMutation = useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      await messageService.toggleReaction({ messageId, emoji });
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await messageService.deleteMessage({
        messageId,
        deleteType: 'FOR_EVERYONE',
      });
    },
    onSuccess: (_, messageId) => {
      queryClient.setQueryData<Message[]>(
        ['messages', conversationId],
        (old = []) =>
          old.map((m) =>
            m.id === messageId
              ? { ...m, isDeleted: true, content: 'This message was deleted' }
              : m
          )
      );
    },
  });

  if (isLoadingConv) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center space-y-3 bg-card/20">
        <Spinner size="lg" />
        <p className="text-xs text-muted-foreground animate-pulse">
          Opening conversation...
        </p>
      </div>
    );
  }

  if (isErrorConv || !conversation) {
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
      onClick: () => setIsInfoOpen(true),
    },
    {
      id: 'disappearing',
      label: 'Disappearing Messages',
      icon: <Clock className="w-4 h-4" />,
      onClick: () => setIsDisappearingOpen(true),
    },
    ...(!isGroup && otherMember?.user
      ? [
          {
            id: 'safetyNumber',
            label: 'Verify Safety Number',
            icon: <ShieldCheck className="w-4 h-4" />,
            onClick: () => setIsSafetyNumberOpen(true),
          },
        ]
      : []),
    {
      id: 'mute',
      label: conversation.userSettings?.isMuted ? 'Unmute' : 'Mute Notifications',
      onClick: async () => {
        const nextMuted = !conversation.userSettings?.isMuted;
        await chatService.toggleMute(conversationId, nextMuted);
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      },
    },
  ];

  return (
    <div className="flex-1 h-full flex flex-col bg-background overflow-hidden select-none">
      {/* 1. Header */}
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md px-4 flex items-center justify-between z-10 shrink-0">
        <div
          onClick={() => setIsInfoOpen(true)}
          className="flex items-center gap-3 min-w-0 cursor-pointer hover:opacity-85 transition-opacity"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              router.push('/chat');
            }}
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
            disabled={isGroup || !otherMember?.user}
            onClick={() => {
              if (otherMember?.user) {
                startCall(otherMember.user, 'AUDIO', conversationId);
              }
            }}
            className="text-muted-foreground hover:text-brand-600 disabled:opacity-40"
          >
            <Phone className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            aria-label="Start Video Call"
            disabled={isGroup || !otherMember?.user}
            onClick={() => {
              if (otherMember?.user) {
                startCall(otherMember.user, 'VIDEO', conversationId);
              }
            }}
            className="text-muted-foreground hover:text-brand-600 disabled:opacity-40"
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

      {/* 2. Real-Time Message Stream Canvas */}
      <MessageList
        conversationId={conversationId}
        messages={messages}
        isLoading={isLoadingMessages}
        isGroup={isGroup}
        disappearingDuration={conversation.disappearingDuration}
        onReply={(msg) => setReplyingTo(msg)}
        onReact={(msgId, emoji) => reactMutation.mutate({ messageId: msgId, emoji })}
        onDelete={(msgId) => deleteMutation.mutate(msgId)}
      />

      {/* 3. Composer Input Bar */}
      <MessageInput
        conversationId={conversationId}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSendMessage={async (content, file, parentMessageId) => {
          await sendMessageMutation.mutateAsync({
            content,
            file,
            parentMessageId,
          });
        }}
      />

      {/* 4. Modals */}
      <ConversationInfoModal
        isOpen={isInfoOpen}
        onClose={() => setIsInfoOpen(false)}
        conversation={conversation}
        onOpenSafetyNumber={() => setIsSafetyNumberOpen(true)}
        onOpenDisappearing={() => setIsDisappearingOpen(true)}
      />

      <DisappearingMessagesModal
        isOpen={isDisappearingOpen}
        onClose={() => setIsDisappearingOpen(false)}
        conversationId={conversationId}
        currentDuration={conversation.disappearingDuration}
      />

      {otherMember?.user && (
        <SafetyNumberModal
          isOpen={isSafetyNumberOpen}
          onClose={() => setIsSafetyNumberOpen(false)}
          targetUser={otherMember.user}
        />
      )}
    </div>
  );
}
