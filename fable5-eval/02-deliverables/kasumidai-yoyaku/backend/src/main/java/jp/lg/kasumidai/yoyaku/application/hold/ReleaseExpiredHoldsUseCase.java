package jp.lg.kasumidai.yoyaku.application.hold;

import java.time.OffsetDateTime;
import jp.lg.kasumidai.yoyaku.domain.hold.HoldReleaseService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 仮押さえ自動解放ユースケース(JB-02。REQ-021。15分間隔・冪等)。 */
@Service
public class ReleaseExpiredHoldsUseCase {

  private final HoldReleaseService holdReleaseService;

  public ReleaseExpiredHoldsUseCase(HoldReleaseService holdReleaseService) {
    this.holdReleaseService = holdReleaseService;
  }

  @Transactional
  public int execute() {
    return holdReleaseService.releaseExpired(OffsetDateTime.now());
  }
}
