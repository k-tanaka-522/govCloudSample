package jp.lg.kasumidai.yoyaku.domain.fee;

import java.time.LocalDate;

/**
 * 料金マスタの1版(fee_master の適用開始日付き行。KSM-DDD-001 §3.3 #8)。
 * 円単位の実額を保持し、システムでの乗除算は行わない(端数規則の解釈差を排除=KSM-BRL-001 §3.1)。
 */
public record FeeTableEntry(long feeId, LocalDate validFrom, long amountYen) {}
