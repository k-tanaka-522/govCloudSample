package jp.lg.kasumidai.yoyaku.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 料金算定の合算テスト(REQ-015。KSM-BRL-001 §3.1:請求額=Σ明細料金−減免額)。 */
class FeeCalculatorTest {

  private static final LocalDate DATE = LocalDate.of(2026, 7, 4);

  private final FeeCalculator calculator = new FeeCalculator();

  private final List<FeeBreakdownItem> items =
      List.of(
          new FeeBreakdownItem(101L, DATE, 3L, 1L, 1200L, 200L),
          new FeeBreakdownItem(101L, DATE.plusDays(7), 3L, 1L, 1200L, 200L));

  @Test
  @DisplayName("基本料金計・設備料金計・請求額の合算(KSM-DDD-001 §4.4の例:2400+400=2800円)")
  void sumsBaseAndEquipment() {
    FeeCalculation result = calculator.calculate(items, 0L);
    assertThat(result.baseAmountYen()).isEqualTo(2400L);
    assertThat(result.equipmentAmountYen()).isEqualTo(400L);
    assertThat(result.billedAmountYen()).isEqualTo(2800L);
  }

  @Test
  @DisplayName("減免額を控除した請求額(半額減免:2800−1400=1400円)")
  void subtractsExemption() {
    FeeCalculation result = calculator.calculate(items, 1400L);
    assertThat(result.billedAmountYen()).isEqualTo(1400L);
  }

  @Test
  @DisplayName("減免額が総額を超える場合は拒否")
  void rejectsExemptionOverTotal() {
    assertThatThrownBy(() -> calculator.calculate(items, 2801L))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
