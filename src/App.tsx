/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Locations from './pages/Locations';
import Slots from './pages/Slots';
import Admin from './pages/Admin';
import SettingsPage from './pages/Settings';
import History from './pages/History';
import Vehicles from './pages/Vehicles';
import Support from './pages/Support';
import Landing from './pages/Landing';
import Auth from './pages/Auth';
import { Activity, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { Vehicle, ParkingTicket, Location, Slot } from './types';
import { MOCK_LOCATIONS, generateSlots } from './data/mockData';
import { db, OperationType, handleFirestoreError } from './lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, getDocs, setDoc, doc } from 'firebase/firestore';

function ProtectedRoute({ children, role, maintenanceMode }: { children: React.ReactNode, role?: 'user' | 'admin', maintenanceMode?: boolean }) {
  const { user, role: userRole, isBlocked, loading } = useAuth();
  
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-background-deep transition-colors">
      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 border-4 border-brand-primary border-t-transparent rounded-full animate-spin shadow-[0_0_30px_rgba(132,204,22,0.2)]" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em] animate-pulse">Synchronizing Neural Grid</p>
          <p className="text-[9px] text-brand-primary font-bold uppercase tracking-widest opacity-50">v4.2.0-SECURE</p>
        </div>
      </div>
    </div>
  );
  
  if (!user) return <Navigate to="/landing" replace />;

  if (isBlocked && userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-950 text-white p-8 text-center ring-inset ring-8 ring-red-500/20">
        <div className="max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-red-500/10 rounded-[2.5rem] flex items-center justify-center text-red-500 mx-auto border border-red-500/20 shadow-2xl shadow-red-500/10">
            <Activity size={48} className="animate-pulse" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-display font-black tracking-tighter">ACCESS_REVOKED</h1>
            <p className="text-red-200/60 font-medium leading-relaxed">
              Your digital signature has been flagged for administrative review. Grid access is temporarily suspended.
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-red-400">Protocol Status</p>
            <p className="text-xl font-display font-bold">TERMINATED</p>
          </div>
          <button 
            onClick={() => window.location.href = '/support'} 
            className="px-8 py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Appeal Restriction
          </button>
        </div>
      </div>
    );
  }
  
  if (maintenanceMode && userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-8 text-center">
        <div className="max-w-md space-y-8 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 bg-brand-primary/10 rounded-[2.5rem] flex items-center justify-center text-brand-primary mx-auto border border-brand-primary/20 shadow-2xl shadow-brand-primary/10">
            <Activity size={48} className="animate-pulse" />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-display font-black tracking-tighter">GRID_OFFLINE</h1>
            <p className="text-slate-400 font-medium leading-relaxed">
              The neural parking grid is currently undergoing recalibration. All transmission protocols are suspended.
            </p>
          </div>
          <div className="p-6 bg-white/5 rounded-3xl border border-white/10 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-brand-primary">Expected Restoration</p>
            <p className="text-xl font-display font-bold">~ 45 Minutes</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Allow admins to access everything. Users can only access user routes.
  if (role === 'admin' && userRole !== 'admin') return <Navigate to="/" replace />;
  
  return <>{children}</>;
}

