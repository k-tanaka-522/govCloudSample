package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import jp.lg.kasumidai.yoyaku.infrastructure.persistence.LimitRuleRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LimitRuleRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 予約上限ルールマスタのJDBC実装(初期値はV2マイグレーションで投入=QA No.10確定値)。 */
@Repository
public class JdbcLimitRuleRepository implements LimitRuleRepository {

  private final JdbcTemplate jdbc;

  public JdbcLimitRuleRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public LimitRuleRow findRule(long facilityId, long userCategoryId) {
    return jdbc.queryForObject(
        "SELECT monthly_max_slots, same_day_max_slots, max_open_reservations, "
            + "accept_start_months_before, accept_start_hour "
            + "FROM reservation_limit_rules WHERE facility_id = ? AND user_category_id = ?",
        (rs, rowNum) ->
            new LimitRuleRow(
                rs.getInt("monthly_max_slots"),
                rs.getInt("same_day_max_slots"),
                rs.getInt("max_open_reservations"),
                rs.getInt("accept_start_months_before"),
                rs.getInt("accept_start_hour")),
        facilityId,
        userCategoryId);
  }
}
