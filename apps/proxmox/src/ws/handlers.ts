/**
 * WebSocket Message Handlers
 * Handles real-time communication events
 */

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

  // Broadcast to all connected users
  broadcast({
    type: 'message:new',
    data: newMessage
  });

  console.log(`💬 Message from ${username}: "${message.text.substring(0, 50)}..."`);
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
 * Map event handlers
 */
export const wsHandlers: Record<string, (context: WSContext, message: WSMessage) => Promise<void>> = {
  'message:send': handleMessageSend,
  'presence:update': handlePresenceUpdate,
  'typing:indicator': handleTypingIndicator
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
