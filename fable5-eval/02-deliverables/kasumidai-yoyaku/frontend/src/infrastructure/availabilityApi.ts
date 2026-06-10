/** 空き状況照会API呼出し(インフラ層。未ログイン・CloudFrontキャッシュ60秒=KSM-ADR-009)。 */
import { getJson } from './httpClient';

export interface AvailabilityApiSlot {
  unitId: number;
  useDate: string;
  slotId: number;
  status: string;
}

export const getMonthlyAvailability = (
  facilityId: number,
  month: string,
): Promise<AvailabilityApiSlot[]> =>
  getJson(
    `/api/public/v1/availabilities?facilityId=${String(facilityId)}&month=${encodeURIComponent(month)}`,
  );
