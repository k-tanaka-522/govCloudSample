package jp.lg.kasumidai.yoyaku.domain.exemption;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 減免計算のテスト(KSM-BRL-001 §4=QA No.13確定:3区分。端数=円未満切捨ての仕様証明)。
 */
class ExemptionCalculatorTest {

  private final ExemptionCalculator calculator = new ExemptionCalculator();

  @Test
  @DisplayName("全額免除100%:減免額=請求額全額")
  void fullExemption() {
    assertThat(calculator.exemptionAmount(2800L, ExemptionCategory.FULL_EXEMPTION.fixedRatePercent()))
        .isEqualTo(2800L);
  }

  @Test
  @DisplayName("半額減額50%:奇数額は円未満切捨て(2801円の50%=1400円)")
  void halfReductionRoundsDown() {
    assertThat(calculator.exemptionAmount(2801L, ExemptionCategory.HALF_REDUCTION.fixedRatePercent()))
        .isEqualTo(1400L);
  }

  @Test
  @DisplayName("個別決定:任意率(例33%)も円未満切捨て(1000円の33%=330円、999円の33%=329円)")
  void individualRateRoundsDown() {
    assertThat(calculator.exemptionAmount(1000L, 33)).isEqualTo(330L);
    assertThat(calculator.exemptionAmount(999L, 33)).isEqualTo(329L);
  }

  @Test
  @DisplayName("複数区分該当時は最も有利な1区分を適用(併用不可=KSM-BRL-001 §4.3)")
  void selectsMostFavorableSingleCategory() {
    assertThat(calculator.selectMostFavorableRate(List.of(50, 100, 30))).isEqualTo(100);
  }

  @Test
  @DisplayName("率の範囲検証:0〜100%以外は拒否")
  void rejectsInvalidRate() {
    assertThatThrownBy(() -> calculator.exemptionAmount(1000L, 101))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> calculator.exemptionAmount(1000L, -1))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
