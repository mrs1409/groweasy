// ============================================
// GrowEasy CSV Importer — Rate Limiter Middleware
// ============================================

import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { APIErrorResponse } from '../types';
import { ERROR_CODES } from '../constants';

/**
 * Rate limiting middleware to protect against abuse.
 *
 * This is critical for production readiness because:
 * 1. Each import request triggers expensive LLM API calls
 * 2. Without limits, a single user could exhaust API credits
 * 3. Prevents accidental DDoS from automated tools
 *
 * Default: 10 requests per minute per IP.
 * Configurable via RATE_LIMIT_WINDOW_MS and RATE_LIMIT_MAX_REQUESTS.
 */
export const rateLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMaxRequests,
  standardHeaders: true,    // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,     // Disable `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: `Too many requests. Please try again in ${Math.ceil(config.rateLimitWindowMs / 1000)} seconds.`,
    },
  } as APIErrorResponse,
  keyGenerator: (req) => {
    // Use X-Forwarded-For in production (behind reverse proxy)
    return (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
  },
});
