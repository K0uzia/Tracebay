/**
 * Metrics Collection Utility
 * Phase 5: Performance monitoring and metrics
 */

interface MetricData {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
}

interface RequestMetrics {
  totalRequests: number;
  requestsByStatus: Record<number, number>;
  requestsByPath: Record<string, number>;
  responseTimes: number[];
  errors: number;
}

export class MetricsCollector {
  private metrics: RequestMetrics;
  private startTime: number;

  constructor() {
    this.metrics = {
      totalRequests: 0,
      requestsByStatus: {},
      requestsByPath: {},
      responseTimes: [],
      errors: 0,
    };
    this.startTime = Date.now();
  }

  /**
   * Record a request
   */
  recordRequest(path: string, statusCode: number, responseTime: number): void {
    this.metrics.totalRequests++;

    // Status code count
    this.metrics.requestsByStatus[statusCode] = 
      (this.metrics.requestsByStatus[statusCode] || 0) + 1;

    // Path count
    this.metrics.requestsByPath[path] = 
      (this.metrics.requestsByPath[path] || 0) + 1;

    // Response time
    this.metrics.responseTimes.push(responseTime);

    // Keep only last 1000 response times to avoid memory issues
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes.shift();
    }

    // Count errors (4xx, 5xx)
    if (statusCode >= 400) {
      this.metrics.errors++;
    }
  }

  /**
   * Get response time percentiles
   */
  getResponseTimePercentiles(): { p50: number; p95: number; p99: number } {
    const sorted = [...this.metrics.responseTimes].sort((a, b) => a - b);
    const len = sorted.length;

    if (len === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    };
  }

  /**
   * Get average response time
   */
  getAverageResponseTime(): number {
    if (this.metrics.responseTimes.length === 0) return 0;
    const sum = this.metrics.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.metrics.responseTimes.length;
  }

  /**
   * Get uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get requests per second
   */
  getRequestsPerSecond(): number {
    const uptime = this.getUptime();
    return uptime > 0 ? this.metrics.totalRequests / uptime : 0;
  }

  /**
   * Get error rate
   */
  getErrorRate(): number {
    return this.metrics.totalRequests > 0
      ? (this.metrics.errors / this.metrics.totalRequests) * 100
      : 0;
  }

  /**
   * Get all metrics
   */
  getMetrics(): any {
    const percentiles = this.getResponseTimePercentiles();

    return {
      uptime: this.getUptime(),
      totalRequests: this.metrics.totalRequests,
      requestsPerSecond: this.getRequestsPerSecond().toFixed(2),
      errors: this.metrics.errors,
      errorRate: this.getErrorRate().toFixed(2) + '%',
      responseTime: {
        avg: this.getAverageResponseTime().toFixed(2),
        p50: percentiles.p50,
        p95: percentiles.p95,
        p99: percentiles.p99,
      },
      requestsByStatus: this.metrics.requestsByStatus,
      topPaths: this.getTopPaths(10),
    };
  }

  /**
   * Get top N requested paths
   */
  private getTopPaths(limit: number): Array<{ path: string; count: number }> {
    return Object.entries(this.metrics.requestsByPath)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([path, count]) => ({ path, count }));
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      totalRequests: 0,
      requestsByStatus: {},
      requestsByPath: {},
      responseTimes: [],
      errors: 0,
    };
    this.startTime = Date.now();
  }
}

// Global metrics instance
export const globalMetrics = new MetricsCollector();
