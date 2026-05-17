/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VehicleType = 'Bike' | '4-Wheeler' | 'Tempo' | 'Truck';
export type SlotStatus = 'available' | 'reserved' | 'occupied' | 'blocked' | 'maintenance' | 'out_of_service';

export interface Vehicle {
  id: string;
  userId?: string;
  type: VehicleType;
  number: string;
  ownerName: string;
  phone: string;
}

export type BlockType = 'permanent' | 'maintenance' | 'temporary' | 'manual_override' | 'cancellation';

export interface Slot {
  id: string;
  number: string;
  floor: number;
  type: VehicleType;
  status: SlotStatus;
  currentBookingId?: string;
  currentVehicleType?: VehicleType;
  locationId?: string;
  blockMetadata?: {
    type: BlockType;
    comment?: string;
    blockedAt?: number;
    blockedUntil?: number;
    duration?: string; // '1h', '4h', 'day', 'permanent'
  };
}

export interface Location {
  id: string;
  name: string;
  address: string;
  distance?: string;
  rating?: number;
  prices: {
    [key in VehicleType]: number;
  };
  totalSlots: number;
  availableSlots: number;
  floors: number;
}

export interface ParkingTicket {
  id: string;
  vehicleId: string;
  slotId: string;
  startTime: number;
  endTime?: number | null;
  totalAmount?: number;
  duration?: number;
  bookingType?: 'Instant' | 'Pre-booking';
  arrivalTime?: string;
  preBookingFee?: number;
  status: 'reserved' | 'active' | 'completed' | 'cancelled';
  paymentStatus?: 'pending' | 'paid';
  paymentMethod?: 'upi' | 'cash';
  userId?: string;
  vehicleNumber?: string;
  vehicleType?: VehicleType;
  ownerName?: string;
  phone?: string;
  slotNumber?: string;
  locationName?: string;
  userArrived?: boolean;
}
