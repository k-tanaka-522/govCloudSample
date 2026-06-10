package jp.lg.kasumidai.yoyaku.domain.exemption;

import java.util.List;

/**
 * 減免計算(KSM-BRL-001 §4.3)。
 *
 * <p>減免額 = 請求額(基本+設備)× 減免率、円未満切捨て。
 * 複数減免区分の併用は不可。該当区分が複数ある場合は利用者に最も有利な1区分を適用する。
 */
public final class ExemptionCalculator {

  private static final int PERCENT_BASE = 100;
  private static final int MAX_RATE = 100;

  /** 減免額を算定する(円未満切捨て=整数円×率の整数除算)。 */
  public long exemptionAmount(long chargeableAmountYen, int ratePercent) {
    requireValidRate(ratePercent);
    if (chargeableAmountYen < 0) {
      throw new IllegalArgumentException("基礎額が負値です: " + chargeableAmountYen);
    }
    return chargeableAmountYen * ratePercent / PERCENT_BASE;
  }

  /** 最も有利(率が最大)な1区分の率を選択する(併用不可)。 */
  public int selectMostFavorableRate(List<Integer> candidateRates) {
    return candidateRates.stream()
        .peek(this::requireValidRate)
        .max(Integer::compareTo)
        .orElse(0);
  }

  private void requireValidRate(int ratePercent) {
    if (ratePercent < 0 || ratePercent > MAX_RATE) {
      throw new IllegalArgumentException("減免率は0〜100%の範囲とすること: " + ratePercent);
    }
  }
}
