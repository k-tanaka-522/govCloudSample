/**
 * 予約申込ユースケース(アプリケーション層)。
 * クライアント側プレチェック(早期フィードバック)→ゲートウェイ呼出し。
 * 二重送信防止の冪等キーを生成(KSM-DDD-001 §4.4)。
 */
import { describeCancellationRule } from '../domain/cancellation';
import {
  fetchCancellationPreview,
  requestCancellation,
  submitReservation,
} from '../domain/gateways/reservationGateway';
import { validateSelection } from '../domain/limits';
import type { CancellationInfo, ReservationResult, SlotSelection } from '../domain/types';

export type { CancellationInfo, ReservationResult, SlotSelection } from '../domain/types';
export { formatYen } from '../domain/fee';

/** 申込前のプレチェック(エラーメッセージ一覧。空=通過)。 */
export const precheckSelection = (slots: SlotSelection[]): string[] => validateSelection(slots);

/** 確認画面に表示する取消規則の説明(REQ-011。QA No.11確定値)。 */
export const cancellationRuleDescription = (): string => describeCancellationRule();

/** 先着予約申込(一括対応。全件成立または全件不成立=REQ-010)。 */
export const reserve = async (
  facilityId: number,
  purpose: string,
  slots: SlotSelection[],
): Promise<ReservationResult> => {
  const errors = precheckSelection(slots);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
  return submitReservation(facilityId, purpose, slots, crypto.randomUUID());
};

/** 取消の事前表示(取消期限・キャンセル料・還付見込=SC-U10)。 */
export const previewCancellation = (reservationId: number): Promise<CancellationInfo> =>
  fetchCancellationPreview(reservationId);

/** 取消の確定。 */
export const cancelReservation = (reservationId: number): Promise<CancellationInfo> =>
  requestCancellation(reservationId);
