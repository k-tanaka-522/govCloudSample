package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.time.LocalDate;
import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.PaymentRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.PaymentDailySummaryRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 収納実績のJDBC実装(財務会計連携CSV=会計課様式第12号の日計集計。QA No.21)。 */
@Repository
public class JdbcPaymentRepository implements PaymentRepository {

  private final JdbcTemplate jdbc;

  public JdbcPaymentRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public List<PaymentDailySummaryRow> findDailySummaries(LocalDate fromDate, LocalDate toDate) {
    return jdbc.query(
        "SELECT p.paid_at::date AS slip_date, f.fiscal_year, f.account_code, f.revenue_code, "
            + "p.method_code, SUM(p.amount) AS amount, COUNT(*) AS cnt, "
            + "f.facility_name AS remarks, f.facility_code "
            + "FROM payments p "
            + "JOIN billings b ON b.billing_id = p.billing_id "
            + "JOIN reservations r ON r.reservation_id = b.reservation_id "
            + "JOIN reservation_details d ON d.reservation_id = r.reservation_id "
            + "JOIN units u ON u.unit_id = d.unit_id "
            + "JOIN facilities f ON f.facility_id = u.facility_id "
            + "WHERE p.status = 'settled' AND p.paid_at::date BETWEEN ? AND ? "
            + "GROUP BY 1, 2, 3, 4, 5, 8, 9 ORDER BY 1, 9, 5",
        (rs, rowNum) ->
            new PaymentDailySummaryRow(
                rs.getDate("slip_date").toLocalDate(),
                rs.getInt("fiscal_year"),
                rs.getString("account_code"),
                rs.getString("revenue_code"),
                rs.getString("method_code"),
                rs.getLong("amount"),
                rs.getInt("cnt"),
                rs.getString("remarks"),
                rs.getString("facility_code")),
        fromDate,
        toDate);
  }
}
