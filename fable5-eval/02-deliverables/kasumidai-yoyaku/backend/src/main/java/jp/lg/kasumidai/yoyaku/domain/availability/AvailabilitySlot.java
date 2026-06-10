package jp.lg.kasumidai.yoyaku.domain.availability;

import java.time.LocalDate;

/** 空き状況の1コマ(REQ-006。アイコン+テキスト併記で色のみに依存しない=KSM-DDD-001 §1.5)。 */
public record AvailabilitySlot(long unitId, LocalDate useDate, long slotId, Status status) {

  /** コマ状態(空き/予約済み/休館/優先枠)。 */
  public enum Status {
    OPEN,
    RESERVED,
    CLOSED,
    PRIORITY
  }
}
