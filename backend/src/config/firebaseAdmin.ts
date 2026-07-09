import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import * as fs from "fs";
import { logger } from "../utils/logger";

function initFirebaseAdmin(): App | undefined {
  // Prevent multiple initializations
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const rawKey = process.env.FIREBASE_PRIVATE_KEY;

  if (rawKey) {
    console.log(
      `[FIREBASE_KEY_CHECK] length=${rawKey.length} startsWith="${rawKey
        .substring(0, 30)
        .replace(/\n/g, "\\n")}" endsWith="${rawKey
          .substring(rawKey.length - 30)
          .replace(/\n/g, "\\n")}" hasSlashN=${rawKey.includes(
            "\\n"
          )} hasLF=${rawKey.includes("\n")} hasCR=${rawKey.includes("\r")}`
    );
  } else {
    console.log("[FIREBASE_KEY_CHECK] FIREBASE_PRIVATE_KEY is missing");
  }

  try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    // -------------------------------
    // Option 1: JSON Service Account
    // -------------------------------
    if (serviceAccountPath && fs.existsSync(serviceAccountPath)) {
      logger.info(
        `Initializing Firebase Admin using service account file: ${serviceAccountPath}`
      );

      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8")
      );

      return initializeApp({
        credential: cert(serviceAccount),
      });
    }

    // -----------------------------------------
    // Option 2: Individual Environment Variables
    // -----------------------------------------
    if (projectId && clientEmail && privateKey) {
      logger.info(
        "Initializing Firebase Admin using individual environment variables"
      );

      // Convert escaped newlines to actual newlines if necessary
      if (privateKey.includes("\\n")) {
        privateKey = privateKey.replace(/\\n/g, "\n");
      }

      // Remove carriage returns
      privateKey = privateKey.replace(/\r/g, "");

      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }

    // -------------------------------
    // Option 3: Default Credentials
    // -------------------------------
    logger.warn(
      "No Firebase credentials found. Using default application credentials."
    );

    return initializeApp();
  } catch (error) {
    console.error("====================================");
    console.error(" FIREBASE ADMIN INITIALIZATION ERROR");
    console.error("====================================");
    console.error(error);

    logger.error("Failed to initialize Firebase Admin SDK", {
      error:
        error instanceof Error
          ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
          : String(error),

      env: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
        privateKeyLength: process.env.FIREBASE_PRIVATE_KEY?.length ?? 0,
        hasEscapedN:
          process.env.FIREBASE_PRIVATE_KEY?.includes("\\n") ?? false,
        hasLF:
          process.env.FIREBASE_PRIVATE_KEY?.includes("\n") ?? false,
        hasCR:
          process.env.FIREBASE_PRIVATE_KEY?.includes("\r") ?? false,
      },
    });

    return undefined;
  }
}

export const firebaseApp = initFirebaseAdmin();