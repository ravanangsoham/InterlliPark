import React, { useState } from 'react';
import { Clock, CheckCircle2, AlertCircle, Calendar, Hash, IndianRupee, LogOut, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { ParkingTicket, Vehicle } from '../types';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, runTransaction } from 'firebase/firestore';

interface HistoryProps {
  tickets: ParkingTicket[];
  vehicles: Vehicle[];
}

export default function History({ tickets, vehicles }: HistoryProps) {
  const [finishing, setFinishing] = useState<string | null>(null);

  const handleCheckOut = async (ticket: ParkingTicket) => {
    setFinishing(ticket.id);
    try {
      await runTransaction(db, async (transaction) => {
        const now = new Date().getTime();
        const start = (ticket.startTime as any)?.toMillis ? (ticket.startTime as any).toMillis() : new Date(ticket.startTime).getTime();
        const diffMs = now - start;
        const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
        const finalAmount = (ticket as any).isFree ? 0 : hours * 20;

        const bookingRef = doc(db, 'bookings', ticket.id);
        transaction.update(bookingRef, {
          status: 'completed',
          endTime: serverTimestamp(),
          totalAmount: finalAmount,
          updatedAt: serverTimestamp(),
        });
        
        if (ticket.slotId) {
          const slotRef = doc(db, 'slots', ticket.slotId);
          transaction.update(slotRef, {
            status: 'available',
            currentBookingId: null,
            updatedAt: serverTimestamp(),
          });
        }
      });
      console.log("Session ended successfully via transaction");
    } catch (error) {
      console.error("End session failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${ticket.id}`);
    } finally {
      setFinishing(null);
    }
  };

  const handleCancel = async (ticket: ParkingTicket) => {
    setFinishing(ticket.id);
    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', ticket.id);
        transaction.update(bookingRef, {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
        
        if (ticket.slotId) {
          const slotRef = doc(db, 'slots', ticket.slotId);
          transaction.update(slotRef, {
            status: 'available',
            currentBookingId: null,
            updatedAt: serverTimestamp(),
          });
        }
      });
      console.log("Reservation cancelled successfully");
    } catch (error) {
      console.error("Cancellation failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${ticket.id}`);
    } finally {
      setFinishing(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <header className="px-1">
        <h1 className="text-2xl font-display font-black text-black dark:text-white transition-colors">History</h1>
        <p className="text-slate-900 dark:text-slate-400 text-sm font-black uppercase tracking-wider">Your recent parking sessions</p>
      </header>

      <div className="space-y-3 pb-10">
        {tickets.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-50 dark:border-white/5 flex flex-col items-center justify-center text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
              <Clock size={32} />
            </div>
            <div>
              <p className="text-black dark:text-white font-display font-bold">No History Yet</p>
              <p className="text-black/60 dark:text-white/60 text-xs">Your parking sessions will appear here</p>
            </div>
          </div>
        ) : (
            tickets.slice().map((ticket, idx) => {
            const statusColor = 
              ticket.status === 'active' ? 'text-black dark:text-brand-primary bg-brand-primary/20 border-black/10' : 
              ticket.status === 'reserved' ? 'text-black dark:text-emerald-500 bg-emerald-500/20 border-emerald-600/20' :
              ticket.status === 'cancelled' ? 'text-black dark:text-red-500 bg-red-500/20 border-red-600/20' :
              'text-black dark:text-white bg-slate-100 dark:bg-white/5 border-slate-200';
            
            const statusLabel = 
              ticket.status === 'active' ? 'Ongoing' : 
              ticket.status === 'reserved' ? 'Reserved' :
              ticket.status === 'cancelled' ? 'Cancelled' :
              'Completed';

            return (
              <motion.div
                key={`history-ticket-${ticket.id}-${idx}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white dark:bg-white/5 p-5 rounded-3xl border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 transition-all shadow-md group"
              >
                <div className="flex justify-between items-start mb-4">
                   <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${
                        ticket.status === 'active' ? 'bg-brand-primary text-black' : 
                        ticket.status === 'reserved' ? 'bg-emerald-500 text-black' :
                        'bg-slate-100 dark:bg-white/5 text-black dark:text-white'
                      }`}>
                         <Hash size={24} />
                      </div>
                      <div>
                          <h3 className="text-lg font-mono font-black text-black dark:text-white uppercase transition-colors">{(ticket as any).vehicleNumber || 'UNKNOWN'}</h3>
                           <p className="text-[10px] text-slate-800 dark:text-slate-400 font-black uppercase tracking-wider">{(ticket as any).vehicleType || 'Vehicle'} • Slot {(ticket as any).slotNumber || ticket.slotId}</p>
                       </div>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${statusColor}`}>
                       {statusLabel}
                    </div>
                 </div>

                 <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-white/10">
                    <div className="flex gap-4">
                       <div className="space-y-1">
                          <p className="text-[10px] text-black dark:text-white font-black uppercase tracking-[0.2em] leading-none">Date</p>
                          <p className="text-sm font-black text-black dark:text-white transition-colors">{ticket.startTime ? new Date(ticket.startTime).toLocaleDateString() : '---'}</p>
                       </div>
                       <div className="space-y-1">
                          <p className="text-[10px] text-black dark:text-white font-black uppercase tracking-[0.2em] leading-none">Time</p>
                          <p className="text-sm font-black text-black dark:text-white transition-colors">{ticket.startTime ? new Date(ticket.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '---'}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-4">
                       <div className="text-right">
                          <p className="text-[10px] text-black dark:text-white font-black uppercase tracking-widest leading-none mb-0.5">Amount</p>
                          <p className="text-xl font-display font-black text-black dark:text-white transition-colors">₹{ticket.totalAmount || 0}</p>
                       </div>
                      {ticket.status === 'active' && (
                        <button
                          onClick={() => handleCheckOut(ticket)}
                          disabled={finishing === ticket.id}
                          className="bg-black text-white hover:opacity-90 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
                        >
                          {finishing === ticket.id ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                          END SESSION
                        </button>
                      )}
                      {ticket.status === 'reserved' && (
                        <button
                          onClick={() => handleCancel(ticket)}
                          disabled={finishing === ticket.id}
                          className="bg-black text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50 border border-black/10 shadow-lg"
                        >
                          {finishing === ticket.id ? <Loader2 size={12} className="animate-spin" /> : <Clock size={12} />}
                          CANCEL
                        </button>
                      )}
                   </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </motion.div>
  );
}

