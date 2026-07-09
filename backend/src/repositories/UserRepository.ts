// ============================================
// GrowEasy — User Repository
// ============================================

import { prisma } from '../config/prisma';
import type { User } from '@prisma/client';

interface UpsertUserData {
  firebaseUid: string;
  email: string | null;
  name?: string | null;
  photoUrl?: string | null;
}

export class UserRepository {
  /**
   * Find a user by their Firebase UID.
   */
  async findByFirebaseUid(firebaseUid: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { firebaseUid } });
  }

  /**
   * Find a user by their DB primary key.
   */
  async findById(id: number): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  /**
   * Upsert: find-or-create by Firebase UID.
   * Uses a Prisma transaction to prevent race conditions.
   * Updates name/email/photoUrl on every sign-in.
   */
  async upsert(data: UpsertUserData): Promise<User> {
    return prisma.user.upsert({
      where: { firebaseUid: data.firebaseUid },
      create: {
        firebaseUid: data.firebaseUid,
        email: data.email,
        name: data.name ?? null,
        photoUrl: data.photoUrl ?? null,
      },
      update: {
        // Update profile info on every sign-in
        email: data.email,
        name: data.name ?? null,
        photoUrl: data.photoUrl ?? null,
      },
    });
  }
}

export const userRepository = new UserRepository();
