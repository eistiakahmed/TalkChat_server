'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { socketClient } from '../services/socket.client';
import { useAuthStore } from '../stores/auth.store';
import { useSocketStore } from '../stores/socket.store';
import { messageService } from '../services/message.service';
import { soundUtil } from '../utils/sound.util';
import { notificationService } from '../services/notification.service';
import type { Message, MessageReaction, MessageReceipt } from '../types/message.types';

/**
 * Custom React Hook for Real-Time Socket.io Synchronization.
 * 
 * Binds active conversation room events, typing indicators,
 * message delivery status checkmarks, and optimistic cache invalidation.
 * 
 * @see https://socket.io/docs/v4/client-api/
 */
export function useChatSocket(activeConversationId?: string | null) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  React.useEffect(() => {
    if (!isAuthenticated) return;

    const socket = socketClient.connect();

    const onConnect = () => useSocketStore.getState().setConnected(true);
    const onDisconnect = () => useSocketStore.getState().setConnected(false);

    // Message Lifecycle Events
    const onNewMessage = (payload: { message: Message }) => {
      const msg = payload.message;
      if (!msg) return;

      // Update Messages Cache for this conversation
      queryClient.setQueryData<Message[]>(
        ['messages', msg.conversationId],
        (old = []) => {
          if (old.some((m) => m.id === msg.id)) return old;
          return [...old, msg];
        }
      );

      // Invalidate and refresh conversation list
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      // Audio and Desktop Notification dispatch
      if (msg.senderId !== currentUserId) {
        soundUtil.playMessageReceived();

        if (
          typeof document !== 'undefined' &&
          (document.hidden || activeConversationId !== msg.conversationId)
        ) {
          const senderTitle =
            msg.sender?.fullName || msg.sender?.username || 'New Message';
          notificationService.showNotification(senderTitle, {
            body: msg.content || 'Sent an attachment',
            onClickUrl: `/chat/${msg.conversationId}`,
          });
        }
      }

      // Automatically send read receipt if actively viewing this chat
      if (
        activeConversationId === msg.conversationId &&
        msg.senderId !== currentUserId
      ) {
        messageService
          .updateReceipts({
            conversationId: msg.conversationId,
            messageIds: [msg.id],
            status: 'READ',
          })
          .catch(() => {});
      }
    };

    const onMessageEdited = (payload: { message: Message }) => {
      const updated = payload.message;
      if (!updated) return;

      queryClient.setQueryData<Message[]>(
        ['messages', updated.conversationId],
        (old = []) =>
          old.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
      );
    };

    const onMessageDeleted = (payload: { messageId: string; conversationId: string }) => {
      const { messageId, conversationId } = payload;
      queryClient.setQueryData<Message[]>(
        ['messages', conversationId],
        (old = []) =>
          old.map((m) =>
            m.id === messageId
              ? { ...m, isDeleted: true, content: 'This message was deleted' }
              : m
          )
      );
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const onMessageReaction = (payload: {
      messageId: string;
      conversationId: string;
      reaction: MessageReaction;
      action: 'ADDED' | 'REMOVED';
    }) => {
      const { messageId, conversationId, reaction, action } = payload;
      queryClient.setQueryData<Message[]>(
        ['messages', conversationId],
        (old = []) =>
          old.map((m) => {
            if (m.id !== messageId) return m;
            const currentReactions = m.reactions || [];
            let updated: MessageReaction[];
            if (action === 'ADDED') {
              updated = [...currentReactions.filter((r) => r.userId !== reaction.userId), reaction];
            } else {
              updated = currentReactions.filter((r) => r.userId !== reaction.userId);
            }
            return { ...m, reactions: updated };
          })
      );
    };

    const onMessageReceipt = (payload: {
      conversationId: string;
      messageIds: string[];
      status: 'DELIVERED' | 'READ';
      userId: string;
    }) => {
      const { conversationId, messageIds, status, userId } = payload;
      queryClient.setQueryData<Message[]>(
        ['messages', conversationId],
        (old = []) =>
          old.map((m) => {
            if (!messageIds.includes(m.id)) return m;
            const currentReceipts = m.receipts || [];
            const existing = currentReceipts.find((r) => r.userId === userId);
            const newReceipt: MessageReceipt = {
              userId,
              status,
              deliveredAt: status === 'DELIVERED' ? new Date().toISOString() : existing?.deliveredAt,
              readAt: status === 'READ' ? new Date().toISOString() : existing?.readAt,
            };
            return {
              ...m,
              receipts: [
                ...currentReceipts.filter((r) => r.userId !== userId),
                newReceipt,
              ],
            };
          })
      );
    };

    // Presence & Typing Events
    const onTypingStart = (payload: {
      conversationId: string;
      userId: string;
      username: string;
    }) => {
      if (payload.userId !== currentUserId) {
        useSocketStore.getState().addTypingUser(payload.conversationId, {
          userId: payload.userId,
          username: payload.username,
        });
      }
    };

    const onTypingStop = (payload: {
      conversationId: string;
      userId: string;
    }) => {
      useSocketStore.getState().removeTypingUser(payload.conversationId, payload.userId);
    };

    const onUserOnline = (payload: { userId: string }) => {
      useSocketStore.getState().setUserOnline(payload.userId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    const onUserOffline = (payload: { userId: string }) => {
      useSocketStore.getState().setUserOffline(payload.userId);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('message:new', onNewMessage);
    socket.on('message:edited', onMessageEdited);
    socket.on('message:deleted', onMessageDeleted);
    socket.on('message:reaction', onMessageReaction);
    socket.on('message:receipt', onMessageReceipt);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('presence:online', onUserOnline);
    socket.on('presence:offline', onUserOffline);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('message:new', onNewMessage);
      socket.off('message:edited', onMessageEdited);
      socket.off('message:deleted', onMessageDeleted);
      socket.off('message:reaction', onMessageReaction);
      socket.off('message:receipt', onMessageReceipt);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('presence:online', onUserOnline);
      socket.off('presence:offline', onUserOffline);
    };
  }, [isAuthenticated, activeConversationId, currentUserId, queryClient]);

  // Join / leave active conversation room
  React.useEffect(() => {
    if (!activeConversationId) return;

    socketClient.joinConversation(activeConversationId);

    return () => {
      socketClient.leaveConversation(activeConversationId);
    };
  }, [activeConversationId]);
}
