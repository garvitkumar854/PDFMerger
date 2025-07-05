import { LRUCache } from 'lru-cache';

interface RateLimitOptions {
  interval: number;
  uniqueTokenPerInterval: number;
  maxRequests: number;
  useRedis?: boolean;
  redisUrl?: string;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetTime: number;
  limit: number;
}

class RateLimitError extends Error {
  constructor(message: string, public remaining: number, public resetTime: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// In-memory rate limiter using LRU Cache
class MemoryRateLimit {
  private tokenCache: LRUCache<string, number>;

  constructor(options: RateLimitOptions) {
    this.tokenCache = new LRUCache<string, number>({
      max: options.uniqueTokenPerInterval,
      ttl: options.interval,
      allowStale: false,
      updateAgeOnGet: false,
    });
  }

  async check(identifier: string, maxRequests: number, interval: number): Promise<RateLimitResult> {
    const key = `rate_limit:${identifier}`;
    const currentCount = this.tokenCache.get(key) || 0;
    const newCount = currentCount + 1;

    if (newCount > maxRequests) {
      const resetTime = Date.now() + this.tokenCache.ttl;
      throw new RateLimitError('Rate limit exceeded', 0, resetTime);
    }

    this.tokenCache.set(key, newCount);
    const remaining = Math.max(0, maxRequests - newCount);
    const resetTime = Date.now() + this.tokenCache.ttl;

    return {
      success: true,
      remaining,
      resetTime,
      limit: maxRequests,
    };
  }

  async getRemaining(identifier: string, maxRequests: number): Promise<number> {
    const key = `rate_limit:${identifier}`;
    const currentCount = this.tokenCache.get(key) || 0;
    return Math.max(0, maxRequests - currentCount);
  }
}

// Redis-based rate limiter (placeholder for production)
class RedisRateLimit {
  private redis: any; // Would be Redis client in production

  constructor(redisUrl: string) {
    // In production, you would initialize Redis client here
    // this.redis = new Redis(redisUrl);
    console.log('Redis rate limiter initialized with URL:', redisUrl);
  }

  async check(identifier: string, maxRequests: number, interval: number): Promise<RateLimitResult> {
    // Placeholder implementation
    // In production, you would use Redis commands like:
    // const key = `rate_limit:${identifier}`;
    // const current = await this.redis.incr(key);
    // if (current === 1) await this.redis.expire(key, interval);
    
    return {
      success: true,
      remaining: maxRequests - 1,
      resetTime: Date.now() + interval,
      limit: maxRequests,
    };
  }

  async getRemaining(identifier: string, maxRequests: number): Promise<number> {
    // Placeholder implementation
    return maxRequests;
  }
}

export function rateLimit(options: RateLimitOptions) {
  if (!options.interval || options.interval < 0) {
    throw new Error('Invalid interval value');
  }

  if (!options.uniqueTokenPerInterval || options.uniqueTokenPerInterval < 0) {
    throw new Error('Invalid uniqueTokenPerInterval value');
  }

  // Choose rate limiter implementation
  const limiter = options.useRedis && options.redisUrl
    ? new RedisRateLimit(options.redisUrl)
    : new MemoryRateLimit(options);

  return {
    check: async (identifier: string = 'default'): Promise<RateLimitResult> => {
      try {
        return await limiter.check(identifier, options.maxRequests, options.interval);
      } catch (error) {
        if (error instanceof RateLimitError) {
          throw error;
        }
        throw new RateLimitError('Rate limit check failed', 0, Date.now() + options.interval);
      }
    },
    remaining: async (identifier: string = 'default'): Promise<number> => {
      return await limiter.getRemaining(identifier, options.maxRequests);
    },
    getTokenCount: (identifier: string = 'default'): number => {
      // This is only available for memory-based rate limiting
      if (limiter instanceof MemoryRateLimit) {
        const key = `rate_limit:${identifier}`;
        return (limiter as any).tokenCache.get(key) || 0;
      }
      return 0;
    },
    getLimitInfo: (): { maxRequests: number; interval: number } => {
      return {
        maxRequests: options.maxRequests,
        interval: options.interval,
      };
    },
  };
}

// Pre-configured rate limiters for different endpoints
export const rateLimiters = {
  // General API rate limiting
  api: rateLimit({
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 1000,
    maxRequests: 100,
  }),

  // PDF merge endpoint (more restrictive)
  merge: rateLimit({
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500,
    maxRequests: 10,
  }),

  // Contact form (very restrictive)
  contact: rateLimit({
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 100,
    maxRequests: 5,
  }),

  // File upload (moderate)
  upload: rateLimit({
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 200,
    maxRequests: 20,
  }),
};

// Utility function to get rate limit headers
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetTime.toString(),
    'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString(),
  };
}