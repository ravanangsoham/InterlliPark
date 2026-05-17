import React, { useState } from 'react';
import { Bell, Moon, Shield, ChevronRight, HelpCircle, Info, Lock, Car, Map, User, LogOut, Smartphone, Hexagon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Vehicle } from '../types';

export default function Settings({ savedVehicles = [] }: { savedVehicles?: Vehicle[] }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  // Simulation states for toggles
  const [notifications, setNotifications] = useState(true);
  const [biometric, setBiometric] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const darkMode = theme === 'dark';

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/landing');
  };

  const getInitials = (name?: string | null) => {
    if (!name) return 'JD';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-10"
    >
      <header className="px-2 pt-2">
        <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white tracking-tight transition-colors">Settings</h1>
      </header>

      {/* Profile Section */}
      <div className="flex items-center gap-5 px-2 mb-10">
         <div className="w-20 h-20 rounded-[2rem] bg-brand-primary flex items-center justify-center text-white dark:text-background-deep text-3xl font-display font-bold shadow-2xl shadow-brand-primary/20">
            {getInitials(user?.displayName || user?.email)}
         </div>
         <div className="space-y-1">
            <h3 className="text-2xl font-display font-bold text-slate-900 dark:text-white leading-tight transition-colors">
               {user?.displayName || (user?.email?.split('@')[0]) || 'User Account'}
            </h3>
            <p className="text-sm text-slate-500 font-medium">{user?.email || 'user@example.com'}</p>
         </div>
      </div>

      <div className="space-y-6">
        {/* Preference Toggles */}
        <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[2.5rem] p-2 border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-2xl">
          <SettingsToggle 
            icon={<Bell size={20} />} 
            label="Push Notifications" 
            sub="Receive parking alerts" 
            active={notifications} 
            onChange={() => setNotifications(!notifications)} 
          />
          <SettingsToggle 
            icon={darkMode ? <Moon size={20} /> : <Sun size={20} />} 
            label="Dark Mode" 
            sub={darkMode ? "Switch to light theme" : "Switch to dark theme"} 
            active={darkMode} 
            onChange={toggleTheme} 
          />
          <SettingsToggle 
            icon={<Hexagon size={20} />} 
            label="Biometric Login" 
            sub="Use fingerprint or face" 
            active={biometric} 
            onChange={() => setBiometric(!biometric)} 
          />
        </section>

        {/* Menu Items */}
        <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[2.5rem] p-2 border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-2xl">
          <SettingsLink 
            icon={<HelpCircle size={20} />} 
            label="Help & Support" 
            onClick={() => navigate('/support')} 
          />
          <SettingsLink 
            icon={<Info size={20} />} 
            label="About IntelliPark" 
            onClick={() => setShowAbout(true)}
          />
          <SettingsLink 
            icon={<Lock size={20} />} 
            label="Privacy Policy" 
            onClick={() => setShowPrivacy(true)}
          />
          <SettingsLink 
            icon={<Car size={20} />} 
            label="Your Vehicles" 
            onClick={() => navigate('/vehicles')} 
          />
          <SettingsLink 
            icon={<Map size={20} />} 
            label="Location Dashboard" 
            onClick={() => navigate('/locations')}
          />
        </section>

        {/* About Modal */}
        {showAbout && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-slate-900 max-w-md w-full rounded-[3rem] p-8 space-y-6 shadow-2xl border border-slate-200 dark:border-white/10"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">About IntelliPark</h3>
                <button onClick={() => setShowAbout(false)} className="p-2 text-slate-400 hover:text-brand-primary"><Smartphone size={20} /></button>
              </div>
              <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                <p>IntelliPark is an advanced autonomous grid management system designed to revolutionize urban parking infrastructure.</p>
                <p>Powered by neural networks, our platform provides real-time slot allocation, predictive maintenance data, and secure encrypted access for all registered units.</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-brand-primary">Version 1.0.4 - MIT Core</p>
              </div>
              <button 
                onClick={() => setShowAbout(false)}
                className="w-full py-4 bg-brand-primary text-white dark:text-background-deep rounded-2xl font-bold uppercase tracking-widest text-xs"
              >
                System Ready
              </button>
            </motion.div>
          </div>
        )}

        {/* Privacy Modal */}
        {showPrivacy && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white dark:bg-slate-900 max-w-md w-full rounded-[3rem] p-8 space-y-6 shadow-2xl border border-slate-200 dark:border-white/10 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">Privacy Protocol</h3>
                <button onClick={() => setShowPrivacy(false)} className="p-2 text-slate-400 hover:text-brand-primary"><Shield size={20} /></button>
              </div>
              <div className="space-y-4 text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-left">
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-slate-200">1. Data Encryption</h4>
                  <p>All vehicle information and owner credentials are hashed using AES-256 neural encryption standards. Your personal data is never transmitted in plain text.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-slate-200">2. Real-time Tracking</h4>
                  <p>Telemetry data is only stored for active session duration and is automatically purged upon exit validation from the parking grid.</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-bold text-slate-900 dark:text-slate-200">3. Local Storage</h4>
                  <p>System preferences including visual themes and biometric tokens are stored locally on your device ensuring zero-knowledge privacy for UI configurations.</p>
                </div>
              </div>
              <button 
                onClick={() => setShowPrivacy(false)}
                className="w-full py-4 bg-slate-900 dark:bg-brand-primary text-white dark:text-background-deep rounded-2xl font-bold uppercase tracking-widest text-xs"
              >
                I Accept Protocol
              </button>
            </motion.div>
          </div>
        )}

        {/* Danger Zone */}
        <div className="px-2">
          <button 
            onClick={handleLogout}
            className="w-full h-20 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-display font-bold rounded-3xl flex items-center justify-center gap-4 transition-all border border-red-500/20 active:scale-95 group"
          >
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <LogOut size={22} />
            </div>
            Sign Out Protocol
          </button>
        </div>

        {/* Footer Branding */}
        <div className="flex flex-col items-center gap-3 pt-10 opacity-30 pb-10">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-brand-primary flex items-center justify-center text-background-deep font-display font-bold text-lg ring-8 ring-brand-primary/5">I</div>
              <span className="text-sm font-display font-bold text-white uppercase tracking-tighter">IntelliPark</span>
           </div>
           <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.4em]">Autonomous Grid v1.0.4</p>
        </div>
      </div>
    </motion.div>
  );
}

