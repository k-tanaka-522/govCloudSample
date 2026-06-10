package jp.lg.kasumidai.yoyaku.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * キャンセル料の境界値テスト(KSM-BRL-001 1.1版 §3.1=QA No.11確定値の仕様証明)。
 * 利用日の7日前まで無料(全額還付)/6日前以降100%(還付なし)。中間料率なし。
 */
class CancellationPolicyTest {

  private static final LocalDate USE_DATE = LocalDate.of(2026, 7, 10);
  private static final long AMOUNT = 2800L;

  private final CancellationPolicy policy = CancellationPolicy.DEFAULT;

  @Test
  @DisplayName("利用日の8日前の取消は無料")
  void freeWhenEightDaysBefore() {
    assertThat(policy.calculateCharge(USE_DATE, USE_DATE.minusDays(8), AMOUNT)).isZero();
  }

  @Test
  @DisplayName("境界値:利用日のちょうど7日前の取消は無料(全額還付)")
  void freeWhenExactlySevenDaysBefore() {
    assertThat(policy.calculateCharge(USE_DATE, USE_DATE.minusDays(7), AMOUNT)).isZero();
  }

  @Test
  @DisplayName("境界値:利用日の6日前の取消は100%(中間料率50%は存在しない=QA No.11)")
  void fullChargeWhenSixDaysBefore() {
    assertThat(policy.calculateCharge(USE_DATE, USE_DATE.minusDays(6), AMOUNT)).isEqualTo(AMOUNT);
  }

  @Test
  @DisplayName("前日・当日の取消は100%")
  void fullChargeOnEveAndDay() {
    assertThat(policy.calculateCharge(USE_DATE, USE_DATE.minusDays(1), AMOUNT)).isEqualTo(AMOUNT);
    assertThat(policy.calculateCharge(USE_DATE, USE_DATE, AMOUNT)).isEqualTo(AMOUNT);
  }

  @Test
  @DisplayName("無料取消期限日=利用日の7日前(SC-U10の事前表示)")
  void freeCancelDeadline() {
    assertThat(policy.freeCancelDeadline(USE_DATE)).isEqualTo(LocalDate.of(2026, 7, 3));
  }

  @Test
  @DisplayName("マスタ可変:将来の規則改正(例:50%)にも料率設定で対応できる")
  void configurableRateForFutureRuleChange() {
    CancellationPolicy halfRate = new CancellationPolicy(7, 50);
    assertThat(halfRate.calculateCharge(USE_DATE, USE_DATE.minusDays(6), 1001L)).isEqualTo(500L);
  }
}
