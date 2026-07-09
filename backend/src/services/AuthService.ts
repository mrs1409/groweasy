// ============================================
// GrowEasy — Auth Service
// ============================================
// Handles first-time user creation via Firebase UID.
// Called by authMiddleware on every protected request.

import { userRepository } from '../repositories/UserRepository';
import { logger } from '../utils/logger';
import type { User } from '@prisma/client';

interface FirebaseClaims {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  [key: string]: any;
}

export class AuthService {
  /**
   * Find-or-create a user by Firebase UID.
   *
   * On first sign-in: creates a new User row.
   * On subsequent sign-ins: updates name/email/photoUrl.
   * Uses Prisma upsert — safe against race conditions.
   */
  async upsertUser(claims: FirebaseClaims): Promise<User> {
    try {
      const user = await userRepository.upsert({
        firebaseUid: claims.uid,
        email: claims.email ?? null,   // null for phone-auth users (no email)
        name: claims.name ?? null,
        photoUrl: claims.picture ?? null,
      });

      logger.debug('User upserted', {
        userId: user.id,
        firebaseUid: claims.uid,
        isNew: user.createdAt.getTime() === user.updatedAt.getTime(),
      });

      return user;
    } catch (error: any) {
      logger.error('Failed to upsert user', {
        firebaseUid: claims.uid,
        error: error.message,
      });
      throw error;
    }
  }
}

export const authService = new AuthService();
