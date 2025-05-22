import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const RATE_LIMIT = 10; // requests
const RATE_LIMIT_WINDOW = 60; // seconds

const ipRequests = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'anonymous';
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW * 1000;

  // Clean up old entries
  for (const [key, value] of ipRequests.entries()) {
    if (value.resetTime < windowStart) {
      ipRequests.delete(key);
    }
  }

  const requestData = ipRequests.get(ip) ?? { count: 0, resetTime: now };
  
  if (requestData.resetTime < windowStart) {
    requestData.count = 0;
    requestData.resetTime = now;
  }

  requestData.count++;
  ipRequests.set(ip, requestData);

  if (requestData.count > RATE_LIMIT) {
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
        },
      }
    );
  }

  return null;
}