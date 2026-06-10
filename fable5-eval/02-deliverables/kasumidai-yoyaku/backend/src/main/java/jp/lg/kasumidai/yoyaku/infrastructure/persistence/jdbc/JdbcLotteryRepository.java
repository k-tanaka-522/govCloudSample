package jp.lg.kasumidai.yoyaku.infrastructure.persistence.jdbc;

import java.util.List;
import java.util.Objects;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.LotteryRepository;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryEntryRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryResultRow;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/** 抽選申込・結果のJDBC実装(実行ログ=乱数キー・落選順位を保存。KSM-BRL-001 §5.3)。 */
@Repository
public class JdbcLotteryRepository implements LotteryRepository {

  private final JdbcTemplate jdbc;

  public JdbcLotteryRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  @Override
  public List<LotteryEntryRow> findEntries(long lotteryPeriodId) {
    return jdbc.query(
        "SELECT e.lottery_entry_id, e.user_id, d.pref_rank, d.unit_id, d.use_date, d.slot_id "
            + "FROM lottery_entries e "
            + "JOIN lottery_entry_details d ON d.lottery_entry_id = e.lottery_entry_id "
            + "WHERE e.lottery_period_id = ? AND e.status = 'entered' "
            + "ORDER BY e.lottery_entry_id, d.pref_rank",
        (rs, rowNum) ->
            new LotteryEntryRow(
                rs.getLong("lottery_entry_id"),
                rs.getLong("user_id"),
                rs.getInt("pref_rank"),
                rs.getLong("unit_id"),
                rs.getDate("use_date").toLocalDate(),
                rs.getLong("slot_id")),
        lotteryPeriodId);
  }

  @Override
  public boolean isAlreadyDrawn(long lotteryPeriodId) {
    Integer count =
        jdbc.queryForObject(
            "SELECT count(*) FROM lottery_entries "
                + "WHERE lottery_period_id = ? AND random_key IS NOT NULL",
            Integer.class,
            lotteryPeriodId);
    return Objects.requireNonNullElse(count, 0) > 0;
  }

  @Override
  public void saveResults(long lotteryPeriodId, List<LotteryResultRow> results) {
    for (LotteryResultRow result : results) {
      jdbc.update(
          "UPDATE lottery_entries SET random_key = ?, status = ?, won_rank = ?, losing_order = ? "
              + "WHERE lottery_entry_id = ? AND lottery_period_id = ?",
          result.randomKey(),
          result.won() ? "won" : "lost",
          result.wonRank(),
          result.losingOrder(),
          result.entryId(),
          lotteryPeriodId);
    }
  }
}
