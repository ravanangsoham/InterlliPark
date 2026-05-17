import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, Users, Clock, Zap, Activity, 
  DollarSign, Car, ShieldCheck, AlertCircle, 
  Play, Pause, RefreshCw, MoreVertical,
  CheckCircle2, XCircle, Search, Trash2,
  Bike, Truck, QrCode, ScanLine, X,
  MessageSquare, Send, LogOut, User, Power, Ban,
  Calendar, Lock, Unlock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, Tooltip, 
  CartesianGrid, BarChart, Bar 
} from 'recharts';
import { generateSlots, MOCK_LOCATIONS } from '../data/mockData';
import { Slot, VehicleType, SlotStatus } from '../types';
import { db, OperationType, handleFirestoreError, auth } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, where, getDocs, doc, updateDoc, setDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const PIE_DATA = [
  { name: 'Available', value: 25, color: '#10b981' }, // Emerald 500
  { name: 'Occupied', value: 12, color: '#ef4444' }, // Red 500
  { name: 'Blocked', value: 3, color: '#64748b' },  // Slate 500
];

const MOCK_VEHICLES = [
  { id: '1', number: 'KA-01-MJ-1234', owner: 'John Doe', phone: '9876543210', slot: '08', status: 'paid', type: 'Car' },
  { id: '2', number: 'KA-05-NB-5678', owner: 'Alice Smith', phone: '9876543211', slot: '12', status: 'pending', type: 'Bike' },
  { id: '3', number: 'KA-03-XY-9012', owner: 'Bob Wilson', phone: '9876543212', slot: '04', status: 'paid', type: 'Truck' },
  { id: '4', number: 'KA-09-PR-4455', owner: 'Sarah Jane', phone: '9876543213', slot: '15', status: 'pending', type: '4-Wheeler' },
];

