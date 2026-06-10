package jp.lg.kasumidai.yoyaku.domain.refund;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 還付額算定のテスト(REQ-019。KSM-BRL-001 §4.4)。 */
class RefundCalculatorTest {

  private final RefundCalculator calculator = new RefundCalculator();

  @Test
  @DisplayName("7日前まで取消(キャンセル料0)=収納済額の全額還付")
  void fullRefundWhenNoCharge() {
    assertThat(calculator.refundOnCancellation(2800L, 0L)).isEqualTo(2800L);
  }

  @Test
  @DisplayName("6日前以降取消(キャンセル料100%)=還付なし(QA No.11)")
  void noRefundWhenFullCharge() {
    assertThat(calculator.refundOnCancellation(2800L, 2800L)).isZero();
  }

  @Test
  @DisplayName("未収納(収納済額0)の取消=還付0(負値にならない)")
  void neverNegative() {
    assertThat(calculator.refundOnCancellation(0L, 2800L)).isZero();
  }

  @Test
  @DisplayName("遡及減免(収納後の承認)=差額を還付(KSM-BRL-001 §4.2-4)")
  void retroactiveExemptionRefundsDifference() {
    // 収納済2800円→半額減免承認で請求1400円→差額1400円を還付
    assertThat(calculator.refundOnRetroactiveExemption(2800L, 1400L)).isEqualTo(1400L);
  }
}
