import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  role: 'user' | 'admin' | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, role: null, loading: true });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'user' | 'admin' | null>(null);
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
        const isDev = ['ravanangsoham2007@gmail.com', 'ravanangsoham@gmail.com', 'sanika7777@gmail.com', 'mitadmin1@gmail.com'].includes(firebaseUser.email || '');
        
        unsubscribeDoc = onSnapshot(doc(db, 'users', firebaseUser.uid), 
          (docSnap) => {
            let assignedRole: 'user' | 'admin' = 'user';
            if (isDev) {
              assignedRole = 'admin';
            } else if (docSnap.exists()) {
              assignedRole = docSnap.data().role || 'user';
            }
            setRole(assignedRole);
            setLoading(false);
          },
          (error) => {
            console.error("Role snapshot error:", error);
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
            setRole(null);
            setLoading(false);
          }
        );
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
