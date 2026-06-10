package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.util.List;
import java.util.Objects;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.FeeMasterRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.CancellationPolicyRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.FeeEntryRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 料金マスタ・取消規則マスタのJDBC実装(プリペアドステートメントのみ=KSM-DEV-002 S-51)。 */
@Repository
public class JdbcFeeMasterRepository implements FeeMasterRepository {

  private final JdbcTemplate jdbc;

  public JdbcFeeMasterRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public List<FeeEntryRow> findFeeEntries(long unitId, long slotId, long userCategoryId) {
    return jdbc.query(
        "SELECT fee_id, valid_from, amount FROM fee_master "
            + "WHERE unit_id = ? AND slot_id = ? AND user_category_id = ? "
            + "ORDER BY valid_from",
        (rs, rowNum) ->
            new FeeEntryRow(
                rs.getLong("fee_id"), rs.getDate("valid_from").toLocalDate(), rs.getLong("amount")),
        unitId,
        slotId,
        userCategoryId);
  }

  @Override
  public long findEquipmentFeeYen(long equipmentId, long slotId) {
    Long amount =
        jdbc.queryForObject(
            "SELECT amount FROM equipment_fees WHERE equipment_id = ? AND slot_id = ?",
            Long.class,
            equipmentId,
            slotId);
    return Objects.requireNonNullElse(amount, 0L);
  }

  @Override
  public CancellationPolicyRow findCancellationPolicy(long facilityId) {
    return jdbc.queryForObject(
        "SELECT free_cancel_days_before, charge_rate_percent FROM cancellation_rules "
            + "WHERE facility_id = ?",
        (rs, rowNum) ->
            new CancellationPolicyRow(
                rs.getInt("free_cancel_days_before"), rs.getInt("charge_rate_percent")),
        facilityId);
  }
}
