import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Car, ShieldCheck, User, Sparkles } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background-deep flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_-20%,rgba(132,204,22,0.15),transparent)] pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-5 pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-8 mb-20 relative z-10"
      >
        <div className="w-28 h-28 bg-brand-primary rounded-[3rem] mx-auto flex items-center justify-center text-background-deep shadow-[0_0_60px_rgba(132,204,22,0.4)] rotate-3 animate-float mb-10 border-4 border-brand-primary/30">
          <Car size={56} strokeWidth={3} />
        </div>
        <div className="space-y-4">
          <h1 className="text-7xl font-display font-black tracking-tighter">
            Intelli<span className="text-brand-primary">Park</span>
          </h1>
          <div className="flex items-center justify-center gap-3">
            <div className="h-px w-12 bg-brand-primary/40" />
            <p className="text-[12px] font-black text-brand-primary uppercase tracking-[0.5em]">Autonomous Grid v1.0.4</p>
            <div className="h-px w-12 bg-brand-primary/40" />
          </div>
        </div>
        <p className="max-w-sm mx-auto font-black text-lg leading-relaxed opacity-90">
          Next-generation infrastructure management powered by neural-linked artificial intelligence.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 w-full max-w-3xl relative z-10 px-4">
        <LandingCard 
          title="User Access"
          desc="Deploy unit clusters & secure slots instantly"
          icon={<User size={28} />}
          onClick={() => navigate('/auth/user')}
          variant="primary"
        />
        <LandingCard 
          title="Admin Hub"
          desc="Command center for grid ops & live feeds"
          icon={<ShieldCheck size={28} />}
          onClick={() => navigate('/auth/admin')}
          variant="secondary"
        />
      </div>

      <footer className="mt-20 text-center space-y-6 relative z-10">
        <button 
          onClick={() => navigate('/auth/admin')}
          className="group flex items-center gap-3 mx-auto px-6 py-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-95"
        >
          <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
          <span className="text-[11px] font-bold group-hover:text-brand-primary uppercase tracking-[0.2em] transition-colors">Administrator Portal</span>
        </button>
        <div className="flex flex-col items-center gap-2 opacity-30">
          <div className="flex items-center gap-2">
            <Sparkles size={12} className="text-brand-primary" />
            <p className="text-[9px] font-bold uppercase tracking-[0.3em]">Neural Exchange Protocol</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function LandingCard({ title, desc, icon, onClick, variant }: any) {
  const isPrimary = variant === 'primary';
  return (
    <motion.button
      whileHover={{ y: -12, scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={`p-12 rounded-[3.5rem] shadow-2xl flex flex-col items-center text-center gap-8 transition-all border-4 relative overflow-hidden group ${
        isPrimary 
          ? 'bg-slate-900/60 border-white/10 hover:border-brand-primary/40' 
          : 'bg-white text-slate-950 border-white shadow-brand-primary/10'
      }`}
    >
      <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all duration-500 group-hover:rotate-6 shadow-2xl ${
        isPrimary ? 'bg-brand-primary text-background-deep' : 'bg-slate-900 text-white'
      }`}>
        {icon}
      </div>
      <div className="space-y-3">
        <h3 className={`text-3xl font-display font-black tracking-tight ${isPrimary ? 'text-white' : 'text-black'}`}>{title}</h3>
        <p className={`text-[13px] font-black max-w-[200px] leading-relaxed uppercase tracking-widest ${isPrimary ? 'text-slate-500' : 'text-slate-950'}`}>{desc}</p>
      </div>
      <div className={`absolute -bottom-12 -right-12 w-48 h-48 rounded-full blur-[80px] opacity-30 ${isPrimary ? 'bg-brand-primary' : 'bg-brand-primary/20'}`} />
    </motion.button>
  );
}
