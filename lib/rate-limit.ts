import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 10; // requests
const RATE_LIMIT_WINDOW = 60; // seconds

export async function rateLimit(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'anonymous';
  const key = `rate-limit:${ip}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // Use response headers to track rate limit info
  let count = 1;
  let resetTime = now + RATE_LIMIT_WINDOW * 1000;

  // Get rate limit info from request headers
  const lastRequest = request.headers.get('x-last-request');
  const lastCount = request.headers.get('x-request-count');

  if (lastRequest && lastCount) {
    const lastTimestamp = parseInt(lastRequest, 10);
    if (lastTimestamp > windowStart) {
      count = parseInt(lastCount, 10) + 1;
    }
  }

  if (count > RATE_LIMIT) {
    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests',
        message: 'Please try again later',
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': RATE_LIMIT_WINDOW.toString(),
          'X-RateLimit-Limit': RATE_LIMIT.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
        },
      }
    );
  }

  // Return rate limit info in response headers
  const response = null;
  const headers = new Headers();
  headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
  headers.set('X-RateLimit-Remaining', (RATE_LIMIT - count).toString());
  headers.set('X-RateLimit-Reset', resetTime.toString());
  headers.set('X-Last-Request', now.toString());
  headers.set('X-Request-Count', count.toString());

  return response;
}