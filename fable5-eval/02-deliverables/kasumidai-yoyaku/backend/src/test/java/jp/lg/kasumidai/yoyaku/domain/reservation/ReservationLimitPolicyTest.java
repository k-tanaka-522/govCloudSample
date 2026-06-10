package jp.lg.kasumidai.yoyaku.domain.reservation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 予約上限ルールの境界値テスト(KSM-BRL-001 §1=QA No.10確定値の仕様証明)。
 * 体育施設:L-1=12コマ/月、L-2=3コマ/日、L-3=30件、L-4=市内2か月前の1日9:00。
 */
class ReservationLimitPolicyTest {

  private static final ReservationLimitRule SPORTS_CITY_RULE =
      new ReservationLimitRule(12, 3, 30, 2, 9);
  private static final LocalDate USE_DATE = LocalDate.of(2026, 7, 4);
  private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 10, 10, 0);

  private final ReservationLimitPolicy policy = new ReservationLimitPolicy(SPORTS_CITY_RULE);

  private List<SlotRequest> slots(int count) {
    return java.util.stream.IntStream.rangeClosed(1, count)
        .mapToObj(i -> new SlotRequest(1L, USE_DATE.plusDays(i - 1), 1L))
        .toList();
  }

  @Test
  @DisplayName("境界値:既存11コマ+申込1コマ=ちょうど12コマは上限内(L-1)")
  void monthlyExactlyAtLimitIsAllowed() {
    List<LimitViolation> violations =
        policy.validate(Map.of(YearMonth.of(2026, 7), 11), Map.of(), 0, slots(1), NOW);
    assertThat(violations).isEmpty();
  }

  @Test
  @DisplayName("境界値:既存12コマ+申込1コマ=13コマは上限超過(L-1)")
  void monthlyOverLimitIsRejected() {
    List<LimitViolation> violations =
        policy.validate(Map.of(YearMonth.of(2026, 7), 12), Map.of(), 0, slots(1), NOW);
    assertThat(violations)
        .extracting(LimitViolation::type)
        .containsExactly(LimitViolation.LimitType.MONTHLY_SLOTS);
  }

  @Test
  @DisplayName("境界値:同一日3コマは可・4コマは超過(L-2)")
  void sameDayLimitBoundary() {
    List<SlotRequest> threeSameDay =
        List.of(
            new SlotRequest(1L, USE_DATE, 1L),
            new SlotRequest(1L, USE_DATE, 2L),
            new SlotRequest(1L, USE_DATE, 3L));
    assertThat(policy.validate(Map.of(), Map.of(), 0, threeSameDay, NOW)).isEmpty();

    // 既存1コマ+申込3コマ=同一日4コマで超過
    List<LimitViolation> violations =
        policy.validate(Map.of(), Map.of(USE_DATE, 1), 0, threeSameDay, NOW);
    assertThat(violations)
        .extracting(LimitViolation::type)
        .containsExactly(LimitViolation.LimitType.SAME_DAY_SLOTS);
  }

  @Test
  @DisplayName("境界値:同時保有29件+本申込=30件は可、30件+本申込は超過(L-3)")
  void openReservationBoundary() {
    assertThat(policy.validate(Map.of(), Map.of(), 29, slots(1), NOW)).isEmpty();
    assertThat(policy.validate(Map.of(), Map.of(), 30, slots(1), NOW))
        .extracting(LimitViolation::type)
        .containsExactly(LimitViolation.LimitType.OPEN_RESERVATIONS);
  }

  @Test
  @DisplayName("境界値:受付開始(利用月2か月前の1日9:00)の直前は不可・ちょうど9:00は可(L-4)")
  void acceptStartBoundary() {
    LocalDateTime acceptStart = LocalDateTime.of(2026, 5, 1, 9, 0);
    assertThat(
            policy.validate(Map.of(), Map.of(), 0, slots(1), acceptStart.minusMinutes(1)))
        .extracting(LimitViolation::type)
        .containsExactly(LimitViolation.LimitType.ACCEPT_NOT_STARTED);
    assertThat(policy.validate(Map.of(), Map.of(), 0, slots(1), acceptStart)).isEmpty();
  }

  @Test
  @DisplayName("抽選当選時の再判定はL-4を除外しL-1〜L-3のみ(KSM-BRL-001 §5.4-1)")
  void lotteryWinRecheckExcludesAcceptStart() {
    // 翌々月のコマでも ACCEPT_NOT_STARTED は発生しない
    List<LimitViolation> violations =
        policy.validateForLotteryWin(Map.of(), Map.of(), 0, slots(1));
    assertThat(violations).isEmpty();
  }
}