function SettingsToggle({ 
  icon, 
  label, 
  sub, 
  active, 
  onChange 
}: { 
  icon: React.ReactNode; 
  label: string; 
  sub: string; 
  active: boolean; 
  onChange: () => void 
}) {
  return (
    <div className="flex items-center gap-5 p-6 border-b border-slate-200 dark:border-white/[0.03] last:border-0">
      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/5 text-brand-primary flex items-center justify-center shadow-sm dark:shadow-inner">
        {icon}
      </div>
      <div className="flex-1 text-left">
        <h4 className="font-display font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1.5 text-base transition-colors">
          {label}
        </h4>
        <p className="text-[11px] text-slate-500 font-medium">{sub}</p>
      </div>
      <button 
        onClick={onChange}
        className={`w-14 h-7 rounded-full p-1 transition-all duration-500 relative flex items-center ${active ? 'bg-brand-primary shadow-[0_0_15px_rgba(132,204,22,0.4)]' : 'bg-slate-200 dark:bg-slate-800'}`}
      >
        <motion.div 
          animate={{ x: active ? 28 : 0 }}
          className="w-5 h-5 rounded-full bg-white shadow-xl" 
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

function SettingsLink({ 
  icon, 
  label, 
  onClick 
}: { 
  icon: React.ReactNode; 
  label: string; 
  onClick?: () => void 
}) {
  return (
    <button 
      onClick={onClick}
      className="w-full flex items-center gap-5 p-6 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-all border-b border-slate-200 dark:border-white/[0.03] last:border-0 group active:scale-[0.98]"
    >
      <div className="w-12 h-12 rounded-2xl bg-white dark:bg-white/5 text-slate-400 dark:text-slate-500 flex items-center justify-center group-hover:text-brand-primary group-hover:bg-brand-primary/5 transition-all shadow-sm dark:shadow-none">
        {icon}
      </div>
      <div className="flex-1 text-left">
        <h4 className="font-display font-bold text-slate-700 dark:text-white group-hover:text-slate-900 tracking-tight text-base transition-colors">
          {label}
        </h4>
      </div>
      <ChevronRight size={20} className="text-slate-400 group-hover:text-brand-primary transition-colors" />
    </button>
  );
}

