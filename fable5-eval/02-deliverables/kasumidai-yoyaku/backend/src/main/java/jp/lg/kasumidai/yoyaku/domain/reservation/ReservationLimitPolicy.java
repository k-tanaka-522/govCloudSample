package jp.lg.kasumidai.yoyaku.domain.reservation;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 予約上限ルールの判定(KSM-BRL-001 §1.2)。
 * カウント対象は hold/pending/confirmed(取消・期限切れは対象外)。判定は申込明細を含めた合算。
 * 職員代行の特例(上限超過登録)は本ポリシーの外(アプリケーション層)で理由必須・操作ログ記録の上で許可する。
 */
public final class ReservationLimitPolicy {

  private final ReservationLimitRule rule;

  public ReservationLimitPolicy(ReservationLimitRule rule) {
    this.rule = rule;
  }

  /**
   * 申込明細を含めた合算で全上限を判定する(KSM-BRL-001 §1.2-2)。
   *
   * @param existingMonthlySlots 同一施設×同一利用月の既存有効コマ数(利用月→件数)
   * @param existingSameDaySlots 同一施設×同一日の既存有効コマ数(利用日→件数)
   * @param openReservationCount 利用日未到来の同時保有予約数(施設横断)
   * @param requested 申込コマ(同一施設)
   * @param now 判定時点(L-4 受付開始判定)
   */
  public List<LimitViolation> validate(
      Map<YearMonth, Integer> existingMonthlySlots,
      Map<LocalDate, Integer> existingSameDaySlots,
      int openReservationCount,
      List<SlotRequest> requested,
      LocalDateTime now) {
    List<LimitViolation> violations = new ArrayList<>();
    validateMonthly(existingMonthlySlots, requested).ifPresent(violations::add);
    validateSameDay(existingSameDaySlots, requested).ifPresent(violations::add);
    validateOpenCount(openReservationCount).ifPresent(violations::add);
    validateAcceptStart(requested, now).ifPresent(violations::add);
    return violations;
  }

  /**
   * 当選確定時の再判定(KSM-BRL-001 §5.4-1)。L-4(受付開始日)は抽選対象月(翌々月)に
   * 適用されないため除外し、L-1〜L-3のみを判定する。
   */
  public List<LimitViolation> validateForLotteryWin(
      Map<YearMonth, Integer> existingMonthlySlots,
      Map<LocalDate, Integer> existingSameDaySlots,
      int openReservationCount,
      List<SlotRequest> requested) {
    List<LimitViolation> violations = new ArrayList<>();
    validateMonthly(existingMonthlySlots, requested).ifPresent(violations::add);
    validateSameDay(existingSameDaySlots, requested).ifPresent(violations::add);
    validateOpenCount(openReservationCount).ifPresent(violations::add);
    return violations;
  }

  /** L-1 月間コマ数上限。 */
  Optional<LimitViolation> validateMonthly(
      Map<YearMonth, Integer> existing, List<SlotRequest> requested) {
    Map<YearMonth, Long> requestedByMonth =
        requested.stream()
            .collect(
                Collectors.groupingBy(s -> YearMonth.from(s.useDate()), Collectors.counting()));
    for (Map.Entry<YearMonth, Long> entry : requestedByMonth.entrySet()) {
      int total = existing.getOrDefault(entry.getKey(), 0) + entry.getValue().intValue();
      if (total > rule.monthlyMaxSlots()) {
        return Optional.of(
            new LimitViolation(
                LimitViolation.LimitType.MONTHLY_SLOTS, rule.monthlyMaxSlots(), total));
      }
    }
    return Optional.empty();
  }

  /** L-2 同一日上限コマ数。 */
  Optional<LimitViolation> validateSameDay(
      Map<LocalDate, Integer> existing, List<SlotRequest> requested) {
    Map<LocalDate, Long> requestedByDay =
        requested.stream().collect(Collectors.groupingBy(SlotRequest::useDate, Collectors.counting()));
    for (Map.Entry<LocalDate, Long> entry : requestedByDay.entrySet()) {
      int total = existing.getOrDefault(entry.getKey(), 0) + entry.getValue().intValue();
      if (total > rule.sameDayMaxSlots()) {
        return Optional.of(
            new LimitViolation(
                LimitViolation.LimitType.SAME_DAY_SLOTS, rule.sameDayMaxSlots(), total));
      }
    }
    return Optional.empty();
  }

  /** L-3 同時保有件数(申込分の1件を加算して判定)。 */
  Optional<LimitViolation> validateOpenCount(int openReservationCount) {
    int total = openReservationCount + 1;
    if (total > rule.maxOpenReservations()) {
      return Optional.of(
          new LimitViolation(
              LimitViolation.LimitType.OPEN_RESERVATIONS, rule.maxOpenReservations(), total));
    }
    return Optional.empty();
  }

  /** L-4 予約受付開始日(利用月のNか月前の1日 受付開始時刻から)。 */
  Optional<LimitViolation> validateAcceptStart(List<SlotRequest> requested, LocalDateTime now) {
    for (SlotRequest slot : requested) {
      LocalDateTime acceptFrom =
          YearMonth.from(slot.useDate())
              .minusMonths(rule.acceptStartMonthsBefore())
              .atDay(1)
              .atTime(rule.acceptStartHour(), 0);
      if (now.isBefore(acceptFrom)) {
        return Optional.of(new LimitViolation(LimitViolation.LimitType.ACCEPT_NOT_STARTED, 0, 0));
      }
    }
    return Optional.empty();
  }
}
