import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, Bike, Truck, User, Phone, MapPin, 
  ChevronDown, MoveRight, Activity, Sparkles, 
  CheckCircle2, Loader2, QrCode, CreditCard,
  AlertCircle,
  Zap,
  X,
  MessageSquare,
  Clock,
  HelpCircle
} from 'lucide-react';
import { Vehicle, Location, VehicleType, Slot, ParkingTicket } from '../types';
import { generateSlots } from '../data/mockData';
import { db, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, runTransaction } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export default function Home({ activeLocation, savedVehicles, slots, tickets, onAllocate }: { 
  activeLocation: Location, 
  savedVehicles: Vehicle[],
  slots: Slot[],
  tickets: ParkingTicket[],
  onAllocate: (v: Vehicle, s: string) => void 
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [step, setStep] = useState<'details' | 'ai-allocation' | 'duration' | 'confirmation' | 'payment' | 'success'>('details');
  const [vehicleType, setVehicleType] = useState<VehicleType>('Bike');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [duration, setDuration] = useState(1);
  const [bookingType, setBookingType] = useState<'Instant' | 'Pre-booking'>('Instant');
  const [arrivalTime, setArrivalTime] = useState('');
  
  const [suggestedSlot, setSuggestedSlot] = useState<Slot | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [activeFloor, setActiveFloor] = useState(1);
  const [allocating, setAllocating] = useState(false);
  const [showAIExplanation, setShowAIExplanation] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [booking, setBooking] = useState<ParkingTicket | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Removed local slots state and generateSlots

  // Auto-fill from last vehicle
  useEffect(() => {
    if (savedVehicles.length > 0 && !vehicleNumber) {
      const last = savedVehicles[savedVehicles.length - 1];
      setVehicleType(last.type);
      setVehicleNumber(last.number);
      setOwnerName(last.ownerName || '');
      setPhone(last.phone || '');
    }
  }, [savedVehicles]);

  // Handle manual slot selection from Slots page
  useEffect(() => {
    const state = location.state as { manualSlotId?: string };
    if (state?.manualSlotId && slots.length > 0) {
      const slot = slots.find(s => s.id === state.manualSlotId);
      if (slot) {
        setSelectedSlot(slot);
        setSuggestedSlot(slot);
        // If we have vehicle details, jump to AI allocation or confirmation
        if (vehicleNumber && ownerName && phone) {
           setStep('ai-allocation');
        } else {
           // Stay at details but with slot pre-selected
        }
      }
    }
  }, [location.state, slots]);

  const activeTicket = (tickets || []).find(t => (t.status === 'active' || t.status === 'reserved') && t.locationName === activeLocation.name);

  const handleCancelBooking = async (ticket: ParkingTicket) => {
    if (!user) return;
    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', ticket.id);
        
        transaction.update(bookingRef, {
          status: 'cancelled',
          updatedAt: serverTimestamp()
        });

        if (ticket.slotId) {
          const slotRef = doc(db, 'slots', ticket.slotId);
          transaction.update(slotRef, {
            status: 'available',
            currentBookingId: null,
            currentVehicleType: null,
            updatedAt: serverTimestamp()
          });
        }
      });

      setAdminNotification({ message: "Transmission abort success. Slot released.", type: 'success' });
    } catch (err: any) {
      console.error("Cancellation failed:", err);
      // More detailed error for the user to see
      setError(`Grid sequence interruption failed: ${err.message || 'Permission Denied'}`);
    }
  };

  const handleCompleteBooking = async (ticket: ParkingTicket) => {
    if (!user) return;
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
            currentVehicleType: null,
            updatedAt: serverTimestamp(),
          });
        }
      });
      setAdminNotification({ message: "Session ended successfully. Unit released.", type: 'success' });
    } catch (error: any) {
      console.error("End session failed:", error);
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${ticket.id}`);
    }
  };

  const handleSignalArrival = async (ticket: ParkingTicket) => {
    if (!user) return;
    try {
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', ticket.id);
        transaction.update(bookingRef, {
          userArrived: true,
          status: 'active',
          updatedAt: serverTimestamp()
        });

        if (ticket.slotId) {
          const slotRef = doc(db, 'slots', ticket.slotId);
          transaction.update(slotRef, {
            status: 'occupied',
            updatedAt: serverTimestamp()
          });
        }
      });
      setAdminNotification({ message: "Arrival signal transmitted. Grid status: OCCUPIED.", type: 'success' });
    } catch (err) {
      console.error("Signal failed:", err);
      setError("Communication link failure.");
    }
  };

  const [adminNotification, setAdminNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);

  // Clear notification
  useEffect(() => {
    if (adminNotification) {
      const t = setTimeout(() => setAdminNotification(null), 3000);
      return () => clearTimeout(t);
    }
  }, [adminNotification]);

  const handleAIAllocation = () => {
    if (!vehicleNumber || !ownerName || !phone) {
      setError("Incomplete biometric data. Please fill all unit details.");
      return;
    }
    setAllocating(true);
    setError(null);
    
    // Simulate AI thinking
    setTimeout(() => {
      console.log("Allocating slot for:", { vehicleType, vehicleNumber, locationId: activeLocation.id });
      console.log("Total slots available in state:", slots.length);
      console.log("Filtering with:", { 
          status: 'available', 
          type: vehicleType, 
          locationId: activeLocation.id 
      });

      // 1. Filter for compatible available slots
      const compatible = slots.filter(s => 
        s.status === 'available' && 
        s.type === vehicleType &&
        s.locationId === activeLocation.id
      );
      
      console.log("Compatible available slots found:", compatible.length);
      
      if (compatible.length > 0) {
        // 2. Prioritize proximity (lowest number assuming 001 is nearest to entrance)
        const sorted = [...compatible].sort((a, b) => {
          const numA = parseInt(a.number.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.number.replace(/\D/g, '')) || 0;
          return numA - numB;
        });

        const best = sorted[0];
        setSuggestedSlot(best);
        setSelectedSlot(best);
      } else {
        console.warn("No compatible slots found for:", { vehicleType, locationId: activeLocation.id });
        setSuggestedSlot(null);
        setSelectedSlot(null);
        setError(`No available slots for ${vehicleType} in this location.`);
      }
      setAllocating(false);
      setStep('ai-allocation');
    }, 1500);
  };

  const handleConfirmSlot = () => {
    if (!selectedSlot) return;
    setStep('duration');
  };

  const handleConfirmDuration = () => {
    setStep('confirmation');
  };

  const handleProceedToPayment = () => {
    setStep('payment');
  };

  const handlePaymentSuccess = async () => {
    if (!selectedSlot || !user) return;
    setSaving(true);
    setError(null);

    const vehicleId = Math.random().toString(36).substr(2, 9);
    
    try {
      const now = new Date();
      
      // Use transaction to ensure slot doesn't get booked by someone else at the same time
      // and to ensure atomicity of the booking process
      const { runTransaction } = await import('firebase/firestore');
      
      await runTransaction(db, async (transaction) => {
        // 1. Get current slot state
        const slotRef = doc(db, 'slots', selectedSlot.id);
        const slotSnap = await transaction.get(slotRef);
        
        if (!slotSnap.exists()) {
          throw new Error("Target slot does not exist in the grid.");
        }
        
        const slotData = slotSnap.data();
        if (slotData.status !== 'available' && slotData.status !== 'reserved') {
          // Allow if it's already reserved by us maybe? 
          // For now, strict 'available' check
          if (slotData.status !== 'available') {
             throw new Error("Slot is no longer available. Re-scanning recommended.");
          }
        }

        // 2. Create Booking document ID manually so we can use it in slot update
        const bookingRef = doc(collection(db, 'bookings'));
        
        const bookingData = {
          userId: user.uid,
          slotId: selectedSlot.id,
          vehicleNumber: vehicleNumber,
          vehicleType: vehicleType,
          ownerName: ownerName,
          phone: phone,
          startTime: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          status: 'reserved',
          paymentStatus: 'paid',
          paymentMethod: 'upi',
          bookingType,
          arrivalTime: bookingType === 'Pre-booking' ? arrivalTime : null,
          preBookingFee: bookingType === 'Pre-booking' ? 50 : 0,
          totalAmount: (duration * 20) + (bookingType === 'Pre-booking' ? 50 : 0), 
          duration: duration,
          locationId: activeLocation.id,
          locationName: activeLocation.name,
          slotNumber: selectedSlot.number
        };

        // 3. Set Booking
        transaction.set(bookingRef, bookingData);

        // 4. Update Slot
        transaction.update(slotRef, {
          status: 'reserved',
          currentBookingId: bookingRef.id,
          currentVehicleType: vehicleType,
          updatedAt: serverTimestamp()
        });

        // 5. Optionally add vehicle to user's list (outside transaction might be faster but let's keep it clean)
        // We'll do vehicle indexing outside to avoid blowing up the transaction size
        return { bookingId: bookingRef.id };
      });

      // Index vehicle if needed (non-critical)
      try {
        const vQuery = query(
          collection(db, 'vehicles'),
          where('userId', '==', user.uid),
          where('number', '==', vehicleNumber)
        );
        const vSnapshot = await getDocs(vQuery);
        if (vSnapshot.empty) {
          await addDoc(collection(db, 'vehicles'), {
            userId: user.uid,
            number: vehicleNumber,
            type: vehicleType,
            ownerName: ownerName,
            phone: phone,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (e) {
        console.warn("Vehicle indexing failed:", e);
      }
      
      setBooking({
        id: 'new-booking', // This will be refreshed by the snapshot listener in App.tsx
        vehicleId: vehicleId,
        slotId: selectedSlot.id,
        startTime: Date.now(),
        status: 'reserved',
        paymentStatus: 'paid',
        bookingType,
        arrivalTime: bookingType === 'Pre-booking' ? arrivalTime : null,
        totalAmount: (duration * 20) + (bookingType === 'Pre-booking' ? 50 : 0),
        duration: duration
      });
      
      setStep('success');
    } catch (err: any) {
      console.error("Booking failed:", err);
      setError(err.message || "Transaction failed. Grid parity mismatch.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="w-full space-y-10 pb-32"
    >
      <header className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-brand-primary flex items-center justify-center text-background-deep shadow-2xl shadow-brand-primary/40">
              <span className="font-display font-bold text-2xl leading-none">I</span>
            </div>
            <h1 className="text-2xl font-display font-black text-[#00FF00] tracking-tight transition-colors">IntelliPark AI</h1>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-brand-primary/10 rounded-full border border-brand-primary/20">
             <Activity size={14} className="text-brand-primary animate-pulse" />
             <span className="text-[10px] font-bold text-[#00FF00] uppercase tracking-widest">Neural Link Active</span>
          </div>
          <button 
            onClick={() => navigate('/support')}
            className="w-10 h-10 rounded-xl bg-white dark:bg-white/5 flex items-center justify-center text-[#00FF00] hover:text-brand-primary dark:hover:text-brand-primary transition-all border border-slate-200 dark:border-white/10"
          >
            <MessageSquare size={18} />
          </button>
        </div>

        {activeTicket ? (
          <ActiveSessionCard 
            ticket={activeTicket} 
            onCancel={handleCancelBooking} 
            onComplete={handleCompleteBooking}
            onSignalArrival={handleSignalArrival}
          />
        ) : (
          <div className="bg-white dark:bg-white/5 p-5 rounded-[2.5rem] flex items-center gap-5 border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-white dark:bg-white/5 flex items-center justify-center text-brand-primary shadow-sm">
              <MapPin size={28} />
            </div>
            <div className="flex-1">
              <h3 className="text-[#00FF00] text-lg font-display font-black leading-tight">{activeLocation.name}</h3>
              <p className="text-xs text-[#00FF00] font-black uppercase tracking-[0.2em]">{activeLocation.address}</p>
            </div>
          </div>
        )}

        {adminNotification && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`p-4 rounded-2xl text-center text-xs font-black uppercase tracking-widest mb-6 ${
              adminNotification.type === 'success' ? 'bg-brand-primary/20 text-brand-primary' : 'bg-red-500/20 text-red-500'
            }`}
          >
            {adminNotification.message}
          </motion.div>
        )}
      </header>

      <AnimatePresence mode="wait">
        {step === 'details' && (
          <motion.section 
            key="details"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="space-y-10"
          >
            <div className="space-y-5">
               <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-black text-[#00FF00] uppercase tracking-[0.3em]">Transmission Protocol</h3>
                  <div className="h-px bg-slate-300 dark:bg-white/10 flex-1 ml-4" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                   <button
                    onClick={() => setBookingType('Instant')}
                    className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${
                      bookingType === 'Instant' 
                      ? "border-brand-primary bg-brand-primary/10 text-brand-primary shadow-xl" 
                      : "border-slate-300 dark:border-white/5 bg-white dark:bg-white/5 text-[#00FF00] font-black"
                    }`}
                  >
                    <Zap size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Instant</span>
                  </button>
                  <button
                    onClick={() => setBookingType('Pre-booking')}
                    className={`p-6 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${
                      bookingType === 'Pre-booking' 
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-500 shadow-xl" 
                      : "border-slate-300 dark:border-white/5 bg-white dark:bg-white/5 text-[#00FF00] font-black"
                    }`}
                  >
                    <Clock size={24} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Pre-booking</span>
                  </button>
               </div>
               
               {bookingType === 'Pre-booking' && (
                 <motion.div 
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto' }}
                   className="space-y-4"
                 >
                   <div className="flex items-center justify-between px-1">
                      <h3 className="text-[10px] font-black text-[#00FF00] uppercase tracking-[0.3em]">Arrival Window</h3>
                      <div className="h-px bg-slate-300 dark:bg-white/10 flex-1 ml-4" />
                   </div>
                   <div className="relative group">
                      <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 group-focus-within:scale-110 transition-transform" size={20} />
                      <input 
                        type="time"
                        value={arrivalTime}
                        onChange={e => setArrivalTime(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-white/10 rounded-2xl p-5 pl-14 outline-none focus:border-emerald-500 text-[#00FF00] font-display font-bold text-lg shadow-inner transition-all"
                      />
                   </div>
                   <div className="px-4 py-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                      <p className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest leading-none">Pre-booking Surcharge</p>
                      <p className="text-sm font-display font-bold text-emerald-700 dark:text-emerald-400 leading-none">₹50</p>
                   </div>
                 </motion.div>
               )}

            </div>

            <div className="space-y-5">
               <div className="flex items-center justify-between px-1">
                  <h3 className="text-[11px] font-black text-[#00FF00] uppercase tracking-[0.3em]">Vehicle Segment</h3>
                  <div className="h-px bg-slate-300 dark:bg-white/10 flex-1 ml-4" />
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <VehicleTypeCard type="Bike" active={vehicleType === 'Bike'} onClick={() => setVehicleType('Bike')} />
                  <VehicleTypeCard type="4-Wheeler" active={vehicleType === '4-Wheeler'} onClick={() => setVehicleType('4-Wheeler')} />
                  <VehicleTypeCard type="Tempo" active={vehicleType === 'Tempo'} onClick={() => setVehicleType('Tempo')} />
                  <VehicleTypeCard type="Truck" active={vehicleType === 'Truck'} onClick={() => setVehicleType('Truck')} />
               </div>
            </div>

            <div className="space-y-6">
               <InputGroup label="Vehicle Registration" icon={<div className="font-mono font-black text-brand-primary text-[10px] tracking-widest">REG</div>}>
                  <input 
                    value={vehicleNumber}
                    onChange={e => setVehicleNumber(e.target.value.toUpperCase())}
                    placeholder="KA-01-AB-1234" 
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-5 font-display font-bold text-xl outline-none focus:border-brand-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/10 uppercase tracking-[0.2em] shadow-inner"
                  />
               </InputGroup>

               <InputGroup label="Owner Name" icon={<User size={18} className="text-brand-primary" />}>
                  <input 
                    value={ownerName}
                    onChange={e => setOwnerName(e.target.value)}
                    placeholder="Enter owner name" 
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-5 outline-none focus:border-brand-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/10 font-medium"
                  />
               </InputGroup>

               <InputGroup label="Phone Number" icon={<Phone size={18} className="text-brand-primary" />}>
                  <input 
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="Enter phone number" 
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl px-6 py-5 outline-none focus:border-brand-primary text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/10 font-medium"
                  />
               </InputGroup>

               {bookingType === 'Pre-booking' && (
                 <div className="flex justify-between items-center p-6 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                    <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Estimated Reservation Fee</span>
                    <span className="text-xl font-display font-bold text-emerald-500">₹50</span>
                 </div>
               )}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={handleAIAllocation}
                disabled={!vehicleNumber || !ownerName || !phone || allocating || (bookingType === 'Pre-booking' && !arrivalTime)}
                className="flex-1 bg-brand-primary hover:bg-brand-accent text-background-deep py-6 rounded-3xl font-display font-bold text-lg flex items-center justify-center gap-3 shadow-2xl shadow-brand-primary/20 transition-all active:scale-95 disabled:opacity-30 relative overflow-hidden group"
              >
                {allocating ? (
                  <>
                    <motion.div 
                      initial={{ left: '-100%' }}
                      animate={{ left: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                      className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full h-full"
                    />
                    <div className="relative z-10 flex items-center gap-3">
                      <Loader2 className="animate-spin" size={24} />
                      Calculating Slots...
                    </div>
                  </>
                ) : (
                  <>
                    Initialize Smart Allocation
                    <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
                  </>
                )}
              </button>
              <button
                onClick={() => setShowAIExplanation(true)}
                className="w-16 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-3xl flex items-center justify-center text-slate-400 hover:text-brand-primary transition-all active:scale-95 shadow-lg"
              >
                <HelpCircle size={24} />
              </button>
            </div>
          </motion.section>
        )}

        {step === 'ai-allocation' && (
          <motion.section 
            key="allocation"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between px-1">
               <div className="space-y-1">
                  <h2 className="text-4xl font-display font-black text-[#00FF00] transition-colors">Smart Mapping</h2>
                  <p className="text-[#00FF00] text-[13px] font-black uppercase tracking-widest leading-tight">Neural engine optimized your parking slot</p>
               </div>
               <div className="flex bg-slate-100 dark:bg-white/10 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner">
                  {Array.from({ length: activeLocation.floors || 2 }, (_, i) => i + 1).map(f => (
                    <button 
                      key={`floor-choice-${f}`}
                      onClick={() => setActiveFloor(f)}
                      className={`px-6 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all ${
                        activeFloor === f 
                          ? "bg-brand-primary text-background-deep shadow-lg" 
                          : "text-slate-600 hover:text-black"
                      }`}
                    >
                      FLOOR {f}
                    </button>
                  ))}
               </div>
            </div>

            {slots.length > 0 && (
              <>
                <div className="bg-slate-100 dark:bg-slate-900/40 p-6 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-inner">
                   <div className="grid grid-cols-4 gap-4">
                      {slots.filter(s => s.locationId === activeLocation.id && s.floor === activeFloor && s.type === vehicleType).map((slot, idx) => {
                        const isSuggested = suggestedSlot?.id === slot.id;
                        const isSelected = selectedSlot?.id === slot.id;
                        const isBlocked = ['blocked', 'maintenance', 'out_of_service'].includes(slot.status);
                        
                        const displayType = slot.currentVehicleType || slot.type;
                        
                        return (
                          <button
                            key={`ai-allocation-slot-${slot.id}-${idx}`}
                            disabled={slot.status !== 'available'}
                            onClick={() => setSelectedSlot(slot)}
                            className={`aspect-[4/5] rounded-2xl flex flex-col items-center justify-center gap-1 border-2 transition-all relative ${
                              isSelected 
                                ? "border-orange-400 bg-orange-400/20 text-orange-400 shadow-[0_0_20px_rgba(251,146,60,0.2)]" 
                                : slot.status === 'available'
                                ? "border-brand-primary/20 bg-brand-primary/5 text-brand-primary hover:border-brand-primary/40"
                                : slot.status === 'occupied'
                                ? "border-red-500/10 bg-red-500/5 text-red-500/40"
                                : "border-slate-800/10 bg-slate-900/5 text-slate-800/40"
                            }`}
                          >
                            <span className={`text-[9px] font-mono font-bold ${isSelected ? 'text-orange-400' : slot.status === 'available' ? 'text-brand-primary' : 'text-slate-600'}`}>{slot.number}</span>
                            <div className="flex flex-col items-center justify-center">
                              {isBlocked ? <X size={18} strokeWidth={3} /> : 
                               displayType === 'Bike' ? <Bike size={18} /> : 
                               displayType === 'Truck' ? <Truck size={18} /> : 
                               <Car size={18} />}
                            </div>
                            
                            {isSuggested && !isSelected && (
                              <div className="absolute inset-0 bg-brand-primary/5 rounded-2xl animate-pulse" />
                            )}
                            {isSuggested && (
                              <div className="absolute -top-3 bg-brand-primary text-background-deep text-[7px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-lg">AI Optimal</div>
                            )}
                          </button>
                        );
                      })}
                   </div>
                </div>

                <div className="flex justify-between items-center px-6 py-4 bg-slate-100 dark:bg-white/5 rounded-3xl border border-slate-200 dark:border-white/5">
                    <StatusLegend color="bg-emerald-600" label="Available" />
                    <StatusLegend color="bg-red-600" label="Occupied" />
                    <StatusLegend color="bg-slate-900 dark:bg-slate-500" label="Blocked" />
                </div>
              </>
            )}
            {!suggestedSlot && (
              <div className="bg-red-500/10 dark:bg-red-500/5 border border-red-500/20 rounded-[3rem] p-10 text-center space-y-6 shadow-xl mt-8">
                <div className="w-20 h-20 bg-red-500/20 rounded-3xl flex items-center justify-center text-red-500 mx-auto shadow-lg">
                  {slots.length === 0 ? <Loader2 size={40} className="animate-spin" /> : <AlertCircle size={40} />}
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
                    {slots.length === 0 ? "Initializing Grid..." : "Capacity Exhausted"}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm max-w-[280px] mx-auto font-medium">
                    {slots.length === 0 
                      ? "Synchronizing with facility sensors. Neural handshake in progress..." 
                      : `Our sensors indicate no available ${vehicleType} slots at ${activeLocation.name}. (${slots.filter(s => s.locationId === activeLocation.id).length} slots indexed for this hub).`}
                  </p>
                </div>
                {slots.length > 0 ? (
                  <div className="pt-2">
                    <button 
                      onClick={() => navigate('/locations')}
                      className="bg-slate-900 dark:bg-white text-white dark:text-background-deep px-10 py-5 rounded-2xl font-bold text-base shadow-2xl flex items-center gap-3 mx-auto transition-transform active:scale-95"
                    >
                      Contact Support for Manual Override
                      <MapPin size={20} />
                    </button>
                  </div>
                ) : (
                  <div className="pt-2">
                    <button 
                      onClick={() => navigate('/settings')}
                      className="bg-slate-900 dark:bg-white text-white dark:text-background-deep px-10 py-5 rounded-2xl font-bold text-base shadow-2xl flex items-center gap-3 mx-auto transition-transform active:scale-95"
                    >
                      Check Connectivity
                      <Activity size={20} />
                    </button>
                    <p className="text-[10px] text-slate-900 dark:text-slate-100 font-bold uppercase tracking-widest mt-4 underline decoration-brand-primary/50 underline-offset-4">Check status in central node</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-4">
               <button 
                onClick={() => setStep('details')}
                className="flex-1 bg-white text-slate-950 py-6 rounded-3xl font-bold shadow-2xl transition-all active:scale-95 border border-slate-200"
              >
                Re-scan
              </button>
              <button 
                onClick={handleConfirmSlot}
                disabled={!selectedSlot}
                className="flex-[2] bg-brand-primary text-background-deep py-6 rounded-3xl font-display font-bold shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 group"
              >
                Engage Slot {selectedSlot?.number}
                <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.section>
        )}

        {step === 'duration' && (
          <motion.section 
            key="duration"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-10"
          >
            <div className="text-center space-y-3">
                <h2 className="text-4xl font-display font-black text-[#00FF00] transition-colors">Quantum Span</h2>
                <p className="text-[#00FF00] text-sm font-black tracking-wide uppercase">Define your transmission window</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 4, 8].map(h => (
                <button
                  key={`duration-opt-${h}`}
                  onClick={() => setDuration(h)}
                  className={`p-8 rounded-[2rem] border-2 flex flex-col items-center gap-3 transition-all ${
                    duration === h 
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary shadow-xl" 
                    : "border-slate-200 dark:border-white/5 bg-white dark:bg-white/5 text-slate-400"
                  }`}
                >
                  <span className="text-3xl font-display font-black">{h}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest">{h === 1 ? 'Hour' : 'Hours'}</span>
                </button>
              ))}
            </div>

            <div className="bg-slate-100 dark:bg-slate-900/60 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 space-y-6">
              <div className="flex justify-between items-center">
                 <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Base Rate</span>
                 <span className="text-sm font-display font-bold text-slate-900 dark:text-white">₹20 / hour</span>
              </div>
              <div className="flex justify-between items-center px-6 py-4 bg-brand-primary/10 rounded-2xl border border-brand-primary/20">
                 <span className="text-sm font-black text-brand-primary uppercase tracking-widest">Calculated Toll</span>
                 <div className="text-right">
                   <span className="text-2xl font-display font-bold text-brand-primary">₹{(duration * 20) + (bookingType === 'Pre-booking' ? 50 : 0)}</span>
                   {bookingType === 'Pre-booking' && (
                     <p className="text-[9px] font-black text-brand-primary/60 uppercase tracking-tighter">Incl. ₹50 Reservation Fee</p>
                   )}
                 </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button 
                onClick={() => setStep('ai-allocation')}
                className="flex-1 bg-white text-slate-950 py-6 rounded-3xl font-bold shadow-2xl transition-all active:scale-95 border border-slate-200"
              >
                Back
              </button>
              <button 
                onClick={handleConfirmDuration}
                className="flex-[2] bg-brand-primary text-background-deep py-6 rounded-3xl font-display font-bold shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 group"
              >
                Confirm Duration
                <MoveRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </motion.section>
        )}

        {step === 'confirmation' && (
          <motion.section 
            key="confirmation"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="space-y-8"
          >
             <div className="text-center space-y-3">
                <h2 className="text-4xl font-display font-black text-[#00FF00] transition-colors">Mission Summary</h2>
                <p className="text-[#00FF00] text-sm font-black tracking-wide uppercase">Validate your slot position</p>
             </div>

             <div className="bg-slate-100 dark:bg-slate-900/60 rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
                <div className="p-10 space-y-8">
                   <div className="flex justify-between items-start">
                      <div className="space-y-2">
                         <span className="text-[11px] font-black text-brand-primary uppercase tracking-[0.4em]">Assigned Slot</span>
                         <h3 className="text-6xl font-display font-bold text-slate-950">{selectedSlot?.number}</h3>
                      </div>
                      <div className="w-24 h-24 bg-brand-primary/10 rounded-[2.5rem] flex items-center justify-center text-brand-primary border border-brand-primary/20 shadow-inner">
                         {vehicleType === 'Bike' ? <Bike size={48} /> : vehicleType === '4-Wheeler' ? <Car size={48} /> : <Truck size={48} />}
                      </div>
                   </div>

                   <div className="h-px bg-white/5 w-full" />

                   <div className="grid grid-cols-2 gap-y-8">
                      <DetailItemDark label="Registration" value={vehicleNumber} light={true} />
                      <DetailItemDark label="Owner" value={ownerName} light={true} />
                      <DetailItemDark label="Vehicle Type" value={vehicleType} light={true} />
                      <DetailItemDark label="Duration" value={`${duration} ${duration === 1 ? 'Hour' : 'Hours'}`} light={true} />
                      <DetailItemDark label="Booking Type" value={bookingType} light={true} />
                      {bookingType === 'Pre-booking' && <DetailItemDark label="Arrival Time" value={arrivalTime} light={true} />}
                   </div>

                   <div className="p-8 bg-brand-primary/10 rounded-[2.5rem] flex justify-between items-center border border-brand-primary/10">
                      <div>
                         <p className="text-[11px] font-bold text-brand-primary uppercase tracking-[0.3em] mb-1">Grid Toll</p>
                         <p className="text-xs text-brand-primary/60 font-medium tracking-tight italic">Secure transaction active</p>
                      </div>
                      <div className="text-right">
                        <p className="text-4xl font-display font-bold text-slate-900 dark:text-white transition-colors">₹{(duration * 20) + (bookingType === 'Pre-booking' ? 50 : 0)}</p>
                        {bookingType === 'Pre-booking' && (
                          <p className="text-[10px] font-black text-brand-primary uppercase tracking-tighter">₹{duration * 20} + ₹50 Fee</p>
                        )}
                      </div>
                   </div>
                </div>
             </div>

             <div className="flex gap-4">
                <button 
                  onClick={() => setStep('duration')}
                  className="flex-1 bg-white text-slate-950 py-7 rounded-[2rem] font-bold shadow-2xl transition-all active:scale-95 border border-slate-200"
                >
                  Back
                </button>
                <button 
                  onClick={handleProceedToPayment}
                  className="flex-[2] bg-brand-primary text-background-deep py-7 rounded-[2rem] font-display font-bold text-xl flex items-center justify-center gap-4 shadow-2xl transition-all active:scale-95 group"
                >
                  Authorize Payment
                  <CreditCard size={24} className="group-hover:rotate-12 transition-transform" />
                </button>
             </div>
          </motion.section>
        )}

        {step === 'payment' && (
          <motion.section 
            key="payment"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="space-y-10"
          >
            <div className="text-center space-y-3">
                <h2 className="text-4xl font-display font-bold text-[#00FF00] transition-colors">UPI Transaction</h2>
                <p className="text-[#00FF00] text-sm font-black uppercase tracking-[0.3em]">Neural Scan Active</p>
            </div>

            <div className="bg-slate-100 dark:bg-slate-900/60 p-10 rounded-[3rem] shadow-xl dark:shadow-2xl border border-slate-200 dark:border-white/5 space-y-10 flex flex-col items-center">
               <div className="w-full flex items-center justify-between px-2">
                  <div className="flex items-center gap-3">
                     <QrCode size={20} className="text-brand-primary" />
                     <span className="text-sm font-bold text-slate-700 dark:text-white tracking-widest transition-colors uppercase">Secure UPI Terminal</span>
                  </div>
                  <div className="px-4 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-[10px] font-bold uppercase tracking-[0.2em] border border-brand-primary/20">Live Sync</div>
               </div>

               <div className="space-y-4 text-center">
                  <div className="p-8 bg-slate-200/50 dark:bg-white/10 rounded-[3rem] relative group border border-slate-200 dark:border-white/5">
                    <div className="w-56 h-56 bg-white p-6 rounded-3xl shadow-xl flex items-center justify-center">
                        <div className="grid grid-cols-4 gap-3 opacity-30">
                          {Array.from({ length: 16 }).map((_, i) => (
                              <div key={`payment-qr-placeholder-${i}`} className="w-9 h-9 rounded bg-brand-primary shadow-lg shadow-brand-primary/20" />
                          ))}
                        </div>
                        <QrCode className="absolute text-slate-900 animate-pulse" size={120} />
                    </div>
                    <motion.div 
                      animate={{ y: [0, 200, 0] }}
                      transition={{ repeat: Infinity, duration: 2.5, ease: "linear" }}
                      className="absolute inset-x-8 h-1 bg-brand-primary shadow-[0_0_20px_rgba(132,204,22,1)] rounded-full"
                    />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Scan QR to pay via any UPI App</p>
               </div>

               <div className="text-center space-y-2">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.4em]">UPI ID</p>
                  <p className="text-xl font-display font-bold text-slate-900 dark:text-white tracking-widest transition-colors">intelli.park@upi</p>
               </div>

               <div className="w-full p-8 bg-brand-primary/10 rounded-[2.5rem] flex justify-between items-center border border-brand-primary/10">
                  <span className="text-sm font-bold text-slate-500 dark:text-white opacity-40 uppercase tracking-widest transition-colors">Total Toll</span>
                  <div className="text-right">
                    <span className="text-3xl font-display font-bold text-brand-primary">₹{(duration * 20) + (bookingType === 'Pre-booking' ? 50 : 0)}</span>
                    {bookingType === 'Pre-booking' && (
                      <p className="text-[10px] font-black text-brand-primary uppercase tracking-tighter mt-1">Includes ₹50 Reservation Fee</p>
                    )}
                  </div>
               </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3 text-red-500 text-xs font-bold animate-pulse">
                <AlertCircle size={16} />
                <p className="flex-1">{error}</p>
              </div>
            )}

            <div className="space-y-4">
              <p className="text-[10px] font-black text-center text-slate-400 uppercase tracking-[0.2em]">Transaction processing is simulated for demo</p>
              <button 
                onClick={handlePaymentSuccess}
                className="w-full bg-brand-primary text-background-deep py-7 rounded-[2rem] font-display font-bold text-xl flex items-center justify-center gap-4 shadow-2xl shadow-brand-primary/20 transition-all active:scale-95 group"
              >
                Confirm UPI Payment
                <CheckCircle2 size={24} className="group-hover:scale-125 transition-transform" />
              </button>
              <button 
                onClick={() => setStep('confirmation')}
                className="w-full bg-transparent text-slate-500 py-4 rounded-xl font-bold text-sm uppercase tracking-widest hover:text-slate-700 transition-colors"
              >
                Cancel Transmission
              </button>
            </div>
          </motion.section>
        )}

        {step === 'success' && (
          <motion.section 
            key="success"
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-10 text-center"
          >
            <div className="relative mb-12">
               <motion.div 
                 animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                 transition={{ repeat: Infinity, duration: 3 }}
                 className="absolute inset-0 bg-brand-primary rounded-[4rem] blur-3xl -z-10"
               />
               <div className="w-40 h-40 bg-brand-primary rounded-[3.5rem] flex items-center justify-center text-background-deep shadow-[0_0_80px_rgba(132,204,22,0.4)] relative overflow-hidden">
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 10, stiffness: 100, delay: 0.2 }}
                  >
                     <CheckCircle2 size={80} strokeWidth={2.5} />
                  </motion.div>
                  <motion.div 
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-32 h-full skew-x-12"
                  />
               </div>
            </div>
            
            <div className="space-y-4 mb-16">
              <h2 className="text-5xl font-display font-black text-[#00FF00] tracking-tighter leading-tight italic">GRID SECURED</h2>
              <div className="flex items-center justify-center gap-3">
                 <div className="h-0.5 w-8 bg-brand-primary/30" />
                 <p className="text-[#00FF00] font-black uppercase tracking-[0.4em] text-xs transition-colors">Neural handshake verified</p>
                 <div className="h-0.5 w-8 bg-brand-primary/30" />
              </div>
            </div>
            
            <div className="w-full bg-white dark:bg-slate-950 border-4 border-slate-200 dark:border-white/10 rounded-[4rem] shadow-3xl overflow-hidden mb-16 px-1">
               <div className="bg-slate-50 dark:bg-white/[0.03] p-12 flex justify-between items-end rounded-t-[4rem] border-b border-slate-100 dark:border-white/5">
                <div className="text-left space-y-3">
                   <p className="text-[12px] font-black text-brand-primary uppercase tracking-[0.5em] leading-none mb-1">Grid Anchor</p>
                   <div className="flex items-baseline gap-2">
                     <p className="text-8xl font-display font-black text-slate-950 dark:text-white leading-none">P-{selectedSlot?.number}</p>
                     <p className="text-xl font-display font-bold text-slate-400">FL_{selectedSlot?.floor}</p>
                   </div>
                </div>
                <div className="text-right space-y-4">
                   <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2">
                      <Sparkles size={14} className="text-emerald-500" />
                      <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">Verified</span>
                   </div>
                   <div className="space-y-1">
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.3em]">Sector Token</p>
                      <p className="text-2xl font-mono font-black text-slate-900 tracking-widest">#{booking?.id.slice(0, 6).toUpperCase() || 'TXNDELTA'}</p>
                   </div>
                </div>
               </div>
               <div className="p-10 grid grid-cols-2 gap-8 text-left bg-white dark:bg-slate-950">
                  <div className="space-y-2">
                     <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <User size={12} className="text-brand-primary" />
                        Unit Owner
                     </div>
                     <p className="text-lg font-display font-bold text-slate-900 truncate">{ownerName}</p>
                  </div>
                  <div className="space-y-2 text-right">
                     <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center justify-end gap-2">
                        Unit Registry
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                     </div>
                     <p className="text-lg font-mono font-bold text-brand-primary">{vehicleNumber}</p>
                  </div>
               </div>
               <div className="p-8 flex justify-between items-center bg-slate-100 dark:bg-white/[0.05] border-t border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-3">
                     <Activity size={20} className="text-brand-primary animate-pulse" />
                     <span className="text-sm font-bold text-slate-900 dark:text-white opacity-80 uppercase tracking-widest tracking-tighter">Transmission lock valid: 15m</span>
                  </div>
                  <span className="text-[16px] font-mono text-slate-950 dark:text-white font-black tracking-[0.2em]">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>
               </div>
            </div>

            <div className="w-full space-y-6">
              <button 
                onClick={() => navigate('/history')}
                className="w-full h-20 bg-brand-primary text-background-deep rounded-[2.5rem] font-display font-black text-xl shadow-2xl hover:scale-[1.02] active:scale-95 transition-all shadow-brand-primary/30 flex items-center justify-center gap-4"
              >
                Access Central Log
                <MoveRight size={24} />
              </button>
              <div className="flex gap-4">
                <button 
                  onClick={() => setStep('details')}
                  className="flex-1 text-[11px] font-black text-slate-400 uppercase tracking-[0.5em] hover:text-brand-primary transition-colors py-4"
                >
                  New Protocol
                </button>
                <button 
                  onClick={() => booking && handleCancelBooking(booking)}
                  className="flex-1 text-[11px] font-black text-red-500 uppercase tracking-[0.5em] hover:text-red-600 transition-colors py-4"
                >
                  Abort Mission
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showAIExplanation && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/10"
            >
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                      <Sparkles size={20} />
                    </div>
                    <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">Neural Logic</h3>
                  </div>
                  <button 
                    onClick={() => setShowAIExplanation(false)}
                    className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    Our AI Smart Allocation engine processes multiple variables in real-time to provide the optimal parking sequence:
                  </p>
                  
                  <div className="space-y-3">
                    {[
                      { title: "Vehicle Compatibility", desc: "Filters slots based on vehicle dimensions (Bike vs Car vs Truck)." },
                      { title: "Proximity Mapping", desc: "Calculates the shortest walk distance from your specific entrance grid." },
                      { title: "Historical Trends", desc: "Predicts vacancy windows based on peak rush analytics." },
                      { title: "Energy Optimization", desc: "Reduces congestion by distributing load across parking floors." }
                    ].map((item, i) => (
                      <div key={`ai-logic-feature-${i}`} className="p-4 bg-slate-50 dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                        <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-widest mb-1">{item.title}</h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{item.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <button 
                  onClick={() => setShowAIExplanation(false)}
                  className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 py-5 rounded-2xl font-bold transition-all active:scale-95"
                >
                  Understood
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusLegend({ color, label }: { color: string, label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 rounded-full border-2 border-slate-200 dark:border-white/20 transition-all hover:scale-105 shadow-md">
      <div className={`w-4 h-4 rounded-full ${color} shadow-lg border-2 border-white/40`} />
      <span className="text-[13px] font-black text-slate-950 dark:text-white uppercase tracking-wider leading-none">{label}</span>
    </div>
  );
}

function DetailItemDark({ label, value, light = false }: { label: string; value: string; light?: boolean }) {
  return (
    <div className="space-y-1">
      <p className={`text-[11px] font-black uppercase tracking-[0.3em] leading-none ${light ? 'text-white/60' : 'text-brand-primary'}`}>{label}</p>
      <p className={`text-lg font-display font-bold mt-1 tracking-tight transition-colors ${light ? 'text-white' : 'text-slate-950'}`}>{value}</p>
    </div>
  );
}

function VehicleTypeCard({ type, active, onClick }: { type: VehicleType, active: boolean, onClick: () => void }) {
  const Icon = type === 'Bike' ? Bike : type === 'Truck' ? Truck : Car;
  return (
    <button 
      onClick={onClick}
      className={`p-8 rounded-[2.5rem] border-2 flex flex-col items-center gap-4 transition-all group ${
        active 
          ? "border-brand-primary bg-brand-primary/10 text-brand-primary shadow-[inset_0_0_30px_rgba(132,204,22,0.1)] scale-[1.02]" 
          : "border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600 hover:border-slate-300 dark:hover:border-white/20 hover:text-slate-900 dark:hover:text-white"
      }`}
    >
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${active ? "bg-brand-primary/20 scale-110" : "bg-white dark:bg-white/5 opacity-40 group-hover:opacity-100 shadow-sm dark:shadow-none"}`}>
        <Icon size={32} />
      </div>
      <span className="text-[10px] font-bold uppercase tracking-[0.3em]">{type}</span>
    </button>
  );
}

function ActiveSessionCard({ ticket, onCancel, onComplete, onSignalArrival }: { 
  ticket: ParkingTicket, 
  onCancel: (t: ParkingTicket) => void, 
  onComplete: (t: ParkingTicket) => void,
  onSignalArrival: (t: ParkingTicket) => void
}) {
  const [now, setNow] = useState(Date.now());
  const [processing, setProcessing] = useState(false);
  const navigate = useNavigate();

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    await onCancel(ticket);
    setProcessing(false);
  };

  const handleComplete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    await onComplete(ticket);
    setProcessing(false);
  };

  const handleArrival = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessing(true);
    await onSignalArrival(ticket);
    setProcessing(false);
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const start = (ticket.startTime as any)?.toMillis ? (ticket.startTime as any).toMillis() : new Date(ticket.startTime).getTime();
  const elapsedMs = now - start;
  const elapsedSecs = Math.floor(elapsedMs / 1000);
  const elapsedMins = Math.floor(elapsedSecs / 60);
  const elapsedHrs = Math.floor(elapsedMins / 60);

  const durationHrs = ticket.duration || 1;
  const durationMs = durationHrs * 60 * 60 * 1000;
  const remainingMs = Math.max(0, durationMs - elapsedMs);
  
  const h = Math.floor(elapsedHrs);
  const m = Math.floor(elapsedMins % 60);
  const s = Math.floor(elapsedSecs % 60);

  const isOvertime = elapsedMs > durationMs;
  const overtimeMs = isOvertime ? elapsedMs - durationMs : 0;
  const overtimeHrs = Math.ceil(overtimeMs / (1000 * 60 * 60));
  const extraCharge = overtimeHrs * 20;

  const isReserved = ticket.status === 'reserved';

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => navigate('/history')}
      className={`p-6 rounded-[2.5rem] border transition-all shadow-xl dark:shadow-2xl cursor-pointer group relative overflow-hidden ${
        isOvertime 
        ? "bg-red-50 border-red-200 shadow-red-500/5 text-black" 
        : isReserved
        ? "bg-brand-primary border-brand-accent shadow-brand-primary/20 text-black"
        : "bg-brand-primary border-brand-accent shadow-brand-primary/20 text-black"
      }`}
    >
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg ${isOvertime ? 'bg-red-600 text-white' : isReserved ? 'bg-black text-white' : 'bg-black/10 text-black'}`}>
            {isReserved ? <Clock size={30} /> : <Activity size={30} />}
          </div>
          <div>
            <p className={`text-[10px] font-black uppercase tracking-[0.3em] ${isOvertime ? 'text-red-700' : 'text-black'}`}>
              {isOvertime ? 'OVERTIME ACTIVE' : isReserved ? 'SLOT RESERVED' : 'TRANSMISSION LIVE'}
            </p>
            <h3 className="text-2xl font-display font-black uppercase transition-colors text-black">Slot {ticket.slotNumber}</h3>
          </div>
        </div>
        <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm ${isOvertime ? 'bg-black text-white' : isReserved ? 'bg-black text-white' : 'bg-black text-white'}`}>
           {ticket.vehicleNumber}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`p-4 rounded-[1.5rem] border shadow-sm ${isReserved ? 'bg-white border-black/10' : isOvertime ? 'bg-white border-red-100' : 'bg-black/5 border-black/10'}`}>
           <p className={`text-[9px] font-black uppercase tracking-widest mb-1 text-black`}>
             {isReserved ? (ticket.bookingType === 'Pre-booking' ? 'Arrival ETA' : 'Reserved At') : 'Time Elapsed'}
           </p>
           {isReserved ? (
             <p className={`text-xl font-mono font-black transition-colors text-black`}>
               {ticket.arrivalTime || new Date(ticket.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
             </p>
           ) : (
             <p className={`text-xl font-mono font-black transition-colors text-black`}>
               {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
             </p>
           )}
        </div>
        <div className={`p-4 rounded-[1.5rem] border shadow-sm ${
          isOvertime 
          ? "bg-red-50 border-red-100 text-black" 
          : isReserved
          ? "bg-white border-black/10 text-black"
          : "bg-black/5 border-black/10 text-black"
        }`}>
           <p className={`text-[9px] font-black uppercase tracking-widest mb-1 text-black`}>
             {isOvertime ? 'Total Fee' : 'Grid Fee'}
           </p>
           <p className={`text-xl font-display font-black transition-colors text-black`}>
             ₹{(ticket.totalAmount || 0) + extraCharge}
           </p>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
         {isReserved ? (
            <div className="flex gap-2 w-full">
              <button 
                onClick={handleCancel}
                disabled={processing}
                className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center justify-center gap-2 ${
                  isOvertime 
                    ? "bg-black text-white" 
                    : "bg-white text-black border border-slate-200"
                }`}
              >
                {processing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                {isOvertime ? 'END SESSION' : 'CANCEL'}
              </button>
              {(ticket as any).userArrived ? (
                <div className="flex-[2] bg-white text-emerald-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-white/20 shadow-lg">
                  <CheckCircle2 size={12} />
                  Arrived
                </div>
              ) : (
                <button 
                  onClick={handleArrival}
                  disabled={processing}
                  className="flex-[2] bg-white text-black py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg hover:bg-brand-primary"
                >
                  {processing ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                  I Have Arrived
                </button>
              )}
            </div>
         ) : (
           <button 
             onClick={handleComplete}
             disabled={processing}
             className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${
               isOvertime 
                 ? "bg-black text-white shadow-lg" 
                 : "bg-white text-black shadow-lg hover:bg-brand-primary"
             }`}
           >
             {processing ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
             Complete Session
           </button>
         )}
         <button className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
           isReserved 
             ? (isOvertime ? 'bg-black text-white' : 'bg-white text-black') 
             : isOvertime 
               ? 'bg-white text-red-600 border border-red-200' 
               : 'bg-black text-white shadow-lg'
         }`}>
            Mission Specs
         </button>
      </div>


      {isOvertime && (
        <div className="mt-4 flex items-center gap-2 text-red-500">
           <AlertCircle size={14} className="animate-pulse" />
           <p className="text-[9px] font-black uppercase tracking-widest">Standard rate ₹20/hr applied to overflow</p>
        </div>
      )}
    </motion.div>
  );
}

function InputGroup({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="w-6 h-6 rounded-lg bg-brand-primary/10 flex items-center justify-center">
            {icon}
        </div>
        <span className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-[0.25em] leading-none">{label}</span>
      </div>
      {children}
    </div>
  );
}
