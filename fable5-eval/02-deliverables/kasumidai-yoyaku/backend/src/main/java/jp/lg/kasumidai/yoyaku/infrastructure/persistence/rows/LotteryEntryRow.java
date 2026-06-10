package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/** 抽選申込の希望明細行(lottery_entry_details の平坦表現。ドメイン層で組み立てる)。 */
public record LotteryEntryRow(
    long entryId, long userId, int prefRank, long unitId, LocalDate useDate, long slotId) {}
