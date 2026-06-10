package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;

/**
 * 抽選申込の希望(希望順位×コマ列。KSM-BRL-001 §5.2-1:第1〜第3希望。各希望は連続コマ可)。
 */
public record LotteryPreference(int rank, List<SlotRequest> slots) {

  /** 希望順位の上限(第1〜第3希望)。 */
  public static final int MAX_RANK = 3;

  public LotteryPreference {
    if (rank < 1 || rank > MAX_RANK) {
      throw new IllegalArgumentException("希望順位は1〜" + MAX_RANK + "とすること: " + rank);
    }
    if (slots == null || slots.isEmpty()) {
      throw new IllegalArgumentException("希望コマ列は1件以上とすること");
    }
  }
}
