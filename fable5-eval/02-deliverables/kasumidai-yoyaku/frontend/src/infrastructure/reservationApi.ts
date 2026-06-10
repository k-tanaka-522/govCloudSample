/** 予約API呼出し(インフラ層。KSM-DDD-001 §4.3)。 */
import { getJson, postJson } from './httpClient';

export interface ReservationItemRequest {
  unitId: number;
  useDate: string;
  slotId: number;
}

export interface ReservationApiRequest {
  facilityId: number;
  purpose: string;
  items: ReservationItemRequest[];
  idempotencyKey: string;
}

export interface BillingResponse {
  baseAmount: number;
  equipmentAmount: number;
  exemptionAmount: number;
  billedAmount: number;
  dueAt: string;
  detail: {
    unitId: number;
    useDate: string;
    slotId: number;
    appliedFeeId: number;
    amount: number;
  }[];
}

export interface ReservationApiResponse {
  reservationId: number;
  status: string;
  billing: BillingResponse;
  paymentMethods: string[];
}

export interface CancellationApiResponse {
  cancellationCharge: number;
  expectedRefund: number;
  freeCancelDeadline: string;
  cancelled: boolean;
}

export const postReservation = (
  request: ReservationApiRequest,
): Promise<ReservationApiResponse> => postJson('/api/user/v1/reservations', request);

export const getCancellationPreview = (
  reservationId: number,
): Promise<CancellationApiResponse> =>
  getJson(`/api/user/v1/reservations/${String(reservationId)}/cancellation`);

export const postCancellation = (reservationId: number): Promise<CancellationApiResponse> =>
  postJson(`/api/user/v1/reservations/${String(reservationId)}/cancellation`, {});
