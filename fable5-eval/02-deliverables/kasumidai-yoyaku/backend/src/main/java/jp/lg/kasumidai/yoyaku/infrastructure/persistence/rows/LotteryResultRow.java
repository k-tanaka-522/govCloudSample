package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

/** 抽選結果行(乱数キー・処理順を実行ログとして保存=公平性の事後検証用。KSM-BRL-001 §5.3)。 */
public record LotteryResultRow(
    long entryId, long userId, long randomKey, boolean won, int wonRank, int losingOrder) {}
