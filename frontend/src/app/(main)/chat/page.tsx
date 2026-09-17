'use client';

import * as React from 'react';
import { MessageSquare, ShieldCheck, Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import { useChatStore } from '../../../stores/chat.store';

/**
 * Default Active Chat Placeholder Page.
 * 
 * Displayed on desktop views when no specific conversation thread is selected.
 */
export default function ChatIndexPage() {
  const setNewChatModalOpen = useChatStore((s) => s.setNewChatModalOpen);

  return (
    <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center bg-card/20 select-none">
      <div className="max-w-md space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-600 dark:text-brand-400 mx-auto shadow-lg shadow-brand-500/5">
          <MessageSquare className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            TalkChat Messenger
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Select a conversation from the sidebar or start a new encrypted direct message or group conversation.
          </p>
        </div>

        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button
            variant="primary"
            onClick={() => setNewChatModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Start New Chat
          </Button>
        </div>

        <div className="pt-6 border-t border-border-subtle inline-flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Messages are protected by End-to-End Encryption</span>
        </div>
      </div>
    </div>
  );
}
