/**
 * 予約ゲートウェイ(ドメイン層→インフラ層の参照点)。
 * インフラ層のAPI応答をドメイン型へ写像する(KSM-DEV-001 §2:隣接層のみ参照)。
 */
import {
  getCancellationPreview,
  postCancellation,
  postReservation,
} from '../../infrastructure/reservationApi';
import type { CancellationInfo, ReservationResult, SlotSelection } from '../types';

export const submitReservation = async (
  facilityId: number,
  purpose: string,
  slots: SlotSelection[],
  idempotencyKey: string,
): Promise<ReservationResult> => {
  const response = await postReservation({
    facilityId,
    purpose,
    items: slots.map((slot) => ({
      unitId: slot.unitId,
      useDate: slot.useDate,
      slotId: slot.slotId,
    })),
    idempotencyKey,
  });
  return response;
};

export const fetchCancellationPreview = async (
  reservationId: number,
): Promise<CancellationInfo> => getCancellationPreview(reservationId);

export const requestCancellation = async (reservationId: number): Promise<CancellationInfo> =>
  postCancellation(reservationId);
