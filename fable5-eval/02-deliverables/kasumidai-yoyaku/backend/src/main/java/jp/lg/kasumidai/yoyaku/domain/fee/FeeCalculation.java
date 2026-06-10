package jp.lg.kasumidai.yoyaku.domain.fee;

import java.util.List;

/**
 * 料金算定結果(KSM-BRL-001 §3.1:請求額 = Σ明細料金 − 減免額)。
 */
public record FeeCalculation(
    List<FeeBreakdownItem> items, long baseAmountYen, long equipmentAmountYen, long exemptionAmountYen) {

  public long billedAmountYen() {
    return baseAmountYen + equipmentAmountYen - exemptionAmountYen;
  }
}
