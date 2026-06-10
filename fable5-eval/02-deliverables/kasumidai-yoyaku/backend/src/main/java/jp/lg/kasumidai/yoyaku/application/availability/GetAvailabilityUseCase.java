package jp.lg.kasumidai.yoyaku.application.availability;

import java.time.YearMonth;
import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.availability.AvailabilityQueryService;
import jp.lg.kasumidai.yoyaku.domain.availability.AvailabilitySlot;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 空き状況照会ユースケース(REQ-006。未ログイン・CloudFrontキャッシュ60秒=KSM-ADR-009)。 */
@Service
public class GetAvailabilityUseCase {

  private final AvailabilityQueryService availabilityQueryService;

  public GetAvailabilityUseCase(AvailabilityQueryService availabilityQueryService) {
    this.availabilityQueryService = availabilityQueryService;
  }

  @Transactional(readOnly = true)
  public List<AvailabilitySlot> execute(long facilityId, YearMonth month) {
    return availabilityQueryService.findMonthly(facilityId, month);
  }
}
