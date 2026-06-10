/** 空き状況ゲートウェイ(ドメイン層→インフラ層)。 */
import { getMonthlyAvailability } from '../../infrastructure/availabilityApi';
import type { AvailabilitySlot, SlotStatus } from '../types';

const toStatus = (status: string): SlotStatus => {
  switch (status) {
    case 'RESERVED':
      return 'RESERVED';
    case 'CLOSED':
      return 'CLOSED';
    case 'PRIORITY':
      return 'PRIORITY';
    default:
      return 'OPEN';
  }
};

export const fetchMonthlyAvailability = async (
  facilityId: number,
  month: string,
): Promise<AvailabilitySlot[]> => {
  const slots = await getMonthlyAvailability(facilityId, month);
  return slots.map((slot) => ({
    unitId: slot.unitId,
    useDate: slot.useDate,
    slotId: slot.slotId,
    status: toStatus(slot.status),
  }));
};
