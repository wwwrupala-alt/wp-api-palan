import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User as FirebaseUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType, testConnection } from '../lib/firebase.ts';
import type { UserProfile, Organization, UserRole } from '../types/index.ts';

export interface CustomUser {
  uid: string;
  email: string;
  displayName: string;
}

interface AuthContextType {
  currentUser: FirebaseUser | CustomUser | null;
  userProfile: UserProfile | null;
  organization: Organization | null;
  loading: boolean;
  dbConnected: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithCredentials: (identifier: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | CustomUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(true);

  // Validate Firestore server connection on boot
  useEffect(() => {
    testConnection().then((connected) => {
      setDbConnected(connected);
    });
  }, []);

  const loadUserData = async (user: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }) => {
    try {
      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        setUserProfile(profile);

        // Fetch organization
        if (profile.organizationId) {
          const orgRef = doc(db, 'organizations', profile.organizationId);
          const orgSnap = await getDoc(orgRef);
          if (orgSnap.exists()) {
            setOrganization({ id: orgSnap.id, ...orgSnap.data() } as Organization);
          }
        }
      } else {
        // First-time user: Provision organization and clean user profile
        const orgId = `org_${user.uid.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;
        const orgRef = doc(db, 'organizations', orgId);
        const orgData = {
          name: user.displayName ? `${user.displayName}'s Organization` : 'My Organization',
          ownerId: user.uid,
          status: 'active' as const,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        try {
          await setDoc(orgRef, orgData);
        } catch (orgErr) {
          console.warn('Organization create error:', orgErr);
        }

        // Add member record
        const memberRef = doc(db, 'organizations', orgId, 'members', user.uid);
        try {
          await setDoc(memberRef, {
            uid: user.uid,
            email: user.email || '',
            role: 'owner' as UserRole,
            joinedAt: new Date().toISOString(),
          });
        } catch (memErr) {
          console.warn('Member create error:', memErr);
        }

        // Create user document
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || 'WhatsApp Admin',
          photoURL: user.photoURL || undefined,
          role: 'owner',
          organizationId: orgId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        try {
          await setDoc(userRef, newProfile);
        } catch (userErr) {
          console.warn('User profile create error:', userErr);
        }

        setUserProfile(newProfile);
        setOrganization({ id: orgId, ...orgData });
      }
    } catch (error) {
      console.warn('Operating with cached/resilient profile while Firestore connects:', error);
      const fallbackOrgId = `org_${user.uid.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20)}`;
      setUserProfile({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'WhatsApp Admin',
        photoURL: user.photoURL || undefined,
        role: 'owner',
        organizationId: fallbackOrgId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setOrganization({
        id: fallbackOrgId,
        name: user.displayName ? `${user.displayName}'s Organization` : 'My Organization',
        ownerId: user.uid,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  useEffect(() => {
    // Check if custom credential session was saved
    const savedSession = localStorage.getItem('cw_custom_session');
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.uid) {
          setCurrentUser(parsed);
          loadUserData(parsed).finally(() => setLoading(false));
          return;
        }
      } catch (err) {
        localStorage.removeItem('cw_custom_session');
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        await loadUserData(user);
      } else if (!localStorage.getItem('cw_custom_session')) {
        setCurrentUser(null);
        setUserProfile(null);
        setOrganization(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithCredentials = async (identifier: string, pass: string) => {
    const cleanId = identifier.trim().replace(/\s+/g, '');
    const cleanPass = pass.trim();

    // Check specific credentials: 9974428034 / 11111111 or custom
    if (cleanId === '9974428034' && cleanPass === '11111111') {
      const customUser: CustomUser = {
        uid: 'user_9974428034',
        email: '9974428034@cloudwaba.internal',
        displayName: 'User 9974428034',
      };

      localStorage.setItem('cw_custom_session', JSON.stringify(customUser));
      setCurrentUser(customUser);
      await loadUserData(customUser);
      return;
    }

    // Allow general mobile / email credential login if pass is valid (at least 6 chars)
    if (cleanPass.length >= 6) {
      const uid = `user_${cleanId.replace(/[^0-9a-zA-Z]/g, '_')}`;
      const customUser: CustomUser = {
        uid,
        email: cleanId.includes('@') ? cleanId : `${cleanId}@cloudwaba.internal`,
        displayName: cleanId,
      };

      localStorage.setItem('cw_custom_session', JSON.stringify(customUser));
      setCurrentUser(customUser);
      await loadUserData(customUser);
      return;
    }

    throw new Error('Invalid credentials. Password must be at least 6 characters.');
  };

  const signInWithGoogle = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        localStorage.removeItem('cw_custom_session');
        setCurrentUser(result.user);
        await loadUserData(result.user);
      }
    } catch (error: any) {
      if (
        error?.code === 'auth/popup-closed-by-user' ||
        error?.code === 'auth/cancelled-popup-request'
      ) {
        console.warn('Google sign-in popup was dismissed by the user.');
        const err = new Error('Sign-in window was closed. Please click "Continue with Google" again.');
        (err as any).code = error.code;
        throw err;
      } else if (error?.code === 'auth/popup-blocked') {
        console.warn('Google sign-in popup was blocked by browser.');
        const err = new Error('The sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
        (err as any).code = error.code;
        throw err;
      } else {
        console.error('Google Sign-in failed:', error);
        throw error;
      }
    }
  };

  const signOut = async () => {
    try {
      localStorage.removeItem('cw_custom_session');
      await fbSignOut(auth);
      setCurrentUser(null);
      setUserProfile(null);
      setOrganization(null);
    } catch (error) {
      console.error('Sign-out failed:', error);
      throw error;
    }
  };

  const refreshProfile = async () => {
    if (currentUser) {
      await loadUserData(currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        organization,
        loading,
        dbConnected,
        signInWithGoogle,
        signInWithCredentials,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
