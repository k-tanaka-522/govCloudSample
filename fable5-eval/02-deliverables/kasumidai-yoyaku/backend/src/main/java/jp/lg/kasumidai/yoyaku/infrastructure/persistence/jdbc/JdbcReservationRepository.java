package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.ReservationRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.NewReservationRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.ReservationRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.SlotKeyRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 予約永続化のJDBC実装。SQLはすべてプリペアドステートメント(KSM-DEV-002 S-51。文字列連結禁止)。
 * 二重予約は部分一意インデックス uq_active_slot の制約違反(DuplicateKeyException)で検出する。
 */
@Repository
public class JdbcReservationRepository implements ReservationRepository {

  private static final String ACTIVE_STATUSES = "('hold','pending','confirmed')";

  private final JdbcTemplate jdbc;

  public JdbcReservationRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public Map<YearMonth, Integer> countActiveSlotsByMonth(long userId, long facilityId) {
    Map<YearMonth, Integer> result = new HashMap<>();
    jdbc.query(
        "SELECT date_trunc('month', d.use_date)::date AS m, count(*) AS c "
            + "FROM reservation_details d "
            + "JOIN reservations r ON r.reservation_id = d.reservation_id "
            + "JOIN units u ON u.unit_id = d.unit_id "
            + "WHERE r.user_id = ? AND u.facility_id = ? AND d.status IN " + ACTIVE_STATUSES
            + " GROUP BY 1",
        rs -> {
          result.put(YearMonth.from(rs.getDate("m").toLocalDate()), rs.getInt("c"));
        },
        userId,
        facilityId);
    return result;
  }

  @Override
  public Map<LocalDate, Integer> countActiveSlotsByDate(long userId, long facilityId) {
    Map<LocalDate, Integer> result = new HashMap<>();
    jdbc.query(
        "SELECT d.use_date AS dt, count(*) AS c "
            + "FROM reservation_details d "
            + "JOIN reservations r ON r.reservation_id = d.reservation_id "
            + "JOIN units u ON u.unit_id = d.unit_id "
            + "WHERE r.user_id = ? AND u.facility_id = ? AND d.status IN " + ACTIVE_STATUSES
            + " GROUP BY 1",
        rs -> {
          result.put(rs.getDate("dt").toLocalDate(), rs.getInt("c"));
        },
        userId,
        facilityId);
    return result;
  }

