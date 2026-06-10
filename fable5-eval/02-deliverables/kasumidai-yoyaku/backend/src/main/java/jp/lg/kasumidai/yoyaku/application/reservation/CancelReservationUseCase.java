package jp.lg.kasumidai.yoyaku.application.reservation;

import java.time.LocalDate;
import jp.lg.kasumidai.yoyaku.domain.reservation.CancellationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 予約取消ユースケース(REQ-011/019)。
 * キャンセル料・還付見込を返却する(KSM-DDD-001 §4.3 cancellation API)。
 */
@Service
public class CancelReservationUseCase {

  private final CancellationService cancellationService;

  public CancelReservationUseCase(CancellationService cancellationService) {
    this.cancellationService = cancellationService;
  }

  /** 取消前の事前表示(SC-U10:取消期限・キャンセル料の事前表示)。 */
  @Transactional(readOnly = true)
  public CancellationService.CancellationResult preview(long reservationId, long userId) {
    return cancellationService.preview(reservationId, userId, LocalDate.now());
  }

  @Transactional
  public CancellationService.CancellationResult execute(long reservationId, long userId) {
    return cancellationService.cancel(reservationId, userId, LocalDate.now());
  }
}
