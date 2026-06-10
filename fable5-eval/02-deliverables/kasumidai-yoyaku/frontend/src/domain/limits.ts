/**
 * 予約上限のクライアント側プレチェック(KSM-BRL-001 §1=QA No.10確定値)。
 * 申込前の早期フィードバック用。確定判定の正はサーバ側(ReservationLimitPolicy)。
 */
import { MAX_SLOTS_PER_REQUEST, SAME_DAY_MAX_SLOTS } from './constants';
import type { SlotSelection } from './types';

/** プレチェック結果(エラーメッセージの一覧。空=通過)。 */
export const validateSelection = (slots: SlotSelection[]): string[] => {
  const messages: string[] = [];
  if (slots.length === 0) {
    messages.push('コマを1つ以上選択してください。');
  }
  if (slots.length > MAX_SLOTS_PER_REQUEST) {
    messages.push(`一度に申込できるのは${String(MAX_SLOTS_PER_REQUEST)}コマまでです。`);
  }
  if (hasDuplicate(slots)) {
    messages.push('同じコマが重複して選択されています。');
  }
  for (const [date, count] of countByDate(slots)) {
    if (count > SAME_DAY_MAX_SLOTS) {
      messages.push(`${date} は同一日${String(SAME_DAY_MAX_SLOTS)}コマまでです。`);
    }
  }
  return messages;
};

const slotKey = (slot: SlotSelection): string =>
  `${String(slot.unitId)}:${slot.useDate}:${String(slot.slotId)}`;

const hasDuplicate = (slots: SlotSelection[]): boolean =>
  new Set(slots.map(slotKey)).size !== slots.length;

const countByDate = (slots: SlotSelection[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const slot of slots) {
    counts.set(slot.useDate, (counts.get(slot.useDate) ?? 0) + 1);
  }
  return counts;
};
