package jp.lg.kasumidai.yoyaku.domain.reservation;

import java.time.LocalDate;
import jp.lg.kasumidai.yoyaku.domain.common.DomainException;
import jp.lg.kasumidai.yoyaku.domain.fee.CancellationPolicy;
import jp.lg.kasumidai.yoyaku.domain.refund.RefundCalculator;
import jp.lg.kasumidai.yoyaku.infrastructure.notification.NotificationQueue;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.FeeMasterRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.ReservationRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.CancellationPolicyRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.ReservationRow;

/**
 * 予約取消(REQ-011/019。KSM-BRL-001 1.1版 §3.1/§4.4)。
 * キャンセル料初期値:利用日の7日前まで無料/6日前以降100%(QA No.11確定値=マスタから取得)。
 * 取消期限の判定基準日は予約内の最先利用日(P4簡略化:明細別判定は未実装→実装完了報告書 S-4)。
 */
@org.springframework.stereotype.Service
public class CancellationService {

  /** 取消結果(キャンセル料・還付見込額の事前表示=SC-U10にも使用)。 */
  public record CancellationResult(
      long chargeYen, long refundYen, LocalDate freeCancelDeadline, boolean cancelled) {}

  private final ReservationRepository reservationRepository;
  private final FeeMasterRepository feeMasterRepository;
  private final AuditLogRepository auditLogRepository;
  private final NotificationQueue notificationQueue;
  private final RefundCalculator refundCalculator = new RefundCalculator();

  public CancellationService(
      ReservationRepository reservationRepository,
      FeeMasterRepository feeMasterRepository,
      AuditLogRepository auditLogRepository,
      NotificationQueue notificationQueue) {
    this.reservationRepository = reservationRepository;
    this.feeMasterRepository = feeMasterRepository;
    this.auditLogRepository = auditLogRepository;
    this.notificationQueue = notificationQueue;
  }

  /** 取消の事前計算(確定なし。SC-U10 の事前表示用)。 */
  public CancellationResult preview(long reservationId, long userId, LocalDate cancelDate) {
    ReservationRow row = loadCancellable(reservationId, userId);
    return calculate(row, cancelDate, false);
  }

  /** 取消の確定(楽観的状態遷移+操作ログ+還付見込の返却)。 */
  public CancellationResult cancel(long reservationId, long userId, LocalDate cancelDate) {
    ReservationRow row = loadCancellable(reservationId, userId);
    CancellationResult result = calculate(row, cancelDate, true);
    boolean transited = reservationRepository.transitStatus(reservationId, row.status(), "cancelled");
    if (!transited) {
      throw new DomainException("reservation-state-changed", "予約の状態が変更されています。再度確認してください");
    }
    auditLogRepository.append(
        new AuditLogRow(
            "user", userId, "RESERVATION_CANCEL", "reservation:" + reservationId,
            "キャンセル料" + result.chargeYen() + "円・還付見込" + result.refundYen() + "円"));
    notificationQueue.publish(
        new NotificationQueue.NotificationMessage("RESERVATION_CANCELLED", reservationId));
    return result;
  }

  private ReservationRow loadCancellable(long reservationId, long userId) {
    ReservationRow row =
        reservationRepository
            .findByIdForUser(reservationId, userId)
            .orElseThrow(() -> new DomainException("reservation-not-found", "予約が見つかりません"));
    if (!"pending".equals(row.status()) && !"confirmed".equals(row.status())) {
      throw new DomainException("reservation-not-cancellable", "この予約は取消できません");
    }
    return row;
  }

  private CancellationResult calculate(ReservationRow row, LocalDate cancelDate, boolean cancelled) {
    CancellationPolicyRow policyRow = feeMasterRepository.findCancellationPolicy(row.facilityId());
    CancellationPolicy policy =
        new CancellationPolicy(policyRow.freeCancelDaysBefore(), policyRow.chargeRatePercent());
    // キャンセル料の基礎額は減免後請求額(KSM-BRL-001 §4.3)
    long charge = policy.calculateCharge(row.firstUseDate(), cancelDate, row.billedAmountYen());
    long refund = refundCalculator.refundOnCancellation(row.paidAmountYen(), charge);
    return new CancellationResult(charge, refund, policy.freeCancelDeadline(row.firstUseDate()), cancelled);
  }
}
