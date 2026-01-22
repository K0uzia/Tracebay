/**
 * Monitoring API Tests
 */

import { describe, it, expect } from '@jest/globals';
import { getMessageRate, getConnectedUserCount, getSystemHealth } from '../src/api/monitoring';

describe('Monitoring API', () => {
  describe('Message Rate Tracking', () => {
    it('should calculate messages per minute', () => {
      const rate = getMessageRate();
      expect(typeof rate).toBe('number');
      expect(rate).toBeGreaterThanOrEqual(0);
    });

    it('should handle zero messages', () => {
      const rate = getMessageRate();
      expect(isNaN(rate)).toBe(false);
    });
  });

  describe('Connected User Counting', () => {
    it('should count connected users', () => {
      const connectedUsers = new Map([
        ['user1', { id: 'user1', username: 'Alice', connectedAt: new Date() }],
        ['user2', { id: 'user2', username: 'Bob', connectedAt: new Date() }]
      ]);

      const count = getConnectedUserCount(connectedUsers);
      expect(count).toBe(2);
    });

    it('should handle empty connected users', () => {
      const connectedUsers = new Map();
      const count = getConnectedUserCount(connectedUsers);
      expect(count).toBe(0);
    });
  });

  describe('System Health', () => {
    it('should return system health metrics', () => {
      const health = getSystemHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('memory');
      expect(health).toHaveProperty('cpu');

      expect(health.status).toMatch(/healthy|degraded|down/);
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.memory.used).toBeGreaterThan(0);
      expect(health.memory.total).toBeGreaterThan(0);
      expect(health.memory.percentage).toBeGreaterThanOrEqual(0);
      expect(health.memory.percentage).toBeLessThanOrEqual(100);
    });

    it('should calculate memory percentage correctly', () => {
      const health = getSystemHealth();
      const expectedPercentage = Math.round(
        (health.memory.used / health.memory.total) * 100
      );
      expect(health.memory.percentage).toBe(expectedPercentage);
    });
  });
});
