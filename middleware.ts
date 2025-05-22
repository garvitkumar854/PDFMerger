import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 10; // requests per window
const RATE_LIMIT_WINDOW = 60; // seconds

export async function middleware(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
           request.headers.get('x-real-ip') ?? 
           'anonymous';

  // Get rate limit info from request headers
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;
  
  // Use response headers to track rate limit info
  let count = 1;
  let resetTime = now + RATE_LIMIT_WINDOW * 1000;

  const lastRequest = request.headers.get('x-last-request');
  const lastCount = request.headers.get('x-request-count');

  if (lastRequest && lastCount) {
    const lastTimestamp = parseInt(lastRequest, 10);
    if (lastTimestamp > windowStart) {
      count = parseInt(lastCount, 10) + 1;
    }
  }

  // Create response headers
  const headers = new Headers(request.headers);
  headers.set('X-RateLimit-Limit', RATE_LIMIT.toString());
  headers.set('X-RateLimit-Remaining', (RATE_LIMIT - count).toString());
  headers.set('X-RateLimit-Reset', resetTime.toString());
  headers.set('X-Last-Request', now.toString());
  headers.set('X-Request-Count', count.toString());

  // Check if rate limit is exceeded
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
          ...Object.fromEntries(headers),
        },
      }
    );
  }

  // Continue with the request
  const response = NextResponse.next();
  
  // Add rate limit headers to response
  Object.entries(Object.fromEntries(headers)).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

// Configure which routes to apply rate limiting
export const config = {
  matcher: '/api/:path*',
};