import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { DEVELOPER_EMAILS } from '../constants';

interface AuthContextType {
  user: User | null;
  role: 'user' | 'admin' | null;
  isBlocked: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, isBlocked: false, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeDoc: (() => void) | undefined;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = undefined;
      }

      if (firebaseUser) {
        const userEmail = firebaseUser.email?.toLowerCase().trim() || '';
        const isDev = DEVELOPER_EMAILS.includes(userEmail);
        
        unsubscribeDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          (docSnap) => {
            let assignedRole: 'user' | 'admin' = 'user';
            let blockStatus = false;
            
            if (isDev) {
              assignedRole = 'admin';
            }
            
            if (docSnap.exists()) {
              const data = docSnap.data();
              // If not developer, use Firestore role
              if (!isDev) {
                assignedRole = data.role === 'admin' ? 'admin' : 'user';
              }
              blockStatus = data.isBlocked || false;
            }
            
            setRole(assignedRole);
            setIsBlocked(blockStatus);
            setLoading(false);
          },
          (error) => {
            console.error("Role snapshot error:", error);
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setRole(null);
            setIsBlocked(false);
            setLoading(false);
          }
        );
      } else {
        setRole(null);
        setIsBlocked(false);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, isBlocked, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
