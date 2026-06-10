package jp.lg.kasumidai.yoyaku.domain.reservation;

import java.time.LocalDate;

/**
 * 予約対象コマ(面・室×利用日×コマ)。値オブジェクト(KSM-DDD-001 §3.4 reservation_details に対応)。
 */
public record SlotRequest(long unitId, LocalDate useDate, long slotId) implements Comparable<SlotRequest> {

  /** デッドロック防止のため (unit_id, use_date, slot_id) 昇順に正規化する(KSM-BRL-001 §2.2-2)。 */
  @Override
  public int compareTo(SlotRequest other) {
    int byUnit = Long.compare(unitId, other.unitId);
    if (byUnit != 0) {
      return byUnit;
    }
    int byDate = useDate.compareTo(other.useDate);
    if (byDate != 0) {
      return byDate;
    }
    return Long.compare(slotId, other.slotId);
  }
}
