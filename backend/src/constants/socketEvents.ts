/**
 * Real-time WebSocket Event Name Constants.
 * 
 * Centralized registry of all event identifiers exchanged between
 * Socket.io clients and the TalkChat distributed server cluster.
 * 
 * @see https://socket.io/docs/v4/emitting-events/
 * @see https://socket.io/docs/v4/rooms/
 */
export const SocketEvents = {
  // Connection & Handshake Lifecycle
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // User Presence & Availability
  USER_ONLINE: 'presence:online',
  USER_OFFLINE: 'presence:offline',
  USER_STATUS_CHANGE: 'presence:status',

  // Conversation Room Subscriptions
  JOIN_ROOM: 'conversation:join',
  LEAVE_ROOM: 'conversation:leave',
  ROOM_JOINED: 'conversation:joined',
  ROOM_LEFT: 'conversation:left',

  // Real-time Typing Indicators
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',

  // Real-time Messaging Relay
  MESSAGE_NEW: 'message:new',
  MESSAGE_EDITED: 'message:edited',
  MESSAGE_DELETED: 'message:deleted',
  MESSAGE_REACTION: 'message:reaction',
  MESSAGE_RECEIPT: 'message:receipt',

  // WebRTC 1-to-1 Audio & Video Call Signaling
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_RINGING: 'call:ringing',
  CALL_ACCEPT: 'call:accept',
  CALL_ACCEPTED: 'call:accepted',
  CALL_REJECT: 'call:reject',
  CALL_REJECTED: 'call:rejected',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_BUSY: 'call:busy',
  CALL_MISSED: 'call:missed',

  // Error Handling
  ERROR: 'error',
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];