export default function App() {
  const [activeLocation, setActiveLocation] = useState<Location>(MOCK_LOCATIONS[0]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [tickets, setTickets] = useState<ParkingTicket[]>([]);

  const { user, role } = useAuth();
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // Maintenance mode listener
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (snapshot) => {
      if (snapshot.exists()) {
        setMaintenanceMode(snapshot.data().maintenanceMode || false);
      }
    }, (error) => {
      console.error("Maintenance mode sync error:", error);
    });
    return unsubscribe;
  }, [user]);

  // Seed slots if empty specifically for active location
  useEffect(() => {
    async function seedSlots() {
      // Seed if no slots exist for active location. 
      // For demo purposes, we allow any logged in user to trigger initial seed if grid is empty.
      if (!user || isSeeding) return; 
      setIsSeeding(true);
      try {
        // Fetch a small batch of slots to check existence
        const snapshot = await getDocs(collection(db, 'slots'));
        const hasSlotsForThisLocation = snapshot.docs.some(d => d.data().locationId === activeLocation.id);
        
    if (!hasSlotsForThisLocation) {
          console.log(`Seeding slots for location ${activeLocation.id}...`);
          const floors = [1, 2];
          for (const floor of floors) {
            const mockSlots = generateSlots(floor);
            for (const slot of mockSlots) {
              const sid = `${activeLocation.id}-${slot.id}`;
              try {
                await setDoc(doc(db, 'slots', sid), {
                  locationId: activeLocation.id,
                  floor: slot.floor,
                  number: slot.number,
                  type: slot.type,
                  status: slot.status
                });
              } catch (writeErr) {
                console.error("Failed to seed slot:", sid, writeErr);
              }
            }
          }
          console.log(`Seeding complete for location ${activeLocation.id}.`);
        } else {
          // Check if Floor 2 specifically is missing
          const floor2Snapshot = await getDocs(query(collection(db, 'slots'), where('locationId', '==', activeLocation.id), where('floor', '==', 2)));
          if (floor2Snapshot.empty) {
            console.log(`Floor 2 missing for ${activeLocation.id}. Seeding Floor 2...`);
            const mockSlots = generateSlots(2);
            for (const slot of mockSlots) {
              const sid = `${activeLocation.id}-${slot.id}`;
              await setDoc(doc(db, 'slots', sid), {
                locationId: activeLocation.id,
                floor: 2,
                number: slot.number,
                type: slot.type,
                status: slot.status
              });
            }
          }
        }
      } catch (error) {
        console.error("Error seeding slots:", error);
      } finally {
        setIsSeeding(false);
      }
    }
    seedSlots();
  }, [activeLocation, user, role]);

  useEffect(() => {
    if (!user) {
      setVehicles([]);
      setTickets([]);
      return;
    }

    // Listens to slots
    console.log("Setting up slots listener...");
    const slotsQuery = query(collection(db, 'slots'));
    const unsubscribeSlots = onSnapshot(slotsQuery, (snapshot) => {
      const s = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Slot[];
      console.log(`Fetched ${s.length} total slots from Firestore`);
      setSlots(s);
    }, (error) => {
      console.error("Slots subscription error:", error);
      handleFirestoreError(error, OperationType.LIST, 'slots');
    });

    // Listens to vehicles
    const vehiclesQuery = query(collection(db, 'vehicles'), where('userId', '==', user.uid));
    const unsubscribeVehicles = onSnapshot(vehiclesQuery, (snapshot) => {
      const vels = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Vehicle[];
      setVehicles(vels);
    }, (error) => {
      console.error("Vehicles subscription error:", error);
      handleFirestoreError(error, OperationType.LIST, 'vehicles');
    });

    // Listens to bookings/tickets
    const bookingsQuery = query(
      collection(db, 'bookings'), 
      where('userId', '==', user.uid)
    );
    const unsubscribeBookings = onSnapshot(bookingsQuery, (snapshot) => {
      const tix = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          startTime: data.startTime?.toDate?.()?.getTime() || Date.now(),
          endTime: data.endTime?.toDate?.()?.getTime() || null
        };
      }) as ParkingTicket[];
      
      // Sort client-side to avoid index requirement for now
      tix.sort((a, b) => b.startTime - a.startTime);
      
      setTickets(tix);
    }, (error) => {
      console.error("Bookings subscription error:", error);
      handleFirestoreError(error, OperationType.LIST, 'bookings');
    });

    return () => {
      unsubscribeSlots();
      unsubscribeVehicles();
      unsubscribeBookings();
    };
  }, [user]);

  const addVehicle = (vehicle: Vehicle) => {
    // Handled by Firestore listener
  };

  const allocateSlot = (vehicle: Vehicle, slotId: string) => {
    // Handled by Firestore listener
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/landing" element={<Landing />} />
        <Route path="/auth/:role" element={<Auth />} />
        
        <Route path="/" element={
          <ProtectedRoute role="user" maintenanceMode={maintenanceMode}>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Home activeLocation={activeLocation} savedVehicles={vehicles} slots={slots} tickets={tickets} onAllocate={allocateSlot} />} />
          <Route path="locations" element={<Locations activeLocation={activeLocation} onSelect={setActiveLocation} />} />
          <Route path="slots" element={<Slots activeLocation={activeLocation} slots={slots} />} />
          <Route path="history" element={<History tickets={tickets} vehicles={vehicles} />} />
          <Route path="settings" element={<SettingsPage savedVehicles={vehicles} />} />
          <Route path="vehicles" element={<Vehicles vehicles={vehicles} />} />
          <Route path="support" element={<Support />} />
        </Route>

        <Route path="/admin" element={
          <ProtectedRoute role="admin">
            <div className="min-h-screen bg-background-deep flex text-slate-100 transition-colors duration-300">
              <div className="flex-1 overflow-y-auto">
                <Admin />
              </div>
            </div>
          </ProtectedRoute>
        } />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

