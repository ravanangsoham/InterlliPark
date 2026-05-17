import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Plus, Edit2, Trash2, Car, Bike, Truck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Vehicle } from '../types';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

interface VehiclesProps {
  vehicles: Vehicle[];
}

export default function Vehicles({ vehicles }: VehiclesProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [newVehicle, setNewVehicle] = useState({ number: '', type: '4-Wheeler', ownerName: '', phone: '' });
  const [isSaving, setIsSaving] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newVehicle.number) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'vehicles'), {
        userId: user.uid,
        ...newVehicle,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setShowAdd(false);
      setNewVehicle({ number: '', type: '4-Wheeler', ownerName: '', phone: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'vehicles');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'vehicles', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vehicles/${id}`);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 pb-10"
    >
      <header className="flex justify-between items-center px-1">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 border border-slate-50 dark:border-white/5 flex items-center justify-center text-slate-400 shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold text-slate-900 dark:text-white transition-colors">Your Vehicles</h1>
            <p className="text-slate-400 text-xs font-medium">{vehicles.length} Saved Units</p>
          </div>
        </div>
        <button 
          onClick={() => setShowAdd(true)}
          className="w-10 h-10 rounded-xl bg-brand-primary text-white dark:text-background-deep flex items-center justify-center shadow-lg shadow-brand-primary/20 hover:scale-105 active:scale-95 transition-all"
        >
          <Plus size={20} />
        </button>
      </header>

      <div className="space-y-4">
        {vehicles.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-50 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
             <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center text-slate-200 dark:text-slate-700">
               <Car size={32} />
             </div>
             <div>
               <p className="text-slate-500 dark:text-slate-400 font-display font-bold">No Vehicles Saved</p>
               <p className="text-slate-300 dark:text-slate-600 text-xs">Add your vehicle for quick booking</p>
             </div>
          </div>
        ) : (
          vehicles.map((v, idx) => (
            <motion.div
              key={`vehicle-item-${v.id}-${idx}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-50 dark:border-white/5 flex items-center gap-4 group shadow-sm hover:border-slate-200 dark:hover:border-white/10 transition-all"
            >
              <div className="w-14 h-14 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                {v.type === 'Bike' ? <Bike size={24} /> : v.type === 'Truck' ? <Truck size={24} /> : <Car size={24} />}
              </div>
              
              <div className="flex-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{v.ownerName || 'Personal Unit'}</h3>
                <p className="font-mono text-lg font-bold text-slate-900 dark:text-white tracking-tighter uppercase transition-colors">{v.number}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-brand-primary font-bold bg-brand-primary/5 px-2 py-0.5 rounded-full">{v.type}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => handleDelete(v.id!)}
                  className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm border border-transparent"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      <AnimatePresence>
        {showAdd && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 max-w-md w-full rounded-[3rem] p-8 space-y-6 shadow-2xl border border-slate-200 dark:border-white/10"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">New Vector</h3>
                <button onClick={() => setShowAdd(false)} className="p-2 text-slate-400 hover:text-brand-primary transition-colors"><X size={24} /></button>
              </div>

              <form onSubmit={handleAdd} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Vehicle Number</label>
                  <input 
                    required
                    value={newVehicle.number}
                    onChange={e => setNewVehicle({ ...newVehicle, number: e.target.value.toUpperCase() })}
                    placeholder="KA-01-AB-1234"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-2xl p-4 text-slate-900 dark:text-white font-mono font-bold uppercase outline-none focus:border-brand-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Type</label>
                  <select 
                    value={newVehicle.type}
                    onChange={e => setNewVehicle({ ...newVehicle, type: e.target.value })}
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-2xl p-4 text-slate-900 dark:text-white font-bold outline-none focus:border-brand-primary transition-all appearance-none"
                  >
                    <option value="Bike">Bike</option>
                    <option value="4-Wheeler">4-Wheeler</option>
                    <option value="Tempo">Tempo</option>
                    <option value="Truck">Truck</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Owner Name</label>
                  <input 
                    value={newVehicle.ownerName}
                    onChange={e => setNewVehicle({ ...newVehicle, ownerName: e.target.value })}
                    placeholder="Full Name"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-2xl p-4 text-slate-900 dark:text-white font-bold outline-none focus:border-brand-primary transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">Contact Number</label>
                  <input 
                    value={newVehicle.phone}
                    onChange={e => setNewVehicle({ ...newVehicle, phone: e.target.value })}
                    placeholder="+91 XXXXX XXXXX"
                    className="w-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-white/5 rounded-2xl p-4 text-slate-900 dark:text-white font-bold outline-none focus:border-brand-primary transition-all"
                  />
                </div>

                <button 
                  disabled={isSaving}
                  className="w-full py-5 bg-brand-primary text-white dark:text-background-deep rounded-2xl font-display font-bold text-lg shadow-xl shadow-brand-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                >
                  {isSaving ? <div className="w-5 h-5 border-2 border-white dark:border-background-deep border-t-transparent rounded-full animate-spin" /> : 'Register Unit'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

