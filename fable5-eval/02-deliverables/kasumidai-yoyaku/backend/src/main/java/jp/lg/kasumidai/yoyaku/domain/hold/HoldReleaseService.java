package jp.lg.kasumidai.yoyaku.domain.hold;

import java.time.OffsetDateTime;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AuditLogRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.ReservationRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AuditLogRow;
import org.springframework.stereotype.Service;

/**
 * 仮押さえ自動解放(JB-02。REQ-021。KSM-BRL-001 §6)。
 * 15分間隔起動・冪等(期限超過の hold のみを expired へ遷移)。
 */
@Service
public class HoldReleaseService {

  private final ReservationRepository reservationRepository;
  private final AuditLogRepository auditLogRepository;

  public HoldReleaseService(
      ReservationRepository reservationRepository, AuditLogRepository auditLogRepository) {
    this.reservationRepository = reservationRepository;
    this.auditLogRepository = auditLogRepository;
  }

  /** 期限超過の仮押さえを解放し、件数を返す(カレンダーへはキャッシュTTL60秒内に反映)。 */
  public int releaseExpired(OffsetDateTime now) {
    int released = reservationRepository.expireHolds(now);
    if (released > 0) {
      auditLogRepository.append(
          new AuditLogRow("system", 0L, "HOLD_RELEASE", "batch:JB-02", "解放" + released + "件"));
    }
    return released;
  }
}
