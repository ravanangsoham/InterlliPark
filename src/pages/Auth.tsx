import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendPasswordResetEmail,
  signInWithPopup,
  GoogleAuthProvider
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { ArrowLeft, User, Mail, Lock, Sparkles, Loader2, Chrome } from 'lucide-react';

export default function Auth() {
  const { role } = useParams();
  const navigate = useNavigate();
  const [isSignIn, setIsSignIn] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const devEmails = [
    'ravanangsoham2007@gmail.com', 
    'ravanangsoham@gmail.com', 
    'sanika7777@gmail.com', 
    'mitadmin1@gmail.com'
  ].map(e => e.toLowerCase().trim());

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      const normalizedEmail = user.email?.toLowerCase().trim() || '';
      const isDeveloper = devEmails.some(e => e.toLowerCase().trim() === normalizedEmail);
      
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
      
      const assignedRole = (role === 'admin' || isDeveloper) ? 'admin' : 'user';

      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          email: normalizedEmail,
          role: assignedRole,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } else if (isDeveloper && userDoc.data().role !== 'admin') {
        await updateDoc(userDocRef, { role: 'admin', updatedAt: serverTimestamp() });
      }

      navigate(assignedRole === 'admin' ? '/admin' : '/');
    } catch (err: any) {
      console.error('Google Auth Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Verification popup was closed. Please try again and complete the sign-in.');
      } else if (err.code === 'auth/cancelled-by-user') {
        setError('Sign-in cancelled. Use a Google account to proceed.');
      } else {
        setError(err.message || 'Identity verification sequence failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSwitch = (newRole: string) => {
    setIsSignIn(true);
    navigate(`/auth/${newRole}`);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your email address first.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setError('Recovery link dispatched to your grid node.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const normalizedEmail = email.toLowerCase().trim();
      const isDeveloper = devEmails.some(e => e.toLowerCase().trim() === normalizedEmail);
      console.log('Auth Attempt:', { email: normalizedEmail, role, isDeveloper, isSignIn });

      if (isSignIn) {
        // --- SIGN IN FLOW ---
        let userCredential;
        try {
          userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
        } catch (authErr: any) {
          console.error('Core Auth Error:', authErr);
          if (authErr.code === 'auth/invalid-credential' || authErr.code === 'auth/invalid-login-credentials' || authErr.code === 'auth/user-not-found' || authErr.code === 'auth/wrong-password') {
            throw new Error('Verification Failure: Incorrect credentials or unauthorized grid access. Please check your credentials.');
          }
          throw authErr;
        }

        const userDocRef = doc(db, 'users', userCredential.user.uid);
        
        let userDoc;
        try {
          userDoc = await getDoc(userDocRef);
        } catch (fErr) {
          handleFirestoreError(fErr, OperationType.GET, `users/${userCredential.user.uid}`);
        }
        
        if (userDoc && userDoc.exists()) {
          const userData = userDoc.data();
          let userRole = userData.role;

          // Auto-promote developer to admin if logging into the admin portal
          if (isDeveloper && role === 'admin' && userRole !== 'admin') {
            try {
              await updateDoc(userDocRef, { role: 'admin', updatedAt: serverTimestamp() });
              userRole = 'admin';
            } catch (pErr) {
              console.error('Promotion failed:', pErr);
            }
          }

          // Validation
          if (userRole !== role && !isDeveloper && role === 'admin') {
            throw new Error(`Cloud Access Restricted. Your Identity Hash is registered as a: ${userRole}. Contact an administrator for elevation.`);
          }
          
          navigate(role === 'admin' ? '/admin' : '/');
        } else {
          // Document missing - create it automatically
          const assignedRole = (role === 'admin' || isDeveloper) ? 'admin' : 'user';
          
          try {
            await setDoc(userDocRef, {
              email: normalizedEmail,
              role: assignedRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          } catch (sErr) {
            handleFirestoreError(sErr, OperationType.CREATE, `users/${userCredential.user.uid}`);
          }
          
          navigate(assignedRole === 'admin' ? '/admin' : '/');
        }
      } else {
        // --- SIGN UP FLOW ---
        if (role === 'admin' && !isDeveloper) {
          throw new Error("Administrative protocols require central authorization. Please register as a standard User first via the toggle above.");
        }
        
        const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
        const assignedRole = (role === 'admin' || isDeveloper) ? 'admin' : 'user';
        
        try {
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: normalizedEmail,
            role: assignedRole,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (sErr) {
          handleFirestoreError(sErr, OperationType.CREATE, `users/${userCredential.user.uid}`);
        }
        
        navigate(assignedRole === 'admin' ? '/admin' : '/');
      }
    } catch (err: any) {
      console.error('Auth Hub Error:', err);
      // Try to extract readable error if it's a JSON string from handleFirestoreError
      let displayError = err.message || 'An unexpected authentication error occurred.';
      try {
        if (displayError.startsWith('{')) {
          const parsed = JSON.parse(displayError);
          displayError = parsed.error || displayError;
        }
      } catch (e) {
        // Not JSON, keep original
      }

      if (err.code === 'auth/operation-not-allowed') {
        setError('Login method disabled. Check Firebase console.');
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-login-credentials' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Verification Failure: Incorrect credentials or unauthorized grid access.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered in the grid. Please Sign In instead.');
      } else if (err.code === 'auth/weak-password') {
        setError('Security risk: Password must be at least 6 characters.');
      } else {
        setError(displayError);
      }

      // Special handling for specific codes to provide better UX
      if (err.code === 'auth/network-request-failed') {
        setError('GRID OFFLINE: The link to the parsing servers is interrupted. Please verify your internet connection or check if a firewall is blocking "firebase.googleapis.com".');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('LINK EXISTS: This ID hash already exists. Please tap "Sync Session" below to Sign In instead of registering.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-deep flex flex-col p-6 transition-colors duration-300">
      <header className="flex items-center gap-4 mb-12">
        <button 
          onClick={() => navigate('/landing')}
          className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-brand-primary transition-all border border-slate-200 dark:border-white/5 shadow-sm"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-display font-bold text-black capitalize tracking-tight">{role} Portal</h1>
      </header>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 max-w-sm mx-auto w-full flex flex-col justify-center relative"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-primary/10 rounded-full blur-[100px] -z-10" />
        
        <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-2xl mb-12 w-fit mx-auto border border-slate-200 dark:border-white/5 shadow-sm">
          <button 
            onClick={() => handleRoleSwitch('user')}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${role === 'user' ? 'bg-brand-primary text-white dark:text-background-deep shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            User
          </button>
          <button 
            onClick={() => handleRoleSwitch('admin')}
            className={`px-8 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all ${role === 'admin' ? 'bg-brand-primary text-white dark:text-background-deep shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            Admin
          </button>
        </div>

        <div className="space-y-4 mb-12 text-center">
          <h2 className="text-5xl font-display font-black text-black tracking-tighter transition-all">
            {isSignIn ? (role === 'admin' ? 'Admin Access' : 'Neural Login') : (role === 'admin' ? 'Elevate Role' : 'Grid ID')}
          </h2>
          <p className="text-black text-[11px] font-black uppercase tracking-[0.45em] opacity-80">
            {isSignIn 
              ? `Authorized entry into ${role} sector` 
              : `Sequencing new ${role} hash in the grid`}
          </p>
        </div>

        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full h-18 bg-white text-black hover:bg-brand-primary rounded-[2rem] font-black flex items-center justify-center gap-5 transition-all active:scale-95 mb-10 group shadow-2xl shadow-brand-primary/20"
        >
          <Chrome size={28} className="text-black group-hover:scale-110 transition-transform" />
          <span className="tracking-tight text-lg">Access with Google Grid</span>
        </button>

        <div className="relative mb-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/5"></div>
          </div>
          <div className="relative flex justify-center text-[10px] font-bold uppercase tracking-[0.3em]">
            <span className="bg-background-deep px-4 text-slate-500">Or use Hash Key</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-5">
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Email Address</label>
              </div>
               <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" size={20} />
                <input 
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-[1.5rem] py-5 pl-14 pr-6 outline-none focus:border-brand-primary/30 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-700 shadow-inner"
                  placeholder="name@example.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.3em]">Password</label>
                </div>
                {isSignIn && (
                  <button 
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-[9px] font-bold text-brand-primary hover:text-brand-accent uppercase tracking-widest transition-colors"
                  >
                    Forgot?
                  </button>
                )}
              </div>
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" size={20} />
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={isSignIn ? "current-password" : "new-password"}
                  className="w-full bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-[1.5rem] py-5 pl-14 pr-6 outline-none focus:border-brand-primary/30 transition-all font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-700 shadow-inner"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-500 text-xs font-bold"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
              {error}
            </motion.div>
          )}

          <button 
            type="submit"
            disabled={loading}
            className="w-full h-16 bg-brand-primary hover:bg-brand-accent text-background-deep rounded-2xl font-display font-bold flex items-center justify-center gap-3 shadow-2xl shadow-brand-primary/20 transition-all active:scale-95 disabled:opacity-30 relative overflow-hidden group"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              <>
                <span className="relative z-10">{isSignIn ? (role === 'admin' ? 'Authorize Admin' : 'Access System') : 'Establish ID'}</span>
                <Sparkles size={20} className="group-hover:rotate-12 transition-transform opacity-70" />
              </>
            )}
            {loading && <div className="absolute inset-0 bg-white/20 animate-pulse" />}
          </button>
        </form>

        <p className="mt-12 text-center text-sm text-slate-500 font-medium tracking-wide">
          {isSignIn ? "New Operator?" : "Already Authorized?"}
          <button 
            onClick={() => setIsSignIn(!isSignIn)}
            className="ml-2 text-brand-primary font-bold hover:text-brand-accent transition-colors underline decoration-brand-primary/30 underline-offset-4"
          >
            {isSignIn ? 'Register Now' : 'Sync Session'}
          </button>
        </p>
      </motion.div>

      <footer className="mt-12 text-center opacity-30">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em]">Grid Encryption v4.2.0 Active</p>
      </footer>
    </div>
  );
}