  @Override
  public int countOpenReservations(long userId, LocalDate today) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(DISTINCT r.reservation_id) FROM reservations r "
                + "JOIN reservation_details d ON d.reservation_id = r.reservation_id "
                + "WHERE r.user_id = ? AND d.use_date >= ? AND d.status IN " + ACTIVE_STATUSES,
            Integer.class,
            userId,
            today);
    return Objects.requireNonNullElse(count, 0);
  }

  @Override
  public List<SlotKeyRow> findConflictingSlots(List<SlotKeyRow> slots) {
    return slots.stream().filter(this::hasActiveReservation).toList();
  }

  private boolean hasActiveReservation(SlotKeyRow slot) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM reservation_details "
                + "WHERE unit_id = ? AND use_date = ? AND slot_id = ? AND status IN " + ACTIVE_STATUSES,
            Integer.class,
            slot.unitId(),
            slot.useDate(),
            slot.slotId());
    return Objects.requireNonNullElse(count, 0) > 0;
  }

  @Override
  public Map<SlotKeyRow, String> findClosedOrPrioritySlots(List<SlotKeyRow> slots) {
    Map<SlotKeyRow, String> result = new HashMap<>();
    for (SlotKeyRow slot : slots) {
      jdbc.query(
          "SELECT closure_type FROM closures "
              + "WHERE unit_id = ? AND date_from <= ? AND date_to >= ?",
          rs -> {
            result.put(slot, rs.getString("closure_type"));
          },
          slot.unitId(),
          slot.useDate(),
          slot.useDate());
    }
    return result;
  }

  @Override
  public long insertReservation(NewReservationRow row) {
    KeyHolder keyHolder = new GeneratedKeyHolder();
    jdbc.update(
        con -> {
          PreparedStatement ps =
              con.prepareStatement(
                  "INSERT INTO reservations "
                      + "(user_id, purpose, status, due_at, base_amount, equipment_amount, "
                      + "exemption_amount, billed_amount, calculation_detail) "
                      + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)",
                  Statement.RETURN_GENERATED_KEYS);
          int i = 0;
          ps.setLong(++i, row.userId());
          ps.setString(++i, row.purpose());
          ps.setString(++i, row.status());
          ps.setObject(++i, row.dueAt());
          ps.setLong(++i, row.baseAmountYen());
          ps.setLong(++i, row.equipmentAmountYen());
          ps.setLong(++i, row.exemptionAmountYen());
          ps.setLong(++i, row.baseAmountYen() + row.equipmentAmountYen() - row.exemptionAmountYen());
          ps.setString(++i, row.calculationDetailJson());
          return ps;
        },
        keyHolder);
    long reservationId = extractGeneratedId(keyHolder);
    for (NewReservationRow.Detail detail : row.details()) {
      jdbc.update(
          "INSERT INTO reservation_details (reservation_id, unit_id, use_date, slot_id, status, amount) "
              + "VALUES (?, ?, ?, ?, ?, ?)",
          reservationId,
          detail.unitId(),
          detail.useDate(),
          detail.slotId(),
          row.status(),
          detail.amountYen());
    }
    return reservationId;
  }

  private long extractGeneratedId(KeyHolder keyHolder) {
    Map<String, Object> keys = keyHolder.getKeys();
    if (keys == null || !keys.containsKey("reservation_id")) {
      throw new IllegalStateException("予約IDの採番に失敗しました");
    }
    return ((Number) keys.get("reservation_id")).longValue();
  }

  @Override
  public Optional<ReservationRow> findByIdForUser(long reservationId, long userId) {
    List<ReservationRow> rows =
        jdbc.query(
            "SELECT r.reservation_id, r.user_id, u.facility_id, r.status, r.billed_amount, "
                + "COALESCE((SELECT SUM(p.amount) FROM payments p "
                + "  JOIN billings b ON b.billing_id = p.billing_id "
                + "  WHERE b.reservation_id = r.reservation_id AND p.status = 'settled'), 0) AS paid, "
                + "MIN(d.use_date) AS first_use_date "
                + "FROM reservations r "
                + "JOIN reservation_details d ON d.reservation_id = r.reservation_id "
                + "JOIN units u ON u.unit_id = d.unit_id "
                + "WHERE r.reservation_id = ? AND r.user_id = ? "
                + "GROUP BY r.reservation_id, r.user_id, u.facility_id, r.status, r.billed_amount",
            (rs, rowNum) ->
                new ReservationRow(
                    rs.getLong("reservation_id"),
                    rs.getLong("user_id"),
                    rs.getLong("facility_id"),
                    rs.getString("status"),
                    rs.getLong("billed_amount"),
                    rs.getLong("paid"),
                    rs.getDate("first_use_date").toLocalDate()),
            reservationId,
            userId);
    return rows.stream().findFirst();
  }

  @Override
  public boolean transitStatus(long reservationId, String fromStatus, String toStatus) {
    int updatedHeader =
        jdbc.update(
            "UPDATE reservations SET status = ?, updated_at = now() "
                + "WHERE reservation_id = ? AND status = ?",
            toStatus,
            reservationId,
            fromStatus);
    if (updatedHeader == 0) {
      return false;
    }
    jdbc.update(
        "UPDATE reservation_details SET status = ? WHERE reservation_id = ? AND status = ?",
        toStatus,
        reservationId,
        fromStatus);
    return true;
  }

  @Override
  public int expireHolds(OffsetDateTime now) {
    int expired =
        jdbc.update(
            "UPDATE reservations SET status = 'expired', updated_at = now() "
                + "WHERE status = 'hold' AND due_at < ?",
            now);
    jdbc.update(
        "UPDATE reservation_details d SET status = 'expired' "
            + "FROM reservations r WHERE r.reservation_id = d.reservation_id "
            + "AND r.status = 'expired' AND d.status = 'hold'");
    return expired;
  }
}
