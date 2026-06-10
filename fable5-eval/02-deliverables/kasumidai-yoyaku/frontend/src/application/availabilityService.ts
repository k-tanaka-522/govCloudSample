/** 空き状況照会ユースケース(アプリケーション層)。 */
import { fetchMonthlyAvailability } from '../domain/gateways/availabilityGateway';
import type { AvailabilitySlot, SlotStatus } from '../domain/types';

export type { AvailabilitySlot, SlotStatus } from '../domain/types';

/** 施設×年月(YYYY-MM)の空き状況。 */
export const getMonthlySlots = (
  facilityId: number,
  month: string,
): Promise<AvailabilitySlot[]> => fetchMonthlyAvailability(facilityId, month);

/** 状態の表示記号+読み上げテキスト(色のみに依存しない=REQ-014/KSM-DDD-001 §1.5)。 */
export const statusLabel = (status: SlotStatus): { mark: string; text: string } => {
  switch (status) {
    case 'OPEN':
      return { mark: '○', text: '空き' };
    case 'RESERVED':
      return { mark: '×', text: '予約済み' };
    case 'CLOSED':
      return { mark: '−', text: '休館' };
    case 'PRIORITY':
      return { mark: '◆', text: '優先利用枠' };
  }
};
