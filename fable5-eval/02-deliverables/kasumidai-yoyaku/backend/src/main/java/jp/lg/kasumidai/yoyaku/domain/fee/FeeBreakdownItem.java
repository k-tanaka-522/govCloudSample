package jp.lg.kasumidai.yoyaku.domain.fee;

import java.time.LocalDate;

/**
 * 算定明細の1行(billings.calculation_detail に保存し帳票・監査で再現可能とする。KSM-BRL-001 §3.1)。
 */
public record FeeBreakdownItem(
    long unitId,
    LocalDate useDate,
    long slotId,
    long appliedFeeId,
    long baseAmountYen,
    long equipmentAmountYen) {

  public long totalYen() {
    return baseAmountYen + equipmentAmountYen;
  }
}
