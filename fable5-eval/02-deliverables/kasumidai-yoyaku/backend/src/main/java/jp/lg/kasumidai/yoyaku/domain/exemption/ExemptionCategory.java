package jp.lg.kasumidai.yoyaku.domain.exemption;

/**
 * 減免区分(REQ-018。KSM-BRL-001 §4.1。QA No.13で市了承=3区分確定)。
 * 全額免除100%/半額減額50%/個別決定0〜100%(承認時に率を入力)。
 */
public enum ExemptionCategory {
  FULL_EXEMPTION(100),
  HALF_REDUCTION(50),
  INDIVIDUAL(-1);

  private final int fixedRatePercent;

  ExemptionCategory(int fixedRatePercent) {
    this.fixedRatePercent = fixedRatePercent;
  }

  /** 固定率(個別決定は承認時入力のため -1)。 */
  public int fixedRatePercent() {
    return fixedRatePercent;
  }

  public boolean isRateFixed() {
    return fixedRatePercent >= 0;
  }
}
