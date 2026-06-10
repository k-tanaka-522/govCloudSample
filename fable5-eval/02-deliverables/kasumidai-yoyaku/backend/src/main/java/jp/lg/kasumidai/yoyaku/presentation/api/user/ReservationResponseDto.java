package jp.lg.kasumidai.yoyaku.presentation.api.user;

import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.fee.FeeBreakdownItem;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationDomainService;

/** 先着予約申込の応答(KSM-DDD-001 §4.4 Response 201)。 */
public record ReservationResponseDto(
    long reservationId, String status, Billing billing, List<String> paymentMethods) {

  /** 請求内訳(算定明細を含む=KSM-BRL-001 §3.1)。 */
  public record Billing(
      long baseAmount,
      long equipmentAmount,
      long exemptionAmount,
      long billedAmount,
      String dueAt,
      List<DetailLine> detail) {}

  /** 算定明細行。 */
  public record DetailLine(long unitId, String useDate, long slotId, long appliedFeeId, long amount) {}

  static ReservationResponseDto from(ReservationDomainService.ReservationGrant grant) {
    List<DetailLine> detail =
        grant.fee().items().stream().map(ReservationResponseDto::toLine).toList();
    return new ReservationResponseDto(
        grant.reservationId(),
        "pending",
        new Billing(
            grant.fee().baseAmountYen(),
            grant.fee().equipmentAmountYen(),
            grant.fee().exemptionAmountYen(),
            grant.fee().billedAmountYen(),
            grant.dueAt().toString(),
            detail),
        List.of("online", "counter", "slip"));
  }

  private static DetailLine toLine(FeeBreakdownItem item) {
    return new DetailLine(
        item.unitId(), item.useDate().toString(), item.slotId(), item.appliedFeeId(), item.totalYen());
  }
}
