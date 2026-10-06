import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const firebaseStorage = getStorage(app);
firebaseStorage.maxUploadRetryTime = 5000;
firebaseStorage.maxOperationRetryTime = 5000;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
}

export function formatUserFriendlyError(
  error: unknown,
  fallbackMessage = 'Something went wrong. Please try again.'
): string {
  if (!error) return fallbackMessage;
  const raw = error instanceof Error ? error.message : String(error);
  if (!raw) return fallbackMessage;

  // Never expose raw JSON error blobs in the UI
  if (raw.trim().startsWith('{') && raw.includes('"operationType"')) {
    try {
      const parsed = JSON.parse(raw) as { error?: string };
      const inner = parsed.error || '';
      if (inner.toLowerCase().includes('permission')) {
        return 'You do not have permission to perform this action.';
      }
      if (inner.toLowerCase().includes('offline') || inner.toLowerCase().includes('network')) {
        return 'Network connection issue. Please check your internet connection and try again.';
      }
      return fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  }

  const lower = raw.toLowerCase();
  if (lower.includes('missing or insufficient permissions')) {
    return 'You do not have permission to perform this action.';
  }
  if (lower.includes('client is offline') || lower.includes('network-request-failed')) {
    return 'Network connection issue. Please check your internet connection and try again.';
  }
  if (lower.includes('quota-exceeded')) {
    return 'Service temporarily busy. Please try again shortly.';
  }

  return raw;
}

/**
 * Logs Firestore error details safely without throwing an uncaught exception in background listeners.
 */
export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.warn('Firestore Notice:', JSON.stringify(errInfo));
  return errInfo;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.warn('Firestore Operation Error:', JSON.stringify(errInfo));
  const friendlyMessage = formatUserFriendlyError(
    error,
    'Unable to save changes right now. Please try again.'
  );
  const friendlyErr = new Error(friendlyMessage) as Error & { details?: FirestoreErrorInfo };
  friendlyErr.details = errInfo;
  throw friendlyErr;
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Operating with local cache until network connection is restored.');
    }
  }
}

void testConnection();
