import { Server as HttpServer } from 'http';
import { Server, ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis } from '../config/redis.config.js';
import { env } from '../config/env.config.js';
import { logger } from '../utils/logger.js';
import { socketAuthMiddleware } from './socket.auth.js';
import { presenceTracker } from './socket.presence.js';
import { registerChatHandlers } from './handlers/chat.handler.js';
import { registerCallHandlers } from './handlers/call.handler.js';
import { SocketEvents } from '../constants/socketEvents.js';

let ioInstance: Server | null = null;

/**
 * Initialize distributed Socket.io WebSocket Server.
 * 
 * Configures:
 * 1. Distributed Redis Pub/Sub adapter to allow horizontal multi-node scaling.
 * 2. Cross-Origin Resource Sharing (CORS) based on environment configuration.
 * 3. JWT handshake authentication guard.
 * 4. User presence tracking and personal notification rooms (`user:${userId}`).
 * 
 * @param httpServer - Native Node.js HTTP server instance
 * @returns Configured Socket.io Server instance
 * 
 * @see https://socket.io/docs/v4/redis-adapter/
 * @see https://socket.io/docs/v4/server-initialization/
 */
export const initSocketServer = (httpServer: HttpServer): Server => {
  const serverOptions: Partial<ServerOptions> = {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
  };

  const io = new Server(httpServer, serverOptions);

  // Configure Redis Pub/Sub Adapter for horizontal scaling across instances
  try {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();

    pubClient.on('error', (err) => logger.error({ err }, 'Redis adapter pubClient error'));
    subClient.on('error', (err) => logger.error({ err }, 'Redis adapter subClient error'));

    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.io Redis adapter initialized successfully');
  } catch (adapterError) {
    logger.error({ adapterError }, 'Failed to initialize Socket.io Redis adapter. Operating in single-node mode.');
  }

  // Enforce JWT handshake authentication
  io.use(socketAuthMiddleware);

  // Connection Lifecycle Handling
  io.on(SocketEvents.CONNECTION, (socket) => {
    const userId = socket.data.userId as string;
    logger.info({ socketId: socket.id, userId }, 'WebSocket client connected');

    // Register modular domain event listeners immediately to prevent packet drop
    registerChatHandlers(io, socket);
    registerCallHandlers(io, socket);

    // Automatically bind socket to user's private notification channel
    socket.join(`user:${userId}`);

    // Update and broadcast online presence asynchronously
    presenceTracker.handleUserConnect(io, userId, socket.id).catch((err) => {
      logger.error({ err, userId }, 'Error executing handleUserConnect');
    });

    // Handle client presence heartbeats
    socket.on('presence:heartbeat', () => {
      presenceTracker.handleHeartbeat(userId, socket.id);
    });

    // Handle client presence status updates
    socket.on('presence:status', async (data: { status?: 'ONLINE' | 'AWAY' }) => {
      if (data?.status === 'ONLINE') {
        await presenceTracker.handleHeartbeat(userId, socket.id);
        io.emit(SocketEvents.USER_ONLINE, { userId, isOnline: true });
      }
    });

    // Handle client disconnection
    socket.on(SocketEvents.DISCONNECT, async (reason) => {
      logger.info({ socketId: socket.id, userId, reason }, 'WebSocket client disconnected');
      await presenceTracker.handleUserDisconnect(io, userId, socket.id);
    });
  });

  ioInstance = io;

  // Reconcile presence state on server boot
  presenceTracker.syncStartupPresence(io).catch((err) => {
    logger.error({ err }, 'Error syncing startup presence');
  });

  return io;
};

/**
 * Access the global Socket.io Server singleton instance.
 * 
 * Enables domain services (e.g. MessageService) to emit real-time events
 * to conversation rooms or user notification channels.
 * 
 * @returns Server instance
 * @throws Error if accessed before initialization
 */
export const getIO = (): Server => {
  if (!ioInstance) {
    throw new Error('Socket.io has not been initialized. Call initSocketServer() first.');
  }
  return ioInstance;
};
