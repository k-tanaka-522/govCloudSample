/** ドメイン型定義(バックエンドAPI=KSM-DDD-001 §4 と対応)。 */

/** コマ状態(空き/予約済み/休館/優先枠)。 */
export type SlotStatus = 'OPEN' | 'RESERVED' | 'CLOSED' | 'PRIORITY';

/** 空き状況の1コマ。 */
export interface AvailabilitySlot {
  unitId: number;
  useDate: string;
  slotId: number;
  status: SlotStatus;
}

/** 予約申込のコマ指定。 */
export interface SlotSelection {
  unitId: number;
  useDate: string;
  slotId: number;
}

/** 料金内訳行(算定明細=KSM-BRL-001 §3.1)。 */
export interface FeeDetailLine {
  unitId: number;
  useDate: string;
  slotId: number;
  appliedFeeId: number;
  amount: number;
}

/** 請求内訳。 */
export interface Billing {
  baseAmount: number;
  equipmentAmount: number;
  exemptionAmount: number;
  billedAmount: number;
  dueAt: string;
  detail: FeeDetailLine[];
}

/** 予約申込の結果。 */
export interface ReservationResult {
  reservationId: number;
  status: string;
  billing: Billing;
  paymentMethods: string[];
}

/** 取消の事前表示・結果(SC-U10)。 */
export interface CancellationInfo {
  cancellationCharge: number;
  expectedRefund: number;
  freeCancelDeadline: string;
  cancelled: boolean;
}
