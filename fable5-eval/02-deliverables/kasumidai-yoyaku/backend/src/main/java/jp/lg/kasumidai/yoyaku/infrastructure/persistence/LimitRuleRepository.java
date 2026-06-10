package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LimitRuleRow;

/** 予約上限ルールマスタ(reservation_limit_rules。施設×利用者区分。REQ-009)。 */
public interface LimitRuleRepository {

  LimitRuleRow findRule(long facilityId, long userCategoryId);
}
