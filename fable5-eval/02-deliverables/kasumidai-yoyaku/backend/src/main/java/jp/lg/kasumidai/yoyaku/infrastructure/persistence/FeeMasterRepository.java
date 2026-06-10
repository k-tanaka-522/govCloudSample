package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.CancellationPolicyRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.FeeEntryRow;

/** 料金マスタ・取消規則マスタの参照(fee_master ほか。職員画面=SC-S07から保守)。 */
public interface FeeMasterRepository {

  /** 施設×コマ×利用者区分の料金版一覧(版解決はドメイン層 FeeResolver=申込日基準。QA No.12)。 */
  List<FeeEntryRow> findFeeEntries(long unitId, long slotId, long userCategoryId);

  /** 付帯設備の単価(設備×コマ単位。円)。 */
  long findEquipmentFeeYen(long equipmentId, long slotId);

  /** 施設別の取消規則(初期値:7日前まで無料/6日前以降100%=QA No.11)。 */
  CancellationPolicyRow findCancellationPolicy(long facilityId);
}
