import { io, type Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/auth.store';

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ||
  'http://localhost:5000';

class SocketClient {
  private socket: Socket | null = null;
  private currentConversationId: string | null = null;

  /**
   * Connect or retrieve existing Socket.io connection.
   */
  connect(): Socket {
    const accessToken = useAuthStore.getState().accessToken;

    if (this.socket && this.socket.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token: accessToken,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    return this.socket;
  }

  /**
   * Disconnect active socket session.
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Retrieve active socket instance.
   */
  getSocket(): Socket | null {
    return this.socket;
  }

  /**
   * Join a conversation real-time room.
   */
  joinConversation(conversationId: string) {
    if (!this.socket) this.connect();

    if (this.currentConversationId && this.currentConversationId !== conversationId) {
      this.leaveConversation(this.currentConversationId);
    }

    this.currentConversationId = conversationId;
    this.socket?.emit('conversation:join', { conversationId });
  }

  /**
   * Leave a conversation real-time room.
   */
  leaveConversation(conversationId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('conversation:leave', { conversationId });
    }
    if (this.currentConversationId === conversationId) {
      this.currentConversationId = null;
    }
  }

  /**
   * Broadcast start typing indicator.
   */
  startTyping(conversationId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('typing:start', { conversationId });
    }
  }

  /**
   * Broadcast stop typing indicator.
   */
  stopTyping(conversationId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('typing:stop', { conversationId });
    }
  }
}

export const socketClient = new SocketClient();
