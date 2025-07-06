import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { rateLimiters, getRateLimitHeaders } from '@/lib/rate-limit';

// Rate limit configuration per endpoint
const RATE_LIMITS = {
  '/api/merge': { limit: 10, window: 60 },
  '/api/contact': { limit: 5, window: 60 },
  '/api/healthcheck': { limit: 100, window: 60 },
  default: { limit: 50, window: 60 }
};

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip middleware for static files and API routes that don't need rate limiting
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/healthcheck') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? 
           request.headers.get('x-real-ip') ?? 
           'anonymous';

  // Get rate limit configuration for the current path
  const rateLimitConfig = RATE_LIMITS[pathname as keyof typeof RATE_LIMITS] || RATE_LIMITS.default;
  
  try {
    // Apply rate limiting based on endpoint
    if (pathname.startsWith('/api/merge')) {
      await rateLimiters.merge.check(ip);
    } else if (pathname.startsWith('/api/contact')) {
      await rateLimiters.contact.check(ip);
    } else if (pathname.startsWith('/api/')) {
      await rateLimiters.api.check(ip);
    }
  } catch (error) {
    // Rate limit exceeded
    const headers = getRateLimitHeaders({
      success: false,
      remaining: 0,
      resetTime: Date.now() + rateLimitConfig.window * 1000,
      limit: rateLimitConfig.limit
    });

    return new NextResponse(
      JSON.stringify({
        error: 'Too many requests',
        message: 'Please try again later',
        retryAfter: rateLimitConfig.window,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': rateLimitConfig.window.toString(),
          ...headers,
        },
      }
    );
  }

  // Continue with the request
  const response = NextResponse.next();
  
  // Add security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Add performance headers
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  
  // Add rate limit headers
  try {
    let rateLimitResult;
    if (pathname.startsWith('/api/merge')) {
      rateLimitResult = await rateLimiters.merge.check(ip);
    } else if (pathname.startsWith('/api/contact')) {
      rateLimitResult = await rateLimiters.contact.check(ip);
    } else if (pathname.startsWith('/api/')) {
      rateLimitResult = await rateLimiters.api.check(ip);
    }
    
    if (rateLimitResult) {
      const rateLimitHeaders = getRateLimitHeaders(rateLimitResult);
      Object.entries(rateLimitHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
    }
  } catch (error) {
    // Rate limit check failed, but continue with request
    console.warn('Rate limit header check failed:', error);
  }

  return response;
}

// Configure which routes to apply middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};