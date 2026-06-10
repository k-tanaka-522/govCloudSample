/**
 * 料金の表示計算(KSM-BRL-001 §3/§4)。確定計算の正はサーバ側(FeeCalculator)。
 * 減免の按分計算のみ円未満切捨て(§4.3)。
 */
import { PERCENT_BASE } from './constants';
import type { Billing } from './types';

/** 減免額(円未満切捨て)。 */
export const exemptionAmount = (chargeableAmount: number, ratePercent: number): number => {
  if (ratePercent < 0 || ratePercent > PERCENT_BASE) {
    throw new Error(`減免率は0〜100%の範囲で指定してください: ${String(ratePercent)}`);
  }
  return Math.floor((chargeableAmount * ratePercent) / PERCENT_BASE);
};

/** 請求合計の整合確認(表示前の防御的検算)。 */
export const isBillingConsistent = (billing: Billing): boolean =>
  billing.billedAmount ===
  billing.baseAmount + billing.equipmentAmount - billing.exemptionAmount;

/** 金額の表示書式(例:2,800円)。 */
export const formatYen = (amount: number): string => `${amount.toLocaleString('ja-JP')}円`;
