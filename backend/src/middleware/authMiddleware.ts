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
 * 3. Upsert user in DB (creates on first sign-in, updates profile on subsequent)
 * 4. Attach req.user (Firebase claims) and req.dbUser (Prisma row)
 * 5. Call next() — or respond with 401/500
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let token: string | undefined;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token && typeof req.query.token === 'string') {
      token = req.query.token;
    }

    if (!token) {
      logger.warn('Auth token missing or malformed', {
        ip: req.ip,
        path: req.path,
      });
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Access Denied: Missing or malformed authorization token.',
        },
      });
      return;
    }

    try {
      // Verify Firebase ID token
      const decodedToken = await getAuth().verifyIdToken(token);

      // Attach Firebase claims to request
      req.user = {
        ...decodedToken,
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name,
        picture: decodedToken.picture,
      };

      // Find-or-create DB user (safe upsert, no duplicates)
      const dbUser = await authService.upsertUser(decodedToken);
      req.dbUser = dbUser;

      next();
    } catch (verifyError: any) {
      logger.error('Firebase token verification failed', {
        error: verifyError.message,
        ip: req.ip,
      });
      res.status(401).json({
        success: false,
        error: {
          code: ERROR_CODES.UNAUTHORIZED,
          message: 'Access Denied: Invalid or expired authentication token.',
          details: verifyError.message,
        },
      });
    }
  } catch (error: any) {
    logger.error('Unexpected error in auth middleware', { error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Internal server error during authentication.',
      },
    });
  }
}
