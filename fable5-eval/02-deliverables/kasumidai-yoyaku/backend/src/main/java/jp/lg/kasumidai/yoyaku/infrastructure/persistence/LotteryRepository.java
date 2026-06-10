package jp.lg.kasumidai.yoyaku.infrastructure.persistence;

import java.util.List;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryEntryRow;
import jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows.LotteryResultRow;

/** 抽選申込・結果の永続化(lottery_entries / lottery_entry_details。REQ-008)。 */
public interface LotteryRepository {

  /** 抽選期間の全申込(希望明細の平坦行。組立てはドメイン層)。 */
  List<LotteryEntryRow> findEntries(long lotteryPeriodId);

  /** 抽選実行済みか(JB-01の実行前チェック=KSM-DDD-001 §6.2-3)。 */
  boolean isAlreadyDrawn(long lotteryPeriodId);

  /** 当落結果と実行ログ(乱数キー・落選順位)を保存する。 */
  void saveResults(long lotteryPeriodId, List<LotteryResultRow> results);
}
