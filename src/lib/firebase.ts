import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer, setLogLevel, memoryLocalCache } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence non-fatal internal SDK watch-stream bloom filter warnings
setLogLevel('error');

// Filter benign BloomFilter errors from console.warn/error in automated environments
if (typeof window !== 'undefined') {
  const isBloomFilterMsg = (args: any[]) =>
    args.some(
      (a) =>
        (typeof a === 'string' && (a.includes('BloomFilter') || a.includes('bloom filter'))) ||
        (a instanceof Error && (a.name === 'BloomFilterError' || a.message.includes('BloomFilter') || a.message.includes('Invalid hash count')))
    );

  const origWarn = console.warn;
  console.warn = (...args: any[]) => {
    if (isBloomFilterMsg(args)) return;
    origWarn.apply(console, args);
  };

  const origError = console.error;
  console.error = (...args: any[]) => {
    if (isBloomFilterMsg(args)) return;
    origError.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    if (event.error?.name === 'BloomFilterError' || event.message?.includes('BloomFilter') || event.message?.includes('Invalid hash count')) {
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason?.name === 'BloomFilterError' ||
      (typeof event.reason?.message === 'string' && (event.reason.message.includes('BloomFilter') || event.reason.message.includes('Invalid hash count')))
    ) {
      event.preventDefault();
    }
  });
}

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with forced long polling and memoryLocalCache to prevent streaming and BloomFilter sync errors
const targetDbId =
  (firebaseConfig as any).firestoreDatabaseId && (firebaseConfig as any).firestoreDatabaseId !== '(default)'
    ? (firebaseConfig as any).firestoreDatabaseId
    : undefined;

export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache(),
  },
  targetDbId
);

// Initialize Firebase Auth
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

// Error handling conforming to Firebase skill specification
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

export function isQuotaExceededError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error);
  return (
    msg.includes('Quota limit exceeded') ||
    msg.includes('quota metric') ||
    msg.includes('resource-exhausted') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    (typeof error === 'object' && error !== null && 'code' in (error as any) && (error as any).code === 'resource-exhausted')
  );
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): void {
  // If Firestore quota is exhausted (50k daily free tier read limit reached) or offline,
  // do not throw an unhandled fatal error so client snapshot listeners and views can safely
  // fall back to their local resilient cached state.
  if (isQuotaExceededError(error)) {
    console.info(`[Firestore Cache Notice] Daily quota reached or offline for ${operationType} on '${path}'. Using cached/offline state.`);
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test helper per skill requirement
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: any) {
    if (error?.code === 'unavailable' || (error instanceof Error && error.message.includes('offline'))) {
      console.info('Firestore initialized; operating with automatic connection reconnection.');
    }
    return false;
  }
}

export { signInWithPopup, signOut };
