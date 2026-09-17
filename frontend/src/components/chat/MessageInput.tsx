'use client';

import * as React from 'react';
import {
  Send,
  Paperclip,
  Smile,
  X,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { Button } from '../ui';
import { socketClient } from '../../services/socket.client';
import type { Message } from '../../types/message.types';

export interface MessageInputProps {
  conversationId: string;
  onSendMessage: (content: string, file?: File, parentMessageId?: string) => Promise<void>;
  replyingTo?: Message | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

const COMMON_EMOJIS = [
  '😀', '😂', '😍', '🎉', '👍', '🔥', '❤️', '🙌',
  '😎', '🤔', '👏', '🚀', '💯', '✨', '👋', '🥳',
];

/**
 * Real-Time Message Input Composer Component.
 * 
 * Manages auto-expanding textarea, file attachments, quoting replies,
 * emoji insertion, and debounced typing indicator emissions.
 */
export function MessageInput({
  conversationId,
  onSendMessage,
  replyingTo,
  onCancelReply,
  disabled,
}: MessageInputProps) {
  const [content, setContent] = React.useState('');
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // Handle typing status debounce
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Emit typing indicator
    socketClient.startTyping(conversationId);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socketClient.stopTyping(conversationId);
    }, 2000);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if ((!trimmed && !selectedFile) || isSending || disabled) return;

    setIsSending(true);
    socketClient.stopTyping(conversationId);

    try {
      await onSendMessage(
        trimmed,
        selectedFile || undefined,
        replyingTo?.id
      );

      setContent('');
      setSelectedFile(null);
      onCancelReply?.();
      setShowEmojiPicker(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertEmoji = (emoji: string) => {
    setContent((prev) => prev + emoji);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-border bg-card/80 backdrop-blur-md p-3 select-none flex flex-col gap-2 shrink-0">
      {/* 1. Reply Context Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/60 border border-border-subtle text-xs animate-fadeIn">
          <div className="border-l-3 border-brand-600 pl-2 min-w-0">
            <span className="font-bold text-brand-600 dark:text-brand-400 block text-[11px]">
              Replying to {replyingTo.sender?.fullName || replyingTo.sender?.username || 'user'}
            </span>
            <p className="text-muted-foreground truncate">
              {replyingTo.content || 'Attachment'}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
            aria-label="Cancel reply"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. File Preview Chip */}
      {selectedFile && (
        <div className="flex items-center justify-between p-2 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs animate-fadeIn">
          <div className="flex items-center gap-2 truncate">
            {selectedFile.type.startsWith('image/') ? (
              <ImageIcon className="w-4 h-4 text-brand-600 shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-brand-600 shrink-0" />
            )}
            <span className="truncate font-medium text-foreground">
              {selectedFile.name} ({(selectedFile.size / 1024).toFixed(0)} KB)
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
            className="p-1 rounded-full hover:bg-brand-500/20 text-muted-foreground hover:text-foreground"
            aria-label="Remove attachment"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Emoji Picker Popover Drawer */}
      {showEmojiPicker && (
        <div className="p-2.5 bg-card border border-border rounded-2xl shadow-lg flex flex-wrap gap-2 animate-fadeIn max-w-sm">
          {COMMON_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertEmoji(emoji)}
              className="text-lg p-1.5 rounded-lg hover:bg-muted transition-transform hover:scale-125"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* 4. Composer Input Row */}
      <div className="flex items-end gap-2">
        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
        />

        {/* Attachment Button */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach File"
          className="text-muted-foreground hover:text-foreground shrink-0 mb-0.5"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        {/* Text Area */}
        <div className="flex-1 relative bg-muted/40 rounded-2xl border border-border-subtle focus-within:border-brand-500/50 transition-colors">
          <textarea
            ref={textareaRef}
            rows={1}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Press Enter to send)"
            disabled={disabled || isSending}
            className="w-full max-h-32 min-h-[42px] px-3.5 py-2.5 pr-10 bg-transparent text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none"
          />

          {/* Emoji Trigger */}
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="absolute right-3 bottom-2.5 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Emoji picker"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>

        {/* Send Button */}
        <Button
          type="button"
          variant="primary"
          size="icon"
          onClick={handleSend}
          disabled={(!content.trim() && !selectedFile) || isSending || disabled}
          isLoading={isSending}
          aria-label="Send Message"
          className="shrink-0 mb-0.5"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
