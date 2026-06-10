package jp.lg.kasumidai.yoyaku.application.reservation;

import java.time.LocalDateTime;
import jp.lg.kasumidai.yoyaku.domain.reservation.ReservationDomainService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 先着予約申込ユースケース(REQ-007/009/010)。
 * トランザクション境界はアプリケーション層のみ(KSM-DEV-001 §5.1。ArchUnitで機械検査)。
 * 判定とINSERTは同一トランザクション(KSM-BRL-001 §1.2-2)、操作ログも同一トランザクション(S-91)。
 */
@Service
public class ReserveFacilityUseCase {

  private final ReservationDomainService reservationDomainService;

  public ReserveFacilityUseCase(ReservationDomainService reservationDomainService) {
    this.reservationDomainService = reservationDomainService;
  }

  @Transactional
  public ReservationDomainService.ReservationGrant execute(
      ReservationDomainService.ReservationCommand command) {
    return reservationDomainService.reserve(command, LocalDateTime.now());
  }
}
