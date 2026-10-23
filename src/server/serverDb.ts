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
  projectId: 'utility-sky-7f6jr',
  appId: '1:1086191221773:web:a078831e5e4352de1da944',
  apiKey: 'AIzaSyB0w7QFly4zIu90w9OqLKUia8Sai53h1lA',
  authDomain: 'utility-sky-7f6jr.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-eb8ad6af-49f2-4fff-9c59-69f62d1e9a05',
  storageBucket: 'utility-sky-7f6jr.firebasestorage.app',
  messagingSenderId: '1086191221773',
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

export const serverDb = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
    localCache: memoryLocalCache(),
  },
  firebaseConfig.firestoreDatabaseId
);

export { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc };
