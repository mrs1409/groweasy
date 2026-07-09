import { Request, Response, NextFunction } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { authService } from '../services/AuthService';
import { logger } from '../utils/logger';
import { ERROR_CODES } from '../constants';

/**
 * Express middleware to protect APIs using Firebase ID Tokens.
 *
 * Flow:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify token via Firebase Admin SDK
 * 3. Upsert user in DB (creates on first sign-in)
 * 4. Attach req.user (Firebase claims) and req.dbUser (Prisma row)
 * 5. Call next() — or respond with 401/500
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token;
  }

  if (!token) {
    logger.warn('Auth token missing', { ip: req.ip, path: req.path });
    res.status(401).json({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Access Denied: Missing or malformed authorization token.',
      },
    });
    return;
  }

  // ─── Step 1: Verify Firebase Token ───────────
  let decodedToken: any;
  try {
    decodedToken = await getAuth().verifyIdToken(token);
  } catch (verifyError: any) {
    logger.warn('Firebase token verification failed', {
      error: verifyError.message,
      code: verifyError.code,
      ip: req.ip,
    });
    res.status(401).json({
      success: false,
      error: {
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Access Denied: Invalid or expired authentication token.',
      },
    });
    return;
  }

  // ─── Step 2: Attach Firebase claims ──────────
  req.user = {
    ...decodedToken,
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name,
    picture: decodedToken.picture,
  };

  // ─── Step 3: Upsert DB User ───────────────────
  try {
    const dbUser = await authService.upsertUser(decodedToken);
    req.dbUser = dbUser;
    next();
  } catch (dbError: any) {
    // DB failure during user upsert → 500 (separate from auth failure → 401)
    logger.error('Failed to upsert user in DB during auth', {
      firebaseUid: decodedToken.uid,
      email: decodedToken.email,
      error: dbError.message,
      code: dbError.code,
    });
    res.status(500).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Authentication succeeded but user profile sync failed.',
        // expose in all envs so we can see the error
        details: dbError.message,
      },
    });
  }
}
