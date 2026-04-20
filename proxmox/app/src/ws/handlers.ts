/**
 * WebSocket Message Handlers
 * Handles real-time communication events
 */

import { getSystemHealth, getMessageRate, getConnectedUserCount } from '../api/monitoring';

export interface WSMessage {
  type: string;
  data?: any;
  text?: string;
  isTyping?: boolean;
  status?: string;
}

export interface WSContext {
  userId: string;
  username: string;
  broadcast: (message: WSMessage) => void;
  connectedUsers?: Map<string, any>;
}

/**
 * Handle message send event
 */
export const handleMessageSend = async (context: WSContext, message: WSMessage) => {
  const { userId, username, broadcast } = context;

  if (!message.text || !message.text.trim()) {
    console.warn('Empty message text');
    return;
  }

  const newMessage = {
    id: `msg_${Date.now()}`,
    userId,
    username,
    text: message.text,
    createdAt: new Date().toISOString()
  };

  broadcast({
    type: 'message:new',
    data: newMessage
  });

  console.log(`[WS] broadcast message:new (handler) | msg=${newMessage.id} | ${username}: "${message.text.substring(0, 50)}${message.text.length > 50 ? '…' : ''}"`);
};

/**
 * Handle presence update event
 */
export const handlePresenceUpdate = async (context: WSContext, message: WSMessage) => {
  const { userId, username, broadcast } = context;

  const presenceData = {
    userId,
    username,
    status: message.status || 'online',
    timestamp: new Date().toISOString()
  };

  // Broadcast to all connected users
  broadcast({
    type: 'presence:update',
    data: presenceData
  });

  console.log(`👤 ${username} status: ${message.status || 'online'}`);
};

/**
 * Handle typing indicator event
 */
export const handleTypingIndicator = async (context: WSContext, message: WSMessage) => {
  const { userId, username, broadcast } = context;

  const typingData = {
    userId,
    username,
    isTyping: message.isTyping || false,
    timestamp: new Date().toISOString()
  };

  // Broadcast to all connected users
  broadcast({
    type: 'typing:indicator',
    data: typingData
  });

  if (message.isTyping) {
    console.log(`⌨️  ${username} is typing...`);
  }
};

/**
 * Handle monitoring stats request
 */
export const handleStatsRequest = async (context: WSContext, message: WSMessage) => {
  const { connectedUsers, broadcast } = context;

  const stats = {
    connectedUsers: connectedUsers ? getConnectedUserCount(connectedUsers) : 0,
    messagesPerMinute: getMessageRate(),
    systemHealth: getSystemHealth(),
    timestamp: new Date().toISOString()
  };

  // Send stats to the requesting client
  broadcast({
    type: 'stats:response',
    data: stats
  });

  console.log(`📊 Stats requested at ${new Date().toISOString()}`);
};

/**
 * Map event handlers
 */
export const wsHandlers: Record<string, (context: WSContext, message: WSMessage) => Promise<void>> = {
  'message:send': handleMessageSend,
  'presence:update': handlePresenceUpdate,
  'typing:indicator': handleTypingIndicator,
  'stats:request': handleStatsRequest
};

/**
 * Route WebSocket message to appropriate handler
 */
export const routeMessage = async (context: WSContext, message: WSMessage) => {
  const handler = wsHandlers[message.type];

  if (!handler) {
    console.warn(`Unknown WebSocket message type: ${message.type}`);
    return;
  }

  try {
    await handler(context, message);
  } catch (error) {
    console.error(`Error handling ${message.type}: ${error}`);
  }
};

export default { wsHandlers, routeMessage };
