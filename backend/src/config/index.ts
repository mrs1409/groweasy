// ============================================
// GrowEasy CSV Importer — Environment Configuration
// ============================================

import dotenv from 'dotenv';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_MAX_FILE_SIZE_MB,
  DEFAULT_MAX_RETRIES,
  DEFAULT_RATE_LIMIT_MAX_REQUESTS,
  DEFAULT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_RETRY_BASE_DELAY_MS,
  DEFAULT_RETRY_MAX_DELAY_MS,
} from '../constants';

// Load .env file in development
dotenv.config();

/**
 * Validated application configuration.
 * All environment variables are validated at startup —
 * the app will fail fast if required values are missing.
 */
export interface AppConfig {
  // Server
  port: number;
  nodeEnv: 'development' | 'production' | 'test';

  // CORS
  corsOrigin: string;

  // AI
  aiProvider: 'gemini' | 'openai';
  geminiApiKey: string;
  geminiModel: string;
  openaiApiKey: string;
  openaiModel: string;

  // Batch Processing
  batchSize: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;

  // Rate Limiting
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;

  // Upload
  maxFileSizeMB: number;
  maxFileSizeBytes: number;
}

/**
 * Parse an integer from an environment variable with a default fallback.
 */
function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid integer. Got: "${value}"`);
  }
  return parsed;
}


/**
 * Build and validate the application configuration.
 * Called once at startup.
 */
function buildConfig(): AppConfig {
  const nodeEnv = (process.env['NODE_ENV'] || 'development') as AppConfig['nodeEnv'];
  const maxFileSizeMB = parseIntEnv('MAX_FILE_SIZE_MB', DEFAULT_MAX_FILE_SIZE_MB);

  const cfg: AppConfig = {
    // Server
    port: parseIntEnv('PORT', 3001),
    nodeEnv,

    // CORS
    corsOrigin: process.env['CORS_ORIGIN'] || 'http://localhost:3000',

    // AI
    aiProvider: (process.env.AI_PROVIDER || 'gemini').toLowerCase() === 'openai' ? 'openai' : 'gemini',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-5-nano',

    // Batch Processing
    batchSize: parseIntEnv('BATCH_SIZE', DEFAULT_BATCH_SIZE),
    maxRetries: parseIntEnv('MAX_RETRIES', DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: parseIntEnv('RETRY_BASE_DELAY_MS', DEFAULT_RETRY_BASE_DELAY_MS),
    retryMaxDelayMs: parseIntEnv('RETRY_MAX_DELAY_MS', DEFAULT_RETRY_MAX_DELAY_MS),

    // Rate Limiting
    rateLimitWindowMs: parseIntEnv('RATE_LIMIT_WINDOW_MS', DEFAULT_RATE_LIMIT_WINDOW_MS),
    rateLimitMaxRequests: parseIntEnv('RATE_LIMIT_MAX_REQUESTS', DEFAULT_RATE_LIMIT_MAX_REQUESTS),

    // Upload
    maxFileSizeMB,
    maxFileSizeBytes: maxFileSizeMB * 1024 * 1024,
  };

  // Validate only the active provider's API key
  if (cfg.aiProvider === 'gemini' && !cfg.geminiApiKey) {
    throw new Error('Missing required environment variable: GEMINI_API_KEY. Set it or use OpenAI by setting AI_PROVIDER=openai and providing OPENAI_API_KEY.');
  }
  if (cfg.aiProvider === 'openai' && !cfg.openaiApiKey) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY when AI_PROVIDER=openai is configured.');
  }

  return cfg;
}

/**
 * Singleton config instance — validated once at import time.
 */
export const config = buildConfig();
