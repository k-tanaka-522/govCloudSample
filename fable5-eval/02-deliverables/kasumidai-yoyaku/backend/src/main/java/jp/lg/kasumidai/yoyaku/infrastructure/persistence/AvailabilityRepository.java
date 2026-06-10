package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import java.time.YearMonth;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AvailabilitySlotRow;

/** 空き状況照会(REQ-006。未ログイン・CloudFront 60秒キャッシュ対象=KSM-ADR-009)。 */
public interface AvailabilityRepository {

  /** 施設×年月のコマ別状態(空き/予約済み/休館/優先枠)。 */
  List<AvailabilitySlotRow> findMonthlyAvailability(long facilityId, YearMonth month);
}
