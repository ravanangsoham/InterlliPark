import { Location, Slot, VehicleType, SlotStatus } from '../types';

export const MOCK_LOCATIONS: Location[] = [
  {
    id: '1',
    name: 'MIT Campus',
    address: 'MIT Campus',
    distance: '0.1 km away',
    rating: 4.9,
    prices: { 
      Bike: 20, 
      '4-Wheeler': 40, 
      Tempo: 60, 
      Truck: 100 
    },
    totalSlots: 120,
    availableSlots: 25,
    floors: 2
  }
];

export const generateSlots = (floor: number): Slot[] => {
  const types: VehicleType[] = ['Bike', '4-Wheeler', 'Tempo', 'Truck'];
  const statuses: SlotStatus[] = ['available', 'occupied', 'blocked'];
  
  return Array.from({ length: 60 }, (_, i) => ({
    id: `f${floor}-s${i+1}`,
    number: (i + 1).toString().padStart(2, '0'),
    floor,
    type: types[i % 4],
    status: i === 5 || i === 12 ? 'blocked' : (i < 10 ? 'occupied' : 'available')
  }));
};
