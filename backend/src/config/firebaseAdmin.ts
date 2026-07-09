import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import * as fs from 'fs';
import { logger } from '../utils/logger';

function initFirebaseAdmin(): App | undefined { // eslint-disable-line consistent-return
  // Prevent double-initialization (e.g. nodemon restarts)
  if (getApps().length > 0) {
    return getApps()[0];
  }

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      logger.info('Initializing Firebase Admin using Service Account JSON file', { path: serviceAccountPath });
      const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      return initializeApp({ credential: cert(serviceAccount) });
    }

    if (projectId && clientEmail && privateKey) {
      logger.info('Initializing Firebase Admin using individual environment variables');
      const formattedPrivateKey = privateKey
        .replace(/\\n/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedPrivateKey,
        }),
      });
    }

    // Fallback: uses GOOGLE_APPLICATION_CREDENTIALS env var if set
    logger.warn('Firebase credentials not explicitly found. Initializing with default credentials.');
    return initializeApp();
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    logger.error('Failed to initialize Firebase Admin SDK', { error: errMsg, stack: errStack });
    return undefined;
  }
}

initFirebaseAdmin();
