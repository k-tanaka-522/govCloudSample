import { describe, expect, it } from 'vitest';
import {
  calculateCancellationCharge,
  daysBefore,
  describeCancellationRule,
  freeCancelDeadline,
} from './cancellation';

/**
 * キャンセル料表示計算の境界値テスト(KSM-BRL-001 1.1版 §3.1=QA No.11確定値)。
 * サーバ側 CancellationPolicyTest と同一の境界を検証(表示と確定計算の不一致防止)。
 */
describe('cancellation (QA No.11: 7日前まで無料/6日前以降100%)', () => {
  const useDate = '2026-07-10';
  const amount = 2800;

  it('利用日の8日前・7日前(境界)は無料', () => {
    expect(calculateCancellationCharge(useDate, '2026-07-02', amount)).toBe(0);
    expect(calculateCancellationCharge(useDate, '2026-07-03', amount)).toBe(0);
  });

  it('利用日の6日前(境界)以降は100%(中間料率なし)', () => {
    expect(calculateCancellationCharge(useDate, '2026-07-04', amount)).toBe(amount);
    expect(calculateCancellationCharge(useDate, '2026-07-09', amount)).toBe(amount);
    expect(calculateCancellationCharge(useDate, useDate, amount)).toBe(amount);
  });

  it('無料取消期限日=利用日の7日前', () => {
    expect(freeCancelDeadline(useDate)).toBe('2026-07-03');
  });

  it('日数計算が正しい', () => {
    expect(daysBefore(useDate, '2026-07-03')).toBe(7);
    expect(daysBefore(useDate, '2026-07-04')).toBe(6);
  });

  it('説明文に確定値(7日前・無料・全額)が含まれる', () => {
    const text = describeCancellationRule();
    expect(text).toContain('7日前');
    expect(text).toContain('無料');
    expect(text).toContain('全額');
  });
});
