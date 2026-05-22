import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, MapPin, Grid3X3, ShieldCheck, Settings, Clock, MessageSquare } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function Layout() {
  return (
    <div className="flex flex-col min-h-screen pb-24 bg-background-deep selection:bg-brand-primary/30 text-slate-900 dark:text-slate-200 transition-colors duration-300">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-brand-primary/10 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -right-[10%] w-[30%] h-[30%] bg-brand-accent/5 rounded-full blur-[100px]" />
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 pt-8 pb-32">
        <Outlet />
      </main>

      <nav className="fixed bottom-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-2xl rounded-[3rem] safe-bottom z-50 border border-slate-200 dark:border-white/5 flex justify-around py-4 px-6 shadow-2xl shadow-black/5 dark:shadow-black/50 transition-colors duration-300">
        <NavItem to="/" icon={<Home size={22} />} label="Home" />
        <NavItem to="/locations" icon={<MapPin size={22} />} label="Detect" />
        <NavItem to="/history" icon={<Clock size={22} />} label="Activity" />
        <NavItem to="/support" icon={<MessageSquare size={22} />} label="Support" />
        <NavItem to="/settings" icon={<Settings size={22} />} label="Account" />
      </nav>
    </div>
  );
}

function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-1 transition-colors relative",
          isActive ? "text-brand-primary" : "text-slate-400"
        )
      }
    >
      {({ isActive }) => (
        <>
          {icon}
          <span className="text-[10px] font-medium tracking-wide">{label}</span>
          {isActive && (
            <motion.div
              layoutId="nav-pill"
              className="absolute -bottom-1 w-1 h-1 bg-brand-primary rounded-full"
              transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
            />
          )}
        </>
      )}
    </NavLink>
  );
}
