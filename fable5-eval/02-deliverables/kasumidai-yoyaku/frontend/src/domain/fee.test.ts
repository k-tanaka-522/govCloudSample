import { describe, expect, it } from 'vitest';
import { exemptionAmount, formatYen, isBillingConsistent } from './fee';
import type { Billing } from './types';

/** 料金表示計算のテスト(KSM-BRL-001 §3/§4。減免は円未満切捨て)。 */
describe('fee', () => {
  it('減免額は円未満切捨て(2801円の50%=1400円)', () => {
    expect(exemptionAmount(2801, 50)).toBe(1400);
    expect(exemptionAmount(999, 33)).toBe(329);
  });

  it('減免率の範囲外は拒否', () => {
    expect(() => exemptionAmount(1000, 101)).toThrow();
    expect(() => exemptionAmount(1000, -1)).toThrow();
  });

  it('請求内訳の整合検算(基本+設備−減免=請求額)', () => {
    const billing: Billing = {
      baseAmount: 2400,
      equipmentAmount: 400,
      exemptionAmount: 0,
      billedAmount: 2800,
      dueAt: '2026-06-17T23:59:59+09:00',
      detail: [],
    };
    expect(isBillingConsistent(billing)).toBe(true);
    expect(isBillingConsistent({ ...billing, billedAmount: 2700 })).toBe(false);
  });

  it('金額の表示書式', () => {
    expect(formatYen(2800)).toBe('2,800円');
  });
});
