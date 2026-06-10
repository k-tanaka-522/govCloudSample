import { describe, expect, it } from 'vitest';
import { validateSelection } from './limits';
import type { SlotSelection } from './types';

/** 上限プレチェックのテスト(KSM-BRL-001 §1/§2=QA No.10確定値)。 */
describe('limits precheck', () => {
  const slot = (useDate: string, slotId: number): SlotSelection => ({
    unitId: 1,
    useDate,
    slotId,
  });

  it('正常な選択はエラーなし', () => {
    expect(validateSelection([slot('2026-07-04', 1), slot('2026-07-11', 1)])).toEqual([]);
  });

  it('0件はエラー', () => {
    expect(validateSelection([])).not.toEqual([]);
  });

  it('境界値:同一日3コマは可・4コマはエラー(L-2)', () => {
    const three = [slot('2026-07-04', 1), slot('2026-07-04', 2), slot('2026-07-04', 3)];
    expect(validateSelection(three)).toEqual([]);
    const four = [...three, slot('2026-07-04', 4)];
    expect(validateSelection(four).some((m) => m.includes('3コマ'))).toBe(true);
  });

  it('境界値:26コマは可・27コマはエラー(展開上限)', () => {
    const days = Array.from({ length: 27 }, (_, i) =>
      slot(`2026-08-${String(i + 1).padStart(2, '0')}`, 1),
    );
    expect(validateSelection(days.slice(0, 26))).toEqual([]);
    expect(validateSelection(days).some((m) => m.includes('26コマ'))).toBe(true);
  });

  it('重複コマはエラー', () => {
    expect(
      validateSelection([slot('2026-07-04', 1), slot('2026-07-04', 1)]).some((m) =>
        m.includes('重複'),
      ),
    ).toBe(true);
  });
});
