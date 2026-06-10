package jp.lg.kasumidai.yoyaku.infrastructure.persistence.rows;

import java.time.LocalDate;

/** 料金マスタ行(fee_master。適用開始日付き版管理)。 */
public record FeeEntryRow(long feeId, LocalDate validFrom, long amountYen) {}
