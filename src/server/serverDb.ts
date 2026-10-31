import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeFirestore,
  setLogLevel,
  memoryLocalCache,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

// Silence non-fatal internal SDK watch-stream bloom filter warnings on backend server
setLogLevel('error');

// Filter benign BloomFilter warnings from node process output
const isBloomFilterMsg = (args: any[]) =>
  args.some(
    (a) =>
      (typeof a === 'string' && (a.includes('BloomFilter') || a.includes('bloom filter'))) ||
      (a instanceof Error &&
        (a.name === 'BloomFilterError' ||
          a.message.includes('BloomFilter') ||
          a.message.includes('Invalid hash count')))
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

process.on('unhandledRejection', (reason: any) => {
  if (
    reason?.name === 'BloomFilterError' ||
    (typeof reason?.message === 'string' &&
      (reason.message.includes('BloomFilter') || reason.message.includes('Invalid hash count')))
  ) {
    return;
  }
});

const require = createRequire(import.meta.url);

// Embedded static Firebase configuration (guaranteed to work in serverless/Vercel)
const EMBEDDED_FIREBASE_CONFIG = {
  projectId: 'whatsap-api-saas',
  appId: '1:208644645020:web:4ef4757f87172b439a0d59',
  apiKey: 'AIzaSyDCkXsb4LgjdscXR3Nn6u5qxRJ8BFAG6Qk',
  authDomain: 'whatsap-api-saas.firebaseapp.com',
  firestoreDatabaseId: '(default)',
  storageBucket: 'whatsap-api-saas.firebasestorage.app',
  messagingSenderId: '208644645020',
  measurementId: 'G-PB602S59T4',
};

let firebaseConfig: any = { ...EMBEDDED_FIREBASE_CONFIG };

try {
  const dynamicConfig = require('../../firebase-applet-config.json');
  if (dynamicConfig && dynamicConfig.projectId) {
    firebaseConfig = { ...firebaseConfig, ...dynamicConfig };
  }
} catch {
  // If json cannot be resolved by require, try fs.readFileSync
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = { ...firebaseConfig, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
  } catch {
    // Rely on EMBEDDED_FIREBASE_CONFIG
  }
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const dbId =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? firebaseConfig.firestoreDatabaseId
    : undefined;

export const serverDb = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache(),
  },
  dbId
);

export { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc };
