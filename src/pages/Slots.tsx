import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Sparkles, Activity, Car, Bike, Truck, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Location, Slot } from '../types';

export default function Slots({ activeLocation, slots: allSlots }: { activeLocation: Location, slots: Slot[] }) {
  const navigate = useNavigate();
  const [activeFloor, setActiveFloor] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const slots = allSlots.filter(s => s.locationId === activeLocation.id && s.floor === activeFloor);

  const handleManualBook = () => {
    if (!selectedSlot) return;
    // For manual booking, we can redirect to Home and pass the selected slot ID via state or query param
    // But currently Home doesn't take a pre-selected slot via URL.
    // Let's implement a simple direct navigation or just inform the user to use the AI flow for now,
    // OR better: navigate to Home with state.
    navigate('/', { state: { manualSlotId: selectedSlot } });
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="px-1 text-center">
        <h1 className="text-2xl font-display font-black text-black dark:text-white uppercase tracking-tight">Virtual Grid</h1>
        <p className="text-brand-primary text-sm font-black uppercase tracking-widest leading-none mt-1">{activeLocation.name}</p>
      </header>

      <div className="flex justify-between p-6 bg-white dark:bg-slate-900 rounded-[2rem] border-2 border-slate-200 dark:border-white/10 shadow-lg">
          <LegendItem color="bg-brand-primary" label="Available" />
          <LegendItem color="bg-red-600" label="Occupied" />
          <LegendItem color="bg-slate-900 dark:bg-slate-500" label="Blocked" />
      </div>

      <div className="flex gap-2 mb-4">
        {Array.from({ length: activeLocation.floors || 2 }, (_, i) => i + 1).map(f => (
          <button 
            key={`slots-floor-switch-${f}`}
            onClick={() => setActiveFloor(f)}
            className={`flex-1 py-3 rounded-xl font-display font-black text-sm transition-all uppercase tracking-widest ${
              activeFloor === f 
                ? "bg-brand-primary text-background-deep shadow-md shadow-brand-primary/20" 
                : "bg-white text-black border-2 border-slate-200"
            }`}
          >
            Floor {f}
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-50 shadow-sm">
        <div className="grid grid-cols-4 gap-4">
          <AnimatePresence mode="popLayout">
            {slots.map((slot, idx) => {
              const isSelected = selectedSlot === slot.id;
              const isAvailable = slot.status === 'available';
              const isOccupied = slot.status === 'occupied';
              const isBlocked = ['blocked', 'maintenance', 'out_of_service'].includes(slot.status);

              return (
                <motion.button
                  key={`slots-page-item-${slot.id}-${idx}`}
                  disabled={isOccupied || isBlocked}
                  onClick={() => setSelectedSlot(isSelected ? null : slot.id)}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.01 }}
                  className={`aspect-[4/5] rounded-xl flex flex-col items-center justify-center p-2 border-2 transition-all gap-1.5 ${
                    isSelected
                      ? "border-orange-400 bg-orange-400/10 text-orange-400 ring-4 ring-orange-400/5"
                      : isAvailable
                      ? "border-brand-primary/20 bg-brand-primary/5 text-brand-primary hover:border-brand-primary"
                      : isOccupied
                      ? "border-red-500/20 bg-red-500/5 text-red-500"
                      : "border-slate-800/10 bg-slate-900/5 text-slate-800"
                  }`}
                >
                  <div className="flex flex-col items-center justify-center">
                    {isBlocked ? <X size={18} strokeWidth={3} /> : 
                     (slot.currentVehicleType || slot.type) === 'Bike' ? <Bike size={18} /> : 
                     (slot.currentVehicleType || slot.type) === 'Truck' ? <Truck size={18} /> : 
                     <Car size={18} />}
                  </div>
                  
                  <div className="text-center">
                    <p className="text-[9px] font-mono font-bold tracking-tighter leading-none mb-0.5">
                      F{activeFloor}-{slot.number}
                    </p>
                    <p className="text-[7px] font-bold uppercase tracking-tight opacity-70">
                      {isAvailable ? 'Available' : isOccupied ? 'Occupied' : 'Blocked'}
                    </p>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <button 
        disabled={!selectedSlot}
        onClick={handleManualBook}
        className="w-full bg-black hover:bg-slate-900 text-white dark:text-background-deep py-6 rounded-3xl font-display font-black text-lg flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-30 disabled:grayscale uppercase tracking-widest shadow-xl"
      >
        Confirm Selection
      </button>

      <div className="flex items-center justify-center gap-2 pt-4 opacity-50">
         <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
         <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.2em]">Live Floor Data Synchronized</p>
      </div>
    </motion.div>
  );
}


function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 rounded-full border border-slate-200 dark:border-white/10">
      <div className={`w-3 h-3 rounded-full ${color} shadow-sm border border-white/20`} />
      <span className="text-[11px] font-black text-slate-950 dark:text-white uppercase tracking-widest leading-none">{label}</span>
    </div>
  );
}
