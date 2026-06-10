package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.OffsetDateTime;
import java.util.List;

/** 予約INSERT用の行(1予約+複数明細=KSM-DDD-001 §3.3 #10/#11)。 */
public record NewReservationRow(
    long userId,
    String purpose,
    String status,
    OffsetDateTime dueAt,
    long baseAmountYen,
    long equipmentAmountYen,
    long exemptionAmountYen,
    String calculationDetailJson,
    List<Detail> details) {

  /** 予約明細(コマ)行。 */
  public record Detail(long unitId, java.time.LocalDate useDate, long slotId, long amountYen) {}
}
