import { LRUCache } from 'lru-cache';

interface RateLimitOptions {
  interval: number;
  uniqueTokenPerInterval: number;
  maxRequests: number;
}

class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export function rateLimit(options: RateLimitOptions) {
  if (!options.interval || options.interval < 0) {
    throw new Error('Invalid interval value');
  }

  if (!options.uniqueTokenPerInterval || options.uniqueTokenPerInterval < 0) {
    throw new Error('Invalid uniqueTokenPerInterval value');
  }

  // Create LRUCache with updated options for v11.x
  const tokenCache = new LRUCache<string, number>({
    max: options.uniqueTokenPerInterval,
    ttl: options.interval,
    allowStale: false
  });

  return {
    check: async (): Promise<void> => {
      const tokenCount = tokenCache.get('requests') || 0;
      const currentCount = tokenCount + 1;

      if (currentCount > options.maxRequests) {
        throw new RateLimitError('Rate limit exceeded');
      }

      tokenCache.set('requests', currentCount);
    },
    remaining: async (): Promise<number> => {
      const tokenCount = tokenCache.get('requests') || 0;
      return Math.max(0, options.maxRequests - tokenCount);
    },
    getTokenCount: (): number => {
      return tokenCache.get('requests') || 0;
    }
  };
}