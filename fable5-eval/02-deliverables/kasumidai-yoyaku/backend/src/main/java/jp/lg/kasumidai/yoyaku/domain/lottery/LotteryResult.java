package jp.lg.kasumidai.yoyaku.domain.lottery;

import java.util.List;
import jp.lg.kasumidai.yoyaku.domain.reservation.SlotRequest;

/**
 * 抽選結果の1件(当落・当選希望順位・落選順位・乱数キー)。
 * 乱数キー・処理順・判定結果を抽選実行ログとして保存し、市が事後に公平性を検証可能とする
 * (KSM-BRL-001 §5.3。議会・監査対応)。
 */
public record LotteryResult(
    long entryId,
    long userId,
    long randomKey,
    boolean won,
    int wonRank,
    List<SlotRequest> wonSlots,
    int losingOrder) {

  /** 当選時の落選順位・落選時の当選順位を表す未設定値。 */
  public static final int NOT_APPLICABLE = -1;
}
