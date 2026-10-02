import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, doc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Load firebase-applet-config.json
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error('[ServerDb] Error reading firebase-applet-config.json:', err);
  }
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const serverDb = initializeFirestore(
  app,
  {},
  firebaseConfig.firestoreDatabaseId
);

export { doc, setDoc, getDocs, collection, query, where, updateDoc };
