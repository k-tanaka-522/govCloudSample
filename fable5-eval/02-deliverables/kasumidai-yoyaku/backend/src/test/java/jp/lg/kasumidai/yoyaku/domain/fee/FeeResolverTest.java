package jp.lg.kasumidai.yoyaku.domain.fee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 料金版解決の境界値テスト(KSM-BRL-001 1.1版 §3.1=QA No.12確定の仕様証明)。
 * 適用基準日は申込(使用許可)日であり、利用日ではない。
 */
class FeeResolverTest {

  private static final LocalDate REVISION_DATE = LocalDate.of(2026, 10, 1);

  private final FeeResolver resolver = new FeeResolver();
  private final List<FeeTableEntry> entries =
      List.of(
          new FeeTableEntry(1L, LocalDate.of(2026, 4, 1), 1200L),
          new FeeTableEntry(2L, REVISION_DATE, 1500L));

  @Test
  @DisplayName("境界値:改定日前日の申込には旧料金を適用")
  void resolvesOldFeeOnDayBeforeRevision() {
    FeeTableEntry applied = resolver.resolve(entries, REVISION_DATE.minusDays(1));
    assertThat(applied.feeId()).isEqualTo(1L);
    assertThat(applied.amountYen()).isEqualTo(1200L);
  }

  @Test
  @DisplayName("境界値:改定日当日の申込には新料金を適用(valid_from <= 申込日)")
  void resolvesNewFeeOnRevisionDate() {
    FeeTableEntry applied = resolver.resolve(entries, REVISION_DATE);
    assertThat(applied.feeId()).isEqualTo(2L);
    assertThat(applied.amountYen()).isEqualTo(1500L);
  }

  @Test
  @DisplayName("申込時点適用:改定日前に許可済みなら利用日が改定後でも旧料金(経過措置=QA No.12)")
  void applicationDateGovernsNotUseDate() {
    // 申込日=9/20(改定前)。利用日が10月でも、解決は申込日でのみ行われ旧料金となる
    FeeTableEntry applied = resolver.resolve(entries, LocalDate.of(2026, 9, 20));
    assertThat(applied.amountYen()).isEqualTo(1200L);
  }

  @Test
  @DisplayName("申込日時点で有効な版がない場合は業務例外")
  void throwsWhenNoApplicableVersion() {
    assertThatThrownBy(() -> resolver.resolve(entries, LocalDate.of(2026, 3, 31)))
        .isInstanceOf(DomainException.class);
  }
}
