/**
 * WebSocket Handler Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  handleMessageSend,
  handlePresenceUpdate,
  handleTypingIndicator,
  handleStatsRequest,
  WSContext,
  WSMessage
} from '../src/ws/handlers';

describe('WebSocket Handlers', () => {
  let mockContext: WSContext;
  let broadcastCalls: any[];

  beforeEach(() => {
    broadcastCalls = [];
    mockContext = {
      userId: 'test_user_1',
      username: 'TestUser',
      broadcast: (message: WSMessage) => {
        broadcastCalls.push(message);
      },
      connectedUsers: new Map([
        ['user1', { id: 'user1', username: 'Alice' }],
        ['user2', { id: 'user2', username: 'Bob' }]
      ])
    };
  });

  describe('Message Send Handler', () => {
    it('should broadcast message to all users', async () => {
      const message: WSMessage = {
        type: 'message:send',
        text: 'Hello everyone!'
      };

      await handleMessageSend(mockContext, message);

      expect(broadcastCalls.length).toBe(1);
      expect(broadcastCalls[0].type).toBe('message:new');
      expect(broadcastCalls[0].data.text).toBe('Hello everyone!');
      expect(broadcastCalls[0].data.username).toBe('TestUser');
    });

    it('should ignore empty messages', async () => {
      const message: WSMessage = {
        type: 'message:send',
        text: ''
      };

      await handleMessageSend(mockContext, message);

      expect(broadcastCalls.length).toBe(0);
    });

    it('should ignore whitespace-only messages', async () => {
      const message: WSMessage = {
        type: 'message:send',
        text: '   '
      };

      await handleMessageSend(mockContext, message);

      expect(broadcastCalls.length).toBe(0);
    });
  });

  describe('Presence Update Handler', () => {
    it('should broadcast presence update', async () => {
      const message: WSMessage = {
        type: 'presence:update',
        status: 'away'
      };

      await handlePresenceUpdate(mockContext, message);

      expect(broadcastCalls.length).toBe(1);
      expect(broadcastCalls[0].type).toBe('presence:update');
      expect(broadcastCalls[0].data.status).toBe('away');
    });

    it('should default to online status', async () => {
      const message: WSMessage = {
        type: 'presence:update'
      };

      await handlePresenceUpdate(mockContext, message);

      expect(broadcastCalls[0].data.status).toBe('online');
    });

    it('should include timestamp', async () => {
      const message: WSMessage = {
        type: 'presence:update',
        status: 'online'
      };

      await handlePresenceUpdate(mockContext, message);

      expect(broadcastCalls[0].data).toHaveProperty('timestamp');
      expect(new Date(broadcastCalls[0].data.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Typing Indicator Handler', () => {
    it('should broadcast typing indicator', async () => {
      const message: WSMessage = {
        type: 'typing:indicator',
        isTyping: true
      };

      await handleTypingIndicator(mockContext, message);

      expect(broadcastCalls.length).toBe(1);
      expect(broadcastCalls[0].type).toBe('typing:indicator');
      expect(broadcastCalls[0].data.isTyping).toBe(true);
    });

    it('should default to false for isTyping', async () => {
      const message: WSMessage = {
        type: 'typing:indicator'
      };

      await handleTypingIndicator(mockContext, message);

      expect(broadcastCalls[0].data.isTyping).toBe(false);
    });
  });

  describe('Stats Request Handler', () => {
    it('should return system stats', async () => {
      const message: WSMessage = {
        type: 'stats:request'
      };

      await handleStatsRequest(mockContext, message);

      expect(broadcastCalls.length).toBe(1);
      expect(broadcastCalls[0].type).toBe('stats:response');
      expect(broadcastCalls[0].data).toHaveProperty('connectedUsers');
      expect(broadcastCalls[0].data).toHaveProperty('messagesPerMinute');
      expect(broadcastCalls[0].data).toHaveProperty('systemHealth');
      expect(broadcastCalls[0].data).toHaveProperty('timestamp');
    });

    it('should count connected users correctly', async () => {
      const message: WSMessage = {
        type: 'stats:request'
      };

      await handleStatsRequest(mockContext, message);

      expect(broadcastCalls[0].data.connectedUsers).toBe(2);
    });
  });
});
