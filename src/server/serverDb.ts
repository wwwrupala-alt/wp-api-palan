import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';
import firebaseConfigJson from '../../firebase-applet-config.json';

// Use statically imported config first (guaranteed bundled in serverless/Vercel), fallback to dynamic fs
let firebaseConfig: any = firebaseConfigJson || {};
if (!firebaseConfig.projectId) {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.warn('[ServerDb] Config fallback notice:', err);
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
