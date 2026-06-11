package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.time.YearMonth;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.AvailabilityRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.AvailabilitySlotRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 空き状況照会のJDBC実装(REQ-006。予約済み・休館・優先枠を合成した状態を返す)。 */
@Repository
public class JdbcAvailabilityRepository implements AvailabilityRepository {

  private final JdbcTemplate jdbc;

  public JdbcAvailabilityRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public List<AvailabilitySlotRow> findMonthlyAvailability(long facilityId, YearMonth month) {
    return jdbc.query(
        "SELECT u.unit_id, gs.use_date::date AS use_date, s.slot_id, "
            + "CASE WHEN c.closure_type = 'closed' THEN 'closed' "
            + "     WHEN c.closure_type = 'priority' THEN 'priority' "
            + "     WHEN d.status IS NOT NULL THEN 'reserved' "
            + "     ELSE 'open' END AS slot_status "
            + "FROM units u "
            + "CROSS JOIN generate_series(?::date, ?::date, interval '1 day') AS gs(use_date) "
            + "JOIN slots s ON s.slot_pattern_id = u.slot_pattern_id "
            + "LEFT JOIN reservation_details d ON d.unit_id = u.unit_id "
            + "  AND d.use_date = gs.use_date::date AND d.slot_id = s.slot_id "
            + "  AND d.status IN ('hold','pending','confirmed') "
            + "LEFT JOIN closures c ON c.unit_id = u.unit_id "
            + "  AND c.date_from <= gs.use_date::date AND c.date_to >= gs.use_date::date "
            + "WHERE u.facility_id = ?",
        (rs, rowNum) ->
            new AvailabilitySlotRow(
                rs.getLong("unit_id"),
                rs.getDate("use_date").toLocalDate(),
                rs.getLong("slot_id"),
                rs.getString("slot_status")),
        month.atDay(1),
        month.atEndOfMonth(),
        facilityId);
  }
}
