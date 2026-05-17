import React from 'react';
import { Search, MapPin, ChevronRight, Star, Activity, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Location } from '../types';
import { MOCK_LOCATIONS } from '../data/mockData';

interface LocationsProps {
  activeLocation: Location;
  onSelect: (l: Location) => void;
}

export default function Locations({ activeLocation, onSelect }: LocationsProps) {
  const navigate = useNavigate();

  const handleSelect = (location: Location) => {
    onSelect(location);
    navigate('/');
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="px-1 text-center">
        <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">Select Location</h1>
        <p className="text-slate-400 text-sm font-medium">Find the nearest IntelliPark spot</p>
      </header>

      <div className="relative group">
        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">
           <Search size={18} />
        </div>
        <input 
          placeholder="Search locations..."
          className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-6 text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-brand-primary/50 transition-all font-medium"
        />
      </div>

      <div className="space-y-4">
        {MOCK_LOCATIONS.map((location, idx) => (
          <motion.button
            key={`location-card-${location.id}-${idx}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => handleSelect(location)}
            className={`w-full text-left p-5 rounded-3xl border transition-all relative overflow-hidden group ${
              activeLocation.id === location.id 
                ? "bg-white dark:bg-white/10 border-brand-primary text-slate-900 dark:text-white shadow-lg shadow-brand-primary/5 ring-4 ring-brand-primary/5" 
                : "bg-white dark:bg-white/5 border-slate-50 dark:border-white/5 text-slate-900 dark:text-white hover:border-slate-200 dark:hover:border-white/10 shadow-sm"
            }`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                   <h3 className="text-lg font-display font-bold leading-tight text-slate-900 dark:text-white">
                    {location.name}
                  </h3>
                  {activeLocation.id === location.id && (
                    <div className="w-2 h-2 rounded-full bg-brand-primary animate-pulse" />
                  )}
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                   <MapPin size={14} className="text-brand-primary" />
                   <p className="text-xs font-medium truncate max-w-[200px]">
                    {location.address}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                 <span className="text-[10px] font-bold text-slate-900 dark:text-white bg-slate-50 dark:bg-white/10 px-2 py-1 rounded-lg">
                    {location.distance}
                 </span>
                 <div className="flex items-center gap-1 text-orange-400">
                    <Star size={10} fill="currentColor" stroke="none" />
                    <span className="text-[10px] font-bold">{location.rating}</span>
                 </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-50">
               <div className="flex gap-4">
                 <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest leading-none">Starting From</p>
                    <p className="text-sm font-display font-bold text-slate-900 dark:text-white">₹{location.prices.Bike}/hr</p>
                 </div>
                 <div className="space-y-0.5">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest leading-none">Available</p>
                    <p className="text-sm font-display font-bold text-brand-primary">{location.availableSlots} Slots</p>
                 </div>
               </div>
               <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                activeLocation.id === location.id ? "bg-brand-primary text-white" : "bg-slate-50 text-slate-300"
              }`}>
                <ChevronRight size={18} />
              </div>
            </div>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}


function PriceItem({ label, value, active, isStatus = false }: { label: string; value: string | number; active: boolean; isStatus?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className={`text-[9px] font-bold uppercase tracking-[0.15em] ${active ? "text-brand-primary opacity-40" : "text-slate-300"}`}>{label}</p>
      <div className="flex items-center gap-1.5">
        {isStatus && <div className="w-1.5 h-1.5 rounded-full bg-brand-secondary animate-pulse" />}
        <p className={`text-sm font-bold mono-data ${active ? "text-brand-primary" : "text-brand-primary opacity-70"}`}>{value}{!isStatus && "/hr"}</p>
      </div>
    </div>
  );
}
