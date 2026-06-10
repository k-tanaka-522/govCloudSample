package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.util.Comparator;
import java.util.List;

/**
 * 抽選申込(KSM-BRL-001 §5.2)。
 * 同一利用者×同一抽選期間×同一施設グループの申込は1件(DB一意制約で防止)。
 */
public record LotteryEntry(long entryId, long userId, List<LotteryPreference> preferences) {

  public LotteryEntry {
    if (preferences == null || preferences.isEmpty()) {
      throw new IllegalArgumentException("希望は1件以上とすること");
    }
  }

  /** 希望順位順に並べた希望一覧。 */
  public List<LotteryPreference> preferencesByRank() {
    return preferences.stream().sorted(Comparator.comparingInt(LotteryPreference::rank)).toList();
  }
}
