package jp.lg.kasumidai.yoyaku.domain.fee;

import java.util.List;

/**
 * 料金算定(REQ-015。KSM-BRL-001 §3.1)。
 *
 * <p>明細料金 = 基本料金(施設×面・室×コマ×利用者区分)+ Σ付帯設備料金(設備×数量×コマ)。
 * 市外加算は係数計算をせずマスタに実額を持つ(条例別表との突合容易性)。
 * 減免による按分計算のみ円未満切捨て(ExemptionCalculator)。
 */
public final class FeeCalculator {

  /** 算定明細を合算する(減免額は ExemptionCalculator の結果を受け取る)。 */
  public FeeCalculation calculate(List<FeeBreakdownItem> items, long exemptionAmountYen) {
    long base = items.stream().mapToLong(FeeBreakdownItem::baseAmountYen).sum();
    long equipment = items.stream().mapToLong(FeeBreakdownItem::equipmentAmountYen).sum();
    if (exemptionAmountYen < 0 || exemptionAmountYen > base + equipment) {
      throw new IllegalArgumentException("減免額が不正です: " + exemptionAmountYen);
    }
    return new FeeCalculation(List.copyOf(items), base, equipment, exemptionAmountYen);
  }
}