export default function Admin() {
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const [feedActive, setFeedActive] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [showOfflineBooking, setShowOfflineBooking] = useState<Slot | null>(null);
  const [offlineForm, setOfflineForm] = useState({
    vehicleNumber: '',
    ownerName: '',
    phone: '',
    vehicleType: '4-Wheeler' as VehicleType,
    isFree: false
  });
  const [isBooking, setIsBooking] = useState(false);
  const [scannedVehicle, setScannedVehicle] = useState<any>(null);
  
  // Chat state
  const [chats, setChats] = useState<any[]>([]);
  const [selectedChatUser, setSelectedChatUser] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  // Location state
  const [activeLocationId, setActiveLocationId] = useState('1');
  const [activeFloor, setActiveFloor] = useState(1);
  const [activeTab, setActiveTab] = useState<'overview' | 'slots' | 'users' | 'revenue' | 'feeds' | 'inquiries' | 'sensors'>('overview');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [adminNotification, setAdminNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);
  
  // Advanced Block UI State
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockTargetStatus, setBlockTargetStatus] = useState<SlotStatus>('blocked');
  const [blockOptions, setBlockOptions] = useState({
    type: 'maintenance' as any,
    comment: '',
    duration: 'permanent'
  });

  const [realBookings, setRealBookings] = useState<any[]>([]);
  const [adminSlots, setAdminSlots] = useState<Slot[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Cleanup effect for expired blocks
  useEffect(() => {
    if (!user || role !== 'admin' || adminSlots.length === 0) return;

    const cleanupExpiredBlocks = async () => {
      const now = Date.now();
      const expiredSlots = adminSlots.filter(s => 
        (s.status === 'blocked' || s.status === 'maintenance' || s.status === 'out_of_service') && 
        s.blockMetadata?.blockedUntil != null && 
        s.blockMetadata.blockedUntil < now
      );


      if (expiredSlots.length === 0) return;

      console.log(`Reverting ${expiredSlots.length} expired blocks...`);
      const batch = writeBatch(db);
      expiredSlots.forEach(s => {
        batch.update(doc(db, 'slots', s.id), {
          status: 'available',
          blockMetadata: null,
          updatedAt: serverTimestamp()
        });
      });

      try {
        await batch.commit();
        setAdminNotification({ 
          message: `Auto-Protocol Complete: ${expiredSlots.length} maintenance windows expired`, 
          type: 'success' 
        });
      } catch (error) {
        console.error("Auto-cleanup failed:", error);
      }
    };

    const interval = setInterval(cleanupExpiredBlocks, 60000); // Check every minute
    cleanupExpiredBlocks(); // Initial check
    
    return () => clearInterval(interval);
  }, [user, role, adminSlots]);

  useEffect(() => {
    // We'll use firestore slots instead of generateSlots
  }, []);

  // Fetch maintenance mode
  useEffect(() => {
    if (!user || role !== 'admin') return;
    const unsubscribe = onSnapshot(doc(db, 'settings', 'system'), (snapshot) => {
      if (snapshot.exists()) {
        setMaintenanceMode(snapshot.data().maintenanceMode || false);
      }
    }, (error) => {
      console.error("System settings error:", error);
    });
    return unsubscribe;
  }, [user, role]);

  // Fetch real bookings
  useEffect(() => {
    if (!user || role !== 'admin') return;
    const q = query(collection(db, 'bookings'), orderBy('startTime', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setRealBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Admin bookings error:", error);
    });
    return unsubscribe;
  }, [user, role]);

  // Fetch real slots
  useEffect(() => {
    if (!user || role !== 'admin') return;
    const q = query(collection(db, 'slots'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAdminSlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Admin slots error:", error);
    });
    return unsubscribe;
  }, [user, role]);

  // Fetch users
  useEffect(() => {
    if (!user || role !== 'admin' || activeTab !== 'users') return;
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Registry sync error:", error);
      handleFirestoreError(error, OperationType.GET, 'users');
    });
    return unsubscribe;
  }, [user, role, activeTab]);

  const handleAdminCheckIn = async (booking: any) => {
    try {
      const { runTransaction } = await import('firebase/firestore');
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', booking.id);
        const slotRef = booking.slotId ? doc(db, 'slots', booking.slotId) : null;
        
        transaction.update(bookingRef, {
          status: 'active',
          startTime: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        if (slotRef) {
          transaction.set(slotRef, {
            status: 'occupied',
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      setAdminNotification({ 
        message: `Check-in Success: ${booking.vehicleNumber} is now parked.`, 
        type: 'success' 
      });
    } catch (error: any) {
      console.error("Check-in failed:", error);
      setAdminNotification({ 
        message: `Admin override failed: ${error.message || 'Permission denied'}`, 
        type: 'error' 
      });
    }
  };

  const handleAdminCheckOut = async (booking: any) => {
    try {
      const { runTransaction } = await import('firebase/firestore');
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', booking.id);
        const slotRef = booking.slotId ? doc(db, 'slots', booking.slotId) : null;

        const now = new Date().getTime();
        const start = booking.startTime?.toMillis ? booking.startTime.toMillis() : new Date(booking.startTime).getTime();
        const diffMs = now - start;
        const hours = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60)));
        const finalAmount = booking.isFree ? 0 : hours * 20;

        transaction.update(bookingRef, {
          status: 'completed',
          endTime: serverTimestamp(),
          totalAmount: finalAmount,
          updatedAt: serverTimestamp()
        });

        if (slotRef) {
          transaction.set(slotRef, {
            status: 'available',
            currentBookingId: null,
            currentVehicleType: null,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      setAdminNotification({ 
        message: `Complete Session Success: ${booking.vehicleNumber}. Billing updated.`, 
        type: 'success' 
      });
    } catch (error: any) {
      console.error("Check-out failed:", error);
      setAdminNotification({ 
        message: `De-authorization failed: ${error.message || 'Permission denied'}`, 
        type: 'error' 
      });
    }
  };

  const handleAdminCancel = async (booking: any) => {
    try {
      const { runTransaction } = await import('firebase/firestore');
      await runTransaction(db, async (transaction) => {
        const bookingRef = doc(db, 'bookings', booking.id);
        const slotRef = booking.slotId ? doc(db, 'slots', booking.slotId) : null;

        transaction.update(bookingRef, {
          status: 'cancelled',
          updatedAt: serverTimestamp()
        });

        if (slotRef) {
          transaction.set(slotRef, {
            status: 'available',
            currentBookingId: null,
            currentVehicleType: null,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      });

      setAdminNotification({ 
        message: `Cancelled: ${booking.vehicleNumber}'s reservation removed.`, 
        type: 'success' 
      });
    } catch (error: any) {
      console.error("Cancellation failed:", error);
      setAdminNotification({ 
        message: `Cancellation failed: ${error.message || 'Permission denied'}`, 
        type: 'error' 
      });
    }
  };

  // Fetch unique users who have messaged
  useEffect(() => {
    if (!user || role !== 'admin') return;
    const q = query(collection(db, 'support_messages'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort client-side
      msgs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
        return tB - tA; // Descending for groups
      });

      // Group by userId
      const userGroups = msgs.reduce((acc: any, msg: any) => {
        if (!acc[msg.userId]) {
          acc[msg.userId] = {
            userId: msg.userId,
            userEmail: msg.userEmail,
            lastMessage: msg.text,
            timestamp: msg.timestamp,
            count: 0
          };
        }
        acc[msg.userId].count++;
        return acc;
      }, {});
      setChats(Object.values(userGroups));
    }, (error) => {
      console.error("Communications hub error:", error);
      handleFirestoreError(error, OperationType.GET, 'support_messages');
    });
    return unsubscribe;
  }, [user, role]);

  // Fetch messages for selected user
  useEffect(() => {
    if (!selectedChatUser || role !== 'admin') {
      setChatMessages([]);
      return;
    }
    const q = query(
      collection(db, 'support_messages'),
      where('userId', '==', selectedChatUser)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort client-side
      msgs.sort((a: any, b: any) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp instanceof Date ? a.timestamp.getTime() : 0);
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp instanceof Date ? b.timestamp.getTime() : 0);
        return tA - tB; // Ascending for chat history
      });
      setChatMessages(msgs);
    }, (error) => {
      console.error("Transmission stream error:", error);
      handleFirestoreError(error, OperationType.GET, `support_messages/${selectedChatUser}`);
    });
    return unsubscribe;
  }, [selectedChatUser, role]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChatUser) return;
    
    try {
      await addDoc(collection(db, 'support_messages'), {
        userId: selectedChatUser,
        userEmail: chats.find(c => c.userId === selectedChatUser)?.userEmail || 'User',
        text: newMessage,
        timestamp: serverTimestamp(),
        isAdmin: true,
        adminEmail: user?.email
      });
      setNewMessage('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'support_messages');
    }
  };

  const handleToggleSlot = async (slot: Slot) => {
    if (isBulkMode) {
      const newSelection = new Set(selectedSlotIds);
      if (newSelection.has(slot.id)) {
        newSelection.delete(slot.id);
      } else {
        newSelection.add(slot.id);
      }
      setSelectedSlotIds(newSelection);
      return;
    }

    const isCurrentlyBlocked = ['blocked', 'maintenance', 'out_of_service'].includes(slot.status);
    
    if (!isCurrentlyBlocked && slot.status !== 'available') {
      // Don't toggle occupied or reserved slots via direct click if not blocked
      return;
    }

    if (slot.status === 'available') {
      setShowOfflineBooking(slot);
      return;
    }

    try {
      const newStatus = isCurrentlyBlocked ? 'available' : 'blocked';
      await setDoc(doc(db, 'slots', slot.id), {
        status: newStatus,
        blockMetadata: isCurrentlyBlocked ? null : {
          type: 'permanent',
          comment: 'Direct Administrative Block',
          blockedAt: Date.now(),
          blockedUntil: null,
          duration: 'permanent'
        },
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `slots/${slot.id}`);
    }
  };

  const handleOfflineBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showOfflineBooking || !offlineForm.vehicleNumber) return;

    setIsBooking(true);
    try {
      // 1. Create the booking document
      const now = new Date();
      const bookingData = {
        vehicleNumber: offlineForm.vehicleNumber.toUpperCase(),
        ownerName: offlineForm.ownerName || 'Offline Customer',
        phone: offlineForm.phone || 'N/A',
        vehicleType: offlineForm.vehicleType,
        slotId: showOfflineBooking.id,
        slotNumber: showOfflineBooking.number,
        locationId: activeLocationId,
        paymentStatus: 'paid',
        paymentMode: 'cash',
        status: 'active',
        startTime: serverTimestamp(),
        totalAmount: offlineForm.isFree ? 0 : 20, // Initial 1 hour charge: ₹20
        userId: 'offline_admin_entry', // Mark as admin entry
        isFree: offlineForm.isFree,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'bookings'), bookingData);

      // 2. Update the slot status
      await setDoc(doc(db, 'slots', showOfflineBooking.id), {
        status: 'occupied',
        currentBookingId: docRef.id,
        currentVehicleType: offlineForm.vehicleType,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // For the modal display, use local time since serverTimestamp is not available yet
      setConfirmedBooking({ 
        id: docRef.id, 
        ...bookingData, 
        startTime: { toMillis: () => now.getTime() } 
      });
      
      setAdminNotification({ 
        message: `Manual Entry Registered: ${offlineForm.vehicleNumber} in Slot ${showOfflineBooking.number}${offlineForm.isFree ? ' (FREE)' : ''}`, 
        type: 'success' 
      });
      setShowOfflineBooking(null);
      setOfflineForm({ vehicleNumber: '', ownerName: '', phone: '', vehicleType: '4-Wheeler', isFree: false });
    } catch (error) {
      console.error("Manual booking failure:", error);
      setAdminNotification({ message: "Grid sync failure: Manual entry rejected", type: 'error' });
    } finally {
      setIsBooking(false);
    }
  };

  const handleBulkUpdate = async (newStatus: SlotStatus, options?: any) => {
    if (selectedSlotIds.size === 0) return;
    
    // Check for active sessions if blocking
    if (['blocked', 'maintenance', 'out_of_service'].includes(newStatus)) {
      const busySlots = adminSlots.filter(s => selectedSlotIds.has(s.id) && (s.status === 'occupied' || s.status === 'reserved'));
      // Note: Removed window.confirm for streamlined admin operations in restricted environments
    }
    
    try {
      const batch = writeBatch(db);
      
      // Cancellation logic
      if (options?.type === 'cancellation') {
        const activeBookingsToCancel = realBookings.filter(b => 
          selectedSlotIds.has(b.slotId) && 
          (b.status === 'active' || b.status === 'reserved')
        );
        
        activeBookingsToCancel.forEach(b => {
          batch.update(doc(db, 'bookings', b.id), {
            status: 'cancelled',
            cancelledAt: serverTimestamp(),
            cancellationReason: options.comment || 'Administrative Slot Lockdown'
          });
        });
      }

      selectedSlotIds.forEach(id => {
        const updateData: any = {
          status: newStatus,
          updatedAt: serverTimestamp()
        };
        
        if (options) {
          let blockedUntil = null;
          if (options.duration !== 'permanent') {
            let ms = 0;
            if (options.duration === 'custom' && options.customHours) {
              ms = parseFloat(options.customHours) * 3600000;
            } else {
              ms = options.duration === '1h' ? 3600000 : 
                   options.duration === '4h' ? 14400000 : 
                   options.duration === 'day' ? 86400000 : 0;
            }
            if (ms > 0) blockedUntil = Date.now() + ms;
          }

          updateData.blockMetadata = {
            type: options.type,
            comment: options.comment,
            blockedAt: Date.now(),
            blockedUntil,
            duration: options.duration
          };
        } else {
          // If making available, clear metadata
          if (newStatus === 'available') {
            updateData.blockMetadata = null;
          }
        }
        
        batch.set(doc(db, 'slots', id), updateData, { merge: true });
      });
      
      const updatedCount = selectedSlotIds.size;
      await batch.commit();
      setSelectedSlotIds(new Set());
      setShowBlockModal(false);
      setAdminNotification({ 
        message: `Status Grid Updated: ${updatedCount} nodes reassigned to ${newStatus}`, 
        type: 'success' 
      });
    } catch (error) {
      console.error("Bulk update failed:", error);
      setAdminNotification({ message: "Grid integrity failure: status update rejected", type: 'error' });
    }
  };

  const handleQuickBlock = async (slotId: string) => {
    try {
      await setDoc(doc(db, 'slots', slotId), {
        status: 'blocked',
        updatedAt: serverTimestamp(),
        blockMetadata: {
          type: 'permanent',
          comment: 'Direct Administrative Block (Quick Action)',
          blockedAt: Date.now(),
          blockedUntil: null,
          duration: 'permanent'
        }
      }, { merge: true });
      setAdminNotification({ message: "Node secured: Administrative lockdown active", type: 'success' });
    } catch (error) {
      console.error("Quick block failed:", error);
      setAdminNotification({ message: "Lockdown protocol failed", type: 'error' });
    }
  };

  const handleStatusRevert = async (slot: any) => {
    try {
      await setDoc(doc(db, 'slots', slot.id), {
        status: 'available',
        blockMetadata: null,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setAdminNotification({ message: `Node ${slot.number} restored to global availability index`, type: 'success' });
    } catch (error) {
      console.error("Revert failed:", error);
      setAdminNotification({ message: "Control protocol error: restoration rejected", type: 'error' });
    }
  };

  const handleSelectAllOnFloor = () => {
    const floorSlotIds = filteredSlots.map(s => s.id);
    const allSelected = floorSlotIds.every(id => selectedSlotIds.has(id));
    
    const newSelection = new Set(selectedSlotIds);
    if (allSelected) {
      floorSlotIds.forEach(id => newSelection.delete(id));
    } else {
      floorSlotIds.forEach(id => newSelection.add(id));
    }
    setSelectedSlotIds(newSelection);
  };

  const simulateScan = () => {
    setIsScanning(true);
    setScannedVehicle(null);
    
    setTimeout(() => {
      const randomVehicle = MOCK_VEHICLES[Math.floor(Math.random() * MOCK_VEHICLES.length)];
      setScannedVehicle(randomVehicle);
      setIsScanning(false);
    }, 1500);
  };

  useEffect(() => {
    if (adminNotification) {
      const timer = setTimeout(() => setAdminNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [adminNotification]);

  const handleUpdateUserRole = async (targetUser: any) => {
    if (updatingUserId) return;
    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    
    setUpdatingUserId(targetUser.id);
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        role: newRole,
        updatedAt: serverTimestamp()
      });
      setAdminNotification({ message: `Node ${targetUser.email} recalibrated to ${newRole}`, type: 'success' });
    } catch (error) {
      console.error("Role update failed:", error);
      setAdminNotification({ message: "Protocol failure: Permission denied or network interrupt", type: 'error' });
      // Don't throw here to avoid crashing the UI, just show notification
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleToggleUserBlock = async (targetUser: any) => {
    if (updatingUserId) return;
    const newBlockState = !targetUser.isBlocked;
    
    setUpdatingUserId(targetUser.id);
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        isBlocked: newBlockState,
        updatedAt: serverTimestamp()
      });
      setAdminNotification({ 
        message: `Node ${targetUser.email} ${newBlockState ? 'DEACTIVATED' : 'REACTIVATED'}`, 
        type: 'success' 
      });
    } catch (error) {
      console.error("Block toggle failed:", error);
      setAdminNotification({ message: "Protocol failure: Block operation rejected", type: 'error' });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleDeleteUser = async (targetUser: any) => {
    if (updatingUserId) return;
    
    setUpdatingUserId(targetUser.id);
    try {
      await deleteDoc(doc(db, 'users', targetUser.id));
      setAdminNotification({ message: `Node ${targetUser.email} purged from registry`, type: 'success' });
    } catch (error) {
      console.error("User deletion failed:", error);
      setAdminNotification({ message: "Purge failed: Access denied or data link lost", type: 'error' });
    } finally {
      setUpdatingUserId(null);
    }
  };

  const totalRevenue = realBookings.filter(b => b.paymentStatus === 'paid').reduce((acc, b) => acc + (b.totalAmount || 0), 0);
  const locationRevenue = realBookings
    .filter(b => b.paymentStatus === 'paid' && (b.locationId === activeLocationId || !b.locationId)) // Fallback for old records
    .reduce((acc, b) => acc + (b.totalAmount || 0), 0);

  // Analytics Data Processing
  const vehicleStats = realBookings.reduce((acc: any, b) => {
    const type = b.vehicleType === '4-Wheeler' ? 'Car' : (b.vehicleType || 'Other');
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});

  const PIE_VEHICLE_DATA = Object.entries(vehicleStats).map(([name, value]) => ({
    name,
    value,
    color: name === 'Car' ? '#84CC16' : '#6366F1'
  }));

  const BAR_VEHICLE_DATA = Object.entries(vehicleStats).map(([name, value]) => ({
    name,
    bookings: value
  }));

  // Hourly Activity Data (Last 24 hours simulation based on realBookings)
  const activityData = realBookings.reduce((acc: any, b) => {
    if (!b.startTime) return acc;
    const date = b.startTime.toMillis ? new Date(b.startTime.toMillis()) : new Date(b.startTime);
    const hour = date.getHours();
    acc[hour] = (acc[hour] || 0) + 1;
    return acc;
  }, {});

  const hourlyByType = realBookings.reduce((acc: any, b) => {
    if (!b.startTime) return acc;
    const date = b.startTime.toMillis ? new Date(b.startTime.toMillis()) : new Date(b.startTime);
    const hour = date.getHours();
    const type = b.vehicleType === '4-Wheeler' ? 'Car' : (b.vehicleType || 'Other');
    if (!acc[hour]) acc[hour] = {};
    acc[hour][type] = (acc[hour][type] || 0) + 1;
    return acc;
  }, {});

  const HOURLY_ACTIVITY = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    activity: activityData[i] || 0,
    Car: hourlyByType[i]?.['Car'] || 0,
    Bike: hourlyByType[i]?.['Bike'] || 0
  }));

  const peakHourData = Object.entries(activityData).reduce((a: any, b: any) => b[1] > a[1] ? b : a, ['0', 0]);
  const peakHourStr = `${peakHourData[0]}:00`;

  const REVENUE_BY_TYPE_DATA = Object.entries(realBookings.reduce((acc: any, b) => {
    if (b.paymentStatus !== 'paid') return acc;
    const type = b.vehicleType === '4-Wheeler' ? 'Car' : (b.vehicleType || 'Other');
    acc[type] = (acc[type] || 0) + (b.totalAmount || 0);
    return acc;
  }, {})).map(([name, revenue]) => ({
    name,
    revenue
  }));

  const filteredRealBookings = realBookings.filter(b => {
    const searchLower = searchTerm.toLowerCase();
    return (
      b.vehicleNumber?.toLowerCase().includes(searchLower) ||
      b.ownerName?.toLowerCase().includes(searchLower) ||
      b.slotNumber?.toString().includes(searchLower)
    );
  });

  const filteredSlots = adminSlots.filter(s => s.locationId === activeLocationId && s.floor === activeFloor);

  const handleReSeed = async () => {
    try {
      const locId = '1'; 
      for (const floor of [1, 2]) {
        const mockSlots = generateSlots(floor);
        for (const slot of mockSlots) {
          const sid = `${locId}-${slot.id}`;
          await setDoc(doc(db, 'slots', sid), {
            locationId: locId,
            floor: slot.floor,
            number: slot.number,
            type: slot.type,
            status: slot.status
          });
        }
      }
      alert("System Re-indexed successfully.");
    } catch (e) {
      console.error(e);
      alert("Failed to re-index: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleToggleMaintenance = async () => {
    try {
      const newStatus = !maintenanceMode;
      await setDoc(doc(db, 'settings', 'system'), {
        maintenanceMode: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: user?.email
      }, { merge: true });
      setAdminNotification({ 
        message: `System ${newStatus ? 'OFFLINE' : 'ONLINE'}: Maintenance Mode ${newStatus ? 'Engaged' : 'Disengaged'}`, 
        type: 'success' 
      });
    } catch (error) {
      console.error("Maintenance toggle failed:", error);
      setAdminNotification({ message: "Protocol error: System sync failed", type: 'error' });
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/landing');
    } catch (error) {
       console.error("Logout failed:", error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-10 pb-20"
    >
      {confirmedBooking && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-md">
          <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-[3.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/5"
          >
             <div className="p-12 text-center space-y-8">
                <div className="w-24 h-24 bg-brand-primary rounded-[2.5rem] flex items-center justify-center text-white dark:text-background-deep mx-auto shadow-2xl shadow-brand-primary/20">
                   <CheckCircle2 size={56} />
                </div>
                <div className="space-y-2">
                   <h2 className="text-3xl font-display font-black text-slate-950 uppercase tracking-tighter">Protocol Authorized</h2>
                   <p className="text-slate-500 font-bold text-xs uppercase tracking-[0.3em]">Manual Grid Allocation Successful</p>
                </div>
                
                <div className="bg-slate-50 dark:bg-white/5 p-8 rounded-[2.5rem] border border-slate-200 dark:border-white/5 space-y-6">
                   <div className="flex justify-between items-center text-left">
                      <div className="space-y-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Vehicle</p>
                         <p className="text-xl font-mono font-bold text-slate-950">{confirmedBooking.vehicleNumber}</p>
                      </div>
                      <div className="text-right space-y-1">
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Slot</p>
                         <p className="text-3xl font-display font-black text-brand-primary">{confirmedBooking.slotNumber}</p>
                      </div>
                   </div>
                   <div className="h-px bg-slate-200 dark:bg-white/10 w-full" />
                   <div className="grid grid-cols-2 gap-4 text-left">
                      <div>
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Time</p>
                         <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                           {confirmedBooking.startTime?.toMillis 
                             ? new Date(confirmedBooking.startTime.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                             : 'Just Now'}
                         </p>
                      </div>
                      <div className="text-right">
                         <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Session</p>
                         <p className="text-sm font-bold text-emerald-500">Active</p>
                      </div>
                   </div>
                </div>

                <button 
                  onClick={() => setConfirmedBooking(null)}
                  className="w-full h-16 bg-brand-primary text-background-deep rounded-2xl font-display font-bold uppercase tracking-widest shadow-2xl hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Return to Matrix
                </button>
             </div>
          </motion.div>
        </div>
      )}
      {/* Header logic */}
      <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center p-8 bg-white dark:bg-slate-900/80 backdrop-blur-xl rounded-[3rem] border border-slate-200 dark:border-white/10 shadow-2xl gap-8">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[1.5rem] bg-brand-primary flex items-center justify-center text-black dark:text-black shadow-2xl shadow-brand-primary/40 transform -rotate-3">
            <ShieldCheck size={36} />
          </div>
          <div>
             <div className="flex items-center gap-3">
               <h1 className="text-4xl font-display font-black text-black dark:text-white tracking-tighter transition-colors">Admin Terminal</h1>
               {maintenanceMode && (
                 <span className="flex items-center gap-2 px-3 py-1 bg-red-500 text-white text-[9px] font-black rounded-full animate-pulse shadow-lg shadow-red-500/20 uppercase tracking-widest leading-none">
                    <Activity size={10} /> Maintenance Active
                 </span>
               )}
             </div>
             <p className="text-[11px] font-black text-slate-800 dark:text-slate-400 uppercase tracking-[0.4em] flex items-center gap-2 mt-1.5 transition-colors">
                <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${maintenanceMode ? 'bg-red-500 shadow-red-500/50 shadow-lg' : 'bg-brand-primary shadow-brand-primary/50 shadow-lg'}`} />
                MIT Core: {maintenanceMode ? 'Locked' : 'Operational'}
             </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <div className="flex gap-1.5 bg-white dark:bg-white/10 p-1.5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-inner">
            {(['overview', 'slots', 'users', 'revenue', 'feeds', 'inquiries', 'sensors'] as const).map(tab => (
              <button 
                key={`tab-btn-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-xl text-[11px] font-black uppercase tracking-[0.25em] transition-all whitespace-nowrap ${
                  activeTab === tab 
                  ? 'bg-brand-primary text-background-deep shadow-xl shadow-brand-primary/30 scale-105' 
                  : 'text-black dark:text-slate-400 hover:text-brand-primary dark:hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
             <button 
               onClick={handleReSeed}
               title="Re-index Grid"
               className="w-14 h-14 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-brand-primary hover:border-brand-primary/50 transition-all shadow-sm"
             >
                <RefreshCw size={24} />
             </button>
             <button 
               onClick={handleToggleMaintenance}
               title={maintenanceMode ? "Deactivate Maintenance Mode" : "Activate Maintenance Mode"}
               className={`w-14 h-14 border rounded-2xl flex items-center justify-center transition-all shadow-sm ${
                 maintenanceMode 
                 ? 'bg-red-500 text-white border-red-500 animate-pulse shadow-red-500/40' 
                 : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-500 hover:border-red-500/50'
               }`}
             >
                <Power size={24} />
             </button>
             <button 
               onClick={handleLogout}
               title="Secure Logout"
               className="w-14 h-14 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800 transition-all shadow-sm"
             >
                <LogOut size={24} />
             </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-10"
          >
            {/* Metrics Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              <MetricCard icon={<Car size={22} />} label="Total Nodes" value={adminSlots.length} sub="Slots" />
              <MetricCard icon={<CheckCircle2 size={22} />} label="Available" value={adminSlots.filter(s => s.status === 'available').length} sub="Ready" color="text-brand-primary" />
              <MetricCard icon={<Users size={22} />} label="Operational" value={adminSlots.filter(s => s.status === 'occupied').length} sub="Full" color="text-slate-900 dark:text-white" />
              <MetricCard icon={<MessageSquare size={22} />} label="Support" value={chats.length} sub="Chats" color="text-brand-primary" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Traffic Logs Overview */}
              <div className="lg:col-span-2 space-y-8">
                 <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl dark:shadow-2xl overflow-hidden">
                    <div className="p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/[0.02]">
                       <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">Active Traffic</h2>
                    </div>
                     <div className="p-8">
                        <div className="space-y-4">
                           {realBookings.filter(b => b.status === 'active' || b.status === 'reserved').length === 0 ? (
                             <div className="text-center py-10">
                                <p className="text-sm text-black dark:text-white font-black uppercase tracking-widest">No Active Traffic</p>
                             </div>
                           ) : (
                              realBookings.filter(b => b.status === 'active' || b.status === 'reserved').slice(0, 8).map((v, vIdx) => (
                               <div key={`traffic-${v.id}-${vIdx}`} className="flex items-center justify-between p-5 bg-white dark:bg-white/5 rounded-[2rem] border border-slate-100 dark:border-white/5 group transition-all hover:shadow-lg">
                                  <div className="flex items-center gap-5">
                                     <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${v.status === 'reserved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-brand-primary/10 text-brand-primary'}`}>
                                        {v.vehicleType === 'Bike' ? <Bike size={24} /> : <Car size={24} />}
                                     </div>
                                     <div>
                                        <div className="flex items-center gap-2">
                                          <p className="text-base font-mono font-black text-black dark:text-white tracking-widest leading-none">{v.vehicleNumber}</p>
                                          {v.status === 'reserved' && (
                                            <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black rounded-sm uppercase tracking-widest">Pre-booked</span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-black dark:text-slate-400 font-black uppercase mt-1 tracking-wider">{v.ownerName}</p>
                                     </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-3">
                                     <div className="text-right mr-4 space-y-1">
                                        <p className="text-[12px] text-black font-mono font-black">Slot {v.slotNumber || v.slotId}</p>
                                        <p className="text-[10px] font-black text-black uppercase tracking-wider">{v.bookingType || 'Instant'}</p>
                                     </div>

                                     {v.status === 'reserved' ? (
                                       <div className="flex items-center gap-3">
                                          {v.userArrived && (
                                            <div className="px-3 py-1.5 bg-brand-primary/10 border border-brand-primary/30 rounded-lg flex items-center gap-2 animate-pulse">
                                              <div className="w-1.5 h-1.5 rounded-full bg-brand-primary" />
                                              <span className="text-[9px] font-black text-brand-primary uppercase tracking-widest">At Entrance</span>
                                            </div>
                                          )}
                                          <button 
                                            onClick={() => handleAdminCheckIn(v)}
                                            className={`h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center gap-2 ${
                                              v.userArrived 
                                              ? "bg-brand-primary text-background-deep shadow-brand-primary/40 hover:scale-105" 
                                              : "bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/20"
                                            }`}
                                          >
                                            <Play size={14} fill="currentColor" />
                                            {v.userArrived ? "Authorize Arrival" : "Check-in"}
                                          </button>
                                       </div>
                                     ) : (
                                       <button 
                                         onClick={() => handleAdminCheckOut(v)}
                                         className="h-10 px-4 bg-black dark:bg-white text-white dark:text-black rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95"
                                       >
                                         Complete Session
                                       </button>
                                     )}
                                     
                                     <button 
                                       onClick={() => handleAdminCancel(v)}
                                       className="w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white rounded-xl transition-all"
                                       title="Cancel Booking"
                                     >
                                        <XCircle size={18} />
                                     </button>
                                  </div>
                               </div>
                             ))
                           )}
                        </div>
                     </div>
                 </section>

                 <section className="bg-brand-primary p-8 rounded-[3rem] shadow-2xl shadow-brand-primary/20 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-2">
                       <p className="text-[10px] font-bold text-background-deep opacity-60 uppercase tracking-[0.4em]">Cumulative Energy</p>
                       <h2 className="text-5xl font-display font-bold text-background-deep tracking-tighter">₹{totalRevenue.toLocaleString() || '0'}</h2>
                    </div>
                    <div className="w-full md:w-auto">
                       <button onClick={() => setActiveTab('revenue')} className="w-full px-10 h-16 bg-background-deep text-brand-primary rounded-2xl font-display font-bold uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all">Audit Ledger</button>
                    </div>
                 </section>
              </div>
           </div>
        </motion.div>
      )}

      {activeTab === 'feeds' && (
        <motion.div 
          key="feeds"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-10"
        >
           <section className="bg-slate-900/60 p-12 rounded-[3.5rem] border border-white/10 shadow-2xl space-y-10 max-w-6xl mx-auto backdrop-blur-xl">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="space-y-2">
                  <h2 className="text-4xl font-display font-black text-black dark:text-white tracking-tighter">Live Surveillance</h2>
                  <p className="text-black dark:text-white dark:text-brand-primary text-xs font-black uppercase tracking-[0.4em] animate-pulse">Quad-Stream Feed Delta</p>
                  </div>
                  <div className="flex gap-4">
                     <div className="px-5 py-2 bg-white/10 rounded-xl text-[10px] font-black text-black dark:text-white uppercase tracking-widest border border-white/10">CORE_LINK_STABLE</div>
                     <div className="px-5 py-2 bg-brand-primary text-background-deep rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-brand-primary/20">4X LIVE</div>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((camId) => (
                    <div key={`cam-feed-${camId}`} className="relative group rounded-[2rem] overflow-hidden border-2 border-white/10 shadow-xl bg-black">
                        <div className="aspect-video relative">
                            <div className={`absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay grayscale contrast-125 ${
                              camId === 1 ? "bg-[url('https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&q=80&w=800')]" :
                              camId === 2 ? "bg-[url('https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&q=80&w=800')]" :
                              camId === 3 ? "bg-[url('https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&q=80&w=800')]" :
                              "bg-[url('https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&q=80&w=800')]"
                            }`} />
                            
                            <motion.div 
                                initial={{ top: '0%' }}
                                animate={{ top: ['0%', '100%', '0%'] }}
                                transition={{ duration: 4 + camId, repeat: Infinity, ease: "linear" }}
                                className="absolute left-0 right-0 h-px bg-brand-primary/50 shadow-[0_0_15px_#84CC16] z-10"
                            />

                            <div className="absolute top-4 left-4 flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                <span className="text-[9px] font-mono font-black text-white/60 tracking-widest uppercase">CAM_0{camId}</span>
                            </div>

                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                              <div className="bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/5">
                                    <p className="text-[8px] font-mono text-black dark:text-brand-primary font-black uppercase tracking-tighter">Sector {String.fromCharCode(64 + camId)}</p>
                                </div>
                                <p className="text-[8px] font-mono text-black/50 font-bold tracking-widest">720P // 30FPS</p>
                            </div>
                        </div>
                    </div>
                  ))}
              </div>
           </section>
        </motion.div>
      )}

      {activeTab === 'inquiries' && (
        <motion.div 
          key="inquiries"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="space-y-10"
        >
           <section className="bg-white dark:bg-slate-900/60 p-12 rounded-[3.5rem] shadow-2xl border border-slate-200 dark:border-white/10 max-w-7xl mx-auto">
              <div className="flex justify-between items-center mb-12">
                 <div className="space-y-2">
                    <h2 className="text-4xl font-display font-black text-slate-950 tracking-tighter">User Inquiries</h2>
                    <p className="text-slate-500 font-black text-[11px] uppercase tracking-[0.4em]">Grid Communication Interface</p>
                 </div>
                 <div className="w-16 h-16 bg-brand-primary text-background-deep rounded-[1.5rem] flex items-center justify-center shadow-xl shadow-brand-primary/20 transform rotate-3">
                    <MessageSquare size={32} />
                 </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                 {chats.map((chat, idx) => (
                    <button 
                      key={`chat-user-item-${chat.userId}-${idx}`}
                      onClick={() => setSelectedChatUser(chat.userId)}
                      className={`p-10 rounded-[3rem] border-2 transition-all text-left group relative overflow-hidden ${
                         selectedChatUser === chat.userId 
                         ? 'bg-slate-950 border-brand-primary text-white shadow-2xl scale-105' 
                         : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-950 hover:border-brand-primary/40'
                      }`}
                    >
                       <div className="flex justify-between items-start mb-6 relative z-10">
                          <div className={`p-5 rounded-2xl ${selectedChatUser === chat.userId ? 'bg-brand-primary text-background-deep shadow-lg' : 'bg-white dark:bg-white/10 shadow-sm'}`}>
                             <User size={24} />
                          </div>
                          {chat.unreadCount > 0 && (
                             <span className="bg-brand-primary text-background-deep text-[11px] font-black px-4 py-1.5 rounded-full animate-bounce shadow-xl shadow-brand-primary/30">PENDING</span>
                          )}
                       </div>
                       
                       <div className="relative z-10">
                          <h4 className="text-2xl font-display font-black tracking-tight mb-3">User_{chat.userId.slice(-6).toUpperCase()}</h4>
                          <p className="text-[12px] text-slate-400 font-bold mb-4 truncate">{chat.userEmail}</p>
                          <p className={`text-[13px] font-black leading-relaxed ${selectedChatUser === chat.userId ? 'text-brand-primary' : 'text-slate-500'}`}>
                             "{chat.lastMessage}"
                          </p>
                       </div>

                       <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:opacity-15 transition-opacity duration-500">
                          <MessageSquare size={160} />
                       </div>
                    </button>
                 ))}
              </div>
           </section>
        </motion.div>
      )}
        {activeTab === 'slots' && (
          <motion.div 
            key="slots"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-8">
                <section className="bg-slate-900/40 p-10 rounded-[3rem] border border-white/10 shadow-2xl space-y-10">
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-4">
                            <Activity size={26} className="text-brand-primary" />
                            <h2 className="text-2xl font-display font-black text-black dark:text-white tracking-tight">Slot Control Matrix</h2>
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                          <button 
                            onClick={() => setIsBulkMode(!isBulkMode)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
                              isBulkMode ? 'bg-brand-primary text-background-deep shadow-lg' : 'bg-white/5 text-slate-400 hover:text-white'
                            }`}
                          >
                            {isBulkMode ? <CheckCircle2 size={14} /> : <Zap size={14} />}
                            {isBulkMode ? 'Bulk Mode Active' : 'Enable Bulk Mode'}
                          </button>
                                             <AnimatePresence>
                            {isBulkMode && (
                              <motion.div 
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2"
                              >
                                <button 
                                  onClick={handleSelectAllOnFloor}
                                  className="px-4 py-2 rounded-xl text-[10px] font-black underline decoration-brand-primary/30 text-white uppercase tracking-widest hover:text-brand-primary transition-all"
                                >
                                  {filteredSlots.every(id => selectedSlotIds.has(id.id)) ? 'Deselect Floor' : 'Select Floor'}
                                </button>
                                {selectedSlotIds.size > 0 && (
                                  <>
                                    <div className="w-px h-6 bg-white/10 mx-2" />
                                    <button 
                                      onClick={() => setSelectedSlotIds(new Set())}
                                      className="px-4 py-2 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-white transition-all"
                                    >
                                      Clear ({selectedSlotIds.size})
                                    </button>
                                    <button 
                                      onClick={() => {
                                        setBlockTargetStatus('blocked');
                                        setShowBlockModal(true);
                                      }}
                                      className="px-4 py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all shadow-lg"
                                    >
                                      Block
                                    </button>
                                    <button 
                                      onClick={() => handleBulkUpdate('blocked', {
                                        type: 'permanent',
                                        comment: 'Bulk Administrative Block (Quick)',
                                        duration: 'permanent'
                                      })}
                                      className="px-4 py-2 bg-red-600/20 border border-red-500/30 text-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-lg flex items-center gap-2"
                                    >
                                      <Lock size={12} />
                                      Quick Block
                                    </button>
                                    <button 
                                      onClick={() => handleBulkUpdate('available')}
                                      className="px-4 py-2 bg-emerald-600/20 border border-emerald-500/30 text-emerald-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all shadow-lg flex items-center gap-2"
                                    >
                                      <Unlock size={12} />
                                      Quick Unblock
                                    </button>
                                  </>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                        <div className="flex gap-1 bg-white/10 p-1.5 rounded-2xl border border-white/10">
                            {Array.from({ length: 2 }, (_, i) => i + 1).map((floor, fIdx) => (
                              <button 
                                  key={`floor-btn-${floor}-${fIdx}`}
                                  onClick={() => setActiveFloor(floor)}
                                  className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                                    activeFloor === floor ? 'bg-brand-primary text-background-deep shadow-lg scale-105' : 'text-slate-400 hover:text-white'
                                  }`}
                              >
                                  Floor {floor}
                              </button>
                            ))}
                        </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-4">
                     {filteredSlots.map((s, sIdx) => {
                       const isSelected = selectedSlotIds.has(s.id);
                       const isBlocked = s.status === 'blocked' || s.status === 'maintenance' || s.status === 'out_of_service';
                       return (
                         <div key={`slot-grid-${s.id}-${sIdx}`} className="relative group">
                            <button 
                              onClick={() => handleToggleSlot(s)}
                              title={isBlocked ? `Status: ${s.status}${s.blockMetadata?.comment ? `\nReason: ${s.blockMetadata.comment}` : ''}${s.blockMetadata?.blockedUntil ? `\nUntil: ${new Date(s.blockMetadata.blockedUntil).toLocaleString()}` : ''}` : `Slot ${s.number}`}
                              className={`w-full aspect-square rounded-2xl flex flex-col items-center justify-center text-[11px] font-mono font-black transition-all border-2 shadow-inner ${
                                  isSelected ? 'ring-4 ring-brand-primary/40 border-brand-primary scale-105 z-10' : ''
                              } ${
                                  s.status === 'available' ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/30 hover:bg-brand-primary/30 hover:scale-105' :
                                  s.status === 'reserved' ? 'bg-emerald-500/20 text-emerald-500 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' :
                                  s.status === 'occupied' ? 'bg-red-500/20 text-red-500 border-red-500/20 cursor-not-allowed' :
                                  'bg-slate-800 text-slate-400 border-white/5 hover:bg-slate-700'
                              }`}
                            >
                              {isSelected && (
                                <div className="absolute top-1 right-1">
                                  <CheckCircle2 size={12} className="text-brand-primary" />
                                </div>
                              )}
                              <span>{s.number}</span>
                              {!isBlocked && (
                                <div className="mt-1 opacity-70">
                                   {(s.currentVehicleType || s.type) === 'Bike' ? <Bike size={12} /> : 
                                    (s.currentVehicleType || s.type) === 'Truck' ? <Truck size={12} /> : 
                                    <Car size={12} />}
                                </div>
                              )}
                              {isBlocked && (
                                <div className="mt-1 flex flex-col items-center gap-0.5">
                                   <div className="opacity-40 group-hover:opacity-100 transition-opacity">
                                      <Lock size={10} />
                                   </div>
                                   <span className={`text-[7px] font-black uppercase tracking-tighter ${
                                     s.blockMetadata?.type === 'maintenance' ? 'text-amber-500' : 
                                     s.blockMetadata?.type === 'cancellation' ? 'text-red-500' : 'text-slate-400'
                                   }`}>
                                     {s.blockMetadata?.type || 'BLOCKED'}
                                   </span>
                                </div>
                              )}
                            </button>
                            
                            {isBlocked && !isSelected && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStatusRevert(s);
                                }}
                                className="absolute -top-3 -right-3 bg-emerald-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg z-20 border-2 border-white dark:border-slate-900 shadow-emerald-500/20"
                                title="Instant Re-Activate"
                              >
                                <Unlock size={14} />
                              </button>
                            )}
                            {!isBlocked && !isSelected && s.status !== 'occupied' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickBlock(s.id);
                                }}
                                className="absolute -top-3 -right-3 bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg z-20 border-2 border-white dark:border-slate-900 shadow-red-500/20"
                                title="Instant Block"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                         </div>
                       );
                     })}
                  </div>
                  
                  <div className="flex flex-wrap gap-4 pt-4 border-t border-slate-200 dark:border-white/5">
                      <LegendItem dot="bg-brand-primary" label="Available" />
                      <LegendItem dot="bg-emerald-600" label="Reserved" />
                      <LegendItem dot="bg-red-600" label="Occupied" />
                      <LegendItem dot="bg-slate-900 dark:bg-slate-500" label="Blocked" />
                  </div>
                </section>

                <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl p-8 space-y-6">
                  <h3 className="text-lg font-display font-black text-black dark:text-white uppercase tracking-tight">Recent Activity</h3>
                  <div className="space-y-3">
                      {realBookings.filter(b => (b.status === 'active' || b.status === 'reserved') && (b.locationId === activeLocationId || !b.locationId)).map((b, idx) => (
                        <div key={`recent-activity-${b.id}-${idx}`} className="flex items-center justify-between p-4 bg-white dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5 group transition-all hover:border-brand-primary/30">
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${b.status === 'reserved' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-100 dark:bg-white/5 text-slate-500 text-black dark:text-white'}`}>
                                  {b.vehicleType === 'Bike' ? <Bike size={18} /> : <Car size={18} />}
                              </div>
                               <div>
                                   <p className="text-sm font-mono font-black text-black dark:text-white uppercase transition-colors">{b.vehicleNumber}</p>
                                   <div className="flex items-center gap-2">
                                     <p className="text-[9px] text-black dark:text-slate-400 font-black uppercase">{b.ownerName}</p>
                                     <span className="w-1 h-1 rounded-full bg-black/20 dark:bg-white/20" />
                                     <p className={`text-[8px] font-black uppercase tracking-tighter ${b.status === 'reserved' ? 'text-emerald-500' : 'text-brand-primary'}`}>{b.status === 'reserved' ? 'Reserved' : 'In-Grid'}</p>
                                     {b.arrivalTime && <span className="text-[8px] text-black dark:text-slate-400 font-mono italic font-black">@{b.arrivalTime}</span>}
                                   </div>
                               </div>
                            </div>
                            <div className="flex gap-2">
                               {b.status === 'reserved' ? (
                                 <>
                                   <button onClick={() => handleAdminCheckIn(b)} className="px-5 h-10 bg-emerald-500 text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 shadow-emerald-500/20">Check In</button>
                                   <button onClick={() => handleAdminCancel(b)} className="px-5 h-10 bg-slate-800 text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 shadow-slate-500/20">Cancel</button>
                                 </>
                               ) : (
                                 <button onClick={() => handleAdminCheckOut(b)} className="px-5 h-10 bg-red-500 text-white rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-lg active:scale-95 shadow-red-500/20">De-authorize</button>
                               )}
                            </div>
                        </div>
                      ))}
                  </div>
                </section>
              </div>

              <div className="space-y-8">
                <section className="bg-slate-900/40 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                    <div className="flex justify-between items-center mb-2">
                      <h2 className="text-xl font-display font-bold text-white">Live Feed</h2>
                      <Activity size={20} className="text-brand-primary" />
                    </div>
                    <div className="aspect-square bg-slate-950 rounded-[2.5rem] relative overflow-hidden border border-white/5 flex flex-col items-center justify-center text-center p-8">
                      {isScanning ? (
                        <div className="space-y-6">
                            <div className="relative w-40 h-40">
                              <ScanLine size={160} className="text-brand-primary/30" strokeWidth={1} />
                              <motion.div 
                                  animate={{ top: ['0%', '100%', '0%'] }}
                                  transition={{ duration: 2, repeat: Infinity }}
                                  className="absolute left-0 right-0 h-1 bg-brand-primary shadow-[0_0_20px_#84CC16]"
                              />
                            </div>
                            <p className="text-[11px] font-black text-brand-primary animate-pulse tracking-[0.4em] uppercase">Processing Slot</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                            <QrCode size={64} className="text-white/20 mx-auto" strokeWidth={1} />
                            <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.2em] max-w-[150px]">Awaiting credential hand-shake</p>
                            <button onClick={simulateScan} className="px-8 h-14 bg-brand-primary text-background-deep rounded-2xl font-black uppercase text-[11px] tracking-widest shadow-2xl">Initialize Scan</button>
                        </div>
                      )}
                    </div>
                </section>

                <section className="bg-slate-900/40 p-8 rounded-[3rem] border border-white/5 shadow-2xl space-y-6">
                  <h2 className="text-xl font-display font-black text-white">System Protocols</h2>
                  <div className="space-y-4">
                      <ControlButton icon={<RefreshCw size={18} />} label="Re-index Grid" onClick={handleReSeed} />
                      <ControlButton icon={<DollarSign size={18} />} label="Export Ledger Data" />
                      <ControlButton icon={<AlertCircle size={18} />} label="Emergency Breach Mode" danger />
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        )}
        {activeTab === 'revenue' && (
          <motion.div 
            key="revenue"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-10"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-8">
                  <section className="bg-slate-900/40 p-10 rounded-[3rem] border border-white/5 shadow-2xl relative overflow-hidden">
                     <div className="absolute top-0 right-0 p-8 opacity-5 text-white">
                        <DollarSign size={200} />
                     </div>
                     <div className="relative z-10 space-y-10">
                        <div className="flex justify-between items-start">
                           <div className="space-y-3">
                              <h2 className="text-2xl font-display font-black text-white tracking-tight">Analysis</h2>
                              <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.4em]">Global Energy Credits</p>
                           </div>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                           <div className="p-8 bg-black/40 rounded-[2.5rem] border border-white/5">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.4em] mb-4">Gross Revenue</p>
                              <p className="text-5xl font-display font-bold text-white tracking-tighter mb-2">₹{totalRevenue.toLocaleString()}</p>
                           </div>
                           <div className="p-8 bg-brand-primary rounded-[2.5rem] shadow-2xl shadow-brand-primary/20">
                              <p className="text-[10px] font-bold text-background-deep opacity-60 uppercase tracking-[0.4em] mb-4">Node Operations</p>
                              <p className="text-5xl font-display font-bold text-background-deep tracking-tighter mb-2">{realBookings.filter(b => b.paymentStatus === 'paid').length}</p>
                           </div>
                        </div>
                     </div>
                  </section>

                  <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl overflow-hidden">
                     <div className="p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
                        <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">Audit Trail</h2>
                        <div className="relative w-64 group">
                           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" size={16} />
                           <input 
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              placeholder="Search bookings..."
                              className="w-full h-12 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-11 pr-5 text-xs font-medium outline-none focus:border-brand-primary transition-all text-black dark:text-white"
                           />
                        </div>
                     </div>
                     <div className="p-8">
                        <div className="overflow-x-auto">
                          <table className="w-full">
                             <thead>
                                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">
                                   <th className="pb-6">Unit ID</th>
                                   <th className="pb-6">Name</th>
                                   <th className="pb-6">Protocol</th>
                                   <th className="pb-6 text-right">Energy</th>
                                </tr>
                             </thead>
                             <tbody className="text-sm font-medium">
                                {filteredRealBookings.slice(0, 50).map((b, bIdx) => (
                                   <tr key={`audit-row-${b.id || bIdx}-${bIdx}`} className="border-t border-slate-100 dark:border-white/5 text-slate-900">
                                      <td className="py-4 font-mono font-bold text-slate-900 uppercase transition-colors">{b.vehicleNumber}</td>
                                      <td className="py-4 text-slate-500">{b.ownerName}</td>
                                      <td className="py-4">
                                         <div className="flex flex-col">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${b.bookingType === 'Pre-booking' ? 'text-emerald-500' : 'text-brand-primary'}`}>{b.bookingType || 'Instant'}</span>
                                            {b.arrivalTime && <span className="text-[9px] text-slate-400 font-mono italic">@{b.arrivalTime}</span>}
                                         </div>
                                      </td>
                                      <td className="py-4 text-right font-bold text-slate-900">₹{b.totalAmount}</td>
                                   </tr>
                                ))}
                             </tbody>
                          </table>
                        </div>
                     </div>
                  </section>
               </div>

               <div className="space-y-8">
                   <section className="bg-white dark:bg-slate-900/60 p-10 rounded-[3rem] shadow-2xl space-y-10 border border-slate-200 dark:border-white/10">
                      <h3 className="text-2xl font-display font-black text-slate-900 tracking-tight text-center">Revenue by Vehicle</h3>
                      <div className="h-[300px]">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={REVENUE_BY_TYPE_DATA}>
                               <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                               <XAxis dataKey="name" stroke="#64748B" fontSize={12} tickLine={false} axisLine={false} />
                               <YAxis 
                                 stroke="#64748B" 
                                 fontSize={10} 
                                 fontWeight="bold"
                                 tickFormatter={(value) => `₹${value}`}
                                 tickLine={false}
                                 axisLine={false}
                               />
                               <Tooltip 
                                 cursor={{ fill: 'rgba(132, 204, 22, 0.05)' }}
                                 contentStyle={{ 
                                   backgroundColor: '#0F172A', 
                                   border: '1px solid rgba(255,255,255,0.1)',
                                   borderRadius: '12px',
                                   color: '#fff'
                                 }}
                               />
                               <Bar 
                                 dataKey="revenue" 
                                 fill="#84CC16" 
                                 radius={[10, 10, 0, 0]}
                                 barSize={60}
                               />
                            </BarChart>
                         </ResponsiveContainer>
                      </div>
                   </section>

                   <section className="bg-white dark:bg-slate-900/60 p-10 rounded-[3rem] shadow-2xl space-y-10 border border-slate-200 dark:border-white/10">
                     <div className="flex justify-between items-center">
                        <h3 className="text-2xl font-display font-black text-slate-900 tracking-tight">Peak Rush Heatmap</h3>
                        <div className="px-4 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                           <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Peak Hour: {peakHourStr}</span>
                        </div>
                     </div>
                     <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                           <AreaChart data={HOURLY_ACTIVITY}>
                              <defs>
                                <linearGradient id="colorRush" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0.1}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="hour" stroke="#64748B" fontSize={10} tickLine={false} axisLine={false} />
                               <YAxis 
                                 stroke="#64748B" 
                                 fontSize={10} 
                                 fontWeight="bold"
                                 tickLine={false}
                                 axisLine={false}
                               />
                              <Tooltip 
                                cursor={{ stroke: '#EF4444', strokeWidth: 2 }}
                                contentStyle={{ 
                                  backgroundColor: '#0F172A', 
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  borderRadius: '12px',
                                  color: '#fff'
                                }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="activity" 
                                name="Traffic Intensity"
                                stroke="#EF4444" 
                                strokeWidth={4}
                                fillOpacity={1} 
                                fill="url(#colorRush)" 
                              />
                           </AreaChart>
                        </ResponsiveContainer>
                     </div>
                     <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center italic">Calculated based on chronological historical data streams</p>
                  </section>

                  <section className="bg-white dark:bg-slate-900/60 p-10 rounded-[3rem] shadow-2xl space-y-10 border border-slate-200 dark:border-white/10">
                     <h3 className="text-2xl font-display font-black text-slate-900 tracking-tight text-center">Vehicle Dynamics</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[350px]">
                        <div className="h-full">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mb-4">Type Ratio</p>
                           <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={PIE_VEHICLE_DATA}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={60}
                                  outerRadius={100}
                                  paddingAngle={5}
                                  dataKey="value"
                                >
                                  {PIE_VEHICLE_DATA.map((entry, index) => (
                                    <Cell key={`pie-cell-${entry.name}-${index}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip />
                              </PieChart>
                           </ResponsiveContainer>
                           <div className="flex justify-center gap-6 mt-4">
                              {PIE_VEHICLE_DATA.map((entry, idx) => (
                                 <div key={`pie-v-legend-${idx}`} className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{entry.name}</span>
                                 </div>
                              ))}
                           </div>
                        </div>
                        <div className="h-full">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center mb-4">Traffic Rhythms (Hourly)</p>
                           <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={HOURLY_ACTIVITY}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="hour" fontSize={8} tick={{ fill: '#64748B' }} interval={3} />
                                <YAxis fontSize={8} tick={{ fill: '#64748B' }} />
                                <Tooltip 
                                  contentStyle={{ 
                                    backgroundColor: '#0F172A', 
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '12px'
                                  }}
                                />
                                <Bar dataKey="Car" fill="#84CC16" radius={[4, 4, 0, 0]} barSize={4} />
                                <Bar dataKey="Bike" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={4} />
                              </BarChart>
                           </ResponsiveContainer>
                        </div>
                     </div>
                  </section>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div 
            key="users"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-2 space-y-8">
               <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl overflow-hidden">
                  <div className="p-8 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] flex justify-between items-center">
                     <h2 className="text-xl font-display font-bold text-slate-900 tracking-tight">Personnel Registry</h2>
                     <div className="flex items-center gap-3">
                        <button 
                           onClick={async () => {
                              const blockedUsers = usersList.filter(u => u.isBlocked);
                              if (blockedUsers.length === 0) return;
                              setUpdatingUserId('bulk-unblock');
                              try {
                                 for (const u of blockedUsers) {
                                    await updateDoc(doc(db, 'users', u.id), { isBlocked: false, updatedAt: serverTimestamp() });
                                 }
                                 setAdminNotification({ message: 'All global restrictions lifted', type: 'success' });
                              } catch (e) {
                                 setAdminNotification({ message: 'Bulk operation failed', type: 'error' });
                              } finally {
                                 setUpdatingUserId(null);
                              }
                           }}
                           className="h-12 px-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all shadow-lg shadow-emerald-500/5 flex items-center gap-2"
                        >
                           <Unlock size={14} />
                           Global Unblock
                        </button>
                        <div className="relative w-64 group">
                           <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-primary transition-colors" size={16} />
                           <input 
                              value={userSearchTerm}
                              onChange={(e) => setUserSearchTerm(e.target.value)}
                              placeholder="Search digital ID..."
                              className="w-full h-12 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl pl-11 pr-5 text-xs font-medium outline-none focus:border-brand-primary transition-all text-black dark:text-white"
                           />
                        </div>
                     </div>
                  </div>
                  <div className="p-8">
                     <div className="space-y-4">
                {usersList
                  .filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) || (u.id && u.id.toLowerCase().includes(userSearchTerm.toLowerCase())))
                  .map((u, uIdx) => (
                  <div key={`user-card-${u.id}-${uIdx}`} className="flex items-center justify-between p-6 bg-white dark:bg-slate-900/40 rounded-[2.5rem] border border-slate-200 dark:border-white/10 group transition-all hover:border-brand-primary/40 hover:shadow-xl dark:hover:shadow-brand-primary/5">
                    <div className="flex items-center gap-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                        u.role === 'admin' 
                          ? 'bg-brand-primary text-background-deep shadow-lg shadow-brand-primary/20 rotate-3' 
                          : 'bg-slate-100 dark:bg-white/5 text-slate-400 group-hover:text-brand-primary'
                      }`}>
                        <User size={24} />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                          <h4 className="text-base font-display font-black text-black dark:text-white tracking-tight">{u.email}</h4>
                          <span className={`px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${
                            u.role === 'admin' ? 'bg-brand-primary text-background-deep' : 'bg-slate-200 dark:bg-white/10 text-black dark:text-white font-black'
                          }`}>
                            {u.role}
                          </span>
                        </div>
                        <p className="text-[10px] text-black dark:text-white/60 font-mono font-black tracking-widest">
                          NODE_HASH: {u.id.slice(0, 12).toUpperCase()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleToggleUserBlock(u)}
                        disabled={updatingUserId === u.id}
                        title={u.isBlocked ? 'Reactivate Node' : 'Deactivate Node'}
                        className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all border active:scale-95 disabled:opacity-50 ${
                          u.isBlocked 
                            ? 'bg-red-500 text-white border-red-600 shadow-lg shadow-red-500/20' 
                            : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-500 hover:border-red-500/30'
                        }`}
                      >
                        {updatingUserId === u.id ? (
                          <RefreshCw size={18} className="animate-spin" />
                        ) : (
                          <Ban size={18} />
                        )}
                      </button>

                      <button 
                        onClick={() => handleUpdateUserRole(u)}
                        disabled={updatingUserId === u.id}
                        title={u.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}
                        className={`h-12 px-6 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all border flex items-center gap-2 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                          u.role === 'admin' 
                            ? 'bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white' 
                            : 'bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary hover:text-background-deep shadow-sm'
                        }`}
                      >
                        {updatingUserId === u.id ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          u.role === 'admin' ? <ShieldCheck size={14} /> : <Zap size={14} />
                        )}
                        {updatingUserId === u.id ? 'Processing...' : (u.role === 'admin' ? 'Revoke Clear' : 'Elevate Role')}
                      </button>

                      <DeleteUserButton 
                        user={u} 
                        onDelete={handleDeleteUser} 
                        isDeleting={updatingUserId === u.id} 
                      />
                    </div>
                  </div>
                ))}
                {usersList.filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase())).length === 0 && (
                  <div className="py-20 text-center opacity-40">
                    <Search size={40} className="mx-auto mb-4" />
                    <p className="text-sm font-black uppercase tracking-widest">No nodes found in registry</p>
                  </div>
                )}
                     </div>
                  </div>
               </section>
            </div>
            
            <div className="space-y-8">
               <section className="bg-slate-100 dark:bg-slate-900/40 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-xl p-8 space-y-6">
                  <h3 className="text-lg font-display font-bold text-slate-900 tracking-tight flex items-center gap-3">
                     <MessageSquare size={20} className="text-brand-primary" />
                     User Statistics
                  </h3>
                   <div className="p-6 bg-white dark:bg-white/5 rounded-2xl border border-slate-100 dark:border-white/5">
                     <p className="text-[10px] font-black text-black uppercase tracking-widest mb-1">Total Signals</p>
                     <p className="text-3xl font-display font-black text-black dark:text-brand-primary">{chats.length}</p>
                  </div>
               </section>
            </div>
          </motion.div>
        )}

        {activeTab === 'sensors' && (
          <motion.div 
            key="sensors"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-10 max-w-5xl mx-auto"
          >
             <section className="bg-slate-950 p-12 rounded-[3.5rem] border border-white/10 shadow-2xl space-y-10">
                <div className="space-y-4">
                   <h2 className="text-4xl font-display font-black text-white tracking-tighter">IoT Integration Guide</h2>
                   <p className="text-brand-primary text-xs font-black uppercase tracking-[0.4em]">Hardware-to-Software Bridge Interface</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
                      <h3 className="text-xl font-display font-bold text-white flex items-center gap-3">
                         <Zap size={20} className="text-brand-primary" />
                         Sensor Selection
                      </h3>
                      <div className="space-y-4">
                         {[
                           { name: "Ultrasonic (HC-SR04)", desc: "Best for distance measurement. Detects vehicle height and distance accurately. High noise immunity." },
                           { name: "IR Proximity", desc: "Cost-effective. Best for binary 'Occupied/Empty' detection. Can be affected by direct sunlight." },
                           { name: "LDR + Laser", desc: "High precision. Ideal for beam-break detection across slot boundaries." }
                         ].map((s, i) => (
                           <div key={`iot-sensor-${s.name}-${i}`} className="space-y-1">
                              <p className="text-xs font-bold text-white">{s.name}</p>
                              <p className="text-[10px] text-slate-400 leading-relaxed font-medium">{s.desc}</p>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="p-8 bg-white/5 rounded-[2.5rem] border border-white/10 space-y-6">
                      <h3 className="text-xl font-display font-bold text-white flex items-center gap-3">
                         <RefreshCw size={20} className="text-brand-primary" />
                         Transmission Logic
                      </h3>
                      <div className="bg-black/40 p-4 rounded-xl font-mono text-[10px] text-slate-300 leading-relaxed">
                         <p className="text-brand-primary mb-2">// Sample ESP32 / Arduino Code</p>
                         <p>if (distance &lt; SLOT_THRESHOLD) &#123;</p>
                         <p className="ml-4">updateSlotStatus(slotID, "occupied");</p>
                         <p>&#125; else if (hasReservedStatus) &#123;</p>
                         <p className="ml-4">updateSlotStatus(slotID, "reserved");</p>
                         <p>&#125; else &#123;</p>
                         <p className="ml-4">updateSlotStatus(slotID, "available");</p>
                         <p>&#125;</p>
                      </div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Connect via MQTT or WebSocket for real-time delta updates</p>
                   </div>
                </div>

                <div className="p-8 bg-brand-primary/10 rounded-[2.5rem] border border-brand-primary/20">
                   <h4 className="text-[10px] font-black text-brand-primary uppercase tracking-[0.3em] mb-4">Neural Feedback Integration</h4>
                   <p className="text-xs text-white/80 leading-relaxed font-medium">
                      Integrate with our Firestore real-time listeners. When the sensor detects a state change, push to the 'slots' collection. The UI will automatically recalibrate globally.
                   </p>
                </div>
             </section>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {adminNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-10 left-1/2 -translate-x-1/2 z-[200] px-8 py-4 rounded-2xl shadow-2xl border ${
              adminNotification.type === 'success' 
              ? 'bg-brand-primary text-background-deep border-brand-primary/20' 
              : 'bg-red-500 text-white border-red-500/20'
            } font-black uppercase tracking-widest text-[11px] flex items-center gap-3`}
          >
            {adminNotification.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {adminNotification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Transmission Hub (Chat Overlay) */}
      <AnimatePresence>
        {selectedChatUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.section 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-2xl h-[80vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/10"
            >
              <div className="p-8 border-b border-slate-200 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/[0.02]">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-brand-primary/20 flex items-center justify-center text-brand-primary">
                    <MessageSquare size={28} />
                  </div>
                  <div>
                    <h4 className="text-xl font-display font-bold text-slate-900 tracking-tight leading-none mb-1">Transmission Hub</h4>
                    <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest">Target: {chats.find(c => c.userId === selectedChatUser)?.userEmail || 'Node'}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedChatUser(null)} 
                  className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-red-500 transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-white dark:bg-slate-900">
                {chatMessages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center opacity-30 space-y-4">
                      <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center">
                         <MessageSquare size={32} />
                      </div>
                      <p className="text-sm font-bold uppercase tracking-widest">No signals detected</p>
                   </div>
                )}
                {chatMessages.map((msg, idx) => (
                  <div key={`msg-item-${msg.id || idx}-${idx}`} className={`flex ${msg.isAdmin ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-5 rounded-3xl text-sm font-medium shadow-sm leading-relaxed ${
                      msg.isAdmin 
                        ? 'bg-brand-primary text-background-deep rounded-tr-none' 
                        : 'bg-slate-100 dark:bg-white/5 text-slate-900 dark:text-white rounded-tl-none border border-slate-200 dark:border-white/5'
                    }`}>
                      {msg.text}
                      <p className={`text-[9px] mt-2 font-mono opacity-50 ${msg.isAdmin ? 'text-slate-900' : 'text-slate-500'}`}>
                        {msg.timestamp ? new Date(msg.timestamp.toDate()).toLocaleTimeString() : 'Transmitting...'}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
              <form onSubmit={handleSendMessage} className="p-8 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-200 dark:border-white/5">
                <div className="relative">
                  <input 
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Input command signal..."
                    className="w-full h-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl px-6 pr-16 text-sm font-bold outline-none focus:border-brand-primary transition-all text-slate-900 dark:text-white shadow-inner"
                  />
                  <button 
                    type="submit" 
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-brand-primary text-background-deep rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(132,204,22,0.3)] hover:scale-105 active:scale-95 transition-all"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </form>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Grid Entry Modal */}
      <AnimatePresence>
        {showOfflineBooking && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-md">
            <motion.section 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-slate-200 dark:border-white/10"
            >
              <div className="p-10 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] flex justify-between items-center">
                <div className="space-y-1">
                  <h2 className="text-2xl font-display font-black text-slate-950 tracking-tight">Manual Grid Entry</h2>
                  <p className="text-[10px] text-brand-primary font-black uppercase tracking-widest">Assigning Slot: {showOfflineBooking.number}</p>
                </div>
                <button 
                  onClick={() => setShowOfflineBooking(null)}
                  className="w-12 h-12 flex items-center justify-center bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-red-500 transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleOfflineBooking} className="p-10 space-y-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vehicle Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['4-Wheeler', 'Bike'] as VehicleType[]).map((type, tIdx) => (
                        <button
                          key={`offline-form-type-${type}-${tIdx}`}
                          type="button"
                          onClick={() => setOfflineForm(prev => ({ ...prev, vehicleType: type }))}
                          className={`h-14 rounded-2xl flex items-center justify-center gap-2 border-2 transition-all font-black text-[10px] uppercase tracking-widest ${
                            offlineForm.vehicleType === type 
                            ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' 
                            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400'
                          }`}
                        >
                          {type === '4-Wheeler' ? <Car size={16} /> : <Bike size={16} />}
                          {type === '4-Wheeler' ? 'Car' : 'Bike'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Payment Hub</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="h-14 rounded-2xl bg-brand-primary/10 border-2 border-brand-primary flex items-center justify-center gap-3 text-brand-primary font-black text-[10px] uppercase tracking-widest shadow-lg shadow-brand-primary/5">
                        <DollarSign size={18} />
                        Cash
                      </div>
                      <button
                        type="button"
                        onClick={() => setOfflineForm(prev => ({ ...prev, isFree: !prev.isFree }))}
                        className={`h-14 rounded-2xl flex items-center justify-center gap-2 border-2 transition-all font-black text-[10px] uppercase tracking-widest ${
                          offlineForm.isFree 
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' 
                          : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400'
                        }`}
                      >
                        <ShieldCheck size={16} />
                        Free Entry
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Vehicle Registration</label>
                    <input 
                      required
                      placeholder="KA-01-XX-0000"
                      value={offlineForm.vehicleNumber}
                      onChange={(e) => setOfflineForm(prev => ({ ...prev, vehicleNumber: e.target.value.toUpperCase() }))}
                      className="w-full h-16 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 font-mono font-bold text-lg tracking-widest text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-inner"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Owner Name</label>
                      <input 
                        placeholder="Name"
                        value={offlineForm.ownerName}
                        onChange={(e) => setOfflineForm(prev => ({ ...prev, ownerName: e.target.value }))}
                        className="w-full h-16 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 font-bold text-sm text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-inner"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Contact Protocol</label>
                      <input 
                        placeholder="Phone Number"
                        value={offlineForm.phone}
                        onChange={(e) => setOfflineForm(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full h-16 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-6 font-bold text-sm text-slate-900 dark:text-white focus:ring-4 focus:ring-brand-primary/20 outline-none transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 flex gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowOfflineBooking(null)}
                    className="flex-1 h-16 bg-slate-100 dark:bg-white/5 text-slate-500 font-black uppercase tracking-widest rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all border border-slate-200 dark:border-white/10"
                  >
                    Abort
                  </button>
                  <button 
                    type="submit"
                    disabled={isBooking}
                    className="flex-[2] h-16 bg-brand-primary text-background-deep font-display font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-brand-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isBooking ? <RefreshCw size={24} className="animate-spin" /> : <Power size={24} />}
                    Authorize Entry
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      setSelectedSlotIds(new Set([showOfflineBooking.id]));
                      setShowOfflineBooking(null);
                      setShowBlockModal(true);
                    }}
                    className="w-16 h-16 bg-red-500/10 text-red-500 flex items-center justify-center rounded-2xl border border-red-500/20 hover:bg-red-500 hover:text-white transition-all shadow-lg"
                    title="Transition to Block Management"
                  >
                    <Ban size={24} />
                  </button>
                </div>
              </form>
            </motion.section>
          </div>
        )}
        {/* Block Management Modal */}
        <AnimatePresence>
          {showBlockModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
               <motion.div 
                 initial={{ opacity: 0 }}
                 animate={{ opacity: 1 }}
                 exit={{ opacity: 0 }}
                 onClick={() => setShowBlockModal(false)}
                 className="absolute inset-0 bg-black/80 backdrop-blur-md"
               />
               <motion.div 
                 initial={{ scale: 0.9, opacity: 0, y: 20 }}
                 animate={{ scale: 1, opacity: 1, y: 0 }}
                 exit={{ scale: 0.9, opacity: 0, y: 20 }}
                 className="bg-slate-900 border border-white/10 w-full max-w-lg rounded-[3rem] p-10 relative z-10 shadow-2xl space-y-8"
               >
                  <div className="flex justify-between items-center">
                     <div className="space-y-1">
                        <h3 className="text-2xl font-display font-black text-white tracking-tight">Slot Management</h3>
                        <p className="text-[10px] font-black text-brand-primary uppercase tracking-[0.4em]">Node Reassignment protocol</p>
                     </div>
                     <button onClick={() => setShowBlockModal(false)} className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-all">
                        <X size={24} />
                     </button>
                  </div>

                  <div className="space-y-6">
                     <div className="bg-white/5 rounded-2xl p-4 border border-white/10 flex items-center justify-between">
                        <div>
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Active Selection</p>
                           <p className="text-sm font-display font-bold text-white">{selectedSlotIds.size} Neural Nodes</p>
                        </div>
                        <div className="flex -space-x-2">
                           {Array.from(selectedSlotIds).slice(0, 3).map(id => {
                              const slot = adminSlots.find(s => s.id === id);
                              return (
                                 <div key={`modal-slot-${id}`} className="w-8 h-8 rounded-lg bg-brand-primary/20 border border-brand-primary/40 flex items-center justify-center text-[10px] font-black text-brand-primary">
                                    {slot?.number}
                                 </div>
                              );
                           })}
                           {selectedSlotIds.size > 3 && (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-black text-white">
                                 +{selectedSlotIds.size - 3}
                              </div>
                           )}
                        </div>
                     </div>

                     <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Grid Management Protocol</label>
                        <div className="grid grid-cols-1 gap-3">
                           <button
                              onClick={() => {
                                 setBlockTargetStatus('blocked');
                                 setBlockOptions({...blockOptions, type: 'permanent', duration: 'permanent'});
                              }}
                              className={`flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all ${
                                 blockOptions.type === 'permanent' ? 'bg-brand-primary/10 border-brand-primary text-brand-primary' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                              }`}
                           >
                              <div className="flex items-center gap-3">
                                 <div className={`p-3 rounded-xl ${blockOptions.type === 'permanent' ? 'bg-brand-primary text-background-deep' : 'bg-white/5'}`}>
                                    <ShieldCheck size={20} />
                                 </div>
                                 <div className="text-left">
                                    <p className="text-xs font-black uppercase tracking-widest">Permanent Lockdown</p>
                                    <p className="text-[9px] opacity-60 font-medium">Decommission node from primary index</p>
                                 </div>
                              </div>
                              {blockOptions.type === 'permanent' && <CheckCircle2 size={16} />}
                           </button>

                           <button
                              onClick={() => {
                                 setBlockTargetStatus('maintenance');
                                 setBlockOptions({...blockOptions, type: 'maintenance'});
                              }}
                              className={`flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all ${
                                 blockOptions.type === 'maintenance' ? 'bg-amber-500/10 border-amber-500 text-amber-500' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                              }`}
                           >
                              <div className="flex items-center gap-3">
                                 <div className={`p-3 rounded-xl ${blockOptions.type === 'maintenance' ? 'bg-amber-500 text-slate-900' : 'bg-white/5'}`}>
                                    <Activity size={20} />
                                 </div>
                                 <div className="text-left">
                                    <p className="text-xs font-black uppercase tracking-widest">Tactical Maintenance</p>
                                    <p className="text-[9px] opacity-60 font-medium">Scheduled offline window for hardware sync</p>
                                 </div>
                              </div>
                              {blockOptions.type === 'maintenance' && <CheckCircle2 size={16} />}
                           </button>

                           <button
                              onClick={() => {
                                 setBlockTargetStatus('blocked');
                                 setBlockOptions({...blockOptions, type: 'cancellation', duration: 'permanent'});
                              }}
                              className={`flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all ${
                                 blockOptions.type === 'cancellation' ? 'bg-red-500/10 border-red-500 text-red-500' : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                              }`}
                           >
                              <div className="flex items-center gap-3">
                                 <div className={`p-3 rounded-xl ${blockOptions.type === 'cancellation' ? 'bg-red-500 text-white' : 'bg-white/5'}`}>
                                    <XCircle size={20} />
                                 </div>
                                 <div className="text-left">
                                    <p className="text-xs font-black uppercase tracking-widest">Force Cancellation</p>
                                    <p className="text-[9px] opacity-60 font-medium">Terminate session & isolate node</p>
                                 </div>
                              </div>
                              {blockOptions.type === 'cancellation' && <CheckCircle2 size={16} />}
                           </button>
                        </div>
                     </div>

                     {blockOptions.type === 'maintenance' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 bg-white/5 p-6 rounded-3xl border border-white/5">
                           <div className="flex items-center justify-between">
                              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Maintenance Duration</label>
                              <p className="text-[9px] font-black text-emerald-500 uppercase">Auto-Reversion Enabled</p>
                           </div>
                           <div className="grid grid-cols-4 gap-2">
                              {[
                                 { label: 'Short', val: '1h', icon: <Clock size={12} /> },
                                 { label: 'Long', val: '4h', icon: <Clock size={12} /> },
                                 { label: 'Day', val: 'day', icon: <Calendar size={12} /> },
                                 { label: 'Inf.', val: 'permanent', icon: <ShieldCheck size={12} /> }
                              ].map(dur => (
                                 <button
                                    key={`dur-opt-${dur.val}`}
                                    onClick={() => setBlockOptions({...blockOptions, duration: dur.val})}
                                    className={`px-2 py-3 rounded-xl flex flex-col items-center gap-2 border transition-all ${
                                       blockOptions.duration === dur.val ? 'bg-emerald-500 text-slate-900 border-emerald-500' : 'bg-white/5 border-transparent text-slate-500'
                                    }`}
                                 >
                                    {dur.icon}
                                    <span className="text-[9px] font-black uppercase tracking-tighter">{dur.label}</span>
                                 </button>
                              ))}
                           </div>
                           
                           <div className="flex gap-2">
                              <button 
                                 onClick={() => setBlockOptions({...blockOptions, duration: 'custom'})}
                                 className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                    blockOptions.duration === 'custom' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-white/5 border-transparent text-slate-500'
                                 }`}
                              >
                                 Custom Duration
                              </button>
                           </div>
                           
                           {blockOptions.duration === 'custom' && (
                              <div className="flex items-center gap-3 mt-2 animate-in fade-in">
                                 <input 
                                    type="number"
                                    placeholder="Neural hours..."
                                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white text-xs outline-none focus:border-emerald-500"
                                    onChange={(e) => {
                                       const val = e.target.value;
                                       setBlockOptions(prev => ({...prev, customHours: val}));
                                    }}
                                 />
                                 <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Hours</span>
                              </div>
                           )}
                        </div>
                      )}
                      
                      {/* removed justification section */}
                  </div>

                  <div className="pt-4 space-y-3">
                     <button 
                        onClick={() => {
                           const mappedStatus: SlotStatus = blockOptions.type === 'maintenance' ? 'maintenance' : 'blocked';
                           handleBulkUpdate(mappedStatus, blockOptions);
                        }}
                        className="w-full h-16 rounded-[2rem] font-display font-black uppercase tracking-[0.2em] text-sm shadow-2xl transition-all flex items-center justify-center gap-3 overflow-hidden relative group bg-brand-primary text-background-deep shadow-brand-primary/40 hover:scale-[1.02] active:scale-[0.98]"
                     >
                        <div className="flex items-center gap-3 relative z-10">
                           <ShieldCheck size={18} className="group-hover:rotate-12 transition-transform" />
                           <span>{blockOptions.type === 'cancellation' ? 'Authorize Force Cancellation' : 
                            blockOptions.type === 'maintenance' ? 'Execute Tactical Maintenance' : 
                            'Authorize Permanent Lockdown'} ({selectedSlotIds.size})</span>
                        </div>
                        <motion.div 
                           className="absolute inset-0 bg-white/20"
                           initial={{ x: '-100%' }}
                           animate={{ x: '100%' }}
                           transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        />
                     </button>
                     <p className="text-center text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">
                        All actions are logged to administrative registry
                     </p>
                  </div>
               </motion.div>
            </div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </motion.div>
  );
}

function MetricCard({ icon, label, value, sub, color = "text-black" }: any) {
  return (
    <div className="bg-white dark:bg-slate-900/60 p-8 rounded-[2.5rem] space-y-6 border border-slate-200 dark:border-white/10 transition-all group hover:bg-slate-50 dark:hover:bg-slate-900/80 shadow-2xl relative overflow-hidden">
      <div className="w-16 h-16 rounded-2xl bg-slate-50 dark:bg-white/10 flex items-center justify-center transition-all duration-500 text-black dark:text-brand-primary group-hover:bg-brand-primary group-hover:text-background-deep group-hover:rotate-6 group-hover:scale-110 shadow-sm">
        {icon}
      </div>
      <div className="relative z-10">
        <h4 className={`text-5xl font-display font-black tracking-tighter ${color}`}>
          {value}<span className="text-xs ml-3 font-black text-black dark:text-slate-400 underline decoration-brand-primary/30 tracking-widest uppercase">{sub}</span>
        </h4>
        <p className="text-[12px] text-black font-black uppercase tracking-[0.4em] mt-3 leading-none">{label}</p>
      </div>
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-700">
          <Activity size={100} />
      </div>
    </div>
  );
}

function LegendItem({ dot, label }: any) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-900 rounded-full border-2 border-slate-200 dark:border-white/20 transition-all hover:scale-105 shadow-md">
       <div className={`w-4 h-4 rounded-full ${dot} shadow-lg border-2 border-white/40`} />
       <span className="text-[13px] font-black text-black uppercase tracking-wider leading-none">{label}</span>
    </div>
  );
}

function ControlButton({ icon, label, onClick, danger = false }: any) {
  return (
    <button onClick={onClick} className={`w-full h-16 flex items-center gap-4 px-6 rounded-2xl transition-all border group ${
      danger 
        ? 'bg-red-500/5 border-red-500/10 text-red-500 hover:bg-red-500 hover:text-white' 
        : 'bg-white/5 border-white/5 text-slate-400 hover:border-brand-primary/20 hover:text-white'
    }`}>
       <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${danger ? 'bg-red-500/10' : 'bg-white/5 group-hover:bg-brand-primary/10 group-hover:text-brand-primary'}`}>
        {icon}
       </div>
       <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
    </button>
  );
}

function DeleteUserButton({ user, onDelete, isDeleting }: { user: any, onDelete: (u: any) => void, isDeleting: boolean }) {
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (confirm) {
      const timer = setTimeout(() => setConfirm(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [confirm]);

  if (confirm) {
    return (
      <button 
        onClick={() => onDelete(user)}
        disabled={isDeleting}
        className="h-12 px-6 rounded-2xl bg-red-600 text-white text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center gap-2 active:scale-95 shadow-lg shadow-red-600/30"
      >
        {isDeleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {isDeleting ? 'Erasing...' : 'Confirm Purge'}
      </button>
    );
  }

  return (
    <button 
      onClick={() => setConfirm(true)}
      disabled={isDeleting}
      title="Delete User"
      className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-500/10 hover:border-red-500/20 transition-all active:scale-95 disabled:opacity-50"
    >
      <Trash2 size={16} />
    </button>
  );
}
