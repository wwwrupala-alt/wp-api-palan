import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

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
  },
  firebaseConfig.firestoreDatabaseId
);

export { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc };
